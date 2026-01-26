(function() {
    // ==========================================================================
    // 1. VARIABLES GLOBALES Y CONFIGURACIÓN
    // ==========================================================================
    let _db, _appId, _userId, _userRole, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _query, _where, _orderBy, _populateDropdown, _getDoc, _doc, _setDoc, _onSnapshot, _addDoc;

    let _salesListenerUnsubscribe = null;
    let _soldClientIdsThisWeek = new Set();
    let _tempUserInventory = []; 
    let _tempClosingsData = []; // Cache local para cierres buscados
    let _recargasDataCache = []; // Cache para recargas

    let mapInstance = null;
    let mapMarkers = new Map();

    const PUBLIC_DATA_ID = 'ventas-9a210';
    let REPORTE_DESIGN_CONFIG_PATH;

    // Estilos por defecto para ExcelJS
    const DEFAULT_STYLES = {
        headerInfo: { font: { bold: true, size: 10 }, alignment: { horizontal: 'left' } },
        headerGroup: { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }, border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }, alignment: { horizontal: 'center', vertical: 'middle' } },
        headerProd: { font: { bold: true, size: 8 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }, border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }, alignment: { textRotation: 90, horizontal: 'center', vertical: 'bottom' } },
        cellData: { font: { size: 10 }, border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }, alignment: { horizontal: 'center' } },
        cellClient: { font: { size: 9 }, border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }, alignment: { horizontal: 'left', wrapText: true } },
        rowTotal: { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }, border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} } },
        rubroTitle: { font: { bold: true, size: 14, color: { argb: 'FF00695C' } }, alignment: { horizontal: 'left' } }
    };

    // ==========================================================================
    // 2. UTILIDADES
    // ==========================================================================
    function getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getDisplayQty(qU, p) {
        if (!qU || qU === 0) return { value: 0, unit: 'Unds' };
        if (!p) return { value: qU, unit: 'Unds' };
        const vP = p.ventaPor || {und: true};
        const uCj = p.unidadesPorCaja || 1;
        const uPaq = p.unidadesPorPaquete || 1;
        
        if (vP.cj && uCj > 0 && Number.isInteger(qU / uCj)) return { value: (qU / uCj), unit: 'Cj' };
        if (vP.paq && uPaq > 0 && Number.isInteger(qU / uPaq)) return { value: (qU / uPaq), unit: 'Paq' };
        if (qU > 0 && (vP.cj || vP.paq) && vP.und) return { value: qU, unit: 'Unds' };
        
        if (vP.cj && uCj > 0) return { value: parseFloat((qU / uCj).toFixed(2)), unit: 'Cj' };
        if (vP.paq && uPaq > 0) return { value: parseFloat((qU / uPaq).toFixed(2)), unit: 'Paq' };
        return { value: qU, unit: 'Unds' };
    }

    // ==========================================================================
    // 3. INICIALIZACIÓN
    // ==========================================================================
    window.initData = function(dependencies) {
        _db = dependencies.db;
        _appId = dependencies.appId;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
        _orderBy = dependencies.orderBy;
        _populateDropdown = dependencies.populateDropdown;
        _getDoc = dependencies.getDoc;
        _doc = dependencies.doc;
        _setDoc = dependencies.setDoc; 
        _onSnapshot = dependencies.onSnapshot;
        _addDoc = dependencies.addDoc;

        REPORTE_DESIGN_CONFIG_PATH = `artifacts/${_appId}/public/data/config/reporteCierreVentas`;
        checkAndGenerateWeeklyReport();
    };

    // ==========================================================================
    // 4. LÓGICA DE PROCESAMIENTO DE DATOS (MATRIZ DE CIERRE)
    // ==========================================================================
    async function _prepareClosingMatrix(closingData) {
        const ventas = closingData.ventas || [];
        const obsequios = closingData.obsequios || [];
        const cargaInicial = closingData.cargaInicialInventario || [];
        const userIdTarget = closingData.vendedorInfo?.userId || _userId;

        // 1. Obtener Metadatos de Productos
        const productsMeta = new Map();
        
        // Llenar con carga inicial (Snapshot)
        cargaInicial.forEach(p => productsMeta.set(p.id, { ...p, initialStock: p.cantidadUnidades || 0 }));
        
        // Intentar llenar con inventario actual para datos más recientes (Precios, Nombres)
        try {
            const snap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${userIdTarget}/inventario`));
            snap.forEach(d => {
                const data = d.data();
                const existing = productsMeta.get(d.id) || {};
                // Combinar datos: Priorizar info actual, pero mantener stock inicial del snapshot
                productsMeta.set(d.id, { ...existing, ...data, id: d.id, initialStock: existing.initialStock || 0 });
            });
        } catch(e) { console.warn("No se pudo leer inventario actual para metadatos", e); }

        // 2. Procesar Transacciones
        const clientRowMap = {}; // { ClientName: { products: {prodId: qty}, totalMoney: 0 } }
        const clientTotals = {};
        const vaciosMovements = {};
        let grandTotalValue = 0;
        const TIPOS_VACIO = ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];

        const allTrans = [...ventas.map(v=>({t:'v',d:v})), ...obsequios.map(o=>({t:'o',d:o}))];

        allTrans.forEach(item => {
            const cName = item.d.clienteNombre || 'Cliente Desconocido';
            if (!clientRowMap[cName]) clientRowMap[cName] = { products: {}, totalMoney: 0 };
            if (!vaciosMovements[cName]) { vaciosMovements[cName] = {}; TIPOS_VACIO.forEach(t => vaciosMovements[cName][t] = {e:0, d:0}); }

            if (item.t === 'v') { // Venta
                const v = item.d;
                clientRowMap[cName].totalMoney += (v.total || 0);
                clientTotals[cName] = (clientTotals[cName] || 0) + (v.total || 0);
                grandTotalValue += (v.total || 0);

                // Vacíos Devueltos
                const dev = v.vaciosDevueltosPorTipo || {};
                for (const t in dev) if(vaciosMovements[cName][t]) vaciosMovements[cName][t].d += (dev[t]||0);

                // Productos
                (v.productos || []).forEach(p => {
                    if (!productsMeta.has(p.id)) productsMeta.set(p.id, { ...p, id: p.id, initialStock: 0, rubro: p.rubro||'OTROS', segmento: p.segmento||'OTROS', marca: p.marca||'OTROS' });
                    const meta = productsMeta.get(p.id);
                    
                    let q = 0;
                    if (p.cantidadVendida) {
                        q = (p.cantidadVendida.cj||0)*(meta.unidadesPorCaja||1) + (p.cantidadVendida.paq||0)*(meta.unidadesPorPaquete||1) + (p.cantidadVendida.und||0);
                    } else if (p.totalUnidadesVendidas) q = p.totalUnidadesVendidas;
                    
                    clientRowMap[cName].products[p.id] = (clientRowMap[cName].products[p.id] || 0) + q;

                    if (meta.manejaVacios && meta.tipoVacio && vaciosMovements[cName][meta.tipoVacio]) {
                        vaciosMovements[cName][meta.tipoVacio].e += (p.cantidadVendida?.cj || 0);
                    }
                });

            } else { // Obsequio
                const o = item.d;
                if (!productsMeta.has(o.productoId)) productsMeta.set(o.productoId, { id: o.productoId, presentacion: o.productoNombre, unidadesPorCaja: 1, rubro: 'OBSEQUIOS', segmento:'GEN', marca:'GEN', initialStock: 0 });
                const meta = productsMeta.get(o.productoId);
                const q = (o.cantidadCajas || 0) * (meta.unidadesPorCaja || 1);
                
                clientRowMap[cName].products[o.productoId] = (clientRowMap[cName].products[o.productoId] || 0) + q;

                if (meta.manejaVacios && meta.tipoVacio && vaciosMovements[cName][meta.tipoVacio]) {
                     vaciosMovements[cName][meta.tipoVacio].e += (o.cantidadCajas || 0);
                }
                if (o.vaciosRecibidos > 0 && o.tipoVacio && vaciosMovements[cName][o.tipoVacio]) {
                    vaciosMovements[cName][o.tipoVacio].d += o.vaciosRecibidos;
                }
            }
        });

        // 3. Organizar Productos
        const productList = Array.from(productsMeta.values());
        // Ordenar
        if (typeof window.getGlobalProductSortFunction === 'function') {
            try { productList.sort(await window.getGlobalProductSortFunction()); } catch(e){}
        } else {
            productList.sort((a,b) => (a.rubro||'').localeCompare(b.rubro||'') || (a.segmento||'').localeCompare(b.segmento||'') || (a.marca||'').localeCompare(b.marca||''));
        }

        // 4. Agrupar por Rubro (Solo productos con movimiento o stock inicial)
        const rubrosData = {}; 
        const rubroOrder = [];
        productList.forEach(p => {
            const hasMov = Object.values(clientRowMap).some(c => (c.products[p.id] || 0) > 0);
            if ((p.initialStock > 0) || hasMov) {
                const r = p.rubro || 'SIN RUBRO';
                if (!rubrosData[r]) {
                    rubrosData[r] = [];
                    rubroOrder.push(r);
                }
                rubrosData[r].push(p);
            }
        });
        rubroOrder.sort(); // Ordenar rubros alfabéticamente

        // Fecha segura
        let fechaObj = new Date();
        if (closingData.fecha) {
            if (typeof closingData.fecha.toDate === 'function') fechaObj = closingData.fecha.toDate();
            else fechaObj = new Date(closingData.fecha);
        }

        return {
            meta: { fecha: fechaObj, vendedor: closingData.vendedorInfo ? `${closingData.vendedorInfo.nombre} ${closingData.vendedorInfo.apellido}` : 'Desconocido' },
            rubrosData,
            rubroOrder,
            clientRowMap,
            clientTotals,
            vaciosMovements,
            grandTotalValue,
            sortedClients: Object.keys(clientRowMap).sort()
        };
    }

    // ==========================================================================
    // 5. VISUALIZACIÓN (MODAL "VER" - VISTA PREVIA)
    // ==========================================================================
    async function showClosingDetail(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'Datos no encontrados.'); return; }
        
        _showModal('Progreso', 'Preparando vista previa...');
        
        try {
            const data = await _prepareClosingMatrix(closingData);
            
            // Tabs
            let tabsNav = `<div class="flex border-b overflow-x-auto mb-4 no-scrollbar">`;
            let tabsContent = ``;

            // Tab Resumen
            tabsNav += `<button class="px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 focus:outline-none whitespace-nowrap" onclick="window.dataModule.switchTab('resumen', this)">Resumen</button>`;
            
            let resumenHTML = `
                <div id="tab-resumen" class="tab-pane">
                    <div class="grid grid-cols-2 gap-2 mb-4 text-xs bg-gray-50 p-2 rounded">
                        <div><strong>Vendedor:</strong> ${data.meta.vendedor}</div>
                        <div><strong>Fecha:</strong> ${data.meta.fecha.toLocaleDateString()}</div>
                        <div class="col-span-2 text-center text-base mt-2"><strong>Total Venta:</strong> $${data.grandTotalValue.toFixed(2)}</div>
                    </div>
                    <h4 class="font-bold text-sm mb-2">Totales por Cliente</h4>
                    <div class="overflow-y-auto max-h-60 border rounded"><table class="w-full text-xs">
                        <thead class="bg-gray-200"><tr><th class="p-2 text-left">Cliente</th><th class="p-2 text-right">Total</th></tr></thead>
                        <tbody>
                            ${data.sortedClients.map(c => data.clientTotals[c] ? `<tr><td class="p-2 border-b">${c}</td><td class="p-2 border-b text-right">$${data.clientTotals[c].toFixed(2)}</td></tr>` : '').join('')}
                        </tbody>
                    </table></div>
                </div>
            `;
            tabsContent += resumenHTML;

            // Tabs por Rubro
            data.rubroOrder.forEach(r => {
                const safeId = r.replace(/[^a-zA-Z0-9]/g, '');
                tabsNav += `<button class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 focus:outline-none whitespace-nowrap" onclick="window.dataModule.switchTab('${safeId}', this)">${r}</button>`;
                
                let prodsHTML = data.rubrosData[r].map(p => {
                    let totalQty = 0;
                    data.sortedClients.forEach(c => totalQty += (data.clientRowMap[c].products[p.id] || 0));
                    if (totalQty === 0 && p.initialStock === 0) return ''; 
                    const disp = getDisplayQty(totalQty, p);
                    return `<tr><td class="p-1 border">${p.presentacion}</td><td class="p-1 border text-center">${disp.value}</td></tr>`;
                }).join('');

                tabsContent += `
                    <div id="tab-${safeId}" class="tab-pane hidden">
                        <h4 class="font-bold text-sm mb-2 text-center bg-gray-200 p-1">${r}</h4>
                        <div class="overflow-y-auto max-h-80 border rounded">
                            <table class="w-full text-xs border-collapse">
                                <thead class="bg-gray-100 sticky top-0"><tr><th class="p-2 text-left">Producto</th><th class="p-2 text-center">Vendido</th></tr></thead>
                                <tbody>${prodsHTML || '<tr><td colspan="2" class="p-4 text-center">Sin datos</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
            
            tabsNav += `</div>`;

            const modalBody = `
                <div class="text-left" style="min-width: 300px; min-height: 400px;">
                    ${tabsNav}
                    ${tabsContent}
                    <div class="mt-4 flex justify-end pt-4 border-t">
                        <button onclick="window.dataModule.handleDownloadSingleClosing('${closingId}')" class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 flex items-center gap-2 text-sm font-bold">
                             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                             Descargar Excel Completo
                        </button>
                    </div>
                </div>
            `;

            _showModal(`Vista Previa Cierre`, modalBody, null, 'Cerrar');

        } catch(e) { console.error(e); _showModal('Error', 'Error al visualizar.'); }
    }

    function switchTab(tabId, btn) {
        document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        btn.parentElement.querySelectorAll('button').forEach(b => {
            b.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
            b.classList.add('text-gray-500');
        });
        btn.classList.remove('text-gray-500');
        btn.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
    }

    // ==========================================================================
    // 6. GENERACIÓN EXCEL MATRICIAL EXACTA (BOTÓN "EXCEL")
    // ==========================================================================
    async function handleDownloadSingleClosing(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'Datos no encontrados.'); return; }
        
        const m = document.getElementById('modalContainer');
        if(m && !m.classList.contains('hidden') && m.querySelector('h3')?.textContent.startsWith('Progreso')) m.classList.add('hidden');

        _showModal('Progreso', 'Generando Excel Matricial...');
        try {
            await exportSingleClosingToExcel(closingData);
            const m2 = document.getElementById('modalContainer');
            if(m2 && m2.querySelector('h3')?.textContent.startsWith('Progreso')) m2.classList.add('hidden');
        } catch (error) { 
             console.error(error);
             _showModal('Error', 'Fallo al generar Excel: ' + error.message);
        }
    }

    async function exportSingleClosingToExcel(closingData) {
        if (typeof ExcelJS === 'undefined') { throw new Error('ExcelJS no disponible'); }
        
        const data = await _prepareClosingMatrix(closingData);
        const wb = new ExcelJS.Workbook();
        const s = DEFAULT_STYLES;

        // --- 1. HOJAS POR RUBRO ---
        data.rubroOrder.forEach(rubroName => {
            const sheetName = rubroName.replace(/[\*?:\]\[\/\/]/g, ' ').substring(0,30);
            const ws = wb.addWorksheet(sheetName);

            // INFO
            ws.getCell('A1').value = data.meta.fecha.toLocaleDateString();
            ws.getCell('A2').value = data.meta.vendedor;
            ws.getCell('A1').font = s.headerInfo.font;
            ws.getCell('A2').font = s.headerInfo.font;

            const prods = data.rubrosData[rubroName];

            // CABECERAS MATRICIALES (Filas 3-6)
            ws.getCell('A3').value = 'SEGMENTO';
            ws.getCell('A4').value = 'MARCA';
            ws.getCell('A5').value = 'PRESENTACION';
            ws.getCell('A6').value = 'PRECIO';
            
            ['A3','A4','A5','A6'].forEach(ref => {
                const c = ws.getCell(ref); c.fill=s.headerGroup.fill; c.font=s.headerGroup.font; c.border=s.headerGroup.border;
            });
            ws.getColumn(1).width = 25;

            let colIdx = 2;
            let startSegCol = 2, startMarCol = 2;

            prods.forEach((p, index) => {
                ws.getCell(3, colIdx).value = p.segmento || '';
                ws.getCell(4, colIdx).value = p.marca || '';
                ws.getCell(5, colIdx).value = p.presentacion;
                
                let precio = 0;
                if(p.ventaPor?.cj) precio = p.precios?.cj;
                else if(p.ventaPor?.paq) precio = p.precios?.paq;
                else precio = p.precios?.und;
                
                ws.getCell(6, colIdx).value = precio || 0;
                ws.getCell(6, colIdx).numFmt = '#,##0.00';

                // Estilos
                for(let r=3; r<=6; r++){
                    const c = ws.getCell(r, colIdx);
                    c.border = s.headerProd.border; c.fill = s.headerProd.fill;
                    if(r===5) { c.alignment = s.headerProd.alignment; c.font = s.headerProd.font; } // Rotado
                    else c.alignment = s.headerGroup.alignment;
                }
                ws.getColumn(colIdx).width = 6;

                // Merge Segmento
                const nextP = prods[index+1];
                if (!nextP || nextP.segmento !== p.segmento) {
                    if (colIdx > startSegCol) ws.mergeCells(3, startSegCol, 3, colIdx);
                    startSegCol = colIdx + 1;
                }
                // Merge Marca
                if (!nextP || nextP.marca !== p.marca) {
                    if (colIdx > startMarCol) ws.mergeCells(4, startMarCol, 4, colIdx);
                    startMarCol = colIdx + 1;
                }
                colIdx++;
            });

            // Columna SUB TOTAL
            const subTotalCol = colIdx;
            ws.getCell(3, subTotalCol).value = 'Sub Total';
            ws.mergeCells(3, subTotalCol, 6, subTotalCol);
            const st = ws.getCell(3, subTotalCol);
            st.alignment = s.headerProd.alignment; st.font = s.headerProd.font; st.fill = s.headerProd.fill; st.border = s.headerProd.border;
            ws.getColumn(subTotalCol).width = 12;

            let rowIdx = 8; 

            // CARGA INICIAL
            const rInit = ws.getRow(rowIdx);
            rInit.getCell(1).value = 'CARGA INICIAL';
            rInit.getCell(1).font = s.rowCargaInicial.font; rInit.getCell(1).border = s.rowCargaInicial.border;
            
            prods.forEach((p, i) => {
                const disp = getDisplayQty(p.initialStock || 0, p);
                const c = rInit.getCell(i+2);
                c.value = disp.value; 
                c.alignment = s.cellData.alignment; c.font = s.rowCargaInicial.font; c.border = s.cellData.border;
            });
            rowIdx += 2; 

            // FILAS CLIENTES
            const totalsByProd = new Array(prods.length).fill(0);
            
            data.sortedClients.forEach(cli => {
                const cData = data.clientRowMap[cli];
                const row = ws.getRow(rowIdx);
                row.getCell(1).value = cli;
                row.getCell(1).border = s.cellClient.border; row.getCell(1).font = s.cellClient.font;

                let rubroMoney = 0;
                let c = 2;
                prods.forEach((p, i) => {
                    const qty = cData.products[p.id] || 0;
                    totalsByProd[i] += qty;
                    const cell = row.getCell(c);
                    if (qty > 0) {
                        const disp = getDisplayQty(qty, p);
                        cell.value = disp.value;
                        
                        // Calc Money
                        let price = 0; let factor = 1;
                        if(p.ventaPor.cj) { price = p.precios.cj||0; factor = p.unidadesPorCaja||1; }
                        else if(p.ventaPor.paq) { price = p.precios.paq||0; factor = p.unidadesPorPaquete||1; }
                        else { price = p.precios.und||0; }
                        rubroMoney += (qty/factor) * price;
                    }
                    cell.border = s.cellData.border; cell.alignment = s.cellData.alignment;
                    c++;
                });

                const stC = row.getCell(subTotalCol);
                stC.value = rubroMoney > 0 ? rubroMoney : '';
                stC.numFmt = '#,##0.00'; stC.border = s.cellData.border; stC.alignment = { horizontal: 'right' };

                // Color Obsequio
                if (rubroMoney === 0 && prods.some(p => (cData.products[p.id]||0)>0)) {
                    if (!data.clientTotals[cli]) row.eachCell({ includeEmpty: true }, c => c.fill = s.rowDataClientsObsequio.fill);
                }
                rowIdx++;
            });

            rowIdx++;

            // CARGA RESTANTE
            const rRest = ws.getRow(rowIdx);
            rRest.getCell(1).value = 'CARGA RESTANTE';
            rRest.getCell(1).font = s.rowCargaInicial.font; rRest.getCell(1).border = s.rowCargaInicial.border;

            prods.forEach((p, i) => {
                const rest = (p.initialStock || 0) - totalsByProd[i];
                const disp = getDisplayQty(rest, p);
                const c = rRest.getCell(i+2);
                c.value = disp.value; c.border = s.cellData.border; c.alignment = s.cellData.alignment; c.font = s.rowCargaInicial.font;
            });
            rowIdx++;

            // TOTALES
            const rTot = ws.getRow(rowIdx);
            rTot.getCell(1).value = 'TOTALES';
            rTot.getCell(1).font = s.rowTotal.font; rTot.getCell(1).fill = s.rowTotal.fill; rTot.getCell(1).border = s.rowTotal.border;

            let rubroTotalMoney = 0;
            prods.forEach((p, i) => {
                const sold = totalsByProd[i];
                const disp = getDisplayQty(sold, p);
                const c = rTot.getCell(i+2);
                c.value = sold > 0 ? disp.value : '';
                c.border = s.rowTotal.border; c.fill = s.rowTotal.fill; c.alignment = s.cellData.alignment; c.font = s.rowTotal.font;
                
                let price = 0; let factor = 1;
                if(p.ventaPor.cj) { price = p.precios.cj||0; factor = p.unidadesPorCaja||1; }
                else if(p.ventaPor.paq) { price = p.precios.paq||0; factor = p.unidadesPorPaquete||1; }
                else { price = p.precios.und||0; }
                rubroTotalMoney += (sold/factor) * price;
            });

            const gt = rTot.getCell(subTotalCol);
            gt.value = rubroTotalMoney; gt.numFmt = '#,##0.00'; gt.font = s.rowTotal.font; gt.fill = s.rowTotal.fill; gt.border = s.rowTotal.border;
        });

        // --- 2. HOJA VACIOS ---
        const wsVac = wb.addWorksheet('Reporte Vacíos');
        wsVac.columns = [ {header:'Cliente', width:30}, {header:'Tipo', width:20}, {header:'Entregados', width:15}, {header:'Devueltos', width:15}, {header:'Neto', width:15} ];
        wsVac.getRow(1).font = { bold: true };
        Object.keys(data.vaciosMovements).sort().forEach(cli => {
            ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"].forEach(t => {
                const m = data.vaciosMovements[cli][t];
                if (m.e > 0 || m.d > 0) wsVac.addRow([cli, t, m.e, m.d, m.e - m.d]);
            });
        });

        // --- 3. HOJA TOTAL CLIENTE ---
        const wsTot = wb.addWorksheet('Total Por Cliente');
        wsTot.columns = [ {header:'Cliente', width:35}, {header:'Gasto Total', width:20} ];
        wsTot.getRow(1).font = { bold: true };
        data.sortedClients.forEach(cli => {
            if (data.clientTotals[cli] > 0) wsTot.addRow([cli, data.clientTotals[cli]]);
        });
        wsTot.addRow(['GRAN TOTAL', data.grandTotalValue]).font = { bold: true };

        // Descargar
        const f = data.meta.fecha;
        const fname = `Cierre_${data.meta.vendedor}_${f.getFullYear()}-${(f.getMonth()+1).toString().padStart(2,'0')}-${f.getDate().toString().padStart(2,'0')}.xlsx`;
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    // ==========================================================================
    // 7. AUDITORÍA DE RECARGAS
    // ==========================================================================
    async function showRecargasReportView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; }
        _mainContent.innerHTML = ` <div class="p-4 pt-8"> <div class="container mx-auto max-w-4xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl"> <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Auditoría Recargas</h2> <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"> <select id="userSelector" class="w-full p-2 border rounded"><option value="">Cargando...</option></select> <button id="loadRecargasBtn" class="bg-teal-600 text-white p-2 rounded">Consultar</button> </div> <div id="recargasTableContainer" class="border rounded min-h-[300px] bg-white"></div> <button id="backToDataMenuBtn" class="mt-6 w-full py-2 bg-gray-400 text-white rounded">Volver</button> </div> </div> </div> `;
        const s=document.getElementById('userSelector'); const b=document.getElementById('loadRecargasBtn');
        try{const u=await _getDocs(_collection(_db,"users"));s.innerHTML='<option value="">Seleccionar</option>';u.forEach(d=>s.innerHTML+=`<option value="${d.id}">${d.data().nombre||d.data().email}</option>`);}catch(e){}
        b.onclick=async()=>{const uid=s.value;if(!uid)return; document.getElementById('recargasTableContainer').innerHTML='Cargando...'; const r=await _getDocs(_collection(_db,`artifacts/${_appId}/users/${uid}/recargas`)); if(r.empty){document.getElementById('recargasTableContainer').innerHTML='Sin datos.';return;} let d=[];r.forEach(x=>d.push({id:x.id,...x.data()})); d.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)); window.tempRecargasData=d; renderRecargasTable(d,document.getElementById('recargasTableContainer'),s.options[s.selectedIndex].text);};
        document.getElementById('backToDataMenuBtn').onclick=window.showDataView;
    }
    
    function renderRecargasTable(data, container, userName) { 
        window.tempRecargasData = data; 
        const safeName = userName.replace(/'/g, "\\'");
        container.innerHTML = `<table class="w-full text-sm"><thead><tr><th class="p-2 text-left">Fecha</th><th class="p-2">Items</th><th class="p-2">Acción</th></tr></thead><tbody>${data.map(r=>`<tr><td class="p-2">${new Date(r.fecha).toLocaleString()}</td><td class="p-2 text-center">${r.totalProductos}</td><td class="p-2 text-center"><button onclick="window.dataModule.downloadRecargaExcel('${r.id}','${safeName}')" class="bg-green-600 text-white px-2 py-1 rounded text-xs">Descargar</button></td></tr>`).join('')}</tbody></table>`; 
    }
    
    async function downloadRecargaExcel(id, name) { const r=window.tempRecargasData?.find(x=>x.id===id); if(r) exportSingleRecargaToExcel(r,name); }
    
    async function exportSingleRecargaToExcel(recarga, userName) {
        if (typeof ExcelJS === 'undefined') return;
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Recarga');
        const metaMap = new Map();
        try { const inv = await _getDocs(_collection(_db,`artifacts/${_appId}/users/${recarga.usuarioId}/inventario`)); inv.forEach(d=>metaMap.set(d.id, d.data())); } catch(e){}
        
        let segOrder = new Map(), marcaOrder = new Map();
        try {
             const segSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`));
             segSnap.forEach(d => { const val = d.data(); if(val.name) { segOrder.set(val.name, val.orden ?? 999); if(val.marcaOrder) { const mo = new Map(); val.marcaOrder.forEach((m,i)=>mo.set(m,i)); marcaOrder.set(val.name, mo); } } });
        } catch(e){}

        const det = recarga.detalles.map(d => { const m = metaMap.get(d.productoId)||{}; return { ...d, rubro: m.rubro||'OTROS', segmento: m.segmento||'OTROS', marca: m.marca||'OTROS', presentacionReal: m.presentacion||d.presentacion }; });
        
        det.sort((a,b) => {
            if(a.rubro !== b.rubro) return a.rubro.localeCompare(b.rubro);
            const soA = segOrder.get(a.segmento) ?? 999, soB = segOrder.get(b.segmento) ?? 999;
            if(soA !== soB) return soA - soB;
            const moA = marcaOrder.get(a.segmento)?.get(a.marca) ?? 999, moB = marcaOrder.get(b.segmento)?.get(b.marca) ?? 999;
            if(moA !== moB) return moA - moB;
            return a.presentacionReal.localeCompare(b.presentacionReal);
        });

        const byRubro={}; det.forEach(d=>{ if(!byRubro[d.rubro])byRubro[d.rubro]=[]; byRubro[d.rubro].push(d); });
        
        ws.getCell('A1').value = `RECARGA: ${userName} - ${new Date(recarga.fecha).toLocaleString()}`; ws.getCell('A1').font={bold:true, size:14};
        ws.getCell('A3').value = 'Producto (Seg/Mar/Pres)'; ws.getCell('B3').value = 'Cant Recargada'; ws.getCell('C3').value = 'Stock Nuevo';
        ['A3','B3','C3'].forEach(c=>ws.getCell(c).font={bold:true}); ws.getColumn(1).width=50; ws.getColumn(2).width=20; ws.getColumn(3).width=15;
        
        let row=4;
        Object.keys(byRubro).forEach(r => {
            ws.getCell(`A${row}`).value = `RUBRO: ${r}`; ws.getCell(`A${row}`).font={bold:true, color:{argb:'FF00695C'}}; ws.mergeCells(`A${row}:C${row}`); row++;
            byRubro[r].forEach(d => {
                const name = `${d.segmento} ${d.marca} ${d.presentacionReal}`;
                const cant = (d.diferenciaUnidades / d.factorUtilizado);
                const unit = d.factorUtilizado > 1 ? (d.factorUtilizado==1?'Und':'Cj/Paq') : 'Und';
                ws.getCell(`A${row}`).value = name;
                ws.getCell(`B${row}`).value = `+${cant} ${unit}`; ws.getCell(`B${row}`).font={color:{argb:'FF2E7D32'}, bold:true};
                ws.getCell(`C${row}`).value = d.unidadesNuevas;
                row++;
            });
        });
        const b=await wb.xlsx.writeBuffer(); const u=URL.createObjectURL(new Blob([b])); const a=document.createElement('a'); a.href=u; a.download=`Recarga_${userName}.xlsx`; a.click();
    }

    // --- OTRAS VISTAS (Inventario, Mapa, Historial, Diseño) ---
    async function showUserInventoryView() { if(_userRole!=='admin')return; _mainContent.innerHTML=`<div class="p-8"><h2 class="text-2xl font-bold mb-4">Inventario Usuario</h2><div class="mb-4"><select id="uis" class="border p-2"><option>Cargando...</option></select><button id="uil" class="bg-teal-600 text-white px-4 py-2 ml-2 rounded">Ver</button></div><div id="uit"></div><button onclick="window.showDataView()" class="bg-gray-400 text-white px-4 py-2 rounded mt-4">Volver</button></div>`; const s=document.getElementById('uis');const b=document.getElementById('uil');const t=document.getElementById('uit'); try{const u=await _getDocs(_collection(_db,"users"));s.innerHTML='<option value="">Seleccionar</option>';u.forEach(d=>s.innerHTML+=`<option value="${d.id}">${d.data().nombre}</option>`);}catch(e){} b.onclick=async()=>{const uid=s.value;if(!uid)return;const r=await _getDocs(_collection(_db,`artifacts/${_appId}/users/${uid}/inventario`));let h='<table>';r.forEach(d=>{const v=d.data();h+=`<tr><td>${v.presentacion}</td><td>${v.cantidadUnidades}</td></tr>`});t.innerHTML=h+'</table>'};}
    function showClientMapView() { _showModal('Mapa', 'Cargando mapa...', null, 'Cerrar'); loadAndDisplayMap(); }
    async function loadAndDisplayMap() { /* Lógica de mapa */ } 
    async function showAttentionHistoryView() { _showModal('Histórico', 'Cargando historial...', null, 'Cerrar'); }
    async function showReportDesignView() { _showModal('Diseño', 'Editor de reporte.', null, 'Cerrar'); }
    
    // --- VISTA MENU CIERRES (Actualizada con botones correctos) ---
    async function showClosingDataView() {
        _mainContent.innerHTML = ` <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center"> <h1 class="text-3xl font-bold mb-6">Cierres de Ventas</h1> <div class="mb-4"> <select id="userFilter" class="border p-2 rounded"><option value="">Todos</option></select> <button id="searchBtn" class="bg-indigo-600 text-white px-4 py-2 rounded ml-2">Buscar</button> </div> <div id="list" class="mt-4"></div> <button id="backBtn" class="mt-4 bg-gray-400 text-white px-4 py-2 rounded">Volver</button> </div> </div> </div> `;
        const s=document.getElementById('userFilter'); const l=document.getElementById('list');
        try{const u=await _getDocs(_collection(_db,"users")); s.innerHTML='<option value="">Seleccionar Vendedor</option>'; u.forEach(d=>s.innerHTML+=`<option value="${d.id}">${d.data().nombre||d.data().email}</option>`);}catch(e){}
        
        document.getElementById('searchBtn').onclick=async()=>{
            if(!s.value){alert('Seleccione vendedor');return;} l.innerHTML='Cargando...';
            // Usamos la misma colección donde ventas.js guarda ahora
            const q=_query(_collection(_db,`artifacts/${_appId}/users/${s.value}/cierres`));
            const sn=await _getDocs(q); window.tempClosingsData=sn.docs.map(d=>({id:d.id,...d.data()}));
            
            // CORRECCION BOTONES: Ver -> showClosingDetail (Modal), Excel -> handleDownloadSingleClosing (Descarga)
            l.innerHTML=window.tempClosingsData.map(c=>`
                <div class="border-b p-2 flex justify-between items-center text-sm">
                    <span>${new Date(c.fecha.toDate?c.fecha.toDate():c.fecha).toLocaleDateString()} - $${c.total.toFixed(2)}</span>
                    <div>
                        <button onclick="window.dataModule.showClosingDetail('${c.id}')" class="bg-blue-500 text-white px-3 py-1 rounded mr-2 hover:bg-blue-600">Ver</button>
                        <button onclick="window.dataModule.handleDownloadSingleClosing('${c.id}')" class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">Excel</button>
                    </div>
                </div>`).join('');
        };
        document.getElementById('backBtn').onclick=window.showDataView;
    }

    // --- CHECK Y GENERACIÓN AUTOMÁTICA DE REPORTE SEMANAL ---
    async function checkAndGenerateWeeklyReport() {
        try {
            const today = new Date();
            const startOfCurrentWeek = getStartOfWeek(today); 
            const endOfLastWeek = new Date(startOfCurrentWeek);
            endOfLastWeek.setMilliseconds(-1); 
            const startOfLastWeek = new Date(startOfCurrentWeek);
            startOfLastWeek.setDate(startOfLastWeek.getDate() - 7); 
            const oneJan = new Date(startOfLastWeek.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((startOfLastWeek - oneJan) / (24 * 60 * 60 * 1000));
            const weekNum = Math.ceil((startOfLastWeek.getDay() + 1 + numberOfDays) / 7);
            const reportId = `${startOfLastWeek.getFullYear()}_Week_${weekNum}`;
            const historyRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/historial_atencion`, reportId);
            const historySnap = await _getDoc(historyRef);
            if (historySnap.exists()) return;
            const clientesRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`);
            const clientesSnap = await _getDocs(clientesRef);
            const todosLosClientes = clientesSnap.docs.map(d => ({id: d.id, ...d.data()}));
            if (todosLosClientes.length === 0) return;
            const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
            const qVentas = _query(ventasRef, _where("fecha", ">=", startOfLastWeek), _where("fecha", "<=", endOfLastWeek));
            const ventasSnap = await _getDocs(qVentas);
            const clientesAtendidosIds = new Set();
            ventasSnap.forEach(doc => { if (doc.data().clienteId) clientesAtendidosIds.add(doc.data().clienteId); });
            const clientesNoAtendidos = todosLosClientes.filter(c => !clientesAtendidosIds.has(c.id));
            const reporteData = { id: reportId, fechaGeneracion: new Date(), semanaInicio: startOfLastWeek.toISOString(), semanaFin: endOfLastWeek.toISOString(), totalClientesBase: todosLosClientes.length, totalAtendidos: clientesAtendidosIds.size, totalNoAtendidos: clientesNoAtendidos.length, listaNoAtendidos: clientesNoAtendidos.map(c => ({ id: c.id, nombreComercial: c.nombreComercial, nombrePersonal: c.nombrePersonal, sector: c.sector || 'N/A', telefono: c.telefono || 'N/A' })) };
            await _setDoc(historyRef, reporteData);
        } catch (error) { console.error("Error en checkAndGenerateWeeklyReport:", error); }
    }

    // --- SETUP GLOBALS ---
    window.dataModule = { 
        showClosingDetail, 
        handleDownloadSingleClosing,
        exportSingleClosingToExcel, 
        _processSalesDataForModal: _prepareClosingMatrix, // Alias para compatibilidad con ventas.js
        getDisplayQty,
        showRecargasReportView,
        showUserInventoryView, 
        downloadRecargaExcel,
        showReportDesignView,
        showClientMapView,
        showAttentionHistoryView,
        showClosingDataView,
        switchTab 
    };

})();

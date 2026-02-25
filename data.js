(function() {
    let _db, _appId, _userId, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _query, _where, _orderBy, _populateDropdown, _getDoc, _doc, _setDoc;

    let _consolidatedClientsCache = [];
    let _filteredClientsCache = [];
    let _usersMapCache = new Map();

    let mapInstance = null;
    let mapMarkers = new Map();

    let _sortPreferenceCache = null;
    let _rubroOrderMapCache = null;
    let _segmentoOrderMapCache = null;
    let _marcasOrderMapCache = null;
    const SORT_CONFIG_PATH = 'config/productSortOrder'; 

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    const CLIENTES_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`;
    const REPORTE_DESIGN_CONFIG_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/config/reporteCierreVentas`;
    
    const DEFAULT_REPORTE_SETTINGS = {
        showCargaInicial: true,
        showCargaRestante: true,
        showVaciosSheet: true,
        showClienteTotalSheet: true,
        styles: {
            headerInfo: { bold: true, fillColor: "#FFFFFF", fontColor: "#000000", border: false, fontSize: 10 },
            headerProducts: { bold: true, fillColor: "#EFEFEF", fontColor: "#000000", border: true, fontSize: 10 },
            rowCargaInicial: { bold: true, fillColor: "#FFFFFF", fontColor: "#000000", border: true, fontSize: 10 },
            rowDataClients: { bold: false, fillColor: "#FFFFFF", fontColor: "#333333", border: true, fontSize: 10 },
            rowDataClientsSale: { bold: false, fillColor: "#F3FDE8", fontColor: "#000000", border: true, fontSize: 10 },
            rowDataClientsObsequio: { bold: false, fillColor: "#E0F2FE", fontColor: "#000000", border: true, fontSize: 10 },
            rowCargaRestante: { bold: true, fillColor: "#FFFFFF", fontColor: "#000000", border: true, fontSize: 10 },
            rowTotals: { bold: true, fillColor: "#EFEFEF", fontColor: "#000000", border: true, fontSize: 10 },
            vaciosHeader: { bold: true, fillColor: "#EFEFEF", fontColor: "#000000", border: true, fontSize: 10 },
            vaciosData: { bold: false, fillColor: "#FFFFFF", fontColor: "#333333", border: true, fontSize: 10 },
            totalesHeader: { bold: true, fillColor: "#EFEFEF", fontColor: "#000000", border: true, fontSize: 10 },
            totalesData: { bold: false, fillColor: "#FFFFFF", fontColor: "#333333", border: true, fontSize: 10 },
            totalesTotalRow: { bold: true, fillColor: "#EFEFEF", fontColor: "#000000", border: true, fontSize: 11 }
        },
        columnWidths: {
            col_A_LabelsClientes: 25,
            products: 12,
            subtotal: 15,
            vaciosCliente: 25,
            vaciosTipo: 15,
            vaciosQty: 12,
            totalCliente: 35,
            totalClienteValor: 15
        }
    };

    // --- Helper Function: getDisplayQty (LÓGICA MATEMÁTICA ESTRICTA) ---
    function getDisplayQty(qU, p) {
        if (!qU || qU === 0) return { value: '', unit: '' };
        if (!p) return { value: qU, unit: 'Und' };

        const vP = p.ventaPor || {und: true};
        const uCj = p.unidadesPorCaja || 1;
        const uPaq = p.unidadesPorPaquete || 1;
        
        if (vP.und) {
            return { value: qU, unit: 'Und' };
        } 
        else if (vP.paq) {
            return { value: Math.floor(qU / uPaq), unit: 'Pq' };
        } 
        else if (vP.cj) {
            return { value: Math.floor(qU / uCj), unit: 'Cj' };
        }
        
        return { value: qU, unit: 'Und' };
    }

    function buildExcelJSStyle(config, borderStyle, numFmt = null, horizontalAlign = 'left') {
        const style = {};
        style.font = { bold: config.bold || false, color: { argb: 'FF' + (config.fontColor || "#000000").substring(1) }, size: config.fontSize || 10 };
        style.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (config.fillColor || "#FFFFFF").substring(1) } };
        if (config.border && borderStyle) { style.border = borderStyle; }
        if (numFmt) { style.numFmt = numFmt; }
        style.alignment = { vertical: 'middle', horizontal: horizontalAlign };
        return style;
    }

    // --- Funciones Helper para Fechas (Semanas ISO) ---
    function getISOWeekString(d) {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
    }

    function getDatesFromWeekString(weekStr) {
        const [yearStr, weekPart] = weekStr.split('-W');
        const year = parseInt(yearStr, 10);
        const week = parseInt(weekPart, 10);
        const simple = new Date(year, 0, 1 + (week - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        
        const start = new Date(ISOweekStart);
        start.setHours(0,0,0,0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23,59,59,999);
        return { start, end };
    }

    window.initData = function(dependencies) {
        _db = dependencies.db;
        _appId = dependencies.appId;
        _userId = dependencies.userId; 
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
        console.log("Módulo Data inicializado correctamente. Public ID:", PUBLIC_DATA_ID);
    };

    window.showDataView = function() {
        if (mapInstance) { mapInstance.remove(); mapInstance = null; }
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Módulo de Datos</h1>
                <div class="space-y-4">
                    <button id="closingDataBtn" class="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700">Cierres de Ventas</button>
                    <button id="designReportBtn" class="w-full px-6 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700">Diseño de Reporte</button>
                    <button id="consolidatedClientsBtn" class="w-full px-6 py-3 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700">Clientes Consolidados</button>
                    <button id="clientMapBtn" class="w-full px-6 py-3 bg-cyan-600 text-white rounded-lg shadow-md hover:bg-cyan-700">Mapa de Clientes / Asistencia</button>
                    <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver Menú</button>
                </div>
            </div> </div> </div>
        `;
        document.getElementById('closingDataBtn').addEventListener('click', showClosingDataView);
        document.getElementById('designReportBtn').addEventListener('click', showReportDesignView);
        document.getElementById('consolidatedClientsBtn').addEventListener('click', showConsolidatedClientsView);
        document.getElementById('clientMapBtn').addEventListener('click', showClientMapView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

    async function showClosingDataView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Cierres de Vendedores</h1>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg items-end">
                    <div> <label for="userFilter" class="block text-sm font-medium">Vendedor:</label> <select id="userFilter" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm text-sm"> <option value="">Cargando...</option> </select> </div>
                    <div> <label for="fechaDesde" class="block text-sm font-medium">Desde:</label> <input type="date" id="fechaDesde" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm text-sm"> </div>
                    <div> <label for="fechaHasta" class="block text-sm font-medium">Hasta:</label> <input type="date" id="fechaHasta" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm text-sm"> </div>
                    <button id="searchCierresBtn" class="w-full px-6 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700">Buscar</button>
                </div>
                <div id="cierres-list-container" class="overflow-x-auto max-h-96"> <p class="text-center text-gray-500">Seleccione filtros.</p> </div>
                <button id="backToDataMenuBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', showDataView);
        document.getElementById('searchCierresBtn').addEventListener('click', handleSearchClosings);
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('fechaDesde').value = today; document.getElementById('fechaHasta').value = today;
        await populateUserFilter();
    };

    async function populateUserFilter() {
        const userFilterSelect = document.getElementById('userFilter');
        if (!userFilterSelect) return;
        userFilterSelect.innerHTML = ''; 
        
        const allOption = document.createElement('option');
        allOption.value = "all";
        allOption.textContent = "Todos los Vendedores";
        allOption.selected = true; 
        userFilterSelect.appendChild(allOption);

        try {
            const usersRef = _collection(_db, "users");
            const snapshot = await _getDocs(usersRef);
            _usersMapCache.clear();

            snapshot.docs.forEach(doc => {
                const user = doc.data();
                _usersMapCache.set(doc.id, user); 
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = `${user.nombre || ''} ${user.apellido || user.email} (${user.camion || 'N/A'})`;
                userFilterSelect.appendChild(option);
            });
        } catch (error) { 
            console.error("Error cargando usuarios filtro:", error);
            const option = document.createElement('option');
            option.value = _userId;
            option.textContent = "Mis Datos (Actual)";
            userFilterSelect.appendChild(option);
        }
    }

    async function handleSearchClosings() {
        const container = document.getElementById('cierres-list-container');
        container.innerHTML = `<p class="text-center text-gray-500">Buscando...</p>`;
        
        let selectedUserId = document.getElementById('userFilter').value;
        const fechaDesdeStr = document.getElementById('fechaDesde').value;
        const fechaHastaStr = document.getElementById('fechaHasta').value;

        if (!fechaDesdeStr || !fechaHastaStr) {
            _showModal('Error', 'Seleccione ambas fechas.');
            container.innerHTML = `<p class="text-center text-gray-500">Seleccione rango.</p>`; return;
        }
        
        const fechaDesde = new Date(fechaDesdeStr + 'T00:00:00Z');
        const fechaHasta = new Date(fechaHastaStr + 'T23:59:59Z');
        
        try {
            let allClosings = [];

            if (selectedUserId === 'all') {
                const usersRef = _collection(_db, "users");
                const userSnapshot = await _getDocs(usersRef);
                const userIds = userSnapshot.docs.map(d => d.id);

                const promises = userIds.map(async (uid) => {
                    const closingsRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const q = _query(closingsRef, _where("fecha", ">=", fechaDesde), _where("fecha", "<=", fechaHasta));
                    const snapshot = await _getDocs(q);
                    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                });

                const results = await Promise.all(promises);
                allClosings = results.flat();

            } else {
                if (!selectedUserId) selectedUserId = _userId; 
                const closingsRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/cierres`);
                let q = _query(closingsRef, _where("fecha", ">=", fechaDesde), _where("fecha", "<=", fechaHasta));
                const snapshot = await _getDocs(q);
                allClosings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            
            window.tempClosingsData = allClosings; 
            renderClosingsList(allClosings);

        } catch (error) {
            console.error("Error buscando cierres:", error);
            container.innerHTML = `<p class="text-center text-red-500">Error al buscar: ${error.message}</p>`;
        }
    }

    function renderClosingsList(closings) {
        const container = document.getElementById('cierres-list-container');
        if (closings.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">No se encontraron cierres en el rango seleccionado.</p>`; return;
        }
        closings.sort((a, b) => b.fecha.toDate() - a.fecha.toDate()); 
        
        let tableHTML = `
            <table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-200 sticky top-0 z-10"> <tr>
                    <th class="py-2 px-3 border-b text-left">Fecha</th> <th class="py-2 px-3 border-b text-left">Vendedor</th>
                    <th class="py-2 px-3 border-b text-left">Camión</th> <th class="py-2 px-3 border-b text-right">Total</th>
                    <th class="py-2 px-3 border-b text-center">Acciones</th>
                </tr> </thead> <tbody>`;
        
        closings.forEach(cierre => {
            const vendedorSnapshot = cierre.vendedorInfo || {};
            let vName = vendedorSnapshot.nombre;
            let vLast = vendedorSnapshot.apellido;
            let vCamion = vendedorSnapshot.camion;

            if (!vName && vendedorSnapshot.userId) {
                const userFromCache = _usersMapCache.get(vendedorSnapshot.userId);
                if (userFromCache) {
                    vName = userFromCache.nombre || 'Usuario';
                    vLast = userFromCache.apellido || '';
                    vCamion = userFromCache.camion || 'N/A';
                } else {
                    vName = 'Desconocido';
                }
            }

            const isImported = cierre.source === 'excel_import' || (cierre.vendedorInfo && cierre.vendedorInfo.note && cierre.vendedorInfo.note.includes('Importado'));
            const importedBadge = isImported ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-[10px] border border-yellow-200">Importado</span>` : '';

            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-3 border-b">${cierre.fecha.toDate().toLocaleDateString('es-ES')}</td>
                    <td class="py-2 px-3 border-b">${vName || ''} ${vLast || ''} ${importedBadge}</td>
                    <td class="py-2 px-3 border-b">${vCamion || 'N/A'}</td>
                    <td class="py-2 px-3 border-b text-right font-semibold">$${(cierre.total || 0).toFixed(2)}</td>
                    <td class="py-2 px-3 border-b text-center space-x-2">
                        <button onclick="window.dataModule.showClosingDetail('${cierre.id}')" class="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600">Ver</button>
                        <button onclick="window.dataModule.handleDownloadSingleClosing('${cierre.id}')" title="Descargar" class="p-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 align-middle"> <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /> </svg> </button>
                    </td>
                </tr> `;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    async function _processSalesDataForModal(ventas, obsequios, cargaInicialInventario, userIdForInventario) {
        const clientData = {};
        const clientTotals = {}; 
        let grandTotalValue = 0;
        const allProductsMap = new Map();
        
        const targetUserId = userIdForInventario || _userId;
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${targetUserId}/inventario`);
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);

        const [inventarioSnapshot, masterSnapshot] = await Promise.all([
            _getDocs(inventarioRef),
            _getDocs(masterRef)
        ]);

        const inventarioMap = new Map(inventarioSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const masterMap = new Map(masterSnapshot.docs.map(doc => [doc.id, doc.data()]));

        // Inyección Total para que salgan todos los productos en Cierre Previo y Excel
        const allKnownIds = new Set([...inventarioMap.keys(), ...masterMap.keys()]);
        for (const pId of allKnownIds) {
            const prodPrivado = inventarioMap.get(pId) || {};
            const prodMaestro = masterMap.get(pId) || {};
            const prodComp = { ...prodPrivado, ...prodMaestro, id: pId }; 
            const rubro = prodComp.rubro || 'SIN RUBRO'; 
            const seg = prodComp.segmento || 'S/S';
            const marca = prodComp.marca || 'S/M';
            if (!allProductsMap.has(pId)) {
                allProductsMap.set(pId, { ...prodComp, rubro: rubro, segmento: seg, marca: marca });
            }
        }
        
        const allData = [
            ...ventas.map(v => ({ tipo: 'venta', data: v })),
            ...(obsequios || []).map(o => ({ tipo: 'obsequio', data: o }))
        ];

        for (const item of allData) {
            const clientName = item.data.clienteNombre || 'Cliente Desconocido';
            if (!clientData[clientName]) clientData[clientName] = { products: {}, totalValue: 0 };
            
            if (item.tipo === 'venta') {
                const venta = item.data;
                const ventaTotalCliente = venta.total || 0;
                clientData[clientName].totalValue += ventaTotalCliente;
                clientTotals[clientName] = (clientTotals[clientName] || 0) + ventaTotalCliente;
                grandTotalValue += ventaTotalCliente;
                
                (venta.productos || []).forEach(p => {
                    const prodPrivado = inventarioMap.get(p.id) || {};
                    const prodMaestro = masterMap.get(p.id) || {};
                    const prodComp = { ...p, ...prodPrivado, ...prodMaestro, id: p.id }; 
                    
                    if (p.id && !clientData[clientName].products[p.id]) clientData[clientName].products[p.id] = 0;
                    
                    let cantidadUnidades = 0;
                    if (p.cantidadVendida) { 
                        const uCj = prodComp.unidadesPorCaja || 1;
                        const uPaq = prodComp.unidadesPorPaquete || 1;
                        cantidadUnidades = (p.cantidadVendida.cj || 0) * uCj + (p.cantidadVendida.paq || 0) * uPaq + (p.cantidadVendida.und || 0);
                    } else if (p.totalUnidadesVendidas) { 
                        cantidadUnidades = p.totalUnidadesVendidas;
                    }
                    if(p.id) clientData[clientName].products[p.id] += cantidadUnidades;
                });

            } else if (item.tipo === 'obsequio') {
                const obsequio = item.data;
                const prodPrivado = inventarioMap.get(obsequio.productoId) || {};
                const prodMaestro = masterMap.get(obsequio.productoId) || {};

                let pComp = {
                    id: obsequio.productoId,
                    presentacion: obsequio.productoNombre || 'Producto Eliminado',
                    rubro: 'OBSEQUIOS (ELIMINADO)',
                    segmento: 'N/A',
                    marca: 'N/A',
                    unidadesPorCaja: 1, 
                    precios: { und: 0, paq: 0, cj: 0 },
                    ventaPor: { cj: true, paq: false, und: false },
                    ...prodPrivado,
                    ...prodMaestro
                };
                
                const cantidadUnidades = (obsequio.cantidadCajas || 0) * (pComp.unidadesPorCaja || 1);

                if (pComp.id && !clientData[clientName].products[pComp.id]) clientData[clientName].products[pComp.id] = 0;
                clientData[clientName].products[pComp.id] += cantidadUnidades;
            }
        }
        
        const sortedClients = Object.keys(clientData).sort();
        const sortFunction = await getGlobalProductSortFunction();
        const finalProductOrder = Array.from(allProductsMap.values()).sort(sortFunction);
        return { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder };
    }

    async function showClosingDetail(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'No se cargaron detalles.'); return; }
        _showModal('Progreso', 'Generando reporte detallado...');
        try {
            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder } = 
                await _processSalesDataForModal(
                    closingData.ventas || [], 
                    closingData.obsequios || [], 
                    closingData.cargaInicialInventario || [], 
                    closingData.vendedorInfo.userId
                );
            
            let hHTML = `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">Cliente</th>`;
            finalProductOrder.forEach(p => { hHTML += `<th class="p-1 border whitespace-nowrap text-xs" title="${p.marca||''} - ${p.segmento||''}">${p.presentacion}</th>`; });
            hHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200">Total Cliente</th></tr>`;
            
            let bHTML=''; 
            sortedClients.forEach(cli=>{
                const cCli = clientData[cli]; 
                const esSoloObsequio = !clientTotals.hasOwnProperty(cli) && cCli.totalValue === 0 && Object.values(cCli.products).some(q => q > 0);
                const rowClass = esSoloObsequio ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-blue-50';
                const clientNameDisplay = esSoloObsequio ? `${cli} (OBSEQUIO)` : cli;

                bHTML+=`<tr class="${rowClass}"><td class="p-1 border font-medium bg-white sticky left-0 z-10">${clientNameDisplay}</td>`; 
                finalProductOrder.forEach(p=>{
                    const qU=cCli.products[p.id]||0; 
                    const qtyDisplay = getDisplayQty(qU, p);
                    let dQ = (qU > 0) ? `${qtyDisplay.value}` : '';
                    let cellClass = '';
                    if (qU > 0 && esSoloObsequio) {
                        cellClass = 'font-bold';
                    }
                    bHTML+=`<td class="p-1 border text-center ${cellClass}">${dQ}</td>`;
                }); 
                bHTML+=`<td class="p-1 border text-right font-semibold bg-white sticky right-0 z-10">$${cCli.totalValue.toFixed(2)}</td></tr>`;
            });

            let fHTML='<tr class="bg-gray-200 font-bold"><td class="p-1 border sticky left-0 z-10">TOTALES</td>'; 
            finalProductOrder.forEach(p=>{
                let tQ=0; 
                sortedClients.forEach(cli=>tQ+=clientData[cli].products[p.id]||0); 
                
                const qtyDisplay = getDisplayQty(tQ, p);
                let dT = (tQ > 0) ? `${qtyDisplay.value} ${qtyDisplay.unit}` : '';
                
                fHTML+=`<td class="p-1 border text-center whitespace-nowrap">${dT}</td>`;
            }); 
            fHTML+=`<td class="p-1 border text-right sticky right-0 z-10">$${grandTotalValue.toFixed(2)}</td></tr>`;
            
            const vendedor = closingData.vendedorInfo || {};
            let vNameModal = vendedor.nombre || 'Desconocido';
            if(!vendedor.nombre && vendedor.userId && _usersMapCache.has(vendedor.userId)){
                 vNameModal = _usersMapCache.get(vendedor.userId).nombre;
            }

            const reportHTML = `<div class="text-left max-h-[80vh] overflow-auto"> <div class="mb-4"> <p><strong>Vendedor:</strong> ${vNameModal} ${vendedor.apellido||''}</p> <p><strong>Camión:</strong> ${vendedor.camion||'N/A'}</p> <p><strong>Fecha:</strong> ${closingData.fecha.toDate().toLocaleString('es-ES')}</p> </div> <h3 class="text-xl mb-4">Reporte Cierre</h3> <div class="overflow-auto border" style="max-height: 40vh;"> <table class="min-w-full bg-white text-xs"> <thead class="bg-gray-200">${hHTML}</thead> <tbody>${bHTML}</tbody> <tfoot>${fHTML}</tfoot> </table> </div> </div>`;
            _showModal(`Detalle Cierre`, reportHTML, null, 'Cerrar');
        } catch (error) { console.error("Error generando detalle:", error); _showModal('Error', `No se pudo generar: ${error.message}`); }
    }
    
    async function processSalesDataForReport(ventas, obsequios, cargaInicialInventario, userIdForInventario) {
        const dataByRubro = {};
        const clientTotals = {}; 
        let grandTotalValue = 0;
        const vaciosMovementsPorTipo = {};
        const allRubros = new Set();
        const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
        
        let inventarioMap;
        let hasSnapshot = cargaInicialInventario && cargaInicialInventario.length > 0;
        
        const targetUserId = userIdForInventario || _userId;
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${targetUserId}/inventario`); 
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);

        const [inventarioSnapshot, masterSnapshot] = await Promise.all([
            _getDocs(inventarioRef),
            _getDocs(masterRef)
        ]);

        inventarioMap = new Map(inventarioSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const masterMap = new Map(masterSnapshot.docs.map(doc => [doc.id, doc.data()]));

        let snapshotMap = new Map();
        if(hasSnapshot) {
             snapshotMap = new Map(cargaInicialInventario.map(doc => [doc.id, doc]));
        }

        const userDoc = await _getDoc(_doc(_db, "users", targetUserId));
        const userInfo = userDoc.exists() ? userDoc.data() : { email: 'Usuario Desconocido' };

        const allKnownIds = new Set([...inventarioMap.keys(), ...masterMap.keys()]);
        for (const pId of allKnownIds) {
            const prodPrivado = inventarioMap.get(pId) || {};
            const prodMaestro = masterMap.get(pId) || {};
            const prodParaReporte = {
                ...prodPrivado, 
                ...prodMaestro,
                id: pId,
                rubro: prodMaestro.rubro || prodPrivado.rubro || 'SIN RUBRO',
                segmento: prodMaestro.segmento || prodPrivado.segmento || 'S/S',
                marca: prodMaestro.marca || prodPrivado.marca || 'S/M',
            };
            const rubro = prodParaReporte.rubro;
            allRubros.add(rubro);
            if (!dataByRubro[rubro]) {
                dataByRubro[rubro] = { clients: {}, productsMap: new Map(), productTotals: {}, totalValue: 0, obsequiosMap: new Set() };
            }
            if (!dataByRubro[rubro].productsMap.has(pId)) {
                dataByRubro[rubro].productsMap.set(pId, prodParaReporte); 
            }
        }

        const allData = [
            ...ventas.map(v => ({ tipo: 'venta', data: v })),
            ...(obsequios || []).map(o => ({ tipo: 'obsequio', data: o }))
        ];

        for (const item of allData) {
            const clientName = item.data.clienteNombre || 'Cliente Desconocido';
            
            if (!vaciosMovementsPorTipo[clientName]) { 
                vaciosMovementsPorTipo[clientName] = {}; 
                TIPOS_VACIO_GLOBAL.forEach(t => vaciosMovementsPorTipo[clientName][t] = { entregados: 0, devueltos: 0 }); 
            }

            if (item.tipo === 'venta') {
                const venta = item.data;
                const ventaTotalCliente = venta.total || 0;
                clientTotals[clientName] = (clientTotals[clientName] || 0) + ventaTotalCliente;
                grandTotalValue += ventaTotalCliente;

                const vacDev = venta.vaciosDevueltosPorTipo || {};
                for (const t in vacDev) { 
                    if (!vaciosMovementsPorTipo[clientName][t]) vaciosMovementsPorTipo[clientName][t] = { entregados: 0, devueltos: 0 }; 
                    vaciosMovementsPorTipo[clientName][t].devueltos += (vacDev[t] || 0); 
                }

                (venta.productos || []).forEach(p => {
                    const prodPrivado = inventarioMap.get(p.id) || {};
                    const prodMaestro = masterMap.get(p.id) || {};
                    const prodParaReporte = { ...p, ...prodPrivado, ...prodMaestro, id: p.id, rubro: prodMaestro.rubro || prodPrivado.rubro || p.rubro || 'SIN RUBRO' };
                    const rubro = prodParaReporte.rubro;
                    
                    if (!dataByRubro[rubro].clients[clientName]) {
                        dataByRubro[rubro].clients[clientName] = { products: {}, totalValue: 0 };
                    }

                    let cantidadUnidades = 0;
                    if (p.cantidadVendida) { 
                        const uCj = prodParaReporte.unidadesPorCaja || 1;
                        const uPaq = prodParaReporte.unidadesPorPaquete || 1;
                        cantidadUnidades = (p.cantidadVendida.cj || 0) * uCj + (p.cantidadVendida.paq || 0) * uPaq + (p.cantidadVendida.und || 0);
                    } else if (p.totalUnidadesVendidas) { 
                        cantidadUnidades = p.totalUnidadesVendidas;
                    }
                    
                    const subtotalProducto = (p.precios?.cj || 0) * (p.cantidadVendida?.cj || 0) + (p.precios?.paq || 0) * (p.cantidadVendida?.paq || 0) + (p.precios?.und || 0) * (p.cantidadVendida?.und || 0);
                    
                    if(p.id) dataByRubro[rubro].clients[clientName].products[p.id] = (dataByRubro[rubro].clients[clientName].products[p.id] || 0) + cantidadUnidades;
                    dataByRubro[rubro].clients[clientName].totalValue += subtotalProducto;
                    dataByRubro[rubro].totalValue += subtotalProducto;
                    
                    if (prodParaReporte.manejaVacios && prodParaReporte.tipoVacio) {
                        const tV = prodParaReporte.tipoVacio; 
                        if (!vaciosMovementsPorTipo[clientName][tV]) vaciosMovementsPorTipo[clientName][tV] = { entregados: 0, devueltos: 0 }; 
                        vaciosMovementsPorTipo[clientName][tV].entregados += p.cantidadVendida?.cj || 0; 
                    }
                });

            } else if (item.tipo === 'obsequio') {
                const obsequio = item.data;
                const prodPrivado = inventarioMap.get(obsequio.productoId) || {}; 
                const prodMaestro = masterMap.get(obsequio.productoId) || {};

                let pComp = {
                    id: obsequio.productoId,
                    rubro: 'OBSEQUIOS (ELIMINADO)',
                    unidadesPorCaja: 1, 
                    ...prodPrivado,
                    ...prodMaestro,
                };
                
                const cantidadUnidades = (obsequio.cantidadCajas || 0) * (pComp.unidadesPorCaja || 1);
                const rubro = pComp.rubro || 'SIN RUBRO';
                
                if (!dataByRubro[rubro].clients[clientName]) {
                    dataByRubro[rubro].clients[clientName] = { products: {}, totalValue: 0 };
                }
                dataByRubro[rubro].obsequiosMap.add(pComp.id);

                if(pComp.id) dataByRubro[rubro].clients[clientName].products[pComp.id] = (dataByRubro[rubro].clients[clientName].products[pComp.id] || 0) + cantidadUnidades;
                
                if (pComp.manejaVacios && pComp.tipoVacio) {
                    const tV = pComp.tipoVacio; 
                    if (!vaciosMovementsPorTipo[clientName][tV]) vaciosMovementsPorTipo[clientName][tV] = { entregados: 0, devueltos: 0 }; 
                    vaciosMovementsPorTipo[clientName][tV].entregados += (obsequio.cantidadCajas || 0); 
                }

                const vacDev = obsequio.vaciosRecibidos || 0;
                const tipoVacDev = obsequio.tipoVacio; 
                if (vacDev > 0 && tipoVacDev) {
                     if (!vaciosMovementsPorTipo[clientName][tipoVacDev]) vaciosMovementsPorTipo[clientName][tipoVacDev] = { entregados: 0, devueltos: 0 };
                     vaciosMovementsPorTipo[clientName][tipoVacDev].devueltos += vacDev;
                }
            }
        }
        
        const sortFunction = await getGlobalProductSortFunction();
        const finalData = { rubros: {}, vaciosMovementsPorTipo: vaciosMovementsPorTipo, clientTotals: clientTotals, grandTotalValue: grandTotalValue };

        for (const rubroName of Array.from(allRubros).sort()) {
            const rubroData = dataByRubro[rubroName];
            const sortedProducts = Array.from(rubroData.productsMap.values()).sort(sortFunction);
            const sortedClients = Object.keys(rubroData.clients).sort();
            const productTotals = {};

            for (const p of sortedProducts) {
                const productId = p.id;
                let totalSoldUnits = 0;
                for (const clientName of sortedClients) {
                    totalSoldUnits += (rubroData.clients[clientName].products[productId] || 0);
                }

                const pInfoCurrent = inventarioMap.get(productId);
                const pInfoSnapshot = snapshotMap.get(productId); 

                let initialStockUnits = 0;
                let currentStockUnits = 0;
                
                if (hasSnapshot) {
                    initialStockUnits = pInfoSnapshot ? (pInfoSnapshot.cantidadUnidades || 0) : 0;
                    currentStockUnits = initialStockUnits - totalSoldUnits;
                } else {
                    currentStockUnits = pInfoCurrent ? (pInfoCurrent.cantidadUnidades || 0) : 0;
                    initialStockUnits = currentStockUnits + totalSoldUnits;
                }

                productTotals[productId] = { totalSold: totalSoldUnits, currentStock: currentStockUnits, initialStock: initialStockUnits };
            }
            
            finalData.rubros[rubroName] = { 
                clients: rubroData.clients, 
                products: sortedProducts, 
                sortedClients: sortedClients, 
                totalValue: rubroData.totalValue, 
                productTotals: productTotals,
                obsequiosMap: rubroData.obsequiosMap || new Set()
            };
        }
        return { finalData, userInfo };
    }

    async function exportSingleClosingToExcel(closingData, isPreview = false) {
        if (typeof ExcelJS === 'undefined') {
            _showModal('Error', 'Librería ExcelJS no cargada. No se puede exportar.');
            return;
        }

        const REPORTE_DESIGN_PATH = REPORTE_DESIGN_CONFIG_PATH;
        let settings = JSON.parse(JSON.stringify(DEFAULT_REPORTE_SETTINGS)); 
        try {
            const designDocRef = _doc(_db, REPORTE_DESIGN_PATH);
            const docSnap = await _getDoc(designDocRef);
            if (docSnap.exists()) {
                const savedSettings = docSnap.data();
                settings = { ...settings, ...savedSettings };
                settings.styles = { ...DEFAULT_REPORTE_SETTINGS.styles, ...(savedSettings.styles || {}) };
                settings.columnWidths = { ...DEFAULT_REPORTE_SETTINGS.columnWidths, ...(savedSettings.columnWidths || {}) };
            } 
        } catch (err) {
            console.warn("Error al cargar diseño de reporte, usando default:", err);
        }
        _showModal('Progreso', 'Generando Excel con su diseño...'); 

        try {
            const { finalData, userInfo } = await processSalesDataForReport(
                closingData.ventas || [], 
                closingData.obsequios || [], 
                closingData.cargaInicialInventario || [], 
                closingData.vendedorInfo.userId
            );
            
            const workbook = new ExcelJS.Workbook();
            
            const fechaObjeto = closingData.fecha;
            const jsDate = (fechaObjeto && typeof fechaObjeto.toDate === 'function') 
                            ? fechaObjeto.toDate()  
                            : fechaObjeto;            

            const fechaCierre = jsDate ? jsDate.toLocaleDateString('es-ES') : 'Fecha Inválida';
            
            const usuarioNombre = (userInfo.nombre || '') + ' ' + (userInfo.apellido || '');
            const usuarioDisplay = usuarioNombre.trim() || userInfo.email || 'Usuario Desconocido';

            const thinBorderStyle = { top: {style:"thin"}, bottom: {style:"thin"}, left: {style:"thin"}, right: {style:"thin"} };
            const s = settings.styles;

            const headerInfoStyle = buildExcelJSStyle(s.headerInfo, s.headerInfo.border ? thinBorderStyle : null, null, 'left');
            const headerProductsStyle = buildExcelJSStyle(s.headerProducts, s.headerProducts.border ? thinBorderStyle : null, null, 'left');
            const headerPriceStyle = buildExcelJSStyle(s.headerProducts, s.headerProducts.border ? thinBorderStyle : null, "$#,##0.00", 'right');
            const headerSubtotalStyle = buildExcelJSStyle({ ...s.headerProducts, bold: true }, s.headerProducts.border ? thinBorderStyle : null, null, 'left');

            const cargaInicialStyle = buildExcelJSStyle(s.rowCargaInicial, s.rowCargaInicial.border ? thinBorderStyle : null, null, 'left');
            const cargaInicialQtyStyle = buildExcelJSStyle(s.rowCargaInicial, s.rowCargaInicial.border ? thinBorderStyle : null, null, 'center');
            
            const clientDataStyle = buildExcelJSStyle(s.rowDataClients, s.rowDataClients.border ? thinBorderStyle : null, null, 'left');
            const clientSaleStyle = buildExcelJSStyle(s.rowDataClientsSale, s.rowDataClientsSale.border ? thinBorderStyle : null, null, 'center');
            const clientObsequioStyle = buildExcelJSStyle(s.rowDataClientsObsequio, s.rowDataClientsObsequio.border ? thinBorderStyle : null, null, 'center');
            
            const cargaRestanteStyle = buildExcelJSStyle(s.rowCargaRestante, s.rowCargaRestante.border ? thinBorderStyle : null, null, 'left');
            const cargaRestanteQtyStyle = buildExcelJSStyle(s.rowCargaRestante, s.rowCargaRestante.border ? thinBorderStyle : null, null, 'center');

            const totalsStyle = buildExcelJSStyle(s.rowTotals, s.rowTotals.border ? thinBorderStyle : null, null, 'left');
            const totalsQtyStyle = buildExcelJSStyle(s.rowTotals, s.rowTotals.border ? thinBorderStyle : null, null, 'center');
            const totalsPriceStyle = buildExcelJSStyle({ ...s.rowTotals, bold: true }, s.rowTotals.border ? thinBorderStyle : null, "$#,##0.00", 'right');

            const getPrice = (p) => {
                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                if (p.ventaPor?.cj && precios.cj > 0) return Number(precios.cj.toFixed(2));
                if (p.ventaPor?.paq && precios.paq > 0) return Number(precios.paq.toFixed(2));
                return Number((precios.und || 0).toFixed(2));
            };

            for (const rubroName in finalData.rubros) {
                const rubroData = finalData.rubros[rubroName];
                const { products: sortedProducts, sortedClients, clients: clientData, productTotals, totalValue: rubroTotalValue, obsequiosMap } = rubroData;
                
                const sheetName = rubroName.replace(/[\/\\?*\[\]]/g, '').substring(0, 31);
                const worksheet = workbook.addWorksheet(sheetName);

                // CONGELAR COLUMNA A Y FILAS SUPERIORES EN EL EXCEL
                worksheet.views = [
                    { state: 'frozen', xSplit: 1, ySplit: 6 }
                ];

                const colWidths = [ 
                    { width: settings.columnWidths.col_A_LabelsClientes },
                ];
                const START_COL = 2;
                
                worksheet.getCell('A1').value = fechaCierre;
                worksheet.getCell('A1').style = headerInfoStyle;

                worksheet.getCell('A2').value = usuarioDisplay;
                worksheet.getCell('A2').style = headerInfoStyle;

                const headerRowSegment = worksheet.getRow(3);
                const headerRowMarca = worksheet.getRow(4);
                const headerRowPresentacion = worksheet.getRow(5);
                const headerRowPrecio = worksheet.getRow(6);

                headerRowSegment.getCell(1).value = "SEGMENTO";
                headerRowMarca.getCell(1).value = "MARCA";
                headerRowPresentacion.getCell(1).value = "PRESENTACION";
                headerRowPrecio.getCell(1).value = "PRECIO";
                [3,4,5,6].forEach(r => worksheet.getCell(r, 1).style = headerProductsStyle);
                
                let lastSegment = null, lastMarca = null;
                let segmentColStart = START_COL, marcaColStart = START_COL;

                sortedProducts.forEach((p, index) => {
                    const c = START_COL + index; 
                    const segment = p.segmento || 'S/S';
                    const marca = p.marca || 'S/M';
                    const presentacion = p.presentacion || 'S/P';
                    const precio = getPrice(p);

                    headerRowSegment.getCell(c).value = segment;
                    headerRowMarca.getCell(c).value = marca;
                    headerRowPresentacion.getCell(c).value = presentacion;
                    headerRowPrecio.getCell(c).value = precio;

                    headerRowSegment.getCell(c).style = headerProductsStyle;
                    headerRowMarca.getCell(c).style = headerProductsStyle;
                    headerRowPresentacion.getCell(c).style = headerProductsStyle;
                    const esObsequio = obsequiosMap.has(p.id);
                    if (esObsequio && precio === 0) {
                        headerRowPrecio.getCell(c).style = headerProductsStyle;
                        headerRowPrecio.getCell(c).value = "OBSEQUIO";
                    } else {
                        headerRowPrecio.getCell(c).style = headerPriceStyle;
                    }

                    colWidths.push({ width: settings.columnWidths.products });

                    if (index > 0) {
                        if (segment !== lastSegment) {
                            if (c - 1 >= segmentColStart) { worksheet.mergeCells(3, segmentColStart, 3, c - 1); }
                            segmentColStart = c;
                        }
                        if (marca !== lastMarca || segment !== lastSegment) {
                            if (c - 1 >= marcaColStart) { worksheet.mergeCells(4, marcaColStart, 4, c - 1); }
                            marcaColStart = c;
                        }
                    }
                    lastSegment = segment;
                    lastMarca = marca;
                });

                const lastProdCol = START_COL + sortedProducts.length - 1;
                if (lastProdCol >= segmentColStart) { worksheet.mergeCells(3, segmentColStart, 3, lastProdCol); }
                if (lastProdCol >= marcaColStart) { worksheet.mergeCells(4, marcaColStart, 4, lastProdCol); }
                
                const subTotalCol = START_COL + sortedProducts.length;
                worksheet.getCell(3, subTotalCol).value = "Sub Total";
                worksheet.getCell(3, subTotalCol).style = headerSubtotalStyle;
                worksheet.mergeCells(3, subTotalCol, 6, subTotalCol);
                colWidths.push({ width: settings.columnWidths.subtotal });
                
                worksheet.columns = colWidths;
                
                let currentRowNum = 8;

                if (settings.showCargaInicial) {
                    const cargaInicialRow = worksheet.getRow(currentRowNum++);
                    cargaInicialRow.getCell(1).value = "CARGA INICIAL";
                    cargaInicialRow.getCell(1).style = cargaInicialStyle;
                    sortedProducts.forEach((p, index) => {
                        const initialStock = productTotals[p.id]?.initialStock || 0;
                        const cell = cargaInicialRow.getCell(START_COL + index);
                        if (initialStock > 0) {
                            const qtyDisplay = getDisplayQty(initialStock, p);
                            cell.value = qtyDisplay.value;
                            cell.style = { ...cargaInicialQtyStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                        } else {
                            cell.value = '';
                            cell.style = { ...cargaInicialQtyStyle };
                        }
                    });
                    cargaInicialRow.getCell(subTotalCol).style = cargaInicialStyle;
                }

                currentRowNum++;

                sortedClients.forEach(clientName => {
                    const clientRow = worksheet.getRow(currentRowNum++);
                    
                    const clientSales = clientData[clientName];
                    const esSoloObsequio = !finalData.clientTotals.hasOwnProperty(clientName) && clientSales.totalValue === 0 && Object.values(clientSales.products).some(q => q > 0);
                    const clientNameDisplay = esSoloObsequio ? `${clientName} (OBSEQUIO)` : clientName;

                    const rowBaseStyleSettings = esSoloObsequio ? s.rowDataClientsObsequio : s.rowDataClients;

                    const clientNameStyle = buildExcelJSStyle(
                        rowBaseStyleSettings,
                        rowBaseStyleSettings.border ? thinBorderStyle : null,
                        null, 
                        'left' 
                    );
                    clientRow.getCell(1).value = clientNameDisplay;
                    clientRow.getCell(1).style = clientNameStyle;
                    
                    sortedProducts.forEach((p, index) => {
                        const qU = clientSales.products[p.id] || 0;
                        const cell = clientRow.getCell(START_COL + index);
                        
                        let cellStyleSettings;
                        
                        if (esSoloObsequio) {
                            cellStyleSettings = s.rowDataClientsObsequio;
                        } else if (qU > 0) {
                            cellStyleSettings = s.rowDataClientsSale;
                        } else {
                            cellStyleSettings = s.rowDataClients;
                        }
                        
                        const finalCellStyle = buildExcelJSStyle(
                            cellStyleSettings,
                            cellStyleSettings.border ? thinBorderStyle : null,
                            null, 
                            'center' 
                        );
                        
                        if (qU > 0) {
                            const qtyDisplay = getDisplayQty(qU, p);
                            cell.value = qtyDisplay.value;
                            cell.style = { ...finalCellStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                        } else {
                            cell.value = '';
                            cell.style = finalCellStyle;
                        }
                    });
                    
                    const subtotalCell = clientRow.getCell(subTotalCol);
                    subtotalCell.value = clientSales.totalValue;

                    const subtotalStyle = buildExcelJSStyle(
                        rowBaseStyleSettings, 
                        rowBaseStyleSettings.border ? thinBorderStyle : null,
                        "$#,##0.00", 
                        'right' 
                    );
                    subtotalCell.style = subtotalStyle;
                    
                });

                currentRowNum++;

                if (settings.showCargaRestante) {
                    const cargaRestanteRow = worksheet.getRow(currentRowNum++);
                    cargaRestanteRow.getCell(1).value = "CARGA RESTANTE";
                    cargaRestanteRow.getCell(1).style = cargaRestanteStyle;
                    sortedProducts.forEach((p, index) => {
                        const currentStock = productTotals[p.id]?.currentStock || 0;
                        const cell = cargaRestanteRow.getCell(START_COL + index);
                        if (currentStock > 0) {
                            const qtyDisplay = getDisplayQty(currentStock, p);
                            cell.value = qtyDisplay.value;
                            cell.style = { ...cargaRestanteQtyStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                        } else {
                            cell.value = '';
                            cell.style = { ...cargaRestanteQtyStyle };
                        }
                    });
                    cargaRestanteRow.getCell(subTotalCol).style = cargaRestanteStyle;
                }

                const totalesRow = worksheet.getRow(currentRowNum++);
                totalesRow.getCell(1).value = "TOTALES";
                totalesRow.getCell(1).style = totalsStyle;
                sortedProducts.forEach((p, index) => {
                    const totalSold = productTotals[p.id]?.totalSold || 0;
                    const cell = totalesRow.getCell(START_COL + index);
                    if (totalSold > 0) {
                        const qtyDisplay = getDisplayQty(totalSold, p);
                        cell.value = qtyDisplay.value;
                        cell.style = { ...totalsQtyStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                    } else {
                        cell.value = '';
                        cell.style = { ...totalsQtyStyle };
                    }
                });
                const totalCell = totalesRow.getCell(subTotalCol);
                totalCell.value = rubroTotalValue;
                totalCell.style = totalsPriceStyle;
            }

            const { vaciosMovementsPorTipo } = finalData;
            const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"]; 
            const cliVacios = Object.keys(vaciosMovementsPorTipo).filter(cli => TIPOS_VACIO_GLOBAL.some(t => (vaciosMovementsPorTipo[cli][t]?.entregados || 0) > 0 || (vaciosMovementsPorTipo[cli][t]?.devueltos || 0) > 0)).sort(); 
            
            if (settings.showVaciosSheet && cliVacios.length > 0) { 
                const wsVacios = workbook.addWorksheet('Reporte Vacíos');
                wsVacios.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; 
                wsVacios.columns = [ 
                    { width: settings.columnWidths.vaciosCliente }, 
                    { width: settings.columnWidths.vaciosTipo }, 
                    { width: settings.columnWidths.vaciosQty }, 
                    { width: settings.columnWidths.vaciosQty }, 
                    { width: settings.columnWidths.vaciosQty } 
                ];

                const vaciosHeaderStyle = buildExcelJSStyle(s.vaciosHeader, s.vaciosHeader.border ? thinBorderStyle : null, null, 'left');
                const vaciosDataStyle = buildExcelJSStyle(s.vaciosData, s.vaciosData.border ? thinBorderStyle : null, null, 'left');
                const vaciosDataNumStyle = buildExcelJSStyle(s.vaciosData, s.vaciosData.border ? thinBorderStyle : null, '0', 'center');
                
                const headerRowVacios = wsVacios.getRow(1);
                headerRowVacios.values = ['Cliente', 'Tipo Vacío', 'Entregados', 'Devueltos', 'Neto'];
                headerRowVacios.getCell(1).style = vaciosHeaderStyle;
                headerRowVacios.getCell(2).style = vaciosHeaderStyle;
                headerRowVacios.getCell(3).style = buildExcelJSStyle(s.vaciosHeader, s.vaciosHeader.border ? thinBorderStyle : null, '0', 'center');
                headerRowVacios.getCell(4).style = buildExcelJSStyle(s.vaciosHeader, s.vaciosHeader.border ? thinBorderStyle : null, '0', 'center');
                headerRowVacios.getCell(5).style = buildExcelJSStyle(s.vaciosHeader, s.vaciosHeader.border ? thinBorderStyle : null, '0', 'center');
                
                cliVacios.forEach(cli => {
                    const movs = vaciosMovementsPorTipo[cli]; 
                    const clienteTuvoVenta = finalData.clientTotals.hasOwnProperty(cli);
                    const clientNameDisplay = clienteTuvoVenta ? cli : `${cli} (OBSEQUIO)`;

                    TIPOS_VACIO_GLOBAL.forEach(t => {
                        const mov = movs[t] || {entregados:0, devueltos:0}; 
                        if (mov.entregados > 0 || mov.devueltos > 0) {
                            const dataRow = wsVacios.addRow([clientNameDisplay, t, mov.entregados, mov.devueltos, mov.entregados - mov.devueltos]);
                            dataRow.getCell(1).style = vaciosDataStyle;
                            dataRow.getCell(2).style = vaciosDataStyle;
                            dataRow.getCell(3).style = vaciosDataNumStyle;
                            dataRow.getCell(4).style = vaciosDataNumStyle;
                            dataRow.getCell(5).style = vaciosDataNumStyle;
                        }
                    });
                }); 
            }

            const { clientTotals, grandTotalValue } = finalData;
            if (settings.showClienteTotalSheet) {
                const wsClientes = workbook.addWorksheet('Total Por Cliente');
                wsClientes.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; 
                wsClientes.columns = [ 
                    { width: settings.columnWidths.totalCliente }, 
                    { width: settings.columnWidths.totalClienteValor } 
                ];

                const totalesHeaderStyle = buildExcelJSStyle(s.totalesHeader, s.totalesHeader.border ? thinBorderStyle : null, null, 'left');
                const totalesDataStyle = buildExcelJSStyle(s.totalesData, s.totalesData.border ? thinBorderStyle : null, null, 'left');
                const totalesDataPriceStyle = buildExcelJSStyle(s.totalesData, s.totalesData.border ? thinBorderStyle : null, "$#,##0.00", 'right');
                const totalesTotalRowStyle = buildExcelJSStyle(s.totalesTotalRow, s.totalesTotalRow.border ? thinBorderStyle : null, null, 'left');
                const totalesTotalRowPriceStyle = buildExcelJSStyle(s.totalesTotalRow, s.totalesTotalRow.border ? thinBorderStyle : null, "$#,##0.00", 'right');
                
                const headerRowTotales = wsClientes.getRow(1);
                headerRowTotales.values = ['Cliente', 'Gasto Total'];
                headerRowTotales.getCell(1).style = totalesHeaderStyle;
                headerRowTotales.getCell(2).style = buildExcelJSStyle(s.totalesHeader, s.totalesHeader.border ? thinBorderStyle : null, null, 'right');
                
                const sortedClientTotals = Object.entries(clientTotals).sort((a, b) => a[0].localeCompare(b[0]));
                sortedClientTotals.forEach(([clientName, totalValue]) => {
                    const row = wsClientes.addRow([clientName, Number(totalValue.toFixed(2))]);
                    row.getCell(1).style = totalesDataStyle;
                    row.getCell(2).style = totalesDataPriceStyle;
                });
                
                const totalRow = wsClientes.addRow(['GRAN TOTAL', Number(grandTotalValue.toFixed(2))]);
                totalRow.getCell(1).style = totalesTotalRowStyle;
                totalRow.getCell(2).style = totalesTotalRowPriceStyle;
            }

            const vendedor = closingData.vendedorInfo || {}; 
            const fecha = jsDate ? jsDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
            const vendNombre = (vendedor.nombre || 'Vendedor').replace(/\s/g, '_');
            
            const fileNamePre = isPreview ? '_PREVIO' : '';
            const fileName = `Cierre${fileNamePre}_${vendNombre}_${fecha}.xlsx`;

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (error) { 
            console.error("Error exportando con ExcelJS:", error); 
            _showModal('Error', `Error al generar Excel: ${error.message}`); 
            throw error; 
        }
    }


    async function handleDownloadSingleClosing(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'Datos no encontrados.'); return; }
        
        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer && !modalContainer.classList.contains('hidden') && modalContainer.querySelector('h3')?.textContent.startsWith('Progreso')) {
            modalContainer.classList.add('hidden');
        }

        _showModal('Progreso', 'Cargando diseño y generando Excel...');
        try {
            await exportSingleClosingToExcel(closingData, false);
            
             const modalContainer = document.getElementById('modalContainer');
             if(modalContainer && !modalContainer.classList.contains('hidden') && modalContainer.querySelector('h3')?.textContent.startsWith('Progreso')) { modalContainer.classList.add('hidden'); }
        } catch (error) { 
             const modalContainer = document.getElementById('modalContainer');
             if(modalContainer && !modalContainer.classList.contains('hidden') && modalContainer.querySelector('h3')?.textContent.startsWith('Progreso')) { modalContainer.classList.add('hidden'); }
        }
    }

    // --- NUEVO: OBTENER CLIENTES ATENDIDOS POR RANGO DE FECHA ---
    async function getAttendedClientsByDateRange(startDate, endDate) {
        const attendedClients = new Set();
        try {
            const usersRef = _collection(_db, "users");
            const usersSnap = await _getDocs(usersRef);
            const userIds = usersSnap.docs.map(d => d.id);

            const promises = userIds.map(async (uid) => {
                const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                const q = _query(cierresRef, _where("fecha", ">=", startDate), _where("fecha", "<=", endDate));
                const snap = await _getDocs(q);
                return snap.docs.map(d => d.data());
            });

            const results = await Promise.all(promises);
            const allCierres = results.flat();

            allCierres.forEach(cierre => {
                if (cierre.ventas && Array.isArray(cierre.ventas)) {
                    cierre.ventas.forEach(venta => {
                        if (venta.clienteNombre) {
                            attendedClients.add(venta.clienteNombre.trim().toLowerCase());
                        }
                    });
                }
            });
        } catch (e) { console.error("Error calculando asistencia en rango:", e); }
        return attendedClients;
    }

    async function downloadMissedClientsExcel() {
        const weekInput = document.getElementById('missed-clients-week').value;
        if (!weekInput) { _showModal('Aviso', 'Seleccione una semana válida.'); return; }
        
        _showModal('Progreso', 'Analizando ventas y cruzando con el catálogo de clientes...', null, '', null, false);
        
        try {
            const { start: startDate, end: endDate } = getDatesFromWeekString(weekInput);
            
            if (_consolidatedClientsCache.length === 0) { 
                const cliRef = _collection(_db, CLIENTES_COLLECTION_PATH); 
                const cliSnaps = await _getDocs(cliRef); 
                _consolidatedClientsCache = cliSnaps.docs.map(d => ({id: d.id, ...d.data()})); 
            }

            const attendedSet = await getAttendedClientsByDateRange(startDate, endDate);
            
            const missedClients = _consolidatedClientsCache.filter(cli => {
                const nameKey = (cli.nombreComercial || '').trim().toLowerCase();
                return !attendedSet.has(nameKey);
            });

            if (missedClients.length === 0) {
                _showModal('Aviso', '¡Todos los clientes del catálogo fueron atendidos en esta semana!');
                return;
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Inasistencias');

            worksheet.columns = [
                { header: 'Sector', key: 'Sector', width: 20 },
                { header: 'Nombre Comercial', key: 'Nombre Comercial', width: 35 },
                { header: 'Nombre Personal', key: 'Nombre Personal', width: 30 },
                { header: 'Teléfono', key: 'Telefono', width: 15 },
                { header: 'CEP', key: 'CEP', width: 12 },
                { header: 'Coordenadas (Lat, Lng)', key: 'Coordenadas', width: 25 }
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD32F2F' } }; // Rojo oscuro

            const dExport = missedClients.map(c => ({
                'Sector': c.sector || 'S/S',
                'Nombre Comercial': c.nombreComercial || '',
                'Nombre Personal': c.nombrePersonal || '',
                'Telefono': c.telefono || '',
                'CEP': c.codigoCEP || '',
                'Coordenadas': c.coordenadas || ''
            }));

            worksheet.addRows(dExport);

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Inasistencias_${weekInput}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            _showModal('Éxito', `Se ha descargado el reporte de inasistencias de la semana ${weekInput}. Faltaron visitar ${missedClients.length} clientes.`);

        } catch (err) {
            console.error(err);
            _showModal('Error', 'Fallo al generar el reporte de inasistencias: ' + err.message);
        }
    }


    function showClientMapView() {
        if (mapInstance) { mapInstance.remove(); mapInstance = null; } _floatingControls.classList.add('hidden');
        
        const currentWeekStr = getISOWeekString(new Date());

        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-6xl"> <div class="bg-white/90 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Mapa de Clientes y Asistencia</h1>
                
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    
                    <div class="lg:col-span-2 space-y-4">
                        <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                            <h3 class="font-bold text-blue-900 mb-3 text-sm uppercase">Controles del Mapa</h3>
                            <div class="flex flex-col sm:flex-row gap-3">
                                <div class="relative flex-grow"> 
                                    <input type="text" id="map-search-input" placeholder="Buscar cliente por nombre o CEP..." class="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"> 
                                    <div id="map-search-results" class="absolute z-[1000] w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto hidden shadow-2xl"></div> 
                                </div>
                                <select id="map-mode-select" class="w-full sm:w-1/2 px-4 py-2 border border-blue-300 rounded-lg shadow-sm bg-white text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none">
                                    <option value="classic">Clásico: Tipo de Cliente (CEP)</option>
                                    <option value="weekly_all">Semanal: Todos (Visitados/Faltantes)</option>
                                    <option value="weekly_attended">Semanal: Solo Visitados</option>
                                    <option value="weekly_unattended">Semanal: Solo Faltantes (Ruta del día)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="lg:col-span-1">
                        <div class="p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm h-full flex flex-col justify-center">
                            <h3 class="font-bold text-red-900 mb-2 text-sm uppercase">Auditoría: Reporte de Inasistencias</h3>
                            <div class="flex flex-col gap-2">
                                <input type="week" id="missed-clients-week" value="${currentWeekStr}" class="border border-red-300 rounded p-2 text-sm w-full bg-white focus:ring-2 focus:ring-red-500 outline-none">
                                <button id="btnDownloadMissed" class="bg-red-600 text-white font-bold py-2 px-4 rounded shadow-md hover:bg-red-700 transition">Generar Excel</button>
                            </div>
                            <p class="text-[10px] text-red-700 mt-2 font-medium leading-tight">Descarga un listado exacto de los clientes del catálogo a los que <b>NO se les vendió nada</b> en la semana seleccionada.</p>
                        </div>
                    </div>

                </div>

                <div id="map-legend" class="mb-4 p-2 bg-gray-100 border border-gray-300 rounded-lg text-xs flex flex-wrap justify-center items-center gap-x-6 gap-y-2 font-medium"> 
                </div>
                
                <div id="client-map" class="w-full rounded-lg shadow-inner z-0" style="height:60vh; border:1px solid #ccc; background-color:#e5e7eb;"> <p class="text-center text-gray-500 pt-10 font-medium animate-pulse">Iniciando motor de mapas...</p> </div>
                
                <div class="mt-6 flex justify-end">
                    <button id="backToDataMenuBtn" class="px-8 py-2.5 bg-gray-600 text-white font-bold rounded-lg shadow-md hover:bg-gray-700 transition">Volver al Menú</button>
                </div>
            </div> </div> </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', showDataView); 
        document.getElementById('btnDownloadMissed').addEventListener('click', downloadMissedClientsExcel);
        
        const modeSelect = document.getElementById('map-mode-select');
        modeSelect.addEventListener('change', () => loadAndDisplayMap(modeSelect.value));
        
        loadAndDisplayMap('classic'); 
    }

    async function loadAndDisplayMap(mode = 'classic') {
        const mapCont = document.getElementById('client-map'); 
        const legendCont = document.getElementById('map-legend');

        if (!mapCont || typeof L === 'undefined') { mapCont.innerHTML = '<p class="text-red-500 font-bold p-4 text-center">Error Crítico: El motor de mapas Leaflet no pudo ser cargado. Revise su conexión a internet.</p>'; return; }
        
        // Actualizar Leyenda Dinámica
        if (mode === 'classic') {
            legendCont.innerHTML = `
                <span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" style="height:22px;margin-right:4px;"> Cliente Regular (Sin CEP)</span> 
                <span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png" style="height:22px;margin-right:4px;"> Cliente Con CEP</span>
            `;
        } else if (mode === 'weekly_all') {
             legendCont.innerHTML = `
                <span class="flex items-center opacity-60"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png" style="height:22px;margin-right:4px;"> Faltan por Visitar</span> 
                <span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png" style="height:22px;margin-right:4px;"> Visitados esta semana</span>
            `;
        } else if (mode === 'weekly_attended') {
            legendCont.innerHTML = `<span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png" style="height:22px;margin-right:4px;"> Visitados esta semana</span>`;
        } else if (mode === 'weekly_unattended') {
            legendCont.innerHTML = `<span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" style="height:22px;margin-right:4px;"> Pendientes de Visita (Ruta Crítica)</span>`;
        }

        try {
            if (_consolidatedClientsCache.length === 0) { 
                const cliRef = _collection(_db, CLIENTES_COLLECTION_PATH); 
                const cliSnaps = await _getDocs(cliRef); 
                _consolidatedClientsCache = cliSnaps.docs.map(d => ({id: d.id, ...d.data()})); 
            }
            
            const cliCoords = _consolidatedClientsCache.filter(c => { 
                if(!c.coordenadas)return false; 
                const p=c.coordenadas.split(','); 
                if(p.length!==2)return false; 
                const lat=parseFloat(p[0]), lon=parseFloat(p[1]); 
                return !isNaN(lat)&&!isNaN(lon)&&lat>=0&&lat<=13&&lon>=-74&&lon<=-59; 
            });

            if (cliCoords.length === 0) { mapCont.innerHTML = '<p class="text-gray-500 font-bold p-10 text-center">El catálogo no tiene clientes con coordenadas válidas para graficar.</p>'; return; }

            // Si es modo semanal, obtener datos de asistencia de ESTA semana (Lunes a Domingo)
            let attendedSet = new Set();
            if (mode.startsWith('weekly')) {
                if (!mapInstance) {
                    mapCont.innerHTML = '<p class="text-center text-blue-600 font-bold pt-10 animate-pulse">Analizando asistencias de la semana en curso...</p>'; 
                }
                const now = new Date();
                const day = now.getDay(); 
                const diff = now.getDate() - day + (day === 0 ? -6 : 1); 
                const monday = new Date(now.setDate(diff));
                monday.setHours(0,0,0,0);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23,59,59,999);
                
                attendedSet = await getAttendedClientsByDateRange(monday, sunday);
            }

            // Inicializar mapa si no existe
            if (!mapInstance) {
                let mapCenter = [7.77, -72.22]; 
                let zoom = 13; 
                mapInstance = L.map('client-map').setView(mapCenter, zoom); 
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(mapInstance);
            } else {
                if (mapMarkers.size > 0) {
                     mapMarkers.forEach(marker => mapInstance.removeLayer(marker));
                }
                mapInstance.eachLayer((layer) => {
                    if (layer instanceof L.Marker) {
                        mapInstance.removeLayer(layer);
                    }
                });
            }

            // Iconos
            const redI = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]}); 
            const blueI = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]});
            const greenI = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]});
            const greyI = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]});

            mapMarkers.clear(); 
            const mGroup=[]; 

            cliCoords.forEach(cli => {
                try {
                    const coords = cli.coordenadas.split(',').map(p=>parseFloat(p)); 
                    let icon, opacity = 1.0;
                    let shouldPlot = true;

                    if (mode === 'classic') {
                        const hasCEP = cli.codigoCEP && cli.codigoCEP.toLowerCase() !== 'n/a'; 
                        icon = hasCEP ? blueI : redI;
                    } else {
                        const nameKey = (cli.nombreComercial || '').trim().toLowerCase();
                        const isAttended = attendedSet.has(nameKey);
                        
                        if (mode === 'weekly_all') {
                            if (isAttended) { icon = greenI; opacity = 1.0; } 
                            else { icon = greyI; opacity = 0.6; }
                        } else if (mode === 'weekly_attended') {
                            if (isAttended) { icon = greenI; opacity = 1.0; }
                            else { shouldPlot = false; }
                        } else if (mode === 'weekly_unattended') {
                            // Uso icono rojo oscuro para resaltar la falta en vez del gris
                            if (!isAttended) { icon = redI; opacity = 1.0; }
                            else { shouldPlot = false; }
                        }
                    }

                    if (!shouldPlot) return;

                    const hasCEP = cli.codigoCEP && cli.codigoCEP.toLowerCase()!=='n/a';
                    const pCont=`<b>${cli.nombreComercial}</b><br><small>${cli.nombrePersonal||''}</small><br><small>Tel: ${cli.telefono||'N/A'}</small><br><small>Sector: ${cli.sector||'N/A'}</small>${hasCEP?`<br><b>CEP: ${cli.codigoCEP}</b>`:''}<br><a href="https://www.google.com/maps?q=${coords[0]},${coords[1]}" target="_blank" class="text-xs text-blue-600 font-bold mt-1 inline-block">Ver en Google Maps</a>`; 
                    
                    const marker = L.marker(coords, { icon: icon, opacity: opacity }).bindPopup(pCont, { minWidth: 160 }); 
                    
                    marker.addTo(mapInstance); 
                    mGroup.push(marker); 
                    mapMarkers.set(cli.id, marker);
                } catch(coordErr) {
                    console.warn(`Error coords cli ${cli.nombreComercial}: ${cli.coordenadas}`, coordErr);
                }
            });
            
            if(mGroup.length > 0) { 
                const group = L.featureGroup(mGroup);
                mapInstance.fitBounds(group.getBounds().pad(0.1)); 
            } else { 
                _showModal('Aviso', 'No hay clientes que cumplan con este filtro actualmente.');
                if (!mapInstance.getCenter()) mapInstance.setView([7.77, -72.22], 13);
            }
            
            setupMapSearch(cliCoords);
        } catch (error) { 
            console.error("Error mapa:", error); 
            mapCont.innerHTML = `<p class="text-red-500 font-bold p-10 text-center">Error al cargar datos del mapa.</p>`; 
        }
    }

    function setupMapSearch(clientsWithCoords) {
        const sInp = document.getElementById('map-search-input'), resCont = document.getElementById('map-search-results'); if (!sInp || !resCont) return;
        sInp.addEventListener('input', () => { const sTerm = sInp.value.toLowerCase().trim(); if (sTerm.length<2){resCont.innerHTML=''; resCont.classList.add('hidden'); return;} const filtCli = clientsWithCoords.filter(cli => (cli.nombreComercial||'').toLowerCase().includes(sTerm) || (cli.nombrePersonal||'').toLowerCase().includes(sTerm) || (cli.codigoCEP&&cli.codigoCEP.toLowerCase().includes(sTerm))); if(filtCli.length===0){resCont.innerHTML='<div class="p-2 text-gray-500 text-sm">No encontrado.</div>'; resCont.classList.remove('hidden'); return;} resCont.innerHTML=filtCli.slice(0,10).map(cli=>`<div class="p-2 hover:bg-blue-50 cursor-pointer border-b transition" data-client-id="${cli.id}"><p class="font-bold text-sm text-gray-800">${cli.nombreComercial}</p><p class="text-xs text-gray-500">${cli.nombrePersonal||''} ${cli.codigoCEP&&cli.codigoCEP!=='N/A'?`<span class="font-semibold text-blue-600">(${cli.codigoCEP})</span>`:''}</p></div>`).join(''); resCont.classList.remove('hidden'); });
        resCont.addEventListener('click', (e) => { const target = e.target.closest('[data-client-id]'); if (target&&mapInstance){ const cliId=target.dataset.clientId; const marker=mapMarkers.get(cliId); if(marker){mapInstance.flyTo(marker.getLatLng(),18); marker.openPopup();} else {_showModal('Aviso', 'El cliente está filtrado por el modo actual o no tiene coordenadas.');} sInp.value=''; resCont.innerHTML=''; resCont.classList.add('hidden'); } });
        document.addEventListener('click', (ev)=>{ if(!resCont.contains(ev.target)&&ev.target!==sInp) resCont.classList.add('hidden'); });
    }

    // --- FUNCIÓN GLOBAL DE ORDENAMIENTO REESCRITA (VERSIÓN DATA.JS) ---
    async function getGlobalProductSortFunction() {
        if (!_sortPreferenceCache || !_rubroOrderMapCache || !_marcasOrderMapCache) {
            try { 
                const dRef=_doc(_db, `artifacts/${_appId}/users/${_userId}/${SORT_CONFIG_PATH}`); 
                const dSnap=await _getDoc(dRef); 
                if(dSnap.exists()&&dSnap.data().order){ 
                    _sortPreferenceCache=dSnap.data().order; 
                } else {
                    _sortPreferenceCache=['segmento','marca','presentacion','rubro'];
                } 

                const publicPath = `artifacts/${PUBLIC_DATA_ID}/public/data`;
                _rubroOrderMapCache = {};
                _segmentoOrderMapCache = {};
                _marcasOrderMapCache = {}; 

                const [rSnap, sSnap, mSnap] = await Promise.all([
                    _getDocs(_collection(_db, `${publicPath}/rubros`)),
                    _getDocs(_collection(_db, `${publicPath}/segmentos`)),
                    _getDocs(_collection(_db, `${publicPath}/marcas`))
                ]);

                const norm = (s) => (s||'').trim().toUpperCase();

                rSnap.forEach(d => { const dat=d.data(); if(dat.name) _rubroOrderMapCache[norm(dat.name)] = dat.orden ?? 9999; });
                sSnap.forEach(d => { 
                    const dat=d.data(); 
                    if(dat.name) _segmentoOrderMapCache[norm(dat.name)] = {
                        orden: dat.orden ?? 9999,
                        marcaOrder: (dat.marcaOrder || []).map(m => norm(m))
                    };
                });
                mSnap.forEach(d => {
                    const dat=d.data();
                    if(dat.name) _marcasOrderMapCache[norm(dat.name)] = {
                        productOrder: dat.productOrder || []
                    };
                });

            } catch (error) { 
                console.error("Error cargando pref orden (Data):", error); 
                _sortPreferenceCache=['segmento','marca','presentacion','rubro']; 
                _rubroOrderMapCache={}; _segmentoOrderMapCache={}; _marcasOrderMapCache={};
            }
        }

        const norm = (s) => (s||'').trim().toUpperCase();

        return (a, b) => {
            const safeA = a || {}; const safeB = b || {};

            for (const key of _sortPreferenceCache) { 
                let res = 0;
                if (key === 'rubro') {
                    const kA = norm(safeA.rubro); const kB = norm(safeB.rubro);
                    const oA = _rubroOrderMapCache[kA] ?? 9999; 
                    const oB = _rubroOrderMapCache[kB] ?? 9999; 
                    res = oA - oB; 
                    if (res === 0) res = kA.localeCompare(kB); 
                }
                else if (key === 'segmento') { 
                    const kA = norm(safeA.segmento); const kB = norm(safeB.segmento);
                    const sA = _segmentoOrderMapCache[kA];
                    const sB = _segmentoOrderMapCache[kB];
                    res = (sA?.orden ?? 9999) - (sB?.orden ?? 9999); 
                    if (res === 0) res = kA.localeCompare(kB); 
                }
                else if (key === 'marca') { 
                    if (norm(safeA.segmento) === norm(safeB.segmento)) {
                        const segData = _segmentoOrderMapCache[norm(safeA.segmento)];
                        if (segData && segData.marcaOrder) {
                            const iA = segData.marcaOrder.indexOf(norm(safeA.marca));
                            const iB = segData.marcaOrder.indexOf(norm(safeB.marca));
                            if (iA !== -1 && iB !== -1) res = iA - iB;
                            else if (iA !== -1) res = -1;
                            else if (iB !== -1) res = 1;
                        }
                    }
                    if (res === 0) res = (safeA.marca||'').localeCompare(safeB.marca||''); 
                }
                else if (key === 'presentacion') { 
                    if (norm(safeA.marca) === norm(safeB.marca)) {
                        const mData = _marcasOrderMapCache?.[norm(safeA.marca)];
                        if (mData && mData.productOrder) {
                            const iA = mData.productOrder.indexOf(safeA.id);
                            const iB = mData.productOrder.indexOf(safeB.id);
                            if (iA !== -1 && iB !== -1) res = iA - iB;
                            else if (iA !== -1) res = -1;
                            else if (iB !== -1) res = 1;
                        }
                    }
                    if (res === 0) res = (safeA.presentacion||'').localeCompare(safeB.presentacion||''); 
                    if (res === 0) res = (safeA.id || '').localeCompare(safeB.id || ''); 
                }
                
                if (res !== 0) return res;
            } 
            return 0;
        };
    };

    window.dataModule = { 
        showClosingDetail, 
        handleDownloadSingleClosing,
        exportSingleClosingToExcel,
        _processSalesDataForModal: _processSalesDataForModal,
        getDisplayQty: getDisplayQty
    };

})();

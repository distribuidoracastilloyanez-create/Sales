(function() {
    let _db, _appId, _userId, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _query, _where, _orderBy, _populateDropdown, _getDoc, _doc, _setDoc;

    let _consolidatedClientsCache = [];
    let _filteredClientsCache = [];
    let _usersMapCache = new Map();
    
    // --- CACHÉS DE CRUCE DE DATOS ---
    let _adcEquiposMap = new Map(); 
    let _hasImagenesMap = new Set();
    let _hasDocumentosMap = new Set();
    let _cxcMap = new Map(); // Maps clientName (normalized) -> amount
    let _lastSaleMap = new Map(); // Maps clientName (normalized) -> Date object

    // Estilo profesional (azul corporativo), igual que Admin Panel.
    const AZUL = '#16305C';
    const AZUL_CLARO = '#BBD2EE';

    function cabecera(titulo, subtitulo, idVolver) {
        return `<div class="px-4 py-3 flex items-center justify-between" style="background:${AZUL}">
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold text-white tracking-tight truncate">${titulo}</h2>
                        <p class="text-[10px] mt-0.5 truncate" style="color:${AZUL_CLARO}">${subtitulo}</p>
                    </div>
                    <button id="${idVolver}" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition shrink-0">Volver</button>
                </div>`;
    }

    // Tarjeta descriptiva del menú
    function tarjetaMenu(id, titulo, descripcion) {
        return `<button id="${id}" class="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-[#16305C] hover:shadow-md transition group">
                    <p class="font-semibold text-gray-900 group-hover:text-[#16305C] transition">${titulo}</p>
                    <p class="text-xs text-gray-500 mt-0.5 leading-snug">${descripcion}</p>
                </button>`;
    }

    let mapInstance = null;
    let mapMarkers = new Map(); 
    let _mapModoActual = 'classic';   // modo con el que se dibujó el mapa
    let _mapIcons = null;             // iconos Leaflet, creados una sola vez
    let _miUbicacionCapas = [];       // punto azul + círculo de precisión del usuario

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
            rowDataClientsConsignacion: { bold: false, fillColor: "#FFEDD5", fontColor: "#000000", border: true, fontSize: 10 }, // Configurable ahora
            rowDataClientsDescuento: { bold: true, fillColor: "#FEF3C7", fontColor: "#92400E", border: true, fontSize: 10 }, // Acuerdo Comercial
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

    // Helper estricto para cruzar nombres (CXC, Ventas, Clientes)
    function normalizeStr(str) {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, '');
    }

    function getDisplayQty(qU, p) {
        if (!qU || qU === 0) return { value: '', unit: '' };
        if (!p) return { value: qU, unit: 'Und' };

        const vP = p.ventaPor || {und: true};
        const uCj = p.unidadesPorCaja || 1;
        const uPaq = p.unidadesPorPaquete || 1;
        
        if (vP.und) return { value: qU, unit: 'Und' };
        
        if (vP.cj && !vP.paq) {
            const cajas = Math.floor(qU / uCj);
            const resto = qU % uCj;
            if (resto > 0) return { value: `${cajas} Cj + ${resto} Und`, unit: '' };
            return { value: cajas, unit: 'Cj' };
        }
        
        if (vP.paq && !vP.cj) {
            const paq = Math.floor(qU / uPaq);
            const resto = qU % uPaq;
            if (resto > 0) return { value: `${paq} Pq + ${resto} Und`, unit: '' };
            return { value: paq, unit: 'Pq' };
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
        console.log("Módulo Data inicializado (Soporte Consignaciones & UI). Public ID:", PUBLIC_DATA_ID);
    };

    window.showDataView = function() {
        if (mapInstance) { mapInstance.remove(); mapInstance = null; }
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-3 sm:p-4 pt-6">
                <div class="container mx-auto max-w-3xl">
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                        ${cabecera('Data', 'Cierres, reportes y mapa de clientes', 'backToMenuBtn')}
                        <div class="p-4 space-y-3">
                            ${tarjetaMenu('closingDataBtn', 'Cierres de Ventas', 'Consultar y descargar los cierres diarios de cada vendedor.')}
                            ${tarjetaMenu('clientMapBtn', 'Mapa de Clientes y Asistencia', 'Ubicación de los clientes, gestión de códigos CEP y control de visitas.')}
                            ${tarjetaMenu('consolidatedClientsBtn', 'Reporte Consolidado de Clientes', 'Cruce maestro de la cartera completa, con descarga a Excel.')}
                            ${tarjetaMenu('designReportBtn', 'Diseño de Reporte', 'Colores, secciones y formato del archivo Excel de cierre.')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('closingDataBtn').addEventListener('click', showClosingDataView);
        document.getElementById('designReportBtn').addEventListener('click', showReportDesignView);
        document.getElementById('consolidatedClientsBtn').addEventListener('click', showConsolidatedClientsView);
        document.getElementById('clientMapBtn').addEventListener('click', showClientMapView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

    async function showClosingDataView() {
        _mainContent.innerHTML = `
            <div class="p-3 sm:p-4 pt-6">
                <div class="container mx-auto max-w-5xl">
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                        ${cabecera('Cierres de Ventas', 'Consulta por vendedor y rango de fechas', 'backToDataMenuBtn')}
                        <div class="p-4">
                            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg items-end">
                                <div class="col-span-2 lg:col-span-1">
                                    <label for="userFilter" class="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Vendedor</label>
                                    <select id="userFilter" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#16305C]/30"> <option value="">Cargando...</option> </select>
                                </div>
                                <div>
                                    <label for="fechaDesde" class="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Desde</label>
                                    <input type="date" id="fechaDesde" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#16305C]/30">
                                </div>
                                <div>
                                    <label for="fechaHasta" class="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Hasta</label>
                                    <input type="date" id="fechaHasta" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#16305C]/30">
                                </div>
                                <button id="searchCierresBtn" class="col-span-2 lg:col-span-1 w-full px-4 py-2 text-white text-sm font-semibold rounded-md shadow hover:opacity-90 transition" style="background:${AZUL}">Buscar</button>
                            </div>
                            <div id="cierres-list-container" class="overflow-x-auto max-h-[60vh] border border-gray-200 rounded-lg"> <p class="text-center text-gray-500 py-8 text-sm">Seleccione los filtros y presione Buscar.</p> </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView);
        document.getElementById('searchCierresBtn').addEventListener('click', handleSearchClosings);
        // Fecha de "hoy" en hora LOCAL (no UTC), para que filtros nocturnos
        // no salten al día siguiente. toISOString() siempre da UTC.
        const today = (() => {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        })();
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
        
        // Límites en hora de Venezuela (GMT-4): así un cierre de la tarde/noche del día
        // seleccionado no se escapa al comparar contra UTC.
        const fechaDesde = new Date(fechaDesdeStr + 'T00:00:00.000-04:00');
        const fechaHasta = new Date(fechaHastaStr + 'T23:59:59.999-04:00');
        
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
                    return snapshot.docs.map(doc => ({ id: doc.id, _ownerUid: uid, ...doc.data() }));
                });

                const results = await Promise.all(promises);
                allClosings = results.flat();

            } else {
                if (!selectedUserId) selectedUserId = _userId; 
                const closingsRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/cierres`);
                let q = _query(closingsRef, _where("fecha", ">=", fechaDesde), _where("fecha", "<=", fechaHasta));
                const snapshot = await _getDocs(q);
                allClosings = snapshot.docs.map(doc => ({ id: doc.id, _ownerUid: selectedUserId, ...doc.data() }));
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

            const _uidFila = vendedorSnapshot.userId || cierre._ownerUid;
            if (!vName && _uidFila) {
                const userFromCache = _usersMapCache.get(_uidFila);
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
        const acDescuentosPorCliente = {}; // Acuerdo Comercial: descuentos aplicados por cliente
        let grandTotalValue = 0;
        const allProductsMap = new Map();
        const vaciosMovementsPorTipo = {};
        const allRubros = new Set();
        const dataByRubro = {}; 
        const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
        
        const targetUserId = userIdForInventario || _userId;
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${targetUserId}/inventario`);
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);

        const [inventarioSnapshot, masterSnapshot] = await Promise.all([
            _getDocs(inventarioRef),
            _getDocs(masterRef)
        ]);

        const inventarioMap = new Map(inventarioSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const masterMap = new Map(masterSnapshot.docs.map(doc => [doc.id, doc.data()]));

        let hasSnapshot = cargaInicialInventario && cargaInicialInventario.length > 0;
        let snapshotMap = new Map();
        if(hasSnapshot) {
             snapshotMap = new Map(cargaInicialInventario.map(doc => [doc.productoId || doc.id, doc]));
        }
        
        const userDoc = await _getDoc(_doc(_db, "users", targetUserId));
        const userInfo = userDoc.exists() ? userDoc.data() : { email: 'Usuario Desconocido' };

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
            if (!dataByRubro[rubro]) {
                dataByRubro[rubro] = { clients: {}, productsMap: new Map(), productTotals: {}, totalValue: 0, obsequiosMap: new Set() };
            }
            if (!dataByRubro[rubro].productsMap.has(pId)) {
                dataByRubro[rubro].productsMap.set(pId, prodComp); 
            }
            allRubros.add(rubro);
        }
        
        const allData = [
            ...ventas.map(v => ({ tipo: 'venta', data: v })),
            ...(obsequios || []).map(o => ({ tipo: 'obsequio', data: o }))
        ];

        for (const item of allData) {
            const baseClientName = item.data.clienteNombre || 'Cliente Desconocido';
            const isObsequio = item.tipo === 'obsequio';
            const isConsignacion = item.tipo === 'venta' && (item.data.tipoOperacion === 'consignacion' || item.data.origen === 'Consignación');
            
            let rowClientName = baseClientName;
            if (isObsequio) rowClientName = `${baseClientName} (OBSEQUIO)`;
            else if (isConsignacion) rowClientName = `${baseClientName} (CONSIGNACIÓN)`; 

            if (!vaciosMovementsPorTipo[baseClientName]) { 
                vaciosMovementsPorTipo[baseClientName] = {}; 
                TIPOS_VACIO_GLOBAL.forEach(t => vaciosMovementsPorTipo[baseClientName][t] = { entregados: 0, devueltos: 0 }); 
            }

            if (!clientData[rowClientName]) clientData[rowClientName] = { products: {}, totalValue: 0, isObsequioRow: isObsequio, isConsignacionRow: isConsignacion };
            if (!clientData[baseClientName]) clientData[baseClientName] = { products: {}, totalValue: 0, isObsequioRow: false, isConsignacionRow: false };
            
            if (item.tipo === 'venta') {
                const venta = item.data;
                const ventaTotalCliente = venta.total || 0;
                clientData[rowClientName].totalValue += ventaTotalCliente;
                
                clientTotals[rowClientName] = (clientTotals[rowClientName] || 0) + ventaTotalCliente;
                grandTotalValue += ventaTotalCliente;

                const vacDev = venta.vaciosDevueltosPorTipo || {};
                for (const t in vacDev) { 
                    vaciosMovementsPorTipo[baseClientName][t].devueltos += (vacDev[t] || 0); 
                }
                
                (venta.productos || []).forEach(p => {
                    const prodPrivado = inventarioMap.get(p.id) || {};
                    const prodMaestro = masterMap.get(p.id) || {};
                    // El PRECIO debe ser el GUARDADO en la venta (foto del momento del cierre),
                    // NO el del catálogo actual: un cierre es inmutable. Lo estructural (rubro,
                    // unidadesPorCaja, marca, etc.) sí se toma del maestro actual.
                    const prodComp = { ...p, ...prodPrivado, ...prodMaestro, id: p.id, precios: (p.precios || prodMaestro.precios || prodPrivado.precios || { und: 0, paq: 0, cj: 0 }) }; 
                    const rubro = prodComp.rubro || 'SIN RUBRO';
                    
                    if (!dataByRubro[rubro]) {
                        dataByRubro[rubro] = { clients: {}, productsMap: new Map(), productTotals: {}, totalValue: 0, obsequiosMap: new Set() };
                        allRubros.add(rubro);
                    }
                    if (!dataByRubro[rubro].productsMap.has(p.id)) {
                        dataByRubro[rubro].productsMap.set(p.id, prodComp); 
                    }

                    if (p.id && !clientData[rowClientName].products[p.id]) clientData[rowClientName].products[p.id] = 0;
                    if (p.id && !clientData[baseClientName].products[p.id]) clientData[baseClientName].products[p.id] = 0;
                    
                    let cantidadUnidades = 0;
                    if (p.cantidadVendida) { 
                        const uCj = prodComp.unidadesPorCaja || 1;
                        const uPaq = prodComp.unidadesPorPaquete || 1;
                        cantidadUnidades = (p.cantidadVendida.cj || 0) * uCj + (p.cantidadVendida.paq || 0) * uPaq + (p.cantidadVendida.und || 0);
                    } else if (p.totalUnidadesVendidas) { 
                        cantidadUnidades = p.totalUnidadesVendidas;
                    }
                    if(p.id) {
                        clientData[rowClientName].products[p.id] += cantidadUnidades;
                        if (!isObsequio && !isConsignacion) clientData[baseClientName].products[p.id] += cantidadUnidades; 
                    }

                    if (prodComp.manejaVacios && prodComp.tipoVacio) {
                        vaciosMovementsPorTipo[baseClientName][prodComp.tipoVacio].entregados += p.cantidadVendida?.cj || 0; 
                    }

                    if (!dataByRubro[rubro].clients[rowClientName]) {
                        dataByRubro[rubro].clients[rowClientName] = { products: {}, totalValue: 0, isObsequioRow: isObsequio, isConsignacionRow: isConsignacion };
                    }
                    const subtotalProducto = (p.precios?.cj || 0) * (p.cantidadVendida?.cj || 0) + (p.precios?.paq || 0) * (p.cantidadVendida?.paq || 0) + (p.precios?.und || 0) * (p.cantidadVendida?.und || 0);
                    
                    if(p.id) dataByRubro[rubro].clients[rowClientName].products[p.id] = (dataByRubro[rubro].clients[rowClientName].products[p.id] || 0) + cantidadUnidades;
                    dataByRubro[rubro].clients[rowClientName].totalValue += subtotalProducto;
                    dataByRubro[rubro].totalValue += subtotalProducto;

                    // ACUERDO COMERCIAL: registrar qué productos llevaron descuento,
                    // para colorear su celda y para las observaciones del reporte.
                    if (p.id && p.descuentoAC && p.descuentoAC.length) {
                        const cli = dataByRubro[rubro].clients[rowClientName];
                        cli.descuentos = cli.descuentos || {};
                        cli.descuentos[p.id] = p.descuentoAC;
                        acDescuentosPorCliente[baseClientName] = acDescuentosPorCliente[baseClientName] || {};
                        acDescuentosPorCliente[baseClientName][p.id] = {
                            nombre: [p.presentacion, p.marca].filter(Boolean).join(' '),
                            detalle: p.descuentoAC
                        };
                    }
                });

            } else if (item.tipo === 'obsequio') {
                const obsequio = item.data;
                const prodPrivado = inventarioMap.get(obsequio.productoId) || {};
                const prodMaestro = masterMap.get(obsequio.productoId) || {};

                let pComp = {
                    id: obsequio.productoId,
                    rubro: prodMaestro.rubro || prodPrivado.rubro || 'OBSEQUIOS (ELIMINADO)',
                    segmento: prodMaestro.segmento || prodPrivado.segmento || 'N/A',
                    marca: prodMaestro.marca || prodPrivado.marca || 'N/A',
                    unidadesPorCaja: prodMaestro.unidadesPorCaja || prodPrivado.unidadesPorCaja || 1, 
                    precios: prodMaestro.precios || prodPrivado.precios || { und: 0, paq: 0, cj: 0 },
                    ventaPor: prodMaestro.ventaPor || prodPrivado.ventaPor || { cj: true, paq: false, und: false },
                    presentacion: obsequio.productoNombre || prodMaestro.presentacion || prodPrivado.presentacion || 'Producto Eliminado',
                    manejaVacios: !!obsequio.tipoVacio,
                    tipoVacio: obsequio.tipoVacio || null,
                };
                
                const cantidadCajas = obsequio.cantidadCajas || 0;
                const cantidadUnidades = cantidadCajas * (pComp.unidadesPorCaja || 1);
                const precioCj = pComp.precios?.cj || 0;
                const subtotalObsequio = cantidadCajas * precioCj;
                const rubro = pComp.rubro || 'SIN RUBRO';
                
                if (!dataByRubro[rubro]) {
                    dataByRubro[rubro] = { clients: {}, productsMap: new Map(), productTotals: {}, totalValue: 0, obsequiosMap: new Set() };
                    allRubros.add(rubro);
                }
                if (!dataByRubro[rubro].productsMap.has(pComp.id)) {
                    dataByRubro[rubro].productsMap.set(pComp.id, pComp); 
                }
                if (!dataByRubro[rubro].clients[rowClientName]) {
                    dataByRubro[rubro].clients[rowClientName] = { products: {}, totalValue: 0, isObsequioRow: true, isConsignacionRow: false };
                }
                dataByRubro[rubro].obsequiosMap.add(pComp.id);

                if(pComp.id) {
                    dataByRubro[rubro].clients[rowClientName].products[pComp.id] = (dataByRubro[rubro].clients[rowClientName].products[pComp.id] || 0) + cantidadUnidades;
                    
                    if (!clientData[baseClientName].products[pComp.id]) clientData[baseClientName].products[pComp.id] = 0;
                    clientData[baseClientName].products[pComp.id] += cantidadUnidades;
                    
                    clientData[baseClientName].isObsequioPartial = true; 
                }
                
                dataByRubro[rubro].clients[rowClientName].totalValue += subtotalObsequio;
                dataByRubro[rubro].totalValue += subtotalObsequio;
                
                clientData[baseClientName].totalValue += subtotalObsequio;
                
                clientTotals[rowClientName] = (clientTotals[rowClientName] || 0) + subtotalObsequio;
                grandTotalValue += subtotalObsequio;

                if (pComp.manejaVacios && pComp.tipoVacio) {
                    vaciosMovementsPorTipo[baseClientName][pComp.tipoVacio].entregados += cantidadCajas; 
                }
                const vacDev = obsequio.vaciosRecibidos || 0;
                if (vacDev > 0 && pComp.tipoVacio) {
                     vaciosMovementsPorTipo[baseClientName][pComp.tipoVacio].devueltos += vacDev;
                }
            }
        }
        
        const sortedClients = Object.keys(clientData).sort();
        
        const sortFunction = await getGlobalProductSortFunction();
        const finalProductOrder = Array.from(allProductsMap.values()).sort(sortFunction);

        // Mapa productoId -> unidades en stock del vendedor (lo usa el export para
        // decidir si una hoja de rubro tiene contenido real).
        const _stockActualPorId = {};
        inventarioMap.forEach((v, k) => { _stockActualPorId[k] = v.cantidadUnidades || 0; });
        const finalData = { rubros: {}, vaciosMovementsPorTipo: vaciosMovementsPorTipo, clientTotals: clientTotals, grandTotalValue: grandTotalValue, acDescuentosPorCliente: acDescuentosPorCliente, stockActualPorId: _stockActualPorId };

        for (const rubroName of Array.from(allRubros).sort()) {
            const rubroData = dataByRubro[rubroName];
            const sortedProducts = Array.from(rubroData.productsMap.values()).sort(sortFunction);
            const sortedClientsExcel = Object.keys(rubroData.clients).sort();
            const productTotals = {};

            for (const p of sortedProducts) {
                const productId = p.id;
                let totalSoldUnits = 0;
                for (const clientName of sortedClientsExcel) {
                    totalSoldUnits += (rubroData.clients[clientName].products[productId] || 0);
                }

                const pInfoCurrent = inventarioMap.get(productId);
                const pInfoSnapshot = snapshotMap.get(productId); 

                let initialStockUnits = 0;
                let currentStockUnits = 0;
                
                if (hasSnapshot) {
                    initialStockUnits = pInfoSnapshot ? (pInfoSnapshot.cantidadUnidades !== undefined ? pInfoSnapshot.cantidadUnidades : (pInfoSnapshot.stock || pInfoSnapshot.cantidad || 0)) : 0;
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
                sortedClients: sortedClientsExcel, 
                totalValue: rubroData.totalValue, 
                productTotals: productTotals,
                obsequiosMap: rubroData.obsequiosMap || new Set()
            };
        }

        return { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo, finalData, userInfo, acDescuentosPorCliente };
    }

    // Forzar orientación HORIZONTAL (landscape) en móvil. Requiere pantalla completa
    // y debe iniciarse dentro del gesto del usuario (el clic en "Ver").
    function _entrarHorizontal() {
        try {
            const el = document.documentElement;
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
            const lock = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* pantalla completa, orientación y capas: no todos los navegadores lo permiten */ } };
            if (req) { const p = req.call(el); if (p && p.then) p.then(lock).catch(() => {}); else lock(); }
            else lock();
        } catch (e) { /* pantalla completa, orientación y capas: no todos los navegadores lo permiten */ }
    }
    function _salirHorizontal() {
        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* pantalla completa, orientación y capas: no todos los navegadores lo permiten */ }
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            }
        } catch (e) { /* pantalla completa, orientación y capas: no todos los navegadores lo permiten */ }
    }

    // Detalle del cierre a PANTALLA COMPLETA: forma tabular de siempre, letra un poco
    // más pequeña, con scroll (horizontal para la tabla ancha y vertical si hace falta).
    function _mostrarDetalleCierre(titulo, innerHTML) {
        document.getElementById('detalleCierreOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'detalleCierreOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-white flex flex-col';
        ov.innerHTML = `
            <style>#detalleCierreOverlay .dc-scroll{scrollbar-width:none;-ms-overflow-style:none;} #detalleCierreOverlay .dc-scroll::-webkit-scrollbar{width:0;height:0;display:none;}</style>
            <div class="flex items-center justify-between px-4 py-2 bg-slate-800 text-white shrink-0">
                <span class="font-semibold text-sm truncate">${titulo}</span>
                <button id="dcClose" class="text-xs bg-red-500/90 hover:bg-red-500 rounded px-4 py-1.5 font-bold shrink-0">Cerrar</button>
            </div>
            <div class="dc-scroll flex-1 overflow-auto p-3" style="-webkit-overflow-scrolling:touch;">${innerHTML}</div>`;
        document.body.appendChild(ov);
        ov.querySelector('#dcClose').addEventListener('click', () => { _salirHorizontal(); ov.remove(); });
    }

    async function showClosingDetail(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'No se cargaron detalles.'); return; }
        _entrarHorizontal(); // debe ir en el gesto del clic (antes de cualquier await)
        _showModal('Progreso', 'Generando reporte detallado...');
        try {
            const cargaInicialHistorica = closingData.cargaInicialInventario || closingData.inventario || closingData.productos || [];
            
            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo } = 
                await _processSalesDataForModal(
                    closingData.ventas || [], 
                    closingData.obsequios || [], 
                    cargaInicialHistorica, 
                    closingData.vendedorInfo.userId
                );

            // Ocultar productos que no tuvieron NI UNA venta en ningún cliente (evita columnas vacías)
            const _prodCol = finalProductOrder.filter(p => sortedClients.some(cli => {
                const q = (clientData[cli] && clientData[cli].products) ? (clientData[cli].products[p.id] || 0) : 0;
                return q > 0;
            }));

            let hHTML = `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">Cliente</th>`;
            _prodCol.forEach(p => { hHTML += `<th class="p-1 border whitespace-nowrap text-xs" title="${p.marca||''} - ${p.segmento||''}">${p.presentacion}</th>`; });
            hHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200">Total Cliente</th></tr>`;
            
            let bHTML=''; 
            sortedClients.forEach(cli=>{
                const cCli = clientData[cli]; 
                const esSoloObsequio = cCli.isObsequioRow;
                const esSoloConsignacion = cCli.isConsignacionRow; 
                
                let rowClass = 'hover:bg-blue-50';
                if (esSoloObsequio) rowClass = 'bg-blue-100 hover:bg-blue-200 text-blue-900';
                if (esSoloConsignacion) rowClass = 'bg-orange-50 hover:bg-orange-100 text-orange-900';
                
                bHTML+=`<tr class="${rowClass}"><td class="p-1 border font-medium bg-white sticky left-0 z-10">${cli}</td>`; 
                _prodCol.forEach(p=>{
                    const qU=cCli.products[p.id]||0; 
                    const qtyDisplay = getDisplayQty(qU, p);
                    
                    let suffix = '';
                    if (esSoloObsequio) suffix = ` <span class="text-[10px] text-blue-600 font-black ml-1">(Regalo)</span>`;

                    let dQ = qU > 0 ? (typeof qtyDisplay.value === 'number' ? `${qtyDisplay.value} ${qtyDisplay.unit}` : qtyDisplay.value) + suffix : '';
                    
                    let cellClass = qU > 0 ? 'font-bold' : '';
                    if (esSoloObsequio && qU > 0) cellClass += ' bg-blue-50 text-blue-800';
                    if (esSoloConsignacion && qU > 0) cellClass += ' bg-orange-50 text-orange-800';

                    bHTML+=`<td class="p-1 border text-center ${cellClass}">${dQ}</td>`;
                }); 
                bHTML+=`<td class="p-1 border text-right font-semibold bg-white sticky right-0 z-10">$${cCli.totalValue.toFixed(2)}</td></tr>`;
            });

            let fHTML='<tr class="bg-gray-200 font-bold"><td class="p-1 border sticky left-0 z-10">TOTALES</td>'; 
            _prodCol.forEach(p=>{
                let tQ=0; sortedClients.forEach(cli=>tQ+=clientData[cli].products[p.id]||0); 
                const qtyDisplay = getDisplayQty(tQ, p);
                let dT = tQ > 0 ? (typeof qtyDisplay.value === 'number' ? `${qtyDisplay.value} ${qtyDisplay.unit}` : qtyDisplay.value) : '';
                fHTML+=`<td class="p-1 border text-center whitespace-nowrap">${dT}</td>`;
            }); 
            fHTML+=`<td class="p-1 border text-right sticky right-0 z-10">$${grandTotalValue.toFixed(2)}</td></tr>`;
            
            const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
            let vHTML=''; 
            const cliVacios = Object.keys(vaciosMovementsPorTipo).filter(cli => 
                TIPOS_VACIO_GLOBAL.some(t => (vaciosMovementsPorTipo[cli][t]?.entregados || 0) > 0 || (vaciosMovementsPorTipo[cli][t]?.devueltos || 0) > 0)
            ).sort(); 
            
            if (cliVacios.length > 0) { 
                vHTML = `
                    <h3 class="text-lg font-bold text-gray-800 mt-6 mb-2 border-t pt-4">Reporte de Vacíos</h3>
                    <div class="overflow-hidden border border-gray-300 rounded-lg shadow-sm">
                        <table class="min-w-full bg-white text-sm">
                            <thead class="bg-gray-800 text-white">
                                <tr>
                                    <th class="py-2 px-3 text-left font-semibold">Cliente</th>
                                    <th class="py-2 px-3 text-center font-semibold">Tipo</th>
                                    <th class="py-2 px-3 text-center font-semibold">Entregados</th>
                                    <th class="py-2 px-3 text-center font-semibold">Devueltos</th>
                                    <th class="py-2 px-3 text-center font-semibold">Pendiente</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                `; 
                
                cliVacios.forEach(cli => {
                    const movs = vaciosMovementsPorTipo[cli]; 
                    TIPOS_VACIO_GLOBAL.forEach(t => {
                        const mov = movs[t]; 
                        if (mov && (mov.entregados > 0 || mov.devueltos > 0)) {
                            const neto = mov.entregados - mov.devueltos; 
                            const nClass = neto > 0 ? 'text-red-600 font-bold bg-red-50' : (neto < 0 ? 'text-green-600 font-bold bg-green-50' : 'text-gray-500'); 
                            
                            let netoText = neto;
                            if (neto > 0) netoText = `+${neto} (Debe)`;
                            else if (neto < 0) netoText = `${neto} (A favor)`;
                            else netoText = `0 (al día)`;

                            vHTML += `
                                <tr class="hover:bg-gray-50">
                                    <td class="py-2 px-3 text-gray-800 font-medium">${cli}</td>
                                    <td class="py-2 px-3 text-center text-gray-600">${t}</td>
                                    <td class="py-2 px-3 text-center font-semibold text-gray-700">${mov.entregados}</td>
                                    <td class="py-2 px-3 text-center font-semibold text-gray-700">${mov.devueltos}</td>
                                    <td class="py-2 px-3 text-center ${nClass}">${netoText}</td>
                                </tr>
                            `;
                        }
                    });
                }); 
                vHTML += '</tbody></table></div>';
            }

            const vendedor = closingData.vendedorInfo || {};
            let vNameModal = vendedor.nombre || 'Desconocido';
            const _uidModal = vendedor.userId || closingData._ownerUid;
            if(!vendedor.nombre && _uidModal && _usersMapCache.has(_uidModal)){
                 vNameModal = _usersMapCache.get(_uidModal).nombre;
            }

            const reportInner = `<div class="text-left text-[11px]" style="width:max-content;max-width:none;">
                <div class="mb-2 text-xs"> <p><strong>Vendedor:</strong> ${vNameModal} ${vendedor.apellido||''}</p> <p><strong>Camión:</strong> ${vendedor.camion||'N/A'}</p> <p><strong>Fecha:</strong> ${closingData.fecha.toDate().toLocaleString('es-ES')}</p> </div>
                <h3 class="text-sm font-bold mb-1">Reporte Cierre</h3>
                <table class="bg-white text-[11px] border border-gray-300" style="border-collapse:collapse;"> <thead class="bg-gray-200">${hHTML}</thead> <tbody>${bHTML}</tbody> <tfoot>${fHTML}</tfoot> </table>
                <div class="mt-5">${vHTML}</div>
            </div>`;
            const _mc = document.getElementById('modalContainer'); if (_mc) _mc.classList.add('hidden');
            _mostrarDetalleCierre('Detalle Cierre', reportInner);
        } catch (error) { console.error("Error generando detalle:", error); _showModal('Error', `No se pudo generar: ${error.message}`); }
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
            const cargaInicialHistorica = closingData.cargaInicialInventario || closingData.inventario || closingData.productos || [];

            const { finalData, userInfo } = await _processSalesDataForModal(
                closingData.ventas || [], 
                closingData.obsequios || [], 
                cargaInicialHistorica, 
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
            const clientConsignacionStyle = buildExcelJSStyle(s.rowDataClientsConsignacion, s.rowDataClientsConsignacion.border ? thinBorderStyle : null, null, 'center');
            const clientConsignacionRowStyle = buildExcelJSStyle(s.rowDataClientsConsignacion, s.rowDataClientsConsignacion.border ? thinBorderStyle : null, null, 'left');
            
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

                // No generar la hoja de un rubro que no tuvo NI ventas NI existencias.
                // Evita la hoja fantasma "SIN RUBRO" que producen los productos huérfanos
                // (registros de inventario cuyo producto ya no está en el catálogo maestro).
                const _hayMovimiento = (sortedClients && sortedClients.length > 0)
                    || Math.abs(rubroTotalValue || 0) > 0.001
                    || (sortedProducts || []).some(p => ((finalData.stockActualPorId || {})[p.id] || 0) !== 0);
                if (!_hayMovimiento) continue;

                const sheetName = rubroName.replace(/[\/\\?*\[\]]/g, '').substring(0, 31);
                const worksheet = workbook.addWorksheet(sheetName);

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
                            if (typeof qtyDisplay.value === 'number') {
                                cell.value = qtyDisplay.value;
                                cell.style = { ...cargaInicialQtyStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                            } else {
                                cell.value = qtyDisplay.value;
                                cell.style = { ...cargaInicialQtyStyle };
                            }
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
                    const esSoloObsequio = clientSales.isObsequioRow;
                    const esSoloConsignacion = clientSales.isConsignacionRow; 

                    let rowBaseStyleSettings = s.rowDataClients;
                    if (esSoloObsequio) rowBaseStyleSettings = s.rowDataClientsObsequio;
                    else if (esSoloConsignacion) rowBaseStyleSettings = s.rowDataClientsConsignacion; 

                    const clientNameStyle = buildExcelJSStyle(
                        rowBaseStyleSettings,
                        rowBaseStyleSettings.border ? thinBorderStyle : null,
                        null, 
                        'left' 
                    );
                    clientRow.getCell(1).value = clientName;
                    clientRow.getCell(1).style = clientNameStyle;
                    
                    sortedProducts.forEach((p, index) => {
                        const qU = clientSales.products[p.id] || 0;
                        const cell = clientRow.getCell(START_COL + index);
                        
                        // ACUERDO COMERCIAL: si este producto llevó descuento para este
                        // cliente, su celda se pinta distinto (color configurable en Diseño).
                        const tieneDescuentoAC = !!(clientSales.descuentos && clientSales.descuentos[p.id]);

                        let cellStyleSettings = s.rowDataClients;
                        if (esSoloObsequio) cellStyleSettings = s.rowDataClientsObsequio;
                        else if (esSoloConsignacion && qU > 0) cellStyleSettings = s.rowDataClientsConsignacion; 
                        else if (qU > 0 && tieneDescuentoAC && s.rowDataClientsDescuento) cellStyleSettings = s.rowDataClientsDescuento;
                        else if (qU > 0) cellStyleSettings = s.rowDataClientsSale;

                        const finalCellStyle = buildExcelJSStyle(
                            cellStyleSettings,
                            cellStyleSettings.border ? thinBorderStyle : null,
                            null, 
                            'center' 
                        );
                        
                        if (qU > 0) {
                            const qtyDisplay = getDisplayQty(qU, p);
                            let suffix = '';
                            if (esSoloObsequio) suffix = ' (Obs)';

                            if (typeof qtyDisplay.value === 'number') {
                                cell.value = qtyDisplay.value;
                                cell.style = { ...finalCellStyle, numFmt: `0 " ${qtyDisplay.unit}${suffix}"` };
                            } else {
                                cell.value = qtyDisplay.value + suffix;
                                cell.style = finalCellStyle;
                            }
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
                            if (typeof qtyDisplay.value === 'number') {
                                cell.value = qtyDisplay.value;
                                cell.style = { ...cargaRestanteQtyStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                            } else {
                                cell.value = qtyDisplay.value;
                                cell.style = { ...cargaRestanteQtyStyle };
                            }
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
                        if (typeof qtyDisplay.value === 'number') {
                            cell.value = qtyDisplay.value;
                            cell.style = { ...totalsQtyStyle, numFmt: `0 " ${qtyDisplay.unit}"` };
                        } else {
                            cell.value = qtyDisplay.value;
                            cell.style = { ...totalsQtyStyle };
                        }
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
                    TIPOS_VACIO_GLOBAL.forEach(t => {
                        const mov = movs[t] || {entregados:0, devueltos:0}; 
                        if (mov.entregados > 0 || mov.devueltos > 0) {
                            const dataRow = wsVacios.addRow([cli, t, mov.entregados, mov.devueltos, mov.entregados - mov.devueltos]);
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
            const acDescuentos = finalData.acDescuentosPorCliente || {};
            if (settings.showClienteTotalSheet) {
                const wsClientes = workbook.addWorksheet('Total Por Cliente');
                wsClientes.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; 
                wsClientes.columns = [ 
                    { width: settings.columnWidths.totalCliente }, 
                    { width: settings.columnWidths.totalClienteValor },
                    { width: 46 } // Columna C: Observaciones (Acuerdo Comercial)
                ];

                const totalesHeaderStyle = buildExcelJSStyle(s.totalesHeader, s.totalesHeader.border ? thinBorderStyle : null, null, 'left');
                const totalesDataStyle = buildExcelJSStyle(s.totalesData, s.totalesData.border ? thinBorderStyle : null, null, 'left');
                const totalesDataPriceStyle = buildExcelJSStyle(s.totalesData, s.totalesData.border ? thinBorderStyle : null, "$#,##0.00", 'right');
                
                const totalesDataObsequioStyle = buildExcelJSStyle(s.rowDataClientsObsequio, s.rowDataClientsObsequio.border ? thinBorderStyle : null, null, 'left');
                const totalesDataObsequioPriceStyle = buildExcelJSStyle(s.rowDataClientsObsequio, s.rowDataClientsObsequio.border ? thinBorderStyle : null, "$#,##0.00", 'right');

                const totalesDataConsigStyle = buildExcelJSStyle(s.rowDataClientsConsignacion, s.rowDataClientsConsignacion.border ? thinBorderStyle : null, null, 'left');
                const totalesDataConsigPriceStyle = buildExcelJSStyle(s.rowDataClientsConsignacion, s.rowDataClientsConsignacion.border ? thinBorderStyle : null, "$#,##0.00", 'right');

                const totalesTotalRowStyle = buildExcelJSStyle(s.totalesTotalRow, s.totalesTotalRow.border ? thinBorderStyle : null, null, 'left');
                const totalesTotalRowPriceStyle = buildExcelJSStyle(s.totalesTotalRow, s.totalesTotalRow.border ? thinBorderStyle : null, "$#,##0.00", 'right');
                
                const headerRowTotales = wsClientes.getRow(1);
                headerRowTotales.values = ['Cliente', 'Gasto Total', 'Observaciones'];
                headerRowTotales.getCell(1).style = totalesHeaderStyle;
                headerRowTotales.getCell(2).style = buildExcelJSStyle(s.totalesHeader, s.totalesHeader.border ? thinBorderStyle : null, null, 'right');
                headerRowTotales.getCell(3).style = totalesHeaderStyle;

                // Texto de observaciones: descuentos del Acuerdo Comercial de ese cliente
                const obsDeCliente = (nombreCli) => {
                    // El nombre puede venir con sufijos como "(OBSEQUIO)"; se usa la base
                    const base = nombreCli.replace(/\s*\((OBSEQUIO|CONSIGNACIÓN|CONSIGNACION)\)\s*$/i, '').trim();
                    const ds = acDescuentos[base] || acDescuentos[nombreCli];
                    if (!ds) return '';
                    return Object.values(ds).map(d => {
                        const partes = (d.detalle || []).map(x => {
                            const et = x.tipo === 'cj' ? 'Cj' : x.tipo === 'paq' ? 'Paq' : 'Und';
                            return `${et} ${x.porcentaje}%`;
                        });
                        return `${d.nombre}: ${partes.join(', ')} dto`;
                    }).join(' · ');
                };
                
                const sortedClientTotals = Object.entries(clientTotals).sort((a, b) => a[0].localeCompare(b[0]));
                const obsStyle = buildExcelJSStyle(
                    s.rowDataClientsDescuento || s.totalesData,
                    (s.rowDataClientsDescuento || s.totalesData).border ? thinBorderStyle : null,
                    null, 'left');

                sortedClientTotals.forEach(([clientName, totalValue]) => {
                    const obs = obsDeCliente(clientName);
                    const row = wsClientes.addRow([clientName, Number(totalValue.toFixed(2)), obs]);
                    const isObs = clientName.includes('(OBSEQUIO)');
                    const isConsig = clientName.includes('(CONSIGNACIÓN)'); 
                    
                    if (isObs) {
                        row.getCell(1).style = totalesDataObsequioStyle;
                        row.getCell(2).style = totalesDataObsequioPriceStyle;
                    } else if (isConsig) {
                        row.getCell(1).style = totalesDataConsigStyle;
                        row.getCell(2).style = totalesDataConsigPriceStyle;
                    } else {
                        row.getCell(1).style = totalesDataStyle;
                        row.getCell(2).style = totalesDataPriceStyle;
                    }
                    // La observación se resalta solo si el cliente tiene acuerdo
                    row.getCell(3).style = obs ? obsStyle : totalesDataStyle;
                });
                
                const totalRow = wsClientes.addRow(['GRAN TOTAL', Number(grandTotalValue.toFixed(2)), '']);
                totalRow.getCell(1).style = totalesTotalRowStyle;
                totalRow.getCell(2).style = totalesTotalRowPriceStyle;
                totalRow.getCell(3).style = totalesTotalRowStyle;
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
                { header: 'Coordenadas (Lat, Lng)', key: 'Coordenadas', width: 25 },
                { header: 'Datos Adicionales', key: 'Datos Adicionales', width: 35 }
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD32F2F' } }; 

            const dExport = missedClients.map(c => ({
                'Sector': c.sector || 'S/S',
                'Nombre Comercial': c.nombreComercial || '',
                'Nombre Personal': c.nombrePersonal || '',
                'Telefono': c.telefono || '',
                'CEP': c.codigoCEP || '',
                'Coordenadas': c.coordenadas || '',
                'Datos Adicionales': c.datosAdicionales || ''
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

    // =========================================================================
    // NUEVO REPORTE CONSOLIDADO CON FILTROS Y CRUCE TOTAL
    // =========================================================================
    
    async function showConsolidatedClientsView() {
        _mainContent.innerHTML = `
            <div class="p-3 sm:p-4 pt-6 w-full max-w-7xl mx-auto flex flex-col h-screen">
                <div class="bg-white rounded-xl shadow-lg flex flex-col flex-grow overflow-hidden">
                    ${cabecera('Reporte Consolidado de Clientes', 'Cruce maestro de la cartera completa', 'backToDataMenuBtn')}
                    <div class="p-4 flex flex-col flex-grow overflow-hidden">
                        <div id="consolidated-clients-filters"></div>

                        <div id="consolidated-clients-container" class="overflow-x-auto overflow-y-auto flex-grow border border-gray-200 rounded-lg bg-gray-50 mb-3">
                            <p class="text-gray-500 text-center py-6 animate-pulse font-medium">Analizando bases de datos cruzadas... Esto puede tardar unos segundos.</p>
                        </div>

                        <button id="downloadClientsBtn" class="w-full px-6 py-3 text-white text-sm font-semibold rounded-lg shadow hover:opacity-90 transition hidden" style="background:${AZUL}">Descargar reporte en Excel</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView); 
        document.getElementById('downloadClientsBtn').addEventListener('click', handleDownloadFilteredClients);
        await loadAndRenderConsolidatedClients();
    }

    async function loadAndRenderConsolidatedClients() {
        const cont = document.getElementById('consolidated-clients-container'), filtCont = document.getElementById('consolidated-clients-filters'); if(!cont || !filtCont) return;
        try {
            // 1. Cargar Clientes Base
            const cliRef = _collection(_db, CLIENTES_COLLECTION_PATH); 
            const cliSnaps = await _getDocs(cliRef);
            _consolidatedClientsCache = cliSnaps.docs.map(d => ({id: d.id, ...d.data()}));
            
            // 2. Cargar Todos los Archivos (ADC, Docs, Imágenes) en una sola llamada
            const archivosRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`);
            const archivosSnaps = await _getDocs(archivosRef);
            
            _adcEquiposMap.clear();
            _hasImagenesMap.clear();
            _hasDocumentosMap.clear();

            archivosSnaps.forEach(doc => {
                const data = doc.data();
                if(!data.clienteId) return;

                if (data.categoria === 'adc' && data.adcInfo) {
                    if(!_adcEquiposMap.has(data.clienteId)) _adcEquiposMap.set(data.clienteId, []);
                    _adcEquiposMap.get(data.clienteId).push(data.adcInfo.division || data.adcInfo.empresa || 'Equipo ADC');
                } else if (data.categoria === 'imagenes') {
                    _hasImagenesMap.add(data.clienteId);
                } else if (data.categoria === 'documentos') {
                    _hasDocumentosMap.add(data.clienteId);
                }
            });

            // 3. Cargar CXC para obtener las Deudas Activas
            _cxcMap.clear();
            const cxcListRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/cxc`, 'list');
            const cxcSnap = await _getDoc(cxcListRef);
            if(cxcSnap.exists()) {
                const cxcData = cxcSnap.data().clients || [];
                cxcData.forEach(c => _cxcMap.set(normalizeStr(c.name), c.amount));
            }

            // 4. Barrido General para obtener la "Última Fecha de Venta"
            _lastSaleMap.clear();
            const usersRef = _collection(_db, "users");
            const usersSnap = await _getDocs(usersRef);
            const userIds = usersSnap.docs.map(d => d.id);

            const promises = userIds.map(async (uid) => {
                const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                const snap = await _getDocs(cierresRef);
                return snap.docs.map(d => d.data());
            });

            const results = await Promise.all(promises);
            const allCierres = results.flat();

            allCierres.forEach(cierre => {
                if(!cierre.fecha) return;
                const cDate = cierre.fecha.toDate ? cierre.fecha.toDate() : new Date(cierre.fecha);
                
                (cierre.ventas || []).forEach(v => {
                    if(v.clienteNombre) {
                        const normName = normalizeStr(v.clienteNombre);
                        const currentLast = _lastSaleMap.get(normName);
                        if(!currentLast || cDate > currentLast) {
                            _lastSaleMap.set(normName, cDate);
                        }
                    }
                });
            });

            // Renderizado de UI Filtros
            filtCont.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border border-gray-300 rounded-lg bg-white shadow-sm">
                    <div class="md:col-span-4">
                        <input type="text" id="client-search-input" placeholder="Buscar por Comercio, Representante, Doc o CEP..." class="w-full px-4 py-2 border border-gray-300 rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500 outline-none text-sm transition">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Sector</label>
                        <select id="client-filter-sector" class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500 outline-none transition"><option value="">TODOS</option></select>
                    </div>
                    <div class="flex items-center space-x-2 pt-5">
                        <input type="checkbox" id="client-filter-adc" class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer">
                        <label for="client-filter-adc" class="text-sm font-bold text-gray-700 cursor-pointer select-none">Solo con ADC</label>
                    </div>
                    <div class="flex items-center space-x-2 pt-5">
                        <input type="checkbox" id="client-filter-deuda" class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer">
                        <label for="client-filter-deuda" class="text-sm font-bold text-gray-700 cursor-pointer select-none">Con Deuda Activa</label>
                    </div>
                    <div class="flex items-end">
                        <button id="clear-client-filters-btn" class="w-full bg-gray-200 text-gray-700 text-sm font-bold rounded py-1.5 px-4 hover:bg-gray-300 transition border border-gray-300">LIMPIAR</button>
                    </div>
                </div>
            `;
            
            const uSectors = [...new Set(_consolidatedClientsCache.map(c => c.sector).filter(Boolean))].sort(); 
            const sFilt = document.getElementById('client-filter-sector'); 
            uSectors.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=s; sFilt.appendChild(o); });
            
            document.getElementById('client-search-input').addEventListener('input', renderConsolidatedClientsList); 
            sFilt.addEventListener('change', renderConsolidatedClientsList); 
            document.getElementById('client-filter-adc').addEventListener('change', renderConsolidatedClientsList); 
            document.getElementById('client-filter-deuda').addEventListener('change', renderConsolidatedClientsList); 
            
            document.getElementById('clear-client-filters-btn').addEventListener('click', () => { 
                document.getElementById('client-search-input').value = ''; 
                sFilt.value = ''; 
                document.getElementById('client-filter-adc').checked = false;
                document.getElementById('client-filter-deuda').checked = false;
                renderConsolidatedClientsList(); 
            });
            
            renderConsolidatedClientsList(); 
            document.getElementById('downloadClientsBtn').classList.remove('hidden');
        } catch (error) { 
            console.error("Error cargando clientes consolidados:", error); 
            cont.innerHTML = `<p class="text-red-500 font-bold text-center py-6">Error cruzando bases de datos.</p>`; 
        }
    }

    function renderConsolidatedClientsList() {
        const cont=document.getElementById('consolidated-clients-container'), sInp=document.getElementById('client-search-input'), sFilt=document.getElementById('client-filter-sector'); 
        const filterADC = document.getElementById('client-filter-adc')?.checked;
        const filterDeuda = document.getElementById('client-filter-deuda')?.checked;

        if(!cont||!sInp||!sFilt) return;
        const sTerm = sInp.value.toLowerCase(), selSec = sFilt.value;
        
        _filteredClientsCache = _consolidatedClientsCache.filter(cli => { 
            const nComL=(cli.nombreComercial||'').toLowerCase();
            const nPerL=(cli.nombrePersonal||'').toLowerCase();
            const docL=(cli.numeroDocumento||'').toLowerCase();
            const cepL=(cli.codigoCEP||'').toLowerCase(); 
            
            const searchM=!sTerm||nComL.includes(sTerm)||nPerL.includes(sTerm)||docL.includes(sTerm)||(cli.codigoCEP&&cepL.includes(sTerm)); 
            const secM=!selSec||cli.sector===selSec; 

            const adcMatch = !filterADC || _adcEquiposMap.has(cli.id);

            let hasDeuda = false;
            const deudaVal = _cxcMap.get(normalizeStr(cli.nombreComercial));
            if (deudaVal && deudaVal > 0) hasDeuda = true;
            const deudaMatch = !filterDeuda || hasDeuda;

            return searchM && secM && adcMatch && deudaMatch; 
        });

        if (_filteredClientsCache.length === 0) { cont.innerHTML = `<p class="text-center text-gray-500 p-8 font-medium">No se encontraron resultados.</p>`; return; }
        
        let tHTML = `<table class="min-w-full bg-white text-sm"> <thead class="bg-gray-800 text-white sticky top-0 z-10 shadow"> <tr> <th class="py-2 px-3 border-b text-left text-xs uppercase tracking-wide">Sector</th> <th class="py-2 px-3 border-b text-left text-xs uppercase tracking-wide">Comercio</th> <th class="py-2 px-3 border-b text-left text-xs uppercase tracking-wide hidden sm:table-cell">Doc/RIF</th> <th class="py-2 px-3 border-b text-center text-xs uppercase tracking-wide">ADC</th> <th class="py-2 px-3 border-b text-center text-xs uppercase tracking-wide">Deuda</th><th class="py-2 px-3 border-b text-center text-xs uppercase tracking-wide">GPS</th><th class="py-2 px-3 border-b text-center text-xs uppercase tracking-wide">Últ. Venta</th> </tr> </thead> <tbody class="divide-y divide-gray-200">`;
        
        _filteredClientsCache.sort((a,b)=>(a.nombreComercial||'').localeCompare(b.nombreComercial||'')).forEach(c=>{
            const docFormat = c.numeroDocumento ? `${c.tipoDocumento}-${c.numeroDocumento}` : 'S/D';
            
            const tieneADC = _adcEquiposMap.has(c.id);
            const adcIcon = tieneADC ? '❄️ Sí' : '<span class="text-gray-400">No</span>';
            
            const deudaMonto = _cxcMap.get(normalizeStr(c.nombreComercial)) || 0;
            const deudaLabel = deudaMonto > 0 ? `<span class="text-red-600 font-bold">$${deudaMonto.toFixed(2)}</span>` : '<span class="text-gray-400">0</span>';

            const gpsIcon = c.coordenadas ? '📍 Sí' : '<span class="text-red-400">No</span>';

            const lastSaleObj = _lastSaleMap.get(normalizeStr(c.nombreComercial));
            const lastSaleStr = lastSaleObj ? `<span class="text-blue-700 font-medium">${lastSaleObj.toLocaleDateString('es-ES')}</span>` : '<span class="text-gray-400 text-xs italic">Sin reg.</span>';

            tHTML+=`<tr class="hover:bg-blue-50 border-b transition-colors"><td class="py-2.5 px-3 align-middle text-gray-700">${c.sector||'N/A'}</td><td class="py-2.5 px-3 font-bold text-gray-900 align-middle">${c.nombreComercial||'N/A'}</td><td class="py-2.5 px-3 font-mono text-gray-600 hidden sm:table-cell align-middle">${docFormat}</td><td class="py-2.5 px-3 text-center align-middle">${adcIcon}</td><td class="py-2.5 px-3 text-center align-middle">${deudaLabel}</td><td class="py-2.5 px-3 text-center align-middle">${gpsIcon}</td><td class="py-2.5 px-3 text-center align-middle">${lastSaleStr}</td></tr>`;
        });
        
        tHTML += '</tbody></table>'; cont.innerHTML = tHTML;
    }
    
    async function handleDownloadFilteredClients() {
         if (typeof ExcelJS === 'undefined' || _filteredClientsCache.length === 0) { _showModal('Aviso', typeof ExcelJS === 'undefined'?'Librería ExcelJS no cargada.':'No hay clientes que exportar.'); return; }
        
        _showModal('Progreso', 'Generando Excel Maestro...', null, '', null, false);

        const dExport = _filteredClientsCache.map(c => {
            const tieneADC = _adcEquiposMap.has(c.id);
            const tiposAdc = tieneADC ? [...new Set(_adcEquiposMap.get(c.id))].join(', ') : 'N/A';
            const tieneImg = _hasImagenesMap.has(c.id) ? 'SÍ' : 'NO';
            const tieneDoc = _hasDocumentosMap.has(c.id) ? 'SÍ' : 'NO';
            const tieneGPS = c.coordenadas ? 'SÍ' : 'NO';
            const normName = normalizeStr(c.nombreComercial);
            
            const deudaMonto = _cxcMap.get(normName) || 0;
            const tieneDeuda = deudaMonto > 0 ? 'SÍ' : 'NO';
            
            const ultimaVentaObj = _lastSaleMap.get(normName);
            const ultimaVentaStr = ultimaVentaObj ? ultimaVentaObj.toLocaleDateString('es-ES') : 'Sin registros';

            let saldoVaciosStr = '';
            if(c.saldoVacios) {
                saldoVaciosStr = Object.entries(c.saldoVacios)
                    .filter(([k,v]) => v !== 0)
                    .map(([k,v]) => `${k}: ${v}`)
                    .join(' | ');
            }
            if(!saldoVaciosStr) saldoVaciosStr = 'al día';

            return {
                'Sector': c.sector || 'S/S',
                'Razón Social': c.nombreComercial || '',
                'Representante': c.nombrePersonal || '',
                'Tipo Doc': c.tipoDocumento || 'V',
                'Nº Documento': c.numeroDocumento || '',
                'Teléfono': c.telefono || '',
                'CEP': c.codigoCEP || 'N/A',
                'Coordenadas GPS': c.coordenadas || 'N/A',
                'Tiene GPS': tieneGPS,
                'Equipos ADC': tieneADC ? 'SÍ' : 'NO',
                'Detalle ADC': tiposAdc,
                'Imágenes Guardadas': tieneImg,
                'Doc. Formales': tieneDoc,
                'Fecha Última Venta': ultimaVentaStr,
                'Deuda Registrada': tieneDeuda,
                'Monto Deuda ($)': deudaMonto > 0 ? deudaMonto : 0,
                'Saldo Envases Vacíos': saldoVaciosStr,
                'Agente Retención IVA': c.aplicaRetencion ? 'SÍ' : 'NO',
                'Datos Adicionales': c.datosAdicionales || ''
            };
        });
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Base de Clientes Consolidados');

        worksheet.columns = [
            { header: 'Sector', key: 'Sector', width: 20 },
            { header: 'Razón Social', key: 'Razón Social', width: 35 },
            { header: 'Representante', key: 'Representante', width: 30 },
            { header: 'Tipo Doc', key: 'Tipo Doc', width: 12 },
            { header: 'Nº Documento', key: 'Nº Documento', width: 18 },
            { header: 'Teléfono', key: 'Teléfono', width: 15 },
            { header: 'CEP', key: 'CEP', width: 12 },
            { header: 'Coordenadas GPS', key: 'Coordenadas GPS', width: 25 },
            { header: 'Tiene GPS', key: 'Tiene GPS', width: 12 },
            { header: 'Equipos ADC', key: 'Equipos ADC', width: 15 },
            { header: 'Detalle ADC', key: 'Detalle ADC', width: 30 },
            { header: 'Imágenes Guardadas', key: 'Imágenes Guardadas', width: 22 },
            { header: 'Doc. Formales', key: 'Doc. Formales', width: 20 },
            { header: 'Fecha Última Venta', key: 'Fecha Última Venta', width: 20 },
            { header: 'Deuda Registrada', key: 'Deuda Registrada', width: 20 },
            { header: 'Monto Deuda ($)', key: 'Monto Deuda ($)', width: 20, style: { numFmt: '$#,##0.00' } },
            { header: 'Saldo Envases Vacíos', key: 'Saldo Envases Vacíos', width: 40 },
            { header: 'Agente Retención IVA', key: 'Agente Retención IVA', width: 25 },
            { header: 'Datos Adicionales', key: 'Datos Adicionales', width: 40 }
        ];

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0ea5e9' } }; 
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        worksheet.addRows(dExport);

        const today = new Date().toISOString().slice(0, 10);
        const fileName = `Master_Clientes_Consolidado_${today}.xlsx`;

        try {
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            document.getElementById('modalContainer').classList.add('hidden');
        } catch (error) {
            console.error("Error al descargar clientes con ExcelJS:", error);
            _showModal('Error', 'No se pudo generar el archivo de clientes.');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAPA DE CLIENTES — Apoyo para la gestión de códigos CEP
    // Un cliente sin código CEP se marca en ROJO. Cuando ya se está tramitando
    // el código con la compañía se marca en AMARILLO, para saber cuáles quedan
    // pendientes de verificar. Al cargarle el CEP pasa a AZUL automáticamente.
    // ─────────────────────────────────────────────────────────────────────────
    const MARKER_BASE = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-';

    function construirIconos() {
        if (_mapIcons) return _mapIcons;
        const crear = color => new L.Icon({
            iconUrl: `${MARKER_BASE}${color}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        });
        // 'gold' es el amarillo vivo del set; 'yellow' es mostaza y se pierde sobre el mapa
        _mapIcons = { red: crear('red'), blue: crear('blue'), green: crear('green'), grey: crear('grey'), yellow: crear('gold') };
        return _mapIcons;
    }

    function tieneCEP(cli) {
        return !!(cli.codigoCEP && cli.codigoCEP.toString().trim().toLowerCase() !== 'n/a');
    }

    // Icono que le toca a un cliente sin CEP según si ya está en gestión
    function iconoSinCEP(cli) {
        const I = construirIconos();
        return cli.cepEnGestion ? I.yellow : I.red;
    }

    function popupClienteHTML(cli, mode) {
        const coords   = (cli.coordenadas || '').split(',').map(x => parseFloat(x));
        const conCEP   = tieneCEP(cli);
        const gestion  = !!cli.cepEnGestion;
        // El botón de gestión solo tiene sentido donde el color habla del CEP
        const permite  = !conCEP && ['classic', 'cep_gestion', 'cep_en_gestion', 'cep_pendientes'].includes(mode);

        let bloqueGestion = '';
        if (permite) {
            const desde = gestion && cli.cepGestionFecha
                ? `<br><small class="text-gray-500">En gestión desde el ${new Date(cli.cepGestionFecha).toLocaleDateString('es-ES')}</small>`
                : '';
            bloqueGestion = `
                <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb">
                    ${gestion ? '<small style="color:#92400e;font-weight:700">CÓDIGO EN GESTIÓN</small>' + desde : '<small style="color:#b91c1c;font-weight:700">SIN CÓDIGO CEP</small>'}
                    <br>
                    <button onclick="window.dataModule.toggleCepGestion('${cli.id}')"
                        style="margin-top:5px;width:100%;padding:5px 8px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${gestion ? '#d1d5db' : '#f59e0b'};background:${gestion ? '#f3f4f6' : '#fef3c7'};color:${gestion ? '#374151' : '#92400e'}">
                        ${gestion ? 'Quitar de gestión' : 'Marcar en gestión'}
                    </button>
                </div>`;
        }

        return `<b>${cli.nombreComercial || ''}</b><br><small>${cli.nombrePersonal || ''}</small><br>`
             + `<small>Tel: ${cli.telefono || 'N/A'}</small><br><small>Sector: ${cli.sector || 'N/A'}</small>`
             + (conCEP ? `<br><b>CEP: ${cli.codigoCEP}</b>` : '')
             + `<br><a href="https://www.google.com/maps?q=${coords[0]},${coords[1]}" target="_blank" class="text-xs text-blue-600 font-bold mt-1 inline-block">Ver en Google Maps</a>`
             + bloqueGestion;
    }

    // Marca o desmarca un cliente como "código CEP en gestión".
    // Solo cambia ese marcador: el mapa no se recarga ni se mueve de sitio.
    async function toggleCepGestion(clienteId) {
        const cli = _consolidatedClientsCache.find(c => c.id === clienteId);
        if (!cli) { _showModal('Aviso', 'Cliente no encontrado. Vuelva a abrir el mapa.'); return; }
        if (tieneCEP(cli)) { _showModal('Aviso', 'Este cliente ya tiene código CEP asignado.'); return; }

        const nuevoEstado = !cli.cepEnGestion;
        const fecha       = nuevoEstado ? new Date().toISOString() : null;
        try {
            await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId),
                          { cepEnGestion: nuevoEstado, cepGestionFecha: fecha }, { merge: true });
            cli.cepEnGestion    = nuevoEstado;
            cli.cepGestionFecha = fecha;

            const marker = mapMarkers.get(clienteId);
            if (marker) {
                // En los modos que filtran por estado, el cliente deja de pertenecer
                // a la vista: se retira del mapa en lugar de quedar con el color que no es.
                const saleDeLaVista = (_mapModoActual === 'cep_en_gestion' && !nuevoEstado)
                                   || (_mapModoActual === 'cep_pendientes' && nuevoEstado);
                if (saleDeLaVista) {
                    mapInstance.removeLayer(marker);
                    mapMarkers.delete(clienteId);
                } else {
                    marker.setIcon(iconoSinCEP(cli));
                    marker.setPopupContent(popupClienteHTML(cli, _mapModoActual));
                }
            }
            actualizarResumenGestion();
        } catch (error) {
            console.error('Error marcando gestión CEP:', error);
            _showModal('Error', 'No se pudo guardar la marca de gestión. Revise la conexión.');
        }
    }

    // Contador de cómo va la gestión de códigos
    function actualizarResumenGestion() {
        const cont = document.getElementById('cepGestionResumen');
        if (!cont) return;
        const sinCEP     = _consolidatedClientsCache.filter(c => !tieneCEP(c));
        // (los conteos de abajo son sobre toda la cartera, no solo lo que se ve)
        const enGestion  = sinCEP.filter(c => c.cepEnGestion).length;
        const pendientes = sinCEP.length - enGestion;
        const sinCoords  = sinCEP.filter(c => !c.coordenadas).length;
        cont.innerHTML = `<b>${enGestion}</b> en gestión · <b>${pendientes}</b> por gestionar`
                       + (sinCoords ? ` <span class="text-gray-500">(${sinCoords} sin coordenadas, no salen en el mapa)</span>` : '');
    }

    // Ubica al usuario en el mapa con el GPS del teléfono y acerca la vista.
    // Se dibuja con círculos (no con un marcador normal) para que el punto azul
    // sobreviva cuando se cambia de modo y no se confunda con un cliente.
    function mostrarMiUbicacion() {
        const btn = document.getElementById('btnMiUbicacion');
        if (!mapInstance) { _showModal('Aviso', 'El mapa todavía se está cargando. Intente en un momento.'); return; }
        if (!navigator.geolocation) { _showModal('No disponible', 'Este dispositivo o navegador no permite obtener la ubicación.'); return; }

        const textoOriginal = btn ? btn.textContent.trim() : 'Mi Ubicación';
        if (btn) { btn.disabled = true; btn.textContent = 'Buscando señal...'; btn.classList.add('opacity-70'); }
        const restaurar = () => { if (btn) { btn.disabled = false; btn.textContent = textoOriginal; btn.classList.remove('opacity-70'); } };

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                restaurar();
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const precision = Math.round(pos.coords.accuracy || 0);

                _miUbicacionCapas.forEach(capa => { try { mapInstance.removeLayer(capa); } catch (e) { /* pantalla completa, orientación y capas: no todos los navegadores lo permiten */ } });
                _miUbicacionCapas = [];

                const halo = L.circle([lat, lon], {
                    radius: Math.max(precision, 10), color: '#2563eb', weight: 1,
                    fillColor: '#3b82f6', fillOpacity: 0.15
                }).addTo(mapInstance);

                const punto = L.circleMarker([lat, lon], {
                    radius: 8, color: '#ffffff', weight: 3,
                    fillColor: '#2563eb', fillOpacity: 1
                }).addTo(mapInstance);

                punto.bindPopup(`<b>Usted está aquí</b><br><small>Precisión aproximada: ${precision} m</small><br><a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" class="text-xs text-blue-600 font-bold mt-1 inline-block">Ver en Google Maps</a>`);

                _miUbicacionCapas = [halo, punto];
                mapInstance.flyTo([lat, lon], 17);
                punto.openPopup();
            },
            (err) => {
                restaurar();
                const mensajes = {
                    1: 'La aplicación no tiene permiso para usar su ubicación. Actívelo en los ajustes del navegador o del teléfono y vuelva a intentarlo.',
                    2: 'No se pudo determinar su ubicación. Verifique que el GPS esté encendido y que tenga señal.',
                    3: 'La búsqueda tardó demasiado. Salga a un lugar más despejado e intente de nuevo.'
                };
                _showModal('Ubicación no disponible', mensajes[err.code] || 'No se pudo obtener su ubicación.');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }

    function showClientMapView() {
        if (mapInstance) { mapInstance.remove(); mapInstance = null; }
        _miUbicacionCapas = [];
        _floatingControls.classList.add('hidden');
        
        const currentWeekStr = getISOWeekString(new Date());

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 sm:pt-6">
                <div class="container mx-auto max-w-6xl">
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                        ${cabecera('Mapa de Clientes', 'Ubicación, gestión de códigos CEP y asistencia', 'backToDataMenuBtn')}

                        <div class="p-3 space-y-2">

                            <!-- Buscador + vista: siempre a la mano -->
                            <div class="flex gap-2">
                                <div class="relative flex-grow">
                                    <input type="text" id="map-search-input" placeholder="Buscar cliente por nombre o CEP..."
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#16305C]/30">
                                    <div id="map-search-results" class="absolute z-[1000] w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto hidden shadow-2xl"></div>
                                </div>
                                <button id="btnMiUbicacion" class="shrink-0 px-4 py-2 text-white text-sm font-semibold rounded-lg shadow hover:opacity-90 transition whitespace-nowrap" style="background:${AZUL}">Mi Ubicación</button>
                            </div>

                            <select id="map-mode-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-semibold outline-none focus:ring-2 focus:ring-[#16305C]/30">
                                <optgroup label="Códigos CEP">
                                    <option value="classic">Todos los clientes por tipo</option>
                                    <option value="cep_gestion">Sin código CEP (por gestionar y en gestión)</option>
                                    <option value="cep_en_gestion">Solo los que están en gestión</option>
                                    <option value="cep_pendientes">Solo los que faltan por gestionar</option>
                                </optgroup>
                                <optgroup label="Asistencia de la semana">
                                    <option value="weekly_all">Todos (visitados y faltantes)</option>
                                    <option value="weekly_attended">Solo visitados</option>
                                    <option value="weekly_unattended">Solo faltantes (ruta del día)</option>
                                </optgroup>
                            </select>

                            <div id="map-legend" class="p-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px] flex flex-wrap justify-center items-center gap-x-4 gap-y-1 font-medium"></div>

                            <div id="client-map" class="w-full rounded-lg z-0" style="height:65vh;min-height:320px;border:1px solid #d1d5db;background-color:#e5e7eb;">
                                <p class="text-center text-gray-500 pt-10 font-medium animate-pulse">Iniciando motor de mapas...</p>
                            </div>

                            <!-- Auditoría: fuera del camino, se abre solo si se necesita -->
                            <details class="border border-gray-200 rounded-lg bg-gray-50">
                                <summary class="px-3 py-2.5 text-sm font-semibold text-gray-700 cursor-pointer select-none">Reporte de inasistencias</summary>
                                <div class="px-3 pb-3 pt-1">
                                    <p class="text-[11px] text-gray-600 mb-2 leading-snug">Listado de los clientes a los que <b>no se les vendió nada</b> en la semana seleccionada.</p>
                                    <div class="flex flex-col sm:flex-row gap-2">
                                        <input type="week" id="missed-clients-week" value="${currentWeekStr}" class="flex-grow border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#16305C]/30">
                                        <button id="btnDownloadMissed" class="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow hover:bg-red-700 transition whitespace-nowrap">Generar Excel</button>
                                    </div>
                                </div>
                            </details>

                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView); 
        document.getElementById('btnDownloadMissed').addEventListener('click', downloadMissedClientsExcel);
        
        document.getElementById('btnMiUbicacion').addEventListener('click', mostrarMiUbicacion);

        const modeSelect = document.getElementById('map-mode-select');
        modeSelect.addEventListener('change', () => loadAndDisplayMap(modeSelect.value));
        
        loadAndDisplayMap('classic'); 
    }

    async function loadAndDisplayMap(mode = 'classic') {
        const mapCont = document.getElementById('client-map'); 
        const legendCont = document.getElementById('map-legend');

        if (!mapCont || typeof L === 'undefined') { mapCont.innerHTML = '<p class="text-red-500 font-bold p-4 text-center">Error Crítico: El motor de mapas Leaflet no pudo ser cargado. Revise su conexión a internet.</p>'; return; }

        _mapModoActual = mode;
        
        if (mode === 'cep_gestion' || mode === 'cep_en_gestion' || mode === 'cep_pendientes') {
            const filas = [];
            if (mode !== 'cep_en_gestion') filas.push(`<span class="flex items-center"><img src="${MARKER_BASE}red.png" style="height:20px;margin-right:4px;"> Por gestionar</span>`);
            if (mode !== 'cep_pendientes') filas.push(`<span class="flex items-center"><img src="${MARKER_BASE}gold.png" style="height:20px;margin-right:4px;"> Código en gestión</span>`);
            legendCont.innerHTML = filas.join('')
                + `<span id="cepGestionResumen" class="w-full text-center text-gray-700 mt-1"></span>`
                + `<span class="w-full text-center text-[10px] text-gray-500 leading-tight">Toque un marcador y use el botón del globo para marcarlo o quitarlo de gestión.</span>`;
        } else if (mode === 'classic') {
            legendCont.innerHTML = `
                <span class="flex items-center"><img src="${MARKER_BASE}red.png" style="height:22px;margin-right:4px;"> Cliente Regular (Sin CEP)</span> 
                <span class="flex items-center"><img src="${MARKER_BASE}gold.png" style="height:22px;margin-right:4px;"> Sin CEP, código en gestión</span>
                <span class="flex items-center"><img src="${MARKER_BASE}blue.png" style="height:22px;margin-right:4px;"> Cliente Con CEP</span>
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

            const { red: redI, blue: blueI, green: greenI, grey: greyI } = construirIconos();

            mapMarkers.clear(); 
            const mGroup=[]; 

            cliCoords.forEach(cli => {
                try {
                    const coords = cli.coordenadas.split(',').map(p=>parseFloat(p)); 
                    let icon, opacity = 1.0;
                    let shouldPlot = true;

                    if (mode === 'classic') {
                        icon = tieneCEP(cli) ? blueI : iconoSinCEP(cli);
                    } else if (mode === 'cep_gestion' || mode === 'cep_en_gestion' || mode === 'cep_pendientes') {
                        // Clientes sin código CEP: rojo por gestionar, amarillo en gestión
                        const enGestion = !!cli.cepEnGestion;
                        if (tieneCEP(cli)) shouldPlot = false;
                        else if (mode === 'cep_en_gestion' && !enGestion) shouldPlot = false;
                        else if (mode === 'cep_pendientes' && enGestion) shouldPlot = false;
                        else icon = iconoSinCEP(cli);
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
                            if (!isAttended) { icon = redI; opacity = 1.0; }
                            else { shouldPlot = false; }
                        }
                    }

                    if (!shouldPlot) return;

                    const pCont = popupClienteHTML(cli, mode);
                    
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
            
            actualizarResumenGestion();
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

    function showReportDesignView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <style>
                input[type="color"] { -webkit-appearance: none; -moz-appearance: none; appearance: none; background: none; border: 1px solid #ccc; padding: 0; }
                input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
                input[type="color"]::-webkit-color-swatch { border: none; border-radius: 2px; }
                input[type="color"]::-moz-color-swatch { border: none; border-radius: 2px; }
                .design-tab-btn {
                    padding: 0.5rem 1rem;
                    cursor: pointer;
                    border: 1px solid transparent;
                    border-bottom: none;
                    margin-bottom: -1px;
                    background-color: #f9fafb;
                    color: #6b7280;
                    border-radius: 0.375rem 0.375rem 0 0;
                }
                .design-tab-btn.active {
                    background-color: #ffffff;
                    color: #16305C;
                    font-weight: 600;
                    border-color: #e5e7eb;
                }
            </style>
            <div class="p-3 sm:p-4 pt-6">
                <div class="container mx-auto max-w-3xl">
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                        ${cabecera('Diseño de Reporte', 'Estilos y secciones del Excel de cierre', 'cabeceraVolverDiseno')}
                        <div class="p-4 md:p-6">
                        
                        <div id="design-loader" class="text-center text-gray-500 p-4">Cargando configuración...</div>
                        
                        <form id="design-form-container" class="hidden text-left">
                            
                            <div id="design-tabs" class="flex border-b border-gray-200 mb-4 overflow-x-auto text-sm">
                                <button type="button" class="design-tab-btn active" data-tab="general">General</button>
                                <button type="button" class="design-tab-btn" data-tab="rubro">Hoja Rubros</button>
                                <button type="button" class="design-tab-btn" data-tab="vacios">Hoja Vacíos</button>
                                <button type="button" class="design-tab-btn" data-tab="totales">Hoja Totales</button>
                            </div>

                            <div id="design-tab-content" class="space-y-6">

                                <div id="tab-content-general" class="space-y-4">
                                    <h3 class="text-lg font-semibold border-b pb-2 mt-4">Visibilidad de Secciones</h3>
                                    <div class="space-y-2 mt-4">
                                        <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" id="chk_showCargaInicial" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                            <span>Mostrar fila "CARGA INICIAL" (en Hojas Rubro)</span>
                                        </label>
                                        <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" id="chk_showCargaRestante" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                            <span>Mostrar fila "CARGA RESTANTE" (en Hojas Rubro)</span>
                                        </label>
                                        <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" id="chk_showVaciosSheet" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                            <span>Incluir hoja "Reporte Vacíos"</span>
                                        </label>
                                        <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" id="chk_showClienteTotalSheet" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                            <span>Incluir hoja "Total Por Cliente"</span>
                                        </label>
                                    </div>
                                </div>

                                <div id="tab-content-rubro" class="space-y-6 hidden">
                                    <h3 class="text-lg font-semibold border-b pb-2">Ancho de Columnas (Hoja Rubros)</h3>
                                    <div id="rubro-widths-container" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
                                        <p>Cargando anchos...</p>
                                    </div>
                                    <h3 class="text-lg font-semibold border-b pb-2 mt-4">Estilos de Zonas (Hoja Rubros)</h3>
                                    <div id="style-zones-container" class="space-y-3 mt-4">
                                        <p>Cargando estilos...</p>
                                    </div>
                                </div>

                                <div id="tab-content-vacios" class="space-y-6 hidden">
                                    <h3 class="text-lg font-semibold border-b pb-2">Ancho de Columnas (Hoja Vacíos)</h3>
                                    <div id="vacios-widths-container" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
                                        <p>Cargando anchos...</p>
                                    </div>
                                    <h3 class="text-lg font-semibold border-b pb-2 mt-4">Estilos de Zonas (Hoja Vacíos)</h3>
                                    <div id="vacios-styles-container" class="space-y-3 mt-4">
                                        <p>Cargando estilos...</p>
                                    </div>
                                </div>

                                <div id="tab-content-totales" class="space-y-6 hidden">
                                    <h3 class="text-lg font-semibold border-b pb-2">Ancho de Columnas (Hoja Totales)</h3>
                                    <div id="totales-widths-container" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
                                        <p>Cargando anchos...</p>
                                    </div>
                                    <h3 class="text-lg font-semibold border-b pb-2 mt-4">Estilos de Zonas (Hoja Totales)</h3>
                                    <div id="totales-styles-container" class="space-y-3 mt-4">
                                        <p>Cargando estilos...</p>
                                    </div>
                                </div>

                            </div>

                            <div class="pt-6 mt-6 border-t">
                                <button type="button" id="saveDesignBtn" class="w-full px-6 py-3 text-white text-sm font-semibold rounded-lg shadow hover:opacity-90 transition" style="background:${AZUL}">Guardar Diseño</button>
                            </div>
                        </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('cabeceraVolverDiseno').addEventListener('click', window.showDataView);
        document.getElementById('saveDesignBtn').addEventListener('click', handleSaveReportDesign);

        const tabsContainer = document.getElementById('design-tabs');
        const tabContents = document.querySelectorAll('#design-tab-content > div');
        tabsContainer.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.design-tab-btn');
            if (!clickedTab) return;

            const tabId = clickedTab.dataset.tab;
            
            tabsContainer.querySelectorAll('.design-tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            clickedTab.classList.add('active');
            
            tabContents.forEach(content => {
                if (content.id === `tab-content-${tabId}`) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });
        });

        loadDesignConfiguration();
    }

    async function loadDesignConfiguration() {
        const loader = document.getElementById('design-loader');
        const formContainer = document.getElementById('design-form-container');
        
        try {
            const REPORTE_DESIGN_PATH = REPORTE_DESIGN_CONFIG_PATH;
            const docRef = _doc(_db, REPORTE_DESIGN_PATH);
            const docSnap = await _getDoc(docRef);
            
            let currentSettings = JSON.parse(JSON.stringify(DEFAULT_REPORTE_SETTINGS));
            if (docSnap.exists()) {
                const savedSettings = docSnap.data();
                currentSettings = { ...currentSettings, ...savedSettings };
                currentSettings.styles = { ...DEFAULT_REPORTE_SETTINGS.styles, ...(savedSettings.styles || {}) };
                currentSettings.columnWidths = { ...DEFAULT_REPORTE_SETTINGS.columnWidths, ...(savedSettings.columnWidths || {}) };
            }

            document.getElementById('chk_showCargaInicial').checked = currentSettings.showCargaInicial;
            document.getElementById('chk_showCargaRestante').checked = currentSettings.showCargaRestante;
            document.getElementById('chk_showVaciosSheet').checked = currentSettings.showVaciosSheet;
            document.getElementById('chk_showClienteTotalSheet').checked = currentSettings.showClienteTotalSheet;

            const s = currentSettings.styles;
            document.getElementById('style-zones-container').innerHTML = `
                ${createZoneEditor('headerInfo', 'Info (Fecha/Usuario)', s.headerInfo)}
                ${createZoneEditor('headerProducts', 'Cabecera Productos', s.headerProducts)}
                ${createZoneEditor('rowCargaInicial', 'Fila "CARGA INICIAL"', s.rowCargaInicial)}
                ${createZoneEditor('rowDataClients', 'Filas Clientes (Celdas Vacías)', s.rowDataClients)}
                ${createZoneEditor('rowDataClientsSale', 'Filas Clientes (Venta > 0)', s.rowDataClientsSale)} 
                ${createZoneEditor('rowDataClientsObsequio', 'Filas Clientes (Obsequio)', s.rowDataClientsObsequio)}
                ${createZoneEditor('rowDataClientsConsignacion', 'Filas Clientes (Consignación)', s.rowDataClientsConsignacion)}
                ${createZoneEditor('rowDataClientsDescuento', 'Celda con Acuerdo Comercial (descuento)', s.rowDataClientsDescuento)}
                ${createZoneEditor('rowCargaRestante', 'Fila "CARGA RESTANTE"', s.rowCargaRestante)}
                ${createZoneEditor('rowTotals', 'Fila "TOTALES"', s.rowTotals)}
            `;
            const w = currentSettings.columnWidths;
            document.getElementById('rubro-widths-container').innerHTML = `
                ${createWidthEditor('width_col_A_LabelsClientes', 'Col A (Etiquetas/Clientes)', w.col_A_LabelsClientes)}
                ${createWidthEditor('width_products', 'Cols Producto (B, C...)', w.products)}
                ${createWidthEditor('width_subtotal', 'Col Sub Total', w.subtotal)}
            `;

            document.getElementById('vacios-widths-container').innerHTML = `
                ${createWidthEditor('width_vaciosCliente', 'Cliente', w.vaciosCliente)}
                ${createWidthEditor('width_vaciosTipo', 'Tipo Vacío', w.vaciosTipo)}
                ${createWidthEditor('width_vaciosQty', 'Cantidades (Ent/Dev/Neto)', w.vaciosQty)}
                <div></div>
            `;
            document.getElementById('vacios-styles-container').innerHTML = `
                ${createZoneEditor('vaciosHeader', 'Cabecera (Cliente, Tipo, etc.)', s.vaciosHeader)}
                ${createZoneEditor('vaciosData', 'Filas de Datos', s.vaciosData)}
            `;

            document.getElementById('totales-widths-container').innerHTML = `
                ${createWidthEditor('width_totalCliente', 'Cliente', w.totalCliente)}
                ${createWidthEditor('width_totalClienteValor', 'Gasto Total', w.totalClienteValor)}
            `;
            document.getElementById('totales-styles-container').innerHTML = `
                ${createZoneEditor('totalesHeader', 'Cabecera (Cliente, Gasto)', s.totalesHeader)}
                ${createZoneEditor('totalesData', 'Filas de Clientes', s.totalesData)}
                ${createZoneEditor('totalesTotalRow', 'Fila "GRAN TOTAL"', s.totalesTotalRow)}
            `;

            loader.classList.add('hidden');
            formContainer.classList.remove('hidden');

        } catch (error) {
            console.error("Error cargando diseño:", error);
            loader.textContent = 'Error al cargar la configuración.';
            _showModal('Error', `No se pudo cargar la configuración: ${error.message}`);
        }
    }

    function createZoneEditor(idPrefix, label, settings) {
        const s = settings;
        return `
        <div class="p-3 border rounded-lg bg-gray-50">
            <h4 class="font-semibold text-gray-700">${label}</h4>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 text-sm items-center">
                <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" id="${idPrefix}_bold" ${s.bold ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>Negrita</span></label>
                <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" id="${idPrefix}_border" ${s.border ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>Bordes</span></label>
                <label class="flex items-center space-x-2"><span>Fondo:</span><input type="color" id="${idPrefix}_fillColor" value="${s.fillColor || '#FFFFFF'}" class="h-6 w-10 border cursor-pointer p-0"></label>
                <label class="flex items-center space-x-2"><span>Texto:</span><input type="color" id="${idPrefix}_fontColor" value="${s.fontColor || '#000000'}" class="h-6 w-10 border cursor-pointer p-0"></label>
                <label class="flex items-center space-x-2"><span>Tamaño:</span><input type="number" id="${idPrefix}_fontSize" value="${s.fontSize || 10}" min="8" max="16" class="h-7 w-12 border cursor-pointer p-1 text-sm rounded-md"></label>
            </div>
        </div>`;
    }

    function createWidthEditor(id, label, value) {
        return `
        <div class="flex items-center justify-between">
            <label for="${id}" class="text-sm font-medium text-gray-700">${label}:</label>
            <input type="number" id="${id}" value="${value}" min="5" max="50" step="1" class="w-20 px-2 py-1 border rounded-lg text-sm">
        </div>`;
    }

    function readZoneEditor(idPrefix) {
        const boldEl = document.getElementById(`${idPrefix}_bold`);
        const borderEl = document.getElementById(`${idPrefix}_border`);
        const fillColorEl = document.getElementById(`${idPrefix}_fillColor`);
        const fontColorEl = document.getElementById(`${idPrefix}_fontColor`);
        const fontSizeEl = document.getElementById(`${idPrefix}_fontSize`);

        const defaults = DEFAULT_REPORTE_SETTINGS.styles[idPrefix] || 
                         (idPrefix === 'rowDataClientsSale' ? DEFAULT_REPORTE_SETTINGS.styles.rowDataClients : 
                         (idPrefix === 'rowDataClientsObsequio' ? DEFAULT_REPORTE_SETTINGS.styles.rowDataClients :
                         (idPrefix === 'rowDataClientsConsignacion' ? { bold: false, fillColor: "#FFEDD5", fontColor: "#000000", border: true, fontSize: 10 } :
                         (DEFAULT_REPORTE_SETTINGS.styles[idPrefix] || {}))));

        return {
            bold: boldEl ? boldEl.checked : (defaults.bold || false),
            border: borderEl ? borderEl.checked : (defaults.border || false),
            fillColor: fillColorEl ? fillColorEl.value : (defaults.fillColor || '#FFFFFF'),
            fontColor: fontColorEl ? fontColorEl.value : (defaults.fontColor || '#000000'),
            fontSize: fontSizeEl ? (parseInt(fontSizeEl.value, 10) || 10) : (defaults.fontSize || 10)
        };
    }

    function readWidthInputs() {
        const defaults = DEFAULT_REPORTE_SETTINGS.columnWidths;
        const readVal = (id, def) => parseInt(document.getElementById(id)?.value, 10) || def;
        
        return {
            col_A_LabelsClientes: readVal('width_col_A_LabelsClientes', defaults.col_A_LabelsClientes),
            products: readVal('width_products', defaults.products),
            subtotal: readVal('width_subtotal', defaults.subtotal),
            vaciosCliente: readVal('width_vaciosCliente', defaults.vaciosCliente),
            vaciosTipo: readVal('width_vaciosTipo', defaults.vaciosTipo),
            vaciosQty: readVal('width_vaciosQty', defaults.vaciosQty),
            totalCliente: readVal('width_totalCliente', defaults.totalCliente),
            totalClienteValor: readVal('width_totalClienteValor', defaults.totalClienteValor)
        };
    }

    async function handleSaveReportDesign() {
        _showModal('Progreso', 'Guardando diseño...');

        const newSettings = {
            showCargaInicial: document.getElementById('chk_showCargaInicial').checked,
            showCargaRestante: document.getElementById('chk_showCargaRestante').checked,
            showVaciosSheet: document.getElementById('chk_showVaciosSheet').checked,
            showClienteTotalSheet: document.getElementById('chk_showClienteTotalSheet').checked,
            styles: {
                headerInfo: readZoneEditor('headerInfo'),
                headerProducts: readZoneEditor('headerProducts'),
                rowCargaInicial: readZoneEditor('rowCargaInicial'),
                rowDataClients: readZoneEditor('rowDataClients'),
                rowDataClientsSale: readZoneEditor('rowDataClientsSale'), 
                rowDataClientsObsequio: readZoneEditor('rowDataClientsObsequio'),
                rowDataClientsConsignacion: readZoneEditor('rowDataClientsConsignacion'),
                rowDataClientsDescuento: readZoneEditor('rowDataClientsDescuento'),
                rowCargaRestante: readZoneEditor('rowCargaRestante'),
                rowTotals: readZoneEditor('rowTotals'),
                vaciosHeader: readZoneEditor('vaciosHeader'),
                vaciosData: readZoneEditor('vaciosData'),
                totalesHeader: readZoneEditor('totalesHeader'),
                totalesData: readZoneEditor('totalesData'),
                totalesTotalRow: readZoneEditor('totalesTotalRow')
            },
            columnWidths: readWidthInputs()
        };

        try {
            const REPORTE_DESIGN_PATH = REPORTE_DESIGN_CONFIG_PATH;
            const docRef = _doc(_db, REPORTE_DESIGN_PATH);
            await _setDoc(docRef, newSettings);
            _showModal('Éxito', 'Diseño guardado correctamente.', window.showDataView); 
        } catch (error) {
            console.error("Error guardando diseño:", error);
            _showModal('Error', `No se pudo guardar: ${error.message}`);
        }
    }

    async function getGlobalProductSortFunction() {
        return (a, b) => {
            const rStrA = (a.rubro || 'SIN RUBRO').toUpperCase();
            const rStrB = (b.rubro || 'SIN RUBRO').toUpperCase();
            if (rStrA !== rStrB) return rStrA.localeCompare(rStrB);

            const sOrdA = a.ordenSegmento ?? 9999;
            const sOrdB = b.ordenSegmento ?? 9999;
            if (sOrdA !== sOrdB) return sOrdA - sOrdB;
            const sStrA = (a.segmento || 'SIN SEGMENTO').toUpperCase();
            const sStrB = (b.segmento || 'SIN SEGMENTO').toUpperCase();
            if (sStrA !== sStrB) return sStrA.localeCompare(sStrB);

            const mOrdA = a.ordenMarca ?? 9999;
            const mOrdB = b.ordenMarca ?? 9999;
            if (mOrdA !== mOrdB) return mOrdA - mOrdB;
            const mStrA = (a.marca || 'S/M').toUpperCase();
            const mStrB = (b.marca || 'S/M').toUpperCase();
            if (mStrA !== mStrB) return mStrA.localeCompare(mStrB);

            const pOrdA = a.ordenProducto ?? 9999;
            const pOrdB = b.ordenProducto ?? 9999;
            if (pOrdA !== pOrdB) return pOrdA - pOrdB;
            const pStrA = (a.presentacion || '').toUpperCase();
            const pStrB = (b.presentacion || '').toUpperCase();
            return pStrA.localeCompare(pStrB);
        };
    }

    window.showReportDesignView = showReportDesignView;
    window.showConsolidatedClientsView = showConsolidatedClientsView;
    window.showClientMapView = showClientMapView;

    window.dataModule = { 
        toggleCepGestion,
        showClosingDetail, 
        handleDownloadSingleClosing,
        exportSingleClosingToExcel,
        _processSalesDataForModal: _processSalesDataForModal,
        getDisplayQty: getDisplayQty
    };

})();

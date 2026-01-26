(function() {
    // --- VARIABLES GLOBALES DEL MÓDULO ---
    let _db, _appId, _userId, _userRole, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _query, _where, _orderBy, _populateDropdown, _getDoc, _doc, _setDoc, _onSnapshot, _addDoc;

    let _salesListenerUnsubscribe = null; // Para detener la escucha al salir del mapa
    let _soldClientIdsThisWeek = new Set(); // Cache de clientes con venta esta semana
    let _tempUserInventory = []; // Cache para el inventario consultado de un usuario

    let mapInstance = null;
    let mapMarkers = new Map();

    // Cachés para el ordenamiento
    let _sortPreferenceCache = null;
    let _rubroOrderMapCache = null;
    let _segmentoOrderMapCache = null;
    
    // Rutas relativas y dinámicas
    const SORT_CONFIG_PATH = 'config/productSortOrder'; 
    const PUBLIC_DATA_ID = 'ventas-9a210';
    let REPORTE_DESIGN_CONFIG_PATH;
    
    // Configuración por defecto para los estilos del Reporte Excel (Cierres)
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
            col_A_LabelsClientes: 25, products: 12, subtotal: 15, vaciosCliente: 25, vaciosTipo: 15, vaciosQty: 12, totalCliente: 35, totalClienteValor: 15
        }
    };

    // --- UTILIDADES ---
    function getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar al lunes
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

    function buildExcelJSStyle(config, borderStyle, numFmt = null, horizontalAlign = 'left') {
        const style = {};
        style.font = { bold: config.bold || false, color: { argb: 'FF' + (config.fontColor || "#000000").substring(1) }, size: config.fontSize || 10 };
        style.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (config.fillColor || "#FFFFFF").substring(1) } };
        if (config.border && borderStyle) style.border = borderStyle;
        if (numFmt) style.numFmt = numFmt;
        style.alignment = { vertical: 'middle', horizontal: horizontalAlign };
        return style;
    }

    // --- INICIALIZACIÓN ---
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
        
        // Ejecutar chequeo silencioso de reporte semanal
        checkAndGenerateWeeklyReport();
    };

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
            const qVentas = _query(ventasRef, 
                _where("fecha", ">=", startOfLastWeek),
                _where("fecha", "<=", endOfLastWeek)
            );
            const ventasSnap = await _getDocs(qVentas);
            const clientesAtendidosIds = new Set();
            ventasSnap.forEach(doc => {
                const venta = doc.data();
                if (venta.clienteId) clientesAtendidosIds.add(venta.clienteId);
            });

            const clientesNoAtendidos = todosLosClientes.filter(c => !clientesAtendidosIds.has(c.id));

            const reporteData = {
                id: reportId,
                fechaGeneracion: new Date(),
                semanaInicio: startOfLastWeek.toISOString(),
                semanaFin: endOfLastWeek.toISOString(),
                totalClientesBase: todosLosClientes.length,
                totalAtendidos: clientesAtendidosIds.size,
                totalNoAtendidos: clientesNoAtendidos.length,
                listaNoAtendidos: clientesNoAtendidos.map(c => ({
                    id: c.id,
                    nombreComercial: c.nombreComercial,
                    nombrePersonal: c.nombrePersonal,
                    sector: c.sector || 'N/A',
                    telefono: c.telefono || 'N/A'
                }))
            };

            await _setDoc(historyRef, reporteData);
            console.log("Reporte semanal guardado exitosamente.");

        } catch (error) {
            console.error("Error en checkAndGenerateWeeklyReport:", error);
        }
    }

    // --- VISTA PRINCIPAL DATOS ---
    window.showDataView = function() {
        if (mapInstance) {
            mapInstance.remove(); mapInstance = null;
        }
        if (_salesListenerUnsubscribe) {
            _salesListenerUnsubscribe(); _salesListenerUnsubscribe = null;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        const isAdmin = _userRole === 'admin';

        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Módulo de Datos</h1>
                <div class="space-y-4">
                    <button id="closingDataBtn" class="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700">Cierres de Ventas</button>
                    ${isAdmin ? `<button id="auditRecargasBtn" class="w-full px-6 py-3 bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700">Auditoría de Recargas</button>` : ''}
                    ${isAdmin ? `<button id="userInventoryBtn" class="w-full px-6 py-3 bg-teal-700 text-white rounded-lg shadow-md hover:bg-teal-800">Inventario por Usuario</button>` : ''}
                    <button id="designReportBtn" class="w-full px-6 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700">Diseño de Reporte</button>
                    <button id="clientMapBtn" class="w-full px-6 py-3 bg-cyan-600 text-white rounded-lg shadow-md hover:bg-cyan-700">Mapa de Rutas (Semanal)</button>
                    <button id="attentionHistoryBtn" class="w-full px-6 py-3 bg-orange-600 text-white rounded-lg shadow-md hover:bg-orange-700">Histórico de Atención</button>
                    <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver Menú</button>
                </div>
            </div> </div> </div>
        `;
        document.getElementById('closingDataBtn').addEventListener('click', showClosingDataView);
        if (isAdmin) {
            document.getElementById('auditRecargasBtn').addEventListener('click', showRecargasReportView);
            document.getElementById('userInventoryBtn').addEventListener('click', showUserInventoryView);
        }
        document.getElementById('designReportBtn').addEventListener('click', showReportDesignView);
        document.getElementById('clientMapBtn').addEventListener('click', showClientMapView);
        document.getElementById('attentionHistoryBtn').addEventListener('click', showAttentionHistoryView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

    // --- INVENTARIO POR USUARIO (ADMIN) ---
    async function showUserInventoryView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; }
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-5xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Consultar Inventario por Usuario</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Seleccionar Vendedor:</label>
                                <select id="invUserSelector" class="w-full p-2 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500">
                                    <option value="">Cargando lista de usuarios...</option>
                                </select>
                            </div>
                            <div class="flex items-end">
                                <button id="loadUserInvBtn" class="w-full bg-teal-700 text-white p-2 rounded-lg font-bold hover:bg-teal-800 shadow-md transition-all">
                                    Consultar Inventario
                                </button>
                            </div>
                        </div>

                        <div class="mb-4">
                            <input type="text" id="invSearchInput" placeholder="Filtrar por Producto, Marca o Segmento..." class="w-full px-4 py-2 border rounded-lg shadow-sm" disabled>
                        </div>

                        <div id="userInvTableContainer" class="overflow-x-auto border rounded-lg min-h-[300px] bg-white relative shadow-inner max-h-[60vh]">
                            <div class="absolute inset-0 flex items-center justify-center text-gray-400 italic pointer-events-none">
                                Seleccione un usuario para ver su inventario actual.
                            </div>
                        </div>

                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToDataMenuBtn" class="flex-1 py-3 bg-gray-400 text-white rounded-lg font-semibold hover:bg-gray-500 shadow-md">Volver</button>
                            <button id="downloadUserInvBtn" class="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hidden hover:bg-green-700 shadow-md flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Descargar Excel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const userSelector = document.getElementById('invUserSelector');
        const loadBtn = document.getElementById('loadUserInvBtn');
        const searchInput = document.getElementById('invSearchInput');
        const downloadBtn = document.getElementById('downloadUserInvBtn');
        const tableContainer = document.getElementById('userInvTableContainer');

        // Cargar lista de usuarios
        try {
            const usersSnap = await _getDocs(_collection(_db, "users"));
            userSelector.innerHTML = '<option value="">-- Elija un vendedor --</option>';
            usersSnap.forEach(doc => {
                const data = doc.data();
                userSelector.innerHTML += `<option value="${doc.id}">${data.name || data.email || doc.id} (${data.camion || 'Sin Camión'})</option>`;
            });
        } catch (e) {
            console.error("Error cargando usuarios:", e);
            userSelector.innerHTML = '<option value="">Error al cargar usuarios</option>';
        }

        loadBtn.addEventListener('click', async () => {
            const targetUserId = userSelector.value;
            if (!targetUserId) { _showModal('Aviso', 'Seleccione un usuario.'); return; }
            
            tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-teal-600 font-bold animate-pulse">Cargando inventario...</p></div>';
            searchInput.value = '';
            searchInput.disabled = true;
            downloadBtn.classList.add('hidden');

            try {
                const invRef = _collection(_db, `artifacts/${_appId}/users/${targetUserId}/inventario`);
                const snap = await _getDocs(invRef);
                
                if (snap.empty) {
                    tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-gray-500">Inventario vacío.</p></div>';
                    _tempUserInventory = [];
                    return;
                }

                _tempUserInventory = snap.docs.map(d => ({id: d.id, ...d.data()}));
                
                // Ordenar usando la función global (necesita await)
                const sortFunc = await getGlobalProductSortFunction();
                _tempUserInventory.sort(sortFunc);

                renderUserInventoryTable();
                
                searchInput.disabled = false;
                downloadBtn.classList.remove('hidden');
                
                // Configurar descarga
                downloadBtn.onclick = () => exportUserInventoryToExcel(userSelector.options[userSelector.selectedIndex].text);

            } catch (err) {
                console.error(err);
                tableContainer.innerHTML = `<div class="flex h-64 items-center justify-center"><p class="text-red-500">Error: ${err.message}</p></div>`;
            }
        });

        searchInput.addEventListener('input', () => renderUserInventoryTable());
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView);
    }

    async function renderUserInventoryTable() {
        const container = document.getElementById('userInvTableContainer');
        const searchTerm = document.getElementById('invSearchInput').value.toLowerCase();
        
        let filtered = _tempUserInventory;
        if (searchTerm) {
            filtered = filtered.filter(p => 
                (p.presentacion && p.presentacion.toLowerCase().includes(searchTerm)) ||
                (p.marca && p.marca.toLowerCase().includes(searchTerm)) ||
                (p.segmento && p.segmento.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">No se encontraron productos.</p>';
            return;
        }

        let html = `
            <table class="min-w-full text-sm text-left border-collapse">
                <thead class="bg-gray-200 text-gray-700 uppercase text-xs font-bold sticky top-0 shadow-sm z-10">
                    <tr>
                        <th class="p-3 border-b">Rubro</th>
                        <th class="p-3 border-b">Producto</th>
                        <th class="p-3 border-b">Marca</th>
                        <th class="p-3 border-b text-center">Stock Actual</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
        `;

        filtered.forEach(p => {
            const stockU = p.cantidadUnidades || 0;
            const displayQty = getDisplayQty(stockU, p);
            
            html += `
                <tr class="hover:bg-gray-50">
                    <td class="p-3 border-r font-medium text-gray-600 text-xs">${p.rubro || 'S/R'}</td>
                    <td class="p-3 border-r">
                        <div class="font-semibold text-gray-800">${p.presentacion}</div>
                        <div class="text-xs text-gray-500">${p.segmento || 'S/S'}</div>
                    </td>
                    <td class="p-3 border-r text-gray-600">${p.marca || 'S/M'}</td>
                    <td class="p-3 text-center font-bold text-blue-700 bg-blue-50" title="${stockU} Unidades Base">
                        ${displayQty.value} ${displayQty.unit}
                    </td>
                </tr>
            `;
        });
        container.innerHTML = html + '</tbody></table>';
    }

    function exportUserInventoryToExcel(userName) {
        if (typeof ExcelJS === 'undefined') { _showModal('Error', 'Librería ExcelJS no disponible.'); return; }

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Inventario Usuario');

            worksheet.columns = [
                { header: 'Rubro', key: 'rubro', width: 20 },
                { header: 'Segmento', key: 'segmento', width: 20 },
                { header: 'Marca', key: 'marca', width: 20 },
                { header: 'Producto', key: 'prod', width: 35 },
                { header: 'Stock Visual', key: 'visual', width: 15 },
                { header: 'Unidad', key: 'unit', width: 10 },
                { header: 'Stock Base (Unds)', key: 'base', width: 18 }
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00695C' } }; // Teal oscuro

            _tempUserInventory.forEach(p => {
                const disp = getDisplayQty(p.cantidadUnidades || 0, p);
                worksheet.addRow({
                    rubro: p.rubro,
                    segmento: p.segmento,
                    marca: p.marca,
                    prod: p.presentacion,
                    visual: disp.value,
                    unit: disp.unit,
                    base: p.cantidadUnidades || 0
                });
            });

            const fname = `Inventario_${userName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
            workbook.xlsx.writeBuffer().then(buf => {
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = fname;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            });
        } catch (e) { console.error(e); _showModal('Error', 'No se pudo exportar.'); }
    }

    // --- VISTA MAPA DE RUTAS (Funciones completas) ---
    function showClientMapView() {
        if (mapInstance) { mapInstance.remove(); mapInstance = null; } 
        if (_salesListenerUnsubscribe) { _salesListenerUnsubscribe(); }
        _floatingControls.classList.add('hidden');

        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold text-gray-800 mb-2 text-center">Mapa de Rutas</h1>
                <p class="text-center text-sm text-gray-600 mb-4">Verde: Atendido esta semana | Gris: Pendiente</p>
                <div class="relative mb-4"> <input type="text" id="map-search-input" placeholder="Buscar cliente..." class="w-full px-4 py-2 border rounded-lg"> <div id="map-search-results" class="absolute z-[1000] w-full bg-white border rounded-lg mt-1 max-h-60 overflow-y-auto hidden shadow-lg"></div> </div>
                <div id="client-map" class="w-full rounded-lg shadow-inner" style="height:65vh; border:1px solid #ccc; background-color:#e5e7eb;"> <p class="text-center text-gray-500 pt-10">Cargando mapa...</p> </div>
                <button id="backToDataMenuBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', showDataView); 
        loadAndDisplayMap();
    }

    async function loadAndDisplayMap() {
        const mapCont = document.getElementById('client-map'); if (!mapCont || typeof L === 'undefined') return;
        
        try {
            const cliRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`); 
            const cliSnaps = await _getDocs(cliRef); 
            const clients = cliSnaps.docs.map(d => ({id: d.id, ...d.data()})); 

            const cliCoords = clients.filter(c => {
                if(!c.coordenadas) return false;
                const cleanCoords = c.coordenadas.toString().replace(/['"()]/g, '').trim();
                const p = cleanCoords.split(',');
                if(p.length !== 2) return false;
                const lat = parseFloat(p[0]);
                const lon = parseFloat(p[1]);
                return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
            });

            if (cliCoords.length === 0) { mapCont.innerHTML = '<p class="text-gray-500">No hay clientes con coordenadas válidas.</p>'; return; }

            mapInstance = L.map('client-map').setView([7.77, -72.22], 13); 
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19 }).addTo(mapInstance);
            
            const greyIcon = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]}); 
            const greenIcon = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]});

            mapMarkers.clear(); 
            const mGroup=[];

            cliCoords.forEach(cli=>{
                try{
                    const cleanCoords = cli.coordenadas.toString().replace(/['"()]/g, '').trim();
                    const coords=cleanCoords.split(',').map(p=>parseFloat(p)); 
                    const hasCEP=cli.codigoCEP&&cli.codigoCEP.toLowerCase()!=='n/a'; 
                    const marker=L.marker(coords, {icon: greyIcon}).bindPopup(`<b>${cli.nombreComercial}</b><br><small>${cli.nombrePersonal||''}</small><br><small>Sector: ${cli.sector||'N/A'}</small>${hasCEP?`<br><b>CEP: ${cli.codigoCEP}</b>`:''}<br><a href="https://www.google.com/maps?q=${coords[0]},${coords[1]}" target="_blank" class="text-xs text-blue-600">Abrir en Google Maps</a>`); 
                    mGroup.push(marker); 
                    mapMarkers.set(cli.id, marker);
                } catch(e){}
            });

            if(mGroup.length > 0) { 
                const g = L.featureGroup(mGroup).addTo(mapInstance); 
                mapInstance.fitBounds(g.getBounds().pad(0.1)); 
            }
            
            setupMapSearch(cliCoords);

            const startOfWeek = getStartOfWeek(new Date());
            const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
            const q = _query(ventasRef, _where("fecha", ">=", startOfWeek));

            _salesListenerUnsubscribe = _onSnapshot(q, (snapshot) => {
                _soldClientIdsThisWeek.clear();
                snapshot.forEach(doc => {
                    const v = doc.data();
                    if(v.clienteId) _soldClientIdsThisWeek.add(v.clienteId);
                });
                
                mapMarkers.forEach((marker, clientId) => {
                    if (_soldClientIdsThisWeek.has(clientId)) {
                        marker.setIcon(greenIcon);
                    } else {
                        marker.setIcon(greyIcon);
                    }
                });
            }, (error) => {
                console.error("Error escuchando ventas mapa:", error);
            });

        } catch (error) { console.error("Error mapa:", error); }
    }

    function setupMapSearch(clientsWithCoords) {
        const sInp = document.getElementById('map-search-input'), resCont = document.getElementById('map-search-results'); if (!sInp || !resCont) return;
        sInp.addEventListener('input', () => { const sTerm = sInp.value.toLowerCase().trim(); if (sTerm.length<2){resCont.innerHTML=''; resCont.classList.add('hidden'); return;} const filtCli = clientsWithCoords.filter(cli => (cli.nombreComercial||'').toLowerCase().includes(sTerm) || (cli.nombrePersonal||'').toLowerCase().includes(sTerm) || (cli.codigoCEP&&cli.codigoCEP.toLowerCase().includes(sTerm))); if(filtCli.length===0){resCont.innerHTML='<div class="p-2 text-gray-500 text-sm">No encontrado.</div>'; resCont.classList.remove('hidden'); return;} resCont.innerHTML=filtCli.slice(0,10).map(cli=>`<div class="p-2 hover:bg-gray-100 cursor-pointer border-b" data-client-id="${cli.id}"><p class="font-semibold text-sm">${cli.nombreComercial}</p><p class="text-xs text-gray-600">${cli.nombrePersonal||''} ${cli.codigoCEP&&cli.codigoCEP!=='N/A'?`(${cli.codigoCEP})`:''}</p></div>`).join(''); resCont.classList.remove('hidden'); });
        resCont.addEventListener('click', (e) => { const target = e.target.closest('[data-client-id]'); if (target&&mapInstance){ const cliId=target.dataset.clientId; const marker=mapMarkers.get(cliId); if(marker){mapInstance.flyTo(marker.getLatLng(),17); marker.openPopup();} sInp.value=''; resCont.innerHTML=''; resCont.classList.add('hidden'); } });
        document.addEventListener('click', (ev)=>{ if(!resCont.contains(ev.target)&&ev.target!==sInp) resCont.classList.add('hidden'); });
    }

    // --- VISTA HISTÓRICO DE ATENCIÓN (Funciones completas) ---
    async function showAttentionHistoryView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Historial de Atención Semanal</h1>
                <p class="text-gray-600 text-sm mb-4 text-center">Reportes automáticos de clientes no atendidos (Lunes a Domingo).</p>
                <div id="history-list-container" class="overflow-y-auto max-h-96 space-y-2"> <p class="text-center text-gray-500">Cargando reportes...</p> </div>
                <button id="backToDataMenuBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', showDataView);
        
        try {
            const histRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/historial_atencion`);
            const q = _query(histRef, _orderBy("fechaGeneracion", "desc"));
            const snap = await _getDocs(q);
            
            const cont = document.getElementById('history-list-container');
            if(snap.empty) {
                cont.innerHTML = '<p class="text-center text-gray-500">No hay reportes generados aún.</p>';
                return;
            }
            
            cont.innerHTML = '';
            snap.forEach(doc => {
                const d = doc.data();
                const inicio = new Date(d.semanaInicio).toLocaleDateString();
                const fin = new Date(d.semanaFin).toLocaleDateString();
                const porcentaje = d.totalClientesBase > 0 ? Math.round((d.totalAtendidos / d.totalClientesBase) * 100) : 0;
                
                const item = document.createElement('div');
                item.className = "p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center transition shadow-sm";
                item.innerHTML = `
                    <div>
                        <h3 class="font-bold text-indigo-700">Semana: ${inicio} - ${fin}</h3>
                        <p class="text-xs text-gray-600">Base: ${d.totalClientesBase} | Atendidos: ${d.totalAtendidos} | <b>No Atendidos: ${d.totalNoAtendidos}</b></p>
                    </div>
                    <div class="text-right">
                        <span class="block text-xl font-bold ${porcentaje >= 50 ? 'text-green-600' : 'text-red-600'}">${porcentaje}%</span>
                        <span class="text-[10px] text-gray-500">Efectividad</span>
                    </div>
                `;
                item.onclick = () => showHistoryDetail(d);
                cont.appendChild(item);
            });

        } catch (e) {
            console.error(e);
            document.getElementById('history-list-container').innerHTML = '<p class="text-red-500 text-center">Error cargando historial.</p>';
        }
    }

    function showHistoryDetail(reportData) {
        const modalHTML = `
            <div class="text-left">
                <h3 class="text-xl font-bold mb-2">Reporte de No Atendidos</h3>
                <p class="text-sm text-gray-600 mb-4">Semana: ${new Date(reportData.semanaInicio).toLocaleDateString()} al ${new Date(reportData.semanaFin).toLocaleDateString()}</p>
                <div class="max-h-60 overflow-y-auto border rounded mb-4">
                    <table class="min-w-full text-xs">
                        <thead class="bg-gray-200 sticky top-0"><tr><th class="p-2 text-left">Cliente</th><th class="p-2 text-left">Sector</th><th class="p-2 text-left">Teléfono</th></tr></thead>
                        <tbody>
                            ${reportData.listaNoAtendidos.map(c => `
                                <tr class="border-b">
                                    <td class="p-2 font-medium">${c.nombreComercial}</td>
                                    <td class="p-2">${c.sector}</td>
                                    <td class="p-2">${c.telefono}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <button id="downloadHistoryBtn" class="w-full bg-green-600 text-white py-2 rounded shadow hover:bg-green-700">Descargar Excel</button>
            </div>
        `;
        _showModal('Detalle Histórico', modalHTML, null, 'Cerrar');
        document.getElementById('downloadHistoryBtn').onclick = () => exportHistoryToExcel(reportData);
    }

    function exportHistoryToExcel(data) {
        if (typeof ExcelJS === 'undefined') { _showModal('Error', 'ExcelJS no disponible.'); return; }
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('No Atendidos');
        ws.columns = [
            { header: 'Nombre Comercial', key: 'name', width: 30 },
            { header: 'Nombre Personal', key: 'personal', width: 25 },
            { header: 'Sector', key: 'sector', width: 20 },
            { header: 'Teléfono', key: 'phone', width: 15 }
        ];
        ws.getRow(1).font = { bold: true };
        data.listaNoAtendidos.forEach(c => {
            ws.addRow({ name: c.nombreComercial, personal: c.nombrePersonal, sector: c.sector, phone: c.telefono });
        });
        const fname = `NoAtendidos_${new Date(data.semanaInicio).toISOString().slice(0,10)}.xlsx`;
        wb.xlsx.writeBuffer().then(buf => {
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = fname;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });
    }

    // --- DISEÑO DE REPORTE (Funciones completas y editor) ---
    function createZoneEditor(idPrefix, label, settings) { const s = settings; return ` <div class="p-3 border rounded-lg bg-gray-50"> <h4 class="font-semibold text-gray-700">${label}</h4> <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 text-sm items-center"> <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" id="${idPrefix}_bold" ${s.bold ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>Negrita</span></label> <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" id="${idPrefix}_border" ${s.border ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>Bordes</span></label> <label class="flex items-center space-x-2"><span>Fondo:</span><input type="color" id="${idPrefix}_fillColor" value="${s.fillColor || '#FFFFFF'}" class="h-6 w-10 border cursor-pointer p-0"></label> <label class="flex items-center space-x-2"><span>Texto:</span><input type="color" id="${idPrefix}_fontColor" value="${s.fontColor || '#000000'}" class="h-6 w-10 border cursor-pointer p-0"></label> <label class="flex items-center space-x-2"><span>Tamaño:</span><input type="number" id="${idPrefix}_fontSize" value="${s.fontSize || 10}" min="8" max="16" class="h-7 w-12 border cursor-pointer p-1 text-sm rounded-md"></label> </div> </div>`; }
    function createWidthEditor(id, label, value) { return ` <div class="flex items-center justify-between"> <label for="${id}" class="text-sm font-medium text-gray-700">${label}:</label> <input type="number" id="${id}" value="${value}" min="5" max="50" step="1" class="w-20 px-2 py-1 border rounded-lg text-sm"> </div>`; }
    async function showReportDesignView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = ` <style> input[type="color"] { -webkit-appearance: none; -moz-appearance: none; appearance: none; background: none; border: 1px solid #ccc; padding: 0; } input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; } input[type="color"]::-webkit-color-swatch { border: none; border-radius: 2px; } input[type="color"]::-moz-color-swatch { border: none; border-radius: 2px; } .design-tab-btn { padding: 0.5rem 1rem; cursor: pointer; border: 1px solid transparent; border-bottom: none; margin-bottom: -1px; background-color: #f9fafb; color: #6b7280; border-radius: 0.375rem 0.375rem 0 0; } .design-tab-btn.active { background-color: #ffffff; color: #3b82f6; font-weight: 600; border-color: #e5e7eb; } </style> <div class="p-4 pt-8"> <div class="container mx-auto max-w-3xl"> <div class="bg-white/90 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl"> <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Diseño de Reporte de Cierre</h1> <div id="design-loader" class="text-center text-gray-500 p-4">Cargando configuración...</div> <form id="design-form-container" class="hidden text-left"> <div id="design-tabs" class="flex border-b border-gray-200 mb-4 overflow-x-auto text-sm"> <button type="button" class="design-tab-btn active" data-tab="general">General</button> <button type="button" class="design-tab-btn" data-tab="rubro">Hoja Rubros</button> <button type="button" class="design-tab-btn" data-tab="vacios">Hoja Vacíos</button> <button type="button" class="design-tab-btn" data-tab="totales">Hoja Totales</button> </div> <div id="design-tab-content" class="space-y-6"> <div id="tab-content-general" class="space-y-4"> <h3 class="text-lg font-semibold border-b pb-2 mt-4">Visibilidad de Secciones</h3> <div class="space-y-2 mt-4"> <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer"> <input type="checkbox" id="chk_showCargaInicial" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span>Mostrar fila "CARGA INICIAL"</span> </label> <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer"> <input type="checkbox" id="chk_showCargaRestante" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span>Mostrar fila "CARGA RESTANTE"</span> </label> <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer"> <input type="checkbox" id="chk_showVaciosSheet" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span>Incluir hoja "Reporte Vacíos"</span> </label> <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer"> <input type="checkbox" id="chk_showClienteTotalSheet" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span>Incluir hoja "Total Por Cliente"</span> </label> </div> </div> <div id="tab-content-rubro" class="space-y-6 hidden"> <h3 class="text-lg font-semibold border-b pb-2">Ancho de Columnas</h3> <div id="rubro-widths-container" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm"></div> <h3 class="text-lg font-semibold border-b pb-2 mt-4">Estilos de Zonas</h3> <div id="style-zones-container" class="space-y-3 mt-4"></div> </div> <div id="tab-content-vacios" class="space-y-6 hidden"> <h3 class="text-lg font-semibold border-b pb-2">Ancho de Columnas</h3> <div id="vacios-widths-container" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm"></div> <h3 class="text-lg font-semibold border-b pb-2 mt-4">Estilos de Zonas</h3> <div id="vacios-styles-container" class="space-y-3 mt-4"></div> </div> <div id="tab-content-totales" class="space-y-6 hidden"> <h3 class="text-lg font-semibold border-b pb-2">Ancho de Columnas</h3> <div id="totales-widths-container" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm"></div> <h3 class="text-lg font-semibold border-b pb-2 mt-4">Estilos de Zonas</h3> <div id="totales-styles-container" class="space-y-3 mt-4"></div> </div> </div> <div class="flex flex-col sm:flex-row gap-4 pt-6 mt-6 border-t"> <button type="button" id="saveDesignBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Diseño</button> <button type="button" id="backToDataMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button> </div> </form> </div> </div> </div> `;
        document.getElementById('backToDataMenuBtn').addEventListener('click', showDataView); document.getElementById('saveDesignBtn').addEventListener('click', handleSaveReportDesign);
        const tabsContainer = document.getElementById('design-tabs'); const tabContents = document.querySelectorAll('#design-tab-content > div');
        tabsContainer.addEventListener('click', (e) => { const clickedTab = e.target.closest('.design-tab-btn'); if (!clickedTab) return; const tabId = clickedTab.dataset.tab; tabsContainer.querySelectorAll('.design-tab-btn').forEach(btn => btn.classList.remove('active')); clickedTab.classList.add('active'); tabContents.forEach(content => content.id === `tab-content-${tabId}` ? content.classList.remove('hidden') : content.classList.add('hidden')); });
        try { const docRef = _doc(_db, REPORTE_DESIGN_CONFIG_PATH); const docSnap = await _getDoc(docRef); let cur = JSON.parse(JSON.stringify(DEFAULT_REPORTE_SETTINGS)); if (docSnap.exists()) { const sav = docSnap.data(); cur = { ...cur, ...sav }; cur.styles = { ...DEFAULT_REPORTE_SETTINGS.styles, ...(sav.styles || {}) }; cur.columnWidths = { ...DEFAULT_REPORTE_SETTINGS.columnWidths, ...(sav.columnWidths || {}) }; } document.getElementById('chk_showCargaInicial').checked = cur.showCargaInicial; document.getElementById('chk_showCargaRestante').checked = cur.showCargaRestante; document.getElementById('chk_showVaciosSheet').checked = cur.showVaciosSheet; document.getElementById('chk_showClienteTotalSheet').checked = cur.showClienteTotalSheet;
            const s = cur.styles; const w = cur.columnWidths;
            document.getElementById('style-zones-container').innerHTML = ` ${createZoneEditor('headerInfo', 'Info (Fecha/Usuario)', s.headerInfo)} ${createZoneEditor('headerProducts', 'Cabecera Productos', s.headerProducts)} ${createZoneEditor('rowCargaInicial', 'Fila "CARGA INICIAL"', s.rowCargaInicial)} ${createZoneEditor('rowDataClients', 'Filas Clientes (Vacías)', s.rowDataClients)} ${createZoneEditor('rowDataClientsSale', 'Filas Clientes (Venta)', s.rowDataClientsSale)} ${createZoneEditor('rowDataClientsObsequio', 'Filas Clientes (Obsequio)', s.rowDataClientsObsequio)} ${createZoneEditor('rowCargaRestante', 'Fila "CARGA RESTANTE"', s.rowCargaRestante)} ${createZoneEditor('rowTotals', 'Fila "TOTALES"', s.rowTotals)} `;
            document.getElementById('rubro-widths-container').innerHTML = ` ${createWidthEditor('width_col_A_LabelsClientes', 'Col A (Clientes)', w.col_A_LabelsClientes)} ${createWidthEditor('width_products', 'Cols Producto', w.products)} ${createWidthEditor('width_subtotal', 'Col Sub Total', w.subtotal)} `;
            document.getElementById('vacios-widths-container').innerHTML = ` ${createWidthEditor('width_vaciosCliente', 'Cliente', w.vaciosCliente)} ${createWidthEditor('width_vaciosTipo', 'Tipo Vacío', w.vaciosTipo)} ${createWidthEditor('width_vaciosQty', 'Cantidades', w.vaciosQty)} `;
            document.getElementById('vacios-styles-container').innerHTML = ` ${createZoneEditor('vaciosHeader', 'Cabecera Vacíos', s.vaciosHeader)} ${createZoneEditor('vaciosData', 'Filas Vacíos', s.vaciosData)} `;
            document.getElementById('totales-widths-container').innerHTML = ` ${createWidthEditor('width_totalCliente', 'Cliente', w.totalCliente)} ${createWidthEditor('width_totalClienteValor', 'Gasto Total', w.totalClienteValor)} `;
            document.getElementById('totales-styles-container').innerHTML = ` ${createZoneEditor('totalesHeader', 'Cabecera Totales', s.totalesHeader)} ${createZoneEditor('totalesData', 'Filas Clientes Totales', s.totalesData)} ${createZoneEditor('totalesTotalRow', 'Fila "GRAN TOTAL"', s.totalesTotalRow)} `;
            document.getElementById('design-loader').classList.add('hidden'); document.getElementById('design-form-container').classList.remove('hidden');
        } catch (error) { console.error("Error cargando diseño:", error); document.getElementById('design-loader').textContent = 'Error al cargar la configuración.'; }
    }
    function readZoneEditor(idPrefix) { const b = document.getElementById(`${idPrefix}_bold`); const r = document.getElementById(`${idPrefix}_border`); const f = document.getElementById(`${idPrefix}_fillColor`); const t = document.getElementById(`${idPrefix}_fontColor`); const s = document.getElementById(`${idPrefix}_fontSize`); const d = DEFAULT_REPORTE_SETTINGS.styles[idPrefix] || {}; return { bold: b ? b.checked : (d.bold || false), border: r ? r.checked : (d.border || false), fillColor: f ? f.value : (d.fillColor || '#FFFFFF'), fontColor: t ? t.value : (d.fontColor || '#000000'), fontSize: s ? (parseInt(s.value, 10) || 10) : (d.fontSize || 10) }; }
    function readWidthInputs() { const d = DEFAULT_REPORTE_SETTINGS.columnWidths; const v = (id, def) => parseInt(document.getElementById(id)?.value, 10) || def; return { col_A_LabelsClientes: v('width_col_A_LabelsClientes', d.col_A_LabelsClientes), products: v('width_products', d.products), subtotal: v('width_subtotal', d.subtotal), vaciosCliente: v('width_vaciosCliente', d.vaciosCliente), vaciosTipo: v('width_vaciosTipo', d.vaciosTipo), vaciosQty: v('width_vaciosQty', d.vaciosQty), totalCliente: v('width_totalCliente', d.totalCliente), totalClienteValor: v('width_totalClienteValor', d.totalClienteValor) }; }
    async function handleSaveReportDesign() {
        _showModal('Progreso', 'Guardando diseño...');
        const newSettings = { showCargaInicial: document.getElementById('chk_showCargaInicial').checked, showCargaRestante: document.getElementById('chk_showCargaRestante').checked, showVaciosSheet: document.getElementById('chk_showVaciosSheet').checked, showClienteTotalSheet: document.getElementById('chk_showClienteTotalSheet').checked, styles: { headerInfo: readZoneEditor('headerInfo'), headerProducts: readZoneEditor('headerProducts'), rowCargaInicial: readZoneEditor('rowCargaInicial'), rowDataClients: readZoneEditor('rowDataClients'), rowDataClientsSale: readZoneEditor('rowDataClientsSale'), rowDataClientsObsequio: readZoneEditor('rowDataClientsObsequio'), rowCargaRestante: readZoneEditor('rowCargaRestante'), rowTotals: readZoneEditor('rowTotals'), vaciosHeader: readZoneEditor('vaciosHeader'), vaciosData: readZoneEditor('vaciosData'), totalesHeader: readZoneEditor('totalesHeader'), totalesData: readZoneEditor('totalesData'), totalesTotalRow: readZoneEditor('totalesTotalRow') }, columnWidths: readWidthInputs() };
        try { await _setDoc(_doc(_db, REPORTE_DESIGN_CONFIG_PATH), newSettings); _showModal('Éxito', 'Diseño guardado correctamente.', showDataView); } catch (error) { console.error("Error guardando diseño:", error); _showModal('Error', `No se pudo guardar: ${error.message}`); }
    }

    // --- FUNCIONES EXISTENTES (CIERRES, AUDITORÍA) MANTENIDAS ---
    async function showClosingDataView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Cierres de Vendedores</h1>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg items-end">
                    <div> <label for="userFilter" class="block text-sm font-medium">Vendedor:</label> <select id="userFilter" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm text-sm"> <option value="">Todos</option> </select> </div>
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
        try {
            const usersRef = _collection(_db, "users");
            const snapshot = await _getDocs(usersRef);
            snapshot.docs.forEach(doc => {
                const user = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = `${user.nombre || ''} ${user.apellido || user.email} (${user.camion || 'N/A'})`;
                userFilterSelect.appendChild(option);
            });
        } catch (error) { console.error("Error cargando usuarios filtro:", error); }
    }

    async function handleSearchClosings() {
        const container = document.getElementById('cierres-list-container');
        container.innerHTML = `<p class="text-center text-gray-500">Buscando...</p>`;
        const selectedUserId = document.getElementById('userFilter').value;
        const fechaDesdeStr = document.getElementById('fechaDesde').value;
        const fechaHastaStr = document.getElementById('fechaHasta').value;
        if (!fechaDesdeStr || !fechaHastaStr) {
            _showModal('Error', 'Seleccione ambas fechas.');
            container.innerHTML = `<p class="text-center text-gray-500">Seleccione rango.</p>`; return;
        }
        const fechaDesde = new Date(fechaDesdeStr + 'T00:00:00Z');
        const fechaHasta = new Date(fechaHastaStr + 'T23:59:59Z');
        try {
            // CORRECCIÓN: Leer desde la colección de cierres del usuario si se selecciona uno, o buscar en todos si es admin
            // Nota: En esta estructura, los cierres están en /users/{uid}/cierres. 
            // Si el admin quiere ver todos, tendría que iterar usuarios (costoso) o usar una colección global duplicada.
            // Asumiremos que el selector de usuario es OBLIGATORIO o que existe una colección global (que no existe según reglas).
            // Para simplificar y cumplir reglas: Se DEBE seleccionar un usuario para ver sus cierres.
            
            if (!selectedUserId) {
                 _showModal('Aviso', 'Por favor seleccione un vendedor para ver sus cierres (Requerido por estructura de base de datos).');
                 container.innerHTML = `<p class="text-center text-gray-500">Seleccione un vendedor.</p>`;
                 return;
            }

            const closingsRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/cierres`);
            let q = _query(closingsRef, _where("fecha", ">=", fechaDesde), _where("fecha", "<=", fechaHasta));
            const snapshot = await _getDocs(q);
            let closings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            window.tempClosingsData = closings; 
            renderClosingsList(closings);
        } catch (error) {
            console.error("Error buscando cierres:", error);
            container.innerHTML = `<p class="text-center text-red-500">Error al buscar: ${error.message}</p>`;
        }
    }

    function renderClosingsList(closings) {
        const container = document.getElementById('cierres-list-container');
        if (closings.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">No se encontraron cierres.</p>`; return;
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
            const vendedor = cierre.vendedorInfo || {};
            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-3 border-b">${cierre.fecha.toDate().toLocaleDateString('es-ES')}</td>
                    <td class="py-2 px-3 border-b">${vendedor.nombre || ''} ${vendedor.apellido || ''}</td>
                    <td class="py-2 px-3 border-b">${vendedor.camion || 'N/A'}</td>
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
        const vaciosMovementsPorTipo = {};
        const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
        
        // Mapa de carga inicial para búsqueda rápida
        const initialStockMap = new Map();
        if (cargaInicialInventario && Array.isArray(cargaInicialInventario)) {
            cargaInicialInventario.forEach(item => {
                initialStockMap.set(item.id, item.cantidadUnidades || 0);
            });
        }

        // Obtener inventario actual para metadatos (Rubro, Marca, etc.) si es necesario
        let inventarioMap = new Map();
        try {
            const invSn = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${userIdForInventario}/inventario`));
            inventarioMap = new Map(invSn.docs.map(d => [d.id, d.data()]));
        } catch(e) { console.warn("No se pudo cargar inventario actual para metadatos", e); }

        // Si no hay inventario actual, usar carga inicial como fallback para metadatos
        if (inventarioMap.size === 0 && cargaInicialInventario.length > 0) {
            cargaInicialInventario.forEach(item => inventarioMap.set(item.id, item));
        }

        const all = [...ventas.map(v=>({t:'v',d:v})), ...(obsequios||[]).map(o=>({t:'o',d:o}))];
        
        for (const item of all) {
            const cName = item.d.clienteNombre || 'Cliente Desconocido';
            if (!clientData[cName]) clientData[cName] = { products: {}, totalValue: 0 };
            if (!vaciosMovementsPorTipo[cName]) { vaciosMovementsPorTipo[cName] = {}; TIPOS_VACIO_GLOBAL.forEach(t => vaciosMovementsPorTipo[cName][t] = {e:0, d:0}); }
            
            if (item.t === 'v') {
                const v = item.d;
                clientData[cName].totalValue += (v.total||0);
                clientTotals[cName] = (clientTotals[cName]||0) + (v.total||0);
                grandTotalValue += (v.total||0);
                
                // Vacíos
                const vacDev = v.vaciosDevueltosPorTipo || {};
                for (const tipo in vacDev) { 
                    if(vaciosMovementsPorTipo[cName][tipo]) {
                        vaciosMovementsPorTipo[cName][tipo].devueltos += (vacDev[tipo] || 0); 
                    }
                }

                // Productos
                (v.productos || []).forEach(p => {
                    const pi = inventarioMap.get(p.id) || p;
                    const pid = p.id;
                    
                    // Guardar producto en mapa global si es nuevo
                    if (!allProductsMap.has(pid)) {
                        allProductsMap.set(pid, { 
                            ...pi, 
                            id: pid, 
                            presentacion: p.presentacion,
                            // Aseguramos que tenga datos de rubro/marca aunque venga de venta
                            rubro: pi.rubro || p.rubro || 'SIN RUBRO',
                            segmento: pi.segmento || p.segmento || '',
                            marca: pi.marca || p.marca || '',
                            initialStock: initialStockMap.get(pid) || 0 
                        });
                    }
                    
                    let q = 0;
                    if (p.cantidadVendida) {
                        const uc = p.unidadesPorCaja||1; const up = p.unidadesPorPaquete||1;
                        q = (p.cantidadVendida.cj||0)*uc + (p.cantidadVendida.paq||0)*up + (p.cantidadVendida.und||0);
                    } else if (p.totalUnidadesVendidas) {
                         q = p.totalUnidadesVendidas;
                    }
                    
                    clientData[cName].products[pid] = (clientData[cName].products[pid]||0) + q;

                    // Vacíos entregados
                    if (pi.manejaVacios && pi.tipoVacio) {
                        const tV = pi.tipoVacio;
                        const cjEnt = p.cantidadVendida?.cj || 0;
                        if(vaciosMovementsPorTipo[cName][tV]) {
                             vaciosMovementsPorTipo[cName][tV].entregados += cjEnt;
                        }
                    }
                });
            } else {
                // Obsequios
                const o = item.d;
                const pi = inventarioMap.get(o.productoId) || { presentacion: o.productoNombre, unidadesPorCaja: 1, rubro: 'OBSEQUIOS', marca: 'GENERICO', segmento: 'GENERICO' };
                const pid = o.productoId;
                
                if (!allProductsMap.has(pid)) {
                    allProductsMap.set(pid, { 
                        ...pi, 
                        id: pid, 
                        presentacion: o.productoNombre,
                        initialStock: initialStockMap.get(pid) || 0
                    });
                }
                
                const q = (o.cantidadCajas||0) * (pi.unidadesPorCaja||1);
                clientData[cName].products[pid] = (clientData[cName].products[pid]||0) + q;

                 // Vacíos entregados/recibidos en obsequio
                if (pi.manejaVacios && pi.tipoVacio) {
                     if(vaciosMovementsPorTipo[cName][pi.tipoVacio]) {
                        vaciosMovementsPorTipo[cName][pi.tipoVacio].entregados += (o.cantidadCajas||0);
                     }
                }
                if (o.vaciosRecibidos > 0 && o.tipoVacio) {
                    if(vaciosMovementsPorTipo[cName][o.tipoVacio]) {
                        vaciosMovementsPorTipo[cName][o.tipoVacio].devueltos += o.vaciosRecibidos;
                    }
                }
            }
        }
        
        const sortedClients = Object.keys(clientData).sort();
        const finalProductOrder = Array.from(allProductsMap.values());
        
        // Ordenar productos
        if (typeof window.getGlobalProductSortFunction === 'function') {
             try { finalProductOrder.sort(await window.getGlobalProductSortFunction()); } catch(e){}
        } else {
             finalProductOrder.sort((a,b) => (a.rubro||'').localeCompare(b.rubro||'') || (a.presentacion||'').localeCompare(b.presentacion||''));
        }
        
        return { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo, initialStockMap };
    }

    async function showClosingDetail(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'No se cargaron detalles.'); return; }
        _showModal('Progreso', 'Generando reporte detallado...');
        try {
            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo } = 
                await _processSalesDataForModal(closingData.ventas || [], closingData.obsequios || [], closingData.cargaInicialInventario || [], closingData.vendedorInfo.userId);
            
            let headerHTML = `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">SEGMENTO</th>`;
            finalProductOrder.forEach(p => { headerHTML += `<th class="p-1 border whitespace-nowrap text-xs">${p.segmento || 'S/S'}</th>`; });
            headerHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200"></th></tr>`;
            
            headerHTML += `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">MARCA</th>`;
            finalProductOrder.forEach(p => { headerHTML += `<th class="p-1 border whitespace-nowrap text-xs">${p.marca || 'S/M'}</th>`; });
            headerHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200"></th></tr>`;

            headerHTML += `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">PRESENTACION</th>`;
            finalProductOrder.forEach(p => { headerHTML += `<th class="p-1 border whitespace-nowrap text-xs">${p.presentacion || 'S/P'}</th>`; });
            headerHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200">Sub Total</th></tr>`;
            
            headerHTML += `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">PRECIO</th>`;
            finalProductOrder.forEach(p => { 
                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                let displayPrecio = '$0.00';
                if (p.ventaPor?.cj) displayPrecio = `$${(precios.cj || 0).toFixed(2)}`;
                else if (p.ventaPor?.paq) displayPrecio = `$${(precios.paq || 0).toFixed(2)}`;
                else displayPrecio = `$${(precios.und || 0).toFixed(2)}`;
                headerHTML += `<th class="p-1 border whitespace-nowrap text-xs">${displayPrecio}</th>`; 
            });
            headerHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200"></th></tr>`;

            let bodyHTML = ''; 
            sortedClients.forEach(cli => { 
                const cCli = clientData[cli];
                const esSoloObsequio = !clientTotals.hasOwnProperty(cli) && cCli.totalValue === 0 && Object.values(cCli.products).some(q => q > 0);
                const rowClass = esSoloObsequio ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-blue-50';
                const clientNameDisplay = esSoloObsequio ? `${cli} (OBSEQUIO)` : cli;
                bodyHTML += `<tr class="${rowClass}"><td class="p-1 border font-medium bg-white sticky left-0 z-10">${clientNameDisplay}</td>`; 
                finalProductOrder.forEach(p => { 
                    const qU=cCli.products[p.id]||0; const qtyDisplay = getDisplayQty(qU, p);
                    let dQ = (qU > 0) ? `${qtyDisplay.value}` : '0';
                    const cellClass = (qU > 0 && esSoloObsequio) ? 'font-bold' : '';
                    if (qU > 0 && esSoloObsequio) dQ += ` ${qtyDisplay.unit}`;
                    bodyHTML+=`<td class="p-1 border text-center ${cellClass}">${dQ}</td>`; 
                }); 
                bodyHTML+=`<td class="p-1 border text-right font-semibold bg-white sticky right-0 z-10">$${cCli.totalValue.toFixed(2)}</td></tr>`; 
            });
            let footerHTML = '<tr class="bg-gray-200 font-bold"><td class="p-1 border sticky left-0 z-10">TOTALES</td>'; 
            finalProductOrder.forEach(p => { 
                let tQ=0; sortedClients.forEach(cli => tQ+=clientData[cli].products[p.id]||0); 
                const qtyDisplay = getDisplayQty(tQ, p);
                let dT = (tQ > 0) ? `${qtyDisplay.value} ${qtyDisplay.unit}` : '';
                footerHTML+=`<td class="p-1 border text-center">${dT}</td>`; 
            }); 
            footerHTML+=`<td class="p-1 border text-right sticky right-0 z-10">$${grandTotalValue.toFixed(2)}</td></tr>`;
            
            let vHTML = ''; 
            const cliVacios = Object.keys(vaciosMovementsPorTipo).filter(cli => TIPOS_VACIO_GLOBAL.some(t => (vaciosMovementsPorTipo[cli][t]?.entregados || 0) > 0 || (vaciosMovementsPorTipo[cli][t]?.devueltos || 0) > 0)).sort(); 
            if(cliVacios.length > 0){ 
                vHTML=`<h3 class="text-xl my-6">Reporte Vacíos</h3><div class="overflow-auto border"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Entregados</th><th>Devueltos</th><th>Neto</th></tr></thead><tbody>`; 
                cliVacios.forEach(cli => {
                    const movs = vaciosMovementsPorTipo[cli]; 
                    const clienteTuvoVenta = clientTotals.hasOwnProperty(cli);
                    const clientNameDisplay = clienteTuvoVenta ? cli : `${cli} (OBSEQUIO)`;
                    TIPOS_VACIO_GLOBAL.forEach(t => {
                        const mov = movs[t] || {entregados:0, devueltos:0}; 
                        if(mov.entregados > 0 || mov.devueltos > 0){
                            const neto = mov.entregados - mov.devueltos; 
                            const nClass = neto > 0 ? 'text-red-600' : (neto < 0 ? 'text-green-600' : ''); 
                            vHTML+=`<tr><td>${clientNameDisplay}</td><td>${t}</td><td>${mov.entregados}</td><td>${mov.devueltos}</td><td class="${nClass}">${neto > 0 ? `+${neto}` : neto}</td></tr>`;
                        }
                    });
                }); 
                vHTML+='</tbody></table></div>';
            }
            
            const vendedor = closingData.vendedorInfo || {};
            const reportHTML = `<div class="text-left max-h-[80vh] overflow-auto"> <div class="mb-4"> <p><strong>Vendedor:</strong> ${vendedor.nombre||''} ${vendedor.apellido||''}</p> <p><strong>Camión:</strong> ${vendedor.camion||'N/A'}</p> <p><strong>Fecha:</strong> ${closingData.fecha.toDate().toLocaleString('es-ES')}</p> </div> <h3 class="text-xl mb-4">Reporte Cierre</h3> <div class="overflow-auto border" style="max-height: 40vh;"> <table class="min-w-full bg-white text-xs"> <thead class="bg-gray-200">${headerHTML}</thead> <tbody>${bodyHTML}</tbody> <tfoot>${footerHTML}</tfoot> </table> </div> ${vHTML} </div>`;
            _showModal(`Detalle Cierre`, reportHTML, null, 'Cerrar');
        } catch (error) { console.error("Error generando detalle:", error); _showModal('Error', `No se pudo generar: ${error.message}`); }
    }

    // --- RECARGAS (ADMIN) - MODIFICADO CON BOTÓN DE DESCARGA INDIVIDUAL ---
    async function showRecargasReportView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; }
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-4xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Auditoría de Recargas de Productos</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                    <div> <label class="block text-sm font-medium text-gray-700 mb-1">Seleccionar Vendedor:</label> <select id="userSelector" class="w-full p-2 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500"> <option value="">Cargando lista...</option> </select> </div>
                    <div class="flex items-end"> <button id="loadRecargasBtn" class="w-full bg-teal-600 text-white p-2 rounded-lg font-bold hover:bg-teal-700 shadow-md transition-all"> Consultar Actividad </button> </div>
                </div>
                <div id="recargasTableContainer" class="overflow-x-auto border rounded-lg min-h-[300px] bg-white relative shadow-inner"> <div class="absolute inset-0 flex items-center justify-center text-gray-400 italic pointer-events-none"> Seleccione un usuario para auditar sus registros. </div> </div>
                <div class="mt-6 flex flex-col sm:flex-row gap-4"> <button id="backToDataMenuBtn" class="flex-1 py-3 bg-gray-400 text-white rounded-lg font-semibold hover:bg-gray-500 shadow-md">Volver</button> </div>
            </div> </div> </div>
        `;
        const userSelector = document.getElementById('userSelector'); 
        const loadBtn = document.getElementById('loadRecargasBtn'); 
        const tableContainer = document.getElementById('recargasTableContainer');
        
        try { 
            const usersSnap = await _getDocs(_collection(_db, "users")); 
            userSelector.innerHTML = '<option value="">-- Elija un vendedor --</option>'; 
            usersSnap.forEach(doc => { 
                const data = doc.data(); 
                userSelector.innerHTML += `<option value="${doc.id}">${data.name || data.email || doc.id} (${data.camion || 'Sin Camión'})</option>`; 
            }); 
        } catch (e) { console.error("Error cargando usuarios:", e); }
        
        loadBtn.addEventListener('click', async () => {
            const selectedUserId = userSelector.value; 
            if (!selectedUserId) { _showModal('Aviso', 'Por favor seleccione un vendedor de la lista.'); return; }
            tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-teal-600 font-bold animate-pulse">Consultando registros en Firebase...</p></div>';
            try { 
                const recargasRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/recargas`); 
                const snap = await _getDocs(recargasRef); 
                if (snap.empty) { tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-gray-500">Este usuario no tiene registros de recarga.</p></div>'; return; } 
                let recargasData = []; 
                snap.forEach(doc => recargasData.push({ id: doc.id, ...doc.data() })); 
                recargasData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); 
                renderRecargasTable(recargasData, tableContainer, userSelector.options[userSelector.selectedIndex].text); 
            } catch (error) { console.error(error); tableContainer.innerHTML = `<div class="flex h-64 items-center justify-center"><p class="text-red-500 font-bold">Error: ${error.message}</p></div>`; }
        });
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView);
    }

    function renderRecargasTable(data, container, userName) {
        window.tempRecargasData = data; // Guardar referencia global temporal
        let html = ` <table class="min-w-full text-sm text-left border-collapse"> <thead class="bg-gray-100 text-gray-700 uppercase text-xs font-bold sticky top-0 shadow-sm"> <tr> <th class="p-3 border-b">Fecha / Hora</th> <th class="p-3 border-b text-center">Total Productos</th> <th class="p-3 border-b text-center">Acciones</th> </tr> </thead> <tbody class="divide-y divide-gray-100"> `;
        data.forEach(r => { 
            const fecha = new Date(r.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); 
            // Escapar comillas en el nombre de usuario para el onclick
            const safeUserName = userName.replace(/'/g, "\\'");
            html += ` 
                <tr class="hover:bg-gray-50 transition-colors duration-150"> 
                    <td class="p-3 border-r font-medium text-gray-600 whitespace-nowrap align-top">${fecha}</td> 
                    <td class="p-3 border-r text-center font-bold text-teal-600 align-top">${r.totalProductos}</td> 
                    <td class="p-3 text-center align-top">
                        <button onclick="window.dataModule.downloadRecargaExcel('${r.id}', '${safeUserName}')" 
                                class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-xs font-bold flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Descargar Archivo
                        </button>
                    </td> 
                </tr> `; 
        });
        container.innerHTML = html + '</tbody></table>';
    }

    async function downloadRecargaExcel(recargaId, userName) {
        const recarga = window.tempRecargasData?.find(r => r.id === recargaId);
        if(!recarga) { _showModal('Error', 'Datos no encontrados.'); return; }
        
        _showModal('Progreso', 'Obteniendo datos de inventario para organizar el reporte...');
        try {
            await exportSingleRecargaToExcel(recarga, userName);
            // Cerrar modal de progreso si sigue abierto
            const m = document.getElementById('modalContainer');
            if(m && !m.classList.contains('hidden') && m.querySelector('h3')?.textContent.startsWith('Progreso')) {
                m.classList.add('hidden');
            }
        } catch(e) {
            console.error(e);
            _showModal('Error', 'No se pudo generar el Excel: ' + e.message);
        }
    }

    async function exportSingleRecargaToExcel(recarga, userName) {
        if (typeof ExcelJS === 'undefined') { throw new Error('Librería ExcelJS no disponible.'); }
        
        // Obtener ordenamiento del ADMIN
        const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
        let segmentOrderMap = new Map();
        let marcaOrderMap = new Map();
        try {
            const segSnap = await _getDocs(segmentosRef);
            segSnap.forEach(doc => {
                const d = doc.data();
                if (d.name) {
                    segmentOrderMap.set(d.name, d.orden ?? 9999);
                    if (d.marcaOrder && Array.isArray(d.marcaOrder)) {
                        const mMap = new Map();
                        d.marcaOrder.forEach((m, i) => mMap.set(m, i));
                        marcaOrderMap.set(d.name, mMap);
                    }
                }
            });
        } catch (e) { console.warn("No se pudo obtener config orden admin:", e); }

        // Obtener metadatos inventario vendedor
        const userIdVendedor = recarga.usuarioId;
        const productMetadata = new Map();
        if (userIdVendedor) {
            try {
                const invRef = _collection(_db, `artifacts/${_appId}/users/${userIdVendedor}/inventario`);
                const invSnap = await _getDocs(invRef);
                invSnap.forEach(doc => {
                    const d = doc.data();
                    productMetadata.set(doc.id, { rubro: d.rubro || 'OTROS', segmento: d.segmento || 'OTROS', marca: d.marca || 'OTROS', presentacion: d.presentacion || '' });
                });
            } catch(e) { console.warn("No se pudo obtener inventario vendedor:", e); }
        }

        // Enriquecer y ordenar
        const enhancedDetalles = recarga.detalles.map(d => {
            const meta = productMetadata.get(d.productoId) || { rubro: 'PRODUCTOS ELIMINADOS', segmento: 'ZZ', marca: 'ZZ', presentacion: d.presentacion };
            return { ...d, rubro: meta.rubro, segmento: meta.segmento, marca: meta.marca, presentacionReal: meta.presentacion, id: d.productoId };
        });

        enhancedDetalles.sort((a, b) => {
            if (a.rubro !== b.rubro) return (a.rubro || '').localeCompare(b.rubro || '');
            const segOrderA = segmentOrderMap.get(a.segmento) ?? 9999;
            const segOrderB = segmentOrderMap.get(b.segmento) ?? 9999;
            if (segOrderA !== segOrderB) return segOrderA - segOrderB;
            if ((a.segmento||'') !== (b.segmento||'')) return (a.segmento||'').localeCompare(b.segmento||'');
            const mOrderMap = marcaOrderMap.get(a.segmento);
            const mOrderA = mOrderMap?.get(a.marca) ?? 9999;
            const mOrderB = mOrderMap?.get(b.marca) ?? 9999;
            if (mOrderA !== mOrderB) return mOrderA - mOrderB;
            if ((a.marca||'') !== (b.marca||'')) return (a.marca||'').localeCompare(b.marca||'');
            return (a.presentacion||'').localeCompare(b.presentacion||'');
        });

        // Agrupar por Rubro
        const groupedByRubro = {};
        const rubroOrderList = [];
        enhancedDetalles.forEach(d => {
            const r = d.rubro || 'OTROS';
            if (!groupedByRubro[r]) { groupedByRubro[r] = []; rubroOrderList.push(r); }
            groupedByRubro[r].push(d);
        });

        // Generar Excel
        const workbook = new ExcelJS.Workbook(); 
        const worksheet = workbook.addWorksheet('Detalle Recarga'); 
        
        const headerInfoStyle = { font: { bold: true, size: 10 }, alignment: { horizontal: 'left' } };
        const tableHeaderStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00695C' } }, alignment: { horizontal: 'center', vertical: 'middle' } };
        const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        const rubroHeaderStyle = { font: { bold: true, size: 11, color: { argb: 'FF000000' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2F1' } }, alignment: { horizontal: 'left', vertical: 'middle' }, border: borderStyle };

        const fechaStr = new Date(recarga.fecha).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
        
        worksheet.mergeCells('A1:E1'); worksheet.getCell('A1').value = `REPORTE DE RECARGA DE INVENTARIO`; worksheet.getCell('A1').font = { bold: true, size: 14 }; worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.getCell('A3').value = 'USUARIO:'; worksheet.getCell('B3').value = userName.toUpperCase(); worksheet.getCell('A3').font = headerInfoStyle.font;
        worksheet.getCell('A4').value = 'FECHA:'; worksheet.getCell('B4').value = fechaStr; worksheet.getCell('A4').font = headerInfoStyle.font;
        worksheet.getCell('A5').value = 'ID TRANSACCIÓN:'; worksheet.getCell('B5').value = recarga.id; worksheet.getCell('A5').font = headerInfoStyle.font;

        worksheet.getColumn(1).width = 50; 
        worksheet.getColumn(2).width = 20; 
        worksheet.getColumn(3).width = 25; 
        worksheet.getColumn(4).width = 20; 
        worksheet.getColumn(5).width = 15;

        const headerRow = worksheet.getRow(7);
        headerRow.values = ['Producto', 'Stock Anterior (Unds)', 'Cantidad Recargada', 'Nuevo Stock (Unds)', 'Factor Conv.'];
        [1, 2, 3, 4, 5].forEach(col => { const cell = headerRow.getCell(col); cell.style = tableHeaderStyle; cell.border = borderStyle; });

        let currentRowIndex = 8;
        rubroOrderList.forEach(rubroName => {
            const rubroRow = worksheet.getRow(currentRowIndex);
            worksheet.mergeCells(`A${currentRowIndex}:E${currentRowIndex}`);
            rubroRow.getCell(1).value = `RUBRO: ${rubroName.toUpperCase()}`;
            rubroRow.getCell(1).style = rubroHeaderStyle;
            currentRowIndex++;

            groupedByRubro[rubroName].forEach(d => {
                const cantVisual = d.diferenciaUnidades / d.factorUtilizado;
                const unitLabel = d.factorUtilizado > 1 ? (d.factorUtilizado === 1 ? 'Und' : (d.factorUtilizado > 10 ? 'Caja' : 'Paq')) : 'Und';
                const signo = d.diferenciaUnidades > 0 ? '+' : '';
                const nombreProductoCompleto = `${d.segmento || ''} ${d.marca || ''} ${d.presentacionReal || d.presentacion || ''}`.trim();

                const row = worksheet.getRow(currentRowIndex);
                row.values = [ nombreProductoCompleto, d.unidadesAnteriores, `${signo}${cantVisual} ${unitLabel}`, d.unidadesNuevas, d.factorUtilizado ];
                row.eachCell((cell) => { cell.border = borderStyle; cell.alignment = { vertical: 'middle', horizontal: 'left' }; });
                row.getCell(2).alignment = { horizontal: 'center' }; row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }; row.getCell(4).alignment = { horizontal: 'center' }; row.getCell(5).alignment = { horizontal: 'center' };
                if (d.diferenciaUnidades > 0) { row.getCell(3).font = { color: { argb: 'FF2E7D32' }, bold: true }; } 
                else if (d.diferenciaUnidades < 0) { row.getCell(3).font = { color: { argb: 'FFC62828' }, bold: true }; }
                currentRowIndex++;
            });
        });

        const f = new Date(recarga.fecha);
        const dia = f.getDate().toString().padStart(2, '0'); const mes = (f.getMonth() + 1).toString().padStart(2, '0'); const anio = f.getFullYear(); const hora = f.getHours().toString().padStart(2, '0'); const min = f.getMinutes().toString().padStart(2, '0');
        const safeUserName = userName.replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ]/g, '').trim();
        const fname = `Recarga ${dia}-${mes}-${anio}_${hora}${min} ${safeUserName}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); 
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fname; document.body.appendChild(link); link.click(); document.body.removeChild(link); 
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
            await exportSingleClosingToExcel(closingData);
            const m = document.getElementById('modalContainer');
            if(m && !m.classList.contains('hidden') && m.querySelector('h3')?.textContent.startsWith('Progreso')) m.classList.add('hidden');
        } catch (error) { 
             const m = document.getElementById('modalContainer');
             if(m && !m.classList.contains('hidden') && m.querySelector('h3')?.textContent.startsWith('Progreso')) m.classList.add('hidden');
        }
    }

    async function exportSingleClosingToExcel(closingData) {
        if (typeof ExcelJS === 'undefined') { _showModal('Error', 'ExcelJS no disponible.'); return; }
        
        // Nota: closingData viene de ventas.js. 
        // Si viene del historial (firebase), fecha es Timestamp. Si es local, es Date.
        const fechaObj = closingData.fecha.toDate ? closingData.fecha.toDate() : new Date(closingData.fecha);

        const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo } = 
            await _processSalesDataForModal(closingData.ventas || [], closingData.obsequios || [], closingData.cargaInicialInventario || [], closingData.vendedorInfo.userId);
        
        const wb = new ExcelJS.Workbook();

        // 1. AGRUPAR PRODUCTOS POR RUBRO
        const productsByRubro = {};
        const rubroOrder = [];
        
        finalProductOrder.forEach(p => {
            const r = p.rubro || 'SIN RUBRO';
            if (!productsByRubro[r]) {
                productsByRubro[r] = [];
                rubroOrder.push(r);
            }
            productsByRubro[r].push(p);
        });

        // ESTILOS
        const headerInfoFont = { bold: true, size: 10 };
        const headerProdFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }; // Gris claro
        const headerProdFont = { bold: true, size: 9 };
        const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        const rowTotalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

        // 2. CREAR HOJA POR CADA RUBRO
        rubroOrder.forEach(rubroName => {
            // Nombre de hoja seguro
            const sheetName = rubroName.replace(/[\*?:\]\[\/\/]/g, '').substring(0, 30);
            const ws = wb.addWorksheet(sheetName);

            // --- CABECERA DE INFORMACIÓN (Filas 1-2) ---
            ws.getCell('A1').value = fechaObj.toLocaleDateString();
            ws.getCell('A2').value = `${closingData.vendedorInfo.nombre} ${closingData.vendedorInfo.apellido}`;
            ws.getCell('A1').font = headerInfoFont;
            ws.getCell('A2').font = headerInfoFont;

            const prods = productsByRubro[rubroName];
            
            // --- CABECERAS DE PRODUCTOS (Filas 3-6) ---
            // A3: SEGMENTO, A4: MARCA, A5: PRESENTACION, A6: PRECIO
            ws.getCell('A3').value = 'SEGMENTO';
            ws.getCell('A4').value = 'MARCA';
            ws.getCell('A5').value = 'PRESENTACION';
            ws.getCell('A6').value = 'PRECIO';
            
            // Aplicar estilos columna A headers
            ['A3','A4','A5','A6'].forEach(cell => {
                ws.getCell(cell).font = headerProdFont;
                ws.getCell(cell).fill = headerProdFill;
                ws.getCell(cell).border = borderStyle;
            });
            ws.getColumn(1).width = 25; // Ancho columna Cliente

            let colIdx = 2;
            prods.forEach(p => {
                ws.getCell(3, colIdx).value = p.segmento || '';
                ws.getCell(4, colIdx).value = p.marca || '';
                ws.getCell(5, colIdx).value = p.presentacion || '';
                
                // Precio
                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                let displayPrecio = 0;
                if (p.ventaPor?.cj) displayPrecio = precios.cj;
                else if (p.ventaPor?.paq) displayPrecio = precios.paq;
                else displayPrecio = precios.und;
                ws.getCell(6, colIdx).value = displayPrecio;

                // Estilos celdas producto
                for(let r=3; r<=6; r++) {
                    const cell = ws.getCell(r, colIdx);
                    cell.font = { size: 8, bold: (r===5) }; // Presentacion bold
                    cell.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center' }; // Rotar texto para ahorrar espacio
                    if(r===6) cell.alignment = { textRotation: 0, horizontal: 'center' }; // Precio normal
                    cell.fill = headerProdFill;
                    cell.border = borderStyle;
                }
                
                ws.getColumn(colIdx).width = 6; // Columna estrecha
                colIdx++;
            });

            // Columna Sub Total
            const subTotalCol = colIdx;
            ws.getCell(3, subTotalCol).value = 'Sub Total';
            ws.getCell(3, subTotalCol).font = headerProdFont;
            ws.mergeCells(3, subTotalCol, 6, subTotalCol); // Unir verticalmente
            ws.getCell(3, subTotalCol).alignment = { vertical: 'middle', horizontal: 'center', textRotation: 90 };
            ws.getCell(3, subTotalCol).border = borderStyle;
            ws.getColumn(subTotalCol).width = 10;

            // --- CARGA INICIAL (Fila 7) ---
            let rowIdx = 7;
            const rowInicial = ws.getRow(rowIdx);
            rowInicial.getCell(1).value = 'CARGA INICIAL';
            rowInicial.getCell(1).font = { bold: true };
            rowInicial.getCell(1).border = borderStyle;

            let col = 2;
            prods.forEach(p => {
                const disp = getDisplayQty(p.initialStock || 0, p);
                const cell = rowInicial.getCell(col);
                cell.value = disp.value; // Solo valor numérico para Excel idealmente, o string si lleva unidad
                cell.alignment = { horizontal: 'center' };
                cell.font = { bold: true };
                cell.border = borderStyle;
                col++;
            });
            rowIdx++;

            // --- FILAS DE CLIENTES ---
            const totalsByProd = new Array(prods.length).fill(0); // Para sumar totales verticales de carga restante
            
            sortedClients.forEach(cli => {
                const cData = clientData[cli];
                const row = ws.getRow(rowIdx);
                row.getCell(1).value = cli;
                row.getCell(1).border = borderStyle;
                row.getCell(1).font = { size: 9 };

                let c = 2;
                prods.forEach((p, idx) => {
                    const qty = cData.products[p.id] || 0;
                    totalsByProd[idx] += qty; // Acumular total vendido del producto
                    
                    const cell = row.getCell(c);
                    if (qty > 0) {
                        const disp = getDisplayQty(qty, p);
                        cell.value = disp.value;
                    } 
                    cell.border = borderStyle;
                    cell.alignment = { horizontal: 'center' };
                    c++;
                });

                // Calcular Subtotal $ exacto del rubro para el cliente
                let rubroMoneyTotal = 0;
                prods.forEach((p, idx) => {
                     const qtyBase = cData.products[p.id] || 0;
                     if(qtyBase > 0){
                         let precioVenta = 0;
                         let factor = 1;
                         if (p.ventaPor?.cj) { precioVenta = p.precios?.cj||0; factor = p.unidadesPorCaja||1; }
                         else if (p.ventaPor?.paq) { precioVenta = p.precios?.paq||0; factor = p.unidadesPorPaquete||1; }
                         else { precioVenta = p.precios?.und||0; }
                         
                         // Cantidad en unidades de venta (con decimales si es fraccion)
                         const qtyVenta = qtyBase / factor; 
                         rubroMoneyTotal += (qtyVenta * precioVenta);
                     }
                });

                const stCell = row.getCell(subTotalCol);
                stCell.value = rubroMoneyTotal > 0 ? rubroMoneyTotal : '';
                stCell.numFmt = '#,##0.00';
                stCell.border = borderStyle;

                // Colorear si es obsequio
                if (rubroMoneyTotal === 0 && prods.some(p => (cData.products[p.id] || 0) > 0)) {
                     const isObs = !clientTotals.hasOwnProperty(cli); 
                     if(isObs) row.eachCell({ includeEmpty: true }, (cell) => cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } });
                }

                rowIdx++;
            });

            // Espacio
            rowIdx++;

            // --- CARGA RESTANTE ---
            const rowRestante = ws.getRow(rowIdx);
            rowRestante.getCell(1).value = 'CARGA RESTANTE';
            rowRestante.getCell(1).font = { bold: true };
            rowRestante.getCell(1).border = borderStyle;

            col = 2;
            prods.forEach((p, idx) => {
                const init = p.initialStock || 0;
                const sold = totalsByProd[idx];
                const rest = init - sold;
                const disp = getDisplayQty(rest, p);
                
                const cell = rowRestante.getCell(col);
                cell.value = disp.value;
                cell.alignment = { horizontal: 'center' };
                cell.font = { bold: true };
                cell.border = borderStyle;
                col++;
            });
            rowIdx++;

            // --- TOTALES ---
            const rowTotales = ws.getRow(rowIdx);
            rowTotales.getCell(1).value = 'TOTALES';
            rowTotales.getCell(1).font = { bold: true };
            rowTotales.getCell(1).fill = rowTotalFill;
            rowTotales.getCell(1).border = borderStyle;

            col = 2;
            let rubroGrandTotal = 0;
            prods.forEach((p, idx) => {
                const sold = totalsByProd[idx];
                const disp = getDisplayQty(sold, p);
                const cell = rowTotales.getCell(col);
                cell.value = sold > 0 ? disp.value : '';
                cell.alignment = { horizontal: 'center' };
                cell.font = { bold: true };
                cell.fill = rowTotalFill;
                cell.border = borderStyle;
                col++;
                
                // Sumar al gran total del rubro ($)
                 let precioVenta = 0;
                 let factor = 1;
                 if (p.ventaPor?.cj) { precioVenta = p.precios?.cj||0; factor = p.unidadesPorCaja||1; }
                 else if (p.ventaPor?.paq) { precioVenta = p.precios?.paq||0; factor = p.unidadesPorPaquete||1; }
                 else { precioVenta = p.precios?.und||0; }
                 rubroGrandTotal += ((sold/factor) * precioVenta);
            });
            
            const gtCell = rowTotales.getCell(subTotalCol);
            gtCell.value = rubroGrandTotal;
            gtCell.numFmt = '#,##0.00';
            gtCell.font = { bold: true };
            gtCell.fill = rowTotalFill;
            gtCell.border = borderStyle;
        });

        // 3. HOJA REPORTE VACÍOS
        const wsVacios = wb.addWorksheet('Reporte Vacíos');
        wsVacios.columns = [
            { header: 'Cliente', key: 'c', width: 30 },
            { header: 'Tipo Vacío', key: 't', width: 20 },
            { header: 'Entregados', key: 'e', width: 15 },
            { header: 'Devueltos', key: 'd', width: 15 },
            { header: 'Neto', key: 'n', width: 15 }
        ];
        wsVacios.getRow(1).font = { bold: true };
        
        const cliVacios = Object.keys(vaciosMovementsPorTipo).sort();
        cliVacios.forEach(cli => {
            const movs = vaciosMovementsPorTipo[cli];
            const TIPOS = ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"]; // O window.TIPOS_VACIO
            TIPOS.forEach(t => {
                const m = movs[t] || {e:0, d:0};
                if (m.e > 0 || m.d > 0) {
                    const neto = m.e - m.d;
                    wsVacios.addRow({ c: cli, t: t, e: m.e, d: m.d, n: neto });
                }
            });
        });

        // 4. HOJA TOTAL POR CLIENTE
        const wsTotalCli = wb.addWorksheet('Total Por Cliente');
        wsTotalCli.columns = [
            { header: 'Cliente', key: 'c', width: 30 },
            { header: 'Gasto Total', key: 'g', width: 20 }
        ];
        wsTotalCli.getRow(1).font = { bold: true };
        
        sortedClients.forEach(cli => {
            if (clientTotals[cli] > 0) {
                wsTotalCli.addRow({ c: cli, g: clientTotals[cli] });
            }
        });
        wsTotalCli.addRow({ c: 'GRAN TOTAL', g: grandTotalValue });
        wsTotalCli.lastRow.font = { bold: true };


        // DESCARGA
        const fname = `Cierre_${closingData.vendedorInfo.nombre}_${fechaObj.getDate()}-${fechaObj.getMonth()+1}-${fechaObj.getFullYear()}.xlsx`;
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    
    // --- OTRAS FUNCIONES ---
    async function showRecargasReportView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores pueden ver este reporte.'); return; }
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-4xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Auditoría de Recargas de Productos</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                    <div> <label class="block text-sm font-medium text-gray-700 mb-1">Seleccionar Vendedor:</label> <select id="userSelector" class="w-full p-2 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500"> <option value="">Cargando lista de usuarios...</option> </select> </div>
                    <div class="flex items-end"> <button id="loadRecargasBtn" class="w-full bg-teal-600 text-white p-2 rounded-lg font-bold hover:bg-teal-700 shadow-md transition-all"> Consultar Actividad </button> </div>
                </div>
                <div id="recargasTableContainer" class="overflow-x-auto border rounded-lg min-h-[300px] bg-white relative shadow-inner"> <div class="absolute inset-0 flex items-center justify-center text-gray-400 italic pointer-events-none"> Seleccione un usuario para auditar sus registros de stock. </div> </div>
                <div class="mt-6 flex flex-col sm:flex-row gap-4"> <button id="backToDataMenuBtn" class="flex-1 py-3 bg-gray-400 text-white rounded-lg font-semibold hover:bg-gray-500 shadow-md">Volver</button> </div>
            </div> </div> </div>
        `;
        const userSelector = document.getElementById('userSelector'); 
        const loadBtn = document.getElementById('loadRecargasBtn'); 
        const tableContainer = document.getElementById('recargasTableContainer');
        
        try { 
            const usersSnap = await _getDocs(_collection(_db, "users")); 
            userSelector.innerHTML = '<option value="">-- Elija un vendedor --</option>'; 
            usersSnap.forEach(doc => { 
                const data = doc.data(); 
                userSelector.innerHTML += `<option value="${doc.id}">${data.name || data.email || doc.id} (${data.camion || 'Sin Camión'})</option>`; 
            }); 
        } catch (e) { console.error("Error cargando usuarios:", e); userSelector.innerHTML = '<option value="">Error al cargar usuarios</option>'; }
        
        loadBtn.addEventListener('click', async () => {
            const selectedUserId = userSelector.value; 
            if (!selectedUserId) { _showModal('Aviso', 'Por favor seleccione un vendedor de la lista.'); return; }
            tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-teal-600 font-bold animate-pulse">Consultando registros en Firebase...</p></div>';
            try { 
                const recargasRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/recargas`); 
                const snap = await _getDocs(recargasRef); 
                if (snap.empty) { tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-gray-500">Este usuario no tiene registros de recarga.</p></div>'; return; } 
                let recargasData = []; 
                snap.forEach(doc => recargasData.push({ id: doc.id, ...doc.data() })); 
                recargasData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); 
                renderRecargasTable(recargasData, tableContainer, userSelector.options[userSelector.selectedIndex].text); 
            } catch (error) { console.error(error); tableContainer.innerHTML = `<div class="flex h-64 items-center justify-center"><p class="text-red-500 font-bold">Error: ${error.message}</p></div>`; }
        });
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView);
    }

    function renderRecargasTable(data, container, userName) {
        window.tempRecargasData = data; // Guardar referencia global temporal
        let html = ` <table class="min-w-full text-sm text-left border-collapse"> <thead class="bg-gray-100 text-gray-700 uppercase text-xs font-bold sticky top-0 shadow-sm"> <tr> <th class="p-3 border-b">Fecha / Hora</th> <th class="p-3 border-b text-center">Total Productos</th> <th class="p-3 border-b text-center">Acciones</th> </tr> </thead> <tbody class="divide-y divide-gray-100"> `;
        data.forEach(r => { 
            const fecha = new Date(r.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); 
            const safeUserName = userName.replace(/'/g, "\\'");
            html += ` 
                <tr class="hover:bg-gray-50 transition-colors duration-150"> 
                    <td class="p-3 border-r font-medium text-gray-600 whitespace-nowrap align-top">${fecha}</td> 
                    <td class="p-3 border-r text-center font-bold text-teal-600 align-top">${r.totalProductos}</td> 
                    <td class="p-3 text-center align-top">
                        <button onclick="window.dataModule.downloadRecargaExcel('${r.id}', '${safeUserName}')" 
                                class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-xs font-bold flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Descargar Archivo
                        </button>
                    </td> 
                </tr> `; 
        });
        container.innerHTML = html + '</tbody></table>';
    }

    async function downloadRecargaExcel(recargaId, userName) {
        const recarga = window.tempRecargasData?.find(r => r.id === recargaId);
        if(!recarga) { _showModal('Error', 'Datos no encontrados.'); return; }
        
        _showModal('Progreso', 'Obteniendo datos de inventario para organizar el reporte...');
        try {
            await exportSingleRecargaToExcel(recarga, userName);
            const m = document.getElementById('modalContainer');
            if(m && !m.classList.contains('hidden') && m.querySelector('h3')?.textContent.startsWith('Progreso')) {
                m.classList.add('hidden');
            }
        } catch(e) {
            console.error(e);
            _showModal('Error', 'No se pudo generar el Excel: ' + e.message);
        }
    }

    async function exportSingleRecargaToExcel(recarga, userName) {
        if (typeof ExcelJS === 'undefined') { throw new Error('Librería ExcelJS no disponible.'); }
        
        // Obtener ordenamiento del ADMIN
        const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
        let segmentOrderMap = new Map();
        let marcaOrderMap = new Map();
        try {
            const segSnap = await _getDocs(segmentosRef);
            segSnap.forEach(doc => {
                const d = doc.data();
                if (d.name) {
                    segmentOrderMap.set(d.name, d.orden ?? 9999);
                    if (d.marcaOrder && Array.isArray(d.marcaOrder)) {
                        const mMap = new Map();
                        d.marcaOrder.forEach((m, i) => mMap.set(m, i));
                        marcaOrderMap.set(d.name, mMap);
                    }
                }
            });
        } catch (e) { console.warn("No se pudo obtener config orden admin:", e); }

        // Obtener metadatos inventario vendedor
        const userIdVendedor = recarga.usuarioId;
        const productMetadata = new Map();
        if (userIdVendedor) {
            try {
                const invRef = _collection(_db, `artifacts/${_appId}/users/${userIdVendedor}/inventario`);
                const invSnap = await _getDocs(invRef);
                invSnap.forEach(doc => {
                    const d = doc.data();
                    productMetadata.set(doc.id, { rubro: d.rubro || 'OTROS', segmento: d.segmento || 'OTROS', marca: d.marca || 'OTROS', presentacion: d.presentacion || '' });
                });
            } catch(e) { console.warn("No se pudo obtener inventario vendedor:", e); }
        }

        // Enriquecer y ordenar
        const enhancedDetalles = recarga.detalles.map(d => {
            const meta = productMetadata.get(d.productoId) || { rubro: 'PRODUCTOS ELIMINADOS', segmento: 'ZZ', marca: 'ZZ', presentacion: d.presentacion };
            return { ...d, rubro: meta.rubro, segmento: meta.segmento, marca: meta.marca, presentacionReal: meta.presentacion, id: d.productoId };
        });

        enhancedDetalles.sort((a, b) => {
            if (a.rubro !== b.rubro) return (a.rubro || '').localeCompare(b.rubro || '');
            const segOrderA = segmentOrderMap.get(a.segmento) ?? 9999;
            const segOrderB = segmentOrderMap.get(b.segmento) ?? 9999;
            if (segOrderA !== segOrderB) return segOrderA - segOrderB;
            if ((a.segmento||'') !== (b.segmento||'')) return (a.segmento||'').localeCompare(b.segmento||'');
            const mOrderMap = marcaOrderMap.get(a.segmento);
            const mOrderA = mOrderMap?.get(a.marca) ?? 9999;
            const mOrderB = mOrderMap?.get(b.marca) ?? 9999;
            if (mOrderA !== mOrderB) return mOrderA - mOrderB;
            if ((a.marca||'') !== (b.marca||'')) return (a.marca||'').localeCompare(b.marca||'');
            return (a.presentacion||'').localeCompare(b.presentacion||'');
        });

        // Agrupar por Rubro
        const groupedByRubro = {};
        const rubroOrderList = [];
        enhancedDetalles.forEach(d => {
            const r = d.rubro || 'OTROS';
            if (!groupedByRubro[r]) { groupedByRubro[r] = []; rubroOrderList.push(r); }
            groupedByRubro[r].push(d);
        });

        // Generar Excel
        const workbook = new ExcelJS.Workbook(); 
        const worksheet = workbook.addWorksheet('Detalle Recarga'); 
        
        const headerInfoStyle = { font: { bold: true, size: 10 }, alignment: { horizontal: 'left' } };
        const tableHeaderStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00695C' } }, alignment: { horizontal: 'center', vertical: 'middle' } };
        const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        const rubroHeaderStyle = { font: { bold: true, size: 11, color: { argb: 'FF000000' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2F1' } }, alignment: { horizontal: 'left', vertical: 'middle' }, border: borderStyle };

        const fechaStr = new Date(recarga.fecha).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
        
        worksheet.mergeCells('A1:E1'); worksheet.getCell('A1').value = `REPORTE DE RECARGA DE INVENTARIO`; worksheet.getCell('A1').font = { bold: true, size: 14 }; worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.getCell('A3').value = 'USUARIO:'; worksheet.getCell('B3').value = userName.toUpperCase(); worksheet.getCell('A3').font = headerInfoStyle.font;
        worksheet.getCell('A4').value = 'FECHA:'; worksheet.getCell('B4').value = fechaStr; worksheet.getCell('A4').font = headerInfoStyle.font;
        worksheet.getCell('A5').value = 'ID TRANSACCIÓN:'; worksheet.getCell('B5').value = recarga.id; worksheet.getCell('A5').font = headerInfoStyle.font;

        worksheet.getColumn(1).width = 50; 
        worksheet.getColumn(2).width = 20; 
        worksheet.getColumn(3).width = 25; 
        worksheet.getColumn(4).width = 20; 
        worksheet.getColumn(5).width = 15;

        const headerRow = worksheet.getRow(7);
        headerRow.values = ['Producto', 'Stock Anterior (Unds)', 'Cantidad Recargada', 'Nuevo Stock (Unds)', 'Factor Conv.'];
        [1, 2, 3, 4, 5].forEach(col => { const cell = headerRow.getCell(col); cell.style = tableHeaderStyle; cell.border = borderStyle; });

        let currentRowIndex = 8;
        rubroOrderList.forEach(rubroName => {
            const rubroRow = worksheet.getRow(currentRowIndex);
            worksheet.mergeCells(`A${currentRowIndex}:E${currentRowIndex}`);
            rubroRow.getCell(1).value = `RUBRO: ${rubroName.toUpperCase()}`;
            rubroRow.getCell(1).style = rubroHeaderStyle;
            currentRowIndex++;

            groupedByRubro[rubroName].forEach(d => {
                const cantVisual = d.diferenciaUnidades / d.factorUtilizado;
                const unitLabel = d.factorUtilizado > 1 ? (d.factorUtilizado === 1 ? 'Und' : (d.factorUtilizado > 10 ? 'Caja' : 'Paq')) : 'Und';
                const signo = d.diferenciaUnidades > 0 ? '+' : '';
                const nombreProductoCompleto = `${d.segmento || ''} ${d.marca || ''} ${d.presentacionReal || d.presentacion || ''}`.trim();

                const row = worksheet.getRow(currentRowIndex);
                row.values = [ nombreProductoCompleto, d.unidadesAnteriores, `${signo}${cantVisual} ${unitLabel}`, d.unidadesNuevas, d.factorUtilizado ];
                row.eachCell((cell) => { cell.border = borderStyle; cell.alignment = { vertical: 'middle', horizontal: 'left' }; });
                row.getCell(2).alignment = { horizontal: 'center' }; row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }; row.getCell(4).alignment = { horizontal: 'center' }; row.getCell(5).alignment = { horizontal: 'center' };
                if (d.diferenciaUnidades > 0) { row.getCell(3).font = { color: { argb: 'FF2E7D32' }, bold: true }; } 
                else if (d.diferenciaUnidades < 0) { row.getCell(3).font = { color: { argb: 'FFC62828' }, bold: true }; }
                currentRowIndex++;
            });
        });

        const f = new Date(recarga.fecha);
        const dia = f.getDate().toString().padStart(2, '0'); const mes = (f.getMonth() + 1).toString().padStart(2, '0'); const anio = f.getFullYear(); const hora = f.getHours().toString().padStart(2, '0'); const min = f.getMinutes().toString().padStart(2, '0');
        const safeUserName = userName.replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ]/g, '').trim();
        const fname = `Recarga ${dia}-${mes}-${anio}_${hora}${min} ${safeUserName}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); 
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fname; document.body.appendChild(link); link.click(); document.body.removeChild(link); 
    }
    async function showUserInventoryView(){ /* ... código anterior ... */ }

    // --- SETUP GLOBALS ---
    window.dataModule = { 
        showClosingDetail: async (id) => { const c=window.tempClosingsData?.find(x=>x.id===id); if(c) await exportSingleClosingToExcel(c); }, // Reutiliza export para ver/bajar
        handleDownloadSingleClosing,
        exportSingleClosingToExcel, 
        _processSalesDataForModal,
        getDisplayQty,
        showRecargasReportView,
        showUserInventoryView, // Asegurar que está
        downloadRecargaExcel,
        // ... otras funciones
        checkAndGenerateWeeklyReport,
        showDataView,
        showReportDesignView,
        showClientMapView,
        showAttentionHistoryView
    };

})();

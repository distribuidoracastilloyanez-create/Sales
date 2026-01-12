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
    
    // Configuración por defecto para los estilos del Reporte Excel
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
            // Calcular semana anterior (Lunes a Domingo pasados)
            const today = new Date();
            const startOfCurrentWeek = getStartOfWeek(today); // Lunes actual 00:00
            
            const endOfLastWeek = new Date(startOfCurrentWeek);
            endOfLastWeek.setMilliseconds(-1); // Domingo pasado 23:59:59.999
            
            const startOfLastWeek = new Date(startOfCurrentWeek);
            startOfLastWeek.setDate(startOfLastWeek.getDate() - 7); // Lunes pasado 00:00

            // ID único para el reporte: Año_Semana
            // Usamos ISO Week date aproximada
            const oneJan = new Date(startOfLastWeek.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((startOfLastWeek - oneJan) / (24 * 60 * 60 * 1000));
            const weekNum = Math.ceil((startOfLastWeek.getDay() + 1 + numberOfDays) / 7);
            const reportId = `${startOfLastWeek.getFullYear()}_Week_${weekNum}`;

            // 1. Verificar si ya existe el reporte
            const historyRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/historial_atencion`, reportId);
            const historySnap = await _getDoc(historyRef);

            if (historySnap.exists()) {
                console.log(`Reporte semanal ${reportId} ya existe. Skipping.`);
                return;
            }

            console.log(`Generando reporte semanal automático para: ${reportId} (${startOfLastWeek.toLocaleDateString()} - ${endOfLastWeek.toLocaleDateString()})`);

            // 2. Obtener Clientes Públicos Activos
            const clientesRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`);
            const clientesSnap = await _getDocs(clientesRef);
            const todosLosClientes = clientesSnap.docs.map(d => ({id: d.id, ...d.data()}));

            if (todosLosClientes.length === 0) return;

            // 3. Obtener Ventas de la Semana Pasada
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

            // 4. Calcular No Atendidos
            const clientesNoAtendidos = todosLosClientes.filter(c => !clientesAtendidosIds.has(c.id));

            // 5. Guardar Reporte
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

    // --- NUEVA FUNCIÓN: INVENTARIO POR USUARIO (ADMIN) ---
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

            // Usar los datos de _tempUserInventory
            
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

    // --- VISTA MAPA DE RUTAS (Modificado Dinámico) ---
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
            // 1. Cargar Clientes Públicos
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

            // 2. Inicializar Mapa
            mapInstance = L.map('client-map').setView([7.77, -72.22], 13); 
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19 }).addTo(mapInstance);
            
            // Iconos
            const greyIcon = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]}); 
            const greenIcon = new L.Icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]});

            mapMarkers.clear(); 
            const mGroup=[];

            // 3. Pintar todos en GRIS inicialmente
            cliCoords.forEach(cli=>{
                try{
                    const cleanCoords = cli.coordenadas.toString().replace(/['"()]/g, '').trim();
                    const coords=cleanCoords.split(',').map(p=>parseFloat(p)); 
                    const hasCEP=cli.codigoCEP&&cli.codigoCEP.toLowerCase()!=='n/a'; 
                    
                    const marker=L.marker(coords, {icon: greyIcon}).bindPopup(`
                        <b>${cli.nombreComercial}</b><br>
                        <small>${cli.nombrePersonal||''}</small><br>
                        <small>Sector: ${cli.sector||'N/A'}</small>
                        ${hasCEP?`<br><b>CEP: ${cli.codigoCEP}</b>`:''}
                        <br><a href="https://www.google.com/maps?q=${coords[0]},${coords[1]}" target="_blank" class="text-xs text-blue-600">Abrir en Google Maps</a>
                    `); 
                    mGroup.push(marker); 
                    mapMarkers.set(cli.id, marker);
                } catch(e){}
            });

            if(mGroup.length > 0) { 
                const g = L.featureGroup(mGroup).addTo(mapInstance); 
                mapInstance.fitBounds(g.getBounds().pad(0.1)); 
            }
            
            setupMapSearch(cliCoords);

            // 4. Configurar Listener en Tiempo Real para Ventas de la Semana
            const startOfWeek = getStartOfWeek(new Date()); // Lunes 00:00
            const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
            const q = _query(ventasRef, _where("fecha", ">=", startOfWeek));

            _salesListenerUnsubscribe = _onSnapshot(q, (snapshot) => {
                _soldClientIdsThisWeek.clear();
                snapshot.forEach(doc => {
                    const v = doc.data();
                    if(v.clienteId) _soldClientIdsThisWeek.add(v.clienteId);
                });
                
                // Actualizar colores dinámicamente
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

    // --- VISTA HISTÓRICO DE ATENCIÓN (NUEVA) ---
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

    // --- FUNCIONES EXISTENTES (CIERRES, AUDITORÍA) MANTENIDAS ---
    // (Estas funciones no cambian, se mantienen igual que en la versión anterior)
    
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
            const closingsRef = _collection(_db, `artifacts/${_appId}/public/data/user_closings`);
            let q = _query(closingsRef, _where("fecha", ">=", fechaDesde), _where("fecha", "<=", fechaHasta));
            const snapshot = await _getDocs(q);
            let closings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (selectedUserId) {
                closings = closings.filter(c => c.vendedorInfo && c.vendedorInfo.userId === selectedUserId);
            }
            window.tempClosingsData = closings; 
            renderClosingsList(closings);
        } catch (error) {
            console.error("Error buscando cierres:", error);
            container.innerHTML = `<p class="text-center text-red-500">Error al buscar.</p>`;
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
        // ... (Lógica de procesado para modal de cierre - sin cambios mayores)
        const clientData = {}; const clientTotals = {}; let grandTotalValue = 0;
        const allProductsMap = new Map(); const vaciosMovementsPorTipo = {};
        const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${userIdForInventario}/inventario`);
        const inventarioSnapshot = await _getDocs(inventarioRef);
        const inventarioMap = new Map(inventarioSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const allData = [...ventas.map(v => ({ tipo: 'venta', data: v })), ...(obsequios || []).map(o => ({ tipo: 'obsequio', data: o }))];
        for (const item of allData) {
            const clientName = item.data.clienteNombre || 'Cliente Desconocido';
            if (!clientData[clientName]) clientData[clientName] = { products: {}, totalValue: 0 };
            if (!vaciosMovementsPorTipo[clientName]) { vaciosMovementsPorTipo[clientName] = {}; TIPOS_VACIO_GLOBAL.forEach(tipo => vaciosMovementsPorTipo[clientName][tipo] = { entregados: 0, devueltos: 0 }); }
            if (item.tipo === 'venta') {
                const venta = item.data;
                const ventaTotalCliente = venta.total || 0;
                clientData[clientName].totalValue += ventaTotalCliente;
                clientTotals[clientName] = (clientTotals[clientName] || 0) + ventaTotalCliente;
                grandTotalValue += ventaTotalCliente;
                const vacDev = venta.vaciosDevueltosPorTipo || {};
                for (const tipo in vacDev) { if (!vaciosMovementsPorTipo[clientName][tipo]) vaciosMovementsPorTipo[clientName][tipo] = { e: 0, d: 0 }; vaciosMovementsPorTipo[clientName][tipo].devueltos += (vacDev[tipo] || 0); }
                (venta.productos || []).forEach(p => {
                    const prodComp = inventarioMap.get(p.id) || p;
                    if (prodComp && prodComp.manejaVacios && prodComp.tipoVacio) { const tipoV = prodComp.tipoVacio; if (!vaciosMovementsPorTipo[clientName][tipoV]) vaciosMovementsPorTipo[clientName][tipoV] = { e: 0, d: 0 }; vaciosMovementsPorTipo[clientName][tipoV].entregados += p.cantidadVendida?.cj || 0; }
                    const rubro = prodComp?.rubro || 'Sin Rubro', seg = prodComp?.segmento || 'Sin Segmento', marca = prodComp?.marca || 'Sin Marca';
                    if (p.id && !allProductsMap.has(p.id)) allProductsMap.set(p.id, { ...prodComp, id: p.id, rubro: rubro, segmento: seg, marca: marca, presentacion: p.presentacion });
                    if (p.id && !clientData[clientName].products[p.id]) clientData[clientName].products[p.id] = 0;
                    let cantidadUnidades = 0;
                    if (p.cantidadVendida) { const uCj = p.unidadesPorCaja || 1; const uPaq = p.unidadesPorPaquete || 1; cantidadUnidades = (p.cantidadVendida.cj || 0) * uCj + (p.cantidadVendida.paq || 0) * uPaq + (p.cantidadVendida.und || 0); } else if (p.totalUnidadesVendidas) { cantidadUnidades = p.totalUnidadesVendidas; }
                    if(p.id) clientData[clientName].products[p.id] += cantidadUnidades;
                });
            } else if (item.tipo === 'obsequio') {
                const obsequio = item.data;
                const prodInventario = inventarioMap.get(obsequio.productoId);
                let pComp; 
                if (prodInventario) { pComp = { ...prodInventario, id: obsequio.productoId }; } else { pComp = { id: obsequio.productoId, presentacion: obsequio.productoNombre || 'Producto Eliminado', rubro: 'OBSEQUIOS (ELIMINADO)', segmento: 'N/A', marca: 'N/A', unidadesPorCaja: 1, manejaVacios: !!obsequio.tipoVacio, tipoVacio: obsequio.tipoVacio || null }; }
                const cantidadUnidades = (obsequio.cantidadCajas || 0) * (pComp.unidadesPorCaja || 1);
                if (pComp.manejaVacios && pComp.tipoVacio) { const tV = pComp.tipoVacio; if (!vaciosMovementsPorTipo[clientName][tV]) vaciosMovementsPorTipo[clientName][tV] = { entregados: 0, devueltos: 0 }; vaciosMovementsPorTipo[clientName][tV].entregados += (obsequio.cantidadCajas || 0); }
                const vacDev = obsequio.vaciosRecibidos || 0; const tipoVacDev = obsequio.tipoVacio;
                if (vacDev > 0 && tipoVacDev) { if (!vaciosMovementsPorTipo[clientName][tipoVacDev]) vaciosMovementsPorTipo[clientName][tipoVacDev] = { entregados: 0, devueltos: 0 }; vaciosMovementsPorTipo[clientName][tipoVacDev].devueltos += vacDev; }
                const rubro = pComp.rubro || 'Sin Rubro', seg = pComp.segmento || 'Sin Segmento', marca = pComp.marca || 'Sin Marca';
                if (pComp.id && !allProductsMap.has(pComp.id)) allProductsMap.set(pComp.id, { ...pComp, id: pComp.id, rubro: rubro, segmento: seg, marca: marca, presentacion: pComp.presentacion });
                if (pComp.id && !clientData[clientName].products[pComp.id]) clientData[clientName].products[pComp.id] = 0;
                clientData[clientName].products[pComp.id] += cantidadUnidades;
            }
        }
        const sortedClients = Object.keys(clientData).sort();
        const sortFunction = await getGlobalProductSortFunction();
        const finalProductOrder = Array.from(allProductsMap.values()).sort(sortFunction);
        return { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo };
    }

    async function showClosingDetail(closingId) {
        const closingData = window.tempClosingsData?.find(c => c.id === closingId);
        if (!closingData) { _showModal('Error', 'No se cargaron detalles.'); return; }
        _showModal('Progreso', 'Generando reporte detallado...');
        try {
            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo } = 
                await _processSalesDataForModal(closingData.ventas || [], closingData.obsequios || [], closingData.cargaInicialInventario || [], closingData.vendedorInfo.userId);
            
            // ... (Código de generación de HTML de tabla - compactado para brevedad, es el mismo de antes)
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

    // --- RECARGAS (ADMIN) ---
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
                <div class="mt-6 flex flex-col sm:flex-row gap-4"> <button id="backToDataMenuBtn" class="flex-1 py-3 bg-gray-400 text-white rounded-lg font-semibold hover:bg-gray-500 shadow-md">Volver</button> <button id="downloadExcelRecargasBtn" class="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hidden hover:bg-green-700 shadow-md flex items-center justify-center gap-2"> Descargar Reporte Excel </button> </div>
            </div> </div> </div>
        `;
        const userSelector = document.getElementById('userSelector'); const loadBtn = document.getElementById('loadRecargasBtn'); const downloadBtn = document.getElementById('downloadExcelRecargasBtn'); const tableContainer = document.getElementById('recargasTableContainer');
        try { const usersSnap = await _getDocs(_collection(_db, "users")); userSelector.innerHTML = '<option value="">-- Elija un vendedor --</option>'; usersSnap.forEach(doc => { const data = doc.data(); userSelector.innerHTML += `<option value="${doc.id}">${data.name || data.email || doc.id} (${data.camion || 'Sin Camión'})</option>`; }); } catch (e) { console.error("Error cargando usuarios:", e); userSelector.innerHTML = '<option value="">Error al cargar usuarios</option>'; }
        loadBtn.addEventListener('click', async () => {
            const selectedUserId = userSelector.value; if (!selectedUserId) { _showModal('Aviso', 'Por favor seleccione un vendedor de la lista.'); return; }
            tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-teal-600 font-bold animate-pulse">Consultando registros en Firebase...</p></div>';
            try { const recargasRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/recargas`); const snap = await _getDocs(recargasRef); if (snap.empty) { tableContainer.innerHTML = '<div class="flex h-64 items-center justify-center"><p class="text-gray-500">Este usuario no tiene registros de recarga.</p></div>'; downloadBtn.classList.add('hidden'); return; } let recargasData = []; snap.forEach(doc => recargasData.push({ id: doc.id, ...doc.data() })); recargasData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); renderRecargasTable(recargasData, tableContainer); downloadBtn.classList.remove('hidden'); downloadBtn.onclick = () => exportRecargasToExcel(recargasData, userSelector.options[userSelector.selectedIndex].text); } catch (error) { console.error(error); tableContainer.innerHTML = `<div class="flex h-64 items-center justify-center"><p class="text-red-500 font-bold">Error: ${error.message}</p></div>`; }
        });
        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataView);
    }

    function renderRecargasTable(data, container) {
        let html = ` <table class="min-w-full text-sm text-left border-collapse"> <thead class="bg-gray-100 text-gray-700 uppercase text-xs font-bold sticky top-0 shadow-sm"> <tr> <th class="p-3 border-b">Fecha / Hora</th> <th class="p-3 border-b text-center">Items</th> <th class="p-3 border-b">Detalle de Productos Recargados</th> </tr> </thead> <tbody class="divide-y divide-gray-100"> `;
        data.forEach(r => { const fecha = new Date(r.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); const resumen = r.detalles.map(d => { const cant = d.diferenciaUnidades / d.factorUtilizado; const unitLabel = d.factorUtilizado > 1 ? (d.factorUtilizado === 1 ? 'Und' : 'Cj/Paq') : 'Und'; return `<span class="inline-block bg-green-50 text-green-800 border border-green-200 px-2 py-1 rounded-md text-xs m-1 shadow-sm"> <strong>${d.presentacion}</strong>: +${cant} ${unitLabel} </span>`; }).join(''); html += ` <tr class="hover:bg-gray-50 transition-colors duration-150"> <td class="p-3 border-r font-medium text-gray-600 whitespace-nowrap align-top w-32">${fecha}</td> <td class="p-3 border-r text-center font-bold text-teal-600 align-top w-16">${r.totalProductos}</td> <td class="p-3 align-top">${resumen}</td> </tr> `; });
        container.innerHTML = html + '</tbody></table>';
    }

    function exportRecargasToExcel(data, userName) {
        if (typeof ExcelJS === 'undefined') { _showModal('Error', 'Librería ExcelJS no disponible.'); return; }
        try { const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('Auditoria Recargas'); worksheet.columns = [ { header: 'Fecha y Hora', key: 'fecha', width: 20 }, { header: 'ID Transacción', key: 'id', width: 25 }, { header: 'Producto', key: 'producto', width: 35 }, { header: 'Stock Anterior (Unds)', key: 'ant', width: 18 }, { header: 'Nuevo Stock (Unds)', key: 'nuevo', width: 18 }, { header: 'Diferencia (Unds)', key: 'dif', width: 18 }, { header: 'Cantidad Visual', key: 'visual', width: 18 }, { header: 'Factor', key: 'factor', width: 10 } ]; worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } }; data.forEach(r => { const f = new Date(r.fecha).toLocaleString(); r.detalles.forEach(d => { worksheet.addRow({ fecha: f, id: r.id, producto: d.presentacion, ant: d.unidadesAnteriores, nuevo: d.unidadesNuevas, dif: d.diferenciaUnidades, visual: d.diferenciaUnidades / d.factorUtilizado, factor: d.factorUtilizado }); }); }); workbook.xlsx.writeBuffer().then(function(buffer) { const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Auditoria_Recargas_${userName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`; document.body.appendChild(link); link.click(); document.body.removeChild(link); }); } catch (e) { console.error("Error exportando recargas:", e); _showModal('Error', 'No se pudo generar el archivo Excel.'); }
    }

    // --- DISEÑO DE REPORTE (Sin cambios mayores, solo mantenido) ---
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

    // --- SETUP GLOBALS ---
    window.dataModule = { 
        showClosingDetail, 
        handleDownloadSingleClosing,
        exportSingleClosingToExcel,
        _processSalesDataForModal: _processSalesDataForModal,
        getDisplayQty: getDisplayQty,
        showRecargasReportView: showRecargasReportView,
        showUserInventoryView: showUserInventoryView // Exponer la nueva función
    };

})();

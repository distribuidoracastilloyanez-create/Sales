(function() {
    let _db, _appId, _userId, _userRole, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _query, _where, _orderBy, _populateDropdown, _getDoc, _doc, _setDoc;

    let _consolidatedClientsCache = [];
    let _filteredClientsCache = [];

    let mapInstance = null;
    let mapMarkers = new Map();

    let _sortPreferenceCache = null;
    let _rubroOrderMapCache = null;
    let _segmentoOrderMapCache = null;
    
    const SORT_CONFIG_PATH = 'config/productSortOrder'; 
    let REPORTE_DESIGN_CONFIG_PATH;
    
    const DEFAULT_REPORTE_SETTINGS = {
        showCargaInicial: true,
        showCargaRestante: true,
        showVaciosSheet: true,
        showClienteTotalSheet: true,
        styles: {
            headerInfo: { bold: true, fillColor: "#FFFFFF", fontColor: "#000000", border: false, fontSize: 10 },
            headerProducts: { bold: true, fillColor: "#EFEFEF", fontColor: "#000000", border: true, fontSize: 10 },
            rowCargaInicial: { bold: true, fillColor: "#FFFFFF", fontColor: "#000000", border: true, fontSize: 10 },
            rowDataClients: { bold: false, fillColor: "#FFFFFF", fontColor: "#333333", border: true, fontSize: 10 }
        }
    };

    window.initData = function(dependencies) {
        _db = dependencies.db;
        _appId = dependencies.appId;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole; // Importante para permisos
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
        
        REPORTE_DESIGN_CONFIG_PATH = `artifacts/${_appId}/users/${_userId}/config/reporteDesign`;
    };

    // --- INTERFAZ DE MENÚ ---
    window.showDataMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        const isAdmin = _userRole === 'admin';

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Reportes y Datos</h1>
                        <div class="space-y-4">
                            <button id="exportExcelBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Exportar Carga y Ventas (Excel)</button>
                            <button id="showMapsBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Ver Mapa de Clientes</button>
                            ${isAdmin ? `<button id="reporteRecargasBtn" class="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700">Historial de Recargas (Admin)</button>` : ''}
                            <button id="configReporteBtn" class="w-full px-6 py-3 bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-yellow-600">Configuración de Reporte</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú Principal</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('exportExcelBtn').addEventListener('click', handleExportExcel);
        document.getElementById('showMapsBtn').addEventListener('click', showMaps);
        if (isAdmin) {
            document.getElementById('reporteRecargasBtn').addEventListener('click', showRecargasReportView);
        }
        document.getElementById('configReporteBtn').addEventListener('click', showConfigReporteView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

    // --- NUEVA FUNCIÓN: REPORTE DE RECARGAS ---
    async function showRecargasReportView() {
        if (_userRole !== 'admin') return;

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white p-6 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Auditoría de Recargas de Productos</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Seleccionar Usuario / Vendedor:</label>
                                <select id="userSelector" class="w-full p-2 border rounded-lg bg-white">
                                    <option value="">Cargando lista de usuarios...</option>
                                </select>
                            </div>
                            <div class="flex items-end">
                                <button id="loadRecargasBtn" class="w-full bg-indigo-600 text-white p-2 rounded-lg font-bold hover:bg-indigo-700">Consultar Actividad</button>
                            </div>
                        </div>

                        <div id="recargasTableContainer" class="overflow-x-auto border rounded-lg min-h-[300px] bg-white">
                            <p class="text-center text-gray-400 p-12 italic">Seleccione un usuario para auditar sus recargas de stock.</p>
                        </div>

                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToDataMenuBtn" class="flex-1 py-3 bg-gray-400 text-white rounded-lg font-semibold">Volver</button>
                            <button id="downloadExcelRecargasBtn" class="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hidden">Descargar Reporte Excel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const userSelector = document.getElementById('userSelector');
        const loadBtn = document.getElementById('loadRecargasBtn');
        const downloadBtn = document.getElementById('downloadExcelRecargasBtn');
        const tableContainer = document.getElementById('recargasTableContainer');

        // Cargar usuarios desde la colección raíz /users
        try {
            const usersSnap = await _getDocs(_collection(_db, "users"));
            userSelector.innerHTML = '<option value="">-- Elija un vendedor --</option>';
            usersSnap.forEach(doc => {
                const data = doc.data();
                // Solo mostrar usuarios que no sean admin o mostrar todos según preferencia
                userSelector.innerHTML += `<option value="${doc.id}">${data.name || data.email || doc.id}</option>`;
            });
        } catch (e) {
            console.error("Error cargando usuarios:", e);
            userSelector.innerHTML = '<option value="">Error al cargar usuarios</option>';
        }

        loadBtn.addEventListener('click', async () => {
            const selectedUserId = userSelector.value;
            if (!selectedUserId) {
                _showModal('Aviso', 'Debe seleccionar un usuario de la lista.');
                return;
            }

            tableContainer.innerHTML = '<p class="text-center p-12 text-indigo-600 font-bold">Obteniendo registros de Firebase...</p>';
            
            try {
                const recargasRef = _collection(_db, `artifacts/${_appId}/users/${selectedUserId}/recargas`);
                const snap = await _getDocs(recargasRef);
                
                if (snap.empty) {
                    tableContainer.innerHTML = '<p class="text-center p-12 text-gray-500">No se encontraron registros de recarga para este usuario.</p>';
                    downloadBtn.classList.add('hidden');
                    return;
                }

                let recargasData = [];
                snap.forEach(doc => recargasData.push({ id: doc.id, ...doc.data() }));
                
                // Ordenar por fecha descendente
                recargasData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

                renderRecargasTable(recargasData, tableContainer);
                downloadBtn.classList.remove('hidden');
                
                downloadBtn.onclick = () => exportRecargasToExcel(recargasData, userSelector.options[userSelector.selectedIndex].text);

            } catch (error) {
                console.error(error);
                tableContainer.innerHTML = `<p class="text-center p-12 text-red-500 font-bold">Error de conexión: ${error.message}</p>`;
            }
        });

        document.getElementById('backToDataMenuBtn').addEventListener('click', window.showDataMenu);
    }

    function renderRecargasTable(data, container) {
        let html = `
            <table class="min-w-full text-sm text-left border-collapse">
                <thead class="bg-indigo-50 text-indigo-800 uppercase text-xs font-bold">
                    <tr>
                        <th class="p-3 border">Fecha / Hora</th>
                        <th class="p-3 border text-center">Items</th>
                        <th class="p-3 border">Desglose de Productos</th>
                    </tr>
                </thead>
                <tbody class="divide-y">
        `;

        data.forEach(r => {
            const fecha = new Date(r.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
            const resumen = r.detalles.map(d => {
                const cant = d.diferenciaUnidades / d.factorUtilizado;
                const unidad = d.factorUtilizado > 1 ? (d.factorUtilizado === 1 ? 'Und' : 'Cj/Paq') : 'Und';
                return `<span class="inline-block bg-gray-100 px-1 rounded text-[10px] m-0.5">${d.presentacion} (+${cant})</span>`;
            }).join('');

            html += `
                <tr class="hover:bg-gray-50">
                    <td class="p-3 border font-medium text-gray-700">${fecha}</td>
                    <td class="p-3 border text-center font-bold text-indigo-600">${r.totalProductos}</td>
                    <td class="p-3 border">${resumen}</td>
                </tr>
            `;
        });

        container.innerHTML = html + '</tbody></table>';
    }

    function exportRecargasToExcel(data, userName) {
        try {
            const rows = [];
            // Encabezados técnicos
            rows.push(["FECHA Y HORA", "ID TRANSACCIÓN", "PRODUCTO", "CANT. ANTERIOR (UNIDADES BASE)", "CANT. NUEVA (UNIDADES BASE)", "RECUPERACIÓN (DIFERENCIA)", "CANT. VISUAL CARGADA"]);

            data.forEach(r => {
                const fechaStr = new Date(r.fecha).toLocaleString();
                r.detalles.forEach(d => {
                    rows.push([
                        fechaStr,
                        r.id,
                        d.presentacion,
                        d.unidadesAnteriores,
                        d.unidadesNuevas,
                        d.diferenciaUnidades,
                        d.diferenciaUnidades / d.factorUtilizado
                    ]);
                });
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Auditoria Recargas");
            XLSX.writeFile(wb, `Auditoria_Recargas_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (err) {
            console.error(err);
            _showModal('Error', 'No se pudo generar el archivo Excel de auditoría.');
        }
    }

    // --- CONTINUACIÓN: FUNCIONES ORIGINALES (SIN CAMBIOS PARA PRESERVAR LÓGICA) ---

    async function handleExportExcel() {
        if (!_appId || !_userId) { _showModal('Error', 'No se han cargado los datos de sesión correctamente.'); return; }
        _showModal('Progreso', 'Obteniendo datos de inventario y pedidos...');
        try {
            const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const invSnap = await _getDocs(invRef);
            const inventario = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const pedRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
            const pedSnap = await _getDocs(pedRef);
            const pedidos = pedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const obsRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios`);
            const obsSnap = await _getDocs(obsRef);
            const obsequios = obsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const sortFunction = await window.getGlobalProductSortFunction();
            inventario.sort(sortFunction);

            const settings = await getReporteDesignSettings();
            generateFullExcel(inventario, pedidos, obsequios, settings);
        } catch (error) {
            console.error("Error exportando excel:", error);
            _showModal('Error', 'Ocurrió un error al generar el Excel: ' + error.message);
        }
    }

    async function getReporteDesignSettings() {
        try {
            const docRef = _doc(_db, REPORTE_DESIGN_CONFIG_PATH);
            const docSnap = await _getDoc(docRef);
            if (docSnap.exists()) {
                return { ...DEFAULT_REPORTE_SETTINGS, ...docSnap.data() };
            }
        } catch (e) { console.warn("No se pudo cargar config de diseño, usando default.", e); }
        return DEFAULT_REPORTE_SETTINGS;
    }

    function generateFullExcel(inventario, pedidos, obsequios, settings) {
        const wb = XLSX.utils.book_new();
        
        // --- HOJA 1: CARGA ---
        const cargaRows = [];
        const headerInfo = ["PRODUCTO", "CARGA INICIAL", "VENTA TOTAL", "OBSEQUIOS", "CARGA RESTANTE"];
        cargaRows.push(headerInfo);

        inventario.forEach(p => {
            const factor = (p.ventaPor?.cj ? p.unidadesPorCaja : (p.ventaPor?.paq ? p.unidadesPorPaquete : 1)) || 1;
            const unidadLabel = p.ventaPor?.cj ? 'Cj' : (p.ventaPor?.paq ? 'Paq' : 'Und');
            
            let vTotalUnd = 0;
            pedidos.forEach(ped => {
                ped.items?.forEach(it => { if(it.id === p.id) vTotalUnd += (it.cantidad || 0); });
            });
            
            let obsTotalUnd = 0;
            obsequios.forEach(o => {
                o.items?.forEach(it => { if(it.id === p.id) obsTotalUnd += (it.cantidad || 0); });
            });

            const inicialTotal = (p.cantidadUnidades || 0) + vTotalUnd + obsTotalUnd;
            const inicialVisual = (inicialTotal / factor).toFixed(2);
            const ventaVisual = (vTotalUnd / factor).toFixed(2);
            const obsVisual = (obsTotalUnd / factor).toFixed(2);
            const restanteVisual = ((p.cantidadUnidades || 0) / factor).toFixed(2);

            cargaRows.push([p.presentacion, `${inicialVisual} ${unidadLabel}`, `${ventaVisual} ${unidadLabel}`, `${obsVisual} ${unidadLabel}`, `${restanteVisual} ${unidadLabel}`]);
        });

        const wsCarga = XLSX.utils.aoa_to_sheet(rowsToExcelFormat(cargaRows, settings.styles));
        XLSX.utils.book_append_sheet(wb, wsCarga, "CARGA");

        // --- HOJA 2: VENTAS ---
        const ventasRows = [["CLIENTE", "PRODUCTO", "CANTIDAD", "PRECIO", "TOTAL", "MONEDA", "FECHA"]];
        pedidos.forEach(ped => {
            ped.items?.forEach(it => {
                ventasRows.push([ped.clienteNombre, it.presentacion, it.cantidadVisual, it.precioUnitario, it.subtotal, ped.moneda, new Date(ped.fecha).toLocaleDateString()]);
            });
        });
        const wsVentas = XLSX.utils.aoa_to_sheet(ventasRows);
        XLSX.utils.book_append_sheet(wb, wsVentas, "DETALLE VENTAS");

        XLSX.writeFile(wb, `Reporte_General_${new Date().toISOString().split('T')[0]}.xlsx`);
        _showModal('Éxito', 'Excel generado correctamente.');
    }

    function rowsToExcelFormat(rows, styles) { return rows; }

    // --- MAPAS Y VISUALIZACIÓN ---
    async function showMaps() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 h-full flex flex-col">
                <div class="bg-white p-4 rounded-t-lg shadow-md flex justify-between items-center">
                    <h2 class="text-xl font-bold">Ubicación de Clientes</h2>
                    <button id="backFromMaps" class="px-4 py-2 bg-gray-500 text-white rounded">Volver</button>
                </div>
                <div id="map" class="flex-grow rounded-b-lg shadow-inner" style="min-height: 500px; z-index: 1;"></div>
            </div>
        `;

        document.getElementById('backFromMaps').onclick = window.showDataMenu;
        
        // Cargar Leaflet dinámicamente si no existe
        if (!window.L) {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => initMap();
            document.head.appendChild(script);
        } else {
            setTimeout(initMap, 100);
        }
    }

    async function initMap() {
        const defaultCenter = [8.12, -63.54]; // Ajustar según zona
        mapInstance = L.map('map').setView(defaultCenter, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);

        try {
            const clientRef = _collection(_db, `artifacts/${_appId}/public/data/clientes`);
            const snap = await _getDocs(clientRef);
            snap.forEach(doc => {
                const c = doc.data();
                if (c.lat && c.lng) {
                    L.marker([c.lat, c.lng]).addTo(mapInstance).bindPopup(`<b>${c.nombre}</b><br>${c.direccion || 'Sin dirección'}`);
                }
            });
        } catch (e) { console.error("Error cargando mapa:", e); }
    }

    // --- CONFIGURACIÓN DE REPORTE ---
    async function showConfigReporteView() {
        const settings = await getReporteDesignSettings();
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-6">Ajustes del Excel</h2>
                    <div class="space-y-4">
                        <label class="flex items-center"><input type="checkbox" id="checkCargaI" ${settings.showCargaInicial?'checked':''}> <span class="ml-2">Mostrar Carga Inicial</span></label>
                        <label class="flex items-center"><input type="checkbox" id="checkRestante" ${settings.showCargaRestante?'checked':''}> <span class="ml-2">Mostrar Carga Restante</span></label>
                        <button id="saveConfigBtn" class="w-full py-3 bg-green-500 text-white rounded font-bold">Guardar Cambios</button>
                        <button onclick="window.showDataMenu()" class="w-full py-2 bg-gray-400 text-white rounded">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('saveConfigBtn').onclick = async () => {
            const newSet = {
                showCargaInicial: document.getElementById('checkCargaI').checked,
                showCargaRestante: document.getElementById('checkRestante').checked
            };
            await _setDoc(_doc(_db, REPORTE_DESIGN_CONFIG_PATH), newSet);
            _showModal('Éxito', 'Configuración guardada.');
            window.showDataMenu();
        };
    }

    // --- ORDENAMIENTO GLOBAL (PRESERVAR) ---
    window.getGlobalProductSortFunction = async function() {
        if (_sortPreferenceCache) return (a, b) => {
            const key = _sortPreferenceCache[0];
            return (a[key] || '').localeCompare(b[key] || '');
        };
        
        _sortPreferenceCache = ['segmento', 'marca', 'presentacion'];
        return (a, b) => (a.segmento || '').localeCompare(b.segmento || '');
    };

    window.dataModule = {
        showDataMenu,
        getGlobalProductSortFunction
    };

})();

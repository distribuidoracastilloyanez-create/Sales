(function() {
    // Variables locales del módulo
    let _db, _appId, _userId, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _query, _where, _orderBy, _populateDropdown, _getDoc, _doc, _setDoc;

    let _consolidatedClientsCache = [];
    let _filteredClientsCache = [];

    // Instancia del mapa de Leaflet y marcadores
    let mapInstance = null;
    let mapMarkers = new Map();

    // Caché para ordenamiento global
    let _sortPreferenceCache = null;
    let _rubroOrderMapCache = null;
    let _segmentoOrderMapCache = null;
    const SORT_CONFIG_PATH = 'config/productSortOrder'; 

    // RUTAS ACTUALIZADAS PARA EL NUEVO PROYECTO (dist-castillo-sales)
    const REPORTE_DESIGN_CONFIG_PATH = 'artifacts/dist-castillo-sales/public/data/config/reporteCierreVentas';
    
    // Configuración por defecto para el reporte (Estilos XLSX)
    const DEFAULT_REPORTE_SETTINGS = {
        showCargaInicial: true,
        showCargaRestante: true,
        showVaciosSheet: true,
        showClienteTotalSheet: true,
        styles: {
            headerInfo: { font: { bold: true, sz: 14 }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "center" } },
            headerProducts: { font: { bold: true, color: { rgb: "000000" } }, fill: { fgColor: { rgb: "EFEFEF" } }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } },
            rowCargaInicial: { font: { bold: true }, fill: { fgColor: { rgb: "F9FAFB" } }, border: { bottom: { style: 'thin' } } },
            rowDataClients: { font: { sz: 10 }, border: { bottom: { style: 'hair' } } }
        }
    };

    /**
     * Inicializa el módulo con las dependencias inyectadas desde index.html
     */
    window.initData = function(dependencies) {
        _db = dependencies.db;
        _appId = dependencies.appId;
        _userId = dependencies.userId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;

        // Firebase Firestore functions
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
        _orderBy = dependencies.orderBy;
        _populateDropdown = dependencies.populateDropdown;
        _getDoc = dependencies.getDoc;
        _doc = dependencies.doc;
        _setDoc = dependencies.setDoc;

        console.log("Módulo Data Inicializado y vinculado a: dist-castillo-sales");
    };

    /**
     * Motor de ordenamiento global. 
     * Consulta las preferencias del Admin para que el Excel y la App tengan el mismo orden.
     */
    window.getGlobalSortComparator = async function() {
        if (!_sortPreferenceCache) {
            try {
                // Actualizado al nuevo proyecto
                const sRef = _doc(_db, `artifacts/dist-castillo-sales/public/data/${SORT_CONFIG_PATH}`);
                const snap = await _getDoc(sRef);
                if (snap.exists()) {
                    _sortPreferenceCache = snap.data().keys || ['rubro', 'segmento', 'marca', 'presentacion'];
                } else {
                    _sortPreferenceCache = ['rubro', 'segmento', 'marca', 'presentacion'];
                }
            } catch (e) {
                console.warn("Error cargando orden global, usando valores por defecto.", e);
                _sortPreferenceCache = ['rubro', 'segmento', 'marca', 'presentacion'];
            }
        }

        // Cargar mapas de ordenamiento (Rubros y Sectores) para prioridad numérica
        if (!_rubroOrderMapCache) {
            _rubroOrderMapCache = {};
            try {
                const rSnap = await _getDocs(_collection(_db, `artifacts/dist-castillo-sales/public/data/rubros`));
                rSnap.docs.forEach(d => { _rubroOrderMapCache[d.data().name] = d.data().orden ?? 9999; });
            } catch (e) { console.error("Error cargando orden de rubros."); }
        }

        if (!_segmentoOrderMapCache) {
            _segmentoOrderMapCache = {};
            try {
                const sSnap = await _getDocs(_collection(_db, `artifacts/dist-castillo-sales/public/data/sectores`));
                sSnap.docs.forEach(d => { _segmentoOrderMapCache[d.data().name] = d.data().orden ?? 9999; });
            } catch (e) { console.error("Error cargando orden de segmentos."); }
        }

        return (a, b) => {
            for (const key of _sortPreferenceCache) {
                let valA, valB, res = 0;
                switch (key) {
                    case 'rubro':
                        valA = _rubroOrderMapCache[a.rubro] ?? 9999;
                        valB = _rubroOrderMapCache[b.rubro] ?? 9999;
                        res = valA - valB;
                        if (res === 0) res = (a.rubro || '').localeCompare(b.rubro || '');
                        break;
                    case 'segmento':
                        valA = _segmentoOrderMapCache[a.segmento] ?? 9999;
                        valB = _segmentoOrderMapCache[b.segmento] ?? 9999;
                        res = valA - valB;
                        if (res === 0) res = (a.segmento || '').localeCompare(b.segmento || '');
                        break;
                    case 'marca':
                        res = (a.marca || '').localeCompare(b.marca || '');
                        break;
                    case 'presentacion':
                        res = (a.presentacion || '').localeCompare(b.presentacion || '');
                        break;
                }
                if (res !== 0) return res;
            }
            return 0;
        };
    };

    /**
     * Renderiza la vista de Reportes, Mapas y Cierre.
     */
    const renderReportes = async () => {
        _mainContent.innerHTML = `
            <div class="space-y-6 animate-fade-in-up pb-24">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h2 class="text-3xl font-black text-gray-900 tracking-tight">Análisis de Jornada</h2>
                        <p class="text-gray-500 text-sm font-medium">Mapas de calor y reportes de exportación</p>
                    </div>
                    <div class="flex gap-2 w-full md:w-auto">
                         <button id="btnExportarCierre" class="flex-1 md:flex-none bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition shadow-lg font-bold text-sm flex items-center justify-center">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Generar Excel Pro
                         </button>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="space-y-1">
                        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fecha de Operación</label>
                        <input type="date" id="reporteFecha" class="w-full p-4 rounded-xl bg-gray-50 border-none ring-1 ring-gray-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    </div>
                    <div class="space-y-1">
                        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Zona / Sector</label>
                        <select id="reporteSector" class="w-full p-4 rounded-xl bg-gray-50 border-none ring-1 ring-gray-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-white font-bold text-gray-700">
                            <option value="">Todas las zonas</option>
                        </select>
                    </div>
                    <div class="flex items-end">
                        <button id="btnConsultarJornada" class="w-full bg-gray-900 text-white p-4 rounded-xl font-bold hover:bg-black transition shadow-sm">Visualizar Datos</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden h-[550px] relative">
                        <div id="reporteMap" class="w-full h-full z-10"></div>
                        <div id="mapOverlay" class="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center transition-opacity">
                            <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                            </div>
                            <p class="text-gray-400 font-bold text-xs uppercase tracking-widest text-center px-10 leading-relaxed">Selecciona una fecha y presiona "Visualizar" para trazar la ruta del día</p>
                        </div>
                    </div>
                    
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[550px]">
                        <h3 class="font-bold text-gray-800 mb-6 flex items-center border-b pb-4">
                            <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            Métricas de Desempeño
                        </h3>
                        <div id="resumenContent" class="space-y-4 flex-grow overflow-y-auto pr-1 custom-scrollbar">
                            <p class="text-xs text-gray-400 italic text-center py-20">No hay datos procesados para esta consulta.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnConsultarJornada').addEventListener('click', consultarJornada);
        document.getElementById('btnExportarCierre').addEventListener('click', exportarExcelCierre);

        // Población de sectores para el filtro de reporte
        try {
            const sectRef = _collection(_db, `artifacts/dist-castillo-sales/public/data/sectores`);
            const snap = await _getDocs(sectRef);
            const select = document.getElementById('reporteSector');
            snap.docs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.data().name;
                opt.textContent = d.data().name;
                select.appendChild(opt);
            });
        } catch (e) { console.error("Error cargando sectores para reporte."); }

        initLeafletMap();
    };

    /**
     * Configuración del mapa base.
     */
    const initLeafletMap = () => {
        if (mapInstance) mapInstance.remove();
        mapInstance = L.map('reporteMap', { zoomControl: false }).setView([10.4806, -66.9036], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(mapInstance);
        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
    };

    /**
     * Consulta Firestore, filtra por fecha y actualiza el mapa y el resumen lateral.
     */
    const consultarJornada = async () => {
        const fecha = document.getElementById('reporteFecha').value;
        const sector = document.getElementById('reporteSector').value;
        
        if (!fecha) return _showModal('Falta Información', 'Debes seleccionar el día que deseas visualizar.');

        _showModal('Consultando...', '<div class="flex flex-col items-center p-8"><div class="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div><p class="text-xs font-bold text-gray-500 uppercase">Obteniendo registros de ventas...</p></div>');

        try {
            const vRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
            const q = _query(vRef, _where('fechaString', '==', fecha));
            const snap = await _getDocs(q);
            
            let ventas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filtro por sector (si aplica)
            if (sector) {
                ventas = ventas.filter(v => v.clienteSector === sector);
            }

            const modal = document.getElementById('modalContainer');
            if(modal) modal.classList.add('hidden');

            const overlay = document.getElementById('mapOverlay');
            const resumen = document.getElementById('resumenContent');

            if (ventas.length === 0) {
                resumen.innerHTML = '<div class="bg-red-50 p-6 rounded-2xl border border-red-100 text-center"><p class="text-red-700 font-bold text-xs uppercase tracking-widest">Sin ventas registradas</p><p class="text-red-400 text-[10px] mt-1">No hay datos de GPS para mostrar en esta fecha.</p></div>';
                if(overlay) overlay.style.opacity = '1';
                return;
            }

            if(overlay) overlay.style.opacity = '0';

            const totalMonto = ventas.reduce((acc, v) => acc + (v.total || 0), 0);
            
            // Actualizar Resumen Lateral con Estilo
            resumen.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                        <span class="block text-[9px] font-black text-blue-400 uppercase tracking-widest">Pedidos</span>
                        <span class="text-2xl font-black text-blue-700">${ventas.length}</span>
                    </div>
                    <div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                        <span class="block text-[9px] font-black text-emerald-400 uppercase tracking-widest">Monto Total</span>
                        <span class="text-2xl font-black text-emerald-700">$${totalMonto.toFixed(1)}</span>
                    </div>
                </div>
                <div class="mt-6 border-t pt-4">
                    <h4 class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Recorrido Detallado</h4>
                    <div class="space-y-2">
                        ${ventas.sort((a,b) => b.total - a.total).map(v => `
                            <div class="p-4 bg-white border rounded-2xl flex justify-between items-center hover:bg-gray-50 transition-all cursor-pointer shadow-sm border-gray-100">
                                <div class="truncate pr-2">
                                    <p class="text-xs font-black text-gray-800 truncate">${v.clienteNombre || 'Cliente S/N'}</p>
                                    <p class="text-[10px] text-gray-400 font-medium">${v.clienteSector || 'Sin Zona'}</p>
                                </div>
                                <span class="shrink-0 text-xs font-black text-blue-600 tracking-tighter">$${(v.total || 0).toFixed(1)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            // Actualizar Marcadores y Polilínea
            mapMarkers.forEach(m => mapInstance.removeLayer(m));
            mapMarkers.clear();

            const routePoints = [];
            ventas.forEach(v => {
                if (v.location && v.location.lat) {
                    const marker = L.circleMarker([v.location.lat, v.location.lng], {
                        radius: 8,
                        fillColor: "#3b82f6",
                        color: "#fff",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(mapInstance);
                    
                    marker.bindPopup(`
                        <div class="p-1">
                            <p class="font-black text-gray-900">${v.clienteNombre}</p>
                            <p class="text-blue-600 font-bold">$${v.total.toFixed(2)}</p>
                        </div>
                    `);
                    
                    mapMarkers.set(v.id, marker);
                    routePoints.push([v.location.lat, v.location.lng]);
                }
            });

            if (routePoints.length > 1) {
                const polyline = L.polyline(routePoints, { color: '#3b82f6', weight: 3, dashArray: '5, 10', opacity: 0.5 }).addTo(mapInstance);
                mapMarkers.set('route', polyline);
                mapInstance.fitBounds(routePoints, { padding: [50, 50] });
            } else if (routePoints.length === 1) {
                mapInstance.setView(routePoints[0], 16);
            }

        } catch (e) {
            console.error("Error en consulta:", e);
            _showModal('Error', 'No se pudieron sincronizar los datos geográficos.');
        }
    };

    /**
     * GENERACIÓN DE CIERRE EXCEL PROFESIONAL (Basado en SheetJS)
     * Reconstruido con toda la lógica de consolidación de inventario y ventas.
     */
    const exportarExcelCierre = async () => {
        const fecha = document.getElementById('reporteFecha').value;
        if (!fecha) return _showModal('Atención', 'Selecciona la fecha de la cual deseas generar el reporte de cierre.');

        _showModal('Generando Reporte...', '<div class="p-8 text-center"><div class="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div><p class="text-xs font-black text-gray-500 uppercase tracking-widest">Consolidando Carga, Inventario y Deudas...</p></div>');

        try {
            // 1. Obtener Ventas de la fecha seleccionada
            const vRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
            const vSnap = await _getDocs(_query(vRef, _where('fechaString', '==', fecha)));
            const ventas = vSnap.docs.map(d => d.data());

            // 2. Obtener Inventario del usuario (Carga Inicial/Restante)
            const iRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const iSnap = await _getDocs(iRef);
            const inventario = iSnap.docs.map(d => d.data());

            // 3. Obtener Configuración de Estilo y Preferencias (Desde el nuevo proyecto)
            const configRef = _doc(_db, REPORTE_DESIGN_CONFIG_PATH);
            const configSnap = await _getDoc(configRef);
            const settings = configSnap.exists() ? configSnap.data() : DEFAULT_REPORTE_SETTINGS;

            // --- LÓGICA DE CONSOLIDACIÓN ---
            const productosUnicosMap = new Map();
            const consolidadoClientes = [];
            const deudasVacios = new Map();

            // Identificar todos los productos que tuvieron movimiento en la jornada
            ventas.forEach(v => {
                const clienteInfo = { 
                    nombre: v.clienteNombre, 
                    total: v.total, 
                    productos: v.productos || [],
                    vaciosDevueltos: v.vaciosDevueltosPorTipo || {}
                };
                consolidadoClientes.push(clienteInfo);

                clienteInfo.productos.forEach(p => {
                    const key = `${p.rubro}-${p.marca}-${p.presentacion}`;
                    if (!productosUnicosMap.has(key)) {
                        productosUnicosMap.set(key, { 
                            rubro: p.rubro, marca: p.marca, presentacion: p.presentacion,
                            ventaUnd: 0, stockIni: 0, id: p.id
                        });
                    }
                    productosUnicosMap.get(key).ventaUnd += (p.totalUnidadesVendidas || 0);
                });
            });

            // Cruzar con el stock inicial del inventario
            inventario.forEach(i => {
                const key = `${i.rubro}-${i.marca}-${i.presentacion}`;
                if (productosUnicosMap.has(key)) {
                    productosUnicosMap.get(key).stockIni = (i.stock || 0);
                }
            });

            // Ordenar productos según preferencia del Admin
            const comparator = await window.getGlobalSortComparator();
            const productosOrdenados = Array.from(productosUnicosMap.values()).sort(comparator);

            // --- CONSTRUCCIÓN DEL LIBRO XLSX ---
            const wb = XLSX.utils.book_new();

            // HOJA 1: RESUMEN DE JORNADA (MOVIMIENTO DE CAMIÓN)
            const hoja1Data = [
                ["DISTRIBUIDORA CASTILLO - REPORTE DE CIERRE"],
                ["FECHA OPERATIVA:", fecha],
                ["ID VENDEDOR:", _userId],
                [""],
                ["RUBRO", "MARCA", "PRESENTACIÓN", "CARGA INICIAL", "VENTA (UND)", "CARGA RESTANTE"]
            ];

            productosOrdenados.forEach(p => {
                hoja1Data.push([p.rubro, p.marca, p.presentacion, p.stockIni, p.ventaUnd, (p.stockIni - p.ventaUnd)]);
            });

            const wsResumen = XLSX.utils.aoa_to_sheet(hoja1Data);
            XLSX.utils.book_append_sheet(wb, wsResumen, "Movimiento de Carga");

            // HOJA 2: DETALLE POR CLIENTE (MATRIZ DE VENTAS)
            const hoja2Data = [
                ["DETALLE DE VENTAS POR CLIENTE"],
                ["FECHA:", fecha],
                [""]
            ];

            const headerRow = ["CLIENTE", "TOTAL $"];
            productosOrdenados.forEach(p => headerRow.push(`${p.marca} ${p.presentacion}`));
            hoja2Data.push(headerRow);

            consolidadoClientes.forEach(c => {
                const row = [c.nombre, c.total];
                productosOrdenados.forEach(prodRef => {
                    const match = c.productos.find(p => p.rubro === prodRef.rubro && p.marca === prodRef.marca && p.presentacion === prodRef.presentacion);
                    row.push(match ? match.totalUnidadesVendidas : 0);
                });
                hoja2Data.push(row);
            });

            const wsClientes = XLSX.utils.aoa_to_sheet(hoja2Data);
            XLSX.utils.book_append_sheet(wb, wsClientes, "Matriz de Clientes");

            // HOJA 3: CONTROL DE VACÍOS (DEVOLUCIONES)
            const hoja3Data = [
                ["CONTROL DE ENVASES RETORNABLES"],
                ["DÍA:", fecha],
                [""],
                ["CLIENTE", "1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"]
            ];

            consolidadoClientes.forEach(c => {
                const dv = c.vaciosDevueltos;
                hoja3Data.push([
                    c.nombre, 
                    dv["1/4 - 1/3"] || 0, 
                    dv["ret 350 ml"] || 0, 
                    dv["ret 1.25 Lts"] || 0
                ]);
            });

            const wsVacios = XLSX.utils.aoa_to_sheet(hoja3Data);
            XLSX.utils.book_append_sheet(wb, wsVacios, "Control de Vacíos");

            // GENERAR Y DESCARGAR
            const fileName = `CIERRE_${fecha}_${_userId.substring(0, 5)}.xlsx`;
            XLSX.writeFile(wb, fileName);

            const modalClose = document.getElementById('modalContainer');
            if(modalClose) modalClose.classList.add('hidden');

        } catch (error) {
            console.error("Fallo crítico en generación de Excel:", error);
            _showModal('Error Grave', 'No se pudo generar el cierre de Excel. Revisa los permisos de escritura y tu conexión.');
        }
    };

    // Publicación del Módulo
    window.dataModule = {
        renderReportes
    };

})();

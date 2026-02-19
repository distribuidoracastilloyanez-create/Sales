(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;
    let _increment; 

    // --- SISTEMA DE CACHÉ DOBLE (FASE 2) ---
    let _masterCatalogCache = {}; // Datos públicos
    let _userStockCache = {};     // Datos privados
    let _inventarioCache = [];    // Fusión
    
    let _listenersUnsubscribes = []; 

    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _recargaTempState = {}; 

    // --- CACHÉ DE ORDENAMIENTO GLOBAL ---
    let _globalSortCache = {
        rubros: null,
        segmentos: null,
        marcas: null
    };

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID; 

    window.initInventario = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _activeListeners = dependencies.activeListeners;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _showAddItemModal = dependencies.showAddItemModal;
        _populateDropdown = dependencies.populateDropdown;
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _query = dependencies.query;
        _where = dependencies.where;
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch;
        _getDoc = dependencies.getDoc;
        _increment = dependencies.increment; 
        
        console.log("Módulo Inventario FASE 2 Inicializado. Public ID:", PUBLIC_DATA_ID);
    };

    function startMainInventarioListener(callback) {
        _listenersUnsubscribes.forEach(unsub => { try { unsub(); } catch(e) {} });
        _listenersUnsubscribes = [];

        const combineAndNotify = () => {
            _inventarioCache = [];
            const allIds = new Set([...Object.keys(_masterCatalogCache), ...Object.keys(_userStockCache)]);
            
            allIds.forEach(id => {
                const master = _masterCatalogCache[id];
                const stockData = _userStockCache[id];
                
                if (master) {
                    _inventarioCache.push({ ...master, cantidadUnidades: stockData ? (stockData.cantidadUnidades || 0) : 0, id: id });
                } else if (stockData) {
                    _inventarioCache.push({ ...stockData, id: id });
                }
            });

            if (callback && typeof callback === 'function') {
                Promise.resolve(callback()).catch(cbError => console.error("Callback Error:", cbError));
            }
        };

        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);
        const unsubMaster = _onSnapshot(masterRef, (snap) => {
            _masterCatalogCache = {};
            snap.forEach(d => { _masterCatalogCache[d.id] = { id: d.id, ...d.data() }; });
            combineAndNotify();
        }, (err) => handleListenerError(err, "Maestro"));
        _listenersUnsubscribes.push(unsubMaster);

        const stockRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubStock = _onSnapshot(stockRef, (snap) => {
            _userStockCache = {};
            snap.forEach(d => { _userStockCache[d.id] = { id: d.id, ...d.data() }; });
            combineAndNotify();
        }, (err) => handleListenerError(err, "Stock"));
        _listenersUnsubscribes.push(unsubStock);

        _activeListeners.push(..._listenersUnsubscribes);
    }

    function handleListenerError(error, source) {
        if (error.code === 'permission-denied' || error.code === 'unauthenticated') return;
        if (error.code !== 'cancelled' && source === "Stock") _showModal('Error', 'Fallo de conexión inventario.');
    }

    // ==============================================================================
    // --- LÓGICA MAESTRA DE ORDENAMIENTO ESTRICTO (JERARQUÍA COMPLETA) ---
    // ==============================================================================
    window.getGlobalProductSortFunction = async () => {
        if (!_globalSortCache.rubros || !_globalSortCache.segmentos || !_globalSortCache.marcas) {
            try {
                const [rSnap, sSnap, mSnap] = await Promise.all([
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`)),
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`)),
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`))
                ]);

                _globalSortCache.rubros = {};
                rSnap.forEach(d => _globalSortCache.rubros[d.data().name] = d.data().orden ?? 9999);

                _globalSortCache.segmentos = {};
                sSnap.forEach(d => _globalSortCache.segmentos[d.data().name] = { 
                    orden: d.data().orden ?? 9999, 
                    marcaOrder: d.data().marcaOrder || [] 
                });

                _globalSortCache.marcas = {};
                mSnap.forEach(d => _globalSortCache.marcas[d.data().name] = { 
                    productOrder: d.data().productOrder || [] 
                });
            } catch (e) { 
                console.warn("Error cargando caché de orden:", e);
                _globalSortCache.rubros = {}; _globalSortCache.segmentos = {}; _globalSortCache.marcas = {};
            }
        }

        return (a, b) => {
            const safeA = a || {}; const safeB = b || {};
            let res = 0;

            // 1. RUBRO
            const rA = _globalSortCache.rubros[safeA.rubro] ?? 9999;
            const rB = _globalSortCache.rubros[safeB.rubro] ?? 9999;
            res = rA - rB;
            if (res !== 0) return res;
            res = (safeA.rubro || '').localeCompare(safeB.rubro || '');
            if (res !== 0) return res;

            // 2. SEGMENTO
            const sA = _globalSortCache.segmentos[safeA.segmento]?.orden ?? 9999;
            const sB = _globalSortCache.segmentos[safeB.segmento]?.orden ?? 9999;
            res = sA - sB;
            if (res !== 0) return res;
            res = (safeA.segmento || '').localeCompare(safeB.segmento || '');
            if (res !== 0) return res;

            // 3. MARCA (Dentro del Segmento)
            const segData = _globalSortCache.segmentos[safeA.segmento];
            if (segData && segData.marcaOrder) {
                const idxA = segData.marcaOrder.indexOf(safeA.marca);
                const idxB = segData.marcaOrder.indexOf(safeB.marca);
                if (idxA !== -1 && idxB !== -1) res = idxA - idxB;
                else if (idxA !== -1) res = -1;
                else if (idxB !== -1) res = 1;
            }
            if (res !== 0) return res;
            res = (safeA.marca || '').localeCompare(safeB.marca || '');
            if (res !== 0) return res;

            // 4. PRESENTACIÓN (Dentro de la Marca)
            const marcaData = _globalSortCache.marcas[safeA.marca];
            if (marcaData && marcaData.productOrder) {
                const idxA = marcaData.productOrder.indexOf(safeA.id);
                const idxB = marcaData.productOrder.indexOf(safeB.id);
                if (idxA !== -1 && idxB !== -1) res = idxA - idxB;
                else if (idxA !== -1) res = -1;
                else if (idxB !== -1) res = 1;
            }
            if (res !== 0) return res;
            
            // 5. NOMBRES IDÉNTICOS (Tie-breaker)
            res = (safeA.presentacion || '').localeCompare(safeB.presentacion || '');
            if (res !== 0) return res;

            // 6. SOLUCIÓN DEFINITIVA PARA NOMBRES DUPLICADOS: Ordenar por ID para mantener estabilidad
            return (safeA.id || '').localeCompare(safeB.id || '');
        };
    };

    function invalidateSegmentOrderCache() {
        _globalSortCache = { rubros: null, segmentos: null, marcas: null };
        if (window.catalogoModule?.invalidateCache) window.catalogoModule.invalidateCache();
        if (window.ventasModule?.invalidateCache) window.ventasModule.invalidateCache();
    }

    function populateRubrosFromCache(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentVal = select.value;
        const rubros = new Set();
        _inventarioCache.forEach(p => { if (p.rubro) rubros.add(p.rubro); });
        const sorted = [...rubros].sort();
        select.innerHTML = '<option value="">Todos</option>';
        sorted.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r; opt.textContent = r;
            if (r === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
        if (currentVal && !rubros.has(currentVal)) select.value = "";
    }

    // --- VISTAS ---
    window.showInventarioSubMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _listenersUnsubscribes.forEach(u => u()); _listenersUnsubscribes = [];
        const isAdmin = _userRole === 'admin';
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Inventario</h1>
                        <div class="space-y-4">
                            <button id="verModificarBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Ver Productos / ${isAdmin ? 'Modificar Def.' : 'Consultar Stock'}</button>
                            ${isAdmin ? `<button id="agregarProductoBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Agregar Producto</button>` : ''}
                            <button id="recargaProductosBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Recarga de Productos</button>
                            ${isAdmin ? `<button id="ordenarSegmentosBtn" class="w-full px-6 py-3 bg-purple-500 text-white font-semibold rounded-lg shadow-md hover:bg-purple-600">Ordenar Segmentos y Marcas</button>` : ''}
                            ${isAdmin ? `<button id="modificarDatosBtn" class="w-full px-6 py-3 bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-yellow-600">Modificar Datos Maestros</button>` : ''}
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú Principal</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('verModificarBtn').addEventListener('click', () => {
            _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
            showModifyDeleteView();
        });
        if (isAdmin) {
            document.getElementById('agregarProductoBtn')?.addEventListener('click', showAgregarProductoView);
            document.getElementById('ordenarSegmentosBtn')?.addEventListener('click', showOrdenarSegmentosMarcasView);
            document.getElementById('modificarDatosBtn')?.addEventListener('click', showModificarDatosView);
        }
        document.getElementById('recargaProductosBtn').addEventListener('click', showRecargaProductosView);
        document.getElementById('backToMenuBtn').addEventListener('click', () => {
            _listenersUnsubscribes.forEach(u => u());
            _showMainMenu();
        });
    }

    async function showModifyDeleteView() {
         if (_floatingControls) _floatingControls.classList.add('hidden'); 
         const isAdmin = _userRole === 'admin';
        
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl"> <h2 class="text-2xl font-bold mb-6 text-center">Ver Productos / ${isAdmin?'Modificar Def.':'Consultar Stock'}</h2> ${getFiltrosHTML('modify')} <div id="productosListContainer" class="overflow-x-auto max-h-[60vh] border rounded-lg"> <p class="text-gray-500 text-center p-4">Cargando...</p> </div> <div class="mt-6 flex flex-col sm:flex-row gap-4"> <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button> ${isAdmin?`<button id="deleteAllProductosBtn" class="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700">Eliminar Todos</button>`:''} </div> </div> </div> </div>`;

        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        if (isAdmin) document.getElementById('deleteAllProductosBtn')?.addEventListener('click', handleDeleteAllProductos);

        const baseRender = () => renderProductosList('productosListContainer', !isAdmin);
        const { updateDependentDropdowns } = setupFiltros('modify', baseRender);

        const rubroSelect = document.getElementById('modify-filter-rubro');
        if (rubroSelect) rubroSelect.value = _lastFilters.rubro || '';

        let isFirstLoad = true;
        const smartListenerCallback = async () => {
            await baseRender();
            populateRubrosFromCache('modify-filter-rubro'); 
            if (isFirstLoad && _inventarioCache.length > 0) {
                updateDependentDropdowns('init');
                await baseRender();
                isFirstLoad = false;
            }
        };
        startMainInventarioListener(smartListenerCallback);
    }

    function getFiltrosHTML(prefix) {
        const currentSearch = _lastFilters.searchTerm || '';
        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                <input type="text" id="${prefix}-search-input" placeholder="Buscar por Presentación, Marca o Segmento..." class="md:col-span-4 w-full px-4 py-2 border rounded-lg text-sm" value="${currentSearch}">
                <div>
                    <label for="${prefix}-filter-rubro" class="text-xs font-medium text-gray-700">Rubro</label>
                    <select id="${prefix}-filter-rubro" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500"><option value="">Todos</option></select>
                </div>
                <div>
                    <label for="${prefix}-filter-segmento" class="text-xs font-medium text-gray-700">Segmento</label>
                    <select id="${prefix}-filter-segmento" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500" disabled><option value="">Todos</option></select>
                </div>
                <div>
                    <label for="${prefix}-filter-marca" class="text-xs font-medium text-gray-700">Marca</label>
                    <select id="${prefix}-filter-marca" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500" disabled><option value="">Todos</option></select>
                </div>
                <button id="${prefix}-clear-filters-btn" class="bg-gray-300 text-xs font-semibold text-gray-700 rounded-lg self-end py-1.5 px-3 hover:bg-gray-400 transition duration-150">Limpiar</button>
            </div>
        `;
    }

    function setupFiltros(prefix, renderCallback) {
        const searchInput=document.getElementById(`${prefix}-search-input`);
        const rubroFilter=document.getElementById(`${prefix}-filter-rubro`);
        const segmentoFilter=document.getElementById(`${prefix}-filter-segmento`);
        const marcaFilter=document.getElementById(`${prefix}-filter-marca`);
        const clearBtn=document.getElementById(`${prefix}-clear-filters-btn`);
        if(!searchInput || !rubroFilter || !segmentoFilter || !marcaFilter || !clearBtn) return {};

        function updateDependentDropdowns(trigger) {
            const selectedRubro = rubroFilter.value;
            const currentSegmentoValue = (trigger === 'init' || trigger === 'rubro') ? _lastFilters.segmento : segmentoFilter.value;
            const currentMarcaValue = (trigger === 'init' || trigger === 'rubro' || trigger === 'segmento') ? _lastFilters.marca : marcaFilter.value;

            segmentoFilter.innerHTML = '<option value="">Todos</option>'; segmentoFilter.disabled = true; segmentoFilter.value = "";
            if (selectedRubro) {
                const segmentos = [...new Set(_inventarioCache.filter(p => p.rubro === selectedRubro && p.segmento).map(p => p.segmento))].sort();
                if (segmentos.length > 0) {
                    segmentos.forEach(s => { const option = document.createElement('option'); option.value = s; option.textContent = s; if (s === currentSegmentoValue) { option.selected = true; } segmentoFilter.appendChild(option); });
                    segmentoFilter.disabled = false; segmentoFilter.value = currentSegmentoValue; 
                }
            }
            if (segmentoFilter.value !== currentSegmentoValue) { _lastFilters.segmento = ''; }

            marcaFilter.innerHTML = '<option value="">Todos</option>'; marcaFilter.disabled = true; marcaFilter.value = "";
            if (selectedRubro) {
                const marcas = [...new Set(_inventarioCache.filter(p => p.rubro === selectedRubro && (!segmentoFilter.value || p.segmento === segmentoFilter.value) && p.marca).map(p => p.marca))].sort();
                if (marcas.length > 0) {
                    marcas.forEach(m => { const option = document.createElement('option'); option.value = m; option.textContent = m; if (m === currentMarcaValue) { option.selected = true; } marcaFilter.appendChild(option); });
                    marcaFilter.disabled = false; marcaFilter.value = currentMarcaValue;
                }
            }
            if (marcaFilter.value !== currentMarcaValue) { _lastFilters.marca = ''; }
        }

        const applyAndSaveChanges = () => {
            _lastFilters.searchTerm = searchInput.value || '';
            _lastFilters.rubro = rubroFilter.value || '';
            _lastFilters.segmento = segmentoFilter.value || '';
            _lastFilters.marca = marcaFilter.value || '';
            if (typeof renderCallback === 'function') renderCallback();
        };

        searchInput.addEventListener('input', applyAndSaveChanges);
        rubroFilter.addEventListener('change', () => { _lastFilters.segmento = ''; _lastFilters.marca = ''; updateDependentDropdowns('rubro'); applyAndSaveChanges(); });
        segmentoFilter.addEventListener('change', () => { _lastFilters.marca = ''; updateDependentDropdowns('segmento'); applyAndSaveChanges(); });
        marcaFilter.addEventListener('change', applyAndSaveChanges);
        clearBtn.addEventListener('click', () => { searchInput.value = ''; rubroFilter.value = ''; _lastFilters.segmento = ''; _lastFilters.marca = ''; updateDependentDropdowns('rubro'); applyAndSaveChanges(); });
        
        return { updateDependentDropdowns };
    }

    async function renderProductosList(elementId, readOnly = false) {
        const container = document.getElementById(elementId);
        if (!container) { return; }

        let productosFiltrados = [..._inventarioCache];
        productosFiltrados = productosFiltrados.filter(p => {
            const searchTermLower = (_lastFilters.searchTerm || '').toLowerCase();
            const textMatch = !searchTermLower ||
                (p.presentacion && p.presentacion.toLowerCase().includes(searchTermLower)) ||
                (p.marca && p.marca.toLowerCase().includes(searchTermLower)) ||
                (p.segmento && p.segmento.toLowerCase().includes(searchTermLower));
            const rubroMatch = !_lastFilters.rubro || p.rubro === _lastFilters.rubro;
            const segmentoMatch = !_lastFilters.segmento || p.segmento === _lastFilters.segmento;
            const marcaMatch = !_lastFilters.marca || p.marca === _lastFilters.marca;
            return textMatch && rubroMatch && segmentoMatch && marcaMatch;
        });

        // Ordenamos toda la lista
        const sortFunction = await window.getGlobalProductSortFunction();
        productosFiltrados.sort(sortFunction);

        if (productosFiltrados.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 p-4">No hay productos que coincidan con los filtros seleccionados.</p>`;
            return;
        }

        const cols = readOnly ? 4 : 5;
        let tableHTML = `<table class="min-w-full bg-white text-sm"> <thead class="bg-gray-200 sticky top-0 z-10"> <tr> <th class="py-2 px-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Presentación</th> <th class="py-2 px-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Marca</th> <th class="py-2 px-3 text-right font-semibold text-gray-600 uppercase tracking-wider">Precio</th> <th class="py-2 px-3 text-center font-semibold text-gray-600 uppercase tracking-wider">Stock</th> ${!readOnly ? `<th class="py-2 px-3 text-center font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>` : ''} </tr> </thead> <tbody>`;
        
        let lastSegmento = null;

        productosFiltrados.forEach(p => {
            // Agrupación visual siempre por Segmento para mantener orden lógico en pantalla
            const currentSegmento = p.segmento || `Sin Segmento`;
            if (currentSegmento !== lastSegmento) {
                lastSegmento = currentSegmento;
                tableHTML += `<tr><td colspan="${cols}" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastSegmento}</td></tr>`;
            }
            
            const ventaPor = p.ventaPor || {und:true};
            const precios = p.precios || {und: p.precioPorUnidad || 0};
            let displayPresentacion = p.presentacion || 'N/A';
            let displayPrecio = '$0.00';
            let displayStock = `${p.cantidadUnidades || 0} Und`;
            let conversionFactorStock = 1;
            let stockUnitType = 'Und';

            if (ventaPor.cj) {
                if (p.unidadesPorCaja) displayPresentacion += ` (${p.unidadesPorCaja} und.)`;
                displayPrecio = `$${(precios.cj || 0).toFixed(2)}`;
                conversionFactorStock = Math.max(1, p.unidadesPorCaja || 1);
                stockUnitType = 'Cj';
            } else if (ventaPor.paq) {
                if (p.unidadesPorPaquete) displayPresentacion += ` (${p.unidadesPorPaquete} und.)`;
                displayPrecio = `$${(precios.paq || 0).toFixed(2)}`;
                conversionFactorStock = Math.max(1, p.unidadesPorPaquete || 1);
                stockUnitType = 'Paq';
            } else {
                displayPrecio = `$${(precios.und || 0).toFixed(2)}`;
            }
            displayStock = `${Math.floor((p.cantidadUnidades || 0) / conversionFactorStock)} ${stockUnitType}`;
            const stockUnidadesBaseTitle = `${p.cantidadUnidades || 0} Und. Base`;

            tableHTML += `<tr class="hover:bg-gray-50 border-b"> <td class="py-2 px-3 text-gray-800">${displayPresentacion}</td> <td class="py-2 px-3 text-gray-700">${p.marca || 'S/M'}</td> <td class="py-2 px-3 text-right font-medium text-gray-900">${displayPrecio}</td> <td class="py-2 px-3 text-center font-medium text-gray-900" title="${stockUnidadesBaseTitle}">${displayStock}</td> ${!readOnly ? `<td class="py-2 px-3 text-center space-x-1"> <button onclick="window.inventarioModule.editProducto('${p.id}')" class="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-50" title="Editar Definición">Edt</button> <button onclick="window.inventarioModule.deleteProducto('${p.id}')" class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-50" title="Eliminar Producto">Del</button> </td>` : ''} </tr>`;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }

    async function showAgregarProductoView() {
        if (_userRole !== 'admin') return;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto max-w-2xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center"> <h2 class="text-2xl font-bold mb-6">Agregar Nuevo Producto</h2> <form id="addProductoForm" class="space-y-4 text-left"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="rubro">Rubro:</label> <div class="flex items-center space-x-2"> <select id="rubro" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('rubros','Rubro')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="segmento">Segmento:</label> <div class="flex items-center space-x-2"> <select id="segmento" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('segmentos','Segmento')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="marca">Marca:</label> <div class="flex items-center space-x-2"> <select id="marca" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('marcas','Marca')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="presentacion">Presentación:</label> <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required> </div> </div> <div class="border-t pt-4 mt-4"> <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <div> <label class="block mb-2 font-medium">Venta por:</label> <div id="ventaPorContainer" class="flex space-x-4"> <label class="flex items-center"><input type="checkbox" id="ventaPorUnd" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Und.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorPaq" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Paq.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorCj" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Cj.</span></label> </div> </div> <div class="mt-4 md:mt-0"> <label class="flex items-center cursor-pointer"> <input type="checkbox" id="manejaVaciosCheck" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2 font-medium">Maneja Vacío</span> </label> <div id="tipoVacioContainer" class="mt-2 hidden"> <label for="tipoVacioSelect" class="block text-sm font-medium">Tipo:</label> <select id="tipoVacioSelect" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-gray-50"> <option value="">Seleccione...</option> <option value="1/4 - 1/3">1/4 - 1/3</option> <option value="ret 350 ml">Ret 350 ml</option> <option value="ret 1.25 Lts">Ret 1.25 Lts</option> </select> </div> </div> </div> <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"></div> <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div> </div> <div class="border-t pt-4 mt-4"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="cantidadActual" class="block font-medium">Stock Inicial (Und. Base):</label> <input type="number" id="cantidadActual" value="0" min="0" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white text-gray-700"> </div> <div> <label for="ivaTipo" class="block font-medium">IVA:</label> <select id="ivaTipo" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white" required> <option value="16">16%</option> <option value="0">Exento 0%</option> </select> </div> </div> </div> <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 transition duration-150">Agregar Producto</button> </form> <button id="backToMenuBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-150">Volver</button> </div> </div> </div>`;

        await Promise.all([
            populateRubrosFromCache('rubro'), 
            populateRubrosFromCache('segmento'),
            _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'rubro', 'Rubro'),
            _populateDropdown(`artifacts/${_appId}/users/${_userId}/segmentos`, 'segmento', 'Segmento'),
            _populateDropdown(`artifacts/${_appId}/users/${_userId}/marcas`, 'marca', 'Marca')
        ]);

        const ventaPorContainer=document.getElementById('ventaPorContainer');
        const preciosContainer=document.getElementById('preciosContainer');
        const empaquesContainer=document.getElementById('empaquesContainer');
        const manejaVaciosCheck=document.getElementById('manejaVaciosCheck');
        const tipoVacioContainer=document.getElementById('tipoVacioContainer');
        const tipoVacioSelect=document.getElementById('tipoVacioSelect');

        const updateDynamicInputs = () => {
            empaquesContainer.innerHTML='';
            preciosContainer.innerHTML='';
            const ventaPaq=document.getElementById('ventaPorPaq').checked;
            const ventaCj=document.getElementById('ventaPorCj').checked;
            const ventaUnd=document.getElementById('ventaPorUnd').checked;

            if(ventaPaq) empaquesContainer.innerHTML += `<div><label for="unidadesPorPaquete" class="block text-sm font-medium">Und./Paquete:</label><input type="number" id="unidadesPorPaquete" min="1" class="w-full mt-1 px-2 py-1 border rounded-lg" value="1" required></div>`;
            if(ventaCj) empaquesContainer.innerHTML += `<div><label for="unidadesPorCaja" class="block text-sm font-medium">Und./Caja:</label><input type="number" id="unidadesPorCaja" min="1" class="w-full mt-1 px-2 py-1 border rounded-lg" value="1" required></div>`;

            if(ventaUnd) preciosContainer.innerHTML += `<div><label for="precioUnd" class="block text-sm font-medium">Precio Und.:</label><input type="number" step="0.01" min="0" id="precioUnd" class="w-full mt-1 px-2 py-1 border rounded-lg" required></div>`;
            if(ventaPaq) preciosContainer.innerHTML += `<div><label for="precioPaq" class="block text-sm font-medium">Precio Paq.:</label><input type="number" step="0.01" min="0" id="precioPaq" class="w-full mt-1 px-2 py-1 border rounded-lg" required></div>`;
            if(ventaCj) preciosContainer.innerHTML += `<div><label for="precioCj" class="block text-sm font-medium">Precio Cj.:</label><input type="number" step="0.01" min="0" id="precioCj" class="w-full mt-1 px-2 py-1 border rounded-lg" required></div>`;

             preciosContainer.querySelectorAll('input[type="number"]').forEach(input => {
                 const type = input.id.substring(6).toLowerCase(); 
                 input.required = document.getElementById(`ventaPor${type.charAt(0).toUpperCase() + type.slice(1)}`)?.checked ?? false;
             });
        };

        manejaVaciosCheck.addEventListener('change', () => {
            if(manejaVaciosCheck.checked){
                tipoVacioContainer.classList.remove('hidden');
                tipoVacioSelect.required = true;
            } else {
                tipoVacioContainer.classList.add('hidden');
                tipoVacioSelect.required = false;
                tipoVacioSelect.value = '';
            }
        });

        ventaPorContainer.addEventListener('change', updateDynamicInputs);
        
        document.getElementById('ventaPorUnd').checked = true;
        updateDynamicInputs();

        document.getElementById('addProductoForm').addEventListener('submit', handleAddProducto);
        document.getElementById('backToMenuBtn').addEventListener('click', showInventarioSubMenu);
    }

    async function handleAddProducto(e) {
        e.preventDefault();
        const data = getProductoDataFromForm(false); 
        if (!data.rubro||!data.segmento||!data.marca||!data.presentacion){_showModal('Error','Completa Rubro, Segmento, Marca y Presentación.');return;}
        if (!data.ventaPor.und&&!data.ventaPor.paq&&!data.ventaPor.cj){_showModal('Error','Selecciona al menos una forma de venta.');return;}
        
        let precioValido = (data.ventaPor.und && data.precios.und > 0) || 
                           (data.ventaPor.paq && data.precios.paq > 0) || 
                           (data.ventaPor.cj && data.precios.cj > 0);
        if(!precioValido){_showModal('Error','Ingresa al menos un precio válido (> 0) para la forma de venta seleccionada.');return;}
        
        if (data.manejaVacios && !data.tipoVacio){_showModal('Error','Si maneja vacío, selecciona el tipo.');return;}

        _showModal('Progreso', 'Creando producto en Catálogo Maestro...');
        try {
            const newId = _doc(_collection(_db, 'dummy')).id;
            if (window.adminModule?.propagateProductChange) {
                await window.adminModule.propagateProductChange(newId, data);
                _showModal('Éxito', 'Producto agregado al Catálogo y propagado.', showInventarioSubMenu);
            } else {
                throw new Error("Módulo Admin no disponible.");
            }
        } catch (err) {
            console.error("Error agregando producto:", err);
            _showModal('Error', `No se pudo agregar: ${err.message}`);
        }
    }

    function showAddCategoryModal(collectionName, title) {
        if (_showAddItemModal) {
            _showAddItemModal(collectionName, title);
        } else {
            alert("Función para agregar categoría no disponible.");
        }
    }

    function showModificarDatosView() {
        if (_userRole !== 'admin') return;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold mb-6 text-gray-800">Modificar Datos Maestros</h2>
                        <p class="text-gray-600 mb-6 text-sm">Herramientas para la gestión de Rubros, Segmentos y Marcas.</p>
                        
                        <button id="cleanDataBtn" class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 mb-4">
                            Eliminar Categorías No Usadas
                        </button>
                        
                        <button id="backToInvBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">
                            Volver
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('cleanDataBtn').addEventListener('click', handleDeleteAllDatosMaestros);
        document.getElementById('backToInvBtn').addEventListener('click', showInventarioSubMenu);
    }

    async function handleDeleteDataItem(collectionName, id) {
        try {
            await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`, id));
            return true;
        } catch(e) {
            console.error("Error eliminando item de datos:", e);
            throw e;
        }
    }

    function getProductoDataFromForm(isUpdate) {
        const rubro = document.getElementById('rubro').value;
        const segmento = document.getElementById('segmento').value;
        const marca = document.getElementById('marca').value;
        const presentacion = document.getElementById('presentacion').value.trim().toUpperCase();
        
        const ventaPor = {
            und: document.getElementById('ventaPorUnd').checked,
            paq: document.getElementById('ventaPorPaq').checked,
            cj: document.getElementById('ventaPorCj').checked
        };
        
        const unidadesPorPaquete = ventaPor.paq ? parseInt(document.getElementById('unidadesPorPaquete').value) : 0;
        const unidadesPorCaja = ventaPor.cj ? parseInt(document.getElementById('unidadesPorCaja').value) : 0;
        
        const precios = {};
        if (ventaPor.und) precios.und = parseFloat(document.getElementById('precioUnd').value);
        if (ventaPor.paq) precios.paq = parseFloat(document.getElementById('precioPaq').value);
        if (ventaPor.cj) precios.cj = parseFloat(document.getElementById('precioCj').value);
        
        const manejaVacios = document.getElementById('manejaVaciosCheck').checked;
        const tipoVacio = manejaVacios ? document.getElementById('tipoVacioSelect').value : null;
        
        const ivaTipo = parseInt(document.getElementById('ivaTipo').value);
        
        const data = {
            rubro, segmento, marca, presentacion,
            ventaPor, unidadesPorPaquete, unidadesPorCaja,
            precios, manejaVacios, tipoVacio, iva: ivaTipo
        };

        if (!isUpdate) {
             data.cantidadUnidades = parseInt(document.getElementById('cantidadActual').value) || 0;
        }
        
        return data;
    }

    async function editProducto(productId) {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores pueden editar definiciones.'); return; } const prod = _inventarioCache.find(p => p.id === productId); if (!prod) { _showModal('Error', 'Producto no encontrado en caché.'); return; } if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto max-w-2xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center"> <h2 class="text-2xl font-bold mb-6">Editar Producto</h2> <form id="editProductoForm" class="space-y-4 text-left"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="rubro">Rubro:</label> <div class="flex items-center space-x-2"> <select id="rubro" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('rubros','Rubro')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="segmento">Segmento:</label> <div class="flex items-center space-x-2"> <select id="segmento" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('segmentos','Segmento')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="marca">Marca:</label> <div class="flex items-center space-x-2"> <select id="marca" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('marcas','Marca')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="presentacion">Presentación:</label> <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required> </div> </div> <div class="border-t pt-4 mt-4"> <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <div> <label class="block mb-2 font-medium">Venta por:</label> <div id="ventaPorContainer" class="flex space-x-4"> <label class="flex items-center"><input type="checkbox" id="ventaPorUnd" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Und.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorPaq" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Paq.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorCj" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Cj.</span></label> </div> </div> <div class="mt-4 md:mt-0"> <label class="flex items-center cursor-pointer"> <input type="checkbox" id="manejaVaciosCheck" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2 font-medium">Maneja Vacío</span> </label> <div id="tipoVacioContainer" class="mt-2 hidden"> <label for="tipoVacioSelect" class="block text-sm font-medium">Tipo:</label> <select id="tipoVacioSelect" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-gray-50"> <option value="">Seleccione...</option> <option value="1/4 - 1/3">1/4 - 1/3</option> <option value="ret 350 ml">Ret 350 ml</option> <option value="ret 1.25 Lts">Ret 1.25 Lts</option> </select> </div> </div> </div> <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"></div> <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div> </div> <div class="border-t pt-4 mt-4"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="cantidadActual" class="block font-medium">Stock Actual (Und. Base):</label> <input type="number" id="cantidadActual" value="${prod.cantidadUnidades||0}" class="w-full mt-1 px-4 py-2 border rounded-lg bg-gray-100 text-gray-700" readonly title="La cantidad se modifica en 'Ajuste Masivo'"> <p class="text-xs text-gray-500 mt-1">Modificar en "Ajuste Masivo".</p> </div> <div> <label for="ivaTipo" class="block font-medium">IVA:</label> <select id="ivaTipo" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white" required> <option value="16">16%</option> <option value="0">Exento 0%</option> </select> </div> </div> </div> <button type="submit" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition duration-150">Guardar Cambios y Propagar</button> </form> <button id="backToModifyDeleteBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-150">Volver</button> </div> </div> </div>`;

        await Promise.all([
             _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'rubro', 'Rubro', prod.rubro),
             _populateDropdown(`artifacts/${_appId}/users/${_userId}/segmentos`, 'segmento', 'Segmento', prod.segmento),
             _populateDropdown(`artifacts/${_appId}/users/${_userId}/marcas`, 'marca', 'Marca', prod.marca)
        ]);

        const ventaPorContainer=document.getElementById('ventaPorContainer');
        const preciosContainer=document.getElementById('preciosContainer');
        const empaquesContainer=document.getElementById('empaquesContainer');
        const manejaVaciosCheck=document.getElementById('manejaVaciosCheck');
        const tipoVacioContainer=document.getElementById('tipoVacioContainer');
        const tipoVacioSelect=document.getElementById('tipoVacioSelect');

        const updateDynamicInputs=()=>{
            empaquesContainer.innerHTML='';
            preciosContainer.innerHTML='';
            const ventaPaq=document.getElementById('ventaPorPaq').checked;
            const ventaCj=document.getElementById('ventaPorCj').checked;
            const ventaUnd=document.getElementById('ventaPorUnd').checked;

            if(ventaPaq) empaquesContainer.innerHTML += `<div><label for="unidadesPorPaquete" class="block text-sm font-medium">Und./Paquete:</label><input type="number" id="unidadesPorPaquete" min="1" class="w-full mt-1 px-2 py-1 border rounded-lg" value="1" required></div>`;
            if(ventaCj) empaquesContainer.innerHTML += `<div><label for="unidadesPorCaja" class="block text-sm font-medium">Und./Caja:</label><input type="number" id="unidadesPorCaja" min="1" class="w-full mt-1 px-2 py-1 border rounded-lg" value="1" required></div>`;

            if(ventaUnd) preciosContainer.innerHTML += `<div><label for="precioUnd" class="block text-sm font-medium">Precio Und.:</label><input type="number" step="0.01" min="0" id="precioUnd" class="w-full mt-1 px-2 py-1 border rounded-lg" required></div>`;
            if(ventaPaq) preciosContainer.innerHTML += `<div><label for="precioPaq" class="block text-sm font-medium">Precio Paq.:</label><input type="number" step="0.01" min="0" id="precioPaq" class="w-full mt-1 px-2 py-1 border rounded-lg" required></div>`;
            if(ventaCj) preciosContainer.innerHTML += `<div><label for="precioCj" class="block text-sm font-medium">Precio Cj.:</label><input type="number" step="0.01" min="0" id="precioCj" class="w-full mt-1 px-2 py-1 border rounded-lg" required></div>`;

             preciosContainer.querySelectorAll('input[type="number"]').forEach(input => {
                 const type = input.id.substring(6).toLowerCase(); 
                 input.required = document.getElementById(`ventaPor${type.charAt(0).toUpperCase() + type.slice(1)}`)?.checked ?? false;
             });
        };

        manejaVaciosCheck.addEventListener('change',()=>{
            if(manejaVaciosCheck.checked){
                tipoVacioContainer.classList.remove('hidden');
                tipoVacioSelect.required = true;
            } else {
                tipoVacioContainer.classList.add('hidden');
                tipoVacioSelect.required = false;
                tipoVacioSelect.value = '';
            }
        });

        ventaPorContainer.addEventListener('change', updateDynamicInputs);

        document.getElementById('presentacion').value = prod.presentacion || '';
        document.getElementById('ivaTipo').value = prod.iva !== undefined ? prod.iva : 16;
        const ventaPor = prod.ventaPor || { und: true };
        document.getElementById('ventaPorUnd').checked = ventaPor.und || false;
        document.getElementById('ventaPorPaq').checked = ventaPor.paq || false;
        document.getElementById('ventaPorCj').checked = ventaPor.cj || false;
        updateDynamicInputs();
        const uPaqInput = document.getElementById('unidadesPorPaquete');
        if (uPaqInput && ventaPor.paq) uPaqInput.value = prod.unidadesPorPaquete || 1;
        const uCjInput = document.getElementById('unidadesPorCaja');
        if (uCjInput && ventaPor.cj) uCjInput.value = prod.unidadesPorCaja || 1;
        const preciosExistentes = prod.precios || { und: prod.precioPorUnidad || 0 };
        const pUndInput = document.getElementById('precioUnd');
        if (pUndInput) pUndInput.value = preciosExistentes.und || 0;
        const pPaqInput = document.getElementById('precioPaq');
        if (pPaqInput) pPaqInput.value = preciosExistentes.paq || 0;
        const pCjInput = document.getElementById('precioCj');
        if (pCjInput) pCjInput.value = preciosExistentes.cj || 0;
        if (prod.manejaVacios) {
            manejaVaciosCheck.checked = true;
            tipoVacioContainer.classList.remove('hidden');
            tipoVacioSelect.required = true;
            tipoVacioSelect.value = prod.tipoVacio || '';
        } else {
            manejaVaciosCheck.checked = false;
            tipoVacioContainer.classList.add('hidden');
            tipoVacioSelect.required = false;
        }

        document.getElementById('editProductoForm').addEventListener('submit', (e) => handleUpdateProducto(e, productId));
        document.getElementById('backToModifyDeleteBtn').addEventListener('click', showModifyDeleteView);
    }

    async function handleUpdateProducto(e, productId) {
        e.preventDefault(); if (_userRole !== 'admin') return; 
        const updatedData = getProductoDataFromForm(true); 
        if (!updatedData.rubro||!updatedData.segmento||!updatedData.marca||!updatedData.presentacion){_showModal('Error','Completa Rubro, Segmento, Marca y Presentación.');return;} if (!updatedData.ventaPor.und&&!updatedData.ventaPor.paq&&!updatedData.ventaPor.cj){_showModal('Error','Selecciona al menos una forma de venta.');return;} if (updatedData.manejaVacios&&!updatedData.tipoVacio){_showModal('Error','Si maneja vacío, selecciona el tipo.');document.getElementById('tipoVacioSelect')?.focus();return;} let precioValido=(updatedData.ventaPor.und&&updatedData.precios.und>0)||(updatedData.ventaPor.paq&&updatedData.precios.paq>0)||(updatedData.ventaPor.cj&&updatedData.precios.cj>0); if(!precioValido){_showModal('Error','Ingresa al menos un precio válido (> 0) para la forma de venta seleccionada.');document.querySelector('#preciosContainer input[required]')?.focus();return;}
        
        updatedData.cantidadUnidades = 0; 

        _showModal('Progreso','Guardando cambios en Catálogo Maestro...'); 
        try { 
            if (window.adminModule?.propagateProductChange) { 
                await window.adminModule.propagateProductChange(productId, updatedData); 
                 _showModal('Éxito','Producto modificado y propagado correctamente.', showModifyDeleteView); 
            } else {
                throw new Error("Módulo Admin no cargado.");
            }
        } catch (err) { 
            console.error("Error modificando producto:", err); 
            _showModal('Error',`Ocurrió un error al guardar: ${err.message}`); 
        }
    }

    function deleteProducto(productId) {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; } const prod = _inventarioCache.find(p => p.id === productId); if (!prod) { _showModal('Error', 'Producto no encontrado.'); return; }
        _showModal('Confirmar Eliminación', `¿Estás seguro de eliminar el producto "${prod.presentacion}"? Esta acción se propagará a todos los usuarios y es IRREVERSIBLE.`, async () => { _showModal('Progreso', `Eliminando "${prod.presentacion}"...`); try { if (window.adminModule?.propagateProductChange) { await window.adminModule.propagateProductChange(productId, null); } else { await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId)); } _showModal('Éxito',`Producto "${prod.presentacion}" eliminado y propagado.`); } catch (e) { console.error("Error eliminando producto:", e); _showModal('Error', `No se pudo eliminar: ${e.message}`); } }, 'Sí, Eliminar', null, true);
    }

    async function handleDeleteAllProductos() {
        if (_userRole !== 'admin') return; _showModal('Confirmación Extrema', `¿Estás SEGURO de eliminar TODOS los productos del inventario? Esta acción es IRREVERSIBLE y se propagará.`, async () => { _showModal('Progreso', 'Eliminando productos...'); try { const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const snapshot = await _getDocs(collectionRef); if (snapshot.empty) { _showModal('Aviso', 'No hay productos en el inventario para eliminar.'); return; } const productIds = snapshot.docs.map(d => d.id); 
        
        if (window.adminModule?.propagateProductChange) { let propagationErrors = 0; for (const productId of productIds) { try { await window.adminModule.propagateProductChange(productId, null); } catch (propError) { console.error(`Error propagando eliminación de ${productId}:`, propError); propagationErrors++; } } _showModal(propagationErrors > 0 ? 'Advertencia' : 'Éxito', `Se eliminaron ${productIds.length} productos.${propagationErrors > 0 ? ` Ocurrieron ${propagationErrors} errores al propagar.` : ' Propagado correctamente.'}`); } else { _showModal('Error', `La función de propagación no está disponible.`); } } catch (error) { console.error("Error al eliminar todos los productos:", error); _showModal('Error', `Hubo un error al eliminar los productos: ${error.message}`); } }, 'Sí, Eliminar Todos', null, true);
    }

    async function handleDeleteAllDatosMaestros() {
        if (_userRole !== 'admin') return;
        _showModal('Confirmar Borrado Datos Maestros', `¿Eliminar TODOS los Rubros, Segmentos y Marcas que NO estén siendo usados actualmente en el inventario? Esta acción es IRREVERSIBLE y se propagará.`, async () => {
            _showModal('Progreso', 'Verificando uso de datos maestros...');
            try {
                const collectionsToClean = ['rubros', 'segmentos', 'marcas'];
                const itemsToDelete = { rubros: [], segmentos: [], marcas: [] };
                const itemsInUse = { rubros: new Set(), segmentos: new Set(), marcas: new Set() };
                let totalFound = 0, totalToDelete = 0;

                _inventarioCache.forEach(data => {
                    if (data.rubro) itemsInUse.rubros.add(data.rubro);
                    if (data.segmento) itemsInUse.segmentos.add(data.segmento);
                    if (data.marca) itemsInUse.marcas.add(data.marca);
                });

                for (const colName of collectionsToClean) {
                    const categorySnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/${colName}`));
                    categorySnap.docs.forEach(doc => {
                        const name = doc.data().name;
                        totalFound++;
                        if (name && !itemsInUse[colName].has(name)) {
                            itemsToDelete[colName].push({ id: doc.id, name: name });
                            totalToDelete++;
                        }
                    });
                }

                if (totalToDelete === 0) {
                    _showModal('Aviso', 'No se encontraron Rubros, Segmentos o Marcas no utilizados para eliminar.');
                    return; 
                }

                _showModal('Confirmación Final', `Se eliminarán ${totalToDelete} datos maestros no utilizados (${itemsToDelete.rubros.length} Rubros, ${itemsToDelete.segmentos.length} Segmentos, ${itemsToDelete.marcas.length} Marcas). Esta acción se propagará. ¿Continuar?`, async () => {
                    _showModal('Progreso', `Eliminando ${totalToDelete} datos maestros localmente...`);
                    try { 
                        let propagationErrors = 0;
                        if (window.adminModule?.propagateCategoryChange) {
                            for (const colName in itemsToDelete) {
                                for (const item of itemsToDelete[colName]) {
                                    try {
                                         await window.adminModule.propagateCategoryChange(colName, item.id, null);
                                    } catch (propError) {
                                         console.error(`Error propagando eliminación de ${colName}/${item.id}:`, propError);
                                         propagationErrors++;
                                    }
                                }
                            }
                            _showModal(propagationErrors > 0 ? 'Advertencia' : 'Éxito', `Se eliminaron ${totalToDelete} datos maestros no utilizados.${propagationErrors > 0 ? ` Ocurrieron ${propagationErrors} errores al propagar.` : ' Propagado correctamente.'}`);
                        } else {
                            _showModal('Advertencia', `La función de propagación no está disponible.`);
                        }
                        invalidateSegmentOrderCache(); 

                    } catch (deletePropError) { 
                         console.error("Error durante eliminación/propagación de datos maestros:", deletePropError);
                         _showModal('Error', `Ocurrió un error durante la eliminación/propagación: ${deletePropError.message}`);
                    }
                }, 'Sí, Eliminar No Usados', null, true); 

            } catch (error) { 
                console.error("Error al verificar/eliminar datos maestros:", error);
                _showModal('Error', `Ocurrió un error: ${error.message}`);
            }
        }, 'Sí, Eliminar No Usados', null, true); 
    }

    async function showRecargaProductosView() {
         if (_floatingControls) _floatingControls.classList.add('hidden');
         _recargaTempState = {};

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Recarga de Productos</h2>
                        <p class="text-center text-gray-600 mb-4 text-sm">Ingrese la CANTIDAD A AÑADIR. Este valor se sumará al stock actual. Los cambios se mantienen al cambiar de filtro.</p>
                        ${getFiltrosHTML('recarga')}
                        <div id="recargaListContainer" class="overflow-x-auto max-h-[60vh] border rounded-lg">
                            <p class="text-gray-500 text-center p-4">Cargando productos...</p>
                        </div>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="saveRecargaBtn" class="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700">Confirmar Recarga</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveRecargaBtn').addEventListener('click', handleGuardarRecarga);

        const baseRender = () => renderRecargaList();
        const { updateDependentDropdowns } = setupFiltros('recarga', baseRender);

        const rubroSelect = document.getElementById('recarga-filter-rubro');
        if (rubroSelect) rubroSelect.value = _lastFilters.rubro || '';

        let isFirstLoad = true;
        const smartListenerCallback = async () => {
            await baseRender();
            populateRubrosFromCache('recarga-filter-rubro');
            
            if (isFirstLoad && _inventarioCache.length > 0) {
                updateDependentDropdowns('init');
                await baseRender();
                isFirstLoad = false;
            }
        };

        startMainInventarioListener(smartListenerCallback);
    }

    async function renderRecargaList() {
        const container = document.getElementById('recargaListContainer');
        if (!container) return;
        
        let productos = [..._inventarioCache];
        productos = productos.filter(p => {
             const searchTermLower = (_lastFilters.searchTerm || '').toLowerCase();
             const textMatch = !searchTermLower || (p.presentacion && p.presentacion.toLowerCase().includes(searchTermLower)) || (p.marca && p.marca.toLowerCase().includes(searchTermLower)) || (p.segmento && p.segmento.toLowerCase().includes(searchTermLower));
             const rubroMatch = !_lastFilters.rubro || p.rubro === _lastFilters.rubro;
             const segmentoMatch = !_lastFilters.segmento || p.segmento === _lastFilters.segmento;
             const marcaMatch = !_lastFilters.marca || p.marca === _lastFilters.marca;
             return textMatch && rubroMatch && segmentoMatch && marcaMatch;
        });

        const sortFunction = await window.getGlobalProductSortFunction();
        productos.sort(sortFunction);

        if (productos.length === 0) { 
            container.innerHTML = `<p class="text-gray-500 text-center p-4">No hay productos que coincidan con los filtros.</p>`; 
            return; 
        }

        let tableHTML = `
            <table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-100 sticky top-0 z-10">
                    <tr>
                        <th class="py-2 px-4 border-b text-left">Producto</th>
                        <th class="py-2 px-4 border-b text-center w-32">Stock Actual</th>
                        <th class="py-2 px-4 border-b text-center w-40">Cantidad a Recargar</th>
                    </tr>
                </thead>
                <tbody>`;
        
        let lastSegmento = null;
        
        productos.forEach(p => {
            const currentSegmento = p.segmento || `Sin Segmento`;
            if (currentSegmento !== lastSegmento) { 
                lastSegmento = currentSegmento; 
                tableHTML += `<tr><td colspan="3" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastSegmento}</td></tr>`; 
            }
            
            const vPor = p.ventaPor || {und:true};
            const cStockU = p.cantidadUnidades||0; 

            let factor = 1;
            let unitLabel = 'Und.';

            if(vPor.cj){ 
                factor = p.unidadesPorCaja||1; 
                unitLabel = 'Cj.'; 
            } else if(vPor.paq){ 
                factor = p.unidadesPorPaquete||1; 
                unitLabel = 'Paq.'; 
            }

            const currentDisplayStock = Math.floor(cStockU / factor);

            let inputValue = 0;
            if (_recargaTempState.hasOwnProperty(p.id)) {
                inputValue = _recargaTempState[p.id];
            }

            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-4 border-b">
                        <p class="font-medium">${p.presentacion}</p>
                        <p class="text-xs text-gray-500">${p.marca||'S/M'}</p>
                    </td>
                    <td class="py-2 px-4 border-b text-center align-middle text-gray-600">
                        ${currentDisplayStock} ${unitLabel}
                    </td>
                    <td class="py-2 px-4 border-b text-center align-middle">
                        <div class="flex items-center justify-center">
                            <input type="number" 
                                value="${inputValue}" 
                                data-doc-id="${p.id}"
                                data-factor="${factor}"
                                min="0" step="1" 
                                class="w-20 p-1 text-center border rounded-lg focus:ring-1 focus:ring-teal-500 focus:border-teal-500 recarga-qty-input font-bold bg-white">
                            <span class="ml-2 text-xs font-semibold text-gray-500">${unitLabel}</span>
                        </div>
                    </td>
                </tr>`;
        });
        tableHTML += `</tbody></table>`; 
        container.innerHTML = tableHTML;

        container.querySelectorAll('.recarga-qty-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                _recargaTempState[e.target.dataset.docId] = val;
            });
        });
    }

    async function handleGuardarRecarga() {
        if (_inventarioCache.length === 0) { _showModal('Aviso', 'No hay productos en inventario.'); return; }
        
        const batch = _writeBatch(_db);
        let changesCount = 0;
        let invalidValues = false;
        const recargaDetalles = []; 

        _inventarioCache.forEach(p => {
            if (_recargaTempState.hasOwnProperty(p.id)) {
                const inputValStr = String(_recargaTempState[p.id]).trim();
                const inputVal = parseInt(inputValStr, 10);

                if (inputValStr === '' || isNaN(inputVal) || inputVal < 0) {
                    invalidValues = true;
                    return; 
                }

                if (inputVal > 0) {
                    const vPor = p.ventaPor || {und:true};
                    let factor = 1;
                    if(vPor.cj) factor = p.unidadesPorCaja||1;
                    else if(vPor.paq) factor = p.unidadesPorPaquete||1;

                    const currentBase = p.cantidadUnidades || 0;
                    const unitsToAdd = inputVal * factor;
                    const newBaseTotal = currentBase + unitsToAdd;

                    const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                    
                    if (_increment) {
                         batch.update(docRef, { cantidadUnidades: _increment(unitsToAdd) });
                    } else {
                         batch.update(docRef, { cantidadUnidades: newBaseTotal });
                    }
                    
                    recargaDetalles.push({
                        productoId: p.id,
                        presentacion: p.presentacion,
                        unidadesAnteriores: currentBase,
                        unidadesNuevas: newBaseTotal,
                        diferenciaUnidades: unitsToAdd,
                        factorUtilizado: factor
                    });
                    changesCount++;
                }
            }
        });

        if (invalidValues) { _showModal('Error', 'Hay valores inválidos (vacíos o negativos). Por favor revise.'); return; }
        if (changesCount === 0) { _showModal('Aviso', 'No se ha ingresado ninguna cantidad para recargar.'); return; }

        _showModal('Confirmar Recarga', `Se añadirán cantidades a ${changesCount} productos. ¿Continuar?`, async () => {
            _showModal('Progreso', 'Procesando recarga...');
            try {
                // Log de auditoría
                const recargaLogRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/recargas`);
                await _addDoc(recargaLogRef, {
                    fecha: new Date().toISOString(), 
                    usuarioId: _userId,
                    totalProductos: changesCount,
                    detalles: recargaDetalles
                });

                await batch.commit();
                
                _recargaTempState = {};
                renderRecargaList(); 

                const pModal = document.getElementById('modalContainer');
                if(pModal && pModal.querySelector('h3')?.textContent === 'Progreso') {
                    pModal.classList.add('hidden');
                }

                setTimeout(() => {
                     _showModal('Recarga Exitosa', 'La carga se realizó exitosamente y se guardó el registro.', () => {}, 'Continuar');
                }, 300);
                
            } catch (error) {
                console.error("Error en recarga:", error);
                _showModal('Error', `Error al procesar: ${error.message}`);
            }
        }, 'Sí, Procesar', null, true);
    }

    // ==============================================================================
    // --- VISTA DE ORDENAMIENTO (DRAG & DROP JERÁRQUICO RESTAURADO Y MEJORADO) ---
    // ==============================================================================
    function showOrdenarSegmentosMarcasView() {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo administradores.');
            return;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Ordenar Catálogo Completo</h2>
                        <p class="text-center text-gray-600 mb-6 text-sm">Arrastra para definir el orden en el que aparecerán en <strong>toda la aplicación</strong> (Ventas, Catálogo, Reportes).</p>
                        
                        <div class="mb-4 bg-gray-50 p-4 border rounded-lg">
                           <label for="ordenarRubroFilter" class="block text-gray-700 font-medium mb-2 text-sm">Filtrar por Rubro (Facilita el trabajo):</label>
                           <select id="ordenarRubroFilter" class="w-full px-4 py-2 border rounded-lg shadow-sm">
                               <option value="">Todos los Rubros</option>
                           </select>
                        </div>

                        <div id="segmentos-marcas-sortable-list" class="space-y-4 max-h-[65vh] overflow-y-auto pb-4">
                            <p class="text-gray-500 text-center py-4">Cargando...</p>
                        </div>

                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="saveOrderBtn" class="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700">Guardar Orden Global</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveOrderBtn').addEventListener('click', handleGuardarOrdenJerarquia);
        
        populateRubrosFromCache('ordenarRubroFilter');
        
        const rubroFilter = document.getElementById('ordenarRubroFilter');
        rubroFilter.addEventListener('change', () => renderSortableHierarchy(rubroFilter.value));
        
        if (_inventarioCache.length > 0) {
            renderSortableHierarchy('');
        } else {
             startMainInventarioListener(() => {
                 populateRubrosFromCache('ordenarRubroFilter');
                 renderSortableHierarchy('');
             });
        }
    }

    async function renderSortableHierarchy(rubroFiltro = '') {
        const container = document.getElementById('segmentos-marcas-sortable-list');
        if (!container) return;
        container.innerHTML = `<p class="text-gray-500 text-center">Cargando datos maestros...</p>`;
        
        try {
            // 1. Obtener segmentos y marcas desde Firebase
            const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
            const segSnapshot = await _getDocs(segmentosRef);
            const dbSegments = new Map();
            segSnapshot.forEach(doc => dbSegments.set((doc.data().name || '').trim().toUpperCase(), { id: doc.id, ...doc.data() }));

            const marcasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`);
            const marSnapshot = await _getDocs(marcasRef);
            const dbMarcas = new Map();
            marSnapshot.forEach(doc => dbMarcas.set((doc.data().name || '').trim().toUpperCase(), { id: doc.id, ...doc.data() }));

            // 2. Filtrar productos
            let prods = [..._inventarioCache];
            if (rubroFiltro) prods = prods.filter(p => p.rubro === rubroFiltro);

            if (prods.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center">No hay productos en este rubro.</p>`;
                return;
            }

            // 3. Construir Segmentos
            const currentSegments = new Set(prods.map(p => (p.segmento || 'S/S').trim().toUpperCase()));
            let segmentsArray = [];
            currentSegments.forEach(sName => {
                segmentsArray.push(dbSegments.get(sName) || { id: `temp_s_${sName}`, name: sName, orden: 9999, marcaOrder: [] });
            });
            segmentsArray.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));

            container.innerHTML = '';

            segmentsArray.forEach(seg => {
                const segDiv = document.createElement('div');
                segDiv.className = 'segmento-container bg-white border border-blue-300 rounded-lg mb-4 shadow-sm';
                segDiv.dataset.id = seg.id;
                segDiv.dataset.name = seg.name;

                segDiv.innerHTML = `
                    <div class="bg-blue-100 p-3 rounded-t-lg flex items-center font-bold text-blue-900 border-b border-blue-300">
                        <span class="cursor-grab mr-3 drag-handle-seg px-2 py-1 bg-white hover:bg-blue-200 rounded text-gray-500 shadow-sm" draggable="true">☰</span>
                        <span class="uppercase tracking-wider">📁 ${seg.name}</span>
                    </div>
                    <ul class="marcas-list p-3 space-y-3 bg-blue-50/30 min-h-[50px]"></ul>
                `;

                const marcasList = segDiv.querySelector('.marcas-list');
                const prodsInSeg = prods.filter(p => (p.segmento || 'S/S').trim().toUpperCase() === seg.name);
                
                // 4. Construir Marcas dentro del segmento
                const currentMarcas = new Set(prodsInSeg.map(p => (p.marca || 'S/M').trim().toUpperCase()));
                let marcasArray = [];
                currentMarcas.forEach(mName => {
                    marcasArray.push(dbMarcas.get(mName) || { id: `temp_m_${mName}`, name: mName, productOrder: [] });
                });

                const mo = seg.marcaOrder || [];
                marcasArray.sort((a, b) => {
                    const ia = mo.indexOf(a.name);
                    const ib = mo.indexOf(b.name);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return a.name.localeCompare(b.name);
                });

                marcasArray.forEach(marca => {
                    const marcaLi = document.createElement('li');
                    marcaLi.className = 'marca-container bg-white border border-emerald-200 rounded-lg shadow-sm';
                    marcaLi.dataset.id = marca.id;
                    marcaLi.dataset.name = marca.name;

                    marcaLi.innerHTML = `
                        <div class="bg-emerald-50 p-2 rounded-t-lg flex items-center font-semibold text-emerald-900 border-b border-emerald-200 text-sm">
                            <span class="cursor-grab mr-3 drag-handle-mar px-2 py-1 bg-white hover:bg-emerald-100 rounded text-gray-500 shadow-sm" draggable="true">☰</span>
                            <span>🏷️ ${marca.name}</span>
                        </div>
                        <ul class="productos-list p-2 space-y-1 min-h-[40px] bg-white rounded-b-lg"></ul>
                    `;

                    const prodList = marcaLi.querySelector('.productos-list');
                    const prodsInMarca = prodsInSeg.filter(p => (p.marca || 'S/M').trim().toUpperCase() === marca.name);

                    const po = marca.productOrder || [];
                    prodsInMarca.sort((a, b) => {
                        const ia = po.indexOf(a.id);
                        const ib = po.indexOf(b.id);
                        if (ia !== -1 && ib !== -1) return ia - ib;
                        if (ia !== -1) return -1;
                        if (ib !== -1) return 1;
                        
                        // EMPATE DE NOMBRES -> Desempata por ID
                        const nameComp = (a.presentacion || '').localeCompare(b.presentacion || '');
                        if (nameComp !== 0) return nameComp;
                        return (a.id || '').localeCompare(b.id || ''); 
                    });

                    prodsInMarca.forEach(p => {
                        const pLi = document.createElement('li');
                        pLi.className = 'producto-item flex items-center p-2 bg-gray-50 border border-gray-200 rounded text-sm hover:bg-amber-50 transition-colors';
                        pLi.dataset.id = p.id;
                        pLi.innerHTML = `
                            <span class="cursor-grab mr-3 drag-handle-prod px-2 py-1 bg-white hover:bg-gray-200 text-gray-400 hover:text-gray-700 rounded shadow-sm" draggable="true">↕</span>
                            <span class="flex-grow font-medium text-gray-800">${p.presentacion}</span>
                            <span class="text-[10px] text-gray-400 font-mono hidden md:block">ID:${p.id.slice(0,5)}</span>
                        `;
                        prodList.appendChild(pLi);
                    });

                    marcasList.appendChild(marcaLi);
                });

                container.appendChild(segDiv);
            });

            setupNativeDragAndDrop(container);

        } catch(e) {
            console.error(e);
            container.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`;
        }
    }

    function setupNativeDragAndDrop(container) {
        let draggedItem = null;
        let draggedType = null;
        let sourceList = null;
        let placeholder = document.createElement('div');

        container.addEventListener('dragstart', e => {
            if (e.target.classList.contains('drag-handle-seg')) {
                draggedItem = e.target.closest('.segmento-container');
                draggedType = 'segmento';
            } else if (e.target.classList.contains('drag-handle-mar')) {
                draggedItem = e.target.closest('.marca-container');
                draggedType = 'marca';
            } else if (e.target.classList.contains('drag-handle-prod')) {
                draggedItem = e.target.closest('.producto-item');
                draggedType = 'producto';
            }

            if (!draggedItem) return;
            
            sourceList = draggedItem.parentNode;
            e.stopPropagation(); 
            
            setTimeout(() => draggedItem.classList.add('opacity-50'), 0);
            e.dataTransfer.effectAllowed = 'move';
            
            // Setup Placeholder visual
            placeholder.className = draggedItem.className + ' bg-gray-200 border-dashed border-2 border-gray-400 opacity-70';
            placeholder.innerHTML = '';
            placeholder.style.height = draggedItem.offsetHeight + 'px';
        });

        container.addEventListener('dragend', e => {
            if (draggedItem) draggedItem.classList.remove('opacity-50');
            if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
            draggedItem = null;
            draggedType = null;
            sourceList = null;
        });

        container.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedItem) return;
            e.stopPropagation();

            let dropZoneClass = '';
            if (draggedType === 'segmento') dropZoneClass = '#segmentos-marcas-sortable-list';
            else if (draggedType === 'marca') dropZoneClass = '.marcas-list';
            else if (draggedType === 'producto') dropZoneClass = '.productos-list';

            const dropZone = e.target.closest(dropZoneClass);
            if (!dropZone) {
                e.dataTransfer.dropEffect = 'none';
                return;
            }

            e.dataTransfer.dropEffect = 'move';
            const afterElement = getDragAfterElement(dropZone, e.clientY, draggedType);
            if (afterElement == null) {
                dropZone.appendChild(placeholder);
            } else {
                dropZone.insertBefore(placeholder, afterElement);
            }
        });

        container.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedItem && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(draggedItem, placeholder);
            }
        });

        function getDragAfterElement(container, y, type) {
            let itemClass = '';
            if (type === 'segmento') itemClass = 'segmento-container';
            else if (type === 'marca') itemClass = 'marca-container';
            else if (type === 'producto') itemClass = 'producto-item';

            const draggableElements = [...container.querySelectorAll(`.${itemClass}:not(.opacity-50)`)];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }

    async function handleGuardarOrdenJerarquia() {
        if (_userRole !== 'admin') return;
        const segConts = document.querySelectorAll('#segmentos-marcas-sortable-list .segmento-container'); 
        if (segConts.length === 0) { _showModal('Aviso', 'No hay elementos para ordenar.'); return; }
        
        _showModal('Progreso', 'Guardando estructura global...');
        
        const batch = _writeBatch(_db);
        const orderedSegIds = []; 
        const tempToRealIdMap = {};
        
        // Acumulador de marcas para evitar que se sobrescriban si están en varios segmentos
        const brandAccumulator = new Map(); 

        // 1. Recorrer Segmentos
        segConts.forEach((segCont, sIdx) => {
            let sId = segCont.dataset.id;
            const sName = segCont.dataset.name;
            
            if (sId.startsWith('temp_')) {
                const newRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`));
                sId = newRef.id;
                tempToRealIdMap[segCont.dataset.id] = sId; 
                segCont.dataset.id = sId;
            }
            orderedSegIds.push(sId);

            // 2. Extraer orden de Marcas en este Segmento
            const marcaItems = segCont.querySelectorAll('.marcas-list > .marca-container');
            const marcaOrder = Array.from(marcaItems).map(item => item.dataset.name);
            
            batch.set(_doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, sId), { 
                name: sName, 
                orden: sIdx, 
                marcaOrder: marcaOrder 
            }, { merge: true });

            // 3. Acumular orden de Productos por Marca
            marcaItems.forEach(mItem => {
                let mId = mItem.dataset.id;
                const mName = mItem.dataset.name;
                
                if (mId.startsWith('temp_')) {
                    if (!tempToRealIdMap[mId]) {
                        tempToRealIdMap[mId] = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`)).id;
                    }
                    mId = tempToRealIdMap[mId];
                }

                if (!brandAccumulator.has(mId)) {
                    brandAccumulator.set(mId, { name: mName, order: [] });
                }

                const prodItems = mItem.querySelectorAll('.productos-list .producto-item');
                const pIds = Array.from(prodItems).map(pi => pi.dataset.id);
                
                // Agregar los productos al arreglo final de la marca
                brandAccumulator.get(mId).order.push(...pIds);
            });
        });

        // 4. Guardar Marcas acumuladas
        brandAccumulator.forEach((data, mId) => {
            batch.set(_doc(_db, `artifacts/${_appId}/users/${_userId}/marcas`, mId), { 
                name: data.name, 
                productOrder: data.order 
            }, { merge: true });
        });

        try {
            await batch.commit(); 
            invalidateSegmentOrderCache(); 

            _showModal('Progreso', 'Propagando cambios a Catálogo Maestro...');

            if (window.adminModule?.propagateCategoryChange) {
                 for (const sId of orderedSegIds) {
                     const snap = await _getDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, sId));
                     if(snap.exists()) await window.adminModule.propagateCategoryChange('segmentos', sId, snap.data());
                 }
                 for (const mId of brandAccumulator.keys()) {
                     const snap = await _getDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/marcas`, mId));
                     if(snap.exists()) await window.adminModule.propagateCategoryChange('marcas', mId, snap.data());
                 }
            }

            _showModal('Éxito', `Orden guardado perfectamente. Los productos con nombres idénticos ahora respetarán esta posición.`, showInventarioSubMenu);
        } catch (error) {
            console.error("Error al guardar orden:", error);
            _showModal('Error', `Fallo al guardar: ${error.message}`);
        }
    }

    // Exponer funciones públicas necesarias
    window.inventarioModule = {
        editProducto,
        deleteProducto,
        handleDeleteDataItem,
        showAddCategoryModal,
        invalidateSegmentOrderCache 
    };

})();

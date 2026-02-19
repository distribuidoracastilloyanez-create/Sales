(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;
    let _increment; 

    // --- SISTEMA DE CACHÉ DOBLE ---
    let _masterCatalogCache = {}; 
    let _userStockCache = {};     
    let _inventarioCache = [];    
    
    let _listenersUnsubscribes = []; 
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _recargaTempState = {}; 

    // --- NUEVO: CACHÉ ESTRUCTURAL (Optimizado y Seguro) ---
    let _globalSortCache = {
        ready: false,
        rubros: {},
        segmentos: {},
        marcas: {}
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
        
        console.log("Módulo Inventario Inicializado. Public ID:", PUBLIC_DATA_ID);
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
    // --- MOTOR MATEMÁTICO INQUEBRANTABLE ---
    // ==============================================================================
    window.getGlobalProductSortFunction = async () => {
        const norm = s => (s || '').trim().toUpperCase();

        // Cargar los índices guardados una sola vez por sesión
        if (!_globalSortCache.ready) {
            _globalSortCache.rubros = {};
            _globalSortCache.segmentos = {};
            _globalSortCache.marcas = {};

            try {
                const [rSnap, sSnap, mSnap] = await Promise.all([
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`)),
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`)),
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`))
                ]);

                rSnap.forEach(d => { _globalSortCache.rubros[norm(d.data().name)] = String(d.data().orden ?? 9999).padStart(4, '0'); });
                
                sSnap.forEach(d => { 
                    _globalSortCache.segmentos[norm(d.data().name)] = {
                        orden: String(d.data().orden ?? 9999).padStart(4, '0'),
                        marcaOrder: (d.data().marcaOrder || []).map(norm)
                    };
                });
                
                mSnap.forEach(d => {
                    const mName = norm(d.data().name);
                    if (!_globalSortCache.marcas[mName]) _globalSortCache.marcas[mName] = { productOrder: [] };
                    _globalSortCache.marcas[mName].productOrder.push(...(d.data().productOrder || []));
                });
                
                _globalSortCache.ready = true;
            } catch (e) {
                console.error("Error cargando configuración de orden:", e);
            }
        }

        return (a, b) => {
            // 1. Rubro (Numérico)
            const rA = _globalSortCache.rubros[norm(a.rubro)] || '9999';
            const rB = _globalSortCache.rubros[norm(b.rubro)] || '9999';
            
            // 2. Segmento (Numérico)
            const sDataA = _globalSortCache.segmentos[norm(a.segmento)];
            const sDataB = _globalSortCache.segmentos[norm(b.segmento)];
            const sA = sDataA ? sDataA.orden : '9999';
            const sB = sDataB ? sDataB.orden : '9999';
            
            // 3. Marca (Su índice dentro del Segmento)
            let mA = '9999', mB = '9999';
            if (sDataA && sDataA.marcaOrder) {
                const idx = sDataA.marcaOrder.indexOf(norm(a.marca));
                if (idx !== -1) mA = String(idx).padStart(4, '0');
            }
            if (sDataB && sDataB.marcaOrder) {
                const idx = sDataB.marcaOrder.indexOf(norm(b.marca));
                if (idx !== -1) mB = String(idx).padStart(4, '0');
            }

            // 4. Presentación (Su índice dentro de la Marca)
            let pA = '9999', pB = '9999';
            const mDataA = _globalSortCache.marcas[norm(a.marca)];
            if (mDataA && mDataA.productOrder) {
                const idx = mDataA.productOrder.indexOf(a.id);
                if (idx !== -1) pA = String(idx).padStart(4, '0');
            }
            const mDataB = _globalSortCache.marcas[norm(b.marca)];
            if (mDataB && mDataB.productOrder) {
                const idx = mDataB.productOrder.indexOf(b.id);
                if (idx !== -1) pB = String(idx).padStart(4, '0');
            }

            // --- LA LLAVE MAESTRA ---
            // Combina los índices con los nombres reales para asegurar que jamás se entremezclen.
            const keyA = `${rA}_${norm(a.rubro)}_${sA}_${norm(a.segmento)}_${mA}_${norm(a.marca)}_${pA}_${norm(a.presentacion)}`;
            const keyB = `${rB}_${norm(b.rubro)}_${sB}_${norm(b.segmento)}_${mB}_${norm(b.marca)}_${pB}_${norm(b.presentacion)}`;

            return keyA.localeCompare(keyB);
        };
    };

    function invalidateSegmentOrderCache() {
        _globalSortCache.ready = false;
        if (window.catalogoModule?.invalidateCache) window.catalogoModule.invalidateCache();
        if (window.ventasModule?.invalidateCache) window.ventasModule.invalidateCache();
    }

    // --- FUNCIÓN HÍBRIDA PARA POBLAR DROPDOWNS ---
    async function populateMergedDropdown(collectionName, selectId, itemKey, defaultLabel, currentValParam = null) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const currentVal = currentValParam !== null ? currentValParam : select.value;
        const uniqueValues = new Set();
        
        _inventarioCache.forEach(p => {
             if (p[itemKey]) uniqueValues.add((p[itemKey] || '').trim().toUpperCase());
        });
        
        try {
            const snap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`));
            snap.docs.forEach(d => {
                if (d.data().name) uniqueValues.add((d.data().name || '').trim().toUpperCase());
            });
        } catch(e) {
            console.warn(`Error al cargar coleccion ${collectionName} auxiliar:`, e);
        }
        
        const sorted = [...uniqueValues].sort();
        const optionDefault = defaultLabel === 'Todos' ? 'Todos' : `-- Seleccione ${defaultLabel} --`;
        select.innerHTML = `<option value="">${optionDefault}</option>`;
        
        sorted.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            if (val === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
        
        if (currentVal && !uniqueValues.has((currentVal || '').trim().toUpperCase())) select.value = "";
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

    function getFiltrosHTML(prefix) {
        const currentSearch = _lastFilters.searchTerm || '';
        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-white shadow-sm">
                <input type="text" id="${prefix}-search-input" placeholder="Buscar por Nombre, Marca o Segmento..." class="md:col-span-4 w-full px-4 py-3 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" value="${currentSearch}">
                <div>
                    <label for="${prefix}-filter-rubro" class="text-xs font-bold text-gray-500 uppercase tracking-wider">Rubro</label>
                    <select id="${prefix}-filter-rubro" class="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"><option value="">Todos</option></select>
                </div>
                <div>
                    <label for="${prefix}-filter-segmento" class="text-xs font-bold text-gray-500 uppercase tracking-wider">Segmento</label>
                    <select id="${prefix}-filter-segmento" class="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" disabled><option value="">Todos</option></select>
                </div>
                <div>
                    <label for="${prefix}-filter-marca" class="text-xs font-bold text-gray-500 uppercase tracking-wider">Marca</label>
                    <select id="${prefix}-filter-marca" class="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" disabled><option value="">Todos</option></select>
                </div>
                <button id="${prefix}-clear-filters-btn" class="bg-gray-200 text-sm font-bold text-gray-700 rounded-lg self-end py-2 px-4 hover:bg-gray-300 transition-colors">Limpiar Filtros</button>
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

    async function showModifyDeleteView() {
        if (_floatingControls) _floatingControls.classList.add('hidden'); 
        const isAdmin = _userRole === 'admin';
       
        _mainContent.innerHTML = `
           <div class="p-2 md:p-6 pt-8 max-w-7xl mx-auto"> 
               <div class="bg-gray-100/95 backdrop-blur-md p-4 md:p-8 rounded-2xl shadow-2xl border border-gray-200"> 
                   <div class="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-gray-300 pb-4">
                        <h2 class="text-3xl font-black text-gray-800 tracking-tight">
                            ${isAdmin ? '⚙️ Gestión del Catálogo' : '📦 Consultar Inventario'}
                        </h2>
                        <button id="backToInventarioBtnTop" class="mt-4 md:mt-0 px-6 py-2 bg-gray-500 text-white font-bold rounded-lg shadow hover:bg-gray-600 transition-colors">
                            ← Volver
                        </button>
                   </div>
                   
                   ${getFiltrosHTML('modify')} 
                   
                   <div id="productosListContainer" class="overflow-x-auto max-h-[65vh] border border-gray-300 rounded-xl shadow-inner bg-white"> 
                        <p class="text-gray-500 text-center p-8 font-medium animate-pulse">Cargando y organizando inventario...</p>
                   </div> 
                   
                   <div class="mt-6 flex flex-col sm:flex-row gap-4 justify-between"> 
                       <button id="backToInventarioBtnBottom" class="w-full sm:w-auto px-8 py-3 bg-gray-500 text-white font-bold rounded-lg shadow hover:bg-gray-600 transition-colors">Volver al Menú</button> 
                       ${isAdmin ? `<button id="deleteAllProductosBtn" class="w-full sm:w-auto px-8 py-3 bg-red-600 text-white font-bold rounded-lg shadow hover:bg-red-700 transition-colors">⚠️ Eliminar Todo el Catálogo</button>` : ''} 
                   </div> 
               </div> 
           </div>`;

        document.getElementById('backToInventarioBtnTop').addEventListener('click', showInventarioSubMenu);
        document.getElementById('backToInventarioBtnBottom').addEventListener('click', showInventarioSubMenu);
        
        if (isAdmin) {
            document.getElementById('deleteAllProductosBtn')?.addEventListener('click', handleDeleteAllProductos);
        }

        const baseRender = () => renderProductosList('productosListContainer', !isAdmin);
        const { updateDependentDropdowns } = setupFiltros('modify', baseRender);

        let isFirstLoad = true;
        const smartListenerCallback = async () => {
            await baseRender();
            populateMergedDropdown('rubros', 'modify-filter-rubro', 'rubro', 'Todos', _lastFilters.rubro); 
            if (isFirstLoad && _inventarioCache.length > 0) {
                updateDependentDropdowns('init');
                await baseRender();
                isFirstLoad = false;
            }
        };
        startMainInventarioListener(smartListenerCallback);
    }

    async function renderProductosList(elementId, readOnly = false) {
        const container = document.getElementById(elementId);
        if (!container) return;

        container.innerHTML = '<div class="flex justify-center items-center p-12 text-gray-500 font-bold animate-pulse">Procesando y Ordenando...</div>';

        let filtrados = _inventarioCache.filter(p => {
            const term = (_lastFilters.searchTerm || '').toLowerCase();
            const textMatch = !term || 
                (p.presentacion || '').toLowerCase().includes(term) ||
                (p.marca || '').toLowerCase().includes(term) ||
                (p.segmento || '').toLowerCase().includes(term);
                
            const rMatch = !_lastFilters.rubro || p.rubro === _lastFilters.rubro;
            const sMatch = !_lastFilters.segmento || p.segmento === _lastFilters.segmento;
            const mMatch = !_lastFilters.marca || p.marca === _lastFilters.marca;
            
            return textMatch && rMatch && sMatch && mMatch;
        });

        const sortFn = await window.getGlobalProductSortFunction();
        filtrados.sort(sortFn);

        if (filtrados.length === 0) {
            container.innerHTML = `<div class="p-12 text-center text-gray-500 font-medium text-lg">No se encontraron productos con estos filtros.</div>`;
            return;
        }

        const numCols = readOnly ? 4 : 5;
        let html = `
            <table class="min-w-full bg-white text-sm text-left whitespace-nowrap">
                <thead class="bg-gray-800 text-white sticky top-0 z-20 shadow-md">
                    <tr>
                        <th class="py-3 px-4 uppercase font-semibold tracking-wider">Presentación</th>
                        <th class="py-3 px-4 uppercase font-semibold tracking-wider hidden sm:table-cell">Marca</th>
                        <th class="py-3 px-4 uppercase font-semibold tracking-wider text-right">Precio</th>
                        <th class="py-3 px-4 uppercase font-semibold tracking-wider text-center">Stock Base</th>
                        ${!readOnly ? `<th class="py-3 px-4 uppercase font-semibold tracking-wider text-center">Acciones</th>` : ''}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
        `;

        let currentGroup = null;

        filtrados.forEach(p => {
            const rName = (p.rubro || 'SIN RUBRO').toUpperCase();
            const sName = (p.segmento || 'SIN SEGMENTO').toUpperCase();
            const groupName = `${rName} > ${sName}`;

            if (groupName !== currentGroup) {
                currentGroup = groupName;
                html += `
                    <tr class="bg-blue-50/90 border-t-2 border-blue-200">
                        <td colspan="${numCols}" class="py-2.5 px-4 font-extrabold text-blue-900 sticky top-[44px] z-10 backdrop-blur-sm shadow-sm tracking-wide">
                            📁 ${currentGroup}
                        </td>
                    </tr>
                `;
            }

            const vPor = p.ventaPor || {und:true};
            const pre = p.precios || {und: p.precioPorUnidad || 0};
            
            let labelPres = p.presentacion || 'N/A';
            let labelPrecio = '$0.00';
            let stockSuffix = 'Und';
            let factor = 1;

            if (vPor.cj) {
                if (p.unidadesPorCaja > 1) labelPres += ` <span class="text-gray-400 text-xs">(${p.unidadesPorCaja}u)</span>`;
                labelPrecio = `<span class="text-gray-500 text-xs">Cj</span> $${(pre.cj || 0).toFixed(2)}`;
                factor = Math.max(1, p.unidadesPorCaja || 1);
                stockSuffix = 'Cj';
            } else if (vPor.paq) {
                if (p.unidadesPorPaquete > 1) labelPres += ` <span class="text-gray-400 text-xs">(${p.unidadesPorPaquete}u)</span>`;
                labelPrecio = `<span class="text-gray-500 text-xs">Pq</span> $${(pre.paq || 0).toFixed(2)}`;
                factor = Math.max(1, p.unidadesPorPaquete || 1);
                stockSuffix = 'Paq';
            } else {
                labelPrecio = `<span class="text-gray-500 text-xs">Un</span> $${(pre.und || 0).toFixed(2)}`;
            }

            const stockStr = `${Math.floor((p.cantidadUnidades || 0) / factor)} ${stockSuffix}`;
            const tooltip = `Stock Total Base: ${p.cantidadUnidades || 0} Und`;

            html += `
                <tr class="hover:bg-amber-50 transition-colors duration-150">
                    <td class="py-3 px-4 font-semibold text-gray-800">
                        ${labelPres}
                        <span class="block sm:hidden text-xs text-gray-500 font-normal mt-0.5">${p.marca || 'S/M'}</span>
                    </td>
                    <td class="py-3 px-4 text-gray-600 hidden sm:table-cell">${p.marca || 'S/M'}</td>
                    <td class="py-3 px-4 font-bold text-gray-900 text-right">${labelPrecio}</td>
                    <td class="py-3 px-4 font-bold text-gray-700 text-center" title="${tooltip}">${stockStr}</td>
                    ${!readOnly ? `
                    <td class="py-3 px-4">
                        <div class="flex justify-center space-x-2">
                            <button onclick="window.inventarioModule.editProducto('${p.id}')" class="px-3 py-1.5 bg-yellow-500 text-white font-medium text-xs rounded hover:bg-yellow-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all">Editar</button>
                            <button onclick="window.inventarioModule.deleteProducto('${p.id}')" class="px-3 py-1.5 bg-red-500 text-white font-medium text-xs rounded hover:bg-red-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400 transition-all">Borrar</button>
                        </div>
                    </td>
                    ` : ''}
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    // =========================================================================================
    // VISTA "ORDENAR SEGMENTOS Y MARCAS" RECONSTRUIDA
    // =========================================================================================

    function showOrdenarSegmentosMarcasView() {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo administradores.');
            return;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl border border-blue-100">
                        <h2 class="text-3xl font-black text-blue-900 mb-2 text-center tracking-tight">Ordenar Catálogo</h2>
                        <p class="text-center text-gray-600 mb-6 font-medium">Arrastre los elementos para definir el orden exacto.</p>
                        
                        <div class="mb-6 bg-blue-50 p-6 border-2 border-blue-200 rounded-xl shadow-inner">
                           <label for="ordenarRubroFilter" class="block text-blue-800 font-bold mb-3 text-lg">Paso 1: Seleccione el Rubro a ordenar</label>
                           <select id="ordenarRubroFilter" class="w-full px-4 py-3 border-2 border-blue-300 rounded-lg shadow-sm text-lg font-semibold focus:ring-4 focus:ring-blue-400 outline-none transition-all cursor-pointer bg-white">
                               <option value="">-- Elija un Rubro --</option>
                           </select>
                        </div>

                        <div id="segmentos-marcas-sortable-list" class="space-y-4 max-h-[60vh] overflow-y-auto pb-4 px-2">
                            <!-- Se llena dinámicamente -->
                        </div>
                        <div class="mt-8 flex flex-col sm:flex-row gap-4 justify-between border-t pt-6">
                            <button id="backToInventarioBtn" class="w-full sm:w-auto px-8 py-3 bg-gray-500 text-white font-bold rounded-lg shadow hover:bg-gray-600 transition-colors">Volver</button>
                            <button id="saveOrderBtn" class="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition-colors hidden">Guardar Orden de este Rubro</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveOrderBtn').addEventListener('click', handleGuardarOrdenJerarquia);
        
        populateMergedDropdown('rubros', 'ordenarRubroFilter', 'rubro', 'Elija un Rubro');
        
        const rubroFilter = document.getElementById('ordenarRubroFilter');
        rubroFilter.addEventListener('change', () => renderSortableHierarchy(rubroFilter.value));
        
        renderSortableHierarchy('');
    }

    async function renderSortableHierarchy(rubroFiltro) {
        const container = document.getElementById('segmentos-marcas-sortable-list');
        const saveBtn = document.getElementById('saveOrderBtn');
        if (!container) return;
        
        if (!rubroFiltro) {
            container.innerHTML = `
                <div class="p-10 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <span class="text-4xl mb-4 block">👆</span>
                    <h3 class="text-xl font-bold text-gray-700 mb-2">Esperando Selección</h3>
                    <p class="text-gray-500">Para garantizar que el orden se guarde correctamente, debe ordenar un rubro a la vez.</p>
                </div>`;
            saveBtn.classList.add('hidden');
            return;
        }

        container.innerHTML = `<p class="text-gray-500 text-center font-bold p-8 animate-pulse">Cargando estructura del rubro...</p>`;
        saveBtn.classList.remove('hidden');
        
        try {
            let prodsEnRubro = _inventarioCache.filter(p => p.rubro === rubroFiltro);
            const sortFn = await window.getGlobalProductSortFunction();
            prodsEnRubro.sort(sortFn);

            const hierarchy = new Map(); 
            
            prodsEnRubro.forEach(p => {
                const seg = p.segmento || 'SIN SEGMENTO';
                const mar = (p.marca || 'S/M').trim().toUpperCase();
                
                if (!hierarchy.has(seg)) hierarchy.set(seg, new Map());
                const segMap = hierarchy.get(seg);
                
                if (!segMap.has(mar)) segMap.set(mar, []);
                segMap.get(mar).push(p);
            });

            container.innerHTML = '';
            if (hierarchy.size === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center p-8 font-medium">Este rubro no contiene productos actualmente.</p>`;
                saveBtn.classList.add('hidden');
                return;
            }

            hierarchy.forEach((marcasMap, segName) => {
                const segCont = document.createElement('div');
                segCont.className = 'segmento-container bg-white border border-blue-300 rounded-xl mb-6 shadow-sm overflow-hidden';
                segCont.dataset.name = segName;
                segCont.dataset.type = 'segmento';
                segCont.draggable = true; 

                const segTitle = document.createElement('div');
                segTitle.className = 'segmento-title p-4 bg-blue-100/50 flex items-center font-black text-blue-900 border-b border-blue-200 cursor-move hover:bg-blue-100 transition-colors';
                segTitle.innerHTML = `<span class="mr-3 drag-handle-seg px-3 py-1.5 bg-white rounded shadow-sm text-gray-500 pointer-events-none">↕</span>
                                      <span class="uppercase tracking-wider pointer-events-none text-lg">📁 ${segName}</span>`;
                segCont.appendChild(segTitle);

                const marcasList = document.createElement('ul');
                marcasList.className = 'marcas-list p-4 space-y-4 bg-gray-50/50 min-h-[50px]';

                marcasMap.forEach((prodsArray, marcaName) => {
                    const li = document.createElement('li');
                    li.className = 'marca-container p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-blue-300 transition-colors';
                    li.dataset.name = marcaName;
                    li.dataset.type = 'marca';
                    li.draggable = true; 

                    const marcaTitle = document.createElement('div');
                    marcaTitle.className = 'marca-title font-bold text-gray-800 cursor-move mb-3 flex items-center bg-gray-100 p-2 rounded-md border border-gray-200';
                    marcaTitle.innerHTML = `<span class="mr-3 drag-handle-mar px-2 py-1 bg-white rounded shadow-sm text-gray-400 pointer-events-none">↕</span>
                                            <span class="pointer-events-none">🏷️ ${marcaName}</span>`;
                    li.appendChild(marcaTitle);

                    const prodList = document.createElement('ul');
                    prodList.className = 'productos-sortable-list pl-4 space-y-2 min-h-[20px] border-l-2 border-dashed border-gray-200 ml-4';

                    prodsArray.forEach(p => {
                        const pLi = document.createElement('li');
                        pLi.dataset.id = p.id;
                        pLi.dataset.type = 'producto';
                        pLi.className = 'producto-item flex items-center p-2.5 bg-white border border-gray-200 rounded-md text-sm hover:bg-yellow-50 hover:border-yellow-300 transition-all cursor-move shadow-sm';
                        pLi.draggable = true; 
                        
                        pLi.innerHTML = `
                            <span class="mr-3 drag-handle-prod px-2 py-1 bg-gray-100 rounded text-gray-400 pointer-events-none">⋮</span>
                            <span class="flex-grow font-semibold text-gray-700 pointer-events-none">${p.presentacion}</span>
                        `;
                        prodList.appendChild(pLi);
                    });

                    li.appendChild(prodList);
                    marcasList.appendChild(li);
                });
                
                segCont.appendChild(marcasList);
                container.appendChild(segCont);
            });

            setupNativeDragAndDrop(container);

        } catch (error) {
            console.error("Error al renderizar jerarquía:", error);
            container.innerHTML = `<p class="text-red-500 text-center font-bold p-8">Error: ${error.message}</p>`;
        }
    }

    function setupNativeDragAndDrop(container) {
        let draggedItem = null;
        let draggedType = null;
        let sourceList = null;
        let placeholder = document.createElement('div');

        container.addEventListener('dragstart', e => {
            if (e.target.classList.contains('segmento-container')) {
                draggedItem = e.target;
                draggedType = 'segmento';
            } else if (e.target.classList.contains('marca-container')) {
                draggedItem = e.target;
                draggedType = 'marca';
            } else if (e.target.classList.contains('producto-item')) {
                draggedItem = e.target;
                draggedType = 'producto';
            }

            if (!draggedItem) return;
            
            sourceList = draggedItem.parentNode;
            e.stopPropagation(); 
            
            setTimeout(() => draggedItem.classList.add('opacity-50', 'scale-95'), 0);
            e.dataTransfer.effectAllowed = 'move';
            
            placeholder.className = draggedItem.className + ' bg-blue-50 border-2 border-dashed border-blue-400 opacity-80 shadow-inner rounded-lg';
            placeholder.innerHTML = '<div class="w-full h-full flex items-center justify-center text-blue-400 font-bold">Soltar aquí</div>';
            placeholder.style.height = draggedItem.offsetHeight + 'px';
        });

        container.addEventListener('dragend', e => {
            if (draggedItem) draggedItem.classList.remove('opacity-50', 'scale-95');
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
            else if (draggedType === 'producto') dropZoneClass = '.productos-sortable-list';

            const dropZone = e.target.closest(dropZoneClass);
            
            if (!dropZone || dropZone !== sourceList) {
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
        
        const rubroValue = document.getElementById('ordenarRubroFilter')?.value;
        if (!rubroValue) {
            _showModal('Aviso', 'Seleccione un rubro primero.'); return;
        }

        const segConts = document.querySelectorAll('#segmentos-marcas-sortable-list .segmento-container'); 
        if (segConts.length === 0) { _showModal('Aviso', 'No hay elementos para ordenar.'); return; }
        
        _showModal('Progreso', 'Guardando orden jerárquico de forma segura en las categorías...');
        
        const batch = _writeBatch(_db);
        const brandAccumulator = new Map();
        const norm = s => (s || '').trim().toUpperCase();
        
        // El script ahora guarda el orden visual actual en la base de datos de configuraciones Privadas (donde seguro tienes permiso)
        segConts.forEach((segCont, sIdx) => {
            let sId = segCont.dataset.id;
            const sName = segCont.dataset.name;
            
            if (!sId || sId.startsWith('temp_')) {
                sId = _doc(_collection(_db, 'dummy')).id;
            }
            
            const marcaItems = segCont.querySelectorAll('.marcas-list > .marca-container');
            const marcaOrder = Array.from(marcaItems).map(item => item.dataset.name);
            
            // Guardamos Segmento
            batch.set(_doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, sId), { 
                name: sName, 
                orden: sIdx, 
                marcaOrder: marcaOrder 
            }, { merge: true });

            // Acumulamos las Marcas
            marcaItems.forEach(mItem => {
                const mName = mItem.dataset.name;
                const nameKey = norm(mName);

                if (!brandAccumulator.has(nameKey)) {
                    let mId = mItem.dataset.id;
                    if (!mId || mId.startsWith('temp_')) {
                        mId = _doc(_collection(_db, 'dummy')).id;
                    }
                    brandAccumulator.set(nameKey, { id: mId, name: mName, order: [] });
                }

                const prodItems = mItem.querySelectorAll('.productos-sortable-list .producto-item');
                const pIds = Array.from(prodItems).map(pi => pi.dataset.id);
                brandAccumulator.get(nameKey).order.push(...pIds);
            });
        });

        // Combinar con marcas existentes para no borrar productos de otros rubros ocultos
        const existingMarcas = {};
        try {
            const snap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`));
            snap.docs.forEach(d => existingMarcas[d.id] = d.data().productOrder || []);
        } catch (e) {}

        brandAccumulator.forEach((data, nameKey) => {
            const oldOrder = existingMarcas[data.id] || [];
            const newOrderSet = new Set(data.order);
            const hiddenKeys = oldOrder.filter(k => !newOrderSet.has(k));
            const finalOrder = [...data.order, ...hiddenKeys];

            batch.set(_doc(_db, `artifacts/${_appId}/users/${_userId}/marcas`, data.id), { 
                name: data.name, 
                productOrder: finalOrder
            }, { merge: true });
        });

        try {
            await batch.commit();
            invalidateSegmentOrderCache(); 
            _showModal('Éxito', `Orden guardado exitosamente. La vista Ver Productos ha sido actualizada.`, showInventarioSubMenu);
        } catch (error) { 
            console.error("Error al guardar orden:", error);
            _showModal('Error', `Fallo al guardar: ${error.message}`);
        }
    }

    // =========================================================================================
    // RESTO DE FUNCIONES DEL MÓDULO
    // =========================================================================================

    async function showAgregarProductoView() {
        if (_userRole !== 'admin') return;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto max-w-2xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center"> <h2 class="text-2xl font-bold mb-6">Agregar Nuevo Producto</h2> <form id="addProductoForm" class="space-y-4 text-left"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="rubro">Rubro:</label> <div class="flex items-center space-x-2"> <select id="rubro" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('rubros','Rubro')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="segmento">Segmento:</label> <div class="flex items-center space-x-2"> <select id="segmento" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('segmentos','Segmento')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="marca">Marca:</label> <div class="flex items-center space-x-2"> <select id="marca" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('marcas','Marca')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="presentacion">Presentación:</label> <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required> </div> </div> <div class="border-t pt-4 mt-4"> <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <div> <label class="block mb-2 font-medium">Venta por:</label> <div id="ventaPorContainer" class="flex space-x-4"> <label class="flex items-center"><input type="checkbox" id="ventaPorUnd" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Und.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorPaq" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Paq.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorCj" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Cj.</span></label> </div> </div> <div class="mt-4 md:mt-0"> <label class="flex items-center cursor-pointer"> <input type="checkbox" id="manejaVaciosCheck" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2 font-medium">Maneja Vacío</span> </label> <div id="tipoVacioContainer" class="mt-2 hidden"> <label for="tipoVacioSelect" class="block text-sm font-medium">Tipo:</label> <select id="tipoVacioSelect" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-gray-50"> <option value="">Seleccione...</option> <option value="1/4 - 1/3">1/4 - 1/3</option> <option value="ret 350 ml">Ret 350 ml</option> <option value="ret 1.25 Lts">Ret 1.25 Lts</option> </select> </div> </div> </div> <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"></div> <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div> </div> <div class="border-t pt-4 mt-4"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="cantidadActual" class="block font-medium">Stock Inicial (Und. Base):</label> <input type="number" id="cantidadActual" value="0" min="0" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white text-gray-700"> </div> <div> <label for="ivaTipo" class="block font-medium">IVA:</label> <select id="ivaTipo" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white" required> <option value="16">16%</option> <option value="0">Exento 0%</option> </select> </div> </div> </div> <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 transition duration-150">Agregar Producto</button> </form> <button id="backToMenuBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-150">Volver</button> </div> </div> </div>`;

        const setupDropdowns = async () => {
            await Promise.all([
                populateMergedDropdown('rubros', 'rubro', 'rubro', 'Rubro'),
                populateMergedDropdown('segmentos', 'segmento', 'segmento', 'Segmento'),
                populateMergedDropdown('marcas', 'marca', 'marca', 'Marca')
            ]);
        };

        if (_inventarioCache.length === 0) {
            startMainInventarioListener(setupDropdowns);
        } else {
            await setupDropdowns();
        }

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
             populateMergedDropdown('rubros', 'rubro', 'rubro', 'Rubro', prod.rubro),
             populateMergedDropdown('segmentos', 'segmento', 'segmento', 'Segmento', prod.segmento),
             populateMergedDropdown('marcas', 'marca', 'marca', 'Marca', prod.marca)
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
            populateMergedDropdown('rubros', 'recarga-filter-rubro', 'rubro', 'Todos');
            
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
        
        let lastHeader = null;
        
        productos.forEach(p => {
            let currentHeaderValue = `${(p.rubro || 'Sin Rubro').toUpperCase()} > ${(p.segmento || 'Sin Segmento').toUpperCase()}`;

            if (currentHeaderValue !== lastHeader) { 
                lastHeader = currentHeaderValue; 
                tableHTML += `<tr><td colspan="3" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastHeader}</td></tr>`; 
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

    window.inventarioModule = {
        editProducto,
        deleteProducto,
        handleDeleteDataItem,
        showAddCategoryModal,
        invalidateSegmentOrderCache 
    };

})();

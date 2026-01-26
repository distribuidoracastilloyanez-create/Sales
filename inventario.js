(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;

    let _inventarioCache = [];
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _inventarioListenerUnsubscribe = null;
    let _marcasCache = null;
    
    // Variable para persistir las cantidades ingresadas en la recarga
    let _recargaTempState = {}; 

    // Cache para ordenamiento de Segmentos/Marcas
    let _segmentoOrderCache = null;
    let _marcaOrderCacheBySegment = {};


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
    };

    // --- CORRECCIÓN: Manejador de errores asíncronos en listener ---
    function startMainInventarioListener(callback) {
        if (_inventarioListenerUnsubscribe) {
            try { _inventarioListenerUnsubscribe(); } catch(e) { console.warn("Error unsubscribing previous listener:", e); }
        }
        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        _inventarioListenerUnsubscribe = _onSnapshot(collectionRef, (snapshot) => {
            _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (callback && typeof callback === 'function') {
                 // Envolver en promesa para capturar errores asíncronos en el callback (ej. renderizado o sorting)
                 Promise.resolve(callback()).catch(cbError => {
                     console.error("Listener callback error (Render/Sort):", cbError);
                 });
            }
        }, (error) => {
             if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                 console.log(`Inventory listener error ignored (assumed logout): ${error.code}`); 
                 return; 
             }
             console.error("Error en listener de inventario:", error);
             if (error.code !== 'cancelled') { 
                 _showModal('Error de Conexión', 'No se pudo actualizar el inventario.');
             }
        });
        _activeListeners.push(_inventarioListenerUnsubscribe);
    }

    function invalidateSegmentOrderCache() {
        _segmentoOrderCache = null;
        _marcaOrderCacheBySegment = {};
        _marcasCache = null; 
        if (window.catalogoModule?.invalidateCache) {
             window.catalogoModule.invalidateCache();
        }
         if (window.ventasModule?.invalidateCache) {
             window.ventasModule.invalidateCache();
        }
        console.log("Cachés de ordenamiento invalidadas (Inventario y Global).");
    }

    window.showInventarioSubMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
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
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    // --- CORRECCIÓN: showModifyDeleteView ahora es Async y espera carga inicial ---
    async function showModifyDeleteView() {
         if (_floatingControls) _floatingControls.classList.add('hidden'); 
         const isAdmin = _userRole === 'admin';
        
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl"> <h2 class="text-2xl font-bold mb-6 text-center">Ver Productos / ${isAdmin?'Modificar Def.':'Consultar Stock'}</h2> ${getFiltrosHTML('modify')} <div id="productosListContainer" class="overflow-x-auto max-h-96 border rounded-lg"> <p class="text-gray-500 text-center p-4">Cargando...</p> </div> <div class="mt-6 flex flex-col sm:flex-row gap-4"> <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button> ${isAdmin?`<button id="deleteAllProductosBtn" class="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700">Eliminar Todos</button>`:''} </div> </div> </div> </div>`;

        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        if (isAdmin) document.getElementById('deleteAllProductosBtn')?.addEventListener('click', handleDeleteAllProductos);

        // 1. Esperar a que se poble el dropdown de Rubros
        await _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'modify-filter-rubro', 'Rubro');

        // 2. Configurar filtros y obtener función de actualización
        // Definimos un callback base para renderizar
        const baseRender = () => renderProductosList('productosListContainer', !isAdmin);
        const { updateDependentDropdowns } = setupFiltros('modify', baseRender);

        // 3. Restaurar valor inicial del Rubro (ya que el dropdown está lleno)
        const rubroSelect = document.getElementById('modify-filter-rubro');
        if (rubroSelect) rubroSelect.value = _lastFilters.rubro || '';

        // 4. Crear callback inteligente para el listener
        let isFirstLoad = true;
        const smartListenerCallback = async () => {
            // Renderizar lista
            await baseRender();
            
            // Si es la primera carga y tenemos datos, restaurar filtros dependientes
            if (isFirstLoad && _inventarioCache.length > 0) {
                // 'init' intentará restaurar segmento y marca desde _lastFilters
                updateDependentDropdowns('init');
                // Re-renderizar para aplicar los filtros de segmento/marca recién restaurados
                await baseRender();
                isFirstLoad = false;
            }
        };

        // 5. Iniciar listener
        startMainInventarioListener(smartListenerCallback);
    }

    function getFiltrosHTML(prefix) {
        const currentSearch = _lastFilters.searchTerm || '';
        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                <input type="text" id="${prefix}-search-input" placeholder="Buscar por Presentación, Marca o Segmento..." class="md:col-span-4 w-full px-4 py-2 border rounded-lg text-sm" value="${currentSearch}">
                <div>
                    <label for="${prefix}-filter-rubro" class="text-xs font-medium text-gray-700">Rubro</label>
                    <select id="${prefix}-filter-rubro" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Todos</option>
                    </select>
                </div>
                <div>
                    <label for="${prefix}-filter-segmento" class="text-xs font-medium text-gray-700">Segmento</label>
                    <select id="${prefix}-filter-segmento" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500" disabled>
                        <option value="">Todos</option>
                    </select>
                </div>
                <div>
                    <label for="${prefix}-filter-marca" class="text-xs font-medium text-gray-700">Marca</label>
                    <select id="${prefix}-filter-marca" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500" disabled>
                        <option value="">Todos</option>
                    </select>
                </div>
                <button id="${prefix}-clear-filters-btn" class="bg-gray-300 text-xs font-semibold text-gray-700 rounded-lg self-end py-1.5 px-3 hover:bg-gray-400 transition duration-150">Limpiar</button>
            </div>
        `;
    }

    // --- CORRECCIÓN: setupFiltros devuelve la función de actualización y elimina setTimeout ---
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

            // --- Actualizar Segmentos ---
            segmentoFilter.innerHTML = '<option value="">Todos</option>';
            segmentoFilter.disabled = true;
            segmentoFilter.value = "";

            if (selectedRubro) {
                const segmentos = [...new Set(_inventarioCache
                    .filter(p => p.rubro === selectedRubro && p.segmento)
                    .map(p => p.segmento))]
                    .sort();
                if (segmentos.length > 0) {
                    segmentos.forEach(s => {
                        const option = document.createElement('option');
                        option.value = s; option.textContent = s;
                        if (s === currentSegmentoValue) { option.selected = true; }
                        segmentoFilter.appendChild(option);
                    });
                    segmentoFilter.disabled = false;
                    segmentoFilter.value = currentSegmentoValue; 
                }
            }
            if (segmentoFilter.value !== currentSegmentoValue) { _lastFilters.segmento = ''; }

            // --- Actualizar Marcas ---
            marcaFilter.innerHTML = '<option value="">Todos</option>';
            marcaFilter.disabled = true;
             marcaFilter.value = "";

            if (selectedRubro) {
                const marcas = [...new Set(_inventarioCache
                    .filter(p => p.rubro === selectedRubro && (!segmentoFilter.value || p.segmento === segmentoFilter.value) && p.marca)
                    .map(p => p.marca))]
                    .sort();
                if (marcas.length > 0) {
                    marcas.forEach(m => {
                         const option = document.createElement('option');
                         option.value = m; option.textContent = m;
                         if (m === currentMarcaValue) { option.selected = true; }
                         marcaFilter.appendChild(option);
                    });
                    marcaFilter.disabled = false;
                    marcaFilter.value = currentMarcaValue;
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
        rubroFilter.addEventListener('change', () => {
             _lastFilters.segmento = ''; _lastFilters.marca = ''; 
            updateDependentDropdowns('rubro');
            applyAndSaveChanges();
        });
        segmentoFilter.addEventListener('change', () => {
            _lastFilters.marca = ''; 
            updateDependentDropdowns('segmento');
            applyAndSaveChanges();
        });
        marcaFilter.addEventListener('change', applyAndSaveChanges);
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            rubroFilter.value = '';
            _lastFilters.segmento = ''; _lastFilters.marca = '';
            updateDependentDropdowns('rubro');
            applyAndSaveChanges();
        });
        
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

        const sortFunction = await window.getGlobalProductSortFunction();
        productosFiltrados.sort(sortFunction);

        if (productosFiltrados.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 p-4">No hay productos que coincidan con los filtros seleccionados.</p>`;
            return;
        }

        const cols = readOnly ? 4 : 5;
        let tableHTML = `
            <table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-200 sticky top-0 z-10">
                    <tr>
                        <th class="py-2 px-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Presentación</th>
                        <th class="py-2 px-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Marca</th>
                        <th class="py-2 px-3 text-right font-semibold text-gray-600 uppercase tracking-wider">Precio</th>
                        <th class="py-2 px-3 text-center font-semibold text-gray-600 uppercase tracking-wider">Stock</th>
                        ${!readOnly ? `<th class="py-2 px-3 text-center font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>` : ''}
                    </tr>
                </thead>
                <tbody>`;

        let lastHeaderKey = null;
        const firstSortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';

        productosFiltrados.forEach(p => {
            const currentHeaderValue = p[firstSortKey] || `Sin ${firstSortKey}`;
            if (currentHeaderValue !== lastHeaderKey) {
                lastHeaderKey = currentHeaderValue;
                tableHTML += `<tr><td colspan="${cols}" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastHeaderKey}</td></tr>`;
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

            tableHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="py-2 px-3 text-gray-800">${displayPresentacion}</td>
                    <td class="py-2 px-3 text-gray-700">${p.marca || 'S/M'}</td>
                    <td class="py-2 px-3 text-right font-medium text-gray-900">${displayPrecio}</td>
                    <td class="py-2 px-3 text-center font-medium text-gray-900" title="${stockUnidadesBaseTitle}">${displayStock}</td>
                    ${!readOnly ? `
                    <td class="py-2 px-3 text-center space-x-1">
                        <button onclick="window.inventarioModule.editProducto('${p.id}')" class="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-50" title="Editar Definición">Edt</button>
                        <button onclick="window.inventarioModule.deleteProducto('${p.id}')" class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-50" title="Eliminar Producto">Del</button>
                    </td>` : ''}
                </tr>`;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }

    // --- NUEVAS FUNCIONES FALTANTES PARA AGREGAR PRODUCTOS Y GESTIONAR DATOS ---

    async function showAgregarProductoView() {
        if (_userRole !== 'admin') return;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto max-w-2xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center"> <h2 class="text-2xl font-bold mb-6">Agregar Nuevo Producto</h2> <form id="addProductoForm" class="space-y-4 text-left"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="rubro">Rubro:</label> <div class="flex items-center space-x-2"> <select id="rubro" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('rubros','Rubro')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="segmento">Segmento:</label> <div class="flex items-center space-x-2"> <select id="segmento" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('segmentos','Segmento')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="marca">Marca:</label> <div class="flex items-center space-x-2"> <select id="marca" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('marcas','Marca')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="presentacion">Presentación:</label> <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required> </div> </div> <div class="border-t pt-4 mt-4"> <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <div> <label class="block mb-2 font-medium">Venta por:</label> <div id="ventaPorContainer" class="flex space-x-4"> <label class="flex items-center"><input type="checkbox" id="ventaPorUnd" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Und.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorPaq" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Paq.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorCj" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Cj.</span></label> </div> </div> <div class="mt-4 md:mt-0"> <label class="flex items-center cursor-pointer"> <input type="checkbox" id="manejaVaciosCheck" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2 font-medium">Maneja Vacío</span> </label> <div id="tipoVacioContainer" class="mt-2 hidden"> <label for="tipoVacioSelect" class="block text-sm font-medium">Tipo:</label> <select id="tipoVacioSelect" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-gray-50"> <option value="">Seleccione...</option> <option value="1/4 - 1/3">1/4 - 1/3</option> <option value="ret 350 ml">Ret 350 ml</option> <option value="ret 1.25 Lts">Ret 1.25 Lts</option> </select> </div> </div> </div> <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"></div> <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div> </div> <div class="border-t pt-4 mt-4"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="cantidadActual" class="block font-medium">Stock Inicial (Und. Base):</label> <input type="number" id="cantidadActual" value="0" min="0" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white text-gray-700"> </div> <div> <label for="ivaTipo" class="block font-medium">IVA:</label> <select id="ivaTipo" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white" required> <option value="16">16%</option> <option value="0">Exento 0%</option> </select> </div> </div> </div> <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 transition duration-150">Agregar Producto</button> </form> <button id="backToMenuBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-150">Volver</button> </div> </div> </div>`;

        await Promise.all([
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
        
        // Inicializar
        document.getElementById('ventaPorUnd').checked = true;
        updateDynamicInputs();

        document.getElementById('addProductoForm').addEventListener('submit', handleAddProducto);
        document.getElementById('backToMenuBtn').addEventListener('click', showInventarioSubMenu);
    }

    async function handleAddProducto(e) {
        e.preventDefault();
        const data = getProductoDataFromForm(false); // false = isUpdate (no)
        if (!data.rubro||!data.segmento||!data.marca||!data.presentacion){_showModal('Error','Completa Rubro, Segmento, Marca y Presentación.');return;}
        if (!data.ventaPor.und&&!data.ventaPor.paq&&!data.ventaPor.cj){_showModal('Error','Selecciona al menos una forma de venta.');return;}
        
        // Validación de precios
        let precioValido = (data.ventaPor.und && data.precios.und > 0) || 
                           (data.ventaPor.paq && data.precios.paq > 0) || 
                           (data.ventaPor.cj && data.precios.cj > 0);
        if(!precioValido){_showModal('Error','Ingresa al menos un precio válido (> 0) para la forma de venta seleccionada.');return;}
        
        if (data.manejaVacios && !data.tipoVacio){_showModal('Error','Si maneja vacío, selecciona el tipo.');return;}

        _showModal('Progreso', 'Agregando producto...');
        try {
            const docRef = await _addDoc(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`), data);
            
            // Propagar creación
            if (window.adminModule?.propagateProductChange) {
                _showModal('Progreso', 'Propagando nuevo producto...');
                await window.adminModule.propagateProductChange(docRef.id, data);
            }
            
            _showModal('Éxito', 'Producto agregado correctamente.', showInventarioSubMenu);
        } catch (err) {
            console.error("Error agregando producto:", err);
            _showModal('Error', `No se pudo agregar: ${err.message}`);
        }
    }

    function showAddCategoryModal(collectionName, title) {
        // Usamos el modal global definido en index.html
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
        // Función utilitaria por si se necesita borrar un item especifico desde otro módulo
        try {
            await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`, id));
            return true;
        } catch(e) {
            console.error("Error eliminando item de datos:", e);
            throw e;
        }
    }

    // Helper para extraer datos del form (usado en Edit y Add)
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
             // Solo al crear leemos el stock inicial del input
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

    // --- CORRECCIÓN: Uso de {merge: true} para proteger campos ocultos ---
    async function handleUpdateProducto(e, productId) {
        e.preventDefault(); if (_userRole !== 'admin') return; 
        const updatedData = getProductoDataFromForm(true); // true = isUpdate
        const productoOriginal = _inventarioCache.find(p => p.id === productId); 
        if (!productoOriginal) { _showModal('Error', 'Producto original no encontrado.'); return; } 
        if (!updatedData.rubro||!updatedData.segmento||!updatedData.marca||!updatedData.presentacion){_showModal('Error','Completa Rubro, Segmento, Marca y Presentación.');return;} if (!updatedData.ventaPor.und&&!updatedData.ventaPor.paq&&!updatedData.ventaPor.cj){_showModal('Error','Selecciona al menos una forma de venta.');return;} if (updatedData.manejaVacios&&!updatedData.tipoVacio){_showModal('Error','Si maneja vacío, selecciona el tipo.');document.getElementById('tipoVacioSelect')?.focus();return;} let precioValido=(updatedData.ventaPor.und&&updatedData.precios.und>0)||(updatedData.ventaPor.paq&&updatedData.precios.paq>0)||(updatedData.ventaPor.cj&&updatedData.precios.cj>0); if(!precioValido){_showModal('Error','Ingresa al menos un precio válido (> 0) para la forma de venta seleccionada.');document.querySelector('#preciosContainer input[required]')?.focus();return;}
        
        updatedData.cantidadUnidades = productoOriginal.cantidadUnidades || 0;
        _showModal('Progreso','Guardando cambios...'); 
        try { 
            // merge: true es vital para no borrar campos que no estén en el formulario
            await _setDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId), updatedData, { merge: true }); 
            if (window.adminModule?.propagateProductChange) { 
                _showModal('Progreso','Propagando cambios...'); 
                await window.adminModule.propagateProductChange(productId, updatedData); 
            } 
            _showModal('Éxito','Producto modificado y propagado correctamente.'); 
            showModifyDeleteView(); 
        } catch (err) { 
            console.error("Error modificando producto:", err); 
            _showModal('Error',`Ocurrió un error al guardar: ${err.message}`); 
        }
    }


    function deleteProducto(productId) {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; } const prod = _inventarioCache.find(p => p.id === productId); if (!prod) { _showModal('Error', 'Producto no encontrado.'); return; }
        _showModal('Confirmar Eliminación', `¿Estás seguro de eliminar el producto "${prod.presentacion}"? Esta acción se propagará a todos los usuarios y es IRREVERSIBLE.`, async () => { _showModal('Progreso', `Eliminando "${prod.presentacion}"...`); try { await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId)); if (window.adminModule?.propagateProductChange) { _showModal('Progreso', `Propagando eliminación...`); await window.adminModule.propagateProductChange(productId, null); } _showModal('Éxito',`Producto "${prod.presentacion}" eliminado y propagado.`); } catch (e) { console.error("Error eliminando producto:", e); _showModal('Error', `No se pudo eliminar: ${e.message}`); } }, 'Sí, Eliminar', null, true);
    }

    async function handleDeleteAllProductos() {
        if (_userRole !== 'admin') return; _showModal('Confirmación Extrema', `¿Estás SEGURO de eliminar TODOS los productos del inventario? Esta acción es IRREVERSIBLE y se propagará.`, async () => { _showModal('Progreso', 'Eliminando productos locales...'); try { const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const snapshot = await _getDocs(collectionRef); if (snapshot.empty) { _showModal('Aviso', 'No hay productos en el inventario para eliminar.'); return; } const productIds = snapshot.docs.map(d => d.id); const BATCH_LIMIT = 490; let batch = _writeBatch(_db), opsCount = 0, totalDeletedLocally = 0; for (const docSnapshot of snapshot.docs) { batch.delete(docSnapshot.ref); opsCount++; if (opsCount >= BATCH_LIMIT) { await batch.commit(); totalDeletedLocally += opsCount; batch = _writeBatch(_db); opsCount = 0; } } if (opsCount > 0) { await batch.commit(); totalDeletedLocally += opsCount; } _showModal('Progreso', `Se eliminaron ${totalDeletedLocally} productos localmente. Propagando eliminación...`); if (window.adminModule?.propagateProductChange) { let propagationErrors = 0; for (const productId of productIds) { try { await window.adminModule.propagateProductChange(productId, null); } catch (propError) { console.error(`Error propagando eliminación de ${productId}:`, propError); propagationErrors++; } } _showModal(propagationErrors > 0 ? 'Advertencia' : 'Éxito', `Se eliminaron ${totalDeletedLocally} productos.${propagationErrors > 0 ? ` Ocurrieron ${propagationErrors} errores al propagar.` : ' Propagado correctamente.'}`); } else { _showModal('Advertencia', `Se eliminaron ${totalDeletedLocally} productos localmente, pero la función de propagación no está disponible.`); } } catch (error) { console.error("Error al eliminar todos los productos:", error); _showModal('Error', `Hubo un error al eliminar los productos: ${error.message}`); } }, 'Sí, Eliminar Todos', null, true);
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

                const inventarioSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
                inventarioSnap.docs.forEach(doc => {
                    const data = doc.data();
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
                        const batchAdmin = _writeBatch(_db);
                        for (const colName in itemsToDelete) {
                            itemsToDelete[colName].forEach(item => {
                                batchAdmin.delete(_doc(_db, `artifacts/${_appId}/users/${_userId}/${colName}`, item.id));
                            });
                        }
                        await batchAdmin.commit();
                        _showModal('Progreso', `Datos eliminados localmente. Propagando eliminación...`);

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
                            _showModal('Advertencia', `Se eliminaron ${totalToDelete} datos maestros localmente, pero la función de propagación no está disponible.`);
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

    // --- Recarga de Productos (Reemplaza Ajuste Masivo) ---
    // --- CORRECCIÓN: showRecargaProductosView ahora es Async y espera carga inicial ---
    async function showRecargaProductosView() {
         if (_floatingControls) _floatingControls.classList.add('hidden');
         
         // Limpiar el estado temporal al abrir la vista
         _recargaTempState = {};

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Recarga de Productos</h2>
                        <p class="text-center text-gray-600 mb-4 text-sm">Ingrese el inventario FINAL. Se calculará la diferencia y se guardará un registro histórico. Los cambios se mantienen al cambiar de filtro.</p>
                        ${getFiltrosHTML('recarga')}
                        <div id="recargaListContainer" class="overflow-x-auto max-h-96 border rounded-lg">
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

        // 1. Esperar a que se poble el dropdown de Rubros
        await _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'recarga-filter-rubro', 'Rubro');

        // 2. Configurar filtros y obtener función de actualización
        const baseRender = () => renderRecargaList();
        const { updateDependentDropdowns } = setupFiltros('recarga', baseRender);

        // 3. Restaurar valor inicial del Rubro
        const rubroSelect = document.getElementById('recarga-filter-rubro');
        if (rubroSelect) rubroSelect.value = _lastFilters.rubro || '';

        // 4. Crear callback inteligente
        let isFirstLoad = true;
        const smartListenerCallback = async () => {
            await baseRender();
            if (isFirstLoad && _inventarioCache.length > 0) {
                updateDependentDropdowns('init');
                await baseRender();
                isFirstLoad = false;
            }
        };

        // 5. Iniciar listener
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
                        <th class="py-2 px-4 border-b text-center w-40">Nuevo Stock</th>
                    </tr>
                </thead>
                <tbody>`;
        
        let lastHeaderKey = null; 
        const firstSortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';
        
        productos.forEach(p => {
            const currentHeaderValue = p[firstSortKey] || `Sin ${firstSortKey}`;
            if (currentHeaderValue !== lastHeaderKey) { 
                lastHeaderKey = currentHeaderValue; 
                tableHTML += `<tr><td colspan="3" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastHeaderKey}</td></tr>`; 
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

            let inputValue;
            if (_recargaTempState.hasOwnProperty(p.id)) {
                inputValue = _recargaTempState[p.id];
            } else {
                inputValue = currentDisplayStock;
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
                                class="w-20 p-1 text-center border rounded-lg focus:ring-1 focus:ring-teal-500 focus:border-teal-500 recarga-qty-input font-bold">
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
                const newValStr = String(_recargaTempState[p.id]).trim();
                const newVal = parseInt(newValStr, 10);

                if (newValStr === '' || isNaN(newVal) || newVal < 0) {
                    invalidValues = true;
                    return; 
                }

                const vPor = p.ventaPor || {und:true};
                let factor = 1;
                if(vPor.cj) factor = p.unidadesPorCaja||1;
                else if(vPor.paq) factor = p.unidadesPorPaquete||1;

                const currentBase = p.cantidadUnidades || 0;
                const newBaseTotal = newVal * factor;

                if (newBaseTotal !== currentBase) {
                    const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                    batch.update(docRef, { cantidadUnidades: newBaseTotal });
                    
                    recargaDetalles.push({
                        productoId: p.id,
                        presentacion: p.presentacion,
                        unidadesAnteriores: currentBase,
                        unidadesNuevas: newBaseTotal,
                        diferenciaUnidades: newBaseTotal - currentBase,
                        factorUtilizado: factor
                    });
                    changesCount++;
                }
            }
        });

        if (invalidValues) { _showModal('Error', 'Hay valores inválidos en las cantidades ingresadas (vacíos o negativos). Por favor revise incluso en las categorías ocultas.'); return; }
        if (changesCount === 0) { _showModal('Aviso', 'No se detectaron cambios en el stock.'); return; }

        _showModal('Confirmar Recarga', `Se detectaron cambios en ${changesCount} productos. Se actualizará el inventario y se guardará el registro. ¿Continuar?`, async () => {
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
                
                // Limpiar estado y actualizar vista antes de mostrar el modal de éxito
                _recargaTempState = {};
                renderRecargaList(); 

                // Mensaje de éxito solicitado con botón "Continuar"
                _showModal('Recarga Exitosa', 'La carga se realizó exitosamente y se guardó el registro.', null, 'Continuar');
                
            } catch (error) {
                console.error("Error en recarga:", error);
                _showModal('Error', `Error al procesar: ${error.message}`);
            }
        }, 'Sí, Procesar', null, true);
    }


    function showOrdenarSegmentosMarcasView() {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo administradores.');
            return;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-2xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Ordenar Segmentos y Marcas (Visualización)</h2>
                        <p class="text-center text-gray-600 mb-6">Arrastra Segmentos para reordenarlos. Arrastra Marcas <span class="font-bold">dentro</span> de su Segmento.</p>
                        <div class="mb-4">
                           <label for="ordenarRubroFilter" class="block text-gray-700 font-medium mb-2">Filtrar por Rubro (Opcional):</label>
                           <select id="ordenarRubroFilter" class="w-full px-4 py-2 border rounded-lg">
                               <option value="">Todos</option>
                           </select>
                        </div>
                        <div id="segmentos-marcas-sortable-list" class="space-y-4 border rounded-lg p-4 max-h-[60vh] overflow-y-auto bg-gray-50">
                            <p class="text-gray-500 text-center">Cargando...</p>
                        </div>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="saveOrderBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Guardar Orden</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveOrderBtn').addEventListener('click', handleGuardarOrdenJerarquia);
        const rubroFilter = document.getElementById('ordenarRubroFilter');
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'ordenarRubroFilter', 'Rubro');
        rubroFilter.addEventListener('change', () => renderSortableHierarchy(rubroFilter.value));
        renderSortableHierarchy('');
    }

    async function getAllMarcas() {
        if (_marcasCache) return _marcasCache;
        try {
            const marcasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`);
            const snapshot = await _getDocs(marcasRef);
            _marcasCache = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
            return _marcasCache;
        } catch (error) { console.error("Error cargando marcas:", error); return []; }
    }

    async function renderSortableHierarchy(rubroFiltro = '') {
        const container = document.getElementById('segmentos-marcas-sortable-list');
        if (!container) return;
        container.innerHTML = `<p class="text-gray-500 text-center">Cargando...</p>`;
        try {
            const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
            let segSnapshot = await _getDocs(segmentosRef);
            let allSegments = segSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const segsSinOrden = allSegments.filter(s => s.orden === undefined || s.orden === null);
            if (segsSinOrden.length > 0) {
                 const segsConOrden = allSegments.filter(s => s.orden !== undefined && s.orden !== null);
                 const maxOrden = segsConOrden.reduce((max, s) => Math.max(max, s.orden ?? -1), -1);
                 const batch = _writeBatch(_db);
                 segsSinOrden.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                 segsSinOrden.forEach((seg, index) => {
                    const dRef = _doc(segmentosRef, seg.id);
                    const nOrden = maxOrden + 1 + index;
                    batch.update(dRef, { orden: nOrden });
                    seg.orden = nOrden;
                 });
                 await batch.commit();
                 allSegments = [...segsConOrden, ...segsSinOrden];
                 console.log("Orden inicial asignado a segmentos.");
             }
            allSegments.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));

            const allMarcas = await getAllMarcas();
            const marcasMap = new Map(allMarcas.map(m => [m.name, m.id]));

            let prodsQuery = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            if (rubroFiltro) {
                prodsQuery = _query(prodsQuery, _where("rubro", "==", rubroFiltro));
            }
            const prodSnap = await _getDocs(prodsQuery);
            const prodsEnRubro = prodSnap.docs.map(d => d.data());
            const segmentsWithProductsInRubro = rubroFiltro ? new Set(prodsEnRubro.map(p => p.segmento).filter(Boolean)) : null;

            container.innerHTML = '';
            if (allSegments.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center">No hay segmentos definidos.</p>`;
                return;
            }

            allSegments.forEach(seg => {
                const segCont = document.createElement('div');
                segCont.className = 'segmento-container border border-gray-300 rounded-lg mb-3 bg-white shadow';
                segCont.dataset.segmentoId = seg.id;
                segCont.dataset.segmentoName = seg.name;
                segCont.dataset.type = 'segmento';

                const segmentHasProductsInRubro = !segmentsWithProductsInRubro || segmentsWithProductsInRubro.has(seg.name);
                if (rubroFiltro && !segmentHasProductsInRubro) {
                    segCont.classList.add('hidden'); 
                }

                const segTitle = document.createElement('div');
                segTitle.className = 'segmento-title p-3 bg-gray-200 rounded-t-lg cursor-grab active:cursor-grabbing font-semibold flex justify-between items-center';
                segTitle.draggable = true;
                segTitle.textContent = seg.name;
                segCont.appendChild(segTitle);

                const marcasList = document.createElement('ul');
                marcasList.className = 'marcas-sortable-list p-3 space-y-1 bg-white rounded-b-lg';
                marcasList.dataset.segmentoParent = seg.id;

                const marcasEnSeg = [...new Set(prodsEnRubro
                    .filter(p => p.segmento === seg.name && p.marca)
                    .map(p => p.marca)
                )];

                const marcaOrderPref = seg.marcaOrder || [];
                marcasEnSeg.sort((a, b) => {
                    const indexA = marcaOrderPref.indexOf(a);
                    const indexB = marcaOrderPref.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.localeCompare(b);
                });

                if (marcasEnSeg.length === 0) {
                    marcasList.innerHTML = `<li class="text-xs text-gray-500 italic pl-2">No hay marcas ${rubroFiltro ? 'en este rubro' : ''} para este segmento.</li>`;
                } else {
                    marcasEnSeg.forEach(marcaName => {
                        const marcaId = marcasMap.get(marcaName) || `temp_${marcaName.replace(/\s+/g,'_')}`;
                        const li = document.createElement('li');
                        li.dataset.marcaId = marcaId;
                        li.dataset.marcaName = marcaName;
                        li.dataset.type = 'marca';
                        li.className = 'marca-item p-2 bg-gray-50 rounded shadow-xs cursor-grab active:cursor-grabbing hover:bg-gray-100 text-sm';
                        li.textContent = marcaName;
                        li.draggable = true;
                        marcasList.appendChild(li);
                    });
                }
                segCont.appendChild(marcasList);
                container.appendChild(segCont);
            });

            addDragAndDropHandlersHierarchy(container);

        } catch (error) {
            console.error("Error al renderizar jerarquía:", error);
            container.innerHTML = `<p class="text-red-500 text-center">Error al cargar la estructura.</p>`;
        }
    }


    function addDragAndDropHandlersHierarchy(container) {
        let draggedItem = null;
        let draggedItemElement = null; 
        let draggedType = null;
        let sourceList = null; 
        let placeholder = null; 

        const createPlaceholder = (type) => {
            if(placeholder) placeholder.remove(); 
            placeholder = document.createElement(type === 'segmento' ? 'div' : 'li');
            placeholder.className = type === 'segmento' ? 'segmento-placeholder' : 'marca-placeholder';
            placeholder.style.height = type === 'segmento' ? '60px' : '30px';
            placeholder.style.background = type === 'segmento' ? '#dbeafe' : '#e0e7ff';
            placeholder.style.border = type === 'segmento' ? '2px dashed #3b82f6' : '1px dashed #6366f1';
            placeholder.style.borderRadius = type === 'segmento' ? '0.5rem' : '0.25rem';
            placeholder.style.margin = type === 'segmento' ? '1rem 0' : '0.25rem 0';
            if(type === 'marca') placeholder.style.listStyleType = 'none'; 
        };

        container.addEventListener('dragstart', e => {
            draggedItemElement = e.target.closest('.segmento-title, .marca-item'); 
            if (!draggedItemElement) { e.preventDefault(); return; }

            draggedType = draggedItemElement.dataset.type || (draggedItemElement.classList.contains('segmento-title') ? 'segmento' : null); 
            draggedItem = (draggedType === 'segmento') ? draggedItemElement.closest('.segmento-container') : draggedItemElement;

            if (!draggedType || !draggedItem) { e.preventDefault(); return; } 

            sourceList = draggedItem.parentNode; 

            setTimeout(() => { if (draggedItem) draggedItem.classList.add('opacity-50'); }, 0);
            e.dataTransfer.effectAllowed = 'move';
            createPlaceholder(draggedType); 
        });

        container.addEventListener('dragend', e => {
            if (draggedItem) draggedItem.classList.remove('opacity-50'); 
            draggedItem = null; draggedItemElement = null; draggedType = null; sourceList = null;
            if (placeholder) placeholder.remove(); placeholder = null; 
        });

        container.addEventListener('dragover', e => {
            e.preventDefault(); 
            if (!draggedItem || !placeholder) return; 

            const targetList = e.target.closest(draggedType === 'segmento' ? '#segmentos-marcas-sortable-list' : '.marcas-sortable-list');

            if (!targetList || (draggedType === 'marca' && targetList !== sourceList)) {
                if (placeholder.parentNode) placeholder.remove(); 
                e.dataTransfer.dropEffect = 'none'; 
                return;
            }

            e.dataTransfer.dropEffect = 'move'; 

            const afterElement = getDragAfterElementHierarchy(targetList, e.clientY, draggedType);
            if (afterElement === null) {
                targetList.appendChild(placeholder); 
            } else {
                targetList.insertBefore(placeholder, afterElement); 
            }
        });

        container.addEventListener('drop', e => {
            e.preventDefault(); 
            const targetList = e.target.closest(draggedType === 'segmento' ? '#segmentos-marcas-sortable-list' : '.marcas-sortable-list');

            if (draggedItem && placeholder && placeholder.parentNode && targetList && !(draggedType === 'marca' && targetList !== sourceList) ) {
                placeholder.parentNode.insertBefore(draggedItem, placeholder); 
            }

            if (draggedItem) draggedItem.classList.remove('opacity-50');
            if (placeholder) placeholder.remove();
            draggedItem = null; draggedItemElement = null; draggedType = null; sourceList = null; placeholder = null;
        });

        container.addEventListener('dragleave', e => {
            if (!container.contains(e.relatedTarget) && placeholder) {
                 placeholder.remove();
                 placeholder = null;
            }
        });

        function getDragAfterElementHierarchy(listContainer, y, itemType) {
            const selector = itemType === 'segmento' ? '.segmento-container:not(.opacity-50)' : '.marca-item:not(.opacity-50)'; 
            const draggables = [...listContainer.children].filter(c => c.matches(selector) && c !== draggedItem && !c.matches('.segmento-placeholder') && !c.matches('.marca-placeholder'));

            return draggables.reduce((closest, child) => {
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
        _showModal('Progreso', 'Guardando nuevo orden...');
        const batch = _writeBatch(_db);
        let segOrderChanged = false, marcaOrderChanged = false;
        const orderedSegIds = []; 
        const currentSegmentDocs = {}; 

        try {
            const segsRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
            const segsSnap = await _getDocs(segsRef);
            segsSnap.docs.forEach(doc => { currentSegmentDocs[doc.id] = doc.data(); });
        } catch (e) {
            console.warn("No se pudieron precargar los datos de segmentos:", e);
        }

        segConts.forEach((segCont, index) => {
            const segId = segCont.dataset.segmentoId;
            orderedSegIds.push(segId); 
            const segRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, segId);
            const currentSegData = currentSegmentDocs[segId] || {}; 

            if (currentSegData.orden === undefined || currentSegData.orden !== index) {
                batch.update(segRef, { orden: index });
                segOrderChanged = true;
            }

            const marcaItems = segCont.querySelectorAll('.marcas-sortable-list .marca-item');
            const newMarcaOrder = Array.from(marcaItems).map(item => item.dataset.marcaName);
            const currentMarcaOrder = currentSegData.marcaOrder || [];

            if (JSON.stringify(newMarcaOrder) !== JSON.stringify(currentMarcaOrder)) {
                batch.update(segRef, { marcaOrder: newMarcaOrder });
                marcaOrderChanged = true;
            }
        });

        if (!segOrderChanged && !marcaOrderChanged) {
            _showModal('Aviso', 'No se detectaron cambios en el orden.');
            return;
        }

        try {
            await batch.commit(); 
            invalidateSegmentOrderCache(); 
            _showModal('Progreso', 'Orden guardado localmente. Propagando a usuarios...');
            let propSuccess = true;

            if (segOrderChanged && window.adminModule?.propagateCategoryOrderChange) {
                try {
                    await window.adminModule.propagateCategoryOrderChange('segmentos', orderedSegIds);
                } catch (e) { propSuccess = false; console.error("Error propagando orden segmentos:", e); }
            }

            if (marcaOrderChanged && window.adminModule?.propagateCategoryChange) {
                for (const segCont of segConts) {
                     const segId=segCont.dataset.segmentoId;
                     const marcaItems=segCont.querySelectorAll('.marcas-sortable-list .marca-item');
                     const newMarcaOrder=Array.from(marcaItems).map(item=>item.dataset.marcaName);
                     try {
                         const segRef=_doc(_db,`artifacts/${_appId}/users/${_userId}/segmentos`,segId);
                         const segSnap=await _getDoc(segRef); 
                         if(segSnap.exists()){
                             const segDataCompleto = segSnap.data();
                             await window.adminModule.propagateCategoryChange('segmentos', segId, segDataCompleto);
                         }
                    } catch (e) {
                        propSuccess=false;
                        console.error(`Error propagando orden marcas para segmento ${segId}:`, e);
                    }
                }
            }
            _showModal(propSuccess ? 'Éxito' : 'Advertencia', `Orden guardado localmente.${propSuccess ? ' Propagado correctamente.' : ' Ocurrieron errores al propagar.'}`, showInventarioSubMenu);
        } catch (error) {
            console.error("Error al guardar orden:", error);
            _showModal('Error', `Ocurrió un error al guardar: ${error.message}`);
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

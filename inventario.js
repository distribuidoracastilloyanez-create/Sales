(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;

    let _inventarioCache = [];
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _inventarioListenerUnsubscribe = null;
    let _marcasCache = null;

    // Cache para ordenamiento y filtros
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

        // Limpieza de listeners previos para evitar duplicados en memoria
        if (_activeListeners && _activeListeners.inventario) {
            _activeListeners.inventario();
            _activeListeners.inventario = null;
        }

        renderInventarioView();
        setupInventarioListener();
    };

    // --- FUNCIÓN RECUPERADA PARA COMPATIBILIDAD ---
    // Esta función es llamada por botones del menú principal o flotante
    window.showInventarioSubMenu = function() {
        // En la versión simplificada, esto redirige a la vista principal o refresca los controles
        console.log("Accediendo a SubMenú de Inventario...");
        if (typeof renderInventarioView === 'function' && _db) {
            renderInventarioView();
        }
    };

    function setupInventarioListener() {
        // Escucha en tiempo real la colección de inventario del usuario/admin actual
        const invPath = `artifacts/${_appId}/users/${_userId}/inventario`;
        const q = _query(_collection(_db, invPath));

        _inventarioListenerUnsubscribe = _onSnapshot(q, (snapshot) => {
            _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Extraer marcas únicas para el filtro dinámico
            const marcas = new Set();
            _inventarioCache.forEach(p => {
                if (p.marca) marcas.add(p.marca);
            });
            _marcasCache = Array.from(marcas).sort();

            renderInventarioList();
        }, (error) => {
            console.error("Error escuchando inventario:", error);
            _mainContent.innerHTML = `<div class="p-4 text-red-500">Error cargando inventario: ${error.message}</div>`;
        });

        if (_activeListeners) {
            _activeListeners.inventario = _inventarioListenerUnsubscribe;
        }
    }

    function renderInventarioView() {
        // Renderiza el esqueleto principal de la vista (Buscador, Filtros, Botones)
        
        let actionButtons = '';
        if (_userRole === 'admin') {
            // Botones exclusivos de ADMIN
            actionButtons = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button onclick="window.inventarioModule.showAddCategoryModal()" class="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded shadow transition">➕ Categoría</button>
                    <button onclick="window.showAddItemModal()" class="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded shadow transition">➕ Producto</button>
                    <button onclick="window.inventarioModule.handleDeleteDataItem()" class="bg-red-600 hover:bg-red-700 text-white p-2 rounded shadow transition">🗑️ Limpiar Maestros</button>
                </div>
            `;
        } else {
            // Botones exclusivos de USUARIO (Vendedor)
            actionButtons = `
                <button onclick="window.inventarioModule.showCargaProductosModal()" class="bg-green-600 hover:bg-green-700 text-white w-full p-3 rounded-lg shadow-lg font-bold flex justify-center items-center gap-2 transition transform active:scale-95">
                    📦 CARGA DE PRODUCTOS
                </button>
            `;
        }

        _mainContent.innerHTML = `
            <div class="p-4 pb-24 max-w-4xl mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">Inventario ${_userRole==='admin'?'Maestro':'Personal'}</h2>
                    ${_userRole !== 'admin' ? `<div class="text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">Total Items: <span id="totalItemsCount" class="text-blue-600">0</span></div>` : ''}
                </div>

                <div class="mb-6 bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <!-- Buscador -->
                    <div class="relative mb-4">
                        <span class="absolute left-3 top-3 text-gray-400">🔍</span>
                        <input type="text" id="invSearch" placeholder="Buscar por nombre o marca..." class="w-full pl-10 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition">
                    </div>
                    
                    <!-- Filtros -->
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <select id="filterRubro" class="p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:border-blue-500 outline-none">
                            <option value="">Todos los Rubros</option>
                        </select>
                         <select id="filterSegmento" class="p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:border-blue-500 outline-none">
                            <option value="">Todos los Segmentos</option>
                        </select>
                    </div>
                     <select id="filterMarca" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm mb-4 focus:border-blue-500 outline-none">
                        <option value="">Todas las Marcas</option>
                    </select>

                    <!-- Área de Acciones -->
                    <div class="pt-4 border-t border-gray-100">
                        ${actionButtons}
                    </div>
                </div>

                <!-- Lista de Productos -->
                <div id="inventarioList" class="space-y-3">
                    <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                        <span>Cargando inventario...</span>
                    </div>
                </div>
            </div>
        `;

        // Listeners para filtros (vinculados al objeto _lastFilters para persistencia)
        const invSearch = document.getElementById('invSearch');
        if(invSearch) invSearch.addEventListener('input', (e) => { _lastFilters.searchTerm = e.target.value; renderInventarioList(); });
        
        const filterRubro = document.getElementById('filterRubro');
        if(filterRubro) filterRubro.addEventListener('change', (e) => { _lastFilters.rubro = e.target.value; renderInventarioList(); });
        
        const filterSegmento = document.getElementById('filterSegmento');
        if(filterSegmento) filterSegmento.addEventListener('change', (e) => { _lastFilters.segmento = e.target.value; renderInventarioList(); });
        
        const filterMarca = document.getElementById('filterMarca');
        if(filterMarca) filterMarca.addEventListener('change', (e) => { _lastFilters.marca = e.target.value; renderInventarioList(); });

        _showMainMenu();
    }

    function renderInventarioList() {
        const container = document.getElementById('inventarioList');
        if (!container) return;

        // Referencias a los selects para poblarlos si están vacíos
        const rubroSelect = document.getElementById('filterRubro');
        const segmentoSelect = document.getElementById('filterSegmento');
        const marcaSelect = document.getElementById('filterMarca');

        const term = _lastFilters.searchTerm.toLowerCase();
        const fRubro = _lastFilters.rubro;
        const fSeg = _lastFilters.segmento;
        const fMarca = _lastFilters.marca;

        // Filtrado en memoria
        let filtered = _inventarioCache.filter(p => {
            const matchText = (p.name || '').toLowerCase().includes(term) || 
                              (p.marca || '').toLowerCase().includes(term);
            const matchRubro = !fRubro || p.rubro === fRubro;
            const matchSeg = !fSeg || p.segmento === fSeg;
            const matchMarca = !fMarca || p.marca === fMarca;
            return matchText && matchRubro && matchSeg && matchMarca;
        });
        
        // Ordenamiento por nombre
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const countEl = document.getElementById('totalItemsCount');
        if(countEl) countEl.textContent = filtered.length;

        // Poblar Selects de Filtros (Solo si no tienen opciones cargadas para evitar parpadeo)
        // Verificamos si los elementos existen en el DOM antes de manipularlos
        if (rubroSelect && rubroSelect.options.length <= 1) {
            const rubros = [...new Set(_inventarioCache.map(i => i.rubro).filter(Boolean))].sort();
            rubros.forEach(r => { rubroSelect.innerHTML += `<option value="${r}">${r}</option>`; });
            if(_lastFilters.rubro) rubroSelect.value = _lastFilters.rubro;
        }
         if (segmentoSelect && segmentoSelect.options.length <= 1) {
            const segs = [...new Set(_inventarioCache.map(i => i.segmento).filter(Boolean))].sort();
            segs.forEach(s => { segmentoSelect.innerHTML += `<option value="${s}">${s}</option>`; });
            if(_lastFilters.segmento) segmentoSelect.value = _lastFilters.segmento;
        }
         if (marcaSelect && marcaSelect.options.length <= 1 && _marcasCache) {
            _marcasCache.forEach(m => { marcaSelect.innerHTML += `<option value="${m}">${m}</option>`; });
            if(_lastFilters.marca) marcaSelect.value = _lastFilters.marca;
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <span class="text-2xl mb-2">📦</span>
                    <span>No se encontraron productos con estos filtros.</span>
                </div>`;
            return;
        }

        // Renderizado de tarjetas de producto
        container.innerHTML = filtered.map(p => {
            const stock = p.cantidadUnidades || 0;
            const cajas = Math.floor(stock / (p.unidadesPorCaja || 1));
            const paq = Math.floor((stock % (p.unidadesPorCaja || 1)) / (p.unidadesPorPaquete || 1));
            const und = (stock % (p.unidadesPorCaja || 1)) % (p.unidadesPorPaquete || 1);
            
            // Formateo del stock visual
            let stockStr = '';
            if (p.unidadesPorCaja > 1) stockStr += `<span class="font-bold text-blue-700">${cajas} CJ</span> `;
            if (p.unidadesPorPaquete > 1) stockStr += `<span class="font-bold text-green-700">${paq} Pq</span> `;
            stockStr += `<span class="font-bold text-gray-600">${und} Und</span>`;

            return `
                <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition flex justify-between items-center relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${_userRole==='admin'?'bg-purple-500':'bg-blue-500'}"></div>
                    <div class="flex-1 pl-3">
                        <div class="font-bold text-gray-800 text-sm leading-tight mb-1">${p.name}</div>
                        <div class="text-xs text-gray-500 flex items-center gap-1">
                            <span>${p.marca || 'Sin Marca'}</span>
                            <span class="text-gray-300">•</span>
                            <span>${p.presentacion || ''}</span>
                        </div>
                        <div class="mt-2 text-xs bg-gray-50 inline-block px-2 py-1 rounded border border-gray-100 text-gray-600">
                             Stock Físico: <b class="text-gray-900 text-sm">${stock}</b> uds
                        </div>
                    </div>
                    <div class="text-right pl-2 flex flex-col items-end gap-2">
                        <div class="text-xs bg-blue-50 px-2 py-1 rounded text-blue-800 border border-blue-100 mb-1">
                            ${stockStr}
                        </div>
                        <div class="flex gap-2">
                             <button onclick="window.inventarioModule.editProducto('${p.id}')" class="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            ${_userRole === 'admin' ? `
                                <button onclick="window.inventarioModule.deleteProducto('${p.id}')" class="bg-red-50 hover:bg-red-100 text-red-500 p-2 rounded-full transition" title="Eliminar">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ====================================================================================
    //  NUEVA FUNCIONALIDAD: CARGA DE PRODUCTOS (Reemplaza al Ajuste Masivo)
    // ====================================================================================
    
    window.inventarioModule = window.inventarioModule || {};
    
    window.inventarioModule.showCargaProductosModal = function() {
        if (_inventarioCache.length === 0) {
            _showModal('Aviso', 'No hay productos en el inventario para cargar.');
            return;
        }

        // Ordenamos alfabéticamente para que sea fácil encontrar los productos en el listado de carga
        const productosOrdenados = [..._inventarioCache].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const content = `
            <div class="space-y-4">
                <div class="bg-green-50 p-4 rounded-lg text-sm text-green-800 border border-green-200 shadow-sm">
                    <div class="flex items-start gap-2">
                        <span class="text-xl">🚚</span>
                        <div>
                            <p class="font-bold text-base">Registro de Carga (Entrada)</p>
                            <ul class="list-disc pl-4 mt-1 space-y-1 text-green-700">
                                <li>Ingrese <b>SOLO la cantidad que llegó</b> (la que va a sumar).</li>
                                <li>Deje en <b>0</b> o vacío los productos que no recibieron carga.</li>
                                <li>Se creará un registro en el historial con fecha y usuario.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="max-h-[60vh] overflow-y-auto pr-2 space-y-2 custom-scrollbar" id="cargaContainer">
                    ${productosOrdenados.map(p => `
                        <div class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition bg-white">
                            <div class="text-sm w-2/3 pr-2">
                                <div class="font-bold text-gray-800 leading-tight">${p.name}</div>
                                <div class="text-xs text-gray-500 mt-1">
                                    Stock Actual: <b class="text-gray-700">${p.cantidadUnidades || 0}</b> • ${p.presentacion || ''}
                                </div>
                            </div>
                            <div class="w-1/3 flex items-center justify-end gap-2">
                                <span class="text-lg font-bold text-green-500 select-none">+</span>
                                <input type="number" 
                                       id="carga_input_${p.id}" 
                                       placeholder="0"
                                       class="w-full max-w-[100px] p-2 border border-gray-300 rounded text-right font-mono font-bold text-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-gray-50 focus:bg-white transition"
                                       min="0"
                                       onfocus="this.select()">
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <style>
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #aaa; }
            </style>
        `;

        _showModal('📦 Carga de Mercancía', content, async () => {
            await procesarCargaProductos(productosOrdenados);
        }, 'Confirmar Entrada', 'Cancelar');
    };

    async function procesarCargaProductos(productosOriginales) {
        try {
            const batch = _writeBatch(_db);
            // Referencia a la colección de historial
            const historialRef = _collection(_db, `artifacts/${_appId}/historial_cargas`);
            
            const itemsCargados = []; 
            let hayCambios = false;

            for (const p of productosOriginales) {
                const input = document.getElementById(`carga_input_${p.id}`);
                if (!input) continue;

                // Parseamos el input. Si está vacío o es inválido, es 0.
                const cantidadCargada = parseInt(input.value) || 0;

                // Solo procesamos si hay una carga positiva real
                if (cantidadCargada > 0) {
                    const cantidadAnterior = p.cantidadUnidades || 0;
                    const nuevaCantidadTotal = cantidadAnterior + cantidadCargada; // SUMA SIMPLE

                    const prodRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                    
                    // Actualizamos el inventario
                    batch.update(prodRef, { 
                        cantidadUnidades: nuevaCantidadTotal,
                        fechaUltimaCarga: new Date() // Opcional: marca de tiempo en el producto
                    });
                    
                    hayCambios = true;

                    // Preparamos el detalle para el historial
                    itemsCargados.push({
                        productoId: p.id,
                        nombre: p.name,
                        cantidadAnterior: cantidadAnterior,
                        cantidadCargada: cantidadCargada, // Dato clave
                        cantidadNueva: nuevaCantidadTotal,
                        unidadesPorCaja: p.unidadesPorCaja || 1
                    });
                }
            }

            if (!hayCambios) {
                // Feedback si no escribió nada
                setTimeout(() => _showModal('Sin Cambios', 'No ingresaste ninguna cantidad para cargar.'), 300);
                return;
            }

            // Crear el documento de Historial
            await _addDoc(historialRef, {
                fecha: new Date(),
                userId: _userId, // Quién hizo la carga
                userRole: _userRole,
                totalItemsCargados: itemsCargados.length,
                detalles: itemsCargados,
                tipo: 'Carga Manual (Entrada)'
            });

            // Ejecutar todas las actualizaciones en base de datos
            await batch.commit();
            
            // Feedback de éxito detallado
            setTimeout(() => {
                let msg = `<div class="text-center space-y-2">
                    <div class="text-green-600 text-5xl mb-2">✅</div>
                    <p class="font-bold text-gray-800">Carga registrada correctamente</p>
                    <p class="text-sm text-gray-600">Se han actualizado las existencias de <b>${itemsCargados.length}</b> productos.</p>
                    <p class="text-xs text-gray-400 mt-2">La información se guardó en el historial.</p>
                </div>`;
                _showModal('Operación Exitosa', msg);
            }, 300);

        } catch (error) {
            console.error("Error en carga de productos:", error);
            _showModal('Error Crítico', 'Hubo un problema al guardar la carga. Por favor verifica tu conexión. Error: ' + error.message);
        }
    }


    // ====================================================================================
    //  FUNCIONES DE ADMINISTRACIÓN Y LEGADO (Mantenidas del original)
    // ====================================================================================

    window.inventarioModule.editProducto = function(id) {
        const p = _inventarioCache.find(x => x.id === id);
        if(!p) return;
        if(window.showAddItemModal) {
            window.showAddItemModal(p); // Abre modal de edición (reutiliza el de crear)
        } else {
            console.error("Función showAddItemModal no encontrada");
        }
    };

    window.inventarioModule.deleteProducto = async function(id) {
        if(_userRole !== 'admin') return;
        _showModal('Eliminar Producto', '¿Estás seguro de eliminar este producto del inventario permanentemente?', async () => {
            try {
                await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, id));
                // El listener actualizará la UI automáticamente
            } catch (e) {
                _showModal('Error', 'No se pudo eliminar: ' + e.message);
            }
        });
    };

    // Función Admin: Crear nueva categoría
    window.inventarioModule.showAddCategoryModal = function() {
        if (_userRole !== 'admin') return;
        const content = `
            <div class="space-y-4 text-left">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Tipo de Maestro</label>
                    <select id="newCatType" class="w-full p-2 border rounded bg-gray-50 focus:ring-2 focus:ring-blue-500">
                        <option value="rubros">Rubro (Categoría Principal)</option>
                        <option value="segmentos">Segmento (Sub-categoría)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                    <input type="text" id="newCatName" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" placeholder="EJ: GASEOSAS / RETORNABLES">
                </div>
            </div>
        `;
        _showModal('Nuevo Maestro', content, async () => {
            const type = document.getElementById('newCatType').value;
            const name = document.getElementById('newCatName').value.toUpperCase().trim();
            if(!name) return;
            try {
                const colRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${type}`);
                await _addDoc(colRef, { name: name, createdAt: new Date() });
                _showModal('Éxito', 'Categoría creada correctamente.');
            } catch(e) {
                _showModal('Error', e.message);
            }
        }, 'Crear');
    };

    // Función Admin: Limpieza profunda de datos no usados (Feature compleja del original)
    window.inventarioModule.handleDeleteDataItem = async function() {
         _showModal('Mantenimiento', '¿Deseas buscar y eliminar Rubros, Segmentos o Marcas que NO se están usando en ningún producto activo?', async () => {
            try {
                const modal = document.getElementById('modalContainer'); // Referencia visual
                
                // 1. Obtener todo el inventario
                const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
                const usedRubros = new Set();
                const usedSegmentos = new Set();
                const usedMarcas = new Set();

                // 2. Mapear qué se está usando realmente
                invSnap.docs.forEach(d => {
                    const data = d.data();
                    if(data.rubro) usedRubros.add(data.rubro);
                    if(data.segmento) usedSegmentos.add(data.segmento);
                    if(data.marca) usedMarcas.add(data.marca);
                });

                // 3. Consultar las colecciones de maestros
                const rRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`);
                const sRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
                const mRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`);

                const [rSnap, sSnap, mSnap] = await Promise.all([_getDocs(rRef), _getDocs(sRef), _getDocs(mRef)]);
                
                // 4. Identificar candidatos a eliminar
                const toDelete = [];
                rSnap.docs.forEach(d => { if(!usedRubros.has(d.data().name)) toDelete.push({ref: d.ref, col: 'rubros', id: d.id}); });
                sSnap.docs.forEach(d => { if(!usedSegmentos.has(d.data().name)) toDelete.push({ref: d.ref, col: 'segmentos', id: d.id}); });
                mSnap.docs.forEach(d => { if(!usedMarcas.has(d.data().name)) toDelete.push({ref: d.ref, col: 'marcas', id: d.id}); });

                if(toDelete.length === 0) {
                    _showModal('Todo limpio', 'Todos los maestros están en uso. No hay nada que borrar.');
                    return;
                }

                // 5. Confirmación final con conteo
                _showModal('Confirmar Limpieza', `Se encontraron <b>${toDelete.length}</b> elementos sin uso (Viejos o huérfanos). ¿Eliminarlos definitivamente?`, async () => {
                    try {
                        const batch = _writeBatch(_db);
                        toDelete.forEach(item => batch.delete(item.ref));
                        await batch.commit();

                        // Intento de propagación si adminModule está disponible (para sincronizar ordenamientos, etc)
                        if (window.adminModule && window.adminModule.propagateCategoryChange) {
                            for (const item of toDelete) {
                                try {
                                    await window.adminModule.propagateCategoryChange(item.col, item.id, null);
                                } catch (e) { console.warn(e); }
                            }
                        }
                        
                        // Invalidar caché local
                        if(window.inventarioModule.invalidateSegmentOrderCache) {
                             window.inventarioModule.invalidateSegmentOrderCache();
                        }
                        
                        _showModal('Mantenimiento Exitoso', `Se eliminaron ${toDelete.length} registros obsoletos.`);

                    } catch (deleteError) {
                         console.error("Error limpieza:", deleteError);
                         _showModal('Error', `Falló la eliminación: ${deleteError.message}`);
                    }
                }, 'Sí, Eliminar', null, true);

            } catch (error) {
                console.error("Error análisis:", error);
                _showModal('Error', `Ocurrió un error al analizar los datos: ${error.message}`);
            }
        }, 'Iniciar Análisis', null, true);
    };
    
    // Función utilitaria expuesta
    window.inventarioModule.invalidateSegmentOrderCache = function() {
        _segmentoOrderCache = null;
        _marcaOrderCacheBySegment = {};
    };

    // Exportar API pública del módulo
    window.inventarioModule = Object.assign(window.inventarioModule || {}, {
        editProducto: window.inventarioModule.editProducto,
        deleteProducto: window.inventarioModule.deleteProducto,
        handleDeleteDataItem: window.inventarioModule.handleDeleteDataItem,
        showAddCategoryModal: window.inventarioModule.showAddCategoryModal,
        invalidateSegmentOrderCache: window.inventarioModule.invalidateSegmentOrderCache,
        showCargaProductosModal: window.inventarioModule.showCargaProductosModal
    });

})();

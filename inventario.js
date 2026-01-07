(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;

    let _inventarioCache = [];
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _inventarioListenerUnsubscribe = null;
    let _marcasCache = null;

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

        if (_activeListeners && _activeListeners.inventario) {
            _activeListeners.inventario();
            _activeListeners.inventario = null;
        }

        renderInventarioView();
        setupInventarioListener();
    };

    window.showInventarioSubMenu = function() {
        if (_db && typeof renderInventarioView === 'function') {
            renderInventarioView();
            if (!_activeListeners || !_activeListeners.inventario) {
                setupInventarioListener();
            } else {
                renderInventarioList();
            }
        } else {
            window.location.hash = '#inventario';
        }
    };

    function setupInventarioListener() {
        const invPath = `artifacts/${_appId}/users/${_userId}/inventario`;
        const q = _query(_collection(_db, invPath));

        _inventarioListenerUnsubscribe = _onSnapshot(q, (snapshot) => {
            _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const marcas = new Set();
            _inventarioCache.forEach(p => { if (p.marca) marcas.add(p.marca); });
            _marcasCache = Array.from(marcas).sort();

            renderInventarioList();
        }, (error) => {
            console.error(error);
            if(_mainContent) _mainContent.innerHTML = `<div class="p-4 text-red-500">Error: ${error.message}</div>`;
        });

        if (_activeListeners) {
            _activeListeners.inventario = _inventarioListenerUnsubscribe;
        }
    }

    function renderInventarioView() {
        let actionButtons = '';
        if (_userRole === 'admin') {
            actionButtons = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button onclick="window.inventarioModule.showAddCategoryModal()" class="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded shadow">➕ Categoría</button>
                    <button onclick="window.showAddItemModal()" class="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded shadow">➕ Producto</button>
                    <button onclick="window.inventarioModule.handleDeleteDataItem()" class="bg-red-600 hover:bg-red-700 text-white p-2 rounded shadow">🗑️ Limpiar Maestros</button>
                </div>
            `;
        } else {
            actionButtons = `
                <button onclick="window.inventarioModule.showCargaProductosModal()" class="bg-green-600 hover:bg-green-700 text-white w-full p-3 rounded-lg shadow-lg font-bold flex justify-center items-center gap-2 transition active:scale-95">
                    📦 CARGA DE PRODUCTOS (ENTRADA)
                </button>
            `;
        }

        _mainContent.innerHTML = `
            <div class="p-4 pb-24 max-w-4xl mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">Inventario</h2>
                    ${_userRole !== 'admin' ? `<div class="text-sm font-medium bg-gray-100 px-2 py-1 rounded">Total: <span id="totalItemsCount" class="text-blue-600 font-bold">...</span></div>` : ''}
                </div>

                <div class="mb-6 bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div class="relative mb-4">
                        <span class="absolute left-3 top-3 text-gray-400">🔍</span>
                        <input type="text" id="invSearch" placeholder="Buscar..." class="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value="${_lastFilters.searchTerm || ''}">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <select id="filterRubro" class="p-2 border rounded-lg bg-gray-50 text-sm"><option value="">Rubros</option></select>
                        <select id="filterSegmento" class="p-2 border rounded-lg bg-gray-50 text-sm"><option value="">Segmentos</option></select>
                    </div>
                    <select id="filterMarca" class="w-full p-2 border rounded-lg bg-gray-50 text-sm mb-4"><option value="">Marcas</option></select>

                    <div class="pt-4 border-t border-gray-100">
                        ${actionButtons}
                    </div>
                </div>

                <div id="inventarioList" class="space-y-3">
                    <div class="text-center py-10 text-gray-400">Cargando...</div>
                </div>
            </div>
        `;

        const sInput = document.getElementById('invSearch');
        const rSelect = document.getElementById('filterRubro');
        const sSelect = document.getElementById('filterSegmento');
        const mSelect = document.getElementById('filterMarca');

        if(sInput) sInput.addEventListener('input', (e) => { _lastFilters.searchTerm = e.target.value; renderInventarioList(); });
        if(rSelect) rSelect.addEventListener('change', (e) => { _lastFilters.rubro = e.target.value; renderInventarioList(); });
        if(sSelect) sSelect.addEventListener('change', (e) => { _lastFilters.segmento = e.target.value; renderInventarioList(); });
        if(mSelect) mSelect.addEventListener('change', (e) => { _lastFilters.marca = e.target.value; renderInventarioList(); });

        if(_showMainMenu) _showMainMenu();
    }

    function renderInventarioList() {
        const container = document.getElementById('inventarioList');
        if (!container) return;

        const rubroSelect = document.getElementById('filterRubro');
        const segmentoSelect = document.getElementById('filterSegmento');
        const marcaSelect = document.getElementById('filterMarca');

        const term = (_lastFilters.searchTerm || '').toLowerCase();
        let filtered = _inventarioCache.filter(p => {
            const matchText = (p.name || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term);
            const matchRubro = !_lastFilters.rubro || p.rubro === _lastFilters.rubro;
            const matchSeg = !_lastFilters.segmento || p.segmento === _lastFilters.segmento;
            const matchMarca = !_lastFilters.marca || p.marca === _lastFilters.marca;
            return matchText && matchRubro && matchSeg && matchMarca;
        });
        
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const countEl = document.getElementById('totalItemsCount');
        if(countEl) countEl.textContent = filtered.length;

        if (rubroSelect && rubroSelect.options.length <= 1) {
            [...new Set(_inventarioCache.map(i => i.rubro).filter(Boolean))].sort().forEach(r => rubroSelect.innerHTML += `<option value="${r}">${r}</option>`);
            rubroSelect.value = _lastFilters.rubro;
        }
        if (segmentoSelect && segmentoSelect.options.length <= 1) {
            [...new Set(_inventarioCache.map(i => i.segmento).filter(Boolean))].sort().forEach(s => segmentoSelect.innerHTML += `<option value="${s}">${s}</option>`);
            segmentoSelect.value = _lastFilters.segmento;
        }
        if (marcaSelect && marcaSelect.options.length <= 1 && _marcasCache) {
            _marcasCache.forEach(m => marcaSelect.innerHTML += `<option value="${m}">${m}</option>`);
            marcaSelect.value = _lastFilters.marca;
        }

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-gray-500">No hay resultados.</div>`;
            return;
        }

        container.innerHTML = filtered.map(p => {
            const stock = p.cantidadUnidades || 0;
            const cajas = Math.floor(stock / (p.unidadesPorCaja || 1));
            const paq = Math.floor((stock % (p.unidadesPorCaja || 1)) / (p.unidadesPorPaquete || 1));
            const und = (stock % (p.unidadesPorCaja || 1)) % (p.unidadesPorPaquete || 1);
            
            let stockStr = '';
            if (p.unidadesPorCaja > 1) stockStr += `<span class="font-bold text-blue-700">${cajas} CJ</span> `;
            if (p.unidadesPorPaquete > 1) stockStr += `<span class="font-bold text-green-700">${paq} Pq</span> `;
            stockStr += `<span class="text-gray-600">${und} Und</span>`;

            return `
                <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                    <div class="flex-1">
                        <div class="font-bold text-gray-800 text-sm">${p.name}</div>
                        <div class="text-xs text-gray-500">${p.marca || ''} ${p.presentacion ? '• ' + p.presentacion : ''}</div>
                        <div class="mt-1 text-xs bg-gray-50 inline-block px-2 py-1 rounded border">
                             Total: <b>${stock}</b> uds
                        </div>
                    </div>
                    <div class="text-right pl-2">
                        <div class="text-xs mb-1">${stockStr}</div>
                        <div class="flex justify-end gap-2">
                            <button onclick="window.inventarioModule.editProducto('${p.id}')" class="bg-gray-100 p-2 rounded-full hover:bg-gray-200">✏️</button>
                            ${_userRole === 'admin' ? `<button onclick="window.inventarioModule.deleteProducto('${p.id}')" class="bg-red-50 text-red-500 p-2 rounded-full hover:bg-red-100">🗑️</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.inventarioModule = window.inventarioModule || {};
    
    window.inventarioModule.showCargaProductosModal = function() {
        if (_inventarioCache.length === 0) {
            _showModal('Aviso', 'No hay inventario cargado.');
            return;
        }

        const productosOrdenados = [..._inventarioCache].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const content = `
            <div class="space-y-4">
                <div class="bg-green-50 p-4 rounded-lg text-sm text-green-800 border border-green-200">
                    <p class="font-bold">🚛 Registrar Entrada de Mercancía</p>
                    <ul class="list-disc pl-4 mt-1 text-xs">
                        <li>Ingresa la cantidad que <b>LLEGÓ</b> (se sumará al stock actual).</li>
                        <li>Deja en 0 lo que no recibió carga.</li>
                    </ul>
                </div>

                <div class="max-h-[60vh] overflow-y-auto pr-2 space-y-2" id="cargaContainer">
                    ${productosOrdenados.map(p => `
                        <div class="flex items-center justify-between p-2 border-b border-gray-100 hover:bg-gray-50">
                            <div class="text-sm w-2/3 pr-2">
                                <div class="font-bold truncate">${p.name}</div>
                                <div class="text-xs text-gray-500">Actual: <b>${p.cantidadUnidades || 0}</b></div>
                            </div>
                            <div class="w-1/3 flex items-center justify-end gap-2">
                                <span class="text-green-600 font-bold">+</span>
                                <input type="number" id="carga_input_${p.id}" placeholder="0" class="w-20 p-2 border rounded text-right font-bold text-lg focus:ring-2 focus:ring-green-500" min="0" onfocus="this.select()">
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        _showModal('📦 Carga de Productos', content, async () => {
            await procesarCargaProductos(productosOrdenados);
        }, 'Guardar Entrada', 'Cancelar');
    };

    async function procesarCargaProductos(productosOriginales) {
        try {
            const batch = _writeBatch(_db);
            const historialRef = _collection(_db, `artifacts/${_appId}/historial_cargas`);
            
            const itemsCargados = []; 
            let hayCambios = false;

            for (const p of productosOriginales) {
                const input = document.getElementById(`carga_input_${p.id}`);
                if (!input) continue;

                const cantidadEntrada = parseInt(input.value) || 0;

                if (cantidadEntrada > 0) {
                    const cantidadAnterior = p.cantidadUnidades || 0;
                    const nuevaCantidadTotal = cantidadAnterior + cantidadEntrada;

                    const prodRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                    batch.update(prodRef, { 
                        cantidadUnidades: nuevaCantidadTotal,
                        fechaUltimaCarga: new Date()
                    });
                    
                    hayCambios = true;
                    itemsCargados.push({
                        productoId: p.id,
                        nombre: p.name,
                        cantidadAnterior: cantidadAnterior,
                        cantidadCargada: cantidadEntrada,
                        cantidadNueva: nuevaCantidadTotal
                    });
                }
            }

            if (!hayCambios) {
                setTimeout(() => _showModal('Sin Cambios', 'No ingresaste ninguna cantidad.'), 300);
                return;
            }

            await _addDoc(historialRef, {
                fecha: new Date(),
                userId: _userId,
                totalItems: itemsCargados.length,
                detalles: itemsCargados,
                tipo: 'Carga Manual'
            });

            await batch.commit();
            
            setTimeout(() => {
                _showModal('Éxito', `✅ Se sumó stock a <b>${itemsCargados.length}</b> productos correctamente.`);
            }, 300);

        } catch (error) {
            console.error("Error carga:", error);
            _showModal('Error', 'Falló la carga: ' + error.message);
        }
    }

    window.inventarioModule.editProducto = function(id) {
        const p = _inventarioCache.find(x => x.id === id);
        if(p && window.showAddItemModal) window.showAddItemModal(p);
    };

    window.inventarioModule.deleteProducto = async function(id) {
        if(_userRole !== 'admin') return;
        _showModal('Eliminar', '¿Borrar producto permanentemente?', async () => {
            try { await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, id)); } 
            catch (e) { _showModal('Error', e.message); }
        });
    };

    window.inventarioModule.showAddCategoryModal = function() {
        if (_userRole !== 'admin') return;
        const content = `
            <div class="space-y-4">
                <div><label class="block text-sm font-bold">Tipo</label><select id="newCatType" class="w-full p-2 border rounded"><option value="rubros">Rubro</option><option value="segmentos">Segmento</option></select></div>
                <div><label class="block text-sm font-bold">Nombre</label><input type="text" id="newCatName" class="w-full p-2 border rounded uppercase"></div>
            </div>`;
        _showModal('Nuevo Maestro', content, async () => {
            const type = document.getElementById('newCatType').value;
            const name = document.getElementById('newCatName').value.trim().toUpperCase();
            if(!name) return;
            try { await _addDoc(_collection(_db, `artifacts/${_appId}/users/${_userId}/${type}`), { name, createdAt: new Date() }); _showModal('Listo', 'Creado.'); }
            catch(e) { _showModal('Error', e.message); }
        }, 'Crear');
    };

    window.inventarioModule.handleDeleteDataItem = async function() {
         _showModal('Mantenimiento', '¿Buscar y eliminar maestros sin uso?', async () => {
            try {
                const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
                const used = { rubros: new Set(), segmentos: new Set(), marcas: new Set() };
                invSnap.docs.forEach(d => { const da = d.data(); if(da.rubro) used.rubros.add(da.rubro); if(da.segmento) used.segmentos.add(da.segmento); if(da.marca) used.marcas.add(da.marca); });
                
                const [rSnap, sSnap, mSnap] = await Promise.all([
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`)),
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`)),
                    _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/marcas`))
                ]);

                const toDelete = [];
                rSnap.docs.forEach(d => { if(!used.rubros.has(d.data().name)) toDelete.push(d.ref); });
                sSnap.docs.forEach(d => { if(!used.segmentos.has(d.data().name)) toDelete.push(d.ref); });
                mSnap.docs.forEach(d => { if(!used.marcas.has(d.data().name)) toDelete.push(d.ref); });

                if(toDelete.length === 0) { _showModal('Info', 'Todo limpio.'); return; }

                _showModal('Confirmar', `Se borrarán ${toDelete.length} items obsoletos.`, async () => {
                    const batch = _writeBatch(_db);
                    toDelete.forEach(ref => batch.delete(ref));
                    await batch.commit();
                    
                    _segmentoOrderCache = null; 
                    _marcaOrderCacheBySegment = {};
                    
                    _showModal('Éxito', 'Limpieza completada.');
                });
            } catch (e) { _showModal('Error', e.message); }
        }, 'Analizar');
    };
    
    window.inventarioModule.invalidateSegmentOrderCache = function() {
        _segmentoOrderCache = null;
        _marcaOrderCacheBySegment = {};
    };

    window.inventarioModule = Object.assign(window.inventarioModule || {}, {
        editProducto: window.inventarioModule.editProducto,
        deleteProducto: window.inventarioModule.deleteProducto,
        handleDeleteDataItem: window.inventarioModule.handleDeleteDataItem,
        showAddCategoryModal: window.inventarioModule.showAddCategoryModal,
        invalidateSegmentOrderCache: window.inventarioModule.invalidateSegmentOrderCache,
        showCargaProductosModal: window.inventarioModule.showCargaProductosModal
    });

})();

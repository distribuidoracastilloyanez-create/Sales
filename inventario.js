(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;

    let _inventarioCache = [];
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _inventarioListenerUnsubscribe = null;
    let _marcasCache = null;
    let _searchTimeout = null; // Variable para el debounce

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

    function startMainInventarioListener(callback) {
        if (_inventarioListenerUnsubscribe) {
            try { _inventarioListenerUnsubscribe(); } catch(e) { console.warn("Error unsubscribing previous listener:", e); }
        }
        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        _inventarioListenerUnsubscribe = _onSnapshot(collectionRef, (snapshot) => {
            _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (callback && typeof callback === 'function') {
                 try { callback(); } catch (cbError) { console.error("Listener callback error:", cbError); }
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
        console.log("Cachés de ordenamiento invalidadas.");
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
                            <button id="ajusteMasivoBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Ajuste Masivo de Cantidades</button>
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
        document.getElementById('ajusteMasivoBtn').addEventListener('click', showAjusteMasivoView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    function showOrdenarSegmentosMarcasView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-2xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Ordenar Segmentos y Marcas</h2>
                        <div class="mb-4">
                           <label for="ordenarRubroFilter" class="block text-gray-700 font-medium mb-2">Filtrar por Rubro:</label>
                           <select id="ordenarRubroFilter" class="w-full px-4 py-2 border rounded-lg"><option value="">Todos</option></select>
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
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'ordenarRubroFilter', 'Rubro');
        document.getElementById('ordenarRubroFilter').addEventListener('change', (e) => renderSortableHierarchy(e.target.value));
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
             }
            allSegments.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));

            const allMarcas = await getAllMarcas();
            const marcasMap = new Map(allMarcas.map(m => [m.name, m.id]));

            let prodsQuery = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            if (rubroFiltro) prodsQuery = _query(prodsQuery, _where("rubro", "==", rubroFiltro));
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

                if (rubroFiltro && (!segmentsWithProductsInRubro || !segmentsWithProductsInRubro.has(seg.name))) {
                    segCont.classList.add('hidden');
                }

                const segTitle = document.createElement('div');
                segTitle.className = 'segmento-title p-3 bg-gray-200 rounded-t-lg cursor-grab active:cursor-grabbing font-semibold';
                segTitle.draggable = true;
                segTitle.textContent = seg.name;
                segCont.appendChild(segTitle);

                const marcasList = document.createElement('ul');
                marcasList.className = 'marcas-sortable-list p-3 space-y-1 bg-white rounded-b-lg';
                marcasList.dataset.segmentoParent = seg.id;

                const marcasEnSeg = [...new Set(prodsEnRubro.filter(p => p.segmento === seg.name && p.marca).map(p => p.marca))];
                const marcaOrderPref = seg.marcaOrder || [];
                marcasEnSeg.sort((a, b) => {
                    const indexA = marcaOrderPref.indexOf(a), indexB = marcaOrderPref.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    return indexA !== -1 ? -1 : (indexB !== -1 ? 1 : a.localeCompare(b));
                });

                if (marcasEnSeg.length === 0) {
                    marcasList.innerHTML = `<li class="text-xs text-gray-500 italic">Sin marcas activas.</li>`;
                } else {
                    marcasEnSeg.forEach(marcaName => {
                        const li = document.createElement('li');
                        li.dataset.marcaName = marcaName;
                        li.dataset.type = 'marca';
                        li.className = 'marca-item p-2 bg-gray-50 rounded cursor-grab text-sm';
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
        let draggedItem = null, draggedType = null, sourceList = null, placeholder = null;
        const createPlaceholder = (type) => {
            if(placeholder) placeholder.remove();
            placeholder = document.createElement(type === 'segmento' ? 'div' : 'li');
            placeholder.className = type === 'segmento' ? 'border-2 border-dashed border-blue-400 h-12 my-2' : 'border border-dashed border-indigo-400 h-8 my-1';
        };

        container.addEventListener('dragstart', e => {
            const item = e.target.closest('.segmento-title, .marca-item');
            if (!item) { e.preventDefault(); return; }
            draggedType = item.classList.contains('segmento-title') ? 'segmento' : 'marca';
            draggedItem = (draggedType === 'segmento') ? item.closest('.segmento-container') : item;
            sourceList = draggedItem.parentNode;
            setTimeout(() => draggedItem.classList.add('opacity-50'), 0);
            createPlaceholder(draggedType);
        });

        container.addEventListener('dragend', () => {
            if (draggedItem) draggedItem.classList.remove('opacity-50');
            if (placeholder) placeholder.remove();
            draggedItem = null; placeholder = null;
        });

        container.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedItem || !placeholder) return;
            const targetList = e.target.closest(draggedType === 'segmento' ? '#segmentos-marcas-sortable-list' : '.marcas-sortable-list');
            if (!targetList || (draggedType === 'marca' && targetList !== sourceList)) return;
            const afterElement = getDragAfterElementHierarchy(targetList, e.clientY, draggedType);
            if (afterElement == null) targetList.appendChild(placeholder);
            else targetList.insertBefore(placeholder, afterElement);
        });

        container.addEventListener('drop', e => {
            e.preventDefault();
            if (draggedItem && placeholder?.parentNode) {
                placeholder.parentNode.insertBefore(draggedItem, placeholder);
            }
        });

        function getDragAfterElementHierarchy(list, y, type) {
            const draggables = [...list.querySelectorAll(type === 'segmento' ? '.segmento-container:not(.opacity-50)' : '.marca-item:not(.opacity-50)')];
            return draggables.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
                else return closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }

    async function handleGuardarOrdenJerarquia() {
        if (_userRole !== 'admin') return;
        const segConts = document.querySelectorAll('#segmentos-marcas-sortable-list .segmento-container');
        _showModal('Progreso', 'Guardando nuevo orden...');
        const batch = _writeBatch(_db);
        let changed = false;
        const orderedSegIds = [];

        segConts.forEach((segCont, index) => {
            const segId = segCont.dataset.segmentoId;
            orderedSegIds.push(segId);
            const segRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, segId);
            const marcaItems = segCont.querySelectorAll('.marcas-sortable-list .marca-item');
            const newMarcaOrder = Array.from(marcaItems).map(item => item.dataset.marcaName);
            batch.update(segRef, { orden: index, marcaOrder: newMarcaOrder });
            changed = true;
        });

        try {
            await batch.commit();
            invalidateSegmentOrderCache();
            if (window.adminModule?.propagateCategoryOrderChange) {
                await window.adminModule.propagateCategoryOrderChange('segmentos', orderedSegIds);
            }
            _showModal('Éxito', 'Orden guardado y propagado correctamente.', showInventarioSubMenu);
        } catch (error) {
            _showModal('Error', error.message);
        }
    }

    function showAjusteMasivoView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Ajuste Masivo de Stock</h2>
                        ${getFiltrosHTML('ajuste')}
                        <div id="ajusteListContainer" class="overflow-x-auto max-h-96 border rounded-lg"><p class="p-4 text-center">Cargando...</p></div>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg">Volver</button>
                            <button id="saveAjusteBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveAjusteBtn').addEventListener('click', handleGuardarAjusteMasivo);
        const renderCallback = () => renderAjusteMasivoList();
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'ajuste-filter-rubro', 'Rubro');
        setupFiltros('ajuste', renderCallback);
        startMainInventarioListener(renderCallback);
    }

    async function renderAjusteMasivoList() {
        const container = document.getElementById('ajusteListContainer');
        if (!container) return;
        let productos = [..._inventarioCache].filter(p => {
             const search = (_lastFilters.searchTerm || '').toLowerCase();
             return (!search || p.presentacion?.toLowerCase().includes(search) || p.marca?.toLowerCase().includes(search)) &&
                    (!_lastFilters.rubro || p.rubro === _lastFilters.rubro) &&
                    (!_lastFilters.segmento || p.segmento === _lastFilters.segmento);
        });
        const sortFunction = await window.getGlobalProductSortFunction();
        productos.sort(sortFunction);

        let tableHTML = `<table class="min-w-full bg-white text-sm"><thead class="bg-gray-100 sticky top-0"><tr><th class="p-2 text-left">Producto</th><th class="p-2 text-center">Nuevo Stock</th></tr></thead><tbody>`;
        productos.forEach(p => {
            const factor = (p.ventaPor?.cj ? p.unidadesPorCaja : (p.ventaPor?.paq ? p.unidadesPorPaquete : 1)) || 1;
            const currentStock = Math.floor((p.cantidadUnidades || 0) / factor);
            tableHTML += `<tr class="border-b"><td class="p-2 font-medium">${p.presentacion}<br><span class="text-xs text-gray-500">${p.marca || 'S/M'}</span></td><td class="p-2 text-center"><input type="number" data-doc-id="${p.id}" data-factor="${factor}" value="${currentStock}" class="w-24 p-1 border rounded text-center ajuste-qty-input"></td></tr>`;
        });
        container.innerHTML = tableHTML + `</tbody></table>`;
    }

    async function handleGuardarAjusteMasivo() {
        const inputs = document.querySelectorAll('.ajuste-qty-input');
        const batch = _writeBatch(_db);
        let count = 0;
        inputs.forEach(input => {
            const val = parseInt(input.value);
            const factor = parseInt(input.dataset.factor);
            if (!isNaN(val) && val >= 0) {
                const ref = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, input.dataset.docId);
                batch.update(ref, { cantidadUnidades: val * factor });
                count++;
            }
        });
        if (count > 0) {
            await batch.commit();
            _showModal('Éxito', `Actualizados ${count} productos.`);
            renderAjusteMasivoList();
        }
    }

    function showModificarDatosView() {
        if (_userRole !== 'admin') return;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto bg-white p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold mb-6 text-center">Datos Maestros</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div><h3 class="font-bold border-b mb-2">Rubros</h3><div id="rubros-list" class="space-y-1"></div></div>
                    <div><h3 class="font-bold border-b mb-2">Segmentos</h3><div id="segmentos-list" class="space-y-1"></div></div>
                    <div><h3 class="font-bold border-b mb-2">Marcas</h3><div id="marcas-list" class="space-y-1"></div></div>
                </div>
                <button id="backToInventarioBtn" class="mt-8 w-full py-3 bg-gray-400 text-white rounded-lg">Volver</button>
            </div></div>`;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        renderDataListForEditing('rubros', 'rubros-list', 'Rubro');
        renderDataListForEditing('segmentos', 'segmentos-list', 'Segmento');
        renderDataListForEditing('marcas', 'marcas-list', 'Marca');
    }

    function renderDataListForEditing(col, element, label) {
        const ref = _collection(_db, `artifacts/${_appId}/users/${_userId}/${col}`);
        _onSnapshot(ref, (snap) => {
            const list = snap.docs.map(d => `<div class="flex justify-between p-1 bg-gray-50 text-sm"><span>${d.data().name}</span><button onclick="window.inventarioModule.handleDeleteDataItem('${col}', '${d.data().name}', '${label}', '${d.id}')" class="text-red-500">X</button></div>`).join('');
            document.getElementById(element).innerHTML = list || 'Vacío';
        });
    }

    function showAddCategoryModal(col, name) { _showAddItemModal(col, name); }

    async function handleDeleteDataItem(col, name, type, id) {
        if (_userRole !== 'admin') return;
        _showModal('Confirmar', `¿Eliminar ${type} "${name}"?`, async () => {
            await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/${col}`, id));
            if (window.adminModule?.propagateCategoryChange) await window.adminModule.propagateCategoryChange(col, id, null);
            _showModal('Éxito', 'Eliminado.');
        });
    }

    function showAgregarProductoView() {
        if (_userRole !== 'admin') return;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto max-w-2xl bg-white p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold mb-6">Nuevo Producto</h2>
                <form id="productoForm" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label>Rubro</label><select id="rubro" class="w-full p-2 border rounded" required></select></div>
                        <div><label>Segmento</label><select id="segmento" class="w-full p-2 border rounded" required></select></div>
                        <div><label>Marca</label><select id="marca" class="w-full p-2 border rounded" required></select></div>
                        <div><label>Presentación</label><input type="text" id="presentacion" class="w-full p-2 border rounded" required></div>
                    </div>
                    <div class="border-t pt-4">
                        <label>Venta por:</label>
                        <div id="ventaPorContainer" class="flex gap-4">
                            <label><input type="checkbox" id="ventaPorUnd"> Und</label>
                            <label><input type="checkbox" id="ventaPorPaq"> Paq</label>
                            <label><input type="checkbox" id="ventaPorCj"> Cj</label>
                        </div>
                    </div>
                    <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
                    <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label>IVA</label><select id="ivaTipo" class="w-full p-2 border rounded"><option value="16">16%</option><option value="0">Exento</option></select></div>
                        <div><label>Maneja Vacío</label><input type="checkbox" id="manejaVaciosCheck"></div>
                    </div>
                    <button type="submit" class="w-full py-3 bg-green-500 text-white rounded-lg">Guardar y Propagar</button>
                </form>
                <button id="backToInventarioBtn" class="mt-4 w-full py-3 bg-gray-400 text-white rounded-lg">Volver</button>
            </div></div>`;
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'rubro', 'Rubro');
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/segmentos`, 'segmento', 'Segmento');
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/marcas`, 'marca', 'Marca');
        
        const vCont = document.getElementById('ventaPorContainer'), pCont = document.getElementById('preciosContainer'), eCont = document.getElementById('empaquesContainer');
        const updateUI = () => {
            pCont.innerHTML = ''; eCont.innerHTML = '';
            if (document.getElementById('ventaPorUnd').checked) pCont.innerHTML += `<div><label>Precio Und</label><input type="number" step="0.01" id="precioUnd" class="w-full p-2 border rounded" required></div>`;
            if (document.getElementById('ventaPorPaq').checked) {
                pCont.innerHTML += `<div><label>Precio Paq</label><input type="number" step="0.01" id="precioPaq" class="w-full p-2 border rounded" required></div>`;
                eCont.innerHTML += `<div><label>Und/Paq</label><input type="number" id="unidadesPorPaquete" class="w-full p-2 border rounded" required></div>`;
            }
            if (document.getElementById('ventaPorCj').checked) {
                pCont.innerHTML += `<div><label>Precio Cj</label><input type="number" step="0.01" id="precioCj" class="w-full p-2 border rounded" required></div>`;
                eCont.innerHTML += `<div><label>Und/Caja</label><input type="number" id="unidadesPorCaja" class="w-full p-2 border rounded" required></div>`;
            }
        };
        vCont.addEventListener('change', updateUI);
        document.getElementById('productoForm').addEventListener('submit', agregarProducto);
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
    }

    function getProductoDataFromForm(isEditing = false) {
        const vUnd = document.getElementById('ventaPorUnd')?.checked, vPaq = document.getElementById('ventaPorPaq')?.checked, vCj = document.getElementById('ventaPorCj')?.checked;
        const pUnd = parseFloat(document.getElementById('precioUnd')?.value || 0), pPaq = parseFloat(document.getElementById('precioPaq')?.value || 0), pCj = parseFloat(document.getElementById('precioCj')?.value || 0);
        const uPaq = parseInt(document.getElementById('unidadesPorPaquete')?.value || 1), uCj = parseInt(document.getElementById('unidadesPorCaja')?.value || 1);
        
        let basePrice = pUnd;
        if (!basePrice && vPaq) basePrice = pPaq / uPaq;
        if (!basePrice && vCj) basePrice = pCj / uCj;

        return {
            rubro: document.getElementById('rubro').value,
            segmento: document.getElementById('segmento').value,
            marca: document.getElementById('marca').value,
            presentacion: document.getElementById('presentacion').value.trim(),
            unidadesPorPaquete: uPaq, unidadesPorCaja: uCj,
            ventaPor: { und: vUnd, paq: vPaq, cj: vCj },
            precios: { und: pUnd, paq: pPaq, cj: pCj },
            precioPorUnidad: parseFloat(basePrice.toFixed(2)),
            cantidadUnidades: isEditing ? (parseInt(document.getElementById('cantidadActual')?.value || 0)) : 0,
            manejaVacios: document.getElementById('manejaVaciosCheck')?.checked || false,
            iva: parseInt(document.getElementById('ivaTipo').value)
        };
    }

    // --- MEJORA: VALIDACIÓN ESTRICTA ---
    function validateData(data) {
        if (!data.rubro || !data.segmento || !data.marca || !data.presentacion) return "Todos los campos de identificación son obligatorios.";
        if (!data.ventaPor.und && !data.ventaPor.paq && !data.ventaPor.cj) return "Debe seleccionar al menos una unidad de venta.";
        if (data.precioPorUnidad <= 0) return "El precio calculado debe ser mayor a 0.";
        if (data.presentacion.length < 3) return "La presentación es demasiado corta.";
        return null;
    }

    async function agregarProducto(e) {
        e.preventDefault();
        const pData = getProductoDataFromForm(false);
        const error = validateData(pData);
        if (error) { _showModal('Error de Validación', error); return; }

        _showModal('Progreso', 'Guardando...');
        try {
            const ref = await _addDoc(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`), pData);
            if (window.adminModule?.propagateProductChange) await window.adminModule.propagateProductChange(ref.id, pData);
            _showModal('Éxito', 'Producto creado.', showAgregarProductoView);
        } catch (err) { _showModal('Error', err.message); }
    }

    function showModifyDeleteView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        const isAdmin = _userRole === 'admin';
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto bg-white p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold mb-6 text-center">Catálogo de Inventario</h2>
                ${getFiltrosHTML('modify')}
                <div id="productosListContainer" class="max-h-96 overflow-y-auto border rounded-lg"><p class="p-4 text-center">Cargando...</p></div>
                <button id="backToInventarioBtn" class="mt-6 w-full py-3 bg-gray-400 text-white rounded-lg">Volver</button>
            </div></div>`;
        const render = () => renderProductosList('productosListContainer', !isAdmin);
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'modify-filter-rubro', 'Rubro');
        setupFiltros('modify', render);
        startMainInventarioListener(render);
    }

    function getFiltrosHTML(prefix) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded">
                <input type="text" id="${prefix}-search-input" placeholder="Buscar producto o marca..." class="md:col-span-4 p-2 border rounded">
                <select id="${prefix}-filter-rubro" class="p-2 border rounded"><option value="">Rubros</option></select>
                <select id="${prefix}-filter-segmento" class="p-2 border rounded" disabled><option value="">Segmentos</option></select>
                <select id="${prefix}-filter-marca" class="p-2 border rounded" disabled><option value="">Marcas</option></select>
                <button id="${prefix}-clear-filters-btn" class="p-2 bg-gray-200 rounded">Limpiar</button>
            </div>`;
    }

    // --- MEJORA: DEBOUNCE EN FILTROS ---
    function setupFiltros(prefix, renderCallback) {
        const searchInput = document.getElementById(`${prefix}-search-input`);
        const rubroFilter = document.getElementById(`${prefix}-filter-rubro`);
        const clearBtn = document.getElementById(`${prefix}-clear-filters-btn`);

        searchInput.addEventListener('input', () => {
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(() => {
                _lastFilters.searchTerm = searchInput.value;
                renderCallback();
            }, 300); // 300ms de espera
        });

        rubroFilter.addEventListener('change', () => {
            _lastFilters.rubro = rubroFilter.value;
            renderCallback();
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = ''; rubroFilter.value = '';
            _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
            renderCallback();
        });
    }

    async function renderProductosList(id, readOnly) {
        const container = document.getElementById(id);
        if (!container) return;
        let prods = [..._inventarioCache].filter(p => {
            const s = _lastFilters.searchTerm.toLowerCase();
            return (!s || p.presentacion?.toLowerCase().includes(s) || p.marca?.toLowerCase().includes(s)) &&
                   (!_lastFilters.rubro || p.rubro === _lastFilters.rubro);
        });
        const sort = await window.getGlobalProductSortFunction();
        prods.sort(sort);

        let html = `<table class="min-w-full text-sm"><thead><tr class="bg-gray-100"><th class="p-2 text-left">Presentación</th><th class="p-2 text-right">Precio</th><th class="p-2 text-center">Stock</th>${!readOnly?'<th class="p-2">Acción</th>':''}</tr></thead><tbody>`;
        prods.forEach(p => {
            html += `<tr class="border-b"><td class="p-2">${p.presentacion}<br><span class="text-xs text-gray-500">${p.marca}</span></td><td class="p-2 text-right">$${p.precioPorUnidad}</td><td class="p-2 text-center">${p.cantidadUnidades}</td>${!readOnly?`<td class="p-2 text-center"><button onclick="window.inventarioModule.editProducto('${p.id}')" class="text-blue-500">Edit</button></td>`:''}</tr>`;
        });
        container.innerHTML = html + `</tbody></table>`;
    }

    async function editProducto(id) {
        const prod = _inventarioCache.find(p => p.id === id);
        if (!prod) return;
        showAgregarProductoView(); // Reutiliza la vista
        document.querySelector('h2').textContent = 'Editar Producto';
        document.getElementById('presentacion').value = prod.presentacion;
        // Inyectar ID para el submit
        const form = document.getElementById('productoForm');
        form.onsubmit = (e) => handleUpdateProducto(e, id);
    }

    async function handleUpdateProducto(e, id) {
        e.preventDefault();
        const pData = getProductoDataFromForm(true);
        const error = validateData(pData);
        if (error) { _showModal('Error', error); return; }

        _showModal('Progreso', 'Actualizando...');
        try {
            await _setDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, id), pData);
            if (window.adminModule?.propagateProductChange) await window.adminModule.propagateProductChange(id, pData);
            _showModal('Éxito', 'Producto actualizado.');
            showModifyDeleteView();
        } catch (err) { _showModal('Error', err.message); }
    }

    function deleteProducto(id) {
        _showModal('Confirmar', '¿Eliminar producto?', async () => {
            await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, id));
            if (window.adminModule?.propagateProductChange) await window.adminModule.propagateProductChange(id, null);
            _showModal('Éxito', 'Eliminado.');
        });
    }

    async function handleDeleteAllProductos() {
        if (_userRole !== 'admin') return;
        _showModal('¡PELIGRO!', '¿Borrar TODO el inventario?', async () => {
            const snap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
            const batch = _writeBatch(_db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            _showModal('Éxito', 'Inventario vaciado.');
        });
    }

    async function handleDeleteAllDatosMaestros() {
        _showModal('Confirmar', '¿Borrar datos maestros no usados?', async () => {
            // Lógica simplificada: se requiere implementar verificación cruzada
            _showModal('Aviso', 'Función en mantenimiento.');
        });
    }

    window.inventarioModule = {
        editProducto,
        deleteProducto,
        handleDeleteDataItem,
        showAddCategoryModal,
        invalidateSegmentOrderCache
    };
})();

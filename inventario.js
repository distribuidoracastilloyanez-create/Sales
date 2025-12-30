(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch, _getDoc;

    let _inventarioCache = [];
    // *** MODIFICADO: Añadir marca a _lastFilters ***
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
    let _inventarioListenerUnsubscribe = null;
    let _marcasCache = null;

    // Cache para ordenamiento de Segmentos/Marcas (se invalida si cambian)
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

    // --- CORRECCIÓN: Manejador de errores de listener mejorado ---
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
             // FIX: Ignorar errores de permisos/autenticación (comunes al cerrar sesión)
             if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                 console.log(`Inventory listener error ignored (assumed logout): ${error.code}`); 
                 return; // Ignorar el error silenciosamente
             }
             console.error("Error en listener de inventario:", error);
             if (error.code !== 'cancelled') { // No mostrar modal si es cancelación manual
                 _showModal('Error de Conexión', 'No se pudo actualizar el inventario.');
             }
        });
        _activeListeners.push(_inventarioListenerUnsubscribe);
    }
    // --- FIN CORRECCIÓN ---

    // Invalida la caché local de ordenamiento y notifica a otros módulos
    function invalidateSegmentOrderCache() {
        _segmentoOrderCache = null;
        _marcaOrderCacheBySegment = {};
        _marcasCache = null; // También invalidar caché de marcas globales
        // Notificar a otros módulos que usan el ordenamiento global
        if (window.catalogoModule?.invalidateCache) {
             window.catalogoModule.invalidateCache();
        } else {
            console.warn("Función invalidateCache de catalogoModule no encontrada.");
        }
         if (window.ventasModule?.invalidateCache) {
             window.ventasModule.invalidateCache();
        } else {
             // console.warn("Función invalidateCache de ventasModule no encontrada (puede ser normal).");
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

    // *** MODIFICADO: renderSortableHierarchy ahora OCULTA segmentos en lugar de atenuarlos ***
    async function renderSortableHierarchy(rubroFiltro = '') {
        const container = document.getElementById('segmentos-marcas-sortable-list');
        if (!container) return;
        container.innerHTML = `<p class="text-gray-500 text-center">Cargando...</p>`;
        try {
            const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
            let segSnapshot = await _getDocs(segmentosRef);
            let allSegments = segSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Asignar orden inicial si falta
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
             // Ordenar TODOS los segmentos por el campo 'orden'
            allSegments.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));

            const allMarcas = await getAllMarcas();
            const marcasMap = new Map(allMarcas.map(m => [m.name, m.id]));

            // Obtener productos filtrados por rubro (si aplica) para saber qué ocultar y qué marcas mostrar
            let prodsQuery = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            if (rubroFiltro) {
                prodsQuery = _query(prodsQuery, _where("rubro", "==", rubroFiltro));
            }
            const prodSnap = await _getDocs(prodsQuery);
            const prodsEnRubro = prodSnap.docs.map(d => d.data());
            // Crear un Set con los nombres de segmentos que SÍ tienen productos en el rubro filtrado
            const segmentsWithProductsInRubro = rubroFiltro ? new Set(prodsEnRubro.map(p => p.segmento).filter(Boolean)) : null;

            container.innerHTML = '';
            if (allSegments.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center">No hay segmentos definidos.</p>`;
                return;
            }

            // Renderizar TODOS los segmentos
            allSegments.forEach(seg => {
                const segCont = document.createElement('div');
                segCont.className = 'segmento-container border border-gray-300 rounded-lg mb-3 bg-white shadow';
                segCont.dataset.segmentoId = seg.id;
                segCont.dataset.segmentoName = seg.name;
                segCont.dataset.type = 'segmento';

                // Ocultar si hay filtro y este segmento no tiene productos en ese rubro
                const segmentHasProductsInRubro = !segmentsWithProductsInRubro || segmentsWithProductsInRubro.has(seg.name);
                if (rubroFiltro && !segmentHasProductsInRubro) {
                    segCont.classList.add('hidden'); // <-- CAMBIO AQUÍ: Usar hidden en lugar de opacity-50
                }

                const segTitle = document.createElement('div');
                segTitle.className = 'segmento-title p-3 bg-gray-200 rounded-t-lg cursor-grab active:cursor-grabbing font-semibold flex justify-between items-center';
                segTitle.draggable = true;
                segTitle.textContent = seg.name;
                segCont.appendChild(segTitle);

                const marcasList = document.createElement('ul');
                marcasList.className = 'marcas-sortable-list p-3 space-y-1 bg-white rounded-b-lg';
                marcasList.dataset.segmentoParent = seg.id;

                // Obtener marcas únicas en este segmento Y en el rubro filtrado (si aplica)
                const marcasEnSeg = [...new Set(prodsEnRubro
                    .filter(p => p.segmento === seg.name && p.marca)
                    .map(p => p.marca)
                )];

                // Ordenar marcas según preferencia del segmento o alfabéticamente
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

            // Añadir manejadores de Drag & Drop
            addDragAndDropHandlersHierarchy(container);

        } catch (error) {
            console.error("Error al renderizar jerarquía:", error);
            container.innerHTML = `<p class="text-red-500 text-center">Error al cargar la estructura.</p>`;
        }
    }


    function addDragAndDropHandlersHierarchy(container) {
        let draggedItem = null; // El elemento que se está arrastrando (<li> o <div>)
        let draggedItemElement = null; // Mismo que draggedItem, redundante?
        let draggedType = null; // 'segmento' o 'marca'
        let sourceList = null; // El <ul> o el <div> contenedor padre del elemento arrastrado
        let placeholder = null; // El elemento visual que indica dónde se soltará

        // Crea el placeholder visual según el tipo
        const createPlaceholder = (type) => {
            if(placeholder) placeholder.remove(); // Elimina placeholder anterior si existe
            placeholder = document.createElement(type === 'segmento' ? 'div' : 'li');
            placeholder.className = type === 'segmento' ? 'segmento-placeholder' : 'marca-placeholder';
            // Estilos definidos en CSS
            placeholder.style.height = type === 'segmento' ? '60px' : '30px';
            placeholder.style.background = type === 'segmento' ? '#dbeafe' : '#e0e7ff';
            placeholder.style.border = type === 'segmento' ? '2px dashed #3b82f6' : '1px dashed #6366f1';
            placeholder.style.borderRadius = type === 'segmento' ? '0.5rem' : '0.25rem';
            placeholder.style.margin = type === 'segmento' ? '1rem 0' : '0.25rem 0';
            if(type === 'marca') placeholder.style.listStyleType = 'none'; // Quitar viñeta si es marca
        };

        // --- Evento dragstart: Cuando se empieza a arrastrar ---
        container.addEventListener('dragstart', e => {
            // Asegurarse de que el target sea un elemento arrastrable
            draggedItemElement = e.target.closest('.segmento-title, .marca-item'); // Cambiado a .segmento-title
            if (!draggedItemElement) { e.preventDefault(); return; } // Si no es arrastrable, no hacer nada

            draggedType = draggedItemElement.dataset.type || (draggedItemElement.classList.contains('segmento-title') ? 'segmento' : null); // Determinar tipo
             // Si es segmento, el item real a mover es el contenedor padre
            draggedItem = (draggedType === 'segmento') ? draggedItemElement.closest('.segmento-container') : draggedItemElement;

            if (!draggedType || !draggedItem) { e.preventDefault(); return; } // Salir si algo falla

            sourceList = draggedItem.parentNode; // Guardar el contenedor original

            // Efecto visual: semi-transparente
            setTimeout(() => { if (draggedItem) draggedItem.classList.add('opacity-50'); }, 0);
            e.dataTransfer.effectAllowed = 'move';
            createPlaceholder(draggedType); // Crear el placeholder para este tipo
        });

        // --- Evento dragend: Cuando se suelta (después de 'drop') ---
        container.addEventListener('dragend', e => {
            if (draggedItem) draggedItem.classList.remove('opacity-50'); // Restaurar opacidad
            // Limpiar variables globales
            draggedItem = null; draggedItemElement = null; draggedType = null; sourceList = null;
            if (placeholder) placeholder.remove(); placeholder = null; // Eliminar placeholder
        });

        // --- Evento dragover: Mientras se arrastra sobre un área válida ---
        container.addEventListener('dragover', e => {
            e.preventDefault(); // Necesario para permitir 'drop'
            if (!draggedItem || !placeholder) return; // Salir si no hay item arrastrado

            // Determinar el contenedor destino válido
            const targetList = e.target.closest(draggedType === 'segmento' ? '#segmentos-marcas-sortable-list' : '.marcas-sortable-list');

            // Validar si el drop es permitido
            // 1. Debe haber un targetList
            // 2. Si es marca, SÓLO se puede soltar en su lista original (sourceList)
            if (!targetList || (draggedType === 'marca' && targetList !== sourceList)) {
                if (placeholder.parentNode) placeholder.remove(); // Quitar placeholder si el área no es válida
                e.dataTransfer.dropEffect = 'none'; // Cursor "no permitido"
                return;
            }

            e.dataTransfer.dropEffect = 'move'; // Cursor "mover"

            // Calcular dónde insertar el placeholder
            const afterElement = getDragAfterElementHierarchy(targetList, e.clientY, draggedType);
            if (afterElement === null) {
                targetList.appendChild(placeholder); // Añadir al final
            } else {
                targetList.insertBefore(placeholder, afterElement); // Añadir antes del elemento detectado
            }
        });

        // --- Evento drop: Cuando se suelta el elemento ---
        container.addEventListener('drop', e => {
            e.preventDefault(); // Prevenir comportamiento por defecto
            const targetList = e.target.closest(draggedType === 'segmento' ? '#segmentos-marcas-sortable-list' : '.marcas-sortable-list');

            // Mover el elemento arrastrado a la posición del placeholder
            // Asegurarse de que todas las condiciones son válidas
            if (draggedItem && placeholder && placeholder.parentNode && targetList && !(draggedType === 'marca' && targetList !== sourceList) ) {
                placeholder.parentNode.insertBefore(draggedItem, placeholder); // Mover el item real
            }

            // Limpieza final (similar a dragend)
            if (draggedItem) draggedItem.classList.remove('opacity-50');
            if (placeholder) placeholder.remove();
            draggedItem = null; draggedItemElement = null; draggedType = null; sourceList = null; placeholder = null;
        });

        // --- Evento dragleave: Cuando el cursor sale de un área de drop válida ---
        container.addEventListener('dragleave', e => {
            // Eliminar placeholder SÓLO si el cursor sale del contenedor principal Y hay un placeholder
            if (!container.contains(e.relatedTarget) && placeholder) {
                 placeholder.remove();
                 placeholder = null;
            }
        });

        // Función auxiliar para encontrar el elemento sobre el cual se está arrastrando
        function getDragAfterElementHierarchy(listContainer, y, itemType) {
            const selector = itemType === 'segmento' ? '.segmento-container:not(.opacity-50)' : '.marca-item:not(.opacity-50)'; // Excluir el item que se arrastra
            // Obtener todos los elementos arrastrables DENTRO del listContainer actual, excepto el placeholder y el item que se arrastra
            const draggables = [...listContainer.children].filter(c => c.matches(selector) && c !== draggedItem && !c.matches('.segmento-placeholder') && !c.matches('.marca-placeholder'));

            // Encontrar el elemento más cercano DESPUÉS del cursor
            return draggables.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2; // Distancia vertical desde el centro del elemento
                // Si el offset es negativo (cursor está arriba del centro) y es más cercano que el anterior
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element; // Retorna el elemento o null si no hay ninguno después
        }
    }

    async function handleGuardarOrdenJerarquia() {
        if (_userRole !== 'admin') return;
        const segConts = document.querySelectorAll('#segmentos-marcas-sortable-list .segmento-container'); // Obtener TODOS los divs de segmento, incluso los ocultos
        if (segConts.length === 0) { _showModal('Aviso', 'No hay elementos para ordenar.'); return; }
        _showModal('Progreso', 'Guardando nuevo orden...');
        const batch = _writeBatch(_db);
        let segOrderChanged = false, marcaOrderChanged = false;
        const orderedSegIds = []; // Guardar IDs de segmento en el nuevo orden para propagación
        const currentSegmentDocs = {}; // Cache de datos actuales de segmentos para comparación

        // Precargar datos actuales de segmentos para comparar
        try {
            const segsRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
            const segsSnap = await _getDocs(segsRef);
            segsSnap.docs.forEach(doc => { currentSegmentDocs[doc.id] = doc.data(); });
        } catch (e) {
            console.warn("No se pudieron precargar los datos de segmentos:", e);
            // Continuar igual, la comparación fallará y se marcará como cambiado
        }


        // Iterar sobre los contenedores de segmento en el orden visual actual (incluye ocultos)
        segConts.forEach((segCont, index) => {
            const segId = segCont.dataset.segmentoId;
            orderedSegIds.push(segId); // Guardar ID en orden
            const segRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, segId);
            const currentSegData = currentSegmentDocs[segId] || {}; // Datos actuales o vacío

            // Actualizar orden del segmento si cambió
            if (currentSegData.orden === undefined || currentSegData.orden !== index) {
                batch.update(segRef, { orden: index });
                segOrderChanged = true;
            }

            // Obtener el nuevo orden de marcas dentro de este segmento
            const marcaItems = segCont.querySelectorAll('.marcas-sortable-list .marca-item');
            const newMarcaOrder = Array.from(marcaItems).map(item => item.dataset.marcaName);
            const currentMarcaOrder = currentSegData.marcaOrder || [];

            // Actualizar orden de marcas si cambió
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
            await batch.commit(); // Guardar cambios locales (admin)
            invalidateSegmentOrderCache(); // Limpiar caché local y notificar otros módulos
            _showModal('Progreso', 'Orden guardado localmente. Propagando a usuarios...');
            let propSuccess = true;

            // Propagar orden de segmentos si cambió
            if (segOrderChanged && window.adminModule?.propagateCategoryOrderChange) {
                try {
                    await window.adminModule.propagateCategoryOrderChange('segmentos', orderedSegIds);
                } catch (e) { propSuccess = false; console.error("Error propagando orden segmentos:", e); }
            }

            // Propagar orden de marcas por cada segmento si cambió
            if (marcaOrderChanged && window.adminModule?.propagateCategoryChange) {
                for (const segCont of segConts) {
                     const segId=segCont.dataset.segmentoId;
                     const marcaItems=segCont.querySelectorAll('.marcas-sortable-list .marca-item');
                     const newMarcaOrder=Array.from(marcaItems).map(item=>item.dataset.marcaName);
                     try {
                         const segRef=_doc(_db,`artifacts/${_appId}/users/${_userId}/segmentos`,segId);
                         const segSnap=await _getDoc(segRef); // Obtener datos actualizados post-commit
                         if(segSnap.exists()){
                             const segDataCompleto = segSnap.data();
                             // No es necesario añadir marcaOrder aquí, ya se guardó en el batch
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


    function showAjusteMasivoView() {
         if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Ajuste Masivo de Cantidades</h2>
                        ${getFiltrosHTML('ajuste')}
                        <div id="ajusteListContainer" class="overflow-x-auto max-h-96 border rounded-lg">
                            <p class="text-gray-500 text-center p-4">Cargando...</p>
                        </div>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="saveAjusteBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Guardar Cambios</button>
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
        if (productos.length === 0) { container.innerHTML = `<p class="text-gray-500 text-center p-4">No hay productos que coincidan con los filtros.</p>`; return; }
        let tableHTML = `<table class="min-w-full bg-white text-sm"><thead class="bg-gray-100 sticky top-0 z-10"><tr><th class="py-2 px-4 border-b text-left">Producto</th><th class="py-2 px-4 border-b text-center w-40">Cant. Nueva</th></tr></thead><tbody>`;
        let lastHeaderKey = null; const firstSortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';
        
        productos.forEach(p => {
            const currentHeaderValue = p[firstSortKey] || `Sin ${firstSortKey}`;
            if (currentHeaderValue !== lastHeaderKey) { lastHeaderKey = currentHeaderValue; tableHTML += `<tr><td colspan="2" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastHeaderKey}</td></tr>`; }
            
            const vPor = p.ventaPor || {und:true};
            const cStockU = p.cantidadUnidades||0;

            // --- Lógica para el <select> o texto estático ---
            let optionsHTML = '';
            let factors = {};
            let defaultUnit = 'und';
            let unitLabels = { cj: 'Cj.', paq: 'Paq.', und: 'Und.' };

            // Construir opciones y factores
            if(vPor.cj){ 
                factors['cj'] = p.unidadesPorCaja||1;
                optionsHTML += `<option value="cj" data-factor="${factors['cj']}">Cj.</option>`; 
                defaultUnit = 'cj';
            }
            if(vPor.paq){ 
                factors['paq'] = p.unidadesPorPaquete||1;
                optionsHTML += `<option value="paq" data-factor="${factors['paq']}">Paq.</option>`; 
                if(defaultUnit === 'und') defaultUnit = 'paq';
            }
            if(vPor.und){ 
                factors['und'] = 1;
                optionsHTML += `<option value="und" data-factor="1">Und.</option>`; 
                // defaultUnit es 'und' por defecto, así que no es necesario cambiarlo si es el único
            }
            
            const numOptions = Object.keys(factors).length;
            let unitElementHTML = '';

            if (numOptions > 1) {
                // Hay múltiples opciones: renderizar <select>
                optionsHTML = optionsHTML.replace(`value="${defaultUnit}"`, `value="${defaultUnit}" selected`);
                unitElementHTML = `
                    <select data-doc-id="${p.id}" class="w-20 ml-2 p-1 border rounded-lg text-sm bg-gray-50 ajuste-unit-select">
                        ${optionsHTML}
                    </select>`;
            } else {
                // Solo hay una opción (o ninguna, aunque 'und' es el fallback)
                // Si no hay factores (raro), default a 'und'
                if (numOptions === 0) {
                    factors['und'] = 1;
                    defaultUnit = 'und';
                }
                // Si hay 1, defaultUnit ya se habrá establecido a 'cj', 'paq', o 'und'
                const singleUnitKey = numOptions === 1 ? Object.keys(factors)[0] : 'und';
                const singleUnitLabel = unitLabels[singleUnitKey];
                const singleUnitFactor = factors[singleUnitKey];
                defaultUnit = singleUnitKey; // Asegurarse de que defaultUnit sea el correcto

                unitElementHTML = `
                    <span data-doc-id="${p.id}" 
                          data-factor="${singleUnitFactor}" 
                          data-unit-key="${singleUnitKey}"
                          class="w-20 ml-2 p-1 text-sm text-gray-700 text-center ajuste-unit-static">
                        ${singleUnitLabel}
                    </span>`;
            }

            const cStockDispU = Math.floor(cStockU / (factors[defaultUnit] || 1)); // Cantidad actual en la unidad de medida ELEGIDA

            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-4 border-b">
                        <p class="font-medium">${p.presentacion}</p>
                        <p class="text-xs text-gray-500">${p.marca||'S/M'} - Actual: ${cStockU} Und. Base</p>
                    </td>
                    <td class="py-2 px-4 border-b text-center align-middle">
                        <div class="flex items-center justify-center">
                            <input type="number" value="${cStockDispU}" data-doc-id="${p.id}" min="0" step="1" class="w-20 p-1 text-center border rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ajuste-qty-input">
                            ${unitElementHTML}
                        </div>
                    </td>
                </tr>`;
        });
        tableHTML += `</tbody></table>`; 
        container.innerHTML = tableHTML;
        
        // --- Añadir listeners a los <select> ---
        // Es necesario añadir listeners para recalcular el valor del input si el usuario cambia la unidad
        container.querySelectorAll('.ajuste-unit-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const docId = e.target.dataset.docId;
                const input = container.querySelector(`.ajuste-qty-input[data-doc-id="${docId}"]`);
                const producto = _inventarioCache.find(p => p.id === docId);
                if (!input || !producto) return;

                const selectedOption = e.target.options[e.target.selectedIndex];
                const newFactor = parseInt(selectedOption.dataset.factor, 10) || 1;
                const stockBase = producto.cantidadUnidades || 0;
                
                // Recalcular y mostrar el stock actual en la *nueva* unidad seleccionada
                input.value = Math.floor(stockBase / newFactor);
            });
        });
    }

    async function handleGuardarAjusteMasivo() {
        const inputs = document.querySelectorAll('#ajusteListContainer .ajuste-qty-input');
        if (inputs.length === 0) { _showModal('Aviso', 'No hay productos en la lista para ajustar.'); return; }
        const batch = _writeBatch(_db);
        let changesCount = 0;
        let invalidValues = false;
        
        // Limpiar estilos de error
        inputs.forEach(i => i.classList.remove('border-red-500','ring-1','ring-red-500'));

        inputs.forEach(input => {
            const docId = input.dataset.docId;
            const newValueStr = input.value.trim();
            const newValue = parseInt(newValueStr, 10);
            const productoOriginal = _inventarioCache.find(p => p.id === docId);

            // --- Lógica para obtener el factor ---
            const unitSelect = document.querySelector(`.ajuste-unit-select[data-doc-id="${docId}"]`);
            const unitStatic = document.querySelector(`.ajuste-unit-static[data-doc-id="${docId}"]`);
            
            let conversionFactor = 1;

            if (unitSelect) {
                // Es un dropdown
                const selectedUnit = unitSelect.value;
                const selectedOption = unitSelect.querySelector(`option[value="${selectedUnit}"]`);
                if (!selectedOption) {
                     console.warn(`No se encontró option seleccionada para ${docId}`);
                     invalidValues = true;
                     return;
                }
                conversionFactor = parseInt(selectedOption.dataset.factor, 10) || 1;
            } else if (unitStatic) {
                // Es un span estático
                conversionFactor = parseInt(unitStatic.dataset.factor, 10) || 1;
            } else {
                // Error: No se encontró ni select ni span
                console.warn(`No se encontró elemento de unidad (select o static) para ${docId}`);
                invalidValues = true;
                return; // No se puede procesar
            }
            // --- Fin lógica factor ---

             // Validar entrada: no vacío, número entero no negativo
            if (newValueStr === '' || isNaN(newValue) || !Number.isInteger(newValue) || newValue < 0) {
                if(newValueStr !== '') {
                    input.classList.add('border-red-500','ring-1','ring-red-500');
                    invalidValues = true;
                }
                return; // Saltar este input si está vacío o inválido
            }

            if (productoOriginal) {
                const nuevaCantidadUnidades = newValue * conversionFactor;
                const cantidadActualUnidades = productoOriginal.cantidadUnidades || 0;

                // Solo añadir al batch si el valor calculado en unidades base es diferente
                if (cantidadActualUnidades !== nuevaCantidadUnidades) {
                    const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, docId);
                    batch.update(docRef, { cantidadUnidades: nuevaCantidadUnidades });
                    changesCount++;
                }
            } else {
                 console.warn(`Producto con ID ${docId} no encontrado en caché durante ajuste masivo.`);
            }
        });

        if(invalidValues){ _showModal('Error','Hay valores inválidos marcados en rojo o no se pudo leer la unidad. Corrígelos e intenta de nuevo.'); return; }
        if(changesCount === 0){ _showModal('Aviso','No se detectaron cambios en las cantidades.'); return; }

        _showModal('Confirmar Cambios', `Se actualizará la cantidad base de ${changesCount} producto(s). ¿Continuar?`, async () => {
            _showModal('Progreso','Guardando cambios...');
            try {
                await batch.commit();
                _showModal('Éxito',`Se actualizaron ${changesCount} producto(s) correctamente.`);
                // El listener actualizará la UI, pero forzamos un re-render para que los <input>
                // muestren el valor correcto en la unidad seleccionada por defecto.
                renderAjusteMasivoList();
            } catch (error) {
                console.error("Error al guardar ajuste masivo:", error);
                _showModal('Error',`Ocurrió un error al guardar: ${error.message}`);
            }
        }, 'Sí, Actualizar', null, true); // true para triggerConfirmLogic
    }


    function showModificarDatosView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Modificar Datos Maestros</h2>
                        <p class="text-sm text-center text-gray-600 mb-6">Gestiona Rubros, Segmentos, Marcas. Cambios se propagan. Eliminación solo si no están en uso.</p>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <h3 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2 flex justify-between items-center"> <span>Rubros</span> <button onclick="window.inventarioModule.showAddCategoryModal('rubros', 'Rubro')" class="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">+</button> </h3>
                                <div id="rubros-list" class="space-y-2 max-h-60 overflow-y-auto border p-2 rounded bg-gray-50"></div>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2 flex justify-between items-center"> <span>Segmentos</span> <button onclick="window.inventarioModule.showAddCategoryModal('segmentos', 'Segmento')" class="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">+</button> </h3>
                                <div id="segmentos-list" class="space-y-2 max-h-60 overflow-y-auto border p-2 rounded bg-gray-50"></div>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2 flex justify-between items-center"> <span>Marcas</span> <button onclick="window.inventarioModule.showAddCategoryModal('marcas', 'Marca')" class="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">+</button> </h3>
                                <div id="marcas-list" class="space-y-2 max-h-60 overflow-y-auto border p-2 rounded bg-gray-50"></div>
                            </div>
                        </div>
                        <div class="mt-8 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="deleteAllDatosMaestrosBtn" class="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700">Eliminar No Usados</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('deleteAllDatosMaestrosBtn').addEventListener('click', handleDeleteAllDatosMaestros);
        renderDataListForEditing('rubros', 'rubros-list', 'Rubro');
        renderDataListForEditing('segmentos', 'segmentos-list', 'Segmento');
        renderDataListForEditing('marcas', 'marcas-list', 'Marca');
    }

    function renderDataListForEditing(collectionName, containerId, itemName) {
        const container = document.getElementById(containerId); if (!container) return; container.innerHTML = `<p class="text-gray-500 text-sm p-2">Cargando...</p>`;
        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`);
        const unsubscribe = _onSnapshot(collectionRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            if (items.length === 0) { container.innerHTML = `<p class="text-gray-500 text-sm p-2">No hay ${itemName.toLowerCase()}s definidos.</p>`; return; }
            container.innerHTML = items.map(item => `<div class="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-gray-200"><span class="text-gray-800 text-sm flex-grow mr-2">${item.name}</span><div class="flex-shrink-0 space-x-1"><button onclick="window.inventarioModule.handleDeleteDataItem('${collectionName}', '${item.name}', '${itemName}', '${item.id}')" class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600" title="Eliminar">X</button></div></div>`).join('');
        }, (error) => { 
            // FIX: Ignorar errores de permisos/autenticación (comunes al cerrar sesión)
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                console.log(`Listener ${collectionName} error ignored (assumed logout): ${error.code}`); 
                return; // Ignorar el error silenciosamente
            }
            console.error(`Error listener ${collectionName}:`, error); 
            container.innerHTML = `<p class="text-red-500 text-center p-2">Error al cargar.</p>`; 
        });
        _activeListeners.push(unsubscribe);
    }

    // Llama al modal de agregar, que ahora maneja la propagación si es admin
    function showAddCategoryModal(collectionName, itemName) {
        // La lógica de propagación ahora está dentro de showAddItemModal en index.html
         _showAddItemModal(collectionName, itemName);
    }


    async function handleDeleteDataItem(collectionName, itemName, itemType, itemId) {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; }
        const fieldMap = { rubros: 'rubro', segmentos: 'segmento', marcas: 'marca' }; const fieldName = fieldMap[collectionName]; if (!fieldName) { _showModal('Error Interno', 'Tipo no reconocido.'); return; }
        _showModal('Progreso', `Verificando uso de "${itemName}"...`); const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const q = _query(inventarioRef, _where(fieldName, "==", itemName));
        try { const usageSnapshot = await _getDocs(q); if (!usageSnapshot.empty) { _showModal('Error al Eliminar', `"${itemName}" está en uso por ${usageSnapshot.size} producto(s). No se puede eliminar.`); return; }
            _showModal('Confirmar Eliminación', `Eliminar ${itemType} "${itemName}"? Se propagará y es IRREVERSIBLE.`, async () => { _showModal('Progreso', `Eliminando "${itemName}"...`); try { await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`, itemId)); if (window.adminModule?.propagateCategoryChange) { _showModal('Progreso', `Propagando eliminación...`); await window.adminModule.propagateCategoryChange(collectionName, itemId, null); } else { console.warn('Propagate function not found.'); } if (collectionName === 'segmentos') invalidateSegmentOrderCache(); _showModal('Éxito', `${itemType} "${itemName}" eliminado.`); } catch (deleteError) { console.error(`Error eliminando/propagando ${itemName}:`, deleteError); _showModal('Error', `Error: ${deleteError.message}`); } }, 'Sí, Eliminar', null, true);
        } catch (error) { console.error(`Error verificando uso ${itemName}:`, error); _showModal('Error', `Error al verificar: ${error.message}`); }
    }

    function showAgregarProductoView() {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; } if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-2xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Agregar Producto</h2>
                <form id="productoForm" class="space-y-4 text-left">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="rubro">Rubro:</label> <div class="flex items-center space-x-2"> <select id="rubro" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('rubros', 'Rubro')" class="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs">+</button> </div> </div> <div> <label for="segmento">Segmento:</label> <div class="flex items-center space-x-2"> <select id="segmento" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('segmentos', 'Segmento')" class="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs">+</button> </div> </div> <div> <label for="marca">Marca:</label> <div class="flex items-center space-x-2"> <select id="marca" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('marcas', 'Marca')" class="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs">+</button> </div> </div> <div> <label for="presentacion">Presentación:</label> <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required> </div> </div>
                    <div class="border-t pt-4 mt-4"> <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <div> <label class="block mb-2">Venta por:</label> <div id="ventaPorContainer" class="flex items-center space-x-4"> <label class="flex items-center"><input type="checkbox" id="ventaPorUnd" class="h-4 w-4"> <span class="ml-2">Und.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorPaq" class="h-4 w-4"> <span class="ml-2">Paq.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorCj" class="h-4 w-4"> <span class="ml-2">Cj.</span></label> </div> </div> <div class="mt-4 md:mt-0"> <label class="flex items-center cursor-pointer"> <input type="checkbox" id="manejaVaciosCheck" class="h-4 w-4"> <span class="ml-2 font-medium">Maneja Vacío</span> </label> <div id="tipoVacioContainer" class="mt-2 hidden"> <label for="tipoVacioSelect" class="block text-sm">Tipo:</label> <select id="tipoVacioSelect" class="w-full px-2 py-1 border rounded-lg text-sm bg-gray-50"> <option value="">Seleccione...</option> <option value="1/4 - 1/3">1/4 - 1/3</option> <option value="ret 350 ml">Ret 350 ml</option> <option value="ret 1.25 Lts">Ret 1.25 Lts</option> </select> </div> </div> </div> <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"></div> <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div> </div>
                    <div class="border-t pt-4 mt-4"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label>Cantidad Inicial:</label> <input type="number" id="cantidadInicial" value="0" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly> <p class="text-xs text-gray-500 mt-1">Siempre 0 al agregar.</p> </div> <div> <label for="ivaTipo">IVA:</label> <select id="ivaTipo" class="w-full px-4 py-2 border rounded-lg" required> <option value="16" selected>16%</option> <option value="0">Exento 0%</option> </select> </div> </div> </div>
                    <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Guardar y Propagar</button>
                </form>
                <button id="backToInventarioBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'rubro', 'Rubro'); _populateDropdown(`artifacts/${_appId}/users/${_userId}/segmentos`, 'segmento', 'Segmento'); _populateDropdown(`artifacts/${_appId}/users/${_userId}/marcas`, 'marca', 'Marca');
        const vPorCont=document.getElementById('ventaPorContainer'), pCont=document.getElementById('preciosContainer'), eCont=document.getElementById('empaquesContainer'), mVacioCheck=document.getElementById('manejaVaciosCheck'), tVacioCont=document.getElementById('tipoVacioContainer'), tVacioSel=document.getElementById('tipoVacioSelect');
        const updateDynInputs=()=>{eCont.innerHTML=''; pCont.innerHTML=''; const vPaq=document.getElementById('ventaPorPaq').checked, vCj=document.getElementById('ventaPorCj').checked, vUnd=document.getElementById('ventaPorUnd').checked; if(vPaq)eCont.innerHTML+=`<div><label class="text-sm">Und/Paq:</label><input type="number" id="unidadesPorPaquete" min="1" class="w-full px-2 py-1 border rounded" value="1" required></div>`; if(vCj)eCont.innerHTML+=`<div><label class="text-sm">Und/Cj:</label><input type="number" id="unidadesPorCaja" min="1" class="w-full px-2 py-1 border rounded" value="1" required></div>`; if(vUnd)pCont.innerHTML+=`<div><label class="text-sm">Precio Und.</label><input type="number" step="0.01" min="0" id="precioUnd" class="w-full px-2 py-1 border rounded" required></div>`; if(vPaq)pCont.innerHTML+=`<div><label class="text-sm">Precio Paq.</label><input type="number" step="0.01" min="0" id="precioPaq" class="w-full px-2 py-1 border rounded" required></div>`; if(vCj)pCont.innerHTML+=`<div><label class="text-sm">Precio Cj.</label><input type="number" step="0.01" min="0" id="precioCj" class="w-full px-2 py-1 border rounded" required></div>`; pCont.querySelectorAll('input').forEach(i=>{i.required=document.getElementById(`ventaPor${i.id.substring(6)}`)?.checked??false;});};
        mVacioCheck.addEventListener('change',()=>{if(mVacioCheck.checked){tVacioCont.classList.remove('hidden');tVacioSel.required=true;}else{tVacioCont.classList.add('hidden');tVacioSel.required=false;tVacioSel.value='';}}); vPorCont.addEventListener('change',updateDynInputs); updateDynInputs();
        document.getElementById('productoForm').addEventListener('submit', agregarProducto); document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
    }

    function getProductoDataFromForm(isEditing = false) {
        const undPaqInput = document.getElementById('unidadesPorPaquete'), undCjInput = document.getElementById('unidadesPorCaja'); const undPaq = Math.max(1, undPaqInput ? (parseInt(undPaqInput.value, 10) || 1) : 1); const undCj = Math.max(1, undCjInput ? (parseInt(undCjInput.value, 10) || 1) : 1); const pUndInput = document.getElementById('precioUnd'), pPaqInput = document.getElementById('precioPaq'), pCjInput = document.getElementById('precioCj'); const precios = { und: Math.max(0, pUndInput ? (parseFloat(pUndInput.value) || 0) : 0), paq: Math.max(0, pPaqInput ? (parseFloat(pPaqInput.value) || 0) : 0), cj: Math.max(0, pCjInput ? (parseFloat(pCjInput.value) || 0) : 0), }; let pFinalUnd = 0; if (precios.und > 0) pFinalUnd = precios.und; else if (precios.paq > 0 && undPaq > 0) pFinalUnd = precios.paq / undPaq; else if (precios.cj > 0 && undCj > 0) pFinalUnd = precios.cj / undCj; pFinalUnd = parseFloat(pFinalUnd.toFixed(2)); const cantUnd = isEditing ? (parseInt(document.getElementById('cantidadActual').value, 10) || 0) : 0; // Cantidad es 0 al agregar, o se lee del campo readonly al editar
        const manejaVac = document.getElementById('manejaVaciosCheck').checked; const tipoVac = document.getElementById('tipoVacioSelect').value;
        return { rubro: document.getElementById('rubro').value, segmento: document.getElementById('segmento').value, marca: document.getElementById('marca').value, presentacion: document.getElementById('presentacion').value.trim(), unidadesPorPaquete: undPaq, unidadesPorCaja: undCj, ventaPor: { und: document.getElementById('ventaPorUnd').checked, paq: document.getElementById('ventaPorPaq').checked, cj: document.getElementById('ventaPorCj').checked }, manejaVacios: manejaVac, tipoVacio: manejaVac ? tipoVac : null, precios: precios, precioPorUnidad: pFinalUnd, cantidadUnidades: cantUnd, iva: parseInt(document.getElementById('ivaTipo').value, 10) };
    }

    async function agregarProducto(e) {
        e.preventDefault(); if (_userRole !== 'admin') return; const pData = getProductoDataFromForm(false); if (!pData.rubro||!pData.segmento||!pData.marca||!pData.presentacion){_showModal('Error','Completa campos requeridos.');return;} if (!pData.ventaPor.und&&!pData.ventaPor.paq&&!pData.ventaPor.cj){_showModal('Error','Selecciona al menos una forma de venta.');return;} if (pData.manejaVacios&&!pData.tipoVacio){_showModal('Error','Si maneja vacío, selecciona el tipo.');document.getElementById('tipoVacioSelect')?.focus();return;} let pValido=(pData.ventaPor.und&&pData.precios.und>0)||(pData.ventaPor.paq&&pData.precios.paq>0)||(pData.ventaPor.cj&&pData.precios.cj>0); if(!pValido){_showModal('Error','Ingresa al menos un precio válido (> 0) para la forma de venta seleccionada.');document.querySelector('#preciosContainer input[required]')?.focus();return;} _showModal('Progreso','Verificando duplicados...');
        try { const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const q = _query(invRef, _where("rubro","==",pData.rubro),_where("segmento","==",pData.segmento),_where("marca","==",pData.marca),_where("presentacion","==",pData.presentacion)); const qSnap = await _getDocs(q); if (!qSnap.empty) { _showModal('Duplicado', 'Ya existe un producto con esa combinación de Rubro, Segmento, Marca y Presentación.'); return; } _showModal('Progreso','Guardando y propagando...'); const dRef = await _addDoc(invRef, pData); if (window.adminModule?.propagateProductChange) { await window.adminModule.propagateProductChange(dRef.id, pData); } _showModal('Éxito','Producto agregado y propagado correctamente.'); showAgregarProductoView(); /* Podría resetear el form aquí */ } catch (err) { console.error("Error agregando producto:", err); _showModal('Error',`Ocurrió un error al guardar: ${err.message}`); }
    }


    function showModifyDeleteView() {
         if (_floatingControls) _floatingControls.classList.add('hidden'); const isAdmin = _userRole === 'admin';
        // Define el HTML
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl"> <h2 class="text-2xl font-bold mb-6 text-center">Ver Productos / ${isAdmin?'Modificar Def.':'Consultar Stock'}</h2> ${getFiltrosHTML('modify')} <div id="productosListContainer" class="overflow-x-auto max-h-96 border rounded-lg"> <p class="text-gray-500 text-center p-4">Cargando...</p> </div> <div class="mt-6 flex flex-col sm:flex-row gap-4"> <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button> ${isAdmin?`<button id="deleteAllProductosBtn" class="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700">Eliminar Todos</button>`:''} </div> </div> </div> </div>`;

        // --- INICIO CORRECCIÓN ---
        // Define la función callback UNA VEZ
        const renderCallback = () => renderProductosList('productosListContainer', !isAdmin);

        // Adjunta listeners a los botones DESPUÉS de setear innerHTML
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        if (isAdmin) document.getElementById('deleteAllProductosBtn')?.addEventListener('click', handleDeleteAllProductos);

        // Llama a la primera renderización explícitamente DESPUÉS de que el DOM se actualizó
        renderCallback(); // Asegura que el contenedor existe para la primera carga

        // Configura los filtros y el listener, pasando el mismo callback
        _populateDropdown(`artifacts/${_appId}/users/${_userId}/rubros`, 'modify-filter-rubro', 'Rubro');
        setupFiltros('modify', renderCallback); // setupFiltros podría llamar a renderCallback más tarde
        startMainInventarioListener(renderCallback); // El listener llamará a renderCallback en actualizaciones
        // --- FIN CORRECCIÓN ---
    }

    // *** MODIFICADO: getFiltrosHTML ahora incluye el select de Marca ***
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

    // *** MODIFICADO: setupFiltros ahora maneja el select de Marca ***
    function setupFiltros(prefix, renderCallback) {
        const searchInput=document.getElementById(`${prefix}-search-input`);
        const rubroFilter=document.getElementById(`${prefix}-filter-rubro`);
        const segmentoFilter=document.getElementById(`${prefix}-filter-segmento`);
        const marcaFilter=document.getElementById(`${prefix}-filter-marca`); // Añadido
        const clearBtn=document.getElementById(`${prefix}-clear-filters-btn`);

        // Verificación robusta de elementos
        if(!searchInput || !rubroFilter || !segmentoFilter || !marcaFilter || !clearBtn) {
            console.error(`Error: No se encontraron todos los elementos de filtro con prefijo ${prefix}.`);
            return;
        }

        // Función para actualizar Segmentos y Marcas basado en Rubro/Segmento seleccionado
        function updateDependentDropdowns(trigger) {
            const selectedRubro = rubroFilter.value;
            // Guardar valores actuales antes de limpiar para intentar restaurarlos
            const currentSegmentoValue = (trigger === 'init' || trigger === 'rubro') ? _lastFilters.segmento : segmentoFilter.value;
            const currentMarcaValue = (trigger === 'init' || trigger === 'rubro' || trigger === 'segmento') ? _lastFilters.marca : marcaFilter.value;

            // --- Actualizar Segmentos ---
            segmentoFilter.innerHTML = '<option value="">Todos</option>';
            segmentoFilter.disabled = true;
            segmentoFilter.value = ""; // Resetear valor

            if (selectedRubro) {
                const segmentos = [...new Set(_inventarioCache
                    .filter(p => p.rubro === selectedRubro && p.segmento)
                    .map(p => p.segmento))]
                    .sort();
                if (segmentos.length > 0) {
                    segmentos.forEach(s => {
                        const option = document.createElement('option');
                        option.value = s; option.textContent = s;
                        if (s === currentSegmentoValue) { option.selected = true; } // Restaurar si es posible
                        segmentoFilter.appendChild(option);
                    });
                    segmentoFilter.disabled = false;
                    segmentoFilter.value = currentSegmentoValue; // Reasignar valor (puede ser "" si no se encontró)
                }
            }
             // Si el valor restaurado no coincide con el valor guardado (porque ya no existe), limpiar filtro guardado
            if (segmentoFilter.value !== currentSegmentoValue) { _lastFilters.segmento = ''; }


            // --- Actualizar Marcas ---
            marcaFilter.innerHTML = '<option value="">Todos</option>';
            marcaFilter.disabled = true;
             marcaFilter.value = ""; // Resetear valor

            // Las marcas dependen del rubro y opcionalmente del segmento seleccionado
            if (selectedRubro) {
                const marcas = [...new Set(_inventarioCache
                    .filter(p => p.rubro === selectedRubro && (!segmentoFilter.value || p.segmento === segmentoFilter.value) && p.marca) // Filtrar por rubro y segmento (si hay)
                    .map(p => p.marca))]
                    .sort();
                if (marcas.length > 0) {
                    marcas.forEach(m => {
                         const option = document.createElement('option');
                         option.value = m; option.textContent = m;
                         if (m === currentMarcaValue) { option.selected = true; } // Restaurar si es posible
                         marcaFilter.appendChild(option);
                    });
                    marcaFilter.disabled = false;
                    marcaFilter.value = currentMarcaValue; // Reasignar valor
                }
            }
            // Si el valor restaurado no coincide, limpiar filtro guardado
            if (marcaFilter.value !== currentMarcaValue) { _lastFilters.marca = ''; }
        }

        // Restaurar estado inicial y popular filtros dependientes
        setTimeout(() => {
            rubroFilter.value = _lastFilters.rubro || '';
            // Llamar a updateDependentDropdowns con 'init' para que restaure segmento Y marca
            updateDependentDropdowns('init');
            if (typeof renderCallback === 'function') renderCallback();
        }, 300);


        // Función para aplicar y guardar filtros
        const applyAndSaveChanges = () => {
            _lastFilters.searchTerm = searchInput.value || '';
            _lastFilters.rubro = rubroFilter.value || '';
            _lastFilters.segmento = segmentoFilter.value || '';
            _lastFilters.marca = marcaFilter.value || ''; // Guardar filtro marca
            if (typeof renderCallback === 'function') renderCallback();
        };

        // Listeners
        searchInput.addEventListener('input', applyAndSaveChanges);
        rubroFilter.addEventListener('change', () => {
             _lastFilters.segmento = ''; _lastFilters.marca = ''; // Resetear dependientes
            updateDependentDropdowns('rubro');
            applyAndSaveChanges();
        });
        segmentoFilter.addEventListener('change', () => {
            _lastFilters.marca = ''; // Resetear marca
            updateDependentDropdowns('segmento');
            applyAndSaveChanges();
        });
        marcaFilter.addEventListener('change', applyAndSaveChanges); // Listener para marca
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            rubroFilter.value = '';
            // Resetear _lastFilters y actualizar dropdowns dependientes
            _lastFilters.segmento = ''; _lastFilters.marca = '';
            updateDependentDropdowns('rubro'); // Trigger inicial
            applyAndSaveChanges();
        });
    }

    // *** MODIFICADO: renderProductosList ahora incluye columna Marca y filtro Marca ***
    async function renderProductosList(elementId, readOnly = false) {
        const container = document.getElementById(elementId);
        if (!container) { return; } // Salir si el contenedor no existe

        let productosFiltrados = [..._inventarioCache];
        productosFiltrados = productosFiltrados.filter(p => {
            const searchTermLower = (_lastFilters.searchTerm || '').toLowerCase();
            // Búsqueda ahora incluye Marca
            const textMatch = !searchTermLower ||
                (p.presentacion && p.presentacion.toLowerCase().includes(searchTermLower)) ||
                (p.marca && p.marca.toLowerCase().includes(searchTermLower)) ||
                (p.segmento && p.segmento.toLowerCase().includes(searchTermLower));
            const rubroMatch = !_lastFilters.rubro || p.rubro === _lastFilters.rubro;
            const segmentoMatch = !_lastFilters.segmento || p.segmento === _lastFilters.segmento;
            const marcaMatch = !_lastFilters.marca || p.marca === _lastFilters.marca; // Añadido filtro por marca
            return textMatch && rubroMatch && segmentoMatch && marcaMatch;
        });

        const sortFunction = await window.getGlobalProductSortFunction();
        productosFiltrados.sort(sortFunction);

        if (productosFiltrados.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 p-4">No hay productos que coincidan con los filtros seleccionados.</p>`;
            return;
        }

        const isAdmin = _userRole === 'admin';
        const cols = readOnly ? 4 : 5; // Aumentado el número de columnas

        let tableHTML = `
            <table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-200 sticky top-0 z-10">
                    <tr>
                        <th class="py-2 px-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Presentación</th>
                        <th class="py-2 px-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Marca</th> <!-- Nueva Cabecera -->
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
                tableHTML += `<tr><td colspan="${cols}" class="py-2 px-4 bg-gray-300 font-bold text-gray-800 sticky top-[calc(theme(height.10))] z-[9]">${lastHeaderKey}</td></tr>`; // Ajustar colspan
            }

            const ventaPor = p.ventaPor || {und:true};
            const precios = p.precios || {und: p.precioPorUnidad || 0};
            let displayPresentacion = p.presentacion || 'N/A';
            let displayPrecio = '$0.00';
            let displayStock = `${p.cantidadUnidades || 0} Und`;
            let conversionFactorStock = 1;
            let stockUnitType = 'Und';

            // Determinar precio y unidad de stock a mostrar (prioridad: Cj > Paq > Und)
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
            } else { // Venta por Unidad o default
                displayPrecio = `$${(precios.und || 0).toFixed(2)}`;
            }
            displayStock = `${Math.floor((p.cantidadUnidades || 0) / conversionFactorStock)} ${stockUnitType}`;
            const stockUnidadesBaseTitle = `${p.cantidadUnidades || 0} Und. Base`; // Tooltip siempre en unidades

            tableHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="py-2 px-3 text-gray-800">${displayPresentacion}</td>
                    <td class="py-2 px-3 text-gray-700">${p.marca || 'S/M'}</td> <!-- Nueva Celda Marca -->
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


    async function editProducto(productId) {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores pueden editar definiciones.'); return; } const prod = _inventarioCache.find(p => p.id === productId); if (!prod) { _showModal('Error', 'Producto no encontrado en caché.'); return; } if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `<div class="p-4 pt-8"> <div class="container mx-auto max-w-2xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center"> <h2 class="text-2xl font-bold mb-6">Editar Producto</h2> <form id="editProductoForm" class="space-y-4 text-left"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="rubro">Rubro:</label> <div class="flex items-center space-x-2"> <select id="rubro" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('rubros','Rubro')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="segmento">Segmento:</label> <div class="flex items-center space-x-2"> <select id="segmento" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('segmentos','Segmento')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="marca">Marca:</label> <div class="flex items-center space-x-2"> <select id="marca" class="w-full px-4 py-2 border rounded-lg" required></select> <button type="button" onclick="window.inventarioModule.showAddCategoryModal('marcas','Marca')" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600">+</button> </div> </div> <div> <label for="presentacion">Presentación:</label> <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required> </div> </div> <div class="border-t pt-4 mt-4"> <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <div> <label class="block mb-2 font-medium">Venta por:</label> <div id="ventaPorContainer" class="flex space-x-4"> <label class="flex items-center"><input type="checkbox" id="ventaPorUnd" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Und.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorPaq" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Paq.</span></label> <label class="flex items-center"><input type="checkbox" id="ventaPorCj" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2">Cj.</span></label> </div> </div> <div class="mt-4 md:mt-0"> <label class="flex items-center cursor-pointer"> <input type="checkbox" id="manejaVaciosCheck" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"> <span class="ml-2 font-medium">Maneja Vacío</span> </label> <div id="tipoVacioContainer" class="mt-2 hidden"> <label for="tipoVacioSelect" class="block text-sm font-medium">Tipo:</label> <select id="tipoVacioSelect" class="w-full mt-1 px-2 py-1 border rounded-lg text-sm bg-gray-50"> <option value="">Seleccione...</option> <option value="1/4 - 1/3">1/4 - 1/3</option> <option value="ret 350 ml">Ret 350 ml</option> <option value="ret 1.25 Lts">Ret 1.25 Lts</option> </select> </div> </div> </div> <div id="empaquesContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"></div> <div id="preciosContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div> </div> <div class="border-t pt-4 mt-4"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label for="cantidadActual" class="block font-medium">Stock Actual (Und. Base):</label> <input type="number" id="cantidadActual" value="${prod.cantidadUnidades||0}" class="w-full mt-1 px-4 py-2 border rounded-lg bg-gray-100 text-gray-700" readonly title="La cantidad se modifica en 'Ajuste Masivo'"> <p class="text-xs text-gray-500 mt-1">Modificar en "Ajuste Masivo".</p> </div> <div> <label for="ivaTipo" class="block font-medium">IVA:</label> <select id="ivaTipo" class="w-full mt-1 px-4 py-2 border rounded-lg bg-white" required> <option value="16">16%</option> <option value="0">Exento 0%</option> </select> </div> </div> </div> <button type="submit" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition duration-150">Guardar Cambios y Propagar</button> </form> <button id="backToModifyDeleteBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-150">Volver</button> </div> </div> </div>`;

        // Poblar dropdowns y esperar a que terminen antes de setear valores
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

        // Función para actualizar inputs dinámicos (empaques, precios)
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

            // Asegurar que al menos un precio sea requerido si su checkbox está marcado
             preciosContainer.querySelectorAll('input[type="number"]').forEach(input => {
                 const type = input.id.substring(6).toLowerCase(); // 'und', 'paq', 'cj'
                 input.required = document.getElementById(`ventaPor${type.charAt(0).toUpperCase() + type.slice(1)}`)?.checked ?? false;
             });
        };

        // Listener para checkbox de vacío
        manejaVaciosCheck.addEventListener('change',()=>{
            if(manejaVaciosCheck.checked){
                tipoVacioContainer.classList.remove('hidden');
                tipoVacioSelect.required = true;
            } else {
                tipoVacioContainer.classList.add('hidden');
                tipoVacioSelect.required = false;
                tipoVacioSelect.value = ''; // Limpiar selección
            }
        });

        // Listener para checkboxes de 'Venta por'
        ventaPorContainer.addEventListener('change', updateDynamicInputs);

        // Setear valores iniciales del formulario (después de poblar dropdowns)
        document.getElementById('presentacion').value = prod.presentacion || '';
        document.getElementById('ivaTipo').value = prod.iva !== undefined ? prod.iva : 16;
        // Checkboxes 'Venta por'
        const ventaPor = prod.ventaPor || { und: true }; // Default a Und si no existe
        document.getElementById('ventaPorUnd').checked = ventaPor.und || false;
        document.getElementById('ventaPorPaq').checked = ventaPor.paq || false;
        document.getElementById('ventaPorCj').checked = ventaPor.cj || false;
        // Disparar update inicial para mostrar campos correctos
        updateDynamicInputs();
        // Setear valores de empaque y precios (ahora que los inputs existen)
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
        // Checkbox de vacío y tipo
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

        // Listeners finales
        document.getElementById('editProductoForm').addEventListener('submit', (e) => handleUpdateProducto(e, productId));
        document.getElementById('backToModifyDeleteBtn').addEventListener('click', showModifyDeleteView);
    }


    async function handleUpdateProducto(e, productId) {
        e.preventDefault(); if (_userRole !== 'admin') return; const updatedData = getProductoDataFromForm(true); const productoOriginal = _inventarioCache.find(p => p.id === productId); if (!productoOriginal) { _showModal('Error', 'Producto original no encontrado.'); return; } // Validaciones básicas (campos requeridos, forma de venta, precio, vacío)
        if (!updatedData.rubro||!updatedData.segmento||!updatedData.marca||!updatedData.presentacion){_showModal('Error','Completa Rubro, Segmento, Marca y Presentación.');return;} if (!updatedData.ventaPor.und&&!updatedData.ventaPor.paq&&!updatedData.ventaPor.cj){_showModal('Error','Selecciona al menos una forma de venta.');return;} if (updatedData.manejaVacios&&!updatedData.tipoVacio){_showModal('Error','Si maneja vacío, selecciona el tipo.');document.getElementById('tipoVacioSelect')?.focus();return;} let precioValido=(updatedData.ventaPor.und&&updatedData.precios.und>0)||(updatedData.ventaPor.paq&&updatedData.precios.paq>0)||(updatedData.ventaPor.cj&&updatedData.precios.cj>0); if(!precioValido){_showModal('Error','Ingresa al menos un precio válido (> 0) para la forma de venta seleccionada.');document.querySelector('#preciosContainer input[required]')?.focus();return;}
        // Mantener cantidad original
        updatedData.cantidadUnidades = productoOriginal.cantidadUnidades || 0;
        _showModal('Progreso','Guardando cambios...'); try { await _setDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId), updatedData); if (window.adminModule?.propagateProductChange) { _showModal('Progreso','Propagando cambios...'); await window.adminModule.propagateProductChange(productId, updatedData); } _showModal('Éxito','Producto modificado y propagado correctamente.'); showModifyDeleteView(); } catch (err) { console.error("Error modificando producto:", err); _showModal('Error',`Ocurrió un error al guardar: ${err.message}`); }
    }


    function deleteProducto(productId) {
        if (_userRole !== 'admin') { _showModal('Acceso Denegado', 'Solo administradores.'); return; } const prod = _inventarioCache.find(p => p.id === productId); if (!prod) { _showModal('Error', 'Producto no encontrado.'); return; }
        _showModal('Confirmar Eliminación', `¿Estás seguro de eliminar el producto "${prod.presentacion}"? Esta acción se propagará a todos los usuarios y es IRREVERSIBLE.`, async () => { _showModal('Progreso', `Eliminando "${prod.presentacion}"...`); try { await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId)); if (window.adminModule?.propagateProductChange) { _showModal('Progreso', `Propagando eliminación...`); await window.adminModule.propagateProductChange(productId, null); } _showModal('Éxito',`Producto "${prod.presentacion}" eliminado y propagado.`); } catch (e) { console.error("Error eliminando producto:", e); _showModal('Error', `No se pudo eliminar: ${e.message}`); } }, 'Sí, Eliminar', null, true);
    }

    async function handleDeleteAllProductos() {
        if (_userRole !== 'admin') return; _showModal('Confirmación Extrema', `¿Estás SEGURO de eliminar TODOS los productos del inventario? Esta acción es IRREVERSIBLE y se propagará.`, async () => { _showModal('Progreso', 'Eliminando productos locales...'); try { const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const snapshot = await _getDocs(collectionRef); if (snapshot.empty) { _showModal('Aviso', 'No hay productos en el inventario para eliminar.'); return; } const productIds = snapshot.docs.map(d => d.id); const BATCH_LIMIT = 490; let batch = _writeBatch(_db), opsCount = 0, totalDeletedLocally = 0; for (const docSnapshot of snapshot.docs) { batch.delete(docSnapshot.ref); opsCount++; if (opsCount >= BATCH_LIMIT) { await batch.commit(); totalDeletedLocally += opsCount; batch = _writeBatch(_db); opsCount = 0; } } if (opsCount > 0) { await batch.commit(); totalDeletedLocally += opsCount; } _showModal('Progreso', `Se eliminaron ${totalDeletedLocally} productos localmente. Propagando eliminación...`); if (window.adminModule?.propagateProductChange) { let propagationErrors = 0; for (const productId of productIds) { try { await window.adminModule.propagateProductChange(productId, null); } catch (propError) { console.error(`Error propagando eliminación de ${productId}:`, propError); propagationErrors++; } } _showModal(propagationErrors > 0 ? 'Advertencia' : 'Éxito', `Se eliminaron ${totalDeletedLocally} productos.${propagationErrors > 0 ? ` Ocurrieron ${propagationErrors} errores al propagar.` : ' Propagado correctamente.'}`); } else { _showModal('Advertencia', `Se eliminaron ${totalDeletedLocally} productos localmente, pero la función de propagación no está disponible.`); } } catch (error) { console.error("Error al eliminar todos los productos:", error); _showModal('Error', `Hubo un error al eliminar los productos: ${error.message}`); } }, 'Sí, Eliminar Todos', null, true);
    }

    // --- CORRECCIÓN DE SINTAXIS ---
    async function handleDeleteAllDatosMaestros() {
        if (_userRole !== 'admin') return;
        _showModal('Confirmar Borrado Datos Maestros', `¿Eliminar TODOS los Rubros, Segmentos y Marcas que NO estén siendo usados actualmente en el inventario? Esta acción es IRREVERSIBLE y se propagará.`, async () => {
            _showModal('Progreso', 'Verificando uso de datos maestros...');
            try {
                const collectionsToClean = ['rubros', 'segmentos', 'marcas'];
                const itemsToDelete = { rubros: [], segmentos: [], marcas: [] };
                const itemsInUse = { rubros: new Set(), segmentos: new Set(), marcas: new Set() };
                let totalFound = 0, totalToDelete = 0;

                // Verificar uso en el inventario actual
                const inventarioSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
                inventarioSnap.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.rubro) itemsInUse.rubros.add(data.rubro);
                    if (data.segmento) itemsInUse.segmentos.add(data.segmento);
                    if (data.marca) itemsInUse.marcas.add(data.marca);
                });

                // Identificar ítems no usados
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
                    return; // Salir si no hay nada que eliminar
                }

                _showModal('Confirmación Final', `Se eliminarán ${totalToDelete} datos maestros no utilizados (${itemsToDelete.rubros.length} Rubros, ${itemsToDelete.segmentos.length} Segmentos, ${itemsToDelete.marcas.length} Marcas). Esta acción se propagará. ¿Continuar?`, async () => {
                    _showModal('Progreso', `Eliminando ${totalToDelete} datos maestros locales...`);
                    try { // Try interno para eliminación y propagación
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
                        invalidateSegmentOrderCache(); // Limpiar cache local

                    } catch (deletePropError) { // Catch para errores en el try interno
                         console.error("Error durante eliminación/propagación de datos maestros:", deletePropError);
                         _showModal('Error', `Ocurrió un error durante la eliminación/propagación: ${deletePropError.message}`);
                    }
                }, 'Sí, Eliminar No Usados', null, true); // Fin _showModal Confirmación Final

            } catch (error) { // Catch para errores en el try externo (verificación inicial)
                console.error("Error al verificar/eliminar datos maestros:", error);
                _showModal('Error', `Ocurrió un error: ${error.message}`);
            }
        }, 'Sí, Eliminar No Usados', null, true); // Fin _showModal Confirmar Borrado
    }
    // --- FIN CORRECCIÓN DE SINTAXIS ---

    // Exponer funciones públicas necesarias
    window.inventarioModule = {
        editProducto,
        deleteProducto,
        handleDeleteDataItem,
        showAddCategoryModal,
        invalidateSegmentOrderCache // Exponer función para invalidar caché
    };

})();

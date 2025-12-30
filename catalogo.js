(function() {
    // MODIFICADO: Añadida _showModal
    let _db, _userId, _userRole, _appId, _mainContent, _showMainMenu, _collection, _getDocs, _floatingControls, _doc, _setDoc, _getDoc, _showModal;
    let _catalogoTasaCOP = 0;
    let _catalogoMonedaActual = 'USD';
    let _currentRubros = [];
    let _currentBgImage = '';
    let _inventarioCache = [];
    let _marcasCache = [];
    let _productosAgrupadosCache = {};

    let _sortPreferenceCache = null;
    let _rubroOrderMapCache = null;
    let _segmentoOrderMapCache = null;
    const SORT_CONFIG_PATH = 'config/productSortOrder';

    // MODIFICADO: Añadidas _doc, _setDoc, _getDoc, _showModal a las dependencias
    window.initCatalogo = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole; // Necesitamos el rol
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _showMainMenu = dependencies.showMainMenu;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _floatingControls = dependencies.floatingControls;
        _doc = dependencies.doc;
        _setDoc = dependencies.setDoc;
        _getDoc = dependencies.getDoc;
        _showModal = dependencies.showModal; // Asignación añadida
        if (!_floatingControls) {
            console.warn("Catalogo Init Warning: floatingControls no encontrado.");
        }
        if (!_doc || !_setDoc || !_getDoc || !_showModal) { // Verificación añadida
            console.error("Catalogo Init Error: Faltan dependencias Firestore/UI (_doc, _setDoc, _getDoc, _showModal).");
         }
    };

    // MODIFICADO: Botón "Configurar Orden" solo para admin
    window.showCatalogoSubMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        document.body.classList.remove('catalogo-active');
        document.body.style.removeProperty('--catalogo-bg-image');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Catálogo de Productos</h1>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button data-rubros='["CERVECERIA Y VINOS"]' data-bg="images/cervezayvinos.png" class="catalogo-btn w-full px-6 py-3 bg-yellow-500 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition duration-200">Cerveza y Vinos</button>
                            <button data-rubros='["MALTIN & PEPSI"]' data-bg="images/maltinypepsi.png" class="catalogo-btn w-full px-6 py-3 bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:bg-blue-800 transition duration-200">Maltin y Pepsicola</button>
                            <button data-rubros='["ALIMENTOS"]' data-bg="images/alimentospolar.png" class="catalogo-btn w-full px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 transition duration-200">Alimentos Polar</button>
                            <button data-rubros='["P&G"]' data-bg="images/p&g.png" class="catalogo-btn w-full px-6 py-3 bg-sky-500 text-white font-semibold rounded-lg shadow-md hover:bg-sky-600 transition duration-200">Procter & Gamble</button>
                            <button data-rubros='[]' data-bg="" class="catalogo-btn md:col-span-2 w-full px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 transition duration-200">Unificado (Todos)</button>
                        </div>
                        <!-- MODIFICADO: Botón condicional -->
                        ${_userRole === 'admin' ? `
                        <button id="configSortBtn" class="mt-4 w-full px-6 py-3 bg-purple-500 text-white font-semibold rounded-lg shadow-md hover:bg-purple-600 transition duration-200">Configurar Orden Productos</button>
                        ` : ''}
                        <button id="backToMenuBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-200">Volver al Menú</button>
                    </div>
                </div>
            </div>
        `;
        document.querySelectorAll('.catalogo-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                 try { _currentRubros = JSON.parse(e.target.dataset.rubros || '[]'); }
                 catch (parseError) { console.error("Error parsing rubros:", parseError); _currentRubros = []; }
                const title = e.target.textContent.trim(); const bgImage = e.target.dataset.bg || '';
                showCatalogoView(title, bgImage);
            });
        });
        // MODIFICADO: Listener condicional
        if (_userRole === 'admin') {
            document.getElementById('configSortBtn')?.addEventListener('click', showProductSortConfigView);
        }
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    // MODIFICADO: Verificación de rol al inicio
    async function showProductSortConfigView() {
        // --- NUEVO: Verificar rol ---
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Esta función es solo para administradores.');
            _showMainMenu(); // Redirigir al menú principal
            return;
        }
        // --- FIN NUEVO ---

        if (_floatingControls) _floatingControls.classList.add('hidden');
        document.body.classList.remove('catalogo-active');

        const availableCriteria = { rubro: 'Rubro', segmento: 'Segmento', marca: 'Marca', presentacion: 'Presentación' };

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Configurar Orden de Productos</h2>
                        <p class="text-center text-gray-600 mb-6">Arrastra criterios para definir prioridad (Catálogo, Inventario, Ventas).</p>
                        <ul id="sort-criteria-list" class="space-y-2 border rounded-lg p-4 mb-6 bg-gray-50">
                            <p class="text-gray-500 text-center">Cargando...</p>
                        </ul>
                        <div class="space-y-4">
                            <button id="saveSortBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Orden</button>
                            <button id="backToCatalogoMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Catálogo</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('saveSortBtn').addEventListener('click', handleSaveSortPreference);
        document.getElementById('backToCatalogoMenuBtn').addEventListener('click', showCatalogoSubMenu);

        const sortListContainer = document.getElementById('sort-criteria-list');
        try {
            const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/${SORT_CONFIG_PATH}`);
            const docSnap = await _getDoc(docRef);
            let currentOrder = ['segmento', 'marca', 'presentacion', 'rubro']; // Default completo
            if (docSnap.exists() && docSnap.data().order) {
                currentOrder = docSnap.data().order;
                const savedCriteriaSet = new Set(currentOrder); const availableKeys = Object.keys(availableCriteria);
                if (currentOrder.length !== availableKeys.length || !availableKeys.every(key => savedCriteriaSet.has(key))) {
                     console.warn("Orden guardado inválido, usando default.");
                     currentOrder = ['segmento', 'marca', 'presentacion', 'rubro'];
                }
            } else { console.log("No sort preference found, using default."); currentOrder = ['segmento', 'marca', 'presentacion', 'rubro']; }

            sortListContainer.innerHTML = '';
            currentOrder.forEach(key => { if (availableCriteria[key]) { const li=document.createElement('li'); li.dataset.key=key; li.className='p-3 bg-gray-100 rounded shadow-sm cursor-grab active:cursor-grabbing hover:bg-gray-200'; li.textContent=availableCriteria[key]; li.draggable=true; sortListContainer.appendChild(li); } });
            Object.keys(availableCriteria).forEach(key => { if (!currentOrder.includes(key)) { const li=document.createElement('li'); li.dataset.key=key; li.className='p-3 bg-gray-100 rounded shadow-sm cursor-grab active:cursor-grabbing hover:bg-gray-200'; li.textContent=availableCriteria[key]; li.draggable=true; sortListContainer.appendChild(li); } });

            addDragAndDropHandlersSort(sortListContainer);
        } catch (error) { console.error("Error cargando orden:", error); sortListContainer.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; }
    }

    async function handleSaveSortPreference() {
        const listItems = document.querySelectorAll('#sort-criteria-list li');
        if (listItems.length === 0) { _showModal('Error', 'No se pudieron leer criterios.'); return; }
        const newOrder = Array.from(listItems).map(li => li.dataset.key);

        _showModal('Progreso', 'Guardando preferencia...'); // Ahora _showModal está definida
        try {
            const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/${SORT_CONFIG_PATH}`);
            await _setDoc(docRef, { order: newOrder });
            _sortPreferenceCache = null; _rubroOrderMapCache = null; _segmentoOrderMapCache = null;
            _showModal('Éxito', 'Preferencia guardada.');
            showCatalogoSubMenu();
        } catch (error) { console.error("Error guardando:", error); _showModal('Error', `No se pudo guardar: ${error.message}`); }
    }

    function addDragAndDropHandlersSort(container) {
        let draggedItem = null; let placeholder = null;
        const createPlaceholder = () => { if (!placeholder) { placeholder=document.createElement('li'); placeholder.style.height='40px'; placeholder.style.background='#e0e7ff'; placeholder.style.border='2px dashed #6366f1'; placeholder.style.borderRadius='0.375rem'; placeholder.style.margin='0.5rem 0'; placeholder.style.listStyleType='none'; } }; createPlaceholder();
        container.addEventListener('dragstart', e => { if (e.target.tagName==='LI'){ draggedItem=e.target; setTimeout(()=>{if(draggedItem)draggedItem.style.opacity='0.5';}, 0);} });
        container.addEventListener('dragend', e => { if(draggedItem)draggedItem.style.opacity='1'; draggedItem=null; if(placeholder&&placeholder.parentNode)placeholder.parentNode.removeChild(placeholder); });
        container.addEventListener('dragover', e => { e.preventDefault(); const after=getDragAfterElementSort(container,e.clientY); if(draggedItem){ if(!placeholder)createPlaceholder(); if(after==null)container.appendChild(placeholder); else container.insertBefore(placeholder, after);} });
        container.addEventListener('drop', e => { e.preventDefault(); if(draggedItem&&placeholder&&placeholder.parentNode){ container.insertBefore(draggedItem, placeholder); draggedItem.style.opacity='1'; } if(placeholder&&placeholder.parentNode)placeholder.parentNode.removeChild(placeholder); draggedItem=null; });
        container.addEventListener('dragleave', e => { if (!container.contains(e.relatedTarget) && placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder); });
        function getDragAfterElementSort(cont, y) { const draggables=[...cont.querySelectorAll('li:not([style*="height: 40px"])')].filter(el=>el!==draggedItem); return draggables.reduce((closest, child)=>{ const box=child.getBoundingClientRect(), offset=y-box.top-box.height/2; if(offset<0&&offset>closest.offset)return {offset:offset,element:child}; else return closest; },{offset:Number.NEGATIVE_INFINITY}).element; }
    }

    window.getGlobalProductSortFunction = async () => {
        if (!_sortPreferenceCache) {
            try { const dRef=_doc(_db, `artifacts/${_appId}/users/${_userId}/${SORT_CONFIG_PATH}`); const dSnap=await _getDoc(dRef); if(dSnap.exists()&&dSnap.data().order){ _sortPreferenceCache=dSnap.data().order; const expKeys=new Set(['rubro','segmento','marca','presentacion']); if(_sortPreferenceCache.length!==expKeys.size||!_sortPreferenceCache.every(k=>expKeys.has(k))){console.warn("Orden inválido, usando default."); _sortPreferenceCache=['segmento','marca','presentacion','rubro'];} } else {_sortPreferenceCache=['segmento','marca','presentacion','rubro'];} }
            catch (error) { console.error("Error cargando pref orden:", error); _sortPreferenceCache=['segmento','marca','presentacion','rubro']; }
        }
        if (!_rubroOrderMapCache) { _rubroOrderMapCache={}; try { const rRef=_collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`); const snap=await _getDocs(rRef); snap.docs.forEach(d=>{const data=d.data(); _rubroOrderMapCache[data.name]=data.orden??9999;}); } catch (e) { console.warn("No se pudo obtener orden rubros.", e); } }
        if (!_segmentoOrderMapCache) { _segmentoOrderMapCache={}; try { const sRef=_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`); const snap=await _getDocs(sRef); snap.docs.forEach(d=>{const data=d.data(); _segmentoOrderMapCache[data.name]=data.orden??9999;}); } catch (e) { console.warn("No se pudo obtener orden segmentos.", e); } }

        return (a, b) => {
            for (const key of _sortPreferenceCache) { let valA, valB, compRes = 0;
                switch (key) {
                    case 'rubro': valA=_rubroOrderMapCache[a.rubro]??9999; valB=_rubroOrderMapCache[b.rubro]??9999; compRes=valA-valB; if(compRes===0)compRes=(a.rubro||'').localeCompare(b.rubro||''); break;
                    case 'segmento': valA=_segmentoOrderMapCache[a.segmento]??9999; valB=_segmentoOrderMapCache[b.segmento]??9999; compRes=valA-valB; if(compRes===0)compRes=(a.segmento||'').localeCompare(b.segmento||''); break;
                    case 'marca': valA=a.marca||''; valB=b.marca||''; compRes=valA.localeCompare(valB); break;
                    case 'presentacion': valA=a.presentacion||''; valB=b.presentacion||''; compRes=valA.localeCompare(valB); break;
                } if (compRes !== 0) return compRes;
            } return 0;
        };
    };

    function invalidateGlobalSortCache() {
        _sortPreferenceCache = null; _rubroOrderMapCache = null; _segmentoOrderMapCache = null;
        console.log("Cachés de ordenamiento global invalidadas.");
    }

    function showCatalogoView(title, bgImage) {
        _currentBgImage = bgImage; if (bgImage) { document.body.style.setProperty('--catalogo-bg-image', `url('${bgImage}')`); document.body.classList.add('catalogo-active'); } else { document.body.classList.remove('catalogo-active'); document.body.style.removeProperty('--catalogo-bg-image'); } _catalogoMonedaActual = 'USD';
        if (_floatingControls) _floatingControls.classList.add('hidden'); if (!_mainContent) { console.error("CRITICAL: mainContent no disponible"); alert("Error crítico."); return; }
        _mainContent.innerHTML = `
            <div class="p-4 pt-6 md:pt-8"> <div class="container mx-auto"> <div id="catalogo-container-wrapper" class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 md:p-8 rounded-lg shadow-xl max-h-[calc(100vh-6rem)] overflow-y-auto"> <div id="catalogo-para-imagen"> <h2 class="text-3xl md:text-4xl font-bold mb-2 text-center">${title}</h2> <p class="text-center text-gray-800 mb-1 text-sm md:text-base">DISTRIBUIDORA CASTILLO YAÑEZ C.A</p> <p class="text-center text-gray-700 mb-4 text-xs md:text-base italic">(Precios incluyen IVA)</p> <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4"> <div id="tasa-input-container" class="flex-grow w-full sm:w-auto"> <label for="catalogoTasaCopInput" class="block text-sm font-medium mb-1">Tasa (USD a COP):</label> <input type="number" id="catalogoTasaCopInput" placeholder="Ej: 4000" class="w-full px-3 py-1.5 border rounded-lg text-sm"> </div> </div> <div id="catalogo-content" class="space-y-6"><p class="text-center text-gray-500 p-4">Cargando...</p></div> </div> <div id="catalogo-buttons-container" class="mt-6 text-center space-y-3 sm:space-y-4"> <button id="generateCatalogoImageBtn" class="w-full px-6 py-2.5 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Generar Imagen</button> <button id="backToCatalogoMenuBtn" class="w-full px-6 py-2.5 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button> </div> </div> </div> </div>
        `;
        const tasaInput = document.getElementById('catalogoTasaCopInput'); if (tasaInput) { const savedTasa = localStorage.getItem('tasaCOP'); if (savedTasa) { _catalogoTasaCOP = parseFloat(savedTasa); tasaInput.value = _catalogoTasaCOP; } tasaInput.addEventListener('input', (e) => { _catalogoTasaCOP = parseFloat(e.target.value) || 0; localStorage.setItem('tasaCOP', _catalogoTasaCOP); if (_catalogoMonedaActual === 'COP') renderCatalogo(); }); }
        document.getElementById('backToCatalogoMenuBtn').addEventListener('click', showCatalogoSubMenu); document.getElementById('generateCatalogoImageBtn').addEventListener('click', handleGenerateCatalogoImage); loadAndRenderCatalogo();
    }

    window.toggleCatalogoMoneda = function() {
        if (_catalogoTasaCOP <= 0) { window.showModal('Aviso', 'Ingresa tasa USD a COP válida.'); return; }
        _catalogoMonedaActual = _catalogoMonedaActual === 'USD' ? 'COP' : 'USD'; renderCatalogo();
    };

    async function loadAndRenderCatalogo() {
        const cont = document.getElementById('catalogo-content'); if (!cont) return; cont.innerHTML = `<p class="text-center text-gray-500 p-4">Cargando inventario...</p>`;
        try { const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const snap = await _getDocs(invRef); _inventarioCache = snap.docs.map(d => ({id: d.id, ...d.data()})); await renderCatalogo(); }
        catch (error) { console.error("Error cargando inventario catálogo:", error); cont.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; }
    }

    async function renderCatalogo() {
        const cont = document.getElementById('catalogo-content'); if (!cont) { console.error("Container no encontrado."); return; } cont.innerHTML = `<p class="text-center text-gray-500 p-4">Ordenando...</p>`;
        try { let prods = [..._inventarioCache]; if (_currentRubros?.length > 0) prods = prods.filter(p => p.rubro && _currentRubros.includes(p.rubro));
            const sortFunc = await window.getGlobalProductSortFunction(); prods.sort(sortFunc);
            if (prods.length === 0) { cont.innerHTML = `<p class="text-center text-gray-500 p-4">No hay productos ${ _currentRubros.length>0?'en categoría':''}.</p>`; _marcasCache = []; _productosAgrupadosCache = {}; return; }
            const pAgrupados = prods.reduce((acc, p) => { const m = p.marca || 'Sin Marca'; if (!acc[m]) acc[m] = []; acc[m].push(p); return acc; }, {}); const mOrdenadas = [...new Set(prods.map(p => p.marca || 'Sin Marca'))];
            _marcasCache = mOrdenadas; _productosAgrupadosCache = pAgrupados;
            
            // --- MODIFICACIÓN: Reducido space-y-3 a space-y-2 ---
            let html = '<div class="space-y-2">'; 
            const monLabel = _catalogoMonedaActual === 'COP' ? 'PRECIO (COP)' : 'PRECIO (USD)';
            
            mOrdenadas.forEach(marca => { 
                // --- MODIFICACIÓN: Reducido text-lg a text-base ---
                html += `<table class="min-w-full bg-transparent text-sm"> 
                            <thead class="text-black"> 
                                <!-- MODIFICACIÓN: Reducido py-1.5 a py-1, md:text-lg a md:text-base -->
                                <tr><th colspan="2" class="py-1 px-2 md:px-4 bg-gray-100 font-bold text-left text-base rounded-t-lg">${marca}</th></tr> 
                                <!-- MODIFICACIÓN: Reducido py-1 a py-0.5, md:text-sm a text-xs -->
                                <tr> 
                                    <th class="py-0.5 px-2 md:px-4 text-left font-semibold text-xs border-b border-gray-300">PRESENTACIÓN (Segmento)</th> 
                                    <th class="py-0.5 px-2 md:px-4 text-right font-semibold text-xs border-b border-gray-300 price-toggle" onclick="window.toggleCatalogoMoneda()" title="Clic para cambiar">${monLabel} <span class="text-xs">⇆</span></th> 
                                </tr> 
                            </thead> 
                            <tbody>`;
                const prodsMarca = pAgrupados[marca] || []; 
                prodsMarca.forEach(p => { 
                    const vPor=p.ventaPor||{und:true}; const precios=p.precios||{und:p.precioPorUnidad||0}; let pBaseUSD=0, dPres=`${p.presentacion||'N/A'}`, uInfo=''; 
                    if(vPor.cj&&precios.cj>0){pBaseUSD=precios.cj;uInfo=`(Cj/${p.unidadesPorCaja||1} und)`;}
                    else if(vPor.paq&&precios.paq>0){pBaseUSD=precios.paq;uInfo=`(Paq/${p.unidadesPorPaquete||1} und)`;}
                    else{pBaseUSD=precios.und||0;uInfo=`(Und)`;} 
                    let pMostrado; 
                    if(_catalogoMonedaActual==='COP'&&_catalogoTasaCOP>0){pMostrado=`COP ${(Math.ceil((pBaseUSD*_catalogoTasaCOP)/100)*100).toLocaleString('es-CO')}`; }
                    else{pMostrado=`$${pBaseUSD.toFixed(2)}`;} 
                    const sDisp=p.segmento?`<span class="text-xs text-gray-500 ml-1">(${p.segmento})</span>`:''; 
                    
                    // --- MODIFICACIÓN: py-1 md:py-1 a py-0.5 px-2 ---
                    html+=`<tr class="border-b last:border-b-0">
                                <td class="py-0.5 px-2 align-top">
                                    ${dPres} ${sDisp} 
                                    ${uInfo?`<span class="inline-block ml-2 text-xs text-gray-500">${uInfo}</span>`:''}
                                </td>
                                <td class="py-0.5 px-2 text-right font-semibold align-top">${pMostrado}</td>
                           </tr>`; 
                }); 
                html += `</tbody></table>`; 
            }); 
            html += '</div>'; 
            cont.innerHTML = html;
        } catch (error) { console.error("Error render catálogo:", error); cont.innerHTML = `<p class="text-red-500">Error al mostrar.</p>`; }
    }

    async function handleGenerateCatalogoImage() {
        // --- MODIFICACIÓN: Aumentado MAX_BRANDS_PER_PAGE de 7 a 8 ---
        const MAX_BRANDS_PER_PAGE = 8; 
        const shareBtn=document.getElementById('generateCatalogoImageBtn'), tasaCont=document.getElementById('tasa-input-container'), btnsCont=document.getElementById('catalogo-buttons-container');
        if (!_marcasCache || _marcasCache.length === 0) { window.showModal('Aviso', 'No hay productos.'); return; }
        
        // --- Pre-cargar imagen de fondo ---
        if (_currentBgImage) {
            _showModal('Progreso', 'Cargando imagen de fondo...');
            try {
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = _currentBgImage;
                });
            } catch (e) {
                console.warn("No se pudo precargar la imagen de fondo, continuando sin ella.", e);
                _currentBgImage = ''; // Resetear si falla la carga
            }
        }
        
        const pages = []; for (let i = 0; i < _marcasCache.length; i += MAX_BRANDS_PER_PAGE) pages.push(_marcasCache.slice(i, i + MAX_BRANDS_PER_PAGE)); const totalP = pages.length;
        if (shareBtn){shareBtn.textContent=`Generando ${totalP} imagen(es)...`; shareBtn.disabled=true;} if (tasaCont)tasaCont.classList.add('hidden'); if (btnsCont)btnsCont.classList.add('hidden'); 
        
        // Ocultar modal de "Cargando..." y mostrar el de "Generando..."
        const progressModal = document.getElementById('modalContainer');
        if(progressModal && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
             progressModal.classList.add('hidden');
        }
        _showModal('Progreso', `Generando ${totalP} página(s)...`);
        
        try { 
            // --- CORRECCIÓN: Definir 'title' aquí ---
            const titleEl=document.querySelector('#catalogo-para-imagen h2');
            const title=titleEl?titleEl.textContent.trim():'Catálogo';

            const imgFiles = await Promise.all(pages.map(async (brandsPage, idx) => { 
                const pNum=idx+1; 
                // --- MODIFICACIÓN: Reducido space-y-2 a space-y-1 ---
                let contHtml='<div class="space-y-1">'; 
                const monLabel=_catalogoMonedaActual==='COP'?'PRECIO (COP)':'PRECIO (USD)'; 
                brandsPage.forEach(marca=>{
                    // --- MODIFICACIÓN: Reducido text-base a text-sm ---
                    contHtml+=`<table class="min-w-full bg-transparent text-sm"> 
                                <thead class="text-black"> 
                                    <!-- MODIFICACIÓN: Reducido py-1.5 px-3 a py-1 px-2, text-lg a text-base -->
                                    <tr><th colspan="2" class="py-1 px-2 bg-gray-100 font-bold text-left text-base">${marca}</th></tr> 
                                    <!-- MODIFICACIÓN: Reducido py-1 px-3 a py-0.5 px-2, text-sm a text-xs -->
                                    <tr><th class="py-0.5 px-2 text-left font-semibold text-xs border-b">PRESENTACIÓN (Segmento)</th><th class="py-0.5 px-2 text-right font-semibold text-xs border-b">${monLabel}</th></tr> 
                                </thead><tbody>`; 
                    const prodsMarca=_productosAgrupadosCache[marca]||[]; 
                    prodsMarca.forEach(p=>{ 
                        const vPor=p.ventaPor||{und:true}, precios=p.precios||{und:p.precioPorUnidad||0}; let pBaseUSD=0, dPres=`${p.presentacion||'N/A'}`, uInfo=''; 
                        if(vPor.cj&&precios.cj>0){pBaseUSD=precios.cj;uInfo=`(Cj/${p.unidadesPorCaja||1} und)`;}
                        else if(vPor.paq&&precios.paq>0){pBaseUSD=precios.paq;uInfo=`(Paq/${p.unidadesPorPaquete||1} und)`;}
                        else{pBaseUSD=precios.und||0;uInfo=`(Und)`;} 
                        let pMostrado=_catalogoMonedaActual==='COP'&&_catalogoTasaCOP>0?`COP ${(Math.ceil((pBaseUSD*_catalogoTasaCOP)/100)*100).toLocaleString('es-CO')}`:`$${pBaseUSD.toFixed(2)}`; 
                        const sDisp=p.segmento?`<span class="text-xs ml-1">(${p.segmento})</span>`:''; 
                        
                        // --- MODIFICACIÓN: Reducido py-1 px-3 a py-0.5 px-2 ---
                        contHtml+=`<tr class="border-b last:border-b-0">
                                        <td class="py-0.5 px-2 align-top">
                                            ${dPres} ${sDisp} 
                                            ${uInfo?`<span class="inline-block ml-2 text-xs text-gray-600">${uInfo}</span>`:''}
                                        </td>
                                        <td class="py-0.5 px-2 text-right font-semibold align-top">${pMostrado}</td>
                                   </tr>`; 
                    }); 
                    contHtml+=`</tbody></table>`;
                }); 
                contHtml+='</div>'; 
                
                // --- CORRECCIÓN: 'title' ya está definido afuera ---
                // const titleEl=document.querySelector('#catalogo-para-imagen h2'); const title=titleEl?titleEl.textContent.trim():'Catálogo';
                
                // --- MODIFICACIÓN: Reducido p-6 a p-4, text-3xl a text-2xl, mb-2 a mb-1 ---
                const fPageHtml = `<div class="bg-white p-4" style="width: 800px; box-shadow: none; border: 1px solid #eee;"> 
                                    <h2 class="text-2xl font-bold mb-1 text-center">${title}</h2> 
                                    <p class="text-center mb-0.5 text-xs">DISTRIBUIDORA CASTILLO YAÑEZ C.A</p> 
                                    <p class="text-center mb-1 text-xs italic">(Precios incluyen IVA)</p> 
                                    ${contHtml} 
                                    <p class="text-center mt-2 text-xs">Página ${pNum} de ${totalP}</p> 
                                  </div>`;
                                  
                const tempDiv=document.createElement('div'); tempDiv.style.position='absolute'; tempDiv.style.left='-9999px'; tempDiv.style.top='0'; tempDiv.innerHTML=fPageHtml; document.body.appendChild(tempDiv); const pWrap=tempDiv.firstElementChild; 
                
                if(_currentBgImage){
                    pWrap.style.backgroundImage=`linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url('${_currentBgImage}')`; 
                    pWrap.style.backgroundSize='cover'; 
                    pWrap.style.backgroundPosition='center';
                }
                
                // --- Pequeña pausa para asegurar renderizado de fondo ---
                await new Promise(resolve => setTimeout(resolve, 50)); 
                
                // --- MODIFICACIÓN: Reducido scale de 3 a 1.5, cambiado a image/jpeg y calidad 0.8 ---
                const canvasOpts = { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: _currentBgImage ? null : '#FFFFFF' }; 
                const canvas = await html2canvas(pWrap, canvasOpts); 
                const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8)); 
                
                document.body.removeChild(tempDiv); 
                const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase(); 
                // --- MODIFICACIÓN: Cambiado a .jpeg ---
                return new File([blob], `catalogo_${safeTitle}_p${pNum}.jpeg`, { type: "image/jpeg" }); 
            })); 
            
            const modalCont = document.getElementById('modalContainer'); if(modalCont) modalCont.classList.add('hidden');
            
            // --- Lógica de compartir "híbrida" (Intenta todo, si falla, muestra Plan B) ---
            try {
                // Intento 1: Compartir todos los archivos
                console.log(`Intentando compartir ${imgFiles.length} archivos...`);
                // --- MODIFICACIÓN: Eliminada la comprobación navigator.canShare ---
                // --- CORRECCIÓN: 'title' ahora está definido ---
                await navigator.share({ files: imgFiles, title: `Catálogo: ${title}`, text: `Catálogo (${title}) - ${totalP} páginas` });
                // Si llega aquí, tuvo éxito
                
            } catch (shareErr) {
                console.warn("Error al compartir todos los archivos:", shareErr.name, shareErr.message);
                
                // --- MODIFICACIÓN: Ya no se muestra el Plan B ---
                // Si el error NO fue "AbortError" (cancelado por el usuario), mostrar error simple
                if (shareErr.name !== 'AbortError') {
                    _showModal('Error al Compartir', 'No se pudieron compartir las imágenes. Es posible que el navegador no lo soporte o los archivos sean muy grandes.');
                }
            }
            // --- Fin lógica ---

        } catch (error) { 
            console.error("Error generando imagen del catálogo: ", error); 
            _showModal('Error Grave', `Error al generar: ${error.message || error}`); 
        } finally { 
            if(shareBtn){shareBtn.textContent='Generar Imagen'; shareBtn.disabled=false;} 
            if(tasaCont)tasaCont.classList.remove('hidden'); 
            if(btnsCont)btnsCont.classList.remove('hidden'); 
            const modalCont=document.getElementById('modalContainer'); 
            if(modalCont && !modalCont.classList.contains('hidden') && modalCont.querySelector('h3')?.textContent.startsWith('Progreso')) modalCont.classList.add('hidden'); 
        }
    }
    
    // Exponer función para invalidar la caché
    window.catalogoModule = {
        invalidateCache: invalidateGlobalSortCache
    };

})();

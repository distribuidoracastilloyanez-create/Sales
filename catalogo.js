(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _showMainMenu, _collection, _getDocs, _floatingControls, _doc, _setDoc, _getDoc, _showModal, _onSnapshot;
    
    // --- VARIABLES FASE 2 ---
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    
    let _masterCatalogCache = {}; 
    let _userStockCache = {};     
    let _inventarioCache = []; // Cache fusionada (Vista)

    let _catalogoTasaCOP = 0;
    let _catalogoMonedaActual = 'USD';
    let _currentRubros = [];
    let _currentBgImage = '';
    
    let _marcasCache = [];
    let _productosAgrupadosCache = {};
    
    // Control de listeners
    let _listenersUnsubscribes = [];

    window.initCatalogo = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _showMainMenu = dependencies.showMainMenu;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _floatingControls = dependencies.floatingControls;
        _doc = dependencies.doc;
        _setDoc = dependencies.setDoc;
        _getDoc = dependencies.getDoc;
        _showModal = dependencies.showModal;
        _onSnapshot = dependencies.onSnapshot;

        if (!_floatingControls) console.warn("Catalogo Init Warning: floatingControls no encontrado.");
        if (!_doc || !_setDoc || !_getDoc || !_showModal || !_onSnapshot) {
            console.error("Catalogo Init Error: Faltan dependencias críticas.");
        }
        console.log("Módulo Catálogo (Alineado con Coordenadas) inicializado. Public ID:", PUBLIC_DATA_ID);
    };

    window.showCatalogoSubMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        document.body.classList.remove('catalogo-active');
        document.body.style.removeProperty('--catalogo-bg-image');
        
        // Limpieza de listeners al volver al menú
        _listenersUnsubscribes.forEach(u => u());
        _listenersUnsubscribes = [];

        // NOTA ARQUITECTÓNICA: Se eliminó el botón "Configurar Orden" ya que ahora
        // el orden se maneja de forma absoluta visualmente desde el menú de Inventario.
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
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    // ==============================================================================
    // --- MOTOR DE ORDENAMIENTO (SINCRONIZADO CON INVENTARIO.JS) ---
    // ==============================================================================
    window.getGlobalProductSortFunction = async () => {
        return (a, b) => {
            // 1. Nivel Rubro: Siempre alfabético para que los rubros no se mezclen.
            const rStrA = (a.rubro || 'SIN RUBRO').toUpperCase();
            const rStrB = (b.rubro || 'SIN RUBRO').toUpperCase();
            if (rStrA !== rStrB) return rStrA.localeCompare(rStrB);

            // 2. Nivel Segmento: Por Coordenada visual, si no existe (9999), por orden alfabético estricto.
            const sOrdA = a.ordenSegmento ?? 9999;
            const sOrdB = b.ordenSegmento ?? 9999;
            if (sOrdA !== sOrdB) return sOrdA - sOrdB;
            const sStrA = (a.segmento || 'SIN SEGMENTO').toUpperCase();
            const sStrB = (b.segmento || 'SIN SEGMENTO').toUpperCase();
            if (sStrA !== sStrB) return sStrA.localeCompare(sStrB);

            // 3. Nivel Marca: Por Coordenada visual, luego alfabético.
            const mOrdA = a.ordenMarca ?? 9999;
            const mOrdB = b.ordenMarca ?? 9999;
            if (mOrdA !== mOrdB) return mOrdA - mOrdB;
            const mStrA = (a.marca || 'S/M').toUpperCase();
            const mStrB = (b.marca || 'S/M').toUpperCase();
            if (mStrA !== mStrB) return mStrA.localeCompare(mStrB);

            // 4. Nivel Producto: Por Coordenada visual, luego por nombre.
            const pOrdA = a.ordenProducto ?? 9999;
            const pOrdB = b.ordenProducto ?? 9999;
            if (pOrdA !== pOrdB) return pOrdA - pOrdB;
            const pStrA = (a.presentacion || '').toUpperCase();
            const pStrB = (b.presentacion || '').toUpperCase();
            return pStrA.localeCompare(pStrB);
        };
    };

    function showCatalogoView(title, bgImage) {
        _currentBgImage = bgImage; if (bgImage) { document.body.style.setProperty('--catalogo-bg-image', `url('${bgImage}')`); document.body.classList.add('catalogo-active'); } else { document.body.classList.remove('catalogo-active'); document.body.style.removeProperty('--catalogo-bg-image'); } _catalogoMonedaActual = 'USD';
        if (_floatingControls) _floatingControls.classList.add('hidden'); if (!_mainContent) { console.error("CRITICAL: mainContent no disponible"); alert("Error crítico."); return; }
        _mainContent.innerHTML = `
            <div class="p-4 pt-6 md:pt-8"> <div class="container mx-auto"> <div id="catalogo-container-wrapper" class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 md:p-8 rounded-lg shadow-xl max-h-[calc(100vh-6rem)] overflow-y-auto"> <div id="catalogo-para-imagen"> <h2 class="text-3xl md:text-4xl font-bold mb-2 text-center">${title}</h2> <p class="text-center text-gray-800 mb-1 text-sm md:text-base">DISTRIBUIDORA CASTILLO YAÑEZ C.A</p> <p class="text-center text-gray-700 mb-4 text-xs md:text-base italic">(Precios incluyen IVA)</p> <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4"> <div id="tasa-input-container" class="flex-grow w-full sm:w-auto"> <label for="catalogoTasaCopInput" class="block text-sm font-medium mb-1">Tasa (USD a COP):</label> <input type="number" id="catalogoTasaCopInput" placeholder="Ej: 4000" class="w-full px-3 py-1.5 border rounded-lg text-sm"> </div> </div> <div id="catalogo-content" class="space-y-6"><p class="text-center text-gray-500 p-4">Cargando...</p></div> </div> <div id="catalogo-buttons-container" class="mt-6 text-center space-y-3 sm:space-y-4"> <button id="generateCatalogoImageBtn" class="w-full px-6 py-2.5 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Generar Imagen</button> <button id="backToCatalogoMenuBtn" class="w-full px-6 py-2.5 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button> </div> </div> </div> </div>
        `;
        const tasaInput = document.getElementById('catalogoTasaCopInput'); if (tasaInput) { const savedTasa = localStorage.getItem('tasaCOP'); if (savedTasa) { _catalogoTasaCOP = parseFloat(savedTasa); tasaInput.value = _catalogoTasaCOP; } tasaInput.addEventListener('input', (e) => { _catalogoTasaCOP = parseFloat(e.target.value) || 0; localStorage.setItem('tasaCOP', _catalogoTasaCOP); if (_catalogoMonedaActual === 'COP') renderCatalogo(); }); }
        document.getElementById('backToCatalogoMenuBtn').addEventListener('click', showCatalogoSubMenu); document.getElementById('generateCatalogoImageBtn').addEventListener('click', handleGenerateCatalogoImage); 
        
        // FASE 2: Iniciar Listeners Híbridos
        startHybridCatalogListener();
    }

    window.toggleCatalogoMoneda = function() {
        if (_catalogoTasaCOP <= 0) { window.showModal('Aviso', 'Ingresa tasa USD a COP válida.'); return; }
        _catalogoMonedaActual = _catalogoMonedaActual === 'USD' ? 'COP' : 'USD'; renderCatalogo();
    };

    async function startHybridCatalogListener() {
        const cont = document.getElementById('catalogo-content'); if (cont) cont.innerHTML = `<p class="text-center text-gray-500 p-4">Sincronizando datos...</p>`;
        
        // 1. Maestro (Público)
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);
        const unsubMaster = _onSnapshot(masterRef, snap => {
            _masterCatalogCache = {};
            snap.forEach(d => { _masterCatalogCache[d.id] = { id: d.id, ...d.data() }; });
            mergeAndRender();
        }, err => console.error("Error Catalogo Maestro:", err));
        _listenersUnsubscribes.push(unsubMaster);

        // 2. Stock (Privado)
        const stockRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubStock = _onSnapshot(stockRef, snap => {
            _userStockCache = {};
            snap.forEach(d => {
                const data = d.data();
                _userStockCache[d.id] = {
                    cantidadUnidades: data.cantidadUnidades || 0,
                    _legacyData: data // Guardamos todo por compatibilidad
                };
            });
            mergeAndRender();
        }, err => console.error("Error Catalogo Stock:", err));
        _listenersUnsubscribes.push(unsubStock);
    }

    function mergeAndRender() {
        _inventarioCache = [];
        const allIds = new Set([...Object.keys(_masterCatalogCache), ...Object.keys(_userStockCache)]);
        
        allIds.forEach(id => {
            const master = _masterCatalogCache[id];
            const stock = _userStockCache[id];
            let item = null;

            if (master) {
                // Producto Fase 2: Definición Maestra + Stock Local
                item = { 
                    ...master, 
                    cantidadUnidades: stock ? (stock.cantidadUnidades || 0) : 0, 
                    id: id 
                };
            } else if (stock && stock._legacyData) {
                // Producto Legacy: Definición Local completa
                item = { ...stock._legacyData, id: id };
            } else if (stock) {
                 // Fallback
                 item = { ...stock, id: id };
            }

            // Filtrar: Solo mostrar si tiene stock positivo
            if (item && (item.cantidadUnidades > 0)) {
                _inventarioCache.push(item);
            }
        });
        
        renderCatalogo();
    }

    async function renderCatalogo() {
        const cont = document.getElementById('catalogo-content'); if (!cont) return;
        try { 
            let prods = [..._inventarioCache]; 
            if (_currentRubros?.length > 0) prods = prods.filter(p => p.rubro && _currentRubros.includes(p.rubro));
            
            const sortFunc = await window.getGlobalProductSortFunction(); prods.sort(sortFunc);
            
            if (prods.length === 0) { cont.innerHTML = `<p class="text-center text-gray-500 p-4">No hay productos con stock en esta categoría.</p>`; _marcasCache = []; _productosAgrupadosCache = {}; return; }
            
            const pAgrupados = prods.reduce((acc, p) => { const m = p.marca || 'Sin Marca'; if (!acc[m]) acc[m] = []; acc[m].push(p); return acc; }, {}); 
            const mOrdenadas = [...new Set(prods.map(p => p.marca || 'Sin Marca'))];
            
            _marcasCache = mOrdenadas; _productosAgrupadosCache = pAgrupados;
            
            let html = '<div class="space-y-2">'; 
            const monLabel = _catalogoMonedaActual === 'COP' ? 'PRECIO (COP)' : 'PRECIO (USD)';
            
            mOrdenadas.forEach(marca => { 
                html += `<table class="min-w-full bg-transparent text-sm"> 
                            <thead class="text-black"> 
                                <tr><th colspan="2" class="py-1 px-2 md:px-4 bg-gray-100 font-bold text-left text-base rounded-t-lg">${marca}</th></tr> 
                                <tr> 
                                    <th class="py-0.5 px-2 md:px-4 text-left font-semibold text-xs border-b border-gray-300">PRESENTACIÓN (Segmento)</th> 
                                    <th class="py-0.5 px-2 md:px-4 text-right font-semibold text-xs border-b border-gray-300 price-toggle" onclick="window.toggleCatalogoMoneda()" title="Clic para cambiar">${monLabel} <span class="text-xs">⇆</span></th> 
                                </tr> 
                            </thead> 
                            <tbody>`;
                const prodsMarca = pAgrupados[marca] || []; 
                prodsMarca.forEach(p => { 
                    const vPor=p.ventaPor||{und:true}, precios=p.precios||{und:p.precioPorUnidad||0}; let pBaseUSD=0, dPres=`${p.presentacion||'N/A'}`, uInfo=''; 
                    if(vPor.cj&&precios.cj>0){pBaseUSD=precios.cj;uInfo=`(Cj/${p.unidadesPorCaja||1} und)`;}
                    else if(vPor.paq&&precios.paq>0){pBaseUSD=precios.paq;uInfo=`(Paq/${p.unidadesPorPaquete||1} und)`;}
                    else{pBaseUSD=precios.und||0;uInfo=`(Und)`;} 
                    let pMostrado; 
                    if(_catalogoMonedaActual==='COP'&&_catalogoTasaCOP>0){pMostrado=`COP ${(Math.ceil((pBaseUSD*_catalogoTasaCOP)/100)*100).toLocaleString('es-CO')}`; }
                    else{pMostrado=`$${pBaseUSD.toFixed(2)}`;} 
                    const sDisp=p.segmento?`<span class="text-xs text-gray-500 ml-1">(${p.segmento})</span>`:''; 
                    
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
        const MAX_BRANDS_PER_PAGE = 8; 
        const shareBtn=document.getElementById('generateCatalogoImageBtn'), tasaCont=document.getElementById('tasa-input-container'), btnsCont=document.getElementById('catalogo-buttons-container');
        if (!_marcasCache || _marcasCache.length === 0) { window.showModal('Aviso', 'No hay productos.'); return; }
        
        // --- Pre-cargar imagen de fondo ---
        if (_currentBgImage) {
            _showModal('Progreso', 'Cargando imagen de fondo...');
            try {
                await new Promise((resolve, reject) => {
                    const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = _currentBgImage;
                });
            } catch (e) {
                console.warn("No se pudo precargar la imagen de fondo, continuando sin ella.", e);
                _currentBgImage = ''; 
            }
        }
        
        const pages = []; for (let i = 0; i < _marcasCache.length; i += MAX_BRANDS_PER_PAGE) pages.push(_marcasCache.slice(i, i + MAX_BRANDS_PER_PAGE)); const totalP = pages.length;
        if (shareBtn){shareBtn.textContent=`Generando ${totalP} imagen(es)...`; shareBtn.disabled=true;} if (tasaCont)tasaCont.classList.add('hidden'); if (btnsCont)btnsCont.classList.add('hidden'); 
        
        const progressModal = document.getElementById('modalContainer');
        if(progressModal && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) { progressModal.classList.add('hidden'); }
        _showModal('Progreso', `Generando ${totalP} página(s)...`);
        
        try { 
            const titleEl=document.querySelector('#catalogo-para-imagen h2');
            const title=titleEl?titleEl.textContent.trim():'Catálogo';

            const imgFiles = await Promise.all(pages.map(async (brandsPage, idx) => { 
                const pNum=idx+1; 
                let contHtml='<div class="space-y-1">'; 
                const monLabel=_catalogoMonedaActual==='COP'?'PRECIO (COP)':'PRECIO (USD)'; 
                brandsPage.forEach(marca=>{
                    contHtml+=`<table class="min-w-full bg-transparent text-sm"> 
                                <thead class="text-black"> 
                                    <tr><th colspan="2" class="py-1 px-2 bg-gray-100 font-bold text-left text-base">${marca}</th></tr> 
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
                
                await new Promise(resolve => setTimeout(resolve, 50)); 
                
                const canvasOpts = { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: _currentBgImage ? null : '#FFFFFF' }; 
                const canvas = await html2canvas(pWrap, canvasOpts); 
                const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8)); 
                
                document.body.removeChild(tempDiv); 
                const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase(); 
                return new File([blob], `catalogo_${safeTitle}_p${pNum}.jpeg`, { type: "image/jpeg" }); 
            })); 
            
            const modalCont = document.getElementById('modalContainer'); if(modalCont) modalCont.classList.add('hidden');
            
            try {
                console.log(`Intentando compartir ${imgFiles.length} archivos...`);
                await navigator.share({ files: imgFiles, title: `Catálogo: ${title}`, text: `Catálogo (${title}) - ${totalP} páginas` });
            } catch (shareErr) {
                console.warn("Error al compartir:", shareErr.name);
                if (shareErr.name !== 'AbortError') {
                    _showModal('Error al Compartir', 'No se pudieron compartir las imágenes. Es posible que el navegador no lo soporte o los archivos sean muy grandes.');
                }
            }

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
    
    window.catalogoModule = {
        invalidateCache: () => {} 
    };

})();

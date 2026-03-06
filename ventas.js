(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _activeListeners;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _deleteDoc, _getDocs, _writeBatch, _runTransaction, _query, _where, _orderBy, _limit;
    let _increment;

    // --- VARIABLES FASE 2 ---
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID; 
    
    let _masterCatalogCache = {}; // Cache del Catálogo Maestro
    let _userStockCache = {};     // Cache del Stock Privado

    let _clientesCache = [];
    let _inventarioCache = []; // Esta será la FUSIÓN de Maestro + Stock
    let _ventasGlobal = [];
    let _ventaActual = { cliente: null, productos: {}, vaciosDevueltosPorTipo: {} };
    let _originalVentaForEdit = null;
    let _tasaCOP = 0;
    let _tasaBs = 0;
    let _monedaActual = 'USD';

    // Usaremos window.TIPOS_VACIO_GLOBAL si existe, o un default
    const TIPOS_VACIO = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    
    window.initVentas = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _activeListeners = dependencies.activeListeners;
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _getDoc = dependencies.getDoc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch;
        _runTransaction = dependencies.runTransaction; 
        _query = dependencies.query;
        _where = dependencies.where;
        _orderBy = dependencies.orderBy;
        _limit = dependencies.limit;
        _increment = dependencies.increment;

        if (!_runTransaction) console.error("Error Crítico: 'runTransaction' no disponible en initVentas.");
        if (!_increment) console.warn("Advertencia: 'increment' no disponible. Ventas offline limitadas.");
        
        console.log("Módulo Ventas inicializado (Con Auto-Healing Silencioso). Public ID:", PUBLIC_DATA_ID);
    };

    window.showVentasView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        if (!window.ventasUI) {
            _mainContent.innerHTML = `<div class="p-8 text-center text-red-600">Error: Módulo de Interfaz (ventas-ui.js) no cargado.</div>`;
            return;
        }

        _mainContent.innerHTML = window.ventasUI.getMainViewTemplate();

        document.getElementById('nuevaVentaBtn').addEventListener('click', showNuevaVentaView);
        document.getElementById('ventasTotalesBtn').addEventListener('click', showVentasTotalesView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    function showNuevaVentaView() {
        _originalVentaForEdit = null;
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _monedaActual = 'USD';
        _ventaActual = { cliente: null, productos: {}, vaciosDevueltosPorTipo: {} };
        TIPOS_VACIO.forEach(tipo => _ventaActual.vaciosDevueltosPorTipo[tipo] = 0);
        
        _mainContent.innerHTML = window.ventasUI.getNewSaleTemplate(TIPOS_VACIO);

        const clienteSearchInput = document.getElementById('clienteSearch');
        clienteSearchInput.addEventListener('input', () => { const term = clienteSearchInput.value.toLowerCase(); const filtered = _clientesCache.filter(c=>(c.nombreComercial||'').toLowerCase().includes(term)||(c.nombrePersonal||'').toLowerCase().includes(term)); renderClienteDropdown(filtered); document.getElementById('clienteDropdown').classList.remove('hidden'); });
        const savedTasa = localStorage.getItem('tasaCOP'); if (savedTasa) { _tasaCOP = parseFloat(savedTasa); document.getElementById('tasaCopInput').value = _tasaCOP; }
        const savedTasaBs = localStorage.getItem('tasaBs'); if (savedTasaBs) { _tasaBs = parseFloat(savedTasaBs); document.getElementById('tasaBsInput').value = _tasaBs; }
        document.getElementById('tasaCopInput').addEventListener('input', (e) => { _tasaCOP = parseFloat(e.target.value) || 0; localStorage.setItem('tasaCOP', _tasaCOP); if (_monedaActual === 'COP') { renderVentasInventario(); updateVentaTotal(); } });
        document.getElementById('tasaBsInput').addEventListener('input', (e) => { _tasaBs = parseFloat(e.target.value) || 0; localStorage.setItem('tasaBs', _tasaBs); if (_monedaActual === 'Bs') { renderVentasInventario(); updateVentaTotal(); } });
        document.getElementById('rubroFilter').addEventListener('change', renderVentasInventario);
        document.getElementById('generarTicketBtn').addEventListener('click', generarTicket); 
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasView);
        loadDataForNewSale();
    }

    function loadDataForNewSale() {
        const clientesRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`);
        const unsubClientes = _onSnapshot(clientesRef, snap => { 
            _clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
        }, err => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') return;
            console.error("Error clientes:", err); 
        });

        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);
        const unsubMaster = _onSnapshot(masterRef, snap => {
            _masterCatalogCache = {};
            snap.forEach(d => { _masterCatalogCache[d.id] = { id: d.id, ...d.data() }; });
            mergeInventarioCache(); 
        }, err => console.error("Error Maestro:", err));

        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubStock = _onSnapshot(inventarioRef, snap => { 
            _userStockCache = {};
            snap.forEach(d => {
                const data = d.data();
                _userStockCache[d.id] = {
                    cantidadUnidades: data.cantidadUnidades || 0,
                    _legacyData: data 
                };
            });
            mergeInventarioCache(); 
        }, err => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') return;
            console.error("Error inventario stock:", err); 
            const b = document.getElementById('inventarioTableBody'); if(b) b.innerHTML = '<tr><td colspan="4" class="text-red-500">Error inventario</td></tr>'; 
        });

        _activeListeners.push(unsubClientes, unsubMaster, unsubStock);
    }

    function mergeInventarioCache() {
        _inventarioCache = [];
        const allIds = new Set([...Object.keys(_masterCatalogCache), ...Object.keys(_userStockCache)]);
        
        allIds.forEach(id => {
            const master = _masterCatalogCache[id];
            const stock = _userStockCache[id];

            if (master) {
                _inventarioCache.push({
                    ...master,
                    cantidadUnidades: stock ? stock.cantidadUnidades : 0,
                    id: id
                });
            } else if (stock && stock._legacyData) {
                _inventarioCache.push({ ...stock._legacyData, id: id });
            }
        });

        populateRubroFilter();
        if (_ventaActual.cliente) renderVentasInventario();
    }

    function populateRubroFilter() {
        const rF = document.getElementById('rubroFilter'); if(!rF) return;
        const rubros = [...new Set(_inventarioCache.map(p => p.rubro))].sort(); const cV = rF.value;
        rF.innerHTML = '<option value="">Todos</option>'; rubros.forEach(r => { if(r) rF.innerHTML += `<option value="${r}">${r}</option>`; }); rF.value = rubros.includes(cV) ? cV : '';
    }

    function renderClienteDropdown(filteredClients) {
        const cD = document.getElementById('clienteDropdown'); if(!cD) return; cD.innerHTML = '';
        filteredClients.forEach(cli => { const i = document.createElement('div'); i.className = 'autocomplete-item'; i.textContent = `${cli.nombreComercial} (${cli.nombrePersonal})`; i.addEventListener('click', () => selectCliente(cli)); cD.appendChild(i); });
    }

    function selectCliente(cliente) {
        _ventaActual.cliente = cliente; 
        
        const searchInput = document.getElementById('clienteSearch');
        if (searchInput) searchInput.blur();

        document.getElementById('client-search-container').classList.add('hidden'); 
        document.getElementById('clienteDropdown').classList.add('hidden');
        document.getElementById('selected-client-name').textContent = cliente.nombreComercial; 
        document.getElementById('client-display-container').classList.remove('hidden');
        
        setTimeout(() => {
            const invContainer = document.getElementById('inventarioTableContainer');
            const footerSection = document.getElementById('venta-footer-section');
            const vaciosSection = document.getElementById('vacios-devueltos-section');
            
            if(invContainer) invContainer.classList.remove('hidden'); 
            if(footerSection) footerSection.classList.remove('hidden'); 
            if(vaciosSection) vaciosSection.classList.remove('hidden');
            
            renderVentasInventario();
        }, 250);
    }

    function toggleMoneda() {
        const cycle = ['USD', 'COP', 'Bs'], rates = { 'USD': 1, 'COP': _tasaCOP, 'Bs': _tasaBs }; let cI = cycle.indexOf(_monedaActual), nI = (cI + 1) % cycle.length;
        while (nI !== cI) { if (rates[cycle[nI]] > 0) { _monedaActual = cycle[nI]; renderVentasInventario(); updateVentaTotal(); return; } nI = (nI + 1) % cycle.length; }
        _showModal('Aviso', (_tasaCOP <= 0 && _tasaBs <= 0) ? 'Ingresa tasas para alternar.' : 'Ingresa tasa válida (> 0).');
    }

    async function renderVentasInventario() {
        const body = document.getElementById('inventarioTableBody'), rF = document.getElementById('rubroFilter'); if (!body || !rF) return; body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">Cargando...</td></tr>`;
        const selRubro = rF.value; const invFilt = _inventarioCache.filter(p => (p.cantidadUnidades || 0) > 0 || _ventaActual.productos[p.id]); let filtInv = selRubro ? invFilt.filter(p => p.rubro === selRubro) : invFilt;
        
        const sortFunc = await window.getGlobalProductSortFunction();
        filtInv.sort(sortFunc);
        
        body.innerHTML = window.ventasUI.getInventoryTableRows(filtInv, _ventaActual.productos, _monedaActual, _tasaCOP, _tasaBs, 'segmento');
        
        updateVentaTotal();
    }

    async function renderEditVentasInventario() {
        const body = document.getElementById('inventarioTableBody'), rF = document.getElementById('rubroFilter'); if (!body || !rF) return; body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">Cargando...</td></tr>`;
        
        const selRubro = rF.value; 
        let invToShow = _inventarioCache.filter(p => _originalVentaForEdit.productos.some(oP => oP.id === p.id) || (p.cantidadUnidades || 0) > 0);
        if (selRubro) invToShow = invToShow.filter(p => p.rubro === selRubro);
        
        const sortFunc = await window.getGlobalProductSortFunction(); 
        invToShow.sort(sortFunc);
        
        const mappedInv = invToShow.map(p => {
             const copy = { ...p };
             const orig = _originalVentaForEdit.productos.find(op => op.id === p.id);
             if (orig) {
                 copy.cantidadUnidades = (copy.cantidadUnidades || 0) + (orig.totalUnidadesVendidas || 0);
             }
             return copy;
        });

        body.innerHTML = window.ventasUI.getInventoryTableRows(mappedInv, _ventaActual.productos, _monedaActual, _tasaCOP, _tasaBs, 'segmento');

        updateVentaTotal();
    }

    function handleQuantityChange(event) {
        const inp=event.target, pId=inp.dataset.productId, tV=inp.dataset.tipoVenta, prod=_inventarioCache.find(p=>p.id===pId); if(!prod) return; if(!_ventaActual.productos[pId]) _ventaActual.productos[pId]={...prod, cantCj:0,cantPaq:0,cantUnd:0,totalUnidadesVendidas:0};
        const qty=parseInt(inp.value,10)||0; _ventaActual.productos[pId][`cant${tV[0].toUpperCase()+tV.slice(1)}`]=qty; const pV=_ventaActual.productos[pId], uCj=pV.unidadesPorCaja||1, uPaq=pV.unidadesPorPaquete||1;
        
        let stockU = prod.cantidadUnidades || 0;
        if (_originalVentaForEdit) {
             const origP = _originalVentaForEdit.productos.find(op => op.id === pId);
             if (origP) stockU += (origP.totalUnidadesVendidas || 0);
        }

        const totU=(pV.cantCj*uCj)+(pV.cantPaq*uPaq)+(pV.cantUnd||0); 
        
        if(totU > stockU){ 
            _showModal('Stock Insuficiente',`Ajustado al máximo disponible.`); 
            let ex=totU-stockU; 
            if(tV==='cj')inp.value=Math.max(0,qty-Math.ceil(ex/uCj)); 
            else if(tV==='paq')inp.value=Math.max(0,qty-Math.ceil(ex/uPaq)); 
            else inp.value=Math.max(0,qty-ex); 
            handleQuantityChange({target:inp}); 
            return; 
        }
        pV.totalUnidadesVendidas=totU; if(totU===0&&pV.cantCj===0&&pV.cantPaq===0&&pV.cantUnd===0) delete _ventaActual.productos[pId]; updateVentaTotal();
    }

    function handleTipoVacioChange(event) { const inp=event.target, tipo=inp.dataset.tipoVacio, cant=parseInt(inp.value,10)||0; if(tipo&&_ventaActual.vaciosDevueltosPorTipo.hasOwnProperty(tipo)) _ventaActual.vaciosDevueltosPorTipo[tipo]=cant; }

    function updateVentaTotal() {
        const tEl=document.getElementById('ventaTotal'); if(!tEl) return;
        const tUSD=Object.values(_ventaActual.productos).reduce((s,p)=>{const pr=p.precios||{und:p.precioPorUnidad||0}; return s+(pr.cj||0)*(p.cantCj||0)+(pr.paq||0)*(p.cantPaq||0)+(pr.und||0)*(p.cantUnd||0);},0);
        if(_monedaActual==='COP'&&_tasaCOP>0)tEl.textContent=`Total: COP ${(Math.ceil((tUSD*_tasaCOP)/100)*100).toLocaleString('es-CO')}`; else if(_monedaActual==='Bs'&&_tasaBs>0)tEl.textContent=`Total: Bs.S ${(tUSD*_tasaBs).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`; else tEl.textContent=`Total: $${tUSD.toFixed(2)}`;
    }

    async function handleShareTicket(htmlContent, callbackDespuesDeCompartir) {
         _showModal('Progreso', 'Generando imagen...', null, '', null, false);
        const tempDiv = document.createElement('div'); tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px'; tempDiv.style.top = '0'; tempDiv.innerHTML = htmlContent; document.body.appendChild(tempDiv);
        const ticketElement = document.getElementById('temp-ticket-for-image');
        if (!ticketElement) { _showModal('Error', 'No se pudo encontrar elemento ticket.'); document.body.removeChild(tempDiv); if(callbackDespuesDeCompartir) callbackDespuesDeCompartir(false); return; }
        try { await new Promise(resolve => setTimeout(resolve, 100)); const canvas = await html2canvas(ticketElement, { scale: 3 }); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (navigator.share && blob) { await navigator.share({ files: [new File([blob], "venta.png", { type: "image/png" })], title: "Ticket de Venta" }); }
            else { _showModal('Error', 'Función compartir no disponible.'); }
            if(callbackDespuesDeCompartir) callbackDespuesDeCompartir(true);
        } catch(e) { _showModal('Error', `No se pudo generar/compartir: ${e.message}`); if(callbackDespuesDeCompartir) callbackDespuesDeCompartir(false); }
        finally { document.body.removeChild(tempDiv); }
    }
    
    async function handleShareRawText(textContent, callbackDespuesDeCompartir) {
        let success = false;
         if (navigator.share) { try { await navigator.share({ title: 'Ticket de Venta', text: textContent }); success = true; } catch (err) { console.warn("Share API error:", err.name); } }
         else { try { legacyCopyToClipboard(textContent, (copySuccess) => { success = copySuccess; }); } catch (copyErr) { console.error('Fallback copy failed:', copyErr); } } 
         setTimeout(() => {
            if (callbackDespuesDeCompartir) callbackDespuesDeCompartir(success);
         }, 100); 
    }
    
    function legacyCopyToClipboard(textContent, callbackDespuesDeCopia) {
        const textArea = document.createElement("textarea"); textArea.value = textContent; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; document.body.appendChild(textArea); textArea.select();
        let success = false;
        try { document.execCommand('copy'); _showModal('Copiado', 'Texto copiado.'); success = true;}
        catch (err) { console.error('Fallback copy failed:', err); _showModal('Error', 'No se pudo copiar el texto.'); success = false;}
        finally { document.body.removeChild(textArea); if(callbackDespuesDeCopia) callbackDespuesDeCopia(success); }
    }
    
    function showSharingOptions(venta, productos, vaciosDevueltosPorTipo, tipo, callbackFinal) {
        const modalContent = `<div class="text-center"><h3 class="text-xl font-bold mb-4">Generar ${tipo}</h3><p class="mb-6">Elige formato.</p><div class="space-y-4"><button id="printTextBtn" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Imprimir (Texto)</button><button id="shareImageBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600">Compartir (Imagen)</button></div></div>`;
        _showModal('Elige opción', modalContent, null, ''); 
        
        setTimeout(() => {
            const printBtn = document.getElementById('printTextBtn');
            const shareBtn = document.getElementById('shareImageBtn');
            
            if (printBtn) {
                printBtn.addEventListener('click', () => { 
                    const rawText = window.ventasUI.getTicketRawText(venta, productos, vaciosDevueltosPorTipo); 
                    handleShareRawText(rawText, callbackFinal); 
                });
            }
            if (shareBtn) {
                shareBtn.addEventListener('click', () => { 
                    const html = window.ventasUI.getTicketHTML(venta, productos, vaciosDevueltosPorTipo, tipo); 
                    handleShareTicket(html, callbackFinal); 
                });
            }
        }, 150);
    }

    async function _processAndSaveVenta() {
        const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
        const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
        try {
            const snapshotDoc = await _getDoc(snapshotRef);
            if (!snapshotDoc.exists()) {
                 if (_inventarioCache && _inventarioCache.length > 0) {
                     await _setDoc(snapshotRef, { inventario: _inventarioCache, fecha: new Date() });
                 }
            }
        } catch (e) { console.warn("Snapshot check failed (non-blocking)", e); }

        const prodsParaGuardar = Object.values(_ventaActual.productos);
        if (prodsParaGuardar.length === 0 && Object.values(_ventaActual.vaciosDevueltosPorTipo).every(v => v === 0)) {
             throw new Error("No hay productos ni vacíos para guardar.");
        }

        const ventaRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
        const clientRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`, _ventaActual.cliente.id);

        const isOffline = !navigator.onLine || localStorage.getItem('manualOfflineMode') === 'true';
        
        if (isOffline) {
            console.log("Modo Offline Detectado: Usando Batch Write");
            if (!_increment) throw new Error("Dependencia 'increment' no disponible para modo offline.");

            const batch = _writeBatch(_db);
            let totalVenta = 0;
            const itemsVenta = [];
            const vaciosChanges = {};

            for (const p of prodsParaGuardar) {
                const stockLocal = p.cantidadUnidades || 0; 
                const qtyNeeded = p.totalUnidadesVendidas || 0;
                
                if (qtyNeeded > 0) {
                    if (stockLocal < qtyNeeded) throw new Error(`Stock insuficiente localmente para: ${p.presentacion}`);
                    const invRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                    batch.update(invRef, { cantidadUnidades: _increment(-qtyNeeded) });
                }

                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                totalVenta += (precios.cj || 0) * (p.cantCj || 0) + (precios.paq || 0) * (p.cantPaq || 0) + (precios.und || 0) * (p.cantUnd || 0);

                if (p.manejaVacios && p.tipoVacio) {
                    const cjV = p.cantCj || 0;
                    if (cjV > 0) vaciosChanges[p.tipoVacio] = (vaciosChanges[p.tipoVacio] || 0) + cjV;
                }

                if (qtyNeeded > 0) {
                    itemsVenta.push({
                        id: p.id, presentacion: p.presentacion, rubro: p.rubro??null, marca: p.marca??null, segmento: p.segmento??null,
                        precios: p.precios, ventaPor: p.ventaPor, unidadesPorPaquete: p.unidadesPorPaquete, unidadesPorCaja: p.unidadesPorCaja,
                        cantidadVendida: { cj: p.cantCj||0, paq: p.cantPaq||0, und: p.cantUnd||0 },
                        totalUnidadesVendidas: p.totalUnidadesVendidas,
                        iva: p.iva??0, manejaVacios: p.manejaVacios||false, tipoVacio: p.tipoVacio||null
                    });
                }
            }

            for (const tV in _ventaActual.vaciosDevueltosPorTipo) {
                const dev = _ventaActual.vaciosDevueltosPorTipo[tV] || 0;
                if (dev > 0) vaciosChanges[tV] = (vaciosChanges[tV] || 0) - dev;
            }

            for (const tV in vaciosChanges) {
                const ch = vaciosChanges[tV];
                if (ch !== 0) {
                    const fieldPath = `saldoVacios.${tV}`;
                    batch.update(clientRef, { [fieldPath]: _increment(ch) });
                }
            }

            const ventaDataToSave = {
                clienteId: _ventaActual.cliente.id,
                clienteNombre: _ventaActual.cliente.nombreComercial || _ventaActual.cliente.nombrePersonal,
                clienteNombrePersonal: _ventaActual.cliente.nombrePersonal,
                fecha: new Date(),
                total: totalVenta,
                productos: itemsVenta,
                vaciosDevueltosPorTipo: _ventaActual.vaciosDevueltosPorTipo,
                origen: "offline"
            };
            batch.set(ventaRef, ventaDataToSave);

            await batch.commit();
            return { venta: ventaDataToSave, productos: itemsVenta, vaciosDevueltosPorTipo: ventaDataToSave.vaciosDevueltosPorTipo };

        } else {
            if (!_runTransaction) throw new Error("Dependencia crítica 'runTransaction' no disponible.");
            console.log("Modo Online: Usando Transaction");

            try {
                const savedData = await _runTransaction(_db, async (transaction) => {
                    const clientDoc = await transaction.get(clientRef);
                    if (!clientDoc.exists()) throw "El cliente no existe.";
                    const invRefs = [];
                    for (const p of prodsParaGuardar) {
                        const ref = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                        invRefs.push({ id: p.id, ref: ref, qty: p.totalUnidadesVendidas || 0, presentacion: p.presentacion });
                    }
                    const invDocs = await Promise.all(invRefs.map(item => transaction.get(item.ref)));
                    
                    let totalVenta = 0;
                    const itemsVenta = [];
                    const vaciosChanges = {};

                    invRefs.forEach((item, index) => {
                        const invDoc = invDocs[index];
                        if (!invDoc.exists()) throw new Error(`Producto ${item.presentacion} no existe en inventario.`);
                        
                        const currentStock = invDoc.data().cantidadUnidades || 0;
                        if (currentStock < item.qty) {
                            throw new Error(`Stock insuficiente para ${item.presentacion}. Disponible: ${currentStock}, Solicitado: ${item.qty}`);
                        }

                        if (item.qty > 0) {
                            transaction.update(item.ref, { cantidadUnidades: currentStock - item.qty });
                        }

                        const p = prodsParaGuardar.find(prod => prod.id === item.id);
                        const precios = p.precios || { und: p.precioPorUnidad || 0 };
                        const sub = (precios.cj || 0) * (p.cantCj || 0) + (precios.paq || 0) * (p.cantPaq || 0) + (precios.und || 0) * (p.cantUnd || 0);
                        totalVenta += sub;

                        if (p.manejaVacios && p.tipoVacio) {
                            const tV = p.tipoVacio;
                            const cjV = p.cantCj || 0;
                            if (cjV > 0) vaciosChanges[tV] = (vaciosChanges[tV] || 0) + cjV;
                        }

                        if (item.qty > 0) {
                            itemsVenta.push({
                               id: p.id, presentacion: p.presentacion, rubro: p.rubro??null, marca: p.marca??null, segmento: p.segmento??null,
                               precios: p.precios, ventaPor: p.ventaPor,
                               unidadesPorPaquete: p.unidadesPorPaquete, unidadesPorCaja: p.unidadesPorCaja,
                               cantidadVendida: { cj: p.cantCj||0, paq: p.cantPaq||0, und: p.cantUnd||0 },
                               totalUnidadesVendidas: p.totalUnidadesVendidas,
                               iva: p.iva??0, manejaVacios: p.manejaVacios||false, tipoVacio: p.tipoVacio||null
                            });
                        }
                    });

                    for (const tV in _ventaActual.vaciosDevueltosPorTipo) {
                        const dev = _ventaActual.vaciosDevueltosPorTipo[tV] || 0;
                        if (dev > 0) vaciosChanges[tV] = (vaciosChanges[tV] || 0) - dev;
                    }

                    if (Object.values(vaciosChanges).some(c => c !== 0)) {
                        const cliData = clientDoc.data();
                        const sVac = cliData.saldoVacios || {};
                        for (const tV in vaciosChanges) {
                            const ch = vaciosChanges[tV];
                            if (ch !== 0) sVac[tV] = (sVac[tV] || 0) + ch;
                        }
                        transaction.update(clientRef, { saldoVacios: sVac });
                    }

                    const ventaDataToSave = {
                        clienteId: _ventaActual.cliente.id,
                        clienteNombre: _ventaActual.cliente.nombreComercial || _ventaActual.cliente.nombrePersonal,
                        clienteNombrePersonal: _ventaActual.cliente.nombrePersonal,
                        fecha: new Date(),
                        total: totalVenta,
                        productos: itemsVenta,
                        vaciosDevueltosPorTipo: _ventaActual.vaciosDevueltosPorTipo
                    };
                    
                    transaction.set(ventaRef, ventaDataToSave);
                    
                    return { venta: ventaDataToSave, productos: itemsVenta, vaciosDevueltosPorTipo: ventaDataToSave.vaciosDevueltosPorTipo }; 
                });

                return savedData;
            } catch (e) {
                console.error("Transaction failed: ", e);
                throw e;
            }
        }
    }

    async function generarTicket() {
        if (!_ventaActual.cliente) { _showModal('Error', 'Selecciona cliente.'); return; }
        const prods = Object.values(_ventaActual.productos);
        const hayVac = Object.values(_ventaActual.vaciosDevueltosPorTipo).some(c => c > 0);
        if (prods.length === 0 && !hayVac) { _showModal('Error', 'Agrega productos o registra vacíos devueltos.'); return; }

        _showModal('Confirmar Venta', '¿Guardar esta transacción?', async () => {
            _showModal('Progreso', 'Guardando transacción...', null, '', null, false); 
            try {
                const savedData = await _processAndSaveVenta();
                
                const pModal = document.getElementById('modalContainer');
                if (pModal) pModal.classList.add('hidden');
                
                setTimeout(() => {
                    showSharingOptions(
                        { cliente: _ventaActual.cliente, fecha: savedData.venta.fecha }, 
                        savedData.productos, 
                        savedData.vaciosDevueltosPorTipo, 
                        'Nota de Entrega',
                        () => { _showModal('Éxito', 'Venta registrada y ticket generado/compartido.', showNuevaVentaView); }
                    );
                }, 300);

            } catch (saveError) {
                console.error("Error al guardar venta:", saveError);
                 const progressModal = document.getElementById('modalContainer'); 
                 if(progressModal && !progressModal.classList.contains('hidden') && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                        progressModal.classList.add('hidden');
                 }
                _showModal('Error', `Error al guardar la venta: ${saveError.message || saveError}`);
            }
            return false; 
        }, 'Sí, Generar Ticket', null, true); 
    }

    function showVentasTotalesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        if (!window.ventasUI) { _showModal('Error', 'UI no cargada.'); return; }
        
        _mainContent.innerHTML = window.ventasUI.getSalesMenuTemplate();
        
        document.getElementById('ventasActualesBtn').addEventListener('click', showVentasActualesView);
        document.getElementById('cierreVentasBtn').addEventListener('click', showCierreSubMenuView);
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasView);
    }

    function showVentasActualesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 w-full"> <div class="bg-white/90 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4"> 
                    <h2 class="text-2xl font-bold text-gray-800">Ventas Actuales</h2> 
                    <div class="flex gap-2 w-full md:w-auto">
                        <button id="descargarCierrePrevioBtn" class="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition font-bold flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Cierre Previo
                        </button>
                        <button id="backToVentasTotalesBtn" class="flex-1 md:flex-none px-4 py-2 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button> 
                    </div>
                </div>
                <div id="ventasListContainer" class="overflow-x-auto"><p class="text-center text-gray-500">Cargando...</p></div>
            </div> </div>
        `;
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
        document.getElementById('descargarCierrePrevioBtn').addEventListener('click', handleDescargarCierrePrevio);
        renderVentasList();
    }

    // --- MOTOR CRONOLÓGICO DE AUDITORÍA Y AUTO-HEALING ---
    async function calcularStockTeoricoExacto(userId, ventasActivas, obsequiosActivos) {
        await ensureHybridCacheLoaded();
        
        // 1. Buscar el Último Cierre y el último Snapshot manual
        const cierresRef = _collection(_db, `artifacts/${_appId}/users/${userId}/cierres`);
        const qUltimo = _query(cierresRef, _orderBy('fecha', 'desc'), _limit(1));
        const snapUltimo = await _getDocs(qUltimo);

        const snapshotRef = _doc(_db, `artifacts/${_appId}/users/${userId}/config/cargaInicialSnapshot`);
        const snapshotDoc = await _getDoc(snapshotRef);

        let fechaBase = new Date(0);
        let eventos = [];

        let fechaUltimoCierre = new Date(0);
        let fechaSnapshot = new Date(0);

        if (!snapUltimo.empty) {
            const d = snapUltimo.docs[0].data();
            fechaUltimoCierre = d.fecha?.toDate ? d.fecha.toDate() : new Date(d.fecha);
        }
        if (snapshotDoc.exists()) {
            const d = snapshotDoc.data();
            fechaSnapshot = d.fecha?.toDate ? d.fecha.toDate() : new Date(d.fecha);
        }

        // SOLUCIÓN PUNTO 1: Inteligencia de Fechas (Qué ocurrió de último)
        if (snapshotDoc.exists() && fechaSnapshot > fechaUltimoCierre) {
            fechaBase = fechaSnapshot;
            const inv = snapshotDoc.data().inventario || [];
            inv.forEach(i => eventos.push({ tipo: 'CARGA', fecha: fechaBase, id: i.productoId || i.id, qty: i.cantidadUnidades || 0 }));
        } else if (!snapUltimo.empty) {
            fechaBase = fechaUltimoCierre;
            const uCierre = snapUltimo.docs[0].data();
            (uCierre.cargaInicialInventario || []).forEach(i => eventos.push({ tipo: 'CARGA', fecha: fechaBase, id: i.productoId || i.id, qty: i.cantidadUnidades || 0 }));
            // Descontar ventas del cierre base
            (uCierre.ventas || []).forEach(v => (v.productos || []).forEach(p => eventos.push({ tipo: 'RESTA_CIERRE', fecha: fechaBase, id: p.id, qty: -(p.totalUnidadesVendidas || 0) })));
            (uCierre.obsequios || []).forEach(o => {
                const pMaster = _masterCatalogCache[o.productoId] || { unidadesPorCaja: 1 };
                eventos.push({ tipo: 'RESTA_CIERRE', fecha: fechaBase, id: o.productoId, qty: -((o.cantidadCajas || 0) * (pMaster.unidadesPorCaja || 1)) });
            });
        }

        // 2. Extraer eventos intermedios (Recargas y Correcciones)
        const qRecargas = _query(_collection(_db, `artifacts/${_appId}/users/${userId}/recargas`), _where("fecha", ">=", fechaBase.toISOString()));
        const snapRecargas = await _getDocs(qRecargas);
        snapRecargas.docs.forEach(doc => {
            const r = doc.data(); const f = new Date(r.fecha);
            (r.detalles || []).forEach(d => eventos.push({ tipo: 'RECARGA', fecha: f, id: d.productoId, qty: d.diferenciaUnidades || 0 }));
        });

        // --- INICIO FIX: BÚSQUEDA MULTI-CARPETA PROTEGIDA CONTRA REGLAS DE FIREBASE ---
        let idsToSearch = [userId]; // Por defecto siempre buscar en la carpeta del propio vendedor
        
        try {
            // Intentamos buscar administradores (Solo funcionará si el que ejecuta esto es un Admin)
            const usersRef = _collection(_db, 'users');
            const usersSnap = await _getDocs(usersRef);
            const adminIds = usersSnap.docs.filter(d => d.data().role === 'admin').map(d => d.id);
            idsToSearch = [...new Set([userId, ...adminIds])];
        } catch (permError) {
            // Si da "Missing permissions", es porque es un Vendedor normal. 
            // Ignoramos el error silenciosamente y continuamos solo con su userId.
            console.warn("Búsqueda restringida: El usuario no es admin, solo leerá su propia carpeta de correcciones.");
        }

        for (const searchUid of idsToSearch) {
            try {
                const qCorr = _query(_collection(_db, `artifacts/${_appId}/users/${searchUid}/historial_correcciones`), _where("fecha", ">=", fechaBase)); 
                const snapCorr = await _getDocs(qCorr);
                
                snapCorr.docs.forEach(doc => {
                    const c = doc.data(); 
                    // Filtramos: Solo nos importan las correcciones donde el target es este vendedor 
                    if (c.targetUserId === userId || (!c.targetUserId && searchUid === userId)) {
                        const f = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha);
                        
                        if (c.tipoAjuste === 'LIMPIEZA_PROFUNDA') {
                            eventos.push({ tipo: 'WIPE', fecha: f });
                        } else {
                            (c.detalles || []).forEach(d => {
                                const ajuste = d.ajusteBase !== undefined ? d.ajusteBase : (d.ajuste || 0);
                                if (d.productoId && d.productoId !== 'ALL') {
                                    eventos.push({ tipo: 'CORRECCION', fecha: f, id: d.productoId, qty: ajuste });
                                }
                            });
                        }
                    }
                });
            } catch (folderError) {
                // Si Firebase rechaza leer la carpeta de un admin específico por permisos, se ignora.
            }
        }
        // --- FIN FIX CORRECCIONES ---
        // 3. Extraer Ventas y Obsequios activos
        ventasActivas.forEach(v => {
            const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
            (v.productos || []).forEach(p => eventos.push({ tipo: 'VENTA_ACTIVA', fecha: f, id: p.id, qty: -(p.totalUnidadesVendidas || 0) }));
        });

        obsequiosActivos.forEach(o => {
            const f = o.fecha?.toDate ? o.fecha.toDate() : new Date(o.fecha);
            const pMaster = _masterCatalogCache[o.productoId] || { unidadesPorCaja: 1 };
            eventos.push({ tipo: 'OBSEQUIO_ACTIVO', fecha: f, id: o.productoId, qty: -((o.cantidadCajas || 0) * (pMaster.unidadesPorCaja || 1)) });
        });

        // 4. SIMULACIÓN CRONOLÓGICA DE EVENTOS (Recreamos la historia paso a paso)
        eventos.sort((a, b) => a.fecha - b.fecha);

        let stockTeorico = new Map();
        let cargaInicialExcelMap = new Map();

        eventos.forEach(ev => {
            if (ev.tipo === 'WIPE') {
                // Si hubo limpieza, la matemática vuelve a CERO en ese segundo.
                stockTeorico.clear();
                cargaInicialExcelMap.clear(); 
            } else {
                stockTeorico.set(ev.id, (stockTeorico.get(ev.id) || 0) + ev.qty);
                // Si no es una venta u obsequio actual, pertenece a la "Carga Inicial" de hoy
                if (ev.tipo !== 'VENTA_ACTIVA' && ev.tipo !== 'OBSEQUIO_ACTIVO') {
                    cargaInicialExcelMap.set(ev.id, (cargaInicialExcelMap.get(ev.id) || 0) + ev.qty);
                }
            }
        });

        // 5. Preparar la estructura requerida para el Excel
        const cargaParaExcel = [];
        cargaInicialExcelMap.forEach((qty, pId) => {
            if (qty > 0 || ventasActivas.some(v => v.productos.some(vp => vp.id === pId))) {
                const pMaster = _masterCatalogCache[pId] || {};
                cargaParaExcel.push({
                    productoId: pId, presentacion: pMaster.presentacion || 'Desconocido', rubro: pMaster.rubro || 'SIN RUBRO',
                    segmento: pMaster.segmento || 'SIN SEGMENTO', marca: pMaster.marca || 'S/M', cantidadUnidades: qty
                });
            }
        });

        return { stockTeorico, cargaParaExcel };
    }

    async function handleDescargarCierrePrevio() {
        _showModal('Progreso', 'Calculando y Generando Cierre Previo (Excel)...');
        try {
            const ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`)); 
            const ventas = ventasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const obsequiosSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
            const obsequios = obsequiosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const { cargaParaExcel } = await calcularStockTeoricoExacto(_userId, ventas, obsequios);

            let vendedorInfo = {};
            if (window.userRole === 'user') {
                 const uDoc = await _getDoc(_doc(_db, "users", _userId)); 
                 const uData = uDoc.exists() ? uDoc.data() : {};
                 vendedorInfo = { userId: _userId, nombre: uData.nombre || '', apellido: uData.apellido || '', camion: uData.camion || '', email: uData.email || '' };
            }

            const fechaCierre = new Date();
            let obsequiosTotal = 0;
            obsequios.forEach(o => {
                 const p = _masterCatalogCache[o.productoId] || {};
                 obsequiosTotal += (o.cantidadCajas || 0) * (p.precios?.cj || 0);
            });
            
            const cierreDataForExport = { 
                 fecha: { toDate: () => fechaCierre }, 
                 ventas: ventas.map(({id, ...rest}) => rest), 
                 obsequios: obsequios.map(({id, ...rest}) => rest),
                 total: ventas.reduce((s, v) => s + (v.total || 0), 0) + obsequiosTotal,
                 cargaInicialInventario: cargaParaExcel,
                 vendedorInfo: vendedorInfo
            }; 

            if (window.dataModule?.exportSingleClosingToExcel) {
                await window.dataModule.exportSingleClosingToExcel(cierreDataForExport, true); 
                document.getElementById('modalContainer')?.classList.add('hidden');
            } else { throw new Error("Módulo de reportes no cargado."); }
        } catch(e) { _showModal('Error', `Fallo al generar Cierre Previo: ${e.message}`); }
    }

    function renderVentasList() {
        const cont = document.getElementById('ventasListContainer'); if (!cont) return;
        const vRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`); const q = _query(vRef);
        
        const unsub = _onSnapshot(q, (snap) => {
            _ventasGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
            _ventasGlobal.sort((a,b) => (b.fecha?.toDate()??0) - (a.fecha?.toDate()??0));
            
            if (_ventasGlobal.length === 0) {
                cont.innerHTML = `<p class="text-center text-gray-500 py-4 font-medium">No hay ventas registradas.</p>`;
                return;
            }

            let tHTML = `
                <table class="min-w-full bg-white text-sm rounded-lg overflow-hidden border border-gray-200">
                    <thead class="bg-gray-800 text-white">
                        <tr>
                            <th class="py-2.5 px-2 text-left font-semibold">Fecha/Cliente</th>
                            <th class="py-2.5 px-2 text-right font-semibold">Totales</th>
                            <th class="py-2.5 px-1 text-center font-semibold w-20">ACC</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
            `;

            _ventasGlobal.forEach(v => {
                const fechaObj = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                const fechaStr = isNaN(fechaObj) ? 'Fecha inválida' : fechaObj.toLocaleString('es-ES', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
                
                let subtotales = {};
                (v.productos || []).forEach(p => {
                    const r = (p.rubro || 'OTROS').toUpperCase();
                    let shortR = r;
                    if (r.includes('CERVE') || r.includes('VINO')) shortR = 'CERV';
                    else if (r.includes('MALT') || r.includes('PEPSI')) shortR = 'PEPSI';
                    else if (r.includes('ALIM')) shortR = 'ALIM';
                    else if (r.includes('P&G') || r.includes('PROCTER')) shortR = 'P&G';
                    else shortR = r.substring(0, 6); 

                    const cC = p.cantidadVendida?.cj || 0;
                    const cP = p.cantidadVendida?.paq || 0;
                    const cU = p.cantidadVendida?.und || 0;
                    const pC = p.precios?.cj || 0;
                    const pP = p.precios?.paq || 0;
                    const pU = p.precios?.und || 0;
                    const sub = (cC * pC) + (cP * pP) + (cU * pU);

                    if (!subtotales[shortR]) subtotales[shortR] = 0;
                    subtotales[shortR] += sub;
                });

                let totalHtml = '';
                const rubrosKeys = Object.keys(subtotales);
                const gTotal = v.total || 0;

                if (rubrosKeys.length > 1) {
                    totalHtml += `<div class="text-[11px] text-gray-500 mb-1 space-y-0.5">`;
                    rubrosKeys.forEach(rk => {
                        if (subtotales[rk] > 0) {
                            totalHtml += `<div class="text-right whitespace-nowrap"><span class="font-medium">${rk}:</span> <span class="text-gray-700">$${subtotales[rk].toFixed(2)}</span></div>`;
                        }
                    });
                    totalHtml += `</div><div class="font-black text-gray-900 border-t border-gray-200 pt-1 text-right text-base whitespace-nowrap">Total: $${gTotal.toFixed(2)}</div>`;
                } else if (rubrosKeys.length === 1 && subtotales[rubrosKeys[0]] > 0) {
                    totalHtml = `<div class="text-[10px] text-gray-400 text-right mb-0.5 uppercase tracking-wide font-bold whitespace-nowrap">${rubrosKeys[0]}</div>
                                 <div class="font-black text-gray-900 text-right text-base whitespace-nowrap">Total: $${gTotal.toFixed(2)}</div>`;
                } else {
                    totalHtml = `<div class="font-black text-gray-900 text-right text-base whitespace-nowrap">Total: $${gTotal.toFixed(2)}</div>`;
                }

                tHTML += `
                    <tr class="hover:bg-blue-50 transition-colors">
                        <td class="py-2 px-2 align-middle">
                            <div class="font-bold text-gray-800 text-sm mb-0.5 leading-tight">${v.clienteNombre || 'Sin Nombre'}</div>
                            <div class="text-[11px] text-gray-500 font-medium">${fechaStr}</div>
                        </td>
                        <td class="py-2 px-2 align-middle">
                            ${totalHtml}
                        </td>
                        <td class="py-1.5 px-2 align-middle text-center w-20">
                            <div class="flex flex-col gap-1 items-center w-full">
                                <button onclick="window.ventasModule.showPastSaleOptions('${v.id}')" class="w-full py-1.5 px-1 bg-blue-600 text-white font-medium text-xs rounded hover:bg-blue-700 shadow-sm transition">Ticket</button>
                                <button onclick="window.ventasModule.editVenta('${v.id}')" class="w-full py-1.5 px-1 bg-yellow-500 text-white font-medium text-xs rounded hover:bg-yellow-600 shadow-sm transition">Editar</button>
                                <button onclick="window.ventasModule.deleteVenta('${v.id}')" class="w-full py-1.5 px-1 bg-red-600 text-white font-medium text-xs rounded hover:bg-red-700 shadow-sm transition">Borrar</button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            tHTML += `</tbody></table>`;
            cont.innerHTML = tHTML;
            
        }, (err) => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') return;
            console.error("Error lista ventas:", err); 
            if(cont) cont.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; 
        });
        
        _activeListeners.push(unsub);
    }

    function showCierreSubMenuView() {
         _mainContent.innerHTML = window.ventasUI.getClosingMenuTemplate();
         
        document.getElementById('verCierreBtn').addEventListener('click', showVerCierreView);
        document.getElementById('ejecutarCierreBtn').addEventListener('click', ejecutarCierre); 
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
    }

    async function showVerCierreView() {
        _showModal('Progreso', 'Generando reporte...');
        try {
            const ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
            const ventas = ventasSnap.docs.map(doc => doc.data());
            const obsequiosSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
            const obsequios = obsequiosSnap.docs.map(doc => doc.data());

            if (ventas.length === 0 && obsequios.length === 0) { _showModal('Aviso', 'No hay ventas ni obsequios.'); return; }

            const { cargaParaExcel } = await calcularStockTeoricoExacto(_userId, ventas, obsequios);
            
            if (!window.dataModule?._processSalesDataForModal) throw new Error("Módulo de datos no disponible.");

            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder } = 
                await window.dataModule._processSalesDataForModal(ventas, obsequios, cargaParaExcel, _userId);

            const enrichedProductOrder = finalProductOrder.map(p => {
                const liveProd = _inventarioCache.find(inv => inv.id === p.id);
                return liveProd ? { ...p, ventaPor: liveProd.ventaPor, unidadesPorCaja: liveProd.unidadesPorCaja, unidadesPorPaquete: liveProd.unidadesPorPaquete } : p;
            });

            let hHTML = `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">Cliente</th>`;
            enrichedProductOrder.forEach(p => { hHTML += `<th class="p-1 border whitespace-nowrap text-xs" title="${p.marca||''} - ${p.segmento||''}">${p.presentacion}</th>`; });
            hHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200">Total Cliente</th></tr>`;
            
            let bHTML=''; 
            sortedClients.forEach(cli=>{
                const cCli = clientData[cli]; 
                const esSoloObsequio = cCli.isObsequioRow;
                const rowClass = esSoloObsequio ? 'bg-blue-100 hover:bg-blue-200 text-blue-900' : 'hover:bg-blue-50';
                
                bHTML+=`<tr class="${rowClass}"><td class="p-1 border font-medium bg-white sticky left-0 z-10">${cli}</td>`; 
                enrichedProductOrder.forEach(p=>{
                    const qU=cCli.products[p.id]||0; 
                    const qtyDisplay = window.dataModule.getDisplayQty(qU, p);
                    let dQ = qU > 0 ? (typeof qtyDisplay.value === 'number' ? `${qtyDisplay.value} ${qtyDisplay.unit}` : qtyDisplay.value) + (esSoloObsequio ? ` <span class="text-[10px] text-blue-600 font-black ml-1">(Regalo)</span>` : '') : '';
                    let cellClass = esSoloObsequio && qU > 0 ? 'font-bold bg-blue-50 text-blue-800' : (qU > 0 ? 'font-bold' : '');
                    bHTML+=`<td class="p-1 border text-center ${cellClass}">${dQ}</td>`;
                }); 
                bHTML+=`<td class="p-1 border text-right font-semibold bg-white sticky right-0 z-10">$${cCli.totalValue.toFixed(2)}</td></tr>`;
            });

            let fHTML='<tr class="bg-gray-200 font-bold"><td class="p-1 border sticky left-0 z-10">TOTALES</td>'; 
            enrichedProductOrder.forEach(p=>{
                let tQ=0; sortedClients.forEach(cli=>tQ+=clientData[cli].products[p.id]||0); 
                const qtyDisplay = window.dataModule.getDisplayQty(tQ, p);
                let dT = tQ > 0 ? (typeof qtyDisplay.value === 'number' ? `${qtyDisplay.value} ${qtyDisplay.unit}` : qtyDisplay.value) : '';
                fHTML+=`<td class="p-1 border text-center whitespace-nowrap">${dT}</td>`;
            }); 
            fHTML+=`<td class="p-1 border text-right sticky right-0 z-10">$${grandTotalValue.toFixed(2)}</td></tr>`;
            
            const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
            const localVacios = {};
            
            // Procesar Ventas Normales
            ventas.forEach(v => {
                const cName = v.clienteNombre || 'Desconocido';
                if (!localVacios[cName]) localVacios[cName] = {};
                (v.productos || []).forEach(p => {
                    if (p.manejaVacios && p.tipoVacio && (p.cantidadVendida?.cj||0) > 0) {
                        if (!localVacios[cName][p.tipoVacio]) localVacios[cName][p.tipoVacio] = { entregados: 0, devueltos: 0 };
                        localVacios[cName][p.tipoVacio].entregados += p.cantidadVendida.cj;
                    }
                });
                Object.entries(v.vaciosDevueltosPorTipo || {}).forEach(([tipo, cant]) => {
                    if (parseInt(cant, 10) > 0) {
                        if (!localVacios[cName][tipo]) localVacios[cName][tipo] = { entregados: 0, devueltos: 0 };
                        localVacios[cName][tipo].devueltos += parseInt(cant, 10);
                    }
                });
            });

            // Procesar Obsequios (Estructura de datos diferente)
            obsequios.forEach(o => {
                const cName = o.clienteNombre || 'Desconocido';
                if (!localVacios[cName]) localVacios[cName] = {};
                if (o.tipoVacio) {
                    if (!localVacios[cName][o.tipoVacio]) localVacios[cName][o.tipoVacio] = { entregados: 0, devueltos: 0 };
                    if (o.cantidadCajas > 0) localVacios[cName][o.tipoVacio].entregados += o.cantidadCajas;
                    if (o.vaciosRecibidos > 0) localVacios[cName][o.tipoVacio].devueltos += parseInt(o.vaciosRecibidos, 10);
                }
            });

            let vHTML=''; 
            const cliVacios = Object.keys(localVacios).filter(cli => TIPOS_VACIO_GLOBAL.some(t => (localVacios[cli][t]?.entregados || 0) > 0 || (localVacios[cli][t]?.devueltos || 0) > 0)).sort(); 
            
            if (cliVacios.length > 0) { 
                vHTML = `<h3 class="text-lg font-bold text-gray-800 mt-6 mb-2 border-t pt-4">Resumen de Envases (Vacíos)</h3><div class="overflow-hidden border border-gray-300 rounded-lg shadow-sm"><table class="min-w-full bg-white text-sm"><thead class="bg-gray-800 text-white"><tr><th class="py-2 px-3 text-left font-semibold">Cliente</th><th class="py-2 px-3 text-center font-semibold">Tipo</th><th class="py-2 px-3 text-center font-semibold">Entregados</th><th class="py-2 px-3 text-center font-semibold">Devueltos</th><th class="py-2 px-3 text-center font-semibold">Pendiente</th></tr></thead><tbody class="divide-y divide-gray-200">`; 
                cliVacios.forEach(cli => {
                    TIPOS_VACIO_GLOBAL.forEach(t => {
                        const mov = localVacios[cli][t]; 
                        if (mov && (mov.entregados > 0 || mov.devueltos > 0)) {
                            const neto = mov.entregados - mov.devueltos; 
                            const nClass = neto > 0 ? 'text-red-600 font-bold bg-red-50' : (neto < 0 ? 'text-green-600 font-bold bg-green-50' : 'text-gray-500'); 
                            let netoText = neto > 0 ? `+${neto} (Debe)` : (neto < 0 ? `${neto} (A favor)` : `0 (Solvente)`);
                            vHTML += `<tr class="hover:bg-gray-50"><td class="py-2 px-3 text-gray-800 font-medium">${cli}</td><td class="py-2 px-3 text-center text-gray-600">${t}</td><td class="py-2 px-3 text-center font-semibold text-gray-700">${mov.entregados}</td><td class="py-2 px-3 text-center font-semibold text-gray-700">${mov.devueltos}</td><td class="py-2 px-3 text-center ${nClass}">${netoText}</td></tr>`;
                        }
                    });
                }); 
                vHTML += '</tbody></table></div>';
            }
            
            const reportHTML = `<div class="text-left max-h-[80vh] overflow-auto"> <h3 class="text-xl font-bold mb-4">Reporte Cierre</h3> <div class="overflow-auto border"> <table class="min-w-full bg-white text-xs"> <thead class="bg-gray-200">${hHTML}</thead> <tbody>${bHTML}</tbody> <tfoot>${fHTML}</tfoot> </table> </div> ${vHTML} </div>`;
            _showModal('Reporte de Cierre', reportHTML, null, 'Cerrar');
        } catch (error) { console.error("Error reporte:", error); _showModal('Error', `No se pudo generar: ${error.message}`); }
    }

    async function ejecutarCierre() {
        _showModal('Confirmar Cierre Definitivo', 'Se generará el reporte y se limpiará la jornada para iniciar una nueva. ¿Deseas continuar?', async () => {
            _showModal('Progreso', 'Realizando auditoría silenciosa y guardando cierre...', null, '', null, false);
            try {
                const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`); 
                const ventasSnap = await _getDocs(ventasRef); 
                const ventas = ventasSnap.docs.map(d=>({id: d.id, ...d.data()}));
                
                const obsequiosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`);
                const obsequiosSnap = await _getDocs(obsequiosRef);
                const obsequios = obsequiosSnap.docs.map(d => ({id: d.id, ...d.data()}));

                if (ventas.length === 0 && obsequios.length === 0) { _showModal('Aviso', 'No hay ventas activas.'); return false; }

                const { stockTeorico, cargaParaExcel } = await calcularStockTeoricoExacto(_userId, ventas, obsequios);

                const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
                const snapInventario = await _getDocs(inventarioRef);
                const inventarioFisicoMap = new Map(snapInventario.docs.map(d => [d.id, {ref: d.ref, data: d.data()}]));

                const discrepanciasDetectadas = [];
                const batchLimp = _writeBatch(_db);
                let ops = 0;

                new Set([...stockTeorico.keys(), ...inventarioFisicoMap.keys()]).forEach(pId => {
                    const teorico = stockTeorico.get(pId) || 0;
                    const fisicoObj = inventarioFisicoMap.get(pId);
                    const fisico = fisicoObj ? (fisicoObj.data.cantidadUnidades || 0) : 0;
                    
                    if (teorico !== fisico) {
                        const pMaster = _masterCatalogCache[pId] || { presentacion: 'Desconocido', marca: 'S/M' };
                        discrepanciasDetectadas.push({ id: pId, presentacion: pMaster.presentacion, marca: pMaster.marca, teorico: teorico, fisico: fisico, diferencia: fisico - teorico });
                        
                        if (fisicoObj) batchLimp.update(fisicoObj.ref, { cantidadUnidades: teorico });
                        else batchLimp.set(_doc(inventarioRef, pId), { ...pMaster, cantidadUnidades: teorico });
                        ops++;
                    }
                });

                _showModal('Progreso', 'Generando Reporte y Finalizando...');
                let vendedorInfo = {};
                if (window.userRole === 'user') {
                    const uDoc = await _getDoc(_doc(_db, "users", _userId)); 
                    vendedorInfo = uDoc.exists() ? { userId:_userId, nombre:uDoc.data().nombre||'', apellido:uDoc.data().apellido||'', camion:uDoc.data().camion||'', email:uDoc.data().email||'' } : {};
                }

                const fechaCierre = new Date();
                let obsequiosTotal = 0;
                obsequios.forEach(o => { obsequiosTotal += (o.cantidadCajas || 0) * (_masterCatalogCache[o.productoId]?.precios?.cj || 0); });
                 
                const cierreData = { 
                     fecha: fechaCierre, ventas: ventas.map(({id,...r})=>r), obsequios: obsequios.map(({id,...r})=>r),
                     total: ventas.reduce((s,v)=>s+(v.total||0),0) + obsequiosTotal,
                     cargaInicialInventario: cargaParaExcel, vendedorInfo: vendedorInfo, discrepanciasAuditoria: discrepanciasDetectadas 
                }; 

                if (window.dataModule?.exportSingleClosingToExcel) await window.dataModule.exportSingleClosingToExcel({ ...cierreData, fecha: { toDate: () => fechaCierre } });
                 
                batchLimp.set(_doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/cierres`)), cierreData); ops++;
                ventas.forEach(v => { batchLimp.delete(_doc(ventasRef, v.id)); ops++; });
                obsequios.forEach(o => { batchLimp.delete(_doc(obsequiosRef, o.id)); ops++; });
                try { batchLimp.delete(_doc(_db, `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`)); ops++; } catch(e) {}

                await batchLimp.commit();
                _showModal('Éxito', 'Cierre completado.', showVentasTotalesView); return true;
            } catch(e) { _showModal('Error', `Error al cerrar: ${e.message}`); return false; }
        }, 'Sí, Ejecutar Cierre', null, true);
    }

    async function ensureHybridCacheLoaded() {
        try {
            const [masterSnap, stockSnap] = await Promise.all([
                _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`))
            ]);
            
            _masterCatalogCache = {};
            masterSnap.forEach(d => { _masterCatalogCache[d.id] = { id: d.id, ...d.data() }; });
            
            _userStockCache = {};
            stockSnap.forEach(d => { 
                const data = d.data();
                _userStockCache[d.id] = { cantidadUnidades: data.cantidadUnidades || 0, _legacyData: data };
            });
            
            mergeInventarioCache();
        } catch (err) {
            console.error("Error al cargar caché híbrido para edición:", err);
            throw err;
        }
    }

    window.showPastSaleOptions = function(ventaId, tipo = 'ticket') {
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (!venta) { _showModal('Error', 'Venta no encontrada.'); return; }
        const productosFormateados = (venta.productos || []).map(p => ({
            ...p,
            cantidadVendida: p.cantidadVendida || { cj: 0, paq: 0, und: 0 },
            totalUnidadesVendidas: p.totalUnidadesVendidas || 0,
            precios: p.precios || { und: 0, paq: 0, cj: 0 }
        }));
        showSharingOptions(venta, productosFormateados, venta.vaciosDevueltosPorTipo || {}, tipo, showVentasActualesView);
    };

    function editVenta(ventaId) {
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (!venta) { _showModal('Error', 'Venta no encontrada.'); return; }
         _originalVentaForEdit = JSON.parse(JSON.stringify(venta));
        showEditVentaView(venta);
    }
    
    function deleteVenta(ventaId) {
         const venta = _ventasGlobal.find(v => v.id === ventaId);
         if (!venta) { _showModal('Error', 'Venta no encontrada en la lista actual.'); return; }

        _showModal('Confirmar Eliminación', `¿Eliminar venta de ${venta.clienteNombre}? <strong class="text-red-600">Esta acción revertirá el stock y el saldo de vacíos asociados a esta venta.</strong> ¿Continuar?`, async () => {
            _showModal('Progreso', 'Eliminando venta y ajustando datos...');
            try {
                const ventaRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/ventas`, ventaId);
                const clienteRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`, venta.clienteId);

                if (!_runTransaction) throw new Error("Dependencia crítica 'runTransaction' no disponible.");

                await _runTransaction(_db, async (transaction) => {
                    const ventaDoc = await transaction.get(ventaRef);
                    const clienteDoc = await transaction.get(clienteRef);
                    if (!ventaDoc.exists()) throw new Error("La venta ya no existe.");

                    const ventaData = ventaDoc.data();
                    const productosVendidos = ventaData.productos || [];

                    const inventarioRefs = {};
                    const productoIds = productosVendidos.map(p => p.id).filter(id => id);
                    const inventarioDocsMap = new Map();
                    if (productoIds.length > 0) {
                        const uniqueProductIds = [...new Set(productoIds)];
                        const inventarioGetPromises = uniqueProductIds.map(id => {
                            const ref = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, id);
                            inventarioRefs[id] = ref;
                            return transaction.get(ref);
                        });
                        const inventarioDocs = await Promise.all(inventarioGetPromises);
                        inventarioDocs.forEach((docSnap, index) => {
                            inventarioDocsMap.set(uniqueProductIds[index], docSnap);
                        });
                    }

                    const nuevosSaldoVaciosCliente = { ...(clienteDoc.exists() ? clienteDoc.data().saldoVacios : {}) };
                    const ajustesInventario = [];
                    const ajustesVaciosNetos = {};

                    for (const productoVendido of productosVendidos) {
                        const unidadesARestaurar = productoVendido.totalUnidadesVendidas || 0;
                        if (unidadesARestaurar > 0) {
                            const productoInventarioRef = inventarioRefs[productoVendido.id];
                            if (productoInventarioRef) {
                                ajustesInventario.push({ ref: productoInventarioRef, cantidad: unidadesARestaurar, id: productoVendido.id, datosBackup: productoVendido });
                            }
                        }
                        if (productoVendido.manejaVacios && productoVendido.tipoVacio) {
                            const tipo = productoVendido.tipoVacio;
                            const cajasEntregadas = productoVendido.cantidadVendida?.cj || 0;
                            if (cajasEntregadas > 0) ajustesVaciosNetos[tipo] = (ajustesVaciosNetos[tipo] || 0) - cajasEntregadas;
                        }
                    }

                    const vaciosDevueltosEnVenta = ventaData.vaciosDevueltosPorTipo || {};
                    for (const tipo in vaciosDevueltosEnVenta) {
                        const cajasDevueltas = vaciosDevueltosEnVenta[tipo] || 0;
                        if (cajasDevueltas > 0) ajustesVaciosNetos[tipo] = (ajustesVaciosNetos[tipo] || 0) + cajasDevueltas;
                    }

                    for (const ajuste of ajustesInventario) {
                         const invDoc = inventarioDocsMap.get(ajuste.id);
                         let dataToSet = {};
                         
                         if (invDoc && invDoc.exists()) {
                             const stockActual = invDoc.data().cantidadUnidades || 0;
                             dataToSet = { cantidadUnidades: stockActual + ajuste.cantidad };
                         } else {
                             const bk = ajuste.datosBackup;
                             dataToSet = {
                                 presentacion: bk.presentacion || 'Producto Restaurado',
                                 rubro: bk.rubro || 'Restaurados',
                                 marca: bk.marca || 'Genérica',
                                 cantidadUnidades: ajuste.cantidad,
                                 precios: bk.precios,
                                 unidadesPorCaja: bk.unidadesPorCaja,
                                 unidadesPorPaquete: bk.unidadesPorPaquete,
                                 ventaPor: bk.ventaPor
                             };
                         }
                         transaction.set(ajuste.ref, dataToSet, { merge: true });
                    }

                    if (clienteDoc.exists()) {
                        let modificado = false;
                        for (const tipo in ajustesVaciosNetos) {
                            if (ajustesVaciosNetos[tipo] !== 0) {
                                nuevosSaldoVaciosCliente[tipo] = (nuevosSaldoVaciosCliente[tipo] || 0) + ajustesVaciosNetos[tipo];
                                modificado = true;
                            }
                        }
                        if (modificado) transaction.update(clienteRef, { saldoVacios: nuevosSaldoVaciosCliente });
                    }
                    transaction.delete(ventaRef);
                });
                _showModal('Éxito', 'Venta eliminada. Inventario y saldos de vacíos ajustados.');
            } catch (error) { console.error("Error eliminando:", error); _showModal('Error', `No se pudo eliminar: ${error.message}`); }
        }, 'Sí, Eliminar y Revertir', null, true);
    }

    async function showEditVentaView(venta) {
        if (_floatingControls) _floatingControls.classList.add('hidden'); _monedaActual = 'USD';
        
        _mainContent.innerHTML = window.ventasUI.getEditSaleTemplate(venta, TIPOS_VACIO);
        
        document.getElementById('saveChangesBtn').addEventListener('click', handleGuardarVentaEditada); 
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasActualesView);
        
        _showModal('Progreso', 'Cargando datos de la venta...', null, '', null, false);
        try {
            await ensureHybridCacheLoaded();
            
            _ventaActual = { 
                cliente: { id: venta.clienteId, nombreComercial: venta.clienteNombre, nombrePersonal: venta.clienteNombrePersonal }, 
                productos: (venta.productos||[]).reduce((acc,p)=>{
                    const pComp=_inventarioCache.find(inv=>inv.id===p.id)||p; 
                    const cant=p.cantidadVendida||{}; 
                    acc[p.id]={
                        ...pComp, 
                        cantCj:cant.cj||0, 
                        cantPaq:cant.paq||0, 
                        cantUnd:cant.und||0, 
                        totalUnidadesVendidas:p.totalUnidadesVendidas||0
                    }; 
                    return acc;
                },{}), 
                vaciosDevueltosPorTipo: venta.vaciosDevueltosPorTipo||{} 
            };
            TIPOS_VACIO.forEach(t => { if(!_ventaActual.vaciosDevueltosPorTipo[t]) _ventaActual.vaciosDevueltosPorTipo[t]=0; });
            document.getElementById('rubroFilter').addEventListener('change', renderEditVentasInventario); 
            populateRubroFilter(); 
            document.getElementById('rubroFilter').value = '';
            
            renderEditVentasInventario(); 
            const m = document.getElementById('modalContainer'); if(m) m.classList.add('hidden');
        } catch (error) { 
            console.error("Error edit init:", error); 
            _showModal('Error', `Error al inicializar edición: ${error.message}`); 
            showVentasActualesView(); 
        }
    }

    async function handleGuardarVentaEditada() {
        if (!_originalVentaForEdit) { _showModal('Error', 'Venta original no encontrada.'); return; }
        const prods = Object.values(_ventaActual.productos).filter(p => p.totalUnidadesVendidas > 0);
        const hayVac = Object.values(_ventaActual.vaciosDevueltosPorTipo || {}).some(c => c > 0);
        if (prods.length === 0 && !hayVac && Object.values(_originalVentaForEdit.vaciosDevueltosPorTipo || {}).every(c => c === 0)) { _showModal('Error', 'La venta no puede quedar vacía.'); return; }

        _showModal('Confirmar Cambios', '¿Guardar cambios? Stock y saldos se ajustarán.', async () => {
            _showModal('Progreso', 'Guardando y ajustando...');
            try {
                const ventaRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/ventas`, _originalVentaForEdit.id);
                const clientRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`, _originalVentaForEdit.clienteId);

                if (!_runTransaction) throw new Error("Dependencia crítica 'runTransaction' no disponible.");

                await _runTransaction(_db, async (transaction) => {
                      const origProds = new Map((_originalVentaForEdit.productos||[]).map(p=>[p.id,p]));
                      const newProds = new Map(Object.values(_ventaActual.productos).map(p=>[p.id,p]));
                      const allPIds = new Set([...origProds.keys(),...newProds.keys()]);
                      const clientDoc = await transaction.get(clientRef);
                      
                      const invRefs = [];
                      allPIds.forEach(id => { invRefs.push({ id: id, ref: _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, id) }); });
                      const invDocs = await Promise.all(invRefs.map(item => transaction.get(item.ref)));
                      const invMap = new Map();
                      invDocs.forEach((doc, i) => { if (doc.exists()) invMap.set(invRefs[i].id, doc); });

                      const vaciosAdj = {}; TIPOS_VACIO.forEach(t=>vaciosAdj[t]=0);
                      
                      for (const pId of allPIds) {
                          const origP = origProds.get(pId);
                          const newP = newProds.get(pId);
                          const origU = origP ? (origP.totalUnidadesVendidas||0) : 0;
                          const newU = newP ? (newP.totalUnidadesVendidas||0) : 0;
                          const deltaU = origU - newU; 

                          const invDoc = invMap.get(pId);
                          
                          if (!invDoc) { 
                              if (deltaU < 0) throw new Error(`Producto ${pId} no existe, imposible vender más.`); 
                              if (deltaU > 0) {
                                  const ref = invRefs.find(r=>r.id===pId).ref;
                                  transaction.set(ref, { 
                                      cantidadUnidades: deltaU,
                                      presentacion: origP.presentacion || 'Restaurado (Edit)',
                                      rubro: origP.rubro || 'Varios'
                                  }, { merge: true });
                                  continue;
                              }
                          }
                          
                          if (invDoc) {
                              const pData = invDoc.data();
                              if (deltaU !== 0) {
                                  const currentStock = pData.cantidadUnidades || 0;
                                  if ((currentStock + deltaU) < 0) throw new Error(`Stock insuficiente: ${pData.presentacion}`);
                                  transaction.update(invRefs.find(r=>r.id===pId).ref, { cantidadUnidades: currentStock + deltaU });
                              }

                              if (pData.manejaVacios && pData.tipoVacio) {
                                  const tV = pData.tipoVacio;
                                  const deltaCj = (newP?.cantCj || 0) - (origP?.cantidadVendida?.cj || 0); 
                                  if (vaciosAdj.hasOwnProperty(tV)) vaciosAdj[tV] += deltaCj;
                              }
                          }
                      }

                      const origVac = _originalVentaForEdit.vaciosDevueltosPorTipo || {};
                      const newVac = _ventaActual.vaciosDevueltosPorTipo || {};
                      TIPOS_VACIO.forEach(t => { if (vaciosAdj.hasOwnProperty(t)) vaciosAdj[t] -= ((newVac[t] || 0) - (origVac[t] || 0)); });

                      if (clientDoc.exists() && Object.values(vaciosAdj).some(a => a !== 0)) {
                          const sVac = clientDoc.data().saldoVacios || {};
                          for (const tV in vaciosAdj) if (vaciosAdj[tV] !== 0) sVac[tV] = (sVac[tV] || 0) + vaciosAdj[tV];
                          transaction.update(clientRef, { saldoVacios: sVac });
                      }

                      let nTotal = 0;
                      const nItems = Object.values(_ventaActual.productos).filter(p => p.totalUnidadesVendidas > 0).map(p => {
                          const pr = p.precios || { und: p.precioPorUnidad || 0 };
                          nTotal += (pr.cj || 0) * (p.cantCj || 0) + (pr.paq || 0) * (p.cantPaq || 0) + (pr.und || 0) * (p.cantUnd || 0);
                          return {
                              id: p.id, presentacion: p.presentacion, rubro: p.rubro, marca: p.marca, segmento: p.segmento,
                              precios: p.precios, ventaPor: p.ventaPor, unidadesPorPaquete: p.unidadesPorPaquete, unidadesPorCaja: p.unidadesPorCaja,
                              cantidadVendida: { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 },
                              totalUnidadesVendidas: (p.cantCj||0)*(p.unidadesPorCaja||1) + (p.cantPaq||0)*(p.unidadesPorPaquete||1) + (p.cantUnd||0), 
                              iva: p.iva ?? 0, manejaVacios: p.manejaVacios || false, tipoVacio: p.tipoVacio || null
                          };
                      });
                      
                      transaction.update(ventaRef, { productos: nItems, total: nTotal, vaciosDevueltosPorTipo: _ventaActual.vaciosDevueltosPorTipo, fechaModificacion: new Date() });
                });
                _originalVentaForEdit=null; _showModal('Éxito','Venta actualizada.', showVentasActualesView);
            } catch (error) { console.error("Error edit:", error); _showModal('Error', `Error: ${error.message}`); }
        }, 'Sí, Guardar', null, true);
    }

    window.ventasModule = { toggleMoneda, handleQuantityChange, handleTipoVacioChange, showPastSaleOptions, editVenta, deleteVenta, invalidateCache: () => { } };
})();

(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _activeListeners;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _deleteDoc, _getDocs, _writeBatch, _runTransaction, _query, _where;

    let _clientesCache = [];
    let _inventarioCache = [];
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
    };

    window.showVentasView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        // REFACTOR: Usando Template UI
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
        
        // REFACTOR: Usando Template UI
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
        const clientesRef = _collection(_db, `artifacts/ventas-9a210/public/data/clientes`);
        const unsubClientes = _onSnapshot(clientesRef, snap => { _clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); }, err => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') return;
            console.error("Error clientes:", err); 
        });
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubInventario = _onSnapshot(inventarioRef, snap => { 
            _inventarioCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
            populateRubroFilter(); 
            if (_ventaActual.cliente) renderVentasInventario(); 
        }, err => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') return;
            console.error("Error inventario:", err); 
            const b = document.getElementById('inventarioTableBody'); if(b) b.innerHTML = '<tr><td colspan="4" class="text-red-500">Error inventario</td></tr>'; 
        });
        _activeListeners.push(unsubClientes, unsubInventario);
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
        _ventaActual.cliente = cliente; document.getElementById('client-search-container').classList.add('hidden'); document.getElementById('clienteDropdown').classList.add('hidden');
        document.getElementById('selected-client-name').textContent = cliente.nombreComercial; document.getElementById('client-display-container').classList.remove('hidden');
        document.getElementById('inventarioTableContainer').classList.remove('hidden'); document.getElementById('venta-footer-section').classList.remove('hidden'); document.getElementById('vacios-devueltos-section').classList.remove('hidden');
        renderVentasInventario();
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
        
        const sortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';
        // REFACTOR: Llamada a ventasUI
        body.innerHTML = window.ventasUI.getInventoryTableRows(filtInv, _ventaActual.productos, _monedaActual, _tasaCOP, _tasaBs, sortKey);
        
        updateVentaTotal();
    }

    async function renderEditVentasInventario() {
        const body = document.getElementById('inventarioTableBody'), rF = document.getElementById('rubroFilter'); if (!body || !rF) return; body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">Cargando...</td></tr>`;
        
        const selRubro = rF.value; 
        let invToShow = _inventarioCache.filter(p => _originalVentaForEdit.productos.some(oP => oP.id === p.id) || (p.cantidadUnidades || 0) > 0);
        if (selRubro) invToShow = invToShow.filter(p => p.rubro === selRubro);
        
        const sortFunc = await window.getGlobalProductSortFunction(); 
        invToShow.sort(sortFunc);
        
        // Lógica especial para Edit: Sumar lo que ya se vendió al stock disponible para mostrar el "potencial" completo
        const mappedInv = invToShow.map(p => {
             const copy = { ...p };
             const orig = _originalVentaForEdit.productos.find(op => op.id === p.id);
             if (orig) {
                 copy.cantidadUnidades = (copy.cantidadUnidades || 0) + (orig.totalUnidadesVendidas || 0);
             }
             return copy;
        });

        const sortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';
        // REFACTOR: Reutilizamos la misma tabla de UI
        body.innerHTML = window.ventasUI.getInventoryTableRows(mappedInv, _ventaActual.productos, _monedaActual, _tasaCOP, _tasaBs, sortKey);

        updateVentaTotal();
    }

    function handleQuantityChange(event) {
        const inp=event.target, pId=inp.dataset.productId, tV=inp.dataset.tipoVenta, prod=_inventarioCache.find(p=>p.id===pId); if(!prod) return; if(!_ventaActual.productos[pId]) _ventaActual.productos[pId]={...prod, cantCj:0,cantPaq:0,cantUnd:0,totalUnidadesVendidas:0};
        const qty=parseInt(inp.value,10)||0; _ventaActual.productos[pId][`cant${tV[0].toUpperCase()+tV.slice(1)}`]=qty; const pV=_ventaActual.productos[pId], uCj=pV.unidadesPorCaja||1, uPaq=pV.unidadesPorPaquete||1;
        
        // Calcular Stock Disponible (Considerando si estamos en edición)
        let stockU = prod.cantidadUnidades || 0;
        if (_originalVentaForEdit) {
             const origP = _originalVentaForEdit.productos.find(op => op.id === pId);
             if (origP) stockU += (origP.totalUnidadesVendidas || 0);
        }

        const totU=(pV.cantCj*uCj)+(pV.cantPaq*uPaq)+(pV.cantUnd||0); 
        
        if(totU > stockU){ 
            _showModal('Stock Insuficiente',`Ajustado.`); 
            let ex=totU-stockU; 
            if(tV==='cj')inp.value=Math.max(0,qty-Math.ceil(ex/uCj)); 
            else if(tV==='paq')inp.value=Math.max(0,qty-Math.ceil(ex/uPaq)); 
            else inp.value=Math.max(0,qty-ex); 
            handleQuantityChange({target:inp}); 
            return; 
        }
        pV.totalUnidadesVendidas=totU; if(totU===0&&pV.cantCj===0&&pV.cantPaq===0&&pV.cantUnd===0) delete _ventaActual.productos[pId]; updateVentaTotal();
    };

    function handleTipoVacioChange(event) { const inp=event.target, tipo=inp.dataset.tipoVacio, cant=parseInt(inp.value,10)||0; if(tipo&&_ventaActual.vaciosDevueltosPorTipo.hasOwnProperty(tipo)) _ventaActual.vaciosDevueltosPorTipo[tipo]=cant; }

    function updateVentaTotal() {
        const tEl=document.getElementById('ventaTotal'); if(!tEl) return;
        const tUSD=Object.values(_ventaActual.productos).reduce((s,p)=>{const pr=p.precios||{und:p.precioPorUnidad||0}; return s+(pr.cj||0)*(p.cantCj||0)+(pr.paq||0)*(p.cantPaq||0)+(pr.und||0)*(p.cantUnd||0);},0);
        if(_monedaActual==='COP'&&_tasaCOP>0)tEl.textContent=`Total: COP ${(Math.ceil((tUSD*_tasaCOP)/100)*100).toLocaleString('es-CO')}`; else if(_monedaActual==='Bs'&&_tasaBs>0)tEl.textContent=`Total: Bs.S ${(tUSD*_tasaBs).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`; else tEl.textContent=`Total: $${tUSD.toFixed(2)}`;
    }

    // Funciones handleShareTicket, handleShareRawText...
    async function handleShareTicket(htmlContent, callbackDespuesDeCompartir) {
         _showModal('Progreso', 'Generando imagen...');
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
    function copyToClipboard(textContent, callbackDespuesDeCopia) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textContent)
                .then(() => { _showModal('Copiado', 'Texto copiado.'); if(callbackDespuesDeCopia) callbackDespuesDeCopia(true); })
                .catch(err => legacyCopyToClipboard(textContent, callbackDespuesDeCopia)); 
        } else {
            legacyCopyToClipboard(textContent, callbackDespuesDeCopia); 
        }
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
        document.getElementById('printTextBtn').addEventListener('click', () => { 
            // REFACTOR: Llamada a ventasUI
            const rawText = window.ventasUI.getTicketRawText(venta, productos, vaciosDevueltosPorTipo); 
            handleShareRawText(rawText, callbackFinal); 
        });
        document.getElementById('shareImageBtn').addEventListener('click', () => { 
            // REFACTOR: Llamada a ventasUI
            const html = window.ventasUI.getTicketHTML(venta, productos, vaciosDevueltosPorTipo, tipo); 
            handleShareTicket(html, callbackFinal); 
        });
    }

    async function _processAndSaveVenta() {
        console.log("Starting _processAndSaveVenta (Transaction)...");
        const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
        const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
        try {
            const snapshotDoc = await _getDoc(snapshotRef);
            if (!snapshotDoc.exists()) {
                 console.log("Primera venta del día detectada. Guardando snapshot...");
                 if (_inventarioCache && _inventarioCache.length > 0) {
                     await _setDoc(snapshotRef, { inventario: _inventarioCache, fecha: new Date() });
                 }
            }
        } catch (e) { console.warn("Snapshot check failed", e); }

        const prodsParaGuardar = Object.values(_ventaActual.productos);
        if (prodsParaGuardar.length === 0 && Object.values(_ventaActual.vaciosDevueltosPorTipo).every(v => v === 0)) {
             throw new Error("No hay productos ni vacíos para guardar.");
        }

        const ventaRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
        const clientRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, _ventaActual.cliente.id);

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
                    if (!invDoc.exists()) throw `Producto ${item.presentacion} no existe en inventario.`;
                    
                    const currentStock = invDoc.data().cantidadUnidades || 0;
                    if (currentStock < item.qty) {
                        throw `Stock insuficiente para ${item.presentacion}. Disponible: ${currentStock}, Solicitado: ${item.qty}`;
                    }

                    if (item.qty > 0) {
                        transaction.update(item.ref, { cantidadUnidades: currentStock - item.qty });
                    }

                    const p = prodsParaGuardar.find(prod => prod.id === item.id);
                    const precios = p.precios || { und: p.precioPorUnidad || 0 };
                    const sub = (precios.cj || 0) * (p.cantCj || 0) + (precios.paq || 0) * (p.cantPaq || 0) + (precios.und || 0) * (p.cantUnd || 0);
                    totalVenta += sub;

                    if (invDoc.data().manejaVacios && invDoc.data().tipoVacio) {
                        const tV = invDoc.data().tipoVacio;
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

    async function generarTicket() {
        if (!_ventaActual.cliente) { _showModal('Error', 'Selecciona cliente.'); return; }
        const prods = Object.values(_ventaActual.productos);
        const hayVac = Object.values(_ventaActual.vaciosDevueltosPorTipo).some(c => c > 0);
        if (prods.length === 0 && !hayVac) { _showModal('Error', 'Agrega productos o registra vacíos devueltos.'); return; }

        _showModal('Confirmar Venta', '¿Guardar esta transacción?', async () => {
            _showModal('Progreso', 'Guardando transacción...'); 
            try {
                const savedData = await _processAndSaveVenta();
                showSharingOptions(
                    { cliente: _ventaActual.cliente, fecha: savedData.venta.fecha }, 
                    savedData.productos, 
                    savedData.vaciosDevueltosPorTipo, 
                    'Nota de Entrega',
                    () => { _showModal('Éxito', 'Venta registrada y ticket generado/compartido.', showNuevaVentaView); }
                );
            } catch (saveError) {
                console.error("Error al guardar venta:", saveError);
                 const progressModal = document.getElementById('modalContainer'); 
                 if(progressModal && !progressModal.classList.contains('hidden') && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                       progressModal.classList.add('hidden');
                 }
                _showModal('Error', `Error al guardar la venta: ${saveError.message || saveError}`);
            }
            return false; 
        }, 'Sí, guardar', () => { }, true); 
    }

    function showVentasTotalesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        // REFACTOR: Usando Template UI
        _mainContent.innerHTML = window.ventasUI.getSalesMenuTemplate();
        
        document.getElementById('ventasActualesBtn').addEventListener('click', showVentasActualesView);
        document.getElementById('cierreVentasBtn').addEventListener('click', showCierreSubMenuView);
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasView);
    }

    function showVentasActualesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 w-full"> <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                <div class="flex justify-between items-center mb-6"> <h2 class="text-2xl font-bold">Ventas Actuales</h2> <button id="backToVentasTotalesBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button> </div>
                <div id="ventasListContainer" class="overflow-x-auto"><p class="text-center text-gray-500">Cargando...</p></div>
            </div> </div>
        `;
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
        renderVentasList();
    }

    function renderVentasList() {
        const cont = document.getElementById('ventasListContainer'); if (!cont) return;
        const vRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`); const q = _query(vRef);
        const unsub = _onSnapshot(q, (snap) => {
            _ventasGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() })); _ventasGlobal.sort((a,b)=>(b.fecha?.toDate()??0)-(a.fecha?.toDate()??0));
            // REFACTOR: Usando Template UI
            cont.innerHTML = window.ventasUI.getSalesListTemplate(_ventasGlobal);
        }, (err) => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') return;
            console.error("Error lista ventas:", err); 
            if(cont) cont.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; 
        });
        _activeListeners.push(unsub);
    }

    function showCierreSubMenuView() {
        // REFACTOR: Usando Template UI
         _mainContent.innerHTML = window.ventasUI.getClosingMenuTemplate();
         
        document.getElementById('verCierreBtn').addEventListener('click', showVerCierreView);
        document.getElementById('ejecutarCierreBtn').addEventListener('click', ejecutarCierre);
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
    }

    async function showVerCierreView() {
        _showModal('Progreso', 'Generando reporte...');
        const ventasSnapshot = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
        const ventas = ventasSnapshot.docs.map(doc => doc.data());
        
        const obsequiosSnapshot = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
        const obsequios = obsequiosSnapshot.docs.map(doc => doc.data());

        const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
        let cargaInicialInventario = [];
        try {
            const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
            const snapshotDoc = await _getDoc(snapshotRef);
            if (snapshotDoc.exists() && snapshotDoc.data().inventario) {
                cargaInicialInventario = snapshotDoc.data().inventario;
            }
        } catch (snapError) { console.warn("Error snapshot cierre:", snapError); }

        if (ventas.length === 0 && obsequios.length === 0) {
            _showModal('Aviso', 'No hay ventas ni obsequios.');
            return;
        }
        
        try {
            if (!window.dataModule || !window.dataModule._processSalesDataForModal || !window.dataModule.getDisplayQty) {
                throw new Error("Módulo de datos no disponible.");
            }

            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo } = 
                await window.dataModule._processSalesDataForModal(ventas, obsequios, cargaInicialInventario, _userId);

            let hHTML = `<tr class="sticky top-0 z-20 bg-gray-200"><th class="p-1 border sticky left-0 z-30 bg-gray-200">Cliente</th>`;
            finalProductOrder.forEach(p => { hHTML += `<th class="p-1 border whitespace-nowrap text-xs" title="${p.marca||''} - ${p.segmento||''}">${p.presentacion}</th>`; });
            hHTML += `<th class="p-1 border sticky right-0 z-30 bg-gray-200">Total Cliente</th></tr>`;
            
            let bHTML=''; 
            sortedClients.forEach(cli=>{
                const cCli = clientData[cli]; 
                const esSoloObsequio = !clientTotals.hasOwnProperty(cli) && cCli.totalValue === 0 && Object.values(cCli.products).some(q => q > 0);
                const rowClass = esSoloObsequio ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-blue-50';
                const clientNameDisplay = esSoloObsequio ? `${cli} (OBSEQUIO)` : cli;

                bHTML+=`<tr class="${rowClass}"><td class="p-1 border font-medium bg-white sticky left-0 z-10">${clientNameDisplay}</td>`; 
                finalProductOrder.forEach(p=>{
                    const qU=cCli.products[p.id]||0; 
                    const qtyDisplay = window.dataModule.getDisplayQty(qU, p);
                    let dQ = (qU > 0) ? `${qtyDisplay.value}` : '';
                    let cellClass = '';
                    if (qU > 0 && esSoloObsequio) {
                        cellClass = 'font-bold';
                        dQ += ` ${qtyDisplay.unit}`;
                    }
                    bHTML+=`<td class="p-1 border text-center ${cellClass}">${dQ}</td>`;
                }); 
                bHTML+=`<td class="p-1 border text-right font-semibold bg-white sticky right-0 z-10">$${cCli.totalValue.toFixed(2)}</td></tr>`;
            });

            let fHTML='<tr class="bg-gray-200 font-bold"><td class="p-1 border sticky left-0 z-10">TOTALES</td>'; 
            finalProductOrder.forEach(p=>{
                let tQ=0; 
                sortedClients.forEach(cli=>tQ+=clientData[cli].products[p.id]||0); 
                const qtyDisplay = window.dataModule.getDisplayQty(tQ, p);
                let dT = (tQ > 0) ? `${qtyDisplay.value} ${qtyDisplay.unit}` : '';
                fHTML+=`<td class="p-1 border text-center">${dT}</td>`;
            }); 
            fHTML+=`<td class="p-1 border text-right sticky right-0 z-10">$${grandTotalValue.toFixed(2)}</td></tr>`;
            
            let vHTML=''; const cliVacios=Object.keys(vaciosMovementsPorTipo).filter(cli=>TIPOS_VACIO.some(t=>(vaciosMovementsPorTipo[cli][t]?.entregados||0)>0||(vaciosMovementsPorTipo[cli][t]?.devueltos||0)>0)).sort(); if(cliVacios.length>0){ vHTML=`<h3 class="text-xl my-6">Reporte Vacíos</h3><div class="overflow-auto border"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Entregados</th><th>Devueltos</th><th>Neto</th></tr></thead><tbody>`; cliVacios.forEach(cli=>{const movs=vaciosMovementsPorTipo[cli]; TIPOS_VACIO.forEach(t=>{const mov=movs[t]||{e:0,d:0}; if(mov.entregados>0||mov.devueltos>0){const neto=mov.entregados-mov.devueltos; const nClass=neto>0?'text-red-600':(neto<0?'text-green-600':''); vHTML+=`<tr><td>${cli}</td><td>${t}</td><td>${mov.entregados}</td><td>${mov.devueltos}</td><td class="${nClass}">${neto>0?`+${neto}`:neto}</td></tr>`;}});}); vHTML+='</tbody></table></div>';}
            
            const reportHTML = `<div class="text-left max-h-[80vh] overflow-auto"> <h3 class="text-xl font-bold mb-4">Reporte Cierre</h3> <div class="overflow-auto border"> <table class="min-w-full bg-white text-xs"> <thead class="bg-gray-200">${hHTML}</thead> <tbody>${bHTML}</tbody> <tfoot>${fHTML}</tfoot> </table> </div> ${vHTML} </div>`;
            _showModal('Reporte de Cierre', reportHTML, null, 'Cerrar');
        } catch (error) { console.error("Error reporte:", error); _showModal('Error', `No se pudo generar: ${error.message}`); }
    }
    
    async function ejecutarCierre() {
        _showModal('Confirmar Cierre Definitivo', 'Generará Excel, archivará ventas y eliminará activas. IRREVERSIBLE. ¿Continuar?', async () => {
            _showModal('Progreso', 'Obteniendo ventas y obsequios...');
            
            const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`); 
            const ventasSnap = await _getDocs(ventasRef); 
            const ventas = ventasSnap.docs.map(d=>({id: d.id, ...d.data()}));
            
            const obsequiosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`);
            const obsequiosSnap = await _getDocs(obsequiosRef);
            const obsequios = obsequiosSnap.docs.map(d => ({id: d.id, ...d.data()}));

            if (ventas.length === 0 && obsequios.length === 0) { 
                _showModal('Aviso', 'No hay ventas ni obsequios activos.'); 
                return false; 
            }
            
            const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
            let cargaInicialInventario = [];
            const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
            try {
                const snapshotDoc = await _getDoc(snapshotRef);
                if (snapshotDoc.exists() && snapshotDoc.data().inventario) {
                    cargaInicialInventario = snapshotDoc.data().inventario;
                }
            } catch (snapError) {
                console.error("Error al leer snapshot de Carga Inicial durante el cierre:", snapError);
            }

            try {
                 _showModal('Progreso', 'Generando Excel...');
                 let vendedorInfo = {};
                 if (window.userRole === 'user') {
                     const uDocRef=_doc(_db,"users",_userId); const uDoc=await _getDoc(uDocRef); const uData=uDoc.exists()?uDoc.data():{};
                     vendedorInfo={userId:_userId,nombre:uData.nombre||'',apellido:uData.apellido||'',camion:uData.camion||'',email:uData.email||''};
                 }
                 const fechaCierre = new Date();
                 const cierreData = { 
                     fecha: fechaCierre, 
                     ventas: ventas.map(({id,...rest})=>rest), 
                     obsequios: obsequios.map(({id,...rest})=>rest),
                     total: ventas.reduce((s,v)=>s+(v.total||0),0),
                     cargaInicialInventario: cargaInicialInventario,
                     vendedorInfo: vendedorInfo
                 }; 
                 const cierreDataForExport = { ...cierreData, fecha: { toDate: () => fechaCierre } };

                 if (window.dataModule && typeof window.dataModule.exportSingleClosingToExcel === 'function') {
                    await window.dataModule.exportSingleClosingToExcel(cierreDataForExport);
                 } else {
                    console.error("Error: window.dataModule.exportSingleClosingToExcel no está definida.");
                 }
                 
                 _showModal('Progreso', 'Archivando y eliminando...');
                 const cDocRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/cierres`));
                 await _setDoc(cDocRef, cierreData);
                 
                 const batch = _writeBatch(_db); 
                 ventas.forEach(v => batch.delete(_doc(ventasRef, v.id)));
                 obsequios.forEach(o => batch.delete(_doc(obsequiosRef, o.id)));
                 batch.delete(snapshotRef);
                 await batch.commit();

                _showModal('Éxito', 'Cierre completado.', showVentasTotalesView); return true;
            } catch(e) { console.error("Error cierre:", e); _showModal('Error', `Error: ${e.message}`); return false; }
        }, 'Sí, Ejecutar Cierre', null, true);
    }

    function showPastSaleOptions(ventaId, tipo = 'ticket') {
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (!venta) { _showModal('Error', 'Venta no encontrada.'); return; }
        const productosFormateados = (venta.productos || []).map(p => ({
            ...p,
            cantidadVendida: p.cantidadVendida || { cj: 0, paq: 0, und: 0 },
            totalUnidadesVendidas: p.totalUnidadesVendidas || 0,
            precios: p.precios || { und: 0, paq: 0, cj: 0 }
        }));
        showSharingOptions(venta, productosFormateados, venta.vaciosDevueltosPorTipo || {}, tipo, showVentasActualesView);
    }

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
                const clienteRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, venta.clienteId);

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
                                ajustesInventario.push({ ref: productoInventarioRef, cantidad: unidadesARestaurar, id: productoVendido.id });
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
                         const stockActual = invDoc && invDoc.exists() ? (invDoc.data().cantidadUnidades || 0) : 0;
                         transaction.set(ajuste.ref, { cantidadUnidades: stockActual + ajuste.cantidad }, { merge: true });
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
        
        // REFACTOR: Template UI
        _mainContent.innerHTML = window.ventasUI.getEditSaleTemplate(venta, TIPOS_VACIO);
        
        document.getElementById('saveChangesBtn').addEventListener('click', handleGuardarVentaEditada); 
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasActualesView);
        
        _showModal('Progreso', 'Cargando datos...');
        try {
            const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`)); _inventarioCache = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _ventaActual = { cliente: { id: venta.clienteId, nombreComercial: venta.clienteNombre, nombrePersonal: venta.clienteNombrePersonal }, productos: (venta.productos||[]).reduce((acc,p)=>{const pComp=_inventarioCache.find(inv=>inv.id===p.id)||p; const cant=p.cantidadVendida||{}; acc[p.id]={...pComp, cantCj:cant.cj||0, cantPaq:cant.paq||0, cantUnd:cant.und||0, totalUnidadesVendidas:p.totalUnidadesVendidas||0}; return acc;},{}), vaciosDevueltosPorTipo: venta.vaciosDevueltosPorTipo||{} };
            TIPOS_VACIO.forEach(t => { if(!_ventaActual.vaciosDevueltosPorTipo[t]) _ventaActual.vaciosDevueltosPorTipo[t]=0; });
            document.getElementById('rubroFilter').addEventListener('change', renderEditVentasInventario); populateRubroFilter(); document.getElementById('rubroFilter').value = '';
            
            renderEditVentasInventario(); 
            document.getElementById('modalContainer').classList.add('hidden');
        } catch (error) { console.error("Error edit init:", error); _showModal('Error', `Error: ${error.message}`); showVentasActualesView(); }
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
                const clientRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, _originalVentaForEdit.clienteId);

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
                         if (!invDoc) { if (deltaU < 0) throw `Producto ${pId} no existe, imposible vender más.`; continue; }
                         
                         const pData = invDoc.data();
                         if (deltaU !== 0) {
                             const currentStock = pData.cantidadUnidades || 0;
                             if ((currentStock + deltaU) < 0) throw `Stock insuficiente: ${pData.presentacion}`;
                             transaction.update(invRefs.find(r=>r.id===pId).ref, { cantidadUnidades: currentStock + deltaU });
                         }

                         if (pData.manejaVacios && pData.tipoVacio) {
                             const tV = pData.tipoVacio;
                             const deltaCj = (newP?.cantCj || 0) - (origP?.cantidadVendida?.cj || 0); 
                             if (vaciosAdj.hasOwnProperty(tV)) vaciosAdj[tV] += deltaCj;
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

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
        
        console.log("Módulo Ventas inicializado (Subtotales en UI Restaurados). Public ID:", PUBLIC_DATA_ID);
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

      let _clienteSearchDebounce = null;
      clienteSearchInput.addEventListener('input', () => {
          clearTimeout(_clienteSearchDebounce);
          _clienteSearchDebounce = setTimeout(() => {
              const term = clienteSearchInput.value.toLowerCase();
              const filtered = _clientesCache.filter(c=>(c.nombreComercial||'').toLowerCase().includes(term)||(c.nombrePersonal||'').toLowerCase().includes(term));
              renderClienteDropdown(filtered);
              document.getElementById('clienteDropdown').classList.remove('hidden');
          }, 200);
      });

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
        
        if (window.getGlobalProductSortFunction) {
            const sortFunc = await window.getGlobalProductSortFunction();
            filtInv.sort(sortFunc);
        }
        
        body.innerHTML = window.ventasUI.getInventoryTableRows(filtInv, _ventaActual.productos, _monedaActual, _tasaCOP, _tasaBs, 'segmento');
        
        updateVentaTotal();
    }

    async function renderEditVentasInventario() {
        const body = document.getElementById('inventarioTableBody'), rF = document.getElementById('rubroFilter'); if (!body || !rF) return; body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">Cargando...</td></tr>`;
        
        const selRubro = rF.value; 
        let invToShow = _inventarioCache.filter(p => _originalVentaForEdit.productos.some(oP => oP.id === p.id) || (p.cantidadUnidades || 0) > 0);
        if (selRubro) invToShow = invToShow.filter(p => p.rubro === selRubro);
        
        if (window.getGlobalProductSortFunction) {
            const sortFunc = await window.getGlobalProductSortFunction(); 
            invToShow.sort(sortFunc);
        }
        
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
        const tempDiv = document.createElement('div'); 
        tempDiv.style.position = 'absolute'; 
        tempDiv.style.left = '-9999px'; 
        tempDiv.style.top = '0'; 
        tempDiv.innerHTML = htmlContent; 
        document.body.appendChild(tempDiv);
        
        const ticketElement = tempDiv.querySelector('#temp-ticket-for-image') || tempDiv.firstElementChild;
        
        if (!ticketElement) { _showModal('Error', 'No se pudo encontrar elemento ticket.'); document.body.removeChild(tempDiv); if(callbackDespuesDeCompartir) callbackDespuesDeCompartir(false); return; }
        try { 
            await new Promise(resolve => setTimeout(resolve, 100)); 
            const canvas = await html2canvas(ticketElement, { scale: 3 }); 
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            
            if (navigator.share && blob) { 
                await navigator.share({ files: [new File([blob], "venta.png", { type: "image/png" })], title: "Ticket de Venta" }); 
            } else { 
              _showModal('Error', 'Función compartir no disponible.'); 
          }
          if(callbackDespuesDeCompartir) callbackDespuesDeCompartir(true);
      } catch(e) { 
          _showModal('Error', `No se pudo generar/compartir: ${e.message}`); 
          if(callbackDespuesDeCompartir) callbackDespuesDeCompartir(false); 
      } finally { 
          document.body.removeChild(tempDiv); 
      }
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

  function showSharingOptions(venta, productos, vaciosDevueltosPorTipo, tipo, callbackFinal, tipoOperacion) {
      const modalContent = `<div class="text-center"><h3 class="text-xl font-bold mb-4">Generar ${tipo}</h3><p class="mb-6">Elige formato.</p><div class="space-y-4"><button id="printTextBtn" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-bold shadow">Imprimir (Texto)</button><button id="shareImageBtn" class="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow">Compartir (Imagen)</button></div></div>`;
        _showModal('Elige opción', modalContent, null, ''); 
        
        setTimeout(() => {
            const printBtn = document.getElementById('printTextBtn');
            const shareBtn = document.getElementById('shareImageBtn');
            
            if (printBtn) {
                printBtn.addEventListener('click', () => { 
    const rawText = window.ventasUI.getTicketRawText(venta, productos, vaciosDevueltosPorTipo, tipoOperacion); 
                  handleShareRawText(rawText, callbackFinal); 
                });
            }
            if (shareBtn) {
                shareBtn.addEventListener('click', () => { 
                  const html = window.ventasUI.getTicketHTML(venta, productos, vaciosDevueltosPorTipo, tipo, tipoOperacion); 
                  handleShareTicket(html, callbackFinal); 
                });
            }
        }, 150);
    }

    async function _processAndSaveVenta() {
        const tipoOperacionSelect = document.getElementById('tipoOperacionSelect');
        const tipoOperacion = tipoOperacionSelect ? tipoOperacionSelect.value : 'venta';

        const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/auditoriaBaseSnapshot`;
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
              origen: "offline",
              tipoOperacion: tipoOperacion
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
                      vaciosDevueltosPorTipo: _ventaActual.vaciosDevueltosPorTipo,
                      origen: "offline",
                      tipoOperacion: tipoOperacion
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

    let _isSavingVenta = false; // Guardia contra doble-clic / doble-tap al guardar

    async function generarTicket() {
        if (!_ventaActual.cliente) { _showModal('Error', 'Selecciona cliente.'); return; }
        const prods = Object.values(_ventaActual.productos);
        const hayVac = Object.values(_ventaActual.vaciosDevueltosPorTipo).some(c => c > 0);
        if (prods.length === 0 && !hayVac) { _showModal('Error', 'Agrega productos o registra vacíos devueltos.'); return; }

      const ticketBtn = document.getElementById('generarTicketBtn');

      _showModal('Confirmar Operación', '¿Guardar esta transacción?', async () => {
          // Si ya hay un guardado en curso, ignorar confirmaciones repetidas
          if (_isSavingVenta) return false;
          _isSavingVenta = true;
          if (ticketBtn) { ticketBtn.disabled = true; ticketBtn.classList.add('opacity-50', 'cursor-not-allowed'); }

          _showModal('Progreso', 'Guardando transacción...', null, '', null, false); 
          const hideProgress = () => { const pModal = document.getElementById('modalContainer'); if (pModal) pModal.classList.add('hidden'); };
          try {
                const savedData = await _processAndSaveVenta();
                hideProgress();
              
                setTimeout(() => {
                    showSharingOptions(
                        { cliente: _ventaActual.cliente, fecha: savedData.venta.fecha }, 
                        savedData.productos, 
                      savedData.vaciosDevueltosPorTipo, 
                      'Nota de Entrega',
                      () => { _showModal('Éxito', 'Operación registrada y ticket generado/compartido.', showNuevaVentaView); },
                      savedData.venta.tipoOperacion
                    );
                }, 300);

            } catch (saveError) {
                console.error("Error al guardar venta:", saveError);
                hideProgress();
                _showModal('Error', `Error al guardar la venta: ${saveError.message || saveError}`);
            } finally {
                _isSavingVenta = false;
                if (ticketBtn) { ticketBtn.disabled = false; ticketBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
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
                    <h2 class="text-2xl font-bold text-gray-800">Ventas y Consignaciones Actuales</h2> 
                    <div class="flex gap-2 w-full md:w-auto">
                        <button id="descargarCierrePrevioBtn" class="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition font-bold flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Cierre Previo
                        </button>
                        <button id="backToVentasTotalesBtn" class="flex-1 md:flex-none px-4 py-2 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button> 
                    </div>
                </div>
                <div id="ventasListContainer" class="overflow-x-auto"><p class="text-center text-gray-500">Cargando...</p></div>
            </div></div>
        `;
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
        document.getElementById('descargarCierrePrevioBtn').addEventListener('click', handleDescargarCierrePrevio);
        renderVentasList();
  }

  // --- NUEVO MOTOR CRONOLÓGICO (Filtra las ventas después del Snapshot) ---
  async function calcularStockTeoricoExacto(userId, ventasActivas, obsequiosActivos) {
      await ensureHybridCacheLoaded();
        
        const AUDIT_SNAPSHOT_PATH = `artifacts/${_appId}/users/${userId}/config/auditoriaBaseSnapshot`;
        let baseItems = [];
        let fechaCargaInicial = new Date(0);
        
        const snapshotDoc = await _getDoc(_doc(_db, AUDIT_SNAPSHOT_PATH));
        if (snapshotDoc.exists()) {
            const data = snapshotDoc.data();
            baseItems = data.inventario || [];
            fechaCargaInicial = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
        }

        const [rSnapFull, cSnapFull, cierresSnapFull] = await Promise.all([
            _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/recargas`)),
            _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/historial_correcciones`)),
            _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/cierres`))
        ]);

        const recargas = rSnapFull.docs.map(d => d.data()).filter(r => (r.fecha?.toDate ? r.fecha.toDate() : new Date(r.fecha)) >= fechaCargaInicial);
        const correcciones = cSnapFull.docs.map(d => d.data()).filter(c => (c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha)) >= fechaCargaInicial);
        const cierresPasados = cierresSnapFull.docs.map(d => d.data()).filter(c => (c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha)) >= fechaCargaInicial);

      const ventasPostSnapshot = ventasActivas.filter(v => {
          const dObj = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
          return dObj >= fechaCargaInicial;
      });

      const obsequiosPostSnapshot = obsequiosActivos.filter(o => {
          const dObj = o.fecha?.toDate ? o.fecha.toDate() : new Date(o.fecha);
          return dObj >= fechaCargaInicial;
        });

        const cargaInicialExcelMap = new Map(); 

        baseItems.forEach(item => { 
            cargaInicialExcelMap.set(item.productoId || item.id, item.cantidadUnidades || 0); 
        });

        recargas.forEach(r => {
            (r.detalles || []).forEach(d => {
                cargaInicialExcelMap.set(d.productoId, (cargaInicialExcelMap.get(d.productoId) || 0) + (d.diferenciaUnidades || 0));
          });
      });

      correcciones.forEach(c => {
          if (c.tipoAjuste === 'LIMPIEZA_PROFUNDA') return;
          (c.detalles || []).forEach(d => {
              const ajuste = d.ajusteBase !== undefined ? d.ajusteBase : (d.ajuste !== undefined ? d.ajuste : (d.diferenciaUnidades || d.diferencia || 0));
              if (d.productoId && d.productoId !== 'ALL') {
                    cargaInicialExcelMap.set(d.productoId, (cargaInicialExcelMap.get(d.productoId) || 0) + ajuste);
                }
          });
      });

      cierresPasados.forEach(c => {
          (c.ventas || []).forEach(v => {
              (v.productos || []).forEach(vp => {
                  cargaInicialExcelMap.set(vp.id, (cargaInicialExcelMap.get(vp.id) || 0) - (vp.totalUnidadesVendidas || 0));
              });
          });
          (c.obsequios || []).forEach(o => {
              const pMaster = _masterCatalogCache[o.productoId] || { unidadesPorCaja: 1 };
              const factor = o.unidadesPorCaja || pMaster.unidadesPorCaja || 1;
              cargaInicialExcelMap.set(o.productoId, (cargaInicialExcelMap.get(o.productoId) || 0) - ((o.cantidadCajas || 0) * factor));
          });
      });

      const cargaParaExcel = [];
      cargaInicialExcelMap.forEach((qty, pId) => {
          if (qty > 0 || ventasPostSnapshot.some(v => v.productos.some(vp => vp.id === pId)) || obsequiosPostSnapshot.some(o => o.productoId === pId)) {
              const pMaster = _masterCatalogCache[pId] || {};
              cargaParaExcel.push({
                  productoId: pId,
                  presentacion: pMaster.presentacion || 'Desconocido',
                  rubro: pMaster.rubro || 'SIN RUBRO',
                  segmento: pMaster.segmento || 'SIN SEGMENTO',
                  marca: pMaster.marca || 'S/M',
                  cantidadUnidades: qty
              });
          }
      });

      return { cargaParaExcel, ventasPostSnapshot, obsequiosPostSnapshot };
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
          
          cont.innerHTML = window.ventasUI.getSalesListTemplate(_ventasGlobal);
            
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

    // --- NUEVO SISTEMA DE VISTA PREVIA FULL SCREEN (TABS POR HOJAS) ---
    async function showVerCierreView() {
        _showModal('Progreso', 'Generando vista previa interactiva...');
        try {
            const ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
            const ventas = ventasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const obsequiosSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
            const obsequios = obsequiosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (ventas.length === 0 && obsequios.length === 0) { 
                _showModal('Aviso', 'No hay ventas ni obsequios registrados.'); 
                return; 
            }

            const { cargaParaExcel, ventasPostSnapshot, obsequiosPostSnapshot } = await calcularStockTeoricoExacto(_userId, ventas, obsequios);

            if (!window.dataModule?._processSalesDataForModal) throw new Error("Módulo de datos no disponible.");

            // Extraemos finalData para obtener los subtotales por rubro
            const { clientData, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo, finalData } = 
                await window.dataModule._processSalesDataForModal(ventasPostSnapshot, obsequiosPostSnapshot, cargaParaExcel, _userId);

            const enrichedProductOrder = finalProductOrder.map(p => {
                const liveProd = _inventarioCache.find(inv => inv.id === p.id);
                return liveProd ? { ...p, ventaPor: liveProd.ventaPor, unidadesPorCaja: liveProd.unidadesPorCaja, unidadesPorPaquete: liveProd.unidadesPorPaquete } : p;
            });

            // Agrupar por Rubro para las pestañas
            const rubrosMap = {};
            enrichedProductOrder.forEach(p => {
                const r = p.rubro || 'SIN RUBRO';
                if(!rubrosMap[r]) rubrosMap[r] = [];
                rubrosMap[r].push(p);
            });
            const rubrosKeys = Object.keys(rubrosMap).sort();

            // Info Vendedor
            let vendedorInfo = {};
            if (window.userRole === 'user') {
                 const uDoc = await _getDoc(_doc(_db, "users", _userId));
                 const uData = uDoc.exists() ? uDoc.data() : {};
                 vendedorInfo = { userId: _userId, nombre: uData.nombre || '', apellido: uData.apellido || '', camion: uData.camion || '', email: uData.email || '' };
            }
            let vNameModal = vendedorInfo.nombre || 'Desconocido';
            if(!vendedorInfo.nombre && vendedorInfo.userId && window._usersMapCache && window._usersMapCache.has(vendedorInfo.userId)){
                 vNameModal = window._usersMapCache.get(vendedorInfo.userId).nombre;
            }
            const fechaCierreStr = new Date().toLocaleString('es-ES');

            const overlayId = 'fullScreenPreviewOverlay';
            const existing = document.getElementById(overlayId);
            if(existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = overlayId;
            overlay.className = 'fixed inset-0 z-[9999] bg-gray-100 flex flex-col overflow-hidden animate-fade-in font-sans';
            overlay.innerHTML = `<style>.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }</style>`;

            let html = `
                <div class="bg-gray-800 text-white p-3 sm:p-4 flex justify-between items-center shadow-md shrink-0">
                    <div>
                        <h2 class="text-lg sm:text-xl font-bold uppercase tracking-wider">Vista Previa de Cierre</h2>
                        <p class="text-xs sm:text-sm text-gray-300">Vend: ${vNameModal} ${vendedorInfo.apellido||''} | Camión: ${vendedorInfo.camion||'N/A'}</p>
                    </div>
                    <button id="closePreviewOverlayBtn" class="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded shadow font-bold transition-colors">Cerrar</button>
                </div>
            `;

            const sheets = [{ id: 'tab-consolidado', name: 'Consolidado', type: 'summary' }];
            rubrosKeys.forEach((r, i) => sheets.push({ id: `tab-rubro-${i}`, name: r, type: 'rubro', rubroKey: r, prods: rubrosMap[r] }));
            sheets.push({ id: 'tab-vacios', name: 'Vacíos', type: 'vacios' });

            html += `<div class="bg-white border-b border-gray-300 flex overflow-x-auto shrink-0 hide-scrollbar shadow-sm">`;
            sheets.forEach((s, i) => {
                const activeCls = i === 0 ? 'border-b-4 border-blue-600 text-blue-800 font-bold bg-blue-50' : 'text-gray-600 hover:bg-gray-50 font-medium';
                html += `<button data-target="${s.id}" class="preview-tab-btn px-4 sm:px-5 py-2.5 sm:py-3 whitespace-nowrap text-xs sm:text-sm uppercase tracking-wide transition-colors ${activeCls}">${s.name}</button>`;
            });
            html += `</div>`;

            html += `<div class="flex-1 overflow-auto bg-gray-50 p-1 sm:p-4 hide-scrollbar" style="-webkit-overflow-scrolling: touch;">`;

            sheets.forEach((sheet, index) => {
                const isHidden = index === 0 ? '' : 'hidden';
                html += `<div id="${sheet.id}" class="preview-sheet ${isHidden} bg-white rounded shadow-md border border-gray-200 h-full flex flex-col overflow-hidden">`;

                if (sheet.type === 'vacios') {
                    // --- VISTA DE VACÍOS (Mantiene lógica anterior) ---
                    const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
                    const cliVacios = Object.keys(vaciosMovementsPorTipo || {}).filter(cli =>
                        TIPOS_VACIO_GLOBAL.some(t => ((vaciosMovementsPorTipo[cli][t]?.entregados || 0) > 0 || (vaciosMovementsPorTipo[cli][t]?.devueltos || 0) > 0))
                    ).sort();

                    if (cliVacios.length > 0) {
                        html += `
                        <div class="p-3 sm:p-4 bg-gray-50 border-b border-gray-200 shrink-0">
                            <h3 class="text-base sm:text-lg font-bold text-gray-800 uppercase tracking-wide">Resumen de Envases (Vacíos)</h3>
                        </div>
                        <div class="flex-1 overflow-auto hide-scrollbar">
                            <table class="min-w-full bg-white text-xs sm:text-sm">
                                <thead class="bg-gray-800 text-white sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th class="py-2.5 px-2 sm:px-4 text-left font-semibold uppercase min-w-[120px] max-w-[120px] sm:min-w-[150px] sm:max-w-none truncate text-white">Cliente</th>
                                        <th class="py-2.5 px-2 sm:px-4 text-center font-semibold uppercase text-white">Tipo</th>
                                        <th class="py-2.5 px-2 sm:px-4 text-center font-semibold uppercase text-white">Entreg.</th>
                                        <th class="py-2.5 px-2 sm:px-4 text-center font-semibold uppercase text-white">Devuel.</th>
                                        <th class="py-2.5 px-2 sm:px-4 text-center font-semibold uppercase text-white">Pendiente</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200">`;
                        cliVacios.forEach(cli => {
                            const movs = vaciosMovementsPorTipo[cli];
                            TIPOS_VACIO_GLOBAL.forEach(t => {
                                const mov = movs[t];
                                if (mov && (mov.entregados > 0 || mov.devueltos > 0)) {
                                    const neto = mov.entregados - mov.devueltos;
                                    const nClass = neto > 0 ? 'text-red-600 font-bold bg-red-50' : (neto < 0 ? 'text-green-600 font-bold bg-green-50' : 'text-gray-500');
                                    html += `
                                    <tr class="hover:bg-gray-50 transition-colors">
                                        <td class="py-2 sm:py-3 px-2 sm:px-4 text-gray-800 font-medium min-w-[120px] max-w-[120px] sm:min-w-[150px] sm:max-w-none truncate" title="${cli}">${cli}</td>
                                        <td class="py-2 sm:py-3 px-2 sm:px-4 text-center text-gray-600 whitespace-nowrap">${t}</td>
                                        <td class="py-2 sm:py-3 px-2 sm:px-4 text-center font-semibold text-gray-700">${mov.entregados}</td>
                                        <td class="py-2 sm:py-3 px-2 sm:px-4 text-center font-semibold text-gray-700">${mov.devueltos}</td>
                                        <td class="py-2 sm:py-3 px-2 sm:px-4 text-center whitespace-nowrap ${nClass}">${neto > 0 ? '+'+neto : neto}</td>
                                    </tr>`;
                                }
                            });
                        });
                        html += `</tbody></table></div>`;
                    } else {
                        html += `<div class="p-8 text-center text-gray-500 font-medium">No hay movimientos de vacíos registrados.</div>`;
                    }

                } else if (sheet.type === 'summary') {
                    // --- VISTA CONSOLIDADA (SIN PRODUCTOS) ---
                    html += `
                        <div class="flex-1 overflow-auto hide-scrollbar">
                            <table class="min-w-full text-sm sm:text-base border-collapse">
                                <thead class="bg-gray-200 sticky top-0 z-30 shadow-sm">
                                    <tr>
                                        <th class="p-4 border-b border-gray-300 text-left uppercase tracking-wider text-gray-700 font-bold">Cliente</th>
                                        <th class="p-4 border-b border-gray-300 text-right uppercase tracking-wider text-gray-700 font-bold w-40">Total Venta ($)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200">`;

                    sortedClients.forEach(cli => {
                        const cCli = clientData[cli];
                        let rowClass = 'hover:bg-blue-50';
                        if (cCli.isObsequioRow) rowClass = 'bg-blue-100 hover:bg-blue-200 text-blue-900';
                        if (cCli.isConsignacionRow) rowClass = 'bg-orange-50 hover:bg-orange-100 text-orange-900';

                        html += `<tr class="${rowClass} transition-colors">
                            <td class="p-4 border-b border-gray-100 font-bold text-gray-800">${cli}</td>
                            <td class="p-4 border-b border-gray-100 text-right font-black text-blue-700">$${cCli.totalValue.toFixed(2)}</td>
                        </tr>`;
                    });

                    html += `</tbody>
                            <tfoot class="bg-gray-200 sticky bottom-0 z-30 font-black shadow-[0_-1px_0_0_#d1d5db]">
                                <tr>
                                    <td class="p-4 border-t border-gray-300 uppercase">Totales Jornada</td>
                                    <td class="p-4 border-t border-gray-300 text-right text-lg">$${grandTotalValue.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table></div>`;

                } else {
                    // --- VISTA DE RUBRO ESPECÍFICO ---
                    const rubroData = finalData.rubros[sheet.rubroKey];
                    
                    html += `<div class="flex-1 overflow-auto hide-scrollbar" style="-webkit-overflow-scrolling: touch;">
                        <table class="min-w-full text-[11px] sm:text-sm border-collapse">
                            <thead class="bg-gray-200 sticky top-0 z-30 shadow-sm">
                                <tr>
                                    <th class="p-1.5 sm:p-3 border-b border-gray-300 sticky left-0 z-40 bg-gray-200 min-w-[120px] max-w-[120px] sm:min-w-[150px] sm:max-w-none w-[120px] sm:w-auto truncate text-left uppercase tracking-wider text-gray-700 shadow-[1px_0_0_0_#d1d5db]">Cliente</th>`;

                    sheet.prods.forEach(p => {
                        html += `<th class="p-1.5 sm:p-3 border-b border-gray-300 whitespace-nowrap uppercase tracking-wider text-gray-700 align-bottom" title="${p.marca||''} - ${p.segmento||''}">
                            <div class="flex flex-col items-center justify-end h-full">
                                <span class="text-[8px] sm:text-[10px] text-gray-400 font-semibold leading-none mb-0.5">${p.segmento || 'S/S'}</span>
                                <span class="text-[9px] sm:text-[11px] text-gray-500 font-bold leading-none mb-1">${p.marca || 'S/M'}</span>
                                <span>${p.presentacion}</span>
                            </div>
                        </th>`;
                    });

                    html += `<th class="p-1.5 sm:p-3 border-b border-gray-300 sticky right-0 z-40 bg-gray-200 text-right uppercase tracking-wider text-gray-700 shadow-[-1px_0_0_0_#d1d5db]">Sub-Total</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">`;

                    sortedClients.forEach(cli => {
                        const cCliInRubro = rubroData.clients[cli];
                        if (!cCliInRubro) return; // Si el cliente no tiene nada en este rubro, saltar

                        let rowClass = 'hover:bg-blue-50';
                        if (cCliInRubro.isObsequioRow) rowClass = 'bg-blue-100 hover:bg-blue-200 text-blue-900';
                        if (cCliInRubro.isConsignacionRow) rowClass = 'bg-orange-50 hover:bg-orange-100 text-orange-900';

                        html += `<tr class="${rowClass} transition-colors">
                            <td class="p-1.5 sm:p-3 border-b border-gray-200 font-bold bg-white sticky left-0 z-20 min-w-[120px] max-w-[120px] sm:min-w-[150px] sm:max-w-none w-[120px] sm:w-auto truncate shadow-[1px_0_0_0_#e5e7eb]" title="${cli}">${cli}</td>`;

                        sheet.prods.forEach(p => {
                            const qU = cCliInRubro.products[p.id] || 0;
                            const qtyDisplay = window.dataModule.getDisplayQty(qU, p);
                            let suffix = cCliInRubro.isObsequioRow && qU > 0 ? ` <span class="text-[9px] text-blue-600 font-black ml-0.5">(R)</span>` : '';
                            let dQ = qU > 0 ? (typeof qtyDisplay.value === 'number' ? `${qtyDisplay.value} ${qtyDisplay.unit}` : qtyDisplay.value) + suffix : '';
                            let cellClass = qU > 0 ? 'font-bold text-gray-900' : 'text-gray-400';
                            html += `<td class="p-1.5 sm:p-3 border-b border-gray-200 text-center whitespace-nowrap ${cellClass}">${dQ}</td>`;
                        });

                        // Aquí mostramos el SUBTOTAL del rubro para este cliente
                        html += `<td class="p-1.5 sm:p-3 border-b border-gray-200 text-right font-black bg-white sticky right-0 z-20 shadow-[-1px_0_0_0_#e5e7eb]">$${cCliInRubro.totalValue.toFixed(2)}</td>
                        </tr>`;
                    });

                    html += `</tbody>
                            <tfoot class="bg-gray-200 sticky bottom-0 z-30 font-black shadow-[0_-1px_0_0_#d1d5db]">
                                <tr>
                                    <td class="p-1.5 sm:p-3 border-t border-gray-300 sticky left-0 z-40 bg-gray-200 uppercase shadow-[1px_0_0_0_#d1d5db] min-w-[120px] max-w-[120px] sm:min-w-[150px] sm:max-w-none w-[120px] sm:w-auto truncate" title="Totales">Totales Rubro</td>`;

                    sheet.prods.forEach(p => {
                        const tQ = rubroData.productTotals[p.id]?.totalSold || 0;
                        const qtyDisplay = window.dataModule.getDisplayQty(tQ, p);
                        let dT = tQ > 0 ? (typeof qtyDisplay.value === 'number' ? `${qtyDisplay.value} ${qtyDisplay.unit}` : qtyDisplay.value) : '';
                        html += `<td class="p-1.5 sm:p-3 border-t border-gray-300 text-center whitespace-nowrap text-blue-800">${dT}</td>`;
                    });

                    html += `<td class="p-1.5 sm:p-3 border-t border-gray-300 text-right sticky right-0 z-40 bg-gray-200 shadow-[-1px_0_0_0_#d1d5db]">$${rubroData.totalValue.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table></div>`;
                }
                html += `</div>`;
            });

            html += `</div>`;
            overlay.insertAdjacentHTML('beforeend', html);
            document.body.appendChild(overlay);

            const m = document.getElementById('modalContainer');
            if (m) m.classList.add('hidden');

            overlay.querySelector('#closePreviewOverlayBtn').addEventListener('click', () => overlay.remove());

            overlay.querySelectorAll('.preview-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    overlay.querySelectorAll('.preview-tab-btn').forEach(b => {
                        b.classList.remove('border-b-4', 'border-blue-600', 'text-blue-800', 'font-bold', 'bg-blue-50');
                        b.classList.add('text-gray-600', 'font-medium');
                    });
                    overlay.querySelectorAll('.preview-sheet').forEach(s => s.classList.add('hidden'));
                    e.target.classList.add('border-b-4', 'border-blue-600', 'text-blue-800', 'font-bold', 'bg-blue-50');
                    e.target.classList.remove('text-gray-600', 'font-medium');
                    overlay.querySelector(`#${e.target.getAttribute('data-target')}`).classList.remove('hidden');
                });
            });

        } catch (error) { 
            console.error("Error generando detalle:", error); 
            _showModal('Error', `No se pudo generar la vista previa: ${error.message}`); 
        }
    }

  async function ejecutarCierre() {
      // Verificar consignaciones activas antes de cerrar
      const ventasRef2 = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
      const snapCheck = await _getDocs(ventasRef2);
      const consignacionesActivas = snapCheck.docs.filter(d => d.data().tipoOperacion === 'consignacion');
      const totalConsig = consignacionesActivas.reduce((s, d) => s + (d.data().total || 0), 0);

      const msgCierre = consignacionesActivas.length > 0
          ? `⚠️ Tienes <strong>${consignacionesActivas.length} consignación(es) activa(s)</strong> por un total de <strong>$${totalConsig.toFixed(2)}</strong> que también serán incluidas en el cierre.<br><br>Se generará el reporte y se limpiará la jornada. ¿Deseas continuar?`
          : 'Se generará el reporte y se limpiará la jornada para iniciar una nueva. ¿Deseas continuar?';

      _showModal('Confirmar Cierre Definitivo', msgCierre, async () => {
          _showModal('Progreso', 'Guardando reporte de cierre y limpiando jornada...', null, '', null, false);
          try {
                const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`); 
                const ventasSnap = await _getDocs(ventasRef); 
                const ventas = ventasSnap.docs.map(d=>({id: d.id, ...d.data()}));
              
                const obsequiosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`);
                const obsequiosSnap = await _getDocs(obsequiosRef);
                const obsequios = obsequiosSnap.docs.map(d => ({id: d.id, ...d.data()}));

                if (ventas.length === 0 && obsequios.length === 0) { _showModal('Aviso', 'No hay ventas activas ni obsequios para cerrar.'); return false; }


              const { cargaParaExcel, ventasPostSnapshot, obsequiosPostSnapshot } = await calcularStockTeoricoExacto(_userId, ventas, obsequios);


              _showModal('Progreso', 'Generando Reporte y Finalizando...');

              let vendedorInfo = {};
                if (window.userRole === 'user') {
                    const uDoc = await _getDoc(_doc(_db, "users", _userId)); 
                    vendedorInfo = uDoc.exists() ? { userId:_userId, nombre:uDoc.data().nombre||'', apellido:uDoc.data().apellido||'', camion:uDoc.data().camion||'', email:uDoc.data().email||'' } : {};
                }

                const fechaCierre = new Date();
                let obsequiosTotal = 0;
                obsequiosPostSnapshot.forEach(o => { obsequiosTotal += (o.cantidadCajas || 0) * (_masterCatalogCache[o.productoId]?.precios?.cj || 0); });
                
                const cierreData = { 
                   fecha: fechaCierre, 
                   ventas: ventasPostSnapshot.map(({id,...r})=>r), 
                   obsequios: obsequiosPostSnapshot.map(({id,...r})=>r),
                   total: ventasPostSnapshot.reduce((s,v)=>s+(v.total||0),0) + obsequiosTotal,
                  cargaInicialInventario: cargaParaExcel, 
                  vendedorInfo: vendedorInfo 
              }; 

              if (window.dataModule?.exportSingleClosingToExcel) await window.dataModule.exportSingleClosingToExcel({ ...cierreData, fecha: { toDate: () => fechaCierre } });
                
              const batchLimp = _writeBatch(_db);
                batchLimp.set(_doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/cierres`)), cierreData);
              
                ventasPostSnapshot.forEach(v => { batchLimp.delete(_doc(ventasRef, v.id)); });
                obsequiosPostSnapshot.forEach(o => { batchLimp.delete(_doc(obsequiosRef, o.id)); });

                await batchLimp.commit();
                _showModal('Éxito', 'Cierre completado. La jornada se ha limpiado correctamente.', showVentasTotalesView);
                return true;

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

      // PASO CLAVE: Leer de la db el tipo, si no existe asumir 'venta' a menos que el origen diga Consignacion
      const tipoOp = venta.tipoOperacion || (venta.origen === 'Consignación' ? 'consignacion' : 'venta');

      showSharingOptions(venta, productosFormateados, venta.vaciosDevueltosPorTipo || {}, tipo, showVentasActualesView, tipoOp);
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

      // LEER EL SELECTOR EN LA VISTA DE EDICIÓN
      const editTipoOperacionSelect = document.getElementById('editTipoOperacion');
      const nuevoTipoOperacion = editTipoOperacionSelect ? editTipoOperacionSelect.value : (_originalVentaForEdit.tipoOperacion || 'venta');

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
                    
                    transaction.update(ventaRef, { 
                        productos: nItems, 
                        total: nTotal, 
                        vaciosDevueltosPorTipo: _ventaActual.vaciosDevueltosPorTipo, 
                        fechaModificacion: new Date(),
                        tipoOperacion: nuevoTipoOperacion 
                    });
              });
              
              const index = _ventasGlobal.findIndex(v => v.id === _originalVentaForEdit.id);
                if(index !== -1) {
                    _ventasGlobal[index].tipoOperacion = nuevoTipoOperacion;
              }

              _originalVentaForEdit=null; 
              _showModal('Éxito','Venta actualizada.', showVentasActualesView);

          } catch (error) { console.error("Error edit:", error); _showModal('Error', `Error: ${error.message}`); }
      }, 'Sí, Guardar', null, true);
  }

  window.ventasModule = { toggleMoneda, handleQuantityChange, handleTipoVacioChange, showPastSaleOptions, editVenta, deleteVenta, invalidateCache: () => { } };
})();



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

    // Asume que TIPOS_VACIO_GLOBAL se define o está disponible globalmente
    // Usaremos window.TIPOS_VACIO_GLOBAL si existe, o un default
    const TIPOS_VACIO = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    // --- CORRECCIÓN: La definición de SNAPSHOT_DOC_PATH se mueve DENTRO de las funciones que la usan ---

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
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Ventas</h1>
                <div class="space-y-4">
                    <button id="nuevaVentaBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Nueva Venta</button>
                    <button id="ventasTotalesBtn" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600">Ventas Totales</button>
                    <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                </div>
            </div> </div> </div>
        `;
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
        _mainContent.innerHTML = `
            <div class="p-2 w-full"> <div class="bg-white/90 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl flex flex-col h-full" style="min-height: calc(100vh - 1rem);">
                <div id="venta-header-section" class="mb-2">
                    <div class="flex justify-between items-center mb-2"> <h2 class="text-lg font-bold">Nueva Venta</h2> <button id="backToVentasBtn" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded-lg shadow-md hover:bg-gray-500">Volver</button> </div>
                    <div id="client-search-container"> <label for="clienteSearch" class="block font-medium mb-2">Cliente:</label> <div class="relative"><input type="text" id="clienteSearch" placeholder="Buscar..." class="w-full px-4 py-2 border rounded-lg"><div id="clienteDropdown" class="autocomplete-list hidden"></div></div> </div>
                    <div id="client-display-container" class="hidden flex-wrap items-center justify-between gap-2"> <p class="flex-grow text-sm"><span class="font-medium">Cliente:</span> <span id="selected-client-name" class="font-bold"></span></p> <div id="tasasContainer" class="flex flex-row items-center gap-2"> <div class="flex items-center space-x-1"> <label for="tasaCopInput" class="text-xs">COP:</label> <input type="number" id="tasaCopInput" placeholder="4000" class="w-16 px-1 py-1 text-sm border rounded-lg"> </div> <div class="flex items-center space-x-1"> <label for="tasaBsInput" class="text-xs">Bs.:</label> <input type="number" id="tasaBsInput" placeholder="36.5" class="w-16 px-1 py-1 text-sm border rounded-lg"> </div> </div> </div>
                </div>
                <div id="vacios-devueltos-section" class="mb-2 hidden"> <h3 class="text-sm font-semibold text-cyan-700 mb-1">Vacíos Devueltos:</h3> <div class="grid grid-cols-3 gap-2"> ${TIPOS_VACIO.map(tipo => `<div> <label for="vacios-${tipo.replace(/\s+/g, '-')}" class="text-xs mb-1 block">${tipo}</label> <input type="number" min="0" value="0" id="vacios-${tipo.replace(/\s+/g, '-')}" class="w-16 p-1 text-center border rounded-md" data-tipo-vacio="${tipo}" oninput="window.ventasModule.handleTipoVacioChange(event)"> </div>`).join('')} </div> </div>
                <div id="inventarioTableContainer" class="hidden animate-fade-in flex-grow flex flex-col overflow-hidden">
                    <div id="rubro-filter-container" class="mb-2"> <label for="rubroFilter" class="text-xs font-medium">Filtrar Rubro:</label> <select id="rubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select> </div>
                    <div class="overflow-auto flex-grow rounded-lg shadow"> <table class="min-w-full bg-white text-sm"><thead class="bg-gray-200 sticky top-0"><tr class="uppercase text-xs"><th class="py-2 px-2 text-center w-24">Cant</th><th class="py-2 px-2 text-left">Producto</th><th class="py-2 px-2 text-left price-toggle" onclick="window.ventasModule.toggleMoneda()">Precio</th><th class="py-2 px-1 text-center">Stock</th></tr></thead><tbody id="inventarioTableBody" class="text-gray-600"></tbody></table> </div>
                </div>
                <div id="venta-footer-section" class="mt-2 flex items-center justify-between hidden"> <span id="ventaTotal" class="text-base font-bold">$0.00</span> <button id="generarTicketBtn" class="px-5 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Generar Ticket</button> </div>
            </div> </div>
        `;
        const clienteSearchInput = document.getElementById('clienteSearch');
        clienteSearchInput.addEventListener('input', () => { const term = clienteSearchInput.value.toLowerCase(); const filtered = _clientesCache.filter(c=>(c.nombreComercial||'').toLowerCase().includes(term)||(c.nombrePersonal||'').toLowerCase().includes(term)); renderClienteDropdown(filtered); document.getElementById('clienteDropdown').classList.remove('hidden'); });
        const savedTasa = localStorage.getItem('tasaCOP'); if (savedTasa) { _tasaCOP = parseFloat(savedTasa); document.getElementById('tasaCopInput').value = _tasaCOP; }
        const savedTasaBs = localStorage.getItem('tasaBs'); if (savedTasaBs) { _tasaBs = parseFloat(savedTasaBs); document.getElementById('tasaBsInput').value = _tasaBs; }
        document.getElementById('tasaCopInput').addEventListener('input', (e) => { _tasaCOP = parseFloat(e.target.value) || 0; localStorage.setItem('tasaCOP', _tasaCOP); if (_monedaActual === 'COP') { renderVentasInventario(); updateVentaTotal(); } });
        document.getElementById('tasaBsInput').addEventListener('input', (e) => { _tasaBs = parseFloat(e.target.value) || 0; localStorage.setItem('tasaBs', _tasaBs); if (_monedaActual === 'Bs') { renderVentasInventario(); updateVentaTotal(); } });
        document.getElementById('rubroFilter').addEventListener('change', renderVentasInventario);
        document.getElementById('generarTicketBtn').addEventListener('click', generarTicket); // Llama a la nueva lógica
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasView);
        loadDataForNewSale();
    }

    function loadDataForNewSale() {
        const clientesRef = _collection(_db, `artifacts/ventas-9a210/public/data/clientes`);
        // --- FIX: Manejador de error de listener ---
        const unsubClientes = _onSnapshot(clientesRef, snap => { _clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); }, err => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') {
                console.log(`Ventas (clientes) listener error ignored (assumed logout): ${err.code}`);
                return;
            }
            console.error("Error clientes:", err); 
        });
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        // --- FIX: Manejador de error de listener ---
        const unsubInventario = _onSnapshot(inventarioRef, snap => { 
            _inventarioCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
            populateRubroFilter(); 
            if (_ventaActual.cliente) renderVentasInventario(); 
        }, err => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') {
                console.log(`Ventas (inventario) listener error ignored (assumed logout): ${err.code}`);
                return;
            }
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
        // Usa la función global para ordenar el inventario en la vista de venta
        const sortFunc = await window.getGlobalProductSortFunction();
        filtInv.sort(sortFunc);
        body.innerHTML = '';
        if (filtInv.length === 0) { body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">No hay productos ${selRubro ? 'en este rubro' : ''}.</td></tr>`; return; }
        let lastHKey = null;
        // Obtiene el primer criterio de ordenamiento de la preferencia global (si existe)
        const fSortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';
        filtInv.forEach(prod => {
            const curHVal = prod[fSortKey] || `Sin ${fSortKey}`; if (curHVal !== lastHKey) { lastHKey = curHVal; const hRow = document.createElement('tr'); hRow.innerHTML = `<td colspan="4" class="py-1 px-2 bg-gray-100 font-bold sticky top-[calc(theme(height.10))] z-[9]">${lastHKey}</td>`; body.appendChild(hRow); }
            const vPor = prod.ventaPor || { und: true }, vActProd = _ventaActual.productos[prod.id] || {}, precios = prod.precios || { und: prod.precioPorUnidad || 0 };
            const fPrice = (v) => { if (isNaN(v)) v=0; if (_monedaActual==='COP'&&_tasaCOP>0) return `COP ${(Math.ceil((v*_tasaCOP)/100)*100).toLocaleString('es-CO')}`; if (_monedaActual==='Bs'&&_tasaBs>0) return `Bs.S ${(v*_tasaBs).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`; return `$${v.toFixed(2)}`; };
            const cRow = (t, c, max, pT, stockT, descT) => { const r=document.createElement('tr'); r.className='border-b hover:bg-gray-50'; r.innerHTML=`<td class="py-2 px-2 text-center align-middle"> <input type="number" min="0" max="${max}" value="${c}" class="w-16 p-1 text-center border rounded-md" data-product-id="${prod.id}" data-tipo-venta="${t}" oninput="window.ventasModule.handleQuantityChange(event)"> </td> <td class="py-2 px-2 text-left align-middle"> ${descT} <span class="text-xs text-gray-500">${prod.marca || 'S/M'}</span> </td> <td class="py-2 px-2 text-left align-middle font-semibold price-toggle" onclick="window.ventasModule.toggleMoneda()">${fPrice(pT)}</td> <td class="py-2 px-1 text-center align-middle">${stockT}</td>`; body.appendChild(r); };
            const stockU = prod.cantidadUnidades || 0;
            if (vPor.cj) { const uCj=prod.unidadesPorCaja||1, maxCj=Math.floor(stockU/uCj); cRow('cj', vActProd.cantCj||0, maxCj, precios.cj||0, `${maxCj} Cj`, `${prod.presentacion} (Cj/${uCj} und)`); }
            if (vPor.paq) { const uPaq=prod.unidadesPorPaquete||1, maxPaq=Math.floor(stockU/uPaq); cRow('paq', vActProd.cantPaq||0, maxPaq, precios.paq||0, `${maxPaq} Paq`, `${prod.presentacion} (Paq/${uPaq} und)`); }
            if (vPor.und) { cRow('und', vActProd.cantUnd||0, stockU, precios.und||0, `${stockU} Und`, `${prod.presentacion} (Und)`); }
        }); updateVentaTotal();
    }

    function handleQuantityChange(event) {
        const inp=event.target, pId=inp.dataset.productId, tV=inp.dataset.tipoVenta, prod=_inventarioCache.find(p=>p.id===pId); if(!prod) return; if(!_ventaActual.productos[pId]) _ventaActual.productos[pId]={...prod, cantCj:0,cantPaq:0,cantUnd:0,totalUnidadesVendidas:0};
        const qty=parseInt(inp.value,10)||0; _ventaActual.productos[pId][`cant${tV[0].toUpperCase()+tV.slice(1)}`]=qty; const pV=_ventaActual.productos[pId], uCj=pV.unidadesPorCaja||1, uPaq=pV.unidadesPorPaquete||1;
        const totU=(pV.cantCj*uCj)+(pV.cantPaq*uPaq)+(pV.cantUnd||0); const stockU=prod.cantidadUnidades||0; if(totU>stockU){ _showModal('Stock Insuficiente',`Ajustado.`); let ex=totU-stockU; if(tV==='cj')inp.value=Math.max(0,qty-Math.ceil(ex/uCj)); else if(tV==='paq')inp.value=Math.max(0,qty-Math.ceil(ex/uPaq)); else inp.value=Math.max(0,qty-ex); handleQuantityChange({target:inp}); return; }
        pV.totalUnidadesVendidas=totU; if(totU===0&&pV.cantCj===0&&pV.cantPaq===0&&pV.cantUnd===0) delete _ventaActual.productos[pId]; updateVentaTotal();
    };

    function handleTipoVacioChange(event) { const inp=event.target, tipo=inp.dataset.tipoVacio, cant=parseInt(inp.value,10)||0; if(tipo&&_ventaActual.vaciosDevueltosPorTipo.hasOwnProperty(tipo)) _ventaActual.vaciosDevueltosPorTipo[tipo]=cant; }

    function updateVentaTotal() {
        const tEl=document.getElementById('ventaTotal'); if(!tEl) return;
        const tUSD=Object.values(_ventaActual.productos).reduce((s,p)=>{const pr=p.precios||{und:p.precioPorUnidad||0}; return s+(pr.cj||0)*(p.cantCj||0)+(pr.paq||0)*(p.cantPaq||0)+(pr.und||0)*(p.cantUnd||0);},0);
        if(_monedaActual==='COP'&&_tasaCOP>0)tEl.textContent=`Total: COP ${(Math.ceil((tUSD*_tasaCOP)/100)*100).toLocaleString('es-CO')}`; else if(_monedaActual==='Bs'&&_tasaBs>0)tEl.textContent=`Total: Bs.S ${(tUSD*_tasaBs).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`; else tEl.textContent=`Total: $${tUSD.toFixed(2)}`;
    }

    // Funciones de Ticket (sin cambios)
    function createTicketHTML(venta, productos, vaciosDevueltosPorTipo, tipo = 'ticket') {
        const fecha = venta.fecha ? (venta.fecha.toDate ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date(venta.fecha).toLocaleDateString('es-ES')) : new Date().toLocaleDateString('es-ES');
        const clienteNombre = venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre;
        const clienteNombrePersonal = (venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '';
        let total = 0;
        let productosHTML = '';
        const productosVendidos = productos.filter(p => (p.totalUnidadesVendidas || (p.cantidadVendida && (p.cantidadVendida.cj > 0 || p.cantidadVendida.paq > 0 || p.cantidadVendida.und > 0)) ));

        productosVendidos.forEach(p => {
            const precios = p.precios || { und: p.precioPorUnidad || 0 };
            const cant = p.cantidadVendida || { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 };
            const uCj = p.unidadesPorCaja || 1;
            const uPaq = p.unidadesPorPaquete || 1;
            let desc = `${p.segmento || ''} ${p.marca || ''} ${p.presentacion}`;
            let qtyText = '', priceText = '', subtotal = 0;

            if (cant.cj > 0) {
                subtotal = (precios.cj || 0) * cant.cj;
                qtyText = `${cant.cj} CJ`;
                priceText = `$${(precios.cj || 0).toFixed(2)}`;
            } else if (cant.paq > 0) {
                subtotal = (precios.paq || 0) * cant.paq;
                qtyText = `${cant.paq} PAQ`;
                priceText = `$${(precios.paq || 0).toFixed(2)}`;
            } else if (cant.und > 0) {
                subtotal = (precios.und || 0) * cant.und;
                qtyText = `${cant.und} UND`;
                priceText = `$${(precios.und || 0).toFixed(2)}`;
            } else {
                return; // No mostrar si no hay cantidad
            }
            total += subtotal;

            productosHTML += `
                 <tr class="align-top">
                    <td class="py-2 pr-2 text-left" style="width: 55%;"><div style="line-height: 1.2;">${desc}</div></td>
                    <td class="py-2 px-2 text-center" style="width: 15%;">${qtyText}</td>
                    <td class="py-2 px-2 text-right" style="width: 15%;">${priceText}</td>
                    <td class="py-2 pl-2 text-right font-bold" style="width: 15%;">$${subtotal.toFixed(2)}</td>
                </tr>
            `;
        });

        let vaciosHTML = '';
        const tiposConDev = Object.entries(vaciosDevueltosPorTipo || {}).filter(([t, c]) => c > 0);
        if (tiposConDev.length > 0) {
            vaciosHTML = `<div class="text-3xl mt-6 border-t border-black border-dashed pt-4"> <p>ENVASES DEVUELTOS:</p> <table class="w-full text-3xl mt-2"><tbody>`;
            tiposConDev.forEach(([t, c]) => {
                vaciosHTML += `<tr><td class="py-1 pr-2 text-left" style="width: 70%;">${t}</td><td class="py-1 pl-2 text-right" style="width: 30%;">${c} CJ</td></tr>`;
            });
            vaciosHTML += `</tbody></table></div>`;
        }

        const titulo = tipo === 'factura' ? 'FACTURA FISCAL' : 'TICKET DE VENTA';

        return `
            <div id="temp-ticket-for-image" class="bg-white text-black p-4 font-bold" style="width: 768px; font-family: 'Courier New', Courier, monospace;">
                <div class="text-center">
                    <h2 class="text-4xl uppercase">${titulo}</h2>
                    <p class="text-3xl">DISTRIBUIDORA CASTILLO YAÑEZ</p>
                </div>
                <div class="text-3xl mt-8">
                    <p>FECHA: ${fecha}</p>
                    <p>CLIENTE: ${clienteNombre}</p>
                </div>
                <table class="w-full text-3xl mt-6">
                    <thead>
                        <tr>
                            <th class="pb-2 text-left">DESCRIPCION</th>
                            <th class="pb-2 text-center">CANT</th>
                            <th class="pb-2 text-right">PRECIO</th>
                            <th class="pb-2 text-right">SUBTOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productosHTML}
                    </tbody>
                </table>
                <div class="text-right text-3xl mt-4 pr-2">
                    <p class="border-t border-black pt-2 font-bold">TOTAL: $${total.toFixed(2)}</p>
                </div>
                ${vaciosHTML}
                <div class="text-center mt-16">
                    <p class="border-t border-black w-96 mx-auto"></p>
                    <p class="mt-4 text-3xl">${clienteNombrePersonal}</p>
                </div>
                <hr class="border-dashed border-black mt-6">
            </div>`;
    }
    function createRawTextTicket(venta, productos, vaciosDevueltosPorTipo) {
        const fecha = venta.fecha ? (venta.fecha.toDate ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date(venta.fecha).toLocaleDateString('es-ES')) : new Date().toLocaleDateString('es-ES');
        const toTitleCase = (str) => { if (!str) return ''; return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()); };
        const clienteNombre = toTitleCase(venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre);
        const clienteNombrePersonal = toTitleCase((venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '');
        const LINE_WIDTH = 48; let total = 0; let ticket = '';
        const center = (text) => text.padStart(Math.floor((LINE_WIDTH - text.length) / 2) + text.length, ' ').padEnd(LINE_WIDTH, ' ');
        const wordWrap = (text, maxWidth) => { const lines = []; if (!text) return lines; let currentLine = ''; const words = text.split(' '); for (const word of words) { if ((currentLine + ' ' + word).trim().length > maxWidth) { if(currentLine.length > 0) lines.push(currentLine.trim()); currentLine = word; } else { currentLine = (currentLine + ' ' + word).trim(); } } if (currentLine) lines.push(currentLine.trim()); return lines; };

        ticket += center('Distribuidora Castillo Yañez') + '\n';
        ticket += center('Nota de Entrega') + '\n';
        ticket += center('(no valido como factura fiscal)') + '\n\n';

        const wrappedClientName = wordWrap(`Cliente: ${clienteNombre}`, LINE_WIDTH);
        wrappedClientName.forEach(line => { ticket += line + '\n'; });
        ticket += `Fecha: ${fecha}\n`;
        ticket += '-'.repeat(LINE_WIDTH) + '\n';

        const productosVendidos = productos.filter(p => (p.totalUnidadesVendidas || (p.cantidadVendida && (p.cantidadVendida.cj > 0 || p.cantidadVendida.paq > 0 || p.cantidadVendida.und > 0)) ));

        if (productosVendidos.length > 0) {
            ticket += 'Producto'.padEnd(26) + 'Cant'.padStart(6) + 'Precio'.padStart(8) + 'Subt'.padStart(8) + '\n';
            productosVendidos.forEach(p => {
                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                const cant = p.cantidadVendida || { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 };
                let desc = toTitleCase(`${p.segmento || ''} ${p.marca || ''} ${p.presentacion}`);
                let qtyText = '', priceText = '', subtotal = 0;

                if (cant.cj > 0) {
                    subtotal = (precios.cj || 0) * cant.cj;
                    qtyText = `${cant.cj} CJ`;
                    priceText = `$${(precios.cj || 0).toFixed(2)}`;
                } else if (cant.paq > 0) {
                    subtotal = (precios.paq || 0) * cant.paq;
                    qtyText = `${cant.paq} PQ`;
                    priceText = `$${(precios.paq || 0).toFixed(2)}`;
                } else if (cant.und > 0) {
                    subtotal = (precios.und || 0) * cant.und;
                    qtyText = `${cant.und} UN`;
                    priceText = `$${(precios.und || 0).toFixed(2)}`;
                } else { return; }
                total += subtotal;

                const wrappedDesc = wordWrap(desc, 25); // Max width for description column
                wrappedDesc.forEach((line, index) => {
                    const qtyStr = index === wrappedDesc.length - 1 ? qtyText : '';
                    const priceStr = index === wrappedDesc.length - 1 ? priceText : '';
                    const subtStr = index === wrappedDesc.length - 1 ? `$${subtotal.toFixed(2)}` : '';
                    ticket += line.padEnd(26) + qtyStr.padStart(6) + priceStr.padStart(8) + subtStr.padStart(8) + '\n';
                });
            });
        }

        const tiposConDev = Object.entries(vaciosDevueltosPorTipo || {}).filter(([t, c]) => c > 0);
        if (tiposConDev.length > 0) {
            ticket += '-'.repeat(LINE_WIDTH) + '\n';
            ticket += center('ENVASES DEVUELTOS') + '\n';
            tiposConDev.forEach(([t, c]) => {
                const tipoStr = t; const cantStr = `${c} CJ`;
                ticket += tipoStr.padEnd(LINE_WIDTH - cantStr.length) + cantStr + '\n';
            });
        }

        ticket += '-'.repeat(LINE_WIDTH) + '\n';
        const totalString = `TOTAL: $${total.toFixed(2)}`;
        ticket += totalString.padStart(LINE_WIDTH, ' ') + '\n\n';
        ticket += '\n\n\n\n';
        ticket += center('________________________') + '\n';
        ticket += center(clienteNombrePersonal) + '\n\n';
        ticket += '-'.repeat(LINE_WIDTH) + '\n';
        return ticket;
    }
    // Funciones handleShareTicket, handleShareRawText, copyToClipboard, legacyCopyToClipboard (solo reciben callback)
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
         else { try { legacyCopyToClipboard(textContent, (copySuccess) => { success = copySuccess; }); } catch (copyErr) { console.error('Fallback copy failed:', copyErr); } } // Pasar callback a legacy
         // Asegurarse de llamar al callback DESPUÉS de intentar, incluso si legacyCopyToClipboard es asíncrono en su modal
         // Usar un pequeño timeout si legacyCopyToClipboard no retorna directamente el estado
         setTimeout(() => {
            if (callbackDespuesDeCompartir) callbackDespuesDeCompartir(success);
         }, 100); // Pequeña espera por si el modal de legacyCopyToClipboard es lento
    }
    function copyToClipboard(textContent, callbackDespuesDeCopia) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textContent)
                .then(() => { _showModal('Copiado', 'Texto copiado.'); if(callbackDespuesDeCopia) callbackDespuesDeCopia(true); })
                .catch(err => legacyCopyToClipboard(textContent, callbackDespuesDeCopia)); // Fallback
        } else {
            legacyCopyToClipboard(textContent, callbackDespuesDeCopia); // Fallback directo
        }
    }
    function legacyCopyToClipboard(textContent, callbackDespuesDeCopia) {
        const textArea = document.createElement("textarea"); textArea.value = textContent; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; document.body.appendChild(textArea); textArea.select();
        let success = false;
        try { document.execCommand('copy'); _showModal('Copiado', 'Texto copiado.'); success = true;}
        catch (err) { console.error('Fallback copy failed:', err); _showModal('Error', 'No se pudo copiar el texto.'); success = false;}
        finally { document.body.removeChild(textArea); if(callbackDespuesDeCopia) callbackDespuesDeCopia(success); }
    }
    // *** MODIFICADO: showSharingOptions ahora recibe callbackFinal ***
    function showSharingOptions(venta, productos, vaciosDevueltosPorTipo, tipo, callbackFinal) {
        const modalContent = `<div class="text-center"><h3 class="text-xl font-bold mb-4">Generar ${tipo}</h3><p class="mb-6">Elige formato.</p><div class="space-y-4"><button id="printTextBtn" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Imprimir (Texto)</button><button id="shareImageBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600">Compartir (Imagen)</button></div></div>`;
        _showModal('Elige opción', modalContent, null, ''); // Sin botón 'Confirmar' por defecto
        // Llama al callbackFinal *después* de intentar compartir/imprimir
        document.getElementById('printTextBtn').addEventListener('click', () => { const rawText = createRawTextTicket(venta, productos, vaciosDevueltosPorTipo); handleShareRawText(rawText, callbackFinal); });
        document.getElementById('shareImageBtn').addEventListener('click', () => { const html = createTicketHTML(venta, productos, vaciosDevueltosPorTipo, tipo); handleShareTicket(html, callbackFinal); });
    }

    // *** MODIFICADO: _processAndSaveVenta ahora es la función que guarda ***
    async function _processAndSaveVenta() {
        console.log("Starting _processAndSaveVenta...");
        
        // --- INICIO: Lógica del Snapshot ---
        // --- CORRECCIÓN: Definir SNAPSHOT_DOC_PATH aquí ---
        const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
        const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
        try {
            const snapshotDoc = await _getDoc(snapshotRef);
            if (!snapshotDoc.exists()) {
                // No existe, es la primera venta. Guardar snapshot.
                console.log("Primera venta del día detectada. Guardando snapshot de inventario...");
                if (_inventarioCache && _inventarioCache.length > 0) {
                    await _setDoc(snapshotRef, { inventario: _inventarioCache, fecha: new Date() });
                    console.log("Snapshot de carga inicial guardado.");
                } else {
                    console.warn("No hay inventario en caché para guardar en snapshot.");
                }
            }
        } catch (snapError) {
            console.error("Error al verificar/guardar snapshot de carga inicial:", snapError);
            // No detenemos la venta, pero sí avisamos.
            _showModal('Advertencia', 'No se pudo guardar la Carga Inicial (snapshot). El reporte de cierre podría no ser exacto.');
        }
        // --- FIN: Lógica del Snapshot ---

        // Esta función ahora contiene la lógica de guardado que estaba antes en handleSaveVentaAndAdjustments
        try {
            const batch = _writeBatch(_db);
            const ventaRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
            let totalVenta=0;
            const itemsVenta=[];
            const vaciosChanges={}; // tipoVacio: cambio_neto_para_saldo_cliente
            const prodsParaGuardar = Object.values(_ventaActual.productos);

            for(const p of prodsParaGuardar){
                const pCache=_inventarioCache.find(i=>i.id===p.id);
                if(!pCache) throw new Error(`Producto ${p.presentacion} no encontrado en caché.`);
                const stockU=pCache.cantidadUnidades||0;
                const restarU=p.totalUnidadesVendidas||0;
                if(restarU < 0) throw new Error(`Cantidad inválida para ${p.presentacion}.`);
                if(stockU < restarU) throw new Error(`Stock insuficiente para ${p.presentacion}. Disponible: ${stockU}, Vendido: ${restarU}`);
                if(restarU > 0){
                    const pRef=_doc(_db,`artifacts/${_appId}/users/${_userId}/inventario`,p.id);
                    batch.update(pRef,{cantidadUnidades: stockU - restarU});
                }
                const precios=p.precios||{und:p.precioPorUnidad||0};
                const sub=(precios.cj||0)*(p.cantCj||0)+(precios.paq||0)*(p.cantPaq||0)+(precios.und||0)*(p.cantUnd||0);
                totalVenta+=sub;

                if(pCache.manejaVacios && pCache.tipoVacio){
                    const tV=pCache.tipoVacio;
                    const cjV=p.cantCj||0;
                    if(cjV > 0) vaciosChanges[tV] = (vaciosChanges[tV] || 0) + cjV; // Aumenta deuda cliente
                }

                if(restarU > 0) {
                     itemsVenta.push({
                         id:p.id, presentacion:p.presentacion, rubro:p.rubro??null, marca:p.marca??null, segmento:p.segmento??null,
                         precios:p.precios, ventaPor:p.ventaPor,
                         unidadesPorPaquete:p.unidadesPorPaquete, unidadesPorCaja:p.unidadesPorCaja,
                         cantidadVendida:{cj:p.cantCj||0,paq:p.cantPaq||0,und:p.cantUnd||0},
                         totalUnidadesVendidas:p.totalUnidadesVendidas,
                         iva:p.iva??0, manejaVacios:p.manejaVacios||false, tipoVacio:p.tipoVacio||null
                     });
                }
            }

            for(const tV in _ventaActual.vaciosDevueltosPorTipo){
                const dev=_ventaActual.vaciosDevueltosPorTipo[tV]||0;
                if(dev > 0) vaciosChanges[tV] = (vaciosChanges[tV] || 0) - dev; // Disminuye deuda cliente
            }

            if(Object.values(vaciosChanges).some(c => c !== 0)){
                const cliRef=_doc(_db,`artifacts/ventas-9a210/public/data/clientes`,_ventaActual.cliente.id);
                await _runTransaction(_db,async(t)=>{
                    const cliDoc=await t.get(cliRef);
                    if(!cliDoc.exists()) throw "Cliente no existe.";
                    const cliData=cliDoc.data();
                    const sVac = cliData.saldoVacios || {};
                    for(const tV in vaciosChanges){
                        const ch=vaciosChanges[tV];
                        if(ch !== 0) sVac[tV] = (sVac[tV] || 0) + ch;
                    }
                    t.update(cliRef,{saldoVacios: sVac});
                });
            }

            const ventaDataToSave = {
                clienteId:_ventaActual.cliente.id,
                clienteNombre:_ventaActual.cliente.nombreComercial||_ventaActual.cliente.nombrePersonal,
                clienteNombrePersonal:_ventaActual.cliente.nombrePersonal,
                fecha:new Date(),
                total:totalVenta,
                productos:itemsVenta,
                vaciosDevueltosPorTipo:_ventaActual.vaciosDevueltosPorTipo
            };

             if (itemsVenta.length > 0 || Object.values(_ventaActual.vaciosDevueltosPorTipo).some(v => v > 0)) {
                batch.set(ventaRef, ventaDataToSave);
            } else {
                 console.warn("No se guardó la venta: sin productos ni vacíos devueltos.");
                 throw new Error("No hay productos ni vacíos devueltos para guardar."); // Lanzar error para que no continúe
            }

            await batch.commit();
            console.log("_processAndSaveVenta finished successfully.");
            // Devolver los datos guardados para usarlos en el ticket
            return { venta: ventaDataToSave, productos: itemsVenta, vaciosDevueltosPorTipo: ventaDataToSave.vaciosDevueltosPorTipo };

        } catch (e) {
            console.error("Error in _processAndSaveVenta:", e);
            throw e; // Relanzar el error para que sea capturado por generarTicket
        }
    }

    // *** MODIFICADO: generarTicket ahora confirma, llama a _processAndSaveVenta, y LUEGO muestra opciones ***
    async function generarTicket() {
        if (!_ventaActual.cliente) { _showModal('Error', 'Selecciona cliente.'); return; }
        const prods = Object.values(_ventaActual.productos);
        const hayVac = Object.values(_ventaActual.vaciosDevueltosPorTipo).some(c => c > 0);
        if (prods.length === 0 && !hayVac) { _showModal('Error', 'Agrega productos o registra vacíos devueltos.'); return; }

        // 1. Mostrar modal de confirmación para GUARDAR
        _showModal('Confirmar Venta', '¿Guardar esta transacción?', async () => {
            _showModal('Progreso', 'Guardando transacción...'); // Mostrar progreso mientras se guarda
            try {
                // 2. Llamar a la función que guarda y ajusta (y crea snapshot si es necesario)
                const savedData = await _processAndSaveVenta();

                // 3. Si tuvo éxito, AHORA mostrar las opciones de ticket
                // Pasar showNuevaVentaView como callback final
                showSharingOptions(
                    { cliente: _ventaActual.cliente, fecha: savedData.venta.fecha }, // Datos básicos
                    savedData.productos, // Productos guardados
                    savedData.vaciosDevueltosPorTipo, // Vacíos guardados
                    'Nota de Entrega',
                    () => { // Callback que se ejecuta después de imprimir/compartir
                         _showModal('Éxito', 'Venta registrada y ticket generado/compartido.', showNuevaVentaView);
                    }
                );

            } catch (saveError) {
                // Si _processAndSaveVenta falló, mostrar el error
                console.error("Error al guardar venta:", saveError);
                 const progressModal = document.getElementById('modalContainer'); // Cerrar modal de progreso si aún está visible
                 if(progressModal && !progressModal.classList.contains('hidden') && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                      progressModal.classList.add('hidden');
                 }
                _showModal('Error', `Error al guardar la venta: ${saveError.message}`);
            }
            
            // --- ¡CORRECCIÓN AÑADIDA AQUÍ! ---
            // Esto evita que el modal de "Confirmar" se cierre antes de que 
            // aparezca el modal de "showSharingOptions".
            return false; 
            // --- FIN DE LA CORRECCIÓN ---

        }, 'Sí, guardar', () => { /* No hacer nada si cancela la confirmación */ }, true); // True para indicar lógica de confirmación (mostrar progreso)
    }

    function showVentasTotalesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Ventas Totales</h2>
                <div class="space-y-4">
                    <button id="ventasActualesBtn" class="w-full px-6 py-3 bg-teal-500 text-white rounded-lg shadow-md hover:bg-teal-600">Ventas Actuales</button>
                    <button id="cierreVentasBtn" class="w-full px-6 py-3 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600">Cierre de Ventas</button>
                </div>
                <button id="backToVentasBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
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
        // --- FIX: Manejador de error de listener ---
        const unsub = _onSnapshot(q, (snap) => {
            _ventasGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() })); _ventasGlobal.sort((a,b)=>(b.fecha?.toDate()??0)-(a.fecha?.toDate()??0));
            if (_ventasGlobal.length === 0) { cont.innerHTML = `<p class="text-center text-gray-500">No hay ventas.</p>`; return; }
            let tHTML = `<table class="min-w-full bg-white text-sm"><thead class="bg-gray-200 sticky top-0 z-10"><tr> <th class="py-2 px-3 border-b text-left">Cliente</th> <th class="py-2 px-3 border-b text-left">Fecha</th> <th class="py-2 px-3 border-b text-right">Total</th> <th class="py-2 px-3 border-b text-center">Acciones</th> </tr></thead><tbody>`;
            _ventasGlobal.forEach(v => { const fV=v.fecha?.toDate?v.fecha.toDate():new Date(0); const fF=fV.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}); tHTML+=`<tr class="hover:bg-gray-50"><td class="py-2 px-3 border-b align-middle">${v.clienteNombre||'N/A'}</td><td class="py-2 px-3 border-b align-middle">${fF}</td><td class="py-2 px-3 border-b text-right font-semibold align-middle">$${(v.total||0).toFixed(2)}</td><td class="py-2 px-3 border-b"><div class="flex flex-col items-center space-y-1"><button onclick="window.ventasModule.showPastSaleOptions('${v.id}','ticket')" class="w-full px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600">Compartir</button><button onclick="window.ventasModule.editVenta('${v.id}')" class="w-full px-3 py-1.5 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600">Editar</button><button onclick="window.ventasModule.deleteVenta('${v.id}')" class="w-full px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600">Eliminar</button></div></td></tr>`; });
            tHTML += `</tbody></table>`; cont.innerHTML = tHTML;
        }, (err) => { 
            if (err.code === 'permission-denied' || err.code === 'unauthenticated') {
                console.log(`Ventas (lista) listener error ignored (assumed logout): ${err.code}`);
                return;
            }
            console.error("Error lista ventas:", err); 
            if(cont) cont.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; 
        });
        _activeListeners.push(unsub);
    }

    function showCierreSubMenuView() {
         _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Cierre de Ventas</h2>
                <div class="space-y-4">
                    <button id="verCierreBtn" class="w-full px-6 py-3 bg-cyan-500 text-white rounded-lg shadow-md hover:bg-cyan-600">Ver Cierre</button>
                    <button id="ejecutarCierreBtn" class="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700">Ejecutar Cierre</button>
                </div>
                <button id="backToVentasTotalesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        document.getElementById('verCierreBtn').addEventListener('click', showVerCierreView);
        document.getElementById('ejecutarCierreBtn').addEventListener('click', ejecutarCierre);
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
    }

    // --- INICIO DE REFACTORIZACIÓN (Paso 2 y 3) ---
    // La función `processSalesDataForReport` que estaba aquí fue ELIMINADA.
    // Era duplicada, tenía bugs y ahora usamos la de `data.js`.
    // --- FIN DE REFACTORIZACIÓN (Paso 2 y 3) ---

    async function showVerCierreView() {
        _showModal('Progreso', 'Generando reporte...');
        const ventasSnapshot = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
        const ventas = ventasSnapshot.docs.map(doc => doc.data());
        
        const obsequiosSnapshot = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
        const obsequios = obsequiosSnapshot.docs.map(doc => doc.data());

        // --- CORRECCIÓN: Definir SNAPSHOT_DOC_PATH aquí ---
        const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
        let cargaInicialInventario = [];
        try {
            const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
            const snapshotDoc = await _getDoc(snapshotRef);
            if (snapshotDoc.exists() && snapshotDoc.data().inventario) {
                cargaInicialInventario = snapshotDoc.data().inventario;
            }
        } catch (snapError) {
            console.warn("Error al leer snapshot para 'Ver Cierre':", snapError);
        }

        if (ventas.length === 0 && obsequios.length === 0) {
            _showModal('Aviso', 'No hay ventas ni obsequios.');
            return;
        }
        
        try {
            // --- CAMBIO: Llamar a la función centralizada de data.js ---
            if (!window.dataModule || !window.dataModule._processSalesDataForModal || !window.dataModule.getDisplayQty) {
                throw new Error("El módulo de datos (dataModule) o sus funciones no están disponibles.");
            }

            const { clientData, clientTotals, grandTotalValue, sortedClients, finalProductOrder, vaciosMovementsPorTipo } = 
                await window.dataModule._processSalesDataForModal(ventas, obsequios, cargaInicialInventario, _userId);
            // --- FIN CAMBIO ---

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
                    
                    // --- CAMBIO: Llamar a la función centralizada de data.js ---
                    const qtyDisplay = window.dataModule.getDisplayQty(qU, p);
                    // --- FIN CAMBIO ---

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
                
                // --- CAMBIO: Llamar a la función centralizada de data.js ---
                const qtyDisplay = window.dataModule.getDisplayQty(tQ, p);
                // --- FIN CAMBIO ---

                let dT = (tQ > 0) ? `${qtyDisplay.value} ${qtyDisplay.unit}` : '';
                fHTML+=`<td class="p-1 border text-center">${dT}</td>`;
            }); 
            fHTML+=`<td class="p-1 border text-right sticky right-0 z-10">$${grandTotalValue.toFixed(2)}</td></tr>`;
            
            let vHTML=''; const TIPOS_VACIO_GLOBAL = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"]; const cliVacios=Object.keys(vaciosMovementsPorTipo).filter(cli=>TIPOS_VACIO_GLOBAL.some(t=>(vaciosMovementsPorTipo[cli][t]?.entregados||0)>0||(vaciosMovementsPorTipo[cli][t]?.devueltos||0)>0)).sort(); if(cliVacios.length>0){ vHTML=`<h3 class="text-xl my-6">Reporte Vacíos</h3><div class="overflow-auto border"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Entregados</th><th>Devueltos</th><th>Neto</th></tr></thead><tbody>`; cliVacios.forEach(cli=>{const movs=vaciosMovementsPorTipo[cli]; TIPOS_VACIO_GLOBAL.forEach(t=>{const mov=movs[t]||{e:0,d:0}; if(mov.entregados>0||mov.devueltos>0){const neto=mov.entregados-mov.devueltos; const nClass=neto>0?'text-red-600':(neto<0?'text-green-600':''); vHTML+=`<tr><td>${cli}</td><td>${t}</td><td>${mov.entregados}</td><td>${mov.devueltos}</td><td class="${nClass}">${neto>0?`+${neto}`:neto}</td></tr>`;}});}); vHTML+='</tbody></table></div>';}
            
            // const snapshotWarning = hasSnapshot ? '' : '<p class="text-sm text-yellow-700 bg-yellow-100 p-2 rounded-lg my-4"><strong>Aviso:</strong> No se encontró Carga Inicial. Los totales de inventario se calculan desde el stock actual (método antiguo).</p>';
            const snapshotWarning = ''; // 'hasSnapshot' no está definido aquí, la lógica de advertencia está en data.js

            const reportHTML = `<div class="text-left max-h-[80vh] overflow-auto"> <h3 class="text-xl font-bold mb-4">Reporte Cierre</h3> ${snapshotWarning} <div class="overflow-auto border"> <table class="min-w-full bg-white text-xs"> <thead class="bg-gray-200">${hHTML}</thead> <tbody>${bHTML}</tbody> <tfoot>${fHTML}</tfoot> </table> </div> ${vHTML} </div>`;
            _showModal('Reporte de Cierre', reportHTML, null, 'Cerrar');
        } catch (error) { console.error("Error reporte:", error); _showModal('Error', `No se pudo generar: ${error.message}`); }
    }
    
    // --- MODIFICACIÓN: `ejecutarCierre` ---
    async function ejecutarCierre() {
        _showModal('Confirmar Cierre Definitivo', 'Generará Excel, archivará ventas y eliminará activas. IRREVERSIBLE. ¿Continuar?', async () => {
            _showModal('Progreso', 'Obteniendo ventas y obsequios...');
            
            // --- MODIFICADO: Leer Ventas, Obsequios y Snapshot ---
            const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`); 
            const ventasSnap = await _getDocs(ventasRef); 
            const ventas = ventasSnap.docs.map(d=>({id: d.id, ...d.data()}));
            
            const obsequiosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`);
            
            // --- INICIO DE LA CORRECCIÓN (Error 5) ---
            // El error estaba aquí: se usaba obsequiosSnap antes de definirlo.
            const obsequiosSnap = await _getDocs(obsequiosRef);
            // --- FIN DE LA CORRECCIÓN ---
            
            const obsequios = obsequiosSnap.docs.map(d => ({id: d.id, ...d.data()}));

            if (ventas.length === 0 && obsequios.length === 0) { 
                _showModal('Aviso', 'No hay ventas ni obsequios activos.'); 
                return false; 
            }
            
            // --- CORRECCIÓN: Definir SNAPSHOT_DOC_PATH aquí ---
            const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${_userId}/config/cargaInicialSnapshot`;
            let cargaInicialInventario = [];
            const snapshotRef = _doc(_db, SNAPSHOT_DOC_PATH);
            try {
                const snapshotDoc = await _getDoc(snapshotRef);
                if (snapshotDoc.exists() && snapshotDoc.data().inventario) {
                    cargaInicialInventario = snapshotDoc.data().inventario;
                    console.log("Snapshot de Carga Inicial encontrado para el cierre.");
                } else {
                    console.warn("No se encontró snapshot de Carga Inicial para el cierre.");
                }
            } catch (snapError) {
                console.error("Error al leer snapshot de Carga Inicial durante el cierre:", snapError);
                _showModal('Advertencia', 'Error al leer Carga Inicial (snapshot). El reporte podría no ser exacto.');
            }
            // --- FIN MODIFICACIÓN LECTURA ---

            try {
                 _showModal('Progreso', 'Generando Excel...'); 
                 
                 let vendedorInfo = {};
                 if (window.userRole === 'user') {
                     const uDocRef=_doc(_db,"users",_userId); const uDoc=await _getDoc(uDocRef); const uData=uDoc.exists()?uDoc.data():{};
                     vendedorInfo={userId:_userId,nombre:uData.nombre||'',apellido:uData.apellido||'',camion:uData.camion||'',email:uData.email||''};
                 }

                 const cierreData = { 
                     fecha: new Date(), 
                     ventas: ventas.map(({id,...rest})=>rest), 
                     obsequios: obsequios.map(({id,...rest})=>rest),
                     total: ventas.reduce((s,v)=>s+(v.total||0),0),
                     cargaInicialInventario: cargaInicialInventario,
                     vendedorInfo: vendedorInfo
                 }; 

                 // --- MODIFICADO: Llamar a la función de exportación global de data.js ---
                 if (window.dataModule && typeof window.dataModule.exportSingleClosingToExcel === 'function') {
                    await window.dataModule.exportSingleClosingToExcel(cierreData);
                 } else {
                    console.error("Error: window.dataModule.exportSingleClosingToExcel no está definida.");
                    _showModal('Advertencia', 'No se pudo generar el archivo Excel (función no encontrada), pero el cierre continuará.');
                 }
                 
                 _showModal('Progreso', 'Archivando y eliminando...'); 
                 
                 let cDocRef;
                 
                 if (window.userRole === 'user') {
                     cDocRef=_doc(_collection(_db,`public_data/${_appId}/user_closings`));
                     await _setDoc(cDocRef, cierreData);
                     console.log("Cierre de vendedor guardado en colección pública.");
                 } else { 
                     cDocRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/cierres`));
                     await _setDoc(cDocRef, cierreData);
                     console.log("Cierre de admin guardado en colección privada.");
                 }
                 
                 const batch = _writeBatch(_db); 
                 ventas.forEach(v => batch.delete(_doc(ventasRef, v.id)));
                 obsequios.forEach(o => batch.delete(_doc(obsequiosRef, o.id)));
                 batch.delete(snapshotRef);
                 await batch.commit();

                _showModal('Éxito', 'Cierre completado. Reporte descargado, ventas y obsequios archivados/eliminados.', showVentasTotalesView); return true;
            } catch(e) { console.error("Error cierre:", e); _showModal('Error', `Error: ${e.message}`); return false; }
        }, 'Sí, Ejecutar Cierre', null, true);
    }
    function showPastSaleOptions(ventaId, tipo = 'ticket') {
        console.log("showPastSaleOptions called with ID:", ventaId);
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
        console.log("editVenta called with ID:", ventaId);
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (!venta) { _showModal('Error', 'Venta no encontrada.'); return; }
         _originalVentaForEdit = JSON.parse(JSON.stringify(venta));
        showEditVentaView(venta);
    }
    function deleteVenta(ventaId) {
        console.log("deleteVenta called with ID:", ventaId);
         const venta = _ventasGlobal.find(v => v.id === ventaId);
         if (!venta) {
            _showModal('Error', 'Venta no encontrada en la lista actual.');
            return;
         }

        _showModal('Confirmar Eliminación', `¿Eliminar venta de ${venta.clienteNombre}? <strong class="text-red-600">Esta acción revertirá el stock y el saldo de vacíos asociados a esta venta.</strong> ¿Continuar?`, async () => {
            _showModal('Progreso', 'Eliminando venta y ajustando datos...');
            try {
                const ventaRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/ventas`, ventaId);
                const clienteRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, venta.clienteId);

                await _runTransaction(_db, async (transaction) => {
                    console.log("Transaction: Reading venta and cliente...");
                    const ventaDoc = await transaction.get(ventaRef);
                    const clienteDoc = await transaction.get(clienteRef);

                    if (!ventaDoc.exists()) throw new Error("La venta ya no existe.");

                    const ventaData = ventaDoc.data();
                    const clienteData = clienteDoc.exists() ? clienteDoc.data() : null;
                    const productosVendidos = ventaData.productos || [];

                    const inventarioRefs = {};
                    const productoIds = productosVendidos.map(p => p.id).filter(id => id);
                    console.log(`Transaction: Reading ${productoIds.length} inventory items...`);
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
                    console.log("Transaction: All reads completed.");

                    const saldoVaciosClienteActual = clienteData?.saldoVacios || {};
                    const nuevosSaldoVaciosCliente = { ...saldoVaciosClienteActual };
                    const ajustesInventario = [];
                    const ajustesVaciosNetos = {};

                    for (const productoVendido of productosVendidos) {
                        const unidadesARestaurar = productoVendido.totalUnidadesVendidas || 0;
                        if (unidadesARestaurar > 0) {
                            const productoInventarioRef = inventarioRefs[productoVendido.id];
                            if (productoInventarioRef) {
                                ajustesInventario.push({ ref: productoInventarioRef, cantidad: unidadesARestaurar, id: productoVendido.id });
                            } else {
                                console.warn(`No se encontró ref de inventario para producto ${productoVendido.id} en la venta.`);
                            }
                        }

                        if (productoVendido.manejaVacios && productoVendido.tipoVacio) {
                            const tipo = productoVendido.tipoVacio;
                            const cajasEntregadas = productoVendido.cantidadVendida?.cj || 0;
                            if (cajasEntregadas > 0) {
                                ajustesVaciosNetos[tipo] = (ajustesVaciosNetos[tipo] || 0) - cajasEntregadas;
                            }
                        }
                    }

                    const vaciosDevueltosEnVenta = ventaData.vaciosDevueltosPorTipo || {};
                    for (const tipo in vaciosDevueltosEnVenta) {
                        const cajasDevueltas = vaciosDevueltosEnVenta[tipo] || 0;
                        if (cajasDevueltas > 0) {
                            ajustesVaciosNetos[tipo] = (ajustesVaciosNetos[tipo] || 0) + cajasDevueltas;
                        }
                    }

                    console.log("Transaction: Starting writes...");

                    for (const ajuste of ajustesInventario) {
                         const invDoc = inventarioDocsMap.get(ajuste.id);
                         const stockActual = invDoc && invDoc.exists() ? (invDoc.data().cantidadUnidades || 0) : 0;
                         const nuevoStock = stockActual + ajuste.cantidad;
                         console.log(`Transaction: Updating inventory ${ajuste.id}. Old: ${stockActual}, Adjustment: ${ajuste.cantidad}, New: ${nuevoStock}`);
                         transaction.set(ajuste.ref, { cantidadUnidades: nuevoStock }, { merge: true });
                    }

                    let saldoVaciosModificado = false;
                    if (clienteDoc.exists()) {
                        for (const tipo in ajustesVaciosNetos) {
                            const ajuste = ajustesVaciosNetos[tipo];
                            if (ajuste !== 0) {
                                nuevosSaldoVaciosCliente[tipo] = (nuevosSaldoVaciosCliente[tipo] || 0) + ajuste;
                                saldoVaciosModificado = true;
                            }
                        }
                        if (saldoVaciosModificado) {
                            console.log("Transaction: Updating client empty balance.", nuevosSaldoVaciosCliente);
                            transaction.update(clienteRef, { saldoVacios: nuevosSaldoVaciosCliente });
                        } else {
                            console.log("Transaction: No client empty balance changes needed.");
                        }
                    } else {
                         console.warn("Transaction: Client doc does not exist, skipping empty balance update.");
                    }

                    console.log("Transaction: Deleting sale document.");
                    transaction.delete(ventaRef);

                    console.log("Transaction: All writes queued.");
                });

                _showModal('Éxito', 'Venta eliminada. Inventario y saldos de vacíos ajustados.');

            } catch (error) {
                console.error("Error eliminando/revirtiendo venta:", error);
                _showModal('Error', `No se pudo eliminar/revertir la venta: ${error.message}`);
            }
        }, 'Sí, Eliminar y Revertir', null, true);
    }
    async function showEditVentaView(venta) {
        if (_floatingControls) _floatingControls.classList.add('hidden'); _monedaActual = 'USD';
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 w-full"> <div class="bg-white/90 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col h-full" style="min-height: calc(100vh - 2rem);">
                <div id="venta-header-section" class="mb-4">
                    <div class="flex justify-between items-center mb-4"> <h2 class="text-xl font-bold">Editando Venta</h2> <button id="backToVentasBtn" class="px-4 py-2 bg-gray-400 text-white text-sm rounded-lg shadow-md hover:bg-gray-500">Volver</button> </div>
                    <div class="p-4 bg-gray-100 rounded-lg"> <p><span class="font-medium">Cliente:</span> <span class="font-bold">${venta.clienteNombre||'N/A'}</span></p> <p class="text-sm"><span class="font-medium">Fecha Orig:</span> ${venta.fecha?.toDate?venta.fecha.toDate().toLocaleString('es-ES'):'N/A'}</p> </div>
                </div>
                <div id="vacios-devueltos-section" class="mb-4"> <h3 class="text-sm font-semibold text-cyan-700 mb-1">Vacíos Devueltos:</h3> <div class="grid grid-cols-3 gap-2"> ${TIPOS_VACIO.map(t => `<div><label for="vacios-${t.replace(/\s+/g,'-')}" class="text-xs mb-1 block">${t}</label><input type="number" min="0" value="${venta.vaciosDevueltosPorTipo?(venta.vaciosDevueltosPorTipo[t]||0):0}" id="vacios-${t.replace(/\s+/g,'-')}" class="w-16 p-1 text-center border rounded-md" data-tipo-vacio="${t}" oninput="window.ventasModule.handleTipoVacioChange(event)"></div>`).join('')} </div> </div>
                <div id="inventarioTableContainer" class="animate-fade-in flex-grow flex flex-col overflow-hidden">
                    <div class="mb-2"> <label for="rubroFilter" class="text-xs">Filtrar Rubro:</label> <select id="rubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select> </div>
                    <div class="overflow-auto flex-grow rounded-lg shadow"> <table class="min-w-full bg-white text-xs"><thead class="bg-gray-200 sticky top-0 z-10"><tr class="uppercase"> <th class="py-2 px-1 text-center">Cant.</th> <th class="py-2 px-2 text-left">Producto</th> <th class="py-2 px-2 text-left price-toggle" onclick="window.ventasModule.toggleMoneda()">Precio</th> <th class="py-2 px-1 text-center">Stock Disp.</th> </tr></thead><tbody id="inventarioTableBody" class="text-gray-600"></tbody></table> </div>
                </div>
                <div id="venta-footer-section" class="mt-4 flex items-center justify-between"> <span id="ventaTotal" class="text-lg font-bold">$0.00</span> <button id="saveChangesBtn" class="px-6 py-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button> </div>
            </div> </div>
        `;
        document.getElementById('saveChangesBtn').addEventListener('click', handleGuardarVentaEditada); document.getElementById('backToVentasBtn').addEventListener('click', showVentasActualesView);
        _showModal('Progreso', 'Cargando datos...');
        try {
            const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`)); _inventarioCache = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _ventaActual = { cliente: { id: venta.clienteId, nombreComercial: venta.clienteNombre, nombrePersonal: venta.clienteNombrePersonal }, productos: (venta.productos||[]).reduce((acc,p)=>{const pComp=_inventarioCache.find(inv=>inv.id===p.id)||p; const cant=p.cantidadVendida||{}; acc[p.id]={...pComp, cantCj:cant.cj||0, cantPaq:cant.paq||0, cantUnd:cant.und||0, totalUnidadesVendidas:p.totalUnidadesVendidas||0}; return acc;},{}), vaciosDevueltosPorTipo: venta.vaciosDevueltosPorTipo||{} };
            TIPOS_VACIO.forEach(t => { if(!_ventaActual.vaciosDevueltosPorTipo[t]) _ventaActual.vaciosDevueltosPorTipo[t]=0; });
            document.getElementById('rubroFilter').addEventListener('change', renderEditVentasInventario); populateRubroFilter(); document.getElementById('rubroFilter').value = '';
            renderEditVentasInventario(); updateVentaTotal(); document.getElementById('modalContainer').classList.add('hidden');
        } catch (error) { console.error("Error cargando edit:", error); _showModal('Error', `Error: ${error.message}`); showVentasActualesView(); }
    }
    async function renderEditVentasInventario() {
        const body = document.getElementById('inventarioTableBody'), rF = document.getElementById('rubroFilter'); if (!body || !rF) return; body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">Cargando...</td></tr>`;
        const selRubro = rF.value; let invToShow = _inventarioCache.filter(p => _originalVentaForEdit.productos.some(oP => oP.id === p.id) || (p.cantidadUnidades || 0) > 0);
        if (selRubro) invToShow = invToShow.filter(p => p.rubro === selRubro);
        const sortFunc = await window.getGlobalProductSortFunction(); invToShow.sort(sortFunc); body.innerHTML = '';
        if (invToShow.length === 0) { body.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500">No hay productos ${selRubro ? 'en este rubro' : ''}.</td></tr>`; return; }
        let lastHKey = null; const fSortKey = window._sortPreferenceCache ? window._sortPreferenceCache[0] : 'segmento';
        invToShow.forEach(prod => {
             const curHVal = prod[fSortKey] || `Sin ${fSortKey}`; if (curHVal !== lastHKey) { lastHKey = curHVal; const hRow=document.createElement('tr'); hRow.innerHTML=`<td colspan="4" class="py-1 px-2 bg-gray-100 font-bold sticky top-[calc(theme(height.10))] z-[9]">${lastHKey}</td>`; body.appendChild(hRow); }
             const vPor=prod.ventaPor||{und:true}, vActProd=_ventaActual.productos[prod.id]||{}, origVProd=_originalVentaForEdit.productos.find(p=>p.id===prod.id), precios=prod.precios||{und:prod.precioPorUnidad||0};
             const fPrice = (v) => { if (isNaN(v)) v=0; if (_monedaActual==='COP'&&_tasaCOP>0) return `COP ${(Math.ceil((v*_tasaCOP)/100)*100).toLocaleString('es-CO')}`; if (_monedaActual==='Bs'&&_tasaBs>0) return `Bs.S ${(v*_tasaBs).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`; return `$${v.toFixed(2)}`; };
             const cERow = (t, cC, pT, descT) => { const cStockU=prod.cantidadUnidades||0, origQtySold = origVProd?.cantidadVendida?.[t] ?? 0; let factor=t==='cj'?(prod.unidadesPorCaja||1):t==='paq'?(prod.unidadesPorPaquete||1):1; const maxUAvail=cStockU+(origQtySold*factor); const maxInp=Math.floor(maxUAvail/factor); const stockDispT=Math.floor(cStockU/factor); const r=document.createElement('tr'); r.className='border-b hover:bg-gray-50'; r.innerHTML=`<td class="py-2 px-1 text-center align-middle"> <input type="number" min="0" max="${maxInp}" value="${cC}" class="w-16 p-1 text-center border rounded-md" data-product-id="${prod.id}" data-tipo-venta="${t}" oninput="window.ventasModule.handleQuantityChange(event)"> </td> <td class="py-2 px-2 text-left align-middle">${descT} <span class="text-xs text-gray-500">${prod.marca||'S/M'}</span></td> <td class="py-2 px-2 text-left align-middle font-semibold price-toggle" onclick="window.ventasModule.toggleMoneda()">${fPrice(pT)}</td> <td class="py-2 px-1 text-center align-middle">${stockDispT} ${t.toUpperCase()}</td>`; body.appendChild(r); };
             if (vPor.cj) { const uCj=prod.unidadesPorCaja||1; cERow('cj', vActProd.cantCj||0, precios.cj||0, `${prod.presentacion} (Cj/${uCj} und)`); }
             if (vPor.paq) { const uPaq=prod.unidadesPorPaquete||1; cERow('paq', vActProd.cantPaq||0, precios.paq||0, `${prod.presentacion} (Paq/${uPaq} und)`); }
             if (vPor.und) { cERow('und', vActProd.cantUnd||0, precios.und||0, `${prod.presentacion} (Und)`); }
        }); updateVentaTotal();
    }
    async function handleGuardarVentaEditada() {
        if (!_originalVentaForEdit) { _showModal('Error', 'Venta original no encontrada.'); return; }
        const prods = Object.values(_ventaActual.productos).filter(p => p.totalUnidadesVendidas > 0);
        const hayVac = Object.values(_ventaActual.vaciosDevueltosPorTipo || {}).some(c => c > 0);
        // Permitir guardar aunque no haya productos si hay vacíos (o viceversa), pero no si ambos están vacíos
        if (prods.length === 0 && !hayVac && Object.values(_originalVentaForEdit.vaciosDevueltosPorTipo || {}).every(c => c === 0)) {
            _showModal('Error', 'La venta editada no puede quedar completamente vacía.'); return;
        }

        _showModal('Confirmar Cambios', '¿Guardar cambios? Stock y saldos se ajustarán.', async () => {
            _showModal('Progreso', 'Guardando y ajustando...');
            try {
                const batch=_writeBatch(_db); const origProds=new Map((_originalVentaForEdit.productos||[]).map(p=>[p.id,p])); const newProds=new Map(Object.values(_ventaActual.productos).map(p=>[p.id,p])); const allPIds=new Set([...origProds.keys(),...newProds.keys()]); const vaciosAdj={}; TIPOS_VACIO.forEach(t=>vaciosAdj[t]=0);
                for(const pId of allPIds){ const origP=origProds.get(pId), newP=newProds.get(pId), pCache=_inventarioCache.find(p=>p.id===pId); if(!pCache)continue; const origU=origP?(origP.totalUnidadesVendidas||0):0, newU=newP?(newP.totalUnidadesVendidas||0):0, deltaU=origU-newU; // deltaU > 0 significa que se devolvió stock
                    if(deltaU!==0){ const cStockU=pCache.cantidadUnidades||0, fStockU=cStockU+deltaU; if(fStockU<0)throw new Error(`Stock insuficiente "${pCache.presentacion}" (${fStockU} unidades). Ajuste requerido: ${deltaU}.`); const pRef=_doc(_db,`artifacts/${_appId}/users/${_userId}/inventario`,pId); batch.update(pRef,{cantidadUnidades:fStockU}); }
                    if(pCache.manejaVacios&&pCache.tipoVacio){ const tV=pCache.tipoVacio, origCj=origP?.cantidadVendida?.cj||0, newCj=newP?.cantCj||0, deltaCj=newCj-origCj; if(vaciosAdj.hasOwnProperty(tV))vaciosAdj[tV]+=deltaCj; } } // deltaCj > 0 significa que se entregaron más vacíos (aumenta deuda)
                const origVac=_originalVentaForEdit.vaciosDevueltosPorTipo||{}, newVac=_ventaActual.vaciosDevueltosPorTipo||{}; TIPOS_VACIO.forEach(t=>{const origD=origVac[t]||0, newD=newVac[t]||0, deltaD=newD-origD; if(vaciosAdj.hasOwnProperty(t))vaciosAdj[t]-=deltaD;}); // deltaD > 0 significa que se recibieron más vacíos (disminuye deuda)
                if(Object.values(vaciosAdj).some(a=>a!==0)){const cliRef=_doc(_db,`artifacts/ventas-9a210/public/data/clientes`,_originalVentaForEdit.clienteId); try{await _runTransaction(_db,async(t)=>{const cliDoc=await t.get(cliRef); if(!cliDoc.exists())return; const cliData=cliDoc.data(), sVac=cliData.saldoVacios||{}; for(const tV in vaciosAdj){const adj=vaciosAdj[tV]; if(adj!==0) sVac[tV]=(sVac[tV]||0)+adj;} t.update(cliRef,{saldoVacios:sVac});});} catch(transErr){console.error(`Error ajustando vacíos cli ${_originalVentaForEdit.clienteId}:`,transErr); _showModal('Advertencia','No se pudieron ajustar los saldos de vacíos del cliente.');}} // Continuar aunque falle ajuste de saldo
                let nTotal=0; const nItems=Object.values(_ventaActual.productos).filter(p=>p.totalUnidadesVendidas>0).map(p=>{ const pr=p.precios||{und:p.precioPorUnidad||0}; const sub=(pr.cj||0)*(p.cantCj||0)+(pr.paq||0)*(p.cantPaq||0)+(pr.und||0)*(p.cantUnd||0); nTotal+=sub; const uCj=p.unidadesPorCaja||1, uPaq=p.unidadesPorPaquete||1; const totURecalc=(p.cantCj||0)*uCj+(p.cantPaq||0)*uPaq+(p.cantUnd||0); return { id:p.id, presentacion:p.presentacion, rubro:p.rubro??null, marca:p.marca??null, segmento:p.segmento??null, precios:p.precios, ventaPor:p.ventaPor, unidadesPorPaquete:p.unidadesPorPaquete, unidadesPorCaja:p.unidadesPorCaja, cantidadVendida:{cj:p.cantCj||0,paq:p.cantPaq||0,und:p.cantUnd||0}, totalUnidadesVendidas:totURecalc, iva:p.iva??0, manejaVacios:p.manejaVacios||false, tipoVacio:p.tipoVacio||null }; });
                const vRef=_doc(_db,`artifacts/${_appId}/users/${_userId}/ventas`,_originalVentaForEdit.id); batch.update(vRef,{productos:nItems, total:nTotal, vaciosDevueltosPorTipo:_ventaActual.vaciosDevueltosPorTipo, fechaModificacion:new Date()});
                await batch.commit(); _originalVentaForEdit=null; _showModal('Éxito','Venta actualizada.',showVentasActualesView);
            } catch (error) { console.error("Error guardando edit:", error); _showModal('Error', `Error: ${error.message}`); }
        }, 'Sí, Guardar', null, true);
    }

    window.ventasModule = {
        toggleMoneda,
        handleQuantityChange,
        handleTipoVacioChange,
        showPastSaleOptions,
        editVenta,
        deleteVenta,
        invalidateCache: () => { /* No action needed */ }
    };
})();

// --- Lógica del módulo de Gestión de Obsequios ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _getDocs, _writeBatch, _runTransaction, _query, _where, _orderBy, _limit, _deleteDoc;

    // Estado específico del módulo
    let _clientesCache = [];
    let _inventarioCache = []; 
    let _usersCache = []; // Caché de vendedores para el panel Admin
    let _obsequioConfig = { productoId: null, productoData: null }; 
    let _obsequioActual = { cliente: null, cantidadEntregada: 0, vaciosRecibidos: 0, observacion: '' };
    let _lastObsequiosSearch = []; 

    const TIPOS_VACIO = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    let OBSEQUIO_CONFIG_PATH;
    let CLIENTES_PUBLIC_PATH;

    window.initObsequios = function(dependencies) {
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
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch; 
        _runTransaction = dependencies.runTransaction;
        _query = dependencies.query;
        _where = dependencies.where;
        _orderBy = dependencies.orderBy;
        _limit = dependencies.limit;
        _deleteDoc = dependencies.deleteDoc;

        OBSEQUIO_CONFIG_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/config/obsequio`;
        CLIENTES_PUBLIC_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`;
        
        console.log("Módulo Obsequios inicializado. Public ID:", PUBLIC_DATA_ID);
    };

    window.showGestionObsequiosView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Obsequios</h1>
                        <div class="space-y-4">
                            <button id="generarObsequioBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600 transition">Generar Obsequio</button>
                            <button id="registroObsequiosBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition">Registro de Obsequios</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">Volver al Menú</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('generarObsequioBtn').onclick = showGenerarObsequioView;
        document.getElementById('registroObsequiosBtn').onclick = showRegistroObsequiosView;
        document.getElementById('backToMenuBtn').onclick = _showMainMenu;
    };

    async function showGenerarObsequioView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">Generar Obsequio</h2>
                        <button onclick="window.showGestionObsequiosView()" class="text-gray-400 font-bold hover:text-gray-600 text-xl">✕</button>
                    </div>
                    <div id="obs-form-loader" class="text-center p-8 font-medium text-gray-500 animate-pulse">Sincronizando Catálogo y Clientes...</div>
                    <div id="obs-form-content" class="hidden space-y-4">
                        <div class="relative" id="cliSearchContainer">
                            <label class="block text-sm font-bold text-gray-700 mb-1">Buscar Cliente:</label>
                            <input type="text" id="cliSearch" placeholder="Escriba el nombre comercial..." class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm">
                            <div id="cliDrop" class="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-2xl mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <div id="cliSel" class="hidden p-4 bg-cyan-50 border border-cyan-200 rounded-lg flex justify-between items-center shadow-sm">
                            <span id="cliName" class="font-black text-cyan-900 text-lg"></span>
                            <button onclick="window.resetClientSelection()" class="text-xs font-bold text-cyan-600 hover:text-cyan-800 uppercase tracking-wider bg-white px-2 py-1 rounded border border-cyan-200">Cambiar</button>
                        </div>
                        <form id="formObs" class="hidden space-y-4 border-t pt-6 mt-2">
                            <div class="bg-gray-50 p-4 rounded-lg text-center border border-gray-200 shadow-inner">
                                <p class="text-xs text-gray-500 font-bold tracking-widest uppercase mb-1">PRODUCTO SELECCIONADO</p>
                                <p id="prodName" class="font-black text-gray-800 text-lg leading-tight"></p>
                                <p class="text-sm text-gray-600 mt-2 bg-blue-100 inline-block px-3 py-1 rounded-full font-medium">Stock Disponible: <span id="prodStock" class="font-bold text-blue-800"></span></p>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-bold text-gray-700 mb-1">Cajas a Entregar:</label>
                                    <input type="number" id="cantEnt" min="1" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-center text-xl text-cyan-700 shadow-sm" placeholder="0" required>
                                </div>
                                <div>
                                    <label class="block text-sm font-bold text-gray-700 mb-1">Vacíos Recibidos:</label>
                                    <input type="number" id="vacRec" min="0" value="0" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-center text-xl shadow-sm">
                                    <p id="vacTipo" class="text-[10px] text-gray-500 mt-1 text-center font-semibold uppercase"></p>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-1">Observación (Opcional):</label>
                                <textarea id="obsText" placeholder="Motivo del obsequio..." class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-sm shadow-sm"></textarea>
                            </div>
                            <button type="submit" class="w-full py-4 mt-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-black shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-all text-lg transform hover:scale-[1.02]">Confirmar Entrega</button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        await Promise.all([_loadClientes(), _loadInventarioHibrido(), _loadObsequioProduct()]);

        const loader = document.getElementById('obs-form-loader');
        const content = document.getElementById('obs-form-content');

        if (_obsequioConfig.productoData) {
            loader.classList.add('hidden');
            content.classList.remove('hidden');
            setupObsequioUI();
        } else {
            loader.innerHTML = `
                <div class="text-red-500 font-bold mb-2">Error: El Producto de Obsequio no ha sido configurado.</div>
                <p class="text-sm text-gray-600">Por favor, pida a un Administrador que defina el producto de obsequio en las configuraciones.</p>
            `;
            loader.classList.remove('animate-pulse');
        }
    }

    async function _loadObsequioProduct() {
        try {
            const snap = await _getDoc(_doc(_db, OBSEQUIO_CONFIG_PATH));
            if (snap.exists()) {
                _obsequioConfig.productoId = snap.data().productoId;
                _obsequioConfig.productoData = _inventarioCache.find(p => p.id === _obsequioConfig.productoId);
            }
        } catch (e) {
            console.warn("Error cargando config obsequio:", e);
        }
    }

    async function _loadInventarioHibrido() {
        try {
            const masterSnap = await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`));
            const masterMap = {};
            masterSnap.docs.forEach(d => masterMap[d.id] = { id: d.id, ...d.data() });

            const stockSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
            const stockMap = {};
            stockSnap.docs.forEach(d => stockMap[d.id] = { id: d.id, ...d.data() });

            _inventarioCache = [];
            const allIds = new Set([...Object.keys(masterMap), ...Object.keys(stockMap)]);
            
            allIds.forEach(id => {
                const master = masterMap[id];
                const stock = stockMap[id];
                
                if (master) {
                    _inventarioCache.push({
                        ...master,
                        cantidadUnidades: stock ? (stock.cantidadUnidades || 0) : 0,
                        id: id
                    });
                } else if (stock) {
                    _inventarioCache.push({ ...stock, id: id });
                }
            });
        } catch (e) {
            console.error("Error carga híbrida obsequios:", e);
        }
    }

    async function _loadClientes() {
        try {
            const snap = await _getDocs(_collection(_db, CLIENTES_PUBLIC_PATH));
            _clientesCache = snap.docs.map(d => ({id: d.id, ...d.data()}));
        } catch (e) { console.error("Error cargando clientes:", e); }
    }

    function setupObsequioUI() {
        const p = _obsequioConfig.productoData;
        document.getElementById('prodName').textContent = p.presentacion;
        const uCaja = p.unidadesPorCaja || 1;
        document.getElementById('prodStock').textContent = `${Math.floor((p.cantidadUnidades||0) / uCaja)} Cajas`;
        document.getElementById('vacTipo').textContent = `Tipo: ${p.tipoVacio || 'N/A'}`;

        const input = document.getElementById('cliSearch');
        const drop = document.getElementById('cliDrop');

        input.oninput = () => {
            const term = input.value.toUpperCase();
            const list = _clientesCache.filter(c => (c.nombreComercial||'').toUpperCase().includes(term) || (c.nombrePersonal||'').toUpperCase().includes(term)).slice(0, 5);
            drop.innerHTML = list.map(c => `<div class="p-3 border-b hover:bg-cyan-50 cursor-pointer text-sm font-medium text-gray-800 transition" onclick="window.selectClientObs('${c.id}')">${c.nombreComercial}</div>`).join('');
            drop.classList.toggle('hidden', list.length === 0);
        };

        window.selectClientObs = (id) => {
            const c = _clientesCache.find(x => x.id === id);
            _obsequioActual.cliente = c;
            document.getElementById('cliSearchContainer').classList.add('hidden');
            document.getElementById('cliSel').classList.remove('hidden');
            document.getElementById('cliName').textContent = c.nombreComercial;
            document.getElementById('formObs').classList.remove('hidden');
            drop.classList.add('hidden');
        };

        window.resetClientSelection = () => {
            document.getElementById('cliSearchContainer').classList.remove('hidden');
            document.getElementById('cliSel').classList.add('hidden');
            document.getElementById('formObs').classList.add('hidden');
            document.getElementById('cliSearch').value = '';
            _obsequioActual.cliente = null;
        };

        document.getElementById('formObs').onsubmit = handleRegistrarObsequio;
    }

    async function handleRegistrarObsequio(e) {
        e.preventDefault();
        const cjs = parseInt(document.getElementById('cantEnt').value);
        const vRec = parseInt(document.getElementById('vacRec').value) || 0;
        const p = _obsequioConfig.productoData;

        if (isNaN(cjs) || cjs <= 0) {
            _showModal('Error', 'Debe ingresar una cantidad válida de cajas a entregar.');
            return;
        }

        const currentStockEnCajas = Math.floor((p.cantidadUnidades || 0) / (p.unidadesPorCaja || 1));
        if (cjs > currentStockEnCajas) {
            _showModal('Error', `Stock Insuficiente. Solo dispone de ${currentStockEnCajas} cajas de este producto en el inventario.`);
            return;
        }

        _showModal('Confirmar Entrega', `¿Está seguro de entregar <b>${cjs} Cajas</b> como obsequio a <br><br><span class="text-blue-600 font-bold">${_obsequioActual.cliente.nombreComercial}</span>?`, async () => {
            _showModal('Progreso', 'Registrando transacción de obsequio...', null, '', null, false);
            try {
                const regRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
                const invRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                const cliRef = _doc(_db, CLIENTES_PUBLIC_PATH, _obsequioActual.cliente.id);

                const regData = {
                    fecha: new Date(),
                    clienteId: _obsequioActual.cliente.id,
                    clienteNombre: _obsequioActual.cliente.nombreComercial,
                    productoId: p.id,
                    productoNombre: p.presentacion,
                    cantidadCajas: cjs,
                    vaciosRecibidos: vRec,
                    tipoVacio: p.tipoVacio || null,
                    unidadesPorCaja: p.unidadesPorCaja || 1, 
                    observacion: document.getElementById('obsText').value,
                    userId: _userId
                };

                await _runTransaction(_db, async (t) => {
                    const cDoc = await t.get(cliRef);
                    const iDoc = await t.get(invRef);
                    
                    const currentStock = iDoc.exists() ? (iDoc.data().cantidadUnidades || 0) : 0;
                    const unidadesARestar = cjs * (p.unidadesPorCaja || 1);
                    const newStock = currentStock - unidadesARestar;

                    if (newStock < 0) {
                        throw new Error("Transacción fallida: Stock insuficiente al momento de escribir en la base de datos.");
                    }
                    
                    const sv = cDoc.exists() ? (cDoc.data().saldoVacios || {}) : {};
                    if(p.tipoVacio) {
                        sv[p.tipoVacio] = (sv[p.tipoVacio] || 0) + cjs - vRec;
                        t.update(cliRef, { saldoVacios: sv });
                    }
                    
                    t.set(invRef, { cantidadUnidades: newStock }, { merge: true });
                    t.set(regRef, regData);
                });

                _showSharingOptionsObsequio(regData, p, window.showGestionObsequiosView);
            } catch (err) { 
                _showModal('Error', err.message); 
            }
        }, 'Sí, Entregar Obsequio', null, true);
    }

    function _showSharingOptionsObsequio(reg, prod, callback) {
        const html = `
            <div class="text-center space-y-4">
                <p class="font-medium text-gray-700">Entrega de obsequio registrada exitosamente.<br>¿Cómo desea enviar el comprobante?</p>
                <button id="btnImg" class="w-full py-3 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 transition">Compartir Imagen (WhatsApp)</button>
                <button id="btnTxt" class="w-full py-3 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition">Copiar Texto</button>
            </div>
        `;
        _showModal('Comprobante Generado', html, null, '');
        
        document.getElementById('btnImg').onclick = async () => {
            const dateObj = reg.fecha?.toDate ? reg.fecha.toDate() : (new Date(reg.fecha));
            const dateStr = isNaN(dateObj) ? '' : dateObj.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'});

            const ticketHTML = `
                <div id="ticket-ob" class="p-6 bg-white text-black font-mono text-xl" style="width:500px;">
                    <h2 class="text-center font-bold border-b pb-2 text-2xl">DIST. CASTILLO</h2>
                    <p class="mt-4 font-bold text-center uppercase tracking-widest text-lg">--- OBSEQUIO ---</p>
                    <p class="mt-4">FECHA: ${dateStr}</p>
                    <p>CLIENTE: ${reg.clienteNombre}</p>
                    <hr class="my-4 border-dashed border-gray-400">
                    <p class="font-bold">PRODUCTO:</p>
                    <p>${reg.productoNombre}</p>
                    <p class="mt-2">CANTIDAD ENTREGADA: <span class="font-bold">${reg.cantidadCajas} CAJAS</span></p>
                    <hr class="my-4 border-dashed border-gray-400">
                    <p>VACIOS RECIBIDOS: ${reg.vaciosRecibidos} (${reg.tipoVacio || 'N/A'})</p>
                    ${reg.observacion ? `<p class="mt-4 text-sm italic">Obs: ${reg.observacion}</p>` : ''}
                    <div class="mt-16 border-t pt-2 text-center text-sm font-bold">Firma de Conformidad del Cliente</div>
                </div>
            `;
            const temp = document.createElement('div');
            temp.style.position = 'absolute'; temp.style.left = '-9999px';
            temp.innerHTML = ticketHTML; document.body.appendChild(temp);
            
            try {
                const canvas = await html2canvas(document.getElementById('ticket-ob'), { scale: 2 });
                canvas.toBlob(blob => {
                    if (navigator.share && blob) {
                        navigator.share({ files: [new File([blob], "ticket_obsequio.png", {type:"image/png"})] });
                    } else {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a'); link.href=url; link.download="ticket_obsequio.png"; link.click();
                    }
                    document.body.removeChild(temp);
                    const pModal = document.getElementById('modalContainer'); if(pModal) pModal.classList.add('hidden');
                    if (callback) callback();
                });
            } catch (err) {
                console.error("Error generando ticket imagen:", err);
                document.body.removeChild(temp);
                _showModal('Error', 'No se pudo generar la imagen del ticket.');
            }
        };

        document.getElementById('btnTxt').onclick = () => {
            const dateObj = reg.fecha?.toDate ? reg.fecha.toDate() : (new Date(reg.fecha));
            const dStr = isNaN(dateObj) ? '' : dateObj.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'});
            
            const txt = `*DIST. CASTILLO*\n*--- OBSEQUIO ---*\nFECHA: ${dStr}\nCLIENTE: ${reg.clienteNombre}\n\n*PRODUCTO:*\n${reg.productoNombre}\n*CANTIDAD:* ${reg.cantidadCajas} CAJAS\n\nVACIOS RECIBIDOS: ${reg.vaciosRecibidos} (${reg.tipoVacio || 'N/A'})`;
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt).then(() => {
                    _showModal('Copiado', 'Texto copiado al portapapeles. Puede pegarlo en WhatsApp.', callback);
                });
            } else {
                const el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select();
                document.execCommand('copy'); document.body.removeChild(el);
                _showModal('Copiado', 'Texto copiado al portapapeles. Puede pegarlo en WhatsApp.', callback);
            }
        };
    }

    async function showRegistroObsequiosView() {
        if (_userRole === 'admin' && _usersCache.length === 0) {
            try {
                const usersSnap = await _getDocs(_collection(_db, "users"));
                _usersCache = usersSnap.docs.map(d => ({id: d.id, ...d.data()}));
            } catch (e) {
                console.warn("No se pudo cargar la lista de usuarios.", e);
            }
        }

        const today = new Date().toISOString().split('T')[0];

        let adminFiltersHTML = '';
        if (_userRole === 'admin') {
            adminFiltersHTML = `
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Vendedor:</label>
                    <select id="obsUserSelect" class="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="all">Todos los Vendedores</option>
                        ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                    </select>
                </div>
            `;
        }

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-8">
                <div class="container mx-auto max-w-4xl bg-white p-4 sm:p-6 md:p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-black mb-6 text-gray-800 text-center tracking-tight">Registro de Obsequios</h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-${_userRole === 'admin' ? '4' : '3'} gap-4 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100 shadow-inner">
                        ${adminFiltersHTML}
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Desde Fecha:</label>
                            <input type="date" id="obsDateStart" value="${today}" class="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Hasta Fecha:</label>
                            <input type="date" id="obsDateEnd" value="${today}" class="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                        <div class="flex items-end">
                            <button id="btnSearch" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg shadow-md transition-colors">Buscar</button>
                        </div>
                    </div>
                    
                    <div id="rList" class="space-y-3 max-h-[60vh] overflow-y-auto pr-2 pb-4">
                        <p class="text-center text-gray-500 italic mt-10">Presione buscar para cargar los registros.</p>
                    </div>
                    <button onclick="window.showGestionObsequiosView()" class="w-full mt-6 py-3 bg-gray-400 hover:bg-gray-500 text-white font-bold rounded-lg shadow transition">Volver al Menú</button>
                </div>
            </div>
        `;
        document.getElementById('btnSearch').onclick = handleSearchObsequios;
        handleSearchObsequios();
    }

    async function handleSearchObsequios() {
        const dStartStr = document.getElementById('obsDateStart').value;
        const dEndStr = document.getElementById('obsDateEnd').value;
        let selectedUserId = _userId;

        if (_userRole === 'admin') {
            const selectEl = document.getElementById('obsUserSelect');
            if (selectEl) selectedUserId = selectEl.value;
        }

        if (!dStartStr || !dEndStr) {
            _showModal('Aviso', 'Seleccione un rango de fechas válido.');
            return;
        }

        const [sY, sM, sD] = dStartStr.split('-');
        const dStart = new Date(sY, sM - 1, sD, 0, 0, 0, 0);

        const [eY, eM, eD] = dEndStr.split('-');
        const dEnd = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

        const list = document.getElementById('rList');
        list.innerHTML = '<p class="text-center text-blue-500 font-bold animate-pulse py-10">Buscando en activos e historial...</p>';

        try {
            let uidsToSearch = [selectedUserId];
            if (selectedUserId === 'all') {
                uidsToSearch = _usersCache.map(u => u.id);
            }

            let results = [];

            for (const uid of uidsToSearch) {
                // 1. BUSCAR EN ACTIVOS (No cerrados aún)
                try {
                    const qActivos = _query(_collection(_db, `artifacts/${_appId}/users/${uid}/obsequios_entregados`));
                    const snapActivos = await _getDocs(qActivos);
                    
                    snapActivos.docs.forEach(d => {
                        const data = d.data();
                        const dObj = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
                        if (dObj >= dStart && dObj <= dEnd) {
                            results.push({
                                id: d.id, 
                                vendedorId: uid, 
                                isCerrado: false, 
                                ...data, 
                                fechaParaOrdenar: dObj
                            });
                        }
                    });
                } catch(folderErr) {}

                // 2. BUSCAR EN HISTORIAL (Cierres ya procesados)
                try {
                    const qCierres = _query(_collection(_db, `artifacts/${_appId}/users/${uid}/cierres`),
                              _where("fecha", ">=", dStart),
                              _where("fecha", "<=", dEnd));
                    
                    const snapCierres = await _getDocs(qCierres);
                    
                    snapCierres.docs.forEach(dCierre => {
                        const cierreData = dCierre.data();
                        const obsArray = cierreData.obsequios || [];
                        
                        obsArray.forEach((obs, index) => {
                            const dObj = obs.fecha?.toDate ? obs.fecha.toDate() : (obs.fecha ? new Date(obs.fecha) : cierreData.fecha.toDate());
                            results.push({ 
                                id: `${dCierre.id}_${index}`, 
                                vendedorId: uid, 
                                isCerrado: true, 
                                ...obs, 
                                fecha: dObj, 
                                fechaParaOrdenar: dObj 
                            });
                        });
                    });
                } catch(folderErr) {}
            }
            
            // Ordenar de más reciente a más antiguo
            results.sort((a, b) => b.fechaParaOrdenar - a.fechaParaOrdenar);

            _lastObsequiosSearch = results;

            if (results.length === 0) {
                list.innerHTML = `<div class="text-center p-8 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-gray-500 font-medium">No se encontraron obsequios en este rango de fechas.</div>`;
                return;
            }

            list.innerHTML = results.map(r => {
                const fStr = r.fechaParaOrdenar.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'});
                
                let vendedorBadge = '';
                if (_userRole === 'admin') {
                    const vName = _usersCache.find(u => u.id === r.vendedorId)?.email || 'Desconocido';
                    vendedorBadge = `<span class="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase ml-2 border border-purple-200" title="${vName}">Vend: ${vName.split('@')[0]}</span>`;
                }

                let statusBadge = r.isCerrado 
                    ? `<span class="bg-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase ml-2 border border-gray-300">🔒 Cerrado</span>` 
                    : `<span class="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase ml-2 border border-green-200">🟢 Activo</span>`;

                let actionButton = r.isCerrado 
                    ? `<button onclick="window.showModal('Acción Protegida', 'Este obsequio pertenece a un <b>Cierre de Ventas auditado del pasado</b>.<br><br>Ya no puede eliminarse desde aquí para no afectar las estadísticas cerradas. Si necesita corregir el stock, use la herramienta de <b>Edición de Inventario</b>.', null, 'Entendido')" class="text-gray-400 p-3 hover:bg-gray-100 rounded-lg transition-colors border border-transparent" title="Protegido por Cierre">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                       </button>`
                    : `<button onclick="window.obsequiosModule.deleteObsequio('${r.id}')" class="text-red-500 p-3 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Eliminar y Revertir Stock">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>`;

                return `
                <div class="p-4 border border-gray-200 rounded-xl flex justify-between items-center text-sm bg-white shadow-sm hover:shadow transition-shadow">
                    <div>
                        <div class="flex items-center mb-1">
                            <span class="text-[10px] text-gray-400 font-bold tracking-wider uppercase">${fStr}</span>
                            ${statusBadge}
                            ${vendedorBadge}
                        </div>
                        <div class="text-blue-900 font-black text-base mb-0.5 leading-tight">${r.clienteNombre}</div>
                        <div class="text-gray-700">${r.productoNombre}</div> 
                        <div class="mt-1">
                            <span class="font-black text-gray-800 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-xs">${r.cantidadCajas} CAJAS</span>
                            ${r.vaciosRecibidos > 0 ? `<span class="ml-2 text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">✓ Recibió ${r.vaciosRecibidos} vacíos</span>` : ''}
                        </div>
                    </div>
                    ${actionButton}
                </div>
                `;
            }).join('');
        } catch(e) {
            console.error("Error buscando obsequios:", e);
            list.innerHTML = `<p class="text-red-500 text-center font-bold bg-red-50 p-4 rounded-lg">Error de conexión: ${e.message}</p>`;
        }
    }

    async function deleteObsequio(id) {
        const r = _lastObsequiosSearch.find(x => x.id === id);
        if(!r) return;

        if (r.isCerrado) {
            _showModal('Error', 'No puede borrar un obsequio que ya fue cerrado.');
            return;
        }

        const targetUserId = r.vendedorId || r.userId || _userId;

        _showModal('Eliminar Registro', `¿Borrar el obsequio de <br><b class="text-blue-600">${r.cantidadCajas} Cajas</b> a <br><b class="text-gray-800">${r.clienteNombre}</b>?<br><br><span class="text-red-600 text-xs font-bold">⚠️ Esta acción devolverá automáticamente el producto al stock del vendedor y revertirá los vacíos.</span>`, async () => {
            _showModal('Progreso', 'Revirtiendo transacción...', null, '', null, false);
            try {
                const iRef = _doc(_db, `artifacts/${_appId}/users/${targetUserId}/inventario`, r.productoId);
                const cRef = _doc(_db, CLIENTES_PUBLIC_PATH, r.clienteId);
                
                const prodDef = _inventarioCache.find(p => p.id === r.productoId) || { unidadesPorCaja: 1 }; 

                await _runTransaction(_db, async (t) => {
                    const i = await t.get(iRef);
                    const c = await t.get(cRef);
                    
                    const currentStock = i.exists() ? (i.data().cantidadUnidades || 0) : 0;
                    
                    const factorHistorico = r.unidadesPorCaja || prodDef.unidadesPorCaja || 1;
                    const unidadesARestaurar = r.cantidadCajas * factorHistorico;
                    
                    t.set(iRef, { cantidadUnidades: currentStock + unidadesARestaurar }, { merge: true });
                    
                    if (c.exists()) {
                        const sv = c.data().saldoVacios || {};
                        if (r.tipoVacio) {
                            sv[r.tipoVacio] = (sv[r.tipoVacio] || 0) - r.cantidadCajas + r.vaciosRecibidos;
                            t.update(cRef, { saldoVacios: sv });
                        }
                    }
                    
                    t.delete(_doc(_db, `artifacts/${_appId}/users/${targetUserId}/obsequios_entregados`, id));
                });
                
                const pModal = document.getElementById('modalContainer'); if(pModal) pModal.classList.add('hidden');
                setTimeout(() => _showModal('Éxito', 'El obsequio fue eliminado y el stock restaurado correctamente.'), 300);
                
                handleSearchObsequios();
            } catch(e) {
                console.error(e);
                _showModal('Error', `Fallo al revertir el obsequio: ${e.message}`);
            }
        }, 'Sí, Eliminar y Restaurar', null, true);
    }

    window.obsequiosModule = { deleteObsequio };

})();

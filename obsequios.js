// --- Lógica del módulo de Gestión de Obsequios ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _getDocs, _writeBatch, _runTransaction, _query, _where, _deleteDoc;

    // Estado específico del módulo
    let _clientesCache = [];
    let _inventarioCache = []; 
    let _obsequioConfig = { productoId: null, productoData: null }; 
    let _obsequioActual = { cliente: null, cantidadEntregada: 0, vaciosRecibidos: 0, observacion: '' };
    let _lastObsequiosSearch = []; 

    const TIPOS_VACIO = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    const PUBLIC_DATA_ID = 'ventas-9a210'; // ID Público para Fase 2
    
    // Rutas dinámicas
    let OBSEQUIO_CONFIG_PATH;
    let CLIENTES_PUBLIC_PATH;

    /**
     * Inicializa el módulo de obsequios con dependencias dinámicas.
     */
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
        _deleteDoc = dependencies.deleteDoc;

        // FASE 2: Usar ID público explícito para datos compartidos
        OBSEQUIO_CONFIG_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/config/obsequio`;
        CLIENTES_PUBLIC_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`;
        
        console.log("Módulo Obsequios inicializado (Fase 2).");
    };

    /**
     * Menú principal del módulo.
     */
    window.showGestionObsequiosView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Obsequios</h1>
                        <div class="space-y-4">
                            <button id="generarObsequioBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600">Generar Obsequio</button>
                            <button id="registroObsequiosBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Registro de Obsequios</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú</button>
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
                        <h2 class="text-2xl font-bold">Generar Obsequio</h2>
                        <button onclick="window.showGestionObsequiosView()" class="text-gray-400">✕</button>
                    </div>
                    <div id="obs-form-loader" class="text-center p-4">Cargando datos...</div>
                    <div id="obs-form-content" class="hidden space-y-4">
                        <div class="relative">
                            <label class="block text-sm font-medium mb-1">Buscar Cliente:</label>
                            <input type="text" id="cliSearch" placeholder="Nombre comercial..." class="w-full p-2 border rounded-lg">
                            <div id="cliDrop" class="autocomplete-list hidden"></div>
                        </div>
                        <div id="cliSel" class="hidden p-3 bg-blue-50 rounded-lg flex justify-between items-center">
                            <span id="cliName" class="font-bold"></span>
                            <button onclick="resetClientSelection()" class="text-xs text-blue-600">Cambiar</button>
                        </div>
                        <form id="formObs" class="hidden space-y-4 border-t pt-4">
                            <div class="bg-gray-50 p-3 rounded text-center">
                                <p class="text-xs text-gray-500">PRODUCTO</p>
                                <p id="prodName" class="font-bold"></p>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium">Cajas:</label>
                                    <input type="number" id="cantEnt" min="1" class="w-full p-2 border rounded" required>
                                    <p class="text-[10px] text-gray-500 mt-1">Stock: <span id="prodStock"></span></p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium">Vacíos:</label>
                                    <input type="number" id="vacRec" min="0" value="0" class="w-full p-2 border rounded">
                                    <p id="vacTipo" class="text-[10px] text-gray-500 mt-1"></p>
                                </div>
                            </div>
                            <textarea id="obsText" placeholder="Observaciones..." class="w-full p-2 border rounded text-sm"></textarea>
                            <button type="submit" class="w-full py-3 bg-pink-600 text-white rounded-lg font-bold shadow-lg">Confirmar Entrega</button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // FASE 2: Carga paralela de datos híbridos
        await Promise.all([_loadClientes(), _loadInventarioHibrido(), _loadObsequioProduct()]);

        if (_obsequioConfig.productoData) {
            document.getElementById('obs-form-loader').classList.add('hidden');
            document.getElementById('obs-form-content').classList.remove('hidden');
            setupObsequioUI();
        } else {
            document.getElementById('obs-form-loader').textContent = "Error: Producto obsequio no configurado en Admin.";
        }
    }

    async function _loadObsequioProduct() {
        try {
            const snap = await _getDoc(_doc(_db, OBSEQUIO_CONFIG_PATH));
            if (snap.exists()) {
                _obsequioConfig.productoId = snap.data().productoId;
                // Buscar en la caché híbrida ya cargada
                _obsequioConfig.productoData = _inventarioCache.find(p => p.id === _obsequioConfig.productoId);
            }
        } catch (e) {
            console.warn("Error cargando config obsequio:", e);
        }
    }

    // --- NUEVO: CARGA HÍBRIDA (Maestro + Stock Personal) ---
    async function _loadInventarioHibrido() {
        try {
            // 1. Cargar Maestro
            const masterSnap = await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`));
            const masterMap = {};
            masterSnap.docs.forEach(d => masterMap[d.id] = { id: d.id, ...d.data() });

            // 2. Cargar Stock Local
            const stockSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`));
            const stockMap = {};
            stockSnap.docs.forEach(d => stockMap[d.id] = { id: d.id, ...d.data() });

            // 3. Fusionar
            _inventarioCache = [];
            const allIds = new Set([...Object.keys(masterMap), ...Object.keys(stockMap)]);
            
            allIds.forEach(id => {
                const master = masterMap[id];
                const stock = stockMap[id];
                
                if (master) {
                    // Producto Moderno (Definición Maestra + Stock Local)
                    _inventarioCache.push({
                        ...master,
                        cantidadUnidades: stock ? (stock.cantidadUnidades || 0) : 0,
                        id: id
                    });
                } else if (stock) {
                    // Producto Legacy (Solo Local)
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
        document.getElementById('prodStock').textContent = `${Math.floor((p.cantidadUnidades||0) / uCaja)} Cj`;
        document.getElementById('vacTipo').textContent = `Tipo: ${p.tipoVacio || 'N/A'}`;

        const input = document.getElementById('cliSearch');
        const drop = document.getElementById('cliDrop');

        input.oninput = () => {
            const term = input.value.toUpperCase();
            const list = _clientesCache.filter(c => (c.nombreComercial||'').toUpperCase().includes(term) || (c.nombrePersonal||'').toUpperCase().includes(term)).slice(0, 5);
            drop.innerHTML = list.map(c => `<div class="p-2 border-b hover:bg-gray-100 cursor-pointer" onclick="selectClient('${c.id}')">${c.nombreComercial}</div>`).join('');
            drop.classList.toggle('hidden', list.length === 0);
        };

        window.selectClient = (id) => {
            const c = _clientesCache.find(x => x.id === id);
            _obsequioActual.cliente = c;
            document.getElementById('cliSearch').parentElement.classList.add('hidden');
            document.getElementById('cliSel').classList.remove('hidden');
            document.getElementById('cliName').textContent = c.nombreComercial;
            document.getElementById('formObs').classList.remove('hidden');
            drop.classList.add('hidden');
        };

        window.resetClientSelection = () => {
            document.getElementById('cliSearch').parentElement.classList.remove('hidden');
            document.getElementById('cliSel').classList.add('hidden');
            document.getElementById('formObs').classList.add('hidden');
        };

        document.getElementById('formObs').onsubmit = handleRegistrarObsequio;
    }

    async function handleRegistrarObsequio(e) {
        e.preventDefault();
        const cjs = parseInt(document.getElementById('cantEnt').value);
        const vRec = parseInt(document.getElementById('vacRec').value) || 0;
        const p = _obsequioConfig.productoData;

        _showModal('Confirmar', `¿Entregar ${cjs} cajas?`, async () => {
            _showModal('Progreso', 'Registrando transacción...');
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
                    tipoVacio: p.tipoVacio,
                    observacion: document.getElementById('obsText').value,
                    userId: _userId
                };

                await _runTransaction(_db, async (t) => {
                    const cDoc = await t.get(cliRef);
                    const iDoc = await t.get(invRef);
                    
                    // Robustez: Si el inventario local no existe (producto nuevo de maestro), inicializarlo
                    const currentStock = iDoc.exists() ? (iDoc.data().cantidadUnidades || 0) : 0;
                    const newStock = currentStock - (cjs * (p.unidadesPorCaja || 1));
                    
                    const sv = cDoc.exists() ? (cDoc.data().saldoVacios || {}) : {};
                    if(p.tipoVacio) {
                        sv[p.tipoVacio] = (sv[p.tipoVacio] || 0) + cjs - vRec;
                        t.update(cliRef, { saldoVacios: sv });
                    }
                    
                    // Usar set con merge para asegurar escritura incluso si no existe el doc local
                    t.set(invRef, { cantidadUnidades: newStock }, { merge: true });
                    t.set(regRef, regData);
                });

                // GENERAR TICKET (FUNCIONALIDAD RESTAURADA)
                _showSharingOptionsObsequio(regData, p, window.showGestionObsequiosView);
            } catch (err) { _showModal('Error', err.message); }
        }, 'Confirmar', null, true);
    }

    // --- Lógica de Tickets (RESTAURADA TOTALMENTE) ---
    
    function _showSharingOptionsObsequio(reg, prod, callback) {
        const html = `
            <div class="text-center space-y-4">
                <p>Entrega exitosa. ¿Cómo desea el comprobante?</p>
                <button id="btnImg" class="w-full py-3 bg-green-600 text-white rounded-lg">Compartir Imagen</button>
                <button id="btnTxt" class="w-full py-3 bg-blue-600 text-white rounded-lg">Copiar Texto</button>
            </div>
        `;
        _showModal('Comprobante', html, null, '');
        
        document.getElementById('btnImg').onclick = async () => {
            const ticketHTML = `
                <div id="ticket-ob" class="p-6 bg-white text-black font-mono text-xl" style="width:500px;">
                    <h2 class="text-center font-bold border-b pb-2">DIST. CASTILLO</h2>
                    <p class="mt-4">FECHA: ${reg.fecha.toLocaleDateString()}</p>
                    <p>CLIENTE: ${reg.clienteNombre}</p>
                    <hr class="my-2">
                    <p>OBSEQUIO: ${reg.productoNombre}</p>
                    <p>CANTIDAD: ${reg.cantidadCajas} CJ</p>
                    <p>VACIOS RECIBIDOS: ${reg.vaciosRecibidos} (${reg.tipoVacio})</p>
                    <div class="mt-10 border-t pt-2 text-center text-sm">Firma del Cliente</div>
                </div>
            `;
            const temp = document.createElement('div');
            temp.style.position = 'absolute'; temp.style.left = '-9999px';
            temp.innerHTML = ticketHTML; document.body.appendChild(temp);
            const canvas = await html2canvas(document.getElementById('ticket-ob'));
            canvas.toBlob(blob => {
                if (navigator.share && blob) {
                    navigator.share({ files: [new File([blob], "ticket.png", {type:"image/png"})] });
                } else {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a'); link.href=url; link.download="ticket_obsequio.png"; link.click();
                }
                document.body.removeChild(temp);
                callback();
            });
        };

        document.getElementById('btnTxt').onclick = () => {
            const txt = `DIST. CASTILLO\nOBSEQUIO\nFECHA: ${reg.fecha.toLocaleDateString()}\nCLIENTE: ${reg.clienteNombre}\nPROD: ${reg.productoNombre}\nCANT: ${reg.cantidadCajas} CJ\nVACIOS RECIB: ${reg.vaciosRecibidos}`;
            const el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select();
            document.execCommand('copy'); document.body.removeChild(el);
            _showModal('Copiado', 'Texto copiado al portapapeles.', callback);
        };
    }

    function showRegistroObsequiosView() {
        const m = new Date().toISOString().slice(0, 7);
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto max-w-2xl bg-white p-6 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold mb-6 text-center">Registro</h2>
                <div class="flex gap-2 mb-4">
                    <input type="month" id="mIn" value="${m}" class="flex-grow p-2 border rounded">
                    <button id="btnSearch" class="bg-blue-600 text-white px-4 rounded">Ver</button>
                </div>
                <div id="rList" class="space-y-2"></div>
                <button onclick="window.showGestionObsequiosView()" class="w-full mt-6 text-gray-500">Volver</button>
            </div></div>
        `;
        document.getElementById('btnSearch').onclick = handleSearchObsequios;
    }

    async function handleSearchObsequios() {
        const m = document.getElementById('mIn').value;
        const [y, mon] = m.split('-').map(Number);
        const q = _query(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`), 
                  _where("fecha", ">=", new Date(y, mon-1, 1)), _where("fecha", "<", new Date(y, mon, 1)));
        const snap = await _getDocs(q);
        _lastObsequiosSearch = snap.docs.map(d => ({id: d.id, ...d.data()}));
        const list = document.getElementById('rList');
        list.innerHTML = _lastObsequiosSearch.map(r => `
            <div class="p-3 border rounded flex justify-between items-center text-sm">
                <div><b>${r.clienteNombre}</b><br>${r.productoNombre} (${r.cantidadCajas} CJ)</div>
                <button onclick="window.obsequiosModule.deleteObsequio('${r.id}')" class="text-red-500">🗑️</button>
            </div>
        `).join('') || 'Sin registros.';
    }

    async function deleteObsequio(id) {
        const r = _lastObsequiosSearch.find(x => x.id === id);
        _showModal('Eliminar', '¿Borrar y revertir stock?', async () => {
            const iRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, r.productoId);
            const cRef = _doc(_db, CLIENTES_PUBLIC_PATH, r.clienteId);
            
            // FASE 2: Leer configuración del producto para obtener unidadesPorCaja actualizado
            // (Si el producto fue borrado localmente, necesitamos la data del registro o fallback)
            // Asumimos que r.productoNombre es útil para logs, pero necesitamos la data técnica del producto
            // Intentamos buscarlo en la cache actual
            const prodDef = _inventarioCache.find(p => p.id === r.productoId) || { unidadesPorCaja: 1 }; // Fallback peligroso pero necesario

            await _runTransaction(_db, async (t) => {
                const i = await t.get(iRef);
                const c = await t.get(cRef);
                
                // Si el doc de inventario no existe (raro pero posible), asumimos 0 y creamos
                const currentStock = i.exists() ? (i.data().cantidadUnidades || 0) : 0;
                const unidadesARestaurar = r.cantidadCajas * (prodDef.unidadesPorCaja || 1);
                
                t.set(iRef, { cantidadUnidades: currentStock + unidadesARestaurar }, { merge: true });
                
                if (c.exists()) {
                    const sv = c.data().saldoVacios || {};
                    if (r.tipoVacio) {
                        sv[r.tipoVacio] = (sv[r.tipoVacio] || 0) - r.cantidadCajas + r.vaciosRecibidos;
                        t.update(cRef, { saldoVacios: sv });
                    }
                }
                
                t.delete(_doc(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`, id));
            });
            handleSearchObsequios();
        });
    }

    window.obsequiosModule = { deleteObsequio };

})();

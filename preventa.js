// ═══════════════════════════════════════════════════════════════
// MÓDULO PRE-VENTA (nuevo sistema, en paralelo al tradicional)
// Por ahora SOLO para administradores. No afecta el sistema actual.
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _userId, _userRole, _appId, _mainContent;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _getDocs, _query, _where, _orderBy;

    // ── Configuración y rutas (aisladas del sistema tradicional) ──
    const getPublicDataId = () => window.AppConfig.PUBLIC_DATA_ID;
    // Colecciones EXISTENTES que solo LEEMOS (nunca modificamos):
    const pathClientes  = () => `artifacts/${getPublicDataId()}/public/data/clientes`;
    const pathProductos = () => `artifacts/${getPublicDataId()}/public/data/productos`;
    const pathSectores  = () => `artifacts/${getPublicDataId()}/public/data/sectores`;
    // Colección NUEVA y aislada para los pedidos de preventa:
    const pathPedidos   = () => `artifacts/${getPublicDataId()}/public/data/preventa_pedidos`;

    // Caches locales
    let _pvUsuarios = [];
    let _pvSectores = [];
    let _pvClientes = [];         // cache de clientes (solo lectura)
    let _pvProductos = [];        // cache del catálogo maestro (solo lectura)
    // Estado del pedido en construcción
    let _pedidoActual = { vendedor: null, cliente: null, productos: {} };

    window.initPreventa = function (dependencies) {
        _db          = dependencies.db;
        _userId      = dependencies.userId;
        _userRole    = dependencies.userRole;
        _appId       = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _showMainMenu = dependencies.showMainMenu;
        _showModal   = dependencies.showModal;
        _collection  = dependencies.collection;
        _onSnapshot  = dependencies.onSnapshot;
        _doc         = dependencies.doc;
        _getDoc      = dependencies.getDoc;
        _addDoc      = dependencies.addDoc;
        _setDoc      = dependencies.setDoc;
        _getDocs     = dependencies.getDocs;
        _query       = dependencies.query;
        _where       = dependencies.where;
        _orderBy     = dependencies.orderBy;
    };

    // ── MENÚ PRINCIPAL DE PRE-VENTA ──
    window.showPreventaMenu = function () {
        // Seguridad: por ahora solo admin
        if (window.userRole !== 'admin') {
            if (_showModal) _showModal('No disponible', 'El sistema de Pre-Venta aún está en preparación.');
            return;
        }

        const bpad = 'px-2 py-2.5 text-sm';
        _mainContent.innerHTML = `
            <div class="p-3 pt-5 container mx-auto max-w-lg">
                <div class="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-xl text-center">
                    <!-- Navegación entre sistemas -->
                    <div class="grid grid-cols-2 gap-2 mb-1">
                        <button id="pvNavTradiBtn" class="w-full ${bpad} bg-white text-gray-500 border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 font-bold transition">Venta Tradi.</button>
                        <button id="pvNavPreBtn" class="w-full ${bpad} bg-indigo-600 text-white rounded-lg shadow-md font-bold transition">Pre-Venta</button>
                    </div>
                    <button id="pvTasaBcvDisplay" class="mb-3 text-sm font-bold text-gray-700 hover:text-gray-900 hover:underline transition cursor-pointer">(BCV ----- --/--/--)</button>

                    <!-- Aviso de sistema en construcción -->
                    <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-3">
                        <p class="text-[11px] text-indigo-700 font-semibold">🚧 Sistema nuevo en construcción · visible solo para administradores</p>
                    </div>

                    <!-- Botones del sistema de Pre-Venta (aún sin función, se irán activando) -->
                    <div class="grid grid-cols-2 gap-2">
                        <button id="pvPedidosBtn" class="w-full ${bpad} bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 font-bold transition">Tomar Pedido</button>
                        <button id="pvBandejaBtn" class="w-full ${bpad} bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700 font-bold transition">Bandeja Despacho</button>
                        <button id="pvInventarioRutaBtn" class="w-full ${bpad} bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 font-bold transition">Inv. por Ruta</button>
                        <button id="pvVendedoresBtn" class="w-full ${bpad} bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 font-bold transition">Vendedores/Zonas</button>
                        <button id="pvReportesBtn" class="w-full ${bpad} bg-slate-700 text-white rounded-lg shadow-md hover:bg-slate-800 font-bold transition">Reportes</button>
                        <button id="pvConfigBtn" class="w-full ${bpad} bg-gray-600 text-white rounded-lg shadow-md hover:bg-gray-700 font-bold transition">Configuración</button>
                    </div>
                </div>
            </div>`;

        // Navegación
        document.getElementById('pvNavTradiBtn').addEventListener('click', () => {
            if (_showMainMenu) _showMainMenu();
        });
        document.getElementById('pvNavPreBtn').addEventListener('click', () => window.showPreventaMenu());

        // Tasa BCV (reutiliza la API global del módulo CXC)
        (async () => {
            const disp = document.getElementById('pvTasaBcvDisplay');
            if (disp && window.textoTasaHoyBCV) {
                try { disp.textContent = await window.textoTasaHoyBCV(); } catch (e) {}
                disp.addEventListener('click', () => {
                    if (window.abrirCalendarioTasas) window.abrirCalendarioTasas(() => window.showPreventaMenu());
                });
            }
        })();

        // Botones aún sin función (placeholder mientras se construyen)
        const enConstruccion = (nombre) => {
            if (_showModal) _showModal('En construcción', `La función "${nombre}" se construirá próximamente. Por ahora es solo la estructura del nuevo sistema.`);
        };
        document.getElementById('pvPedidosBtn').addEventListener('click', () => showTomarPedido());
        document.getElementById('pvBandejaBtn').addEventListener('click', () => enConstruccion('Bandeja de Despacho'));
        document.getElementById('pvInventarioRutaBtn').addEventListener('click', () => enConstruccion('Inventario por Ruta'));
        document.getElementById('pvVendedoresBtn').addEventListener('click', () => showPreventaVendedores());
        document.getElementById('pvReportesBtn').addEventListener('click', () => enConstruccion('Reportes'));
        document.getElementById('pvConfigBtn').addEventListener('click', () => enConstruccion('Configuración'));
    };


    // ═══════════════════════════════════════════════════════════
    // VENDEDORES / ZONAS — asignar zona de referencia a cada vendedor
    // Solo agrega el campo 'zonaPreventa' al usuario (merge, no afecta nada más)
    // ═══════════════════════════════════════════════════════════
    async function showPreventaVendedores() {
        if (window.userRole !== 'admin') return;

        _mainContent.innerHTML = `
            <div class="p-3 pt-6 w-full max-w-lg mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">👤 Vendedores / Zonas</h2>
                        <button id="pvVendBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>
                    <p class="text-[11px] text-gray-500 mb-3">Asigna a cada vendedor su zona/ruta de referencia. Es solo informativo para organizar los pedidos; no afecta el sistema tradicional.</p>
                    <div id="pvVendLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando vendedores...
                    </div>
                    <div id="pvVendLista" class="hidden space-y-2"></div>
                </div>
            </div>`;

        document.getElementById('pvVendBack').addEventListener('click', () => window.showPreventaMenu());

        // Cargar usuarios y sectores en paralelo
        try {
            const [usersSnap, sectoresSnap] = await Promise.all([
                _getDocs(_collection(_db, 'users')),
                _getDocs(_collection(_db, pathSectores()))
            ]);
            _pvUsuarios = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _pvSectores = sectoresSnap.docs.map(d => (d.data().name || '')).filter(Boolean).sort();
        } catch (e) {
            console.error('Error cargando vendedores/sectores:', e);
            document.getElementById('pvVendLoading').innerHTML = '<span class="text-red-500">Error al cargar los datos.</span>';
            return;
        }

        renderPvVendedores();
    }

    function renderPvVendedores() {
        const loading = document.getElementById('pvVendLoading');
        const cont = document.getElementById('pvVendLista');
        if (!cont) return;
        loading.classList.add('hidden');
        cont.classList.remove('hidden');

        // Solo mostramos usuarios con rol 'user' (vendedores); los admin no reparten ruta
        const vendedores = _pvUsuarios.filter(u => u.role === 'user');
        const admins = _pvUsuarios.filter(u => u.role === 'admin');

        const opcionesZona = (sel) => `<option value="">— Sin zona —</option>` +
            _pvSectores.map(z => `<option value="${z}" ${sel === z ? 'selected' : ''}>${z}</option>`).join('');

        const nombreDe = (u) => {
            const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
            return n || u.email || u.id;
        };

        if (!vendedores.length) {
            cont.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">No hay vendedores (usuarios con rol User) registrados.</p>';
            return;
        }

        cont.innerHTML = `
            <p class="text-[10px] text-gray-400 uppercase font-bold">Vendedores (rol User) · ${vendedores.length}</p>
            ${vendedores.map(u => `
                <div class="border border-gray-200 rounded-lg p-2.5">
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                        <div class="min-w-0">
                            <div class="font-bold text-gray-800 text-sm truncate">${nombreDe(u)}</div>
                            <div class="text-[10px] text-gray-400 truncate">${u.email || ''}${u.camion ? ' · Camión: ' + u.camion : ''}</div>
                        </div>
                        <span class="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold shrink-0">Vendedor</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-500 shrink-0">Zona/Ruta:</span>
                        <select data-uid="${u.id}" class="pv-zona-sel flex-1 text-xs border border-indigo-300 rounded p-1.5 bg-white outline-none">
                            ${opcionesZona(u.zonaPreventa || '')}
                        </select>
                    </div>
                </div>`).join('')}
            ${admins.length ? `<p class="text-[10px] text-gray-400 uppercase font-bold pt-2">Administradores · ${admins.length}</p>
            ${admins.map(u => `<div class="border border-gray-100 rounded-lg p-2 bg-gray-50 flex items-center justify-between">
                <span class="text-xs text-gray-600 truncate">${nombreDe(u)}</span>
                <span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Admin</span>
            </div>`).join('')}` : ''}`;

        // Guardar zona al cambiar (merge, solo agrega el campo zonaPreventa)
        cont.querySelectorAll('.pv-zona-sel').forEach(sel => {
            sel.addEventListener('change', async () => {
                const uid = sel.dataset.uid;
                const zona = sel.value;
                const original = sel.value;
                sel.disabled = true;
                try {
                    await _setDoc(_doc(_db, 'users', uid), { zonaPreventa: zona }, { merge: true });
                    // Actualizar cache local
                    const u = _pvUsuarios.find(x => x.id === uid);
                    if (u) u.zonaPreventa = zona;
                    // Feedback visual breve
                    sel.classList.add('ring-2', 'ring-green-400');
                    setTimeout(() => sel.classList.remove('ring-2', 'ring-green-400'), 800);
                } catch (e) {
                    console.error('Error guardando zona:', e);
                    if (_showModal) _showModal('Error', 'No se pudo guardar la zona.');
                } finally {
                    sel.disabled = false;
                }
            });
        });
    }


    // ═══════════════════════════════════════════════════════════
    // TOMAR PEDIDO — el admin registra un pedido a nombre de un vendedor
    // Guarda en la colección NUEVA preventa_pedidos. NO toca inventario
    // ni ventas del sistema tradicional. Solo registra la intención de compra.
    // ═══════════════════════════════════════════════════════════
    function _pvFmtUSD(n) {
        return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function _pvNombreVendedor(u) {
        if (!u) return '';
        const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
        return n || u.email || u.id;
    }

    async function showTomarPedido() {
        if (window.userRole !== 'admin') return;
        _pedidoActual = { vendedor: null, cliente: null, productos: {} };

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Tomar Pedido</h2>
                        <button id="pvPedBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>
                    <div id="pvPedLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando clientes y catálogo...
                    </div>
                    <div id="pvPedForm" class="hidden space-y-3">
                        <!-- Vendedor -->
                        <div>
                            <label class="text-[10px] font-bold text-indigo-700 uppercase">Vendedor (ruta)</label>
                            <select id="pvPedVendedor" class="w-full text-sm border border-indigo-300 rounded p-2 bg-white outline-none">
                                <option value="">— Elige el vendedor —</option>
                            </select>
                        </div>
                        <!-- Cliente -->
                        <div>
                            <label class="text-[10px] font-bold text-indigo-700 uppercase">Cliente</label>
                            <input type="text" id="pvPedClienteSearch" placeholder="Buscar cliente..." autocomplete="off"
                                   class="w-full text-sm border border-indigo-300 rounded p-2 outline-none">
                            <div id="pvPedClienteDropdown" class="hidden bg-white border border-gray-200 rounded shadow-lg max-h-44 overflow-y-auto mt-1 z-20 relative"></div>
                            <div id="pvPedClienteSel" class="hidden mt-1 text-xs bg-indigo-50 border border-indigo-200 rounded p-2"></div>
                        </div>
                        <!-- Filtro rubro + productos -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="text-[10px] font-bold text-indigo-700 uppercase">Productos</label>
                                <select id="pvPedRubro" class="text-xs border border-indigo-300 rounded p-1 bg-white outline-none">
                                    <option value="">Todos los rubros</option>
                                </select>
                            </div>
                            <div id="pvPedProductos" class="border border-gray-200 rounded max-h-[38vh] overflow-y-auto">
                                <p class="text-center text-gray-400 text-xs py-6">Elige un cliente para empezar a cargar productos.</p>
                            </div>
                        </div>
                        <!-- Total + guardar -->
                        <div class="sticky bottom-0 bg-white border-t pt-2">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm font-bold text-gray-600">Total del pedido:</span>
                                <span id="pvPedTotal" class="text-xl font-black text-indigo-700">$0.00</span>
                            </div>
                            <button id="pvPedGuardar" class="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition disabled:opacity-40" disabled>Guardar Pedido</button>
                            <p class="text-[9px] text-gray-400 text-center mt-1">El pedido queda pendiente para despacho. No descuenta inventario ni factura.</p>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('pvPedBack').addEventListener('click', () => window.showPreventaMenu());

        // Cargar clientes, productos y vendedores
        try {
            const [cliSnap, prodSnap, usersSnap] = await Promise.all([
                _getDocs(_collection(_db, pathClientes())),
                _getDocs(_collection(_db, pathProductos())),
                _pvUsuarios.length ? Promise.resolve(null) : _getDocs(_collection(_db, 'users'))
            ]);
            _pvClientes = cliSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _pvProductos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (usersSnap) _pvUsuarios = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Error cargando datos de pedido:', e);
            document.getElementById('pvPedLoading').innerHTML = '<span class="text-red-500">Error al cargar los datos.</span>';
            return;
        }

        document.getElementById('pvPedLoading').classList.add('hidden');
        document.getElementById('pvPedForm').classList.remove('hidden');

        // Poblar vendedores (solo rol user)
        const vendedores = _pvUsuarios.filter(u => u.role === 'user');
        const selVend = document.getElementById('pvPedVendedor');
        selVend.innerHTML = '<option value="">— Elige el vendedor —</option>' +
            vendedores.map(u => `<option value="${u.id}">${_pvNombreVendedor(u)}${u.zonaPreventa ? ' · ' + u.zonaPreventa : ''}</option>`).join('');
        selVend.addEventListener('change', () => {
            _pedidoActual.vendedor = _pvUsuarios.find(u => u.id === selVend.value) || null;
            actualizarBotonGuardar();
        });

        // Poblar rubros
        const rubros = [...new Set(_pvProductos.map(p => p.rubro).filter(Boolean))].sort();
        const selRubro = document.getElementById('pvPedRubro');
        selRubro.innerHTML = '<option value="">Todos los rubros</option>' + rubros.map(r => `<option value="${r}">${r}</option>`).join('');
        selRubro.addEventListener('change', renderPedidoProductos);

        // Buscador de cliente
        const cliInput = document.getElementById('pvPedClienteSearch');
        let debCli = null;
        cliInput.addEventListener('input', () => {
            clearTimeout(debCli);
            debCli = setTimeout(() => {
                const term = cliInput.value.toLowerCase().trim();
                const drop = document.getElementById('pvPedClienteDropdown');
                if (!term) { drop.classList.add('hidden'); return; }
                const filtrados = _pvClientes.filter(c =>
                    (c.nombreComercial || '').toLowerCase().includes(term) ||
                    (c.nombrePersonal || '').toLowerCase().includes(term)).slice(0, 30);
                drop.innerHTML = filtrados.length
                    ? filtrados.map(c => `<div class="pv-cli-opt px-2 py-1.5 text-xs hover:bg-indigo-50 cursor-pointer border-b border-gray-100" data-id="${c.id}">
                        <div class="font-semibold text-gray-800">${c.nombreComercial || '(sin nombre)'}</div>
                        <div class="text-[10px] text-gray-400">${c.nombrePersonal || ''}${c.sector ? ' · ' + c.sector : ''}</div>
                       </div>`).join('')
                    : '<div class="px-2 py-2 text-xs text-gray-400">Sin coincidencias</div>';
                drop.classList.remove('hidden');
                drop.querySelectorAll('.pv-cli-opt').forEach(el =>
                    el.addEventListener('click', () => seleccionarClientePedido(el.dataset.id)));
            }, 200);
        });

        document.getElementById('pvPedGuardar').addEventListener('click', guardarPedido);
    }

    function seleccionarClientePedido(id) {
        const c = _pvClientes.find(x => x.id === id);
        if (!c) return;
        _pedidoActual.cliente = c;
        document.getElementById('pvPedClienteSearch').value = '';
        document.getElementById('pvPedClienteDropdown').classList.add('hidden');
        const sel = document.getElementById('pvPedClienteSel');
        sel.classList.remove('hidden');
        sel.innerHTML = `<div class="flex items-center justify-between">
            <div><strong class="text-indigo-800">${c.nombreComercial || '(sin nombre)'}</strong>
            <span class="text-gray-500">${c.nombrePersonal ? '· ' + c.nombrePersonal : ''}${c.sector ? ' · ' + c.sector : ''}</span></div>
            <button id="pvPedQuitarCli" class="text-[10px] text-red-500 hover:underline">Cambiar</button></div>`;
        document.getElementById('pvPedQuitarCli').addEventListener('click', () => {
            _pedidoActual.cliente = null;
            sel.classList.add('hidden');
        });
        renderPedidoProductos();
        actualizarBotonGuardar();
    }


    // Renderiza la lista de productos agrupada por segmento, con inputs cj/paq/und
    function renderPedidoProductos() {
        const cont = document.getElementById('pvPedProductos');
        if (!cont) return;
        if (!_pedidoActual.cliente) {
            cont.innerHTML = '<p class="text-center text-gray-400 text-xs py-6">Elige un cliente para empezar a cargar productos.</p>';
            return;
        }
        const rubro = document.getElementById('pvPedRubro')?.value || '';
        let lista = _pvProductos.slice();
        if (rubro) lista = lista.filter(p => p.rubro === rubro);
        // Ordenar por segmento y luego presentación
        lista.sort((a, b) => (a.segmento || '').localeCompare(b.segmento || '') || (a.presentacion || '').localeCompare(b.presentacion || ''));

        if (!lista.length) { cont.innerHTML = '<p class="text-center text-gray-400 text-xs py-6">No hay productos.</p>'; return; }

        let html = '';
        let lastSeg = null;
        lista.forEach(prod => {
            const seg = prod.segmento || 'Sin segmento';
            if (seg !== lastSeg) {
                lastSeg = seg;
                html += `<div class="bg-gray-100 px-2 py-1 font-bold text-[11px] text-gray-600 sticky top-0">${seg}</div>`;
            }
            const vPor = prod.ventaPor || { und: true };
            const pa = _pedidoActual.productos[prod.id] || {};
            const precios = prod.precios || { und: prod.precioPorUnidad || 0 };

            const inputRow = (type, label, cant, precio) => `
                <div class="flex items-center gap-2 py-1 px-2 border-b border-gray-50">
                    <input type="number" min="0" value="${cant || 0}" data-pid="${prod.id}" data-tipo="${type}"
                           class="pv-ped-input w-14 p-1 text-center border rounded text-sm font-bold focus:ring-2 focus:ring-indigo-400">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium text-gray-700 truncate">${prod.presentacion} <span class="text-[10px] text-gray-400">${label}</span></div>
                        <div class="text-[10px] text-gray-400">${prod.marca || 'S/M'}</div>
                    </div>
                    <div class="text-xs font-bold text-gray-800 shrink-0">${_pvFmtUSD(precio)}</div>
                </div>`;

            if (vPor.cj) html += inputRow('cj', `(Cj/${prod.unidadesPorCaja || 1})`, pa.cantCj, precios.cj || 0);
            if (vPor.paq) html += inputRow('paq', `(Paq/${prod.unidadesPorPaquete || 1})`, pa.cantPaq, precios.paq || 0);
            if (vPor.und) html += inputRow('und', `(Und)`, pa.cantUnd, precios.und || 0);
        });
        cont.innerHTML = html;

        cont.querySelectorAll('.pv-ped-input').forEach(inp =>
            inp.addEventListener('input', () => manejarCantidadPedido(inp)));
    }

    function manejarCantidadPedido(inp) {
        const pid = inp.dataset.pid;
        const tipo = inp.dataset.tipo;
        const qty = parseInt(inp.value, 10) || 0;
        const prod = _pvProductos.find(p => p.id === pid);
        if (!prod) return;
        if (!_pedidoActual.productos[pid]) {
            _pedidoActual.productos[pid] = {
                id: prod.id, presentacion: prod.presentacion, marca: prod.marca || null,
                rubro: prod.rubro || null, segmento: prod.segmento || null,
                precios: prod.precios || { und: prod.precioPorUnidad || 0 },
                unidadesPorCaja: prod.unidadesPorCaja || 1, unidadesPorPaquete: prod.unidadesPorPaquete || 1,
                cantCj: 0, cantPaq: 0, cantUnd: 0
            };
        }
        _pedidoActual.productos[pid][`cant${tipo[0].toUpperCase() + tipo.slice(1)}`] = qty;
        const pa = _pedidoActual.productos[pid];
        // Si todo queda en 0, quitar del pedido
        if ((pa.cantCj || 0) === 0 && (pa.cantPaq || 0) === 0 && (pa.cantUnd || 0) === 0) {
            delete _pedidoActual.productos[pid];
        }
        actualizarTotalPedido();
        actualizarBotonGuardar();
    }

    function calcularTotalPedido() {
        return Object.values(_pedidoActual.productos).reduce((s, p) => {
            const pr = p.precios || {};
            return s + (pr.cj || 0) * (p.cantCj || 0) + (pr.paq || 0) * (p.cantPaq || 0) + (pr.und || 0) * (p.cantUnd || 0);
        }, 0);
    }

    function actualizarTotalPedido() {
        const el = document.getElementById('pvPedTotal');
        if (el) el.textContent = _pvFmtUSD(calcularTotalPedido());
    }

    function actualizarBotonGuardar() {
        const btn = document.getElementById('pvPedGuardar');
        if (!btn) return;
        const hayProductos = Object.keys(_pedidoActual.productos).length > 0;
        const listo = _pedidoActual.vendedor && _pedidoActual.cliente && hayProductos;
        btn.disabled = !listo;
    }

    async function guardarPedido() {
        if (!_pedidoActual.vendedor || !_pedidoActual.cliente) return;
        const productos = Object.values(_pedidoActual.productos);
        if (!productos.length) return;

        const btn = document.getElementById('pvPedGuardar');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        const total = calcularTotalPedido();
        const v = _pedidoActual.vendedor;
        const c = _pedidoActual.cliente;

        const pedido = {
            clienteId: c.id,
            clienteNombre: c.nombreComercial || '',
            clienteNombrePersonal: c.nombrePersonal || '',
            clienteSector: c.sector || '',
            vendedorId: v.id,
            vendedorNombre: _pvNombreVendedor(v),
            zona: v.zonaPreventa || c.sector || '',
            productos: productos.map(p => ({
                id: p.id, presentacion: p.presentacion, marca: p.marca || null,
                cantCj: p.cantCj || 0, cantPaq: p.cantPaq || 0, cantUnd: p.cantUnd || 0,
                precios: p.precios,
                subtotal: (p.precios?.cj || 0) * (p.cantCj || 0) + (p.precios?.paq || 0) * (p.cantPaq || 0) + (p.precios?.und || 0) * (p.cantUnd || 0)
            })),
            total: total,
            estado: 'pendiente',
            fechaCreacion: new Date().toISOString(),
            creadoPor: _userId,
            historialEstados: [{ estado: 'pendiente', fecha: new Date().toISOString(), por: _userId }]
        };

        try {
            await _addDoc(_collection(_db, pathPedidos()), pedido);
            if (_showModal) _showModal('Pedido guardado',
                `Pedido de <strong>${pedido.clienteNombre}</strong> por <strong>${_pvFmtUSD(total)}</strong> registrado para la ruta de ${pedido.vendedorNombre}. Queda pendiente para despacho.`);
            // Reiniciar para tomar otro pedido
            showTomarPedido();
        } catch (e) {
            console.error('Error guardando pedido:', e);
            if (_showModal) _showModal('Error', 'No se pudo guardar el pedido. Intenta de nuevo.');
            btn.disabled = false;
            btn.textContent = 'Guardar Pedido';
        }
    }

})();




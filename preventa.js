// ═══════════════════════════════════════════════════════════════
// MÓDULO PRE-VENTA (nuevo sistema, en paralelo al tradicional)
// Por ahora SOLO para administradores. No afecta el sistema actual.
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _userId, _userRole, _appId, _mainContent;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _deleteDoc, _getDocs, _query, _where, _orderBy, _runTransaction, _increment;

    // ── Configuración y rutas (aisladas del sistema tradicional) ──
    const getPublicDataId = () => window.AppConfig.PUBLIC_DATA_ID;
    // Colecciones EXISTENTES que solo LEEMOS (nunca modificamos):
    const pathClientes  = () => `artifacts/${getPublicDataId()}/public/data/clientes`;
    const pathProductos = () => `artifacts/${getPublicDataId()}/public/data/productos`;
    const pathSectores  = () => `artifacts/${getPublicDataId()}/public/data/sectores`;
    // Colección NUEVA y aislada para los pedidos de preventa:
    const pathPedidos   = () => `artifacts/${getPublicDataId()}/public/data/preventa_pedidos`;
    const pathInvRuta   = () => `artifacts/${getPublicDataId()}/public/data/preventa_inventario_ruta`;

    // Caches locales
    let _pvUsuarios = [];
    let _pvSectores = [];
    let _pvClientes = [];         // cache de clientes (solo lectura)
    let _pvProductos = [];        // cache del catálogo maestro (solo lectura)
    // Estado del pedido en construcción
    let _pedidoActual = { vendedor: null, cliente: null, productos: {} };
    let _pvSortFn = null;  // función de orden global (misma que venta tradicional)
    let _pvStockRuta = {};  // stock de la bolsa de la ruta del vendedor (informativo)

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
        _deleteDoc   = dependencies.deleteDoc;
        _getDocs     = dependencies.getDocs;
        _query       = dependencies.query;
        _where       = dependencies.where;
        _orderBy     = dependencies.orderBy;
        _runTransaction = dependencies.runTransaction;
        _increment   = dependencies.increment;
    };

    // ── MENÚ PRINCIPAL DE PRE-VENTA ──
    window.showPreventaMenu = function () {
        const rol = window.userRole === 'user' ? 'vendedor' : window.userRole;
        // Admin, vendedor y despachador pueden entrar a Pre-Venta
        if (!['admin', 'vendedor', 'despachador'].includes(rol)) {
            if (_showModal) _showModal('No disponible', 'El sistema de Pre-Venta no está habilitado para tu usuario.');
            return;
        }
        const esAdmin = rol === 'admin';
        const esVend = rol === 'vendedor';
        const esDesp = rol === 'despachador';

        const bpad = 'px-2 py-2.5 text-sm';
        // Botones de Pre-Venta según el rol
        const btn = (id, txt, clase) => `<button id="${id}" class="w-full ${bpad} ${clase} text-white rounded-lg shadow-md font-bold transition">${txt}</button>`;
        let botones = '';
        // Orden principal: Tomar Pedido, Estado del Pedido, Reportes
        if (esAdmin || esVend)  botones += btn('pvPedidosBtn', 'Tomar Pedido', 'bg-indigo-500 hover:bg-indigo-600');
        botones += btn('pvListaPedidosBtn', 'Pedidos', 'bg-cyan-600 hover:bg-cyan-700');
        botones += btn('pvBandejaBtn', 'Estado del Pedido', 'bg-teal-600 hover:bg-teal-700');
        botones += btn('pvReportesBtn', 'Reportes', 'bg-slate-700 hover:bg-slate-800');
        // Funciones adicionales de admin
        if (esAdmin) botones += btn('pvInventarioRutaBtn', 'Inv. por Ruta', 'bg-blue-600 hover:bg-blue-700');
        if (esAdmin) botones += btn('pvVendedoresBtn', 'Vendedores/Zonas', 'bg-slate-600 hover:bg-slate-700');
        if (esAdmin) botones += btn('pvConfigBtn', 'Configuración', 'bg-gray-600 hover:bg-gray-700');
        // Accesos tradicionales reutilizados (despachador)
        if (esDesp) botones += btn('pvClientesBtn', 'Clientes', 'bg-teal-600 hover:bg-teal-700');
        if (esDesp) botones += btn('pvCxcBtn', 'CXC', 'bg-amber-600 hover:bg-amber-700');
        if (esDesp) botones += btn('pvPerfilBtn', 'Mi Perfil', 'bg-slate-700 hover:bg-slate-800');

        // El despachador entra directo aquí (es su pantalla principal), así que no
        // muestra "Volver al Menú". Los demás llegan desde el botón Pre-Venta del menú único.
        _mainContent.innerHTML = `
            <div class="p-3 pt-5 container mx-auto max-w-lg">
                <div class="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-xl text-center">
                    <div class="flex items-center justify-between mb-2">
                        <h1 class="text-xl font-bold text-gray-800">${esDesp ? 'Despacho' : 'Pre-Venta'}</h1>
                        ${!esDesp ? `<button id="pvNavTradiBtn" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded-lg shadow-md hover:bg-gray-500 font-bold transition">Volver al Menú</button>` : ''}
                    </div>
                    <button id="pvTasaBcvDisplay" class="mb-3 text-sm font-bold text-gray-700 hover:text-gray-900 hover:underline transition cursor-pointer">(BCV ----- --/--/--)</button>

                    <div class="space-y-2">
                        ${botones}
                    </div>
                </div>
            </div>`;

        // Navegación: volver al menú principal único
        document.getElementById('pvNavTradiBtn')?.addEventListener('click', () => {
            if (_showMainMenu) _showMainMenu();
        });
        // Accesos tradicionales reutilizados (despachador)
        document.getElementById('pvClientesBtn')?.addEventListener('click', () => { if (window.showClientesSubMenu) window.showClientesSubMenu(); });
        document.getElementById('pvCxcBtn')?.addEventListener('click', () => { if (window.showCXCView) window.showCXCView(); });
        document.getElementById('pvPerfilBtn')?.addEventListener('click', () => { if (window.showAdminOrProfileView) window.showAdminOrProfileView(); });

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
        // Cada botón puede o no existir según el rol; se usa ?. para no fallar.
        document.getElementById('pvPedidosBtn')?.addEventListener('click', () => showTomarPedido());
        document.getElementById('pvListaPedidosBtn')?.addEventListener('click', () => showListaPedidos());
        document.getElementById('pvBandejaBtn')?.addEventListener('click', () => showBandejaDespacho());
        document.getElementById('pvInventarioRutaBtn')?.addEventListener('click', () => showInventarioRuta());
        document.getElementById('pvVendedoresBtn')?.addEventListener('click', () => showPreventaVendedores());
        document.getElementById('pvReportesBtn')?.addEventListener('click', () => showReportesPreventa());
        document.getElementById('pvConfigBtn')?.addEventListener('click', () => enConstruccion('Configuración'));
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

        document.getElementById('pvVendBack')?.addEventListener('click', () => window.showPreventaMenu());

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

        // Vendedores y despachadores reciben ruta ('user' antiguo = vendedor)
        const esVend = (u) => u.role === 'user' || u.role === 'vendedor';
        const vendedores = _pvUsuarios.filter(u => esVend(u) || u.role === 'despachador');
        const admins = _pvUsuarios.filter(u => u.role === 'admin');

        // Solo las dos rutas oficiales (no los sectores)
        const opcionesZona = (sel) => `<option value="">— Sin ruta —</option>` +
            (window.RUTAS_REPARTO || []).map(z => `<option value="${z}" ${sel === z ? 'selected' : ''}>${z}</option>`).join('');

        const nombreDe = (u) => {
            const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
            return n || u.email || u.id;
        };

        if (!vendedores.length) {
            cont.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">No hay vendedores ni despachadores registrados.</p>';
            return;
        }

        const badgeRol = (u) => u.role === 'despachador'
            ? '<span class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold shrink-0">Despachador</span>'
            : '<span class="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold shrink-0">Vendedor</span>';

        cont.innerHTML = `
            <p class="text-[10px] text-gray-400 uppercase font-bold">Personal de ruta · ${vendedores.length}</p>
            ${vendedores.map(u => `
                <div class="border border-gray-200 rounded-lg p-2.5">
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                        <div class="min-w-0">
                            <div class="font-bold text-gray-800 text-sm truncate">${nombreDe(u)}</div>
                            <div class="text-[10px] text-gray-400 truncate">${u.email || ''}${u.camion ? ' · Camión: ' + u.camion : ''}</div>
                        </div>
                        ${badgeRol(u)}
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

    // Carga el stock asignado a la bolsa de la ruta de un vendedor (solo informativo)
    async function cargarStockRuta(vendedorId) {
        _pvStockRuta = {};
        if (!vendedorId) return;
        // El stock que se muestra en Tomar Pedido es el MISMO inventario real del
        // vendedor (el que ve en Inventario y Venta Directa). Así queda sincronizado
        // automáticamente: ese inventario ya está al día con su ruta.
        try {
            const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${vendedorId}/inventario`));
            invSnap.docs.forEach(d => {
                const data = d.data();
                const uCj = data.unidadesPorCaja || 1;
                const unidades = data.cantidadUnidades || 0;
                _pvStockRuta[d.id] = {
                    cantidadUnidades: unidades,
                    cantCajas: Math.floor(unidades / uCj)
                };
            });
        } catch (e) { console.warn('No se pudo leer el inventario del vendedor:', e); }
    }

    // ─────────────────────────────────────────────────────────────
    // Devuelve un mapa { productoId: unidadesComprometidas } con los
    // pedidos ACTIVOS (no entregados ni anulados) de un vendedor.
    // Son las unidades ya "apartadas" que deben restarse del stock.
    // Cache de 30s para no releer en cada render.
    // ─────────────────────────────────────────────────────────────
    let _pvComprometidoCache = { ts: 0, vendedorId: null, mapa: {} };
    window.getPedidosComprometidos = async function (vendedorId) {
        if (!vendedorId || !_db) return {};
        const ahora = Date.now();
        if (_pvComprometidoCache.vendedorId === vendedorId &&
            (ahora - _pvComprometidoCache.ts) < 30000) {
            return _pvComprometidoCache.mapa;
        }
        const mapa = {};
        try {
            // Asegurar catálogo cargado (para el fallback de unidades cuando se llama desde ventas.js)
            if (!_pvProductos || !_pvProductos.length) {
                try {
                    const ps = await _getDocs(_collection(_db, pathProductos()));
                    _pvProductos = ps.docs.map(d => ({ id: d.id, ...d.data() }));
                } catch (e) { /* seguimos sin fallback */ }
            }
            const snap = await _getDocs(_collection(_db, pathPedidos()));
            snap.docs.forEach(d => {
                const p = d.data();
                if (p.vendedorId !== vendedorId) return;               // solo SUS pedidos
                const est = p.estado || 'pendiente';
                if (est === 'entregado' || est === 'anulado') return;  // ya no cuentan
                (p.productos || []).forEach(pr => {
                    // Fallback al catálogo para pedidos viejos que no guardaron las unidades
                    const cat = (_pvProductos || []).find(x => x.id === pr.id) || {};
                    const uCj = pr.unidadesPorCaja || cat.unidadesPorCaja || 1;
                    const uPaq = pr.unidadesPorPaquete || cat.unidadesPorPaquete || 1;
                    const unidades = (pr.cantCj || 0) * uCj + (pr.cantPaq || 0) * uPaq + (pr.cantUnd || 0);
                    if (unidades > 0) mapa[pr.id] = (mapa[pr.id] || 0) + unidades;
                });
            });
        } catch (e) { console.warn('No se pudieron leer los pedidos comprometidos:', e); }
        _pvComprometidoCache = { ts: ahora, vendedorId, mapa };
        return mapa;
    };
    // Permite invalidar el cache cuando se guarda o cambia un pedido.
    window.invalidarComprometidoCache = function () { _pvComprometidoCache = { ts: 0, vendedorId: null, mapa: {} }; };

    let _pvTasaCOP = 0, _pvTasaBs = 0, _pvMoneda = 'USD';
    let _pvComprometidoTP = {};  // unidades ya apartadas por pedidos (para el disponible)
    let _pvSortFnPedido = null;

    // Formato de moneda igual al de Nueva Venta
    function _pvFmtMoneda(valorUSD) {
        const v = valorUSD || 0;
        if (_pvMoneda === 'COP' && _pvTasaCOP > 0) return '$' + Math.round(v * _pvTasaCOP).toLocaleString('es-CO') + ' COP';
        if (_pvMoneda === 'Bs' && _pvTasaBs > 0) return 'Bs ' + (v * _pvTasaBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    window.preventaModule = window.preventaModule || {};
    window.preventaModule.togglePedidoMoneda = function () {
        const ciclo = ['USD', 'COP', 'Bs'], tasas = { USD: 1, COP: _pvTasaCOP, Bs: _pvTasaBs };
        let i = ciclo.indexOf(_pvMoneda), n = (i + 1) % 3;
        while (n !== i) { if (tasas[ciclo[n]] > 0) { _pvMoneda = ciclo[n]; renderPedidoProductos(); actualizarTotalPedido(); return; } n = (n + 1) % 3; }
        if (_showModal) _showModal('Aviso', (_pvTasaCOP <= 0 && _pvTasaBs <= 0) ? 'Ingresa tasas para alternar.' : 'Ingresa una tasa válida (> 0).');
    };
    window.preventaModule.handlePedidoQty = function (event) { manejarCantidadPedido(event.target); };

    async function showTomarPedido() {
        _pedidoActual = { vendedor: null, cliente: null, productos: {} };
        _pvMoneda = 'USD';

        // El vendedor es el usuario logueado (o el admin, que también puede tomar pedidos con su cuenta)
        _mainContent.innerHTML = `
            <div class="p-2 w-full">
                <div class="bg-white/90 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl flex flex-col" style="min-height: calc(100vh - 1rem);">
                    <div class="mb-2">
                        <div class="flex justify-between items-center mb-2">
                            <h2 class="text-lg font-bold text-gray-800">Tomar Pedido</h2>
                            <button id="pvPedBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                        <div id="pvVendedorInfo" class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded p-1.5 mb-2 font-semibold"></div>

                        <div id="pvClientSearchWrap">
                            <label for="pvClienteSearch" class="block font-medium mb-1 text-sm">Cliente:</label>
                            <div class="relative">
                                <input type="text" id="pvClienteSearch" placeholder="Buscar..." autocomplete="off" class="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-400">
                                <div id="pvClienteDropdown" class="hidden bg-white border border-gray-200 rounded shadow-lg max-h-44 overflow-y-auto mt-1 relative z-20"></div>
                            </div>
                        </div>

                        <div id="pvClientDisplay" class="hidden flex-wrap items-center justify-between gap-2">
                            <p class="flex-grow text-sm"><span class="font-medium">Cliente:</span> <span id="pvSelClientName" class="font-bold"></span></p>
                            <div id="pvTasasContainer" class="flex flex-row items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0">
                                <div class="flex items-center space-x-1">
                                    <label for="pvTasaCop" class="text-xs font-bold text-gray-600">COP:</label>
                                    <input type="number" id="pvTasaCop" placeholder="4000" class="w-16 px-1 py-1 text-sm border rounded-lg">
                                </div>
                                <div class="flex items-center space-x-1">
                                    <label for="pvTasaBs" class="text-xs font-bold text-gray-600">Bs.:</label>
                                    <input type="number" id="pvTasaBs" placeholder="36.5" class="w-16 px-1 py-1 text-sm border rounded-lg">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="pvInvContainer" class="hidden animate-fade-in flex-grow flex flex-col overflow-hidden">
                        <div class="mb-2">
                            <label for="pvRubroFilter" class="text-xs font-medium">Filtrar Rubro:</label>
                            <select id="pvRubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select>
                        </div>
                        <div class="overflow-auto flex-grow rounded-lg shadow">
                            <table class="min-w-full bg-white text-sm">
                                <thead class="bg-gray-200 sticky top-0">
                                    <tr class="uppercase text-xs">
                                        <th class="py-2 px-2 text-center w-24">Cant</th>
                                        <th class="py-2 px-2 text-left">Producto</th>
                                        <th class="py-2 px-2 text-left price-toggle cursor-pointer" onclick="window.preventaModule.togglePedidoMoneda()">Precio</th>
                                        <th class="py-2 px-1 text-center">Stock</th>
                                    </tr>
                                </thead>
                                <tbody id="pvInvBody" class="text-gray-600"></tbody>
                            </table>
                        </div>
                    </div>

                    <div id="pvFooter" class="mt-2 flex items-center justify-between hidden">
                        <span id="pvPedTotal" class="text-base font-bold text-indigo-700">$0.00</span>
                        <button id="pvPedGuardar" class="px-5 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 font-bold transition disabled:opacity-40" disabled>Guardar Pedido</button>
                    </div>
                </div>
            </div>`;

        document.getElementById('pvPedBack')?.addEventListener('click', () => window.showPreventaMenu());

        // Cargar clientes, productos, usuarios y orden global
        try {
            const [cliSnap, prodSnap, usersSnap] = await Promise.all([
                _getDocs(_collection(_db, pathClientes())),
                _getDocs(_collection(_db, pathProductos())),
                _pvUsuarios.length ? Promise.resolve(null) : _getDocs(_collection(_db, 'users'))
            ]);
            _pvClientes = cliSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _pvProductos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (usersSnap) _pvUsuarios = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (window.getGlobalProductSortFunction) {
                try { _pvSortFnPedido = await window.getGlobalProductSortFunction(); } catch (e) { _pvSortFnPedido = null; }
            }
        } catch (e) {
            console.error('Error cargando datos de pedido:', e);
            if (_showModal) _showModal('Error', 'No se pudieron cargar los datos.');
            return;
        }

        // Vendedor FIJO = usuario logueado
        const yo = _pvUsuarios.find(u => u.id === _userId) || { id: _userId, nombre: 'Vendedor' };
        _pedidoActual.vendedor = yo;
        await cargarStockRuta(yo.id);
        _pvComprometidoTP = window.getPedidosComprometidos ? await window.getPedidosComprometidos(yo.id) : {};
        document.getElementById('pvVendedorInfo').textContent =
            'Vendedor: ' + _pvNombreVendedor(yo) + (yo.zonaPreventa ? ' · Zona: ' + yo.zonaPreventa : '');

        // Buscador de cliente
        const cliInput = document.getElementById('pvClienteSearch');
        let debCli = null;
        cliInput.addEventListener('input', () => {
            clearTimeout(debCli);
            debCli = setTimeout(() => {
                const term = cliInput.value.toLowerCase().trim();
                const drop = document.getElementById('pvClienteDropdown');
                if (!term) { drop.classList.add('hidden'); return; }
                const res = _pvClientes.filter(c =>
                    (c.nombreComercial || '').toLowerCase().includes(term) ||
                    (c.nombrePersonal || '').toLowerCase().includes(term)).slice(0, 30);
                drop.innerHTML = res.length
                    ? res.map(c => `<div class="pv-cli-opt px-2 py-1.5 text-xs hover:bg-indigo-50 cursor-pointer border-b border-gray-100" data-id="${c.id}">
                        <div class="font-semibold text-gray-800">${c.nombreComercial || '(sin nombre)'}</div>
                        <div class="text-[10px] text-gray-400">${c.nombrePersonal || ''}${c.sector ? ' · ' + c.sector : ''}</div></div>`).join('')
                    : '<div class="px-2 py-2 text-xs text-gray-400">Sin coincidencias</div>';
                drop.classList.remove('hidden');
                drop.querySelectorAll('.pv-cli-opt').forEach(el =>
                    el.addEventListener('click', () => seleccionarClientePedido(el.dataset.id)));
            }, 200);
        });

        document.getElementById('pvPedGuardar')?.addEventListener('click', guardarPedido);
    }

    function seleccionarClientePedido(id) {
        const c = _pvClientes.find(x => x.id === id);
        if (!c) return;
        _pedidoActual.cliente = c;

        document.getElementById('pvClientSearchWrap').classList.add('hidden');
        const disp = document.getElementById('pvClientDisplay');
        disp.classList.remove('hidden');
        disp.classList.add('flex');
        const rutaCli = c.ruta || '';
        document.getElementById('pvSelClientName').innerHTML =
            (c.nombreComercial || '(sin nombre)') + (c.nombrePersonal ? ' · ' + c.nombrePersonal : '') +
            (rutaCli ? ` <span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">${rutaCli}</span>` : ' <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">sin ruta</span>');

        // Aviso suave si el cliente es de otra ruta que la del vendedor (no bloquea)
        const rutaVend = (_pedidoActual.vendedor && _pedidoActual.vendedor.zonaPreventa) || '';
        if (rutaVend && rutaCli && rutaVend !== rutaCli && _showModal) {
            _showModal('Aviso de ruta', `Este cliente es de la ruta <strong>${rutaCli}</strong>, pero tu ruta es <strong>${rutaVend}</strong>. Puedes continuar, pero verifica que sea correcto.`);
        }

        // Tasas COP/Bs (se recuerdan como en Nueva Venta)
        const inCop = document.getElementById('pvTasaCop');
        const inBs = document.getElementById('pvTasaBs');
        const savedCop = localStorage.getItem('tasaCOP'); if (savedCop) { _pvTasaCOP = parseFloat(savedCop) || 0; inCop.value = _pvTasaCOP; }
        // Tasa Bs. predeterminada = tasa BCV del día (la que se ingresa en CXC).
        // Se puede actualizar; si el usuario ya la cambió hoy, se respeta su valor.
        (async () => {
            try {
                const tHoy = window.getTasaHoyBCV ? await window.getTasaHoyBCV() : null;
                const savedBs = localStorage.getItem('tasaBs');
                const savedBsFecha = localStorage.getItem('tasaBsFecha');
                const hoyISO = tHoy ? tHoy.iso : '';
                if (savedBs && savedBsFecha === hoyISO) {
                    _pvTasaBs = parseFloat(savedBs) || 0;
                } else if (tHoy && tHoy.rate) {
                    _pvTasaBs = Number(tHoy.rate);
                    localStorage.setItem('tasaBs', _pvTasaBs);
                    localStorage.setItem('tasaBsFecha', hoyISO);
                } else if (savedBs) {
                    _pvTasaBs = parseFloat(savedBs) || 0;
                }
                if (_pvTasaBs > 0) {
                    inBs.value = _pvTasaBs;
                    if (_pvMoneda === 'Bs') { renderPedidoProductos(); actualizarTotalPedido(); }
                }
            } catch (e) { console.warn('No se pudo cargar la tasa BCV del día:', e); }
        })();
        inCop.addEventListener('input', (e) => { _pvTasaCOP = parseFloat(e.target.value) || 0; localStorage.setItem('tasaCOP', _pvTasaCOP); if (_pvMoneda === 'COP') { renderPedidoProductos(); actualizarTotalPedido(); } });
        inBs.addEventListener('input', (e) => { _pvTasaBs = parseFloat(e.target.value) || 0; localStorage.setItem('tasaBs', _pvTasaBs); const h = new Date(); localStorage.setItem('tasaBsFecha', `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`); if (_pvMoneda === 'Bs') { renderPedidoProductos(); actualizarTotalPedido(); } });

        // Mostrar tabla y footer
        document.getElementById('pvInvContainer').classList.remove('hidden');
        document.getElementById('pvFooter').classList.remove('hidden');

        // Poblar filtro de rubro
        const rubros = [...new Set(_pvProductos.map(p => p.rubro).filter(Boolean))].sort();
        const selR = document.getElementById('pvRubroFilter');
        selR.innerHTML = '<option value="">Todos</option>' + rubros.map(r => `<option value="${r}">${r}</option>`).join('');
        selR.addEventListener('change', renderPedidoProductos);

        renderPedidoProductos();
        actualizarBotonGuardar();
    }

    // Renderiza TODOS los productos (con o sin stock), igual que Nueva Venta pero sin límite de stock
    function renderPedidoProductos() {
        const body = document.getElementById('pvInvBody');
        if (!body) return;
        const rubro = document.getElementById('pvRubroFilter')?.value || '';
        let lista = _pvProductos.slice();
        if (rubro) lista = lista.filter(p => p.rubro === rubro);
        if (_pvSortFnPedido) lista.sort(_pvSortFnPedido);
        else lista.sort((a, b) => (a.segmento || '').localeCompare(b.segmento || '') || (a.presentacion || '').localeCompare(b.presentacion || ''));

        if (!lista.length) { body.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-4">No hay productos.</td></tr>'; return; }

        let html = '';
        let lastSeg = null;
        lista.forEach(prod => {
            const seg = prod.segmento || 'Sin segmento';
            if (seg !== lastSeg) {
                lastSeg = seg;
                html += `<tr class="bg-gray-100"><td colspan="4" class="py-1 px-2 font-bold sticky top-[calc(theme(height.10))] z-[9]">${seg}</td></tr>`;
            }
            const vPor = prod.ventaPor || { und: true };
            const pa = _pedidoActual.productos[prod.id] || {};
            const precios = prod.precios || { und: prod.precioPorUnidad || 0 };

            // DISPONIBLE = stock del vendedor − unidades ya apartadas por sus pedidos.
            // Es lo que realmente queda para pedir (Tomar Pedido muestra solo el disponible).
            const invVend = _pvStockRuta[prod.id];
            const stockReal = invVend ? (invVend.cantidadUnidades || 0) : 0;
            const comprometido = _pvComprometidoTP[prod.id] || 0;
            const stockU = stockReal - comprometido;  // disponible (puede ser negativo, se muestra pero no bloquea el pedido)
            const uCjTmp = prod.unidadesPorCaja || 1;
            const dispCj = Math.floor(stockU / uCjTmp);

            const fila = (tipo, label, cant, precio, stockTxt) => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-2 text-center align-middle">
                        <input type="number" min="0" value="${cant || 0}" data-pid="${prod.id}" data-tipo="${tipo}"
                               class="w-16 p-1 text-center border rounded-md font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 pv-qty"
                               oninput="window.preventaModule.handlePedidoQty(event)">
                    </td>
                    <td class="py-2 px-2 text-left align-middle font-medium text-gray-700">${label} <span class="text-xs text-gray-500">${prod.marca || 'S/M'}</span></td>
                    <td class="py-2 px-2 text-left align-middle font-bold text-gray-900 price-toggle cursor-pointer" onclick="window.preventaModule.togglePedidoMoneda()">${_pvFmtMoneda(precio)}</td>
                    <td class="py-2 px-1 text-center align-middle text-xs font-semibold ${stockU > 0 ? 'text-gray-500' : 'text-red-400'}">${stockTxt}</td>
                </tr>`;

            if (vPor.cj) { const uCj = prod.unidadesPorCaja || 1; const maxCj = Math.floor(stockU / uCj); html += fila('cj', `${prod.presentacion} (Cj/${uCj} und)`, pa.cantCj, precios.cj || 0, `${maxCj} Cj`); }
            if (vPor.paq) { const uPaq = prod.unidadesPorPaquete || 1; const maxPaq = Math.floor(stockU / uPaq); html += fila('paq', `${prod.presentacion} (Paq/${uPaq})`, pa.cantPaq, precios.paq || 0, `${maxPaq} Pq`); }
            if (vPor.und) { html += fila('und', `${prod.presentacion} (Und)`, pa.cantUnd, precios.und || 0, `${stockU} Un`); }
        });
        body.innerHTML = html;
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
        if ((pa.cantCj || 0) === 0 && (pa.cantPaq || 0) === 0 && (pa.cantUnd || 0) === 0) delete _pedidoActual.productos[pid];
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
        if (el) el.textContent = _pvFmtMoneda(calcularTotalPedido());
    }

    function actualizarBotonGuardar() {
        const btn = document.getElementById('pvPedGuardar');
        if (!btn) return;
        btn.disabled = !(_pedidoActual.vendedor && _pedidoActual.cliente && Object.keys(_pedidoActual.productos).length);
    }

    async function guardarPedido() {
        if (!_pedidoActual.vendedor || !_pedidoActual.cliente) return;
        const productos = Object.values(_pedidoActual.productos);
        if (!productos.length) return;

        const btn = document.getElementById('pvPedGuardar');
        btn.disabled = true; btn.textContent = 'Guardando...';

        const total = calcularTotalPedido();
        const v = _pedidoActual.vendedor;
        const c = _pedidoActual.cliente;
        const pedido = {
            clienteId: c.id, clienteNombre: c.nombreComercial || '',
            clienteNombrePersonal: c.nombrePersonal || '', clienteSector: c.sector || '',
            vendedorId: v.id, vendedorNombre: _pvNombreVendedor(v), ruta: c.ruta || '', zona: c.ruta || v.zonaPreventa || c.sector || '',
            productos: productos.map(p => ({
                id: p.id, presentacion: p.presentacion, marca: p.marca || null,
                cantCj: p.cantCj || 0, cantPaq: p.cantPaq || 0, cantUnd: p.cantUnd || 0,
                unidadesPorCaja: p.unidadesPorCaja || 1, unidadesPorPaquete: p.unidadesPorPaquete || 1,
                precios: p.precios,
                subtotal: (p.precios?.cj || 0) * (p.cantCj || 0) + (p.precios?.paq || 0) * (p.cantPaq || 0) + (p.precios?.und || 0) * (p.cantUnd || 0)
            })),
            total: total, estado: 'pendiente', fechaCreacion: new Date().toISOString(),
            creadoPor: _userId,
            historialEstados: [{ estado: 'pendiente', fecha: new Date().toISOString(), por: _userId }]
        };
        try {
            await _addDoc(_collection(_db, pathPedidos()), pedido);
            if (window.invalidarComprometidoCache) window.invalidarComprometidoCache();
            if (_showModal) _showModal('Pedido guardado',
                `Pedido de <strong>${pedido.clienteNombre}</strong> por <strong>$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> registrado. Queda pendiente para despacho.`);
            showTomarPedido();
        } catch (e) {
            console.error('Error guardando pedido:', e);
            if (_showModal) _showModal('Error', 'No se pudo guardar el pedido. Intenta de nuevo.');
            btn.disabled = false; btn.textContent = 'Guardar Pedido';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // BANDEJA DE DESPACHO — ver pedidos y moverlos por estados
    // Lee de preventa_pedidos en tiempo real. Cambia estado con merge.
    // Por ahora NO descuenta inventario (eso será una fase posterior).
    // ═══════════════════════════════════════════════════════════
    const PV_ESTADOS = [
        { key: 'pendiente',    label: 'Pendiente',      color: 'gray',   icon: '🕓' },
        { key: 'preparacion',  label: 'En preparación', color: 'amber',  icon: '📋' },
        { key: 'cargado',      label: 'Cargado',        color: 'blue',   icon: '📦' },
        { key: 'entregado',    label: 'Entregado',      color: 'green',  icon: '✅' }
    ];
    function pvEstadoInfo(key) { return PV_ESTADOS.find(e => e.key === key) || PV_ESTADOS[0]; }

    let _pvPedidos = [];          // pedidos en tiempo real
    let _pvBandejaUnsub = null;   // listener a cancelar
    let _pvFiltroEstado = '';     // '' = todos
    let _pvFiltroVendedor = '';
    let _pvFiltroHoy = false;
    let _pvFiltroRuta = '';       // '' = todas (solo admin)

// ═══════════════════════════════════════════════════════════
    // PEDIDOS — listado de pedidos tomados (estilo "ventas totales").
    // El despachador/admin ve cada pedido, con sus productos separados
    // en DISPONIBLES y NO DISPONIBLES según el stock actual del vendedor.
    // Desde aquí se imprime el ticket (solo disponibles) y se edita/elimina.
    // ═══════════════════════════════════════════════════════════
    let _pvLista = [];
    let _pvListaUnsub = null;
    let _pvListaFiltroHoy = false;

    function showListaPedidos() {
        const rol = window.userRole === 'user' ? 'vendedor' : window.userRole;
        if (!['admin', 'vendedor', 'despachador'].includes(rol)) return;

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Pedidos</h2>
                        <button id="pvLPBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>
                    <label class="flex items-center gap-1.5 text-[11px] text-gray-600 mb-2">
                        <input type="checkbox" id="pvLPHoy" class="rounded"> Solo pedidos de hoy
                    </label>
                    <div id="pvLPLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando pedidos...
                    </div>
                    <div id="pvLPLista" class="hidden space-y-2 max-h-[62vh] overflow-y-auto"></div>
                </div>
            </div>`;

        document.getElementById('pvLPBack')?.addEventListener('click', () => {
            if (_pvListaUnsub) { _pvListaUnsub(); _pvListaUnsub = null; }
            window.showPreventaMenu();
        });
        document.getElementById('pvLPHoy')?.addEventListener('change', (e) => { _pvListaFiltroHoy = e.target.checked; renderListaPedidos(); });

        // Pedidos en tiempo real
        try {
            const ref = _collection(_db, pathPedidos());
            _pvListaUnsub = _onSnapshot(ref, snap => {
                _pvLista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderListaPedidos();
            }, err => {
                console.error('Error escuchando pedidos:', err);
                const l = document.getElementById('pvLPLoading');
                if (l) l.innerHTML = '<span class="text-red-500">Error al cargar pedidos.</span>';
            });
        } catch (e) {
            console.error('Error iniciando listado de pedidos:', e);
        }
    }

    function _pvListaFiltradaPorRol() {
        const rol = window.userRole === 'user' ? 'vendedor' : window.userRole;
        let lista = _pvLista.slice();
        if (rol === 'despachador') {
            const miRuta = window.userZona || '';
            lista = lista.filter(p => (p.ruta || p.zona || '') === miRuta);
        } else if (rol === 'vendedor') {
            lista = lista.filter(p => p.vendedorId === _userId);
        }
        // No mostrar entregados/anulados en la lista de trabajo (ya cerraron su ciclo)
        lista = lista.filter(p => (p.estado || 'pendiente') !== 'entregado' && (p.estado || 'pendiente') !== 'anulado');
        if (_pvListaFiltroHoy) lista = lista.filter(p => _pvEsHoy(p.fechaCreacion));
        lista.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));
        return lista;
    }

    function renderListaPedidos() {
        const loading = document.getElementById('pvLPLoading');
        const cont = document.getElementById('pvLPLista');
        if (!cont) return;
        if (loading) loading.classList.add('hidden');
        cont.classList.remove('hidden');

        const lista = _pvListaFiltradaPorRol();
        if (!lista.length) {
            cont.innerHTML = '<p class="text-center text-gray-400 py-8 text-sm">No hay pedidos activos.</p>';
            return;
        }

        cont.innerHTML = lista.map(p => {
            const est = pvEstadoInfo(p.estado === 'despachado' ? 'cargado' : (p.estado || 'pendiente'));
            const fecha = p.fechaCreacion ? new Date(p.fechaCreacion).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) : '';
            const nItems = (p.productos || []).length;
            const tieneTicket = !!p.ticketGenerado;
            return `
                <div class="pv-lp-card border border-gray-200 rounded-lg p-3 hover:bg-cyan-50/40 cursor-pointer transition" data-id="${p.id}">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="font-bold text-gray-800 text-sm truncate">${p.clienteNombre || '(sin nombre)'}</div>
                            <div class="text-[10px] text-gray-400 truncate">${p.vendedorNombre || ''}${p.ruta ? ' · ' + p.ruta : ''} · ${fecha}</div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-sm font-bold text-cyan-700">$${(p.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            <span class="text-[9px] px-1.5 py-0.5 rounded bg-${est.color}-100 text-${est.color}-700 font-bold">${est.icon} ${est.label}</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between mt-1.5">
                        <span class="text-[10px] text-gray-400">${nItems} producto(s)</span>
                        ${tieneTicket ? '<span class="text-[9px] text-green-600 font-bold">🎫 Ticket generado</span>' : ''}
                    </div>
                </div>`;
        }).join('');

        cont.querySelectorAll('.pv-lp-card').forEach(el =>
            el.addEventListener('click', () => abrirDetalleListaPedido(el.dataset.id)));
    }

    // Separa los productos del pedido en disponibles y no disponibles
    // según el stock actual del VENDEDOR que tomó el pedido.
    async function _pvClasificarProductos(pedido) {
        const stockVend = {};
        try {
            const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${pedido.vendedorId}/inventario`));
            invSnap.docs.forEach(d => { stockVend[d.id] = d.data().cantidadUnidades || 0; });
        } catch (e) { console.warn('No se pudo leer inventario del vendedor:', e); }

        // Restar lo comprometido por OTROS pedidos del mismo vendedor (no este),
        // para no contar dos veces el stock ya apartado.
        const comprometidoOtros = {};
        _pvLista.forEach(o => {
            if (o.id === pedido.id) return;
            if (o.vendedorId !== pedido.vendedorId) return;
            const est = o.estado || 'pendiente';
            if (est === 'entregado' || est === 'anulado') return;
            (o.productos || []).forEach(pr => {
                const u = _pvUnidadesProducto(pr);
                comprometidoOtros[pr.id] = (comprometidoOtros[pr.id] || 0) + u;
            });
        });

        const disponibles = [], noDisponibles = [];
        (pedido.productos || []).forEach(pr => {
            const pedidas = _pvUnidadesProducto(pr);
            const stockLibre = (stockVend[pr.id] || 0) - (comprometidoOtros[pr.id] || 0);
            if (stockLibre >= pedidas && pedidas > 0) {
                disponibles.push({ ...pr, unidadesPedidas: pedidas, unidadesDespacho: pedidas });
            } else if (stockLibre > 0) {
                // Parcial: hay algo, pero no alcanza para todo lo pedido
                noDisponibles.push({ ...pr, unidadesPedidas: pedidas, unidadesFaltantes: pedidas - stockLibre, stockLibre, parcial: true });
                disponibles.push({ ...pr, unidadesPedidas: pedidas, unidadesDespacho: stockLibre, parcial: true });
            } else {
                noDisponibles.push({ ...pr, unidadesPedidas: pedidas, unidadesFaltantes: pedidas, stockLibre: 0, parcial: false });
            }
        });
        return { disponibles, noDisponibles };
    }

    function _pvUnidadesProducto(pr) {
        const cat = (_pvProductos || []).find(x => x.id === pr.id) || {};
        const uCj = pr.unidadesPorCaja || cat.unidadesPorCaja || 1;
        const uPaq = pr.unidadesPorPaquete || cat.unidadesPorPaquete || 1;
        return (pr.cantCj || 0) * uCj + (pr.cantPaq || 0) * uPaq + (pr.cantUnd || 0);
    }

    async function abrirDetalleListaPedido(id) {
        const p = _pvLista.find(x => x.id === id);
        if (!p) return;

        document.getElementById('pvLPDetOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'pvLPDetOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
                <div class="sticky top-0 bg-cyan-600 text-white px-4 py-3 flex items-center justify-between">
                    <div class="min-w-0">
                        <div class="font-bold truncate">${p.clienteNombre || '(sin nombre)'}</div>
                        <div class="text-[11px] opacity-90 truncate">${p.vendedorNombre || ''}${p.ruta ? ' · ' + p.ruta : ''}</div>
                    </div>
                    <button id="pvLPDetClose" class="text-white text-2xl leading-none px-2">&times;</button>
                </div>
                <div id="pvLPDetBody" class="p-4">
                    <div class="text-center text-gray-400 py-6 text-sm">
                        <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Verificando disponibilidad...
                    </div>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
        document.getElementById('pvLPDetClose')?.addEventListener('click', () => ov.remove());

        const { disponibles, noDisponibles } = await _pvClasificarProductos(p);

        const fmtCant = (pr) => {
            const partes = [];
            if (pr.cantCj) partes.push(`${pr.cantCj} Cj`);
            if (pr.cantPaq) partes.push(`${pr.cantPaq} Pq`);
            if (pr.cantUnd) partes.push(`${pr.cantUnd} Un`);
            return partes.join(' + ') || '0';
        };

        const dispHtml = disponibles.length ? disponibles.map(pr => `
            <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-800 truncate">${pr.presentacion || ''} <span class="text-xs text-gray-400">${pr.marca || ''}</span></div>
                    <div class="text-[10px] text-gray-400">${fmtCant(pr)}${pr.parcial ? ` · <span class="text-amber-600 font-bold">parcial (${pr.unidadesDespacho} de ${pr.unidadesPedidas} und)</span>` : ''}</div>
                </div>
                <span class="text-green-600 text-lg shrink-0">✓</span>
            </div>`).join('') : '<p class="text-xs text-gray-400 py-2">Ningún producto disponible.</p>';

        const noDispHtml = noDisponibles.length ? noDisponibles.map(pr => `
            <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-500 truncate">${pr.presentacion || ''} <span class="text-xs text-gray-400">${pr.marca || ''}</span></div>
                    <div class="text-[10px] text-red-400">${fmtCant(pr)} pedido · faltan ${pr.unidadesFaltantes} und</div>
                </div>
                <span class="text-red-400 text-lg shrink-0">✕</span>
            </div>`).join('') : '';

        const est = pvEstadoInfo(p.estado === 'despachado' ? 'cargado' : (p.estado || 'pendiente'));
        const body = document.getElementById('pvLPDetBody');
        if (!body) return;
        body.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <span class="text-[11px] px-2 py-0.5 rounded bg-${est.color}-100 text-${est.color}-700 font-bold">${est.icon} ${est.label}</span>
                <span class="text-sm font-bold text-cyan-700">$${(p.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>

            <div class="mb-3">
                <h4 class="text-xs font-bold text-green-700 uppercase mb-1">✓ Disponibles (van en el ticket)</h4>
                <div class="bg-green-50/50 rounded-lg px-3 py-1">${dispHtml}</div>
            </div>

            ${noDisponibles.length ? `<div class="mb-3">
                <h4 class="text-xs font-bold text-red-500 uppercase mb-1">✕ No disponibles (falta stock)</h4>
                <div class="bg-red-50/40 rounded-lg px-3 py-1">${noDispHtml}</div>
            </div>` : ''}

            <div class="grid grid-cols-2 gap-2 mt-4">
                <button id="pvLPTicket" class="col-span-2 py-2.5 bg-cyan-600 text-white rounded-lg font-bold text-sm hover:bg-cyan-700 transition ${disponibles.length ? '' : 'opacity-40 pointer-events-none'}">🎫 Imprimir Ticket ${p.ticketGenerado ? '(regenerar)' : ''}</button>
                <button id="pvLPEditar" class="py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition">✏️ Editar</button>
                <button id="pvLPEliminar" class="py-2 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-600 transition">🗑️ Eliminar</button>
            </div>`;

        // Editar (reutiliza la función de editar/aumentar existente)
        document.getElementById('pvLPEditar')?.addEventListener('click', () => {
            ov.remove();
            if (typeof editarPedidoDespacho === 'function') editarPedidoDespacho(p.id);
        });
        // Eliminar
        document.getElementById('pvLPEliminar')?.addEventListener('click', () => eliminarPedidoLista(p.id, p.clienteNombre));
        // Ticket: genera el ticket con solo disponibles y pasa a preparación
        document.getElementById('pvLPTicket')?.addEventListener('click', () => {
            if (!disponibles.length) { if (_showModal) _showModal('Sin disponibles', 'Este pedido no tiene productos disponibles para despachar.'); return; }
            generarTicketPedido(p, disponibles, noDisponibles);
        });
    }

    async function eliminarPedidoLista(id, nombre) {
        _showModal('Eliminar pedido', `¿Seguro que deseas eliminar el pedido de <strong>${nombre || 'este cliente'}</strong>? Esta acción no se puede deshacer.`, async () => {
            try {
                await _deleteDoc(_doc(_db, pathPedidos(), id));
                if (window.invalidarComprometidoCache) window.invalidarComprometidoCache();
                document.getElementById('pvLPDetOverlay')?.remove();
                // El onSnapshot refresca la lista sola
            } catch (e) {
                console.error('Error eliminando pedido:', e);
                _showModal('Error', 'No se pudo eliminar el pedido.');
            }
        }, 'Sí, eliminar', () => {});
    }

        function showBandejaDespacho() {
        const rol = window.userRole === 'user' ? 'vendedor' : window.userRole;
        if (!['admin', 'vendedor', 'despachador'].includes(rol)) return;
        const esAdmin = rol === 'admin';

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Estado del Pedido</h2>
                        <button id="pvBandBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>

                    <!-- Contadores por estado -->
                    <div id="pvBandContadores" class="flex flex-wrap gap-1 mb-2"></div>

                    <!-- Filtros -->
                    <div class="grid grid-cols-2 gap-1.5 mb-2">
                        <select id="pvBandEstado" class="text-xs border border-teal-300 rounded p-1.5 bg-white outline-none">
                            <option value="">Todos los estados</option>
                            ${PV_ESTADOS.map(e => `<option value="${e.key}">${e.icon} ${e.label}</option>`).join('')}
                        </select>
                        <select id="pvBandVendedor" class="text-xs border border-teal-300 rounded p-1.5 bg-white outline-none">
                            <option value="">Todos los vendedores</option>
                        </select>
                    </div>
                    ${esAdmin ? `<div class="mb-2">
                        <select id="pvBandRuta" class="w-full text-xs border border-blue-300 rounded p-1.5 bg-white outline-none">
                            <option value="">Todas las rutas</option>
                            ${(window.RUTAS_REPARTO || []).map(r => `<option value="${r}">${r}</option>`).join('')}
                        </select>
                    </div>` : ''}
                    <label class="flex items-center gap-1.5 text-[11px] text-gray-600 mb-2">
                        <input type="checkbox" id="pvBandHoy" class="rounded"> Solo pedidos de hoy
                    </label>

                    <div id="pvBandLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando pedidos...
                    </div>
                    <div id="pvBandLista" class="hidden space-y-2 max-h-[58vh] overflow-y-auto"></div>
                </div>
            </div>`;

        document.getElementById('pvBandBack')?.addEventListener('click', () => {
            if (_pvBandejaUnsub) { _pvBandejaUnsub(); _pvBandejaUnsub = null; }
            window.showPreventaMenu();
        });
        document.getElementById('pvBandEstado')?.addEventListener('change', (e) => { _pvFiltroEstado = e.target.value; renderBandeja(); });
        document.getElementById('pvBandVendedor')?.addEventListener('change', (e) => { _pvFiltroVendedor = e.target.value; renderBandeja(); });
        document.getElementById('pvBandHoy')?.addEventListener('change', (e) => { _pvFiltroHoy = e.target.checked; renderBandeja(); });
        document.getElementById('pvBandRuta')?.addEventListener('change', (e) => { _pvFiltroRuta = e.target.value; renderBandeja(); });

        // Escuchar pedidos en tiempo real
        try {
            const ref = _collection(_db, pathPedidos());
            _pvBandejaUnsub = _onSnapshot(ref, snap => {
                _pvPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Poblar vendedores únicos
                const sel = document.getElementById('pvBandVendedor');
                if (sel) {
                    const actual = sel.value;
                    const vends = [...new Set(_pvPedidos.map(p => p.vendedorNombre).filter(Boolean))].sort();
                    sel.innerHTML = '<option value="">Todos los vendedores</option>' +
                        vends.map(v => `<option value="${v}" ${v === actual ? 'selected' : ''}>${v}</option>`).join('');
                }
                renderBandeja();
            }, err => {
                console.error('Error escuchando pedidos:', err);
                const l = document.getElementById('pvBandLoading');
                if (l) l.innerHTML = '<span class="text-red-500">Error al cargar los pedidos.</span>';
            });
        } catch (e) {
            console.error('Error bandeja:', e);
        }
    }

    function _pvEsHoy(iso) {
        if (!iso) return false;
        const d = new Date(iso);
        const h = new Date();
        return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
    }

    function renderBandeja() {
        const loading = document.getElementById('pvBandLoading');
        const cont = document.getElementById('pvBandLista');
        const cont2 = document.getElementById('pvBandContadores');
        if (!cont) return;
        if (loading) loading.classList.add('hidden');
        cont.classList.remove('hidden');

        // Contadores por estado (sobre todos los pedidos, antes de filtrar)
        if (cont2) {
            cont2.innerHTML = PV_ESTADOS.filter(e => e.key !== 'anulado').map(e => {
                const n = _pvPedidos.filter(p => (p.estado || 'pendiente') === e.key).length;
                if (!n) return '';
                return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-${e.color}-100 text-${e.color}-700 font-bold">${e.icon} ${n} ${e.label}</span>`;
            }).join('');
        }

        // Aplicar filtros
        let lista = _pvPedidos.slice();

        // ── FILTRO POR ROL ──
        // Despachador: solo los pedidos de SU ruta (zonaPreventa de su usuario).
        // Vendedor: solo SUS pedidos (los que él tomó).
        // Admin: todos, con filtro de ruta opcional.
        const rol = window.userRole === 'user' ? 'vendedor' : window.userRole;
        if (rol === 'despachador') {
            const miRuta = window.userZona || '';
            lista = lista.filter(p => (p.ruta || p.zona || '') === miRuta);
        } else if (rol === 'vendedor') {
            lista = lista.filter(p => p.vendedorId === _userId);
        } else if (rol === 'admin' && _pvFiltroRuta) {
            lista = lista.filter(p => (p.ruta || p.zona || '') === _pvFiltroRuta);
        }

        if (_pvFiltroEstado) lista = lista.filter(p => (p.estado || 'pendiente') === _pvFiltroEstado);
        if (_pvFiltroVendedor) lista = lista.filter(p => p.vendedorNombre === _pvFiltroVendedor);
        if (_pvFiltroHoy) lista = lista.filter(p => _pvEsHoy(p.fechaCreacion));

        // Ordenar: más recientes primero
        lista.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));

        if (!lista.length) {
            cont.innerHTML = '<p class="text-center text-gray-400 py-8 text-sm">No hay pedidos con estos filtros.</p>';
            return;
        }

        cont.innerHTML = lista.map(p => {
            const est = pvEstadoInfo(p.estado || 'pendiente');
            const numProd = (p.productos || []).length;
            const fecha = p.fechaCreacion ? new Date(p.fechaCreacion).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(p.fechaCreacion).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="border border-gray-200 rounded-lg p-2.5 hover:bg-teal-50 cursor-pointer pv-ped-card" data-id="${p.id}">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="min-w-0">
                        <div class="font-bold text-gray-800 text-sm truncate">${p.clienteNombre || '(sin cliente)'}</div>
                        <div class="text-[10px] text-gray-400 truncate">${p.zona || '—'} · ${p.vendedorNombre || '—'}</div>
                    </div>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-${est.color}-100 text-${est.color}-700 font-bold shrink-0 whitespace-nowrap">${est.icon} ${est.label}</span>
                </div>
                <div class="flex items-center justify-between text-[11px]">
                    <span class="text-gray-500">${numProd} producto(s) · ${fecha}</span>
                    <span class="font-black text-indigo-700">${_pvFmtUSD(p.total)}</span>
                </div>
            </div>`;
        }).join('');

        cont.querySelectorAll('.pv-ped-card').forEach(el =>
            el.addEventListener('click', () => mostrarDetallePedido(el.dataset.id)));
    }


    // Detalle del pedido con avance de estados
    function mostrarDetallePedido(id) {
        const p = _pvPedidos.find(x => x.id === id);
        if (!p) return;
        const est = pvEstadoInfo(p.estado || 'pendiente');

        // Secuencia de avance (sin contar anulado). Se eliminó 'despachado'.
        const flujo = ['pendiente', 'preparacion', 'cargado', 'entregado'];
        // Compatibilidad: un pedido que quedó en el estado viejo 'despachado'
        // se trata como 'cargado' para efectos de avanzar/retroceder.
        const estadoNorm = (p.estado === 'despachado') ? 'cargado' : (p.estado || 'pendiente');
        const idxActual = flujo.indexOf(estadoNorm);
        const siguiente = (idxActual >= 0 && idxActual < flujo.length - 1) ? flujo[idxActual + 1] : null;
        const anterior = (idxActual > 0) ? flujo[idxActual - 1] : null;

        document.getElementById('pvPedDetOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'pvPedDetOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';

        const prodRows = (p.productos || []).map(pr => {
            const partes = [];
            if (pr.cantCj) partes.push(`${pr.cantCj} Cj`);
            if (pr.cantPaq) partes.push(`${pr.cantPaq} Paq`);
            if (pr.cantUnd) partes.push(`${pr.cantUnd} Und`);
            return `<div class="flex items-center justify-between py-1 border-b border-gray-50 text-xs">
                <div class="min-w-0"><div class="font-medium text-gray-700 truncate">${pr.presentacion}</div>
                <div class="text-[10px] text-gray-400">${partes.join(' · ') || '—'}</div></div>
                <span class="font-bold text-gray-700 shrink-0">${_pvFmtUSD(pr.subtotal)}</span>
            </div>`;
        }).join('');

        // Historial de estados
        const histRows = (p.historialEstados || []).map(h => {
            const ei = pvEstadoInfo(h.estado);
            const f = h.fecha ? new Date(h.fecha).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="flex items-center gap-1.5 text-[10px] text-gray-500"><span>${ei.icon}</span> ${ei.label} · ${f}</div>`;
        }).join('');

        const btnSiguiente = siguiente ? (() => {
            const s = pvEstadoInfo(siguiente);
            return `<button id="pvAvanzar" class="flex-1 py-2.5 bg-${s.color}-600 text-white rounded-lg font-bold text-sm hover:bg-${s.color}-700 transition">${s.icon} Marcar como ${s.label}</button>`;
        })() : '<div class="flex-1 text-center py-2.5 text-green-600 font-bold text-sm">✅ Pedido entregado</div>';

        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div class="bg-gradient-to-r from-teal-600 to-teal-700 text-white px-4 py-3">
                    <div class="font-bold text-base">${p.clienteNombre || '(sin cliente)'}</div>
                    <div class="text-xs opacity-90">${p.clienteNombrePersonal || ''}${p.zona ? ' · ' + p.zona : ''}</div>
                    <div class="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
                        ${est.icon} ${est.label} · Ruta: ${p.vendedorNombre || '—'}
                    </div>
                </div>
                <div class="overflow-y-auto p-4 flex-1">
                    <div class="mb-3">
                        <p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Productos (${(p.productos || []).length})</p>
                        ${prodRows || '<p class="text-xs text-gray-400">Sin productos</p>'}
                        <div class="flex justify-between mt-2 pt-2 border-t font-bold text-sm">
                            <span>Total</span><span class="text-indigo-700">${_pvFmtUSD(p.total)}</span>
                        </div>
                    </div>
                    ${histRows ? `<div class="bg-gray-50 rounded-lg p-2 mb-2"><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Historial</p>${histRows}</div>` : ''}
                </div>
                <div class="p-3 border-t shrink-0 space-y-2">
                    <div class="flex gap-2">
                        ${anterior ? `<button id="pvRetroceder" class="px-3 py-2.5 bg-gray-100 text-gray-500 rounded-lg font-bold text-xs hover:bg-gray-200 transition">↩ Atrás</button>` : ''}
                        ${btnSiguiente}
                    </div>
                    ${(p.estado !== 'anulado' && p.estado !== 'entregado') ? `<button id="pvEditarPedido" class="w-full py-2 bg-amber-500 text-white rounded-lg font-bold text-xs hover:bg-amber-600 transition">✏️ Editar / Aumentar pedido</button>` : ''}
                    <button id="pvTicketGalpon" class="w-full py-2 bg-slate-700 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition">🖨️ Ticket de Galpón (carga)</button>
                    <button id="pvPedDetCerrar" class="w-full py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-xs">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('pvPedDetCerrar').addEventListener('click', () => ov.remove());
        document.getElementById('pvTicketGalpon')?.addEventListener('click', () => generarTicketGalpon(p));
        document.getElementById('pvEditarPedido')?.addEventListener('click', () => editarPedidoDespacho(p));

        if (siguiente) document.getElementById('pvAvanzar')?.addEventListener('click', () => cambiarEstadoPedido(p.id, siguiente));
        if (anterior) document.getElementById('pvRetroceder')?.addEventListener('click', () => cambiarEstadoPedido(p.id, anterior));

    }

// ═══════════════════════════════════════════════════════════
    // ENTREGAR PEDIDO (cierra el ciclo de pre-venta) — PARTE 3.
    // Al entregar:
    //   1. Descuenta del inventario del VENDEDOR que tomó el pedido,
    //      SOLO lo del ticket congelado (ticketDespacho).
    //   2. Genera una VENTA real en el historial del vendedor
    //      (entra a cierre / CXC / reportes como una venta normal).
    //   3. Marca el pedido como entregado.
    // Todo dentro de una transacción para que sea atómico.
    // ═══════════════════════════════════════════════════════════
    async function entregarPedido(pedido) {
        if (!pedido) return;

        // Determinar qué se despacha: el ticket congelado si existe; si no,
        // todo el pedido (fallback para pedidos sin ticket previo).
        let despacho = pedido.ticketDespacho;
        if (!despacho || !despacho.length) {
            despacho = (pedido.productos || []).map(pr => ({
                id: pr.id, presentacion: pr.presentacion, marca: pr.marca || null,
                cantCj: pr.cantCj || 0, cantPaq: pr.cantPaq || 0, cantUnd: pr.cantUnd || 0,
                unidadesPorCaja: pr.unidadesPorCaja || 1, unidadesPorPaquete: pr.unidadesPorPaquete || 1,
                unidadesDespacho: _pvUnidadesProducto(pr), precios: pr.precios || null
            }));
        }
        // Solo items con algo que despachar
        despacho = despacho.filter(d => (d.unidadesDespacho || 0) > 0);
        if (!despacho.length) {
            if (_showModal) _showModal('Sin productos', 'Este pedido no tiene productos para entregar.');
            return;
        }

        if (!_runTransaction) {
            if (_showModal) _showModal('Error', 'No se puede completar la entrega sin conexión estable. Intenta de nuevo.');
            return;
        }

        const vendedorId = pedido.vendedorId;
        const invBase = `artifacts/${_appId}/users/${vendedorId}/inventario`;
        const ventaRef = _doc(_collection(_db, `artifacts/${_appId}/users/${vendedorId}/ventas`));

        try {
            await _runTransaction(_db, async (transaction) => {
                // Leer el inventario de cada producto del despacho
                const refs = despacho.map(d => ({ d, ref: _doc(_db, invBase, d.id) }));
                const docs = await Promise.all(refs.map(r => transaction.get(r.ref)));

                let totalVenta = 0;
                const itemsVenta = [];

                refs.forEach((r, i) => {
                    const invDoc = docs[i];
                    const stockActual = invDoc.exists() ? (invDoc.data().cantidadUnidades || 0) : 0;
                    const qty = r.d.unidadesDespacho || 0;
                    // Descontar (no baja de 0: el ticket ya se congeló con lo disponible)
                    const nuevo = Math.max(0, stockActual - qty);
                    if (invDoc.exists()) {
                        transaction.update(r.ref, { cantidadUnidades: nuevo });
                    }
                    // Subtotal según los precios guardados en el pedido
                    const pr = r.d.precios || {};
                    const sub = (pr.cj || 0) * (r.d.cantCj || 0) + (pr.paq || 0) * (r.d.cantPaq || 0) + (pr.und || 0) * (r.d.cantUnd || 0);
                    totalVenta += sub;
                    itemsVenta.push({
                        id: r.d.id, presentacion: r.d.presentacion, marca: r.d.marca || null,
                        precios: r.d.precios || null,
                        cantidadVendida: { cj: r.d.cantCj || 0, paq: r.d.cantPaq || 0, und: r.d.cantUnd || 0 },
                        totalUnidadesVendidas: qty,
                        unidadesPorCaja: r.d.unidadesPorCaja || 1, unidadesPorPaquete: r.d.unidadesPorPaquete || 1
                    });
                });

                // Registrar la venta (marcada como originada en pre-venta)
                const ventaData = {
                    clienteId: pedido.clienteId || null,
                    clienteNombre: pedido.clienteNombre || '',
                    clienteNombrePersonal: pedido.clienteNombrePersonal || '',
                    fecha: new Date(),
                    total: totalVenta,
                    productos: itemsVenta,
                    vaciosDevueltosPorTipo: {},
                    origen: 'preventa',
                    pedidoId: pedido.id,
                    tipoOperacion: 'contado'
                };
                transaction.set(ventaRef, ventaData);

                // Marcar el pedido como entregado
                const pedRef = _doc(_db, pathPedidos(), pedido.id);
                transaction.update(pedRef, {
                    estado: 'entregado',
                    ventaGenerada: ventaRef.id,
                    historialEstados: (pedido.historialEstados || []).concat([{ estado: 'entregado', fecha: new Date().toISOString(), por: _userId }])
                });
            });

            if (window.invalidarComprometidoCache) window.invalidarComprometidoCache();
            document.getElementById('pvLPDetOverlay')?.remove();
            document.getElementById('pvPedDetOverlay')?.remove();
            if (_showModal) _showModal('Pedido entregado', `Se entregó el pedido de <strong>${pedido.clienteNombre || 'el cliente'}</strong>. El inventario se ajustó y la venta quedó registrada.`);
        } catch (e) {
            console.error('Error entregando pedido:', e);
            if (_showModal) _showModal('Error', 'No se pudo completar la entrega. Verifica la conexión e intenta de nuevo.');
        }
    }

        async function cambiarEstadoPedido(id, nuevoEstado) {
        const p = _pvPedidos.find(x => x.id === id) || _pvLista.find(x => x.id === id);
        if (!p) return;
        // La ENTREGA cierra el ciclo: descuenta inventario y genera la venta.
        if (nuevoEstado === 'entregado') { entregarPedido(p); return; }
        const nuevoHist = (p.historialEstados || []).concat([{ estado: nuevoEstado, fecha: new Date().toISOString(), por: _userId }]);
        try {
            if (window.invalidarComprometidoCache) window.invalidarComprometidoCache();
            await _setDoc(_doc(_db, pathPedidos(), id), {
                estado: nuevoEstado,
                historialEstados: nuevoHist
            }, { merge: true });
            document.getElementById('pvPedDetOverlay')?.remove();
            // El onSnapshot refresca la lista automáticamente
        } catch (e) {
            console.error('Error cambiando estado:', e);
            if (_showModal) _showModal('Error', 'No se pudo actualizar el estado del pedido.');
        }
    }


    // ═══════════════════════════════════════════════════════════
    // TICKET DE GALPÓN — orden de carga para almacenistas
    // Documento interno (NO es factura). Lista productos con casillas
    // para marcar lo cargado. Se puede compartir como imagen o imprimir texto.
    // ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
    // TICKET DE PEDIDO (Pre-Venta) — solo productos DISPONIBLES.
    // Al generarlo: congela lo que se va a despachar en el pedido
    // (ticketDespacho) y guarda lo NO despachado (noDespachado), y
    // pasa el pedido a "preparación" automáticamente (Opción A).
    // Este ticket es la orden de carga Y el respaldo de la entrega.
    // ═══════════════════════════════════════════════════════════
    async function generarTicketPedido(pedido, disponibles, noDisponibles) {
        // 1) Construir el "ticket congelado": lo que realmente se despacha.
        //    Para parciales, se recalcula cantidades de Cj/Paq/Und a partir
        //    de las unidades a despachar, para que el ticket sea claro.
        const ticketItems = disponibles.map(pr => {
            const cat = (_pvProductos || []).find(x => x.id === pr.id) || {};
            const uCj = pr.unidadesPorCaja || cat.unidadesPorCaja || 1;
            const uPaq = pr.unidadesPorPaquete || cat.unidadesPorPaquete || 1;
            let restante = (pr.unidadesDespacho != null) ? pr.unidadesDespacho : _pvUnidadesProducto(pr);
            // Si NO es parcial, se respetan las cantidades originales del pedido
            let cj, paq, und;
            if (pr.parcial) {
                cj = Math.floor(restante / uCj); restante -= cj * uCj;
                paq = uPaq > 1 ? Math.floor(restante / uPaq) : 0; restante -= paq * uPaq;
                und = restante;
            } else {
                cj = pr.cantCj || 0; paq = pr.cantPaq || 0; und = pr.cantUnd || 0;
            }
            return {
                id: pr.id, presentacion: pr.presentacion, marca: pr.marca || null,
                cantCj: cj, cantPaq: paq, cantUnd: und,
                unidadesPorCaja: uCj, unidadesPorPaquete: uPaq,
                unidadesDespacho: (pr.unidadesDespacho != null) ? pr.unidadesDespacho : _pvUnidadesProducto(pr),
                precios: pr.precios || null, parcial: !!pr.parcial
            };
        });

        // Lo NO despachado (para el reporte de faltantes de la Parte 4)
        const noDespachado = noDisponibles.map(pr => ({
            id: pr.id, presentacion: pr.presentacion, marca: pr.marca || null,
            unidadesFaltantes: pr.unidadesFaltantes || 0
        }));

        // 2) Guardar en el pedido y pasar a preparación (si aún no estaba más avanzado)
        try {
            const estActual = pedido.estado || 'pendiente';
            const nuevoEstado = (estActual === 'pendiente') ? 'preparacion' : estActual;
            const cambios = {
                ticketGenerado: true,
                ticketDespacho: ticketItems,
                noDespachado: noDespachado,
                ticketFecha: new Date().toISOString()
            };
            if (nuevoEstado !== estActual) {
                cambios.estado = nuevoEstado;
                cambios.historialEstados = (pedido.historialEstados || []).concat([{ estado: nuevoEstado, fecha: new Date().toISOString(), por: _userId }]);
            }
            if (window.invalidarComprometidoCache) window.invalidarComprometidoCache();
            await _setDoc(_doc(_db, pathPedidos(), pedido.id), cambios, { merge: true });
            // Actualizar copia local para el render
            Object.assign(pedido, cambios);
        } catch (e) {
            console.error('Error guardando ticket:', e);
            if (_showModal) _showModal('Error', 'No se pudo preparar el ticket.');
            return;
        }

        // 3) Mostrar el ticket visual (solo disponibles)
        _renderTicketVisual(pedido, ticketItems);
    }

    function _renderTicketVisual(p, items) {
        document.getElementById('pvTicketOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'pvTicketOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4';

        const fecha = new Date().toLocaleDateString('es-VE');
        const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

        const filas = items.map(pr => {
            const partes = [];
            if (pr.cantCj) partes.push(`${pr.cantCj} Caja(s)`);
            if (pr.cantPaq) partes.push(`${pr.cantPaq} Paq`);
            if (pr.cantUnd) partes.push(`${pr.cantUnd} Und`);
            return `<tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:6px 4px;text-align:center;font-size:16px;">☐</td>
                <td style="padding:6px 4px;font-size:12px;">
                    <div style="font-weight:700;color:#1f2937;">${pr.presentacion}${pr.parcial ? ' <span style="font-size:9px;color:#d97706;">(parcial)</span>' : ''}</div>
                    <div style="font-size:10px;color:#6b7280;">${pr.marca || ''}</div>
                </td>
                <td style="padding:6px 4px;text-align:right;font-size:12px;font-weight:700;color:#111827;">${partes.join('<br>') || '—'}</td>
            </tr>`;
        }).join('');

        ov.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="overflow-y-auto flex-1">
                    <div id="pvTicketCapturable" style="background:#fff;padding:16px;font-family:system-ui,sans-serif;">
                        <div style="text-align:center;border-bottom:2px solid #334155;padding-bottom:8px;margin-bottom:10px;">
                            <div style="font-size:16px;font-weight:800;color:#1e293b;">DISTRIBUIDORA CASTILLO YAÑEZ</div>
                            <div style="font-size:13px;font-weight:700;color:#334155;">ORDEN DE CARGA / ENTREGA</div>
                            <div style="font-size:10px;color:#94a3b8;">Documento interno · no es factura</div>
                        </div>
                        <div style="font-size:11px;color:#374151;margin-bottom:8px;line-height:1.5;">
                            <div><strong>Cliente:</strong> ${p.clienteNombre || '—'}</div>
                            <div><strong>Ruta:</strong> ${p.ruta || p.zona || '—'}</div>
                            <div><strong>Vendedor:</strong> ${p.vendedorNombre || '—'}</div>
                            <div><strong>Fecha:</strong> ${fecha} ${hora}</div>
                        </div>
                        <table style="width:100%;border-collapse:collapse;border-top:1px solid #cbd5e1;">
                            <thead>
                                <tr style="background:#f1f5f9;">
                                    <th style="padding:4px;font-size:9px;color:#64748b;text-align:center;width:28px;">✓</th>
                                    <th style="padding:4px;font-size:9px;color:#64748b;text-align:left;">Producto</th>
                                    <th style="padding:4px;font-size:9px;color:#64748b;text-align:right;">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody>${filas || '<tr><td colspan="3" style="padding:8px;text-align:center;color:#9ca3af;font-size:11px;">Sin productos disponibles</td></tr>'}</tbody>
                        </table>
                        <div style="margin-top:12px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:10px;color:#6b7280;">
                            <div>Cargado por: ______________________</div>
                            <div style="margin-top:6px;">Recibido por (cliente): ______________________</div>
                            <div style="margin-top:6px;">Firma: ______________________</div>
                        </div>
                        <div style="margin-top:8px;font-size:9px;color:#94a3b8;text-align:center;">
                            Solo incluye productos disponibles. Es el respaldo de la carga y la entrega.
                        </div>
                    </div>
                </div>
                <div class="p-3 border-t shrink-0 flex gap-2">
                    <button id="pvTicketImg" class="flex-1 py-2.5 bg-slate-700 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition">📤 Compartir / Imprimir</button>
                    <button id="pvTicketCerrar" class="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('pvTicketCerrar').addEventListener('click', () => {
            ov.remove();
            // Refrescar el detalle para reflejar el nuevo estado y "ticket generado"
            document.getElementById('pvLPDetOverlay')?.remove();
        });
        document.getElementById('pvTicketImg').addEventListener('click', () =>
            _pvCapturarCompartir(document.getElementById('pvTicketCapturable'), `Ticket_${(p.clienteNombre || 'pedido').replace(/[\s/]/g, '_')}`));
    }

        function generarTicketGalpon(p) {
        document.getElementById('pvTicketOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'pvTicketOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4';

        const fecha = new Date().toLocaleDateString('es-VE');
        const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

        // Filas de productos con casilla de "cargado"
        const filas = (p.productos || []).map((pr, i) => {
            const partes = [];
            if (pr.cantCj) partes.push(`${pr.cantCj} Caja(s)`);
            if (pr.cantPaq) partes.push(`${pr.cantPaq} Paq`);
            if (pr.cantUnd) partes.push(`${pr.cantUnd} Und`);
            return `<tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:6px 4px;text-align:center;font-size:16px;">☐</td>
                <td style="padding:6px 4px;font-size:12px;">
                    <div style="font-weight:700;color:#1f2937;">${pr.presentacion}</div>
                    <div style="font-size:10px;color:#6b7280;">${pr.marca || ''}</div>
                </td>
                <td style="padding:6px 4px;text-align:right;font-size:12px;font-weight:700;color:#111827;">${partes.join('<br>') || '—'}</td>
            </tr>`;
        }).join('');

        ov.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="overflow-y-auto flex-1">
                    <div id="pvTicketCapturable" style="background:#fff;padding:16px;font-family:system-ui,sans-serif;">
                        <div style="text-align:center;border-bottom:2px solid #334155;padding-bottom:8px;margin-bottom:10px;">
                            <div style="font-size:16px;font-weight:800;color:#1e293b;">DISTRIBUIDORA CASTILLO YAÑEZ</div>
                            <div style="font-size:13px;font-weight:700;color:#334155;">ORDEN DE CARGA — GALPÓN</div>
                            <div style="font-size:10px;color:#94a3b8;">Documento interno · no es factura</div>
                        </div>
                        <div style="font-size:11px;color:#374151;margin-bottom:8px;line-height:1.5;">
                            <div><strong>Cliente:</strong> ${p.clienteNombre || '—'}</div>
                            <div><strong>Zona:</strong> ${p.zona || '—'}</div>
                            <div><strong>Vendedor/Ruta:</strong> ${p.vendedorNombre || '—'}</div>
                            <div><strong>Fecha:</strong> ${fecha} ${hora}</div>
                        </div>
                        <table style="width:100%;border-collapse:collapse;border-top:1px solid #cbd5e1;">
                            <thead>
                                <tr style="background:#f1f5f9;">
                                    <th style="padding:4px;font-size:9px;color:#64748b;text-align:center;width:28px;">✓</th>
                                    <th style="padding:4px;font-size:9px;color:#64748b;text-align:left;">Producto</th>
                                    <th style="padding:4px;font-size:9px;color:#64748b;text-align:right;">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody>${filas || '<tr><td colspan="3" style="padding:8px;text-align:center;color:#9ca3af;font-size:11px;">Sin productos</td></tr>'}</tbody>
                        </table>
                        <div style="margin-top:12px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:10px;color:#6b7280;">
                            <div>Cargado por: ______________________</div>
                            <div style="margin-top:6px;">Firma: ______________________</div>
                        </div>
                        <div style="margin-top:8px;font-size:9px;color:#94a3b8;text-align:center;">
                            Marque cada casilla al cargar el producto. Este ticket es el respaldo de la carga.
                        </div>
                    </div>
                </div>
                <div class="p-3 border-t shrink-0 flex gap-2">
                    <button id="pvTicketImg" class="flex-1 py-2.5 bg-slate-700 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition">📤 Compartir / Imprimir</button>
                    <button id="pvTicketCerrar" class="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('pvTicketCerrar').addEventListener('click', () => ov.remove());
        document.getElementById('pvTicketImg').addEventListener('click', () =>
            _pvCapturarCompartir(document.getElementById('pvTicketCapturable'), `Carga_${(p.clienteNombre || 'pedido').replace(/[\s/]/g, '_')}`));
    }

    // Captura un elemento como PNG y lo comparte (o descarga como fallback)
    async function _pvCapturarCompartir(elemento, nombreArchivo) {
        if (typeof html2canvas === 'undefined') {
            if (_showModal) _showModal('Aviso', 'No se pudo generar la imagen en este dispositivo.');
            return;
        }
        try {
            const canvas = await html2canvas(elemento, { scale: 2, backgroundColor: '#ffffff' });
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const file = new File([blob], `${nombreArchivo}.png`, { type: 'image/png' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: nombreArchivo }); return; } catch (e) {}
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${nombreArchivo}.png`;
                a.click();
                URL.revokeObjectURL(url);
            }, 'image/png');
        } catch (e) {
            console.error('Error al capturar:', e);
            if (_showModal) _showModal('Error', 'No se pudo generar la imagen.');
        }
    }


    // ═══════════════════════════════════════════════════════════
    // EDITAR / AUMENTAR PEDIDO EN DESPACHO
    // Permite a despacho ajustar cantidades y agregar productos (excedente).
    // Guarda el pedido ORIGINAL la primera vez (para comparar pedido vs entregado).
    // Escribe solo en preventa_pedidos.
    // ═══════════════════════════════════════════════════════════
    let _pvEditProductos = {}; // estado temporal de edición

    async function editarPedidoDespacho(p) {
        // Asegurar catálogo cargado (si entró directo a la bandeja)
        if (!_pvProductos.length) {
            try {
                const snap = await _getDocs(_collection(_db, pathProductos()));
                _pvProductos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) { console.error('Error cargando catálogo:', e); }
        }

        // Cargar los productos actuales del pedido al estado de edición
        _pvEditProductos = {};
        (p.productos || []).forEach(pr => {
            _pvEditProductos[pr.id] = {
                id: pr.id, presentacion: pr.presentacion, marca: pr.marca || null,
                precios: pr.precios || {},
                unidadesPorCaja: (_pvProductos.find(x => x.id === pr.id)?.unidadesPorCaja) || 1,
                unidadesPorPaquete: (_pvProductos.find(x => x.id === pr.id)?.unidadesPorPaquete) || 1,
                cantCj: pr.cantCj || 0, cantPaq: pr.cantPaq || 0, cantUnd: pr.cantUnd || 0
            };
        });

        document.getElementById('pvEditOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'pvEditOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="bg-amber-500 text-white px-4 py-3 shrink-0">
                    <div class="font-bold text-base">✏️ Editar pedido</div>
                    <div class="text-xs opacity-90">${p.clienteNombre || ''} · ${p.vendedorNombre || ''}</div>
                </div>
                <div class="p-3 shrink-0 border-b">
                    <input type="text" id="pvEditBuscarProd" placeholder="Buscar producto para agregar..." autocomplete="off"
                           class="w-full text-sm border border-amber-300 rounded p-2 outline-none">
                    <div id="pvEditProdDrop" class="hidden bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto mt-1"></div>
                </div>
                <div id="pvEditLista" class="overflow-y-auto p-3 flex-1"></div>
                <div class="p-3 border-t shrink-0">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-bold text-gray-600">Nuevo total:</span>
                        <span id="pvEditTotal" class="text-xl font-black text-amber-600">$0.00</span>
                    </div>
                    <div class="flex gap-2">
                        <button id="pvEditGuardar" class="flex-1 py-2.5 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition">Guardar cambios</button>
                        <button id="pvEditCancelar" class="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm">Cancelar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('pvEditCancelar').addEventListener('click', () => ov.remove());

        renderEditLista();

        // Buscador de productos para agregar
        const buscar = document.getElementById('pvEditBuscarProd');
        let deb = null;
        buscar.addEventListener('input', () => {
            clearTimeout(deb);
            deb = setTimeout(() => {
                const term = buscar.value.toLowerCase().trim();
                const drop = document.getElementById('pvEditProdDrop');
                if (!term) { drop.classList.add('hidden'); return; }
                const found = _pvProductos.filter(pr =>
                    (pr.presentacion || '').toLowerCase().includes(term) ||
                    (pr.marca || '').toLowerCase().includes(term)).slice(0, 20);
                drop.innerHTML = found.length
                    ? found.map(pr => `<div class="pv-edit-add px-2 py-1.5 text-xs hover:bg-amber-50 cursor-pointer border-b border-gray-100" data-id="${pr.id}">
                        <span class="font-semibold text-gray-800">${pr.presentacion}</span> <span class="text-gray-400">${pr.marca || ''}</span></div>`).join('')
                    : '<div class="px-2 py-2 text-xs text-gray-400">Sin coincidencias</div>';
                drop.classList.remove('hidden');
                drop.querySelectorAll('.pv-edit-add').forEach(el => el.addEventListener('click', () => {
                    agregarProdEdit(el.dataset.id);
                    buscar.value = ''; drop.classList.add('hidden');
                }));
            }, 200);
        });

        document.getElementById('pvEditGuardar').addEventListener('click', () => guardarEdicionPedido(p));
    }

    function agregarProdEdit(pid) {
        if (_pvEditProductos[pid]) return; // ya está
        const prod = _pvProductos.find(x => x.id === pid);
        if (!prod) return;
        _pvEditProductos[pid] = {
            id: prod.id, presentacion: prod.presentacion, marca: prod.marca || null,
            precios: prod.precios || { und: prod.precioPorUnidad || 0 },
            unidadesPorCaja: prod.unidadesPorCaja || 1, unidadesPorPaquete: prod.unidadesPorPaquete || 1,
            cantCj: 0, cantPaq: 0, cantUnd: 0
        };
        renderEditLista();
    }

    function renderEditLista() {
        const cont = document.getElementById('pvEditLista');
        if (!cont) return;
        const items = Object.values(_pvEditProductos);
        if (!items.length) {
            cont.innerHTML = '<p class="text-center text-gray-400 text-xs py-6">Busca productos arriba para agregarlos.</p>';
            actualizarTotalEdit();
            return;
        }
        cont.innerHTML = items.map(pr => {
            const prod = _pvProductos.find(x => x.id === pr.id) || {};
            const vPor = prod.ventaPor || { cj: pr.cantCj > 0, paq: pr.cantPaq > 0, und: true };
            const campo = (tipo, label, val) => `
                <div class="flex items-center gap-1">
                    <input type="number" min="0" value="${val || 0}" data-pid="${pr.id}" data-tipo="${tipo}"
                           class="pv-edit-inp w-12 p-1 text-center border rounded text-xs font-bold">
                    <span class="text-[9px] text-gray-400">${label}</span>
                </div>`;
            return `<div class="border border-gray-200 rounded-lg p-2 mb-1.5">
                <div class="flex items-center justify-between mb-1">
                    <div class="text-xs font-bold text-gray-700 truncate">${pr.presentacion}</div>
                    <button class="pv-edit-del text-[10px] text-red-400 hover:underline shrink-0" data-id="${pr.id}">quitar</button>
                </div>
                <div class="flex gap-2">
                    ${vPor.cj ? campo('cantCj', 'Cj', pr.cantCj) : ''}
                    ${vPor.paq ? campo('cantPaq', 'Paq', pr.cantPaq) : ''}
                    ${campo('cantUnd', 'Und', pr.cantUnd)}
                </div>
            </div>`;
        }).join('');

        cont.querySelectorAll('.pv-edit-inp').forEach(inp => inp.addEventListener('input', () => {
            const pid = inp.dataset.pid, tipo = inp.dataset.tipo;
            if (_pvEditProductos[pid]) _pvEditProductos[pid][tipo] = parseInt(inp.value, 10) || 0;
            actualizarTotalEdit();
        }));
        cont.querySelectorAll('.pv-edit-del').forEach(btn => btn.addEventListener('click', () => {
            delete _pvEditProductos[btn.dataset.id];
            renderEditLista();
        }));
        actualizarTotalEdit();
    }

    function calcularTotalEdit() {
        return Object.values(_pvEditProductos).reduce((s, p) => {
            const pr = p.precios || {};
            return s + (pr.cj || 0) * (p.cantCj || 0) + (pr.paq || 0) * (p.cantPaq || 0) + (pr.und || 0) * (p.cantUnd || 0);
        }, 0);
    }
    function actualizarTotalEdit() {
        const el = document.getElementById('pvEditTotal');
        if (el) el.textContent = _pvFmtUSD(calcularTotalEdit());
    }

    async function guardarEdicionPedido(pedidoOriginal) {
        // Filtrar productos con cantidad 0
        const productos = Object.values(_pvEditProductos)
            .filter(p => (p.cantCj || 0) > 0 || (p.cantPaq || 0) > 0 || (p.cantUnd || 0) > 0)
            .map(p => ({
                id: p.id, presentacion: p.presentacion, marca: p.marca || null,
                cantCj: p.cantCj || 0, cantPaq: p.cantPaq || 0, cantUnd: p.cantUnd || 0,
                precios: p.precios,
                subtotal: (p.precios?.cj || 0) * (p.cantCj || 0) + (p.precios?.paq || 0) * (p.cantPaq || 0) + (p.precios?.und || 0) * (p.cantUnd || 0)
            }));

        if (!productos.length) {
            if (_showModal) _showModal('Aviso', 'El pedido debe tener al menos un producto.');
            return;
        }
        const total = productos.reduce((s, p) => s + p.subtotal, 0);

        const btn = document.getElementById('pvEditGuardar');
        btn.disabled = true; btn.textContent = 'Guardando...';

        // Guardar el pedido ORIGINAL la primera vez que se edita
        const cambios = {
            productos: productos,
            total: total,
            editadoEnDespacho: true,
            fechaEdicion: new Date().toISOString(),
            editadoPor: _userId
        };
        if (!pedidoOriginal.pedidoOriginal) {
            cambios.pedidoOriginal = {
                productos: pedidoOriginal.productos || [],
                total: pedidoOriginal.total || 0
            };
        }

        try {
            await _setDoc(_doc(_db, pathPedidos(), pedidoOriginal.id), cambios, { merge: true });
            if (window.invalidarComprometidoCache) window.invalidarComprometidoCache();
            document.getElementById('pvEditOverlay')?.remove();
            document.getElementById('pvPedDetOverlay')?.remove();
            // onSnapshot refresca la bandeja
        } catch (e) {
            console.error('Error guardando edición:', e);
            if (_showModal) _showModal('Error', 'No se pudo guardar la edición.');
            btn.disabled = false; btn.textContent = 'Guardar cambios';
        }
    }


    // ═══════════════════════════════════════════════════════════
    // INVENTARIO POR RUTA — control lógico del stock partido por ruta
    // Colección aislada preventa_inventario_ruta. NO toca el inventario
    // real del sistema tradicional (users/{userId}/inventario).
    // ═══════════════════════════════════════════════════════════
    let _pvInvRutaActual = {};  // {productoId: cantCajas} de la ruta elegida
    let _pvInvRutaVendedor = null;

    async function showInventarioRuta() {
        if (window.userRole !== 'admin') return;

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Inventario por Ruta</h2>
                        <button id="pvInvBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>
                    <p class="text-[11px] text-gray-500 mb-3">Reparte el stock del galpón entre las rutas. Es un control lógico independiente; no afecta el inventario que usan los vendedores en la calle.</p>

                    <div id="pvInvLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando...
                    </div>

                    <div id="pvInvForm" class="hidden">
                        <div class="mb-2">
                            <label class="text-[10px] font-bold text-blue-700 uppercase">Ruta / Vendedor</label>
                            <select id="pvInvVendedor" class="w-full text-sm border border-blue-300 rounded p-2 bg-white outline-none">
                                <option value="">— Elige la ruta —</option>
                            </select>
                        </div>
                        <div class="mb-2">
                            <input type="text" id="pvInvBuscar" placeholder="Buscar producto..." class="w-full text-xs border border-blue-300 rounded p-1.5 outline-none">
                        </div>
                        <div id="pvInvProductos" class="border border-gray-200 rounded max-h-[46vh] overflow-y-auto">
                            <p class="text-center text-gray-400 text-xs py-6">Elige una ruta para ver/asignar su stock.</p>
                        </div>
                        <div class="sticky bottom-0 bg-white border-t pt-2 mt-2">
                            <button id="pvInvGuardar" class="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition disabled:opacity-40" disabled>Guardar inventario de la ruta</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('pvInvBack').addEventListener('click', () => window.showPreventaMenu());

        // Cargar productos y vendedores
        try {
            const [prodSnap, usersSnap] = await Promise.all([
                _pvProductos.length ? Promise.resolve(null) : _getDocs(_collection(_db, pathProductos())),
                _pvUsuarios.length ? Promise.resolve(null) : _getDocs(_collection(_db, 'users'))
            ]);
            if (prodSnap) _pvProductos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (usersSnap) _pvUsuarios = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Error cargando inv ruta:', e);
            document.getElementById('pvInvLoading').innerHTML = '<span class="text-red-500">Error al cargar.</span>';
            return;
        }

        document.getElementById('pvInvLoading').classList.add('hidden');
        document.getElementById('pvInvForm').classList.remove('hidden');

        const vendedores = _pvUsuarios.filter(u => u.role === 'user');
        const selV = document.getElementById('pvInvVendedor');
        selV.innerHTML = '<option value="">— Elige la ruta —</option>' +
            vendedores.map(u => `<option value="${u.id}">${_pvNombreVendedor(u)}${u.zonaPreventa ? ' · ' + u.zonaPreventa : ''}</option>`).join('');
        selV.addEventListener('change', () => cargarInvDeRuta(selV.value));

        document.getElementById('pvInvBuscar').addEventListener('input', renderInvProductos);
        document.getElementById('pvInvGuardar').addEventListener('click', guardarInvRuta);
    }

    async function cargarInvDeRuta(vendedorId) {
        _pvInvRutaActual = {};
        _pvInvRutaVendedor = _pvUsuarios.find(u => u.id === vendedorId) || null;
        const guardar = document.getElementById('pvInvGuardar');
        if (!vendedorId) {
            document.getElementById('pvInvProductos').innerHTML = '<p class="text-center text-gray-400 text-xs py-6">Elige una ruta para ver/asignar su stock.</p>';
            guardar.disabled = true;
            return;
        }
        // Leer el doc de esa ruta si existe
        try {
            const ref = _doc(_db, pathInvRuta(), vendedorId);
            const snap = await _getDoc(ref);
            if (snap.exists()) {
                const data = snap.data();
                _pvInvRutaActual = data.productos || {};
            }
        } catch (e) { console.warn('Sin inventario previo para esta ruta:', e); }
        guardar.disabled = false;
        renderInvProductos();
    }

    function renderInvProductos() {
        const cont = document.getElementById('pvInvProductos');
        if (!cont || !_pvInvRutaVendedor) return;
        const term = (document.getElementById('pvInvBuscar')?.value || '').toLowerCase().trim();
        let lista = _pvProductos.slice();
        if (term) lista = lista.filter(p => (p.presentacion || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term));
        lista.sort((a, b) => (a.segmento || '').localeCompare(b.segmento || '') || (a.presentacion || '').localeCompare(b.presentacion || ''));

        if (!lista.length) { cont.innerHTML = '<p class="text-center text-gray-400 text-xs py-6">Sin productos.</p>'; return; }

        let html = '';
        let lastSeg = null;
        lista.forEach(prod => {
            const seg = prod.segmento || 'Sin segmento';
            if (seg !== lastSeg) { lastSeg = seg; html += `<div class="bg-gray-100 px-2 py-1 font-bold text-[11px] text-gray-600 sticky top-0">${seg}</div>`; }
            const asignado = _pvInvRutaActual[prod.id]?.cantCajas || 0;
            html += `<div class="flex items-center gap-2 py-1 px-2 border-b border-gray-50">
                <input type="number" min="0" value="${asignado}" data-pid="${prod.id}"
                       class="pv-inv-inp w-16 p-1 text-center border rounded text-sm font-bold focus:ring-2 focus:ring-blue-400">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-medium text-gray-700 truncate">${prod.presentacion}</div>
                    <div class="text-[10px] text-gray-400">${prod.marca || 'S/M'} · cajas asignadas</div>
                </div>
            </div>`;
        });
        cont.innerHTML = html;
        cont.querySelectorAll('.pv-inv-inp').forEach(inp => inp.addEventListener('input', () => {
            const pid = inp.dataset.pid;
            const val = parseInt(inp.value, 10) || 0;
            if (val > 0) _pvInvRutaActual[pid] = { cantCajas: val };
            else delete _pvInvRutaActual[pid];
        }));
    }

    async function guardarInvRuta() {
        if (!_pvInvRutaVendedor) return;
        const btn = document.getElementById('pvInvGuardar');
        btn.disabled = true; btn.textContent = 'Guardando...';
        const v = _pvInvRutaVendedor;
        try {
            await _setDoc(_doc(_db, pathInvRuta(), v.id), {
                vendedorId: v.id,
                vendedorNombre: _pvNombreVendedor(v),
                zona: v.zonaPreventa || '',
                productos: _pvInvRutaActual,
                actualizado: new Date().toISOString(),
                actualizadoPor: _userId
            }, { merge: true });
            if (_showModal) _showModal('Inventario guardado', `El inventario de la ruta de <strong>${_pvNombreVendedor(v)}</strong> se guardó correctamente.`);
            btn.textContent = 'Guardar inventario de la ruta';
            btn.disabled = false;
        } catch (e) {
            console.error('Error guardando inv ruta:', e);
            if (_showModal) _showModal('Error', 'No se pudo guardar el inventario.');
            btn.textContent = 'Guardar inventario de la ruta';
            btn.disabled = false;
        }
    }


    // ═══════════════════════════════════════════════════════════
    // REPORTES DE PREVENTA — analítica sobre preventa_pedidos
    // Solo lectura. No toca el sistema tradicional.
    // ═══════════════════════════════════════════════════════════
    let _pvRepPedidos = [];
    let _pvRepRango = 'hoy';

    async function showReportesPreventa() {
        if (window.userRole !== 'admin') return;
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Reportes de Pre-Venta</h2>
                        <button id="pvRepBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>
                    <div class="flex gap-1.5 mb-3">
                        <select id="pvRepRango" class="flex-1 text-xs border border-slate-300 rounded p-1.5 bg-white outline-none">
                            <option value="hoy">Hoy</option>
                            <option value="semana">Últimos 7 días</option>
                            <option value="mes">Últimos 30 días</option>
                            <option value="anio">Este año</option>
                            <option value="todos">Todos</option>
                        </select>
                        <button id="pvRepExcel" class="text-xs bg-green-600 text-white rounded px-3 py-1.5 font-bold hover:bg-green-700 transition">📊 Excel</button>
                    </div>
                    <div id="pvRepLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando pedidos...
                    </div>
                    <div id="pvRepContenido" class="hidden space-y-3"></div>
                </div>
            </div>`;
        document.getElementById('pvRepBack').addEventListener('click', () => window.showPreventaMenu());
        document.getElementById('pvRepRango').addEventListener('change', (e) => { _pvRepRango = e.target.value; renderReportes(); });
        document.getElementById('pvRepExcel').addEventListener('click', exportarReporteExcel);

        try {
            const snap = await _getDocs(_collection(_db, pathPedidos()));
            _pvRepPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Error cargando reportes:', e);
            document.getElementById('pvRepLoading').innerHTML = '<span class="text-red-500">Error al cargar.</span>';
            return;
        }
        document.getElementById('pvRepLoading').classList.add('hidden');
        document.getElementById('pvRepContenido').classList.remove('hidden');
        renderReportes();
    }

    function _pvFiltrarPorRango(pedidos) {
        if (_pvRepRango === 'todos') return pedidos;
        const ahora = new Date();
        let desde = new Date();
        if (_pvRepRango === 'hoy') desde.setHours(0, 0, 0, 0);
        else if (_pvRepRango === 'semana') desde.setDate(ahora.getDate() - 7);
        else if (_pvRepRango === 'mes') desde.setDate(ahora.getDate() - 30);
        else if (_pvRepRango === 'anio') { desde = new Date(ahora.getFullYear(), 0, 1); }
        return pedidos.filter(p => {
            if (!p.fechaCreacion) return false;
            return new Date(p.fechaCreacion) >= desde;
        });
    }

    function renderReportes() {
        const cont = document.getElementById('pvRepContenido');
        if (!cont) return;
        const pedidos = _pvFiltrarPorRango(_pvRepPedidos);
        const activos = pedidos.filter(p => p.estado !== 'anulado');

        if (!pedidos.length) {
            cont.innerHTML = '<p class="text-center text-gray-400 py-8 text-sm">No hay pedidos en este período.</p>';
            return;
        }

        // 1. Resumen general
        const totalMonto = activos.reduce((s, p) => s + (p.total || 0), 0);
        const ticketProm = activos.length ? totalMonto / activos.length : 0;
        const porEstado = {};
        PV_ESTADOS.forEach(e => porEstado[e.key] = pedidos.filter(p => (p.estado || 'pendiente') === e.key).length);

        // 2. Por vendedor
        const porVend = {};
        activos.forEach(p => {
            const k = p.vendedorNombre || '—';
            if (!porVend[k]) porVend[k] = { pedidos: 0, monto: 0, entregados: 0 };
            porVend[k].pedidos++;
            porVend[k].monto += p.total || 0;
            if (p.estado === 'entregado') porVend[k].entregados++;
        });

        // 3. Por zona
        const porZona = {};
        activos.forEach(p => {
            const k = p.zona || '—';
            if (!porZona[k]) porZona[k] = { pedidos: 0, monto: 0 };
            porZona[k].pedidos++;
            porZona[k].monto += p.total || 0;
        });

        // 4. Productos más pedidos (por unidades totales estimadas y monto)
        const porProd = {};
        activos.forEach(p => (p.productos || []).forEach(pr => {
            if (!porProd[pr.presentacion]) porProd[pr.presentacion] = { cajas: 0, monto: 0 };
            porProd[pr.presentacion].cajas += (pr.cantCj || 0);
            porProd[pr.presentacion].monto += (pr.subtotal || 0);
        }));
        const topProd = Object.entries(porProd).sort((a, b) => b[1].monto - a[1].monto).slice(0, 10);

        // 5. Aumento en despacho
        const editados = activos.filter(p => p.editadoEnDespacho && p.pedidoOriginal);
        const montoOriginal = editados.reduce((s, p) => s + (p.pedidoOriginal.total || 0), 0);
        const montoFinal = editados.reduce((s, p) => s + (p.total || 0), 0);
        const aumento = montoFinal - montoOriginal;

        const card = (titulo, contenido) => `
            <div class="border border-gray-200 rounded-lg p-3">
                <p class="text-[10px] font-bold text-slate-500 uppercase mb-2">${titulo}</p>
                ${contenido}
            </div>`;

        const filaKV = (k, v, extra = '') => `<div class="flex justify-between items-center py-1 border-b border-gray-50 text-xs">
            <span class="text-gray-600 truncate">${k}</span><span class="font-bold text-gray-800 shrink-0">${v}${extra}</span></div>`;

        let html = '';

        // Resumen
        html += card('Resumen general', `
            <div class="grid grid-cols-2 gap-2 mb-2">
                <div class="bg-slate-50 rounded p-2 text-center"><div class="text-lg font-black text-slate-700">${activos.length}</div><div class="text-[9px] text-gray-500 uppercase">Pedidos</div></div>
                <div class="bg-indigo-50 rounded p-2 text-center"><div class="text-lg font-black text-indigo-700">${_pvFmtUSD(totalMonto)}</div><div class="text-[9px] text-gray-500 uppercase">Monto total</div></div>
            </div>
            <div class="flex flex-wrap gap-1 mb-2">
                ${PV_ESTADOS.map(e => porEstado[e.key] ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-${e.color}-100 text-${e.color}-700 font-bold">${e.icon} ${porEstado[e.key]} ${e.label}</span>` : '').join('')}
            </div>
            ${filaKV('Ticket promedio', _pvFmtUSD(ticketProm))}`);

        // Por vendedor
        const vendRows = Object.entries(porVend).sort((a, b) => b[1].monto - a[1].monto)
            .map(([k, v]) => filaKV(`${k} <span class="text-[9px] text-gray-400">(${v.entregados}/${v.pedidos} entreg.)</span>`, _pvFmtUSD(v.monto))).join('');
        html += card('Por vendedor / ruta', vendRows || '<p class="text-xs text-gray-400">Sin datos</p>');

        // Por zona
        const zonaRows = Object.entries(porZona).sort((a, b) => b[1].monto - a[1].monto)
            .map(([k, v]) => filaKV(`${k} <span class="text-[9px] text-gray-400">(${v.pedidos})</span>`, _pvFmtUSD(v.monto))).join('');
        html += card('Por ruta', zonaRows || '<p class="text-xs text-gray-400">Sin datos</p>');

        // Top productos
        const prodRows = topProd.map(([k, v], i) => filaKV(`${i + 1}. ${k}`, _pvFmtUSD(v.monto))).join('');
        html += card('Productos más pedidos', prodRows || '<p class="text-xs text-gray-400">Sin datos</p>');

        // Aumento en despacho
        if (editados.length) {
            html += card('Aumento en despacho', `
                ${filaKV('Pedidos editados', editados.length)}
                ${filaKV('Monto original', _pvFmtUSD(montoOriginal))}
                ${filaKV('Monto final', _pvFmtUSD(montoFinal))}
                <div class="flex justify-between items-center py-1 text-xs font-bold">
                    <span class="text-green-700">Aumento en despacho</span>
                    <span class="text-green-700">+${_pvFmtUSD(aumento)}</span>
                </div>`);
        }

        // Productos NO despachados por falta de stock (de los pedidos con ticket generado)
        const noDesp = {};
        pedidos.forEach(p => {
            (p.noDespachado || []).forEach(nd => {
                if (!nd.id) return;
                if (!noDesp[nd.id]) noDesp[nd.id] = { presentacion: nd.presentacion || nd.id, marca: nd.marca || '', unidades: 0, veces: 0 };
                noDesp[nd.id].unidades += (nd.unidadesFaltantes || 0);
                noDesp[nd.id].veces += 1;
            });
        });
        const noDespArr = Object.values(noDesp).filter(x => x.unidades > 0).sort((a, b) => b.unidades - a.unidades);
        if (noDespArr.length) {
            const rows = noDespArr.map(x => `
                <div class="flex justify-between items-center py-1 border-b border-gray-100">
                    <div class="min-w-0">
                        <div class="text-xs font-medium text-gray-700 truncate">${x.presentacion} <span class="text-gray-400">${x.marca}</span></div>
                        <div class="text-[10px] text-gray-400">solicitado sin stock ${x.veces} vez(ces)</div>
                    </div>
                    <span class="text-xs font-bold text-red-500 shrink-0">${x.unidades} und</span>
                </div>`).join('');
            html += card('⚠️ No despachado por falta de stock', `
                <p class="text-[10px] text-gray-400 mb-1">Productos que se pidieron pero no había stock al preparar. Útil para saber qué reponer.</p>
                ${rows}`);
        }

        cont.innerHTML = html;
    }

    function exportarReporteExcel() {
        const pedidos = _pvFiltrarPorRango(_pvRepPedidos);
        if (!pedidos.length) { if (_showModal) _showModal('Aviso', 'No hay pedidos para exportar en este período.'); return; }
        if (typeof XLSX === 'undefined') { if (_showModal) _showModal('Error', 'No se pudo generar el Excel.'); return; }

        const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-VE') + ' ' + new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
        const headers = ['#', 'Fecha', 'Cliente', 'Zona', 'Vendedor', 'Estado', 'Nº Productos', 'Total $', 'Editado', 'Total Original $'];
        const filas = pedidos.map((p, i) => [
            i + 1, fmtFecha(p.fechaCreacion), p.clienteNombre || '', p.zona || '', p.vendedorNombre || '',
            (pvEstadoInfo(p.estado || 'pendiente').label), (p.productos || []).length, (p.total || 0),
            p.editadoEnDespacho ? 'Sí' : 'No', p.pedidoOriginal ? (p.pedidoOriginal.total || 0) : ''
        ]);

        const hoy = new Date();
        const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        const rangoTxt = { hoy: 'Hoy', semana: 'Ultimos 7 dias', mes: 'Ultimos 30 dias', todos: 'Todos' }[_pvRepRango];

        const aoa = [
            ['DISTRIBUIDORA CASTILLO YAÑEZ - REPORTE DE PRE-VENTA'],
            [`Período: ${rangoTxt}`, `Fecha: ${hoy.toLocaleDateString('es-VE')}`, `Total: ${pedidos.length} pedidos`],
            [],
            headers,
            ...filas
        ];
        try {
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
            XLSX.writeFile(wb, `Reporte_Preventa_${fechaStr}.xlsx`);
        } catch (e) {
            console.error('Error Excel:', e);
            if (_showModal) _showModal('Error', 'No se pudo generar el Excel.');
        }
    }

})();





















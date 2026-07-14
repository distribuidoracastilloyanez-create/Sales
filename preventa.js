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
        document.getElementById('pvPedidosBtn').addEventListener('click', () => enConstruccion('Tomar Pedido'));
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

})();



// ═══════════════════════════════════════════════════════════════
// MÓDULO PRE-VENTA (nuevo sistema, en paralelo al tradicional)
// Por ahora SOLO para administradores. No afecta el sistema actual.
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _userId, _userRole, _appId, _mainContent;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _getDocs, _query, _where, _orderBy;

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
                        <button id="pvPedidosBtn" class="w-full ${bpad} bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 font-bold transition">📝 Tomar Pedido</button>
                        <button id="pvBandejaBtn" class="w-full ${bpad} bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700 font-bold transition">📦 Bandeja Despacho</button>
                        <button id="pvInventarioRutaBtn" class="w-full ${bpad} bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 font-bold transition">🚚 Inv. por Ruta</button>
                        <button id="pvVendedoresBtn" class="w-full ${bpad} bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 font-bold transition">👤 Vendedores/Zonas</button>
                        <button id="pvReportesBtn" class="w-full ${bpad} bg-slate-700 text-white rounded-lg shadow-md hover:bg-slate-800 font-bold transition">📊 Reportes</button>
                        <button id="pvConfigBtn" class="w-full ${bpad} bg-gray-600 text-white rounded-lg shadow-md hover:bg-gray-700 font-bold transition">⚙️ Configuración</button>
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
        document.getElementById('pvVendedoresBtn').addEventListener('click', () => enConstruccion('Vendedores/Zonas'));
        document.getElementById('pvReportesBtn').addEventListener('click', () => enConstruccion('Reportes'));
        document.getElementById('pvConfigBtn').addEventListener('click', () => enConstruccion('Configuración'));
    };

})();

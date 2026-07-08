// ============================================================
// Módulo: Administración (solo admin)
//   1. Inventario total consolidado (multi-vendedor)
//   2. Analista de datos de ventas
// ============================================================

(function () {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal;
    let _collection, _getDocs, _doc, _getDoc, _setDoc, _query, _where;

    // Se leen de forma perezosa (window.AppConfig ya está cargado al ejecutarse las funciones)
    const getPublicDataId = () => window.AppConfig.PUBLIC_DATA_ID;
    const getAdminConfigPath = () => `artifacts/${getPublicDataId()}/public/data/config/administracion`;

    let _usersCache      = [];
    let _masterCache     = {};   // id -> producto maestro
    let _sortFn          = null;
    let _admConfig       = { inventarioVendedores: [], analistaVendedores: [], analistaExcluidos: [] };

    // ─── INIT ───────────────────────────────────────────────
    window.initAdministracion = function (deps) {
        _db               = deps.db;
        _userId           = deps.userId;
        _userRole         = deps.userRole;
        _appId            = deps.appId;
        _mainContent      = deps.mainContent;
        _floatingControls = deps.floatingControls;
        _showMainMenu     = deps.showMainMenu;
        _showModal        = deps.showModal;
        _collection       = deps.collection;
        _getDocs          = deps.getDocs;
        _doc              = deps.doc;
        _getDoc           = deps.getDoc;
        _setDoc           = deps.setDoc;
        _query            = deps.query;
        _where            = deps.where;
        console.log('Módulo Administración inicializado.');
    };

    // ─── Utilidades ─────────────────────────────────────────
    async function getSortFn() {
        if (_sortFn) return _sortFn;
        if (window.getGlobalProductSortFunction) {
            _sortFn = await window.getGlobalProductSortFunction();
        } else {
            _sortFn = (a, b) => (a.presentacion || '').localeCompare(b.presentacion || '');
        }
        return _sortFn;
    }

    // Convierte unidades totales a "unidad mayor" (Cj / Paq) + resto Und
    function formatUnidadMayor(prod, unidades) {
        // La "unidad mayor" es la agrupación FÍSICA más grande del producto:
        // caja si existe (unidadesPorCaja > 1), si no paquete (unidadesPorPaquete > 1),
        // si no unidad. NO depende de ventaPor — un producto puede venderse por unidad
        // pero venir físicamente en cajas (ej: cerveza 1/4 en cajas de 36).
        const uCj = prod.unidadesPorCaja || 0;
        const uPaq = prod.unidadesPorPaquete || 0;

        if (uCj > 1) {
            const cajas = Math.floor(unidades / uCj);
            const resto = unidades % uCj;
            if (cajas === 0 && resto === 0) return '0 Cj';
            let s = '';
            if (cajas > 0) s += `${cajas} Cj`;
            if (resto > 0) s += (s ? ' + ' : '') + `${resto} Und`;
            return s || '0 Cj';
        }
        if (uPaq > 1) {
            const paqs = Math.floor(unidades / uPaq);
            const resto = unidades % uPaq;
            if (paqs === 0 && resto === 0) return '0 Paq';
            let s = '';
            if (paqs > 0) s += `${paqs} Paq`;
            if (resto > 0) s += (s ? ' + ' : '') + `${resto} Und`;
            return s || '0 Paq';
        }
        return `${unidades} Und`;
    }

    async function loadUsers() {
        if (_usersCache.length) return _usersCache;
        const snap = await _getDocs(_collection(_db, 'users'));
        _usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(u => (u.role || u.rol) !== 'admin' || true); // incluir todos; admin decide
        return _usersCache;
    }

    async function loadMaster() {
        if (Object.keys(_masterCache).length) return _masterCache;
        const snap = await _getDocs(_collection(_db, `artifacts/${getPublicDataId()}/public/data/productos`));
        _masterCache = {};
        snap.docs.forEach(d => { _masterCache[d.id] = { id: d.id, ...d.data() }; });
        return _masterCache;
    }

    async function loadConfig() {
        try {
            const snap = await _getDoc(_doc(_db, getAdminConfigPath()));
            if (snap.exists()) {
                const d = snap.data();
                _admConfig = {
                    inventarioVendedores: d.inventarioVendedores || [],
                    analistaVendedores: d.analistaVendedores || [],
                    analistaExcluidos: d.analistaExcluidos || []
                };
            }
        } catch (e) { console.warn('No se pudo cargar config administración:', e); }
        return _admConfig;
    }

    async function saveConfig() {
        try {
            await _setDoc(_doc(_db, getAdminConfigPath()), _admConfig, { merge: true });
        } catch (e) { console.error('Error guardando config administración:', e); }
    }

    function nombreVendedor(u) {
        return `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || u.id;
    }

    // ─── DATOS PARA ANALISTA DE CLIENTES ────────────────────
    let _clientesCache = null;   // [{id, nombreComercial, nombrePersonal, ...}]
    let _cxcCache      = null;   // [{name, amount, transactions[]}]
    let _adcSet        = null;   // Set de clienteId que poseen ADC
    let _indiceNombres = null;   // Map nombreNormalizado -> clienteId

    // Normaliza nombres para hacer match entre CXC (por nombre) y clientes (por id)
    function normNombre(s) {
        return (s || '')
            .toString()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // sin acentos
            .replace(/\u00A0/g, ' ')                            // NBSP → espacio
            .replace(/\s+/g, ' ')                               // espacios múltiples
            .trim()
            .toUpperCase();
    }

    async function loadClientes() {
        if (_clientesCache) return _clientesCache;
        try {
            const snap = await _getDocs(_collection(_db, `artifacts/${getPublicDataId()}/public/data/clientes`));
            _clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.warn('No se pudieron cargar clientes:', e); _clientesCache = []; }
        // Índice nombre normalizado -> id (comercial y personal)
        _indiceNombres = new Map();
        _clientesCache.forEach(cl => {
            const nc = normNombre(cl.nombreComercial);
            const np = normNombre(cl.nombrePersonal);
            if (nc) _indiceNombres.set(nc, cl.id);
            if (np && !_indiceNombres.has(np)) _indiceNombres.set(np, cl.id);
        });
        return _clientesCache;
    }

    async function loadCXC() {
        if (_cxcCache) return _cxcCache;
        try {
            const snap = await _getDoc(_doc(_db, `artifacts/${getPublicDataId()}/public/data/cxc`, 'list'));
            _cxcCache = snap.exists() ? (snap.data().clients || []) : [];
        } catch (e) { console.warn('No se pudo cargar CXC:', e); _cxcCache = []; }
        return _cxcCache;
    }

    async function loadADC() {
        if (_adcSet) return _adcSet;
        _adcSet = new Set();
        try {
            const archivosRef = _collection(_db, `artifacts/${getPublicDataId()}/public/data/archivos_clientes`);
            const q = _query(archivosRef, _where('categoria', '==', 'adc'));
            const snap = await _getDocs(q);
            snap.forEach(d => { const x = d.data(); if (x.clienteId) _adcSet.add(x.clienteId); });
        } catch (e) { console.warn('No se pudo cargar ADC:', e); }
        return _adcSet;
    }

    // Resuelve el clienteId a partir de un nombre CXC (o null si no hay match)
    function idDesdeNombreCXC(nombreCXC) {
        if (!_indiceNombres) return null;
        const n = normNombre(nombreCXC);
        if (_indiceNombres.has(n)) return _indiceNombres.get(n);
        // Búsqueda tolerante: por inclusión (nombre CXC contiene o está contenido)
        for (const [nom, id] of _indiceNombres.entries()) {
            if (nom.includes(n) || n.includes(nom)) return id;
        }
        return null;
    }

    // ─── CACHÉ DE CIERRES (localStorage) ────────────────────
    // Los cierres de días ANTERIORES a hoy son inmutables, así que se cachean
    // para no releerlos de Firebase. Las ventas del día actual siempre se leen frescas.
    const CACHE_PREFIX = 'adm_cierres_v1';

    function hoyISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Clave por vendedor + mes: adm_cierres_v1:{uid}:{YYYY-MM}
    function cacheKey(uid, mesISO) {
        return `${CACHE_PREFIX}:${uid}:${mesISO}`;
    }

    function leerCacheMes(uid, mesISO) {
        try {
            const raw = localStorage.getItem(cacheKey(uid, mesISO));
            if (!raw) return null;
            const obj = JSON.parse(raw);
            // El caché es válido solo para meses ya cerrados (anteriores al mes actual).
            // Para el mes actual, guardamos hasta qué día se cacheó para completar el resto.
            return obj;
        } catch (e) { return null; }
    }

    function guardarCacheMes(uid, mesISO, data) {
        try {
            localStorage.setItem(cacheKey(uid, mesISO), JSON.stringify(data));
        } catch (e) {
            // localStorage lleno o no disponible: limpiar caché viejo y reintentar una vez
            try {
                limpiarCacheAntiguo();
                localStorage.setItem(cacheKey(uid, mesISO), JSON.stringify(data));
            } catch (e2) { console.warn('No se pudo cachear (localStorage):', e2); }
        }
    }

    function limpiarCacheAntiguo() {
        // Elimina entradas de caché de más de 8 meses para no acumular
        try {
            const ahora = new Date();
            const limite = new Date(ahora.getFullYear(), ahora.getMonth() - 8, 1);
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.startsWith(CACHE_PREFIX)) {
                    const parts = k.split(':');
                    const mesISO = parts[2];
                    if (mesISO) {
                        const [y, m] = mesISO.split('-').map(Number);
                        if (new Date(y, m - 1, 1) < limite) localStorage.removeItem(k);
                    }
                }
            }
        } catch (e) {}
    }

    function limpiarTodoElCache() {
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
            }
        } catch (e) {}
    }

    // ─── FILTROS EN CASCADA (dependientes) ──────────────────
    // Puebla rubro/segmento/marca de forma que segmento solo muestre los del
    // rubro elegido, y marca solo las del rubro+segmento elegidos. Conserva la
    // selección actual si sigue siendo válida tras el cambio.
    function poblarFiltrosCascada(data, ids) {
        const { rubro: idR, segmento: idS, marca: idM } = ids;
        const elR = document.getElementById(idR);
        const elS = document.getElementById(idS);
        const elM = document.getElementById(idM);
        if (!elR || !elS || !elM) return;

        const selR = elR.value || '';
        let selS = elS.value || '';
        let selM = elM.value || '';

        // Rubros: siempre todos
        const rubros = [...new Set(data.map(p => p.rubro).filter(Boolean))].sort();

        // Segmentos: solo los del rubro elegido (o todos si no hay rubro)
        const baseSeg = selR ? data.filter(p => p.rubro === selR) : data;
        const segs = [...new Set(baseSeg.map(p => p.segmento).filter(Boolean))].sort();
        if (selS && !segs.includes(selS)) selS = ''; // la selección ya no aplica

        // Marcas: del rubro + segmento elegidos
        let baseMarca = baseSeg;
        if (selS) baseMarca = baseMarca.filter(p => p.segmento === selS);
        const marcas = [...new Set(baseMarca.map(p => p.marca).filter(Boolean))].sort();
        if (selM && !marcas.includes(selM)) selM = '';

        const fill = (el, arr, label, sel) => {
            el.innerHTML = `<option value="">${label}</option>` +
                arr.map(v => `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}</option>`).join('');
        };
        fill(elR, rubros, 'Rubro', selR);
        fill(elS, segs, 'Segmento', selS);
        fill(elM, marcas, 'Marca', selM);
    }

    // ─── MENÚ PRINCIPAL ─────────────────────────────────────
    window.showAdministracionMenu = async function () {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.classList.remove('hidden');

        _mainContent.innerHTML = `
            <div class="p-3 pt-8 w-full max-w-lg mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-5 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-5">
                        <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2">⚙️ Administración</h1>
                        <button id="admBack" class="px-3 py-1.5 bg-gray-400 text-white text-sm rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>

                    <div class="space-y-3">
                        <button id="admInvBtn" class="w-full text-left px-4 py-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center gap-3">
                            <span class="w-11 h-11 bg-blue-600 text-white rounded-lg flex items-center justify-center text-xl shrink-0">📦</span>
                            <span>
                                <span class="block font-bold text-gray-800">Inventario Total Consolidado</span>
                                <span class="block text-xs text-gray-500 mt-0.5">Suma inventarios de los vendedores que elijas</span>
                            </span>
                        </button>

                        <button id="admAnaBtn" class="w-full text-left px-4 py-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition flex items-center gap-3">
                            <span class="w-11 h-11 bg-green-600 text-white rounded-lg flex items-center justify-center text-xl shrink-0">📊</span>
                            <span>
                                <span class="block font-bold text-gray-800">Analista de Datos de Ventas</span>
                                <span class="block text-xs text-gray-500 mt-0.5">Productos con más salida por mes</span>
                            </span>
                        </button>

                        <button id="admInvAnaBtn" class="w-full text-left px-4 py-4 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition flex items-center gap-3">
                            <span class="w-11 h-11 bg-amber-600 text-white rounded-lg flex items-center justify-center text-xl shrink-0">🔍</span>
                            <span>
                                <span class="block font-bold text-gray-800">Analista de Inventario</span>
                                <span class="block text-xs text-gray-500 mt-0.5">Productos que se vendían y están agotados o bajos</span>
                            </span>
                        </button>

                        <button id="admCliBtn" class="w-full text-left px-4 py-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition flex items-center gap-3">
                            <span class="w-11 h-11 bg-purple-600 text-white rounded-lg flex items-center justify-center text-xl shrink-0">👥</span>
                            <span>
                                <span class="block font-bold text-gray-800">Analista de Clientes</span>
                                <span class="block text-xs text-gray-500 mt-0.5">Ranking por compra y calificación de pago (CXC)</span>
                            </span>
                        </button>
                    </div>
                </div>
            </div>`;

        document.getElementById('admBack').addEventListener('click', _showMainMenu);
        document.getElementById('admInvBtn').addEventListener('click', showInventarioConsolidado);
        document.getElementById('admAnaBtn').addEventListener('click', showAnalistaDatos);
        document.getElementById('admInvAnaBtn').addEventListener('click', showAnalistaInventario);
        document.getElementById('admCliBtn').addEventListener('click', showAnalistaClientes);

        // Precargar datos base
        await Promise.all([loadUsers(), loadMaster(), loadConfig(), getSortFn()]);
    };

    // ════════════════════════════════════════════════════════
    // 1. INVENTARIO TOTAL CONSOLIDADO
    // ════════════════════════════════════════════════════════
    let _invData = [];        // productos consolidados
    let _invPorVendedor = {}; // id -> { userId: unidades }

    async function showInventarioConsolidado() {
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-6 w-full max-w-3xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">📦 Inventario Consolidado</h2>
                        <button id="invBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>

                    <!-- Selección de vendedores -->
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-blue-800 uppercase tracking-wide">Vendedores a sumar (máx. 3)</span>
                            <button id="invVendConfig" class="text-xs text-blue-600 font-bold hover:underline">Configurar</button>
                        </div>
                        <div id="invVendList" class="flex flex-wrap gap-1.5"></div>
                    </div>

                    <!-- Filtros -->
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <select id="invFRubro" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-blue-400 outline-none"><option value="">Rubro</option></select>
                        <select id="invFSeg" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-blue-400 outline-none"><option value="">Segmento</option></select>
                        <select id="invFMarca" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-blue-400 outline-none"><option value="">Marca</option></select>
                    </div>
                    <div class="flex gap-2 mb-3">
                        <input type="text" id="invSearch" placeholder="Buscar producto..." class="flex-1 text-xs border border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-blue-400 outline-none">
                        <select id="invOrden" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-blue-400 outline-none max-w-[140px]">
                            <option value="inv">Orden inventario</option>
                            <option value="existDesc">Existencia ↓ (mayor)</option>
                            <option value="existAsc">Existencia ↑ (menor)</option>
                        </select>
                        <button id="invExport" class="text-xs bg-green-600 text-white rounded px-3 py-1.5 font-bold hover:bg-green-700 transition whitespace-nowrap flex items-center gap-1">⬇️ Excel</button>
                    </div>

                    <div id="invLoading" class="text-center py-10 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Selecciona vendedores para ver el inventario.
                    </div>
                    <div id="invTableWrap" class="hidden overflow-x-auto max-h-[55vh] overflow-y-auto rounded border border-gray-200"></div>
                    <div id="invResumen" class="hidden text-xs text-gray-500 mt-2 text-center"></div>
                </div>
            </div>`;

        document.getElementById('invBack').addEventListener('click', window.showAdministracionMenu);
        document.getElementById('invVendConfig').addEventListener('click', abrirSelectorVendedores);
        document.getElementById('invExport').addEventListener('click', exportarInventarioExcel);

        ['invFRubro','invFSeg'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => {
                poblarFiltrosCascada(_invData, { rubro: 'invFRubro', segmento: 'invFSeg', marca: 'invFMarca' });
                renderInvTable();
            }));
        ['invFMarca','invOrden'].forEach(id =>
            document.getElementById(id).addEventListener('change', renderInvTable));
        let deb = null;
        document.getElementById('invSearch').addEventListener('input', () => {
            clearTimeout(deb); deb = setTimeout(renderInvTable, 180);
        });

        renderVendChips();
        if (_admConfig.inventarioVendedores.length) {
            await cargarInventarioConsolidado();
        }
    }

    function renderVendChips() {
        const cont = document.getElementById('invVendList');
        if (!cont) return;
        const sel = _admConfig.inventarioVendedores;
        if (!sel.length) {
            cont.innerHTML = '<span class="text-xs text-gray-400 italic">Ninguno seleccionado — toca Configurar</span>';
            return;
        }
        cont.innerHTML = sel.map(uid => {
            const u = _usersCache.find(x => x.id === uid);
            return `<span class="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-medium">${u ? nombreVendedor(u) : uid}</span>`;
        }).join('');
    }

    function abrirSelectorVendedores() {
        const sel = new Set(_admConfig.inventarioVendedores);
        document.getElementById('admVendOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'admVendOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                <div class="bg-blue-600 text-white px-4 py-3 font-bold">Seleccionar vendedores (máx. 3)</div>
                <div class="p-3 max-h-[60vh] overflow-y-auto space-y-1">
                    ${_usersCache.map(u => `
                        <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-gray-100">
                            <input type="checkbox" class="vend-cb w-4 h-4" value="${u.id}" ${sel.has(u.id) ? 'checked' : ''}>
                            <span class="text-sm text-gray-800">${nombreVendedor(u)}</span>
                            <span class="text-[10px] text-gray-400 ml-auto">${u.email || ''}</span>
                        </label>`).join('')}
                </div>
                <div class="p-3 border-t flex gap-2">
                    <button id="vendCancel" class="flex-1 py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cancelar</button>
                    <button id="vendSave" class="flex-1 py-2 bg-blue-600 text-white rounded font-bold text-sm">Guardar</button>
                </div>
                <p id="vendMsg" class="text-center text-xs text-red-500 pb-2 h-4"></p>
            </div>`;
        document.body.appendChild(ov);

        ov.querySelectorAll('.vend-cb').forEach(cb => cb.addEventListener('change', () => {
            const checked = ov.querySelectorAll('.vend-cb:checked');
            if (checked.length > 3) { cb.checked = false; document.getElementById('vendMsg').textContent = 'Máximo 3 vendedores.'; }
            else document.getElementById('vendMsg').textContent = '';
        }));
        document.getElementById('vendCancel').addEventListener('click', () => ov.remove());
        document.getElementById('vendSave').addEventListener('click', async () => {
            const ids = Array.from(ov.querySelectorAll('.vend-cb:checked')).map(c => c.value);
            _admConfig.inventarioVendedores = ids;
            await saveConfig();
            ov.remove();
            renderVendChips();
            await cargarInventarioConsolidado();
        });
    }

    async function cargarInventarioConsolidado() {
        const loading = document.getElementById('invLoading');
        const wrap = document.getElementById('invTableWrap');
        if (loading) { loading.classList.remove('hidden'); loading.innerHTML = '<svg class="animate-spin h-6 w-6 mx-auto mb-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Consolidando inventarios...'; }
        if (wrap) wrap.classList.add('hidden');

        const vendedores = _admConfig.inventarioVendedores;
        _invPorVendedor = {};
        const totalUnidades = {}; // id -> unidades sumadas

        try {
            const snaps = await Promise.all(vendedores.map(uid =>
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/inventario`))
            ));
            snaps.forEach((snap, idx) => {
                const uid = vendedores[idx];
                snap.docs.forEach(d => {
                    const u = d.data();
                    const cant = u.cantidadUnidades || 0;
                    totalUnidades[d.id] = (totalUnidades[d.id] || 0) + cant;
                    if (!_invPorVendedor[d.id]) _invPorVendedor[d.id] = {};
                    _invPorVendedor[d.id][uid] = cant;
                });
            });

            // Combinar con maestro
            _invData = Object.keys(totalUnidades).map(id => {
                const m = _masterCache[id] || {};
                return { id, ...m, totalUnidades: totalUnidades[id] };
            }).filter(p => p.presentacion || p.marca);

            _invData.sort(_sortFn);
            poblarFiltrosInv();
            renderInvTable();
        } catch (e) {
            console.error('Error consolidando inventario:', e);
            if (loading) loading.textContent = 'Error al cargar los inventarios.';
        }
    }

    function poblarFiltrosInv() {
        poblarFiltrosCascada(_invData, { rubro: 'invFRubro', segmento: 'invFSeg', marca: 'invFMarca' });
    }

    function getInvFiltered() {
        const fR = document.getElementById('invFRubro')?.value || '';
        const fS = document.getElementById('invFSeg')?.value || '';
        const fM = document.getElementById('invFMarca')?.value || '';
        const term = (document.getElementById('invSearch')?.value || '').toLowerCase().trim();
        const orden = document.getElementById('invOrden')?.value || 'inv';

        let list = _invData.filter(p =>
            (!fR || p.rubro === fR) &&
            (!fS || p.segmento === fS) &&
            (!fM || p.marca === fM) &&
            (!term || (p.presentacion || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term))
        );

        if (orden === 'existDesc') list = [...list].sort((a, b) => b.totalUnidades - a.totalUnidades);
        else if (orden === 'existAsc') list = [...list].sort((a, b) => a.totalUnidades - b.totalUnidades);
        // 'inv' ya viene ordenado por _sortFn

        return list;
    }

    function renderInvTable() {
        const wrap = document.getElementById('invTableWrap');
        const loading = document.getElementById('invLoading');
        const resumen = document.getElementById('invResumen');
        if (!wrap) return;

        if (!_admConfig.inventarioVendedores.length) {
            loading.classList.remove('hidden');
            loading.textContent = 'Selecciona vendedores para ver el inventario.';
            wrap.classList.add('hidden');
            resumen.classList.add('hidden');
            return;
        }

        const list = getInvFiltered();
        loading.classList.add('hidden');
        wrap.classList.remove('hidden');
        resumen.classList.remove('hidden');

        if (!list.length) {
            wrap.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">No hay productos con estos filtros.</p>';
            resumen.textContent = '';
            return;
        }

        let html = `<table class="min-w-full text-sm">
            <thead class="bg-gray-200 sticky top-0"><tr class="text-xs uppercase text-gray-600">
                <th class="py-2 px-2 text-left">Producto</th>
                <th class="py-2 px-2 text-center">Existencia</th>
                <th class="py-2 px-2 text-center">Total Und</th>
            </tr></thead><tbody>`;

        let lastSeg = null;
        list.forEach(p => {
            const seg = p.segmento || 'Sin segmento';
            if (seg !== lastSeg) {
                lastSeg = seg;
                html += `<tr><td colspan="3" class="bg-gray-100 py-1 px-2 font-bold text-gray-700 text-xs uppercase border-y border-gray-300">${seg}</td></tr>`;
            }
            const mayor = formatUnidadMayor(p, p.totalUnidades);
            const agotado = p.totalUnidades <= 0;
            const bajo = p.totalUnidades > 0 && p.totalUnidades <= (p.unidadesPorCaja || p.unidadesPorPaquete || 12);
            const rowCls = agotado ? 'bg-red-50' : (bajo ? 'bg-amber-50' : '');
            const existCls = agotado ? 'text-red-600' : (bajo ? 'text-amber-700' : 'text-gray-800');
            const alerta = agotado ? '<span class="text-[9px] bg-red-200 text-red-800 px-1 rounded ml-1">AGOTADO</span>'
                          : (bajo ? '<span class="text-[9px] bg-amber-200 text-amber-800 px-1 rounded ml-1">BAJO</span>' : '');

            html += `<tr class="border-b border-gray-100 hover:bg-blue-50 cursor-pointer ${rowCls}" data-id="${p.id}">
                <td class="py-2 px-2">
                    <div class="font-medium text-gray-800 text-xs leading-tight">${p.presentacion || 'Producto'}${alerta}</div>
                    <div class="text-[10px] text-gray-400">${p.marca || ''}</div>
                </td>
                <td class="py-2 px-2 text-center font-bold ${existCls}">${mayor}</td>
                <td class="py-2 px-2 text-center text-gray-500 text-xs">${p.totalUnidades}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;

        // Click para desglose por vendedor
        wrap.querySelectorAll('tr[data-id]').forEach(tr =>
            tr.addEventListener('click', () => mostrarDesgloseVendedor(tr.dataset.id)));

        const totalU = list.reduce((s, p) => s + p.totalUnidades, 0);
        resumen.textContent = `${list.length} producto(s) · ${totalU.toLocaleString('es-VE')} unidades totales`;
    }

    function mostrarDesgloseVendedor(prodId) {
        const p = _invData.find(x => x.id === prodId);
        if (!p) return;
        const desglose = _invPorVendedor[prodId] || {};
        document.getElementById('admDesgloseOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'admDesgloseOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        const filas = _admConfig.inventarioVendedores.map(uid => {
            const u = _usersCache.find(x => x.id === uid);
            const cant = desglose[uid] || 0;
            return `<div class="flex justify-between items-center py-2 border-b border-gray-100">
                <span class="text-sm text-gray-700">${u ? nombreVendedor(u) : uid}</span>
                <span class="text-sm font-bold text-gray-900">${formatUnidadMayor(p, cant)} <span class="text-[10px] text-gray-400">(${cant} und)</span></span>
            </div>`;
        }).join('');
        ov.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                <div class="bg-blue-600 text-white px-4 py-3">
                    <div class="font-bold text-sm">${p.presentacion || 'Producto'}</div>
                    <div class="text-xs opacity-80">${p.marca || ''}</div>
                </div>
                <div class="p-4">
                    <p class="text-xs font-bold text-gray-500 uppercase mb-2">Desglose por vendedor</p>
                    ${filas}
                    <div class="flex justify-between items-center pt-2 mt-1">
                        <span class="text-sm font-black text-gray-800">TOTAL</span>
                        <span class="text-base font-black text-blue-700">${formatUnidadMayor(p, p.totalUnidades)}</span>
                    </div>
                </div>
                <div class="p-3 border-t"><button id="desgCerrar" class="w-full py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cerrar</button></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('desgCerrar').addEventListener('click', () => ov.remove());
    }

    function exportarInventarioExcel() {
        if (!_invData.length) { _showModal('Aviso', 'No hay datos para exportar.'); return; }
        const list = getInvFiltered();
        const rows = [['Rubro', 'Segmento', 'Marca', 'Producto', 'Existencia (mayor)', 'Total Unidades',
            ..._admConfig.inventarioVendedores.map(uid => {
                const u = _usersCache.find(x => x.id === uid); return u ? nombreVendedor(u) : uid;
            })]];
        list.forEach(p => {
            const desg = _invPorVendedor[p.id] || {};
            rows.push([
                p.rubro || '', p.segmento || '', p.marca || '', p.presentacion || '',
                formatUnidadMayor(p, p.totalUnidades), p.totalUnidades,
                ..._admConfig.inventarioVendedores.map(uid => desg[uid] || 0)
            ]);
        });
        try {
            const ws = XLSX.utils.aoa_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
            const fecha = new Date();
            const fname = `Inventario_Consolidado_${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}.xlsx`;
            XLSX.writeFile(wb, fname);
        } catch (e) {
            console.error('Error exportando:', e);
            _showModal('Error', 'No se pudo generar el Excel.');
        }
    }

    // ════════════════════════════════════════════════════════
    // 2. ANALISTA DE DATOS DE VENTAS
    // ════════════════════════════════════════════════════════
    let _anaData = [];  // productos con salida agregada
    let _anaGrafico = 'porDia';
    let _anaLabel = '';

    function mesActualISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    async function showAnalistaDatos() {
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-6 w-full max-w-3xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">📊 Analista de Datos</h2>
                        <button id="anaBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>

                    <!-- Vendedores -->
                    <div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-2">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-green-800 uppercase tracking-wide">Vendedores a analizar (máx. 3)</span>
                            <button id="anaVendConfig" class="text-xs text-green-700 font-bold hover:underline">Configurar</button>
                        </div>
                        <div id="anaVendList" class="flex flex-wrap gap-1.5"></div>
                    </div>

                    <!-- Controles -->
                    <div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 space-y-2">
                        <div>
                            <label class="block text-[10px] font-bold text-green-800 uppercase mb-1">Periodo a analizar</label>
                            <select id="anaPeriodo" class="w-full text-xs border border-green-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none mb-1.5">
                                <option value="dia">Día específico</option>
                                <option value="semana">Semana específica</option>
                                <option value="semanaAnterior">Semana anterior (lun-dom)</option>
                                <option value="mes" selected>Mes específico</option>
                                <option value="mesAnterior">Mes anterior</option>
                                <option value="anioCurso">Año en curso</option>
                                <option value="anioEspecifico">Año específico</option>
                            </select>
                            <div id="anaPeriodoControl"></div>
                        </div>
                        <div class="flex gap-2">
                            <button id="anaRun" class="flex-1 py-2 bg-green-600 text-white font-bold rounded text-sm hover:bg-green-700 transition">📈 Analizar Ventas</button>
                            <button id="anaRefresh" title="Actualizar datos (recargar de Firebase)" class="px-3 py-2 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200 transition font-bold flex items-center gap-1">🔄</button>
                        </div>
                        <p id="anaCacheInfo" class="text-[10px] text-gray-400 text-center"></p>
                    </div>

                    <!-- Filtros -->
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <select id="anaFRubro" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none"><option value="">Rubro</option></select>
                        <select id="anaFSeg" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none"><option value="">Segmento</option></select>
                        <select id="anaFMarca" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none"><option value="">Marca</option></select>
                    </div>
                    <div class="flex items-center justify-between mb-2">
                        <button id="anaExcluir" class="text-xs text-red-600 font-bold hover:underline flex items-center gap-1">🚫 Excluidos (<span id="anaExcCount">0</span>)</button>
                        <select id="anaOrden" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none">
                            <option value="salidaDesc">Más salida ↓</option>
                            <option value="salidaAsc">Menos salida ↑</option>
                            <option value="inv">Orden inventario</option>
                        </select>
                    </div>

                    <div id="anaLoading" class="text-center py-10 text-gray-400 text-sm">Selecciona vendedores y un periodo, luego «Analizar Ventas».</div>
                    <div id="anaChart" class="hidden mb-3"></div>
                    <div id="anaTableWrap" class="hidden overflow-x-auto max-h-[45vh] overflow-y-auto rounded border border-gray-200"></div>
                    <div id="anaResumen" class="hidden text-xs text-gray-500 mt-2 text-center"></div>
                </div>
            </div>`;

        document.getElementById('anaBack').addEventListener('click', window.showAdministracionMenu);
        document.getElementById('anaVendConfig').addEventListener('click', abrirSelectorVendedoresAna);
        document.getElementById('anaRun').addEventListener('click', () => ejecutarAnalisis(false));
        document.getElementById('anaRefresh').addEventListener('click', () => {
            limpiarTodoElCache();
            ejecutarAnalisis(true);
        });
        document.getElementById('anaExcluir').addEventListener('click', abrirSelectorExcluidos);
        ['anaFRubro','anaFSeg'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => {
                poblarFiltrosCascada(_anaData, { rubro: 'anaFRubro', segmento: 'anaFSeg', marca: 'anaFMarca' });
                renderAnaTabla();
            }));
        ['anaFMarca','anaOrden'].forEach(id =>
            document.getElementById(id).addEventListener('change', renderAnaTabla));
        document.getElementById('anaPeriodo').addEventListener('change', renderPeriodoControl);

        renderVendChipsAna();
        actualizarContadorExcluidos();
        renderPeriodoControl();
    }

    // Renderiza el control secundario según el tipo de periodo elegido
    function renderPeriodoControl() {
        const tipo = document.getElementById('anaPeriodo').value;
        const cont = document.getElementById('anaPeriodoControl');
        if (!cont) return;
        const cls = 'w-full text-xs border border-green-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none';
        const hoy = new Date();
        const anioActual = hoy.getFullYear();

        if (tipo === 'dia') {
            cont.innerHTML = `<input type="date" id="anaFecha" value="${hoyISO()}" class="${cls}">`;
        } else if (tipo === 'semana') {
            cont.innerHTML = `<input type="week" id="anaSemana" class="${cls}">`;
        } else if (tipo === 'mes') {
            cont.innerHTML = `<input type="month" id="anaMes" value="${mesActualISO()}" class="${cls}">`;
        } else if (tipo === 'anioEspecifico') {
            let opts = '';
            for (let y = anioActual; y >= anioActual - 6; y--) opts += `<option value="${y}">${y}</option>`;
            cont.innerHTML = `<select id="anaAnio" class="${cls}">${opts}</select>`;
        } else {
            // semanaAnterior, mesAnterior, anioCurso: no requieren control extra
            cont.innerHTML = '';
        }
    }

    function renderVendChipsAna() {
        const cont = document.getElementById('anaVendList');
        if (!cont) return;
        const sel = _admConfig.analistaVendedores;
        if (!sel.length) {
            cont.innerHTML = '<span class="text-xs text-gray-400 italic">Ninguno seleccionado — toca Configurar</span>';
            return;
        }
        cont.innerHTML = sel.map(uid => {
            const u = _usersCache.find(x => x.id === uid);
            return `<span class="text-xs bg-green-600 text-white px-2 py-1 rounded-full font-medium">${u ? nombreVendedor(u) : uid}</span>`;
        }).join('');
    }

    function abrirSelectorVendedoresAna() {
        const sel = new Set(_admConfig.analistaVendedores);
        document.getElementById('admVendAnaOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'admVendAnaOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                <div class="bg-green-600 text-white px-4 py-3 font-bold">Vendedores a analizar (máx. 3)</div>
                <div class="p-3 max-h-[60vh] overflow-y-auto space-y-1">
                    ${_usersCache.map(u => `
                        <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-gray-100">
                            <input type="checkbox" class="vendA-cb w-4 h-4" value="${u.id}" ${sel.has(u.id) ? 'checked' : ''}>
                            <span class="text-sm text-gray-800">${nombreVendedor(u)}</span>
                        </label>`).join('')}
                </div>
                <div class="p-3 border-t flex gap-2">
                    <button id="vendACancel" class="flex-1 py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cancelar</button>
                    <button id="vendASave" class="flex-1 py-2 bg-green-600 text-white rounded font-bold text-sm">Guardar</button>
                </div>
                <p id="vendAMsg" class="text-center text-xs text-red-500 pb-2 h-4"></p>
            </div>`;
        document.body.appendChild(ov);

        ov.querySelectorAll('.vendA-cb').forEach(cb => cb.addEventListener('change', () => {
            const checked = ov.querySelectorAll('.vendA-cb:checked');
            if (checked.length > 3) { cb.checked = false; document.getElementById('vendAMsg').textContent = 'Máximo 3 vendedores.'; }
            else document.getElementById('vendAMsg').textContent = '';
        }));
        document.getElementById('vendACancel').addEventListener('click', () => ov.remove());
        document.getElementById('vendASave').addEventListener('click', async () => {
            _admConfig.analistaVendedores = Array.from(ov.querySelectorAll('.vendA-cb:checked')).map(c => c.value);
            await saveConfig();
            ov.remove();
            renderVendChipsAna();
        });
    }

    function actualizarContadorExcluidos() {
        const el = document.getElementById('anaExcCount');
        if (el) el.textContent = _admConfig.analistaExcluidos.length;
    }

    // Guardamos por producto: unidades, monto y desglose por día (para gráficos).
    // _anaData tendrá: { id, ...master, unidades, monto, porDia: { 'YYYY-MM-DD': unidades } }
    // Calcula el rango de fechas [inicio, fin] (inclusive) y metadatos según el periodo elegido.
    function calcularRangoPeriodo() {
        const tipo = document.getElementById('anaPeriodo').value;
        const hoy = new Date();
        const y = hoy.getFullYear(), mo = hoy.getMonth();
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        if (tipo === 'dia') {
            const val = document.getElementById('anaFecha')?.value;
            if (!val) return null;
            return { inicio: val, fin: val, label: `Día ${val.split('-').reverse().join('/')}`, grafico: 'ninguno' };
        }
        if (tipo === 'semana') {
            const val = document.getElementById('anaSemana')?.value; // formato YYYY-Www
            if (!val) return null;
            const [yy, ww] = val.split('-W').map(Number);
            // ISO week: el jueves de la semana 1 define el año
            const simple = new Date(yy, 0, 1 + (ww - 1) * 7);
            const dow = simple.getDay();
            const lunes = new Date(simple);
            lunes.setDate(simple.getDate() - ((dow + 6) % 7)); // retroceder al lunes
            const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
            return { inicio: iso(lunes), fin: iso(domingo), label: `Semana ${ww}/${yy}`, grafico: 'porDia' };
        }
        if (tipo === 'semanaAnterior') {
            const dow = hoy.getDay();
            const lunesEsta = new Date(hoy); lunesEsta.setDate(hoy.getDate() - ((dow + 6) % 7));
            const lunesAnt = new Date(lunesEsta); lunesAnt.setDate(lunesEsta.getDate() - 7);
            const domAnt = new Date(lunesAnt); domAnt.setDate(lunesAnt.getDate() + 6);
            return { inicio: iso(lunesAnt), fin: iso(domAnt), label: 'Semana anterior', grafico: 'porDia' };
        }
        if (tipo === 'mes') {
            const val = document.getElementById('anaMes')?.value; // YYYY-MM
            if (!val) return null;
            const [yy, mm] = val.split('-').map(Number);
            const ini = new Date(yy, mm - 1, 1), fin = new Date(yy, mm, 0);
            return { inicio: iso(ini), fin: iso(fin), label: val, grafico: 'porDia' };
        }
        if (tipo === 'mesAnterior') {
            const ini = new Date(y, mo - 1, 1), fin = new Date(y, mo, 0);
            return { inicio: iso(ini), fin: iso(fin), label: 'Mes anterior', grafico: 'porDia' };
        }
        if (tipo === 'anioCurso') {
            return { inicio: `${y}-01-01`, fin: iso(hoy), label: `Año ${y} (en curso)`, grafico: 'porMes' };
        }
        if (tipo === 'anioEspecifico') {
            const yy = Number(document.getElementById('anaAnio')?.value || y);
            return { inicio: `${yy}-01-01`, fin: `${yy}-12-31`, label: `Año ${yy}`, grafico: 'porMes' };
        }
        return null;
    }

    // Lista de meses ISO (YYYY-MM) que cubre un rango de fechas
    function mesesEnRango(inicioISO, finISO) {
        const [yi, mi] = inicioISO.split('-').map(Number);
        const [yf, mf] = finISO.split('-').map(Number);
        const meses = [];
        let y = yi, m = mi;
        while (y < yf || (y === yf && m <= mf)) {
            meses.push(`${y}-${String(m).padStart(2, '0')}`);
            m++; if (m > 12) { m = 1; y++; }
        }
        return meses;
    }

    async function ejecutarAnalisis(forzarRecarga) {
        const rango = calcularRangoPeriodo();
        if (!rango) { _showModal('Aviso', 'Selecciona un periodo válido.'); return; }
        const vendedores = _admConfig.analistaVendedores;
        if (!vendedores.length) { _showModal('Aviso', 'Selecciona al menos un vendedor (botón Configurar).'); return; }

        const loading = document.getElementById('anaLoading');
        const wrap = document.getElementById('anaTableWrap');
        const chart = document.getElementById('anaChart');
        const cacheInfo = document.getElementById('anaCacheInfo');
        loading.classList.remove('hidden');
        loading.innerHTML = '<svg class="animate-spin h-6 w-6 mx-auto mb-2 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Analizando ventas...';
        wrap.classList.add('hidden');
        chart.classList.add('hidden');

        _anaGrafico = rango.grafico;   // 'porDia' | 'porMes' | 'ninguno'
        _anaLabel = rango.label;

        const mesActual = mesActualISO();
        const meses = mesesEnRango(rango.inicio, rango.fin);

        // salida[id] = { unidades, monto, porDia: {dia: u}, porMes: {mes: u} }
        const salida = {};
        let lecturasFirebase = 0, desdeCache = 0;

        const dentroRango = (diaISO) => diaISO >= rango.inicio && diaISO <= rango.fin;
        const acumular = (id, unidades, monto, diaISO) => {
            if (!salida[id]) salida[id] = { unidades: 0, monto: 0, porDia: {}, porMes: {} };
            salida[id].unidades += unidades;
            salida[id].monto += monto;
            if (diaISO) {
                salida[id].porDia[diaISO] = (salida[id].porDia[diaISO] || 0) + unidades;
                const mesISO = diaISO.slice(0, 7);
                salida[id].porMes[mesISO] = (salida[id].porMes[mesISO] || 0) + unidades;
            }
        };

        try {
            for (const uid of vendedores) {
                // Procesamos mes por mes: usamos caché para meses cerrados
                for (const mes of meses) {
                    const esMesActual = (mes === mesActual);
                    const cache = forzarRecarga ? null : leerCacheMes(uid, mes);

                    if (cache && !esMesActual) {
                        // El caché guarda por día; filtramos por el rango exacto
                        Object.entries(cache.productos || {}).forEach(([id, d]) => {
                            Object.entries(d.porDia || {}).forEach(([dia, u]) => {
                                if (dentroRango(dia)) {
                                    // Reconstruir monto proporcional no es exacto; guardamos monto aparte
                                    acumular(id, u, 0, dia);
                                }
                            });
                            // Monto: solo si el mes entero está dentro del rango
                            const mesInicio = `${mes}-01`;
                            const [yy, mm] = mes.split('-').map(Number);
                            const mesFin = `${mes}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
                            if (mesInicio >= rango.inicio && mesFin <= rango.fin && salida[id]) {
                                salida[id].monto += d.monto || 0;
                            }
                        });
                        desdeCache++;
                        continue;
                    }

                    // Leer de Firebase
                    const [year, month] = mes.split('-').map(Number);
                    const ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/ventas`));
                    const cierresSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/cierres`));
                    lecturasFirebase += ventasSnap.size + cierresSnap.size;

                    const cacheProd = {};

                    const procesarVenta = (v) => {
                        const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                        if (!f || f.getFullYear() !== year || (f.getMonth() + 1) !== month) return;
                        const diaISO = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
                        (v.productos || []).forEach(p => {
                            if (!p.id) return;
                            const m = _masterCache[p.id] || {};
                            const uCj = m.unidadesPorCaja || 1, uPaq = m.unidadesPorPaquete || 1;
                            const cv = p.cantidadVendida || {};
                            const unidades = (cv.cj || 0) * uCj + (cv.paq || 0) * uPaq + (cv.und || 0);
                            const monto = (p.precios?.cj || 0) * (cv.cj || 0) + (p.precios?.paq || 0) * (cv.paq || 0) + (p.precios?.und || 0) * (cv.und || 0);

                            // Guardar en caché del mes (todos los días del mes, para reuso futuro)
                            if (diaISO < hoyISO()) {
                                if (!cacheProd[p.id]) cacheProd[p.id] = { unidades: 0, monto: 0, porDia: {} };
                                cacheProd[p.id].unidades += unidades;
                                cacheProd[p.id].monto += monto;
                                cacheProd[p.id].porDia[diaISO] = (cacheProd[p.id].porDia[diaISO] || 0) + unidades;
                            }
                            // Acumular al resultado solo si cae dentro del rango consultado
                            if (dentroRango(diaISO)) acumular(p.id, unidades, monto, diaISO);
                        });
                    };

                    ventasSnap.docs.forEach(d => procesarVenta(d.data()));
                    cierresSnap.docs.forEach(dc => (dc.data().ventas || []).forEach(procesarVenta));

                    guardarCacheMes(uid, mes, { productos: cacheProd, cachedAt: hoyISO() });
                }
            }

            _anaData = Object.keys(salida)
                .filter(id => !_admConfig.analistaExcluidos.includes(id))
                .map(id => {
                    const m = _masterCache[id] || {};
                    return { id, ...m, unidades: salida[id].unidades, monto: salida[id].monto, porDia: salida[id].porDia, porMes: salida[id].porMes };
                })
                .filter(p => p.presentacion || p.marca);

            if (cacheInfo) {
                const partes = [`Periodo: ${rango.label}`];
                if (desdeCache > 0) partes.push(`${desdeCache} desde caché`);
                if (lecturasFirebase > 0) partes.push(`${lecturasFirebase} lectura(s) Firebase`);
                cacheInfo.textContent = partes.join(' · ');
            }

            poblarFiltrosAna();
            renderAnaTabla();
        } catch (e) {
            console.error('Error analizando ventas:', e);
            loading.textContent = 'Error al analizar las ventas.';
        }
    }

    function poblarFiltrosAna() {
        poblarFiltrosCascada(_anaData, { rubro: 'anaFRubro', segmento: 'anaFSeg', marca: 'anaFMarca' });
    }

    function getAnaFiltered() {
        const fR = document.getElementById('anaFRubro')?.value || '';
        const fS = document.getElementById('anaFSeg')?.value || '';
        const fM = document.getElementById('anaFMarca')?.value || '';
        const orden = document.getElementById('anaOrden')?.value || 'salidaDesc';

        let list = _anaData.filter(p =>
            (!fR || p.rubro === fR) && (!fS || p.segmento === fS) && (!fM || p.marca === fM));

        if (orden === 'salidaDesc') list = [...list].sort((a, b) => b.unidades - a.unidades);
        else if (orden === 'salidaAsc') list = [...list].sort((a, b) => a.unidades - b.unidades);
        else list = [...list].sort(_sortFn);

        return list;
    }

    function renderAnaTabla() {
        const wrap = document.getElementById('anaTableWrap');
        const loading = document.getElementById('anaLoading');
        const chart = document.getElementById('anaChart');
        const resumen = document.getElementById('anaResumen');
        if (!wrap) return;

        const list = getAnaFiltered();
        loading.classList.add('hidden');
        wrap.classList.remove('hidden');
        resumen.classList.remove('hidden');

        if (!list.length) {
            wrap.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Sin ventas para estos filtros en el mes seleccionado.</p>';
            chart.classList.add('hidden');
            resumen.textContent = '';
            return;
        }

        // Gráficos: Top productos + ventas por día del mes
        renderGraficos(list);
        chart.classList.remove('hidden');

        let html = `<table class="min-w-full text-sm">
            <thead class="bg-gray-200 sticky top-0"><tr class="text-xs uppercase text-gray-600">
                <th class="py-2 px-2 text-left">#</th>
                <th class="py-2 px-2 text-left">Producto</th>
                <th class="py-2 px-2 text-center">Salida</th>
                <th class="py-2 px-2 text-right">Monto $</th>
            </tr></thead><tbody>`;

        const maxU = Math.max(...list.map(p => p.unidades), 1);
        list.forEach((p, i) => {
            const pct = (p.unidades / maxU) * 100;
            const mayor = formatUnidadMayor(p, p.unidades);
            html += `<tr class="border-b border-gray-100 hover:bg-green-50 cursor-pointer" data-id="${p.id}">
                <td class="py-2 px-2 text-gray-400 font-bold text-xs">${i + 1}</td>
                <td class="py-2 px-2">
                    <div class="font-medium text-gray-800 text-xs leading-tight">${p.presentacion || 'Producto'}</div>
                    <div class="text-[10px] text-gray-400">${p.marca || ''}${p.segmento ? ' · ' + p.segmento : ''}</div>
                    <div class="w-full bg-gray-100 rounded-full h-1 mt-1"><div class="bg-green-500 h-1 rounded-full" style="width:${pct}%"></div></div>
                </td>
                <td class="py-2 px-2 text-center font-bold text-green-700">${mayor}<div class="text-[9px] text-gray-400 font-normal">${p.unidades.toLocaleString('es-VE')} und</div></td>
                <td class="py-2 px-2 text-right text-gray-600 text-xs">$${p.monto.toFixed(2)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;

        // Click en producto → distribución por día
        wrap.querySelectorAll('tr[data-id]').forEach(tr =>
            tr.addEventListener('click', () => mostrarVentasPorDiaProducto(tr.dataset.id)));

        const totalU = list.reduce((s, p) => s + p.unidades, 0);
        const totalM = list.reduce((s, p) => s + p.monto, 0);
        resumen.textContent = `${list.length} producto(s) · ${totalU.toLocaleString('es-VE')} und vendidas · $${totalM.toFixed(2)}`;
    }

    function renderGraficos(list) {
        const chart = document.getElementById('anaChart');
        if (!chart) return;

        // 1) Top 10 productos por salida (siempre)
        const top = list.slice(0, 10);
        const maxTop = Math.max(...top.map(p => p.unidades), 1);
        const topHtml = top.map((p, i) => {
            const pct = (p.unidades / maxTop) * 100;
            const nombre = (p.presentacion || 'Producto').length > 22 ? (p.presentacion || '').slice(0, 22) + '…' : (p.presentacion || 'Producto');
            return `<div class="flex items-center gap-2">
                <span class="text-[10px] text-gray-400 w-4 text-right">${i + 1}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <span class="text-[10px] text-gray-700 truncate">${nombre}</span>
                        <span class="text-[10px] font-bold text-green-700 shrink-0 ml-1">${formatUnidadMayor(p, p.unidades)}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-green-500 h-2 rounded-full transition-all" style="width:${pct}%"></div></div>
                </div>
            </div>`;
        }).join('');

        // 2) Gráfico temporal según el periodo: por día, por mes, o ninguno
        let temporalHtml = '';
        const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

        if (_anaGrafico === 'porDia') {
            const porDia = {};
            list.forEach(p => Object.entries(p.porDia || {}).forEach(([dia, u]) => {
                porDia[dia] = (porDia[dia] || 0) + u;
            }));
            // Solo días con ventas (no rellenamos días vacíos)
            const dias = Object.keys(porDia).sort();
            if (dias.length) {
                const maxDia = Math.max(...Object.values(porDia), 1);
                const diaMax = dias.reduce((a, b) => (porDia[b] > (porDia[a] || 0) ? b : a), dias[0]);
                temporalHtml = `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2">
                    <p class="text-[10px] font-bold text-gray-500 uppercase mb-2">Ventas por día (unidades) · pico: ${diaMax.split('-')[2]}/${diaMax.split('-')[1]}</p>
                    <div class="flex items-end gap-0.5 h-24 overflow-x-auto">
                        ${dias.map(dia => {
                            const h = (porDia[dia] / maxDia) * 100;
                            const [yy, mm, dd] = dia.split('-');
                            const esPico = dia === diaMax;
                            return `<div class="flex flex-col items-center justify-end h-full" style="min-width:14px;flex:1">
                                <div class="w-full ${esPico ? 'bg-green-600' : 'bg-green-400'} rounded-t transition-all hover:bg-green-700" style="height:${h}%" title="${dd}/${mm}: ${porDia[dia].toLocaleString('es-VE')} und"></div>
                                <span class="text-[7px] text-gray-400 mt-0.5">${dd}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }
        } else if (_anaGrafico === 'porMes') {
            const porMes = {};
            list.forEach(p => Object.entries(p.porMes || {}).forEach(([mes, u]) => {
                porMes[mes] = (porMes[mes] || 0) + u;
            }));
            const meses = Object.keys(porMes).sort();
            if (meses.length) {
                const maxMes = Math.max(...Object.values(porMes), 1);
                const mesMax = meses.reduce((a, b) => (porMes[b] > (porMes[a] || 0) ? b : a), meses[0]);
                temporalHtml = `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2">
                    <p class="text-[10px] font-bold text-gray-500 uppercase mb-2">Ventas por mes (unidades) · pico: ${MESES[Number(mesMax.split('-')[1]) - 1]}</p>
                    <div class="flex items-end gap-1 h-28">
                        ${meses.map(mes => {
                            const h = (porMes[mes] / maxMes) * 100;
                            const mNum = Number(mes.split('-')[1]);
                            const esPico = mes === mesMax;
                            return `<div class="flex-1 flex flex-col items-center justify-end h-full">
                                <span class="text-[8px] font-bold text-green-700 mb-0.5">${porMes[mes] >= 1000 ? (porMes[mes]/1000).toFixed(1)+'k' : porMes[mes]}</span>
                                <div class="w-full ${esPico ? 'bg-green-600' : 'bg-green-400'} rounded-t transition-all hover:bg-green-700" style="height:${h}%" title="${MESES[mNum-1]}: ${porMes[mes].toLocaleString('es-VE')} und"></div>
                                <span class="text-[8px] text-gray-400 mt-0.5">${MESES[mNum-1]}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }
        }
        // _anaGrafico === 'ninguno' (día específico): sin gráfico temporal

        chart.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p class="text-[10px] font-bold text-gray-500 uppercase mb-2">Top ${top.length} — Más salida${_anaLabel ? ' · ' + _anaLabel : ''}</p>
                <div class="space-y-1.5">${topHtml}</div>
            </div>
            ${temporalHtml}`;
    }


    function mostrarVentasPorDiaProducto(prodId) {
        const p = _anaData.find(x => x.id === prodId);
        if (!p || !p.porDia) return;
        const dias = Object.keys(p.porDia).sort();
        if (!dias.length) return;
        const maxDia = Math.max(...Object.values(p.porDia), 1);
        const diaMax = dias.reduce((a, b) => (p.porDia[b] > (p.porDia[a] || 0) ? b : a), dias[0]);

        document.getElementById('admDiaProdOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'admDiaProdOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div class="bg-green-600 text-white px-4 py-3">
                    <div class="font-bold text-sm">${p.presentacion || 'Producto'}</div>
                    <div class="text-xs opacity-80">${p.marca || ''} · salida por día</div>
                </div>
                <div class="p-4">
                    <p class="text-[10px] text-gray-500 mb-2">Día con más salida: <span class="font-bold text-green-700">${diaMax.split('-')[2]}</span> (${formatUnidadMayor(p, p.porDia[diaMax])})</p>
                    <div class="flex items-end gap-0.5 h-32">
                        ${dias.map(dia => {
                            const h = (p.porDia[dia] / maxDia) * 100;
                            const d = dia.split('-')[2];
                            const esPico = dia === diaMax;
                            return `<div class="flex-1 flex flex-col items-center justify-end h-full">
                                <div class="w-full ${esPico ? 'bg-green-600' : 'bg-green-400'} rounded-t hover:bg-green-700" style="height:${h}%" title="Día ${d}: ${formatUnidadMayor(p, p.porDia[dia])}"></div>
                                <span class="text-[7px] text-gray-400 mt-0.5">${d}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                <div class="p-3 border-t"><button id="diaProdCerrar" class="w-full py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cerrar</button></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('diaProdCerrar').addEventListener('click', () => ov.remove());
    }

    function abrirSelectorExcluidos() {
        const excl = new Set(_admConfig.analistaExcluidos);
        const productos = Object.values(_masterCache).filter(p => p.presentacion || p.marca).sort(_sortFn);
        const rubros = [...new Set(productos.map(p => p.rubro).filter(Boolean))].sort();
        const segs   = [...new Set(productos.map(p => p.segmento).filter(Boolean))].sort();
        const marcas = [...new Set(productos.map(p => p.marca).filter(Boolean))].sort();

        document.getElementById('admExclOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'admExclOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div class="bg-red-600 text-white px-4 py-3 shrink-0">
                    <div class="font-bold">Productos excluidos del análisis</div>
                    <div class="text-xs opacity-80">Marca los que NO deben contar (dejaron de llegar, etc.)</div>
                </div>
                <div class="p-2 border-b shrink-0 space-y-2">
                    <input type="text" id="exclSearch" placeholder="Buscar producto..." class="w-full text-sm border border-gray-300 rounded p-2 focus:ring-2 focus:ring-red-400 outline-none">
                    <div class="grid grid-cols-3 gap-1.5">
                        <select id="exclFRubro" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-red-400 outline-none"><option value="">Rubro</option>${rubros.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
                        <select id="exclFSeg" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-red-400 outline-none"><option value="">Segmento</option>${segs.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                        <select id="exclFMarca" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-red-400 outline-none"><option value="">Marca</option>${marcas.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
                    </div>
                </div>
                <div id="exclList" class="p-2 overflow-y-auto flex-1 space-y-1"></div>
                <div class="p-3 border-t flex gap-2 shrink-0">
                    <button id="exclCancel" class="flex-1 py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cancelar</button>
                    <button id="exclSave" class="flex-1 py-2 bg-red-600 text-white rounded font-bold text-sm">Guardar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);

        const renderExcl = () => {
            const term = (document.getElementById('exclSearch').value || '').toLowerCase().trim();
            const fR = document.getElementById('exclFRubro').value;
            const fS = document.getElementById('exclFSeg').value;
            const fM = document.getElementById('exclFMarca').value;
            const list = document.getElementById('exclList');
            const filt = productos.filter(p =>
                (!fR || p.rubro === fR) && (!fS || p.segmento === fS) && (!fM || p.marca === fM) &&
                (!term || (p.presentacion || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term)));
            list.innerHTML = filt.map(p => `
                <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-gray-100">
                    <input type="checkbox" class="excl-cb w-4 h-4" value="${p.id}" ${excl.has(p.id) ? 'checked' : ''}>
                    <span class="text-xs text-gray-800 flex-1">${p.presentacion || 'Producto'} <span class="text-gray-400">${p.marca || ''}</span></span>
                </label>`).join('') || '<p class="text-center text-gray-400 text-xs py-4">Sin resultados.</p>';
            list.querySelectorAll('.excl-cb').forEach(cb => cb.addEventListener('change', () => {
                if (cb.checked) excl.add(cb.value); else excl.delete(cb.value);
            }));
        };
        renderExcl();

        let deb = null;
        document.getElementById('exclSearch').addEventListener('input', () => {
            clearTimeout(deb); deb = setTimeout(renderExcl, 180);
        });
        document.getElementById('exclFMarca').addEventListener('change', renderExcl);
        ['exclFRubro','exclFSeg'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => {
                poblarFiltrosCascada(productos, { rubro: 'exclFRubro', segmento: 'exclFSeg', marca: 'exclFMarca' });
                renderExcl();
            }));
        document.getElementById('exclCancel').addEventListener('click', () => ov.remove());
        document.getElementById('exclSave').addEventListener('click', async () => {
            _admConfig.analistaExcluidos = Array.from(excl);
            await saveConfig();
            ov.remove();
            actualizarContadorExcluidos();
            if (_anaData.length) {
                _anaData = _anaData.filter(p => !_admConfig.analistaExcluidos.includes(p.id));
                renderAnaTabla();
            }
        });
    }


    // ════════════════════════════════════════════════════════
    // 3. ANALISTA DE INVENTARIO
    //    Cruza histórico de ventas (últimos 6 meses) con el inventario
    //    consolidado actual (mismos vendedores del inventario). Alerta:
    //      - Productos que se vendían y ahora están AGOTADOS
    //      - Productos con inventario BAJO (≤ 1 caja/paquete)
    // ════════════════════════════════════════════════════════
    let _invAnaData = { agotados: [], muyBajo: [], bajo: [], porVigilar: [] };

    async function showAnalistaInventario() {
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-6 w-full max-w-3xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">🔍 Analista de Inventario</h2>
                        <button id="invAnaBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>

                    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                        <p class="text-xs text-amber-800 leading-relaxed">
                            Cruza los productos <b>vendidos en los últimos 6 meses</b> con el inventario consolidado actual
                            (vendedores: <b id="invAnaVends">—</b>). Muestra los que están <b>agotados</b> o con inventario bajo en 3 niveles.
                        </p>
                        <button id="invAnaRun" class="w-full mt-2 py-2 bg-amber-600 text-white font-bold rounded text-sm hover:bg-amber-700 transition">🔍 Analizar Inventario</button>
                    </div>

                    <!-- Filtros -->
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <select id="invAnaFRubro" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-amber-400 outline-none"><option value="">Rubro</option></select>
                        <select id="invAnaFSeg" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-amber-400 outline-none"><option value="">Segmento</option></select>
                        <select id="invAnaFMarca" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-amber-400 outline-none"><option value="">Marca</option></select>
                    </div>

                    <div id="invAnaLoading" class="text-center py-10 text-gray-400 text-sm">Toca «Analizar Inventario» para comenzar.</div>
                    <div id="invAnaResult" class="hidden space-y-3"></div>
                </div>
            </div>`;

        document.getElementById('invAnaBack').addEventListener('click', window.showAdministracionMenu);
        document.getElementById('invAnaRun').addEventListener('click', ejecutarAnalisisInventario);
        ['invAnaFRubro','invAnaFSeg'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => {
                const all = [..._invAnaData.agotados, ..._invAnaData.muyBajo, ..._invAnaData.bajo, ..._invAnaData.porVigilar];
                poblarFiltrosCascada(all, { rubro: 'invAnaFRubro', segmento: 'invAnaFSeg', marca: 'invAnaFMarca' });
                renderInvAnaResult();
            }));
        document.getElementById('invAnaFMarca').addEventListener('change', renderInvAnaResult);

        // Mostrar los vendedores configurados (los del inventario consolidado)
        const vends = _admConfig.inventarioVendedores.map(uid => {
            const u = _usersCache.find(x => x.id === uid); return u ? nombreVendedor(u) : uid;
        });
        const el = document.getElementById('invAnaVends');
        if (el) el.textContent = vends.length ? vends.join(', ') : 'ninguno configurado';
    }

    async function ejecutarAnalisisInventario() {
        const vendedores = _admConfig.inventarioVendedores;
        if (!vendedores.length) {
            _showModal('Aviso', 'Primero configura los vendedores en «Inventario Consolidado».');
            return;
        }

        const loading = document.getElementById('invAnaLoading');
        const result = document.getElementById('invAnaResult');
        loading.classList.remove('hidden');
        loading.innerHTML = '<svg class="animate-spin h-6 w-6 mx-auto mb-2 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Cruzando ventas con inventario...';
        result.classList.add('hidden');

        try {
            // 1) Productos vendidos en los últimos 6 meses (con su total de unidades)
            const hoy = new Date();
            const limite = new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1);
            const vendidos = {}; // id -> unidades vendidas en el periodo

            for (const uid of vendedores) {
                const ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/ventas`));
                const cierresSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/cierres`));

                const procesar = (v) => {
                    const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                    if (!f || f < limite) return;
                    (v.productos || []).forEach(p => {
                        if (!p.id) return;
                        const m = _masterCache[p.id] || {};
                        const uCj = m.unidadesPorCaja || 1, uPaq = m.unidadesPorPaquete || 1;
                        const cv = p.cantidadVendida || {};
                        const u = (cv.cj || 0) * uCj + (cv.paq || 0) * uPaq + (cv.und || 0);
                        vendidos[p.id] = (vendidos[p.id] || 0) + u;
                    });
                };
                ventasSnap.docs.forEach(d => procesar(d.data()));
                cierresSnap.docs.forEach(dc => (dc.data().ventas || []).forEach(procesar));
            }

            // 2) Inventario consolidado actual (mismos vendedores)
            const inv = {}; // id -> unidades en inventario
            const invSnaps = await Promise.all(vendedores.map(uid =>
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/inventario`))));
            invSnaps.forEach(snap => snap.docs.forEach(d => {
                inv[d.id] = (inv[d.id] || 0) + (d.data().cantidadUnidades || 0);
            }));

            // 3) Cruce: agotados + 3 niveles EXCLUYENTES de inventario bajo (por cajas):
            //    Muy bajo  = existencia < 1 caja
            //    Bajo      = 1 a < 3 cajas
            //    Por vigilar = 3 a < 5 cajas
            const agotados = [], muyBajo = [], bajo = [], porVigilar = [];
            Object.keys(vendidos).forEach(id => {
                const m = _masterCache[id] || {};
                if (!m.presentacion && !m.marca) return;
                const existencia = inv[id] || 0;
                // Tamaño de 1 unidad mayor física (caja, o paquete si no hay caja) en unidades.
                // No depende de ventaPor: la agrupación física es la que manda.
                const uCaja = (m.unidadesPorCaja > 1) ? m.unidadesPorCaja
                            : (m.unidadesPorPaquete > 1) ? m.unidadesPorPaquete : 1;
                const item = { id, ...m, existencia, vendido: vendidos[id] };
                if (existencia <= 0) { agotados.push(item); return; }
                const cajas = existencia / uCaja;
                if (cajas < 1)      muyBajo.push(item);
                else if (cajas < 3) bajo.push(item);
                else if (cajas < 5) porVigilar.push(item);
            });

            // Ordenar cada nivel por más vendidos (más urgente primero)
            [agotados, muyBajo, bajo, porVigilar].forEach(arr => arr.sort((a, b) => b.vendido - a.vendido));

            _invAnaData = { agotados, muyBajo, bajo, porVigilar };
            poblarFiltrosInvAna();
            renderInvAnaResult();
        } catch (e) {
            console.error('Error analizando inventario:', e);
            loading.textContent = 'Error al analizar el inventario.';
        }
    }

    function poblarFiltrosInvAna() {
        const all = [..._invAnaData.agotados, ..._invAnaData.muyBajo, ..._invAnaData.bajo, ..._invAnaData.porVigilar];
        poblarFiltrosCascada(all, { rubro: 'invAnaFRubro', segmento: 'invAnaFSeg', marca: 'invAnaFMarca' });
    }

    function renderInvAnaResult() {
        const result = document.getElementById('invAnaResult');
        const loading = document.getElementById('invAnaLoading');
        if (!result) return;

        const fR = document.getElementById('invAnaFRubro')?.value || '';
        const fS = document.getElementById('invAnaFSeg')?.value || '';
        const fM = document.getElementById('invAnaFMarca')?.value || '';
        const aplica = (arr) => arr.filter(p =>
            (!fR || p.rubro === fR) && (!fS || p.segmento === fS) && (!fM || p.marca === fM));

        const agotados   = aplica(_invAnaData.agotados);
        const muyBajo    = aplica(_invAnaData.muyBajo);
        const bajo       = aplica(_invAnaData.bajo);
        const porVigilar = aplica(_invAnaData.porVigilar);

        loading.classList.add('hidden');
        result.classList.remove('hidden');

        const cardProducto = (p, color) => {
            const mayor = formatUnidadMayor(p, p.existencia);
            return `<div class="flex items-center justify-between py-2 px-2 border-b border-gray-100">
                <div class="min-w-0">
                    <div class="font-medium text-gray-800 text-xs leading-tight truncate">${p.presentacion || 'Producto'}</div>
                    <div class="text-[10px] text-gray-400">${p.marca || ''}${p.segmento ? ' · ' + p.segmento : ''}</div>
                </div>
                <div class="text-right shrink-0 ml-2">
                    <div class="text-xs font-bold ${color}">${mayor}</div>
                    <div class="text-[9px] text-gray-400">vendió ${p.vendido.toLocaleString('es-VE')} und/6m</div>
                </div>
            </div>`;
        };

        // Secciones: cada una con su color, ícono y etiqueta de prioridad
        const seccion = (titulo, items, cfg, vacio) => `
            <div class="border ${cfg.border} rounded-lg overflow-hidden">
                <div class="${cfg.headBg} px-3 py-2 flex items-center justify-between">
                    <span class="text-xs font-bold ${cfg.headText} uppercase tracking-wide">${cfg.icon} ${titulo}</span>
                    <span class="text-xs font-black ${cfg.countText}">${items.length}</span>
                </div>
                <div class="max-h-[26vh] overflow-y-auto">
                    ${items.length ? items.map(p => cardProducto(p, cfg.itemText)).join('') : `<p class="text-center text-gray-400 text-xs py-4">${vacio}</p>`}
                </div>
            </div>`;

        let html = '';
        html += seccion('Agotados que se vendían', agotados, {
            icon: '🔴', border: 'border-red-200', headBg: 'bg-red-100', headText: 'text-red-800',
            countText: 'text-red-700', itemText: 'text-red-600'
        }, 'Ninguno — todo lo que se vende tiene existencia.');

        html += seccion('Muy bajo (menos de 1 caja)', muyBajo, {
            icon: '🟠', border: 'border-orange-200', headBg: 'bg-orange-100', headText: 'text-orange-800',
            countText: 'text-orange-700', itemText: 'text-orange-600'
        }, 'Ninguno en este nivel.');

        html += seccion('Bajo (1 a 3 cajas)', bajo, {
            icon: '🟡', border: 'border-amber-200', headBg: 'bg-amber-100', headText: 'text-amber-800',
            countText: 'text-amber-700', itemText: 'text-amber-700'
        }, 'Ninguno en este nivel.');

        html += seccion('Por vigilar (3 a 5 cajas)', porVigilar, {
            icon: '🔵', border: 'border-blue-200', headBg: 'bg-blue-100', headText: 'text-blue-800',
            countText: 'text-blue-700', itemText: 'text-blue-600'
        }, 'Ninguno en este nivel.');

        result.innerHTML = html;
    }


    // ════════════════════════════════════════════════════════
    // ANALISTA DE CLIENTES
    // ════════════════════════════════════════════════════════
    let _cliVolData = [];   // ranking por volumen
    let _cliPagoData = [];  // calificación de pago
    let _cliModo = 'volumen';
    let _cliVolMedir = 'unidades';
    let _cliVolRango = null;

    // ── Parseo de fecha CXC (formatos dd/mm/yyyy o yyyy-mm-dd) ──
    function parseFechaCXC(raw) {
        if (!raw) return null;
        const s = raw.toString().trim();
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (m) {
            let [_, d, mo, y] = m;
            if (y.length === 2) y = '20' + y;
            return new Date(Number(y), Number(mo) - 1, Number(d));
        }
        m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    const UMBRAL_COMPROMISO = 0.80; // se considera "cumplido" si el pendiente es ≤ 20%

    // Rangos de días (ajustados): Excelente ≤8, Buena ≤15, Regular ≤21, Mala >21
    function clasificarPorDias(dias) {
        if (dias <= 8)  return { calif: 'Excelente', califColor: 'green', califIcon: '🟢' };
        if (dias <= 15) return { calif: 'Buena',     califColor: 'blue',  califIcon: '🔵' };
        if (dias <= 21) return { calif: 'Regular',   califColor: 'amber', califIcon: '🟡' };
        return              { calif: 'Mala',      califColor: 'red',   califIcon: '🔴' };
    }

    // ── Calificación de estructura de pago (MODELO CUENTA CORRIENTE) ──
    // El signo del monto en la columna deuda/abonos manda:
    //   monto > 0  → venta/despacho (sube el saldo)
    //   monto < 0  → abono/pago      (baja el saldo, FIFO sobre las ventas)
    // Las letras (F/T/E) se usan solo como referencia secundaria.
    // Retención (R) y consignación (C) NO afectan el saldo de deuda.
    //
    // Produce DOS calificaciones:
    //   1) Compromiso de pago (estado ACTUAL): saldo pendiente hoy vs lo despachado.
    //      La venta más reciente aún activa se evalúa con el umbral del 80%.
    //   2) Tiempo promedio de pago: días que tardó cada venta en cancelarse al 100%
    //      (FIFO). Ventas viejas sin saldar cuentan días hasta HOY (penaliza).
    function calificarPagoCliente(client) {
        const txs = (client.transactions || [])
            .map(t => ({ ...t, fecha: parseFechaCXC(t.date) }))
            .filter(t => t.fecha)
            .sort((a, b) => a.fecha - b.fecha);

        const hoy = new Date();

        // Cola FIFO de ventas (despachos) con su saldo pendiente
        const ventas = [];   // {fecha, monto, pagado, canceladaFecha}
        const ventasCerradas = []; // ventas pagadas 100% con sus días

        txs.forEach(t => {
            const tipo = (t.type || '').toUpperCase();
            const monto = t.amount || 0;
            // Ignorar retención y consignación (no son deuda/abono real)
            if (tipo === 'R' || tipo === 'C') return;

            if (monto > 0) {
                // Venta / despacho: sube el saldo
                ventas.push({ fecha: t.fecha, monto: monto, pagado: 0, canceladaFecha: null });
            } else if (monto < 0) {
                // Abono / pago: baja el saldo, FIFO sobre las ventas más viejas
                let restante = -monto;
                for (const v of ventas) {
                    if (v.canceladaFecha) continue;
                    if (restante <= 0) break;
                    const falta = v.monto - v.pagado;      // lo que falta para el 100%
                    const aplica = Math.min(restante, falta);
                    v.pagado += aplica;
                    restante -= aplica;
                    // Cancelada al 100% (con pequeña tolerancia por redondeo)
                    if (v.pagado >= v.monto - 0.01) {
                        v.canceladaFecha = t.fecha;
                        const dias = Math.max(0, Math.round((t.fecha - v.fecha) / 86400000));
                        ventasCerradas.push({ fecha: v.fecha, monto: v.monto, dias, cancelada: true });
                    }
                }
                // Si sobra abono (pagó de más), se ignora el excedente
            }
        });

        // ── Calificación 2: TIEMPO PROMEDIO DE PAGO ──
        // Ventas cerradas (100%) + ventas activas que ya "vencieron" cuentan días hasta hoy.
        const todasParaPromedio = [...ventasCerradas];
        ventas.forEach(v => {
            if (!v.canceladaFecha) {
                const dias = Math.max(0, Math.round((hoy - v.fecha) / 86400000));
                todasParaPromedio.push({ fecha: v.fecha, monto: v.monto, dias, cancelada: false });
            }
        });

        if (!todasParaPromedio.length) return null;

        const clasif = { excelente: 0, buena: 0, regular: 0, mala: 0 };
        let sumaDias = 0;
        todasParaPromedio.forEach(f => {
            sumaDias += f.dias;
            const cl = clasificarPorDias(f.dias);
            if (cl.calif === 'Excelente') clasif.excelente++;
            else if (cl.calif === 'Buena') clasif.buena++;
            else if (cl.calif === 'Regular') clasif.regular++;
            else clasif.mala++;
        });
        const diasProm = sumaDias / todasParaPromedio.length;
        const califTiempo = clasificarPorDias(diasProm);

        // ── Calificación 1: COMPROMISO DE PAGO (estado actual) ──
        // Saldo pendiente hoy y desde cuándo (la venta activa más antigua no saldada).
        const ventasActivas = ventas.filter(v => !v.canceladaFecha);
        const saldoPendiente = ventasActivas.reduce((s, v) => s + (v.monto - v.pagado), 0);
        const totalVentas = ventas.reduce((s, v) => s + v.monto, 0);

        // % pendiente respecto a lo despachado en el ciclo activo
        const despachadoActivo = ventasActivas.reduce((s, v) => s + v.monto, 0);
        const pendientePct = despachadoActivo > 0 ? (saldoPendiente / despachadoActivo) : 0;

        // Días desde la venta activa más antigua (la que arrastra la deuda)
        let diasCompromiso = 0;
        if (ventasActivas.length) {
            const masVieja = ventasActivas.reduce((a, b) => (a.fecha < b.fecha ? a : b));
            diasCompromiso = Math.max(0, Math.round((hoy - masVieja.fecha) / 86400000));
        }

        // Si el pendiente es ≤ 20%, el compromiso está cumplido (no penaliza).
        // Se usa una pequeña tolerancia para que el 20% EXACTO cuente como cumplido
        // (evita el problema de punto flotante de 1 - 0.80 = 0.1999...).
        const MAX_PENDIENTE = 0.20 + 0.0001;
        let califCompromiso;
        if (saldoPendiente <= 0.01 || pendientePct <= MAX_PENDIENTE) {
            califCompromiso = { calif: 'Al día', califColor: 'green', califIcon: '🟢' };
        } else {
            // Debe más del 20%: califica según cuántos días lleva arrastrando
            califCompromiso = clasificarPorDias(diasCompromiso);
        }

        const totalFacturado = ventas.reduce((s, v) => s + v.monto, 0);

        return {
            // Tiempo promedio de pago (calificación 2)
            calif: califTiempo.calif, califColor: califTiempo.califColor, califIcon: califTiempo.califIcon,
            diasProm, numFacturas: todasParaPromedio.length, clasif, totalFacturado,
            // Compromiso de pago (calificación 1)
            compromiso: {
                calif: califCompromiso.calif, califColor: califCompromiso.califColor, califIcon: califCompromiso.califIcon,
                saldoPendiente, pendientePct, diasCompromiso, despachadoActivo
            },
            pendientePromedio: pendientePct,
            facturas: todasParaPromedio.sort((a, b) => b.fecha - a.fecha)
        };
    }

    // ── Análisis de volumen de compra por cliente ──
    // Lee ventas/cierres de todos los vendedores una vez, agrupa por cliente,
    // filtrando por rango de fechas y por alcance (todo/rubro/segmento/marca/producto).
    async function analizarVolumenClientes(rango, alcance, clienteFiltro) {
        // clienteFiltro (opcional): { id, nombre } → solo ese cliente (ahorra lecturas)
        const dentroRango = (diaISO) => diaISO >= rango.inicio && diaISO <= rango.fin;
        const nFiltroNombre = clienteFiltro ? normNombre(clienteFiltro.nombre) : '';

        const pasaAlcance = (prodId) => {
            if (alcance.tipo === 'todo') return true;
            const m = _masterCache[prodId] || {};
            if (alcance.tipo === 'rubro')    return m.rubro === alcance.valor;
            if (alcance.tipo === 'segmento') return m.segmento === alcance.valor;
            if (alcance.tipo === 'marca')    return m.marca === alcance.valor;
            if (alcance.tipo === 'producto') return prodId === alcance.valor;
            return true;
        };

        // ¿La venta pertenece al cliente filtrado? (por id o por nombre normalizado)
        const esDelCliente = (v) => {
            if (!clienteFiltro) return true;
            if (clienteFiltro.id && v.clienteId === clienteFiltro.id) return true;
            return normNombre(v.clienteNombre) === nFiltroNombre ||
                   normNombre(v.clienteNombre).includes(nFiltroNombre) ||
                   nFiltroNombre.includes(normNombre(v.clienteNombre));
        };

        // clienteId -> { id, nombre, unidades, monto }
        const porCliente = {};
        const todosVendedores = _usersCache.map(u => u.id);

        for (const uid of todosVendedores) {
            // Ventas activas: si hay cliente con id, usar query filtrado (menos lecturas)
            let ventasSnap;
            if (clienteFiltro && clienteFiltro.id) {
                ventasSnap = await _getDocs(_query(
                    _collection(_db, `artifacts/${_appId}/users/${uid}/ventas`),
                    _where('clienteId', '==', clienteFiltro.id)));
            } else {
                ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/ventas`));
            }
            // Cierres: se leen completos (las ventas están dentro de un array, no se
            // pueden filtrar por query); se filtra por cliente en memoria.
            const cierresSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/cierres`));

            const procesar = (v) => {
                if (!esDelCliente(v)) return;
                const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                if (!f) return;
                const diaISO = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`;
                if (!dentroRango(diaISO)) return;
                const cid = v.clienteId || ('nombre:' + normNombre(v.clienteNombre));
                const cnombre = v.clienteNombre || 'Sin nombre';
                (v.productos || []).forEach(p => {
                    if (!p.id || !pasaAlcance(p.id)) return;
                    const m = _masterCache[p.id] || {};
                    const uCj = m.unidadesPorCaja || 1, uPaq = m.unidadesPorPaquete || 1;
                    const cv = p.cantidadVendida || {};
                    const unidades = (cv.cj||0)*uCj + (cv.paq||0)*uPaq + (cv.und||0);
                    const monto = (p.precios?.cj||0)*(cv.cj||0) + (p.precios?.paq||0)*(cv.paq||0) + (p.precios?.und||0)*(cv.und||0);
                    if (!porCliente[cid]) porCliente[cid] = { id: cid, nombre: cnombre, unidades: 0, monto: 0, productos: {} };
                    porCliente[cid].unidades += unidades;
                    porCliente[cid].monto += monto;
                    // Desglose por producto (para ver qué compra el cliente)
                    if (!porCliente[cid].productos[p.id]) porCliente[cid].productos[p.id] = { unidades: 0, monto: 0 };
                    porCliente[cid].productos[p.id].unidades += unidades;
                    porCliente[cid].productos[p.id].monto += monto;
                });
            };
            ventasSnap.docs.forEach(d => procesar(d.data()));
            cierresSnap.docs.forEach(dc => (dc.data().ventas || []).forEach(procesar));
        }
        return Object.values(porCliente);
    }



    // ── VISTA PRINCIPAL ──
    async function showAnalistaClientes() {
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-6 w-full max-w-3xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">👥 Analista de Clientes</h2>
                        <button id="cliBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>

                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <button id="cliModoVol" class="py-2 rounded text-xs font-bold border transition bg-purple-600 text-white border-purple-600">🏆 Volumen de compra</button>
                        <button id="cliModoPago" class="py-2 rounded text-xs font-bold border transition bg-white text-purple-700 border-purple-300">💳 Estructura de pago</button>
                    </div>

                    <div class="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3 space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="cliADC" class="w-4 h-4 accent-purple-600">
                            <span class="text-xs font-bold text-purple-800">Solo clientes con ADC</span>
                        </label>

                        <!-- Selector de cliente ANTES de analizar (ahorra lecturas) -->
                        <div>
                            <label class="block text-[10px] font-bold text-purple-800 uppercase mb-1">Cliente</label>
                            <input type="text" id="cliPreBuscar" placeholder="Todos los clientes (escribe para elegir uno)" list="cliDatalist" class="w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none">
                            <datalist id="cliDatalist"></datalist>
                            <p id="cliPreHint" class="text-[9px] text-gray-400 mt-0.5">Deja vacío para analizar todos. Elige uno para leer solo sus datos.</p>
                        </div>

                        <!-- Controles VOLUMEN -->
                        <div id="cliVolControls" class="space-y-2">
                            <div>
                                <label class="block text-[10px] font-bold text-purple-800 uppercase mb-1">Periodo</label>
                                <select id="cliPeriodo" class="w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none mb-1.5">
                                    <option value="dia">Día específico</option>
                                    <option value="semana">Semana específica</option>
                                    <option value="semanaAnterior">Semana anterior</option>
                                    <option value="mes" selected>Mes específico</option>
                                    <option value="mesAnterior">Mes anterior</option>
                                    <option value="anioCurso">Año en curso</option>
                                    <option value="anioEspecifico">Año específico</option>
                                </select>
                                <div id="cliPeriodoControl"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-[10px] font-bold text-purple-800 uppercase mb-1">Alcance</label>
                                    <select id="cliAlcanceTipo" class="w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none">
                                        <option value="todo">Todo</option>
                                        <option value="rubro">Por rubro</option>
                                        <option value="segmento">Por segmento</option>
                                        <option value="marca">Por marca</option>
                                        <option value="producto">Producto individual</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-purple-800 uppercase mb-1">Medir por</label>
                                    <select id="cliMedir" class="w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none">
                                        <option value="unidades">Unidades</option>
                                        <option value="monto">Monto $</option>
                                    </select>
                                </div>
                            </div>
                            <div id="cliAlcanceValorWrap"></div>
                        </div>

                        <!-- Controles PAGO -->
                        <div id="cliPagoControls" class="space-y-2 hidden">
                            <div>
                                <label class="block text-[10px] font-bold text-purple-800 uppercase mb-1">Calificación a mostrar</label>
                                <select id="cliTipoCalif" class="w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none">
                                    <option value="compromiso">Compromiso de pago (estado actual)</option>
                                    <option value="tiempo">Tiempo promedio de pago (histórico)</option>
                                </select>
                            </div>
                        </div>

                        <button id="cliRun" class="w-full py-2 bg-purple-600 text-white font-bold rounded text-sm hover:bg-purple-700 transition">📈 Analizar</button>
                        <p id="cliInfo" class="text-[10px] text-gray-400 text-center"></p>
                    </div>

                    <!-- Buscador + filtro (aparecen tras analizar) -->
                    <div id="cliFiltros" class="hidden flex gap-2 mb-2">
                        <input type="text" id="cliBuscar" placeholder="Buscar cliente..." class="flex-1 text-xs border border-gray-300 rounded p-1.5 outline-none focus:ring-2 focus:ring-purple-400">
                        <select id="cliFiltroCalif" class="text-xs border border-gray-300 rounded p-1.5 bg-white outline-none hidden">
                            <option value="">Todas</option>
                            <option value="Excelente">🟢 Excelente</option>
                            <option value="Buena">🔵 Buena</option>
                            <option value="Regular">🟡 Regular</option>
                            <option value="Mala">🔴 Mala</option>
                            <option value="Al día">🟢 Al día</option>
                        </select>
                    </div>

                    <div id="cliLoading" class="text-center py-10 text-gray-400 text-sm">Elige el modo y toca «Analizar».</div>
                    <div id="cliRiesgo" class="hidden mb-3"></div>
                    <div id="cliEstrella" class="hidden mb-3"></div>
                    <div id="cliChart" class="hidden mb-3"></div>
                    <div id="cliTableWrap" class="hidden overflow-x-auto max-h-[45vh] overflow-y-auto rounded border border-gray-200"></div>
                    <div id="cliResumen" class="hidden text-xs text-gray-500 mt-2 text-center"></div>
                </div>
            </div>`;

        document.getElementById('cliBack').addEventListener('click', window.showAdministracionMenu);
        document.getElementById('cliModoVol').addEventListener('click', () => setCliModo('volumen'));
        document.getElementById('cliModoPago').addEventListener('click', () => setCliModo('pago'));
        document.getElementById('cliRun').addEventListener('click', ejecutarAnalisisClientes);
        document.getElementById('cliPeriodo').addEventListener('change', renderCliPeriodoControl);
        document.getElementById('cliAlcanceTipo').addEventListener('change', renderCliAlcanceValor);
        document.getElementById('cliTipoCalif').addEventListener('change', () => { if (_cliPagoData.length) renderPago(_cliPagoData); });

        let debB = null;
        document.getElementById('cliBuscar').addEventListener('input', () => {
            clearTimeout(debB); debB = setTimeout(aplicarFiltroClientes, 180);
        });
        document.getElementById('cliFiltroCalif').addEventListener('change', aplicarFiltroClientes);

        document.getElementById('cliLoading').innerHTML = '<svg class="animate-spin h-6 w-6 mx-auto mb-2 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Cargando datos...';
        await Promise.all([loadMaster(), loadUsers(), loadClientes(), loadCXC(), loadADC(), getSortFn()]);
        document.getElementById('cliLoading').textContent = 'Elige el modo y toca «Analizar».';

        // Poblar datalist con nombres de clientes (para el selector previo)
        poblarDatalistClientes();

        renderCliPeriodoControl();
        renderCliAlcanceValor();
        setCliModo('volumen');
    }

    // Llena el datalist con nombres de clientes (comercial). Combina la lista de
    // clientes registrados + los nombres del CXC (por si alguno no está en clientes).
    function poblarDatalistClientes() {
        const dl = document.getElementById('cliDatalist');
        if (!dl) return;
        const nombres = new Set();
        (_clientesCache || []).forEach(cl => { if (cl.nombreComercial) nombres.add(cl.nombreComercial); });
        (_cxcCache || []).forEach(cx => { if (cx.name) nombres.add(cx.name.trim()); });
        const orden = [...nombres].sort((a, b) => a.localeCompare(b));
        dl.innerHTML = orden.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
    }

    // Devuelve el nombre del cliente elegido en el selector previo, o '' si es "todos"
    function clienteElegidoPrevio() {
        return (document.getElementById('cliPreBuscar')?.value || '').trim();
    }

    function setCliModo(modo) {
        _cliModo = modo;
        const bVol = document.getElementById('cliModoVol');
        const bPago = document.getElementById('cliModoPago');
        const on = 'py-2 rounded text-xs font-bold border transition bg-purple-600 text-white border-purple-600';
        const off = 'py-2 rounded text-xs font-bold border transition bg-white text-purple-700 border-purple-300';
        document.getElementById('cliVolControls').classList.toggle('hidden', modo !== 'volumen');
        document.getElementById('cliPagoControls').classList.toggle('hidden', modo !== 'pago');
        document.getElementById('cliFiltroCalif').classList.toggle('hidden', modo !== 'pago');
        bVol.className = modo === 'volumen' ? on : off;
        bPago.className = modo === 'pago' ? on : off;

        ['cliRiesgo','cliEstrella','cliChart','cliTableWrap','cliResumen','cliFiltros'].forEach(id =>
            document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('cliLoading').classList.remove('hidden');
        document.getElementById('cliLoading').textContent = 'Toca «Analizar».';
    }

    function renderCliPeriodoControl() {
        const tipo = document.getElementById('cliPeriodo').value;
        const cont = document.getElementById('cliPeriodoControl');
        if (!cont) return;
        const cls = 'w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none';
        const anioActual = new Date().getFullYear();
        if (tipo === 'dia') cont.innerHTML = `<input type="date" id="cliFecha" value="${hoyISO()}" class="${cls}">`;
        else if (tipo === 'semana') cont.innerHTML = `<input type="week" id="cliSemana" class="${cls}">`;
        else if (tipo === 'mes') cont.innerHTML = `<input type="month" id="cliMes" value="${mesActualISO()}" class="${cls}">`;
        else if (tipo === 'anioEspecifico') {
            let opts = '';
            for (let y = anioActual; y >= anioActual - 6; y--) opts += `<option value="${y}">${y}</option>`;
            cont.innerHTML = `<select id="cliAnio" class="${cls}">${opts}</select>`;
        } else cont.innerHTML = '';
    }

    function renderCliAlcanceValor() {
        const tipo = document.getElementById('cliAlcanceTipo').value;
        const wrap = document.getElementById('cliAlcanceValorWrap');
        if (!wrap) return;
        const cls = 'w-full text-xs border border-purple-300 rounded p-1.5 bg-white outline-none';
        const prods = Object.values(_masterCache).filter(p => p.presentacion || p.marca);
        let opts = '<option value="">— seleccionar —</option>';
        if (tipo === 'todo') { wrap.innerHTML = ''; return; }
        if (tipo === 'rubro') [...new Set(prods.map(p => p.rubro).filter(Boolean))].sort().forEach(v => opts += `<option value="${v}">${v}</option>`);
        else if (tipo === 'segmento') [...new Set(prods.map(p => p.segmento).filter(Boolean))].sort().forEach(v => opts += `<option value="${v}">${v}</option>`);
        else if (tipo === 'marca') [...new Set(prods.map(p => p.marca).filter(Boolean))].sort().forEach(v => opts += `<option value="${v}">${v}</option>`);
        else if (tipo === 'producto') prods.sort(_sortFn).forEach(p => opts += `<option value="${p.id}">${p.presentacion || 'Producto'} · ${p.marca || ''}</option>`);
        wrap.innerHTML = `<select id="cliAlcanceValor" class="${cls}">${opts}</select>`;
    }

    function calcularRangoCli() {
        const tipo = document.getElementById('cliPeriodo').value;
        const hoy = new Date();
        const y = hoy.getFullYear(), mo = hoy.getMonth();
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (tipo === 'dia') { const v = document.getElementById('cliFecha')?.value; return v ? { inicio:v, fin:v, label:`Día ${v}` } : null; }
        if (tipo === 'semana') {
            const v = document.getElementById('cliSemana')?.value; if (!v) return null;
            const [yy, ww] = v.split('-W').map(Number);
            const simple = new Date(yy, 0, 1 + (ww-1)*7); const dow = simple.getDay();
            const lunes = new Date(simple); lunes.setDate(simple.getDate() - ((dow+6)%7));
            const dom = new Date(lunes); dom.setDate(lunes.getDate()+6);
            return { inicio: iso(lunes), fin: iso(dom), label: `Semana ${ww}/${yy}` };
        }
        if (tipo === 'semanaAnterior') {
            const dow = hoy.getDay(); const lunesEsta = new Date(hoy); lunesEsta.setDate(hoy.getDate()-((dow+6)%7));
            const lunesAnt = new Date(lunesEsta); lunesAnt.setDate(lunesEsta.getDate()-7);
            const domAnt = new Date(lunesAnt); domAnt.setDate(lunesAnt.getDate()+6);
            return { inicio: iso(lunesAnt), fin: iso(domAnt), label: 'Semana anterior' };
        }
        if (tipo === 'mes') { const v = document.getElementById('cliMes')?.value; if (!v) return null;
            const [yy,mm]=v.split('-').map(Number); return { inicio: iso(new Date(yy,mm-1,1)), fin: iso(new Date(yy,mm,0)), label: v }; }
        if (tipo === 'mesAnterior') return { inicio: iso(new Date(y,mo-1,1)), fin: iso(new Date(y,mo,0)), label: 'Mes anterior' };
        if (tipo === 'anioCurso') return { inicio: `${y}-01-01`, fin: iso(hoy), label: `Año ${y}` };
        if (tipo === 'anioEspecifico') { const yy = Number(document.getElementById('cliAnio')?.value || y); return { inicio: `${yy}-01-01`, fin: `${yy}-12-31`, label: `Año ${yy}` }; }
        return null;
    }

    // Filtro de búsqueda + calificación (re-renderiza la tabla del modo activo)
    function aplicarFiltroClientes() {
        if (_cliModo === 'volumen') renderVolumen(_cliVolData, _cliVolMedir, _cliVolRango);
        else renderPago(_cliPagoData);
    }

    async function ejecutarAnalisisClientes() {
        const loading = document.getElementById('cliLoading');
        const soloADC = document.getElementById('cliADC').checked;
        loading.classList.remove('hidden');
        loading.innerHTML = '<svg class="animate-spin h-6 w-6 mx-auto mb-2 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Analizando...';
        ['cliRiesgo','cliEstrella','cliChart','cliTableWrap','cliResumen'].forEach(id => document.getElementById(id).classList.add('hidden'));

        try {
            if (_cliModo === 'volumen') {
                await ejecutarVolumen(soloADC);
            } else {
                await ejecutarPago(soloADC);
            }
        } catch (e) {
            console.error('Error en análisis de clientes:', e);
            loading.textContent = 'Error al analizar.';
        }
    }

    // Helper: ¿el cliente (por id) tiene ADC?
    function clienteTieneADC(cid) { return _adcSet && _adcSet.has(cid); }

    // Une datos de volumen + calificación de pago por cliente (para badges cruzados)
    function calificacionDe(cid, nombre) {
        // Busca el cliente CXC que corresponde a este id/nombre
        const cxc = _cxcCache.find(c => {
            const idc = idDesdeNombreCXC(c.name);
            if (cid && idc === cid) return true;
            return normNombre(c.name) === normNombre(nombre);
        });
        if (!cxc) return null;
        return calificarPagoCliente(cxc);
    }

    // ═══ MODO VOLUMEN ═══
    async function ejecutarVolumen(soloADC) {
        const rango = calcularRangoCli();
        if (!rango) { _showModal('Aviso', 'Selecciona un periodo válido.'); document.getElementById('cliLoading').textContent = 'Toca «Analizar».'; return; }
        const tipoAlc = document.getElementById('cliAlcanceTipo').value;
        const valorAlc = document.getElementById('cliAlcanceValor')?.value || '';
        if (tipoAlc !== 'todo' && !valorAlc) { _showModal('Aviso', 'Selecciona el valor del alcance (rubro, segmento, marca o producto).'); document.getElementById('cliLoading').textContent = 'Toca «Analizar».'; return; }
        const medir = document.getElementById('cliMedir').value;

        // ¿Cliente específico elegido en el selector previo?
        const elegido = clienteElegidoPrevio();
        let clienteFiltro = null;
        if (elegido) {
            // Resolver su id desde la lista de clientes (por nombre normalizado)
            const nEleg = normNombre(elegido);
            const cl = (_clientesCache || []).find(x =>
                normNombre(x.nombreComercial) === nEleg || normNombre(x.nombrePersonal) === nEleg);
            clienteFiltro = { id: cl ? cl.id : null, nombre: elegido };
        }

        let lista = await analizarVolumenClientes(rango, { tipo: tipoAlc, valor: valorAlc }, clienteFiltro);
        if (elegido && !lista.length) {
            _showModal('Aviso', 'Ese cliente no tiene compras en el periodo/alcance elegido.');
            document.getElementById('cliLoading').textContent = 'Toca «Analizar».';
            return;
        }

        // Resolver id real y ADC; adjuntar calificación de pago
        lista.forEach(c => {
            const realId = (c.id && !c.id.startsWith('nombre:')) ? c.id : idDesdeNombreCXC(c.nombre);
            c.realId = realId;
            c.tieneADC = realId ? clienteTieneADC(realId) : false;
            c.pago = calificacionDe(realId, c.nombre);
        });
        if (soloADC) lista = lista.filter(c => c.tieneADC);

        // Ordenar por la métrica elegida
        lista.sort((a, b) => (medir === 'monto' ? b.monto - a.monto : b.unidades - a.unidades));
        _cliVolData = lista;
        _cliVolMedir = medir;
        _cliVolRango = rango;

        document.getElementById('cliFiltros').classList.remove('hidden');
        document.getElementById('cliBuscar').value = '';
        renderVolumen(lista, medir, rango);
    }

    function renderVolumen(listaFull, medir, rango) {
        const loading = document.getElementById('cliLoading');
        const chart = document.getElementById('cliChart');
        const wrap = document.getElementById('cliTableWrap');
        const resumen = document.getElementById('cliResumen');
        const riesgo = document.getElementById('cliRiesgo');
        const estrella = document.getElementById('cliEstrella');
        loading.classList.add('hidden');

        // Aplicar buscador
        const term = (document.getElementById('cliBuscar')?.value || '').toLowerCase().trim();
        const lista = term ? listaFull.filter(c => (c.nombre || '').toLowerCase().includes(term)) : listaFull;

        if (!listaFull.length) {
            wrap.classList.remove('hidden');
            wrap.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Sin compras para estos filtros.</p>';
            chart.classList.add('hidden'); riesgo.classList.add('hidden'); estrella.classList.add('hidden');
            resumen.classList.add('hidden');
            return;
        }

        const valorDe = (c) => medir === 'monto' ? c.monto : c.unidades;
        const fmtValor = (c) => medir === 'monto' ? '$' + c.monto.toFixed(2) : c.unidades.toLocaleString('es-VE') + ' und';

        // M3/M1 usan la lista completa (no filtrada por búsqueda)
        const umbralAlto = listaFull.length > 3 ? valorDe(listaFull[Math.floor(listaFull.length * 0.25)]) : 0;
        const estrellas = listaFull.filter(c => valorDe(c) >= umbralAlto && c.pago && c.pago.calif === 'Excelente').slice(0, 5);
        if (estrellas.length && !term) {
            estrella.classList.remove('hidden');
            estrella.innerHTML = `<div class="bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-300 rounded-lg p-3">
                <p class="text-[10px] font-bold text-amber-800 uppercase mb-2">⭐ Clientes estrella (alto volumen + excelente pago)</p>
                ${estrellas.map(c => `<div class="flex justify-between items-center py-1 text-xs"><span class="font-medium text-gray-800">${c.nombre}${c.tieneADC ? ' <span class="text-[8px] bg-purple-200 text-purple-700 px-1 rounded">ADC</span>' : ''}</span><span class="font-bold text-amber-700">${fmtValor(c)}</span></div>`).join('')}
            </div>`;
        } else estrella.classList.add('hidden');

        const riesgos = listaFull.filter(c => valorDe(c) >= umbralAlto && c.pago && c.pago.calif === 'Mala').slice(0, 5);
        if (riesgos.length && !term) {
            riesgo.classList.remove('hidden');
            riesgo.innerHTML = `<div class="bg-red-50 border border-red-300 rounded-lg p-3">
                <p class="text-[10px] font-bold text-red-800 uppercase mb-2">⚠️ Clientes en riesgo (te compran mucho pero pagan mal)</p>
                ${riesgos.map(c => `<div class="flex justify-between items-center py-1 text-xs"><span class="font-medium text-gray-800">${c.nombre}</span><span class="text-right"><span class="font-bold text-red-700">${fmtValor(c)}</span> <span class="text-[9px] text-gray-500">· ${c.pago.diasProm.toFixed(0)}d</span></span></div>`).join('')}
            </div>`;
        } else riesgo.classList.add('hidden');

        // Gráfico Top 10 (de la lista visible)
        const top = lista.slice(0, 10);
        if (top.length && !term) {
            const maxV = Math.max(...top.map(valorDe), 1);
            chart.classList.remove('hidden');
            chart.innerHTML = `<div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p class="text-[10px] font-bold text-gray-500 uppercase mb-2">Top ${top.length} clientes · ${rango.label}</p>
                <div class="space-y-1.5">${top.map((c, i) => {
                    const pct = (valorDe(c) / maxV) * 100;
                    const nombre = c.nombre.length > 22 ? c.nombre.slice(0, 22) + '…' : c.nombre;
                    return `<div class="flex items-center gap-2"><span class="text-[10px] text-gray-400 w-4 text-right">${i+1}</span><div class="flex-1 min-w-0"><div class="flex justify-between items-center mb-0.5"><span class="text-[10px] text-gray-700 truncate">${nombre}</span><span class="text-[10px] font-bold text-purple-700 shrink-0 ml-1">${fmtValor(c)}</span></div><div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-purple-500 h-2 rounded-full" style="width:${pct}%"></div></div></div></div>`;
                }).join('')}</div></div>`;
        } else chart.classList.add('hidden');

        // Tabla (clic para ver productos del cliente)
        const badge = (p) => p ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-${p.califColor}-100 text-${p.califColor}-700 font-bold">${p.califIcon}</span>` : '<span class="text-[9px] text-gray-300">—</span>';
        wrap.classList.remove('hidden');
        if (!lista.length) {
            wrap.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Ningún cliente coincide con la búsqueda.</p>';
        } else {
            let html = `<table class="min-w-full text-sm"><thead class="bg-gray-200 sticky top-0"><tr class="text-xs uppercase text-gray-600"><th class="py-2 px-2 text-left">#</th><th class="py-2 px-2 text-left">Cliente</th><th class="py-2 px-2 text-center">Volumen</th><th class="py-2 px-2 text-center">Pago</th></tr></thead><tbody>`;
            lista.forEach((c, i) => {
                const idx = listaFull.indexOf(c);
                html += `<tr class="border-b border-gray-100 hover:bg-purple-50 cursor-pointer" data-idx="${idx}"><td class="py-2 px-2 text-gray-400 font-bold text-xs">${i+1}</td><td class="py-2 px-2"><div class="font-medium text-gray-800 text-xs">${c.nombre}${c.tieneADC ? ' <span class="text-[8px] bg-purple-200 text-purple-700 px-1 rounded">ADC</span>' : ''}</div><div class="text-[9px] text-purple-400">toca para ver productos</div></td><td class="py-2 px-2 text-center font-bold text-purple-700 text-xs">${fmtValor(c)}</td><td class="py-2 px-2 text-center">${badge(c.pago)}</td></tr>`;
            });
            html += '</tbody></table>';
            wrap.innerHTML = html;
            wrap.querySelectorAll('tr[data-idx]').forEach(tr =>
                tr.addEventListener('click', () => mostrarProductosCliente(listaFull[Number(tr.dataset.idx)], medir)));
        }

        resumen.classList.remove('hidden');
        resumen.innerHTML = `${lista.length}${term ? ' de ' + listaFull.length : ''} cliente(s) · <button id="cliExportVol" class="text-purple-600 font-bold hover:underline">⬇️ Exportar Excel</button>`;
        document.getElementById('cliExportVol').addEventListener('click', () => exportarClientesExcel(listaFull, medir, 'volumen'));
    }

    // Ver los productos que compra un cliente y sus cantidades
    function mostrarProductosCliente(c, medir) {
        if (!c || !c.productos) return;
        const prods = Object.entries(c.productos).map(([id, d]) => {
            const m = _masterCache[id] || {};
            return { id, ...m, unidades: d.unidades, monto: d.monto };
        }).sort((a, b) => (medir === 'monto' ? b.monto - a.monto : b.unidades - a.unidades));

        document.getElementById('cliProdOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'cliProdOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        const filas = prods.map(p => `
            <div class="flex items-center justify-between py-2 px-2 border-b border-gray-100">
                <div class="min-w-0"><div class="font-medium text-gray-800 text-xs truncate">${p.presentacion || 'Producto'}</div><div class="text-[10px] text-gray-400">${p.marca || ''}${p.segmento ? ' · ' + p.segmento : ''}</div></div>
                <div class="text-right shrink-0 ml-2"><div class="text-xs font-bold text-purple-700">${formatUnidadMayor(p, p.unidades)}</div><div class="text-[9px] text-gray-400">$${p.monto.toFixed(2)} · ${p.unidades.toLocaleString('es-VE')} und</div></div>
            </div>`).join('');
        ov.innerHTML = `<div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div class="bg-purple-600 text-white px-4 py-3 shrink-0"><div class="font-bold text-sm">${c.nombre}</div><div class="text-xs opacity-80">Productos que compra · ${prods.length} distintos</div></div>
            <div class="overflow-y-auto flex-1">${filas || '<p class="text-center text-gray-400 text-xs py-6">Sin detalle de productos.</p>'}</div>
            <div class="p-3 border-t shrink-0"><button id="cliProdCerrar" class="w-full py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cerrar</button></div>
        </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('cliProdCerrar').addEventListener('click', () => ov.remove());
    }

    async function ejecutarPago(soloADC) {
        // Si hay un cliente elegido en el selector previo, solo se califica ese
        const elegido = clienteElegidoPrevio();
        const nElegido = elegido ? normNombre(elegido) : '';

        let fuente = _cxcCache;
        if (nElegido) {
            fuente = _cxcCache.filter(cx => {
                const n = normNombre(cx.name);
                return n === nElegido || n.includes(nElegido) || nElegido.includes(n);
            });
            if (!fuente.length) { _showModal('Aviso', 'Ese cliente no tiene historial en el CXC.'); document.getElementById('cliLoading').textContent = 'Toca «Analizar».'; return; }
        }

        // Calificar los clientes CXC de la fuente
        let lista = [];
        fuente.forEach(cxc => {
            const cal = calificarPagoCliente(cxc);
            if (!cal) return;
            const realId = idDesdeNombreCXC(cxc.name);
            const tieneADC = realId ? clienteTieneADC(realId) : false;
            lista.push({ nombre: cxc.name, realId, tieneADC, ...cal });
        });
        if (soloADC) lista = lista.filter(c => c.tieneADC);

        // Ordenar: mejores primero (menos días promedio)
        lista.sort((a, b) => a.diasProm - b.diasProm);
        _cliPagoData = lista;

        document.getElementById('cliFiltros').classList.remove('hidden');
        document.getElementById('cliBuscar').value = '';
        document.getElementById('cliFiltroCalif').value = '';
        renderPago(lista);
    }

    // Devuelve la calificación activa (compromiso o tiempo) de un cliente
    function califActiva(c) {
        const tipo = document.getElementById('cliTipoCalif')?.value || 'compromiso';
        if (tipo === 'compromiso' && c.compromiso) {
            return { calif: c.compromiso.calif, color: c.compromiso.califColor, icon: c.compromiso.califIcon };
        }
        return { calif: c.calif, color: c.califColor, icon: c.califIcon };
    }

    function renderPago(listaFull) {
        const loading = document.getElementById('cliLoading');
        const chart = document.getElementById('cliChart');
        const wrap = document.getElementById('cliTableWrap');
        const resumen = document.getElementById('cliResumen');
        loading.classList.add('hidden');
        document.getElementById('cliRiesgo')?.classList.add('hidden');
        document.getElementById('cliEstrella')?.classList.add('hidden');

        const tipoCalif = document.getElementById('cliTipoCalif')?.value || 'compromiso';

        // Filtros: búsqueda + calificación
        const term = (document.getElementById('cliBuscar')?.value || '').toLowerCase().trim();
        const filtroCalif = document.getElementById('cliFiltroCalif')?.value || '';
        let lista = listaFull;
        if (term) lista = lista.filter(c => (c.nombre || '').toLowerCase().includes(term));
        if (filtroCalif) lista = lista.filter(c => califActiva(c).calif === filtroCalif);

        if (!listaFull.length) {
            wrap.classList.remove('hidden');
            wrap.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Sin historial CXC para calificar.</p>';
            chart.classList.add('hidden'); resumen.classList.add('hidden');
            return;
        }

        // Distribución de calificaciones (según tipo activo), solo sin búsqueda
        if (!term && !filtroCalif) {
            const dist = {};
            listaFull.forEach(c => { const k = califActiva(c).calif; dist[k] = (dist[k] || 0) + 1; });
            const orden = ['Al día', 'Excelente', 'Buena', 'Regular', 'Mala'];
            const colores = { 'Al día': 'green', Excelente: 'green', Buena: 'blue', Regular: 'amber', Mala: 'red' };
            const iconos = { 'Al día': '🟢', Excelente: '🟢', Buena: '🔵', Regular: '🟡', Mala: '🔴' };
            const totalC = listaFull.length;
            const claves = orden.filter(k => dist[k]);
            chart.classList.remove('hidden');
            chart.innerHTML = `<div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p class="text-[10px] font-bold text-gray-500 uppercase mb-2">Distribución · ${tipoCalif === 'compromiso' ? 'Compromiso de pago' : 'Tiempo promedio'}</p>
                <div class="space-y-1.5">${claves.map(k => {
                    const pct = totalC ? (dist[k] / totalC) * 100 : 0;
                    return `<div class="flex items-center gap-2"><span class="text-[10px] w-16 text-gray-700">${iconos[k]} ${k}</span><div class="flex-1 bg-gray-200 rounded-full h-2.5"><div class="bg-${colores[k]}-500 h-2.5 rounded-full" style="width:${pct}%"></div></div><span class="text-[10px] font-bold text-gray-600 w-8 text-right">${dist[k]}</span></div>`;
                }).join('')}</div></div>`;
        } else chart.classList.add('hidden');

        // Tabla
        wrap.classList.remove('hidden');
        if (!lista.length) {
            wrap.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Ningún cliente coincide con el filtro.</p>';
        } else {
            const colTitulo = tipoCalif === 'compromiso' ? 'Pendiente' : 'Días prom.';
            let html = `<table class="min-w-full text-sm"><thead class="bg-gray-200 sticky top-0"><tr class="text-xs uppercase text-gray-600"><th class="py-2 px-2 text-left">#</th><th class="py-2 px-2 text-left">Cliente</th><th class="py-2 px-2 text-center">Calif.</th><th class="py-2 px-2 text-center">${colTitulo}</th><th class="py-2 px-2 text-center">Ventas</th></tr></thead><tbody>`;
            lista.forEach((c, i) => {
                const idx = listaFull.indexOf(c);
                const ca = califActiva(c);
                const dato = tipoCalif === 'compromiso'
                    ? (c.compromiso ? (c.compromiso.saldoPendiente <= 0.01 ? '$0' : '$' + c.compromiso.saldoPendiente.toFixed(0) + ' (' + (c.compromiso.pendientePct*100).toFixed(0) + '%)') : '—')
                    : c.diasProm.toFixed(1) + 'd';
                html += `<tr class="border-b border-gray-100 hover:bg-purple-50 cursor-pointer" data-idx="${idx}"><td class="py-2 px-2 text-gray-400 font-bold text-xs">${i+1}</td><td class="py-2 px-2"><div class="font-medium text-gray-800 text-xs">${c.nombre}${c.tieneADC ? ' <span class="text-[8px] bg-purple-200 text-purple-700 px-1 rounded">ADC</span>' : ''}</div></td><td class="py-2 px-2 text-center"><span class="text-[10px] px-1.5 py-0.5 rounded bg-${ca.color}-100 text-${ca.color}-700 font-bold whitespace-nowrap">${ca.icon} ${ca.calif}</span></td><td class="py-2 px-2 text-center font-bold text-gray-700 text-xs">${dato}</td><td class="py-2 px-2 text-center text-[10px] text-gray-500">${c.numFacturas}</td></tr>`;
            });
            html += '</tbody></table>';
            wrap.innerHTML = html;
            wrap.querySelectorAll('tr[data-idx]').forEach(tr =>
                tr.addEventListener('click', () => mostrarDetallePago(listaFull[Number(tr.dataset.idx)])));
        }

        resumen.classList.remove('hidden');
        resumen.innerHTML = `${lista.length}${(term||filtroCalif) ? ' de ' + listaFull.length : ''} cliente(s) · <button id="cliExportPago" class="text-purple-600 font-bold hover:underline">⬇️ Exportar Excel</button>`;
        document.getElementById('cliExportPago').addEventListener('click', () => exportarClientesExcel(listaFull, null, 'pago'));
    }

    function mostrarDetallePago(c) {
        document.getElementById('cliDetalleOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'cliDetalleOverlay';
        ov.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';

        // Evolución: comparar días de pago de la primera mitad vs segunda mitad de facturas
        const fs = [...c.facturas].sort((a, b) => a.fecha - b.fecha);
        let tendencia = '';
        if (fs.length >= 4) {
            const mitad = Math.floor(fs.length / 2);
            const prom1 = fs.slice(0, mitad).reduce((s, f) => s + f.dias, 0) / mitad;
            const prom2 = fs.slice(mitad).reduce((s, f) => s + f.dias, 0) / (fs.length - mitad);
            if (prom2 < prom1 - 1) tendencia = `<span class="text-green-600 font-bold">📈 Mejorando</span> (de ${prom1.toFixed(0)}d a ${prom2.toFixed(0)}d)`;
            else if (prom2 > prom1 + 1) tendencia = `<span class="text-red-600 font-bold">📉 Empeorando</span> (de ${prom1.toFixed(0)}d a ${prom2.toFixed(0)}d)`;
            else tendencia = `<span class="text-gray-600 font-bold">➡️ Estable</span> (~${prom2.toFixed(0)}d)`;
        } else tendencia = '<span class="text-gray-400">Pocas facturas para evaluar tendencia</span>';

        const maxD = Math.max(...fs.map(f => f.dias), 1);
        const barras = fs.map(f => {
            const h = (f.dias / maxD) * 100;
            const col = f.dias <= 8 ? 'green' : f.dias <= 15 ? 'blue' : f.dias <= 21 ? 'amber' : 'red';
            const fecha = f.fecha.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
            return `<div class="flex flex-col items-center justify-end h-full" style="flex:1;min-width:12px">
                <div class="w-full bg-${col}-500 rounded-t hover:opacity-75" style="height:${h}%" title="${fecha}: ${f.dias}d${f.cancelada ? '' : ' (activa)'}"></div>
            </div>`;
        }).join('');

        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                <div class="bg-purple-600 text-white px-4 py-3 shrink-0">
                    <div class="font-bold text-sm">${c.nombre}${c.tieneADC ? ' <span class="text-[8px] bg-white/30 px-1 rounded align-middle">ADC</span>' : ''}</div>
                    <div class="text-xs opacity-80">Tiempo prom.: ${c.califIcon} ${c.calif} (${c.diasProm.toFixed(1)}d) · Compromiso: ${c.compromiso ? c.compromiso.califIcon + ' ' + c.compromiso.calif : '—'}</div>
                </div>
                <div class="p-4 overflow-y-auto">
                    <div class="grid grid-cols-3 gap-2 mb-3 text-center">
                        <div class="bg-gray-50 rounded p-2"><div class="text-base font-black text-gray-800">${c.numFacturas}</div><div class="text-[9px] text-gray-500 uppercase">Ventas</div></div>
                        <div class="bg-gray-50 rounded p-2"><div class="text-base font-black text-gray-800">$${c.totalFacturado.toFixed(0)}</div><div class="text-[9px] text-gray-500 uppercase">Facturado</div></div>
                        <div class="bg-gray-50 rounded p-2"><div class="text-base font-black text-${c.compromiso && c.compromiso.saldoPendiente > 0.01 ? 'red' : 'green'}-700">$${c.compromiso ? c.compromiso.saldoPendiente.toFixed(0) : '0'}</div><div class="text-[9px] text-gray-500 uppercase">Debe hoy</div></div>
                    </div>
                    <div class="mb-3 text-xs text-center bg-gray-50 rounded p-2">Tendencia de pago: ${tendencia}</div>
                    <p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Días de pago por factura (cronológico)</p>
                    <div class="flex items-end gap-0.5 h-28 mb-2">${barras}</div>
                    <div class="text-[9px] text-gray-400 text-center">Verde ≤8d · Azul ≤15d · Ámbar ≤21d · Rojo &gt;21d</div>
                    <p class="text-[10px] text-gray-500 mt-2">Pendiente actual: <strong>${c.compromiso ? (c.compromiso.pendientePct*100).toFixed(1) : 0}%</strong> de lo despachado en el ciclo activo</p>
                </div>
                <div class="p-3 border-t shrink-0"><button id="cliDetCerrar" class="w-full py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cerrar</button></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('cliDetCerrar').addEventListener('click', () => ov.remove());
    }

    // M2 — Exportar a Excel
    function exportarClientesExcel(lista, medir, modo) {
        try {
            let rows;
            if (modo === 'volumen') {
                rows = [['#', 'Cliente', 'ADC', medir === 'monto' ? 'Monto $' : 'Unidades', 'Calificación pago', 'Días prom.']];
                lista.forEach((c, i) => rows.push([i+1, c.nombre, c.tieneADC ? 'Sí' : 'No',
                    medir === 'monto' ? c.monto.toFixed(2) : c.unidades,
                    c.pago ? c.pago.calif : '—', c.pago ? c.pago.diasProm.toFixed(1) : '—']));
            } else {
                rows = [['#', 'Cliente', 'ADC', 'Compromiso (actual)', 'Debe hoy $', 'Pendiente %',
                         'Tiempo prom. (calif)', 'Días prom.', 'Ventas', 'Excelente', 'Buena', 'Regular', 'Mala', 'Facturado $']];
                lista.forEach((c, i) => rows.push([i+1, c.nombre, c.tieneADC ? 'Sí' : 'No',
                    c.compromiso ? c.compromiso.calif : '—',
                    c.compromiso ? c.compromiso.saldoPendiente.toFixed(2) : '0',
                    c.compromiso ? (c.compromiso.pendientePct*100).toFixed(1) : '0',
                    c.calif, c.diasProm.toFixed(1), c.numFacturas,
                    c.clasif.excelente, c.clasif.buena, c.clasif.regular, c.clasif.mala,
                    c.totalFacturado.toFixed(2)]));
            }
            const ws = XLSX.utils.aoa_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, modo === 'volumen' ? 'Volumen' : 'Pago');
            const fecha = new Date();
            XLSX.writeFile(wb, `Clientes_${modo}_${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}.xlsx`);
        } catch (e) {
            console.error('Error exportando:', e);
            _showModal('Error', 'No se pudo generar el Excel.');
        }
    }

})();
// redeploy trigger 1783190804






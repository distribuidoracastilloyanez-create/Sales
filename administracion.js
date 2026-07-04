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
    let _admConfig       = { inventarioVendedores: [], analistaExcluidos: [] };

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
        const vp = prod.ventaPor || { und: true };
        const uCj = prod.unidadesPorCaja || 0;
        const uPaq = prod.unidadesPorPaquete || 0;

        // Elegir la unidad mayor disponible: caja > paquete > unidad
        if (vp.cj && uCj > 1) {
            const cajas = Math.floor(unidades / uCj);
            const resto = unidades % uCj;
            if (cajas === 0 && resto === 0) return '0 Cj';
            let s = '';
            if (cajas > 0) s += `${cajas} Cj`;
            if (resto > 0) s += (s ? ' + ' : '') + `${resto} Und`;
            return s || '0 Cj';
        }
        if (vp.paq && uPaq > 1) {
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
                    </div>
                </div>
            </div>`;

        document.getElementById('admBack').addEventListener('click', _showMainMenu);
        document.getElementById('admInvBtn').addEventListener('click', showInventarioConsolidado);
        document.getElementById('admAnaBtn').addEventListener('click', showAnalistaDatos);

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

        ['invFRubro','invFSeg','invFMarca','invOrden'].forEach(id =>
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
        const rubros = [...new Set(_invData.map(p => p.rubro).filter(Boolean))].sort();
        const segs   = [...new Set(_invData.map(p => p.segmento).filter(Boolean))].sort();
        const marcas = [...new Set(_invData.map(p => p.marca).filter(Boolean))].sort();
        const fill = (id, arr, label) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<option value="">${label}</option>` + arr.map(v => `<option value="${v}">${v}</option>`).join('');
        };
        fill('invFRubro', rubros, 'Rubro');
        fill('invFSeg', segs, 'Segmento');
        fill('invFMarca', marcas, 'Marca');
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

                    <!-- Controles -->
                    <div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 space-y-2">
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] font-bold text-green-800 uppercase mb-1">Mes a analizar</label>
                                <input type="month" id="anaMes" value="${mesActualISO()}" class="w-full text-xs border border-green-300 rounded p-1.5 focus:ring-2 focus:ring-green-400 outline-none">
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-green-800 uppercase mb-1">Vendedor</label>
                                <select id="anaVend" class="w-full text-xs border border-green-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none">
                                    <option value="__all__">Todos (consolidado)</option>
                                    ${_usersCache.map(u => `<option value="${u.id}">${nombreVendedor(u)}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <button id="anaRun" class="w-full py-2 bg-green-600 text-white font-bold rounded text-sm hover:bg-green-700 transition">📈 Analizar Ventas</button>
                    </div>

                    <!-- Filtros -->
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <select id="anaFRubro" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none"><option value="">Rubro</option></select>
                        <select id="anaFSeg" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none"><option value="">Segmento</option></select>
                        <select id="anaFMarca" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none"><option value="">Marca</option></select>
                    </div>
                    <div class="flex items-center justify-between mb-2">
                        <button id="anaExcluir" class="text-xs text-red-600 font-bold hover:underline flex items-center gap-1">🚫 Productos excluidos (<span id="anaExcCount">0</span>)</button>
                        <select id="anaOrden" class="text-xs border border-gray-300 rounded p-1.5 bg-white focus:ring-2 focus:ring-green-400 outline-none">
                            <option value="salidaDesc">Más salida ↓</option>
                            <option value="salidaAsc">Menos salida ↑</option>
                            <option value="inv">Orden inventario</option>
                        </select>
                    </div>

                    <div id="anaLoading" class="text-center py-10 text-gray-400 text-sm">Selecciona un mes y toca «Analizar Ventas».</div>
                    <div id="anaChart" class="hidden mb-3"></div>
                    <div id="anaTableWrap" class="hidden overflow-x-auto max-h-[45vh] overflow-y-auto rounded border border-gray-200"></div>
                    <div id="anaResumen" class="hidden text-xs text-gray-500 mt-2 text-center"></div>
                </div>
            </div>`;

        document.getElementById('anaBack').addEventListener('click', window.showAdministracionMenu);
        document.getElementById('anaRun').addEventListener('click', ejecutarAnalisis);
        document.getElementById('anaExcluir').addEventListener('click', abrirSelectorExcluidos);
        ['anaFRubro','anaFSeg','anaFMarca','anaOrden'].forEach(id =>
            document.getElementById(id).addEventListener('change', renderAnaTabla));

        actualizarContadorExcluidos();
    }

    function actualizarContadorExcluidos() {
        const el = document.getElementById('anaExcCount');
        if (el) el.textContent = _admConfig.analistaExcluidos.length;
    }

    async function ejecutarAnalisis() {
        const mes = document.getElementById('anaMes').value;
        const vendSel = document.getElementById('anaVend').value;
        if (!mes) { _showModal('Aviso', 'Selecciona un mes.'); return; }

        const loading = document.getElementById('anaLoading');
        const wrap = document.getElementById('anaTableWrap');
        const chart = document.getElementById('anaChart');
        loading.classList.remove('hidden');
        loading.innerHTML = '<svg class="animate-spin h-6 w-6 mx-auto mb-2 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Analizando ventas del mes...';
        wrap.classList.add('hidden');
        chart.classList.add('hidden');

        const [year, month] = mes.split('-').map(Number);
        const vendedores = vendSel === '__all__' ? _usersCache.map(u => u.id) : [vendSel];
        const salida = {}; // id -> { unidades, monto }

        try {
            for (const uid of vendedores) {
                // Ventas activas
                const ventasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/ventas`));
                const cierresSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/cierres`));

                const procesarVenta = (v) => {
                    const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                    if (!f || f.getFullYear() !== year || (f.getMonth() + 1) !== month) return;
                    (v.productos || []).forEach(p => {
                        if (!p.id) return;
                        const m = _masterCache[p.id] || {};
                        const uCj = m.unidadesPorCaja || 1, uPaq = m.unidadesPorPaquete || 1;
                        const cv = p.cantidadVendida || {};
                        const unidades = (cv.cj || 0) * uCj + (cv.paq || 0) * uPaq + (cv.und || 0);
                        const monto = (p.precios?.cj || 0) * (cv.cj || 0) + (p.precios?.paq || 0) * (cv.paq || 0) + (p.precios?.und || 0) * (cv.und || 0);
                        if (!salida[p.id]) salida[p.id] = { unidades: 0, monto: 0 };
                        salida[p.id].unidades += unidades;
                        salida[p.id].monto += monto;
                    });
                };

                ventasSnap.docs.forEach(d => procesarVenta(d.data()));
                cierresSnap.docs.forEach(dc => (dc.data().ventas || []).forEach(procesarVenta));
            }

            _anaData = Object.keys(salida)
                .filter(id => !_admConfig.analistaExcluidos.includes(id))
                .map(id => {
                    const m = _masterCache[id] || {};
                    return { id, ...m, unidades: salida[id].unidades, monto: salida[id].monto };
                })
                .filter(p => p.presentacion || p.marca);

            poblarFiltrosAna();
            renderAnaTabla();
        } catch (e) {
            console.error('Error analizando ventas:', e);
            loading.textContent = 'Error al analizar las ventas.';
        }
    }

    function poblarFiltrosAna() {
        const rubros = [...new Set(_anaData.map(p => p.rubro).filter(Boolean))].sort();
        const segs   = [...new Set(_anaData.map(p => p.segmento).filter(Boolean))].sort();
        const marcas = [...new Set(_anaData.map(p => p.marca).filter(Boolean))].sort();
        const fill = (id, arr, label) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<option value="">${label}</option>` + arr.map(v => `<option value="${v}">${v}</option>`).join('');
        };
        fill('anaFRubro', rubros, 'Rubro');
        fill('anaFSeg', segs, 'Segmento');
        fill('anaFMarca', marcas, 'Marca');
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

        // Gráfico de barras: top 10 por salida
        renderChartTop(list.slice(0, 10));
        chart.classList.remove('hidden');

        let html = `<table class="min-w-full text-sm">
            <thead class="bg-gray-200 sticky top-0"><tr class="text-xs uppercase text-gray-600">
                <th class="py-2 px-2 text-left">#</th>
                <th class="py-2 px-2 text-left">Producto</th>
                <th class="py-2 px-2 text-center">Salida (Und)</th>
                <th class="py-2 px-2 text-right">Monto $</th>
            </tr></thead><tbody>`;

        const maxU = Math.max(...list.map(p => p.unidades), 1);
        list.forEach((p, i) => {
            const pct = (p.unidades / maxU) * 100;
            html += `<tr class="border-b border-gray-100 hover:bg-green-50">
                <td class="py-2 px-2 text-gray-400 font-bold text-xs">${i + 1}</td>
                <td class="py-2 px-2">
                    <div class="font-medium text-gray-800 text-xs leading-tight">${p.presentacion || 'Producto'}</div>
                    <div class="text-[10px] text-gray-400">${p.marca || ''}${p.segmento ? ' · ' + p.segmento : ''}</div>
                    <div class="w-full bg-gray-100 rounded-full h-1 mt-1"><div class="bg-green-500 h-1 rounded-full" style="width:${pct}%"></div></div>
                </td>
                <td class="py-2 px-2 text-center font-bold text-green-700">${p.unidades.toLocaleString('es-VE')}</td>
                <td class="py-2 px-2 text-right text-gray-600 text-xs">$${p.monto.toFixed(2)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;

        const totalU = list.reduce((s, p) => s + p.unidades, 0);
        const totalM = list.reduce((s, p) => s + p.monto, 0);
        resumen.textContent = `${list.length} producto(s) · ${totalU.toLocaleString('es-VE')} und vendidas · $${totalM.toFixed(2)}`;
    }

    function renderChartTop(top) {
        const chart = document.getElementById('anaChart');
        if (!chart) return;
        const max = Math.max(...top.map(p => p.unidades), 1);
        chart.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p class="text-[10px] font-bold text-gray-500 uppercase mb-2">Top ${top.length} — Más salida</p>
                <div class="space-y-1.5">
                    ${top.map((p, i) => {
                        const pct = (p.unidades / max) * 100;
                        const nombre = (p.presentacion || 'Producto').length > 22 ? (p.presentacion || '').slice(0, 22) + '…' : (p.presentacion || 'Producto');
                        return `<div class="flex items-center gap-2">
                            <span class="text-[10px] text-gray-400 w-4 text-right">${i + 1}</span>
                            <div class="flex-1 min-w-0">
                                <div class="flex justify-between items-center mb-0.5">
                                    <span class="text-[10px] text-gray-700 truncate">${nombre}</span>
                                    <span class="text-[10px] font-bold text-green-700 shrink-0 ml-1">${p.unidades.toLocaleString('es-VE')}</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-green-500 h-2 rounded-full transition-all" style="width:${pct}%"></div></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function abrirSelectorExcluidos() {
        const excl = new Set(_admConfig.analistaExcluidos);
        const productos = Object.values(_masterCache).filter(p => p.presentacion || p.marca).sort(_sortFn);
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
                <div class="p-2 border-b shrink-0">
                    <input type="text" id="exclSearch" placeholder="Buscar producto..." class="w-full text-sm border border-gray-300 rounded p-2 focus:ring-2 focus:ring-red-400 outline-none">
                </div>
                <div id="exclList" class="p-2 overflow-y-auto flex-1 space-y-1"></div>
                <div class="p-3 border-t flex gap-2 shrink-0">
                    <button id="exclCancel" class="flex-1 py-2 bg-gray-100 text-gray-600 rounded font-bold text-sm">Cancelar</button>
                    <button id="exclSave" class="flex-1 py-2 bg-red-600 text-white rounded font-bold text-sm">Guardar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);

        const renderExcl = (term = '') => {
            const list = document.getElementById('exclList');
            const filt = productos.filter(p =>
                !term || (p.presentacion || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term));
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
        document.getElementById('exclSearch').addEventListener('input', e => {
            clearTimeout(deb); deb = setTimeout(() => renderExcl(e.target.value.toLowerCase().trim()), 180);
        });
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

})();

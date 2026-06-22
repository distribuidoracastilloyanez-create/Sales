// ============================================================
// Módulo: Calculadora de Pedido a Empresa Matriz
// v2: Orden igual al inventario (ordenSegmento/ordenMarca),
//     filtro por rubro en vista vendedor, UI compacta para móvil
// ============================================================

(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal;
    let _collection, _getDocs, _doc, _getDoc, _setDoc, _writeBatch, _query, _where;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    const BULTOS_CONFIG_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/config/calculadora_bultos`;

    let _productosCache = [];
    let _bultosConfigCache = {};
    let _pedidoActual = {};

    // ─── Mismo ordenamiento que ventas/inventario ─────────────────────────────
    function _sortProductos(arr) {
        return [...arr].sort((a, b) => {
            const rA = (a.rubro || 'SIN RUBRO').toUpperCase();
            const rB = (b.rubro || 'SIN RUBRO').toUpperCase();
            if (rA !== rB) return rA.localeCompare(rB);

            const sOA = a.ordenSegmento ?? 9999, sOB = b.ordenSegmento ?? 9999;
            if (sOA !== sOB) return sOA - sOB;
            const sA = (a.segmento || 'SIN SEGMENTO').toUpperCase();
            const sB = (b.segmento || 'SIN SEGMENTO').toUpperCase();
            if (sA !== sB) return sA.localeCompare(sB);

            const mOA = a.ordenMarca ?? 9999, mOB = b.ordenMarca ?? 9999;
            if (mOA !== mOB) return mOA - mOB;
            const mA = (a.marca || 'S/M').toUpperCase();
            const mB = (b.marca || 'S/M').toUpperCase();
            if (mA !== mB) return mA.localeCompare(mB);

            const pOA = a.ordenProducto ?? 9999, pOB = b.ordenProducto ?? 9999;
            if (pOA !== pOB) return pOA - pOB;
            return (a.presentacion || '').toUpperCase().localeCompare((b.presentacion || '').toUpperCase());
        });
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────
    window.initCalculadora = function(dependencies) {
        _db               = dependencies.db;
        _userId           = dependencies.userId;
        _userRole         = dependencies.userRole;
        _appId            = dependencies.appId;
        _mainContent      = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu     = dependencies.showMainMenu;
        _showModal        = dependencies.showModal;
        _collection       = dependencies.collection;
        _getDocs          = dependencies.getDocs;
        _doc              = dependencies.doc;
        _getDoc           = dependencies.getDoc;
        _setDoc           = dependencies.setDoc;
        _writeBatch       = dependencies.writeBatch;
        _query            = dependencies.query;
        _where            = dependencies.where;
        console.log('Módulo Calculadora v2 inicializado.');
    };

    // ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────
    window.showCalculadoraView = async function() {
        _mainContent.classList.remove('hidden');
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _pedidoActual = {};

        _mainContent.innerHTML = `
            <div class="p-2 container mx-auto max-w-2xl">
                <div class="bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-3">
                    <div class="flex items-center gap-2 mb-3">
                        <button id="calcBackBtn" class="p-1.5 rounded-full hover:bg-gray-100 transition shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <h1 class="text-lg font-bold text-gray-800">Calculadora de Pedido</h1>
                    </div>
                    <div id="calcLoadingState" class="text-center py-10 text-gray-500">
                        <svg class="animate-spin h-7 w-7 mx-auto mb-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando productos...
                    </div>
                    <div id="calcContent" class="hidden"></div>
                </div>
            </div>`;

        document.getElementById('calcBackBtn').addEventListener('click', _showMainMenu);
        await _loadData();
        _renderCalculadora();
    };

    // ─── CARGA DE DATOS ───────────────────────────────────────────────────────
    async function _loadData() {
        try {
            const prodSnap = await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`));
            const raw = prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.presentacion);
            _productosCache = _sortProductos(raw);

            const confSnap = await _getDoc(_doc(_db, BULTOS_CONFIG_PATH));
            _bultosConfigCache = confSnap.exists() ? (confSnap.data().productos || {}) : {};
        } catch (e) {
            console.error('Error cargando datos calculadora:', e);
            _bultosConfigCache = {};
        }
    }

    // ─── RENDER PRINCIPAL (Vista Vendedor) ────────────────────────────────────
    function _renderCalculadora() {
        document.getElementById('calcLoadingState').classList.add('hidden');
        const content = document.getElementById('calcContent');
        content.classList.remove('hidden');

        const productosConConfig = _sortProductos(_productosCache.filter(p => _bultosConfigCache[p.id]?.kgPorBulto > 0));
        const rubros = [...new Set(productosConConfig.map(p => p.rubro).filter(Boolean))].sort();
        const isAdmin = _userRole === 'admin';

        content.innerHTML = `
            <!-- Meta Kg/Lts -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                <label class="text-xs font-bold text-blue-800 shrink-0">Meta Kg/Lts:</label>
                <input type="number" id="calcMetaKg" min="0" step="0.1" placeholder="Ej: 500"
                    class="flex-1 px-2 py-1.5 border border-blue-300 rounded-lg text-base font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-0">
                <span class="text-blue-700 font-bold text-sm shrink-0">Kg/Lts</span>
            </div>

            <!-- Barra de progreso -->
            <div class="mb-3">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-bold text-gray-600">Total pedido</span>
                    <span id="calcTotalKg" class="text-base font-black text-green-600">0.00 Kg/Lts</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div id="calcProgressBar" class="h-3 rounded-full transition-all duration-300 bg-green-500" style="width:0%"></div>
                </div>
                <div class="text-right text-xs text-gray-400 mt-0.5">
                    <span id="calcMetaLabel">Meta: no definida</span>
                </div>
            </div>

            <!-- Filtros: búsqueda + rubro -->
            <div class="flex gap-2 mb-2">
                <div class="relative flex-1 min-w-0">
                    <input type="text" id="calcSearchInput" placeholder="Buscar producto..."
                        class="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <svg class="absolute left-2 top-2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                </div>
                <select id="calcRubroFilter" class="shrink-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px]">
                    <option value="">Todos</option>
                    ${rubros.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>

            ${productosConConfig.length === 0 ? `
            <div class="text-center py-6 bg-yellow-50 border border-yellow-200 rounded-lg mb-3">
                <p class="text-yellow-800 font-bold text-sm">Sin productos configurados</p>
                <p class="text-yellow-700 text-xs mt-1">El administrador debe configurar los Kg/Lts por bulto.</p>
            </div>` : ''}

            <!-- Lista productos -->
            <div id="calcProductList" class="space-y-1.5 mb-3 max-h-[42vh] overflow-y-auto"></div>

            <!-- Resumen -->
            <div id="calcResumen" class="hidden">
                <div class="border-t pt-3 mt-1">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Resumen del pedido</p>
                    <div id="calcResumenItems" class="space-y-1 text-sm"></div>
                </div>
            </div>

            <!-- Acciones -->
            <div class="flex gap-2 mt-3">
                <button id="calcLimpiarBtn" class="flex-1 px-3 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 transition">
                    Limpiar
                </button>
                ${isAdmin ? `
                <button id="calcConfigBtn" class="flex-1 px-3 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 transition flex items-center justify-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    Configurar bultos
                </button>` : ''}
            </div>
            ${!isAdmin && productosConConfig.length < _productosCache.length ? `
            <p class="text-xs text-center text-gray-400 mt-2">${productosConConfig.length} de ${_productosCache.length} productos configurados</p>
            ` : ''}
        `;

        _renderProductList(productosConConfig, '', '');
        _setupEventListeners(productosConConfig);
    }

    // ─── RENDER LISTA CON FILTROS ─────────────────────────────────────────────
    function _renderProductList(productos, searchTerm, rubroFilter) {
        const list = document.getElementById('calcProductList');
        if (!list) return;

        let filtered = productos;
        if (rubroFilter) filtered = filtered.filter(p => p.rubro === rubroFilter);
        if (searchTerm)  filtered = filtered.filter(p =>
            (p.presentacion || '').toLowerCase().includes(searchTerm) ||
            (p.marca || '').toLowerCase().includes(searchTerm));

        if (filtered.length === 0) {
            list.innerHTML = `<p class="text-center text-gray-400 py-5 text-sm">No se encontraron productos.</p>`;
            return;
        }

        // Agrupar por rubro para mostrar encabezados cuando hay varios
        const grupos = {};
        filtered.forEach(p => {
            const r = p.rubro || 'SIN RUBRO';
            if (!grupos[r]) grupos[r] = [];
            grupos[r].push(p);
        });
        const multipleRubros = Object.keys(grupos).length > 1;

        let html = '';
        Object.entries(grupos).forEach(([rubro, prods]) => {
            if (multipleRubros) {
                html += `<div class="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2 pb-1 px-1">${rubro}</div>`;
            }
            prods.forEach(p => {
                const conf = _bultosConfigCache[p.id] || {};
                const kgPorBulto = conf.kgPorBulto || 0;
                const unidad = conf.unidad || 'Kg';
                const cant = _pedidoActual[p.id] || 0;
                const kgEste = cant * kgPorBulto;

                html += `
                <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 hover:border-blue-300 transition">
                    <div class="flex-1 min-w-0">
                        <div class="font-semibold text-gray-800 text-xs leading-tight truncate">${p.presentacion || 'Sin nombre'}</div>
                        <div class="text-xs text-gray-400 leading-tight">${p.marca || ''}${p.segmento ? ' · ' + p.segmento : ''}</div>
                        <div class="text-xs font-bold text-blue-500">${kgPorBulto} ${unidad}/bulto</div>
                    </div>
                    <div class="flex items-center shrink-0">
                        <input type="number" inputmode="numeric" pattern="[0-9]*"
                            id="bultos-${p.id}" data-id="${p.id}" data-action="input"
                            value="${cant}" min="0" step="1"
                            class="w-16 text-center text-sm font-black text-gray-800 border border-gray-300 rounded-md py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    </div>
                    <div class="text-right w-14 shrink-0">
                        <div class="text-xs font-bold ${kgEste > 0 ? 'text-green-600' : 'text-gray-300'} leading-tight" id="kg-${p.id}">${kgEste > 0 ? kgEste.toFixed(1) : '—'}</div>
                        <div class="text-xs text-gray-400 leading-tight">${unidad}</div>
                    </div>
                </div>`;
            });
        });

        list.innerHTML = html;

        // Referencia a lista filtrada activa para _updateUI
        list._filteredProductos = filtered;

        // Inputs numéricos — escritura directa
        list.querySelectorAll('input[data-action="input"]').forEach(inp => {
            // Bloquear scroll del mouse para que no suba/baje el número
            inp.addEventListener('wheel', e => e.preventDefault(), { passive: false });

            // Al cambiar el valor escrito
            inp.addEventListener('change', () => {
                const id = inp.dataset.id;
                const val = Math.max(0, parseInt(inp.value, 10) || 0);
                inp.value = val;
                if (val === 0) delete _pedidoActual[id];
                else _pedidoActual[id] = val;
                _updateUI(list._filteredProductos);
            });

            // Actualizar en tiempo real mientras escribe
            inp.addEventListener('input', () => {
                const id = inp.dataset.id;
                const val = Math.max(0, parseInt(inp.value, 10) || 0);
                if (val === 0) delete _pedidoActual[id];
                else _pedidoActual[id] = val;
                _updateUI(list._filteredProductos);
            });

            // Seleccionar todo al hacer foco para facilitar reescribir
            inp.addEventListener('focus', () => inp.select());
        });
    }

    // ─── ACTUALIZAR UI ────────────────────────────────────────────────────────
    function _updateUI(productos) {
        // Calcular total sobre TODOS los productos del pedido (no solo los filtrados)
        let totalKg = 0;
        _productosCache.forEach(p => {
            const conf = _bultosConfigCache[p.id] || {};
            const cant = _pedidoActual[p.id] || 0;
            totalKg += cant * (conf.kgPorBulto || 0);
        });

        // Actualizar celdas individuales (solo las visibles)
        if (productos) {
            productos.forEach(p => {
                const conf = _bultosConfigCache[p.id] || {};
                const kgPorBulto = conf.kgPorBulto || 0;
                const cantidad = _pedidoActual[p.id] || 0;
                const kgEste = cantidad * kgPorBulto;
                const unidad = conf.unidad || 'Kg';

                const bultosEl = document.getElementById(`bultos-${p.id}`);
                const kgEl = document.getElementById(`kg-${p.id}`);
                // El elemento ahora es un input — actualizar su value
                if (bultosEl && document.activeElement !== bultosEl) {
                    bultosEl.value = cantidad;
                }
                if (kgEl) {
                    kgEl.textContent = kgEste > 0 ? kgEste.toFixed(1) : '—';
                    kgEl.className = `text-xs font-bold ${kgEste > 0 ? 'text-green-600' : 'text-gray-300'} leading-tight`;
                }
            });
        }

        // Total
        const totalEl = document.getElementById('calcTotalKg');
        if (totalEl) totalEl.textContent = `${totalKg.toFixed(2)} Kg/Lts`;

        // Barra de progreso
        const metaVal = parseFloat(document.getElementById('calcMetaKg')?.value) || 0;
        const bar = document.getElementById('calcProgressBar');
        const metaLabel = document.getElementById('calcMetaLabel');
        if (bar && metaLabel) {
            if (metaVal > 0) {
                const pct = Math.min(100, (totalKg / metaVal) * 100);
                bar.style.width = pct + '%';
                bar.className = `h-3 rounded-full transition-all duration-300 ${pct >= 100 ? 'bg-green-600' : pct >= 75 ? 'bg-yellow-500' : 'bg-blue-500'}`;
                metaLabel.textContent = `${pct.toFixed(1)}% de ${metaVal} Kg/Lts`;
            } else {
                bar.style.width = totalKg > 0 ? '20%' : '0%';
                bar.className = 'h-3 rounded-full transition-all duration-300 bg-blue-400';
                metaLabel.textContent = 'Meta: no definida';
            }
        }

        _updateResumen(totalKg);
    }

    function _updateResumen(totalKg) {
        const resumenDiv = document.getElementById('calcResumen');
        const resumenItems = document.getElementById('calcResumenItems');
        if (!resumenDiv || !resumenItems) return;

        const itemsPedido = Object.entries(_pedidoActual).filter(([, cant]) => cant > 0);
        if (itemsPedido.length === 0) { resumenDiv.classList.add('hidden'); return; }
        resumenDiv.classList.remove('hidden');

        resumenItems.innerHTML = itemsPedido.map(([id, cant]) => {
            const prod = _productosCache.find(p => p.id === id);
            const conf = _bultosConfigCache[id] || {};
            const kg = cant * (conf.kgPorBulto || 0);
            const unidad = conf.unidad || 'Kg';
            return `
            <div class="flex justify-between items-center py-0.5 border-b border-gray-100 gap-2">
                <span class="text-gray-700 truncate flex-1 text-xs">${prod?.presentacion || 'Producto'}</span>
                <span class="font-bold text-gray-800 shrink-0 text-xs">${cant} blt</span>
                <span class="text-green-600 font-bold shrink-0 text-xs w-20 text-right">= ${kg.toFixed(1)} ${unidad}</span>
            </div>`;
        }).join('') + `
        <div class="flex justify-between items-center pt-1.5 mt-1">
            <span class="font-black text-gray-800 text-sm">TOTAL</span>
            <span class="font-black text-green-700 text-base">${totalKg.toFixed(2)} Kg/Lts</span>
        </div>`;
    }

    // ─── EVENT LISTENERS (Vista Vendedor) ────────────────────────────────────
    function _setupEventListeners(productosConConfig) {
        let _searchDebounce = null;
        let currentSearch = '';
        let currentRubro = '';

        const rerender = () => _renderProductList(productosConConfig, currentSearch, currentRubro);

        const searchInput = document.getElementById('calcSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(_searchDebounce);
                _searchDebounce = setTimeout(() => {
                    currentSearch = searchInput.value.toLowerCase().trim();
                    rerender();
                }, 180);
            });
        }

        const rubroFilter = document.getElementById('calcRubroFilter');
        if (rubroFilter) {
            rubroFilter.addEventListener('change', () => {
                currentRubro = rubroFilter.value;
                rerender();
            });
        }

        const metaInput = document.getElementById('calcMetaKg');
        if (metaInput) {
            metaInput.addEventListener('input', () => {
                const list = document.getElementById('calcProductList');
                _updateUI(list?._filteredProductos || productosConConfig);
            });
        }

        document.getElementById('calcLimpiarBtn')?.addEventListener('click', () => {
            _pedidoActual = {};
            if (searchInput) searchInput.value = '';
            if (rubroFilter) rubroFilter.value = '';
            currentSearch = ''; currentRubro = '';
            rerender();
            _updateUI(productosConConfig);
        });

        document.getElementById('calcConfigBtn')?.addEventListener('click', _showConfigAdmin);
    }

    // ─── VISTA CONFIGURACIÓN ADMIN ────────────────────────────────────────────
    function _showConfigAdmin() {
        let searchTerm = '';
        let filterRubro = '';

        // Usar el mismo orden del inventario en la config
        const rubros = [...new Set(_productosCache.map(p => p.rubro).filter(Boolean))].sort();

        const renderConfigList = () => {
            const filtered = _sortProductos(_productosCache.filter(p => {
                const matchSearch = !searchTerm ||
                    (p.presentacion || '').toLowerCase().includes(searchTerm) ||
                    (p.marca || '').toLowerCase().includes(searchTerm);
                const matchRubro = !filterRubro || p.rubro === filterRubro;
                return matchSearch && matchRubro;
            }));

            const listEl = document.getElementById('configProductList');
            if (!listEl) return;

            if (filtered.length === 0) {
                listEl.innerHTML = `<p class="text-center text-gray-400 py-5 text-sm">No se encontraron productos.</p>`;
                return;
            }

            // Agrupar por segmento dentro de cada rubro (igual que el inventario)
            const grupos = {};
            filtered.forEach(p => {
                const key = `${p.rubro || 'SIN RUBRO'} › ${p.segmento || 'SIN SEGMENTO'}`;
                if (!grupos[key]) grupos[key] = [];
                grupos[key].push(p);
            });

            let html = '';
            Object.entries(grupos).forEach(([grupo, prods]) => {
                html += `<div class="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2 pb-0.5 px-1">${grupo}</div>`;
                prods.forEach(p => {
                    const conf = _bultosConfigCache[p.id] || {};
                    const kg = conf.kgPorBulto || '';
                    const unidad = conf.unidad || 'Kg';
                    const configurado = kg > 0;
                    html += `
                    <div class="flex items-center gap-2 bg-gray-50 border ${configurado ? 'border-green-200' : 'border-gray-200'} rounded-lg px-2 py-1.5">
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-gray-800 text-xs truncate">${p.presentacion || 'Sin nombre'}</div>
                            <div class="text-xs text-gray-400">${p.marca || ''}</div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            <input type="number" min="0" step="0.01" placeholder="Kg/blt"
                                data-id="${p.id}" data-field="kg"
                                value="${kg}"
                                class="w-20 px-2 py-1 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400 ${configurado ? 'border-green-400 bg-green-50' : 'border-gray-300'}">
                            <select data-id="${p.id}" data-field="unidad"
                                class="px-1 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300 bg-white">
                                <option value="Kg" ${unidad === 'Kg' ? 'selected' : ''}>Kg</option>
                                <option value="Lts" ${unidad === 'Lts' ? 'selected' : ''}>Lts</option>
                            </select>
                        </div>
                    </div>`;
                });
            });

            listEl.innerHTML = html;
        };

        const content = document.getElementById('calcContent');
        content.innerHTML = `
            <div class="mb-3 flex items-center gap-2">
                <button id="configBackBtn" class="p-1.5 rounded-full hover:bg-gray-100 transition shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <h2 class="text-base font-bold text-gray-800">Configurar Kg/Lts por Bulto</h2>
            </div>
            <p class="text-xs text-gray-500 mb-3">Orden igual al inventario. Deja vacío los que no apliquen.</p>

            <div class="flex gap-2 mb-2">
                <div class="relative flex-1 min-w-0">
                    <input type="text" id="configSearch" placeholder="Buscar producto..."
                        class="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <svg class="absolute left-2 top-2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                </div>
                <select id="configRubroFilter" class="shrink-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[130px]">
                    <option value="">Todos</option>
                    ${rubros.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>

            <div id="configProductList" class="space-y-1.5 max-h-[52vh] overflow-y-auto mb-3"></div>

            <button id="configSaveBtn" class="w-full px-4 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Guardar Configuración
            </button>
            <p id="configSaveMsg" class="text-center text-xs mt-2 h-4"></p>
        `;

        renderConfigList();

        document.getElementById('configBackBtn').addEventListener('click', _renderCalculadora);

        let _configSearchDebounce = null;
        document.getElementById('configSearch').addEventListener('input', e => {
            clearTimeout(_configSearchDebounce);
            _configSearchDebounce = setTimeout(() => {
                searchTerm = e.target.value.toLowerCase().trim();
                renderConfigList();
            }, 180);
        });

        document.getElementById('configRubroFilter').addEventListener('change', e => {
            filterRubro = e.target.value;
            renderConfigList();
        });

        document.getElementById('configSaveBtn').addEventListener('click', async () => {
            const saveBtn = document.getElementById('configSaveBtn');
            const saveMsg = document.getElementById('configSaveMsg');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando...';

            document.querySelectorAll('#configProductList input[data-field="kg"]').forEach(input => {
                const id = input.dataset.id;
                const kg = parseFloat(input.value);
                const selectEl = document.querySelector(`#configProductList select[data-id="${id}"][data-field="unidad"]`);
                const unidad = selectEl ? selectEl.value : 'Kg';
                if (kg > 0) {
                    _bultosConfigCache[id] = { kgPorBulto: kg, unidad };
                } else {
                    delete _bultosConfigCache[id];
                }
            });

            try {
                await _setDoc(_doc(_db, BULTOS_CONFIG_PATH), { productos: _bultosConfigCache });
                saveMsg.textContent = '✅ Guardado correctamente.';
                saveMsg.className = 'text-center text-xs mt-2 text-green-600 font-semibold';
                setTimeout(_renderCalculadora, 1000);
            } catch (e) {
                console.error('Error guardando config calculadora:', e);
                saveMsg.textContent = '❌ Error al guardar.';
                saveMsg.className = 'text-center text-xs mt-2 text-red-600 font-semibold';
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Configuración`;
            }
        });
    }

})();




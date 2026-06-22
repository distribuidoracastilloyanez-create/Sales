// ============================================================
// Módulo: Calculadora de Pedido a Empresa Matriz
// Archivo: calculadora.js
// Descripción: Herramienta para que los vendedores calculen
//              cuántos bultos pedir a la empresa matriz para
//              alcanzar una meta de Kg/Lts en el cierre de mes.
//              El admin configura los Kg/Lts por bulto por producto.
// ============================================================

(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal;
    let _collection, _getDocs, _doc, _getDoc, _setDoc, _writeBatch, _query, _where;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    // Ruta en Firestore donde se guardan los datos de bultos por producto
    // Es una colección pública para que todos los vendedores lean la misma config
    const BULTOS_CONFIG_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/config/calculadora_bultos`;

    // Cache local
    let _productosCache = [];      // Lista de productos del catálogo maestro
    let _bultosConfigCache = {};   // { productoId: { kgPorBulto, unidad } }
    let _pedidoActual = {};        // { productoId: cantidadBultos }

    // ─────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────
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
        console.log("Módulo Calculadora de Pedido Inicializado.");
    };

    // ─────────────────────────────────────────────────────────────────
    // ENTRADA PRINCIPAL
    // ─────────────────────────────────────────────────────────────────
    window.showCalculadoraView = async function() {
        _mainContent.classList.remove('hidden');
        _floatingControls.classList.remove('hidden');
        _pedidoActual = {};
        _mainContent.innerHTML = `
            <div class="p-4 container mx-auto max-w-2xl">
                <div class="bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-6">
                    <div class="flex items-center gap-3 mb-6">
                        <button id="calcBackBtn" class="p-2 rounded-full hover:bg-gray-100 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <h1 class="text-2xl font-bold text-gray-800">Calculadora de Pedido</h1>
                    </div>
                    <div id="calcLoadingState" class="text-center py-12 text-gray-500">
                        <svg class="animate-spin h-8 w-8 mx-auto mb-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando productos...
                    </div>
                    <div id="calcContent" class="hidden"></div>
                </div>
            </div>`;

        document.getElementById('calcBackBtn').addEventListener('click', _showMainMenu);

        await _loadData();
        _renderCalculadora();
    };

    // ─────────────────────────────────────────────────────────────────
    // CARGA DE DATOS
    // ─────────────────────────────────────────────────────────────────
    async function _loadData() {
        try {
            // Cargar catálogo maestro de productos
            const prodSnap = await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`));
            _productosCache = prodSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => p.presentacion)
                .sort((a, b) => {
                    const rA = (a.rubro || '').localeCompare(b.rubro || '');
                    if (rA !== 0) return rA;
                    const sA = (a.segmento || '').localeCompare(b.segmento || '');
                    if (sA !== 0) return sA;
                    return (a.presentacion || '').localeCompare(b.presentacion || '');
                });

            // Cargar config de bultos guardada por el admin
            const confSnap = await _getDoc(_doc(_db, BULTOS_CONFIG_PATH));
            _bultosConfigCache = confSnap.exists() ? (confSnap.data().productos || {}) : {};

        } catch (e) {
            console.error("Error cargando datos calculadora:", e);
            _bultosConfigCache = {};
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // RENDER PRINCIPAL DE LA CALCULADORA (Vista Vendedor)
    // ─────────────────────────────────────────────────────────────────
    function _renderCalculadora() {
        document.getElementById('calcLoadingState').classList.add('hidden');
        const content = document.getElementById('calcContent');
        content.classList.remove('hidden');

        // Filtrar solo productos que tienen config de bultos definida
        const productosConConfig = _productosCache.filter(p => _bultosConfigCache[p.id]?.kgPorBulto > 0);
        const totalProductos = _productosCache.length;
        const configurados = productosConConfig.length;

        const isAdmin = _userRole === 'admin';

        content.innerHTML = `
            <!-- Meta de Kg/Lts -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
                <label class="block text-sm font-bold text-blue-800 mb-1">Meta de Kg/Lts que necesitas cubrir</label>
                <div class="flex items-center gap-3">
                    <input type="number" id="calcMetaKg" min="0" step="0.1" placeholder="Ej: 500"
                        class="flex-1 px-4 py-2 border border-blue-300 rounded-lg text-lg font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <span class="text-blue-700 font-bold text-lg">Kg / Lts</span>
                </div>
            </div>

            <!-- Barra de progreso total -->
            <div class="mb-5">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-bold text-gray-600">Total acumulado en pedido</span>
                    <span id="calcTotalKg" class="text-xl font-black text-green-600">0.00 Kg/Lts</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div id="calcProgressBar" class="h-4 rounded-full transition-all duration-300 bg-green-500" style="width:0%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span id="calcMetaLabel">Meta: —</span>
                </div>
            </div>

            <!-- Búsqueda de producto -->
            <div class="mb-4">
                <div class="relative">
                    <input type="text" id="calcSearchInput" placeholder="Buscar producto..." 
                        class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                </div>
            </div>

            ${configurados === 0 ? `
            <div class="text-center py-8 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                <p class="text-yellow-800 font-bold mb-1">Sin productos configurados</p>
                <p class="text-yellow-700 text-sm">El administrador aún no ha configurado los Kg/Lts por bulto de ningún producto.</p>
            </div>` : ''}

            <!-- Lista de productos -->
            <div id="calcProductList" class="space-y-2 mb-6 max-h-[45vh] overflow-y-auto pr-1"></div>

            <!-- Resumen del pedido -->
            <div id="calcResumen" class="hidden">
                <div class="border-t pt-4 mt-2">
                    <h3 class="font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        Resumen del Pedido
                    </h3>
                    <div id="calcResumenItems" class="space-y-1 text-sm"></div>
                </div>
            </div>

            <!-- Botón limpiar -->
            <div class="flex gap-3 mt-4">
                <button id="calcLimpiarBtn" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition">
                    Limpiar Pedido
                </button>
                ${isAdmin ? `
                <button id="calcConfigBtn" class="flex-1 px-4 py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    Configurar Bultos
                </button>` : ''}
            </div>
            ${!isAdmin && configurados < totalProductos ? `
            <p class="text-xs text-center text-gray-400 mt-3">${configurados} de ${totalProductos} productos configurados. Contacta al administrador para agregar más.</p>
            ` : ''}
        `;

        _renderProductList(productosConConfig);
        _setupEventListeners(productosConConfig);
    }

    // ─────────────────────────────────────────────────────────────────
    // RENDER LISTA DE PRODUCTOS
    // ─────────────────────────────────────────────────────────────────
    function _renderProductList(productos, searchTerm = '') {
        const list = document.getElementById('calcProductList');
        if (!list) return;

        const filtered = searchTerm
            ? productos.filter(p =>
                (p.presentacion || '').toLowerCase().includes(searchTerm) ||
                (p.marca || '').toLowerCase().includes(searchTerm) ||
                (p.rubro || '').toLowerCase().includes(searchTerm))
            : productos;

        if (filtered.length === 0) {
            list.innerHTML = `<p class="text-center text-gray-400 py-6 text-sm">No se encontraron productos${searchTerm ? ' con ese criterio' : ''}.</p>`;
            return;
        }

        list.innerHTML = filtered.map(p => {
            const conf = _bultosConfigCache[p.id] || {};
            const kgPorBulto = conf.kgPorBulto || 0;
            const unidad = conf.unidad || 'Kg';
            const cantidadBultos = _pedidoActual[p.id] || 0;
            const kgEsteProducto = cantidadBultos * kgPorBulto;

            return `
            <div class="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-300 transition">
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-gray-800 text-sm truncate">${p.presentacion || 'Sin nombre'}</div>
                    <div class="text-xs text-gray-500">${p.marca || ''} ${p.segmento ? '· ' + p.segmento : ''}</div>
                    <div class="text-xs font-bold text-blue-600 mt-0.5">${kgPorBulto} ${unidad}/bulto</div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button data-id="${p.id}" data-action="dec"
                        class="w-8 h-8 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-600 font-bold text-lg flex items-center justify-center transition">−</button>
                    <div class="text-center w-16">
                        <div class="text-lg font-black text-gray-800" id="bultos-${p.id}">${cantidadBultos}</div>
                        <div class="text-xs text-gray-400">bulto${cantidadBultos !== 1 ? 's' : ''}</div>
                    </div>
                    <button data-id="${p.id}" data-action="inc"
                        class="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg flex items-center justify-center transition">+</button>
                </div>
                <div class="text-right w-20 shrink-0">
                    <div class="text-sm font-bold ${kgEsteProducto > 0 ? 'text-green-600' : 'text-gray-300'}" id="kg-${p.id}">
                        ${kgEsteProducto > 0 ? kgEsteProducto.toFixed(1) : '—'}
                    </div>
                    <div class="text-xs text-gray-400">${unidad}</div>
                </div>
            </div>`;
        }).join('');

        // Eventos de botones +/−
        list.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                _pedidoActual[id] = Math.max(0, (_pedidoActual[id] || 0) + (action === 'inc' ? 1 : -1));
                if (_pedidoActual[id] === 0) delete _pedidoActual[id];
                _updateUI(filtered);
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // ACTUALIZAR UI (total, barra, resumen) sin re-renderizar la lista
    // ─────────────────────────────────────────────────────────────────
    function _updateUI(productos) {
        let totalKg = 0;
        productos.forEach(p => {
            const conf = _bultosConfigCache[p.id] || {};
            const kgPorBulto = conf.kgPorBulto || 0;
            const unidad = conf.unidad || 'Kg';
            const cantidad = _pedidoActual[p.id] || 0;
            const kgEste = cantidad * kgPorBulto;
            totalKg += kgEste;

            // Actualizar celda del producto individualmente
            const bultosEl = document.getElementById(`bultos-${p.id}`);
            const kgEl = document.getElementById(`kg-${p.id}`);
            if (bultosEl) {
                bultosEl.textContent = cantidad;
                bultosEl.nextElementSibling.textContent = `bulto${cantidad !== 1 ? 's' : ''}`;
            }
            if (kgEl) {
                kgEl.textContent = kgEste > 0 ? kgEste.toFixed(1) : '—';
                kgEl.className = `text-sm font-bold ${kgEste > 0 ? 'text-green-600' : 'text-gray-300'}`;
            }
        });

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
                bar.className = `h-4 rounded-full transition-all duration-300 ${pct >= 100 ? 'bg-green-600' : pct >= 75 ? 'bg-yellow-500' : 'bg-blue-500'}`;
                metaLabel.textContent = `Meta: ${metaVal} Kg/Lts (${pct.toFixed(1)}%)`;
            } else {
                bar.style.width = totalKg > 0 ? '30%' : '0%';
                bar.className = 'h-4 rounded-full transition-all duration-300 bg-blue-400';
                metaLabel.textContent = 'Meta: no definida';
            }
        }

        // Resumen
        _updateResumen(totalKg);
    }

    function _updateResumen(totalKg) {
        const resumenDiv = document.getElementById('calcResumen');
        const resumenItems = document.getElementById('calcResumenItems');
        if (!resumenDiv || !resumenItems) return;

        const itemsPedido = Object.entries(_pedidoActual).filter(([, cant]) => cant > 0);
        if (itemsPedido.length === 0) {
            resumenDiv.classList.add('hidden');
            return;
        }
        resumenDiv.classList.remove('hidden');

        resumenItems.innerHTML = itemsPedido.map(([id, cant]) => {
            const prod = _productosCache.find(p => p.id === id);
            const conf = _bultosConfigCache[id] || {};
            const kg = cant * (conf.kgPorBulto || 0);
            const unidad = conf.unidad || 'Kg';
            return `
            <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-700 truncate flex-1">${prod?.presentacion || 'Producto'}</span>
                <span class="font-bold text-gray-800 ml-2 shrink-0">${cant} bulto${cant !== 1 ? 's' : ''}</span>
                <span class="text-green-600 font-bold ml-3 w-24 text-right shrink-0">= ${kg.toFixed(1)} ${unidad}</span>
            </div>`;
        }).join('') + `
        <div class="flex justify-between items-center pt-2 mt-1">
            <span class="font-black text-gray-800">TOTAL</span>
            <span class="font-black text-green-700 text-lg">${totalKg.toFixed(2)} Kg/Lts</span>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────────────
    // EVENT LISTENERS
    // ─────────────────────────────────────────────────────────────────
    function _setupEventListeners(productosConConfig) {
        // Búsqueda
        const searchInput = document.getElementById('calcSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                _renderProductList(productosConConfig, searchInput.value.toLowerCase().trim());
            });
        }

        // Meta Kg → actualizar barra
        const metaInput = document.getElementById('calcMetaKg');
        if (metaInput) {
            metaInput.addEventListener('input', () => _updateUI(productosConConfig));
        }

        // Limpiar
        document.getElementById('calcLimpiarBtn')?.addEventListener('click', () => {
            _pedidoActual = {};
            if (searchInput) searchInput.value = '';
            _renderProductList(productosConConfig, '');
            _updateUI(productosConConfig);
        });

        // Configurar (solo admin)
        document.getElementById('calcConfigBtn')?.addEventListener('click', () => {
            _showConfigAdmin();
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // VISTA DE CONFIGURACIÓN (solo admin)
    // ─────────────────────────────────────────────────────────────────
    function _showConfigAdmin() {
        let searchTerm = '';
        let filterRubro = '';

        const rubros = [...new Set(_productosCache.map(p => p.rubro).filter(Boolean))].sort();

        const renderConfigList = () => {
            const filtered = _productosCache.filter(p => {
                const matchSearch = !searchTerm ||
                    (p.presentacion || '').toLowerCase().includes(searchTerm) ||
                    (p.marca || '').toLowerCase().includes(searchTerm);
                const matchRubro = !filterRubro || p.rubro === filterRubro;
                return matchSearch && matchRubro;
            });

            const listEl = document.getElementById('configProductList');
            if (!listEl) return;

            if (filtered.length === 0) {
                listEl.innerHTML = `<p class="text-center text-gray-400 py-6 text-sm">No se encontraron productos.</p>`;
                return;
            }

            listEl.innerHTML = filtered.map(p => {
                const conf = _bultosConfigCache[p.id] || {};
                const kg = conf.kgPorBulto || '';
                const unidad = conf.unidad || 'Kg';
                const configurado = kg > 0;
                return `
                <div class="flex items-center gap-2 bg-gray-50 border ${configurado ? 'border-green-200' : 'border-gray-200'} rounded-lg px-3 py-2">
                    <div class="flex-1 min-w-0">
                        <div class="font-semibold text-gray-800 text-sm truncate">${p.presentacion || 'Sin nombre'}</div>
                        <div class="text-xs text-gray-500">${p.rubro || ''} · ${p.marca || ''}</div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <input type="number" min="0" step="0.01" placeholder="Kg/bulto"
                            data-id="${p.id}" data-field="kg"
                            value="${kg}"
                            class="w-24 px-2 py-1 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400 ${configurado ? 'border-green-400 bg-green-50' : 'border-gray-300'}">
                        <select data-id="${p.id}" data-field="unidad"
                            class="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300 bg-white">
                            <option value="Kg" ${unidad === 'Kg' ? 'selected' : ''}>Kg</option>
                            <option value="Lts" ${unidad === 'Lts' ? 'selected' : ''}>Lts</option>
                        </select>
                    </div>
                </div>`;
            }).join('');
        };

        const content = document.getElementById('calcContent');
        content.innerHTML = `
            <div class="mb-4 flex items-center gap-3">
                <button id="configBackBtn" class="p-2 rounded-full hover:bg-gray-100 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <h2 class="text-lg font-bold text-gray-800">Configurar Kg/Lts por Bulto</h2>
            </div>
            <p class="text-sm text-gray-500 mb-4">Define cuántos Kg o Lts tiene cada bulto/caja de la empresa matriz. Deja vacío los productos que no apliquen.</p>

            <!-- Filtros -->
            <div class="flex gap-2 mb-3">
                <div class="relative flex-1">
                    <input type="text" id="configSearch" placeholder="Buscar producto..."
                        class="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <svg class="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                </div>
                <select id="configRubroFilter" class="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Todos los rubros</option>
                    ${rubros.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>

            <!-- Lista -->
            <div id="configProductList" class="space-y-2 max-h-[50vh] overflow-y-auto pr-1 mb-4"></div>

            <!-- Guardar -->
            <button id="configSaveBtn" class="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Guardar Configuración
            </button>
            <p id="configSaveMsg" class="text-center text-sm mt-2 h-5"></p>
        `;

        renderConfigList();

        document.getElementById('configBackBtn').addEventListener('click', () => {
            _renderCalculadora();
        });

        document.getElementById('configSearch').addEventListener('input', e => {
            searchTerm = e.target.value.toLowerCase().trim();
            renderConfigList();
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

            // Recoger todos los valores del DOM
            const inputs = document.querySelectorAll('#configProductList input[data-field="kg"]');
            const selects = document.querySelectorAll('#configProductList select[data-field="unidad"]');

            inputs.forEach(input => {
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
                saveMsg.textContent = '✅ Configuración guardada correctamente.';
                saveMsg.className = 'text-center text-sm mt-2 text-green-600 font-semibold';
                setTimeout(() => {
                    _renderCalculadora();
                }, 1200);
            } catch (e) {
                console.error("Error guardando config calculadora:", e);
                saveMsg.textContent = '❌ Error al guardar. Verifica permisos.';
                saveMsg.className = 'text-center text-sm mt-2 text-red-600 font-semibold';
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Configuración`;
            }
        });
    }

})();

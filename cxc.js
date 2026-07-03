(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal, _collection, _getDocs, _doc, _setDoc, _getDoc, _query, _where, _limit, _orderBy, _deleteDoc;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    const CXC_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/cxc`;
    const TASAS_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/tasas_bcv`;
    
    const LS_KEY_DATE = 'cxc_local_date'; // Mantenemos la fecha en LocalStorage (es pequeña)

    // Variables de Estado
    let _cxcDataCache = null;
    let _tasasCache = {}; 

    // --- MANEJO DE INDEXEDDB (Base de datos local potente) ---
    const DB_NAME = 'DistCastilloDB';
    const STORE_NAME = 'cxc_store';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject("Error abriendo DB local: " + event.target.errorCode);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
        });
    }

    async function saveToLocalDB(data) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], "readwrite");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(data, 'clients_data'); // Guardamos todo bajo una llave
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (e) {
            console.error("Error guardando en IndexedDB:", e);
        }
    }

    async function loadFromLocalDB() {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], "readonly");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get('clients_data');
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (e) {
            console.warn("No se pudo leer IndexedDB (quizás primera vez):", e);
            return null;
        }
    }
    // ---------------------------------------------------------

    window.initCXC = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _doc = dependencies.doc;
        _setDoc = dependencies.setDoc;
        _getDoc = dependencies.getDoc;
        _query = dependencies.query;
        _where = dependencies.where;
        _limit = dependencies.limit;
        _orderBy = dependencies.orderBy;
        _deleteDoc = dependencies.deleteDoc;
        
        console.log("Módulo CXC inicializado (Desglose Estricto según Excel). Public ID:", PUBLIC_DATA_ID);
    };

    window.showCXCView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-6 w-full max-w-4xl mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-xl min-h-[80vh] flex flex-col">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-4 gap-3">
                        <h1 class="text-2xl font-bold text-gray-800 tracking-tight">Cuentas por Cobrar</h1>
                        <div class="flex flex-col items-end text-right w-full md:w-auto space-y-2">
                            <div class="flex gap-2 w-full justify-end">
                                <button id="backToMenuBtn" class="px-4 py-1.5 bg-gray-400 text-white rounded shadow hover:bg-gray-500 text-sm font-semibold transition">Volver</button>
                                ${_userRole === 'admin' ? `
                                <button id="manageTasasBtn" class="px-3 py-1.5 bg-purple-600 text-white rounded shadow hover:bg-purple-700 text-sm font-bold flex items-center gap-1 transition">
                                    <span>💵</span> Tasas BCV
                                </button>
                                ` : ''}
                            </div>
                            <span id="dataStatusLabel" class="text-[10px] font-semibold text-blue-600 block"></span>
                            
                            ${_userRole === 'admin' ? `
                                <button id="updateCXCBtn" class="w-full md:w-auto px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 text-sm font-bold flex justify-center items-center gap-1 transition">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    Cargar Excel CXC
                                </button>
                                <input type="file" id="fileInput" accept=".xlsx, .xls" class="hidden">
                            ` : ''}
                        </div>
                    </div>

                    <div class="mb-4 relative">
                        <input type="text" id="clientSearch" placeholder="Buscar cliente..." class="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 outline-none pl-10 text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute left-3 top-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <div id="cxcListContainer" class="flex-grow overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 p-2 space-y-2.5">
                        <p class="text-center text-gray-500 py-10 animate-pulse font-medium">Cargando datos...</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        
        if (_userRole === 'admin') {
            document.getElementById('manageTasasBtn').addEventListener('click', showTasasBCVManagementView);
            const btn = document.getElementById('updateCXCBtn');
            const input = document.getElementById('fileInput');
            btn.addEventListener('click', () => {
                input.value = ''; 
                input.click();
            });
            input.addEventListener('change', handleFileUpload);
        }

        let _cxcSearchDebounce = null;
        document.getElementById('clientSearch').addEventListener('input', (e) => {
            clearTimeout(_cxcSearchDebounce);
            _cxcSearchDebounce = setTimeout(() => renderCXCList(e.target.value), 200);
        });

        loadTasasBCV();
        await syncAndLoadData();
    };

    // --- GESTIÓN DE TASAS BCV ---
    async function loadTasasBCV() {
        try {
            const tasasRef = _collection(_db, TASAS_COLLECTION_PATH);
            const q = _query(tasasRef);
            const snap = await _getDocs(q);
            _tasasCache = {};
            snap.forEach(doc => { _tasasCache[doc.id] = doc.data().rate; });
        } catch (e) { console.error("Error cargando tasas:", e); }
    }

    // ═══════════════════════════════════════════════════════════
    // TASAS BCV — Vista tipo CALENDARIO
    // ═══════════════════════════════════════════════════════════
    let _calYear, _calMonth; // mes/año actualmente visible en el calendario

    async function showTasasBCVManagementView() {
        const hoy = new Date();
        _calYear  = hoy.getFullYear();
        _calMonth = hoy.getMonth(); // 0-11

        _mainContent.innerHTML = `
            <div class="p-3 pt-8 w-full max-w-lg mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">💵 Tasas BCV</h2>
                        <button onclick="window.showCXCView()" class="px-3 py-1.5 bg-gray-400 text-white text-sm rounded hover:bg-gray-500 font-bold transition">Volver</button>
                    </div>
                    <p class="text-xs text-gray-500 mb-4">Toca un día para registrar o editar su tasa. Los días con tasa aparecen resaltados.</p>

                    <!-- Navegación de mes -->
                    <div class="flex items-center justify-between mb-3 bg-purple-50 rounded-lg p-2 border border-purple-100">
                        <button id="calPrev" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-purple-200 text-purple-700 font-black text-lg transition">‹</button>
                        <div class="text-center">
                            <div id="calMonthLabel" class="font-black text-gray-800 text-base capitalize"></div>
                        </div>
                        <button id="calNext" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-purple-200 text-purple-700 font-black text-lg transition">›</button>
                    </div>

                    <!-- Cabecera de días -->
                    <div class="grid grid-cols-7 gap-1 mb-1">
                        ${['D','L','M','M','J','V','S'].map(d => `<div class="text-center text-[10px] font-black text-gray-400 uppercase py-1">${d}</div>`).join('')}
                    </div>

                    <!-- Grilla del calendario -->
                    <div id="calGrid" class="grid grid-cols-7 gap-1"></div>

                    <!-- Resumen del mes -->
                    <div id="calResumen" class="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500 text-center"></div>

                    <button id="calHoy" class="w-full mt-3 bg-purple-100 text-purple-700 py-2 rounded-lg hover:bg-purple-200 font-bold text-sm transition">📅 Ir al mes actual</button>
                </div>
            </div>
        `;

        document.getElementById('calPrev').addEventListener('click', () => cambiarMesCalendario(-1));
        document.getElementById('calNext').addEventListener('click', () => cambiarMesCalendario(1));
        document.getElementById('calHoy').addEventListener('click', () => {
            const h = new Date();
            _calYear = h.getFullYear(); _calMonth = h.getMonth();
            renderCalendario();
        });

        renderCalendario();
    }

    function cambiarMesCalendario(delta) {
        _calMonth += delta;
        if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
        if (_calMonth > 11) { _calMonth = 0;  _calYear++; }
        renderCalendario();
    }

    function _fechaISO(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    function renderCalendario() {
        const grid  = document.getElementById('calGrid');
        const label = document.getElementById('calMonthLabel');
        if (!grid || !label) return;

        const nombreMes = new Date(_calYear, _calMonth, 1)
            .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        label.textContent = nombreMes;

        const primerDia   = new Date(_calYear, _calMonth, 1).getDay(); // 0=Dom
        const diasEnMes    = new Date(_calYear, _calMonth + 1, 0).getDate();
        const hoyISO       = _fechaISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

        let html = '';
        // Celdas vacías antes del primer día
        for (let i = 0; i < primerDia; i++) html += `<div></div>`;

        let conTasa = 0;
        for (let d = 1; d <= diasEnMes; d++) {
            const iso   = _fechaISO(_calYear, _calMonth, d);
            const tasa  = _tasasCache[iso];
            const tiene = tasa !== undefined && tasa !== null;
            if (tiene) conTasa++;
            const esHoy = iso === hoyISO;

            html += `
                <button data-iso="${iso}" data-dia="${d}"
                    class="cal-day relative flex flex-col items-center justify-center rounded-lg py-1.5 transition
                        ${tiene ? 'bg-purple-600 text-white shadow-sm hover:bg-purple-700' : 'bg-gray-50 text-gray-700 hover:bg-gray-200'}
                        ${esHoy && !tiene ? 'ring-2 ring-purple-400' : ''}
                        ${esHoy && tiene ? 'ring-2 ring-yellow-300' : ''}">
                    <span class="text-sm font-bold leading-none">${d}</span>
                    ${tiene
                        ? `<span class="text-[9px] font-semibold leading-none mt-0.5 opacity-90">${Number(tasa).toFixed(2)}</span>`
                        : `<span class="text-[9px] leading-none mt-0.5 text-gray-300">—</span>`}
                </button>`;
        }
        grid.innerHTML = html;

        grid.querySelectorAll('.cal-day').forEach(btn => {
            btn.addEventListener('click', () => abrirEditorTasa(btn.dataset.iso));
        });

        const resumen = document.getElementById('calResumen');
        if (resumen) {
            resumen.innerHTML = conTasa > 0
                ? `<span class="font-bold text-purple-700">${conTasa}</span> día(s) con tasa registrada este mes`
                : 'Sin tasas registradas este mes';
        }
    }

    function abrirEditorTasa(iso) {
        const existente = _tasasCache[iso];
        const [y, m, d] = iso.split('-');
        const fechaLegible = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
            .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        document.getElementById('tasaEditorOverlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tasaEditorOverlay';
        overlay.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4';
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                <div class="bg-purple-600 text-white px-4 py-3">
                    <div class="text-xs opacity-80 uppercase tracking-wider">Tasa BCV</div>
                    <div class="font-bold text-base capitalize">${fechaLegible}</div>
                </div>
                <div class="p-5">
                    <label class="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Valor (Bs/USD):</label>
                    <input type="number" id="tasaEditorInput" step="0.0001" inputmode="decimal"
                        value="${existente !== undefined ? existente : ''}"
                        placeholder="0.0000"
                        class="w-full p-3 border-2 border-purple-200 rounded-lg text-lg font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-center">
                    <div class="flex gap-2 mt-4">
                        ${existente !== undefined ? `
                        <button id="tasaEditorDelete" class="px-4 py-2.5 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition text-sm">🗑️ Borrar</button>` : ''}
                        <button id="tasaEditorCancel" class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition text-sm">Cancelar</button>
                        <button id="tasaEditorSave" class="flex-1 px-4 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition text-sm">Guardar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const input = document.getElementById('tasaEditorInput');
        input.focus();
        input.select();

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('tasaEditorCancel').addEventListener('click', () => overlay.remove());

        document.getElementById('tasaEditorSave').addEventListener('click', async () => {
            const rate = parseFloat(input.value);
            if (isNaN(rate) || rate <= 0) {
                input.classList.add('border-red-400', 'ring-2', 'ring-red-300');
                input.focus();
                return;
            }
            const btn = document.getElementById('tasaEditorSave');
            btn.textContent = 'Guardando...'; btn.disabled = true;
            try {
                await _setDoc(_doc(_db, TASAS_COLLECTION_PATH, iso), { rate });
                _tasasCache[iso] = rate;
                overlay.remove();
                renderCalendario();
            } catch (err) {
                _showModal('Error', err.message);
                btn.textContent = 'Guardar'; btn.disabled = false;
            }
        });

        const delBtn = document.getElementById('tasaEditorDelete');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                delBtn.textContent = '...'; delBtn.disabled = true;
                try {
                    await _deleteDoc(_doc(_db, TASAS_COLLECTION_PATH, iso));
                    delete _tasasCache[iso];
                    overlay.remove();
                    renderCalendario();
                } catch (err) {
                    _showModal('Error', err.message);
                    delBtn.textContent = '🗑️ Borrar'; delBtn.disabled = false;
                }
            });
        }
    }


    // --- SINCRONIZACIÓN Y CARGA DE DATOS ---
    async function syncAndLoadData() {
        const statusLabel = document.getElementById('dataStatusLabel');
        
        const localData = await loadFromLocalDB();
        const localDateStr = localStorage.getItem(LS_KEY_DATE);
        
        if (localData) {
            _cxcDataCache = localData;
            updateUI(localDateStr ? new Date(localDateStr) : new Date());
            if (statusLabel) statusLabel.textContent = "⚡ Datos locales (Verificando...)";
        }

        try {
            const metaRef = _doc(_db, CXC_COLLECTION_PATH, 'metadata');
            const metaSnap = await _getDoc(metaRef);
            
            if (metaSnap.exists()) {
                const serverDate = metaSnap.data().updatedAt ? metaSnap.data().updatedAt.toDate() : null;
                const localDate = localDateStr ? new Date(localDateStr) : new Date(0);

                if (serverDate && serverDate > localDate) {
                    if (statusLabel) statusLabel.textContent = "📥 Descargando actualización...";
                    
                    const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
                    const listSnap = await _getDoc(listRef);

                    if (listSnap.exists()) {
                        const data = listSnap.data();
                        _cxcDataCache = data.clients || [];
                        
                        await saveToLocalDB(_cxcDataCache);
                        localStorage.setItem(LS_KEY_DATE, serverDate.toISOString());
                        
                        if (statusLabel) statusLabel.textContent = "✅ Datos actualizados.";
                        updateUI(serverDate);
                    }
                } else {
                    if (statusLabel) statusLabel.textContent = "✅ Al día.";
                }
            }
        } catch (error) {
            console.error("Error conectando al servidor:", error);
            if (!localData) {
                renderError("Sin conexión y sin datos locales.");
            } else if (statusLabel) {
                statusLabel.textContent = "📡 Offline (Datos guardados).";
            }
        }
    }

    function updateUI(dateObj) {
        const label = document.getElementById('lastUpdateLabel');
        if (label && dateObj) label.textContent = `Fecha datos: ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`;
        renderCXCList();
    }

    function renderError(msg) {
        const container = document.getElementById('cxcListContainer');
        if(container) container.innerHTML = `<p class="text-center text-red-500 py-10 font-medium">${msg}</p>`;
    }

    function renderCXCList(searchTerm = '') {
        const container = document.getElementById('cxcListContainer');
        if (!container) return; 

        if (!_cxcDataCache || _cxcDataCache.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-10">Lista vacía o cargando...</p>`;
            return;
        }

        const term = searchTerm.toLowerCase().replace(/\u00A0/g, ' ');
        let filtered = _cxcDataCache.filter(c => c.name.toLowerCase().replace(/\u00A0/g, ' ').includes(term));
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        const totalMatches = filtered.length;
        if (totalMatches > 50 && term.length === 0) filtered = filtered.slice(0, 50);

        if (filtered.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-4 text-sm font-medium">No se encontraron clientes.</p>`;
            return;
        }

        const availableDates = Object.keys(_tasasCache).sort();
        const latestDate = availableDates.length > 0 ? availableDates[availableDates.length - 1] : null;
        const currentRate = latestDate ? _tasasCache[latestDate] : 0;

        let html = '';
        filtered.forEach((client) => {
            const amount = client.amount || 0;
            const amountClass = amount > 0 ? 'text-red-600' : 'text-green-600';
            const amountLabel = amount > 0 ? 'Deuda' : 'Saldo a Favor';
            const bgClass = amount > 0 ? 'bg-white' : 'bg-green-50';
            const safeName = client.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            
            let bsTotalHtml = '';
            if (currentRate > 0 && amount !== 0) {
                const bsTotal = amount * currentRate;
                bsTotalHtml = `<p class="text-[11px] text-gray-500 font-semibold leading-tight mt-0.5">Bs. ${bsTotal.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>`;
            }

            html += `
                <div class="${bgClass} p-3 rounded-lg shadow-sm border border-gray-200 flex flex-col gap-2">
                    <div class="flex justify-between items-start">
                        <div class="max-w-[65%]">
                            <h3 class="font-bold text-gray-800 text-base leading-tight break-words">${client.name}</h3>
                        </div>
                        <div class="text-right">
                            <p class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">${amountLabel}</p>
                            <p class="text-xl font-bold ${amountClass} leading-none mt-0.5">$${Math.abs(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                            ${bsTotalHtml}
                        </div>
                    </div>
                    
                    <div class="flex gap-2 mt-0.5">
                        <button onclick="window.cxcModule.showClientDetailsByName('${safeName}')" 
                            class="flex-1 py-1.5 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 active:bg-blue-800 transition flex justify-center items-center gap-1.5 text-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            Detalle
                        </button>
                        <button onclick="window.cxcModule.handleShareClientHistory('${safeName}')" 
                            class="flex-1 py-1.5 bg-orange-500 text-white font-semibold rounded hover:bg-orange-600 active:bg-orange-700 transition flex justify-center items-center gap-1.5 text-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            Compartir
                        </button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    function showClientDetailsByName(clientName) {
        const client = _cxcDataCache.find(c => c.name === clientName);
        if (!client) return;

        const safeClientName = client.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let rowsHTML = '';
        
        // 1. EXTRAER TRANSACCIONES
        const allTxs = client.transactions || [];
        
        // 2. MATEMÁTICA EXACTA BASADA EN EXCEL
        const deudaTotal = client.amount || 0;
        
        // Extraemos las consignaciones para sumarlas. IMPORTANTE: Las dejamos también en el array 
        // original (allTxs) para que el historial muestre EXACTAMENTE lo que dice el Excel en orden cronológico.
        const consigTxs = allTxs.filter(t => t.type === 'C');
        const totalConsignado = consigTxs.reduce((sum, t) => sum + t.amount, 0);
        
        const totalFacturado = deudaTotal - totalConsignado;

        // Retención pendiente = suma neta de toda la columna retención (todas las filas).
        // Positivas (generadas en ventas) menos negativas (compensadas por el cliente).
        // Solo se muestra si el cliente TIENE historial de retenciones.
        const tieneRetencion = allTxs.some(t => (t.retencion || 0) !== 0);
        const retencionPendiente = allTxs.reduce((sum, t) => sum + (t.retencion || 0), 0);

        if (allTxs.length > 0) {
            // INVERTIMOS EL ARREGLO PARA MOSTRAR LAS MÁS NUEVAS PRIMERO
            const reversedTransactions = [...allTxs].reverse();
            
            reversedTransactions.forEach(t => {
                const reten = t.retencion || 0;
                // Para ventas con retención, el monto FACTURADO es deuda + retención
                const facturado = (t.type === 'F') ? (t.amount + reten) : t.amount;
                const amountClass = facturado > 0 ? 'text-red-600' : 'text-green-600';
                const sign = facturado > 0 ? '+' : '';

                let typeLabel = t.type;
                let actionButton = '';
                let bsAmountHtml = '';
                let retenHtml = '';

                if (t.type === 'F') {
                    typeLabel = '🛒 Venta';
                    // El botón busca por el FACTURADO (deuda + retención) para que el ticket coincida
                    actionButton = `
                        <button onclick="window.cxcModule.searchSaleDetails('${safeClientName}', '${t.date}', ${facturado})" 
                            class="p-1 bg-blue-100 text-blue-700 rounded-full border border-blue-200 hover:bg-blue-200 flex-shrink-0 transition-colors ml-1" title="Ver Detalle de Venta">
                            🔍
                        </button>
                    `;
                    // Recuadro de detalle: retención y neto (el facturado ya se ve grande arriba)
                    if (reten > 0) {
                        const neto = t.amount;
                        retenHtml = `<div class="text-[10px] text-gray-500 font-normal leading-snug mt-1 text-right bg-gray-50 rounded px-1.5 py-0.5 border border-gray-200 inline-block">Retención: <span class="font-bold text-purple-700">-$${reten.toFixed(2)}</span> · Neto: <span class="font-bold text-gray-700">$${neto.toFixed(2)}</span></div>`;
                    }
                } else if (t.type === 'T') typeLabel = '🏦 Transf';
                else if (t.type === 'E') typeLabel = '💵 Efectivo';
                else if (t.type === 'R') typeLabel = '🧾 Retenc';
                else if (t.type === '%') typeLabel = '📉 Dscto';
                else if (t.type === 'C') { 
                    typeLabel = '📦 Consignación';
                    // Nota: Aquí quitamos la lupa individual para las consignaciones.
                    // Ahora la lupa de consignación estará UNIFICADA arriba.
                    actionButton = ``;
                }

                if (t.type === 'T' || t.type === 'E') {
                    const parts = t.date.split('/');
                    if (parts.length === 3) {
                        const day = parts[0].padStart(2, '0');
                        const month = parts[1].padStart(2, '0');
                        const year = parts[2];
                        const isoDate = `${year}-${month}-${day}`;
                        
                        const rate = _tasasCache[isoDate];
                        if (rate) {
                            const absAmount = Math.abs(t.amount);
                            const bsVal = absAmount * rate;
                            bsAmountHtml = `<div class="text-[9px] text-gray-400 font-normal leading-none mt-1 text-right">Tasa: ${rate.toFixed(4)}</div><div class="text-[11px] text-gray-500 font-bold leading-tight text-right">Bs. ${bsVal.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>`;
                        } else {
                            bsAmountHtml = `<div class="text-[9px] text-gray-400 italic mt-1 text-right">Sin tasa registrada</div>`;
                        }
                    }
                }

                rowsHTML += `
                    <tr class="border-b hover:bg-gray-50 text-sm">
                        <td class="py-2 px-2 text-gray-600 whitespace-nowrap align-top text-xs">${t.date}</td>
                        <td class="py-2 px-2 font-medium align-top text-xs ${t.type === 'C' ? 'text-orange-700' : ''}">${typeLabel}</td>
                        <td class="py-2 px-2 align-top text-right">
                            <div class="flex justify-end items-center">
                                <span class="${t.type === 'C' ? 'text-orange-600' : amountClass} font-bold text-sm">${sign}$${facturado.toFixed(2)}</span>
                                ${actionButton}
                            </div>
                            ${retenHtml}
                            ${bsAmountHtml}
                        </td>
                    </tr>
                `;
            });
        } else {
            rowsHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500 text-sm">Sin movimientos recientes.</td></tr>';
        }

        const modalHTML = `
            <div class="text-left">
                <div class="bg-white border border-gray-200 p-4 rounded-lg mb-4 shadow-sm">
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Resumen de Cuenta</p>
                    <h2 class="text-xl font-black text-gray-800 leading-tight mb-4">${client.name}</h2>
                    
                    <div class="space-y-3">
                        <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200">
                            <span class="font-bold text-gray-700 text-sm">${tieneRetencion ? 'DEUDA NETA:' : 'DEUDA TOTAL:'}</span>
                            <span class="font-black text-xl ${deudaTotal > 0 ? 'text-red-600' : 'text-green-600'}">
                                $${deudaTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}
                            </span>
                        </div>
                        ${tieneRetencion ? `
                        <div class="flex justify-between items-center bg-purple-50 p-2 rounded border border-purple-200">
                            <span class="font-bold text-purple-800 text-sm">Retención Pendiente:</span>
                            <span class="font-black text-lg ${retencionPendiente > 0 ? 'text-purple-700' : (retencionPendiente < 0 ? 'text-green-600' : 'text-gray-500')}">
                                $${retencionPendiente.toLocaleString('en-US', {minimumFractionDigits: 2})}
                            </span>
                        </div>` : ''}
                        
                        ${totalConsignado > 0 ? `
                        <div class="flex justify-between items-center px-2">
                            <span class="font-bold text-gray-600 text-sm">Venta Facturada:</span>
                            <span class="font-bold text-lg text-slate-700">$${totalFacturado.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                        
                        <div class="flex justify-between items-center bg-orange-50 p-2 rounded border border-orange-200">
                            <span class="font-bold text-orange-800 text-sm">Consignación:</span>
                            <div class="flex items-center gap-2">
                                <span class="font-black text-lg text-orange-600">$${totalConsignado.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                                <button onclick="window.cxcModule.searchConsolidatedConsignments('${safeClientName}')" class="bg-orange-200 hover:bg-orange-300 text-orange-800 rounded-full p-1.5 shadow-sm transition" title="Ver detalle de consignaciones">
                                    🔍
                                </button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <h3 class="font-bold text-gray-700 mb-1 px-1 text-xs uppercase tracking-wider">Historial del Excel</h3>
                <div class="overflow-y-auto max-h-[45vh] border rounded bg-white shadow-sm">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-gray-200/80 backdrop-blur-sm sticky top-0 z-10">
                            <tr>
                                <th class="py-1.5 px-2 text-[10px] text-gray-600 font-bold uppercase w-1/4 border-b border-gray-300">FECHA</th>
                                <th class="py-1.5 px-2 text-[10px] text-gray-600 font-bold uppercase w-1/4 border-b border-gray-300">TIPO</th>
                                <th class="py-1.5 px-2 text-[10px] text-gray-600 font-bold uppercase text-right w-1/2 border-b border-gray-300">MONTO / DETALLE</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
            </div>
        `;
        _showModal('Estado de Cuenta', modalHTML, null, 'Cerrar');
    }

    // HELPER: Normalizador estricto para comparar textos ignorando acentos y mayúsculas
    function normalizeStr(str) {
        if (!str) return '';
        // Reemplaza non-breaking spaces (\xa0) y otros espacios unicode por espacio normal
        // antes de normalizar, para evitar que clientes del Excel con \xa0 no sean encontrados
        return str
            .replace(/[\u00A0\u200B\u200C\u200D\uFEFF\t]/g, ' ')
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function searchConsolidatedConsignments(clientName) {
        _showModal('Buscando', 'Consolidando inventario en consignación...', null, '', null, false);
        try {
            const client = _cxcDataCache.find(c => c.name === clientName);
            if(!client || !client.transactions) return;
            const cTxs = client.transactions.filter(t => t.type === 'C');
            if(cTxs.length === 0) {
                _showModal('Aviso', 'No hay consignaciones registradas para este cliente.');
                return;
            }

            let userIds = [_userId]; 
            try {
                const usersSnap = await _getDocs(_collection(_db, "users"));
                if (!usersSnap.empty) userIds = usersSnap.docs.map(d => d.id);
            } catch(e) {}

            const normSearchName = normalizeStr(clientName);
            const primaryToken = normalizeStr(clientName.split(' ')[0]);

            let allProducts = {};
            let aggregatedTotal = 0;

            for(const tx of cTxs) {
                const parts = tx.date.trim().split(/[\/\-]/);
                let year=2000, month=0, day=1;
                if(parts.length===3){
                    day = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10) - 1;
                    year = parseInt(parts[2], 10);
                    if (parts[0].length === 4) { year = parseInt(parts[0], 10); month = parseInt(parts[1], 10) - 1; day = parseInt(parts[2], 10); } 
                    else if (year < 100) { year += 2000; }
                }
                const searchDate = new Date(year, month, day);
                const startRange = new Date(searchDate); startRange.setDate(startRange.getDate() - 2); startRange.setHours(0,0,0,0);
                const endRange = new Date(searchDate); endRange.setDate(endRange.getDate() + 2); endRange.setHours(23,59,59,999);

                let foundVenta = null;

                for (const uid of userIds) {
                    if (foundVenta) break;
                    try {
                        const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                        const q = _query(cierresRef, _where("fecha", ">=", startRange), _where("fecha", "<=", endRange));
                        const cierresSnap = await _getDocs(q);
                        for (const doc of cierresSnap.docs) {
                            const cierre = doc.data();
                            const match = (cierre.ventas || []).find(v => {
                                const isAmountMatch = Math.abs(Math.abs(v.total || 0) - Math.abs(tx.amount)) <= 1.0;
                                const isNameMatch = normalizeStr(v.clienteNombre).includes(primaryToken) || normSearchName.includes(normalizeStr(v.clienteNombre));
                                return isAmountMatch && isNameMatch;
                            });
                            if (match) { foundVenta = match; break; }
                        }
                    } catch(e){}
                }

                if(!foundVenta) {
                    for (const uid of userIds) {
                        if (foundVenta) break;
                        try {
                            const ventasActivasSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/ventas`));
                            for (const doc of ventasActivasSnap.docs) {
                                const vData = doc.data();
                                const isAmountMatch = Math.abs(Math.abs(vData.total || 0) - Math.abs(tx.amount)) <= 1.0;
                                const isNameMatch = normalizeStr(vData.clienteNombre).includes(primaryToken) || normSearchName.includes(normalizeStr(vData.clienteNombre));
                                if (isAmountMatch && isNameMatch) { foundVenta = vData; break; }
                            }
                        } catch(e){}
                    }
                }

                if(foundVenta && foundVenta.productos) {
                    aggregatedTotal += foundVenta.total;
                    foundVenta.productos.forEach(p => {
                        if(!allProducts[p.id]) {
                            allProducts[p.id] = { ...p, cantidadVendida: {cj:0,paq:0,und:0}, totalUnidadesVendidas:0 };
                        }
                        allProducts[p.id].cantidadVendida.cj += (p.cantidadVendida?.cj || 0);
                        allProducts[p.id].cantidadVendida.paq += (p.cantidadVendida?.paq || 0);
                        allProducts[p.id].cantidadVendida.und += (p.cantidadVendida?.und || 0);
                        allProducts[p.id].totalUnidadesVendidas += (p.totalUnidadesVendidas || 0);
                    });
                }
            }

            const finalProductsArray = Object.values(allProducts);

            if(finalProductsArray.length === 0) {
                 _showModal('Aviso', `No se pudieron cargar los detalles de los productos consignados para este cliente. Los tickets originales pueden no coincidir en fecha o haber sido eliminados del sistema.`);
                 return;
            }

            const ventaFicticia = {
                cliente: { nombreComercial: clientName, nombrePersonal: '' },
                fecha: new Date(),
                total: aggregatedTotal
            };

            const ticketHTML = window.ventasUI.getTicketHTML(
                ventaFicticia, 
                finalProductsArray, 
                {}, 
                'Resumen de Consignaciones Activas',
                'consignacion'
            );

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '0';
            tempDiv.innerHTML = ticketHTML;
            document.body.appendChild(tempDiv);

            const ticketElement = tempDiv.querySelector('#temp-ticket-for-image') || tempDiv.firstElementChild;
            if(ticketElement) {
                setTimeout(async () => {
                    try {
                        const canvas = await html2canvas(ticketElement, { scale: 2 }); 
                        const dataUrl = canvas.toDataURL('image/png');
                        
                        const modalWrapper = `
                            <div class="flex justify-center items-center w-full bg-gray-100 rounded p-1 mb-4 border border-gray-300">
                                <img src="${dataUrl}" class="w-full max-h-[60vh] object-contain shadow-sm rounded" alt="Recibo Consignaciones" />
                            </div>
                            <button id="btnCompartirReciboConsignacion" class="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                Compartir Resumen
                            </button>
                        `;
                        _showModal('Inventario a Consignación', modalWrapper, null, 'Cerrar');

                        const shareBtn = document.getElementById('btnCompartirReciboConsignacion');
                        if(shareBtn) {
                            shareBtn.onclick = async () => {
                                canvas.toBlob(async (blob) => {
                                    if (!blob) return;
                                    if (navigator.share) {
                                        try { await navigator.share({ files: [new File([blob], `Consignacion_${clientName.replace(/[\s/]/g,'_')}.png`, {type:"image/png"})], title: 'Consignación' }); } catch(e) {}
                                    } else {
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a'); a.href = url; a.download = "Consignacion.png"; a.click();
                                    }
                                });
                            };
                        }
                    } catch(e) {
                         console.error(e);
                         _showModal('Error', 'No se pudo generar la imagen del resumen.');
                    } finally { document.body.removeChild(tempDiv); }
                }, 250);
            }
        } catch(err) {
            _showModal('Error', 'Error al consultar las consignaciones en la base de datos.');
        }
    }

    async function searchSaleDetails(clientName, dateStr, amount) {
        _showModal('Buscando', `Buscando el recibo original...`, null, '', null, false);
        try {
            // 1. OBTENER USUARIOS
            let userIds = [_userId]; 
            try {
                const usersSnap = await _getDocs(_collection(_db, "users"));
                if (!usersSnap.empty) {
                     userIds = usersSnap.docs.map(d => d.id);
                }
            } catch (permError) {
                console.warn("Búsqueda restringida: Buscará solo en sus registros por reglas de seguridad.");
            }

            // 2. PARSEO DE FECHAS ESTRICTO (LATAM: DD/MM/YYYY)
            let searchDate;
            const dateStrClean = dateStr.trim();
            const parts = dateStrClean.split(/[\/\-]/); 
            
            if (parts.length === 3) {
                let day = parseInt(parts[0], 10);
                let month = parseInt(parts[1], 10) - 1; 
                let year = parseInt(parts[2], 10);
                
                if (parts[0].length === 4) {
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10) - 1;
                    day = parseInt(parts[2], 10);
                } else if (year < 100) {
                    year += 2000;
                }
                searchDate = new Date(year, month, day);
            } else {
                searchDate = new Date(dateStrClean);
            }

            if (isNaN(searchDate.getTime())) {
                _showModal('Error', `Formato de fecha inválido para búsqueda: ${dateStr}`);
                return;
            }

            const startRange = new Date(searchDate); startRange.setDate(startRange.getDate() - 2); startRange.setHours(0,0,0,0);
            const endRange = new Date(searchDate); endRange.setDate(endRange.getDate() + 2); endRange.setHours(23,59,59,999);

            const normSearchName = normalizeStr(clientName);
            const primaryToken = normalizeStr(clientName.split(' ')[0]);

            let foundVenta = null;

            for (const uid of userIds) {
                if (foundVenta) break;
                try {
                    const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const q = _query(cierresRef, _where("fecha", ">=", startRange), _where("fecha", "<=", endRange));
                    const cierresSnap = await _getDocs(q);

                    for (const doc of cierresSnap.docs) {
                        const cierre = doc.data();
                        const ventas = cierre.ventas || [];
                        
                        const match = ventas.find(v => {
                            const isAmountMatch = Math.abs(Math.abs(v.total || 0) - Math.abs(amount)) <= 1.0;
                            const vNameNorm = normalizeStr(v.clienteNombre);
                            const isNameMatch = vNameNorm.includes(primaryToken) || normSearchName.includes(vNameNorm);
                            
                            return isAmountMatch && isNameMatch;
                        });

                        if (match) {
                            foundVenta = { ...match, vendedorId: uid, cierreFecha: cierre.fecha };
                            break; 
                        }
                    }
                } catch (err) { }
            }

            if (!foundVenta) {
                for (const uid of userIds) {
                    if (foundVenta) break;
                    try {
                        const ventasActivasRef = _collection(_db, `artifacts/${_appId}/users/${uid}/ventas`);
                        const ventasActivasSnap = await _getDocs(ventasActivasRef);
                        
                        for (const doc of ventasActivasSnap.docs) {
                             const vData = doc.data();
                             const isAmountMatch = Math.abs(Math.abs(vData.total || 0) - Math.abs(amount)) <= 1.0;
                             const vNameNorm = normalizeStr(vData.clienteNombre);
                             const isNameMatch = vNameNorm.includes(primaryToken) || normSearchName.includes(vNameNorm);

                             if (isAmountMatch && isNameMatch) {
                                  foundVenta = { ...vData, id: doc.id, isActiva: true };
                                  break;
                             }
                        }
                    } catch (err) { }
                }
            }

            if (foundVenta) {
                if (window.ventasUI && typeof window.ventasUI.getTicketHTML === 'function') {
                    
                    _showModal('Cargando Recibo', 'Renderizando el recibo original...', null, '', null, false);

                    const productosFormateados = (foundVenta.productos || []).map(p => ({
                        ...p,
                        cantidadVendida: p.cantidadVendida || { cj: 0, paq: 0, und: 0 },
                        totalUnidadesVendidas: p.totalUnidadesVendidas || 0,
                        precios: p.precios || { und: 0, paq: 0, cj: 0 }
                    }));

                    const ventaFicticia = {
                        cliente: { nombreComercial: foundVenta.clienteNombre, nombrePersonal: foundVenta.clienteNombrePersonal || '' },
                        fecha: foundVenta.fecha || foundVenta.cierreFecha || new Date(),
                        total: foundVenta.total
                    };

                    const tipoOperacionValue = foundVenta.tipoOperacion || (foundVenta.origen === 'Consignación' ? 'consignacion' : 'venta');

                    const ticketHTML = window.ventasUI.getTicketHTML(
                        ventaFicticia, 
                        productosFormateados, 
                        foundVenta.vaciosDevueltosPorTipo || {}, 
                        'Recuperación de Venta',
                        tipoOperacionValue 
                    );

                    const tempDiv = document.createElement('div');
                    tempDiv.style.position = 'absolute';
                    tempDiv.style.left = '-9999px';
                    tempDiv.style.top = '0';
                    tempDiv.innerHTML = ticketHTML;
                    document.body.appendChild(tempDiv);

                    const ticketElement = tempDiv.querySelector('#temp-ticket-for-image') || tempDiv.firstElementChild;
                    
                    if (ticketElement) {
                        setTimeout(async () => {
                            try {
                                const canvas = await html2canvas(ticketElement, { scale: 2 }); 
                                const dataUrl = canvas.toDataURL('image/png');
                                
                                const modalWrapper = `
                                    <div class="flex justify-center items-center w-full bg-gray-100 rounded p-1 mb-4 border border-gray-300">
                                        <img src="${dataUrl}" class="w-full max-h-[60vh] object-contain shadow-sm rounded" alt="Recibo de Venta" />
                                    </div>
                                    <button id="btnCompartirReciboEncontrado" class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                        Compartir Ticket
                                    </button>
                                    <button id="btnFacturarReciboEncontrado" class="w-full mt-2 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg border border-blue-200 transition-colors flex justify-center items-center gap-2 text-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 11h4M12 15h4M8 11h.01M8 15h.01" /></svg>
                                        Facturar esta venta →
                                    </button>
                                `;
                                
                                _showModal('Recibo Encontrado', modalWrapper, null, 'Cerrar');
                                
                                const shareBtn = document.getElementById('btnCompartirReciboEncontrado');
                                if(shareBtn) {
                                    shareBtn.onclick = async () => {
                                        canvas.toBlob(async (blob) => {
                                            if (!blob) return;
                                            if (navigator.share && blob) {
                                                try {
                                                    await navigator.share({ 
                                                        files: [new File([blob], `Ticket_${ventaFicticia.cliente.nombreComercial.replace(/[\s/]/g,'_')}.png`, {type:"image/png"})],
                                                        title: 'Ticket'
                                                    });
                                                } catch(e) {}
                                            } else {
                                                const url = URL.createObjectURL(blob);
                                                const link = document.createElement('a'); link.href=url; link.download="Ticket.png"; link.click();
                                            }
                                        });
                                    };
                                }

                                // Enlace a Facturación: pasa esta venta y salta al paso 3 (tipo de facturación)
                                const facturarBtn = document.getElementById('btnFacturarReciboEncontrado');
                                if (facturarBtn) {
                                    facturarBtn.onclick = () => {
                                        window.__ventaDesdeCXC = {
                                            productos:             foundVenta.productos || [],
                                            total:                 foundVenta.total || 0,
                                            clienteId:             foundVenta.clienteId || '',
                                            clienteNombre:         foundVenta.clienteNombre || '',
                                            clienteNombrePersonal: foundVenta.clienteNombrePersonal || '',
                                            clienteRif:            foundVenta.clienteRif || '',
                                            aplicaRetencion:       foundVenta.aplicaRetencion || false
                                        };
                                        if (typeof window.showFacturacionView === 'function') {
                                            // Cerrar el modal del recibo antes de navegar
                                            const m = document.getElementById('modalContainer');
                                            if (m) m.classList.add('hidden');
                                            window.showFacturacionView();
                                        } else {
                                            _showModal('Error', 'El módulo de Facturación no está disponible.');
                                        }
                                    };
                                }
                            } catch (e) {
                                console.error("Error generando imagen:", e);
                                _showModal('Error', 'No se pudo generar la imagen del recibo.');
                            } finally {
                                document.body.removeChild(tempDiv);
                            }
                        }, 250); 
                    } else {
                        document.body.removeChild(tempDiv);
                        _showModal('Error', 'Estructura de ticket no encontrada.');
                    }
                } else {
                    _showModal('Error', 'El módulo de interfaz de ventas no está cargado.');
                }
            } else {
                _showModal('Sin resultados', `No se encontró un ticket en la base de datos para el cliente <b>${primaryToken.toUpperCase()}</b> por <b>$${amount}</b> en las fechas cercanas a <b>${searchDate.toLocaleDateString()}</b>.<br><br>Revise que el monto y la fecha del Excel coincidan con la venta real.`);
            }
        } catch (error) {
            console.error("Search error:", error);
            _showModal('Error', 'Error de conexión buscando la factura.');
        }
    }

    async function handleShareClientHistory(clientName) {
        const client = _cxcDataCache.find(c => c.name === clientName);
        if (!client) return;

        _showModal('Generando', 'Creando imagen del historial...');

        const allTxs = client.transactions || [];
        const consigTxs = allTxs.filter(t => t.type === 'C');
        const normalTxs = allTxs.filter(t => t.type !== 'C');
        
        const totalConsignado = consigTxs.reduce((sum, t) => sum + t.amount, 0);
        const deudaTotal = client.amount || 0;
        const totalFacturado = deudaTotal - totalConsignado;

        const tieneRetencion = allTxs.some(t => (t.retencion || 0) !== 0);
        const retencionPendiente = allTxs.reduce((sum, t) => sum + (t.retencion || 0), 0);

        let last12 = [...allTxs].reverse().slice(0, 12); 

        let rows = '';
        last12.forEach(t => {
            const type = t.type;
            let typeLabel = type;
            let rowColor = '';
            let bsAmount = '';

            if (type === 'F') { typeLabel = '🛒 Venta'; rowColor = 'text-red-600'; }
            else if (type === 'T') { typeLabel = '🏦 Transf'; rowColor = 'text-green-600'; }
            else if (type === 'E') { typeLabel = '💵 Efectivo'; rowColor = 'text-green-600'; }
            else if (type === 'R') { typeLabel = '🧾 Retenc'; rowColor = 'text-green-600'; }
            else if (type === '%') { typeLabel = '📉 Dscto'; rowColor = 'text-blue-600'; }
            else if (type === 'C') { typeLabel = '📦 Consignación'; rowColor = 'text-orange-600'; } 

            if (type === 'T' || type === 'E') {
                const parts = t.date.split('/');
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    const isoDate = `${year}-${month}-${day}`;
                    
                    const rate = _tasasCache[isoDate];
                    if (rate) {
                        const absAmount = Math.abs(t.amount);
                        const bsVal = absAmount * rate;
                        bsAmount = `<div class="text-[10px] text-gray-500 font-normal">Tasa: ${rate.toFixed(4)}</div><div class="text-xs text-gray-600 font-bold">Bs. ${bsVal.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>`;
                    } else {
                        bsAmount = `<div class="text-[10px] text-gray-400 italic">Sin tasa</div>`;
                    }
                }
            }

            rows += `
                <tr class="border-b border-gray-200">
                    <td class="py-2 px-2 text-sm text-gray-700">${t.date}</td>
                    <td class="py-2 px-2 text-sm font-semibold text-gray-800 ${type === 'C' ? 'text-orange-700' : ''}">${typeLabel}</td>
                    <td class="py-2 px-2 text-right">
                        <div class="text-sm font-bold ${rowColor}">$${t.amount.toFixed(2)}</div>
                        ${bsAmount}
                    </td>
                </tr>
            `;
        });

        let breakdownHTML = '';
        if (totalConsignado > 0) {
            breakdownHTML = `
                <div class="flex justify-between items-center mt-3 pt-3 border-t border-gray-300">
                    <div class="text-left">
                        <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Venta Facturada</span>
                        <span class="text-lg font-black text-gray-800">$${totalFacturado.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[9px] text-orange-500 font-bold uppercase tracking-wider block">Consignación</span>
                        <span class="text-lg font-black text-orange-600">$${totalConsignado.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                </div>
            `;
        }

        const htmlContent = `
            <div id="history-ticket" class="bg-white p-6" style="width: 450px; font-family: 'Inter', sans-serif;">
                <div class="text-center border-b-2 border-gray-800 pb-4 mb-4">
                    <h2 class="text-2xl font-bold text-gray-900">DIST. CASTILLO</h2>
                    <p class="text-sm text-gray-500">ESTADO DE CUENTA</p>
                </div>
                <div class="mb-6">
                    <p class="text-xs text-gray-500 uppercase font-bold">CLIENTE</p>
                    <h1 class="text-xl font-bold text-gray-800">${client.name}</h1>
                    <div class="flex flex-col mt-3 bg-gray-100 p-3 rounded border border-gray-200 shadow-sm">
                        <div class="flex justify-between items-end">
                            <span class="font-bold text-gray-800 text-sm">${tieneRetencion ? 'DEUDA NETA:' : 'DEUDA TOTAL:'}</span>
                            <span class="text-2xl font-black ${deudaTotal > 0 ? 'text-red-600' : 'text-green-600'} leading-none">$${deudaTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                        ${tieneRetencion ? `
                        <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-300">
                            <span class="font-bold text-purple-800 text-xs">RETENCIÓN PENDIENTE:</span>
                            <span class="text-lg font-black ${retencionPendiente > 0 ? 'text-purple-700' : (retencionPendiente < 0 ? 'text-green-600' : 'text-gray-500')} leading-none">$${retencionPendiente.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>` : ''}
                        ${breakdownHTML}
                    </div>
                </div>
                <div class="mb-2">
                    <p class="text-xs text-gray-500 font-bold uppercase mb-2 border-b">Últimos Movimientos del Excel</p>
                    <table class="w-full">${rows}</table>
                </div>
                <div class="mt-6 text-center text-xs text-gray-400">Generado el ${new Date().toLocaleDateString()}</div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.innerHTML = htmlContent;
        document.body.appendChild(tempDiv);

        try {
            await new Promise(r => setTimeout(r, 200));
            const canvas = await html2canvas(tempDiv.firstElementChild, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            
            if (navigator.share && blob) {
                const file = new File([blob], `Historial_${client.name.replace(/\s+/g,'_')}.png`, { type: 'image/png' });
                await navigator.share({ files: [file], title: `Estado de Cuenta: ${client.name}` });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `Historial_${client.name}.png`; a.click();
            }
            const m = document.getElementById('modalContainer'); if(m) m.classList.add('hidden');
        } catch (e) {
            console.error(e);
            _showModal('Error', 'No se pudo generar la imagen.');
        } finally {
            document.body.removeChild(tempDiv);
        }
    }

    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        // Validar extensión
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            _showModal('Error', 'El archivo debe ser un Excel (.xlsx o .xls).');
            return;
        }

        _showModal('Procesando', 'Leyendo archivo Excel... Extrayendo historial detallado.');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                let allClients = [];
                let currentClientData = null; // MEMORIA PARA "ARRASTRAR" CLIENTES EN HOJAS SIN CABECERA

                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });
                    if (rows.length < 5) return; 

                    let clientName = "";
                    let totalAmount = 0;
                    let isClientSheet = false;

                    const headerRowIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('CLIENTE'));
                    if (headerRowIndex !== -1 && rows[headerRowIndex][1]) {
                        // Concatenar col[1] + col[2] por si el nombre está partido
                        // en dos celdas (celdas combinadas rotas al exportar a Excel)
                        const part1 = (rows[headerRowIndex][1] || '').toString().trim();
                        const part2 = (rows[headerRowIndex][2] || '').toString().trim();
                        // Si part2 existe y no es un encabezado conocido, concatenar
                        const isHeaderVal = ['TOTALES','FECHA','NOMBRE','DEUDA'].some(h => part2.toUpperCase().startsWith(h));
                        clientName = (part1 + (part2 && !isHeaderVal ? part2 : '')).trim();
                        isClientSheet = true;
                    }
                    if (!clientName) {
                         const nameRowIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('NOMBRE'));
                         if (nameRowIndex !== -1 && rows[nameRowIndex][1]) {
                             const part1 = (rows[nameRowIndex][1] || '').toString().trim();
                             const part2 = (rows[nameRowIndex][2] || '').toString().trim();
                             const isHeaderVal = ['TOTALES','FECHA','NOMBRE','DEUDA'].some(h => part2.toUpperCase().startsWith(h));
                             clientName = (part1 + (part2 && !isHeaderVal ? part2 : '')).trim();
                             isClientSheet = true;
                         }
                    }

                    if (!isClientSheet && !clientName) {
                        const looksLikeDataSheet = rows.slice(0, 3).some(r => {
                            if (!r || !r[0]) return false;
                            const val = r[0].toString().trim();
                            return val.match(/^\d{4}-\d{2}-\d{2}/) || val.match(/^\d{2}\/\d{2}\/\d{4}/);
                        });

                        if (looksLikeDataSheet && currentClientData) {
                            clientName = currentClientData.name;
                            isClientSheet = true;
                        } else {
                            return; 
                        }
                    } else if (isClientSheet && clientName) {
                        currentClientData = { name: clientName, amount: 0, sheetName: sheetName, transactions: [] };
                        allClients.push(currentClientData);
                    }

                    const totalRow = rows.find(r => r[0] && r[0].toString().toUpperCase() === 'TOTALES');
                    if (totalRow) {
                        // El monto (DEUDA Y ABONOS) siempre está en col[2].
                        // Un guion '-' o null significa deuda $0, NO buscar la siguiente columna
                        // (que contiene vacíos y causaría confundir vacíos con deuda).
                        const rawMonto = totalRow[2];
                        const rawStr = (rawMonto == null ? '' : rawMonto.toString()).trim();
                        const isCero = rawStr === '' || rawStr === '-' || rawStr.replace(/[$\s]/g, '') === '-';
                        totalAmount = isCero ? 0 : (parseFloat(rawStr.replace(/[^0-9.-]/g, '')) || 0);
                        if (currentClientData) currentClientData.amount = totalAmount;
                    }

                    let startRowIndex = 0;
                    const tableHeaderIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('FECHA'));
                    if (tableHeaderIndex !== -1) {
                        startRowIndex = tableHeaderIndex + 1;
                    }

                    // Helper para parsear un número de una celda (número o texto)
                    const parseCell = (cell) => {
                        if (cell === null || cell === undefined) return 0;
                        if (typeof cell === 'number') return cell;
                        const v = parseFloat(cell.toString().replace(/[^0-9.-]/g, ''));
                        return isNaN(v) ? 0 : v;
                    };

                    for (let i = startRowIndex; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length < 2) continue;

                        const dateRaw = row[0];
                        if (!dateRaw) continue;

                        let typeRaw = (row[1] || '').toString().trim().toUpperCase();

                        // Dos componentes independientes de cada fila:
                        //   col[2] = deuda/abono   ·   col[6] = retención
                        const montoDeuda   = parseCell(row[2]);
                        const montoReten   = parseCell(row[6]);

                        // Clasificación por CONTENIDO (no por el tipo escrito, que puede
                        // venir mal marcado por error humano):
                        //   - Si col[2] tiene valor → es venta/abono normal.
                        //   - Si col[2] = 0 pero col[6] tiene valor → es una fila de Retención pura.
                        let type;
                        if (typeRaw.startsWith('C') || typeRaw.includes('CONSIG')) {
                            type = 'C';
                        } else if (montoDeuda === 0 && montoReten !== 0) {
                            type = 'R'; // retención pura (aunque el humano la haya dejado sin tipo)
                        } else if (!typeRaw) {
                            type = 'F';
                        } else {
                            type = typeRaw;
                        }

                        // Para filas de retención pura, el "amount" visible es la retención misma.
                        // Para el resto, el amount es la deuda/abono de col[2].
                        let amountVal = (type === 'R') ? montoReten : montoDeuda;

                        // Saltar filas completamente vacías (sin deuda ni retención)
                        if (montoDeuda === 0 && montoReten === 0) continue;

                        if (!currentClientData) continue;

                        // ── Separación de filas MIXTAS ──────────────────────────────
                        // Si es un ABONO (no venta F, no consignación, no retención pura)
                        // que ADEMÁS trae retención, se divide en DOS movimientos:
                        //   1) el abono/transferencia (con su monto de deuda)
                        //   2) la entrega de retención (fila R independiente, misma fecha)
                        // Así el usuario ve por separado cuándo transfirió y cuándo entregó
                        // el comprobante de retención.
                        // Las ventas F NO se separan: ahí la retención es parte del facturado.
                        const esAbono = (type !== 'F' && type !== 'C' && type !== 'R');
                        if (esAbono && montoReten !== 0) {
                            // Se pushea [retención, abono] en orden cronológico para que,
                            // como el historial se muestra invertido (más nuevo arriba),
                            // el abono quede ARRIBA y la retención JUSTO DEBAJO, misma fecha.
                            currentClientData.transactions.push({
                                date: dateRaw.toString(),
                                type: 'R',
                                amount: montoReten,
                                retencion: montoReten
                            });
                            currentClientData.transactions.push({
                                date: dateRaw.toString(),
                                type: type,
                                amount: montoDeuda,
                                retencion: 0
                            });
                        } else {
                            currentClientData.transactions.push({
                                date: dateRaw.toString(),
                                type: type,
                                amount: amountVal,
                                retencion: montoReten  // se guarda SIEMPRE la retención de la fila
                            });
                        }
                    }
                });

                if (allClients.length === 0) { _showModal('Error', 'No se encontraron clientes.'); return; }
                await uploadCXCToFirebase(allClients);

            } catch (error) { console.error("Excel Error:", error); _showModal('Error', 'Error crítico al procesar Excel: ' + error.message); }
        };
        reader.readAsArrayBuffer(file);
        event.target.value = '';
    }

    async function uploadCXCToFirebase(clients) {
        _showModal('Subiendo', `Guardando historial de ${clients.length} clientes...`);
        try {
            const updateDate = new Date();
            await saveToLocalDB(clients); 
            _cxcDataCache = clients;
            localStorage.setItem(LS_KEY_DATE, updateDate.toISOString());

            const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
            try {
                await _setDoc(listRef, { clients: clients });
            } catch (docError) {
                console.warn("No se pudo subir la lista completa a Firestore.", docError);
            }

            const metaRef = _doc(_db, CXC_COLLECTION_PATH, 'metadata');
            await _setDoc(metaRef, { updatedAt: updateDate, updatedBy: _userId, recordCount: clients.length });

            _showModal('Éxito', `Base de datos actualizada.`, showCXCView);
        } catch (error) {
            console.error("Upload error:", error);
            _showModal('Error', `Error al procesar: ${error.message}`);
        }
    }

    window.cxcModule = {
        showClientDetailsByName,
        searchSaleDetails,
        handleShareClientHistory,
        searchConsolidatedConsignments
    };
})();







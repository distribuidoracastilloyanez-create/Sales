(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal, _collection, _getDocs, _doc, _setDoc, _getDoc, _query, _where, _limit, _orderBy, _deleteDoc;

    // CORRECCIÓN: Usar ID global desde config.js para construir la ruta
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    const CXC_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/cxc`;
    const TASAS_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/tasas_bcv`;
    
    // Claves LocalStorage
    const LS_KEY_DATA = 'cxc_local_data';
    const LS_KEY_DATE = 'cxc_local_date';

    // Caché en memoria
    let _cxcDataCache = null;
    let _tasasCache = {}; // Cache de tasas { "YYYY-MM-DD": valor }

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
        
        console.log("Módulo CXC inicializado. Public ID:", PUBLIC_DATA_ID);
    };

    window.showCXCView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8 w-full max-w-4xl mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-xl min-h-[80vh] flex flex-col">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h1 class="text-2xl md:text-3xl font-bold text-gray-800">Cuentas por Cobrar</h1>
                        <div class="flex flex-col items-end text-right w-full md:w-auto space-y-2">
                            <div class="flex gap-2 w-full justify-end">
                                <button id="backToMenuBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg shadow hover:bg-gray-500 text-sm">Volver</button>
                                ${_userRole === 'admin' ? `
                                <button id="manageTasasBtn" class="px-4 py-2 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 text-sm font-bold flex items-center gap-1">
                                    <span>💵</span> Tasas BCV
                                </button>
                                ` : ''}
                            </div>
                            <span id="dataStatusLabel" class="text-xs font-semibold text-blue-600 block"></span>
                            
                            ${_userRole === 'admin' ? `
                                <button id="updateCXCBtn" class="w-full md:w-auto px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 text-sm font-bold flex justify-center items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    Cargar Excel CXC
                                </button>
                                <input type="file" id="fileInput" accept=".xlsx, .xls" class="hidden">
                            ` : ''}
                        </div>
                    </div>

                    <div class="mb-4 relative">
                        <input type="text" id="clientSearch" placeholder="Buscar cliente..." class="w-full px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 outline-none pl-10 text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <div id="cxcListContainer" class="flex-grow overflow-y-auto border rounded-lg bg-gray-50 p-2 space-y-3">
                        <p class="text-center text-gray-500 py-10">Cargando datos...</p>
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

        document.getElementById('clientSearch').addEventListener('input', (e) => renderCXCList(e.target.value));

        // Cargar tasas en segundo plano
        loadTasasBCV();
        await syncAndLoadData();
    };

    // --- NUEVO: GESTIÓN DE TASAS BCV ---
    
    async function loadTasasBCV() {
        try {
            const tasasRef = _collection(_db, TASAS_COLLECTION_PATH);
            const q = _query(tasasRef); // Podríamos limitar a los últimos 3 meses si crece mucho
            const snap = await _getDocs(q);
            _tasasCache = {};
            snap.forEach(doc => {
                _tasasCache[doc.id] = doc.data().rate;
            });
            console.log("Tasas BCV cargadas:", Object.keys(_tasasCache).length);
        } catch (e) {
            console.error("Error cargando tasas:", e);
        }
    }

    async function showTasasBCVManagementView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8 w-full max-w-md mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Tasas BCV Históricas</h2>
                    <p class="text-sm text-gray-600 mb-6 text-center">Registra el valor del dólar BCV por fecha para calcular los pagos históricos.</p>
                    
                    <form id="tasaForm" class="space-y-4 mb-6 border-b pb-6">
                        <div>
                            <label class="block text-sm font-bold text-gray-700">Fecha:</label>
                            <input type="date" id="tasaDate" class="w-full p-2 border rounded" required>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700">Tasa (Bs/USD):</label>
                            <input type="number" id="tasaValue" step="0.01" class="w-full p-2 border rounded" required placeholder="0.00">
                        </div>
                        <button type="submit" class="w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-700 font-bold">Guardar Tasa</button>
                    </form>

                    <div id="tasasList" class="max-h-60 overflow-y-auto space-y-2">
                        <p class="text-center text-gray-500">Cargando...</p>
                    </div>

                    <button onclick="window.showCXCView()" class="w-full mt-6 bg-gray-400 text-white py-2 rounded hover:bg-gray-500">Volver</button>
                </div>
            </div>
        `;

        document.getElementById('tasaDate').valueAsDate = new Date();
        document.getElementById('tasaForm').addEventListener('submit', handleSaveTasa);
        renderTasasList();
    }

    async function handleSaveTasa(e) {
        e.preventDefault();
        const date = document.getElementById('tasaDate').value;
        const rate = parseFloat(document.getElementById('tasaValue').value);

        if (!date || !rate) return;

        _showModal('Guardando', 'Registrando tasa...');
        try {
            await _setDoc(_doc(_db, TASAS_COLLECTION_PATH, date), { rate: rate });
            _tasasCache[date] = rate; // Actualizar cache local
            _showModal('Éxito', 'Tasa guardada correctamente.');
            renderTasasList();
        } catch (err) {
            _showModal('Error', err.message);
        }
    }

    async function handleDeleteTasa(date) {
        _showModal('Confirmar', `¿Borrar tasa del ${date}?`, async () => {
            try {
                await _deleteDoc(_doc(_db, TASAS_COLLECTION_PATH, date));
                delete _tasasCache[date];
                renderTasasList();
                _showModal('Éxito', 'Eliminada.');
            } catch (err) { _showModal('Error', err.message); }
        }, 'Sí, borrar');
    }

    function renderTasasList() {
        const list = document.getElementById('tasasList');
        if (!list) return;

        const dates = Object.keys(_tasasCache).sort().reverse();
        if (dates.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 text-sm">No hay tasas registradas.</p>';
            return;
        }

        list.innerHTML = dates.map(date => `
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded border">
                <span class="font-mono text-sm font-bold text-gray-700">${date}</span>
                <span class="text-purple-700 font-bold">${_tasasCache[date].toFixed(2)} Bs</span>
                <button onclick="window.cxcModule.deleteTasa('${date}')" class="text-red-500 hover:text-red-700 text-xs">🗑️</button>
            </div>
        `).join('');
    }

    // --- FUNCIONES CORE CXC ---

    async function syncAndLoadData() {
        const statusLabel = document.getElementById('dataStatusLabel');
        try {
            const localDateStr = localStorage.getItem(LS_KEY_DATE);
            let localDate = localDateStr ? new Date(localDateStr) : null;
            const metaRef = _doc(_db, CXC_COLLECTION_PATH, 'metadata');
            const metaSnap = await _getDoc(metaRef);
            let serverDate = null;
            let downloadNeeded = true;

            if (metaSnap.exists()) {
                serverDate = metaSnap.data().updatedAt ? metaSnap.data().updatedAt.toDate() : null;
                if (localDate && serverDate && localDate.getTime() === serverDate.getTime()) {
                    downloadNeeded = false;
                }
            } else {
                if (localDate) downloadNeeded = false; 
                else {
                    renderError("No hay datos de CXC disponibles.");
                    return;
                }
            }

            if (downloadNeeded && metaSnap.exists()) {
                if (statusLabel) statusLabel.textContent = "📥 Actualizando...";
                const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
                const listSnap = await _getDoc(listRef);

                if (listSnap.exists()) {
                    const data = listSnap.data();
                    _cxcDataCache = data.clients || [];
                    try {
                        localStorage.setItem(LS_KEY_DATA, JSON.stringify(_cxcDataCache));
                        localStorage.setItem(LS_KEY_DATE, serverDate.toISOString());
                        if (statusLabel) statusLabel.textContent = "✅ Actualizado.";
                    } catch (e) {
                        if (statusLabel) statusLabel.textContent = "⚠️ Memoria llena (Datos online).";
                    }
                    updateUI(serverDate);
                }
            } else {
                if (statusLabel) statusLabel.textContent = "⚡ Datos locales.";
                const localDataRaw = localStorage.getItem(LS_KEY_DATA);
                if (localDataRaw) {
                    _cxcDataCache = JSON.parse(localDataRaw);
                    updateUI(localDate || serverDate);
                } else {
                    localStorage.removeItem(LS_KEY_DATE);
                    renderError("Error caché. Recarga.");
                }
            }
        } catch (error) {
            console.error("Sync Error:", error);
            const localDataRaw = localStorage.getItem(LS_KEY_DATA);
            if (localDataRaw) {
                if (statusLabel) statusLabel.textContent = "📡 Offline.";
                _cxcDataCache = JSON.parse(localDataRaw);
                const localDateStr = localStorage.getItem(LS_KEY_DATE);
                updateUI(localDateStr ? new Date(localDateStr) : new Date());
            } else {
                renderError("Sin conexión.");
            }
        }
    }

    function updateUI(dateObj) {
        if (dateObj) {
            const label = document.getElementById('lastUpdateLabel');
            if (label) label.textContent = `Fecha datos: ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`;
        }
        renderCXCList();
    }

    function renderError(msg) {
        const container = document.getElementById('cxcListContainer');
        if(container) container.innerHTML = `<p class="text-center text-red-500 py-10">${msg}</p>`;
    }

    function renderCXCList(searchTerm = '') {
        const container = document.getElementById('cxcListContainer');
        if (!_cxcDataCache || _cxcDataCache.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-10">Lista vacía.</p>`;
            return;
        }

        const term = searchTerm.toLowerCase();
        let filtered = _cxcDataCache.filter(c => c.name.toLowerCase().includes(term));
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        const totalMatches = filtered.length;
        if (totalMatches > 50 && term.length === 0) filtered = filtered.slice(0, 50);

        if (filtered.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-4">No se encontraron clientes.</p>`;
            return;
        }

        let html = '';
        filtered.forEach((client) => {
            const amount = client.amount || 0;
            const amountClass = amount > 0 ? 'text-red-600' : 'text-green-600';
            const amountLabel = amount > 0 ? 'Deuda' : 'Saldo a Favor';
            const bgClass = amount > 0 ? 'bg-white' : 'bg-green-50';
            
            const safeName = client.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            html += `
                <div class="${bgClass} p-4 rounded-xl shadow-md border border-gray-200 flex flex-col gap-3">
                    <div class="flex justify-between items-start">
                        <div class="max-w-[65%]">
                            <h3 class="font-bold text-gray-800 text-lg leading-tight break-words">${client.name}</h3>
                            ${client.sheetName ? `<span class="text-xs text-gray-400">Ref: ${client.sheetName}</span>` : ''}
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] text-gray-500 uppercase font-bold">${amountLabel}</p>
                            <p class="text-2xl font-bold ${amountClass}">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        </div>
                    </div>
                    
                    <div class="flex gap-2 mt-1">
                        <button onclick="window.cxcModule.showClientDetailsByName('${safeName}')" 
                            class="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition flex justify-center items-center gap-2 shadow-sm text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            Ver Detalle
                        </button>
                        <button onclick="window.cxcModule.handleShareClientHistory('${safeName}')" 
                            class="flex-1 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 active:bg-orange-700 transition flex justify-center items-center gap-2 shadow-sm text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            Compartir
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    // --- GENERACIÓN DE HISTORIAL (IMAGEN) ---
    window.cxcModule.handleShareClientHistory = async function(clientName) {
        const client = _cxcDataCache.find(c => c.name === clientName);
        if (!client) return;

        _showModal('Generando', 'Creando imagen del historial...');

        // 1. Obtener últimas 12 transacciones (asumiendo que vienen ordenadas o están tal cual el excel)
        // Normalmente el Excel viene cronológico, tomamos las últimas del array.
        let txs = client.transactions || [];
        // Si queremos las más recientes y el excel tiene las antiguas primero, tomamos las del final.
        // Si el excel tiene las recientes primero, tomamos las del principio.
        // Asumiremos orden de inserción (antiguas -> recientes). Invertimos para mostrar recientes arriba.
        let last12 = [...txs].reverse().slice(0, 12); 

        // 2. Construir HTML
        let rows = '';
        last12.forEach(t => {
            const type = t.type;
            let typeLabel = type;
            let rowColor = '';
            let bsAmount = '';

            // Clasificación y Cálculo de Bs
            if (type === 'F') { typeLabel = '🛒 Venta'; rowColor = 'text-red-600'; }
            else if (type === 'T') { typeLabel = '🏦 Transf'; rowColor = 'text-green-600'; }
            else if (type === 'E') { typeLabel = '💵 Efectivo'; rowColor = 'text-green-600'; }
            else if (type === 'R') { typeLabel = '🧾 Retenc'; rowColor = 'text-green-600'; }
            else if (type === '%') { typeLabel = '📉 Dscto'; rowColor = 'text-blue-600'; }

            // Cálculo Bs para Pagos (T, E)
            if (type === 'T' || type === 'E') {
                // t.date viene como "dd/mm/yyyy" desde el Excel parser
                // Necesitamos convertir a "yyyy-mm-dd" para buscar en _tasasCache
                const parts = t.date.split('/');
                if (parts.length === 3) {
                    // Excel a veces trae d/m/y sin ceros, aseguramos 0
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    const isoDate = `${year}-${month}-${day}`;
                    
                    const rate = _tasasCache[isoDate];
                    if (rate) {
                        const absAmount = Math.abs(t.amount);
                        const bsVal = absAmount * rate;
                        bsAmount = `<div class="text-[10px] text-gray-500 font-normal">Tasa: ${rate}</div><div class="text-xs text-gray-600 font-bold">Bs. ${bsVal.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>`;
                    } else {
                        bsAmount = `<div class="text-[10px] text-gray-400 italic">Sin tasa</div>`;
                    }
                }
            }

            rows += `
                <tr class="border-b border-gray-200">
                    <td class="py-2 px-2 text-sm text-gray-700">${t.date}</td>
                    <td class="py-2 px-2 text-sm font-semibold text-gray-800">${typeLabel}</td>
                    <td class="py-2 px-2 text-right">
                        <div class="text-sm font-bold ${rowColor}">$${t.amount.toFixed(2)}</div>
                        ${bsAmount}
                    </td>
                </tr>
            `;
        });

        const htmlContent = `
            <div id="history-ticket" class="bg-white p-6" style="width: 450px; font-family: 'Inter', sans-serif;">
                <div class="text-center border-b-2 border-gray-800 pb-4 mb-4">
                    <h2 class="text-2xl font-bold text-gray-900">DIST. CASTILLO</h2>
                    <p class="text-sm text-gray-500">ESTADO DE CUENTA</p>
                </div>
                
                <div class="mb-6">
                    <p class="text-xs text-gray-500 uppercase font-bold">CLIENTE</p>
                    <h1 class="text-xl font-bold text-gray-800">${client.name}</h1>
                    <div class="flex justify-between items-center mt-2 bg-gray-100 p-2 rounded">
                        <span class="font-bold text-gray-600">DEUDA TOTAL:</span>
                        <span class="text-xl font-bold ${client.amount > 0 ? 'text-red-600' : 'text-green-600'}">$${client.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                </div>

                <div class="mb-2">
                    <p class="text-xs text-gray-500 font-bold uppercase mb-2 border-b">Últimos Movimientos</p>
                    <table class="w-full">
                        ${rows}
                    </table>
                </div>
                
                <div class="mt-6 text-center text-xs text-gray-400">
                    Generado el ${new Date().toLocaleDateString()}
                </div>
            </div>
        `;

        // Render oculto y captura
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.innerHTML = htmlContent;
        document.body.appendChild(tempDiv);

        try {
            // Esperar carga de fuentes/estilos
            await new Promise(r => setTimeout(r, 200));
            
            const canvas = await html2canvas(document.getElementById('history-ticket'), {
                scale: 2, // Mejor calidad
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            
            if (navigator.share && blob) {
                const file = new File([blob], `Historial_${client.name.replace(/\s+/g,'_')}.png`, { type: 'image/png' });
                await navigator.share({
                    files: [file],
                    title: `Estado de Cuenta: ${client.name}`,
                    text: `Saldo actual: $${client.amount.toFixed(2)}`
                });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Historial_${client.name}.png`;
                a.click();
            }
            
            const m = document.getElementById('modalContainer');
            if(m) m.classList.add('hidden');

        } catch (e) {
            console.error(e);
            _showModal('Error', 'No se pudo generar la imagen.');
        } finally {
            document.body.removeChild(tempDiv);
        }
    };

    // --- PROCESAMIENTO EXCEL AVANZADO ---
    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        _showModal('Procesando', 'Leyendo archivo Excel... Extrayendo historial detallado.');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                let allClients = [];

                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });
                    
                    if (rows.length < 5) return; 

                    let clientName = "";
                    let totalAmount = 0;
                    let transactions = [];
                    let isClientSheet = false;

                    // 1. Extraer Nombre (Busca "CLIENTE" o "NOMBRE" en la columna 1)
                    const headerRowIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('CLIENTE'));
                    if (headerRowIndex !== -1 && rows[headerRowIndex][1]) {
                        clientName = rows[headerRowIndex][1].toString().trim();
                        isClientSheet = true;
                    }
                    if (!clientName) {
                         const nameRowIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('NOMBRE'));
                         if (nameRowIndex !== -1 && rows[nameRowIndex][1]) {
                             clientName = rows[nameRowIndex][1].toString().trim();
                             isClientSheet = true;
                         }
                    }

                    if (!isClientSheet || !clientName) return;

                    // 2. Extraer Total (Fila TOTALES)
                    const totalRow = rows.find(r => r[0] && r[0].toString().toUpperCase() === 'TOTALES');
                    if (totalRow) {
                        for (let i = 1; i < totalRow.length; i++) {
                            let valStr = (totalRow[i] || '').toString().replace(/[^0-9.-]/g, '');
                            if (valStr && !isNaN(parseFloat(valStr))) {
                                totalAmount = parseFloat(valStr);
                                break; 
                            }
                        }
                    }

                    // 3. Extraer Transacciones (Desde fila FECHA)
                    const tableHeaderIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('FECHA'));
                    
                    if (tableHeaderIndex !== -1) {
                        for (let i = tableHeaderIndex + 1; i < rows.length; i++) {
                            const row = rows[i];
                            if (!row || row.length < 2) continue;

                            const dateRaw = row[0]; // Col 0: Fecha
                            let type = (row[1] || '').toString().trim().toUpperCase(); // Col 1: Tipo
                            
                            // Lógica de Monto: 
                            // Si es Retención (R) -> Columna 6 (Index 6)
                            // Si es Normal -> Columna 2 (Index 2)
                            let amountRaw = 0;
                            if (type === 'R') {
                                amountRaw = row[6]; // Según tu explicación
                            } else {
                                amountRaw = row[2];
                            }

                            // Si hay fecha y monto, procesar
                            if (dateRaw && (amountRaw || amountRaw === 0)) {
                                let amountVal = 0;
                                if (typeof amountRaw === 'number') amountVal = amountRaw;
                                else {
                                    amountVal = parseFloat(amountRaw.toString().replace(/[^0-9.-]/g, ''));
                                }

                                if (!isNaN(amountVal)) {
                                    // Manejo de Signos Especiales
                                    if (type === '%') {
                                        // Descuento: Debe ser negativo
                                        if (amountVal > 0) amountVal = -amountVal;
                                    } else if (type === 'R') {
                                        // Retención: Debe ser negativo
                                        if (amountVal > 0) amountVal = -amountVal;
                                    }
                                    
                                    // T (Transfer), E (Efectivo) ya suelen venir negativos en el Excel
                                    // F (Venta) suele venir positivo.
                                    // Respetamos el signo del Excel para los demás.

                                    transactions.push({
                                        date: dateRaw.toString(),
                                        type: type,
                                        amount: amountVal
                                    });
                                }
                            }
                        }
                    }

                    allClients.push({
                        name: clientName,
                        amount: totalAmount,
                        sheetName: sheetName,
                        transactions: transactions
                    });
                });

                if (allClients.length === 0) {
                    _showModal('Error', 'No se encontraron clientes. Revisa el formato del Excel.');
                    return;
                }

                await uploadCXCToFirebase(allClients);

            } catch (error) {
                console.error("Excel Error:", error);
                _showModal('Error', 'Error crítico al procesar Excel: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
        event.target.value = '';
    }

    async function uploadCXCToFirebase(clients) {
        _showModal('Subiendo', `Guardando historial de ${clients.length} clientes...`);
        try {
            const updateDate = new Date();
            const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
            try {
                await _setDoc(listRef, { clients: clients });
            } catch (docError) {
                if (docError.code === 'invalid-argument' && docError.message.includes('exceeds the maximum')) {
                    throw new Error("Archivo demasiado grande para la base de datos.");
                }
                throw docError;
            }

            const metaRef = _doc(_db, CXC_COLLECTION_PATH, 'metadata');
            await _setDoc(metaRef, { 
                updatedAt: updateDate,
                updatedBy: _userId,
                recordCount: clients.length
            });

            localStorage.setItem(LS_KEY_DATA, JSON.stringify(clients));
            localStorage.setItem(LS_KEY_DATE, updateDate.toISOString());

            _showModal('Éxito', `Base de datos actualizada.`, showCXCView);
        } catch (error) {
            console.error("Upload error:", error);
            _showModal('Error', `Error al subir: ${error.message}`);
        }
    }

    // --- DETALLE DE CLIENTE CON BÚSQUEDA DE VENTAS ---
    window.cxcModule.showClientDetailsByName = function(clientName) {
            const client = _cxcDataCache.find(c => c.name === clientName);
            if (!client) return;

            let rowsHTML = '';
            if (client.transactions && client.transactions.length > 0) {
                client.transactions.forEach(t => {
                    const amountClass = t.amount > 0 ? 'text-red-600' : 'text-green-600';
                    const sign = t.amount > 0 ? '+' : '';
                    
                    let typeLabel = t.type;
                    let actionButton = '';

                    // Si es Venta (F) y es positiva, mostrar botón de búsqueda
                    if (t.type === 'F') {
                        typeLabel = '🛒 Venta';
                        // Botón de búsqueda de detalles
                        actionButton = `
                            <button onclick="window.cxcModule.searchSaleDetails('${client.name}', '${t.date}', ${t.amount})" 
                                class="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded border border-blue-200 hover:bg-blue-200">
                                🔍 Ver Productos
                            </button>
                        `;
                    } else if (t.type === 'T') typeLabel = '🏦 Transf';
                    else if (t.type === 'E') typeLabel = '💵 Efectivo';
                    else if (t.type === 'R') typeLabel = '🧾 Retenc';
                    else if (t.type === '%') typeLabel = '📉 Dscto';

                    rowsHTML += `
                        <tr class="border-b hover:bg-gray-50 text-sm">
                            <td class="py-3 px-2 text-gray-600 whitespace-nowrap">${t.date}</td>
                            <td class="py-3 px-2 font-medium">${typeLabel}</td>
                            <td class="py-3 px-2 text-right">
                                <span class="${amountClass} font-bold block">${sign}$${t.amount.toFixed(2)}</span>
                                ${actionButton}
                            </td>
                        </tr>
                    `;
                });
            } else {
                rowsHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">Sin movimientos detallados.</td></tr>';
            }

            const modalHTML = `
                <div class="text-left">
                    <div class="bg-gray-100 p-4 rounded-lg mb-4 shadow-inner">
                        <p class="text-xs text-gray-500 uppercase tracking-wide">Cliente</p>
                        <h2 class="text-xl font-bold text-gray-800 leading-tight">${client.name}</h2>
                        <div class="flex justify-between mt-3 border-t border-gray-300 pt-2">
                            <span class="font-bold text-gray-600">Saldo Total:</span>
                            <span class="font-bold text-xl ${client.amount > 0 ? 'text-red-600' : 'text-green-600'}">
                                $${client.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}
                            </span>
                        </div>
                    </div>
                    
                    <h3 class="font-bold text-gray-700 mb-2 px-1 text-sm uppercase">Historial de Movimientos</h3>
                    <div class="overflow-y-auto max-h-[50vh] border rounded-lg bg-white">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th class="py-2 px-2 text-xs text-gray-600 font-semibold w-1/4">FECHA</th>
                                    <th class="py-2 px-2 text-xs text-gray-600 font-semibold w-1/4">TIPO</th>
                                    <th class="py-2 px-2 text-xs text-gray-600 font-semibold text-right w-1/2">MONTO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            _showModal('Estado de Cuenta', modalHTML, null, 'Cerrar');
    };

    // Función para buscar la venta en Firebase
    window.cxcModule.searchSaleDetails = async function(clientName, dateStr, amount) {
        _showModal('Buscando', `Buscando detalle de venta por $${amount.toFixed(2)} del día ${dateStr}...`);
        
        try {
            // 1. Obtener todos los usuarios (vendedores)
            const usersSnap = await _getDocs(_collection(_db, "users"));
            const userIds = usersSnap.docs.map(d => d.id);
            
            let foundVentas = [];
            
            // Parsear fecha del Excel (dd/mm/yyyy o yyyy-mm-dd)
            let searchDate = new Date(dateStr);
            if (isNaN(searchDate.getTime())) {
                const parts = dateStr.split('/');
                if (parts.length === 3) searchDate = new Date(parts[2], parts[1]-1, parts[0]);
            }

            if (isNaN(searchDate.getTime())) {
                _showModal('Error', 'Formato de fecha inválido para búsqueda.');
                return;
            }

            // Rango de búsqueda: +/- 2 días
            const startRange = new Date(searchDate); startRange.setDate(startRange.getDate() - 2);
            const endRange = new Date(searchDate); endRange.setDate(endRange.getDate() + 2);

            for (const uid of userIds) {
                const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                const q = _query(cierresRef, _where("fecha", ">=", startRange), _where("fecha", "<=", endRange));
                const cierresSnap = await _getDocs(q);

                cierresSnap.docs.forEach(doc => {
                    const cierre = doc.data();
                    const ventas = cierre.ventas || [];
                    const matches = ventas.filter(v => Math.abs((v.total || 0) - amount) < 0.5);
                    matches.forEach(m => {
                        foundVentas.push({ ...m, vendedorId: uid, cierreFecha: cierre.fecha });
                    });
                });
            }

            const modal = document.getElementById('modalContainer');
            if(modal) modal.classList.add('hidden');

            if (foundVentas.length > 0) {
                let html = `<div class="text-left space-y-4">`;
                foundVentas.forEach(v => {
                    const fechaVenta = v.fecha && v.fecha.toDate ? v.fecha.toDate().toLocaleString() : 'N/A';
                    const prodsHTML = (v.productos || []).map(p => 
                        `<div class="flex justify-between text-sm border-b border-gray-100 py-1">
                            <span>${p.cantidadVendida?.cj || 0} ${p.presentacion}</span>
                            <span class="font-bold">$${((p.precios?.cj||0)*(p.cantidadVendida?.cj||0) + (p.precios?.paq||0)*(p.cantidadVendida?.paq||0) + (p.precios?.und||0)*(p.cantidadVendida?.und||0)).toFixed(2)}</span>
                         </div>`
                    ).join('');

                    html += `
                        <div class="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <p class="font-bold text-blue-800 border-b border-blue-200 pb-1 mb-2">Venta encontrada: $${v.total.toFixed(2)}</p>
                            <p class="text-xs text-gray-500 mb-2">Fecha Registro: ${fechaVenta}</p>
                            <div class="bg-white p-2 rounded">${prodsHTML}</div>
                        </div>
                    `;
                });
                html += `</div>`;
                setTimeout(() => _showModal('Detalle de Productos', html, null, 'Cerrar'), 300);
            } else {
                setTimeout(() => _showModal('Sin resultados', `No se encontró el desglose digital para esta venta de $${amount}. Es posible que sea una venta manual o de una fecha fuera del rango de búsqueda.`), 300);
            }

        } catch (error) {
            console.error("Search error:", error);
            _showModal('Error', 'Error buscando productos.');
        }
    };
    
    window.cxcModule.deleteTasa = handleDeleteTasa; // Exponer para el onclick

})();

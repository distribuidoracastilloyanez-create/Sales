(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal, _collection, _getDocs, _doc, _setDoc, _getDoc, _query, _where, _limit;

    const CXC_COLLECTION_PATH = 'artifacts/ventas-9a210/public/data/cxc';
    
    // Claves LocalStorage
    const LS_KEY_DATA = 'cxc_local_data';
    const LS_KEY_DATE = 'cxc_local_date';

    // Caché en memoria
    let _cxcDataCache = null;

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
    };

    window.showCXCView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8 w-full max-w-4xl mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-xl min-h-[80vh] flex flex-col">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h1 class="text-2xl md:text-3xl font-bold text-gray-800">Cuentas por Cobrar</h1>
                        <div class="flex flex-col items-end text-right w-full md:w-auto">
                            <button id="backToMenuBtn" class="w-full md:w-auto px-4 py-2 bg-gray-400 text-white rounded-lg shadow hover:bg-gray-500 text-sm mb-2">Volver</button>
                            <span id="dataStatusLabel" class="text-xs font-semibold text-blue-600 mb-1 block"></span>
                            <span id="lastUpdateLabel" class="text-xs text-gray-500 italic block"></span>
                            
                            ${_userRole === 'admin' ? `
                                <button id="updateCXCBtn" class="mt-2 w-full md:w-auto px-4 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 text-sm font-bold flex justify-center items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
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
            const btn = document.getElementById('updateCXCBtn');
            const input = document.getElementById('fileInput');
            btn.addEventListener('click', () => {
                input.value = ''; 
                input.click();
            });
            input.addEventListener('change', handleFileUpload);
        }

        document.getElementById('clientSearch').addEventListener('input', (e) => renderCXCList(e.target.value));

        await syncAndLoadData();
    };

    // --- SINCRONIZACIÓN ---
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
            
            // Escapar comillas en el nombre para el onclick
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
                    
                    <button onclick="window.cxcModule.showClientDetailsByName('${safeName}')" 
                        class="w-full mt-1 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition flex justify-center items-center gap-2 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        VER DETALLE
                    </button>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

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
    window.cxcModule = {
        showClientDetailsByName: (clientName) => {
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
        },

        // Función para buscar la venta en Firebase
        searchSaleDetails: async (clientName, dateStr, amount) => {
            _showModal('Buscando', `Buscando detalle de venta por $${amount.toFixed(2)} del día ${dateStr}...`);
            
            try {
                // 1. Obtener todos los usuarios (vendedores)
                // Esto es pesado, pero necesario si no sabemos quién vendió.
                const usersSnap = await _getDocs(_collection(_db, "users"));
                const userIds = usersSnap.docs.map(d => d.id);
                
                let foundVentas = [];
                
                // Parsear fecha del Excel (dd/mm/yyyy o yyyy-mm-dd)
                // Intentamos crear objetos Date para rango de búsqueda
                let searchDate = new Date(dateStr);
                if (isNaN(searchDate.getTime())) {
                    // Si falla, intentar parseo manual dd/mm/yyyy
                    const parts = dateStr.split('/');
                    if (parts.length === 3) searchDate = new Date(parts[2], parts[1]-1, parts[0]);
                }

                if (isNaN(searchDate.getTime())) {
                    _showModal('Error', 'Formato de fecha inválido para búsqueda.');
                    return;
                }

                // Rango de búsqueda: +/- 2 días para cubrir diferencias de zona horaria o cierre tardío
                const startRange = new Date(searchDate); startRange.setDate(startRange.getDate() - 2);
                const endRange = new Date(searchDate); endRange.setDate(endRange.getDate() + 2);

                for (const uid of userIds) {
                    const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const q = _query(cierresRef, _where("fecha", ">=", startRange), _where("fecha", "<=", endRange));
                    const cierresSnap = await _getDocs(q);

                    cierresSnap.docs.forEach(doc => {
                        const cierre = doc.data();
                        const ventas = cierre.ventas || [];
                        
                        // Buscar venta con monto similar
                        const matches = ventas.filter(v => {
                            const diff = Math.abs((v.total || 0) - amount);
                            return diff < 0.5; // Margen de 50 centavos
                        });

                        matches.forEach(m => {
                            foundVentas.push({ ...m, vendedorId: uid, cierreFecha: cierre.fecha });
                        });
                    });
                }

                // Ocultar modal de progreso
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
                                <p class="font-bold text-blue-800 border-b border-blue-200 pb-1 mb-2">
                                    Venta encontrada: $${v.total.toFixed(2)}
                                </p>
                                <p class="text-xs text-gray-500 mb-2">Fecha Registro: ${fechaVenta}</p>
                                <div class="bg-white p-2 rounded">
                                    ${prodsHTML}
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                    
                    // Mostrar modal sobre el anterior (o reemplazar contenido)
                    setTimeout(() => _showModal('Detalle de Productos', html, null, 'Cerrar'), 300);
                } else {
                    setTimeout(() => _showModal('Sin resultados', `No se encontró el desglose digital para esta venta de $${amount}. Es posible que sea una venta manual o de una fecha fuera del rango de búsqueda.`), 300);
                }

            } catch (error) {
                console.error("Search error:", error);
                _showModal('Error', 'Error buscando productos.');
            }
        }
    };
})();

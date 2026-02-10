(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal, _collection, _getDocs, _doc, _setDoc, _getDoc, _query, _where, _limit;

    // Rutas de Firebase
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
                <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl min-h-[80vh]">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h1 class="text-3xl font-bold text-gray-800">Cuentas por Cobrar</h1>
                        <div class="flex flex-col items-end text-right">
                            <button id="backToMenuBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg shadow hover:bg-gray-500 text-sm mb-2">Volver al Menú</button>
                            <span id="dataStatusLabel" class="text-xs font-semibold text-blue-600 mb-1"></span>
                            <span id="lastUpdateLabel" class="text-xs text-gray-500 italic"></span>
                            
                            ${_userRole === 'admin' ? `
                                <button id="updateCXCBtn" class="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 text-sm font-bold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    Cargar Excel (XLSX)
                                </button>
                                <!-- Aceptamos Excel, CSV y TXT -->
                                <input type="file" id="fileInput" accept=".xlsx, .xls, .csv, .txt" class="hidden">
                            ` : ''}
                        </div>
                    </div>

                    <div class="mb-6 relative">
                        <input type="text" id="clientSearch" placeholder="Buscar cliente..." class="w-full px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 outline-none pl-10">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <div id="cxcListContainer" class="overflow-y-auto max-h-[60vh] border rounded-lg bg-gray-50 p-2">
                        <p class="text-center text-gray-500 py-10">Verificando datos...</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        
        if (_userRole === 'admin') {
            const btn = document.getElementById('updateCXCBtn');
            const input = document.getElementById('fileInput');
            btn.addEventListener('click', () => {
                input.value = ''; // Limpiar previo para permitir re-selección
                input.click();
            });
            input.addEventListener('change', handleFileUpload);
        }

        document.getElementById('clientSearch').addEventListener('input', (e) => renderCXCList(e.target.value));

        await syncAndLoadData();
    };

    // --- MANEJO DE ARCHIVOS (EXCEL / CSV) ---
    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        _showModal('Procesando', 'Leyendo archivo... Esto puede tardar unos segundos.');

        const reader = new FileReader();

        // Detectar tipo de archivo
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        
        if (isExcel) {
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    let allClients = [];

                    // Iterar sobre todas las hojas del Excel
                    workbook.SheetNames.forEach(sheetName => {
                        // Ignorar la hoja de resumen si se llama "Table 1" o similar y solo queremos detalles
                        // Pero como el resumen tiene el ID del cliente, quizás sea útil.
                        // La lógica será: Buscar patrón "CLIENTE" y "TOTALES" en cada hoja.
                        
                        const sheet = workbook.Sheets[sheetName];
                        // Convertir hoja a JSON array de arrays para fácil lectura
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                        
                        let currentClient = null;

                        for (let row of rows) {
                            if (!row || row.length === 0) continue;

                            const firstCol = (row[0] || '').toString().trim();
                            
                            // 1. Detectar CLIENTE
                            // En el Excel convertido, parece que la Columna A tiene "CLIENTE" y la B tiene el nombre
                            if (firstCol === 'CLIENTE') {
                                const name = (row[1] || '').toString().trim();
                                if (name && name.length > 2) {
                                    currentClient = { name: name, amount: 0 };
                                }
                            }
                            // A veces el nombre está en la segunda fila: "NOMBRE", [NOMBRE REAL]
                            else if (firstCol === 'NOMBRE' && !currentClient) {
                                // Fallback por si el formato varía
                                const name = (row[1] || '').toString().trim();
                                if (name && name.length > 2) {
                                    currentClient = { name: name, amount: 0 };
                                }
                            }

                            // 2. Detectar TOTALES
                            // En el Excel, suele ser "TOTALES" en Col A y el monto en Col C (índice 2)
                            if (firstCol === 'TOTALES' && currentClient) {
                                // Buscar el valor numérico en la fila. Usualmente columna index 2 (C)
                                let amount = 0;
                                // A veces está en la columna 2, a veces en la 3. Buscamos el primer número válido.
                                for (let i = 2; i < row.length; i++) {
                                    const val = row[i];
                                    if (typeof val === 'number') {
                                        amount = val;
                                        break;
                                    } else if (typeof val === 'string') {
                                        // Limpiar "$", "," y espacios
                                        const cleanVal = val.replace(/[^0-9.-]/g, '');
                                        if (cleanVal && !isNaN(parseFloat(cleanVal))) {
                                            amount = parseFloat(cleanVal);
                                            break;
                                        }
                                    }
                                }
                                currentClient.amount = amount;
                                allClients.push(currentClient);
                                currentClient = null; // Reset para siguiente hoja/bloque
                            }
                        }
                    });

                    if (allClients.length === 0) {
                        _showModal('Error', 'No se encontraron clientes en el Excel. Verifique el formato.');
                        return;
                    }

                    await uploadCXCToFirebase(allClients);

                } catch (error) {
                    console.error("Excel Error:", error);
                    _showModal('Error', 'Error al procesar el Excel.');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Lógica CSV (Fallback para texto plano)
            reader.onload = async (e) => {
                const text = e.target.result;
                const lines = text.split(/\r?\n/);
                let allClients = [];
                let currentClient = null;

                for (let line of lines) {
                    // Limpieza CSV
                    line = line.replace(/^"|"$/g, '').trim(); 
                    if (!line) continue;
                    
                    // Separar por comas (CSV estándar) o tabuladores
                    // Usamos una regex simple para separar por coma considerando posibles comillas
                    const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                    
                    if (columns.length > 0) {
                        const col0 = columns[0].replace(/"/g, '').trim(); // Col A
                        
                        if (col0 === 'CLIENTE') {
                            const name = (columns[1] || '').replace(/"/g, '').trim();
                            if (name) currentClient = { name: name, amount: 0 };
                        }
                        
                        if (col0 === 'TOTALES' && currentClient) {
                            // Buscar monto en columna C (index 2)
                            const valStr = (columns[2] || '').replace(/"/g, '').replace(/[^0-9.-]/g, '');
                            const val = parseFloat(valStr);
                            if (!isNaN(val)) {
                                currentClient.amount = val;
                                allClients.push(currentClient);
                                currentClient = null;
                            }
                        }
                    }
                }

                if (allClients.length > 0) {
                    await uploadCXCToFirebase(allClients);
                } else {
                    _showModal('Error', 'No se detectaron datos en el CSV.');
                }
            };
            reader.readAsText(file);
        }
    }

    async function uploadCXCToFirebase(clients) {
        _showModal('Subiendo', `Guardando ${clients.length} registros...`);
        try {
            const updateDate = new Date();
            
            const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
            await _setDoc(listRef, { clients: clients });

            const metaRef = _doc(_db, CXC_COLLECTION_PATH, 'metadata');
            await _setDoc(metaRef, { 
                updatedAt: updateDate,
                updatedBy: _userId,
                recordCount: clients.length
            });

            localStorage.setItem(LS_KEY_DATA, JSON.stringify(clients));
            localStorage.setItem(LS_KEY_DATE, updateDate.toISOString());

            _showModal('Éxito', `CXC Actualizado exitosamente.`, showCXCView);
        } catch (error) {
            console.error("Upload error:", error);
            _showModal('Error', `Error al subir: ${error.message}`);
        }
    }

    // --- LÓGICA DE VISUALIZACIÓN Y SINCRONIZACIÓN (Igual que antes) ---
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
                    renderError("No hay datos de CXC disponibles en el servidor.");
                    return;
                }
            }

            if (downloadNeeded && metaSnap.exists()) {
                if (statusLabel) statusLabel.textContent = "📥 Descargando actualización...";
                const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
                const listSnap = await _getDoc(listRef);

                if (listSnap.exists()) {
                    const data = listSnap.data();
                    _cxcDataCache = data.clients || [];
                    try {
                        localStorage.setItem(LS_KEY_DATA, JSON.stringify(_cxcDataCache));
                        localStorage.setItem(LS_KEY_DATE, serverDate.toISOString());
                        if (statusLabel) statusLabel.textContent = "✅ Datos actualizados.";
                    } catch (e) {
                        if (statusLabel) statusLabel.textContent = "⚠️ Memoria llena, usando versión online.";
                    }
                    updateUI(serverDate);
                }
            } else {
                if (statusLabel) statusLabel.textContent = "⚡ Datos locales (Sin consumo).";
                const localDataRaw = localStorage.getItem(LS_KEY_DATA);
                if (localDataRaw) {
                    _cxcDataCache = JSON.parse(localDataRaw);
                    updateUI(localDate || serverDate);
                } else {
                    localStorage.removeItem(LS_KEY_DATE);
                    renderError("Error caché local. Recarga para descargar.");
                }
            }
        } catch (error) {
            console.error("CXC Sync Error:", error);
            const localDataRaw = localStorage.getItem(LS_KEY_DATA);
            if (localDataRaw) {
                if (statusLabel) statusLabel.textContent = "📡 Modo Offline.";
                _cxcDataCache = JSON.parse(localDataRaw);
                const localDateStr = localStorage.getItem(LS_KEY_DATE);
                updateUI(localDateStr ? new Date(localDateStr) : new Date());
            } else {
                renderError("Sin conexión y sin datos.");
            }
        }
    }

    function updateUI(dateObj) {
        if (dateObj) {
            const label = document.getElementById('lastUpdateLabel');
            if (label) label.textContent = `Fecha archivo: ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`;
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
        
        // Ordenar alfabéticamente
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        const totalMatches = filtered.length;
        
        if (totalMatches > 100 && term.length === 0) {
            filtered = filtered.slice(0, 100);
        }

        if (filtered.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-4">No se encontraron clientes.</p>`;
            return;
        }

        let html = '<div class="space-y-3">';
        filtered.forEach(client => {
            const amountClass = client.amount > 0 ? 'text-red-600' : 'text-green-600';
            const amountLabel = client.amount > 0 ? 'Deuda Total' : 'Saldo a Favor';
            const bgClass = client.amount > 0 ? 'bg-white' : 'bg-green-50';
            
            html += `
                <div class="${bgClass} p-4 rounded-lg shadow border border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-gray-800 text-sm md:text-base">${client.name}</h3>
                    </div>
                    <div class="text-right cursor-pointer" onclick="window.cxcModule.handleAmountClick('${client.name}', ${client.amount})">
                        <p class="text-[10px] text-gray-500 uppercase">${amountLabel}</p>
                        <p class="text-lg font-bold ${amountClass}">$${client.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        ${client.amount > 0 ? '<p class="text-[10px] text-blue-500 hover:underline">🔍 Ver detalle</p>' : ''}
                    </div>
                </div>
            `;
        });
        
        if (totalMatches > 100 && term.length === 0) {
            html += `<p class="text-center text-xs text-gray-400 mt-4">Mostrando primeros 100 de ${totalMatches}. Usa el buscador.</p>`;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    window.cxcModule = {
        handleAmountClick: async (clientName, amount) => {
            if (amount <= 0) {
                _showModal('Info', 'Este cliente tiene saldo a favor o cero.');
                return;
            }

            _showModal('Buscando Detalle', `Buscando ventas por $${amount.toFixed(2)} para ${clientName}...`);

            try {
                const usersSnap = await _getDocs(_collection(_db, "users"));
                const userIds = usersSnap.docs.map(d => d.id);
                
                let foundVentas = [];
                const fechaLimite = new Date();
                fechaLimite.setDate(fechaLimite.getDate() - 90);

                for (const uid of userIds) {
                    const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const q = _query(cierresRef, _where("fecha", ">=", fechaLimite), _limit(15));
                    const cierresSnap = await _getDocs(q);

                    cierresSnap.docs.forEach(doc => {
                        const cierre = doc.data();
                        const ventas = cierre.ventas || [];
                        
                        const matches = ventas.filter(v => {
                            const montoMatch = Math.abs((v.total || 0) - amount) < 0.5;
                            const vName = (v.clienteNombre || '').toUpperCase();
                            const cNameParts = clientName.toUpperCase().split(' ').filter(p => p.length > 3);
                            const nameMatch = cNameParts.some(part => vName.includes(part));
                            return montoMatch || (nameMatch && Math.abs((v.total || 0) - amount) < 5); 
                        });
                        
                        matches.forEach(m => {
                            foundVentas.push({ ...m, vendedorId: uid, cierreFecha: cierre.fecha });
                        });
                    });
                }

                const modal = document.getElementById('modalContainer');
                if(modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');

                if (foundVentas.length > 0) {
                    showFoundVentasModal(clientName, amount, foundVentas);
                } else {
                    _showModal('Sin resultados exactos', `No se encontró una venta digital exacta de $${amount.toFixed(2)} en los últimos 90 días.`);
                }

            } catch (error) {
                console.error("Error searching details:", error);
                _showModal('Error', 'Error al buscar detalles.');
            }
        }
    };

    function showFoundVentasModal(clientName, amount, ventas) {
        let html = `<div class="text-left"><p class="mb-4 text-sm text-gray-600">Posibles coincidencias para <b>${clientName}</b> ($${amount.toFixed(2)}):</p>
        <div class="max-h-60 overflow-y-auto">`;
        
        ventas.forEach(v => {
            const fecha = v.fecha && v.fecha.toDate ? v.fecha.toDate().toLocaleDateString() : 'N/A';
            const prods = (v.productos || []).map(p => `${p.cantidadVendida?.cj || 0} ${p.presentacion}`).join(', ');
            
            html += `
                <div class="border-b py-2 mb-2 hover:bg-gray-50 p-2 rounded">
                    <div class="flex justify-between">
                        <p class="font-bold text-gray-800 text-sm">${v.clienteNombre}</p>
                        <p class="font-bold text-blue-600 text-sm">$${(v.total||0).toFixed(2)}</p>
                    </div>
                    <p class="text-xs text-gray-500">Fecha: ${fecha}</p>
                    <p class="text-xs mt-1 italic text-gray-600 truncate">${prods}</p>
                </div>
            `;
        });
        html += '</div></div>';
        
        _showModal('Detalle de Deuda', html, null, 'Cerrar');
    }

})();

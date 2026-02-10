(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal, _collection, _getDocs, _doc, _setDoc, _getDoc, _query, _where, _limit;

    // Rutas de Firebase
    const CXC_COLLECTION_PATH = 'artifacts/ventas-9a210/public/data/cxc';
    
    // Nombres de claves para LocalStorage (Memoria del teléfono)
    const LS_KEY_DATA = 'cxc_local_data';
    const LS_KEY_DATE = 'cxc_local_date';

    // Caché en memoria RAM
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
                                <button id="updateCXCBtn" class="mt-2 px-4 py-2 bg-orange-600 text-white rounded-lg shadow hover:bg-orange-700 text-sm font-bold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    Cargar Nuevo PDF
                                </button>
                                <input type="file" id="pdfInput" accept=".pdf" class="hidden">
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
            const input = document.getElementById('pdfInput');
            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', handlePDFUpload);
        }

        document.getElementById('clientSearch').addEventListener('input', (e) => renderCXCList(e.target.value));

        await syncAndLoadData();
    };

    /**
     * Lógica de Sincronización Inteligente
     */
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
                console.log("CXC: Nueva versión detectada. Descargando...");

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
                        console.warn("CXC: Memoria llena.", e);
                        if (statusLabel) statusLabel.textContent = "⚠️ Memoria llena, usando versión online.";
                    }
                    updateUI(serverDate);
                }
            } else {
                console.log("CXC: Usando caché local.");
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
                        ${client.code ? `<span class="text-xs text-gray-400">Ref: ${client.code}</span>` : ''}
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

    // --- LÓGICA DE PARSEO AVANZADO (PÁGINAS 7+) ---
    async function handlePDFUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        _showModal('Procesando', 'Analizando PDF detallado (Páginas 7 en adelante)...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            let allClients = [];
            let currentClient = null;
            const START_PAGE = 7; 

            if (pdf.numPages < START_PAGE) {
                _showModal('Error', 'El PDF tiene menos de 7 páginas.');
                return;
            }

            for (let i = START_PAGE; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                // Ordenar elementos por posición Y (arriba -> abajo) y X (izquierda -> derecha)
                const items = textContent.items.map(item => ({
                    str: item.str, y: item.transform[5], x: item.transform[4]
                }));

                items.sort((a, b) => {
                    if (Math.abs(a.y - b.y) > 5) return b.y - a.y; 
                    return a.x - b.x;
                });

                // Reconstruir líneas
                let currentY = null;
                let lines = [];
                let currentLine = "";

                items.forEach(item => {
                    if (currentY === null || Math.abs(item.y - currentY) > 5) {
                        if (currentLine) lines.push(currentLine.trim());
                        currentLine = item.str;
                        currentY = item.y;
                    } else {
                        currentLine += " " + item.str;
                    }
                });
                if (currentLine) lines.push(currentLine.trim());

                // Procesar Líneas
                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine) continue;

                    // 1. Detectar Encabezado de Cliente
                    // Patrón: "1234 NOMBRE DEL CLIENTE" 
                    // Regex Explicación:
                    // ^(\d{1,5}) -> Empieza con 1 a 5 dígitos (Código)
                    // \s+ -> Espacio
                    // ([A-ZÁÉÍÓÚÑ\.\-\s&]{3,}) -> Nombre (Letras mayúsculas, al menos 3 chars)
                    // Evitamos que confunda fechas (dd/mm/yyyy) con códigos
                    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cleanLine)) continue; 

                    // Match relajado: Permite texto basura al final de la línea
                    const headerMatch = cleanLine.match(/^(\d{1,5})\s+([A-ZÁÉÍÓÚÑ\.\-\s&]{3,})/);

                    if (headerMatch && !cleanLine.includes("TOTAL")) {
                        const code = headerMatch[1];
                        const name = headerMatch[2].trim();
                        
                        // Protección adicional: El nombre no debe ser solo números
                        if (isNaN(parseFloat(name)) && name.length > 3) {
                            currentClient = { code: code, name: name, amount: 0 };
                        }
                    }

                    // 2. Detectar Fila de Totales
                    // Buscamos "TOTAL" y extraemos el último número
                    if ((cleanLine.includes("TOTAL") || cleanLine.includes("SALDO")) && currentClient) {
                        // Extraer números (formato 1,234.56 o -50.00)
                        const amounts = cleanLine.match(/-?[\d,]+\.\d{2}|-?[\d\.]+,?\d{2}/g);
                        
                        if (amounts && amounts.length > 0) {
                            // Limpiar comas y convertir a float
                            const numericAmounts = amounts.map(a => parseFloat(a.replace(/,/g, '')));
                            
                            // Asumimos que el saldo final es el ÚLTIMO número de la fila
                            const finalBalance = numericAmounts[numericAmounts.length - 1];
                            
                            if (!isNaN(finalBalance)) {
                                currentClient.amount = finalBalance;
                                allClients.push({ ...currentClient });
                                currentClient = null; 
                            }
                        }
                    }
                }
            }

            if (allClients.length === 0) {
                _showModal('Aviso', 'No se encontraron datos. Verifique que el PDF tenga páginas a partir de la 7 con formato "Código Nombre" y fila "TOTALES".');
                return;
            }

            // GUARDAR EN FIREBASE (Sobreescribir todo)
            _showModal('Subiendo', `Guardando ${allClients.length} registros...`);
            
            const updateDate = new Date();

            const listRef = _doc(_db, CXC_COLLECTION_PATH, 'list');
            await _setDoc(listRef, { clients: allClients }); 

            const metaRef = _doc(_db, CXC_COLLECTION_PATH, 'metadata');
            await _setDoc(metaRef, { 
                updatedAt: updateDate,
                updatedBy: _userId,
                recordCount: allClients.length
            });

            // Actualizar caché local inmediata
            localStorage.setItem(LS_KEY_DATA, JSON.stringify(allClients));
            localStorage.setItem(LS_KEY_DATE, updateDate.toISOString());

            _showModal('Éxito', `CXC Actualizado. ${allClients.length} clientes procesados.`, () => {
                showCXCView();
            });

        } catch (error) {
            console.error("PDF/Upload Error:", error);
            _showModal('Error', `Error: ${error.message}`);
        } finally {
            event.target.value = ''; 
        }
    }

    // --- LÓGICA DE BÚSQUEDA DE VENTAS (Mantiene igual) ---
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

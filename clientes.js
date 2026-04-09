// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo que se inicializarán desde index.html
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDoc, _getDocs, _query, _where, _writeBatch, _runTransaction, _limit; 

    let _clientesCache = []; // Caché local para búsquedas y ediciones rápidas
    let _clientesParaImportar = []; // Caché para la data del Excel a importar

    // Definir rutas usando la configuración global para datos públicos
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    const CLIENTES_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`;
    const SECTORES_COLLECTION_PATH = `artifacts/${PUBLIC_DATA_ID}/public/data/sectores`;

    // --- Tipos de Vacío ---
    const TIPOS_VACIO = ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];

    /**
     * Inicializa el módulo con las dependencias necesarias desde la app principal.
     */
    window.initClientes = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId; 
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _activeListeners = dependencies.activeListeners;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _showAddItemModal = dependencies.showAddItemModal;
        _populateDropdown = dependencies.populateDropdown;
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _getDoc = dependencies.getDoc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
        _writeBatch = dependencies.writeBatch;
        _runTransaction = dependencies.runTransaction;
        _limit = dependencies.limit; 

        console.log("Módulo Clientes inicializado. Public ID:", PUBLIC_DATA_ID); 
    };

    /**
     * Renderiza el menú de subopciones de clientes.
     */
    window.showClientesSubMenu = function() {
         _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                        <div class="space-y-4">
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition">Ver Clientes</button>
                            <button id="agregarClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition">Agregar Cliente</button>
                            <button id="saldosVaciosBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600 transition">Consultar Saldos de Vacíos</button>
                            ${_userRole === 'admin' ? `
                            <button id="editarSaldosVaciosBtn" class="w-full px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition border-2 border-teal-500">✏️ Editar Saldo de Vacíos</button>
                            <button id="funcionesAvanzadasBtn" class="w-full px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 mt-4 transition">Funciones Avanzadas</button>
                            ` : ''}
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">Volver al Menú Principal</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verClientesBtn').addEventListener('click', showVerClientesView);
        document.getElementById('agregarClienteBtn')?.addEventListener('click', showAgregarClienteView);
        if (_userRole === 'admin') {
            document.getElementById('editarSaldosVaciosBtn')?.addEventListener('click', showEditarSaldosVaciosView);
            document.getElementById('funcionesAvanzadasBtn')?.addEventListener('click', showFuncionesAvanzadasView);
        }
        document.getElementById('saldosVaciosBtn').addEventListener('click', showSaldosVaciosView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    // ==========================================
    // NUEVO: SECCIÓN EDITAR SALDO VACÍOS (ADMIN)
    // ==========================================

    function showEditarSaldosVaciosView() {
        if (_userRole !== 'admin') return;
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-5xl">
                    <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-teal-800 mb-2 text-center">Editar Saldos de Vacíos</h2>
                        <p class="text-center text-gray-500 mb-6 text-sm">Busca un cliente para sobrescribir (imponer) un número exacto en su saldo.</p>
                        
                        <input type="text" id="edit-saldo-search-input" placeholder="Buscar cliente por nombre..." class="w-full px-4 py-2 border border-teal-300 rounded-lg mb-4 focus:ring-2 focus:ring-teal-500 outline-none">
                        
                        <div id="editSaldosListContainer" class="overflow-x-auto max-h-[60vh] border rounded bg-gray-50">
                            <p class="text-gray-500 text-center py-8 animate-pulse">Cargando todos los clientes...</p>
                        </div>
                        
                        <button id="backToClientesFromEditSaldosBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('backToClientesFromEditSaldosBtn').addEventListener('click', showClientesSubMenu);
        const searchInput = document.getElementById('edit-saldo-search-input');
        if (searchInput) searchInput.addEventListener('input', renderEditSaldosList);

        // Si la caché está vacía, iniciamos listener
        if (_clientesCache.length === 0) {
            const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
            const unsubscribe = _onSnapshot(clientesRef, (snapshot) => {
                _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderEditSaldosList(); 
            }, (error) => {
                if (error.code === 'permission-denied' || error.code === 'unauthenticated') return;
                console.error("Error cargando clientes:", error);
            });
            _activeListeners.push(unsubscribe);
        } else {
            renderEditSaldosList();
        }
    }

    function renderEditSaldosList() {
        const container = document.getElementById('editSaldosListContainer');
        const searchInput = document.getElementById('edit-saldo-search-input');
        if (!container || !searchInput) return;

        const searchTerm = searchInput.value.toLowerCase();
        
        // Mostrar TODOS los clientes, tengan o no saldo
        let filteredClients = _clientesCache.filter(c => {
             const nameMatch = (c.nombreComercial || '').toLowerCase().includes(searchTerm) || (c.nombrePersonal || '').toLowerCase().includes(searchTerm);
             return nameMatch; 
        });

        filteredClients.sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''));

        if (filteredClients.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 p-8">No se encontraron clientes.</p>`;
            return;
        }

        let tableHTML = `<table class="min-w-full bg-white text-sm">
            <thead class="bg-teal-100 text-teal-800 sticky top-0 z-10"><tr>
                <th class="py-2 px-4 border-b text-left">Cliente</th>`;
        
        TIPOS_VACIO.forEach(tipo => {
             tableHTML += `<th class="py-2 px-4 border-b text-center">${tipo}</th>`;
        });
        tableHTML += `<th class="py-2 px-4 border-b text-center w-24">Acción</th></tr></thead><tbody>`;

        filteredClients.forEach(cliente => {
            const saldoVacios = cliente.saldoVacios || {};
            tableHTML += `<tr class="hover:bg-gray-50 transition">
                <td class="py-2 px-4 border-b font-medium text-gray-800">${cliente.nombreComercial}</td>`;
            
            TIPOS_VACIO.forEach(tipo => {
                const saldo = saldoVacios[tipo] || 0;
                const saldoClass = saldo > 0 ? 'text-red-600 font-bold' : (saldo < 0 ? 'text-green-600 font-bold' : 'text-gray-400');
                 tableHTML += `<td class="py-2 px-4 border-b text-center ${saldoClass}">${saldo}</td>`;
            });

            tableHTML += `
                <td class="py-2 px-4 border-b text-center">
                    <button onclick="window.clientesModule.showEditSaldoModal('${cliente.id}')" class="px-3 py-1.5 bg-teal-500 text-white text-xs font-bold rounded hover:bg-teal-600 shadow-sm transition">Modificar</button>
                </td>
            </tr>`;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }

    function showEditSaldoModal(clienteId) {
        const cliente = _clientesCache.find(c => c.id === clienteId);
        if (!cliente) return;
        const saldoVacios = cliente.saldoVacios || {};
        
        let inputsHTML = '';
        TIPOS_VACIO.forEach(tipo => {
            const currentVal = saldoVacios[tipo] || 0;
            // Quitamos caracteres especiales para el id del input
            const safeId = `override_vacio_${tipo.replace(/[\s\/-]/g, '')}`;
            inputsHTML += `
                <div class="flex justify-between items-center bg-white p-3 rounded border border-gray-200 mb-2 shadow-sm">
                    <label class="font-semibold text-gray-700 w-1/2">${tipo}:</label>
                    <input type="number" id="${safeId}" data-tipo="${tipo}" value="${currentVal}" class="override-vacio-input w-24 px-3 py-1.5 border border-teal-300 rounded focus:ring-2 focus:ring-teal-500 text-center font-bold text-lg">
                </div>
            `;
        });

        const modalContent = `
            <div class="text-left">
                <h3 class="text-xl font-bold text-gray-800 mb-1">Sobrescribir Saldos</h3>
                <p class="text-sm text-gray-600 mb-4 border-b pb-2">Cliente: <span class="font-black text-teal-700">${cliente.nombreComercial}</span></p>
                
                <div class="bg-yellow-50 p-3 border-l-4 border-yellow-400 rounded mb-4">
                    <p class="text-xs text-yellow-800 font-bold mb-1">⚠️ AJUSTE ABSOLUTO</p>
                    <p class="text-xs text-yellow-700">Cambia los números para imponer el saldo exacto actual. Escribe 0 si el cliente no debe ni tiene cajas a favor.</p>
                </div>
                
                <div class="bg-gray-50 p-2 rounded">
                    ${inputsHTML}
                </div>
            </div>
        `;
        
        _showModal('Editar Saldos', modalContent, async () => {
            const newSaldos = {};
            document.querySelectorAll('.override-vacio-input').forEach(input => {
                const tipo = input.dataset.tipo;
                const val = parseInt(input.value, 10);
                newSaldos[tipo] = isNaN(val) ? 0 : val;
            });
            
            _showModal('Progreso', 'Sobrescribiendo saldos en la base de datos...', null, '', null, false);
            try {
                const clienteRef = _doc(_db, CLIENTES_COLLECTION_PATH, clienteId);
                await _setDoc(clienteRef, { saldoVacios: newSaldos }, { merge: true });
                
                const pModal = document.getElementById('modalContainer');
                if(pModal && pModal.querySelector('h3')?.textContent.startsWith('Progreso')) pModal.classList.add('hidden');
                
                setTimeout(() => {
                    _showModal('Éxito', 'Saldos actualizados correctamente.');
                    renderEditSaldosList(); // Refrescar la tabla que está debajo
                }, 300);

            } catch(e) {
                console.error(e);
                _showModal('Error', 'No se pudieron actualizar los saldos: ' + e.message);
            }
            return false; // Evita el cierre automático si la validación asíncrona es lenta
            
        }, 'Guardar Cambios Absolutos', null, true);
    }

    // ==========================================

    /**
     * Muestra la vista de funciones avanzadas.
     */
    function showFuncionesAvanzadasView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Funciones Avanzadas de Clientes</h1>
                        <div class="space-y-4">
                            <button id="importarClientesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Importar Clientes desde Excel/CSV</button>
                            <button id="datosMaestrosSectoresBtn" class="w-full px-6 py-3 bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-yellow-600">Gestionar Sectores</button>
                            <button id="deleteAllClientesBtn" class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700">Eliminar Todos los Clientes</button>
                            <button id="backToClientesMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver a Clientes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('importarClientesBtn').addEventListener('click', showImportarClientesView);
        document.getElementById('datosMaestrosSectoresBtn').addEventListener('click', showDatosMaestrosSectoresView);
        document.getElementById('deleteAllClientesBtn').addEventListener('click', handleDeleteAllClientes);
        document.getElementById('backToClientesMenuBtn').addEventListener('click', showClientesSubMenu);
    }

    /**
     * Muestra la vista para importar clientes desde un archivo Excel.
     */
    function showImportarClientesView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Importar Clientes desde CSV/Excel</h2>
                        <p class="text-center text-gray-600 mb-6">Selecciona un archivo .csv o .xlsx. La primera fila debe contener los encabezados: Sector, Nombre Comercial, Nombre Personal, telefono, CEP, y opcionalmente: Retención IVA, Coordenadas (o X, Y / Latitud, Longitud).</p>
                        <input type="file" id="excel-uploader" accept=".xlsx, .xls, .csv" class="w-full p-4 border-2 border-dashed rounded-lg">
                        <div id="preview-container" class="mt-6 overflow-auto max-h-96"></div>
                        <div id="import-actions" class="mt-6 flex flex-col sm:flex-row gap-4 hidden">
                             <button id="confirmImportBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Confirmar e Importar</button>
                             <button id="cancelImportBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
                        </div>
                         <button id="backToAdvancedFunctionsBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('excel-uploader').addEventListener('change', handleFileUpload);
        document.getElementById('backToAdvancedFunctionsBtn').addEventListener('click', showFuncionesAvanzadasView);
    }

    function parseCSV(text) {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let insideQuotes = false;

        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentCell += '"';
                    i++; 
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                currentRow.push(currentCell.trim());
                currentCell = '';
            } else if (char === '\n' && !insideQuotes) {
                currentRow.push(currentCell.trim());
                if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
                     rows.push(currentRow);
                }
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        if (currentCell || currentRow.length > 0) {
             currentRow.push(currentCell.trim());
             rows.push(currentRow);
        }
        
        return rows;
    }

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        _clientesParaImportar = [];

        const fileName = file.name.toLowerCase();
        const isCSV = fileName.endsWith('.csv') || file.type === 'text/csv';
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        const reader = new FileReader();

        reader.onload = function(e) {
            const data = e.target.result;
            let jsonData = [];

            try {
                if (isCSV) {
                    jsonData = parseCSV(data);
                } else if (isExcel) {
                    if (typeof XLSX !== 'undefined') {
                        const workbook = XLSX.read(data, { type: 'binary' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    } else {
                        throw new Error("La librería para leer Excel (XLSX) no está cargada. Por favor guarda tu archivo como CSV e inténtalo de nuevo.");
                    }
                } else {
                    throw new Error("Formato de archivo no reconocido.");
                }
            } catch (readError) {
                 _showModal('Error de Lectura', readError.message);
                 renderPreviewTable([]); 
                 return;
            }

            if (jsonData.length < 2) {
                _showModal('Error', 'El archivo está vacío o no tiene datos después de la fila de encabezado.');
                renderPreviewTable([]);
                return;
            }

            const headers = jsonData[0].map(h => (h ? h.toString().toLowerCase().trim().replace(/\s+/g, '') : ''));
            const requiredHeaders = ['sector', 'nombrecomercial', 'nombrepersonal', 'telefono', 'cep'];
            // Se agregan los headers opcionales de retención y coordenadas
            const optionalHeaders = ['retencioniva', 'apilicaretencion', 'coordenadas', 'x', 'y', 'latitud', 'longitud', 'lat', 'lon']; 
            const headerMap = {};
            let missingHeader = false;

            requiredHeaders.forEach(rh => {
                const index = headers.indexOf(rh);
                if (index !== -1) {
                    headerMap[rh] = index;
                } else {
                      _showModal('Error', `Falta la columna requerida: "${rh}" (sin espacios) en el archivo.`);
                      missingHeader = true;
                }
            });
             if (missingHeader) {
                 renderPreviewTable([]);
                 return;
             }

            optionalHeaders.forEach(oh => {
                const index = headers.indexOf(oh);
                if (index !== -1) {
                    headerMap[oh] = index;
                }
            });

            _clientesParaImportar = jsonData.slice(1).map((row, rowIndex) => {
                if (row.length <= 1 && (!row[0] || row[0].trim() === '')) return null;

                let coordenadas = '';
                
                if (headerMap['coordenadas'] !== undefined) {
                    coordenadas = (row[headerMap['coordenadas']] || '').toString().trim().replace(/^"|"$/g, '');
                } 
                else if ((headerMap['latitud'] !== undefined || headerMap['lat'] !== undefined) && 
                         (headerMap['longitud'] !== undefined || headerMap['lon'] !== undefined)) {
                    
                    let lat = headerMap['latitud'] !== undefined ? row[headerMap['latitud']] : row[headerMap['lat']];
                    let lon = headerMap['longitud'] !== undefined ? row[headerMap['longitud']] : row[headerMap['lon']];
                    
                    lat = (lat || '').toString().trim();
                    lon = (lon || '').toString().trim();

                    if (lat && lon) {
                        coordenadas = `${lat}, ${lon}`;
                    }
                }
                else if (headerMap['x'] !== undefined && headerMap['y'] !== undefined) {
                    const x = (row[headerMap['x']] || '').toString().trim();
                    const y = (row[headerMap['y']] || '').toString().trim();
                    if (x && y) {
                        coordenadas = `${y}, ${x}`; 
                    }
                }

                // Extracción de estado de Retención IVA
                let aplicaRetencion = false;
                if (headerMap['retencioniva'] !== undefined || headerMap['apilicaretencion'] !== undefined) {
                    const retIndex = headerMap['retencioniva'] !== undefined ? headerMap['retencioniva'] : headerMap['apilicaretencion'];
                    const retValue = (row[retIndex] || '').toString().trim().toUpperCase();
                    if (retValue === 'SI' || retValue === 'SÍ' || retValue === 'TRUE' || retValue === '1') {
                        aplicaRetencion = true;
                    }
                }

                const saldoVaciosInicial = {};
                TIPOS_VACIO.forEach(tipo => saldoVaciosInicial[tipo] = 0);

                const cliente = {
                    sector: (row[headerMap['sector']] || '').toString().trim().toUpperCase(),
                    nombreComercial: (row[headerMap['nombrecomercial']] || '').toString().trim().toUpperCase(), 
                    nombrePersonal: (row[headerMap['nombrepersonal']] || '').toString().trim().toUpperCase(), 
                    telefono: (row[headerMap['telefono']] || '').toString().trim(),
                    codigoCEP: (row[headerMap['cep']] || 'N/A').toString().trim(),
                    coordenadas: coordenadas,
                    aplicaRetencion: aplicaRetencion,
                    saldoVacios: saldoVaciosInicial 
                };
                if (!cliente.codigoCEP) cliente.codigoCEP = 'N/A';
                if (!cliente.nombreComercial && !cliente.nombrePersonal) {
                      console.warn(`Fila ${rowIndex + 2}: Faltan Nombre Comercial y Nombre Personal. Fila ignorada.`);
                      return null; 
                }
                return cliente;
            }).filter(c => c !== null); 

            renderPreviewTable(_clientesParaImportar);
        };

        reader.onerror = function(e) {
             _showModal('Error de Archivo', 'No se pudo leer el archivo seleccionado.');
             renderPreviewTable([]);
        };

        if (isCSV) {
            reader.readAsText(file, 'UTF-8');
        } else {
            reader.readAsBinaryString(file); 
        }
    }

    function renderPreviewTable(clientes) {
        const container = document.getElementById('preview-container');
        const actionsContainer = document.getElementById('import-actions');
        const backButton = document.getElementById('backToAdvancedFunctionsBtn');
        const uploadInput = document.getElementById('excel-uploader');

        if(!container || !actionsContainer || !backButton || !uploadInput) return;


        if (clientes.length === 0) {
            container.innerHTML = `<p class="text-center text-red-500 p-4">No se encontraron clientes válidos para importar o el archivo está vacío.</p>`;
            actionsContainer.classList.add('hidden');
            backButton.classList.remove('hidden'); 
            return;
        }

        let tableHTML = `<div class="p-4">
                            <h3 class="font-bold text-lg mb-2">Vista Previa (${clientes.length} clientes a importar)</h3>
                            <table class="min-w-full bg-white text-xs">
                                <thead class="bg-gray-200 sticky top-0"><tr>
                                    <th class="py-1 px-2 text-left">Sector</th>
                                    <th class="py-1 px-2 text-left">N. Comercial</th>
                                    <th class="py-1 px-2 text-left">N. Personal</th>
                                    <th class="py-1 px-2 text-left">Teléfono</th>
                                    <th class="py-1 px-2 text-left">CEP</th>
                                    <th class="py-1 px-2 text-left">Retención IVA</th>
                                    <th class="py-1 px-2 text-left">Coordenadas</th>
                                </tr></thead><tbody>`;

        clientes.forEach(c => {
            tableHTML += `<tr class="border-b">
                <td class="py-1 px-2">${c.sector}</td>
                <td class="py-1 px-2">${c.nombreComercial}</td>
                <td class="py-1 px-2">${c.nombrePersonal}</td>
                <td class="py-1 px-2">${c.telefono}</td>
                <td class="py-1 px-2">${c.codigoCEP}</td>
                <td class="py-1 px-2">${c.aplicaRetencion ? 'SI' : 'NO'}</td>
                <td class="py-1 px-2">${c.coordenadas || 'N/A'}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table></div>';
        container.innerHTML = tableHTML;

        actionsContainer.classList.remove('hidden');
        backButton.classList.add('hidden'); 
        document.getElementById('confirmImportBtn').onclick = handleConfirmImport;
        document.getElementById('cancelImportBtn').onclick = () => {
             _clientesParaImportar = [];
             uploadInput.value = ''; 
             container.innerHTML = '';
             actionsContainer.classList.add('hidden');
             backButton.classList.remove('hidden');
        };
    }

    async function handleConfirmImport() {
        if (_clientesParaImportar.length === 0) {
            _showModal('Error', 'No hay clientes válidos para importar.');
            return;
        }

        _showModal('Progreso', `Importando ${_clientesParaImportar.length} clientes...`);

        try {
            const sectoresRef = _collection(_db, SECTORES_COLLECTION_PATH);
            const sectoresSnapshot = await _getDocs(sectoresRef);
            const existingSectores = new Map(sectoresSnapshot.docs.map(doc => [doc.data().name.toUpperCase(), doc.id]));

            const newSectores = new Set(
                _clientesParaImportar
                    .map(c => c.sector)
                    .filter(s => s && !existingSectores.has(s)) 
            );

            const batch = _writeBatch(_db);
            let operations = 0;
            const BATCH_LIMIT = 490; 

            newSectores.forEach(sectorName => {
                const newSectorRef = _doc(sectoresRef);
                batch.set(newSectorRef, { name: sectorName });
                operations++;
            });
            if (operations > 0) {
                 await batch.commit(); 
                 console.log(`Added ${newSectores.size} new sectors.`);
            }

            const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
            let clientBatch = _writeBatch(_db); 
            let clientOperations = 0;
            let clientsAdded = 0;

            for (const cliente of _clientesParaImportar) {
                 const newClienteRef = _doc(clientesRef);
                 clientBatch.set(newClienteRef, cliente);
                 clientOperations++;
                 clientsAdded++;

                 if (clientOperations >= BATCH_LIMIT) {
                     _showModal('Progreso', `Importando clientes (${clientsAdded}/${_clientesParaImportar.length})...`);
                     await clientBatch.commit();
                     clientBatch = _writeBatch(_db); 
                     clientOperations = 0;
                 }
            }

            if (clientOperations > 0) {
                 _showModal('Progreso', `Finalizando importación (${clientsAdded}/${_clientesParaImportar.length})...`);
                 await clientBatch.commit();
            }

            _showModal('Éxito', `Se han importado ${clientsAdded} clientes y ${newSectores.size} nuevos sectores.`);
            showFuncionesAvanzadasView(); 

        } catch (error) {
            console.error("Error during import:", error); 
            _showModal('Error', `Ocurrió un error durante la importación: ${error.message}`);
        } finally {
            _clientesParaImportar = []; 
        }
    }


    function getCurrentCoordinates(inputId) {
        const coordsInput = document.getElementById(inputId);
        if (!coordsInput) return;

        if (navigator.geolocation) {
            const originalPlaceholder = coordsInput.placeholder;
            coordsInput.placeholder = 'Obteniendo...';
            coordsInput.disabled = true;

            navigator.geolocation.getCurrentPosition(position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                coordsInput.value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
                coordsInput.placeholder = originalPlaceholder;
                coordsInput.disabled = false;
            }, error => {
                _showModal('Error de Geolocalización', `No se pudo obtener la ubicación: ${error.message}`);
                coordsInput.placeholder = originalPlaceholder;
                coordsInput.disabled = false;
            }, {
                 enableHighAccuracy: true, 
                 timeout: 10000, 
                 maximumAge: 0 
            });
        } else {
            _showModal('No Soportado', 'La geolocalización no es soportada por este navegador.');
        }
    }


    function showAgregarClienteView() {
         _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Agregar Cliente</h2>
                        <form id="clienteForm" class="space-y-4 text-left">
                            <div>
                                <label for="sector" class="block text-gray-700 font-medium mb-2">Sector:</label>
                                <div class="flex items-center space-x-2">
                                    <select id="sector" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required></select>
                                    <button type="button" id="addSectorBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Agregar</button>
                                </div>
                            </div>
                            <div>
                                <label for="nombreComercial" class="block text-gray-700 font-medium mb-2">Nombre Comercial:</label>
                                <input type="text" id="nombreComercial" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="nombrePersonal" class="block text-gray-700 font-medium mb-2">Nombre Personal:</label>
                                <input type="text" id="nombrePersonal" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="telefono" class="block text-gray-700 font-medium mb-2">Teléfono:</label>
                                <input type="tel" id="telefono" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="codigoCEP" class="block text-gray-700 font-medium mb-2">Código CEP:</label>
                                <div class="flex items-center">
                                    <input type="text" id="codigoCEP" class="w-full px-4 py-2 border rounded-lg">
                                    <input type="checkbox" id="cepNA" class="ml-4 h-5 w-5">
                                    <label for="cepNA" class="ml-2 text-gray-700">No Aplica</label>
                                </div>
                            </div>
                            <div>
                                <label for="coordenadas" class="block text-gray-700 font-medium mb-2">Coordenadas:</label>
                                <div class="flex items-center space-x-2">
                                    <input type="text" id="coordenadas" class="w-full px-4 py-2 border rounded-lg" placeholder="Ej: 8.29, -71.98">
                                    <button type="button" id="getCoordsBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">GPS</button>
                                </div>
                            </div>
                            
                            <div class="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label class="flex items-center space-x-3 cursor-pointer">
                                    <input type="checkbox" id="aplicaRetencion" class="form-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500">
                                    <span class="text-gray-800 font-bold text-sm">Este cliente es agente de Retención de IVA</span>
                                </label>
                                <p class="text-xs text-gray-500 mt-1 ml-8">Márcalo solo si el cliente retiene IVA en sus pagos.</p>
                            </div>

                            <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Cliente</button>
                        </form>
                        <button id="backToClientesBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'sector', 'Sector');

        const cepInput = document.getElementById('codigoCEP');
        const cepNACheckbox = document.getElementById('cepNA');
        cepNACheckbox.addEventListener('change', () => {
            if (cepNACheckbox.checked) {
                cepInput.value = 'N/A';
                cepInput.disabled = true;
            } else {
                cepInput.value = '';
                cepInput.disabled = false;
                cepInput.focus();
            }
        });

        document.getElementById('clienteForm').addEventListener('submit', agregarCliente);
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        document.getElementById('addSectorBtn').addEventListener('click', () => _showAddItemModal(SECTORES_COLLECTION_PATH, 'Sector', 'sector')); 
        document.getElementById('getCoordsBtn').addEventListener('click', () => getCurrentCoordinates('coordenadas'));
    }

    async function agregarCliente(e) {
        e.preventDefault();
        const form = e.target;

        const nombreComercial = form.nombreComercial.value.trim().toUpperCase();
        const nombrePersonal = form.nombrePersonal.value.trim().toUpperCase();
        const sector = form.sector.value.toUpperCase(); 
        const telefono = form.telefono.value.trim();
        const codigoCEP = form.codigoCEP.value.trim();
        const coordenadas = form.coordenadas.value.trim();
        
        // Leer estado de la casilla de retención
        const aplicaRetencion = document.getElementById('aplicaRetencion').checked;

        if (!sector) {
            _showModal('Error', 'Debes seleccionar o agregar un sector.');
            form.sector.focus();
            return;
        }

        const normComercial = nombreComercial.toLowerCase();
        const normPersonal = nombrePersonal.toLowerCase();

         let duplicado = null;
         let motivo = "";
         for (const c of _clientesCache) {
             if (c.nombreComercial.toLowerCase() === normComercial) { duplicado = c; motivo = "nombre comercial"; break; }
             if (c.nombrePersonal.toLowerCase() === normPersonal) { duplicado = c; motivo = "nombre personal"; break; }
             if (c.telefono === telefono) { duplicado = c; motivo = "teléfono"; break; }
             if (codigoCEP && codigoCEP.toLowerCase() !== 'n/a' && c.codigoCEP === codigoCEP) { duplicado = c; motivo = "código CEP"; break; }
         }

        if (!duplicado) {
             try {
                const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
                const qComercial = _query(clientesRef, _where("nombreComercial", "==", nombreComercial));
                const qPersonal = _query(clientesRef, _where("nombrePersonal", "==", nombrePersonal));
                const qTel = _query(clientesRef, _where("telefono", "==", telefono));
                const qCEP = codigoCEP && codigoCEP.toLowerCase() !== 'n/a' ? _query(clientesRef, _where("codigoCEP", "==", codigoCEP)) : null;

                const [snapComercial, snapPersonal, snapTel, snapCEP] = await Promise.all([
                     _getDocs(qComercial), 
                     _getDocs(qPersonal),
                     _getDocs(qTel),
                     qCEP ? _getDocs(qCEP) : { empty: true }
                ]);

                if (!snapComercial.empty) { duplicado = { id: snapComercial.docs[0].id, ...snapComercial.docs[0].data() }; motivo = "nombre comercial"; }
                else if (!snapPersonal.empty) { duplicado = { id: snapPersonal.docs[0].id, ...snapPersonal.docs[0].data() }; motivo = "nombre personal"; }
                else if (!snapTel.empty) { duplicado = { id: snapTel.docs[0].id, ...snapTel.docs[0].data() }; motivo = "teléfono"; }
                else if (qCEP && !snapCEP.empty) { duplicado = { id: snapCEP.docs[0].id, ...snapCEP.docs[0].data() }; motivo = "código CEP"; }

             } catch (queryError) {
                  console.error("Error checking for duplicates in Firestore:", queryError);
             }
        }


        const guardar = async () => {
            const saldoVaciosInicial = {};
            TIPOS_VACIO.forEach(tipo => saldoVaciosInicial[tipo] = 0);

            const clienteData = {
                sector: sector,
                nombreComercial: nombreComercial,
                nombrePersonal: nombrePersonal,
                telefono: telefono,
                codigoCEP: codigoCEP,
                coordenadas: coordenadas,
                aplicaRetencion: aplicaRetencion, // Guardado en BD
                saldoVacios: saldoVaciosInicial 
            };
            try {
                const docRef = await _addDoc(_collection(_db, CLIENTES_COLLECTION_PATH), clienteData);
                _showModal('Éxito', 'Cliente agregado correctamente.');
                form.reset();
                 _populateDropdown(SECTORES_COLLECTION_PATH, 'sector', 'Sector'); 
                const cepNACheckbox = document.getElementById('cepNA');
                if (cepNACheckbox) {
                    cepNACheckbox.checked = false;
                    document.getElementById('codigoCEP').disabled = false;
                }
                document.getElementById('aplicaRetencion').checked = false; // Reset checkbox
            } catch (error) {
                console.error("Error al agregar cliente:", error);
                _showModal('Error', 'Hubo un error al guardar el cliente.');
            }
        };

        if (duplicado) {
            _showModal(
                'Posible Duplicado',
                `Ya existe un cliente con el mismo ${motivo}: "${duplicado.nombreComercial}". ¿Deseas agregarlo de todas formas?`,
                guardar, 
                'Sí, agregar',
                 null, 
                 true 
            );
        } else {
            await guardar(); 
        }
    }


    function showVerClientesView() {
         _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Lista de Clientes</h2>
                        ${getFiltrosHTML()}
                        <div class="text-sm text-gray-600 mb-2 p-2 bg-yellow-100 border border-yellow-300 rounded-lg">
                            <span class="font-bold">Nota:</span> Las filas resaltadas en amarillo y marcadas con '⚠️' indican que faltan datos del cliente (nombre, teléfono o coordenadas).
                        </div>
                        <div id="clientesListContainer" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Cargando clientes...</p>
                        </div>
                        <button id="backToClientesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        setupFiltros('clientesListContainer'); 

        const container = document.getElementById('clientesListContainer');
        const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
        const unsubscribe = _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderClientesList('clientesListContainer', false); 
        }, (error) => {
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                console.log(`Clientes listener error ignored (assumed logout): ${error.code}`); 
                return; 
            }
            console.error("Error al cargar clientes:", error);
            if (container) {
                 container.innerHTML = `<p class="text-red-500 text-center">Error al cargar la lista de clientes.</p>`;
            }
        });

        _activeListeners.push(unsubscribe); 
    }



    function getFiltrosHTML() {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg">
                <input type="text" id="search-input" placeholder="Buscar por Nombre o Código..." class="md:col-span-2 w-full px-4 py-2 border rounded-lg">
                <div>
                    <label for="filter-sector" class="text-sm font-medium">Sector</label>
                    <select id="filter-sector" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select>
                </div>
                <div>
                    <button id="clear-filters-btn" class="w-full bg-gray-300 text-sm font-semibold rounded-lg self-end py-2 px-4 mt-5">Limpiar Filtros</button>
                </div>
                <div class="md:col-span-2 flex items-center">
                    <input type="checkbox" id="filter-incompletos" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                    <label for="filter-incompletos" class="ml-2 block text-sm text-gray-900">Mostrar solo clientes con datos incompletos</label>
                </div>
            </div>
        `;
    }

    function setupFiltros(containerId) {
        const selectElement = document.getElementById('filter-sector');
        if (selectElement) {
            const collectionRef = _collection(_db, SECTORES_COLLECTION_PATH);
             _getDocs(collectionRef).then(snapshot => {
                const items = snapshot.docs.map(doc => doc.data().name).sort();
                const currentValue = selectElement.value;
                selectElement.innerHTML = `<option value="">Todos</option>`;
                items.forEach(item => {
                    selectElement.innerHTML += `<option value="${item}">${item}</option>`;
                });
                selectElement.value = currentValue;
             }).catch(error => {
                if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                    console.log("Error carga dropdown sectores ignorado (assumed logout).");
                    return;
                }
                 console.error("Error cargando sectores para filtro:", error);
                 selectElement.innerHTML = `<option value="">Error</option>`;
                 selectElement.disabled = true;
             });
        } else {
             console.warn("Elemento 'filter-sector' no encontrado.");
        }


        const searchInput = document.getElementById('search-input');
        const sectorFilter = document.getElementById('filter-sector');
        const clearBtn = document.getElementById('clear-filters-btn');
        const incompletosFilter = document.getElementById('filter-incompletos');

        const applyFilters = () => renderClientesList(containerId, false);

        searchInput?.addEventListener('input', applyFilters);
        sectorFilter?.addEventListener('change', applyFilters);
        incompletosFilter?.addEventListener('change', applyFilters);

        clearBtn?.addEventListener('click', () => {
            if(searchInput) searchInput.value = '';
            if(sectorFilter) sectorFilter.value = '';
            if(incompletosFilter) incompletosFilter.checked = false;
            applyFilters();
        });
    }


    function renderClientesList(elementId, readOnly = false) {
        const container = document.getElementById(elementId);
        if (!container) return;

        const searchTerm = (document.getElementById('search-input')?.value.toLowerCase() || '');
        const sectorFilter = document.getElementById('filter-sector')?.value || '';
        const incompletosFilter = document.getElementById('filter-incompletos')?.checked;

        const filteredClients = _clientesCache.filter(cliente => {
            const nombreComercialLower = (cliente.nombreComercial || '').toLowerCase();
            const nombrePersonalLower = (cliente.nombrePersonal || '').toLowerCase();
            const codigoCEPLower = (cliente.codigoCEP || '').toLowerCase();

            const searchMatch = !searchTerm ||
                nombreComercialLower.includes(searchTerm) ||
                nombrePersonalLower.includes(searchTerm) ||
                (cliente.codigoCEP && codigoCEPLower.includes(searchTerm));

            const sectorMatch = !sectorFilter || cliente.sector === sectorFilter;

            const isComplete = cliente.nombreComercial && cliente.nombrePersonal && cliente.telefono && cliente.coordenadas;
            const incompletosMatch = !incompletosFilter || (incompletosFilter && !isComplete);

            return searchMatch && sectorMatch && incompletosMatch;
        });

        if (filteredClients.length === 0) {
            if (_clientesCache.length > 0) {
                container.innerHTML = `<p class="text-gray-500 text-center p-4">No hay clientes que coincidan con la búsqueda.</p>`;
            } else {
                container.innerHTML = `<p class="text-gray-500 text-center p-4">Cargando clientes...</p>`;
            }
            return;
        }

        let tableHTML = `
            <table class="min-w-full bg-white border border-gray-200">
                <thead class="bg-gray-200 sticky top-0 z-10">
                    <tr>
                        <th class="py-2 px-4 border-b text-left text-sm">N. Comercial</th>
                        <th class="py-2 px-4 border-b text-left text-sm">N. Personal</th>
                        <th class="py-2 px-4 border-b text-left text-sm">Teléfono</th>
                        ${!readOnly ? `<th class="py-2 px-4 border-b text-center text-sm">Acciones</th>` : ''}
                    </tr>
                </thead>
                <tbody>
        `;
        filteredClients.forEach(cliente => {
            const isComplete = cliente.nombreComercial && cliente.nombrePersonal && cliente.telefono && cliente.coordenadas;
            const rowClass = isComplete ? 'hover:bg-gray-50' : 'bg-yellow-100 hover:bg-yellow-200';
            const completenessIcon = isComplete
                ? ''
                : '<span title="Datos incompletos" class="text-yellow-500 ml-2">⚠️</span>';

            let mapButtonHTML = '';
            if (cliente.coordenadas) {
                 const urlCoords = encodeURIComponent(cliente.coordenadas);
                 mapButtonHTML = `<a href="https://www.google.com/maps?q=${urlCoords}" target="_blank" class="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600">Mapa</a>`;
            }

            tableHTML += `
                <tr class="${rowClass}">
                    <td class="py-2 px-4 border-b text-sm">${cliente.nombreComercial}${completenessIcon}</td>
                    <td class="py-2 px-4 border-b text-sm">${cliente.nombrePersonal}</td>
                    <td class="py-2 px-4 border-b text-sm">${cliente.telefono}</td>
                    ${!readOnly ? `
                    <td class="py-2 px-4 border-b text-center space-x-1">
                        ${mapButtonHTML}
                        <button onclick="window.clientesModule.editCliente('${cliente.id}')" class="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600">Editar</button>
                        <button onclick="window.clientesModule.deleteCliente('${cliente.id}')" class="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600">Eliminar</button>
                    </td>` : ''}
                </tr>
            `;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }


    function editCliente(clienteId) {
         _floatingControls.classList.add('hidden');
        const cliente = _clientesCache.find(c => c.id === clienteId);
        if (!cliente) return;

        // Verificar estado de la casilla para pintar en HTML
        const isRetencionChecked = cliente.aplicaRetencion ? 'checked' : '';

        _mainContent.innerHTML = `
            <div class="p-4">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Editar Cliente</h2>
                        <form id="editClienteForm" class="space-y-4 text-left">
                            <div>
                                <label for="editSector" class="block text-gray-700 font-medium mb-2">Sector:</label>
                                <select id="editSector" class="w-full px-4 py-2 border rounded-lg" required>
                                </select>
                            </div>
                            <div>
                                <label for="editNombreComercial" class="block text-gray-700 font-medium mb-2">Nombre Comercial:</label>
                                <input type="text" id="editNombreComercial" value="${cliente.nombreComercial || ''}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editNombrePersonal" class="block text-gray-700 font-medium mb-2">Nombre Personal:</label>
                                <input type="text" id="editNombrePersonal" value="${cliente.nombrePersonal || ''}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editTelefono" class="block text-gray-700 font-medium mb-2">Teléfono:</label>
                                <input type="tel" id="editTelefono" value="${cliente.telefono || ''}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editCodigoCEP" class="block text-gray-700 font-medium mb-2">Código CEP:</label>
                                <div class="flex items-center">
                                    <input type="text" id="editCodigoCEP" value="${cliente.codigoCEP || ''}" class="w-full px-4 py-2 border rounded-lg">
                                    <input type="checkbox" id="editCepNA" class="ml-4 h-5 w-5">
                                    <label for="editCepNA" class="ml-2 text-gray-700">No Aplica</label>
                                </div>
                            </div>
                            <div>
                                <label for="editCoordenadas" class="block text-gray-700 font-medium mb-2">Coordenadas:</label>
                                <div class="flex items-center space-x-2">
                                    <input type="text" id="editCoordenadas" value="${cliente.coordenadas || ''}" class="w-full px-4 py-2 border rounded-lg">
                                    <button type="button" id="getEditCoordsBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">GPS</button>
                                </div>
                            </div>

                            <div class="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label class="flex items-center space-x-3 cursor-pointer">
                                    <input type="checkbox" id="editAplicaRetencion" class="form-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" ${isRetencionChecked}>
                                    <span class="text-gray-800 font-bold text-sm">Este cliente es agente de Retención de IVA</span>
                                </label>
                            </div>

                            <button type="submit" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button>
                        </form>
                        <button id="backToVerClientesBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'editSector', 'sector', cliente.sector);

        const editCepInput = document.getElementById('editCodigoCEP');
        const editCepNACheckbox = document.getElementById('editCepNA');

        const syncEditCepState = () => {
             const cepValue = (editCepInput.value || '').trim().toLowerCase();
            if (cepValue === 'n/a') {
                editCepNACheckbox.checked = true;
                editCepInput.disabled = true;
            } else {
                editCepNACheckbox.checked = false;
                editCepInput.disabled = false;
            }
        };

        editCepNACheckbox.addEventListener('change', () => {
            if (editCepNACheckbox.checked) {
                editCepInput.value = 'N/A';
                editCepInput.disabled = true;
            } else {
                editCepInput.value = ''; 
                editCepInput.disabled = false;
                editCepInput.focus();
            }
        });
        syncEditCepState(); 

        document.getElementById('getEditCoordsBtn').addEventListener('click', () => getCurrentCoordinates('editCoordenadas'));

        document.getElementById('editClienteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const sectorValue = document.getElementById('editSector').value;
             if (!sectorValue) {
                 _showModal('Error', 'Debes seleccionar un sector.');
                 return;
             }

            // Capturar valor del checkbox
            const aplicaRetencion = document.getElementById('editAplicaRetencion').checked;

            const updatedData = {
                sector: sectorValue.toUpperCase(),
                nombreComercial: (document.getElementById('editNombreComercial').value || '').toUpperCase(),
                nombrePersonal: (document.getElementById('editNombrePersonal').value || '').toUpperCase(),
                telefono: document.getElementById('editTelefono').value || '',
                codigoCEP: document.getElementById('editCodigoCEP').value || '',
                coordenadas: (document.getElementById('editCoordenadas').value || '').trim(),
                aplicaRetencion: aplicaRetencion, // Se guarda la actualización
                saldoVacios: cliente.saldoVacios || {} 
            };

            if (!updatedData.nombreComercial || !updatedData.nombrePersonal || !updatedData.telefono) {
                 _showModal('Error', 'Nombre Comercial, Nombre Personal y Teléfono son requeridos.');
                 return;
            }

            _showModal('Progreso', 'Guardando cambios...');

            try {
                await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId), updatedData, { merge: true });
                _showModal('Éxito', 'Cliente modificado exitosamente.');
                showVerClientesView(); 
            } catch (error) {
                console.error("Error al modificar el cliente:", error);
                _showModal('Error', `Hubo un error al modificar el cliente: ${error.message}`);
            }
        });
        document.getElementById('backToVerClientesBtn').addEventListener('click', showVerClientesView);
    };


    function deleteCliente(clienteId) {
        _showModal('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este cliente?', async () => {
            _showModal('Progreso', 'Eliminando cliente...'); 
            try {
                await _deleteDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId));
                _showModal('Éxito', 'Cliente eliminado correctamente.');
            } catch (error) {
                console.error("Error al eliminar el cliente:", error);
                _showModal('Error', 'Hubo un error al eliminar el cliente.');
            }
        }, 'Sí, Eliminar', null, true); 
    };


    function showDatosMaestrosSectoresView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-2xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Gestionar Sectores</h2>
                        <div id="sectores-list" class="space-y-2 max-h-96 overflow-y-auto border p-4 rounded-lg"></div>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="addSectorMaestroBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Agregar Nuevo Sector</button>
                            <button id="backToClientesBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('addSectorMaestroBtn').addEventListener('click', () => _showAddItemModal(SECTORES_COLLECTION_PATH, 'Sector'));
        document.getElementById('backToClientesBtn').addEventListener('click', showFuncionesAvanzadasView);
        renderSectoresParaGestion();
    }

    function renderSectoresParaGestion() {
        const container = document.getElementById('sectores-list');
        if (!container) return;

        const collectionRef = _collection(_db, SECTORES_COLLECTION_PATH);
        const unsubscribe = _onSnapshot(collectionRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            if (items.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center">No hay sectores definidos.</p>`;
                return;
            }
            container.innerHTML = items.map(item => `
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
                    <span class="text-gray-800 flex-grow">${item.name}</span>
                    <button onclick="window.clientesModule.editSector('${item.id}', '${item.name}')" class="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600 mr-2">Editar</button>
                    <button onclick="window.clientesModule.deleteSector('${item.id}', '${item.name}')" class="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600">Eliminar</button>
                </div>
            `).join('');
        }, (error) => {
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                console.log(`Sectores listener error ignored (assumed logout): ${error.code}`); 
                return;
            }
            console.error("Error en listener de gestión sectores:", error);
            if (container) {
                 container.innerHTML = `<p class="text-red-500 text-center">Error al cargar sectores.</p>`;
            }
        });
        _activeListeners.push(unsubscribe);
    }


    async function editSector(sectorId, currentName) {
        const newName = prompt('Introduce el nuevo nombre para el sector:', currentName);
        if (newName && newName.trim() !== '' && newName.trim().toUpperCase() !== currentName.toUpperCase()) {
            const nuevoNombreMayus = newName.trim().toUpperCase();
            _showModal('Progreso', 'Verificando y actualizando...');
            try {
                const q = _query(_collection(_db, SECTORES_COLLECTION_PATH), _where("name", "==", nuevoNombreMayus));
                const querySnapshot = await _getDocs(q); 
                if (!querySnapshot.empty && querySnapshot.docs[0].id !== sectorId) { 
                    _showModal('Error', `El sector "${nuevoNombreMayus}" ya existe.`);
                    return;
                }

                await _setDoc(_doc(_db, SECTORES_COLLECTION_PATH, sectorId), { name: nuevoNombreMayus }); 

                const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
                const clientesQuery = _query(clientesRef, _where("sector", "==", currentName));
                const clientesSnapshot = await _getDocs(clientesQuery); 
                let updatedClientsCount = 0;

                if (!clientesSnapshot.empty) {
                      updatedClientsCount = clientesSnapshot.size;
                      _showModal('Progreso', `Actualizando ${updatedClientsCount} cliente(s)...`);
                    const batch = _writeBatch(_db); 
                    clientesSnapshot.docs.forEach(doc => {
                        batch.update(doc.ref, { sector: nuevoNombreMayus });
                    });
                    await batch.commit();
                }

                _showModal('Éxito', `Sector renombrado a "${nuevoNombreMayus}" y actualizado en ${updatedClientsCount} cliente(s).`);
            } catch (error) {
                 console.error("Error al renombrar sector:", error);
                _showModal('Error', `Ocurrió un error al renombrar el sector: ${error.message}`);
            }
        } else if (newName !== null) { 
            _showModal('Aviso', 'El nombre no cambió o está vacío.');
        }
    }


    async function deleteSector(sectorId, sectorName) {
         _showModal('Progreso', `Verificando uso del sector "${sectorName}"...`);
        const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
        const q = _query(clientesRef, _where("sector", "==", sectorName), _limit(1)); 

        try {
            const usageSnapshot = await _getDocs(q); 
            if (!usageSnapshot.empty) {
                _showModal('Error al Eliminar', `No se puede eliminar el sector "${sectorName}" porque está siendo utilizado por al menos un cliente.`);
                return;
            }

            _showModal('Confirmar Eliminación', `¿Estás seguro de que deseas eliminar el sector "${sectorName}"? Esta acción no se puede deshacer.`, async () => {
                 _showModal('Progreso', `Eliminando sector "${sectorName}"...`);
                 try {
                     await _deleteDoc(_doc(_db, SECTORES_COLLECTION_PATH, sectorId)); 
                     _showModal('Éxito', `El sector "${sectorName}" ha sido eliminado.`);
                 } catch (deleteError) {
                      console.error("Error al eliminar sector:", deleteError);
                      _showModal('Error', `Ocurrió un error al eliminar el sector: ${deleteError.message}`);
                 }
            }, 'Sí, Eliminar', null, true); 

        } catch (error) {
            console.error("Error verificando uso de sector:", error);
            _showModal('Error', `Ocurrió un error al intentar verificar el uso del sector: ${error.message}`);
        }
    }


    async function handleDeleteAllClientes() {
        _showModal('Confirmación Extrema', '¿Estás SEGURO de que quieres eliminar TODOS los clientes? Esta acción es irreversible.', async () => {
            _showModal('Progreso', 'Eliminando todos los clientes...');
            try {
                const collectionRef = _collection(_db, CLIENTES_COLLECTION_PATH);
                const snapshot = await _getDocs(collectionRef); 
                if (snapshot.empty) {
                    _showModal('Aviso', 'No hay clientes para eliminar.');
                    return;
                }

                const BATCH_LIMIT = 490;
                let batch = _writeBatch(_db); 
                let count = 0;
                let totalDeleted = 0;

                for (const docSnapshot of snapshot.docs) {
                     batch.delete(docSnapshot.ref);
                     count++;
                     if (count === BATCH_LIMIT) {
                         _showModal('Progreso', `Eliminando clientes (${totalDeleted + count}/${snapshot.size})...`);
                         await batch.commit();
                         totalDeleted += count;
                         batch = _writeBatch(_db); 
                         count = 0;
                     }
                }
                if (count > 0) {
                     _showModal('Progreso', `Finalizando eliminación (${totalDeleted + count}/${snapshot.size})...`);
                     await batch.commit();
                     totalDeleted += count;
                }

                _showModal('Éxito', `Todos los ${totalDeleted} clientes han sido eliminados.`);
                 _clientesCache = []; 
                 renderClientesList('clientesListContainer', false); 

            } catch (error) {
                console.error("Error al eliminar todos los clientes:", error);
                _showModal('Error', `Hubo un error al eliminar los clientes: ${error.message}`);
            }
        }, 'Sí, Eliminar Todos', null, true); 
    }


    // --- Lógica de Saldos de Vacíos ---

    function showSaldosVaciosView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Saldos de Envases Retornables (Vacíos)</h2>
                        <input type="text" id="saldo-search-input" placeholder="Buscar cliente..." class="w-full px-4 py-2 border rounded-lg mb-4">
                        <div id="saldosListContainer" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Cargando saldos de clientes...</p>
                        </div>
                        <button id="backToClientesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        const searchInput = document.getElementById('saldo-search-input');
        if (searchInput) {
             searchInput.addEventListener('input', renderSaldosList);
        }

        const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
        const unsubscribe = _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSaldosList(); 
        }, (error) => {
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                console.log(`Saldos listener error ignored (assumed logout): ${error.code}`);
                return; 
            }
            console.error("Error al cargar saldos:", error);
             const container = document.getElementById('saldosListContainer');
             if(container) container.innerHTML = '<p class="text-red-500 text-center">Error al cargar los saldos.</p>';
        });
        _activeListeners.push(unsubscribe); 
    }


    function renderSaldosList() {
        const container = document.getElementById('saldosListContainer');
        const searchInput = document.getElementById('saldo-search-input');

        if (!container || !searchInput) return;

        const searchTerm = searchInput.value.toLowerCase();

        const filteredClients = _clientesCache.filter(c => {
             const nameMatch = (c.nombreComercial || '').toLowerCase().includes(searchTerm) || (c.nombrePersonal || '').toLowerCase().includes(searchTerm);
             const hasSaldo = c.saldoVacios && Object.values(c.saldoVacios).some(saldo => saldo !== 0);
             return nameMatch && hasSaldo; 
        });

        if (filteredClients.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 p-4">No se encontraron clientes con saldos pendientes ${searchTerm ? 'que coincidan.' : '.'}</p>`;
            return;
        }

        let tableHTML = `<table class="min-w-full bg-white text-sm">
            <thead class="bg-gray-200 sticky top-0 z-10"><tr>
                <th class="py-2 px-4 border-b text-left">Cliente</th>`;
        TIPOS_VACIO.forEach(tipo => {
             tableHTML += `<th class="py-2 px-4 border-b text-center">${tipo}</th>`;
        });
        tableHTML += `<th class="py-2 px-4 border-b text-center">Acciones</th></tr></thead><tbody>`;

        filteredClients.forEach(cliente => {
            const saldoVacios = cliente.saldoVacios || {};
            tableHTML += `<tr class="hover:bg-gray-50">
                <td class="py-2 px-4 border-b">${cliente.nombreComercial}</td>`;
            TIPOS_VACIO.forEach(tipo => {
                const saldo = saldoVacios[tipo] || 0;
                const saldoClass = saldo > 0 ? 'text-red-600 font-bold' : (saldo < 0 ? 'text-green-600 font-bold' : 'text-gray-500');
                 tableHTML += `<td class="py-2 px-4 border-b text-center ${saldoClass}">${saldo}</td>`;
            });
            tableHTML += `
                <td class="py-2 px-4 border-b text-center">
                    <button onclick="window.clientesModule.showSaldoDetalleModal('${cliente.id}')" class="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600">Ajustar</button>
                </td>
            </tr>`;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }

    async function showSaldoDetalleModal(clienteId) {
        const clienteIndex = _clientesCache.findIndex(c => c.id === clienteId);
        if (clienteIndex === -1) {
             _showModal('Error', 'Cliente no encontrado en la caché.');
             return;
        }
        const cliente = _clientesCache[clienteIndex];

        // Insignia visual si el cliente es agente de retención
        const retencionBadge = cliente.aplicaRetencion 
            ? '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full border border-red-300">Aplica Retención IVA</span>' 
            : '';

        const saldoVacios = cliente.saldoVacios || {};
        let detalleHTML = '<ul class="space-y-2 mb-4">';
        let hasSaldos = false;
        TIPOS_VACIO.forEach(tipo => {
            const saldo = saldoVacios[tipo] || 0;
            const saldoClass = saldo > 0 ? 'text-red-600' : (saldo < 0 ? 'text-green-600' : 'text-gray-500');
            detalleHTML += `<li class="flex justify-between items-center text-sm">
                                <span>${tipo}:</span>
                                <span class="font-bold ${saldoClass}">${saldo}</span>
                            </li>`;
            if (saldo !== 0) hasSaldos = true;
        });
        detalleHTML += '</ul>';
        if (!hasSaldos) {
            detalleHTML = '<p class="text-center text-gray-500 mb-4 text-sm">Este cliente no tiene saldos pendientes.</p>';
        }

        let optionsHTML = '<option value="">Seleccione tipo...</option>';
        TIPOS_VACIO.forEach(tipo => {
            optionsHTML += `<option value="${tipo}">${tipo}</option>`;
        });

        const modalContentHTML = `
            <div class="flex flex-col gap-1 mb-4 border-b pb-2">
                <h3 class="text-xl font-bold text-gray-800 leading-tight">${cliente.nombreComercial}</h3>
                <div>${retencionBadge}</div>
            </div>
            <div class="mb-6">${detalleHTML}</div>
            <h4 class="text-lg font-semibold mb-2">Ajuste Manual</h4>
            <div class="space-y-4">
                <div>
                    <label for="ajusteTipoVacio" class="block text-sm font-medium mb-1">Tipo de Vacío a Ajustar:</label>
                    <select id="ajusteTipoVacio" class="w-full px-2 py-1 border rounded-lg">${optionsHTML}</select>
                </div>
                <div>
                    <label for="ajusteCantidad" class="block text-sm font-medium mb-1">Cantidad de Cajas:</label>
                    <input type="number" id="ajusteCantidad" min="1" class="w-full px-2 py-1 border rounded-lg">
                </div>
                <div class="flex flex-col sm:flex-row gap-3">
                    <button id="ajusteDevolucionBtn" class="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium">Registrar Devolución (-)</button>
                    <button id="ajustePrestamoBtn" class="w-full px-4 py-2 bg-yellow-500 text-gray-800 rounded-lg hover:bg-yellow-600 text-sm font-medium">Registrar Préstamo (+)</button>
                </div>
                <p id="ajusteErrorMsg" class="text-red-500 text-xs h-4"></p> 
            </div>
        `;
        _showModal('Detalle/Ajuste de Saldo', modalContentHTML, null, '');

        const devolucionBtn = document.getElementById('ajusteDevolucionBtn');
        const prestamoBtn = document.getElementById('ajustePrestamoBtn');
        const errorMsgP = document.getElementById('ajusteErrorMsg');

        const performAdjustment = (tipoAjuste) => {
             const tipoVacioSelect = document.getElementById('ajusteTipoVacio');
             const cantidadInput = document.getElementById('ajusteCantidad');
             errorMsgP.textContent = ''; 

             const tipoVacio = tipoVacioSelect?.value;
             const cantidad = cantidadInput ? parseInt(cantidadInput.value, 10) : NaN;

             if(!tipoVacio) {
                 errorMsgP.textContent = 'Selecciona un tipo de vacío.';
                 tipoVacioSelect?.focus();
                 return;
             }
             if(isNaN(cantidad) || cantidad <= 0) {
                  errorMsgP.textContent = 'Ingresa una cantidad válida (mayor que 0).';
                  cantidadInput?.focus();
                  return;
             }
             handleAjusteManualVacios(clienteId, tipoVacio, cantidad, tipoAjuste);
        };

        if(devolucionBtn) {
            devolucionBtn.addEventListener('click', () => performAdjustment('devolucion'));
        }

       if(prestamoBtn) {
            prestamoBtn.addEventListener('click', () => performAdjustment('prestamo'));
       }
    }


    async function handleAjusteManualVacios(clienteId, tipoVacio, cantidad, tipoAjuste) {
        const clienteRef = _doc(_db, CLIENTES_COLLECTION_PATH, clienteId);
        _showModal('Progreso', 'Actualizando saldo...');
        try {
            await _runTransaction(_db, async (transaction) => {
                const clienteDoc = await transaction.get(clienteRef);
                if (!clienteDoc.exists()) {
                    throw "El cliente no existe.";
                }

                const data = clienteDoc.data();
                const saldoVacios = data.saldoVacios && typeof data.saldoVacios === 'object' ? { ...data.saldoVacios } : {};

                const saldoActual = saldoVacios[tipoVacio] || 0;
                let nuevoSaldo = saldoActual;

                if (tipoAjuste === 'devolucion') {
                    nuevoSaldo -= cantidad;
                } else { 
                    nuevoSaldo += cantidad;
                }
                 if (saldoVacios[tipoVacio] !== nuevoSaldo) {
                    saldoVacios[tipoVacio] = nuevoSaldo;
                    transaction.update(clienteRef, { saldoVacios: saldoVacios });
                 } else {
                      console.log(`Saldo for ${tipoVacio} already ${nuevoSaldo}, no update needed.`);
                 }

            });
             const progressModal = document.getElementById('modalContainer');
             if(progressModal && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                 progressModal.classList.add('hidden');
             }
             _showModal('Éxito', 'El saldo de vacíos se ha actualizado.');
            showSaldoDetalleModal(clienteId);
        } catch (error) {
            console.error("Error en el ajuste manual de vacíos:", error);
             const progressModal = document.getElementById('modalContainer');
            if(progressModal && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                 progressModal.classList.add('hidden');
            }
            _showModal('Error', `No se pudo actualizar el saldo: ${error.message || error}`);
        }
    }


    // Exponer funciones públicas al objeto window
    window.clientesModule = {
        editCliente,
        deleteCliente,
        editSector,
        deleteSector,
        showSaldoDetalleModal,
        showEditSaldoModal 
    };

})();

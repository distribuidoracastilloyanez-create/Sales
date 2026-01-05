// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo que se inicializarán desde index.html
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    // CORRECCIÓN: Asegurarse de que _getDocs está declarado
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDoc, _getDocs, _query, _where, _writeBatch, _runTransaction, _limit; // Añadido _limit si se necesita en el futuro

    let _clientesCache = []; // Caché local para búsquedas y ediciones rápidas
    let _clientesParaImportar = []; // Caché para la data del Excel a importar

    // Definir rutas usando el ID de proyecto hardcoded para datos públicos
    const CLIENTES_COLLECTION_PATH = `artifacts/${'ventas-9a210'}/public/data/clientes`;
    const SECTORES_COLLECTION_PATH = `artifacts/${'ventas-9a210'}/public/data/sectores`;

    // --- CAMBIO: Tipos de Vacío ---
    const TIPOS_VACIO = ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    // --- FIN CAMBIO ---

    /**
     * Inicializa el módulo con las dependencias necesarias desde la app principal.
     */
    window.initClientes = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId; // Se obtiene appId aquí
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
        // CORRECCIÓN: Asignar getDocs a _getDocs
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
        _writeBatch = dependencies.writeBatch;
        _runTransaction = dependencies.runTransaction;
        _limit = dependencies.limit; // Añadido por si acaso para deleteSector

        // *** AÑADIR LOG DE CONFIRMACIÓN ***
        // console.log("window.initClientes definido y ejecutado correctamente en clientes.js"); // Opcional
    };

    // ... (El resto del código de clientes.js permanece igual) ...
    // ... showClientesSubMenu, showFuncionesAvanzadasView, etc. ...

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
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600">Ver Clientes</button>
                            <!-- REVERTIDO: Botón "Agregar Cliente" visible para todos -->
                            <button id="agregarClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600">Agregar Cliente</button>
                            <button id="saldosVaciosBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600">Consultar Saldos de Vacíos</button>
                            ${_userRole === 'admin' ? `
                            <button id="funcionesAvanzadasBtn" class="w-full px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800">Funciones Avanzadas</button>
                            ` : ''}
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú Principal</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verClientesBtn').addEventListener('click', showVerClientesView);
        // REVERTIDO: Listener de "Agregar Cliente" visible para todos
        document.getElementById('agregarClienteBtn')?.addEventListener('click', showAgregarClienteView);
        if (_userRole === 'admin') {
            document.getElementById('funcionesAvanzadasBtn')?.addEventListener('click', showFuncionesAvanzadasView);
        }
        document.getElementById('saldosVaciosBtn').addEventListener('click', showSaldosVaciosView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

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
                            <button id="importarClientesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Importar Clientes desde Excel</button>
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
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Importar Clientes desde Excel</h2>
                        <p class="text-center text-gray-600 mb-6">Selecciona un archivo .xlsx o .csv. La primera fila debe contener los encabezados: Sector, Nombre Comercial, Nombre Personal, telefono, CEP, y opcionalmente: Coordenadas (o X, Y).</p>
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

    /**
     * Maneja la carga y parseo del archivo Excel.
     */
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        _clientesParaImportar = []; // Reset cache

        const reader = new FileReader();
        reader.onload = function(e) {
            const data = e.target.result;
            let jsonData = [];
            try {
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            } catch (readError) {
                 _showModal('Error de Lectura', `No se pudo leer el archivo Excel: ${readError.message}`);
                 renderPreviewTable([]); // Clear preview
                 return;
            }


            if (jsonData.length < 2) {
                _showModal('Error', 'El archivo está vacío o no tiene datos después de la fila de encabezado.');
                renderPreviewTable([]);
                return;
            }

            const headers = jsonData[0].map(h => (h ? h.toString().toLowerCase().trim().replace(/\s+/g, '') : ''));
            const requiredHeaders = ['sector', 'nombrecomercial', 'nombrepersonal', 'telefono', 'cep'];
            const optionalHeaders = ['coordenadas', 'x', 'y'];
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
                let coordenadas = '';
                if (headerMap['coordenadas'] !== undefined) {
                    coordenadas = (row[headerMap['coordenadas']] || '').toString().trim();
                } else if (headerMap['x'] !== undefined && headerMap['y'] !== undefined) {
                    const x = (row[headerMap['x']] || '').toString().trim();
                    const y = (row[headerMap['y']] || '').toString().trim();
                    if (x && y) {
                        coordenadas = `${y}, ${x}`; // Formato standard es Lat, Lon
                    }
                }

                // --- CAMBIO: Inicializar saldoVacios por tipo ---
                const saldoVaciosInicial = {};
                TIPOS_VACIO.forEach(tipo => saldoVaciosInicial[tipo] = 0);
                // --- FIN CAMBIO ---

                const cliente = {
                    sector: (row[headerMap['sector']] || '').toString().trim().toUpperCase(),
                    nombreComercial: (row[headerMap['nombrecomercial']] || '').toString().trim().toUpperCase(), // Corregido: nombrecomercial
                    nombrePersonal: (row[headerMap['nombrepersonal']] || '').toString().trim().toUpperCase(), // Corregido: nombrepersonal
                    telefono: (row[headerMap['telefono']] || '').toString().trim(),
                    codigoCEP: (row[headerMap['cep']] || 'N/A').toString().trim(),
                    coordenadas: coordenadas,
                    saldoVacios: saldoVaciosInicial // <-- CAMBIO
                };
                if (!cliente.codigoCEP) cliente.codigoCEP = 'N/A';
                if (!cliente.nombreComercial && !cliente.nombrePersonal) {
                     console.warn(`Fila ${rowIndex + 2}: Faltan Nombre Comercial y Nombre Personal. Fila ignorada.`);
                     return null; // Ignorar fila si faltan ambos nombres
                }
                return cliente;
            }).filter(c => c !== null); // Filtrar las filas ignoradas (null)

            renderPreviewTable(_clientesParaImportar);
        };
        reader.onerror = function(e) {
             _showModal('Error de Archivo', 'No se pudo leer el archivo seleccionado.');
             renderPreviewTable([]);
        };
        reader.readAsBinaryString(file);
    }

    /**
     * Muestra una tabla de vista previa con los datos del Excel.
     */
    function renderPreviewTable(clientes) {
        const container = document.getElementById('preview-container');
        const actionsContainer = document.getElementById('import-actions');
        const backButton = document.getElementById('backToAdvancedFunctionsBtn');
        const uploadInput = document.getElementById('excel-uploader');

        if(!container || !actionsContainer || !backButton || !uploadInput) return;


        if (clientes.length === 0) {
            container.innerHTML = `<p class="text-center text-red-500 p-4">No se encontraron clientes válidos para importar o el archivo está vacío.</p>`;
            actionsContainer.classList.add('hidden');
            backButton.classList.remove('hidden'); // Show back button if preview fails
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
                                    <th class="py-1 px-2 text-left">Coordenadas</th>
                                </tr></thead><tbody>`;

        clientes.forEach(c => {
            tableHTML += `<tr class="border-b">
                <td class="py-1 px-2">${c.sector}</td>
                <td class="py-1 px-2">${c.nombreComercial}</td>
                <td class="py-1 px-2">${c.nombrePersonal}</td>
                <td class="py-1 px-2">${c.telefono}</td>
                <td class="py-1 px-2">${c.codigoCEP}</td>
                <td class="py-1 px-2">${c.coordenadas || 'N/A'}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table></div>';
        container.innerHTML = tableHTML;

        actionsContainer.classList.remove('hidden');
        backButton.classList.add('hidden'); // Hide back button when preview is shown
        document.getElementById('confirmImportBtn').onclick = handleConfirmImport;
        document.getElementById('cancelImportBtn').onclick = () => {
             _clientesParaImportar = [];
             uploadInput.value = ''; // Reset file input
             container.innerHTML = '';
             actionsContainer.classList.add('hidden');
             backButton.classList.remove('hidden');
        };
    }

    /**
     * Confirma y guarda los clientes y sectores importados en Firestore.
     */
    async function handleConfirmImport() {
        if (_clientesParaImportar.length === 0) {
            _showModal('Error', 'No hay clientes válidos para importar.');
            return;
        }

        _showModal('Progreso', `Importando ${_clientesParaImportar.length} clientes...`);

        try {
            // Get existing sectors
            const sectoresRef = _collection(_db, SECTORES_COLLECTION_PATH);
            const sectoresSnapshot = await _getDocs(sectoresRef);
            const existingSectores = new Map(sectoresSnapshot.docs.map(doc => [doc.data().name.toUpperCase(), doc.id]));

            // Find new sectors to add
            const newSectores = new Set(
                _clientesParaImportar
                    .map(c => c.sector)
                    .filter(s => s && !existingSectores.has(s)) // Filter out empty and existing
            );

            // Prepare batch write
            const batch = _writeBatch(_db);
            let operations = 0;
            const BATCH_LIMIT = 490; // Firestore batch limit (leave some margin)

            // Add new sectors
            newSectores.forEach(sectorName => {
                const newSectorRef = _doc(sectoresRef);
                batch.set(newSectorRef, { name: sectorName });
                operations++;
            });
            if (operations > 0) {
                 await batch.commit(); // Commit sectors first if any
                 console.log(`Added ${newSectores.size} new sectors.`);
            }


            // Add clients (might need multiple batches)
            const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
            let clientBatch = _writeBatch(_db); // Start a new batch for clients
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
                     clientBatch = _writeBatch(_db); // Start a new batch
                     clientOperations = 0;
                 }
            }

            // Commit any remaining clients
            if (clientOperations > 0) {
                 _showModal('Progreso', `Finalizando importación (${clientsAdded}/${_clientesParaImportar.length})...`);
                 await clientBatch.commit();
            }


            _showModal('Éxito', `Se han importado ${clientsAdded} clientes y ${newSectores.size} nuevos sectores.`);
            showFuncionesAvanzadasView(); // Go back after success

        } catch (error) {
            console.error("Error during import:", error); // Log detailed error
            _showModal('Error', `Ocurrió un error durante la importación: ${error.message}`);
        } finally {
            _clientesParaImportar = []; // Clear cache regardless of success/failure
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
                 enableHighAccuracy: true, // Request higher accuracy
                 timeout: 10000, // Wait up to 10 seconds
                 maximumAge: 0 // Force fresh reading
            });
        } else {
            _showModal('No Soportado', 'La geolocalización no es soportada por este navegador.');
        }
    }


    /**
     * Muestra la vista de agregar cliente.
     */
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
        document.getElementById('addSectorBtn').addEventListener('click', () => _showAddItemModal(SECTORES_COLLECTION_PATH, 'Sector', 'sector')); // Pass dropdown ID
        document.getElementById('getCoordsBtn').addEventListener('click', () => getCurrentCoordinates('coordenadas'));
    }

    async function agregarCliente(e) {
        e.preventDefault();
        const form = e.target;

        const nombreComercial = form.nombreComercial.value.trim().toUpperCase();
        const nombrePersonal = form.nombrePersonal.value.trim().toUpperCase();
        const sector = form.sector.value.toUpperCase(); // Ensure sector is taken from select
        const telefono = form.telefono.value.trim();
        const codigoCEP = form.codigoCEP.value.trim();
        const coordenadas = form.coordenadas.value.trim();

        if (!sector) {
            _showModal('Error', 'Debes seleccionar o agregar un sector.');
            form.sector.focus();
            return;
        }

        const normComercial = nombreComercial.toLowerCase();
        const normPersonal = nombrePersonal.toLowerCase();

        // Check cache first for duplicates
         let duplicado = null;
         let motivo = "";
         for (const c of _clientesCache) {
             if (c.nombreComercial.toLowerCase() === normComercial) { duplicado = c; motivo = "nombre comercial"; break; }
             if (c.nombrePersonal.toLowerCase() === normPersonal) { duplicado = c; motivo = "nombre personal"; break; }
             if (c.telefono === telefono) { duplicado = c; motivo = "teléfono"; break; }
             if (codigoCEP && codigoCEP.toLowerCase() !== 'n/a' && c.codigoCEP === codigoCEP) { duplicado = c; motivo = "código CEP"; break; }
         }

        // If not found in cache, check Firestore (less likely but possible race condition)
        if (!duplicado) {
             try {
                const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
                const qComercial = _query(clientesRef, _where("nombreComercial", "==", nombreComercial));
                const qPersonal = _query(clientesRef, _where("nombrePersonal", "==", nombrePersonal));
                const qTel = _query(clientesRef, _where("telefono", "==", telefono));
                const qCEP = codigoCEP && codigoCEP.toLowerCase() !== 'n/a' ? _query(clientesRef, _where("codigoCEP", "==", codigoCEP)) : null;

                const [snapComercial, snapPersonal, snapTel, snapCEP] = await Promise.all([
                     _getDocs(qComercial), // Use _getDocs here
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
                  // Decide how to proceed - maybe allow saving with a warning?
                  // For now, let it proceed to the duplicate check below.
             }
        }


        const guardar = async () => {
            // --- CAMBIO: Inicializar saldoVacios por tipo ---
            const saldoVaciosInicial = {};
            TIPOS_VACIO.forEach(tipo => saldoVaciosInicial[tipo] = 0);
            // --- FIN CAMBIO ---

            const clienteData = {
                sector: sector,
                nombreComercial: nombreComercial,
                nombrePersonal: nombrePersonal,
                telefono: telefono,
                codigoCEP: codigoCEP,
                coordenadas: coordenadas,
                saldoVacios: saldoVaciosInicial // <-- CAMBIO
            };
            try {
                const docRef = await _addDoc(_collection(_db, CLIENTES_COLLECTION_PATH), clienteData);
                _showModal('Éxito', 'Cliente agregado correctamente.');
                form.reset();
                 _populateDropdown(SECTORES_COLLECTION_PATH, 'sector', 'Sector'); // Repopulate to ensure consistency
                const cepNACheckbox = document.getElementById('cepNA');
                if (cepNACheckbox) {
                    cepNACheckbox.checked = false;
                    document.getElementById('codigoCEP').disabled = false;
                }
            } catch (error) {
                console.error("Error al agregar cliente:", error);
                _showModal('Error', 'Hubo un error al guardar el cliente.');
            }
        };

        if (duplicado) {
            _showModal(
                'Posible Duplicado',
                `Ya existe un cliente con el mismo ${motivo}: "${duplicado.nombreComercial}". ¿Deseas agregarlo de todas formas?`,
                guardar, // Pass the save function directly
                'Sí, agregar',
                 null, // No specific action on cancel
                 true // Indicate this modal triggers the confirm logic
            );
        } else {
            await guardar(); // Save directly if no duplicate found
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
        setupFiltros('clientesListContainer'); // Pass container ID

        const container = document.getElementById('clientesListContainer');
        const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
        const unsubscribe = _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderClientesList('clientesListContainer', false); // Pass container ID and readOnly flag
        }, (error) => {
             // FIX: Ignorar errores de permisos/autenticación (comunes al cerrar sesión)
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                console.log(`Clientes listener error ignored (assumed logout): ${error.code}`); 
                return; // Ignorar el error silenciosamente
            }
            console.error("Error al cargar clientes:", error);
            if (container) {
                 container.innerHTML = `<p class="text-red-500 text-center">Error al cargar la lista de clientes.</p>`;
            }
        });

        _activeListeners.push(unsubscribe); // Add listener to global array
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
            // CORRECCIÓN: Usar _getDocs en lugar de getDocs
             _getDocs(collectionRef).then(snapshot => {
                const items = snapshot.docs.map(doc => doc.data().name).sort();
                const currentValue = selectElement.value;
                selectElement.innerHTML = `<option value="">Todos</option>`;
                items.forEach(item => {
                    selectElement.innerHTML += `<option value="${item}">${item}</option>`;
                });
                selectElement.value = currentValue;
             }).catch(error => {
                // FIX: Ignorar errores de permisos/autenticación (comunes al cerrar sesión)
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


    /**
     * Muestra la lista de clientes con filtros aplicados.
     */
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
             // Robust check: handle null/undefined and trim
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
                editCepInput.value = ''; // Clear only if unchecked, don't assume original value
                editCepInput.disabled = false;
                editCepInput.focus();
            }
        });
        syncEditCepState(); // Initial state sync

        document.getElementById('getEditCoordsBtn').addEventListener('click', () => getCurrentCoordinates('editCoordenadas'));

        document.getElementById('editClienteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const sectorValue = document.getElementById('editSector').value;
             if (!sectorValue) {
                 _showModal('Error', 'Debes seleccionar un sector.');
                 return;
             }
            const updatedData = {
                sector: sectorValue.toUpperCase(),
                nombreComercial: (document.getElementById('editNombreComercial').value || '').toUpperCase(),
                nombrePersonal: (document.getElementById('editNombrePersonal').value || '').toUpperCase(),
                telefono: document.getElementById('editTelefono').value || '',
                codigoCEP: document.getElementById('editCodigoCEP').value || '',
                coordenadas: (document.getElementById('editCoordenadas').value || '').trim(),
                saldoVacios: cliente.saldoVacios || {} // Preserve existing saldoVacios
            };

            // Basic validation
            if (!updatedData.nombreComercial || !updatedData.nombrePersonal || !updatedData.telefono) {
                 _showModal('Error', 'Nombre Comercial, Nombre Personal y Teléfono son requeridos.');
                 return;
            }

            _showModal('Progreso', 'Guardando cambios...');

            try {
                await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId), updatedData, { merge: true });
                _showModal('Éxito', 'Cliente modificado exitosamente.');
                showVerClientesView(); // Go back to the list
            } catch (error) {
                console.error("Error al modificar el cliente:", error);
                _showModal('Error', `Hubo un error al modificar el cliente: ${error.message}`);
            }
        });
        document.getElementById('backToVerClientesBtn').addEventListener('click', showVerClientesView);
    };


    function deleteCliente(clienteId) {
        _showModal('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este cliente?', async () => {
            _showModal('Progreso', 'Eliminando cliente...'); // Show progress
            try {
                await _deleteDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId));
                _showModal('Éxito', 'Cliente eliminado correctamente.');
                // No need to call showVerClientesView if listener updates the list
                // showVerClientesView(); // Keep if you prefer explicit refresh
            } catch (error) {
                console.error("Error al eliminar el cliente:", error);
                _showModal('Error', 'Hubo un error al eliminar el cliente.');
            }
        }, 'Sí, Eliminar', null, true); // Trigger confirm logic
    };

    // --- FUNCIÓN REDUNDANTE ELIMINADA ---
    // La función 'showValidatedAddItemModal' se eliminó
    // porque es una copia de 'showAddItemModal' (definida en index.html)
    // que se recibe como la dependencia '_showAddItemModal'.


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
             // FIX: Ignorar errores de permisos/autenticación (comunes al cerrar sesión)
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
                // Check if new name already exists
                const q = _query(_collection(_db, SECTORES_COLLECTION_PATH), _where("name", "==", nuevoNombreMayus));
                const querySnapshot = await _getDocs(q); // Use _getDocs
                if (!querySnapshot.empty && querySnapshot.docs[0].id !== sectorId) { // Check if it's not the same doc
                    _showModal('Error', `El sector "${nuevoNombreMayus}" ya existe.`);
                    return;
                }

                // Update the sector name
                await _setDoc(_doc(_db, SECTORES_COLLECTION_PATH, sectorId), { name: nuevoNombreMayus }); // Use _setDoc, _doc

                // Find and update clients using the old name
                const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
                const clientesQuery = _query(clientesRef, _where("sector", "==", currentName));
                const clientesSnapshot = await _getDocs(clientesQuery); // Use _getDocs
                let updatedClientsCount = 0;

                if (!clientesSnapshot.empty) {
                     updatedClientsCount = clientesSnapshot.size;
                     _showModal('Progreso', `Actualizando ${updatedClientsCount} cliente(s)...`);
                    const batch = _writeBatch(_db); // Use _writeBatch
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
        } else if (newName !== null) { // Handle case where user entered same name or empty
            _showModal('Aviso', 'El nombre no cambió o está vacío.');
        }
    }


    async function deleteSector(sectorId, sectorName) {
         _showModal('Progreso', `Verificando uso del sector "${sectorName}"...`);
        const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
        // CORRECCIÓN: Usar _limit
        const q = _query(clientesRef, _where("sector", "==", sectorName), _limit(1)); // Only need to know if at least one exists

        try {
            const usageSnapshot = await _getDocs(q); // Use _getDocs
            if (!usageSnapshot.empty) {
                _showModal('Error al Eliminar', `No se puede eliminar el sector "${sectorName}" porque está siendo utilizado por al menos un cliente.`);
                return;
            }

            _showModal('Confirmar Eliminación', `¿Estás seguro de que deseas eliminar el sector "${sectorName}"? Esta acción no se puede deshacer.`, async () => {
                 _showModal('Progreso', `Eliminando sector "${sectorName}"...`);
                 try {
                     await _deleteDoc(_doc(_db, SECTORES_COLLECTION_PATH, sectorId)); // Use _deleteDoc, _doc
                     _showModal('Éxito', `El sector "${sectorName}" ha sido eliminado.`);
                 } catch (deleteError) {
                      console.error("Error al eliminar sector:", deleteError);
                      _showModal('Error', `Ocurrió un error al eliminar el sector: ${deleteError.message}`);
                 }
            }, 'Sí, Eliminar', null, true); // Trigger confirm logic

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
                const snapshot = await _getDocs(collectionRef); // Use _getDocs
                if (snapshot.empty) {
                    _showModal('Aviso', 'No hay clientes para eliminar.');
                    return;
                }

                // Delete in batches
                const BATCH_LIMIT = 490;
                let batch = _writeBatch(_db); // Use _writeBatch
                let count = 0;
                let totalDeleted = 0;

                for (const docSnapshot of snapshot.docs) {
                     batch.delete(docSnapshot.ref);
                     count++;
                     if (count === BATCH_LIMIT) {
                         _showModal('Progreso', `Eliminando clientes (${totalDeleted + count}/${snapshot.size})...`);
                         await batch.commit();
                         totalDeleted += count;
                         batch = _writeBatch(_db); // Start new batch
                         count = 0;
                     }
                }
                // Commit the last batch
                if (count > 0) {
                     _showModal('Progreso', `Finalizando eliminación (${totalDeleted + count}/${snapshot.size})...`);
                     await batch.commit();
                     totalDeleted += count;
                }

                _showModal('Éxito', `Todos los ${totalDeleted} clientes han sido eliminados.`);
                 _clientesCache = []; // Clear local cache
                 renderClientesList('clientesListContainer', false); // Re-render the (now empty) list

            } catch (error) {
                console.error("Error al eliminar todos los clientes:", error);
                _showModal('Error', `Hubo un error al eliminar los clientes: ${error.message}`);
            }
        }, 'Sí, Eliminar Todos', null, true); // Trigger confirm logic
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
            renderSaldosList(); // Re-render list on data change
        }, (error) => {
            // FIX: Ignorar errores de permisos/autenticación (comunes al cerrar sesión)
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') { 
                console.log(`Saldos listener error ignored (assumed logout): ${error.code}`);
                return; // Ignorar el error silenciosamente
            }
            console.error("Error al cargar saldos:", error);
             const container = document.getElementById('saldosListContainer');
             if(container) container.innerHTML = '<p class="text-red-500 text-center">Error al cargar los saldos.</p>';
        });
        _activeListeners.push(unsubscribe); // Add to global list
    }


    function renderSaldosList() {
        const container = document.getElementById('saldosListContainer');
        const searchInput = document.getElementById('saldo-search-input');

        if (!container || !searchInput) return;

        const searchTerm = searchInput.value.toLowerCase();

        // Filter clients based on search term AND if they have any non-zero saldoVacios entry
        const filteredClients = _clientesCache.filter(c => {
             const nameMatch = (c.nombreComercial || '').toLowerCase().includes(searchTerm) || (c.nombrePersonal || '').toLowerCase().includes(searchTerm);
             const hasSaldo = c.saldoVacios && Object.values(c.saldoVacios).some(saldo => saldo !== 0);
             return nameMatch && hasSaldo; // Show only clients with saldo and matching name
        });

        if (filteredClients.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 p-4">No se encontraron clientes con saldos pendientes ${searchTerm ? 'que coincidan.' : '.'}</p>`;
            return;
        }

        let tableHTML = `<table class="min-w-full bg-white text-sm">
            <thead class="bg-gray-200 sticky top-0 z-10"><tr>
                <th class="py-2 px-4 border-b text-left">Cliente</th>`;
        // Add headers for each TIPOS_VACIO
        TIPOS_VACIO.forEach(tipo => {
             tableHTML += `<th class="py-2 px-4 border-b text-center">${tipo}</th>`;
        });
        tableHTML += `<th class="py-2 px-4 border-b text-center">Acciones</th></tr></thead><tbody>`;

        filteredClients.forEach(cliente => {
            const saldoVacios = cliente.saldoVacios || {};
            tableHTML += `<tr class="hover:bg-gray-50">
                <td class="py-2 px-4 border-b">${cliente.nombreComercial}</td>`;
            // Add saldo data for each TIPOS_VACIO
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
        // Use a stable reference from the cache
        const clienteIndex = _clientesCache.findIndex(c => c.id === clienteId);
        if (clienteIndex === -1) {
             _showModal('Error', 'Cliente no encontrado en la caché.');
             return;
        }
        // Use the object from the cache array directly
        const cliente = _clientesCache[clienteIndex];

        // --- CAMBIO: Mostrar saldos por tipo y ajustar por tipo ---
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
            <h3 class="text-xl font-bold text-gray-800 mb-4">Ajuste de Saldo: ${cliente.nombreComercial}</h3>
            <div class="mb-6 border-b pb-4">${detalleHTML}</div>
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
                <p id="ajusteErrorMsg" class="text-red-500 text-xs h-4"></p> <!-- For error messages -->
            </div>
        `;
        // --- FIN CAMBIO ---
        // Mostrar modal SIN botón de confirmación por defecto, ya que los botones de ajuste están dentro
        _showModal('Detalle/Ajuste de Saldo', modalContentHTML, null, '');

        // Añadir listeners DESPUÉS de mostrar el modal
        const devolucionBtn = document.getElementById('ajusteDevolucionBtn');
        const prestamoBtn = document.getElementById('ajustePrestamoBtn');
        const errorMsgP = document.getElementById('ajusteErrorMsg');

        const performAdjustment = (tipoAjuste) => {
             const tipoVacioSelect = document.getElementById('ajusteTipoVacio');
             const cantidadInput = document.getElementById('ajusteCantidad');
             errorMsgP.textContent = ''; // Clear previous error

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
                // Ensure saldoVacios is initialized correctly
                const saldoVacios = data.saldoVacios && typeof data.saldoVacios === 'object' ? { ...data.saldoVacios } : {};

                // --- CAMBIO: Usar tipoVacio como clave ---
                const saldoActual = saldoVacios[tipoVacio] || 0;
                let nuevoSaldo = saldoActual;

                if (tipoAjuste === 'devolucion') {
                    nuevoSaldo -= cantidad;
                } else { // prestamo
                    nuevoSaldo += cantidad;
                }
                // Only update if the value changed
                 if (saldoVacios[tipoVacio] !== nuevoSaldo) {
                    saldoVacios[tipoVacio] = nuevoSaldo;
                    transaction.update(clienteRef, { saldoVacios: saldoVacios });
                 } else {
                     console.log(`Saldo for ${tipoVacio} already ${nuevoSaldo}, no update needed.`);
                     // Optional: Throw an error or just skip if no change? Skipping for now.
                 }

                // --- FIN CAMBIO ---
            });
             // Close the "Progreso" modal before showing the success/updated modal
            const progressModal = document.getElementById('modalContainer');
            if(progressModal && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                 progressModal.classList.add('hidden');
            }
             _showModal('Éxito', 'El saldo de vacíos se ha actualizado.');
            // Re-render the detail modal to show the updated balance
            showSaldoDetalleModal(clienteId);
        } catch (error) {
            console.error("Error en el ajuste manual de vacíos:", error);
             // Close the "Progreso" modal on error too
             const progressModal = document.getElementById('modalContainer');
            if(progressModal && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                 progressModal.classList.add('hidden');
            }
            _showModal('Error', `No se pudo actualizar el saldo: ${error.message || error}`);
            // Optionally, re-show the modal without changes if transaction failed
            // showSaldoDetalleModal(clienteId);
        }
    }


    // Exponer funciones públicas al objeto window
    window.clientesModule = {
        editCliente,
        deleteCliente,
        editSector,
        deleteSector,
        showSaldoDetalleModal
    };

})();

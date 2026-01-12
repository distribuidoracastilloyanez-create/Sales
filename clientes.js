// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo inicializadas desde la app principal
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDoc, _getDocs, _query, _where, _writeBatch, _runTransaction, _limit;

    let _clientesCache = []; // Caché local para búsquedas y ediciones rápidas
    let _clientesParaImportar = []; // Caché para la data del Excel a importar

    // Rutas dinámicas para datos públicos
    const CLIENTES_COLLECTION_PATH = `artifacts/ventas-9a210/public/data/clientes`;
    const SECTORES_COLLECTION_PATH = `artifacts/ventas-9a210/public/data/sectores`;

    // Tipos de Envases Retornables
    const TIPOS_VACIO = ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];

    /**
     * Inicializa el módulo con las dependencias necesarias.
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
    };

    /**
     * Renderiza el menú de subopciones de clientes.
     */
    window.showClientesSubMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                        <div class="space-y-4">
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-300">Ver Clientes</button>
                            <button id="agregarClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-300">Agregar Cliente</button>
                            <button id="saldosVaciosBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600 transition duration-300">Consultar Saldos de Vacíos</button>
                            ${_userRole === 'admin' ? `
                            <button id="funcionesAvanzadasBtn" class="w-full px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 transition duration-300">Funciones Avanzadas</button>
                            ` : ''}
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Volver al Menú Principal</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verClientesBtn').addEventListener('click', showVerClientesView);
        document.getElementById('agregarClienteBtn')?.addEventListener('click', showAgregarClienteView);
        if (_userRole === 'admin') {
            document.getElementById('funcionesAvanzadasBtn')?.addEventListener('click', showFuncionesAvanzadasView);
        }
        document.getElementById('saldosVaciosBtn').addEventListener('click', showSaldosVaciosView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

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
                            <button id="importarClientesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600 transition duration-300">Importar Clientes desde Excel</button>
                            <button id="datosMaestrosSectoresBtn" class="w-full px-6 py-3 bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition duration-300">Gestionar Sectores</button>
                            <button id="deleteAllClientesBtn" class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition duration-300">Eliminar Todos los Clientes</button>
                            <button id="backToClientesMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Volver a Clientes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('importarClientesBtn').addEventListener('click', showImportarClientesView);
        document.getElementById('datosMaestrosSectoresBtn').addEventListener('click', showDatosMaestrosSectoresView);
        document.getElementById('deleteAllClientesBtn').addEventListener('click', handleDeleteAllClientes);
        document.getElementById('backToClientesMenuBtn').addEventListener('click', window.showClientesSubMenu);
    }

    /**
     * Muestra la vista para importar clientes desde un archivo Excel (Migrado a ExcelJS).
     */
    function showImportarClientesView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Importar Clientes desde Excel</h2>
                        <p class="text-center text-gray-600 mb-6 text-sm">Selecciona un archivo .xlsx. Las columnas deben ser: Sector, Nombre Comercial, Nombre Personal, telefono, CEP.</p>
                        <input type="file" id="excel-uploader" accept=".xlsx" class="w-full p-4 border-2 border-dashed rounded-lg mb-6">
                        <div id="preview-container" class="mt-6 overflow-auto max-h-96 border rounded-lg shadow-inner"></div>
                        <div id="import-actions" class="mt-6 flex flex-col sm:flex-row gap-4 hidden">
                             <button id="confirmImportBtn" class="w-full px-6 py-3 bg-green-500 text-white font-bold rounded-lg shadow-md hover:bg-green-600 transition duration-300">Confirmar e Importar</button>
                             <button id="cancelImportBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Cancelar</button>
                        </div>
                         <button id="backToAdvancedFunctionsBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('excel-uploader').addEventListener('change', handleFileUpload);
        document.getElementById('backToAdvancedFunctionsBtn').addEventListener('click', showFuncionesAvanzadasView);
    }

    /**
     * Maneja la carga y parseo del archivo Excel usando ExcelJS.
     */
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        _clientesParaImportar = [];

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                if (typeof ExcelJS === 'undefined') throw new Error("Librería ExcelJS no cargada.");
                
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(e.target.result);
                const worksheet = workbook.getWorksheet(1);
                const jsonData = [];

                worksheet.eachRow({ includeEmpty: false }, (row) => {
                    // ExcelJS usa índices base 1, convertimos a array simple base 0
                    const rowValues = row.values.slice(1).map(v => v === null || v === undefined ? '' : v);
                    jsonData.push(rowValues);
                });

                if (jsonData.length < 2) {
                    _showModal('Error', 'El archivo no tiene datos suficientes.');
                    return;
                }

                const headers = jsonData[0].map(h => h.toString().toLowerCase().trim().replace(/\s+/g, ''));
                const requiredHeaders = ['sector', 'nombrecomercial', 'nombrepersonal', 'telefono', 'cep'];
                const headerMap = {};
                let missingHeader = false;

                requiredHeaders.forEach(rh => {
                    const index = headers.indexOf(rh);
                    if (index !== -1) headerMap[rh] = index;
                    else { _showModal('Error', `Falta la columna: "${rh}"`); missingHeader = true; }
                });

                if (missingHeader) return;

                _clientesParaImportar = jsonData.slice(1).map((row, rowIndex) => {
                    const nCom = (row[headerMap['nombrecomercial']] || '').toString().trim().toUpperCase();
                    if (!nCom) return null;

                    const saldoVaciosInicial = {};
                    TIPOS_VACIO.forEach(tipo => saldoVaciosInicial[tipo] = 0);

                    return {
                        sector: (row[headerMap['sector']] || '').toString().trim().toUpperCase(),
                        nombreComercial: nCom,
                        nombrePersonal: (row[headerMap['nombrepersonal']] || '').toString().trim().toUpperCase(),
                        telefono: (row[headerMap['telefono']] || '').toString().trim(),
                        codigoCEP: (row[headerMap['cep']] || 'N/A').toString().trim(),
                        coordenadas: '',
                        saldoVacios: saldoVaciosInicial
                    };
                }).filter(c => c !== null);

                renderPreviewTable(_clientesParaImportar);
            } catch (err) {
                 _showModal('Error de Lectura', `Fallo al procesar Excel: ${err.message}`);
                 renderPreviewTable([]);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Muestra una tabla de vista previa con los datos del Excel.
     */
    function renderPreviewTable(clientes) {
        const container = document.getElementById('preview-container');
        const actionsContainer = document.getElementById('import-actions');
        const backButton = document.getElementById('backToAdvancedFunctionsBtn');
        const uploadInput = document.getElementById('excel-uploader');

        if (clientes.length === 0) {
            container.innerHTML = `<p class="text-center text-red-500 p-4 font-bold">Archivo sin clientes válidos.</p>`;
            actionsContainer.classList.add('hidden');
            backButton.classList.remove('hidden');
            return;
        }

        let tableHTML = `<div class="p-4">
                            <h3 class="font-bold text-lg mb-2">Vista Previa (${clientes.length} clientes)</h3>
                            <table class="min-w-full bg-white text-xs border">
                                <thead class="bg-gray-200"><tr>
                                    <th class="p-2 border text-left">Sector</th>
                                    <th class="p-2 border text-left">N. Comercial</th>
                                    <th class="p-2 border text-left">N. Personal</th>
                                </tr></thead><tbody>`;

        clientes.slice(0, 10).forEach(c => {
            tableHTML += `<tr class="border-b">
                <td class="p-2 border">${c.sector}</td>
                <td class="p-2 border">${c.nombreComercial}</td>
                <td class="p-2 border">${c.nombrePersonal}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        if (clientes.length > 10) tableHTML += `<p class="text-xs text-gray-500 mt-2 italic text-center">... y ${clientes.length - 10} más.</p>`;
        tableHTML += '</div>';
        
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

    /**
     * Confirma y guarda los clientes y sectores importados en Firestore.
     */
    async function handleConfirmImport() {
        if (_clientesParaImportar.length === 0) return;
        _showModal('Progreso', `Importando ${_clientesParaImportar.length} clientes...`);

        try {
            const sectoresRef = _collection(_db, SECTORES_COLLECTION_PATH);
            const sectoresSnapshot = await _getDocs(sectoresRef);
            const existingSectores = new Set(sectoresSnapshot.docs.map(doc => doc.data().name.toUpperCase()));

            const newSectores = new Set(_clientesParaImportar.map(c => c.sector).filter(s => s && !existingSectores.has(s)));

            const batchSectores = _writeBatch(_db);
            newSectores.forEach(sectorName => {
                const newSectorRef = _doc(sectoresRef);
                batchSectores.set(newSectorRef, { name: sectorName });
            });
            if (newSectores.size > 0) await batchSectores.commit();

            const clientesRef = _collection(_db, CLIENTES_COLLECTION_PATH);
            let clientBatch = _writeBatch(_db);
            let clientOps = 0;
            const BATCH_LIMIT = 450;

            for (const cliente of _clientesParaImportar) {
                 const newClienteRef = _doc(clientesRef);
                 clientBatch.set(newClienteRef, cliente);
                 clientOps++;
                 if (clientOps >= BATCH_LIMIT) {
                     await clientBatch.commit();
                     clientBatch = _writeBatch(_db);
                     clientOps = 0;
                 }
            }
            if (clientOps > 0) await clientBatch.commit();

            _showModal('Éxito', `Importación finalizada: ${_clientesParaImportar.length} clientes creados.`);
            showFuncionesAvanzadasView();
        } catch (error) {
            _showModal('Error', `Fallo al importar clientes: ${error.message}`);
        } finally {
            _clientesParaImportar = [];
        }
    }

    function getCurrentCoordinates(inputId) {
        const input = document.getElementById(inputId);
        if (!navigator.geolocation) return _showModal('Error', 'GPS no soportado.');
        input.placeholder = "Buscando satélites...";
        navigator.geolocation.getCurrentPosition(position => {
            input.value = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        }, error => {
            _showModal('Error GPS', `No se pudo obtener ubicación: ${error.message}`);
        }, { enableHighAccuracy: true });
    }

    /**
     * Muestra la vista de agregar cliente.
     */
    function showAgregarClienteView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl text-center border border-gray-100">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">Agregar Cliente</h2>
                    <form id="clienteForm" class="space-y-4 text-left">
                        <div>
                            <label class="block text-sm font-bold text-gray-600 mb-1">Sector:</label>
                            <div class="flex space-x-2">
                                <select id="sector" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" required></select>
                                <button type="button" id="addSectorBtn" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 font-bold">+</button>
                            </div>
                        </div>
                        <div><label class="block text-sm font-bold text-gray-600 mb-1">Nombre Comercial:</label><input type="text" id="nombreComercial" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" required></div>
                        <div><label class="block text-sm font-bold text-gray-600 mb-1">Nombre Personal:</label><input type="text" id="nombrePersonal" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" required></div>
                        <div><label class="block text-sm font-bold text-gray-600 mb-1">Teléfono:</label><input type="tel" id="telefono" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" required></div>
                        <div>
                            <label class="block text-sm font-bold text-gray-600 mb-1">Código CEP:</label>
                            <div class="flex items-center">
                                <input type="text" id="codigoCEP" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                                <label class="ml-4 flex items-center text-sm cursor-pointer text-gray-500"><input type="checkbox" id="cepNA" class="mr-2"> N/A</label>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-600 mb-1">Coordenadas GPS:</label>
                            <div class="flex space-x-2">
                                <input type="text" id="coordenadas" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Lat, Lon">
                                <button type="button" id="getCoordsBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition shadow-md">📍</button>
                            </div>
                        </div>
                        <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-bold rounded-lg shadow-md hover:bg-green-600 mt-4 transition duration-300">Guardar Cliente</button>
                    </form>
                    <button id="backToClientesBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Volver</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'sector', 'Sector');

        document.getElementById('cepNA').onchange = (e) => {
            const cepInput = document.getElementById('codigoCEP');
            cepInput.value = e.target.checked ? 'N/A' : '';
            cepInput.disabled = e.target.checked;
        };

        document.getElementById('clienteForm').onsubmit = agregarCliente;
        document.getElementById('backToClientesBtn').onclick = window.showClientesSubMenu;
        document.getElementById('addSectorBtn').onclick = () => _showAddItemModal(SECTORES_COLLECTION_PATH, 'Sector');
        document.getElementById('getCoordsBtn').onclick = () => getCurrentCoordinates('coordenadas');
    }

    async function agregarCliente(e) {
        e.preventDefault();
        const f = e.target;
        const nombreCom = f.nombreComercial.value.trim().toUpperCase();
        
        const duplicado = _clientesCache.find(c => c.nombreComercial.toUpperCase() === nombreCom);
        const guardar = async () => {
            const sv = {}; TIPOS_VACIO.forEach(t => sv[t] = 0);
            const data = {
                sector: f.sector.value.toUpperCase(),
                nombreComercial: nombreCom,
                nombrePersonal: f.nombrePersonal.value.toUpperCase().trim(),
                telefono: f.telefono.value.trim(),
                codigoCEP: f.codigoCEP.value.trim() || 'N/A',
                coordenadas: f.coordenadas.value.trim(),
                saldoVacios: sv
            };
            try {
                await _addDoc(_collection(_db, CLIENTES_COLLECTION_PATH), data);
                _showModal('Éxito', 'Cliente guardado correctamente.');
                f.reset();
            } catch (err) { _showModal('Error', `Fallo al guardar: ${err.message}`); }
        };

        if (duplicado) {
            _showModal('Duplicado Detectado', `Ya existe un cliente con el nombre "${nombreCom}". ¿Deseas guardarlo de todos modos?`, guardar, 'Sí, Guardar', null, true);
        } else {
            await guardar();
        }
    }

    function showVerClientesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Lista de Clientes</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <input type="text" id="search-input" placeholder="Buscar por nombre..." class="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <select id="filter-sector" class="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"><option value="">Sectores: Todos</option></select>
                    </div>
                    <div id="clientesListContainer" class="overflow-x-auto max-h-96 border rounded-lg shadow-inner bg-white">
                        <p class="text-gray-500 text-center p-8 italic">Cargando base de datos...</p>
                    </div>
                    <button id="backToClientesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Volver</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'filter-sector', 'Sector');
        
        const renderList = () => {
            const container = document.getElementById('clientesListContainer');
            if (!container) return;
            const term = (document.getElementById('search-input')?.value || '').toUpperCase();
            const sector = document.getElementById('filter-sector')?.value || '';
            
            const filtered = _clientesCache.filter(c => 
                (c.nombreComercial.includes(term) || c.nombrePersonal.includes(term)) && (!sector || c.sector === sector)
            );

            if (filtered.length === 0) {
                container.innerHTML = `<p class="text-center text-gray-400 p-8">Sin resultados para los filtros actuales.</p>`;
                return;
            }

            container.innerHTML = `
                <table class="min-w-full text-sm border-collapse">
                    <thead class="bg-gray-100 sticky top-0 shadow-sm border-b">
                        <tr>
                            <th class="p-3 border text-left">N. Comercial</th>
                            <th class="p-3 border text-left">Personal / Sector</th>
                            <th class="p-3 border text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${filtered.map(c => `
                            <tr class="hover:bg-gray-50 transition duration-150">
                                <td class="p-3 border font-medium text-indigo-900">${c.nombreComercial}</td>
                                <td class="p-3 border text-gray-600 font-normal">${c.nombrePersonal}<br><span class="text-xs italic text-gray-400 font-bold">${c.sector}</span></td>
                                <td class="p-3 border text-center space-x-1">
                                    <button onclick="window.clientesModule.editCliente('${c.id}')" class="px-3 py-1 bg-yellow-500 text-white rounded text-xs font-bold hover:bg-yellow-600 transition shadow-sm">Editar</button>
                                    <button onclick="window.clientesModule.deleteCliente('${c.id}')" class="px-3 py-1 bg-red-500 text-white rounded text-xs font-bold hover:bg-red-600 transition shadow-sm">Borrar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        };

        const unsub = _onSnapshot(_collection(_db, CLIENTES_COLLECTION_PATH), (snap) => {
            _clientesCache = snap.docs.map(d => ({id: d.id, ...d.data()}));
            renderList();
        });
        _activeListeners.push(unsub);

        document.getElementById('search-input').oninput = renderList;
        document.getElementById('filter-sector').onchange = renderList;
        document.getElementById('backToClientesBtn').onclick = window.showClientesSubMenu;
    }

    /**
     * Muestra un formulario completo para editar todos los campos de un cliente.
     */
    function editCliente(clienteId) {
        const c = _clientesCache.find(x => x.id === clienteId);
        if (!c) return;

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl border border-indigo-100">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Modificar Cliente</h2>
                    <form id="editClienteForm" class="space-y-4 text-left">
                        <div><label class="block text-sm font-bold mb-1 text-gray-600">Sector:</label><select id="e-sector" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-400" required></select></div>
                        <div><label class="block text-sm font-bold mb-1 text-gray-600">Nombre Comercial:</label><input type="text" id="e-ncom" value="${c.nombreComercial}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-400" required></div>
                        <div><label class="block text-sm font-bold mb-1 text-gray-600">Nombre Personal:</label><input type="text" id="e-nper" value="${c.nombrePersonal}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-400" required></div>
                        <div><label class="block text-sm font-bold mb-1 text-gray-600">Teléfono:</label><input type="tel" id="e-tel" value="${c.telefono}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-400" required></div>
                        <div><label class="block text-sm font-bold mb-1 text-gray-600">Código CEP:</label><input type="text" id="e-cep" value="${c.codigoCEP}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-400"></div>
                        <div>
                            <label class="block text-sm font-bold mb-1 text-gray-600">Coordenadas:</label>
                            <div class="flex space-x-2">
                                <input type="text" id="e-coord" value="${c.coordenadas}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-400">
                                <button type="button" id="getEditCoords" class="bg-blue-500 text-white px-3 rounded-lg hover:bg-blue-600 transition shadow-md">📍</button>
                            </div>
                        </div>
                        <button type="submit" class="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 mt-4 transition duration-300">Guardar Cambios</button>
                    </form>
                    <button id="backFromEdit" class="mt-4 w-full px-6 py-2 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500 transition duration-300">Cancelar</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'e-sector', 'Sector', c.sector);
        document.getElementById('getEditCoords').onclick = () => getCurrentCoordinates('e-coord');
        document.getElementById('backFromEdit').onclick = showVerClientesView;

        document.getElementById('editClienteForm').onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                sector: document.getElementById('e-sector').value.toUpperCase(),
                nombreComercial: document.getElementById('e-ncom').value.toUpperCase().trim(),
                nombrePersonal: document.getElementById('e-nper').value.toUpperCase().trim(),
                telefono: document.getElementById('e-tel').value.trim(),
                codigoCEP: document.getElementById('e-cep').value.trim() || 'N/A',
                coordenadas: document.getElementById('e-coord').value.trim()
            };
            try {
                await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId), data, { merge: true });
                _showModal('Éxito', 'Los cambios han sido guardados correctamente.');
                showVerClientesView();
            } catch (err) { _showModal('Error', `Fallo al actualizar en Firebase: ${err.message}`); }
        };
    }

    function deleteCliente(id) {
        _showModal('Borrar Cliente', '¿Estás seguro de que quieres eliminar este cliente de la base de datos pública?', async () => {
            await _deleteDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id));
        }, 'Sí, Eliminar', null, true);
    }

    function showSaldosVaciosView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Cartera de Envases (Vacíos)</h2>
                <div id="saldosList" class="space-y-3 text-left"></div>
                <button onclick="window.showClientesSubMenu()" class="mt-6 w-full bg-gray-400 text-white py-3 rounded-lg font-bold shadow hover:bg-gray-500 transition">Volver</button>
            </div></div>
        `;
        const container = document.getElementById('saldosList');
        const unsub = _onSnapshot(_collection(_db, CLIENTES_COLLECTION_PATH), snap => {
            const clients = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.saldoVacios);
            container.innerHTML = clients.map(c => {
                const saldos = Object.entries(c.saldoVacios).map(([t, v]) => `${t}: <b class="${v !== 0 ? 'text-red-500' : 'text-gray-400'}">${v}</b>`).join(' | ');
                return `<div class="p-4 border rounded-lg flex justify-between items-center shadow-sm bg-white hover:border-indigo-200 transition">
                    <div><b class="text-indigo-900 text-lg">${c.nombreComercial}</b><br><span class="text-xs text-gray-500">${saldos}</span></div>
                    <button onclick="window.clientesModule.showSaldoDetalleModal('${c.id}')" class="px-4 py-2 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 transition shadow-sm">Ajustar</button>
                </div>`;
            }).join('');
        });
        _activeListeners.push(unsub);
    }

    async function showSaldoDetalleModal(id) {
        const c = _clientesCache.find(x => x.id === id);
        const modalHtml = `
            <div class="space-y-4">
                <div><label class="text-xs font-bold text-gray-500 uppercase">Tipo de Envase</label><select id="adj-type" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500">${TIPOS_VACIO.map(t => `<option>${t}</option>`)}</select></div>
                <div><label class="text-xs font-bold text-gray-500 uppercase">Cantidad</label><input type="number" id="adj-qty" placeholder="Ej: 5" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"></div>
                <div class="flex gap-4 pt-2">
                    <button id="btn-p" class="flex-1 py-3 bg-orange-400 text-white rounded-lg font-bold shadow hover:bg-orange-500 transition">Préstamo (+)</button>
                    <button id="btn-d" class="flex-1 py-3 bg-teal-600 text-white rounded-lg font-bold shadow hover:bg-teal-700 transition">Devolución (-)</button>
                </div>
            </div>
        `;
        _showModal(`Ajustar Saldo: ${c.nombreComercial}`, modalHtml);
        const update = async (mode) => {
            const t = document.getElementById('adj-type').value, q = parseInt(document.getElementById('adj-qty').value);
            if (!q || q <= 0) return;
            const sv = c.saldoVacios || {}; sv[t] = (sv[t] || 0) + (mode === 'p' ? q : -q);
            try {
                await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id), { saldoVacios: sv }, { merge: true });
                document.getElementById('modalContainer').classList.add('hidden');
            } catch (err) { _showModal('Error', 'Fallo al actualizar el saldo en la base de datos.'); }
        };
        document.getElementById('btn-p').onclick = () => update('p');
        document.getElementById('btn-d').onclick = () => update('d');
    }

    function showDatosMaestrosSectoresView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto max-w-md bg-white p-8 rounded-lg shadow-xl text-center border border-yellow-100">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Gestión de Sectores</h2>
                <div id="sec-list" class="space-y-2 text-left mb-6 max-h-72 overflow-y-auto pr-2"></div>
                <button id="backSec" class="w-full py-3 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500 transition duration-300 shadow-md">Volver</button>
            </div></div>
        `;
        document.getElementById('backSec').onclick = showFuncionesAvanzadasView;
        const unsub = _onSnapshot(_collection(_db, SECTORES_COLLECTION_PATH), snap => {
            const list = document.getElementById('sec-list');
            if(!list) return;
            list.innerHTML = snap.docs.map(d => `<div class="flex justify-between items-center p-3 border-b hover:bg-gray-50 transition">
                <span class="font-medium text-gray-700">${d.data().name}</span>
                <button onclick="window.clientesModule.deleteSector('${d.id}','${d.data().name}')" class="text-red-500 font-bold px-3 py-1 border border-red-200 rounded hover:bg-red-50 transition">X</button>
            </div>`).join('');
        });
        _activeListeners.push(unsub);
    }

    async function deleteSector(id, name) {
        _showModal('Eliminar Sector', `¿Deseas eliminar el sector "${name}"? No debe haber clientes asociados.`, async () => { 
            await _deleteDoc(_doc(_db, SECTORES_COLLECTION_PATH, id)); 
        }, 'Sí, Eliminar', null, true);
    }

    async function handleDeleteAllClientes() {
        _showModal('BORRADO MASIVO', '¡ATENCIÓN! Vas a eliminar TODOS los clientes. Esta acción no se puede revertir.', async () => {
            _showModal('Progreso', 'Limpiando colección pública...');
            const snap = await _getDocs(_collection(_db, CLIENTES_COLLECTION_PATH));
            const batch = _writeBatch(_db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            _showModal('Éxito', 'Colección de clientes vaciada.');
        }, 'BORRAR TODO', null, true);
    }

    // Exponer funciones del módulo
    window.clientesModule = { editCliente, deleteCliente, deleteSector, showSaldoDetalleModal };

})();

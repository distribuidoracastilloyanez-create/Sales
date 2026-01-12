// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo que se inicializarán desde index.html
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDoc, _getDocs, _query, _where, _writeBatch, _runTransaction, _limit;

    let _clientesCache = []; // Caché local para búsquedas y ediciones rápidas
    let _clientesParaImportar = []; // Caché para la data del Excel a importar

    // Rutas que se inicializarán dinámicamente
    let CLIENTES_COLLECTION_PATH;
    let SECTORES_COLLECTION_PATH;

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

        // INICIALIZACIÓN DE RUTAS DINÁMICAS (Nuevo Firebase)
        CLIENTES_COLLECTION_PATH = `artifacts/${_appId}/public/data/clientes`;
        SECTORES_COLLECTION_PATH = `artifacts/${_appId}/public/data/sectores`;
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
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600">Ver Clientes</button>
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
        document.getElementById('agregarClienteBtn')?.addEventListener('click', showAgregarClienteView);
        if (_userRole === 'admin') {
            document.getElementById('funcionesAvanzadasBtn')?.addEventListener('click', showFuncionesAvanzadasView);
        }
        document.getElementById('saldosVaciosBtn').addEventListener('click', showSaldosVaciosView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

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

    function showImportarClientesView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Importar Clientes desde Excel</h2>
                        <p class="text-center text-gray-600 mb-6">La primera fila debe contener: Sector, Nombre Comercial, Nombre Personal, telefono, CEP.</p>
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

    // --- CORRECCIÓN: Uso de ExcelJS en lugar de XLSX para lectura ---
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        _clientesParaImportar = [];

        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = e.target.result;
            let jsonData = [];
            
            try {
                if (typeof ExcelJS === 'undefined') {
                    throw new Error("Librería ExcelJS no cargada.");
                }
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);
                const worksheet = workbook.getWorksheet(1); // Primera hoja

                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    // ExcelJS devuelve valores empezando en índice 1, y el 0 es null. Hacemos slice(1) para limpiar.
                    // Sin embargo, para mapear, mejor convertimos a array simple.
                    const rowValues = row.values.slice(1).map(val => val === null || val === undefined ? '' : val);
                    jsonData.push(rowValues);
                });

            } catch (readError) {
                 console.error(readError);
                 _showModal('Error de Lectura', 'No se pudo leer el archivo Excel. Asegúrate de que sea válido (.xlsx).');
                 return;
            }

            if (jsonData.length < 2) {
                _showModal('Error', 'El archivo no tiene datos suficientes (cabecera + datos).');
                return;
            }

            // Procesar Cabeceras
            const headers = jsonData[0].map(h => (h ? h.toString().toLowerCase().trim().replace(/\s+/g, '') : ''));
            const headerMap = {};
            const required = ['sector', 'nombrecomercial', 'nombrepersonal', 'telefono', 'cep'];
            
            let missing = false;
            required.forEach(rh => {
                const idx = headers.indexOf(rh);
                if (idx !== -1) headerMap[rh] = idx;
                else { _showModal('Error', `Falta columna: ${rh}`); missing = true; }
            });

            if (missing) return;

            // Mapeo opcional de coordenadas
            headerMap['coordenadas'] = headers.indexOf('coordenadas');
            headerMap['x'] = headers.indexOf('x');
            headerMap['y'] = headers.indexOf('y');

            _clientesParaImportar = jsonData.slice(1).map(row => {
                // Función auxiliar para obtener valor seguro por nombre de columna
                const val = (key) => {
                    const idx = headerMap[key];
                    if (idx !== undefined && idx !== -1 && row[idx] !== undefined) return row[idx];
                    return '';
                };

                const nCom = val('nombrecomercial');
                if (!nCom) return null;

                let coords = '';
                if (headerMap['coordenadas'] !== -1) coords = val('coordenadas');
                else if (headerMap['x'] !== -1 && headerMap['y'] !== -1) {
                    const x = val('x'); const y = val('y');
                    if(x && y) coords = `${y}, ${x}`;
                }

                const sv = {}; TIPOS_VACIO.forEach(t => sv[t] = 0);

                return {
                    sector: val('sector').toString().toUpperCase().trim(),
                    nombreComercial: nCom.toString().toUpperCase().trim(),
                    nombrePersonal: val('nombrepersonal').toString().toUpperCase().trim(),
                    telefono: val('telefono').toString().trim(),
                    codigoCEP: val('cep').toString().trim() || 'N/A',
                    coordenadas: coords.toString().trim(),
                    saldoVacios: sv
                };
            }).filter(c => c !== null);

            renderPreviewTable(_clientesParaImportar);
        };
        // Leer como ArrayBuffer para ExcelJS
        reader.readAsArrayBuffer(file);
    }

    function renderPreviewTable(clientes) {
        const container = document.getElementById('preview-container');
        const actions = document.getElementById('import-actions');
        if (clientes.length === 0) {
            container.innerHTML = '<p class="text-red-500">No hay datos válidos.</p>';
            return;
        }
        let html = `<table class="min-w-full bg-white text-xs"><thead><tr class="bg-gray-100"><th>Sector</th><th>Comercial</th><th>Personal</th></tr></thead><tbody>`;
        clientes.slice(0, 10).forEach(c => {
            html += `<tr><td>${c.sector}</td><td>${c.nombreComercial}</td><td>${c.nombrePersonal}</td></tr>`;
        });
        html += '</tbody></table>';
        if (clientes.length > 10) html += `<p class="text-xs text-gray-500 mt-2">... y ${clientes.length - 10} más.</p>`;
        container.innerHTML = html;
        actions.classList.remove('hidden');
        document.getElementById('confirmImportBtn').onclick = handleConfirmImport;
        document.getElementById('cancelImportBtn').onclick = () => showImportarClientesView();
    }

    async function handleConfirmImport() {
        _showModal('Progreso', 'Importando datos a la nueva base de datos...');
        try {
            const secRef = _collection(_db, SECTORES_COLLECTION_PATH);
            const secSnap = await _getDocs(secRef);
            const existingSec = new Set(secSnap.docs.map(d => d.data().name.toUpperCase()));
            
            const newSecs = new Set(_clientesParaImportar.map(c => c.sector).filter(s => s && !existingSec.has(s)));
            
            const batch = _writeBatch(_db);
            newSecs.forEach(s => _setDoc(_doc(secRef), { name: s }));
            
            const cliRef = _collection(_db, CLIENTES_COLLECTION_PATH);
            for (const c of _clientesParaImportar) {
                _setDoc(_doc(cliRef), c);
            }
            
            await batch.commit();
            _showModal('Éxito', `Importados ${_clientesParaImportar.length} clientes.`);
            showFuncionesAvanzadasView();
        } catch (e) {
            _showModal('Error', 'Fallo al importar: ' + e.message);
        }
    }

    function getCurrentCoordinates(inputId) {
        const input = document.getElementById(inputId);
        if (!navigator.geolocation) return _showModal('Error', 'GPS no soportado.');
        input.placeholder = "Obteniendo...";
        navigator.geolocation.getCurrentPosition(p => {
            input.value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
        }, e => _showModal('Error', 'No se pudo obtener ubicación.'));
    }

    function showAgregarClienteView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-6">Nuevo Cliente</h2>
                    <form id="clienteForm" class="space-y-4 text-left">
                        <div><label>Sector</label><div class="flex gap-2"><select id="sector" class="w-full p-2 border rounded" required></select><button type="button" id="addSectorBtn" class="bg-gray-200 px-3 rounded">+</button></div></div>
                        <div><label>N. Comercial</label><input type="text" id="nombreComercial" class="w-full p-2 border rounded" required></div>
                        <div><label>N. Personal</label><input type="text" id="nombrePersonal" class="w-full p-2 border rounded" required></div>
                        <div><label>Teléfono</label><input type="tel" id="telefono" class="w-full p-2 border rounded" required></div>
                        <div><label>CEP</label><div class="flex items-center gap-2"><input type="text" id="codigoCEP" class="w-full p-2 border rounded"><input type="checkbox" id="cepNA"> N/A</div></div>
                        <div><label>GPS</label><div class="flex gap-2"><input type="text" id="coordenadas" class="w-full p-2 border rounded"><button type="button" id="getCoordsBtn" class="bg-blue-500 text-white px-3 rounded">📍</button></div></div>
                        <button type="submit" class="w-full bg-green-500 text-white py-3 rounded-lg font-bold">Guardar</button>
                    </form>
                    <button id="backBtn" class="w-full mt-4 text-gray-500">Volver</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'sector', 'Sector');
        document.getElementById('cepNA').onchange = (e) => {
            const inp = document.getElementById('codigoCEP');
            inp.value = e.target.checked ? 'N/A' : '';
            inp.disabled = e.target.checked;
        };
        document.getElementById('getCoordsBtn').onclick = () => getCurrentCoordinates('coordenadas');
        document.getElementById('addSectorBtn').onclick = () => _showAddItemModal(SECTORES_COLLECTION_PATH, 'Sector');
        document.getElementById('clienteForm').onsubmit = agregarCliente;
        document.getElementById('backBtn').onclick = showClientesSubMenu;
    }

    async function agregarCliente(e) {
        e.preventDefault();
        const f = e.target;
        const sv = {}; TIPOS_VACIO.forEach(t => sv[t] = 0);
        const data = {
            sector: f.sector.value.toUpperCase(),
            nombreComercial: f.nombreComercial.value.toUpperCase().trim(),
            nombrePersonal: f.nombrePersonal.value.toUpperCase().trim(),
            telefono: f.telefono.value.trim(),
            codigoCEP: f.codigoCEP.value.trim() || 'N/A',
            coordenadas: f.coordenadas.value.trim(),
            saldoVacios: sv
        };
        try {
            await _addDoc(_collection(_db, CLIENTES_COLLECTION_PATH), data);
            _showModal('Éxito', 'Cliente guardado.');
            f.reset();
        } catch (err) { _showModal('Error', err.message); }
    }

    function showVerClientesView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto bg-white p-6 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-4">Lista de Clientes</h2>
                    <div class="mb-4 space-y-2">
                        <input type="text" id="search" placeholder="Buscar..." class="w-full p-2 border rounded">
                        <select id="f-sector" class="w-full p-2 border rounded"><option value="">Todos los sectores</option></select>
                    </div>
                    <div id="list" class="overflow-x-auto max-h-96 text-sm">Cargando...</div>
                    <button id="back" class="mt-4 w-full bg-gray-400 text-white py-2 rounded">Volver</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'f-sector', 'Sector');
        const list = document.getElementById('list');
        const unsub = _onSnapshot(_collection(_db, CLIENTES_COLLECTION_PATH), (snap) => {
            _clientesCache = snap.docs.map(d => ({id: d.id, ...d.data()}));
            renderList();
        });
        _activeListeners.push(unsub);
        
        const renderList = () => {
            const term = document.getElementById('search').value.toUpperCase();
            const sec = document.getElementById('f-sector').value;
            const filtered = _clientesCache.filter(c => 
                (c.nombreComercial.includes(term) || c.nombrePersonal.includes(term)) &&
                (!sec || c.sector === sec)
            );
            list.innerHTML = `<table class="w-full"><thead><tr class="bg-gray-100"><th>Cliente</th><th>Sector</th><th>Acción</th></tr></thead><tbody>` +
                filtered.map(c => `<tr><td class="p-2">${c.nombreComercial}</td><td>${c.sector}</td><td class="flex gap-1">
                    <button onclick="window.clientesModule.editCliente('${c.id}')" class="bg-yellow-500 text-white px-2 rounded">Ed</button>
                    <button onclick="window.clientesModule.deleteCliente('${c.id}')" class="bg-red-500 text-white px-2 rounded">X</button>
                </td></tr>`).join('') + `</tbody></table>`;
        };
        document.getElementById('search').oninput = renderList;
        document.getElementById('f-sector').onchange = renderList;
        document.getElementById('back').onclick = showClientesSubMenu;
    }

    function editCliente(id) {
        const c = _clientesCache.find(x => x.id === id);
        if (!c) return;
        _showModal('Editar', `Nombre: <input id="e-nom" value="${c.nombreComercial}" class="border p-1 w-full">`, async () => {
            const val = document.getElementById('e-nom').value.toUpperCase();
            await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id), { nombreComercial: val }, { merge: true });
        });
    }

    function deleteCliente(id) {
        _showModal('Eliminar', '¿Borrar cliente?', async () => {
            await _deleteDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id));
        });
    }

    function showSaldosVaciosView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto bg-white p-6 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold mb-4 text-center">Saldos de Vacíos</h2>
                <div id="saldosList" class="space-y-2">Cargando...</div>
                <button onclick="window.showClientesSubMenu()" class="mt-4 w-full bg-gray-400 text-white py-2 rounded">Volver</button>
            </div></div>
        `;
        const container = document.getElementById('saldosList');
        const unsub = _onSnapshot(_collection(_db, CLIENTES_COLLECTION_PATH), snap => {
            const clients = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.saldoVacios);
            container.innerHTML = clients.map(c => {
                const saldos = Object.entries(c.saldoVacios).map(([t, v]) => `${t}: <b>${v}</b>`).join(' | ');
                return `<div class="p-3 border rounded flex justify-between items-center">
                    <div><b>${c.nombreComercial}</b><br><span class="text-xs">${saldos}</span></div>
                    <button onclick="window.clientesModule.showSaldoDetalleModal('${c.id}')" class="bg-blue-500 text-white px-3 py-1 rounded">Ajustar</button>
                </div>`;
            }).join('');
        });
        _activeListeners.push(unsub);
    }

    async function showSaldoDetalleModal(id) {
        const c = _clientesCache.find(x => x.id === id);
        const modalHtml = `
            <select id="adj-type" class="w-full p-2 border rounded mb-2">${TIPOS_VACIO.map(t => `<option>${t}</option>`)}</select>
            <input type="number" id="adj-qty" placeholder="Cantidad" class="w-full p-2 border rounded mb-2">
            <div class="flex gap-2">
                <button id="btn-p" class="flex-1 bg-yellow-500 p-2 rounded">Préstamo (+)</button>
                <button id="btn-d" class="flex-1 bg-green-500 p-2 rounded">Devolución (-)</button>
            </div>
        `;
        _showModal('Ajuste de Saldo', modalHtml);
        
        const update = async (mode) => {
            const t = document.getElementById('adj-type').value;
            const q = parseInt(document.getElementById('adj-qty').value);
            if (!q) return;
            const sv = c.saldoVacios || {};
            sv[t] = (sv[t] || 0) + (mode === 'p' ? q : -q);
            await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id), { saldoVacios: sv }, { merge: true });
            document.getElementById('modalContainer').classList.add('hidden');
        };
        document.getElementById('btn-p').onclick = () => update('p');
        document.getElementById('btn-d').onclick = () => update('d');
    }

    function showDatosMaestrosSectoresView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto max-w-md bg-white p-6 rounded-lg shadow-xl">
                <h2 class="text-xl font-bold mb-4">Sectores</h2>
                <div id="sec-list" class="space-y-2"></div>
                <button onclick="window.initClientes({db:_db, appId:_appId, userId:_userId, userRole:_userRole, mainContent:_mainContent, floatingControls:_floatingControls, showMainMenu:_showMainMenu, showModal:_showModal, showAddItemModal:_showAddItemModal, populateDropdown:_populateDropdown, collection:_collection, onSnapshot:_onSnapshot, doc:_doc, addDoc:_addDoc, setDoc:_setDoc, deleteDoc:_deleteDoc, getDocs:_getDocs, query:_query, where:_where, writeBatch:_writeBatch, runTransaction:_runTransaction, limit:_limit, activeListeners:_activeListeners}).then(() => window.clientesModule.showFuncionesAvanzadasView ? window.clientesModule.showFuncionesAvanzadasView() : window.showClientesSubMenu())" class="w-full mt-4 text-gray-500">Volver</button>
            </div></div>
        `;
        const container = document.getElementById('sec-list');
        _onSnapshot(_collection(_db, SECTORES_COLLECTION_PATH), snap => {
            container.innerHTML = snap.docs.map(d => `<div class="flex justify-between p-2 border-b"><span>${d.data().name}</span><div class="flex gap-2"><button onclick="window.clientesModule.editSector('${d.id}','${d.data().name}')" class="text-blue-500">Edit</button><button onclick="window.clientesModule.deleteSector('${d.id}','${d.data().name}')" class="text-red-500">Eliminar</button></div></div>`).join('');
        });
    }

    // Función faltante: editSector
    function editSector(id, name) {
        _showModal('Editar Sector', `Nombre: <input id="edit-sector-name" value="${name}" class="border p-1 w-full">`, async () => {
            const val = document.getElementById('edit-sector-name').value.toUpperCase().trim();
            if(!val) return;
            await _setDoc(_doc(_db, SECTORES_COLLECTION_PATH, id), { name: val }, { merge: true });
        });
    }

    async function deleteSector(id, name) {
        _showModal('Borrar', `¿Eliminar sector ${name}?`, async () => {
            await _deleteDoc(_doc(_db, SECTORES_COLLECTION_PATH, id));
        });
    }

    async function handleDeleteAllClientes() {
        _showModal('⚠️ PELIGRO', '¿Borrar TODOS los clientes?', async () => {
            const snap = await _getDocs(_collection(_db, CLIENTES_COLLECTION_PATH));
            const batch = _writeBatch(_db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        });
    }

    // Exponer funciones públicas al objeto window
    window.clientesModule = {
        editCliente,
        deleteCliente,
        editSector, // Ahora está definida
        deleteSector,
        showSaldoDetalleModal,
        // Helper para volver desde el botón "Volver" dinámico en sectores
        showFuncionesAvanzadasView: () => { if(_userRole === 'admin') showFuncionesAvanzadasView(); else window.showClientesSubMenu(); }
    };

})();

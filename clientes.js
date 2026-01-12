(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDoc, _getDocs, _query, _where, _writeBatch, _runTransaction, _limit;

    let _clientesCache = []; 
    let _clientesParaImportar = []; 

    const CLIENTES_COLLECTION_PATH = `artifacts/ventas-9a210/public/data/clientes`;
    const SECTORES_COLLECTION_PATH = `artifacts/ventas-9a210/public/data/sectores`;
    const TIPOS_VACIO = ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];

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

    window.showClientesSubMenu = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                        <div class="space-y-4">
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition">Ver Clientes</button>
                            <button id="agregarClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition">Agregar Cliente</button>
                            <button id="saldosVaciosBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600 transition">Consultar Saldos de Vacíos</button>
                            ${_userRole === 'admin' ? `<button id="funcionesAvanzadasBtn" class="w-full px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 transition">Funciones Avanzadas</button>` : ''}
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">Volver al Menú Principal</button>
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
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Funciones Avanzadas</h1>
                        <div class="space-y-4">
                            <button id="importarClientesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600 transition">Importar Clientes desde Excel</button>
                            <button id="datosMaestrosSectoresBtn" class="w-full px-6 py-3 bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition">Gestionar Sectores</button>
                            <button id="deleteAllClientesBtn" class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition">Eliminar Todos los Clientes</button>
                            <button id="backToClientesMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">Volver a Clientes</button>
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
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Importar Clientes</h2>
                        <p class="text-center text-gray-600 mb-6 text-sm">Columnas requeridas: Sector, Nombre Comercial, Nombre Personal, Telefono, CEP, Coordenadas.</p>
                        <input type="file" id="excel-uploader" accept=".xlsx" class="w-full p-4 border-2 border-dashed rounded-lg mb-6">
                        <div id="preview-container" class="mt-6 overflow-auto max-h-96 border rounded-lg shadow-inner"></div>
                        <div id="import-actions" class="mt-6 flex flex-col sm:flex-row gap-4 hidden">
                             <button id="confirmImportBtn" class="w-full px-6 py-3 bg-green-500 text-white font-bold rounded-lg shadow-md hover:bg-green-600 transition">Confirmar e Importar</button>
                             <button id="cancelImportBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-md hover:bg-gray-500 transition">Cancelar</button>
                        </div>
                         <button id="backToAdvancedFunctionsBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('excel-uploader').addEventListener('change', handleFileUpload);
        document.getElementById('backToAdvancedFunctionsBtn').addEventListener('click', showFuncionesAvanzadasView);
    }

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        _clientesParaImportar = [];
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                if (typeof ExcelJS === 'undefined') throw new Error("ExcelJS no cargado.");
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(e.target.result);
                const worksheet = workbook.getWorksheet(1);
                const jsonData = [];
                worksheet.eachRow({ includeEmpty: false }, (row) => {
                    jsonData.push(row.values.slice(1).map(v => v === null || v === undefined ? '' : v));
                });

                if (jsonData.length < 2) throw new Error("El archivo está vacío.");

                const headers = jsonData[0].map(h => h.toString().toLowerCase().trim().replace(/\s+/g, ''));
                const map = { 
                    sector: headers.indexOf('sector'), 
                    ncom: headers.indexOf('nombrecomercial'), 
                    nper: headers.indexOf('nombrepersonal'), 
                    tel: headers.indexOf('telefono'), 
                    cep: headers.indexOf('cep'),
                    coords: headers.indexOf('coordenadas')
                };

                _clientesParaImportar = jsonData.slice(1).map(row => {
                    const nameCom = (row[map.ncom] || '').toString().trim().toUpperCase();
                    if (!nameCom) return null;
                    const sv = {}; TIPOS_VACIO.forEach(t => sv[t] = 0);
                    return {
                        sector: (row[map.sector] || '').toString().trim().toUpperCase(),
                        nombreComercial: nameCom,
                        nombrePersonal: (row[map.nper] || '').toString().trim().toUpperCase(),
                        telefono: (row[map.tel] || '').toString().trim(),
                        codigoCEP: (row[map.cep] || 'N/A').toString().trim(),
                        coordenadas: (row[map.coords] || '').toString().trim(),
                        saldoVacios: sv
                    };
                }).filter(c => c !== null);
                renderPreviewTable(_clientesParaImportar);
            } catch (err) { _showModal('Error', err.message); }
        };
        reader.readAsArrayBuffer(file);
    }

    function renderPreviewTable(clientes) {
        const cont = document.getElementById('preview-container');
        const acts = document.getElementById('import-actions');
        if (clientes.length === 0) { cont.innerHTML = '<p class="text-red-500 p-4">No hay datos válidos.</p>'; return; }
        let html = `<table class="min-w-full text-xs"><thead><tr class="bg-gray-100 text-left"><th>Sector</th><th>Comercial</th><th>GPS</th></tr></thead><tbody>`;
        clientes.slice(0, 10).forEach(c => { 
            html += `<tr class="border-b"><td>${c.sector}</td><td>${c.nombreComercial}</td><td>${c.coordenadas ? 'SI' : 'NO'}</td></tr>`; 
        });
        html += '</tbody></table>';
        cont.innerHTML = html;
        acts.classList.remove('hidden');
        document.getElementById('confirmImportBtn').onclick = handleConfirmImport;
        document.getElementById('cancelImportBtn').onclick = () => showImportarClientesView();
    }

    async function handleConfirmImport() {
        _showModal('Progreso', 'Sincronizando con Firebase...');
        try {
            const batch = _writeBatch(_db);
            const secRef = _collection(_db, SECTORES_COLLECTION_PATH);
            const cliRef = _collection(_db, CLIENTES_COLLECTION_PATH);
            
            const newSecs = new Set(_clientesParaImportar.map(c => c.sector).filter(s => s));
            newSecs.forEach(s => _setDoc(_doc(secRef), { name: s }));
            _clientesParaImportar.forEach(c => _setDoc(_doc(cliRef), c));
            
            await batch.commit();
            _showModal('Éxito', `Importación de ${_clientesParaImportar.length} clientes exitosa.`);
            showFuncionesAvanzadasView();
        } catch (e) { _showModal('Error', e.message); }
    }

    function getCurrentCoordinates(inputId) {
        const input = document.getElementById(inputId);
        if (!navigator.geolocation) return _showModal('Error', 'Geolocalización no soportada.');
        input.placeholder = "Localizando...";
        navigator.geolocation.getCurrentPosition(p => {
            input.value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
        }, () => _showModal('Error', 'No se pudo obtener ubicación.'));
    }

    function showAgregarClienteView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Nuevo Cliente</h2>
                    <form id="clienteForm" class="space-y-4 text-left">
                        <div><label class="text-sm font-bold">Sector</label><div class="flex gap-2"><select id="sector" class="w-full p-2 border rounded" required></select><button type="button" id="addSectorBtn" class="bg-gray-200 px-3 rounded font-bold hover:bg-gray-300">+</button></div></div>
                        <div><label class="text-sm font-bold">Nombre Comercial</label><input type="text" id="nombreComercial" class="w-full p-2 border rounded" required></div>
                        <div><label class="text-sm font-bold">Nombre Personal</label><input type="text" id="nombrePersonal" class="w-full p-2 border rounded" required></div>
                        <div><label class="text-sm font-bold">Teléfono</label><input type="tel" id="telefono" class="w-full p-2 border rounded" required></div>
                        <div><label class="text-sm font-bold">CEP</label><div class="flex items-center gap-2"><input type="text" id="codigoCEP" class="w-full p-2 border rounded"><label class="text-xs text-gray-400 flex items-center whitespace-nowrap"><input type="checkbox" id="cepNA" class="mr-1"> N/A</label></div></div>
                        <div><label class="text-sm font-bold">Coordenadas GPS</label><div class="flex gap-2"><input type="text" id="coordenadas" class="w-full p-2 border rounded" placeholder="Lat, Lon"><button type="button" id="getCoordsBtn" class="bg-blue-500 text-white px-3 rounded hover:bg-blue-600 transition">📍</button></div></div>
                        <button type="submit" class="w-full bg-green-500 text-white py-3 rounded-lg font-bold shadow-md mt-4 hover:bg-green-600">Guardar</button>
                    </form>
                    <button id="backBtn" class="w-full mt-4 text-gray-400 font-medium">Volver</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'sector', 'Sector');
        document.getElementById('cepNA').onchange = (e) => { const i = document.getElementById('codigoCEP'); i.value = e.target.checked ? 'N/A' : ''; i.disabled = e.target.checked; };
        document.getElementById('getCoordsBtn').onclick = () => getCurrentCoordinates('coordenadas');
        document.getElementById('addSectorBtn').onclick = () => _showAddItemModal(SECTORES_COLLECTION_PATH, 'Sector');
        document.getElementById('clienteForm').onsubmit = agregarCliente;
        document.getElementById('backBtn').onclick = window.showClientesSubMenu;
    }

    async function agregarCliente(e) {
        e.preventDefault();
        const f = e.target;
        const nCom = f.nombreComercial.value.trim().toUpperCase();
        const duplicado = _clientesCache.find(c => c.nombreComercial.toUpperCase() === nCom);
        
        const guardar = async () => {
            const sv = {}; TIPOS_VACIO.forEach(t => sv[t] = 0);
            const data = {
                sector: f.sector.value.toUpperCase(),
                nombreComercial: nCom,
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
            } catch (err) { _showModal('Error', err.message); }
        };

        if (duplicado) _showModal('Atención', `Ya existe un cliente "${nCom}". ¿Deseas crearlo igualmente?`, guardar, 'Sí, Guardar', null, true);
        else await guardar();
    }

    function showVerClientesView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Lista General de Clientes</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <input type="text" id="search" placeholder="Buscar por nombre..." class="p-2 border rounded-lg focus:ring-2 focus:ring-indigo-400">
                        <select id="f-sector" class="p-2 border rounded-lg focus:ring-2 focus:ring-indigo-400"><option value="">Todos los sectores</option></select>
                    </div>
                    <div id="list" class="overflow-x-auto max-h-96 text-sm border rounded bg-white"></div>
                    <button id="back" class="mt-6 w-full bg-gray-400 text-white py-3 rounded-lg font-bold">Volver</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'f-sector', 'Sector');
        const unsub = _onSnapshot(_collection(_db, CLIENTES_COLLECTION_PATH), (snap) => {
            _clientesCache = snap.docs.map(d => ({id: d.id, ...d.data()}));
            render();
        });
        _activeListeners.push(unsub);
        
        const render = () => {
            const term = document.getElementById('search').value.toUpperCase();
            const sec = document.getElementById('f-sector').value;
            const filtered = _clientesCache.filter(c => (c.nombreComercial.includes(term) || c.nombrePersonal.includes(term)) && (!sec || c.sector === sec));
            document.getElementById('list').innerHTML = `<table class="w-full"><thead><tr class="bg-gray-100 text-left border-b"><th>Comercial</th><th>Sector</th><th>Acciones</th></tr></thead><tbody>` +
                filtered.map(c => `<tr><td class="p-2 font-bold text-indigo-900">${c.nombreComercial}</td><td>${c.sector}</td><td class="flex gap-1 py-2">
                    <button onclick="window.clientesModule.editCliente('${c.id}')" class="bg-yellow-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-yellow-600 transition">Editar</button>
                    <button onclick="window.clientesModule.deleteCliente('${c.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-red-600 transition">Borrar</button>
                </td></tr>`).join('') + `</tbody></table>`;
        };
        document.getElementById('search').oninput = render;
        document.getElementById('f-sector').onchange = render;
        document.getElementById('back').onclick = window.showClientesSubMenu;
    }

    function editCliente(id) {
        const c = _clientesCache.find(x => x.id === id);
        if (!c) return;
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg bg-white p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-6 text-center text-indigo-800">Modificar Cliente</h2>
                    <form id="editForm" class="space-y-4 text-left">
                        <div><label class="text-xs font-bold text-gray-500 uppercase">Sector</label><select id="e-sec" class="w-full p-2 border rounded" required></select></div>
                        <div><label class="text-xs font-bold text-gray-500 uppercase">Nombre Comercial</label><input type="text" id="e-com" value="${c.nombreComercial}" class="w-full p-2 border rounded" required></div>
                        <div><label class="text-xs font-bold text-gray-500 uppercase">Nombre Personal</label><input type="text" id="e-per" value="${c.nombrePersonal}" class="w-full p-2 border rounded" required></div>
                        <div><label class="text-xs font-bold text-gray-500 uppercase">Teléfono</label><input type="tel" id="e-tel" value="${c.telefono}" class="w-full p-2 border rounded" required></div>
                        <div><label class="text-xs font-bold text-gray-500 uppercase">Código CEP</label><input type="text" id="e-cep" value="${c.codigoCEP}" class="w-full p-2 border rounded"></div>
                        <div><label class="text-xs font-bold text-gray-500 uppercase">Coordenadas</label><div class="flex gap-2"><input type="text" id="e-gps" value="${c.coordenadas}" class="w-full p-2 border rounded" placeholder="Lat, Lon"><button type="button" id="getEgps" class="bg-blue-500 text-white px-3 rounded shadow">📍</button></div></div>
                        <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-indigo-700 transition mt-4">Actualizar Datos</button>
                    </form>
                    <button id="cancelEdit" class="w-full mt-4 text-gray-400 font-medium">Cancelar</button>
                </div>
            </div>
        `;
        _populateDropdown(SECTORES_COLLECTION_PATH, 'e-sec', 'Sector', c.sector);
        document.getElementById('getEgps').onclick = () => getCurrentCoordinates('e-gps');
        document.getElementById('cancelEdit').onclick = showVerClientesView;
        document.getElementById('editForm').onsubmit = async e => {
            e.preventDefault();
            const data = {
                sector: document.getElementById('e-sec').value.toUpperCase(),
                nombreComercial: document.getElementById('e-com').value.toUpperCase().trim(),
                nombrePersonal: document.getElementById('e-per').value.toUpperCase().trim(),
                telefono: document.getElementById('e-tel').value.trim(),
                codigoCEP: document.getElementById('e-cep').value.trim() || 'N/A',
                coordenadas: document.getElementById('e-gps').value.trim()
            };
            try {
                await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id), data, { merge: true });
                _showModal('Éxito', 'Información actualizada en Firebase.');
                showVerClientesView();
            } catch (err) { _showModal('Error', err.message); }
        };
    }

    function deleteCliente(id) {
        _showModal('Confirmación', '¿Eliminar este cliente de forma permanente?', async () => {
            await _deleteDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id));
        }, 'Eliminar', null, true);
    }

    function showSaldosVaciosView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Estado de Envases de Clientes</h2>
                <div id="saldos" class="space-y-3 text-left"></div>
                <button onclick="window.showClientesSubMenu()" class="mt-6 w-full bg-gray-400 text-white py-3 rounded-lg font-bold transition">Volver</button>
            </div></div>
        `;
        const cont = document.getElementById('saldos');
        const unsub = _onSnapshot(_collection(_db, CLIENTES_COLLECTION_PATH), snap => {
            const clients = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.saldoVacios);
            cont.innerHTML = clients.map(c => {
                const s = Object.entries(c.saldoVacios).map(([t, v]) => `${t}: <b class="${v!==0?'text-red-500':'text-gray-400'}">${v}</b>`).join(' | ');
                return `<div class="p-4 border rounded-lg flex justify-between items-center bg-white shadow-sm hover:border-indigo-300 transition">
                    <div><b class="text-indigo-900">${c.nombreComercial}</b><br><span class="text-xs font-semibold">${s}</span></div>
                    <button onclick="window.clientesModule.showSaldoDetalleModal('${c.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-md text-xs font-bold shadow-sm hover:bg-blue-700">Ajustar</button>
                </div>`;
            }).join('');
        });
        _activeListeners.push(unsub);
    }

    async function showSaldoDetalleModal(id) {
        const c = _clientesCache.find(x => x.id === id);
        const modalHtml = `
            <div class="space-y-4">
                <div><label class="text-xs font-bold text-gray-500 uppercase">Envase</label><select id="adj-type" class="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-300">${TIPOS_VACIO.map(t => `<option>${t}</option>`)}</select></div>
                <div><label class="text-xs font-bold text-gray-500 uppercase">Cantidad</label><input type="number" id="adj-qty" placeholder="Ej: 5" class="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-300"></div>
                <div class="flex gap-3 pt-2">
                    <button id="btn-p" class="flex-1 py-3 bg-yellow-500 text-gray-800 rounded font-bold shadow hover:bg-yellow-600">Préstamo (+)</button>
                    <button id="btn-d" class="flex-1 py-3 bg-green-500 text-white rounded font-bold shadow hover:bg-green-600">Devolución (-)</button>
                </div>
            </div>
        `;
        _showModal(`Saldo: ${c.nombreComercial}`, modalHtml);
        const update = async (mode) => {
            const t = document.getElementById('adj-type').value, q = parseInt(document.getElementById('adj-qty').value);
            if (!q || q <= 0) return;
            const sv = { ...c.saldoVacios }; sv[t] = (sv[t] || 0) + (mode === 'p' ? q : -q);
            try {
                await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id), { saldoVacios: sv }, { merge: true });
                document.getElementById('modalContainer').classList.add('hidden');
            } catch (err) { _showModal('Error', 'Fallo al actualizar saldo.'); }
        };
        document.getElementById('btn-p').onclick = () => update('p');
        document.getElementById('btn-d').onclick = () => update('d');
    }

    function showDatosMaestrosSectoresView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto max-w-md bg-white p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Gestión de Sectores</h2>
                <div id="sec-list" class="space-y-2 text-left mb-6 max-h-72 overflow-y-auto"></div>
                <button id="backSec" class="w-full py-3 bg-gray-400 text-white rounded-lg font-bold shadow hover:bg-gray-500 transition">Volver</button>
            </div></div>
        `;
        document.getElementById('backSec').onclick = showFuncionesAvanzadasView;
        const unsub = _onSnapshot(_collection(_db, SECTORES_COLLECTION_PATH), snap => {
            const list = document.getElementById('sec-list');
            if(!list) return;
            list.innerHTML = snap.docs.map(d => `<div class="flex justify-between items-center p-3 border-b hover:bg-gray-50">
                <span class="font-medium text-gray-700">${d.data().name}</span>
                <button onclick="window.clientesModule.deleteSector('${d.id}','${d.data().name}')" class="text-red-500 font-bold px-2 py-1 border border-red-100 rounded hover:bg-red-50">X</button>
            </div>`).join('');
        });
        _activeListeners.push(unsub);
    }

    async function deleteSector(id, name) {
        _showModal('Borrar', `¿Eliminar sector "${name}"? No debe haber clientes vinculados.`, async () => { 
            await _deleteDoc(_doc(_db, SECTORES_COLLECTION_PATH, id)); 
        }, 'Eliminar', null, true);
    }

    async function handleDeleteAllClientes() {
        _showModal('BORRADO MASIVO', '¡ADVERTENCIA! Se borrarán TODOS los clientes. Esta acción es definitiva.', async () => {
            _showModal('Progreso', 'Vaciando colección pública...');
            const snap = await _getDocs(_collection(_db, CLIENTES_COLLECTION_PATH));
            const batch = _writeBatch(_db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            _showModal('Éxito', 'Todos los clientes han sido eliminados.');
        }, 'BORRAR TODOS', null, true);
    }

    window.clientesModule = { editCliente, deleteCliente, deleteSector, showSaldoDetalleModal };

})();

// --- Módulo de Gestión de Archivos y ADC ---

(function() {
    let _db, _storage, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where, _getDoc, _doc, _addDoc, _deleteDoc, _orderBy;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    
    let _clientesCache = [];
    let _clienteSeleccionado = null;
    let _categoriaActual = 'documentos'; // 'documentos', 'imagenes', 'adc'

    window.initArchivos = function(dependencies) {
        _db = dependencies.db;
        _storage = dependencies.storage; // NUEVA DEPENDENCIA PARA STORAGE
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
        _getDoc = dependencies.getDoc;
        _doc = dependencies.doc;
        _addDoc = dependencies.addDoc;
        _deleteDoc = dependencies.deleteDoc;
        _orderBy = dependencies.orderBy;

        console.log("Módulo Archivos Inicializado.");
    };

    window.showArchivosView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-8 w-full max-w-6xl mx-auto flex flex-col h-screen">
                <div class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border-t-4 border-teal-600">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                        <h2 class="text-xl sm:text-2xl font-black text-gray-800 tracking-tight">📁 Archivos y Equipos (ADC)</h2>
                        <button id="btnVolverArchivos" class="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition">Volver al Menú</button>
                    </div>

                    <div class="mb-4 relative z-50">
                        <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Seleccionar Cliente:</label>
                        <input type="text" id="arcClientSearch" placeholder="Escriba el nombre o RIF del cliente..." class="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition">
                        <div id="arcClientDropdown" class="absolute w-full bg-white border border-gray-300 rounded-b-md shadow-lg hidden max-h-60 overflow-y-auto mt-1"></div>
                        
                        <div id="arcClientSelected" class="hidden mt-2 p-3 bg-teal-50 text-teal-900 font-bold rounded flex justify-between items-center border border-teal-200 shadow-sm">
                            <span id="arcClientName" class="truncate pr-2 text-sm sm:text-base"></span>
                            <button id="arcClientClear" class="text-red-500 hover:text-red-700 text-2xl leading-none font-black px-2">&times;</button>
                        </div>
                    </div>

                    <div id="arcWorkArea" class="hidden flex-col flex-grow overflow-hidden">
                        
                        <div class="flex border-b border-gray-200 mb-4">
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-teal-600 text-teal-600" data-cat="documentos">📄 Documentos</button>
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-teal-500 transition" data-cat="imagenes">🖼️ Imágenes</button>
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-teal-500 transition" data-cat="adc">❄️ Equipos ADC</button>
                        </div>

                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 shadow-inner">
                            <form id="arcUploadForm" class="space-y-4">
                                
                                <div id="adcMetadataFields" class="hidden grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 bg-blue-50 border border-blue-200 rounded">
                                    <div>
                                        <label class="block text-xs font-bold text-blue-800 mb-1">Compañía:</label>
                                        <select id="adcEmpresa" class="w-full p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500">
                                            <option value="">Seleccione...</option>
                                            <option value="PCV (Pepsi)">PCV (Pepsi)</option>
                                            <option value="CMYV (Cervecería)">CMYV (Cervecería)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-blue-800 mb-1">Modelo:</label>
                                        <select id="adcModelo" class="w-full p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500">
                                            <option value="">Seleccione...</option>
                                            <option value="Visicooler">Visicooler</option>
                                            <option value="Froster">Froster</option>
                                            <option value="Babycooler">Babycooler</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-blue-800 mb-1">Cant. Puertas:</label>
                                        <input type="number" id="adcPuertas" min="1" class="w-full p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Ej: 1 o 2">
                                    </div>
                                </div>

                                <div class="flex flex-col sm:flex-row gap-3 items-end">
                                    <div class="flex-grow w-full">
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Seleccionar Archivo:</label>
                                        <input type="file" id="arcFileInput" class="w-full p-2 border border-gray-300 rounded bg-white text-sm" accept=".pdf,.doc,.docx,.xls,.xlsx">
                                    </div>
                                    <button type="submit" id="btnSubirArchivo" class="w-full sm:w-auto px-6 py-2.5 bg-teal-600 text-white font-bold rounded shadow hover:bg-teal-700 transition flex items-center justify-center gap-2">
                                        <span>⬆️</span> Subir
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div class="flex-grow overflow-y-auto bg-gray-100 p-4 rounded-lg border border-gray-200">
                            <h3 class="font-bold text-gray-700 mb-3 border-b border-gray-300 pb-1" id="arcGalleryTitle">Documentos Guardados</h3>
                            <div id="arcGalleryGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <p class="text-gray-500 text-sm col-span-full text-center py-4">Seleccione una pestaña para ver los archivos.</p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnVolverArchivos').addEventListener('click', _showMainMenu);
        
        // Búsqueda de clientes
        const searchInput = document.getElementById('arcClientSearch');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = _clientesCache.filter(c => 
                (c.nombreComercial || '').toLowerCase().includes(term) || 
                (c.rif || '').toLowerCase().includes(term)
            ).slice(0, 10);
            renderClientDropdown(filtered);
        });

        document.getElementById('arcClientClear').addEventListener('click', clearClientSelection);

        // Control de Pestañas
        document.querySelectorAll('.arc-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Quitar estilo activo a todas
                document.querySelectorAll('.arc-tab-btn').forEach(b => {
                    b.classList.remove('border-teal-600', 'text-teal-600');
                    b.classList.add('border-transparent', 'text-gray-500');
                });
                // Dar estilo a la clickeada
                e.target.classList.remove('border-transparent', 'text-gray-500');
                e.target.classList.add('border-teal-600', 'text-teal-600');
                
                _categoriaActual = e.target.dataset.cat;
                actualizarInterfazPorCategoria();
                cargarArchivosDeCategoria();
            });
        });

        document.getElementById('arcUploadForm').addEventListener('submit', handleFileUpload);

        await cargarClientes();
    };

    async function cargarClientes() {
        try {
            const snapClientes = await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`));
            _clientesCache = snapClientes.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error("Error cargando clientes para archivos:", e);
        }
    }

    function renderClientDropdown(clientes) {
        const dropdown = document.getElementById('arcClientDropdown');
        dropdown.innerHTML = '';
        if (clientes.length === 0 || document.getElementById('arcClientSearch').value.trim() === '') {
            dropdown.classList.add('hidden');
            return;
        }
        
        clientes.forEach(c => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-teal-50 cursor-pointer text-sm text-gray-800 transition flex items-center';
            div.innerHTML = `<span class="font-bold truncate">${c.nombreComercial}</span> <span class="text-xs text-gray-500 ml-2">(${c.rif || 'Sin RIF'})</span>`;
            div.onclick = () => seleccionarCliente(c);
            dropdown.appendChild(div);
        });
        dropdown.classList.remove('hidden');
    }

    function seleccionarCliente(cliente) {
        _clienteSeleccionado = cliente;
        document.getElementById('arcClientSearch').classList.add('hidden');
        document.getElementById('arcClientDropdown').classList.add('hidden');
        document.getElementById('arcClientSelected').classList.remove('hidden');
        document.getElementById('arcClientName').textContent = cliente.nombreComercial;
        document.getElementById('arcWorkArea').classList.remove('hidden');
        document.getElementById('arcWorkArea').classList.add('flex');
        
        actualizarInterfazPorCategoria();
        cargarArchivosDeCategoria();
    }

    function clearClientSelection() {
        _clienteSeleccionado = null;
        document.getElementById('arcClientSelected').classList.add('hidden');
        document.getElementById('arcClientSearch').classList.remove('hidden');
        document.getElementById('arcClientSearch').value = '';
        document.getElementById('arcWorkArea').classList.add('hidden');
        document.getElementById('arcWorkArea').classList.remove('flex');
        document.getElementById('arcGalleryGrid').innerHTML = '';
    }

    function actualizarInterfazPorCategoria() {
        const fileInput = document.getElementById('arcFileInput');
        const adcFields = document.getElementById('adcMetadataFields');
        const title = document.getElementById('arcGalleryTitle');

        if (_categoriaActual === 'documentos') {
            fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx";
            adcFields.classList.add('hidden');
            title.textContent = "📄 Documentos Guardados";
            // Limpiar requeridos de ADC
            document.getElementById('adcEmpresa').required = false;
            document.getElementById('adcModelo').required = false;
            document.getElementById('adcPuertas').required = false;
        } 
        else if (_categoriaActual === 'imagenes') {
            fileInput.accept = "image/png, image/jpeg, image/jpg";
            adcFields.classList.add('hidden');
            title.textContent = "🖼️ Imágenes Generales";
            document.getElementById('adcEmpresa').required = false;
            document.getElementById('adcModelo').required = false;
            document.getElementById('adcPuertas').required = false;
        } 
        else if (_categoriaActual === 'adc') {
            fileInput.accept = "image/png, image/jpeg, image/jpg";
            adcFields.classList.remove('hidden');
            title.textContent = "❄️ Equipos ADC Asignados";
            document.getElementById('adcEmpresa').required = true;
            document.getElementById('adcModelo').required = true;
            document.getElementById('adcPuertas').required = true;
        }
    }

    async function handleFileUpload(e) {
        e.preventDefault();
        if (!_storage) {
            _showModal('Error', 'El servicio de Storage no está configurado.');
            return;
        }

        const fileInput = document.getElementById('arcFileInput');
        const file = fileInput.files[0];

        if (!file) {
            _showModal('Aviso', 'Seleccione un archivo primero.');
            return;
        }

        let metadataADC = null;
        if (_categoriaActual === 'adc') {
            metadataADC = {
                empresa: document.getElementById('adcEmpresa').value,
                modelo: document.getElementById('adcModelo').value,
                puertas: parseInt(document.getElementById('adcPuertas').value, 10)
            };
        }

        _showModal('Subiendo...', `Subiendo archivo: ${file.name}`, null, '', null, false);

        try {
            // 1. Crear referencia en Firebase Storage
            // Ruta: clientes/{clienteId}/{categoria}/{timestamp}_{nombredelarchivo}
            const uniqueName = `${new Date().getTime()}_${file.name}`;
            const storagePath = `clientes/${_clienteSeleccionado.id}/${_categoriaActual}/${uniqueName}`;
            const storageRefObj = window.firebaseStorageFunctions.ref(_storage, storagePath);

            // 2. Subir el archivo
            await window.firebaseStorageFunctions.uploadBytes(storageRefObj, file);

            // 3. Obtener la URL de descarga
            const downloadURL = await window.firebaseStorageFunctions.getDownloadURL(storageRefObj);

            // 4. Guardar referencia y metadata en Firestore
            const docData = {
                clienteId: _clienteSeleccionado.id,
                categoria: _categoriaActual,
                fileName: file.name,
                storagePath: storagePath,
                url: downloadURL,
                fechaCreacion: new Date().toISOString(),
                subidoPor: _userId
            };

            if (metadataADC) {
                docData.adcInfo = metadataADC;
            }

            await _addDoc(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`), docData);

            // Limpiar formulario y recargar
            document.getElementById('arcUploadForm').reset();
            document.getElementById('modalContainer').classList.add('hidden');
            
            cargarArchivosDeCategoria();

        } catch (error) {
            console.error("Error subiendo archivo:", error);
            _showModal('Error', `Falló la subida: ${error.message}`);
        }
    }

    async function cargarArchivosDeCategoria() {
        const grid = document.getElementById('arcGalleryGrid');
        grid.innerHTML = '<p class="col-span-full text-center text-teal-600 animate-pulse py-6">Cargando archivos...</p>';

        try {
            const archivosRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`);
            // Filtrar por cliente y categoría actual
            const q = _query(
                archivosRef, 
                _where("clienteId", "==", _clienteSeleccionado.id),
                _where("categoria", "==", _categoriaActual)
            );

            const snap = await _getDocs(q);
            
            if (snap.empty) {
                grid.innerHTML = '<p class="col-span-full text-center text-gray-500 py-6">No hay archivos en esta categoría.</p>';
                return;
            }

            let html = '';
            const archivos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Ordenar por fecha descendente
            archivos.sort((a,b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

            archivos.forEach(arc => {
                const fechaFormat = new Date(arc.fechaCreacion).toLocaleDateString('es-ES');
                
                if (_categoriaActual === 'adc' || _categoriaActual === 'imagenes') {
                    // Mostrar como Tarjeta de Imagen
                    let metaHTML = '';
                    if (arc.adcInfo) {
                        metaHTML = `
                            <div class="text-xs text-blue-800 bg-blue-50 p-2 mt-2 rounded border border-blue-100">
                                <p><b>Empresa:</b> ${arc.adcInfo.empresa}</p>
                                <p><b>Modelo:</b> ${arc.adcInfo.modelo}</p>
                                <p><b>Puertas:</b> ${arc.adcInfo.puertas}</p>
                            </div>
                        `;
                    }
                    html += `
                        <div class="bg-white p-3 rounded-lg shadow border border-gray-200 flex flex-col">
                            <a href="${arc.url}" target="_blank" class="block h-32 w-full mb-2 overflow-hidden rounded bg-gray-100 border flex items-center justify-center">
                                <img src="${arc.url}" alt="${arc.fileName}" class="max-h-full max-w-full object-contain hover:scale-105 transition-transform">
                            </a>
                            <div class="flex-grow">
                                <p class="text-xs text-gray-500 mb-1">${fechaFormat}</p>
                                <p class="text-sm font-bold text-gray-800 truncate" title="${arc.fileName}">${arc.fileName}</p>
                                ${metaHTML}
                            </div>
                            <button onclick="window.archivosModule.eliminarArchivo('${arc.id}', '${arc.storagePath}')" class="mt-3 w-full py-1.5 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded text-xs font-bold transition">Eliminar</button>
                        </div>
                    `;
                } else {
                    // Mostrar como Documento (Archivo Genérico)
                    html += `
                        <div class="bg-white p-4 rounded-lg shadow border border-gray-200 flex items-center justify-between gap-3 hover:bg-teal-50 transition">
                            <div class="flex items-center gap-3 overflow-hidden">
                                <div class="text-3xl">📄</div>
                                <div class="overflow-hidden">
                                    <p class="text-xs text-gray-500">${fechaFormat}</p>
                                    <a href="${arc.url}" target="_blank" class="text-sm font-bold text-teal-700 hover:underline truncate block" title="${arc.fileName}">${arc.fileName}</a>
                                </div>
                            </div>
                            <button onclick="window.archivosModule.eliminarArchivo('${arc.id}', '${arc.storagePath}')" class="p-2 text-gray-400 hover:text-red-600 transition" title="Eliminar Archivo">🗑️</button>
                        </div>
                    `;
                }
            });

            grid.innerHTML = html;

        } catch (error) {
            console.error("Error listando archivos:", error);
            grid.innerHTML = '<p class="col-span-full text-center text-red-500 py-6">Error al cargar los archivos.</p>';
        }
    }

    async function eliminarArchivo(docId, storagePath) {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo los administradores pueden borrar archivos físicos.');
            return;
        }

        _showModal('Confirmar', '¿Estás seguro de eliminar este archivo permanentemente?', async () => {
            _showModal('Progreso', 'Eliminando archivo...', null, '', null, false);
            try {
                // 1. Borrar de Storage
                const storageRefObj = window.firebaseStorageFunctions.ref(_storage, storagePath);
                await window.firebaseStorageFunctions.deleteObject(storageRefObj);

                // 2. Borrar referencia de Firestore
                await _deleteDoc(_doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`, docId));

                document.getElementById('modalContainer').classList.add('hidden');
                cargarArchivosDeCategoria(); // Recargar la vista

            } catch (error) {
                console.error("Error eliminando archivo:", error);
                _showModal('Error', `No se pudo eliminar el archivo: ${error.message}`);
            }
        }, 'Sí, Eliminar');
    }

    // Exponer para que los botones HTML lo encuentren
    window.archivosModule = {
        eliminarArchivo
    };

})();

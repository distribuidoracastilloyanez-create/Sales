// --- Módulo de Gestión de Archivos y ADC ---

(function() {
    let _db, _storage, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where, _getDoc, _doc, _addDoc, _deleteDoc, _orderBy;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    
    let _clientesCache = [];
    let _archivosCache = []; // NUEVO: Caché para facilitar la eliminación de múltiples archivos
    let _clienteSeleccionado = null;
    let _categoriaActual = 'documentos'; // 'documentos', 'imagenes', 'adc'

    window.initArchivos = function(dependencies) {
        _db = dependencies.db;
        _storage = dependencies.storage; 
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

        console.log("Módulo Archivos Inicializado (Agrupación de Imágenes Múltiples).");
    };

    window.showArchivosView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-8 w-full max-w-6xl mx-auto flex flex-col h-screen overflow-hidden">
                <div class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-y-auto border-t-4 border-teal-600">
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

                    <div id="arcWorkArea" class="hidden flex-col flex-grow">
                        
                        <div class="flex border-b border-gray-200 mb-4">
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-teal-600 text-teal-600" data-cat="documentos">📄 Documentos</button>
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-teal-500 transition" data-cat="imagenes">🖼️ Imágenes</button>
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-teal-500 transition" data-cat="adc">❄️ Equipos ADC</button>
                        </div>

                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-gray-700 text-lg" id="arcGalleryTitle">Documentos Guardados</h3>
                            <button id="btnShowAddForm" class="px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded shadow hover:bg-teal-700 transition flex items-center gap-1">
                                + <span id="btnShowAddFormText">Agregar Documento</span>
                            </button>
                        </div>

                        <div id="arcFormContainer" class="hidden bg-gray-50 p-4 rounded-lg border border-teal-200 mb-4 shadow-inner">
                            <form id="arcUploadForm" class="space-y-4">
                                <div class="flex justify-between items-center border-b border-gray-200 pb-2 mb-3">
                                    <h4 class="font-bold text-gray-800" id="arcFormTitle">Subir Nuevo Archivo</h4>
                                    <button type="button" id="btnCancelAdd" class="text-gray-400 hover:text-red-500 font-bold text-sm flex items-center gap-1">&times; Cancelar</button>
                                </div>
                                
                                <div id="adcMetadataFields" class="hidden grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-blue-50 border border-blue-200 rounded">
                                    <div>
                                        <label class="block text-xs font-bold text-blue-800 mb-1">División:</label>
                                        <select id="adcDivision" class="w-full p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500">
                                            <option value="">Seleccione...</option>
                                            <option value="PCV (Pepsi)">PCV (Pepsi)</option>
                                            <option value="CMYV (Cervecería)">CMYV (Cervecería)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-blue-800 mb-1">Código del Activo:</label>
                                        <input type="text" id="adcCodigo" class="w-full p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 uppercase" placeholder="Ej: ADC-12345">
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
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Seleccionar Archivo(s) <span class="text-red-500">*</span></label>
                                        <input type="file" id="arcFileInput" class="w-full p-2 border border-gray-300 rounded bg-white text-sm" accept=".pdf,.doc,.docx,.xls,.xlsx" required>
                                        <p id="multiFileHint" class="text-[10px] text-gray-500 mt-1 hidden">Puede seleccionar varias fotos a la vez para este registro.</p>
                                    </div>
                                    <button type="submit" id="btnSubirArchivo" class="w-full sm:w-auto px-6 py-2.5 bg-teal-600 text-white font-bold rounded shadow hover:bg-teal-700 transition flex items-center justify-center gap-2">
                                        <span>💾</span> Guardar
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div class="flex-grow bg-gray-100 p-4 rounded-lg border border-gray-200 min-h-[300px]">
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

        // Control de UI del Formulario
        document.getElementById('btnShowAddForm').addEventListener('click', () => {
            document.getElementById('arcFormContainer').classList.remove('hidden');
        });
        document.getElementById('btnCancelAdd').addEventListener('click', () => {
            document.getElementById('arcFormContainer').classList.add('hidden');
            document.getElementById('arcUploadForm').reset();
        });

        // Control de Pestañas
        document.querySelectorAll('.arc-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.getElementById('arcFormContainer').classList.add('hidden');
                document.getElementById('arcUploadForm').reset();

                document.querySelectorAll('.arc-tab-btn').forEach(b => {
                    b.classList.remove('border-teal-600', 'text-teal-600');
                    b.classList.add('border-transparent', 'text-gray-500');
                });
                
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
        document.getElementById('arcFormContainer').classList.add('hidden');
    }

    function actualizarInterfazPorCategoria() {
        const fileInput = document.getElementById('arcFileInput');
        const adcFields = document.getElementById('adcMetadataFields');
        const title = document.getElementById('arcGalleryTitle');
        const btnAddText = document.getElementById('btnShowAddFormText');
        const formTitle = document.getElementById('arcFormTitle');
        const multiHint = document.getElementById('multiFileHint');

        if (_categoriaActual === 'documentos') {
            fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx";
            fileInput.removeAttribute('multiple');
            multiHint.classList.add('hidden');
            adcFields.classList.add('hidden');
            
            title.textContent = "📄 Documentos Guardados";
            btnAddText.textContent = "Agregar Documento";
            formTitle.textContent = "Subir Nuevo Documento";
            
            document.getElementById('adcDivision').required = false;
            document.getElementById('adcCodigo').required = false;
            document.getElementById('adcModelo').required = false;
            document.getElementById('adcPuertas').required = false;
        } 
        else if (_categoriaActual === 'imagenes') {
            fileInput.accept = "image/png, image/jpeg, image/jpg";
            fileInput.setAttribute('multiple', 'true'); 
            multiHint.classList.remove('hidden');
            adcFields.classList.add('hidden');
            
            title.textContent = "🖼️ Registros Fotográficos Generales";
            btnAddText.textContent = "Agregar Registro de Imágenes";
            formTitle.textContent = "Subir Nuevo Lote de Imágenes";

            document.getElementById('adcDivision').required = false;
            document.getElementById('adcCodigo').required = false;
            document.getElementById('adcModelo').required = false;
            document.getElementById('adcPuertas').required = false;
        } 
        else if (_categoriaActual === 'adc') {
            fileInput.accept = "image/png, image/jpeg, image/jpg";
            fileInput.setAttribute('multiple', 'true'); 
            multiHint.classList.remove('hidden');
            adcFields.classList.remove('hidden');
            
            title.textContent = "❄️ Equipos ADC Asignados";
            btnAddText.textContent = "Registrar Equipo ADC";
            formTitle.textContent = "Registrar Nuevo Equipo y sus Fotos";

            document.getElementById('adcDivision').required = true;
            document.getElementById('adcCodigo').required = true;
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
        const files = fileInput.files;

        if (files.length === 0) {
            _showModal('Aviso', 'Seleccione al menos un archivo primero.');
            return;
        }

        let metadataADC = null;
        if (_categoriaActual === 'adc') {
            metadataADC = {
                division: document.getElementById('adcDivision').value,
                codigo: document.getElementById('adcCodigo').value.trim().toUpperCase(),
                modelo: document.getElementById('adcModelo').value,
                puertas: parseInt(document.getElementById('adcPuertas').value, 10)
            };
        }

        _showModal('Subiendo...', `Subiendo ${files.length} archivo(s)...`, null, '', null, false);

        try {
            const exactMoment = new Date();
            const exactMomentMs = exactMoment.getTime();
            const exactMomentISO = exactMoment.toISOString();

            if (_categoriaActual === 'adc' || _categoriaActual === 'imagenes') {
                // SUBIDA MÚLTIPLE AGRUPADA: Un solo documento Firestore con array de fotos
                const uploadPromises = Array.from(files).map(async (file, index) => {
                    const uniqueName = `${exactMomentMs}_${index}_${file.name}`;
                    const storagePath = `clientes/${_clienteSeleccionado.id}/${_categoriaActual}/${uniqueName}`;
                    const storageRefObj = window.firebaseStorageFunctions.ref(_storage, storagePath);

                    await window.firebaseStorageFunctions.uploadBytes(storageRefObj, file);
                    const downloadURL = await window.firebaseStorageFunctions.getDownloadURL(storageRefObj);
                    
                    return { 
                        url: downloadURL, 
                        storagePath: storagePath, 
                        fileName: file.name 
                    };
                });

                const archivosSubidos = await Promise.all(uploadPromises);

                const docData = {
                    clienteId: _clienteSeleccionado.id,
                    categoria: _categoriaActual,
                    archivos: archivosSubidos, // Arreglo con la metadata de TODAS las imágenes
                    fechaCreacion: exactMomentISO,
                    subidoPor: _userId
                };

                if (metadataADC) {
                    docData.adcInfo = metadataADC;
                }

                await _addDoc(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`), docData);

            } else {
                // DOCUMENTOS (1 por 1)
                const file = files[0];
                const uniqueName = `${exactMomentMs}_${file.name}`;
                const storagePath = `clientes/${_clienteSeleccionado.id}/${_categoriaActual}/${uniqueName}`;
                const storageRefObj = window.firebaseStorageFunctions.ref(_storage, storagePath);
                
                await window.firebaseStorageFunctions.uploadBytes(storageRefObj, file);
                const downloadURL = await window.firebaseStorageFunctions.getDownloadURL(storageRefObj);

                const docData = {
                    clienteId: _clienteSeleccionado.id,
                    categoria: _categoriaActual,
                    fileName: file.name,
                    storagePath: storagePath,
                    url: downloadURL,
                    fechaCreacion: exactMomentISO,
                    subidoPor: _userId
                };

                await _addDoc(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`), docData);
            }

            document.getElementById('arcUploadForm').reset();
            document.getElementById('arcFormContainer').classList.add('hidden');
            document.getElementById('modalContainer').classList.add('hidden');
            
            cargarArchivosDeCategoria();

        } catch (error) {
            console.error("Error subiendo archivo(s):", error);
            _showModal('Error', `Falló la subida: ${error.message}`);
        }
    }

    async function cargarArchivosDeCategoria() {
        const grid = document.getElementById('arcGalleryGrid');
        grid.innerHTML = '<p class="col-span-full text-center text-teal-600 animate-pulse py-6 font-bold">Cargando información...</p>';

        try {
            const archivosRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`);
            const q = _query(
                archivosRef, 
                _where("clienteId", "==", _clienteSeleccionado.id),
                _where("categoria", "==", _categoriaActual)
            );

            const snap = await _getDocs(q);
            
            if (snap.empty) {
                let emptyMsg = "No hay documentos guardados.";
                if (_categoriaActual === 'imagenes') emptyMsg = "No hay registros fotográficos.";
                if (_categoriaActual === 'adc') emptyMsg = "El cliente no tiene equipos ADC registrados.";

                grid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-6">${emptyMsg}</p>`;
                _archivosCache = [];
                return;
            }

            let html = '';
            // Guardar en caché global del módulo para poder usarlos al momento de eliminar
            _archivosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Ordenar por fecha descendente
            _archivosCache.sort((a,b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

            _archivosCache.forEach(arc => {
                const d = new Date(arc.fechaCreacion);
                const fechaFormat = d.toLocaleDateString('es-ES') + ' ' + d.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});
                
                if (_categoriaActual === 'adc' || _categoriaActual === 'imagenes') {
                    // Soporte híbrido: Documentos viejos (1 imagen) vs Nuevos (Array de imágenes)
                    const arrayFotos = arc.archivos || [{url: arc.url, fileName: arc.fileName, storagePath: arc.storagePath}];
                    
                    let metaHTML = '';
                    if (arc.adcInfo) {
                        metaHTML = `
                            <div class="text-xs text-blue-800 bg-blue-50 p-2 mt-2 rounded border border-blue-100">
                                <p><b>Cód:</b> <span class="font-black">${arc.adcInfo.codigo}</span></p>
                                <p><b>División:</b> ${arc.adcInfo.division}</p>
                                <p><b>Modelo:</b> ${arc.adcInfo.modelo}</p>
                                <p><b>Puertas:</b> ${arc.adcInfo.puertas}</p>
                            </div>
                        `;
                    }

                    // Construir el mini-grid de imágenes dentro de la tarjeta
                    const gridColsClass = arrayFotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1';
                    let imagesGridHTML = `<div class="grid ${gridColsClass} gap-2 mb-2">`;
                    
                    arrayFotos.forEach(foto => {
                        imagesGridHTML += `
                            <a href="${foto.url}" target="_blank" class="block h-28 w-full overflow-hidden rounded bg-gray-100 border relative group">
                                <img src="${foto.url}" alt="${foto.fileName}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300">
                                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span class="text-white text-[10px] font-bold border border-white px-2 py-0.5 rounded">Ver</span>
                                </div>
                            </a>
                        `;
                    });
                    imagesGridHTML += `</div>`;

                    html += `
                        <div class="bg-white p-3 rounded-lg shadow border border-gray-200 flex flex-col">
                            ${imagesGridHTML}
                            <div class="flex-grow">
                                <p class="text-[11px] text-gray-500 font-mono">📅 Registro: ${fechaFormat}</p>
                                ${metaHTML}
                            </div>
                            <button onclick="window.archivosModule.eliminarArchivo('${arc.id}')" class="mt-3 w-full py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 hover:border-transparent rounded text-xs font-bold transition uppercase tracking-wide">Eliminar Registro Completo</button>
                        </div>
                    `;
                } else {
                    // Mostrar como Documento Genérico
                    html += `
                        <div class="bg-white p-4 rounded-lg shadow border border-gray-200 flex items-center justify-between gap-3 hover:bg-teal-50 transition">
                            <div class="flex items-center gap-3 overflow-hidden">
                                <div class="text-3xl">📄</div>
                                <div class="overflow-hidden">
                                    <p class="text-[11px] text-gray-500 font-mono">${fechaFormat}</p>
                                    <a href="${arc.url}" target="_blank" class="text-sm font-bold text-teal-700 hover:underline truncate block" title="${arc.fileName}">${arc.fileName}</a>
                                </div>
                            </div>
                            <button onclick="window.archivosModule.eliminarArchivo('${arc.id}')" class="p-2 text-gray-400 hover:text-red-600 transition" title="Eliminar Archivo">🗑️</button>
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

    async function eliminarArchivo(docId) {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo los administradores pueden borrar archivos físicos o equipos.');
            return;
        }

        // Buscar el documento en la caché local
        const archivoRecord = _archivosCache.find(a => a.id === docId);
        if (!archivoRecord) {
            _showModal('Error', 'Registro no encontrado en memoria. Recargue la página.');
            return;
        }

        _showModal('Confirmar', '¿Estás seguro de eliminar este registro permanentemente? (Se borrarán todas las imágenes asociadas).', async () => {
            _showModal('Progreso', 'Eliminando archivos de la nube...', null, '', null, false);
            try {
                // 1. Recolectar todos los storage paths a eliminar
                const pathsToDelete = archivoRecord.archivos 
                    ? archivoRecord.archivos.map(a => a.storagePath) 
                    : [archivoRecord.storagePath];

                // 2. Borrar de Storage en paralelo
                const deletePromises = pathsToDelete.map(path => {
                    const storageRefObj = window.firebaseStorageFunctions.ref(_storage, path);
                    // Capturamos el error por si un archivo ya no existe, para que no frene la eliminación del doc
                    return window.firebaseStorageFunctions.deleteObject(storageRefObj).catch(e => console.warn("Archivo físico no encontrado", e));
                });
                await Promise.all(deletePromises);

                // 3. Borrar referencia de Firestore
                await _deleteDoc(_doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`, docId));

                document.getElementById('modalContainer').classList.add('hidden');
                cargarArchivosDeCategoria(); 

            } catch (error) {
                console.error("Error eliminando archivo:", error);
                _showModal('Error', `No se pudo eliminar el registro: ${error.message}`);
            }
        }, 'Sí, Eliminar');
    }

    window.archivosModule = {
        eliminarArchivo
    };

})();

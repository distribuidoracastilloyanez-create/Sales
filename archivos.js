// --- Módulo de Gestión de Archivos y ADC ---
// v2: Soporte completo para Web Share Target (compartir desde Android)
//
// REQUISITOS PREVIOS (archivos que también deben actualizarse):
//
// 1. manifest.json — agregar dentro del objeto raíz:
// "share_target": {
//   "action": "/?share-pending=1",
//   "method": "POST",
//   "enctype": "multipart/form-data",
//   "params": {
//     "files": [{
//       "name": "file",
//       "accept": ["image/*","application/pdf",
//                  "application/msword",
//                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
//                  "application/vnd.ms-excel",
//                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
//     }]
//   }
// }
//
// 2. sw.js — agregar al principio del fetch listener (o crear uno nuevo):
// self.addEventListener('fetch', event => {
//   const url = new URL(event.request.url);
//   if (event.request.method === 'POST' && url.searchParams.get('share-pending') === '1') {
//     event.respondWith((async () => {
//       const formData = await event.request.formData();
//       const files    = formData.getAll('file');
//       const cache    = await caches.open('share-queue');
//       const meta     = [];
//       for (let i = 0; i < files.length; i++) {
//         const buf = await files[i].arrayBuffer();
//         await cache.put(`/sq-file-${i}`, new Response(buf, {
//           headers: { 'Content-Type': files[i].type, 'X-File-Name': files[i].name }
//         }));
//         meta.push({ name: files[i].name, type: files[i].type, index: i });
//       }
//       await cache.put('/sq-meta', new Response(JSON.stringify(meta),
//         { headers: { 'Content-Type': 'application/json' } }));
//       return Response.redirect('/?share-pending=1', 303);
//     })());
//   }
// });
//
// 3. index.html — agregar DENTRO de la función de inicio de la app,
//    justo DESPUÉS de que todos los módulos estén inicializados:
//    if (window.checkAndHandleShareTarget) window.checkAndHandleShareTarget();

(function () {
    let _db, _storage, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where,
        _getDoc, _doc, _addDoc, _deleteDoc, _orderBy;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    let _clientesCache       = [];
    let _archivosCache       = [];
    let _clienteSeleccionado = null;
    let _categoriaActual     = 'documentos';

    // ── Share Target ─────────────────────────────────────────────────────────
    let _sharedFiles  = [];    // File[] recibidos via Share Target
    let _isShareMode  = false; // true cuando el módulo fue activado por share

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────
    window.initArchivos = function (dependencies) {
        _db               = dependencies.db;
        _storage          = dependencies.storage;
        _userId           = dependencies.userId;
        _userRole         = dependencies.userRole;
        _appId            = dependencies.appId;
        _mainContent      = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu     = dependencies.showMainMenu;
        _showModal        = dependencies.showModal;
        _collection       = dependencies.collection;
        _getDocs          = dependencies.getDocs;
        _query            = dependencies.query;
        _where            = dependencies.where;
        _getDoc           = dependencies.getDoc;
        _doc              = dependencies.doc;
        _addDoc           = dependencies.addDoc;
        _deleteDoc        = dependencies.deleteDoc;
        _orderBy          = dependencies.orderBy;
        console.log('Módulo Archivos v2 inicializado (Share Target habilitado).');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SHARE TARGET — Leer archivos almacenados por el Service Worker
    // ─────────────────────────────────────────────────────────────────────────
    async function leerArchivosDelSW() {
        try {
            if (!('caches' in window)) return [];
            const cache   = await caches.open('share-queue');
            const metaRes = await cache.match('/sq-meta');
            if (!metaRes) return [];

            const meta  = await metaRes.json();
            const files = await Promise.all(meta.map(async ({ name, type, index }) => {
                const r = await cache.match(`/sq-file-${index}`);
                if (!r) return null;
                const buf = await r.arrayBuffer();
                return new File([buf], name, { type });
            }));

            // Limpiar la caché para no reprocesar en futuros arranques
            await cache.delete('/sq-meta');
            await Promise.all(meta.map((_, i) => cache.delete(`/sq-file-${i}`)));

            return files.filter(Boolean);
        } catch (e) {
            console.error('Error leyendo archivos del SW:', e);
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHARE TARGET — Función pública llamada desde index.html al arrancar la app
    // ─────────────────────────────────────────────────────────────────────────
    window.checkAndHandleShareTarget = async function () {
        const url = new URL(location.href);
        if (!url.searchParams.has('share-pending')) return;

        // Limpiar ?share-pending=1 de la URL sin recargar la página
        history.replaceState({}, '', location.pathname);

        const files = await leerArchivosDelSW();
        if (!files.length) return;

        _sharedFiles = files;
        _isShareMode = true;

        // Navegar directamente al módulo de archivos
        if (window.showArchivosView) window.showArchivosView();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER — Genera la preview de los archivos entrantes (miniaturas / iconos)
    // ─────────────────────────────────────────────────────────────────────────
    function buildSharePreviewHTML() {
        if (!_sharedFiles.length) return '';
        const items = _sharedFiles.map(f => {
            const isImg = f.type.startsWith('image/');
            if (isImg) {
                const url = URL.createObjectURL(f);
                return `
                    <div class="relative rounded overflow-hidden border border-gray-200 bg-gray-100 aspect-square">
                        <img src="${url}" class="w-full h-full object-cover" alt="${f.name}">
                        <div class="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                            <p class="text-white text-[9px] truncate">${f.name}</p>
                        </div>
                    </div>`;
            }
            const ext  = f.name.split('.').pop().toUpperCase();
            const icon = { PDF:'🔴', DOC:'🔵', DOCX:'🔵', XLS:'🟢', XLSX:'🟢' }[ext] || '📄';
            return `
                <div class="flex flex-col items-center justify-center rounded border border-gray-200 bg-gray-50 p-3 gap-1 aspect-square">
                    <span class="text-3xl">${icon}</span>
                    <p class="text-[9px] text-gray-600 text-center truncate w-full">${f.name}</p>
                    <span class="text-[8px] font-bold text-gray-400">${ext}</span>
                </div>`;
        }).join('');

        return `
            <div class="mb-4 rounded-lg border border-teal-200 bg-teal-50 overflow-hidden shadow-sm">
                <div class="flex items-center justify-between px-4 py-2 bg-teal-600 text-white">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">📤</span>
                        <span class="font-bold text-sm">${_sharedFiles.length} archivo(s) recibido(s)</span>
                    </div>
                    <button id="btnCancelarShare" class="text-teal-200 hover:text-white text-sm font-bold">✕ Cancelar</button>
                </div>
                <div class="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    ${items}
                </div>
                <p class="text-xs text-teal-700 font-medium px-4 pb-3">
                    Seleccione el cliente y la categoría donde desea guardar estos archivos.
                </p>
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VISTA PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────────
    window.showArchivosView = async function (resetShare = false) {
        if (resetShare) { _sharedFiles = []; _isShareMode = false; }
        if (_floatingControls) _floatingControls.classList.add('hidden');

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-8 w-full max-w-6xl mx-auto flex flex-col h-screen overflow-hidden">
                <div class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-y-auto border-t-4 border-teal-600">

                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                        <h2 class="text-xl sm:text-2xl font-black text-gray-800 tracking-tight">📁 Archivos y Equipos (ADC)</h2>
                        <button id="btnVolverArchivos" class="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition">Volver al Menú</button>
                    </div>

                    <!-- Banner de archivos compartidos (solo en share mode) -->
                    <div id="shareModePreview"></div>

                    <!-- Búsqueda de cliente -->
                    <div class="mb-4 relative z-50">
                        <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Seleccionar Cliente:</label>
                        <input type="text" id="arcClientSearch"
                            placeholder="Escriba el nombre o RIF del cliente..."
                            class="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition">
                        <div id="arcClientDropdown"
                            class="absolute w-full bg-white border border-gray-300 rounded-b-md shadow-lg hidden max-h-60 overflow-y-auto mt-1"></div>

                        <div id="arcClientSelected"
                            class="hidden mt-2 p-3 bg-teal-50 text-teal-900 font-bold rounded flex justify-between items-center border border-teal-200 shadow-sm">
                            <span id="arcClientName" class="truncate pr-2 text-sm sm:text-base"></span>
                            <button id="arcClientClear" class="text-red-500 hover:text-red-700 text-2xl leading-none font-black px-2">&times;</button>
                        </div>
                    </div>

                    <!-- Área de trabajo (se muestra tras seleccionar cliente) -->
                    <div id="arcWorkArea" class="hidden flex-col flex-grow">

                        <!-- Pestañas de categoría -->
                        <div class="flex border-b border-gray-200 mb-4">
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-teal-600 text-teal-600" data-cat="documentos">📄 Documentos</button>
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-teal-500 transition" data-cat="imagenes">🖼️ Imágenes</button>
                            <button class="arc-tab-btn flex-1 py-2 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-teal-500 transition" data-cat="adc">❄️ Equipos ADC</button>
                        </div>

                        <!-- Encabezado del área + botón agregar -->
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-gray-700 text-lg" id="arcGalleryTitle">Documentos Guardados</h3>
                            <!-- En share mode el botón dice "Subir archivos recibidos" -->
                            <button id="btnShowAddForm"
                                class="px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded shadow hover:bg-teal-700 transition flex items-center gap-1">
                                + <span id="btnShowAddFormText">Agregar Documento</span>
                            </button>
                        </div>

                        <!-- Formulario de subida -->
                        <div id="arcFormContainer" class="hidden bg-gray-50 p-4 rounded-lg border border-teal-200 mb-4 shadow-inner">
                            <form id="arcUploadForm" class="space-y-4">
                                <div class="flex justify-between items-center border-b border-gray-200 pb-2 mb-3">
                                    <h4 class="font-bold text-gray-800" id="arcFormTitle">Subir Nuevo Archivo</h4>
                                    <button type="button" id="btnCancelAdd" class="text-gray-400 hover:text-red-500 font-bold text-sm">&times; Cancelar</button>
                                </div>

                                <!-- Metadatos ADC -->
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

                                <!-- Input de archivo (oculto en share mode, reemplazado por preview) -->
                                <div class="flex flex-col sm:flex-row gap-3 items-end">
                                    <div class="flex-grow w-full" id="arcFileInputWrapper">
                                        <label class="block text-xs font-bold text-gray-700 mb-1">
                                            Seleccionar Archivo(s) <span class="text-red-500">*</span>
                                        </label>
                                        <input type="file" id="arcFileInput"
                                            class="w-full p-2 border border-gray-300 rounded bg-white text-sm"
                                            accept=".pdf,.doc,.docx,.xls,.xlsx">
                                        <p id="multiFileHint" class="text-[10px] text-gray-500 mt-1 hidden">
                                            Puede seleccionar varias fotos a la vez para este registro.
                                        </p>
                                    </div>

                                    <!-- Resumen de archivos compartidos (solo en share mode) -->
                                    <div id="arcSharedFilesInfo" class="hidden flex-grow w-full">
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Archivos a subir:</label>
                                        <div id="arcSharedFilesChips" class="flex flex-wrap gap-1 p-2 bg-teal-50 border border-teal-200 rounded min-h-[40px]"></div>
                                    </div>

                                    <button type="submit" id="btnSubirArchivo"
                                        class="w-full sm:w-auto px-6 py-2.5 bg-teal-600 text-white font-bold rounded shadow hover:bg-teal-700 transition flex items-center justify-center gap-2 whitespace-nowrap">
                                        <span>💾</span> <span id="btnSubirArchivoText">Guardar</span>
                                    </button>
                                </div>
                            </form>
                        </div>

                        <!-- Galería de archivos existentes -->
                        <div class="flex-grow bg-gray-100 p-4 rounded-lg border border-gray-200 min-h-[300px]">
                            <div id="arcGalleryGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <p class="text-gray-500 text-sm col-span-full text-center py-4">Seleccione una pestaña para ver los archivos.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ── Renderizar preview de archivos compartidos ───────────────────────
        const previewEl = document.getElementById('shareModePreview');
        if (_isShareMode && _sharedFiles.length) {
            previewEl.innerHTML = buildSharePreviewHTML();
            document.getElementById('btnCancelarShare').addEventListener('click', () => {
                window.showArchivosView(true); // reset y vuelve al modo normal
            });
        }

        // ── Event Listeners ──────────────────────────────────────────────────
        document.getElementById('btnVolverArchivos').addEventListener('click', () => {
            _isShareMode = false; _sharedFiles = [];
            _showMainMenu();
        });

        document.getElementById('arcClientSearch').addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            const filtered = _clientesCache.filter(c =>
                (c.nombreComercial || '').toLowerCase().includes(term) ||
                (c.rif || '').toLowerCase().includes(term)
            ).slice(0, 10);
            renderClientDropdown(filtered);
        });

        document.getElementById('arcClientClear').addEventListener('click', clearClientSelection);

        document.getElementById('btnShowAddForm').addEventListener('click', () => {
            abrirFormulario();
        });

        document.getElementById('btnCancelAdd').addEventListener('click', () => {
            document.getElementById('arcFormContainer').classList.add('hidden');
            document.getElementById('arcUploadForm').reset();
        });

        document.querySelectorAll('.arc-tab-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                // Resetear UI de pestañas
                document.querySelectorAll('.arc-tab-btn').forEach(b => {
                    b.classList.remove('border-teal-600', 'text-teal-600');
                    b.classList.add('border-transparent', 'text-gray-500');
                });
                e.target.classList.remove('border-transparent', 'text-gray-500');
                e.target.classList.add('border-teal-600', 'text-teal-600');

                _categoriaActual = e.target.dataset.cat;
                actualizarInterfazPorCategoria();

                // En share mode: abrir formulario automáticamente al cambiar tab
                if (_isShareMode) {
                    document.getElementById('arcFormContainer').classList.add('hidden');
                    document.getElementById('arcUploadForm').reset();
                    abrirFormulario();
                } else {
                    document.getElementById('arcFormContainer').classList.add('hidden');
                    document.getElementById('arcUploadForm').reset();
                    cargarArchivosDeCategoria();
                }
            });
        });

        document.getElementById('arcUploadForm').addEventListener('submit', handleFileUpload);

        await cargarClientes();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Abrir el formulario de subida (adapta la UI según el modo)
    // ─────────────────────────────────────────────────────────────────────────
    function abrirFormulario() {
        const container          = document.getElementById('arcFormContainer');
        const fileInputWrapper   = document.getElementById('arcFileInputWrapper');
        const sharedFilesInfo    = document.getElementById('arcSharedFilesInfo');
        const chipsContainer     = document.getElementById('arcSharedFilesChips');
        const fileInput          = document.getElementById('arcFileInput');
        const btnSubirText       = document.getElementById('btnSubirArchivoText');

        container.classList.remove('hidden');

        if (_isShareMode && _sharedFiles.length) {
            // Ocultar el input de archivo nativo y mostrar preview de los compartidos
            fileInputWrapper.classList.add('hidden');
            sharedFilesInfo.classList.remove('hidden');
            fileInput.removeAttribute('required');

            // Chips con nombres de archivos
            chipsContainer.innerHTML = _sharedFiles.map(f => {
                const isImg = f.type.startsWith('image/');
                const icon  = isImg ? '🖼️' : '📄';
                return `<span class="inline-flex items-center gap-1 bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-1 rounded border border-teal-200">
                            ${icon} <span class="max-w-[100px] truncate">${f.name}</span>
                        </span>`;
            }).join('');

            btnSubirText.textContent = `Subir ${_sharedFiles.length} archivo(s)`;
        } else {
            // Modo normal: mostrar input nativo
            fileInputWrapper.classList.remove('hidden');
            sharedFilesInfo.classList.add('hidden');
            fileInput.setAttribute('required', 'true');
            btnSubirText.textContent = 'Guardar';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cargar clientes
    // ─────────────────────────────────────────────────────────────────────────
    async function cargarClientes() {
        try {
            const snap  = await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`));
            _clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.error('Error cargando clientes:', e); }
    }

    function renderClientDropdown(clientes) {
        const dropdown = document.getElementById('arcClientDropdown');
        dropdown.innerHTML = '';
        if (!clientes.length || !document.getElementById('arcClientSearch').value.trim()) {
            dropdown.classList.add('hidden');
            return;
        }
        clientes.forEach(c => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-teal-50 cursor-pointer text-sm text-gray-800 transition flex items-center';
            div.innerHTML = `<span class="font-bold truncate">${c.nombreComercial}</span>
                             <span class="text-xs text-gray-500 ml-2">(${c.rif || 'Sin RIF'})</span>`;
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

        const workArea = document.getElementById('arcWorkArea');
        workArea.style.display = 'flex';
        workArea.classList.remove('hidden');

        actualizarInterfazPorCategoria();

        if (_isShareMode && _sharedFiles.length) {
            // En share mode: abrir el formulario automáticamente en la categoría actual
            // y cargar también la galería existente en paralelo
            abrirFormulario();
            cargarArchivosDeCategoria();
        } else {
            cargarArchivosDeCategoria();
        }
    }

    function clearClientSelection() {
        _clienteSeleccionado = null;
        document.getElementById('arcClientSelected').classList.add('hidden');
        document.getElementById('arcClientSearch').classList.remove('hidden');
        document.getElementById('arcClientSearch').value = '';
        const workArea = document.getElementById('arcWorkArea');
        workArea.style.display = '';
        workArea.classList.add('hidden');
        document.getElementById('arcGalleryGrid').innerHTML = '';
        document.getElementById('arcFormContainer').classList.add('hidden');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Actualizar interfaz según categoría seleccionada
    // ─────────────────────────────────────────────────────────────────────────
    function actualizarInterfazPorCategoria() {
        const fileInput  = document.getElementById('arcFileInput');
        const adcFields  = document.getElementById('adcMetadataFields');
        const title      = document.getElementById('arcGalleryTitle');
        const btnAddText = document.getElementById('btnShowAddFormText');
        const formTitle  = document.getElementById('arcFormTitle');
        const multiHint  = document.getElementById('multiFileHint');

        // Limpiar required en campos ADC antes de resetear
        document.getElementById('adcDivision').required = false;
        document.getElementById('adcCodigo').required   = false;
        document.getElementById('adcModelo').required   = false;
        document.getElementById('adcPuertas').required  = false;

        if (_categoriaActual === 'documentos') {
            fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx';
            fileInput.removeAttribute('multiple');
            multiHint.classList.add('hidden');
            adcFields.classList.add('hidden');
            title.textContent     = '📄 Documentos Guardados';
            btnAddText.textContent = _isShareMode ? `Subir como Documento` : 'Agregar Documento';
            formTitle.textContent  = _isShareMode ? 'Subir archivos recibidos como Documento' : 'Subir Nuevo Documento';

        } else if (_categoriaActual === 'imagenes') {
            fileInput.accept = 'image/png, image/jpeg, image/jpg';
            fileInput.setAttribute('multiple', 'true');
            multiHint.classList.remove('hidden');
            adcFields.classList.add('hidden');
            title.textContent     = '🖼️ Registros Fotográficos Generales';
            btnAddText.textContent = _isShareMode ? `Subir como Imágenes` : 'Agregar Registro de Imágenes';
            formTitle.textContent  = _isShareMode ? 'Subir imágenes recibidas' : 'Subir Nuevo Lote de Imágenes';

        } else if (_categoriaActual === 'adc') {
            fileInput.accept = 'image/png, image/jpeg, image/jpg';
            fileInput.setAttribute('multiple', 'true');
            multiHint.classList.remove('hidden');
            adcFields.classList.remove('hidden');
            title.textContent     = '❄️ Equipos ADC Asignados';
            btnAddText.textContent = _isShareMode ? `Subir como Equipo ADC` : 'Registrar Equipo ADC';
            formTitle.textContent  = _isShareMode ? 'Registrar Equipo ADC con archivos recibidos' : 'Registrar Nuevo Equipo y sus Fotos';
            document.getElementById('adcDivision').required = true;
            document.getElementById('adcCodigo').required   = true;
            document.getElementById('adcModelo').required   = true;
            document.getElementById('adcPuertas').required  = true;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUBIDA DE ARCHIVOS
    // ─────────────────────────────────────────────────────────────────────────
    async function handleFileUpload(e) {
        e.preventDefault();
        if (!_storage) {
            _showModal('Error', 'El servicio de Storage no está configurado.');
            return;
        }

        // ── Determinar qué archivos usar: compartidos o del input ────────────
        let filesToUpload;
        if (_isShareMode && _sharedFiles.length) {
            filesToUpload = _sharedFiles;
        } else {
            const fileInput = document.getElementById('arcFileInput');
            if (!fileInput.files.length) {
                _showModal('Aviso', 'Seleccione al menos un archivo primero.');
                return;
            }
            filesToUpload = Array.from(fileInput.files);
        }

        // ── Validar metadatos ADC si corresponde ─────────────────────────────
        let metadataADC = null;
        if (_categoriaActual === 'adc') {
            const division = document.getElementById('adcDivision').value;
            const codigo   = document.getElementById('adcCodigo').value.trim().toUpperCase();
            const modelo   = document.getElementById('adcModelo').value;
            const puertas  = parseInt(document.getElementById('adcPuertas').value, 10);

            if (!division || !codigo || !modelo || !puertas) {
                _showModal('Aviso', 'Complete todos los campos del equipo ADC antes de guardar.');
                return;
            }
            metadataADC = { division, codigo, modelo, puertas };
        }

        _showModal('Subiendo...', `Subiendo ${filesToUpload.length} archivo(s)...`, null, '', null, false);

        try {
            const exactMomentMs  = Date.now();
            const exactMomentISO = new Date(exactMomentMs).toISOString();

            if (_categoriaActual === 'adc' || _categoriaActual === 'imagenes') {
                // SUBIDA MÚLTIPLE AGRUPADA
                const uploadPromises = filesToUpload.map(async (file, index) => {
                    const uniqueName  = `${exactMomentMs}_${index}_${file.name}`;
                    const storagePath = `clientes/${_clienteSeleccionado.id}/${_categoriaActual}/${uniqueName}`;
                    const refObj      = window.firebaseStorageFunctions.ref(_storage, storagePath);
                    await window.firebaseStorageFunctions.uploadBytes(refObj, file);
                    const downloadURL = await window.firebaseStorageFunctions.getDownloadURL(refObj);
                    return { url: downloadURL, storagePath, fileName: file.name };
                });

                const archivosSubidos = await Promise.all(uploadPromises);

                const docData = {
                    clienteId:    _clienteSeleccionado.id,
                    categoria:    _categoriaActual,
                    archivos:     archivosSubidos,
                    fechaCreacion: exactMomentISO,
                    subidoPor:    _userId
                };
                if (metadataADC) docData.adcInfo = metadataADC;

                await _addDoc(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`), docData);

            } else {
                // DOCUMENTO INDIVIDUAL
                const file        = filesToUpload[0];
                const uniqueName  = `${exactMomentMs}_${file.name}`;
                const storagePath = `clientes/${_clienteSeleccionado.id}/${_categoriaActual}/${uniqueName}`;
                const refObj      = window.firebaseStorageFunctions.ref(_storage, storagePath);
                await window.firebaseStorageFunctions.uploadBytes(refObj, file);
                const downloadURL = await window.firebaseStorageFunctions.getDownloadURL(refObj);

                await _addDoc(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`), {
                    clienteId:    _clienteSeleccionado.id,
                    categoria:    _categoriaActual,
                    fileName:     file.name,
                    storagePath,
                    url:          downloadURL,
                    fechaCreacion: exactMomentISO,
                    subidoPor:    _userId
                });
            }

            // ── Post-subida ──────────────────────────────────────────────────
            document.getElementById('arcUploadForm').reset();
            document.getElementById('arcFormContainer').classList.add('hidden');
            document.getElementById('modalContainer')?.classList.add('hidden');

            // Liberar memory objectURLs de las previews
            _sharedFiles.forEach(f => { try { URL.revokeObjectURL(f._previewUrl); } catch(_){} });

            // Si era share mode, limpiar y volver al modo normal
            if (_isShareMode) {
                _sharedFiles  = [];
                _isShareMode  = false;
                document.getElementById('shareModePreview').innerHTML = '';
                // Actualizar UI de los inputs al modo normal
                document.getElementById('arcFileInputWrapper').classList.remove('hidden');
                document.getElementById('arcSharedFilesInfo').classList.add('hidden');
                document.getElementById('arcFileInput').setAttribute('required', 'true');
                document.getElementById('btnSubirArchivoText').textContent = 'Guardar';
                actualizarInterfazPorCategoria();
            }

            cargarArchivosDeCategoria();

        } catch (error) {
            console.error('Error subiendo archivo(s):', error);
            _showModal('Error', `Falló la subida: ${error.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Galería de archivos existentes del cliente
    // ─────────────────────────────────────────────────────────────────────────
    async function cargarArchivosDeCategoria() {
        const grid = document.getElementById('arcGalleryGrid');
        grid.innerHTML = '<p class="col-span-full text-center text-teal-600 animate-pulse py-6 font-bold">Cargando información...</p>';

        try {
            const q    = _query(
                _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`),
                _where('clienteId', '==', _clienteSeleccionado.id),
                _where('categoria', '==', _categoriaActual)
            );
            const snap = await _getDocs(q);

            if (snap.empty) {
                const msgs = {
                    documentos: 'No hay documentos guardados.',
                    imagenes:   'No hay registros fotográficos.',
                    adc:        'El cliente no tiene equipos ADC registrados.'
                };
                grid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-6">${msgs[_categoriaActual] || ''}</p>`;
                _archivosCache = [];
                return;
            }

            _archivosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            _archivosCache.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

            let html = '';
            _archivosCache.forEach(arc => {
                const d           = new Date(arc.fechaCreacion);
                const fechaFormat = d.toLocaleDateString('es-ES') + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

                if (_categoriaActual === 'adc' || _categoriaActual === 'imagenes') {
                    const arrayFotos    = arc.archivos || [{ url: arc.url, fileName: arc.fileName, storagePath: arc.storagePath }];
                    const gridColsClass = arrayFotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1';

                    let metaHTML = '';
                    if (arc.adcInfo) {
                        metaHTML = `
                            <div class="text-xs text-blue-800 bg-blue-50 p-2 mt-2 rounded border border-blue-100">
                                <p><b>Cód:</b> <span class="font-black">${arc.adcInfo.codigo}</span></p>
                                <p><b>División:</b> ${arc.adcInfo.division}</p>
                                <p><b>Modelo:</b> ${arc.adcInfo.modelo}</p>
                                <p><b>Puertas:</b> ${arc.adcInfo.puertas}</p>
                            </div>`;
                    }

                    let imagesHTML = `<div class="grid ${gridColsClass} gap-2 mb-2">`;
                    arrayFotos.forEach(foto => {
                        imagesHTML += `
                            <a href="${foto.url}" target="_blank" class="block h-28 w-full overflow-hidden rounded bg-gray-100 border relative group">
                                <img src="${foto.url}" alt="${foto.fileName}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300">
                                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span class="text-white text-[10px] font-bold border border-white px-2 py-0.5 rounded">Ver</span>
                                </div>
                            </a>`;
                    });
                    imagesHTML += `</div>`;

                    html += `
                        <div class="bg-white p-3 rounded-lg shadow border border-gray-200 flex flex-col">
                            ${imagesHTML}
                            <div class="flex-grow">
                                <p class="text-[11px] text-gray-500 font-mono">📅 ${fechaFormat}</p>
                                ${metaHTML}
                            </div>
                            <button onclick="window.archivosModule.eliminarArchivo('${arc.id}')"
                                class="mt-3 w-full py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 hover:border-transparent rounded text-xs font-bold transition uppercase tracking-wide">
                                Eliminar Registro Completo
                            </button>
                        </div>`;
                } else {
                    html += `
                        <div class="bg-white p-4 rounded-lg shadow border border-gray-200 flex items-center justify-between gap-3 hover:bg-teal-50 transition">
                            <div class="flex items-center gap-3 overflow-hidden">
                                <div class="text-3xl">📄</div>
                                <div class="overflow-hidden">
                                    <p class="text-[11px] text-gray-500 font-mono">${fechaFormat}</p>
                                    <a href="${arc.url}" target="_blank" class="text-sm font-bold text-teal-700 hover:underline truncate block" title="${arc.fileName}">${arc.fileName}</a>
                                </div>
                            </div>
                            <button onclick="window.archivosModule.eliminarArchivo('${arc.id}')" class="p-2 text-gray-400 hover:text-red-600 transition" title="Eliminar">🗑️</button>
                        </div>`;
                }
            });

            grid.innerHTML = html;

        } catch (error) {
            console.error('Error listando archivos:', error);
            grid.innerHTML = '<p class="col-span-full text-center text-red-500 py-6">Error al cargar los archivos.</p>';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Eliminar archivo (solo admins)
    // ─────────────────────────────────────────────────────────────────────────
    async function eliminarArchivo(docId) {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo los administradores pueden borrar archivos.');
            return;
        }
        const archivoRecord = _archivosCache.find(a => a.id === docId);
        if (!archivoRecord) {
            _showModal('Error', 'Registro no encontrado. Recargue la vista.');
            return;
        }

        _showModal('Confirmar', '¿Eliminar este registro permanentemente? Se borrarán todos los archivos asociados.',
            async () => {
                _showModal('Progreso', 'Eliminando archivos de la nube...', null, '', null, false);
                try {
                    const paths = archivoRecord.archivos
                        ? archivoRecord.archivos.map(a => a.storagePath)
                        : [archivoRecord.storagePath];

                    await Promise.all(paths.map(path =>
                        window.firebaseStorageFunctions.deleteObject(
                            window.firebaseStorageFunctions.ref(_storage, path)
                        ).catch(err => console.warn('Archivo físico ya no existe en Storage:', err))
                    ));

                    await _deleteDoc(_doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/archivos_clientes`, docId));
                    document.getElementById('modalContainer')?.classList.add('hidden');
                    cargarArchivosDeCategoria();
                } catch (error) {
                    console.error('Error eliminando:', error);
                    _showModal('Error', `No se pudo eliminar: ${error.message}`);
                }
            }, 'Sí, Eliminar'
        );
    }

    window.archivosModule = { eliminarArchivo };

})();

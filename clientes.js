// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo que se inicializarán desde index.html
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    
    // Funciones de Firestore (Inyectadas para consistencia de versión)
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDoc, _getDocs, _query, _where, _writeBatch, _runTransaction, _limit, _orderBy;

    let _clientesCache = []; // Caché local para búsquedas y ediciones rápidas
    let _clientesParaImportar = []; // Caché para la data del Excel a importar
    let _sectoresCache = [];

    // --- RUTAS ACTUALIZADAS PARA EL NUEVO PROYECTO ---
    const CLIENTES_COLLECTION_PATH = `artifacts/${'dist-castillo-sales'}/public/data/clientes`;
    const SECTORES_COLLECTION_PATH = `artifacts/${'dist-castillo-sales'}/public/data/sectores`;

    // --- Constantes de configuración ---
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
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _showAddItemModal = dependencies.showAddItemModal;
        _populateDropdown = dependencies.populateDropdown;

        // Inyectar funciones de Firestore
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _getDoc = dependencies.getDoc;
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
        _writeBatch = dependencies.writeBatch;
        _runTransaction = dependencies.runTransaction;
        _limit = dependencies.limit;
        _orderBy = dependencies.orderBy;

        console.log("Módulo Clientes vinculado exitosamente a: dist-castillo-sales");
    };

    /**
     * Renderiza la vista principal de gestión de clientes.
     */
    const renderClientes = async () => {
        _mainContent.innerHTML = `
            <div class="space-y-6 animate-fade-in-up pb-20">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h2 class="text-3xl font-black text-gray-900 tracking-tight">Cartera de Clientes</h2>
                        <p class="text-gray-500 text-sm">Control de envases y datos de contacto</p>
                    </div>
                    <div class="flex flex-wrap gap-2 w-full md:w-auto">
                         <button id="btnGestionarSectores" class="flex-1 md:flex-none bg-indigo-50 text-indigo-700 px-5 py-2.5 rounded-xl hover:bg-indigo-100 transition shadow-sm font-bold text-sm">Sectores / Zonas</button>
                         <button id="btnImportarExcel" class="flex-1 md:flex-none bg-emerald-50 text-emerald-700 px-5 py-2.5 rounded-xl hover:bg-emerald-100 transition shadow-sm font-bold text-sm">Importar CSV</button>
                         <button id="btnNuevoCliente" class="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition shadow-md font-bold text-sm">+ Nuevo Cliente</button>
                    </div>
                </div>

                <!-- Filtros y Búsqueda -->
                <div class="flex flex-col sm:flex-row gap-3">
                    <div class="relative flex-grow">
                        <input type="text" id="clienteSearch" placeholder="Nombre de bodega, responsable o dirección..." class="w-full pl-12 pr-4 py-4 rounded-2xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 shadow-sm transition-all outline-none">
                        <div class="absolute left-4 top-4 text-gray-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                    </div>
                    <select id="filterSector" class="sm:w-56 p-4 rounded-2xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 shadow-sm outline-none bg-white font-medium text-gray-600">
                        <option value="">Todos los sectores</option>
                    </select>
                </div>

                <!-- Contenedor de Lista -->
                <div id="clientesList" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div class="col-span-full flex flex-col items-center justify-center py-24">
                        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p class="mt-4 text-gray-400">Sincronizando con la nube...</p>
                    </div>
                </div>
            </div>
        `;

        // Registro de eventos
        document.getElementById('btnGestionarSectores').addEventListener('click', showSectorList);
        document.getElementById('btnNuevoCliente').addEventListener('click', () => showClienteForm());
        document.getElementById('btnImportarExcel').addEventListener('click', showImportModal);
        
        const searchInput = document.getElementById('clienteSearch');
        const sectorFilter = document.getElementById('filterSector');

        const applyFilters = () => {
            filterClientes(searchInput.value, sectorFilter.value);
        };

        searchInput.addEventListener('input', applyFilters);
        sectorFilter.addEventListener('change', applyFilters);

        loadClientes();
        loadSectoresDropdown();
    };

    /**
     * Carga de datos con tiempo real.
     */
    const loadClientes = () => {
        const q = _query(_collection(_db, CLIENTES_COLLECTION_PATH));
        
        _onSnapshot(q, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            _clientesCache.sort((a, b) => (a.nombreNegocio || "").localeCompare(b.nombreNegocio || ""));
            displayClientes(_clientesCache);
        }, (error) => {
            console.error("Error cargando clientes:", error);
            _showModal('Sin acceso', 'No se pudieron cargar los datos. Verifica los permisos de Firestore.');
        });
    };

    const loadSectoresDropdown = async () => {
        const snap = await _getDocs(_collection(_db, SECTORES_COLLECTION_PATH));
        const sectores = snap.docs.map(d => d.data().name);
        _sectoresCache = sectores;
        const select = document.getElementById('filterSector');
        if (select) {
            select.innerHTML = '<option value="">Todos los sectores</option>';
            sectores.sort().forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                select.appendChild(opt);
            });
        }
    };

    /**
     * Función de filtrado local.
     */
    const filterClientes = (term, sector) => {
        const t = term.toLowerCase();
        const filtered = _clientesCache.filter(c => {
            const matchesTerm = (c.nombreNegocio || "").toLowerCase().includes(t) || 
                               (c.nombreResponsable || "").toLowerCase().includes(t) ||
                               (c.direccion || "").toLowerCase().includes(t);
            const matchesSector = sector === "" || c.sector === sector;
            return matchesTerm && matchesSector;
        });
        displayClientes(filtered);
    };

    /**
     * Display de las tarjetas de cliente.
     */
    const displayClientes = (clientes) => {
        const list = document.getElementById('clientesList');
        if (!list) return;

        if (clientes.length === 0) {
            list.innerHTML = `
                <div class="col-span-full bg-white p-12 rounded-3xl border border-dashed text-center">
                    <p class="text-gray-400 italic">No se encontraron clientes que coincidan con la búsqueda.</p>
                </div>`;
            return;
        }

        list.innerHTML = clientes.map(c => {
            const saldos = c.saldoVacios || {};
            const totalDeuda = Object.values(saldos).reduce((acc, val) => acc + (val > 0 ? val : 0), 0);
            const tieneDeuda = totalDeuda > 0;

            return `
                <div class="bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group flex flex-col overflow-hidden">
                    <div class="p-6 flex-grow">
                        <div class="flex justify-between items-start mb-4">
                            <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <span class="font-black text-lg">${(c.nombreNegocio || "C")[0].toUpperCase()}</span>
                            </div>
                            <span class="px-3 py-1 bg-gray-50 text-gray-500 rounded-full text-[10px] font-bold uppercase tracking-widest">${c.sector || 'N/A'}</span>
                        </div>
                        
                        <h3 class="font-bold text-gray-900 text-lg leading-tight mb-1 group-hover:text-blue-600 transition truncate">${c.nombreNegocio}</h3>
                        <p class="text-sm text-gray-400 mb-4 truncate">${c.nombreResponsable}</p>
                        
                        <div class="space-y-2 pt-4 border-t border-gray-50 text-xs text-gray-600">
                            <div class="flex items-center">
                                <svg class="w-4 h-4 mr-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                                ${c.telefono || 'Sin teléfono'}
                            </div>
                            <div class="flex items-start">
                                <svg class="w-4 h-4 mr-2 text-gray-300 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                <span class="line-clamp-2">${c.direccion || 'Sin dirección'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="p-4 bg-gray-50 grid grid-cols-2 gap-2 border-t border-gray-100">
                        <button onclick="window.clientesModule.showSaldoDetalleModal('${c.id}')" class="py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition ${tieneDeuda ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 border'}">
                            ${tieneDeuda ? `Deuda: ${totalDeuda} vacíos` : 'Saldos al día'}
                        </button>
                        <button onclick="window.clientesModule.editCliente('${c.id}')" class="py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter bg-white text-blue-600 border border-blue-100 shadow-sm">
                            Editar / Ver
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };

    /**
     * Formulario de Alta/Edición.
     */
    const showClienteForm = async (clienteId = null) => {
        const isEdit = !!clienteId;
        const cliente = isEdit ? _clientesCache.find(c => c.id === clienteId) : null;
        
        const form = document.createElement('div');
        form.className = 'space-y-4';
        form.innerHTML = `
            <div class="grid grid-cols-1 gap-4">
                <div>
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nombre Comercial *</label>
                    <input type="text" id="f_negocio" value="${cliente?.nombreNegocio || ''}" placeholder="Ej. Abasto San José" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nombre del Responsable *</label>
                    <input type="text" id="f_responsable" value="${cliente?.nombreResponsable || ''}" placeholder="Dueño o contacto" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Teléfono</label>
                        <input type="tel" id="f_tel" value="${cliente?.telefono || ''}" placeholder="04xx..." class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sector / Zona</label>
                        <select id="f_sector" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white">
                            <option value="">Seleccionar...</option>
                            ${_sectoresCache.map(s => `<option value="${s}" ${cliente?.sector === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dirección Completa</label>
                    <textarea id="f_dir" rows="2" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none">${cliente?.direccion || ''}</textarea>
                </div>
            </div>
            ${isEdit ? `
                <div class="pt-6 border-t flex justify-center">
                    <button id="f_delete" class="text-red-500 text-xs font-black uppercase hover:bg-red-50 px-4 py-2 rounded-xl transition">Borrar permanentemente</button>
                </div>
            ` : ''}
        `;

        const save = async () => {
            const data = {
                nombreNegocio: document.getElementById('f_negocio').value.trim(),
                nombreResponsable: document.getElementById('f_responsable').value.trim(),
                telefono: document.getElementById('f_tel').value.trim(),
                sector: document.getElementById('f_sector').value,
                direccion: document.getElementById('f_dir').value.trim(),
                fechaActualizacion: new Date()
            };

            if (!data.nombreNegocio || !data.nombreResponsable) return alert("Por favor completa los campos obligatorios.");

            try {
                if (isEdit) {
                    await _setDoc(_doc(_db, CLIENTES_COLLECTION_PATH, clienteId), data, { merge: true });
                } else {
                    data.fechaCreacion = new Date();
                    data.saldoVacios = {}; 
                    await _addDoc(_collection(_db, CLIENTES_COLLECTION_PATH), data);
                }
            } catch (e) { console.error("Error guardando cliente:", e); }
        };

        _showModal(isEdit ? 'Editar Información' : 'Registrar Cliente', form, save, 'Guardar Cambios', true);
        if (isEdit) document.getElementById('f_delete').addEventListener('click', () => deleteCliente(clienteId));
    };

    /**
     * Eliminación con confirmación.
     */
    const deleteCliente = async (id) => {
        if (!confirm("¿Seguro que deseas eliminar este cliente? Se borrarán todos los saldos y deudas.")) return;
        try {
            await _deleteDoc(_doc(_db, CLIENTES_COLLECTION_PATH, id));
            document.getElementById('modalContainer').classList.add('hidden');
        } catch (e) { console.error(e); }
    };

    /**
     * Gestión de Sectores.
     */
    const showSectorList = async () => {
        const snap = await _getDocs(_collection(_db, SECTORES_COLLECTION_PATH));
        const sectores = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const content = document.createElement('div');
        content.className = 'space-y-4';
        content.innerHTML = `
            <div class="flex justify-between items-center bg-gray-50 p-4 rounded-2xl mb-4">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Zonas registradas</span>
                <button id="s_add" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition">Añadir Nueva</button>
            </div>
            <div class="max-h-60 overflow-y-auto space-y-2 pr-2">
                ${sectores.map(s => `
                    <div class="p-4 bg-white border rounded-2xl flex justify-between items-center shadow-sm">
                        <span class="font-bold text-gray-800">${s.name}</span>
                        <div class="flex gap-4">
                            <button onclick="window.clientesModule.editSector('${s.id}', '${s.name}')" class="text-blue-500 text-[10px] font-black uppercase tracking-widest">Renombrar</button>
                            <button onclick="window.clientesModule.deleteSector('${s.id}')" class="text-red-300 hover:text-red-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        _showModal('Gestión de Zonas', content, null, 'Cerrar Panel');
        document.getElementById('s_add').addEventListener('click', () => {
            const name = prompt("Escribe el nombre de la nueva zona:");
            if (name) _addDoc(_collection(_db, SECTORES_COLLECTION_PATH), { name }).then(showSectorList);
        });
    };

    const editSector = (id, old) => {
        const name = prompt("Nuevo nombre para la zona:", old);
        if (name) _setDoc(_doc(_db, SECTORES_COLLECTION_PATH, id), { name }).then(showSectorList);
    };

    const deleteSector = (id) => {
        if (confirm("¿Borrar zona? Los clientes no se borrarán, pero perderán esta asignación.")) _deleteDoc(_doc(_db, SECTORES_COLLECTION_PATH, id)).then(showSectorList);
    };

    /**
     * Gestión de Saldos de Envases.
     */
    const showSaldoDetalleModal = (id) => {
        const cliente = _clientesCache.find(c => c.id === id);
        if (!cliente) return;
        const saldos = cliente.saldoVacios || {};

        const content = document.createElement('div');
        content.className = 'space-y-4';
        
        let html = TIPOS_VACIO.map(tipo => {
            const cant = saldos[tipo] || 0;
            const status = cant > 0 ? 'DEBE' : (cant < 0 ? 'A FAVOR' : 'SIN DEUDA');
            const color = cant > 0 ? 'text-red-600 bg-red-50 border-red-100' : (cant < 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-gray-400 bg-gray-50');

            return `
                <div class="flex items-center justify-between p-4 rounded-2xl border ${color}">
                    <div>
                        <span class="block text-[9px] font-black uppercase opacity-60">${tipo}</span>
                        <div class="flex items-baseline gap-1">
                            <span class="font-black text-2xl tracking-tighter">${Math.abs(cant)}</span>
                            <span class="text-[8px] font-bold uppercase">${status}</span>
                        </div>
                    </div>
                    <button onclick="window.clientesModule.ajustarSaldoManual('${id}', '${tipo}')" class="bg-white/80 backdrop-blur p-2.5 rounded-xl shadow-sm hover:shadow-md transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                </div>
            `;
        }).join('');

        content.innerHTML = `
            <div class="bg-gray-900 p-6 rounded-3xl text-white mb-6">
                <h4 class="text-xl font-bold leading-tight">${cliente.nombreNegocio}</h4>
                <p class="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Estado de envases retornables</p>
            </div>
            <div class="grid grid-cols-1 gap-3">${html}</div>
            <div class="p-4 bg-blue-50 rounded-2xl border border-blue-100 mt-6">
                <p class="text-[10px] text-blue-800 leading-relaxed font-medium">Los saldos se actualizan automáticamente en cada venta. Usa el botón de ajuste solo para corregir errores manuales.</p>
            </div>
        `;

        _showModal('Saldos Pendientes', content, null, 'Cerrar');
    };

    /**
     * Ajuste manual mediante transacciones.
     */
    const ajustarSaldoManual = async (clienteId, tipo) => {
        const cliente = _clientesCache.find(c => c.id === clienteId);
        const actual = (cliente.saldoVacios && cliente.saldoVacios[tipo]) || 0;
        const nuevoStr = prompt(`AJUSTE DE SALDO [${tipo}]\nActualmente: ${actual}\n\nIngresa el NUEVO saldo total:`, actual);
        
        if (nuevoStr === null || isNaN(parseInt(nuevoStr))) return;
        const nuevo = parseInt(nuevoStr);

        try {
            _showModal('Actualizando base de datos...', '<div class="p-8 text-center flex flex-col items-center"><div class="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div><p class="text-sm font-bold">Guardando transacción segura...</p></div>');
            
            await _runTransaction(_db, async (transaction) => {
                const cRef = _doc(_db, CLIENTES_COLLECTION_PATH, clienteId);
                const snap = await transaction.get(cRef);
                const data = snap.data();
                const saldos = data.saldoVacios || {};
                saldos[tipo] = nuevo;
                transaction.update(cRef, { saldoVacios: saldos, fechaActualizacion: new Date() });
            });

            document.getElementById('modalContainer').classList.add('hidden');
            showSaldoDetalleModal(clienteId);
        } catch (e) { console.error("Error en transacción:", e); }
    };

    /**
     * Importación masiva desde CSV.
     */
    const showImportModal = () => {
        const content = document.createElement('div');
        content.className = 'space-y-4';
        content.innerHTML = `
            <div class="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 text-sm text-emerald-800 mb-4">
                <p class="font-black mb-2 uppercase tracking-tighter">Instrucciones de Carga:</p>
                <p class="text-[11px] leading-relaxed opacity-80">El archivo CSV debe tener los siguientes encabezados exactos: <br><b class="font-black">nombreNegocio, nombreResponsable, telefono, sector, direccion</b></p>
            </div>
            
            <div class="flex flex-col gap-3">
                 <button id="btnDownloadTemplate" class="w-full py-3 bg-white border-2 border-dashed border-gray-200 text-gray-400 rounded-2xl font-bold hover:bg-gray-50 transition flex items-center justify-center text-xs">
                    Descargar Plantilla CSV
                </button>
                <input type="file" id="f_csv" accept=".csv" class="block w-full text-xs text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-xs file:font-black file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer bg-gray-50 p-2 rounded-2xl">
            </div>
            
            <div id="p_csv" class="hidden mt-4 border rounded-2xl overflow-hidden bg-white shadow-inner max-h-40 overflow-y-auto text-[10px] divide-y"></div>
        `;

        const process = async () => {
            if (_clientesParaImportar.length === 0) return alert("Por favor selecciona un archivo CSV primero.");
            const batch = _writeBatch(_db);
            _clientesParaImportar.forEach(c => {
                const ref = _doc(_collection(_db, CLIENTES_COLLECTION_PATH));
                batch.set(ref, { 
                    ...c, 
                    fechaCreacion: new Date(), 
                    fechaActualizacion: new Date(),
                    saldoVacios: {} 
                });
            });
            await batch.commit();
            _showModal('Carga Completa', `Se han registrado ${_clientesParaImportar.length} clientes en el nuevo sistema.`);
            loadClientes();
        };

        _showModal('Importación de Datos', content, process, 'Iniciar Carga Masiva', true);
        
        document.getElementById('btnDownloadTemplate').onclick = () => {
            const headers = "nombreNegocio,nombreResponsable,telefono,sector,direccion\n";
            const row = "Bodega Ejemplo,Juan Perez,04121234567,Norte,Calle Principal 123\n";
            const blob = new Blob([headers + row], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "plantilla_clientes.csv";
            link.click();
        };

        document.getElementById('f_csv').onchange = (e) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const lines = ev.target.result.split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                _clientesParaImportar = lines.slice(1).filter(l => l.trim()).map(line => {
                    const data = line.split(',');
                    const obj = {};
                    headers.forEach((h, i) => obj[h] = data[i]?.trim() || '');
                    return obj;
                });
                const prev = document.getElementById('p_csv');
                prev.classList.remove('hidden');
                prev.innerHTML = _clientesParaImportar.slice(0, 15).map(c => `<div class="p-2">${c.nombreNegocio || 'S/N'} <span class="text-gray-400 font-mono ml-2">(${c.sector || 'S/S'})</span></div>`).join('');
            };
            reader.readAsText(e.target.files[0]);
        };
    };

    // --- API Pública del Módulo ---
    window.clientesModule = {
        renderClientes,
        editCliente: (id) => showClienteForm(id),
        deleteCliente,
        editSector,
        deleteSector,
        showSaldoDetalleModal,
        ajustarSaldoManual
    };

})();

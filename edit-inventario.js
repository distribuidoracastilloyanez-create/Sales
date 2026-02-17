(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _populateDropdown;
    let _collection, _doc, _getDocs, _getDoc, _query, _where, _runTransaction, _addDoc, _orderBy, _limit, _startAfter;

    // --- CONFIGURACIÓN CENTRALIZADA ---
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    let _usersCache = [];
    let _targetInventoryCache = [];
    let _correccionActualState = {}; 
    let _recargasSearchCache = []; 
    
    // Estado para filtros de corrección manual
    let _correctionFilters = { search: '', rubro: '', segmento: '', marca: '' };

    window.initEditInventario = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _populateDropdown = dependencies.populateDropdown;
        _collection = dependencies.collection;
        _doc = dependencies.doc;
        _getDocs = dependencies.getDocs;
        _getDoc = dependencies.getDoc;
        _query = dependencies.query;
        _where = dependencies.where;
        _runTransaction = dependencies.runTransaction;
        _addDoc = dependencies.addDoc;
        _orderBy = dependencies.orderBy;
        _limit = dependencies.limit;
        _startAfter = dependencies.startAfter;

        if (!_runTransaction) console.error("Error Crítico: 'runTransaction' no disponible en initEditInventario.");
        console.log("Módulo Edit Inventario Inicializado. Public ID:", PUBLIC_DATA_ID);
    };

    window.showEditInventarioMenu = function() {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo los administradores pueden acceder a este módulo.');
            return;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Inventario (Admin)</h1>
                        <p class="text-gray-600 mb-6 text-sm">Herramientas de control y auditoría de stock.</p>
                        <div class="space-y-4">
                            <button id="btnNuevaCorreccion" class="w-full px-6 py-3 bg-yellow-600 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-700 transition">
                                🛠️ Realizar Corrección Manual
                            </button>
                            <button id="btnVerRecargas" class="w-full px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition">
                                📥 Ver Reporte de Recargas
                            </button>
                            <button id="btnVerHistorial" class="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition">
                                📜 Historial de Correcciones
                            </button>
                            <button id="btnVolverMenu" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition">
                                Volver al Menú Principal
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnNuevaCorreccion').addEventListener('click', showUserSelectionView);
        document.getElementById('btnVerRecargas').addEventListener('click', showRecargasHistoryView);
        document.getElementById('btnVerHistorial').addEventListener('click', showHistorialView);
        document.getElementById('btnVolverMenu').addEventListener('click', _showMainMenu);
    };

    // --- VISTA 1: SELECCIÓN DE USUARIO (Para Corrección) ---
    async function showUserSelectionView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-md">
                    <div class="bg-white/90 p-6 rounded-lg shadow-xl">
                        <h2 class="text-xl font-bold mb-4 text-center">Seleccionar Vendedor</h2>
                        <div id="usersListContainer" class="space-y-2 max-h-96 overflow-y-auto mb-4">
                            <p class="text-center text-gray-500">Cargando usuarios...</p>
                        </div>
                        <button id="btnBackToEditMenu" class="w-full py-2 bg-gray-400 text-white rounded hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnBackToEditMenu').addEventListener('click', showEditInventarioMenu);

        try {
            const usersRef = _collection(_db, 'users');
            const q = _query(usersRef, _where('role', '==', 'user'));
            const snap = await _getDocs(q);
            _usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const list = document.getElementById('usersListContainer');
            if (_usersCache.length === 0) {
                list.innerHTML = `<p class="text-center text-red-500">No hay vendedores registrados.</p>`;
                return;
            }

            list.innerHTML = '';
            _usersCache.forEach(u => {
                const btn = document.createElement('div');
                btn.className = 'p-3 bg-gray-50 hover:bg-blue-50 border rounded cursor-pointer flex justify-between items-center transition';
                btn.innerHTML = `
                    <div>
                        <p class="font-bold text-gray-800">${u.email}</p>
                        <p class="text-xs text-gray-500">${u.nombre || ''} ${u.apellido || ''}</p>
                    </div>
                    <span class="text-blue-600 font-bold">➜</span>
                `;
                btn.onclick = () => loadUserInventory(u);
                list.appendChild(btn);
            });

        } catch (e) {
            console.error(e);
            document.getElementById('usersListContainer').innerHTML = `<p class="text-red-500">Error cargando usuarios: ${e.message}</p>`;
        }
    }

    // --- LÓGICA DE CORRECCIÓN (MODIFICADO PARA LECTURA HÍBRIDA) ---
    async function loadUserInventory(targetUser) {
        _showModal('Cargando', `Obteniendo inventario de ${targetUser.email}...`, null, '', null, false);
        _correccionActualState = {}; 
        _correctionFilters = { search: '', rubro: '', segmento: '', marca: '' }; // Reset filtros

        try {
            // 1. Obtener Stock Privado del Usuario
            const userInvRef = _collection(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`);
            
            // 2. Obtener Catálogo Maestro Público (Para tener nombres, marcas, rubros)
            const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);

            const [userSnap, masterSnap] = await Promise.all([
                _getDocs(userInvRef),
                _getDocs(masterRef)
            ]);

            // Crear mapa del maestro
            const masterMap = {};
            masterSnap.forEach(d => masterMap[d.id] = d.data());

            // 3. Fusionar datos (Hybrid Merge)
            // Solo mostramos productos que el usuario tiene en su colección (aunque sea stock 0),
            // pero enriquecidos con la data del maestro.
            _targetInventoryCache = userSnap.docs.map(d => {
                const uData = d.data();
                const mData = masterMap[d.id];

                if (mData) {
                    // Producto existe en maestro: Usar metadatos maestros + stock usuario
                    return {
                        id: d.id,
                        ...mData, // presentacion, marca, rubro, etc.
                        cantidadUnidades: uData.cantidadUnidades || 0,
                        _legacyData: uData
                    };
                } else {
                    // Producto huérfano/legacy (solo existe en usuario): Usar data usuario
                    return {
                        id: d.id,
                        ...uData
                    };
                }
            });
            
            // Ordenar por presentación
            _targetInventoryCache.sort((a, b) => (a.presentacion || '').localeCompare(b.presentacion || ''));

            renderCorrectionTable(targetUser);
            document.getElementById('modalContainer').classList.add('hidden');

        } catch (e) {
            console.error("Error cargando inventario híbrido:", e);
            _showModal('Error', `No se pudo cargar el inventario: ${e.message}`);
        }
    }

    function renderCorrectionTable(targetUser) {
        _mainContent.innerHTML = `
            <div class="p-2 md:p-4 h-screen flex flex-col">
                <div class="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden">
                    
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                        <div>
                            <h2 class="text-xl font-bold text-gray-800">Corregir Inventario</h2>
                            <p class="text-sm text-gray-600">Usuario: <span class="font-bold text-blue-600">${targetUser.email}</span></p>
                        </div>
                        <div class="flex gap-2 w-full md:w-auto">
                            <button id="btnApplyCorrections" class="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 text-sm">
                                Guardar Cambios
                            </button>
                            <button id="btnCancelCorrection" class="flex-1 md:flex-none px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 text-sm">
                                Cancelar
                            </button>
                        </div>
                    </div>

                    <!-- Filtros -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 p-3 bg-gray-50 rounded border">
                        <input type="text" id="corrSearch" placeholder="Buscar producto..." class="col-span-2 md:col-span-1 w-full border rounded p-1.5 text-sm">
                        <select id="corrRubro" class="w-full border rounded p-1.5 text-sm"><option value="">Rubro: Todos</option></select>
                        <select id="corrSegmento" class="w-full border rounded p-1.5 text-sm" disabled><option value="">Segmento: Todos</option></select>
                        <select id="corrMarca" class="w-full border rounded p-1.5 text-sm" disabled><option value="">Marca: Todas</option></select>
                    </div>

                    <div class="flex-grow overflow-auto border rounded-lg bg-gray-50 relative">
                        <table class="min-w-full bg-white text-sm relative">
                            <thead class="bg-gray-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="py-2 px-3 text-left font-semibold text-gray-700">Producto</th>
                                    <th class="py-2 px-3 text-center font-semibold text-gray-700 w-24">Stock Actual</th>
                                    <th class="py-2 px-3 text-center font-semibold text-gray-700 w-32">Ajuste (+/-)</th>
                                    <th class="py-2 px-3 text-left font-semibold text-gray-700">Observación (Obligatoria)</th>
                                </tr>
                            </thead>
                            <tbody id="correctionTableBody" class="divide-y divide-gray-100">
                                <!-- Filas generadas dinámicamente -->
                            </tbody>
                        </table>
                    </div>
                    <div id="correctionEmptyState" class="hidden text-center p-8 text-gray-500">No se encontraron productos con los filtros actuales.</div>
                </div>
            </div>
        `;

        document.getElementById('btnCancelCorrection').addEventListener('click', showUserSelectionView);
        document.getElementById('btnApplyCorrections').addEventListener('click', () => handleSaveCorrections(targetUser));

        // Configurar lógica de filtros en cascada
        setupCorrectionFilters();
    }

    function setupCorrectionFilters() {
        const rubroSel = document.getElementById('corrRubro');
        const segSel = document.getElementById('corrSegmento');
        const marcaSel = document.getElementById('corrMarca');
        const searchInput = document.getElementById('corrSearch');

        // Función auxiliar para renderizar opciones
        const renderOptions = (selectEl, valuesSet, label, currentVal) => {
            selectEl.innerHTML = `<option value="">${label}: Todos</option>`;
            [...valuesSet].sort().forEach(val => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                if (val === currentVal) opt.selected = true;
                selectEl.appendChild(opt);
            });
        };

        const updateDropdowns = (trigger) => {
            // Actualizar estado global
            _correctionFilters.rubro = rubroSel.value;
            if (trigger === 'rubro') { _correctionFilters.segmento = ''; _correctionFilters.marca = ''; }
            if (trigger === 'segmento') { _correctionFilters.marca = ''; }
            
            _correctionFilters.segmento = segSel.value;
            _correctionFilters.marca = marcaSel.value;
            _correctionFilters.search = searchInput.value.toLowerCase();

            // Lógica de cascada
            // 1. Rubros (Siempre estático, se carga una vez o se mantiene)
            if (trigger === 'init') {
                const rubros = new Set();
                _targetInventoryCache.forEach(p => { if (p.rubro) rubros.add(p.rubro); });
                renderOptions(rubroSel, rubros, 'Rubro', _correctionFilters.rubro);
            }

            // 2. Segmentos (Depende de Rubro)
            if (trigger === 'init' || trigger === 'rubro') {
                const segmentos = new Set();
                _targetInventoryCache.forEach(p => {
                    if (!_correctionFilters.rubro || p.rubro === _correctionFilters.rubro) {
                        if (p.segmento) segmentos.add(p.segmento);
                    }
                });
                renderOptions(segSel, segmentos, 'Segmento', _correctionFilters.segmento);
                segSel.disabled = segmentos.size === 0;
            }

            // 3. Marcas (Depende de Rubro y Segmento)
            if (trigger === 'init' || trigger === 'rubro' || trigger === 'segmento') {
                const marcas = new Set();
                _targetInventoryCache.forEach(p => {
                    const matchRubro = !_correctionFilters.rubro || p.rubro === _correctionFilters.rubro;
                    const matchSeg = !_correctionFilters.segmento || p.segmento === _correctionFilters.segmento;
                    if (matchRubro && matchSeg && p.marca) {
                        marcas.add(p.marca);
                    }
                });
                renderOptions(marcaSel, marcas, 'Marca', _correctionFilters.marca);
                marcaSel.disabled = marcas.size === 0;
            }

            // Redibujar tabla
            renderCorrectionRows();
        };

        rubroSel.addEventListener('change', () => updateDropdowns('rubro'));
        segSel.addEventListener('change', () => updateDropdowns('segmento'));
        marcaSel.addEventListener('change', () => updateDropdowns('marca'));
        searchInput.addEventListener('input', () => {
             _correctionFilters.search = searchInput.value.toLowerCase();
             renderCorrectionRows();
        });

        // Inicializar
        updateDropdowns('init');
    }

    function renderCorrectionRows() {
        const tbody = document.getElementById('correctionTableBody');
        const emptyState = document.getElementById('correctionEmptyState');
        if (!tbody) return;

        tbody.innerHTML = '';

        const filtered = _targetInventoryCache.filter(p => {
            const term = _correctionFilters.search;
            const matchSearch = !term || 
                (p.presentacion || '').toLowerCase().includes(term) ||
                (p.marca || '').toLowerCase().includes(term);
            const matchRubro = !_correctionFilters.rubro || p.rubro === _correctionFilters.rubro;
            const matchSeg = !_correctionFilters.segmento || p.segmento === _correctionFilters.segmento;
            const matchMarca = !_correctionFilters.marca || p.marca === _correctionFilters.marca;
            return matchSearch && matchRubro && matchSeg && matchMarca;
        });

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        } else {
            emptyState.classList.add('hidden');
        }

        const html = filtered.map(p => {
            let stockDisplay = `${p.cantidadUnidades || 0}`;
            if (p.ventaPor?.cj && p.unidadesPorCaja > 1) {
                const cjas = Math.floor((p.cantidadUnidades || 0) / p.unidadesPorCaja);
                const resto = (p.cantidadUnidades || 0) % p.unidadesPorCaja;
                stockDisplay = `<span class="font-bold text-blue-700">${cjas} Cj</span>`;
                if(resto > 0) stockDisplay += ` <span class="text-xs text-gray-500">+ ${resto}</span>`;
            }

            // Recuperar estado si existe
            const state = _correccionActualState[p.id] || { ajuste: '', observacion: '' };
            // Si ajuste es 0, mostrar vacío para placeholder
            const ajusteVal = state.ajuste !== 0 ? state.ajuste : '';

            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="py-2 px-3">
                    <div class="font-medium text-gray-800">${p.presentacion || 'Sin nombre'}</div>
                    <div class="text-xs text-gray-500">${p.marca || ''} - ${p.segmento || ''}</div>
                </td>
                <td class="py-2 px-3 text-center bg-gray-50">
                    ${stockDisplay}
                </td>
                <td class="py-2 px-3 text-center">
                    <input type="number" 
                        data-pid="${p.id}"
                        value="${ajusteVal}"
                        class="correction-input w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-yellow-500 text-center font-bold"
                        placeholder="0">
                </td>
                <td class="py-2 px-3">
                    <input type="text" 
                        data-pid="${p.id}-obs"
                        value="${state.observacion || ''}"
                        class="observation-input w-full px-2 py-1 border border-gray-300 rounded focus:ring-blue-500 text-xs"
                        placeholder="Razón del ajuste...">
                </td>
            </tr>
            `;
        }).join('');

        tbody.innerHTML = html;

        // Re-asignar listeners a los inputs recién creados
        tbody.querySelectorAll('.correction-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const pid = e.target.dataset.pid;
                if (!_correccionActualState[pid]) _correccionActualState[pid] = { ajuste: 0, observacion: '' };
                const val = parseInt(e.target.value);
                _correccionActualState[pid].ajuste = isNaN(val) ? 0 : val;
            });
        });

        tbody.querySelectorAll('.observation-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const pid = e.target.dataset.pid.replace('-obs', '');
                if (!_correccionActualState[pid]) _correccionActualState[pid] = { ajuste: 0, observacion: '' };
                _correccionActualState[pid].observacion = e.target.value;
            });
        });
    }

    async function handleSaveCorrections(targetUser) {
        const changes = Object.entries(_correccionActualState)
            .filter(([pid, data]) => data.ajuste !== 0)
            .map(([pid, data]) => ({
                pid,
                ...data,
                prod: _targetInventoryCache.find(p => p.id === pid)
            }));

        if (changes.length === 0) {
            _showModal('Aviso', 'No hay ajustes para guardar.');
            return;
        }

        const missingObs = changes.some(c => !c.observacion || c.observacion.length < 3);
        if (missingObs) {
            _showModal('Validación', 'Por favor, ingrese una observación válida para CADA producto con ajuste.');
            return;
        }

        _showModal('Confirmar', `Se ajustarán ${changes.length} productos del inventario de ${targetUser.email}. ¿Continuar?`, async () => {
            _showModal('Progreso', 'Aplicando correcciones...', null, '', null, false);
            try {
                await _runTransaction(_db, async (transaction) => {
                    const logRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/historial_correcciones`));
                    const fecha = new Date();
                    const detallesLog = [];

                    for (const item of changes) {
                        const invRef = _doc(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`, item.pid);
                        const invDoc = await transaction.get(invRef);
                        // Si no existe, permitimos crear si es una corrección positiva (ej: inicializar stock)
                        // Si es negativa y no existe, es un error lógico, pero asumiremos 0.
                        const currentStock = invDoc.exists() ? (invDoc.data().cantidadUnidades || 0) : 0;
                        const newStock = currentStock + item.ajuste;

                        if (newStock < 0) throw new Error(`El ajuste resulta en stock negativo para ${item.prod.presentacion}.`);

                        // Escribir solo cantidad, preservando ID. La data maestra está en public.
                        transaction.set(invRef, { cantidadUnidades: newStock }, { merge: true });

                        detallesLog.push({
                            productoId: item.pid,
                            presentacion: item.prod.presentacion || 'Desconocido',
                            marca: item.prod.marca || '',
                            stockAnterior: currentStock,
                            ajuste: item.ajuste,
                            stockNuevo: newStock,
                            observacion: item.observacion
                        });
                    }

                    transaction.set(logRef, {
                        fecha: fecha,
                        adminId: _userId,
                        targetUserId: targetUser.id,
                        targetUserEmail: targetUser.email,
                        totalItemsAfectados: changes.length,
                        detalles: detallesLog
                    });
                });
                _showModal('Éxito', 'Correcciones aplicadas correctamente.', showEditInventarioMenu);
            } catch (error) {
                console.error(error);
                _showModal('Error', `Falló la corrección: ${error.message}`);
            }
        }, 'Sí, Aplicar', null, true);
    }

    // --- VISTA 3: REPORTE DE RECARGAS (NUEVA) ---
    async function showRecargasHistoryView() {
        // Asegurarse de tener usuarios cargados para el dropdown
        if (_usersCache.length === 0) {
            try {
                const usersRef = _collection(_db, 'users');
                const q = _query(usersRef, _where('role', '==', 'user'));
                const snap = await _getDocs(q);
                _usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(e) { console.error("Error loading users for dropdown", e); }
        }

        const today = new Date().toISOString().split('T')[0];

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-5xl">
                    <div class="bg-white/95 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            <h2 class="text-2xl font-bold text-gray-800">Reporte de Recargas</h2>
                            <button id="btnBackFromRecargas" class="px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 text-sm">
                                Volver
                            </button>
                        </div>

                        <!-- Filtros -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg border">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1">Vendedor:</label>
                                <select id="recargaUserSelect" class="w-full border rounded p-2 text-sm">
                                    <option value="">Seleccione Vendedor...</option>
                                    ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1">Desde:</label>
                                <input type="date" id="recargaDateStart" value="${today}" class="w-full border rounded p-2 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1">Hasta:</label>
                                <input type="date" id="recargaDateEnd" value="${today}" class="w-full border rounded p-2 text-sm">
                            </div>
                            <div class="flex items-end gap-2">
                                <button id="btnBuscarRecargas" class="flex-1 bg-blue-600 text-white py-2 rounded shadow hover:bg-blue-700 text-sm font-bold">Buscar</button>
                                <button id="btnExportRecargas" class="flex-1 bg-green-600 text-white py-2 rounded shadow hover:bg-green-700 text-sm font-bold hidden">Exportar Excel</button>
                            </div>
                        </div>
                        
                        <!-- Resultados -->
                        <div id="recargasListContainer" class="space-y-4 overflow-y-auto" style="max-height: 60vh;">
                            <p class="text-center text-gray-500 py-8">Seleccione filtros y presione Buscar.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnBackFromRecargas').addEventListener('click', showEditInventarioMenu);
        document.getElementById('btnBuscarRecargas').addEventListener('click', handleSearchRecargas);
        document.getElementById('btnExportRecargas').addEventListener('click', exportRecargasToExcel);
    }

    async function handleSearchRecargas() {
        const userId = document.getElementById('recargaUserSelect').value;
        const dateStartStr = document.getElementById('recargaDateStart').value;
        const dateEndStr = document.getElementById('recargaDateEnd').value;

        if (!userId) { _showModal('Error', 'Seleccione un vendedor.'); return; }
        if (!dateStartStr || !dateEndStr) { _showModal('Error', 'Seleccione rango de fechas.'); return; }

        const container = document.getElementById('recargasListContainer');
        container.innerHTML = '<p class="text-center text-gray-500">Buscando...</p>';
        document.getElementById('btnExportRecargas').classList.add('hidden');

        try {
            // Ajustar fechas para query (Inicio del día start, Fin del día end)
            const startDate = new Date(dateStartStr); startDate.setHours(0,0,0,0);
            const endDate = new Date(dateEndStr); endDate.setHours(23,59,59,999);

            const recargasRef = _collection(_db, `artifacts/${_appId}/users/${userId}/recargas`);
            // Nota: Firestore requiere índice compuesto para where(fecha) + orderBy(fecha). 
            // Si falla, el catch mostrará el link para crear índice.
            const q = _query(
                recargasRef, 
                _where('fecha', '>=', startDate.toISOString()), 
                _where('fecha', '<=', endDate.toISOString()),
                _orderBy('fecha', 'desc')
            );

            const snap = await _getDocs(q);
            const recargas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            _recargasSearchCache = recargas; // Guardar para exportación

            if (recargas.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-500">No se encontraron recargas en este periodo.</p>';
                return;
            }

            document.getElementById('btnExportRecargas').classList.remove('hidden');
            container.innerHTML = '';

            recargas.forEach(r => {
                const fecha = new Date(r.fecha);
                const fechaStr = fecha.toLocaleString();
                
                // Detalles colapsables
                const detallesHtml = (r.detalles || []).map(d => `
                    <tr class="border-b text-xs hover:bg-gray-50">
                        <td class="p-1">${d.presentacion}</td>
                        <td class="p-1 text-center text-gray-500">${d.unidadesAnteriores}</td>
                        <td class="p-1 text-center font-bold text-green-700">+${d.diferenciaUnidades}</td>
                        <td class="p-1 text-center font-bold">${d.unidadesNuevas}</td>
                    </tr>
                `).join('');

                const card = document.createElement('div');
                card.className = 'border rounded-lg shadow-sm bg-white overflow-hidden';
                card.innerHTML = `
                    <div class="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-200 transition" onclick="this.parentElement.querySelector('.details-body').classList.toggle('hidden')">
                        <div>
                            <span class="font-bold text-blue-800">📅 ${fechaStr}</span>
                            <span class="ml-4 text-xs text-gray-600 bg-white px-2 py-1 rounded border">Productos Afectados: ${r.totalProductos}</span>
                        </div>
                        <span class="text-gray-500 text-xs">▼ Ver Detalles</span>
                    </div>
                    <div class="details-body hidden p-2 bg-white">
                        <table class="w-full">
                            <thead class="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th class="text-left p-1">Producto</th>
                                    <th class="p-1">Stock Ant.</th>
                                    <th class="p-1">Agregado</th>
                                    <th class="p-1">Nuevo Stock</th>
                                </tr>
                            </thead>
                            <tbody>${detallesHtml}</tbody>
                        </table>
                    </div>
                `;
                container.appendChild(card);
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = `<p class="text-red-500 text-center">Error: ${e.message}<br><small>Si es error de índice, ver consola.</small></p>`;
        }
    }

    async function exportRecargasToExcel() {
        if (!_recargasSearchCache || _recargasSearchCache.length === 0) return;

        _showModal('Progreso', 'Generando Reporte Excel...', null, '', null, false);

        try {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Reporte Recargas');
            
            // Info Vendedor
            const userId = document.getElementById('recargaUserSelect').value;
            const userObj = _usersCache.find(u => u.id === userId);
            const userName = userObj ? `${userObj.nombre || ''} ${userObj.apellido || ''} (${userObj.email})` : 'Desconocido';

            // --- ESTILOS ---
            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }; // Azul oscuro
            const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
            const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; // Azul claro
            const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

            // Encabezado Principal
            sheet.mergeCells('A1:E1');
            const titleCell = sheet.getCell('A1');
            titleCell.value = 'REPORTE DETALLADO DE RECARGAS DE INVENTARIO';
            titleCell.font = { size: 14, bold: true };
            titleCell.alignment = { horizontal: 'center' };

            sheet.mergeCells('A2:E2');
            sheet.getCell('A2').value = `Vendedor: ${userName}`;
            sheet.getCell('A2').font = { bold: true };

            sheet.mergeCells('A3:E3');
            sheet.getCell('A3').value = `Generado el: ${new Date().toLocaleString()}`;

            // Configurar Columnas (Fila 5)
            sheet.getRow(5).values = ['Fecha Recarga', 'Producto', 'Stock Anterior', 'Cantidad Agregada', 'Stock Resultante'];
            sheet.columns = [
                { key: 'fecha', width: 22 },
                { key: 'prod', width: 40 },
                { key: 'ant', width: 15 },
                { key: 'agg', width: 18 },
                { key: 'res', width: 15 }
            ];

            // Aplicar estilo al header de tabla
            ['A5','B5','C5','D5','E5'].forEach(cell => {
                const c = sheet.getCell(cell);
                c.fill = headerFill;
                c.font = headerFont;
                c.alignment = { horizontal: 'center' };
                c.border = borderStyle;
            });

            let currentRow = 6;

            // Iterar Recargas
            _recargasSearchCache.forEach(recarga => {
                const fecha = new Date(recarga.fecha).toLocaleString();
                const detalles = recarga.detalles || [];

                // Fila separadora de Recarga (Agrupador)
                sheet.mergeCells(`A${currentRow}:E${currentRow}`);
                const groupCell = sheet.getCell(`A${currentRow}`);
                groupCell.value = `RECARGA: ${fecha}  |  Items: ${recarga.totalProductos}  |  ID: ${recarga.id.substring(0,8)}...`;
                groupCell.fill = subHeaderFill;
                groupCell.font = { bold: true, color: { argb: 'FF000000' } };
                groupCell.border = borderStyle;
                currentRow++;

                // Detalles
                detalles.forEach(d => {
                    const row = sheet.getRow(currentRow);
                    row.values = {
                        fecha: '', // Vacío para limpieza visual bajo el grupo
                        prod: d.presentacion,
                        ant: d.unidadesAnteriores,
                        agg: d.diferenciaUnidades,
                        res: d.unidadesNuevas
                    };
                    
                    // Estilos de celda
                    row.getCell('prod').border = borderStyle;
                    row.getCell('ant').border = borderStyle;
                    row.getCell('ant').alignment = { horizontal: 'center' };
                    
                    const aggCell = row.getCell('agg');
                    aggCell.border = borderStyle;
                    aggCell.alignment = { horizontal: 'center' };
                    aggCell.font = { bold: true, color: { argb: 'FF006100' } }; // Verde oscuro

                    row.getCell('res').border = borderStyle;
                    row.getCell('res').alignment = { horizontal: 'center' };

                    currentRow++;
                });
                
                // Espacio entre recargas
                currentRow++; 
            });

            // Descargar
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Reporte_Recargas_${new Date().toISOString().slice(0,10)}.xlsx`;
            link.click();

            document.getElementById('modalContainer').classList.add('hidden');

        } catch (e) {
            console.error(e);
            _showModal('Error', 'Falló la generación del Excel: ' + e.message);
        }
    }

    // --- VISTA 4: HISTORIAL DE CORRECCIONES (Ya existente, mantenida) ---
    async function showHistorialView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            <h2 class="text-2xl font-bold text-gray-800">Historial de Correcciones Manuales</h2>
                            <div class="flex gap-2">
                                <button id="btnExportHistorial" class="px-4 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 text-sm">
                                    Descargar Excel
                                </button>
                                <button id="btnBackFromHist" class="px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 text-sm">
                                    Volver
                                </button>
                            </div>
                        </div>
                        
                        <div id="historialListContainer" class="space-y-4 overflow-y-auto" style="max-height: 70vh;">
                            <p class="text-center text-gray-500">Cargando historial...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnBackFromHist').addEventListener('click', showEditInventarioMenu);
        document.getElementById('btnExportHistorial').addEventListener('click', exportHistorialToExcel);

        try {
            const logRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/historial_correcciones`);
            const q = _query(logRef, _orderBy('fecha', 'desc'), _limit(50));
            const snap = await _getDocs(q);
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const container = document.getElementById('historialListContainer');
            if (logs.length === 0) {
                container.innerHTML = `<p class="text-center text-gray-500">No hay registros de correcciones.</p>`;
                return;
            }

            container.innerHTML = '';
            logs.forEach(log => {
                const fechaStr = log.fecha?.toDate ? log.fecha.toDate().toLocaleString() : 'Fecha inválida';
                
                const card = document.createElement('div');
                card.className = 'border rounded-lg p-4 bg-gray-50 shadow-sm';
                
                let detallesHTML = `
                    <table class="w-full text-xs mt-2 border-collapse">
                        <thead class="bg-gray-200">
                            <tr>
                                <th class="p-1 text-left">Producto</th>
                                <th class="p-1 text-center">Ant.</th>
                                <th class="p-1 text-center">Ajuste</th>
                                <th class="p-1 text-center">Nuevo</th>
                                <th class="p-1 text-left">Observación</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                (log.detalles || []).forEach(d => {
                    const colorClass = d.ajuste < 0 ? 'text-red-600' : 'text-green-600';
                    const signo = d.ajuste > 0 ? '+' : '';
                    detallesHTML += `
                        <tr class="border-t border-gray-200">
                            <td class="p-1 font-medium">${d.presentacion}</td>
                            <td class="p-1 text-center text-gray-500">${d.stockAnterior}</td>
                            <td class="p-1 text-center font-bold ${colorClass}">${signo}${d.ajuste}</td>
                            <td class="p-1 text-center font-bold">${d.stockNuevo}</td>
                            <td class="p-1 italic text-gray-600">${d.observacion}</td>
                        </tr>
                    `;
                });
                
                detallesHTML += `</tbody></table>`;

                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-bold text-blue-800">Usuario Afectado: ${log.targetUserEmail}</p>
                            <p class="text-xs text-gray-500">Fecha: ${fechaStr}</p>
                        </div>
                        <span class="text-xs bg-gray-200 px-2 py-1 rounded">Items: ${log.totalItemsAfectados}</span>
                    </div>
                    ${detallesHTML}
                `;
                container.appendChild(card);
            });

            window._tempHistorialLogs = logs;

        } catch (e) {
            console.error(e);
            document.getElementById('historialListContainer').innerHTML = `<p class="text-red-500">Error cargando historial: ${e.message}</p>`;
        }
    }

    async function exportHistorialToExcel() {
        if (!window._tempHistorialLogs || window._tempHistorialLogs.length === 0) {
            _showModal('Aviso', 'No hay datos para exportar.');
            return;
        }

        _showModal('Progreso', 'Generando Excel...', null, '', null, false);

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Historial Correcciones');

            worksheet.columns = [
                { header: 'Fecha', key: 'fecha', width: 20 },
                { header: 'Usuario Afectado', key: 'usuario', width: 25 },
                { header: 'Producto', key: 'producto', width: 30 },
                { header: 'Marca', key: 'marca', width: 20 },
                { header: 'Stock Anterior', key: 'ant', width: 15 },
                { header: 'Ajuste', key: 'ajuste', width: 10 },
                { header: 'Stock Nuevo', key: 'nuevo', width: 15 },
                { header: 'Observación', key: 'obs', width: 40 }
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };

            window._tempHistorialLogs.forEach(log => {
                const fechaStr = log.fecha?.toDate ? log.fecha.toDate().toLocaleString() : '';
                (log.detalles || []).forEach(d => {
                    const row = worksheet.addRow({
                        fecha: fechaStr,
                        usuario: log.targetUserEmail,
                        producto: d.presentacion,
                        marca: d.marca,
                        ant: d.stockAnterior,
                        ajuste: d.ajuste,
                        nuevo: d.stockNuevo,
                        obs: d.observacion
                    });
                    
                    if (d.ajuste < 0) row.getCell('ajuste').font = { color: { argb: 'FFFF0000' } };
                    else row.getCell('ajuste').font = { color: { argb: 'FF008000' } };
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Historial_Correcciones_${new Date().toISOString().slice(0,10)}.xlsx`;
            link.click();

            document.getElementById('modalContainer').classList.add('hidden');

        } catch (e) {
            console.error(e);
            _showModal('Error', 'Falló la exportación a Excel.');
        }
    }

})();

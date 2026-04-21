(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _populateDropdown;
    let _collection, _doc, _getDocs, _getDoc, _query, _where, _runTransaction, _addDoc, _orderBy, _limit, _startAfter;
    let _writeBatch, _setDoc; 

    // --- CONFIGURACIÓN CENTRALIZADA ---
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    let _usersCache = [];
    let _targetInventoryCache = [];
    let _correccionActualState = {}; 
    let _recargasSearchCache = []; 
    
    // Caché Global del Catálogo para enriquecer reportes
    let _masterMapCache = null;

    // Estados de filtros
    let _correctionFilters = { search: '', rubro: '', segmento: '', marca: '' };
    let _detalleFilters = { search: '', rubro: '', segmento: '', marca: '' };
    
    // ESTADOS PARA APERTURA/CIERRE
    let _currentDetalleRecarga = null;
    let _currentSnapshotItems = [];
    let _apCierreFilters = { search: '', rubro: '', segmento: '', marca: '' };
    let _lastSnapshotInfo = {}; // Guarda datos para el Excel

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
        _writeBatch = dependencies.writeBatch; 
        _setDoc = dependencies.setDoc;         

        if (!_runTransaction) console.error("Error Crítico: 'runTransaction' no disponible en initEditInventario.");
        console.log("Módulo Edit Inventario Inicializado (Bloqueo de scroll en inputs). Public ID:", PUBLIC_DATA_ID);
    };

    // --- HELPER: CARGAR CATÁLOGO MAESTRO ---
    async function loadMasterCatalog() {
        if (_masterMapCache) return _masterMapCache;
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);
        const snap = await _getDocs(masterRef);
        _masterMapCache = {};
        snap.forEach(d => { _masterMapCache[d.id] = d.data(); });
        return _masterMapCache;
    }

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
                            <button id="btnVerAperturaCierre" class="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition">
                                ☀️/🌙 Apertura y Cierre Inventario
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
        document.getElementById('btnVerAperturaCierre').addEventListener('click', showAperturaCierreView);
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

    // --- LÓGICA DE CORRECCIÓN (HÍBRIDA) ---
    async function loadUserInventory(targetUser) {
        _showModal('Cargando', `Obteniendo inventario de ${targetUser.email}...`, null, '', null, false);
        _correccionActualState = {}; 
        _correctionFilters = { search: '', rubro: '', segmento: '', marca: '' };

        try {
            const userInvRef = _collection(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`);
            const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);

            const [userSnap, masterSnap] = await Promise.all([
                _getDocs(userInvRef),
                _getDocs(masterRef)
            ]);

            const masterMap = {};
            masterSnap.forEach(d => masterMap[d.id] = d.data());

            _targetInventoryCache = userSnap.docs.map(d => {
                const uData = d.data();
                const mData = masterMap[d.id];

                if (mData) {
                    return {
                        id: d.id,
                        ...mData, 
                        cantidadUnidades: uData.cantidadUnidades || 0,
                        _legacyData: uData
                    };
                } else {
                    return { id: d.id, ...uData };
                }
            });
            
            if (window.getGlobalProductSortFunction) {
                const sortFn = await window.getGlobalProductSortFunction();
                _targetInventoryCache.sort(sortFn);
            } else {
                _targetInventoryCache.sort((a, b) => (a.presentacion || '').localeCompare(b.presentacion || ''));
            }
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
                            <p class="text-xs text-red-600 mt-1 font-semibold">* La unidad requerida de corrección (Und, Pq, Cj) se ajusta dinámicamente según el producto.</p>
                        </div>
                        <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            <button id="btnWipeInventory" class="flex-1 md:flex-none px-4 py-2 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700 text-sm" title="Limpiar todo el inventario del vendedor a cero">
                                🧹 Limpiar Inventario
                            </button>
                            <button id="btnApplyCorrections" class="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 text-sm">
                                Guardar Cambios
                            </button>
                            <button id="btnCancelCorrection" class="flex-1 md:flex-none px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 text-sm">
                                Cancelar
                            </button>
                        </div>
                    </div>

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
                            <tbody id="correctionTableBody" class="divide-y divide-gray-100"></tbody>
                        </table>
                    </div>
                    <div id="correctionEmptyState" class="hidden text-center p-8 text-gray-500">No se encontraron productos con los filtros actuales.</div>
                </div>
            </div>
        `;

        document.getElementById('btnCancelCorrection').addEventListener('click', showUserSelectionView);
        document.getElementById('btnApplyCorrections').addEventListener('click', () => handleSaveCorrections(targetUser));
        document.getElementById('btnWipeInventory').addEventListener('click', () => handleWipeInventory(targetUser));

        setupCorrectionFilters();
    }

    async function handleWipeInventory(targetUser) {
        _showModal('ADVERTENCIA EXTREMA', `¿Estás completamente seguro de borrar <b>TODO EL INVENTARIO</b> del vendedor <br><br><span class="text-blue-600 text-lg font-bold">${targetUser.email}</span>?<br><br>Esta acción eliminará todos los registros heredados y <b>dejará sus productos en CERO</b>. Es una acción IRREVERSIBLE.`, async () => {
            _showModal('Progreso', 'Limpiando inventario del vendedor...', null, '', null, false);
            try {
                const invRef = _collection(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`);
                const snap = await _getDocs(invRef);
                
                if (snap.empty) {
                    _showModal('Aviso', 'El inventario de este vendedor ya está completamente vacío.'); return;
                }

                let totalOps = 0;
                let batch = _writeBatch(_db);

                for (const docSnap of snap.docs) {
                    batch.delete(docSnap.ref);
                    totalOps++;
                    if (totalOps >= 490) {
                        await batch.commit();
                        batch = _writeBatch(_db);
                        totalOps = 0;
                    }
                }
                
                if (totalOps > 0) { await batch.commit(); }

                try {
                    const logRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/historial_correcciones`));
                    await _setDoc(logRef, {
                        fecha: new Date(), adminId: _userId, targetUserId: targetUser.id, targetUserEmail: targetUser.email,
                        totalItemsAfectados: snap.docs.length, tipoAjuste: 'LIMPIEZA_PROFUNDA',
                        detalles: [{
                            productoId: 'ALL', presentacion: 'TODOS LOS PRODUCTOS', marca: 'N/A', stockAnterior: 'Varios',
                            ajuste: 'LIMPIEZA TOTAL', stockNuevo: 0, observacion: 'Limpieza profunda de inventario ejecutada por admin'
                        }]
                    });
                } catch(logErr) { console.warn("No se pudo guardar log:", logErr); }

                _showModal('Éxito', 'El inventario ha sido borrado y restablecido a cero exitosamente.', () => loadUserInventory(targetUser));
            } catch (error) {
                console.error("Error limpiando inventario:", error);
                _showModal('Error', `Fallo al limpiar el inventario: ${error.message}`);
            }
        }, 'Sí, Borrar Todo', null, true);
    }

    function setupCorrectionFilters() {
        const rubroSel = document.getElementById('corrRubro');
        const segSel = document.getElementById('corrSegmento');
        const marcaSel = document.getElementById('corrMarca');
        const searchInput = document.getElementById('corrSearch');

        const renderOptions = (selectEl, valuesSet, label, currentVal) => {
            selectEl.innerHTML = `<option value="">${label}: Todos</option>`;
            [...valuesSet].sort().forEach(val => {
                const opt = document.createElement('option');
                opt.value = val; opt.textContent = val;
                if (val === currentVal) opt.selected = true;
                selectEl.appendChild(opt);
            });
        };

        const updateDropdowns = (trigger) => {
            _correctionFilters.rubro = rubroSel.value;
            if (trigger === 'rubro') { _correctionFilters.segmento = ''; _correctionFilters.marca = ''; }
            if (trigger === 'segmento') { _correctionFilters.marca = ''; }
            
            _correctionFilters.segmento = segSel.value;
            _correctionFilters.marca = marcaSel.value;
            _correctionFilters.search = searchInput.value.toLowerCase();

            if (trigger === 'init') {
                const rubros = new Set();
                _targetInventoryCache.forEach(p => { if (p.rubro) rubros.add(p.rubro); });
                renderOptions(rubroSel, rubros, 'Rubro', _correctionFilters.rubro);
            }

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

            if (trigger === 'init' || trigger === 'rubro' || trigger === 'segmento') {
                const marcas = new Set();
                _targetInventoryCache.forEach(p => {
                    const matchRubro = !_correctionFilters.rubro || p.rubro === _correctionFilters.rubro;
                    const matchSeg = !_correctionFilters.segmento || p.segmento === _correctionFilters.segmento;
                    if (matchRubro && matchSeg && p.marca) { marcas.add(p.marca); }
                });
                renderOptions(marcaSel, marcas, 'Marca', _correctionFilters.marca);
                marcaSel.disabled = marcas.size === 0;
            }

            renderCorrectionRows();
        };

        rubroSel.addEventListener('change', () => updateDropdowns('rubro'));
        segSel.addEventListener('change', () => updateDropdowns('segmento'));
        marcaSel.addEventListener('change', () => updateDropdowns('marca'));
        searchInput.addEventListener('input', () => { _correctionFilters.search = searchInput.value.toLowerCase(); renderCorrectionRows(); });
        updateDropdowns('init');
    }

    function renderCorrectionRows() {
        const tbody = document.getElementById('correctionTableBody');
        const emptyState = document.getElementById('correctionEmptyState');
        if (!tbody) return;

        tbody.innerHTML = '';

        const filtered = _targetInventoryCache.filter(p => {
            const term = _correctionFilters.search;
            const matchSearch = !term || (p.presentacion || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term);
            const matchRubro = !_correctionFilters.rubro || p.rubro === _correctionFilters.rubro;
            const matchSeg = !_correctionFilters.segmento || p.segmento === _correctionFilters.segmento;
            const matchMarca = !_correctionFilters.marca || p.marca === _correctionFilters.marca;
            return matchSearch && matchRubro && matchSeg && matchMarca;
        });

        if (filtered.length === 0) { emptyState.classList.remove('hidden'); return; } 
        else { emptyState.classList.add('hidden'); }

        let html = '';
        let currentGroup = null;

        filtered.forEach(p => {
            const rName = (p.rubro || 'SIN RUBRO').toUpperCase();
            const sName = (p.segmento || 'SIN SEGMENTO').toUpperCase();
            const groupName = `${rName} > ${sName}`;

            // Insertar separador visual si cambiamos de grupo
            if (groupName !== currentGroup) {
                currentGroup = groupName;
                html += `
                    <tr class="bg-gray-200/80 border-t border-gray-300">
                        <td colspan="4" class="py-2 px-3 font-extrabold text-gray-700 tracking-wide text-xs">
                            📁 ${currentGroup}
                        </td>
                    </tr>
                `;
            }

            const vPor = p.ventaPor || {und: true};
            let factor = 1;
            let unitLabel = 'Und';

            if (vPor.und) {
                factor = 1; unitLabel = 'Und';
            } else if (vPor.paq) {
                factor = p.unidadesPorPaquete || 1; unitLabel = 'Pq';
            } else if (vPor.cj) {
                factor = p.unidadesPorCaja || 1; unitLabel = 'Cj';
            }

            // REGLAS ESTRICTAS DE VISUALIZACIÓN
            let stockDisplay = '';
            if (vPor.und) {
                stockDisplay = `<span class="font-bold text-gray-800">${p.cantidadUnidades || 0} Und</span>`;
            } else {
                if (vPor.cj) {
                    const cjas = Math.floor((p.cantidadUnidades || 0) / (p.unidadesPorCaja || 1));
                    stockDisplay = `<span class="font-bold text-blue-700">${cjas} Cj</span>`;
                } else if (vPor.paq) {
                    const paqs = Math.floor((p.cantidadUnidades || 0) / (p.unidadesPorPaquete || 1));
                    stockDisplay = `<span class="font-bold text-blue-700">${paqs} Pq</span>`;
                } else {
                    stockDisplay = `<span class="font-bold text-gray-800">${p.cantidadUnidades || 0} Und</span>`;
                }
            }

            const state = _correccionActualState[p.id] || { ajuste: '', observacion: '' };
            const ajusteVal = state.ajuste !== 0 && state.ajuste !== '' ? state.ajuste : '';

            html += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <td class="py-2 px-3">
                    <div class="font-medium text-gray-800">${p.presentacion || 'Sin nombre'}</div>
                    <div class="text-xs text-gray-500">${p.marca || ''} - ${p.segmento || ''}</div>
                </td>
                <td class="py-2 px-3 text-center bg-gray-50">${stockDisplay}</td>
                <td class="py-2 px-3 text-center">
                    <div class="flex items-center justify-center">
                        <input type="number" data-pid="${p.id}" value="${ajusteVal}"
                            class="correction-input w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-yellow-500 text-center font-bold" placeholder="0">
                        <span class="ml-1 text-xs text-gray-500 font-bold">${unitLabel}</span>
                    </div>
                </td>
                <td class="py-2 px-3">
                    <input type="text" data-pid="${p.id}-obs" value="${state.observacion || ''}"
                        class="observation-input w-full px-2 py-1 border border-gray-300 rounded focus:ring-blue-500 text-xs" placeholder="Razón del ajuste...">
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;

        tbody.querySelectorAll('.correction-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const pid = e.target.dataset.pid;
                if (!_correccionActualState[pid]) _correccionActualState[pid] = { ajuste: 0, observacion: '' };
                const val = parseInt(e.target.value);
                _correccionActualState[pid].ajuste = isNaN(val) ? 0 : val;
            });

            // NUEVO: Bloqueo de la rueda del mouse para no modificar el número accidentalmente
            input.addEventListener('wheel', (e) => {
                e.preventDefault();
                input.blur();
            }, { passive: false });
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
                pid, ...data, prod: _targetInventoryCache.find(p => p.id === pid)
            }));

        if (changes.length === 0) { _showModal('Aviso', 'No hay ajustes para guardar.'); return; }

        const missingObs = changes.some(c => !c.observacion || c.observacion.length < 3);
        if (missingObs) { _showModal('Validación', 'Por favor, ingrese una observación válida para CADA producto con ajuste.'); return; }

        _showModal('Confirmar', `Se ajustarán ${changes.length} productos del inventario de ${targetUser.email}. ¿Continuar?`, async () => {
            _showModal('Progreso', 'Aplicando correcciones...', null, '', null, false);
            try {
                await _runTransaction(_db, async (transaction) => {
                    const logRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/historial_correcciones`));
                    const fecha = new Date();
                    const detallesLog = [];

                    const readData = [];
                    for (const item of changes) {
                        const invRef = _doc(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`, item.pid);
                        const invDoc = await transaction.get(invRef);
                        readData.push({ item, invRef, invDoc });
                    }

                    for (const data of readData) {
                        const { item, invRef, invDoc } = data;
                        const currentStock = invDoc.exists() ? (invDoc.data().cantidadUnidades || 0) : 0;
                        
                        const p = item.prod;
                        const vPor = p.ventaPor || {und: true};
                        let factor = 1;
                        let unitLabel = 'Und';

                        if (vPor.und) {
                            factor = 1; unitLabel = 'Und';
                        } else if (vPor.paq) {
                            factor = p.unidadesPorPaquete || 1; unitLabel = 'Pq';
                        } else if (vPor.cj) {
                            factor = p.unidadesPorCaja || 1; unitLabel = 'Cj';
                        }

                        // Matemáticas: Multiplicar el valor tipeado por el factor real
                        const unitsToAdjust = item.ajuste * factor;
                        const newStock = currentStock + unitsToAdjust;

                        if (newStock < 0) throw new Error(`El ajuste resulta en stock negativo para ${item.prod.presentacion}.`);

                        transaction.set(invRef, { cantidadUnidades: newStock }, { merge: true });

                        detallesLog.push({
                            productoId: item.pid, 
                            presentacion: item.prod.presentacion || 'Desconocido', 
                            marca: item.prod.marca || '',
                            stockAnterior: currentStock, 
                            ajuste: item.ajuste, 
                            factor: factor,
                            unidad: unitLabel,
                            ajusteBase: unitsToAdjust,
                            stockNuevo: newStock, 
                            observacion: item.observacion
                        });
                    }

                    const logData = {
                        fecha: fecha, adminId: _userId, targetUserId: targetUser.id, targetUserEmail: targetUser.email,
                        totalItemsAfectados: changes.length, detalles: detallesLog
                    };

                    // 1. Guardamos en el historial del Admin
                    transaction.set(logRef, logData);
                    
                    // 2. Guardamos una COPIA exacta en el historial del Vendedor
                    if (_userId !== targetUser.id) {
                        const userLogRef = _doc(_collection(_db, `artifacts/${_appId}/users/${targetUser.id}/historial_correcciones`));
                        transaction.set(userLogRef, logData);
                    }
                });
                
                // Mensaje de confirmación final con reseteo
                document.getElementById('modalContainer').classList.add('hidden');
                setTimeout(() => {
                    _showModal('¡Corrección Exitosa!', '✅ Los ajustes manuales se han guardado y aplicado correctamente al inventario del vendedor.', () => {
                        setTimeout(() => loadUserInventory(targetUser), 100);
                    }, 'Aceptar');
                }, 100);

            } catch (error) {
                console.error("Transaction Error:", error);
                _showModal('Error', `Falló la corrección: ${error.message}`);
            }
        }, 'Sí, Aplicar', null, true);
    }

    // =========================================================================
    // VISTA 3: REPORTE DE RECARGAS (Y VISTA DETALLADA HÍBRIDA)
    // =========================================================================
    async function showRecargasHistoryView() {
        if (_usersCache.length === 0) {
            try {
                const usersRef = _collection(_db, 'users');
                const q = _query(usersRef, _where('role', '==', 'user'));
                const snap = await _getDocs(q);
                _usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(e) { console.error("Error loading users", e); }
        }

        const today = new Date().toISOString().split('T')[0];

        _mainContent.innerHTML = `
            <div class="p-2 md:p-4 pt-8 h-screen flex flex-col">
                
                <div id="recargasMainContainer" class="container mx-auto max-w-5xl flex flex-col flex-grow">
                    <div class="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border border-gray-200">
                        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            <h2 class="text-2xl font-bold text-gray-800">Historial de Recargas</h2>
                            <button id="btnBackFromRecargas" class="px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 font-bold transition">Volver al Menú</button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Vendedor:</label>
                                <select id="recargaUserSelect" class="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                                    <option value="">Seleccione Vendedor...</option>
                                    ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Desde:</label>
                                <input type="date" id="recargaDateStart" value="${today}" class="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Hasta:</label>
                                <input type="date" id="recargaDateEnd" value="${today}" class="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div class="flex items-end gap-2">
                                <button id="btnBuscarRecargas" class="flex-1 bg-blue-600 text-white py-2 rounded-md shadow hover:bg-blue-700 text-sm font-bold transition">Buscar</button>
                                <button id="btnExportRecargas" class="flex-1 bg-green-600 text-white py-2 rounded-md shadow hover:bg-green-700 text-sm font-bold hidden transition">Excel</button>
                            </div>
                        </div>
                        
                        <div id="recargasListContainer" class="space-y-3 overflow-y-auto flex-grow pr-2 pb-4">
                            <p class="text-center text-gray-500 py-8 font-medium">Seleccione los filtros y presione "Buscar".</p>
                        </div>
                    </div>
                </div>

                <div id="recargasDetailContainer" class="container mx-auto max-w-5xl hidden flex-col flex-grow">
                    <div class="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-2xl flex flex-col flex-grow overflow-hidden border border-blue-200">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-gray-200 pb-4 gap-4">
                            <div>
                                <h2 class="text-xl font-black text-blue-900 tracking-tight">Detalle de Recarga</h2>
                                <p id="detalleRecargaInfo" class="text-sm text-gray-600 mt-1"></p>
                            </div>
                            <button id="btnCerrarDetalle" class="w-full sm:w-auto px-6 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition">← Volver a la Búsqueda</button>
                        </div>

                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100 shadow-inner">
                            <input type="text" id="detSearch" placeholder="Buscar producto..." class="col-span-2 md:col-span-1 w-full border border-blue-300 rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                            <select id="detRubro" class="w-full border border-blue-300 rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Rubro: Todos</option></select>
                            <select id="detSegmento" class="w-full border border-blue-300 rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" disabled><option value="">Segmento: Todos</option></select>
                            <select id="detMarca" class="w-full border border-blue-300 rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" disabled><option value="">Marca: Todas</option></select>
                        </div>

                        <div class="flex-grow overflow-auto border border-gray-300 rounded-lg bg-gray-50 relative">
                            <table class="min-w-full bg-white text-sm relative">
                                <thead class="bg-gray-800 text-white sticky top-0 z-10 shadow-md">
                                    <tr>
                                        <th class="py-2.5 px-3 text-left font-semibold tracking-wider">Producto (Marca - Presentación)</th>
                                        <th class="py-2.5 px-3 text-center font-semibold tracking-wider w-24">Stock Ant.</th>
                                        <th class="py-2.5 px-3 text-center font-semibold tracking-wider w-32">Agregado</th>
                                        <th class="py-2.5 px-3 text-center font-semibold tracking-wider w-24">Stock Nuevo</th>
                                    </tr>
                                </thead>
                                <tbody id="detalleTableBody" class="divide-y divide-gray-200"></tbody>
                            </table>
                        </div>
                        <div id="detalleEmptyState" class="hidden text-center p-8 text-gray-500 font-medium bg-gray-50 mt-4 rounded border">No se encontraron productos con los filtros actuales.</div>
                    </div>
                </div>

            </div>
        `;

        document.getElementById('btnBackFromRecargas').addEventListener('click', showEditInventarioMenu);
        document.getElementById('btnBuscarRecargas').addEventListener('click', handleSearchRecargas);
        document.getElementById('btnExportRecargas').addEventListener('click', exportRecargasToExcel);
        
        document.getElementById('btnCerrarDetalle').addEventListener('click', () => {
            document.getElementById('recargasDetailContainer').classList.add('hidden');
            document.getElementById('recargasDetailContainer').classList.remove('flex');
            document.getElementById('recargasMainContainer').classList.remove('hidden');
            document.getElementById('recargasMainContainer').classList.add('flex');
        });
    }

    async function handleSearchRecargas() {
        const userId = document.getElementById('recargaUserSelect').value;
        const dateStartStr = document.getElementById('recargaDateStart').value;
        const dateEndStr = document.getElementById('recargaDateEnd').value;

        if (!userId) { _showModal('Error', 'Seleccione un vendedor.'); return; }
        if (!dateStartStr || !dateEndStr) { _showModal('Error', 'Seleccione rango de fechas.'); return; }

        const container = document.getElementById('recargasListContainer');
        container.innerHTML = '<p class="text-center text-gray-500 font-medium animate-pulse py-8">Buscando reportes...</p>';
        document.getElementById('btnExportRecargas').classList.add('hidden');

        try {
            await loadMasterCatalog(); // Garantizar catálogo antes

            const [sYear, sMonth, sDay] = dateStartStr.split('-');
            const startDate = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
            const [eYear, eMonth, eDay] = dateEndStr.split('-');
            const endDate = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);

            const recargasRef = _collection(_db, `artifacts/${_appId}/users/${userId}/recargas`);
            const q = _query(
                recargasRef, 
                _where('fecha', '>=', startDate.toISOString()), 
                _where('fecha', '<=', endDate.toISOString())
            );

            const snap = await _getDocs(q);
            let recargas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            recargas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            _recargasSearchCache = recargas; 

            if (recargas.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 bg-gray-50 p-6 rounded-lg border border-dashed border-gray-300">No se encontraron recargas para este vendedor en el rango de fechas seleccionado.</div>';
                return;
            }

            document.getElementById('btnExportRecargas').classList.remove('hidden');
            container.innerHTML = '';

            recargas.forEach(r => {
                const fecha = new Date(r.fecha);
                const fechaStr = fecha.toLocaleString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                
                // Filtrar para mostrar la cantidad REAL de items modificados en la tarjeta
                const realItemsCount = (r.detalles || []).filter(d => (d.diferenciaUnidades || 0) > 0).length;

                const card = document.createElement('div');
                card.className = 'border border-gray-200 rounded-lg shadow-sm bg-white hover:bg-blue-50 transition-colors duration-200';
                card.innerHTML = `
                    <div class="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <span class="block font-black text-gray-800 text-lg capitalize mb-1">📅 ${fechaStr}</span>
                            <span class="text-xs text-blue-800 bg-blue-100 px-3 py-1 rounded-full border border-blue-200 font-bold inline-flex items-center">
                                📦 ${realItemsCount} Productos Recargados
                            </span>
                        </div>
                        <button onclick="window.editInventarioModule.verDetalleRecarga('${r.id}')" class="w-full sm:w-auto px-6 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-lg shadow hover:bg-teal-700 active:bg-teal-800 transition flex justify-center items-center gap-2">
                            Ver Detalles y Filtrar <span class="text-lg leading-none">➜</span>
                        </button>
                    </div>
                `;
                container.appendChild(card);
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = `<p class="text-red-500 text-center font-bold">Error en la búsqueda: ${e.message}</p>`;
        }
    }

    window.editInventarioModule = {
        verDetalleRecarga: async function(recargaId) {
            _currentDetalleRecarga = _recargasSearchCache.find(r => r.id === recargaId);
            if (!_currentDetalleRecarga) return;

            if (!_masterMapCache) {
                _showModal('Cargando', 'Sincronizando con el Catálogo Maestro...', null, '', null, false);
                await loadMasterCatalog();
                document.getElementById('modalContainer').classList.add('hidden');
            }

            document.getElementById('recargasMainContainer').classList.add('hidden');
            document.getElementById('recargasMainContainer').classList.remove('flex');
            
            document.getElementById('recargasDetailContainer').classList.remove('hidden');
            document.getElementById('recargasDetailContainer').classList.add('flex');

            const fecha = new Date(_currentDetalleRecarga.fecha).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
            // Contar items reales
            const realItemsCount = (_currentDetalleRecarga.detalles || []).filter(d => (d.diferenciaUnidades || 0) > 0).length;
            document.getElementById('detalleRecargaInfo').innerHTML = `Fecha: <b class="text-gray-800">${fecha}</b> <span class="mx-2 text-gray-300">|</span> Items: <b class="text-gray-800">${realItemsCount}</b>`;

            _detalleFilters = { search: '', rubro: '', segmento: '', marca: '' };
            await setupDetalleFilters();
        }
    };

    async function setupDetalleFilters() {
        // FILTRAR PRODUCTOS CON CERO RECARGAS Y ENRIQUECER
        const enrichedDetails = (_currentDetalleRecarga.detalles || [])
            .filter(d => (d.diferenciaUnidades || 0) > 0)
            .map(d => {
                const masterData = _masterMapCache[d.productoId] || {};
                return {
                    ...d,
                    rubro: masterData.rubro || 'OTROS',
                    segmento: masterData.segmento || 'SIN SEGMENTO',
                    marca: masterData.marca || 'S/M',
                    ordenSegmento: masterData.ordenSegmento ?? 9999,
                    ordenMarca: masterData.ordenMarca ?? 9999,
                    ordenProducto: masterData.ordenProducto ?? 9999,
                    masterData: masterData
                };
            });

        // ORDENAMIENTO GLOBAL
        if (window.getGlobalProductSortFunction) {
            const sortFn = await window.getGlobalProductSortFunction();
            enrichedDetails.sort(sortFn);
        }

        const renderOptions = (selectId, valuesSet, label, currentVal) => {
            const selectEl = document.getElementById(selectId);
            if (!selectEl) return;
            selectEl.innerHTML = `<option value="">${label}: Todos</option>`;
            [...valuesSet].sort().forEach(val => {
                const opt = document.createElement('option');
                opt.value = val; opt.textContent = val;
                if (val === currentVal) opt.selected = true;
                selectEl.appendChild(opt);
            });
        };

        const updateDropdowns = (trigger) => {
            const liveRubro = document.getElementById('detRubro');
            const liveSeg = document.getElementById('detSegmento');
            const liveMarca = document.getElementById('detMarca');
            const liveSearch = document.getElementById('detSearch');

            _detalleFilters.rubro = liveRubro.value;
            if (trigger === 'rubro') { _detalleFilters.segmento = ''; _detalleFilters.marca = ''; }
            if (trigger === 'segmento') { _detalleFilters.marca = ''; }
            
            _detalleFilters.segmento = trigger === 'rubro' ? '' : liveSeg.value;
            _detalleFilters.marca = (trigger === 'rubro' || trigger === 'segmento') ? '' : liveMarca.value;
            _detalleFilters.search = liveSearch.value.toLowerCase();

            if (trigger === 'init') {
                const rubros = new Set();
                enrichedDetails.forEach(p => { if (p.rubro) rubros.add(p.rubro); });
                renderOptions('detRubro', rubros, 'Rubro', _detalleFilters.rubro);
            }

            if (trigger === 'init' || trigger === 'rubro') {
                const segmentos = new Set();
                enrichedDetails.forEach(p => {
                    if (!_detalleFilters.rubro || p.rubro === _detalleFilters.rubro) {
                        if (p.segmento) segmentos.add(p.segmento);
                    }
                });
                renderOptions('detSegmento', segmentos, 'Segmento', _detalleFilters.segmento);
                document.getElementById('detSegmento').disabled = segmentos.size === 0;
            }

            if (trigger === 'init' || trigger === 'rubro' || trigger === 'segmento') {
                const marcas = new Set();
                enrichedDetails.forEach(p => {
                    const matchRubro = !_detalleFilters.rubro || p.rubro === _detalleFilters.rubro;
                    const matchSeg = !_detalleFilters.segmento || p.segmento === _detalleFilters.segmento;
                    if (matchRubro && matchSeg && p.marca) { marcas.add(p.marca); }
                });
                renderOptions('detMarca', marcas, 'Marca', _detalleFilters.marca);
                document.getElementById('detMarca').disabled = marcas.size === 0;
            }

            renderDetalleRows(enrichedDetails);
        };

        // Clonar elementos para quitar event listeners viejos y evitar duplicados
        const oldRubroSel = document.getElementById('detRubro');
        const newRubroSel = oldRubroSel.cloneNode(true); oldRubroSel.parentNode.replaceChild(newRubroSel, oldRubroSel);
        
        const oldSegSel = document.getElementById('detSegmento');
        const newSegSel = oldSegSel.cloneNode(true); oldSegSel.parentNode.replaceChild(newSegSel, oldSegSel);
        
        const oldMarcaSel = document.getElementById('detMarca');
        const newMarcaSel = oldMarcaSel.cloneNode(true); oldMarcaSel.parentNode.replaceChild(newMarcaSel, oldMarcaSel);
        
        const oldSearchInput = document.getElementById('detSearch');
        const newSearchInput = oldSearchInput.cloneNode(true); oldSearchInput.parentNode.replaceChild(newSearchInput, oldSearchInput);

        newRubroSel.addEventListener('change', () => updateDropdowns('rubro'));
        newSegSel.addEventListener('change', () => updateDropdowns('segmento'));
        newMarcaSel.addEventListener('change', () => updateDropdowns('marca'));
        newSearchInput.addEventListener('input', () => { 
            _detalleFilters.search = newSearchInput.value.toLowerCase(); 
            renderDetalleRows(enrichedDetails); 
        });

        newSearchInput.value = _detalleFilters.search;
        updateDropdowns('init');
    }

    function renderDetalleRows(enrichedDetails) {
        const tbody = document.getElementById('detalleTableBody');
        const emptyState = document.getElementById('detalleEmptyState');
        if (!tbody) return;

        tbody.innerHTML = '';

        const filtered = enrichedDetails.filter(p => {
            const term = _detalleFilters.search;
            const matchSearch = !term || (p.presentacion || '').toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term);
            const matchRubro = !_detalleFilters.rubro || p.rubro === _detalleFilters.rubro;
            const matchSeg = !_detalleFilters.segmento || p.segmento === _detalleFilters.segmento;
            const matchMarca = !_detalleFilters.marca || p.marca === _detalleFilters.marca;
            return matchSearch && matchRubro && matchSeg && matchMarca;
        });

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden'); return;
        } else {
            emptyState.classList.add('hidden');
        }

        let html = '';
        let lastHeader = null;

        // "filtered" ya viene ordenado desde setupDetalleFilters, por lo que podemos dibujar directamente
        filtered.forEach(d => {
            const currentHeader = `${d.rubro} > ${d.segmento}`;
            if (currentHeader !== lastHeader) {
                lastHeader = currentHeader;
                html += `<tr><td colspan="4" class="py-2.5 px-3 bg-gray-300 font-black text-gray-800 uppercase tracking-wide sticky top-[calc(theme(height.10))] z-[9] shadow-sm">${lastHeader}</td></tr>`;
            }

            const pMaster = d.masterData;
            const vPor = pMaster.ventaPor || {und: true};

            let unitLabel = 'Und';
            if (d.factorUtilizado > 1) {
                if (d.factorUtilizado === pMaster.unidadesPorCaja) unitLabel = 'Cj';
                else if (d.factorUtilizado === pMaster.unidadesPorPaquete) unitLabel = 'Pq';
                else unitLabel = `x${d.factorUtilizado}`;
            }

            const addedAmount = d.diferenciaUnidades / d.factorUtilizado;

            const formatStock = (unidadesBase) => {
                if (vPor.und) {
                    return `<span class="font-bold text-gray-800">${unidadesBase} Und</span>`;
                } else {
                    if (vPor.cj) {
                        const cjas = Math.floor(unidadesBase / (pMaster.unidadesPorCaja || 1));
                        return `<span class="font-bold text-gray-800">${cjas} Cj</span>`;
                    } else if (vPor.paq) {
                        const paqs = Math.floor(unidadesBase / (pMaster.unidadesPorPaquete || 1));
                        return `<span class="font-bold text-gray-800">${paqs} Pq</span>`;
                    }
                    return `<span class="font-bold text-gray-800">${unidadesBase} Und</span>`;
                }
            };

            html += `
            <tr class="hover:bg-blue-50 transition-colors">
                <td class="py-2.5 px-3 border-b border-gray-200">
                    <div class="font-bold text-gray-900 leading-tight">${d.presentacion}</div>
                    <div class="text-[11px] text-gray-500 font-semibold uppercase mt-0.5">${d.marca}</div>
                </td>
                <td class="py-2.5 px-3 text-center border-b border-gray-200 align-middle">
                    ${formatStock(d.unidadesAnteriores)}
                </td>
                <td class="py-2.5 px-3 text-center border-b border-gray-200 align-middle">
                    <span class="inline-block px-2.5 py-1 bg-green-100 border border-green-300 text-green-800 font-black rounded-md shadow-sm">
                        +${addedAmount} ${unitLabel}
                    </span>
                </td>
                <td class="py-2.5 px-3 text-center border-b border-gray-200 align-middle">
                    ${formatStock(d.unidadesNuevas)}
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }


    async function exportRecargasToExcel() {
        if (!_recargasSearchCache || _recargasSearchCache.length === 0) return;
        _showModal('Progreso', 'Generando Reporte Excel...', null, '', null, false);
        try {
            await loadMasterCatalog();
            const sortFn = window.getGlobalProductSortFunction ? await window.getGlobalProductSortFunction() : null;

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Reporte Recargas');
            
            const userId = document.getElementById('recargaUserSelect').value;
            const userObj = _usersCache.find(u => u.id === userId);
            const userName = userObj ? `${userObj.nombre || ''} ${userObj.apellido || ''} (${userObj.email})` : 'Desconocido';

            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }; 
            const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
            const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; 
            const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

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

            sheet.getRow(5).values = ['Fecha Recarga', 'Producto', 'Stock Anterior (Base)', 'Cantidad Agregada', 'Stock Resultante (Base)'];
            sheet.columns = [
                { key: 'fecha', width: 22 }, { key: 'prod', width: 40 }, { key: 'ant', width: 18 }, { key: 'agg', width: 20 }, { key: 'res', width: 18 }
            ];

            ['A5','B5','C5','D5','E5'].forEach(cell => {
                const c = sheet.getCell(cell);
                c.fill = headerFill; c.font = headerFont; c.alignment = { horizontal: 'center' }; c.border = borderStyle;
            });

            let currentRow = 6;

            _recargasSearchCache.forEach(recarga => {
                const fecha = new Date(recarga.fecha).toLocaleString();
                // 1. Filtrar recargas en 0
                let detalles = (recarga.detalles || []).filter(d => (d.diferenciaUnidades || 0) > 0);

                // 2. Ordenar globalmente para el Excel
                if (sortFn) {
                    detalles.forEach(d => {
                        const m = _masterMapCache[d.productoId] || {};
                        d.rubro = d.rubro || m.rubro || '';
                        d.segmento = d.segmento || m.segmento || '';
                        d.marca = d.marca || m.marca || '';
                        d.ordenSegmento = m.ordenSegmento ?? 9999;
                        d.ordenMarca = m.ordenMarca ?? 9999;
                        d.ordenProducto = m.ordenProducto ?? 9999;
                    });
                    detalles.sort(sortFn);
                }

                sheet.mergeCells(`A${currentRow}:E${currentRow}`);
                const groupCell = sheet.getCell(`A${currentRow}`);
                groupCell.value = `RECARGA: ${fecha}  |  Items: ${detalles.length}  |  ID: ${recarga.id.substring(0,8)}...`;
                groupCell.fill = subHeaderFill; groupCell.font = { bold: true, color: { argb: 'FF000000' } }; groupCell.border = borderStyle;
                currentRow++;

                detalles.forEach(d => {
                    const row = sheet.getRow(currentRow);
                    let unitLabel = 'Und';
                    if (d.factorUtilizado > 1) unitLabel = 'Cj/Pq'; 
                    const addedAmount = d.diferenciaUnidades / (d.factorUtilizado || 1);

                    row.values = { fecha: '', prod: d.presentacion, ant: d.unidadesAnteriores, agg: `+${addedAmount} ${unitLabel}`, res: d.unidadesNuevas };
                    row.getCell('prod').border = borderStyle; row.getCell('ant').border = borderStyle; row.getCell('ant').alignment = { horizontal: 'center' };
                    const aggCell = row.getCell('agg'); aggCell.border = borderStyle; aggCell.alignment = { horizontal: 'center' }; aggCell.font = { bold: true, color: { argb: 'FF006100' } }; 
                    row.getCell('res').border = borderStyle; row.getCell('res').alignment = { horizontal: 'center' };
                    currentRow++;
                });
                currentRow++; 
            });

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

    // =========================================================================
    // VISTA 5: APERTURA Y CIERRE DE INVENTARIO (NUEVO)
    // =========================================================================
    async function showAperturaCierreView() {
        if (_usersCache.length === 0) {
            try {
                const usersRef = _collection(_db, 'users');
                const q = _query(usersRef, _where('role', '==', 'user'));
                const snap = await _getDocs(q);
                _usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(e) { console.error("Error loading users", e); }
        }

        const today = new Date().toISOString().split('T')[0];

        _mainContent.innerHTML = `
            <div class="p-2 md:p-4 pt-8 h-screen flex flex-col">
                <div id="aperturaCierreMainContainer" class="container mx-auto max-w-5xl flex flex-col flex-grow">
                    <div class="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border border-gray-200">
                        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            <h2 class="text-2xl font-bold text-gray-800">Apertura y Cierre de Inventario</h2>
                            <div class="flex gap-2">
                                <button id="btnExportApCierre" class="hidden px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 font-bold transition">Descargar Excel</button>
                                <button id="btnBackFromApCierre" class="px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 font-bold transition">Volver al Menú</button>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-100 shadow-inner">
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Vendedor:</label>
                                <select id="apCierreUserSelect" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                    <option value="">Seleccione Vendedor...</option>
                                    ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Fecha:</label>
                                <input type="date" id="apCierreDate" value="${today}" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Momento:</label>
                                <select id="apCierreType" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                    <option value="apertura">☀️ Apertura (Inicio del día)</option>
                                    <option value="cierre">🌙 Cierre (Fin del día)</option>
                                </select>
                            </div>
                            <div class="flex items-end">
                                <button id="btnBuscarApCierre" class="w-full bg-indigo-600 text-white py-2 rounded-md shadow hover:bg-indigo-700 text-sm font-bold transition">Buscar Inventario</button>
                            </div>
                        </div>

                        <div id="snapshotInfo" class="mb-4 hidden p-3 bg-blue-100 text-blue-900 rounded border border-blue-300 font-medium text-sm"></div>

                        <div id="apCierreSubFilters" class="hidden grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50/30 shadow-sm">
                            <input type="text" id="apCSearch" placeholder="Buscar por Nombre, Marca o Segmento..." class="md:col-span-4 w-full px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition">
                            
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Rubro:</label>
                                <select id="apCRubro" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"><option value="">Todos</option></select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Segmento:</label>
                                <select id="apCSegmento" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500" disabled><option value="">Todos</option></select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Marca:</label>
                                <select id="apCMarca" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500" disabled><option value="">Todas</option></select>
                            </div>
                            <div class="flex items-end">
                                <button id="apCClearFilters" class="w-full bg-gray-300 text-sm font-bold text-gray-700 rounded-lg py-2.5 px-4 hover:bg-gray-400 transition-colors shadow-sm">Limpiar Filtros</button>
                            </div>
                        </div>

                        <div class="flex-grow overflow-auto border border-gray-300 rounded-lg bg-gray-50 relative hidden" id="snapshotTableContainer">
                            <table class="min-w-full bg-white text-sm text-left whitespace-nowrap relative">
                                <thead class="bg-indigo-800 text-white sticky top-0 z-20 shadow-md">
                                    <tr>
                                        <th class="py-3 px-4 uppercase font-semibold tracking-wider">Presentación</th>
                                        <th class="py-3 px-4 uppercase font-semibold tracking-wider hidden sm:table-cell">Marca</th>
                                        <th class="py-3 px-4 uppercase font-semibold tracking-wider text-center w-32">Stock</th>
                                    </tr>
                                </thead>
                                <tbody id="snapshotTableBody" class="divide-y divide-gray-200"></tbody>
                            </table>
                        </div>
                        <div id="apCierreEmptyState" class="text-center p-8 text-gray-500 font-medium bg-gray-50 mt-4 rounded border">Seleccione filtros y presione "Buscar".</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnBackFromApCierre').addEventListener('click', showEditInventarioMenu);
        document.getElementById('btnBuscarApCierre').addEventListener('click', handleSearchAperturaCierre);
        document.getElementById('btnExportApCierre').addEventListener('click', exportAperturaCierreToExcel);
    }

    async function handleSearchAperturaCierre() {
        const userId = document.getElementById('apCierreUserSelect').value;
        const dateStr = document.getElementById('apCierreDate').value;
        const type = document.getElementById('apCierreType').value;

        if (!userId) { _showModal('Error', 'Seleccione un vendedor.'); return; }
        if (!dateStr) { _showModal('Error', 'Seleccione una fecha.'); return; }

        const emptyState = document.getElementById('apCierreEmptyState');
        const tableContainer = document.getElementById('snapshotTableContainer');
        const infoBox = document.getElementById('snapshotInfo');
        const subFilters = document.getElementById('apCierreSubFilters');
        const btnExport = document.getElementById('btnExportApCierre');

        emptyState.innerHTML = 'Buscando registros...';
        emptyState.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        infoBox.classList.add('hidden');
        subFilters.classList.add('hidden');
        btnExport.classList.add('hidden');

        try {
            if (!_masterMapCache) await loadMasterCatalog();

            const targetDate = new Date(dateStr + 'T00:00:00');
            const nextDay = new Date(targetDate);
            nextDay.setDate(targetDate.getDate() + 1);

            const cierresRef = _collection(_db, `artifacts/${_appId}/users/${userId}/cierres`);
            const q = _query(cierresRef, _orderBy('fecha', 'desc'), _limit(20));
            const snap = await _getDocs(q);

            let closures = snap.docs.map(d => {
                const data = d.data();
                const dObj = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha || data.createdAt);
                return { id: d.id, ...data, parsedDate: dObj };
            });

            const todayClosures = closures.filter(c => c.parsedDate >= targetDate && c.parsedDate < nextDay);
            const beforeClosures = closures.filter(c => c.parsedDate < targetDate);

            let targetClosure = null;
            let isSimulatedFromPrevious = false;

            if (type === 'apertura') {
                if (todayClosures.length > 0) {
                    targetClosure = todayClosures[todayClosures.length - 1]; 
                } else if (beforeClosures.length > 0) {
                    targetClosure = beforeClosures[0]; 
                    isSimulatedFromPrevious = true;
                }
                
                if (!targetClosure) {
                    emptyState.innerHTML = `No se encontró inventario de apertura para el <b>${targetDate.toLocaleDateString()}</b> (No hay registros previos).`;
                    return;
                }
            } else { 
                if (todayClosures.length > 0) {
                    targetClosure = todayClosures[0]; 
                } else {
                    emptyState.innerHTML = `No se encontró ningún cierre registrado el <b>${targetDate.toLocaleDateString()}</b> para este vendedor.`;
                    return;
                }
            }

            const closureDate = targetClosure.parsedDate;
            let explanation = '';
            if (type === 'apertura' && isSimulatedFromPrevious) {
                explanation = `(Calculado en base al cierre del ${closureDate.toLocaleDateString()})`;
            }

            // Guardar para exportar
            const userObj = _usersCache.find(u => u.id === userId);
            _lastSnapshotInfo = {
                type: type,
                date: targetDate.toLocaleDateString(),
                user: `${userObj?.nombre || ''} ${userObj?.apellido || ''}`.trim() || userObj?.email,
                closureDate: closureDate.toLocaleString(),
                isSimulated: isSimulatedFromPrevious
            };

            infoBox.innerHTML = `Mostrando inventario de <b>${type.toUpperCase()}</b> correspondiente a la jornada del ${targetDate.toLocaleDateString()}. <br>
                                 <span class="text-xs">Basado en el registro: <b>${closureDate.toLocaleString()}</b> (Ref: ${targetClosure.id.substring(0,8)}...) <span class="text-red-600 font-bold">${explanation}</span></span>`;
            infoBox.classList.remove('hidden');

            const baseItems = targetClosure.cargaInicialInventario || targetClosure.inventario || targetClosure.productos || [];
            
            if (baseItems.length === 0) {
                emptyState.innerHTML = 'El registro de inventario guardado en este cierre se encuentra vacío (0 productos).';
                return;
            }

            let finalItems = JSON.parse(JSON.stringify(baseItems));
            const needsCalculation = type === 'cierre' || isSimulatedFromPrevious;

            if (needsCalculation) {
                const ventas = targetClosure.ventas || [];
                const obsequios = targetClosure.obsequios || [];

                ventas.forEach(v => {
                    (v.productos || []).forEach(vp => {
                        const it = finalItems.find(i => i.id === vp.id);
                        if (it) it.cantidadUnidades = (it.cantidadUnidades || 0) - (vp.totalUnidadesVendidas || 0);
                    });
                });

                obsequios.forEach(o => {
                    const it = finalItems.find(i => i.id === o.productoId);
                    if (it) {
                        const pMaster = _masterMapCache[o.productoId] || {};
                        const factor = pMaster.unidadesPorCaja || 1;
                        it.cantidadUnidades = (it.cantidadUnidades || 0) - ((o.cantidadCajas || 0) * factor);
                    }
                });
            }

            _currentSnapshotItems = finalItems.map(item => {
                const pid = item.productoId || item.id;
                const pMaster = _masterMapCache[pid] || {};
                return {
                    ...item,
                    pid: pid,
                    presentacion: item.presentacion || item.productoNombre || pMaster.presentacion || 'Desconocido',
                    rubro: pMaster.rubro || item.rubro || 'SIN RUBRO',
                    segmento: pMaster.segmento || item.segmento || 'SIN SEGMENTO',
                    marca: pMaster.marca || item.marca || 'S/M',
                    vPor: pMaster.ventaPor || {und: true},
                    unidadesPorCaja: pMaster.unidadesPorCaja || 1,
                    unidadesPorPaquete: pMaster.unidadesPorPaquete || 1,
                    cantidadUnidades: item.cantidadUnidades !== undefined ? item.cantidadUnidades : (item.stock || item.cantidad || 0),
                    // Traemos las coordenadas para el ordenamiento
                    ordenSegmento: pMaster.ordenSegmento ?? 9999,
                    ordenMarca: pMaster.ordenMarca ?? 9999,
                    ordenProducto: pMaster.ordenProducto ?? 9999
                };
            });

            _apCierreFilters = { search: '', rubro: '', segmento: '', marca: '' };
            
            subFilters.classList.remove('hidden');
            tableContainer.classList.remove('hidden');
            emptyState.classList.add('hidden');
            btnExport.classList.remove('hidden');

            initApCierreFilters();

        } catch (error) {
            console.error("Error fetching apertura/cierre:", error);
            emptyState.innerHTML = `<span class="text-red-600 font-bold">Ocurrió un error al buscar los datos: ${error.message}</span>`;
            emptyState.classList.remove('hidden');
        }
    }

    function initApCierreFilters() {
        const rubroSel = document.getElementById('apCRubro');
        const segSel = document.getElementById('apCSegmento');
        const marcaSel = document.getElementById('apCMarca');
        const searchInput = document.getElementById('apCSearch');
        const clearBtn = document.getElementById('apCClearFilters');

        const newRubroSel = rubroSel.cloneNode(true); rubroSel.parentNode.replaceChild(newRubroSel, rubroSel);
        const newSegSel = segSel.cloneNode(true); segSel.parentNode.replaceChild(newSegSel, segSel);
        const newMarcaSel = marcaSel.cloneNode(true); marcaSel.parentNode.replaceChild(newMarcaSel, marcaSel);
        const newSearchInput = searchInput.cloneNode(true); searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        const updateDropdowns = (trigger) => {
            _apCierreFilters.search = newSearchInput.value.toLowerCase();
            _apCierreFilters.rubro = newRubroSel.value;
            
            if (trigger === 'rubro') { _apCierreFilters.segmento = ''; _apCierreFilters.marca = ''; }
            if (trigger === 'segmento') { _apCierreFilters.marca = ''; }

            _apCierreFilters.segmento = trigger === 'rubro' ? '' : newSegSel.value;
            _apCierreFilters.marca = (trigger === 'rubro' || trigger === 'segmento') ? '' : newMarcaSel.value;

            const renderOptions = (selectEl, valuesSet, label, currentVal) => {
                selectEl.innerHTML = `<option value="">${label}: Todos</option>`;
                [...valuesSet].sort().forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val; opt.textContent = val;
                    if (val === currentVal) opt.selected = true;
                    selectEl.appendChild(opt);
                });
            };

            if (trigger === 'init') {
                const rubros = new Set();
                _currentSnapshotItems.forEach(p => { if (p.rubro) rubros.add(p.rubro); });
                renderOptions(newRubroSel, rubros, 'Rubro', _apCierreFilters.rubro);
            }

            if (trigger === 'init' || trigger === 'rubro') {
                const segmentos = new Set();
                _currentSnapshotItems.forEach(p => {
                    if (!_apCierreFilters.rubro || p.rubro === _apCierreFilters.rubro) {
                        if (p.segmento) segmentos.add(p.segmento);
                    }
                });
                renderOptions(newSegSel, segmentos, 'Segmento', _apCierreFilters.segmento);
                newSegSel.disabled = segmentos.size === 0;
            }

            if (trigger === 'init' || trigger === 'rubro' || trigger === 'segmento') {
                const marcas = new Set();
                _currentSnapshotItems.forEach(p => {
                    const matchRubro = !_apCierreFilters.rubro || p.rubro === _apCierreFilters.rubro;
                    const matchSeg = !_apCierreFilters.segmento || p.segmento === _apCierreFilters.segmento;
                    if (matchRubro && matchSeg && p.marca) { marcas.add(p.marca); }
                });
                renderOptions(newMarcaSel, marcas, 'Marca', _apCierreFilters.marca);
                newMarcaSel.disabled = marcas.size === 0;
            }

            renderApCierreTable();
        };

        newRubroSel.addEventListener('change', () => updateDropdowns('rubro'));
        newSegSel.addEventListener('change', () => updateDropdowns('segmento'));
        newMarcaSel.addEventListener('change', () => updateDropdowns('marca'));
        newSearchInput.addEventListener('input', () => { 
            _apCierreFilters.search = newSearchInput.value.toLowerCase(); 
            renderApCierreTable(); 
        });
        
        if (clearBtn) {
            const newClearBtn = clearBtn.cloneNode(true); clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
            newClearBtn.addEventListener('click', () => {
                newSearchInput.value = '';
                newRubroSel.value = '';
                updateDropdowns('rubro');
            });
        }

        updateDropdowns('init');
    }

    async function renderApCierreTable() {
        const tbody = document.getElementById('snapshotTableBody');
        if (!tbody) return;

        let filtrados = _currentSnapshotItems.filter(p => {
            const term = _apCierreFilters.search;
            const textMatch = !term || 
                (p.presentacion || '').toLowerCase().includes(term) ||
                (p.marca || '').toLowerCase().includes(term) ||
                (p.segmento || '').toLowerCase().includes(term);
                
            const rMatch = !_apCierreFilters.rubro || p.rubro === _apCierreFilters.rubro;
            const sMatch = !_apCierreFilters.segmento || p.segmento === _apCierreFilters.segmento;
            const mMatch = !_apCierreFilters.marca || p.marca === _apCierreFilters.marca;
            
            return textMatch && rMatch && sMatch && mMatch;
        });

        // INTEGRACIÓN DEL MOTOR DE ORDENAMIENTO GLOBAL
        if (window.getGlobalProductSortFunction) {
            const sortFn = await window.getGlobalProductSortFunction();
            filtrados.sort(sortFn);
        } else {
            // Fallback alfabético
            filtrados.sort((a, b) => {
                if (a.rubro !== b.rubro) return (a.rubro || '').localeCompare(b.rubro || '');
                if (a.segmento !== b.segmento) return (a.segmento || '').localeCompare(b.segmento || '');
                if (a.marca !== b.marca) return (a.marca || '').localeCompare(b.marca || '');
                return (a.presentacion || '').localeCompare(b.presentacion || '');
            });
        }

        if (filtrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-500 font-medium">No se encontraron productos con estos filtros.</td></tr>`;
            return;
        }

        let html = '';
        let currentGroup = null;

        filtrados.forEach(p => {
            const rName = (p.rubro || 'SIN RUBRO').toUpperCase();
            const sName = (p.segmento || 'SIN SEGMENTO').toUpperCase();
            const groupName = `${rName} > ${sName}`;

            if (groupName !== currentGroup) {
                currentGroup = groupName;
                html += `
                    <tr class="bg-blue-50/90 border-t-2 border-blue-200">
                        <td colspan="3" class="py-2.5 px-4 font-extrabold text-blue-900 sticky top-[44px] z-10 backdrop-blur-sm shadow-sm tracking-wide">
                            📁 ${currentGroup}
                        </td>
                    </tr>
                `;
            }

            const vPor = p.vPor || {und: true};
            let stockDisplay = '';
            let labelPres = p.presentacion;

            // REGLAS ESTRICTAS DE VISUALIZACIÓN
            if (vPor.und) {
                stockDisplay = `<span class="font-bold text-gray-800">${p.cantidadUnidades || 0} Und</span>`;
            } else {
                if (vPor.cj) {
                    labelPres += ` <span class="text-gray-400 text-xs">(${p.unidadesPorCaja}u)</span>`;
                    const cjas = Math.floor((p.cantidadUnidades || 0) / (p.unidadesPorCaja || 1));
                    stockDisplay = `<span class="font-bold text-blue-700">${cjas} Cj</span>`;
                } else if (vPor.paq) {
                    labelPres += ` <span class="text-gray-400 text-xs">(${p.unidadesPorPaquete}u)</span>`;
                    const paqs = Math.floor((p.cantidadUnidades || 0) / (p.unidadesPorPaquete || 1));
                    stockDisplay = `<span class="font-bold text-blue-700">${paqs} Pq</span>`;
                } else {
                    stockDisplay = `<span class="font-bold text-gray-800">${p.cantidadUnidades || 0} Und</span>`;
                }
            }

            html += `
                <tr class="hover:bg-amber-50 transition-colors duration-150 border-b border-gray-100">
                    <td class="py-3 px-4 font-semibold text-gray-800">
                        ${labelPres}
                        <span class="block sm:hidden text-xs text-gray-500 font-normal mt-0.5">${p.marca || 'S/M'}</span>
                    </td>
                    <td class="py-3 px-4 text-gray-600 hidden sm:table-cell">${p.marca || 'S/M'}</td>
                    <td class="py-3 px-4 font-bold text-gray-700 text-center">${stockDisplay}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // EXPORTACIÓN A EXCEL DE LA VISTA APERTURA/CIERRE POR HOJAS
    async function exportAperturaCierreToExcel() {
        if (!_currentSnapshotItems || _currentSnapshotItems.length === 0) return;
        
        if (typeof ExcelJS === 'undefined') {
            _showModal('Error', 'La librería ExcelJS no está cargada.');
            return;
        }

        _showModal('Progreso', 'Generando Reporte Excel por Rubros...');

        try {
            const workbook = new ExcelJS.Workbook();

            // --- Estilos Base ---
            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; 
            const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
            const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; 
            const subHeaderFont = { color: { argb: 'FF1E3A8A' }, bold: true, size: 11 };
            const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            const borderLight = { bottom: {style:'hair', color:{argb:'FFE5E7EB'}} }; 

            // Ordenamos TODOS los items independientemente de los filtros de la pantalla
            let exportData = [..._currentSnapshotItems];
            if (window.getGlobalProductSortFunction) {
                const sortFn = await window.getGlobalProductSortFunction();
                exportData.sort(sortFn);
            } else {
                exportData.sort((a, b) => (a.presentacion || '').localeCompare(b.presentacion || ''));
            }

            // Obtener lista de rubros únicos para crear las hojas
            const rubrosSet = new Set();
            exportData.forEach(p => rubrosSet.add((p.rubro || 'SIN RUBRO').toUpperCase()));
            const rubrosArray = Array.from(rubrosSet).sort();

            if (rubrosArray.length === 0) {
                _showModal('Aviso', 'No hay datos para exportar.');
                return;
            }

            rubrosArray.forEach(rubroName => {
                const safeSheetName = rubroName.replace(/[\/\\?*\[\]]/g, '').substring(0, 31);
                const sheet = workbook.addWorksheet(safeSheetName);

                sheet.mergeCells('A1:E1');
                const titleCell = sheet.getCell('A1');
                titleCell.value = `INVENTARIO DE ${_lastSnapshotInfo.type.toUpperCase()} - ${rubroName}`;
                titleCell.font = { size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
                titleCell.alignment = { horizontal: 'center' };

                sheet.mergeCells('A2:E2');
                sheet.getCell('A2').value = `Vendedor: ${_lastSnapshotInfo.user} | Fecha Jornada: ${_lastSnapshotInfo.date}`;
                sheet.getCell('A2').font = { bold: true };
                
                sheet.mergeCells('A3:E3');
                let infoText = `Calculado a partir del registro del: ${_lastSnapshotInfo.closureDate}`;
                if (_lastSnapshotInfo.isSimulated) infoText += ' (Cierre previo)';
                sheet.getCell('A3').value = infoText;
                sheet.getCell('A3').font = { italic: true, color: { argb: 'FF4B5563' } };

                sheet.getRow(5).values = ['Presentación', 'Marca', 'Cajas', 'Paquetes', 'Unidades'];
                sheet.columns = [
                    { key: 'pres', width: 45 },
                    { key: 'marca', width: 20 },
                    { key: 'cj', width: 12 },
                    { key: 'paq', width: 12 },
                    { key: 'und', width: 15 }
                ];

                ['A5','B5','C5','D5','E5'].forEach(cell => {
                    const c = sheet.getCell(cell);
                    c.fill = headerFill;
                    c.font = headerFont;
                    c.alignment = { horizontal: 'center', vertical: 'middle' };
                    c.border = borderStyle;
                });

                const itemsRubro = exportData.filter(p => (p.rubro || 'SIN RUBRO').toUpperCase() === rubroName);
                
                let currentRow = 6;
                let currentGroup = null;

                itemsRubro.forEach(p => {
                    const sName = (p.segmento || 'SIN SEGMENTO').toUpperCase();
                    const groupName = `${rubroName} > ${sName}`;

                    if (groupName !== currentGroup) {
                        currentGroup = groupName;
                        sheet.mergeCells(`A${currentRow}:E${currentRow}`);
                        const groupCell = sheet.getCell(`A${currentRow}`);
                        groupCell.value = `📁 ${currentGroup}`;
                        groupCell.fill = subHeaderFill;
                        groupCell.font = subHeaderFont;
                        groupCell.border = borderStyle;
                        currentRow++;
                    }

                    const vPor = p.vPor || {und: true};
                    let cj = '', paq = '', und = p.cantidadUnidades || 0;

                    if (und > 0) {
                        if (vPor.und) {
                            cj = '';
                            paq = '';
                        } else {
                            if (vPor.cj && p.unidadesPorCaja > 1) {
                                const calCj = Math.floor(und / p.unidadesPorCaja);
                                if (calCj > 0) cj = calCj;
                                und = ''; 
                            } else if (vPor.paq && p.unidadesPorPaquete > 1) {
                                const calPaq = Math.floor(und / p.unidadesPorPaquete);
                                if (calPaq > 0) paq = calPaq;
                                und = ''; 
                            }
                        }
                    } else {
                        und = '';
                    }

                    let presFull = p.presentacion;
                    if (vPor.cj && p.unidadesPorCaja > 1) presFull += ` (${p.unidadesPorCaja}u)`;
                    else if (vPor.paq && p.unidadesPorPaquete > 1) presFull += ` (${p.unidadesPorPaquete}u)`;

                    const row = sheet.getRow(currentRow);
                    row.values = {
                        pres: presFull,
                        marca: p.marca || 'S/M',
                        cj: cj,
                        paq: paq,
                        und: und
                    };

                    row.getCell('pres').border = borderLight;
                    row.getCell('marca').border = borderLight;
                    
                    ['cj', 'paq', 'und'].forEach(k => {
                        const c = row.getCell(k);
                        c.border = borderLight;
                        c.alignment = { horizontal: 'center' };
                        if (c.value !== '') c.font = { bold: true };
                    });

                    currentRow++;
                });

                sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }];
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            const vNameSafe = _lastSnapshotInfo.user.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const dateSafe = _lastSnapshotInfo.date.replace(/[^a-z0-9]/gi, '');
            link.download = `Inventario_${_lastSnapshotInfo.type}_${vNameSafe}_${dateSafe}.xlsx`;
            
            link.click();
            document.getElementById('modalContainer').classList.add('hidden');

        } catch (error) {
            console.error(error);
            _showModal('Error', 'Falló la generación del Excel: ' + error.message);
        }
    }


    // --- VISTA 4: HISTORIAL DE CORRECCIONES ---
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
            await loadMasterCatalog(); // Garantizar catálogo para ordenamiento

            const logRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/historial_correcciones`);
            const q = _query(logRef, _orderBy('fecha', 'desc'), _limit(50));
            const snap = await _getDocs(q);
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const container = document.getElementById('historialListContainer');
            if (logs.length === 0) {
                container.innerHTML = `<p class="text-center text-gray-500">No hay registros de correcciones.</p>`;
                return;
            }

            // Ordenar detalles de cada log con la función global
            const sortFn = window.getGlobalProductSortFunction ? await window.getGlobalProductSortFunction() : null;

            if (sortFn) {
                logs.forEach(log => {
                    if (log.detalles) {
                        log.detalles.forEach(d => {
                            const m = _masterMapCache[d.productoId] || {};
                            d.rubro = d.rubro || m.rubro || '';
                            d.segmento = d.segmento || m.segmento || '';
                            d.marca = d.marca || m.marca || '';
                            d.ordenSegmento = m.ordenSegmento ?? 9999;
                            d.ordenMarca = m.ordenMarca ?? 9999;
                            d.ordenProducto = m.ordenProducto ?? 9999;
                        });
                        log.detalles.sort(sortFn);
                    }
                });
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
                                <th class="p-1 text-center">Ant. (Base)</th>
                                <th class="p-1 text-center">Ajuste</th>
                                <th class="p-1 text-center">Nuevo (Base)</th>
                                <th class="p-1 text-left">Observación</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                (log.detalles || []).forEach(d => {
                    const adjustmentToEvaluate = d.ajusteBase !== undefined ? d.ajusteBase : d.ajuste;
                    const colorClass = adjustmentToEvaluate < 0 ? 'text-red-600' : (adjustmentToEvaluate > 0 ? 'text-green-600' : 'text-gray-800');
                    const signo = adjustmentToEvaluate > 0 ? '+' : '';
                    
                    const unidadStr = d.unidad ? ` ${d.unidad}` : '';
                    const tooltipBase = d.ajusteBase !== undefined ? ` title="${signo}${d.ajusteBase} Und. Base"` : '';

                    detallesHTML += `
                        <tr class="border-t border-gray-200">
                            <td class="p-1 font-medium">${d.presentacion}</td>
                            <td class="p-1 text-center text-gray-500">${d.stockAnterior}</td>
                            <td class="p-1 text-center font-bold ${colorClass}"${tooltipBase}>${signo}${d.ajuste}${unidadStr}</td>
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
                        <span class="text-xs bg-gray-200 px-2 py-1 rounded font-bold">Tipo: ${log.tipoAjuste || 'MANUAL'} | Items: ${log.totalItemsAfectados}</span>
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
                { header: 'Stock Ant. (Base)', key: 'ant', width: 18 },
                { header: 'Ajuste', key: 'ajuste', width: 15 },
                { header: 'Stock Nuevo (Base)', key: 'nuevo', width: 20 },
                { header: 'Observación', key: 'obs', width: 40 }
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };

            window._tempHistorialLogs.forEach(log => {
                const fechaStr = log.fecha?.toDate ? log.fecha.toDate().toLocaleString() : '';
                (log.detalles || []).forEach(d => {
                    const adjustmentToEvaluate = d.ajusteBase !== undefined ? d.ajusteBase : d.ajuste;
                    const unidadStr = d.unidad ? ` ${d.unidad}` : '';
                    
                    const row = worksheet.addRow({
                        fecha: fechaStr,
                        usuario: log.targetUserEmail,
                        producto: d.presentacion,
                        marca: d.marca,
                        ant: d.stockAnterior,
                        ajuste: `${d.ajuste}${unidadStr}`,
                        nuevo: d.stockNuevo,
                        obs: d.observacion
                    });
                    
                    if (adjustmentToEvaluate < 0) row.getCell('ajuste').font = { color: { argb: 'FFFF0000' } };
                    else if (adjustmentToEvaluate > 0) row.getCell('ajuste').font = { color: { argb: 'FF008000' } };
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

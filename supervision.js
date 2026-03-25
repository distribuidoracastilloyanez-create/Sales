(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _getDoc, _query, _where, _doc, _setDoc, _writeBatch;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    let _usersCache = [];
    let _masterMapCache = {};
    let _lastAuditData = []; 

    window.initSupervision = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _getDoc = dependencies.getDoc;
        _setDoc = dependencies.setDoc;
        _query = dependencies.query;
        _where = dependencies.where;
        _doc = dependencies.doc;
        _writeBatch = dependencies.writeBatch;

        console.log("Módulo Supervisión Inicializado con Auditoría Perpetua y Corrección Masiva.");
    };

    async function loadMasterCatalog() {
        if (Object.keys(_masterMapCache).length > 0) return _masterMapCache;
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);
        const snap = await _getDocs(masterRef);
        _masterMapCache = {};
        snap.forEach(d => { _masterMapCache[d.id] = { id: d.id, ...d.data() }; });
        return _masterMapCache;
    }

    async function loadUsers() {
        if (_usersCache.length > 0) return _usersCache;
        const usersRef = _collection(_db, 'users');
        const q = _query(usersRef, _where('role', '==', 'user'));
        const snap = await _getDocs(q);
        _usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return _usersCache;
    }

    window.showSupervisionMenu = function() {
        if (_userRole !== 'admin') {
            _showModal('Acceso Denegado', 'Solo administradores pueden acceder a este módulo.');
            return;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center border-t-4 border-indigo-600">
                        <h1 class="text-3xl font-black text-gray-800 mb-2 tracking-tight">Centro de Supervisión</h1>
                        <p class="text-gray-600 mb-8 text-sm">Monitoreo en vivo y Auditoría de inventarios.</p>
                        <div class="space-y-4">
                            <button id="btnVentasEnVivo" class="w-full px-6 py-4 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                                <span class="text-xl">📡</span> Monitoreo de Ventas en Vivo
                            </button>
                            <button id="btnAuditoria" class="w-full px-6 py-4 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 transition flex items-center justify-center gap-2">
                                <span class="text-xl">⚖️</span> Auditoría de Cuadre
                            </button>
                            <button id="btnVolverMenuSup" class="w-full px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-md hover:bg-gray-500 transition mt-4">
                                Volver al Menú Principal
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnVentasEnVivo').addEventListener('click', showVentasEnVivoView);
        document.getElementById('btnAuditoria').addEventListener('click', showAuditoriaView);
        document.getElementById('btnVolverMenuSup').addEventListener('click', _showMainMenu);
    };

    // =========================================================================
    // VISTA 1: VENTAS EN VIVO
    // =========================================================================
    async function showVentasEnVivoView() {
        await loadUsers();
        _mainContent.innerHTML = `
            <div class="p-2 md:p-4 pt-8 h-screen flex flex-col">
                <div class="container mx-auto max-w-5xl flex flex-col flex-grow">
                    <div class="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border border-indigo-100">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-2xl font-black text-indigo-900 tracking-tight">📡 Ventas en Vivo</h2>
                            <button id="btnBackSup1" class="px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition text-sm">Volver</button>
                        </div>

                        <div class="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                            <label class="block text-xs font-bold text-indigo-800 mb-1 uppercase tracking-wider">Seleccione el Vendedor a monitorear:</label>
                            <select id="supUserSelect" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                                <option value="">-- Seleccione un vendedor --</option>
                                ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                            </select>
                        </div>

                        <div class="flex-grow overflow-auto border border-gray-200 rounded-lg bg-gray-50 hidden flex-col" id="liveDataContainer">
                            <div class="grid grid-cols-2 gap-4 p-4 bg-white border-b border-gray-200">
                                <div class="bg-green-50 border border-green-200 p-3 rounded-lg text-center">
                                    <p class="text-xs font-bold text-green-700 uppercase">Total Facturado</p>
                                    <p class="text-2xl font-black text-green-900" id="liveTotalSales">$0.00</p>
                                </div>
                                <div class="bg-blue-50 border border-blue-200 p-3 rounded-lg text-center">
                                    <p class="text-xs font-bold text-blue-700 uppercase">Cant. Operaciones</p>
                                    <p class="text-2xl font-black text-blue-900" id="liveTotalOps">0</p>
                                </div>
                            </div>
                            
                            <table class="min-w-full bg-white text-sm relative">
                                <thead class="bg-indigo-800 text-white sticky top-0 z-10 shadow-md">
                                    <tr>
                                        <th class="py-2.5 px-3 text-left font-semibold">Cliente</th>
                                        <th class="py-2.5 px-3 text-center font-semibold">Hora</th>
                                        <th class="py-2.5 px-3 text-center font-semibold">Tipo</th>
                                        <th class="py-2.5 px-3 text-right font-semibold">Total</th>
                                    </tr>
                                </thead>
                                <tbody id="liveTableBody" class="divide-y divide-gray-200"></tbody>
                            </table>
                        </div>
                        <div id="liveEmptyState" class="text-center p-8 text-gray-500 font-medium bg-gray-50 mt-4 rounded border border-dashed">Seleccione un vendedor para ver sus operaciones del día.</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnBackSup1').addEventListener('click', window.showSupervisionMenu);
        document.getElementById('supUserSelect').addEventListener('change', fetchLiveSales);
    }

    async function fetchLiveSales() {
        const userId = document.getElementById('supUserSelect').value;
        const container = document.getElementById('liveDataContainer');
        const emptyState = document.getElementById('liveEmptyState');
        const tbody = document.getElementById('liveTableBody');
        const totalSalesEl = document.getElementById('liveTotalSales');
        const totalOpsEl = document.getElementById('liveTotalOps');

        if (!userId) {
            container.classList.add('hidden');
            container.classList.remove('flex');
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = 'Seleccione un vendedor para ver sus operaciones del día.';
            return;
        }

        emptyState.innerHTML = '<span class="animate-pulse">Consultando base de datos en vivo...</span>';
        emptyState.classList.remove('hidden');
        container.classList.add('hidden');
        container.classList.remove('flex');
        tbody.innerHTML = '';

        try {
            const ventasRef = _collection(_db, `artifacts/${_appId}/users/${userId}/ventas`);
            const obsequiosRef = _collection(_db, `artifacts/${_appId}/users/${userId}/obsequios_entregados`);

            const [vSnap, oSnap] = await Promise.all([
                _getDocs(ventasRef),
                _getDocs(obsequiosRef)
            ]);

            const operaciones = [];
            let granTotal = 0;

            vSnap.docs.forEach(d => {
                const data = d.data();
                const total = data.total || 0;
                granTotal += total;
                const dObj = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha || Date.now());
                operaciones.push({ id: d.id, tipo: 'Venta', cliente: data.clienteNombre || 'Desconocido', total: total, fecha: dObj });
            });

            oSnap.docs.forEach(d => {
                const data = d.data();
                const dObj = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha || Date.now());
                operaciones.push({ id: d.id, tipo: 'Obsequio', cliente: data.clienteNombre || 'Desconocido', total: 0, fecha: dObj });
            });

            if (operaciones.length === 0) {
                emptyState.innerHTML = '<span class="text-gray-500 font-bold">El vendedor no tiene facturas ni obsequios activos en este momento.</span>';
                return;
            }

            operaciones.sort((a, b) => b.fecha - a.fecha); 

            totalSalesEl.textContent = `$${granTotal.toFixed(2)}`;
            totalOpsEl.textContent = operaciones.length;

            let html = '';
            operaciones.forEach(op => {
                const horaStr = op.fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const isVenta = op.tipo === 'Venta';
                const badgeClass = isVenta ? 'bg-green-100 text-green-800 border-green-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                
                html += `
                    <tr class="hover:bg-indigo-50 transition-colors">
                        <td class="py-3 px-3 font-bold text-gray-800 text-xs">${op.cliente}</td>
                        <td class="py-3 px-3 text-center text-gray-500 text-xs">${horaStr}</td>
                        <td class="py-3 px-3 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-black border ${badgeClass}">${op.tipo}</span>
                        </td>
                        <td class="py-3 px-3 text-right font-black ${isVenta ? 'text-gray-900' : 'text-gray-400'}">
                            ${isVenta ? '$' + op.total.toFixed(2) : '-'}
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
            container.classList.remove('hidden');
            container.classList.add('flex');
            emptyState.classList.add('hidden');

        } catch (error) {
            console.error("Error en Live Sales:", error);
            emptyState.innerHTML = `<span class="text-red-500 font-bold">Error al consultar: ${error.message}</span>`;
        }
    }

    // =========================================================================
    // VISTA 2: AUDITORÍA DE CUADRE PERPETUO
    // =========================================================================
    async function showAuditoriaView() {
        await loadUsers();
        await loadMasterCatalog();

        _mainContent.innerHTML = `
            <div class="p-2 md:p-4 pt-8 h-screen flex flex-col">
                <div class="container mx-auto max-w-6xl flex flex-col flex-grow">
                    <div class="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border border-red-100">
                        <div class="flex justify-between items-center mb-4">
                            <div>
                                <h2 class="text-2xl font-black text-red-900 tracking-tight">⚖️ Auditoría de Inventario</h2>
                                <p class="text-xs text-gray-500 font-medium mt-1">Compara el Stock Matemático Perpetuo vs la Base de Datos Físico Actual</p>
                            </div>
                            <button id="btnBackSup2" class="px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition text-sm">Volver</button>
                        </div>

                        <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex flex-col gap-4">
                            <div class="flex gap-4 items-end">
                                <div class="flex-grow">
                                    <label class="block text-xs font-bold text-red-800 mb-1 uppercase tracking-wider">Seleccione Vendedor para Auditar:</label>
                                    <select id="auditUserSelect" class="w-full border border-red-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white">
                                        <option value="">-- Seleccione un vendedor --</option>
                                        ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                                    </select>
                                </div>
                                <button id="btnEjecutarAuditoria" class="bg-red-600 text-white px-6 py-2 rounded-md font-bold hover:bg-red-700 shadow transition h-[38px]">Auditar Ahora</button>
                            </div>
                            
                            <div class="flex gap-2 pt-3 border-t border-red-200">
                                <button id="btnVerSnapshot" class="flex-1 bg-white text-blue-700 border border-blue-300 px-4 py-2 rounded-md text-xs font-bold hover:bg-blue-50 shadow-sm transition">👁️ Ver Registro del Punto de Partida</button>
                                <button id="btnFijarSnapshot" class="flex-1 bg-white text-orange-700 border border-orange-300 px-4 py-2 rounded-md text-xs font-bold hover:bg-orange-50 shadow-sm transition">📸 Fijar Nuevo Punto de Partida</button>
                            </div>
                        </div>

                        <div id="auditResultsPanel" class="hidden flex-col flex-grow overflow-hidden">
                            <div id="auditSummary" class="mb-4 p-4 rounded-lg border"></div>
                            
                            <div id="auditFilters" class="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-gray-200 shadow-sm hidden">
                                <input type="text" id="auditSearchInput" placeholder="Buscar presentación..." class="border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none">
                                <select id="auditRubroFilter" class="border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white">
                                    <option value="">Todos los Rubros</option>
                                </select>
                                <select id="auditMarcaFilter" class="border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white">
                                    <option value="">Todas las Marcas</option>
                                </select>
                                <label class="flex items-center justify-center space-x-2 bg-red-50 px-3 py-2 rounded border border-red-200 cursor-pointer hover:bg-red-100 transition">
                                    <input type="checkbox" id="auditOnlyErrors" class="rounded text-red-600 focus:ring-red-500 w-4 h-4">
                                    <span class="text-xs font-bold text-red-800 uppercase tracking-wider">Solo Errores</span>
                                </label>
                            </div>
                            
                            <div class="flex-grow overflow-auto border border-gray-300 rounded-lg bg-gray-50">
                                <table class="min-w-full bg-white text-sm relative">
                                    <thead class="bg-gray-800 text-white sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th class="py-2.5 px-3 text-left font-semibold">Producto</th>
                                            <th class="py-2.5 px-3 text-center font-semibold bg-gray-700" title="Lo que debería tener">Teórico</th>
                                            <th class="py-2.5 px-3 text-center font-semibold bg-blue-900" title="Lo que tiene en BD">Físico</th>
                                            <th class="py-2.5 px-3 text-center font-semibold">Diferencia</th>
                                        </tr>
                                    </thead>
                                    <tbody id="auditTableBody" class="divide-y divide-gray-200"></tbody>
                                </table>
                            </div>
                        </div>
                        <div id="auditEmptyState" class="text-center p-8 text-gray-500 font-medium bg-gray-50 mt-2 rounded border border-dashed flex-grow flex items-center justify-center">Seleccione un vendedor y presione "Auditar Ahora".</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnBackSup2').addEventListener('click', window.showSupervisionMenu);
        document.getElementById('btnEjecutarAuditoria').addEventListener('click', executeAudit);
        
        document.getElementById('btnVerSnapshot').addEventListener('click', handleViewSnapshot);
        document.getElementById('btnFijarSnapshot').addEventListener('click', handleCreateSnapshot);

        document.getElementById('auditSearchInput').addEventListener('input', renderAuditTable);
        document.getElementById('auditRubroFilter').addEventListener('change', renderAuditTable);
        document.getElementById('auditMarcaFilter').addEventListener('change', renderAuditTable);
        document.getElementById('auditOnlyErrors').addEventListener('change', renderAuditTable);
    }

    function formatStockStrict(baseUnits, pMaster) {
        if (baseUnits === 0) return `<span class="text-gray-400">0</span>`;
        const vPor = pMaster?.ventaPor || {und: true};
        
        if (vPor.cj && pMaster.unidadesPorCaja > 1) {
            const cjas = Math.floor(baseUnits / pMaster.unidadesPorCaja);
            const resto = baseUnits % pMaster.unidadesPorCaja;
            let res = `<span class="font-bold">${cjas} Cj</span>`;
            if (resto > 0) res += ` <span class="text-[10px] text-gray-500 ml-1">+${resto}u</span>`;
            return res;
        } else if (vPor.paq && pMaster.unidadesPorPaquete > 1) {
            const paqs = Math.floor(baseUnits / pMaster.unidadesPorPaquete);
            const resto = baseUnits % pMaster.unidadesPorPaquete;
            let res = `<span class="font-bold">${paqs} Pq</span>`;
            if (resto > 0) res += ` <span class="text-[10px] text-gray-500 ml-1">+${resto}u</span>`;
            return res;
        }
        return `<span class="font-bold">${baseUnits} Und</span>`;
    }

    // --- 1. FIJAR NUEVO PUNTO DE PARTIDA (Puro Físico) ---
    async function handleCreateSnapshot() {
        const userId = document.getElementById('auditUserSelect').value;
        if (!userId) { _showModal('Error', 'Seleccione un vendedor primero.'); return; }
        
        _showModal('Fijar Punto de Partida Permanente', `¿Desea fijar el <b>inventario físico actual de la base de datos</b> como el nuevo punto de partida absoluto?<br><br>
            <span class="text-sm text-gray-600">Al confirmar, el sistema tomará una fotografía de todo lo que el vendedor tiene AHORA MISMO y la matemática a futuro (incluyendo mañana y la próxima semana) se calculará desde aquí.</span>`, 
            async () => {
                _showModal('Progreso', 'Tomando fotografía del inventario...', null, '', null, false);
                try {
                    const AUDIT_SNAPSHOT_PATH = `artifacts/${_appId}/users/${userId}/config/auditoriaBaseSnapshot`;
                    
                    await loadMasterCatalog();
                    
                    // Físico actual
                    const iSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/inventario`));
                    
                    const snapshotArray = [];
                    iSnap.docs.forEach(d => {
                        const qty = d.data().cantidadUnidades || 0;
                        if (qty > 0) {
                            const pId = d.id;
                            const pMaster = _masterMapCache[pId] || {};
                            snapshotArray.push({
                                productoId: pId,
                                presentacion: pMaster.presentacion || 'Desconocido',
                                rubro: pMaster.rubro || 'SIN RUBRO',
                                segmento: pMaster.segmento || 'SIN SEGMENTO',
                                marca: pMaster.marca || 'S/M',
                                cantidadUnidades: qty
                            });
                        }
                    });

                    await _setDoc(_doc(_db, AUDIT_SNAPSHOT_PATH), {
                        fecha: new Date(),
                        inventario: snapshotArray
                    });

                    _showModal('Éxito', '✅ Punto de Partida permanente actualizado exitosamente con el stock físico actual. La auditoría se reinició.');
                    if (!document.getElementById('auditResultsPanel').classList.contains('hidden')) {
                        executeAudit(); 
                    }
                } catch (err) {
                    console.error(err);
                    _showModal('Error', 'Fallo al guardar el punto de partida: ' + err.message);
                }
            }, 'Sí, Fijar Inventario Base', null, true);
    }

    // --- 2. VER SNAPSHOT (Lo que se fijó) ---
    async function handleViewSnapshot() {
        const userId = document.getElementById('auditUserSelect').value;
        if (!userId) { _showModal('Error', 'Seleccione un vendedor primero.'); return; }

        _showModal('Progreso', 'Leyendo base de datos...', null, '', null, false);
        try {
            const AUDIT_SNAPSHOT_PATH = `artifacts/${_appId}/users/${userId}/config/auditoriaBaseSnapshot`;
            const snap = await _getDoc(_doc(_db, AUDIT_SNAPSHOT_PATH));
            
            if (!snap.exists()) {
                _showModal('Aviso', 'No hay ningún Punto de Partida Permanente registrado para este vendedor. Genere uno ahora.');
                return;
            }

            const data = snap.data();
            const fechaStr = data.fecha?.toDate ? data.fecha.toDate().toLocaleString('es-ES') : new Date(data.fecha).toLocaleString('es-ES');
            let itemsGlobales = data.inventario || [];

            await loadMasterCatalog();
            let rubrosDisponibles = new Set();

            // Mapeamos para el ordenamiento
            itemsGlobales = itemsGlobales.map(item => {
                const pMaster = _masterMapCache[item.productoId] || {};
                const rubroName = pMaster.rubro || item.rubro || 'SIN RUBRO';
                rubrosDisponibles.add(rubroName);
                
                return {
                    ...item,
                    rubro: rubroName,
                    segmento: pMaster.segmento || item.segmento || 'SIN SEGMENTO',
                    marca: pMaster.marca || item.marca || 'S/M',
                    ordenSegmento: pMaster.ordenSegmento ?? 9999,
                    ordenMarca: pMaster.ordenMarca ?? 9999,
                    ordenProducto: pMaster.ordenProducto ?? 9999,
                    pMaster: pMaster
                };
            });

            if (window.getGlobalProductSortFunction) {
                const sortFn = await window.getGlobalProductSortFunction();
                itemsGlobales.sort(sortFn);
            } else {
                itemsGlobales.sort((a,b) => (a.presentacion || '').localeCompare(b.presentacion || ''));
            }

            const renderTableRows = (filterRubro = '') => {
                let html = '';
                let currentGroup = null;

                const itemsFiltrados = filterRubro ? itemsGlobales.filter(i => i.rubro === filterRubro) : itemsGlobales;

                if (itemsFiltrados.length === 0) {
                    return `<tr><td colspan="2" class="text-center py-8 text-gray-500 font-medium">No hay productos en este rubro.</td></tr>`;
                }

                itemsFiltrados.forEach(p => {
                    const rName = (p.rubro || 'SIN RUBRO').toUpperCase();
                    const sName = (p.segmento || 'SIN SEGMENTO').toUpperCase();
                    const groupName = `${rName} > ${sName}`;

                    if (groupName !== currentGroup) {
                        currentGroup = groupName;
                        html += `
                            <tr class="bg-blue-50/90 border-t border-blue-200">
                                <td colspan="2" class="py-1.5 px-3 font-extrabold text-blue-900 tracking-wide text-[10px] uppercase">
                                    📁 ${currentGroup}
                                </td>
                            </tr>
                        `;
                    }

                    html += `
                        <tr class="hover:bg-gray-50 border-b border-gray-100">
                            <td class="py-1.5 px-3">
                                <div class="font-bold text-gray-800 text-xs">${p.presentacion}</div>
                                <div class="text-[10px] text-gray-500 uppercase">${p.marca}</div>
                            </td>
                            <td class="py-1.5 px-3 text-right text-xs align-middle">
                                ${formatStockStrict(p.cantidadUnidades, p.pMaster)}
                            </td>
                        </tr>
                    `;
                });
                return html;
            };

            let rubrosOptions = `<option value="">Todos los Rubros</option>`;
            Array.from(rubrosDisponibles).sort().forEach(r => {
                rubrosOptions += `<option value="${r}">${r}</option>`;
            });

            const modalHtml = `
                <div class="text-left flex flex-col h-full">
                    <div class="flex flex-col sm:flex-row justify-between gap-2 mb-4">
                        <div class="text-xs text-gray-600 bg-gray-100 p-2 rounded border border-gray-200 flex-grow">
                            Fecha de Registro: <br><b class="text-blue-700">${fechaStr}</b>
                        </div>
                        <div class="flex-shrink-0 min-w-[150px]">
                            <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Filtrar Rubro:</label>
                            <select id="modalRubroFilter" class="w-full border border-blue-300 rounded p-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold">
                                ${rubrosOptions}
                            </select>
                        </div>
                    </div>
                    
                    <div class="flex-grow max-h-[50vh] overflow-y-auto border border-gray-300 rounded-lg shadow-inner bg-white relative">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-800 text-white sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th class="py-2 px-3 text-left font-semibold">Producto</th>
                                    <th class="py-2 px-3 text-right font-semibold">Stock Fijado</th>
                                </tr>
                            </thead>
                            <tbody id="modalSnapshotTableBody">
                                ${renderTableRows('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            _showModal('Punto de Partida Registrado', modalHtml, null, 'Cerrar');

            setTimeout(() => {
                const rubroFilter = document.getElementById('modalRubroFilter');
                const tableBody = document.getElementById('modalSnapshotTableBody');
                if (rubroFilter && tableBody) {
                    rubroFilter.addEventListener('change', (e) => {
                        tableBody.innerHTML = renderTableRows(e.target.value);
                    });
                }
            }, 100);

        } catch (err) {
            console.error(err);
            _showModal('Error', 'Fallo al obtener el registro: ' + err.message);
        }
    }

    // --- 3. Ejecución principal de Auditoría Perpetua ---
    async function executeAudit() {
        const userId = document.getElementById('auditUserSelect').value;
        const panel = document.getElementById('auditResultsPanel');
        const emptyState = document.getElementById('auditEmptyState');
        const summary = document.getElementById('auditSummary');

        if (!userId) { _showModal('Error', 'Seleccione un vendedor.'); return; }

        emptyState.innerHTML = '<span class="animate-pulse font-bold text-red-600">Realizando cálculos matemáticos del inventario...</span>';
        emptyState.classList.remove('hidden');
        panel.classList.add('hidden');
        panel.classList.remove('flex');
        
        try {
            await loadMasterCatalog();

            const AUDIT_SNAPSHOT_PATH = `artifacts/${_appId}/users/${userId}/config/auditoriaBaseSnapshot`;
            let baseItems = [];
            let fechaCargaInicial = null;
            
            const snapshotDoc = await _getDoc(_doc(_db, AUDIT_SNAPSHOT_PATH));
            if (snapshotDoc.exists()) {
                const data = snapshotDoc.data();
                baseItems = data.inventario || [];
                fechaCargaInicial = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
            } else {
                emptyState.innerHTML = `
                    <div class="text-center p-4">
                        <p class="text-red-500 font-bold mb-2">El vendedor no tiene un Punto de Partida Permanente registrado.</p>
                        <p class="text-sm text-gray-500 mb-6">Para usar este nuevo sistema avanzado de auditoría que sobrevive a los cierres diarios, fije el inventario una vez.</p>
                        <button onclick="document.getElementById('btnFijarSnapshot').click()" class="bg-orange-600 text-white px-5 py-2.5 rounded-lg shadow-md hover:bg-orange-700 font-bold text-sm transition transform hover:scale-105">📸 Fijar Punto de Partida Ahora</button>
                    </div>
                `;
                return;
            }

            // Descargas
            const [vSnap, oSnap, iSnap, rSnapFull, cSnapFull, cierresSnapFull] = await Promise.all([
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/ventas`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/obsequios_entregados`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/inventario`)), // FÍSICO
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/recargas`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/historial_correcciones`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/cierres`)) // Cierres pasados
            ]);

            const inventarioActualMap = new Map(iSnap.docs.map(d => [d.id, d.data().cantidadUnidades || 0]));
            const ventasActivas = vSnap.docs.map(d => d.data());
            const obsequiosActivos = oSnap.docs.map(d => d.data());

            // Filtrado Seguro en Memoria
            const recargas = rSnapFull.docs.map(d => d.data()).filter(r => {
                const dObj = r.fecha?.toDate ? r.fecha.toDate() : new Date(r.fecha);
                return dObj >= fechaCargaInicial;
            });

            const correcciones = cSnapFull.docs.map(d => d.data()).filter(c => {
                const dObj = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha);
                return dObj >= fechaCargaInicial;
            });

            const cierres = cierresSnapFull.docs.map(d => d.data()).filter(c => {
                const dObj = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha);
                return dObj >= fechaCargaInicial;
            });

            // EL GRAN CÁLCULO TEÓRICO MATEMÁTICO
            const mapaStockTeorico = new Map(); 
            
            // 1. Sumamos el Snapshot Base
            baseItems.forEach(item => {
                const pId = item.productoId || item.id;
                mapaStockTeorico.set(pId, item.cantidadUnidades || 0);
            });

            // 2. Sumamos Recargas
            recargas.forEach(r => {
                (r.detalles || []).forEach(d => {
                    mapaStockTeorico.set(d.productoId, (mapaStockTeorico.get(d.productoId) || 0) + (d.diferenciaUnidades || 0));
                });
            });

            // 3. Sumamos Correcciones
            correcciones.forEach(c => {
                if (c.tipoAjuste === 'LIMPIEZA_PROFUNDA') return; 
                (c.detalles || []).forEach(d => {
                    const ajuste = d.ajusteBase !== undefined ? d.ajusteBase : (d.ajuste !== undefined ? d.ajuste : (d.diferenciaUnidades || d.diferencia || 0));
                    if (d.productoId && d.productoId !== 'ALL') {
                        mapaStockTeorico.set(d.productoId, (mapaStockTeorico.get(d.productoId) || 0) + ajuste);
                    }
                });
            });

            // 4. Restamos Ventas Activas
            ventasActivas.forEach(v => {
                (v.productos || []).forEach(vp => {
                    mapaStockTeorico.set(vp.id, (mapaStockTeorico.get(vp.id) || 0) - (vp.totalUnidadesVendidas || 0));
                });
            });

            // 5. Restamos Obsequios Activos
            obsequiosActivos.forEach(o => {
                const pId = o.productoId;
                const pMaster = _masterMapCache[pId] || { unidadesPorCaja: 1 };
                const factorMultiplicador = o.unidadesPorCaja || pMaster.unidadesPorCaja || 1;
                const uRegaladas = (o.cantidadCajas || 0) * factorMultiplicador;
                mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) - uRegaladas);
            });

            // 6. Restamos Ventas y Obsequios empaquetados en los CIERRES que sucedieron DESPUÉS del Snapshot
            cierres.forEach(c => {
                (c.ventas || []).forEach(v => {
                    (v.productos || []).forEach(vp => {
                        mapaStockTeorico.set(vp.id, (mapaStockTeorico.get(vp.id) || 0) - (vp.totalUnidadesVendidas || 0));
                    });
                });
                (c.obsequios || []).forEach(o => {
                    const pId = o.productoId;
                    const pMaster = _masterMapCache[pId] || { unidadesPorCaja: 1 };
                    const factorMultiplicador = o.unidadesPorCaja || pMaster.unidadesPorCaja || 1;
                    mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) - ((o.cantidadCajas || 0) * factorMultiplicador));
                });
            });

            // COMPARACIÓN
            const allIdsSet = new Set([...mapaStockTeorico.keys(), ...inventarioActualMap.keys()]);
            const results = [];

            allIdsSet.forEach(pId => {
                const teorico = mapaStockTeorico.get(pId) || 0;
                const fisico = inventarioActualMap.get(pId) || 0;
                if (teorico === 0 && fisico === 0) return;

                const pMaster = _masterMapCache[pId] || { presentacion: 'Producto Desconocido', rubro: 'SIN RUBRO', marca: 'S/M' };
                const diff = fisico - teorico;

                results.push({
                    id: pId,
                    presentacion: pMaster.presentacion || 'Producto Desconocido',
                    rubro: pMaster.rubro || 'SIN RUBRO',
                    marca: pMaster.marca || 'S/M',
                    segmento: pMaster.segmento || 'SIN SEGMENTO',
                    teorico,
                    fisico,
                    diff,
                    pMaster,
                    ordenSegmento: pMaster.ordenSegmento ?? 9999,
                    ordenMarca: pMaster.ordenMarca ?? 9999,
                    ordenProducto: pMaster.ordenProducto ?? 9999
                });
            });

            if (window.getGlobalProductSortFunction) {
                const sortFn = await window.getGlobalProductSortFunction();
                results.sort(sortFn);
            } else {
                results.sort((a, b) => a.presentacion.localeCompare(b.presentacion));
            }

            _lastAuditData = results; 

            const rubrosSet = new Set();
            const marcasSet = new Set();
            let discrepanciasCount = 0;
            let totalEvaluados = 0;

            results.forEach(r => {
                totalEvaluados++;
                if (r.diff !== 0) discrepanciasCount++;
                rubrosSet.add(r.rubro);
                marcasSet.add(r.marca);
            });

            const rubroSelect = document.getElementById('auditRubroFilter');
            const marcaSelect = document.getElementById('auditMarcaFilter');
            
            rubroSelect.innerHTML = '<option value="">Todos los Rubros</option>' + 
                                    [...rubrosSet].sort().map(r => `<option value="${r}">${r}</option>`).join('');
            marcaSelect.innerHTML = '<option value="">Todas las Marcas</option>' + 
                                    [...marcasSet].sort().map(m => `<option value="${m}">${m}</option>`).join('');

            if (discrepanciasCount === 0) {
                summary.className = 'mb-4 p-4 rounded-lg border border-green-300 bg-green-50 text-green-800 flex items-center justify-between shadow-sm';
                summary.innerHTML = `
                    <div>
                        <h3 class="font-black text-lg">✅ Cuadre Perfecto</h3>
                        <p class="text-sm">Se evaluaron ${totalEvaluados} productos. El stock físico coincide exactamente con la matemática.</p>
                    </div>
                `;
            } else {
                summary.className = 'mb-4 p-4 rounded-lg border border-red-300 bg-red-50 text-red-800 shadow-sm';
                summary.innerHTML = `
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h3 class="font-black text-lg">⚠️ Discrepancias Detectadas (${discrepanciasCount})</h3>
                            <p class="text-sm">El inventario físico no cuadra con las operaciones registradas.</p>
                        </div>
                        <div class="flex gap-2">
                             <button onclick="window.supervisionModule.showBulkCorrectionModal()" class="bg-red-700 text-white px-4 py-2 rounded text-sm font-bold shadow hover:bg-red-800 transition">🛠️ Corrección Masiva</button>
                        </div>
                    </div>
                `;
            }

            document.getElementById('auditFilters').classList.remove('hidden');
            renderAuditTable(); 

            panel.classList.remove('hidden');
            panel.classList.add('flex');
            emptyState.classList.add('hidden');

        } catch (error) {
            console.error("Error ejecutando auditoría:", error);
            emptyState.innerHTML = `<span class="text-red-500 font-bold">Error de Auditoría: ${error.message}</span>`;
        }
    }

    function renderAuditTable() {
        const tbody = document.getElementById('auditTableBody');
        const searchTerm = document.getElementById('auditSearchInput').value.toLowerCase();
        const filterRubro = document.getElementById('auditRubroFilter').value;
        const filterMarca = document.getElementById('auditMarcaFilter').value;
        const onlyErrors = document.getElementById('auditOnlyErrors').checked;

        let filtered = _lastAuditData.filter(r => {
            if (onlyErrors && r.diff === 0) return false;
            if (filterRubro && r.rubro !== filterRubro) return false;
            if (filterMarca && r.marca !== filterMarca) return false;
            if (searchTerm && !r.presentacion.toLowerCase().includes(searchTerm) && !r.marca.toLowerCase().includes(searchTerm)) return false;
            return true;
        });

        let html = '';
        let currentGroup = null;

        filtered.forEach(r => {
            const rName = (r.rubro || 'SIN RUBRO').toUpperCase();
            const sName = (r.pMaster?.segmento || 'SIN SEGMENTO').toUpperCase();
            const groupName = `${rName} > ${sName}`;

            if (groupName !== currentGroup) {
                currentGroup = groupName;
                html += `
                    <tr class="bg-blue-50/90 border-t border-blue-200">
                        <td colspan="4" class="py-1.5 px-3 font-extrabold text-blue-900 tracking-wide text-[10px] uppercase">
                            📁 ${currentGroup}
                        </td>
                    </tr>
                `;
            }

            let rowClass = 'hover:bg-gray-50';
            let diffHtml = '<span class="text-gray-400 font-bold">OK</span>';
            
            if (r.diff !== 0) {
                const isFaltante = r.diff < 0; 
                rowClass = isFaltante ? 'bg-red-50 hover:bg-red-100' : 'bg-blue-50 hover:bg-blue-100';
                const textColor = isFaltante ? 'text-red-700' : 'text-blue-700';
                const signo = r.diff > 0 ? '+' : '';
                const etiqueta = isFaltante ? 'FALTANTE' : 'SOBRANTE';
                
                const actionBtn = `<button onclick="window.supervisionModule.showCorrectionModal('${r.id}')" class="mt-1.5 text-[10px] bg-white text-indigo-700 border border-indigo-300 px-2 py-0.5 rounded hover:bg-indigo-50 transition font-bold shadow-sm block mx-auto w-full">Corregir</button>`;

                diffHtml = `
                    <div class="${textColor} font-black">
                        ${signo}${r.diff} Und
                        <div class="text-[9px] uppercase">${etiqueta}</div>
                    </div>
                    ${actionBtn}
                `;
            }

            html += `
                <tr class="${rowClass} border-b border-gray-100">
                    <td class="py-2 px-3">
                        <p class="font-bold text-gray-800 text-xs">${r.presentacion}</p>
                        <p class="text-[10px] text-gray-500 uppercase">${r.marca}</p>
                    </td>
                    <td class="py-2 px-3 text-center bg-gray-50 text-xs border-l border-r border-gray-200">
                        ${formatStockStrict(r.teorico, r.pMaster)}
                    </td>
                    <td class="py-2 px-3 text-center text-xs">
                        ${formatStockStrict(r.fisico, r.pMaster)}
                    </td>
                    <td class="py-2 px-3 text-center align-middle border-l border-gray-200">
                        ${diffHtml}
                    </td>
                </tr>
            `;
        });

        if (filtered.length === 0) {
            html = `<tr><td colspan="4" class="text-center py-8 text-gray-500 font-medium">No se encontraron resultados con estos filtros.</td></tr>`;
        }

        tbody.innerHTML = html;
    }

    // =========================================================================
    // LÓGICA DE CORRECCIONES (INDIVIDUAL Y MASIVA)
    // =========================================================================
    window.supervisionModule = {
        showCorrectionModal: function(pId) {
            const item = _lastAuditData.find(r => r.id === pId);
            if (!item) return;

            const diff = item.fisico - item.teorico;

            const html = `
                <div class="text-left">
                    <p class="mb-4 text-sm text-gray-700">Existe una discrepancia en <b>${item.presentacion}</b>.</p>
                    <div class="flex justify-between bg-gray-100 p-3 rounded-lg border border-gray-300 mb-4 text-sm">
                        <div class="text-center w-1/2 border-r border-gray-300">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase">Teórico (Matemática)</span>
                            <span class="text-xl font-black text-gray-800">${item.teorico}</span>
                        </div>
                        <div class="text-center w-1/2">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase">Físico (BD Vendedor)</span>
                            <span class="text-xl font-black text-gray-800">${item.fisico}</span>
                        </div>
                    </div>

                    <p class="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Seleccione la solución a aplicar:</p>

                    <div class="space-y-3">
                        <button onclick="window.supervisionModule.applyCorrection('${pId}', 'TO_TEORICO', ${item.teorico}, ${item.fisico})" class="w-full text-left p-3 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition group">
                            <div class="font-bold text-blue-800 group-hover:text-blue-900">Mantener el Teórico (${item.teorico})</div>
                            <div class="text-xs text-gray-500 mt-1">Sobrescribe la Base de Datos para igualarla a la matemática.</div>
                        </button>

                        <button onclick="window.supervisionModule.applyCorrection('${pId}', 'TO_FISICO', ${item.teorico}, ${item.fisico})" class="w-full text-left p-3 border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-400 transition group">
                            <div class="font-bold text-orange-800 group-hover:text-orange-900">Mantener el Físico (${item.fisico})</div>
                            <div class="text-xs text-gray-500 mt-1">Crea un registro de ajuste de <b class="text-gray-700">${diff > 0 ? '+'+diff : diff} Und</b> en el historial para cuadrar la matemática.</div>
                        </button>
                    </div>
                </div>
            `;

            _showModal('Resolución Individual', html, null, 'Cerrar');
        },
        
        applyCorrection: async function(pId, type, teorico, fisico) {
            const userId = document.getElementById('auditUserSelect').value;
            if (!userId) return;
            const diff = fisico - teorico;

            _showModal('Progreso', 'Aplicando corrección de auditoría...', null, '', null, false);

            try {
                if (type === 'TO_TEORICO') {
                    const invRef = _doc(_db, `artifacts/${_appId}/users/${userId}/inventario`, pId);
                    await _setDoc(invRef, { cantidadUnidades: teorico }, { merge: true });

                } else if (type === 'TO_FISICO') {
                    const corrRef = _doc(_collection(_db, `artifacts/${_appId}/users/${userId}/historial_correcciones`));
                    await _setDoc(corrRef, {
                        fecha: new Date(),
                        usuarioId: _userId,
                        tipoAjuste: 'AUDITORIA_RESOLUCION',
                        detalles: [{
                            productoId: pId,
                            ajusteBase: diff,
                            nota: 'Ajuste de cuadre en auditoría (Físico manda)'
                        }]
                    });
                }

                await executeAudit();
                setTimeout(() => _showModal('Éxito', 'Corrección aplicada exitosamente.'), 400);

            } catch(e) {
                console.error(e);
                _showModal('Error', 'Fallo al corregir: ' + e.message);
            }
        },

        showBulkCorrectionModal: function() {
            const errores = _lastAuditData.filter(r => r.diff !== 0);
            if (errores.length === 0) return;

            const html = `
                <div class="text-left">
                    <p class="mb-4 text-sm text-gray-700">Se han detectado <b>${errores.length} productos</b> con diferencias entre la matemática y la base de datos.</p>
                    
                    <div class="space-y-3">
                        <button onclick="window.supervisionModule.applyBulkCorrection('TO_TEORICO')" class="w-full text-left p-3 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition group">
                            <div class="font-bold text-blue-800 group-hover:text-blue-900">Mantener el Teórico en Todos (La Matemática Manda)</div>
                            <div class="text-xs text-gray-500 mt-1">Se sobrescribirá el stock de la base de datos de los ${errores.length} productos para igualarlos a la matemática del sistema.</div>
                        </button>

                        <button onclick="window.supervisionModule.applyBulkCorrection('TO_FISICO')" class="w-full text-left p-3 border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-400 transition group">
                            <div class="font-bold text-orange-800 group-hover:text-orange-900">Mantener el Físico en Todos (La Realidad Manda)</div>
                            <div class="text-xs text-gray-500 mt-1">Se creará un único registro maestro de ajuste en el historial que justificará las diferencias de estos ${errores.length} productos.</div>
                        </button>
                    </div>
                </div>
            `;
            _showModal('Corrección Masiva de Errores', html, null, 'Cancelar');
        },

        applyBulkCorrection: async function(type) {
            const userId = document.getElementById('auditUserSelect').value;
            if (!userId) return;

            const errores = _lastAuditData.filter(r => r.diff !== 0);
            if (errores.length === 0) return;

            _showModal('Progreso', 'Aplicando corrección masiva en lote...', null, '', null, false);

            try {
                let batch = _writeBatch(_db);
                let ops = 0;

                if (type === 'TO_TEORICO') {
                    for (const item of errores) {
                        const invRef = _doc(_db, `artifacts/${_appId}/users/${userId}/inventario`, item.id);
                        batch.set(invRef, { cantidadUnidades: item.teorico }, { merge: true });
                        ops++;
                        if (ops >= 400) { await batch.commit(); batch = _writeBatch(_db); ops = 0; }
                    }
                    if (ops > 0) await batch.commit();

                } else if (type === 'TO_FISICO') {
                    const detalles = errores.map(item => ({
                        productoId: item.id,
                        ajusteBase: item.diff,
                        nota: 'Ajuste masivo de cuadre en auditoría'
                    }));

                    const corrRef = _doc(_collection(_db, `artifacts/${_appId}/users/${userId}/historial_correcciones`));
                    batch.set(corrRef, {
                        fecha: new Date(),
                        usuarioId: _userId,
                        tipoAjuste: 'AUDITORIA_RESOLUCION_MASIVA',
                        detalles: detalles
                    });
                    await batch.commit();
                }

                await executeAudit();
                setTimeout(() => _showModal('Éxito', 'Corrección masiva aplicada exitosamente.'), 400);

            } catch(e) {
                console.error(e);
                _showModal('Error', 'Fallo al corregir en lote: ' + e.message);
            }
        }
    };

})();

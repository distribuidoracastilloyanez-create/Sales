(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _getDoc, _query, _where, _doc, _setDoc;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    let _usersCache = [];
    let _masterMapCache = {};

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

        console.log("Módulo Supervisión Inicializado con Gestor de Snapshots.");
    };

    async function loadMasterCatalog() {
        if (Object.keys(_masterMapCache).length > 0) return _masterMapCache;
        const masterRef = _collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`);
        const snap = await _getDocs(masterRef);
        _masterMapCache = {};
        snap.forEach(d => { _masterMapCache[d.id] = d.data(); });
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
                                <span class="text-xl">⚖️</span> Auditoría de Cuadre (Pre-Cierre)
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
    // VISTA 1: VENTAS EN VIVO (ACTUALES NO CERRADAS)
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
                emptyState.innerHTML = '<span class="text-gray-500 font-bold">El vendedor no tiene facturas ni obsequios activos (sin cerrar) en este momento.</span>';
                return;
            }

            operaciones.sort((a, b) => b.fecha - a.fecha); // Más recientes primero

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
    // VISTA 2: AUDITORÍA DE CUADRE Y GESTIÓN DE SNAPSHOTS
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
                                <p class="text-xs text-gray-500 font-medium mt-1">Compara el Stock Matemático (Teórico) vs la Base de Datos (Físico)</p>
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
                                <button id="btnVerSnapshot" class="flex-1 bg-white text-blue-700 border border-blue-300 px-4 py-2 rounded-md text-xs font-bold hover:bg-blue-50 shadow-sm transition">👁️ Ver Carga Inicial Actual</button>
                                <button id="btnFijarSnapshot" class="flex-1 bg-white text-orange-700 border border-orange-300 px-4 py-2 rounded-md text-xs font-bold hover:bg-orange-50 shadow-sm transition">📸 Fijar Nuevo Punto de Partida</button>
                            </div>
                        </div>

                        <div id="auditResultsPanel" class="hidden flex-col flex-grow overflow-hidden">
                            <div id="auditSummary" class="mb-4 p-4 rounded-lg border"></div>
                            
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
        
        // Asignación de los nuevos botones de Snapshot
        document.getElementById('btnVerSnapshot').addEventListener('click', handleViewSnapshot);
        document.getElementById('btnFijarSnapshot').addEventListener('click', handleCreateSnapshot);
    }

    // Formateador estricto visual
    function formatStockStrict(baseUnits, pMaster) {
        if (baseUnits === 0) return `<span class="text-gray-400">0</span>`;
        const vPor = pMaster.ventaPor || {und: true};
        
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

    // --- 1. Crear Nuevo Snapshot Matemáticamente Perfecto ---
    async function handleCreateSnapshot() {
        const userId = document.getElementById('auditUserSelect').value;
        if (!userId) { _showModal('Error', 'Seleccione un vendedor primero.'); return; }
        
        _showModal('Fijar Punto de Partida', `¿Desea fijar el inventario actual como el nuevo Punto de Partida (Carga Inicial)?<br><br>
            <span class="text-sm text-gray-600">Esto tomará el stock físico actual y le sumará las ventas/obsequios activos para cuadrar la matemática perfectamente si el vendedor está en medio de su jornada.</span>`, 
            async () => {
                _showModal('Progreso', 'Calculando y guardando Punto de Partida...', null, '', null, false);
                try {
                    await loadMasterCatalog();

                    // 1. Obtener Inventario Físico (Lo que hay ahora en la BD)
                    const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/inventario`));
                    const baseStock = new Map();
                    invSnap.docs.forEach(d => baseStock.set(d.id, d.data().cantidadUnidades || 0));

                    // 2. Obtener Ventas Activas (Se devuelven al teórico inicial)
                    const vSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/ventas`));
                    const ventas = vSnap.docs.map(d => d.data());

                    ventas.forEach(v => {
                        (v.productos || []).forEach(p => {
                            baseStock.set(p.id, (baseStock.get(p.id) || 0) + (p.totalUnidadesVendidas || 0));
                        });
                    });

                    // 3. Obtener Obsequios Activos (Se devuelven al teórico inicial)
                    const oSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/obsequios_entregados`));
                    const obsequios = oSnap.docs.map(d => d.data());

                    obsequios.forEach(o => {
                        const pMaster = _masterMapCache[o.productoId] || { unidadesPorCaja: 1 };
                        const uRegaladas = (o.cantidadCajas || 0) * (pMaster.unidadesPorCaja || 1);
                        baseStock.set(o.productoId, (baseStock.get(o.productoId) || 0) + uRegaladas);
                    });

                    // 4. Construir Array del Snapshot final y guardarlo
                    const snapshotArray = [];
                    baseStock.forEach((qty, pId) => {
                        if (qty > 0) {
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

                    const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${userId}/config/cargaInicialSnapshot`;
                    await _setDoc(_doc(_db, SNAPSHOT_DOC_PATH), {
                        fecha: new Date(),
                        inventario: snapshotArray
                    });

                    _showModal('Éxito', 'Punto de Partida (Carga Inicial) fijado correctamente. Ahora la Auditoría y el Cierre de Ventas se guiarán desde este punto exacto.');
                } catch (err) {
                    console.error(err);
                    _showModal('Error', 'Fallo al fijar el snapshot: ' + err.message);
                }
            }, 'Sí, Fijar Punto de Partida', null, true);
    }

    // --- 2. Ver Snapshot (Carga Inicial) Efectivo Actual ---
    async function handleViewSnapshot() {
        const userId = document.getElementById('auditUserSelect').value;
        if (!userId) { _showModal('Error', 'Seleccione un vendedor primero.'); return; }

        _showModal('Progreso', 'Obteniendo Punto de Partida y calculando ajustes...', null, '', null, false);
        try {
            const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${userId}/config/cargaInicialSnapshot`;
            const snap = await _getDoc(_doc(_db, SNAPSHOT_DOC_PATH));
            
            if (!snap.exists()) {
                _showModal('Aviso', 'No hay ningún Punto de Partida (Carga Inicial) registrado para este vendedor actualmente.');
                return;
            }

            const data = snap.data();
            const fechaCargaInicial = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
            const fechaStr = fechaCargaInicial.toLocaleString('es-ES');
            
            let baseItems = data.inventario || [];

            // --- SUMAR RECARGAS Y CORRECCIONES PARA MOSTRAR LA CARGA EFECTIVA REAL ---
            const rQuery = _query(_collection(_db, `artifacts/${_appId}/users/${userId}/recargas`), _where("fecha", ">=", fechaCargaInicial.toISOString()));
            const rSnap = await _getDocs(rQuery);
            const recargas = rSnap.docs.map(d => d.data());

            const cQuery = _query(_collection(_db, `artifacts/${_appId}/users/${userId}/historial_correcciones`), _where("fecha", ">=", fechaCargaInicial));
            const cSnap = await _getDocs(cQuery);
            const correcciones = cSnap.docs.map(d => d.data());

            const mapaStockEfectivo = new Map();
            baseItems.forEach(item => mapaStockEfectivo.set(item.productoId || item.id, item.cantidadUnidades || 0));

            recargas.forEach(r => {
                (r.detalles || []).forEach(d => {
                    const pId = d.productoId;
                    mapaStockEfectivo.set(pId, (mapaStockEfectivo.get(pId) || 0) + (d.diferenciaUnidades || 0));
                });
            });

            correcciones.forEach(c => {
                if (c.tipoAjuste === 'LIMPIEZA_PROFUNDA') return;
                (c.detalles || []).forEach(d => {
                    const ajuste = d.ajusteBase !== undefined ? d.ajusteBase : (d.ajuste || 0);
                    if (d.productoId && d.productoId !== 'ALL') {
                        mapaStockEfectivo.set(d.productoId, (mapaStockEfectivo.get(d.productoId) || 0) + ajuste);
                    }
                });
            });

            await loadMasterCatalog();
            
            let items = [];
            mapaStockEfectivo.forEach((qty, pId) => {
                if (qty > 0) {
                    const pMaster = _masterMapCache[pId] || {};
                    items.push({
                        id: pId,
                        presentacion: pMaster.presentacion || 'Desconocido',
                        rubro: pMaster.rubro || 'SIN RUBRO',
                        segmento: pMaster.segmento || 'SIN SEGMENTO',
                        marca: pMaster.marca || 'S/M',
                        cantidadUnidades: qty,
                        ordenSegmento: pMaster.ordenSegmento ?? 9999,
                        ordenMarca: pMaster.ordenMarca ?? 9999,
                        ordenProducto: pMaster.ordenProducto ?? 9999,
                        pMaster: pMaster
                    });
                }
            });

            if (items.length === 0) {
                _showModal('Aviso', `El Punto de Partida Efectivo está vacío (0 productos).<br><br>Fecha del registro base: <b>${fechaStr}</b>`);
                return;
            }

            // Aplicar el mismo ordenamiento estricto de inventario.js
            if (window.getGlobalProductSortFunction) {
                const sortFn = await window.getGlobalProductSortFunction();
                items.sort(sortFn);
            } else {
                items.sort((a,b) => (a.presentacion || '').localeCompare(b.presentacion || ''));
            }

            let html = '';
            let currentGroup = null;

            items.forEach(p => {
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

            const modalHtml = `
                <div class="text-left">
                    <p class="text-sm text-gray-600 mb-4 bg-gray-100 p-2 rounded border border-gray-200">
                        Fecha del registro base: <br><b class="text-blue-700">${fechaStr}</b>
                        <br><span class="text-xs text-gray-500">(Incluye recargas y correcciones posteriores)</span>
                    </p>
                    <div class="max-h-[50vh] overflow-y-auto border border-gray-300 rounded-lg shadow-inner bg-white">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-800 text-white sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th class="py-2 px-3 text-left font-semibold">Producto</th>
                                    <th class="py-2 px-3 text-right font-semibold">Carga Efectiva</th>
                                </tr>
                            </thead>
                            <tbody>${html}</tbody>
                        </table>
                    </div>
                </div>
            `;

            _showModal('Carga Inicial Efectiva', modalHtml, null, 'Cerrar');

        } catch (err) {
            console.error(err);
            _showModal('Error', 'Fallo al obtener el snapshot: ' + err.message);
        }
    }

    // --- 3. Ejecución principal de Auditoría ---
    async function executeAudit() {
        const userId = document.getElementById('auditUserSelect').value;
        const panel = document.getElementById('auditResultsPanel');
        const emptyState = document.getElementById('auditEmptyState');
        const tbody = document.getElementById('auditTableBody');
        const summary = document.getElementById('auditSummary');

        if (!userId) { _showModal('Error', 'Seleccione un vendedor.'); return; }

        emptyState.innerHTML = '<span class="animate-pulse font-bold text-red-600">Calculando el algoritmo de auditoría...</span>';
        emptyState.classList.remove('hidden');
        panel.classList.add('hidden');
        panel.classList.remove('flex');
        tbody.innerHTML = '';

        try {
            const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${userId}/config/cargaInicialSnapshot`;
            let cargaInicialInventario = [];
            let fechaCargaInicial = null;
            
            const snapshotDoc = await _getDoc(_doc(_db, SNAPSHOT_DOC_PATH));
            if (snapshotDoc.exists()) {
                const data = snapshotDoc.data();
                cargaInicialInventario = data.inventario || [];
                fechaCargaInicial = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
            } else {
                emptyState.innerHTML = `
                    <div class="text-center p-4">
                        <p class="text-red-500 font-bold mb-2">El vendedor no tiene un Cierre Previo (Carga Inicial) registrado.</p>
                        <p class="text-sm text-gray-500 mb-6">No se puede auditar de forma precisa sin un punto de partida.</p>
                        <button onclick="document.getElementById('btnFijarSnapshot').click()" class="bg-orange-600 text-white px-5 py-2.5 rounded-lg shadow-md hover:bg-orange-700 font-bold text-sm transition transform hover:scale-105">📸 Generar Punto de Partida Ahora</button>
                    </div>
                `;
                return;
            }

            const [vSnap, oSnap, iSnap] = await Promise.all([
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/ventas`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/obsequios_entregados`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/inventario`)) // FÍSICO ACTUAL
            ]);

            const ventas = vSnap.docs.map(d => d.data());
            const obsequios = oSnap.docs.map(d => d.data());
            const inventarioActualMap = new Map(iSnap.docs.map(d => [d.id, d.data().cantidadUnidades || 0]));

            const rQuery = _query(_collection(_db, `artifacts/${_appId}/users/${userId}/recargas`), _where("fecha", ">=", fechaCargaInicial.toISOString()));
            const rSnap = await _getDocs(rQuery);
            const recargas = rSnap.docs.map(d => d.data());

            const cQuery = _query(_collection(_db, `artifacts/${_appId}/users/${userId}/historial_correcciones`), _where("fecha", ">=", fechaCargaInicial));
            const cSnap = await _getDocs(cQuery);
            const correcciones = cSnap.docs.map(d => d.data());

            const mapaStockTeorico = new Map(); 
            const masterMapLocal = new Map(Object.values(_masterMapCache).map(p => [p.id, p])); 
            
            cargaInicialInventario.forEach(item => {
                const pId = item.productoId || item.id;
                mapaStockTeorico.set(pId, item.cantidadUnidades || 0);
            });

            recargas.forEach(r => {
                (r.detalles || []).forEach(d => {
                    const pId = d.productoId;
                    mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) + (d.diferenciaUnidades || 0));
                });
            });

            correcciones.forEach(c => {
                if (c.tipoAjuste === 'LIMPIEZA_PROFUNDA') return; 
                (c.detalles || []).forEach(d => {
                    const ajuste = d.ajusteBase !== undefined ? d.ajusteBase : (d.ajuste || 0);
                    if (d.productoId && d.productoId !== 'ALL') {
                        mapaStockTeorico.set(d.productoId, (mapaStockTeorico.get(d.productoId) || 0) + ajuste);
                    }
                });
            });

            ventas.forEach(v => {
                (v.productos || []).forEach(vp => {
                    const pId = vp.id;
                    mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) - (vp.totalUnidadesVendidas || 0));
                });
            });

            obsequios.forEach(o => {
                const pId = o.productoId;
                const pMaster = masterMapLocal.get(pId) || { unidadesPorCaja: 1 };
                const uRegaladas = (o.cantidadCajas || 0) * (pMaster.unidadesPorCaja || 1);
                mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) - uRegaladas);
            });

            let html = '';
            let discrepanciasCount = 0;
            let totalEvaluados = 0;

            const allIdsSet = new Set([...mapaStockTeorico.keys(), ...inventarioActualMap.keys()]);
            const results = [];

            allIdsSet.forEach(pId => {
                const teorico = mapaStockTeorico.get(pId) || 0;
                const fisico = inventarioActualMap.get(pId) || 0;
                
                if (teorico === 0 && fisico === 0) return;

                const pMaster = masterMapLocal.get(pId) || { presentacion: 'Producto Desconocido' };
                const diff = fisico - teorico;

                results.push({
                    id: pId,
                    presentacion: pMaster.presentacion,
                    marca: pMaster.marca || 'S/M',
                    teorico,
                    fisico,
                    diff,
                    pMaster
                });
            });

            results.sort((a, b) => a.presentacion.localeCompare(b.presentacion));

            results.forEach(r => {
                totalEvaluados++;
                let rowClass = 'hover:bg-gray-50';
                let diffHtml = '<span class="text-gray-400 font-bold">OK</span>';
                
                if (r.diff !== 0) {
                    discrepanciasCount++;
                    const isFaltante = r.diff < 0; 
                    rowClass = isFaltante ? 'bg-red-50 hover:bg-red-100' : 'bg-blue-50 hover:bg-blue-100';
                    const textColor = isFaltante ? 'text-red-700' : 'text-blue-700';
                    const signo = r.diff > 0 ? '+' : '';
                    const etiqueta = isFaltante ? 'FALTANTE' : 'SOBRANTE';
                    
                    diffHtml = `
                        <div class="${textColor} font-black">
                            ${signo}${r.diff} Und
                            <div class="text-[9px] uppercase">${etiqueta}</div>
                        </div>
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

            tbody.innerHTML = html;

            if (discrepanciasCount === 0) {
                summary.className = 'mb-4 p-4 rounded-lg border border-green-300 bg-green-50 text-green-800 flex items-center justify-between shadow-sm';
                summary.innerHTML = `
                    <div>
                        <h3 class="font-black text-lg">✅ Cuadre Perfecto</h3>
                        <p class="text-sm">Se evaluaron ${totalEvaluados} productos. El stock físico coincide exactamente con la matemática.</p>
                    </div>
                `;
            } else {
                summary.className = 'mb-4 p-4 rounded-lg border border-red-300 bg-red-50 text-red-800 flex items-center justify-between shadow-sm';
                summary.innerHTML = `
                    <div>
                        <h3 class="font-black text-lg">⚠️ Discrepancias Detectadas (${discrepanciasCount})</h3>
                        <p class="text-sm">El inventario físico no cuadra con las operaciones registradas. Revise las filas resaltadas.</p>
                    </div>
                `;
            }

            panel.classList.remove('hidden');
            panel.classList.add('flex');
            emptyState.classList.add('hidden');

        } catch (error) {
            console.error("Error ejecutando auditoría:", error);
            emptyState.innerHTML = `<span class="text-red-500 font-bold">Error de Auditoría: ${error.message}</span>`;
        }
    }

})();

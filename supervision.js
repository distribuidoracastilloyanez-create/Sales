(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _getDoc, _query, _where, _doc;

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
        _query = dependencies.query;
        _where = dependencies.where;
        _doc = dependencies.doc;

        console.log("Módulo Supervisión Inicializado.");
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
    // VISTA 2: AUDITORÍA DE CUADRE (TEÓRICO VS FÍSICO)
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

                        <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-4 items-end">
                            <div class="flex-grow">
                                <label class="block text-xs font-bold text-red-800 mb-1 uppercase tracking-wider">Seleccione Vendedor para Auditar:</label>
                                <select id="auditUserSelect" class="w-full border border-red-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white">
                                    <option value="">-- Seleccione un vendedor --</option>
                                    ${_usersCache.map(u => `<option value="${u.id}">${u.nombre || ''} ${u.apellido || ''} (${u.email})</option>`).join('')}
                                </select>
                            </div>
                            <button id="btnEjecutarAuditoria" class="bg-red-600 text-white px-6 py-2 rounded-md font-bold hover:bg-red-700 shadow transition">Auditar Ahora</button>
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
    }

    // Helper interno para formatear visualmente el stock (Misma matemática que inventario.js)
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
            // 1. Obtener Carga Inicial Snapshot
            const SNAPSHOT_DOC_PATH = `artifacts/${_appId}/users/${userId}/config/cargaInicialSnapshot`;
            let cargaInicialInventario = [];
            let fechaCargaInicial = null;
            
            const snapshotDoc = await _getDoc(_doc(_db, SNAPSHOT_DOC_PATH));
            if (snapshotDoc.exists()) {
                const data = snapshotDoc.data();
                cargaInicialInventario = data.inventario || [];
                fechaCargaInicial = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
            } else {
                emptyState.innerHTML = '<span class="text-red-500 font-bold">El vendedor no tiene un Cierre Previo (Carga Inicial) registrado. No se puede auditar.</span>';
                return;
            }

            // 2. Obtener Ventas, Obsequios y Recargas
            const [vSnap, oSnap, iSnap] = await Promise.all([
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/ventas`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/obsequios_entregados`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${userId}/inventario`)) // FÍSICO ACTUAL
            ]);

            const ventas = vSnap.docs.map(d => d.data());
            const obsequios = oSnap.docs.map(d => d.data());
            const inventarioActualMap = new Map(iSnap.docs.map(d => [d.id, d.data().cantidadUnidades || 0]));

            // Recargas (solo las creadas después del snapshot)
            const rQuery = _query(_collection(_db, `artifacts/${_appId}/users/${userId}/recargas`), _where("fecha", ">=", fechaCargaInicial.toISOString()));
            const rSnap = await _getDocs(rQuery);
            const recargas = rSnap.docs.map(d => d.data());

            // 3. MATEMÁTICA: STOCK TEÓRICO
            const mapaStockTeorico = new Map(); 
            
            // A. Sumar Inicial
            cargaInicialInventario.forEach(item => {
                const pId = item.productoId || item.id;
                mapaStockTeorico.set(pId, item.cantidadUnidades || 0);
            });

            // B. Sumar Recargas
            recargas.forEach(r => {
                (r.detalles || []).forEach(d => {
                    const pId = d.productoId;
                    mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) + (d.diferenciaUnidades || 0));
                });
            });

            // C. Restar Ventas
            ventas.forEach(v => {
                (v.productos || []).forEach(vp => {
                    const pId = vp.id;
                    mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) - (vp.totalUnidadesVendidas || 0));
                });
            });

            // D. Restar Obsequios
            obsequios.forEach(o => {
                const pId = o.productoId;
                const pMaster = _masterMapCache[pId] || { unidadesPorCaja: 1 };
                const uRegaladas = (o.cantidadCajas || 0) * (pMaster.unidadesPorCaja || 1);
                mapaStockTeorico.set(pId, (mapaStockTeorico.get(pId) || 0) - uRegaladas);
            });

            // 4. COMPARACIÓN Y RENDERIZADO
            let html = '';
            let discrepanciasCount = 0;
            let totalEvaluados = 0;

            // Recopilar todos los IDs que existen ya sea en el Teórico o en el Físico
            const allIdsSet = new Set([...mapaStockTeorico.keys(), ...inventarioActualMap.keys()]);
            const results = [];

            allIdsSet.forEach(pId => {
                const teorico = mapaStockTeorico.get(pId) || 0;
                const fisico = inventarioActualMap.get(pId) || 0;
                
                // Si ambos son cero, no vale la pena mostrarlo para no saturar la tabla
                if (teorico === 0 && fisico === 0) return;

                const pMaster = _masterMapCache[pId] || {};
                const presentacion = pMaster.presentacion || 'Desconocido';
                const diff = fisico - teorico;

                results.push({
                    id: pId,
                    presentacion,
                    marca: pMaster.marca || 'S/M',
                    teorico,
                    fisico,
                    diff,
                    pMaster
                });
            });

            // Ordenamiento por nombre
            results.sort((a, b) => a.presentacion.localeCompare(b.presentacion));

            results.forEach(r => {
                totalEvaluados++;
                let rowClass = 'hover:bg-gray-50';
                let diffHtml = '<span class="text-gray-400 font-bold">OK</span>';
                
                if (r.diff !== 0) {
                    discrepanciasCount++;
                    const isFaltante = r.diff < 0; // Físico es menor que teórico -> Faltan productos
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

            // Update Summary
            if (discrepanciasCount === 0) {
                summary.className = 'mb-4 p-4 rounded-lg border border-green-300 bg-green-50 text-green-800 flex items-center justify-between';
                summary.innerHTML = `
                    <div>
                        <h3 class="font-black text-lg">✅ Cuadre Perfecto</h3>
                        <p class="text-sm">Se evaluaron ${totalEvaluados} productos. El stock físico coincide exactamente con la matemática.</p>
                    </div>
                `;
            } else {
                summary.className = 'mb-4 p-4 rounded-lg border border-red-300 bg-red-50 text-red-800 flex items-center justify-between';
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

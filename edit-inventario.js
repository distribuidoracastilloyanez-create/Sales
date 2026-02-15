(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _populateDropdown;
    let _collection, _doc, _getDocs, _getDoc, _query, _where, _runTransaction, _addDoc, _orderBy, _limit;

    let _usersCache = [];
    let _targetInventoryCache = [];
    let _correccionActualState = {}; // Almacena cambios: { idProducto: { ajuste: 0, observacion: '' } }

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

        if (!_runTransaction) console.error("Error Crítico: 'runTransaction' no disponible en initEditInventario.");
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
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Corrección de Inventario</h1>
                        <p class="text-gray-600 mb-6 text-sm">Ajuste manual de stock por pérdidas, daños o auditoría.</p>
                        <div class="space-y-4">
                            <button id="btnNuevaCorreccion" class="w-full px-6 py-3 bg-yellow-600 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-700 transition">
                                Realizar Nueva Corrección
                            </button>
                            <button id="btnVerHistorial" class="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition">
                                Ver Historial de Cambios
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
        document.getElementById('btnVerHistorial').addEventListener('click', showHistorialView);
        document.getElementById('btnVolverMenu').addEventListener('click', _showMainMenu);
    };

    // --- VISTA 1: SELECCIÓN DE USUARIO ---
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
            const q = _query(usersRef, _where('role', '==', 'user')); // Solo vendedores
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

    // --- VISTA 2: TABLA DE EDICIÓN ---
    async function loadUserInventory(targetUser) {
        _showModal('Cargando', `Obteniendo inventario de ${targetUser.email}...`, null, '', null, false);
        _correccionActualState = {}; // Reset

        try {
            const invRef = _collection(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`);
            const snap = await _getDocs(invRef);
            _targetInventoryCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Ordenar alfabéticamente
            _targetInventoryCache.sort((a, b) => (a.presentacion || '').localeCompare(b.presentacion || ''));

            renderCorrectionTable(targetUser);
            document.getElementById('modalContainer').classList.add('hidden');

        } catch (e) {
            console.error(e);
            _showModal('Error', 'No se pudo cargar el inventario.');
        }
    }

    function renderCorrectionTable(targetUser) {
        _mainContent.innerHTML = `
            <div class="p-4 h-screen flex flex-col">
                <div class="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden">
                    
                    <div class="flex justify-between items-center mb-4">
                        <div>
                            <h2 class="text-xl font-bold text-gray-800">Corregir Inventario</h2>
                            <p class="text-sm text-gray-600">Usuario: <span class="font-bold text-blue-600">${targetUser.email}</span></p>
                        </div>
                        <div class="flex gap-2">
                            <button id="btnApplyCorrections" class="px-4 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700">
                                Guardar Cambios
                            </button>
                            <button id="btnCancelCorrection" class="px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500">
                                Cancelar
                            </button>
                        </div>
                    </div>

                    <div class="flex-grow overflow-auto border rounded-lg bg-gray-50">
                        <table class="min-w-full bg-white text-sm">
                            <thead class="bg-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th class="py-2 px-3 text-left font-semibold text-gray-700">Producto</th>
                                    <th class="py-2 px-3 text-center font-semibold text-gray-700 w-24">Stock Actual</th>
                                    <th class="py-2 px-3 text-center font-semibold text-gray-700 w-32">Ajuste (+/-)</th>
                                    <th class="py-2 px-3 text-left font-semibold text-gray-700">Observación (Obligatoria si hay ajuste)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${_targetInventoryCache.map(p => {
                                    // Visualización amigable del stock
                                    let stockDisplay = `${p.cantidadUnidades || 0}`;
                                    if (p.ventaPor?.cj && p.unidadesPorCaja > 1) {
                                        const cjas = Math.floor((p.cantidadUnidades || 0) / p.unidadesPorCaja);
                                        const resto = (p.cantidadUnidades || 0) % p.unidadesPorCaja;
                                        stockDisplay = `${cjas} Cj + ${resto} und`;
                                    }

                                    return `
                                    <tr class="hover:bg-gray-50 transition-colors">
                                        <td class="py-2 px-3">
                                            <div class="font-medium text-gray-800">${p.presentacion}</div>
                                            <div class="text-xs text-gray-500">${p.marca}</div>
                                        </td>
                                        <td class="py-2 px-3 text-center font-mono text-blue-700 bg-gray-50">
                                            ${stockDisplay}
                                        </td>
                                        <td class="py-2 px-3 text-center">
                                            <input type="number" 
                                                data-pid="${p.id}"
                                                class="correction-input w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-yellow-500 text-center font-bold"
                                                placeholder="0">
                                        </td>
                                        <td class="py-2 px-3">
                                            <input type="text" 
                                                data-pid="${p.id}-obs"
                                                class="observation-input w-full px-2 py-1 border border-gray-300 rounded focus:ring-blue-500"
                                                placeholder="Ej: Dañado en almacén...">
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnCancelCorrection').addEventListener('click', showUserSelectionView);
        document.getElementById('btnApplyCorrections').addEventListener('click', () => handleSaveCorrections(targetUser));

        // Listeners para capturar estado
        document.querySelectorAll('.correction-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const pid = e.target.dataset.pid;
                if (!_correccionActualState[pid]) _correccionActualState[pid] = { ajuste: 0, observacion: '' };
                _correccionActualState[pid].ajuste = parseInt(e.target.value) || 0;
            });
        });

        document.querySelectorAll('.observation-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const pid = e.target.dataset.pid.replace('-obs', '');
                if (!_correccionActualState[pid]) _correccionActualState[pid] = { ajuste: 0, observacion: '' };
                _correccionActualState[pid].observacion = e.target.value.trim();
            });
        });
    }

    async function handleSaveCorrections(targetUser) {
        // Filtrar solo los que tienen ajuste != 0
        const changes = Object.entries(_correccionActualState)
            .filter(([pid, data]) => data.ajuste !== 0)
            .map(([pid, data]) => ({
                pid,
                ...data,
                prod: _targetInventoryCache.find(p => p.id === pid)
            }));

        if (changes.length === 0) {
            _showModal('Aviso', 'No hay ajustes para guardar (todos son 0).');
            return;
        }

        // Validar observaciones
        const missingObs = changes.some(c => !c.observacion || c.observacion.length < 3);
        if (missingObs) {
            _showModal('Validación', 'Por favor, ingrese una observación válida para CADA producto que tenga un ajuste.');
            return;
        }

        _showModal('Confirmar', `Se ajustarán ${changes.length} productos del inventario de ${targetUser.email}. ¿Continuar?`, async () => {
            _showModal('Progreso', 'Aplicando correcciones...', null, '', null, false);
            
            try {
                // Usamos Transacción para asegurar consistencia y logs
                await _runTransaction(_db, async (transaction) => {
                    const logRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/historial_correcciones`));
                    const fecha = new Date();
                    
                    const detallesLog = [];

                    for (const item of changes) {
                        const invRef = _doc(_db, `artifacts/${_appId}/users/${targetUser.id}/inventario`, item.pid);
                        const invDoc = await transaction.get(invRef);
                        
                        if (!invDoc.exists()) throw new Error(`El producto ${item.prod.presentacion} ya no existe.`);

                        const currentStock = invDoc.data().cantidadUnidades || 0;
                        const newStock = currentStock + item.ajuste;

                        if (newStock < 0) throw new Error(`El ajuste para ${item.prod.presentacion} resulta en stock negativo (${newStock}).`);

                        // 1. Actualizar Inventario
                        transaction.update(invRef, { cantidadUnidades: newStock });

                        // 2. Preparar Log
                        detallesLog.push({
                            productoId: item.pid,
                            presentacion: item.prod.presentacion,
                            marca: item.prod.marca,
                            stockAnterior: currentStock,
                            ajuste: item.ajuste,
                            stockNuevo: newStock,
                            observacion: item.observacion
                        });
                    }

                    // 3. Guardar Log General
                    transaction.set(logRef, {
                        fecha: fecha,
                        adminId: _userId,
                        targetUserId: targetUser.id,
                        targetUserEmail: targetUser.email,
                        totalItemsAfectados: changes.length,
                        detalles: detallesLog
                    });
                });

                _showModal('Éxito', 'Correcciones aplicadas y registradas correctamente.', showEditInventarioMenu);

            } catch (error) {
                console.error(error);
                _showModal('Error', `Falló la corrección: ${error.message}`);
            }
        }, 'Sí, Aplicar', null, true);
    }

    // --- VISTA 3: HISTORIAL ---
    async function showHistorialView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            <h2 class="text-2xl font-bold text-gray-800">Historial de Correcciones</h2>
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
            // Limitar a los ultimos 50 para no saturar UI, ordenados por fecha desc
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

            // Guardar logs en caché temporal para exportación si se desea
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

            // Estilos Header
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
                    
                    // Colorear ajuste
                    if (d.ajuste < 0) row.getCell('ajuste').font = { color: { argb: 'FFFF0000' } }; // Rojo
                    else row.getCell('ajuste').font = { color: { argb: 'FF008000' } }; // Verde
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Historial_Correcciones_${new Date().toISOString().slice(0,10)}.xlsx`;
            link.click();

            const m = document.getElementById('modalContainer');
            if (m) m.classList.add('hidden');

        } catch (e) {
            console.error(e);
            _showModal('Error', 'Falló la exportación a Excel.');
        }
    }

})();

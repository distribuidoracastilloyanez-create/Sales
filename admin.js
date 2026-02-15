(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal;
    let _collection, _getDocs, _doc, _setDoc, _getDoc, _writeBatch, _query, _where, _deleteDoc;
    let limit, startAfter;
    let _obsequioProductId = null;
    let _inventarioParaImportar = [];

    let _segmentoOrderCacheAdmin = null;
    let _rubroOrderCacheAdmin = null;

    window.initAdmin = function(dependencies) {
        if (!dependencies.db || !dependencies.mainContent || !dependencies.showMainMenu || !dependencies.showModal) {
            console.error("Admin Init Error: Faltan dependencias críticas");
            return;
        }
        _db = dependencies.db;
        _userId = dependencies.userId; // ID del Admin
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _doc = dependencies.doc;
        _getDoc = dependencies.getDoc;
        _setDoc = dependencies.setDoc;
        _writeBatch = dependencies.writeBatch;
        _query = dependencies.query;
        _where = dependencies.where;
        _deleteDoc = dependencies.deleteDoc;
        limit = dependencies.limit;
        startAfter = dependencies.startAfter;

        console.log("Módulo Admin inicializado.");
    };

    window.showAdminView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Panel de Administración</h1>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="space-y-4">
                                <h2 class="text-xl font-semibold text-gray-700">Gestión Global</h2>
                                <button id="propagateOrderBtn" class="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition duration-200">
                                    Propagar Orden (Categorías)
                                </button>
                                <button id="fileManagementBtn" class="w-full px-6 py-3 bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700 transition duration-200">
                                    Importar / Exportar Cierres
                                </button>
                            </div>
                            
                            <div class="space-y-4">
                                <h2 class="text-xl font-semibold text-gray-700">Accesos</h2>
                                <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500 transition duration-200">
                                    Volver al Menú Principal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        document.getElementById('propagateOrderBtn').addEventListener('click', showPropagateOrderView);
        document.getElementById('fileManagementBtn').addEventListener('click', showFileManagementView);
    };

    // --- SECCIÓN: IMPORTAR / EXPORTAR ---

    async function showFileManagementView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-4xl">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Gestión de Archivos de Cierres</h1>
                        
                        <div class="flex flex-col md:flex-row gap-8">
                            <!-- EXPORTAR -->
                            <div class="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200">
                                <h2 class="text-xl font-bold text-blue-700 mb-4 flex items-center">
                                    <span class="mr-2">📤</span> Exportar (Backup)
                                </h2>
                                <p class="text-sm text-gray-600 mb-4">Descarga un archivo JSON con todos los datos de los cierres seleccionados. Útil para copias de seguridad.</p>
                                
                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-semibold text-gray-500">Vendedor</label>
                                        <select id="exportUserSelect" class="w-full mt-1 p-2 border rounded text-sm">
                                            <option value="all">Todos los Vendedores</option>
                                            <option disabled>Cargando...</option>
                                        </select>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <label class="block text-xs font-semibold text-gray-500">Desde</label>
                                            <input type="date" id="exportDateFrom" class="w-full mt-1 p-2 border rounded text-sm">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-semibold text-gray-500">Hasta</label>
                                            <input type="date" id="exportDateTo" class="w-full mt-1 p-2 border rounded text-sm">
                                        </div>
                                    </div>
                                    <button id="doExportBtn" class="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                                        Descargar Backup (.json)
                                    </button>
                                </div>
                            </div>

                            <!-- IMPORTAR -->
                            <div class="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200">
                                <h2 class="text-xl font-bold text-green-700 mb-4 flex items-center">
                                    <span class="mr-2">📥</span> Importar / Restaurar
                                </h2>
                                <p class="text-sm text-gray-600 mb-4">Sube un archivo <b>.json</b> (Backup) o archivos <b>.xlsx</b> (Reportes de Cierre) para integrarlos al sistema.</p>
                                
                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-semibold text-gray-500">Archivo(s)</label>
                                        <input type="file" id="importFileInput" multiple accept=".json, .xlsx, .xls" class="w-full mt-1 p-2 border rounded text-sm bg-white">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-gray-500">Asignar a Vendedor (Solo para Excel)</label>
                                        <select id="importTargetUserSelect" class="w-full mt-1 p-2 border rounded text-sm">
                                            <option value="">-- Detectar del Archivo / Actual --</option>
                                        </select>
                                        <p class="text-xs text-gray-400 mt-1">Si se deja vacío, se intenta leer del Excel o usa tu usuario.</p>
                                    </div>
                                    <button id="doImportBtn" class="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium">
                                        Procesar Importación
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="mt-8 text-center">
                            <button id="backToAdminBtn" class="px-6 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToAdminBtn').addEventListener('click', showAdminView);
        document.getElementById('doExportBtn').addEventListener('click', handleExportCierres);
        document.getElementById('doImportBtn').addEventListener('click', handleImportCierres);

        // Set default dates (Current Month)
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date().toISOString().split('T')[0];
        document.getElementById('exportDateFrom').value = firstDay;
        document.getElementById('exportDateTo').value = lastDay;

        // Populate User Selects
        try {
            const usersRef = _collection(_db, "users");
            const snap = await _getDocs(usersRef);
            const users = snap.docs.map(d => ({id: d.id, ...d.data()}));
            
            const populate = (selectId, includeAll) => {
                const sel = document.getElementById(selectId);
                if(!sel) return;
                sel.innerHTML = includeAll ? '<option value="all">Todos los Vendedores</option>' : '<option value="">-- Detectar del Archivo / Actual --</option>';
                users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = `${u.nombre || ''} ${u.apellido || u.email}`;
                    sel.appendChild(opt);
                });
            };

            populate('exportUserSelect', true);
            populate('importTargetUserSelect', false);

        } catch (e) {
            console.error("Error cargando usuarios:", e);
        }
    }

    async function handleExportCierres() {
        const userId = document.getElementById('exportUserSelect').value;
        const dateFrom = document.getElementById('exportDateFrom').value;
        const dateTo = document.getElementById('exportDateTo').value;

        if (!dateFrom || !dateTo) {
            _showModal('Error', 'Seleccione un rango de fechas válido.');
            return;
        }

        _showModal('Progreso', 'Recopilando datos para exportar...');

        try {
            const start = new Date(dateFrom + 'T00:00:00');
            const end = new Date(dateTo + 'T23:59:59');
            let allCierres = [];

            let targetUsers = [];
            if (userId === 'all') {
                const uRef = _collection(_db, "users");
                const uSnap = await _getDocs(uRef);
                targetUsers = uSnap.docs.map(d => d.id);
            } else {
                targetUsers = [userId];
            }

            for (const uid of targetUsers) {
                const cRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                const q = _query(cRef, _where("fecha", ">=", start), _where("fecha", "<=", end));
                const snap = await _getDocs(q);
                
                const userCierres = snap.docs.map(d => {
                    const data = d.data();
                    // Convert Firestore Timestamp to ISO string for JSON
                    if (data.fecha && data.fecha.toDate) {
                        data.fecha = data.fecha.toDate().toISOString();
                    }
                    if (data.fechaModificacion && data.fechaModificacion.toDate) {
                        data.fechaModificacion = data.fechaModificacion.toDate().toISOString();
                    }
                    return {
                        _id: d.id, // Keep ID
                        _userId: uid, // Track owner
                        ...data
                    };
                });
                allCierres = allCierres.concat(userCierres);
            }

            if (allCierres.length === 0) {
                _showModal('Aviso', 'No se encontraron cierres en el rango seleccionado.');
                return;
            }

            // Generate JSON File
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allCierres, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `backup_cierres_${dateFrom}_al_${dateTo}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            _showModal('Éxito', `Exportación completada. ${allCierres.length} registros descargados.`);

        } catch (error) {
            console.error("Export error:", error);
            _showModal('Error', 'Falló la exportación: ' + error.message);
        }
    }

    async function handleImportCierres() {
        const fileInput = document.getElementById('importFileInput');
        const forcedUserId = document.getElementById('importTargetUserSelect').value;
        
        if (fileInput.files.length === 0) {
            _showModal('Error', 'Seleccione al menos un archivo.');
            return;
        }

        const files = Array.from(fileInput.files);
        _showModal('Progreso', `Procesando ${files.length} archivo(s)...`);

        let successCount = 0;
        let errorCount = 0;
        let logs = [];

        for (const file of files) {
            try {
                if (file.name.endsWith('.json')) {
                    const count = await processJsonImport(file);
                    successCount += count;
                    logs.push(`✅ ${file.name}: ${count} registros restaurados.`);
                } else if (file.name.match(/\.xlsx?$/)) {
                    // Importar Excel
                    await processExcelImport(file, forcedUserId);
                    successCount++;
                    logs.push(`✅ ${file.name}: Importado correctamente.`);
                } else {
                    logs.push(`⚠️ ${file.name}: Formato no soportado.`);
                }
            } catch (err) {
                console.error(`Error importing ${file.name}:`, err);
                errorCount++;
                logs.push(`❌ ${file.name}: ${err.message}`);
            }
        }

        const resultHtml = `
            <div class="text-left max-h-60 overflow-y-auto text-sm">
                <p class="mb-2 font-bold">Resultados:</p>
                <ul class="list-disc pl-5 space-y-1">
                    ${logs.map(l => `<li>${l}</li>`).join('')}
                </ul>
            </div>
        `;
        
        // Hide progress modal logic handled by showModal replacing content
        setTimeout(() => {
            _showModal(
                errorCount > 0 ? 'Importación con Errores' : 'Importación Exitosa',
                resultHtml,
                null,
                'Cerrar'
            );
        }, 500);
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }

    async function processJsonImport(file) {
        const text = await readFileAsText(file);
        const data = JSON.parse(text);
        
        if (!Array.isArray(data)) throw new Error("El JSON no es una lista de cierres válida.");

        let count = 0;
        const batchSize = 100; // Firestore limit is 500, keep it safe
        let batch = _writeBatch(_db);
        let ops = 0;

        for (const item of data) {
            if (!item._userId || !item._id) continue; // Skip invalid items

            const uid = item._userId;
            const docId = item._id;
            
            // Clean metadata properties
            const saveId = item._id;
            delete item._id;
            delete item._userId;

            // Fix Dates back to Timestamp
            if (typeof item.fecha === 'string') item.fecha = new Date(item.fecha);
            if (typeof item.fechaModificacion === 'string') item.fechaModificacion = new Date(item.fechaModificacion);

            const docRef = _doc(_db, `artifacts/${_appId}/users/${uid}/cierres`, saveId);
            batch.set(docRef, item, { merge: true });
            ops++;
            count++;

            if (ops >= batchSize) {
                await batch.commit();
                batch = _writeBatch(_db);
                ops = 0;
            }
        }
        if (ops > 0) await batch.commit();
        return count;
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    async function processExcelImport(file, forcedUserId) {
        if (typeof XLSX === 'undefined') throw new Error("Librería SheetJS no cargada.");

        const data = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(data, { type: 'array' });

        // 1. Determinar Usuario y Fecha (del primer sheet de datos)
        // Buscamos un sheet que NO sea de resumen
        const excludedSheets = ['Total Por Cliente', 'Reporte Vacíos', 'Reporte Vacios'];
        const dataSheetName = workbook.SheetNames.find(n => !excludedSheets.includes(n));
        
        if (!dataSheetName) throw new Error("No se encontraron hojas de datos de productos.");

        const firstSheet = workbook.Sheets[dataSheetName];
        
        // Asumimos formato estándar del reporte generado:
        // A1: Fecha (dd/mm/yyyy o similar)
        // A2: Nombre Vendedor
        const cellA1 = firstSheet['A1'] ? firstSheet['A1'].v : null;
        const cellA2 = firstSheet['A2'] ? firstSheet['A2'].v : null;

        if (!cellA1) throw new Error("Celda A1 (Fecha) vacía o inválida.");

        // Parsear Fecha
        let cierreDate;
        // Excel a veces guarda fechas como números seriales
        if (typeof cellA1 === 'number') {
            // Excel serial date to JS Date (rough approximation)
            cierreDate = new Date(Math.round((cellA1 - 25569)*86400*1000));
        } else {
            // String parsing dd/mm/yyyy
            const parts = String(cellA1).split('/');
            if (parts.length === 3) {
                // assume dd/mm/yyyy
                cierreDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
            } else {
                cierreDate = new Date(cellA1); // Try standard parse
            }
        }
        if (isNaN(cierreDate.getTime())) throw new Error(`Fecha inválida en A1: ${cellA1}`);

        // Determinar Target User
        let targetUserId = forcedUserId;
        if (!targetUserId && cellA2) {
            // Intentar buscar usuario por nombre (Fuzzy match simple)
            // Esto es costoso si hay muchos usuarios, pero necesario
            const usersRef = _collection(_db, "users");
            const snap = await _getDocs(usersRef);
            const normalizedExcelName = String(cellA2).toLowerCase().trim();
            
            const found = snap.docs.find(d => {
                const u = d.data();
                const uName = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase().trim();
                return uName.includes(normalizedExcelName) || normalizedExcelName.includes(uName);
            });
            if (found) targetUserId = found.id;
        }
        if (!targetUserId) targetUserId = _userId; // Fallback to current admin

        // Cargar Inventario del Usuario para Matching
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${targetUserId}/inventario`);
        const invSnap = await _getDocs(inventarioRef);
        const inventoryMap = new Map(); // Key: "Segmento|Marca|Presentacion" -> ProductData
        invSnap.docs.forEach(d => {
            const p = d.data();
            const key = `${p.segmento || ''}|${p.marca || ''}|${p.presentacion || ''}`.toUpperCase();
            inventoryMap.set(key, { id: d.id, ...p });
        });

        // Estructuras de datos para el cierre
        let totalCierre = 0;
        const ventasPorCliente = {}; // Map: ClientName -> { total: 0, productos: [], vacios: {} }
        const cargaInicialGlobal = [];
        let vaciosReporte = {};

        // 2. Procesar Hojas de Productos
        for (const sheetName of workbook.SheetNames) {
            if (excludedSheets.includes(sheetName)) continue;

            const sheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(sheet['!ref']);
            
            // Leer filas como array de arrays
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
            
            // Validar estructura mínima
            if (rows.length < 8) continue; 

            // Headers Rows (0-based index in array)
            // Row 2 (Excel 3): Segmento
            // Row 3 (Excel 4): Marca
            // Row 4 (Excel 5): Presentacion
            // Row 5 (Excel 6): Precio
            // Column 0 is Labels, Products start at Col 1
            
            const productCols = [];
            for (let c = 1; c <= range.e.c; c++) {
                const segmento = rows[2][c];
                const marca = rows[3][c];
                const presentacion = rows[4][c];
                const precioRaw = rows[5][c]; // Puede ser string "$1.00" o number

                // Detener si llegamos a "Sub Total"
                if (String(segmento).toLowerCase() === 'sub total' || String(rows[2][c]).toLowerCase().includes('sub total')) break;
                
                if (!presentacion) continue; // Skip empty cols

                // Limpiar precio
                let precio = 0;
                if (typeof precioRaw === 'number') precio = precioRaw;
                else if (typeof precioRaw === 'string') {
                    precio = parseFloat(precioRaw.replace(/[^0-9.]/g, '')) || 0;
                }

                // Match Product ID
                const key = `${segmento || 'S/S'}|${marca || 'S/M'}|${presentacion}`.toUpperCase();
                let productData = inventoryMap.get(key);
                let pid;

                if (productData) {
                    pid = productData.id;
                } else {
                    // Producto no encontrado: Crear un ID ficticio para mantener el dato
                    pid = 'IMPORTED_' + key.replace(/[^A-Z0-9]/g, '');
                    // No lo guardamos en inventario real, solo en el cierre
                    productData = {
                        id: pid,
                        segmento, marca, presentacion,
                        precioPorUnidad: precio,
                        unidadesPorCaja: 1, // Default assumption
                        ventaPor: { und: true },
                        isVirtual: true // Flag
                    };
                }

                productCols[c] = { ...productData, extractedPrice: precio };
            }

            // Buscar fila CARGA INICIAL
            const rowCargaInicialIdx = rows.findIndex(r => r[0] && String(r[0]).toUpperCase() === 'CARGA INICIAL');
            if (rowCargaInicialIdx !== -1) {
                const rowCI = rows[rowCargaInicialIdx];
                productCols.forEach((prod, colIdx) => {
                    if (rowCI[colIdx]) {
                        // Guardar en carga inicial global
                        const val = parseFloat(String(rowCI[colIdx]).split(' ')[0]) || 0; // "30 Unds" -> 30
                        if (val > 0) {
                            cargaInicialGlobal.push({
                                ...prod,
                                cantidadUnidades: val // Simplificación: asume unidades base
                            });
                        }
                    }
                });
            }

            // Procesar Filas de Clientes
            // Empiezan después de carga inicial (aprox row 9 en Excel, idx 8) hasta "CARGA RESTANTE"
            const startRow = rowCargaInicialIdx !== -1 ? rowCargaInicialIdx + 1 : 8;
            
            for (let r = startRow; r < rows.length; r++) {
                const row = rows[r];
                const label = row[0];
                if (!label) continue;
                if (String(label).toUpperCase() === 'CARGA RESTANTE') break;
                if (String(label).toUpperCase() === 'TOTALES') break;

                // Es un cliente
                const clientName = String(label).replace(' (OBSEQUIO)', '').trim();
                const isObsequioRow = String(label).includes('(OBSEQUIO)');

                if (!ventasPorCliente[clientName]) {
                    ventasPorCliente[clientName] = { 
                        clienteNombre: clientName, 
                        productos: [], 
                        total: 0,
                        vaciosDevueltosPorTipo: {} 
                    };
                }

                productCols.forEach((prod, colIdx) => {
                    const qtyRaw = row[colIdx];
                    if (qtyRaw) {
                        const qtyVal = parseFloat(String(qtyRaw).split(' ')[0]) || 0;
                        if (qtyVal > 0) {
                            // Si es obsequio, el precio es 0 para el total
                            const price = isObsequioRow ? 0 : prod.extractedPrice;
                            
                            // Reconstruir estructura de producto vendido
                            // Asumimos venta por unidad por defecto si no podemos deducir caja/paq del Excel
                            // El Excel exporta "value" calculado (ej: 2.5 Cj).
                            // Intentamos respetar eso.
                            const unitText = String(qtyRaw).split(' ')[1] || 'Unds';
                            
                            const itemVenta = {
                                id: prod.id,
                                presentacion: prod.presentacion,
                                marca: prod.marca,
                                segmento: prod.segmento,
                                precios: { und: prod.extractedPrice }, // Guardamos el precio histórico
                                cantidadVendida: { cj:0, paq:0, und:0 },
                                totalUnidadesVendidas: 0,
                                manejaVacios: prod.manejaVacios || false,
                                tipoVacio: prod.tipoVacio || null
                            };

                            if (unitText.toLowerCase().includes('cj')) {
                                itemVenta.cantidadVendida.cj = qtyVal;
                                itemVenta.totalUnidadesVendidas = qtyVal * (prod.unidadesPorCaja || 1);
                            } else if (unitText.toLowerCase().includes('paq')) {
                                itemVenta.cantidadVendida.paq = qtyVal;
                                itemVenta.totalUnidadesVendidas = qtyVal * (prod.unidadesPorPaquete || 1);
                            } else {
                                itemVenta.cantidadVendida.und = qtyVal;
                                itemVenta.totalUnidadesVendidas = qtyVal;
                            }

                            // Subtotal item
                            // Nota: El Excel ya tiene precios calculados, pero recalculamos para consistencia
                            // Si es obsequio, no suma al total monetario
                            if (!isObsequioRow) {
                                ventasPorCliente[clientName].total += (price * qtyVal); // Aproximación (Precio * Cantidad Display)
                            }

                            ventasPorCliente[clientName].productos.push(itemVenta);
                        }
                    }
                });
            }
        }

        // 3. Procesar Hoja de Vacíos
        const vaciosSheetName = workbook.SheetNames.find(n => n.includes('Reporte Vacíos') || n.includes('Vacios'));
        if (vaciosSheetName) {
            const vSheet = workbook.Sheets[vaciosSheetName];
            const vRows = XLSX.utils.sheet_to_json(vSheet); // Array of objects
            // Columns: Client, "Tipo Vacío", Entregados, Devueltos
            vRows.forEach(row => {
                const cli = row['Cliente'] || row['Client'];
                const tipo = row['Tipo Vacío'] || row['Tipo Vacio'];
                const dev = parseFloat(row['Devueltos']) || 0;
                
                if (cli && tipo && dev > 0) {
                    const cleanCli = String(cli).replace(' (OBSEQUIO)', '').trim();
                    if (ventasPorCliente[cleanCli]) {
                        if (!ventasPorCliente[cleanCli].vaciosDevueltosPorTipo[tipo]) {
                            ventasPorCliente[cleanCli].vaciosDevueltosPorTipo[tipo] = 0;
                        }
                        ventasPorCliente[cleanCli].vaciosDevueltosPorTipo[tipo] += dev;
                    }
                }
            });
        }

        // 4. Guardar en Firestore
        // Construir Array de Ventas
        const ventasArray = Object.values(ventasPorCliente).map(v => {
            // Verificar si es solo obsequio (total 0 y tiene productos)
            // En el modelo de datos, los obsequios se separan en un array 'obsequios'
            // O se guardan como venta con total 0. El sistema usa arrays separados 'ventas' y 'obsequios'.
            // Sin embargo, en el Excel están mezclados.
            // Estrategia: Si total > 0 -> Venta. Si total 0 -> Obsequio.
            // Pero un cliente puede tener ambos. La lógica actual de Parsing los unió.
            // Separar es complejo. Guardaremos todo en 'ventas' con total 0 si es obsequio puro, 
            // ya que el sistema soporta ventas de valor 0.
            return v;
        });

        // Calcular Gran Total desde los datos parseados
        totalCierre = ventasArray.reduce((acc, v) => acc + v.total, 0);

        const cierreData = {
            fecha: cierreDate,
            fechaRegistro: new Date(), // Fecha de importación
            vendedorInfo: { userId: targetUserId, note: 'Importado desde Excel' },
            total: parseFloat(totalCierre.toFixed(2)),
            ventas: ventasArray,
            obsequios: [], // Dejamos vacío, asumimos que están en ventas con valor 0
            cargaInicialInventario: cargaInicialGlobal,
            source: 'excel_import'
        };

        // Guardar
        const collRef = _collection(_db, `artifacts/${_appId}/users/${targetUserId}/cierres`);
        await _setDoc(_doc(collRef), cierreData);
    }

    // --- SECCIÓN: PROPAGACIÓN (Lógica Original) ---

    window.adminModule = {
        propagateCategoryChange: async function (collectionName, itemId, newItemData) {
            // ... (Lógica de propagación original se mantiene igual)
            if (_userRole !== 'admin') return; 
            const BATCH_LIMIT = 450; 
            let errors = false;
            _showModal('Progreso', 'Propagando cambios a todos los usuarios...');
            try {
                const usersRef = _collection(_db, "users");
                const snapshot = await _getDocs(usersRef);
                const allUserIds = snapshot.docs.map(doc => doc.id);
                let batch = _writeBatch(_db);
                let operationCount = 0;
                for (const uid of allUserIds) {
                    if (uid === _userId) continue; 
                    const targetDocRef = _doc(_db, `artifacts/${_appId}/users/${uid}/${collectionName}`, itemId);
                    batch.set(targetDocRef, newItemData, { merge: true });
                    operationCount++;
                    if (operationCount >= BATCH_LIMIT) {
                        await batch.commit();
                        batch = _writeBatch(_db);
                        operationCount = 0;
                    }
                }
                if (operationCount > 0) {
                    await batch.commit();
                }
                const modalContainer = document.getElementById('modalContainer');
                if (modalContainer && !modalContainer.classList.contains('hidden') && modalContainer.querySelector('h3')?.textContent.startsWith('Progreso')) {
                    modalContainer.classList.add('hidden');
                }
                console.log(`Propagación de ${collectionName}/${itemId} completada.`);
            } catch (error) {
                console.error(`Error propagando ${collectionName}:`, error);
                errors = true;
                const modalContainer = document.getElementById('modalContainer');
                if (modalContainer && !modalContainer.classList.contains('hidden') && modalContainer.querySelector('h3')?.textContent.startsWith('Progreso')) {
                    modalContainer.classList.add('hidden');
                }
                _showModal('Error', `Error al propagar cambios: ${error.message}`);
            }
        },
        
        propagateOrderChange: async function(collectionName) {
              if (_userRole !== 'admin') return;
              const BATCH_LIMIT = 450; let errors = false; let batch = _writeBatch(_db); let ops = 0;
              _showModal('Progreso', `Propagando orden de ${collectionName}...`);
              try {
                  let oMap = new Map();
                  if(collectionName === 'rubros'){
                      if(!_rubroOrderCacheAdmin){ const rRef=_collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`); const s=await _getDocs(rRef); _rubroOrderCacheAdmin=s.docs.map(d=>({id:d.id, ...d.data()})); }
                      _rubroOrderCacheAdmin.forEach(r => oMap.set(r.id, r.orden));
                  } else if (collectionName === 'segmentos') {
                      if(!_segmentoOrderCacheAdmin){ const sRef=_collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`); const s=await _getDocs(sRef); _segmentoOrderCacheAdmin=s.docs.map(d=>({id:d.id, ...d.data()})); }
                      _segmentoOrderCacheAdmin.forEach(s => oMap.set(s.id, s.orden));
                  }
                  
                  const uRef = _collection(_db, "users"); const uSnap = await _getDocs(uRef);
                  for (const uDoc of uSnap.docs) {
                      const uid = uDoc.id; if(uid===_userId) continue;
                      const tColRef = _collection(_db, `artifacts/${_appId}/users/${uid}/${collectionName}`);
                      const tSnap = await _getDocs(tColRef);
                      let itemsUser = tSnap.docs.map(d => ({ id: d.id, data: d.data() }));
                      let uMaxOrd = 0;
                      itemsUser.forEach(i => uMaxOrd = Math.max(uMaxOrd, i.data.orden || 0));
                      for (const item of itemsUser) { const cOrd = item.data.orden; let nOrd; if (oMap.has(item.id)) { nOrd = oMap.get(item.id); if (cOrd !== nOrd) { const tIRef = _doc(tColRef, item.id); batch.update(tIRef, { orden: nOrd }); ops++; } uMaxOrd = Math.max(uMaxOrd, nOrd); } if (ops >= BATCH_LIMIT) { await batch.commit(); batch = _writeBatch(_db); ops = 0; } }
                      itemsUser.sort((a,b)=> (a.data.name || '').localeCompare(b.data.name || ''));
                      for (const item of itemsUser) { if (!oMap.has(item.id)) { uMaxOrd++; const nOrd = uMaxOrd; const cOrd = item.data.orden; if (cOrd !== nOrd) { const tIRef = _doc(tColRef, item.id); batch.update(tIRef, { orden: nOrd }); ops++; } } if (ops >= BATCH_LIMIT) { await batch.commit(); batch = _writeBatch(_db); ops = 0; } }
                      if (ops > 0) await batch.commit();
                  } const modal = document.getElementById('modalContainer'); if(modal && !modal.classList.contains('hidden') && modal.querySelector('h3')?.textContent.startsWith('Progreso')) modal.classList.add('hidden'); console.log(`Order propagation complete for ${collectionName}.`);
              } catch (error) { errors = true; console.error(`Error propagando...`, error); const modal = document.getElementById('modalContainer'); if(modal) modal.classList.add('hidden'); _showModal('Error', `Fallo propagación orden.`); }
        },

        // Exponer nuevas funciones para uso externo si fuera necesario (aunque son internas del UI)
        showFileManagementView,
        handleExportCierres,
        handleImportCierres
    };

    async function showPropagateOrderView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Propagar Ordenamiento</h1>
                        <p class="mb-4 text-gray-600">Esto forzará que todos los vendedores tengan el mismo orden de Rubros y Segmentos que el Admin.</p>
                        <div class="space-y-4">
                            <button id="propRubros" class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Propagar Orden Rubros</button>
                            <button id="propSegmentos" class="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Propagar Orden Segmentos</button>
                            <button id="backAdmin" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.getElementById('propRubros').addEventListener('click', () => window.adminModule.propagateOrderChange('rubros'));
        document.getElementById('propSegmentos').addEventListener('click', () => window.adminModule.propagateOrderChange('segmentos'));
        document.getElementById('backAdmin').addEventListener('click', showAdminView);
    }

})();

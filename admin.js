(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal;

    // Paleta corporativa del estilo profesional
    const AZUL = '#16305C';
    const AZUL_CLARO = '#BBD2EE';

    // Cabecera común del estilo profesional (azul corporativo).
    // Solo presentación: el botón conserva el id que ya usaba cada pantalla.
    function cabecera(titulo, subtitulo, idVolver) {
        return `<div class="px-4 py-3 flex items-center justify-between" style="background:${AZUL}">
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold text-white tracking-tight truncate">${titulo}</h2>
                        <p class="text-[10px] mt-0.5 truncate" style="color:${AZUL_CLARO}">${subtitulo}</p>
                    </div>
                    <button id="${idVolver}" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition shrink-0">Volver</button>
                </div>`;
    }
    let _collection, _getDocs, _doc, _setDoc, _getDoc, _writeBatch, _query, _where, _deleteDoc;
    let limit, startAfter;
    let _obsequioProductId = null;
    let _inventarioParaImportar = [];


    // --- CONFIGURACIÓN CENTRALIZADA ---
    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    // --- INICIALIZACIÓN ---
    window.initAdmin = function(dependencies) {
        if (!dependencies.db || !dependencies.mainContent || !dependencies.showMainMenu || !dependencies.showModal) {
            console.error("Admin Init Error: Faltan dependencias críticas");
            return;
        }
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
        _doc = dependencies.doc;
        _getDoc = dependencies.getDoc;
        _setDoc = dependencies.setDoc;
        _writeBatch = dependencies.writeBatch;
        _query = dependencies.query;
        _where = dependencies.where;
        _deleteDoc = dependencies.deleteDoc;
        limit = dependencies.limit;
        startAfter = dependencies.startAfter;

        if (!_floatingControls) {
            console.warn("Admin Init Warning: floatingControls no encontrado.");
        }
        if (typeof limit !== 'function') {
            console.error("CRITICAL Admin Init Error: Función Firestore 'limit' no proveída.");
        }
        
        console.log("Módulo Admin inicializado (Versión Fase 2: Escritura Doble). Public ID:", PUBLIC_DATA_ID);
    };

    // --- ENRUTADOR PRINCIPAL ---
    window.showAdminOrProfileView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        // Asegurar rol actualizado
        const currentRole = window.userRole || _userRole;
        if (currentRole === 'admin') {
            showAdminSubMenuView();
        } else {
            showUserProfileView();
        }
    };

    // --- MENÚ DE ADMINISTRADOR ---
    function showAdminSubMenuView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-lg mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="px-4 py-3 flex items-center justify-between" style="background:${AZUL}">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Panel de Administración</h2>
                            <p class="text-[10px] mt-0.5" style="color:${AZUL_CLARO}">Configuración y mantenimiento del sistema</p>
                        </div>
                        <button id="backToMenuBtn" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition shrink-0">Volver</button>
                    </div>
                    <div class="p-4 space-y-2">
                        <button id="userManagementBtn" class="w-full text-left px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-400 transition">
                            <span class="block font-bold text-slate-800 text-sm">Gestión de Usuarios</span>
                            <span class="block text-xs text-slate-500 mt-0.5">Roles, perfiles y zonas de los vendedores</span>
                        </button>
                        <button id="obsequioConfigBtn" class="w-full text-left px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-400 transition">
                            <span class="block font-bold text-slate-800 text-sm">Config Obsequio</span>
                            <span class="block text-xs text-slate-500 mt-0.5">Productos habilitados como obsequio</span>
                        </button>
                        <button id="importExportInventarioBtn" class="w-full text-left px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-400 transition">
                            <span class="block font-bold text-slate-800 text-sm">Importar / Exportar Inventario</span>
                            <span class="block text-xs text-slate-500 mt-0.5">Carga masiva de productos desde Excel</span>
                        </button>
                        <button id="deepCleanBtn" class="w-full text-left px-4 py-3.5 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-400 transition">
                            <span class="block font-bold text-red-800 text-sm">Limpieza Profunda</span>
                            <span class="block text-xs text-red-600 mt-0.5">Borrado de datos. Usar con precaución</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('userManagementBtn').addEventListener('click', showUserManagementView);
        document.getElementById('obsequioConfigBtn').addEventListener('click', showObsequioConfigView);
        document.getElementById('importExportInventarioBtn').addEventListener('click', showImportExportInventarioView);
        document.getElementById('deepCleanBtn').addEventListener('click', showDeepCleanView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    // ==========================================
    // SECCIÓN: LIMPIEZA PROFUNDA
    // ==========================================

    function showDeepCleanView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-lg mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="px-4 py-3 flex items-center justify-between bg-red-800">
                        <div class="min-w-0">
                            <h2 class="text-base font-semibold text-white tracking-tight">Limpieza Profunda</h2>
                            <p class="text-[10px] mt-0.5 text-red-200">Borrado permanente de datos</p>
                        </div>
                        <button id="deepCleanVolverBtn" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition shrink-0">Volver</button>
                    </div>
                    <div class="p-4">
                        <div class="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3">
                            <p class="text-[11px] text-red-800 font-semibold">Esta acción elimina los datos de forma permanente y no se puede deshacer.</p>
                        </div>
                        
                        <div class="space-y-4 text-left mb-6 border p-4 rounded-lg bg-gray-50">
                            <div class="font-bold text-gray-700 mb-2 border-b pb-1">Datos Operativos:</div>
                            
                            <label class="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                                <input type="checkbox" id="cleanInventario" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <div>
                                    <span class="font-medium text-gray-800">Inventario y Categorías</span>
                                    <p class="text-xs text-gray-500">Borra productos, marcas, rubros de todos los usuarios.</p>
                                </div>
                            </label>

                            <label class="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                                <input type="checkbox" id="cleanClientes" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <div>
                                    <span class="font-medium text-gray-800">Clientes y Sectores</span>
                                    <p class="text-xs text-gray-500">Borra la base de datos pública de clientes.</p>
                                </div>
                            </label>

                            <label class="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                                <input type="checkbox" id="cleanVentas" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <div>
                                    <span class="font-medium text-gray-800">Ventas, Cierres y CXC</span>
                                    <p class="text-xs text-gray-500">Borra historiales de ventas y cuentas por cobrar.</p>
                                </div>
                            </label>
                            
                             <label class="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                                <input type="checkbox" id="cleanObsequios" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <div>
                                    <span class="font-medium text-gray-800">Obsequios</span>
                                    <p class="text-xs text-gray-500">Borra configuración y registros de entrega.</p>
                                </div>
                            </label>

                            <div class="font-bold text-gray-700 mt-4 mb-2 border-b pb-1">Reportes y Logs:</div>

                            <label class="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded bg-yellow-50 border border-yellow-200">
                                <input type="checkbox" id="cleanRecargas" class="h-5 w-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500">
                                <div>
                                    <span class="font-medium text-gray-800">Historial de Recargas/Correcciones</span>
                                    <p class="text-xs text-gray-500">Borra logs de 'Edición Inventario' y 'Recargas'.</p>
                                </div>
                            </label>
                        </div>

                        <div class="mb-6">
                            <label for="confirmCleanText" class="block text-sm font-medium text-gray-700 mb-1">Escribe "BORRAR DATOS" para confirmar:</label>
                            <input type="text" id="confirmCleanText" class="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-red-500 focus:border-red-500 font-mono text-center uppercase" placeholder="BORRAR DATOS">
                        </div>

                        <div class="space-y-2">
                            <button id="executeCleanBtn" class="w-full py-2.5 bg-red-700 text-white font-bold text-sm rounded-lg hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition" disabled>
                                Iniciar limpieza
                            </button>
                            <button id="backToAdminMenuBtn" class="w-full py-2.5 bg-slate-100 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-200 border border-slate-300 transition">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const confirmInput = document.getElementById('confirmCleanText');
        const executeBtn = document.getElementById('executeCleanBtn');
        
        confirmInput.addEventListener('input', () => { 
            executeBtn.disabled = confirmInput.value !== 'BORRAR DATOS'; 
        });

        document.getElementById('executeCleanBtn').addEventListener('click', handleDeepCleanConfirmation);
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView);
        document.getElementById('deepCleanVolverBtn').addEventListener('click', showAdminSubMenuView);
    }

    function handleDeepCleanConfirmation() { 
        const confirmInput = document.getElementById('confirmCleanText');
        if (confirmInput.value !== 'BORRAR DATOS') return;
        
        const cleanInv = document.getElementById('cleanInventario').checked;
        const cleanCli = document.getElementById('cleanClientes').checked;
        const cleanVen = document.getElementById('cleanVentas').checked;
        const cleanObs = document.getElementById('cleanObsequios').checked;
        const cleanRec = document.getElementById('cleanRecargas').checked;

        if (!cleanInv && !cleanCli && !cleanVen && !cleanObs && !cleanRec) {
            _showModal('Aviso', 'Selecciona al menos una opción para limpiar.');
            return;
        }

        _showModal('Confirmación Final', 
            `<div class="text-center">
                <p class="text-red-600 font-bold text-xl mb-2">¡ÚLTIMA ADVERTENCIA!</p>
                <p class="mb-4">Vas a borrar permanentemente las secciones seleccionadas para <b>TODOS</b> los usuarios.</p>
                <p class="text-sm text-gray-500">Esta acción no se puede deshacer y la app podría comportarse de manera inesperada si hay usuarios activos.</p>
            </div>`, 
            executeDeepClean, 
            'Sí, BORRAR DATOS'
        ); 
    }

    async function executeDeepClean() {
        _showModal('Progreso', 'Iniciando limpieza profunda... Esto puede tardar varios segundos.');
        
        const cleanInv = document.getElementById('cleanInventario').checked;
        const cleanCli = document.getElementById('cleanClientes').checked;
        const cleanVen = document.getElementById('cleanVentas').checked;
        const cleanObs = document.getElementById('cleanObsequios').checked;
        const cleanRec = document.getElementById('cleanRecargas').checked;
        
        const colsToDelPub = []; 
        const pubProjId = PUBLIC_DATA_ID; 
        let allUserIds = [];
        
        try { 
            const uSnap = await _getDocs(_collection(_db, "users")); 
            allUserIds = uSnap.docs.map(d => d.id); 
        } catch (uErr) { 
            console.error("Error obteniendo usuarios:", uErr); 
            _showModal('Error Crítico', `No se pudo obtener lista de usuarios. Limpieza cancelada.`); 
            return; 
        }

        // --- 1. DEFINICIÓN DE COLECCIONES PÚBLICAS ---
        if (cleanCli) { 
            colsToDelPub.push({ path: `artifacts/${pubProjId}/public/data/clientes`, name: 'Clientes Públicos' }); 
            colsToDelPub.push({ path: `artifacts/${pubProjId}/public/data/sectores`, name: 'Sectores Públicos' }); 
        }
        if (cleanVen) { 
            colsToDelPub.push({ path: `artifacts/${_appId}/public/data/user_closings`, name: 'Cierres Vendedores Públicos' }); 
            colsToDelPub.push({ path: `artifacts/${pubProjId}/public/data/cxc`, name: 'Cuentas por Cobrar (CXC)' });
        }
        if (cleanObs) { 
            // Borrar config pública de obsequios (documento único)
            const pubConfRef = _doc(_db,`artifacts/${pubProjId}/public/data/config/obsequio`); 
            try { await _deleteDoc(pubConfRef); } catch(e){ console.warn("Could not delete public obsequio config:", e.code); } 
        }
        // NUEVO: Limpieza del Catálogo Maestro si se limpia inventario
        if (cleanInv) {
             colsToDelPub.push({ path: `artifacts/${PUBLIC_DATA_ID}/public/data/productos`, name: 'Catálogo Maestro' });
        }

        // --- 2. DEFINICIÓN DE COLECCIONES PRIVADAS (POR USUARIO) ---
        const privColsToClean = []; 
        
        if(cleanInv){ 
            privColsToClean.push({sub:'inventario', n:'Inventario'}); 
            privColsToClean.push({sub:'rubros', n:'Rubros'}); 
            privColsToClean.push({sub:'segmentos', n:'Segmentos'}); 
            privColsToClean.push({sub:'marcas', n:'Marcas'}); 
            // Configuraciones de inventario
            privColsToClean.push({sub:'config/productSortOrder', n:'Config Orden Catálogo', isDoc:true}); 
            privColsToClean.push({sub:'config/reporteCierreVentas', n:'Config Diseño Reporte', isDoc:true}); 
        } 
        
        if(cleanVen){ 
            privColsToClean.push({sub:'ventas', n:'Ventas'}); 
            privColsToClean.push({sub:'cierres', n:'Cierres'}); 
            privColsToClean.push({sub:'config/cargaInicialSnapshot', n:'Snapshot Carga Inicial', isDoc:true}); 
        } 
        
        if(cleanObs){ 
            privColsToClean.push({sub:'obsequios_entregados', n:'Obsequios Entregados'}); 
            privColsToClean.push({sub:'config/obsequio', n:'Config Obsequio Privada', isDoc:true}); 
        }

        if(cleanRec) {
            // Logs de Correcciones Manuales y Limpiezas Profundas (edit-inventario.js)
            privColsToClean.push({sub:'historial_correcciones', n:'Historial Correcciones'});
            // Mantenemos el antiguo por si hay datos legacy de versiones anteriores
            privColsToClean.push({sub:'historial_inventario', n:'Historial Correcciones (Legacy)'});
            // Logs de Recargas de Productos (inventario.js)
            privColsToClean.push({sub:'recargas', n:'Historial Recargas'});
        }
        
        let errorsOccurred = false; 
        let deletedDocCount = 0;
        
        // --- EJECUCIÓN: Borrar Públicas ---
        for (const colInfo of colsToDelPub) { 
            try { 
                console.log(`Borrando pública: ${colInfo.name}`);
                const count = await deleteCollection(colInfo.path); 
                deletedDocCount += count; 
            } catch (error) { 
                console.error(`Error public ${colInfo.name}:`, error); 
                errorsOccurred = true; 
            } 
        }
        
        // --- EJECUCIÓN: Borrar Privadas (Iterando Usuarios) ---
        for (const targetUserId of allUserIds) {
            for (const privCol of privColsToClean) { 
                const fullPath = `artifacts/${_appId}/users/${targetUserId}/${privCol.sub}`; 
                try { 
                    if (privCol.isDoc) { 
                        const docRef = _doc(_db, fullPath); 
                        await _deleteDoc(docRef); 
                        deletedDocCount++; 
                    } else { 
                        const count = await deleteCollection(fullPath); 
                        deletedDocCount += count; 
                    } 
                } catch (error) { 
                    if(error.code !== 'not-found') {
                        console.warn(`Error borrando ${fullPath}:`, error.message);
                        errorsOccurred = true; 
                    }
                } 
            } 
        }

        // --- CORRECCIÓN CRÍTICA: BORRADO DE LOCALSTORAGE DE CXC ---
        if (cleanVen) {
            console.log("Limpiando caché local de CXC...");
            localStorage.removeItem('cxc_local_data');
            localStorage.removeItem('cxc_local_date');
        }
        
        // Limpiar cachés globales en memoria para que la UI se actualice
        
        if(window.inventarioModule) {
            if (typeof window.inventarioModule.invalidateSegmentOrderCache === 'function') {
                window.inventarioModule.invalidateSegmentOrderCache(); 
            }
        }
        if(window.catalogoModule && typeof window.catalogoModule.invalidateCache === 'function') {
            window.catalogoModule.invalidateCache(); 
        }
        if(window.ventasModule && typeof window.ventasModule.invalidateCache === 'function') {
            window.ventasModule.invalidateCache();
        }
        
        _showModal(
            errorsOccurred ? 'Limpieza Completada (con advertencias)' : 'Limpieza Completada', 
            `Se han eliminado ${deletedDocCount} documentos y registros.${errorsOccurred ? ' Revisa la consola para ver detalles de los errores.' : ''}`, 
            showAdminSubMenuView, 
            'OK'
        );
    }

    async function deleteCollection(collectionPath) {
        if (typeof limit !== 'function') throw new Error("Dependencia 'limit' no disponible.");
        
        // Usamos un tamaño de lote conservador para evitar saturar el índice local (BloomFilter error)
        const batchSize = 100; 
        const colRef = _collection(_db, collectionPath); 
        const qDef = _query(colRef, limit(batchSize));
        
        let deletedCount = 0; 
        
        while (true) { 
            let snap;
            try {
                // Intento de lectura con manejo de errores transitorios
                snap = await _getDocs(qDef);
            } catch (e) {
                console.warn(`Error leyendo lote en ${collectionPath} (reintentando...):`, e);
                await new Promise(r => setTimeout(r, 1000)); // Esperar 1s antes de reintentar
                try { 
                    snap = await _getDocs(qDef); 
                } catch(e2) { 
                    console.error("Fallo definitivo leyendo colección:", e2);
                    break; 
                } 
            }

            if (!snap || snap.size === 0) break; 
            
            const batch = _writeBatch(_db); 
            snap.docs.forEach(d => batch.delete(d.ref)); 
            await batch.commit(); 
            
            deletedCount += snap.size; 
            
            // Pausa de seguridad para permitir que el SDK de Firebase actualice su caché local
            await new Promise(r => setTimeout(r, 200));
        }
        return deletedCount;
    }

    // --- Importar/Exportar Inventario ---
    
    function showImportExportInventarioView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-lg mx-auto"> <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                ${cabecera('Importar / Exportar Inventario', 'Carga masiva de productos desde Excel', 'backToAdminMenuBtn2')}
                <div class="p-4">
                <p class="text-xs text-slate-500 mb-3 leading-relaxed">Exporta el inventario a Excel, o impórtalo para añadir productos nuevos y actualizar el Cod P. (la cantidad se ignora).</p>
                <div class="space-y-2">
                    <button id="exportInventarioBtn" class="w-full py-2.5 text-white rounded-lg font-bold text-sm transition" style="background:${AZUL}">Exportar Inventario</button>
                    <button id="importInventarioBtn" class="w-full py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 border border-slate-300 transition">Importar Inventario</button>
                    <button id="backToAdminMenuBtn" class="hidden"></button>
                </div>
                </div>
            </div> </div>
        `;
        document.getElementById('exportInventarioBtn').addEventListener('click', handleExportInventario);
        document.getElementById('importInventarioBtn').addEventListener('click', showImportInventarioView);
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView);
        document.getElementById('backToAdminMenuBtn2').addEventListener('click', showAdminSubMenuView);
    }

    async function handleExportInventario() {
        if (typeof ExcelJS === 'undefined') { _showModal('Error', 'Librería ExcelJS no cargada.'); return; }
        _showModal('Progreso', 'Generando Excel...');
        try { 
            const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); 
            const snap = await _getDocs(invRef); 
            let inv = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // El Cod P. vive en el catálogo MAESTRO (el inventario del usuario solo
            // guarda stock), así que se trae de ahí para incluirlo en el Excel.
            const codPolarPorId = {};
            try {
                const mSnap = window.getCatalogoSnapshot
                    ? await window.getCatalogoSnapshot()
                    : await _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`));
                mSnap.docs.forEach(d => { const x = d.data(); if (x.codigoPolar) codPolarPorId[d.id] = x.codigoPolar; });
            } catch (e) { console.warn('No se pudo leer el Cod P. del maestro', e); }

            
            // Aplicar nueva lógica de ordenamiento global
            inv.sort((a, b) => {
                const ordA = a.ordenGlobal !== undefined ? a.ordenGlobal : 999999;
                const ordB = b.ordenGlobal !== undefined ? b.ordenGlobal : 999999;
                if (ordA !== ordB) return ordA - ordB;
                
                // Fallback a alfabeto
                const sA = a.segmento || ''; const sB = b.segmento || '';
                if (sA !== sB) return sA.localeCompare(sB);
                const mA = a.marca || ''; const mB = b.marca || '';
                if (mA !== mB) return mA.localeCompare(mB);
                return (a.presentacion || '').localeCompare(b.presentacion || '');
            });

            const dExport = inv.map(p=>({ 'Rubro':p.rubro||'', 'Segmento':p.segmento||'', 'Marca':p.marca||'', 'Presentacion':p.presentacion||'', 'CodP':codPolarPorId[p.id]||p.codigoPolar||'', 'CantidadActualUnidades':p.cantidadUnidades||0, 'VentaPorUnd':p.ventaPor?.und?'SI':'NO', 'VentaPorPaq':p.ventaPor?.paq?'SI':'NO', 'VentaPorCj':p.ventaPor?.cj?'SI':'NO', 'UnidadesPorPaquete':p.unidadesPorPaquete||'', 'UnidadesPorCaja':p.unidadesPorCaja||'', 'PrecioUnd':p.precios?.und||'', 'PrecioPaq':p.precios?.paq||'', 'PrecioCj':p.precios?.cj||'', 'ManejaVacios':p.manejaVacios?'SI':'NO', 'TipoVacio':p.tipoVacio||'', 'IVA':p.iva!==undefined?`${p.iva}%`:'' }));
            const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Inventario');
            ws.columns = Object.keys(dExport[0]||{}).map(k=>({header:k, key:k, width:15})); ws.getRow(1).font = { bold: true }; ws.addRows(dExport);
            const buffer = await wb.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Inventario_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            const m=document.getElementById('modalContainer'); if(m) m.classList.add('hidden');
        } catch (error) { _showModal('Error', `Error: ${error.message}`); }
    }

    function showImportInventarioView() {
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-3xl mx-auto"> <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                ${cabecera('Importar Inventario', 'Los productos nuevos se añaden con stock en 0', 'backToImportExportBtn')}
                <div class="p-4">
                <p class="text-xs text-slate-500 mb-2">Selecciona un archivo Excel o CSV con el formato exportado.</p>
                <input type="file" id="inventario-excel-uploader" accept=".xlsx,.xls,.csv" class="w-full p-3 border-2 border-dashed border-slate-300 rounded-lg mb-3 text-xs">
                <div id="inventario-preview-container" class="overflow-auto max-h-72 border border-slate-200 rounded-lg"></div>
                <div id="inventario-import-actions" class="mt-3 grid grid-cols-2 gap-2 hidden"> <button id="confirmInventarioImportBtn" class="py-2.5 text-white rounded-lg font-bold text-sm transition" style="background:${AZUL}">Confirmar e importar</button> <button id="cancelInventarioImportBtn" class="py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 border border-slate-300 transition">Cancelar</button> </div>
            </div> </div> </div>
        `;
        document.getElementById('inventario-excel-uploader').addEventListener('change', handleFileUploadInventario);
        document.getElementById('backToImportExportBtn').addEventListener('click', showImportExportInventarioView);
    }

    function handleFileUploadInventario(event) {
        if (!event.target || !event.target.files || event.target.files.length === 0) return;
        const file = event.target.files[0]; _inventarioParaImportar = [];
        const reader = new FileReader(); 
        reader.onload = function(e) { 
            const data = e.target.result; let jsonData = []; 
            try { 
                if (typeof XLSX !== 'undefined') { const wb = XLSX.read(data, { type: 'binary' }); jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); } 
                else throw new Error("XLSX no cargado.");
            } catch (err) { _showModal('Error Lectura', err.message); return; }
            if (jsonData.length < 2) { _showModal('Error', 'Archivo vacío.'); return; }
            const headers = jsonData[0].map(h=>(h?h.toString().toLowerCase().trim().replace(/\s+/g,''):''));
            const reqHeaders=['rubro','segmento','marca','presentacion']; const hMap={}; let missing=false;
            reqHeaders.forEach(rh=>{ const i=headers.indexOf(rh); if(i!==-1)hMap[rh]=i; else missing=true;}); 
            if(missing){_showModal('Error',`Faltan columnas requeridas.`);return;}
            const optHeaders=['ventaporund','ventaporpaq','ventaporcj','unidadesporpaquete','unidadesporcaja','preciound','preciopaq','preciocj','manejavacios','tipovacio','iva','codp','codigopolar','codigop'];
            optHeaders.forEach(oh=>{ const i=headers.indexOf(oh); if(i!==-1)hMap[oh]=i; });

            _inventarioParaImportar = jsonData.slice(1).map((row) => {
                const item = {
                    rubro: (row[hMap['rubro']] || '').toString().trim().toUpperCase(),
                    segmento: (row[hMap['segmento']] || '').toString().trim().toUpperCase(),
                    marca: (row[hMap['marca']] || '').toString().trim().toUpperCase(),
                    presentacion: (row[hMap['presentacion']] || '').toString().trim(),
                    // Cod P. (Código Polar): admite varios nombres de columna y siempre en mayúsculas
                    codigoPolar: (row[hMap['codp']] ?? row[hMap['codigopolar']] ?? row[hMap['codigop']] ?? '').toString().trim().toUpperCase(),
                    ventaPor: { und: (row[hMap['ventaporund']]||'SI').toString().toUpperCase()==='SI', paq: (row[hMap['ventaporpaq']]||'NO').toString().toUpperCase()==='SI', cj: (row[hMap['ventaporcj']]||'NO').toString().toUpperCase()==='SI' },
                    unidadesPorPaquete: parseInt(row[hMap['unidadesporpaquete']], 10) || 1, unidadesPorCaja: parseInt(row[hMap['unidadesporcaja']], 10) || 1,
                    precios: { und: parseFloat(row[hMap['preciound']])||0, paq: parseFloat(row[hMap['preciopaq']])||0, cj: parseFloat(row[hMap['preciocj']])||0 },
                    manejaVacios: (row[hMap['manejavacios']]||'NO').toString().toUpperCase()==='SI', tipoVacio: (row[hMap['tipovacio']]||null)?.toString().trim()||null,
                    iva: parseInt((row[hMap['iva']]||'16').toString().replace('%',''),10)||16
                };
                if (!item.rubro || !item.segmento || !item.marca || !item.presentacion) return null;
                item.key = `${item.rubro}|${item.segmento}|${item.marca}|${item.presentacion}`.toUpperCase();
                return item;
            }).filter(i => i !== null);
            renderPreviewTableInventario(_inventarioParaImportar);
        }; 
        reader.readAsBinaryString(file);
    }

    function renderPreviewTableInventario(items) {
        const cont=document.getElementById('inventario-preview-container'), acts=document.getElementById('inventario-import-actions'), back=document.getElementById('backToImportExportBtn');
        if(items.length===0){cont.innerHTML=`<p class="text-center p-4">No hay productos válidos.</p>`; acts.classList.add('hidden'); back.classList.remove('hidden'); return;}
        let html=`<div class="p-4"><h3 class="font-bold mb-2">Vista Previa (${items.length} productos)</h3><table class="min-w-full text-xs"><thead class="bg-gray-200"><tr><th>Rubro</th><th>Segmento</th><th>Marca</th><th>Presentación</th></tr></thead><tbody>`;
        items.slice(0,50).forEach(i=>{ html+=`<tr class="border-b"><td>${i.rubro}</td><td>${i.segmento}</td><td>${i.marca}</td><td>${i.presentacion}</td></tr>`; });
        html+='</tbody></table></div>'; cont.innerHTML=html;
        acts.classList.remove('hidden'); back.classList.add('hidden'); 
        document.getElementById('confirmInventarioImportBtn').onclick=handleConfirmInventarioImport; 
        document.getElementById('cancelInventarioImportBtn').onclick=()=>{_inventarioParaImportar=[]; cont.innerHTML=''; acts.classList.add('hidden'); back.classList.remove('hidden');};
    }

    async function handleConfirmInventarioImport() {
        if (_inventarioParaImportar.length === 0) return;
        _showModal('Progreso', 'Procesando...');
        try {
            const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            // Map (no Set) para poder recuperar el ID del producto existente y
            // actualizar su Cod P. desde el Excel.
            const snap = await _getDocs(invRef); const curInvMap = new Map();
            snap.docs.forEach(d => { const da = d.data(); curInvMap.set(`${da.rubro}|${da.segmento}|${da.marca}|${da.presentacion}`.toUpperCase(), { id: d.id, ...da }); });

            let added=0, actualizados=0;
            for (const item of _inventarioParaImportar) {
                if (!curInvMap.has(item.key)) {
                    // Generar ID local para el nuevo producto
                    const newId = _doc(_collection(_db, 'dummy')).id;
                    const { key, ...data } = item; 
                    data.cantidadUnidades = 0;
                    
                    // Asignar ordenGlobal alto para que caigan al final
                    data.ordenGlobal = 999999;
                    
                    // FASE 2: Propagar creación al Maestro y a usuarios legacy
                    await window.adminModule.propagateProductChange(newId, data);
                    
                    added++;
                } else if (item.codigoPolar) {
                    // El producto YA existe: se actualiza únicamente su Cod P. en el
                    // catálogo maestro. Así el Excel sirve para cargar códigos en lote
                    // sin tocar precios, stock ni ninguna otra definición del producto.
                    const existente = curInvMap.get(item.key);
                    const idExistente = existente && existente.id;
                    if (idExistente && existente.codigoPolar !== item.codigoPolar) {
                        try {
                            await _setDoc(
                                _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`, idExistente),
                                { codigoPolar: item.codigoPolar, lastUpdated: new Date() },
                                { merge: true }
                            );
                            actualizados++;
                        } catch (eCod) { console.warn('No se pudo actualizar el Cod P. de', item.key, eCod); }
                    }
                }
            }
            if (actualizados) window.invalidarCatalogo?.();
            _showModal('Éxito',
                `Se añadieron <strong>${added}</strong> productos nuevos` +
                (actualizados ? ` y se actualizó el Cod P. de <strong>${actualizados}</strong> productos existentes` : '') +
                `.${added ? ' Recuerda ir a Ordenar Catálogo.' : ''}`,
                showImportExportInventarioView);
        } catch (e) { _showModal('Error', e.message); }
    }

    // --- Gestión de Usuarios ---
    function showUserManagementView() {
         if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-3xl mx-auto"> <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                ${cabecera('Gestión de Usuarios', 'Roles, perfiles y zonas de los vendedores', 'backToAdminMenuBtn')}
                <div class="p-4">
                <div id="user-list-container" class="overflow-x-auto max-h-96"> <p class="text-center text-gray-500">Cargando...</p> </div>
            </div> </div> </div>
        `;
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView); renderUserList();
    };
    async function renderUserList() {
        const cont = document.getElementById('user-list-container'); if (!cont) return;
        try { const uRef = _collection(_db, "users"); const snap = await _getDocs(uRef); const users = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>(a.email||'').localeCompare(b.email||''));
            let tHTML = `<table class="min-w-full bg-white text-sm"><thead class="bg-gray-200 sticky top-0 z-10"><tr><th class="py-2 px-4 border-b text-left">Email</th><th class="py-2 px-4 border-b text-left">Rol</th><th class="py-2 px-4 border-b text-left">Ruta</th></tr></thead><tbody>`;
            users.forEach(u => {
                // 'user' (antiguo) se considera Vendedor por compatibilidad
                const rol = (u.role === 'user') ? 'vendedor' : (u.role || 'vendedor');
                const rutaActual = u.zonaPreventa || '';
                const rutasOpts = (window.RUTAS_REPARTO || ['Palo Gordo', 'Santa Teresa']);
                // El admin no reparte ruta; a vendedores y despachadores se les puede asignar.
                const celdaRuta = (rol === 'admin')
                    ? '<span class="text-xs text-gray-400">—</span>'
                    : `<select onchange="window.adminModule.handleRutaChange('${u.id}', this.value)" class="w-full p-1 border rounded-lg bg-gray-50 text-sm"><option value="">— Sin ruta —</option>${rutasOpts.map(r => `<option value="${r}" ${rutaActual === r ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
                tHTML += `<tr class="hover:bg-gray-50"><td class="py-2 px-4 border-b">${u.email||'N/A'}</td><td class="py-2 px-4 border-b"><select onchange="window.adminModule.handleRoleChange('${u.id}', this.value, '${u.email||'N/A'}')" class="w-full p-1 border rounded-lg bg-gray-50 text-sm"><option value="admin" ${rol==='admin'?'selected':''}>Administrador</option><option value="vendedor" ${rol==='vendedor'?'selected':''}>Vendedor</option><option value="despachador" ${rol==='despachador'?'selected':''}>Despachador / Mkt</option></select></td><td class="py-2 px-4 border-b">${celdaRuta}</td></tr>`;
            });
            tHTML += `</tbody></table>`; cont.innerHTML = tHTML;
        } catch (error) { cont.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; }
    }
    async function handleRoleChange(userIdToChange, newRole, userEmail) {
        if (userIdToChange === _userId && newRole !== 'admin') { const uRef = _collection(_db, "users"); const qAd = _query(uRef, _where("role", "==", "admin")); const adSnap = await _getDocs(qAd); if (adSnap.size <= 1) { _showModal('No Permitido', 'No puedes quitarte el rol si eres el único admin.'); renderUserList(); return; } }
        _showModal('Confirmar', `Cambiar rol de <strong>${userEmail}</strong> a <strong>${newRole}</strong>?`, async () => { try { const uDRef = _doc(_db, "users", userIdToChange); await _setDoc(uDRef, { role: newRole }, { merge: true }); _showModal('Éxito', 'Rol actualizado.'); renderUserList(); } catch (error) { _showModal('Error', 'No se pudo actualizar.'); renderUserList(); } }, 'Sí', ()=>{renderUserList();});
    }

    // --- Perfil ---
    async function showUserProfileView() {
         if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-lg mx-auto"> <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                ${cabecera('Mi Perfil', 'Datos de tu cuenta', 'perfilVolverBtn')}
                <div class="p-4">
                <form id="userProfileForm" class="space-y-4 text-left"> <div> <label for="profileNombre">Nombre:</label> <input type="text" id="profileNombre" class="w-full px-4 py-2 border rounded-lg" required> </div> <div> <label for="profileApellido">Apellido:</label> <input type="text" id="profileApellido" class="w-full px-4 py-2 border rounded-lg" required> </div> <div> <label for="profileCamion">Camión:</label> <input type="text" id="profileCamion" class="w-full px-4 py-2 border rounded-lg" placeholder="Ej: Placa ABC-123"> </div> <button type="submit" class="w-full py-2.5 text-white rounded-lg font-bold text-sm transition" style="background:${AZUL}">Guardar</button> </form>
                <button id="backToMenuBtn" class="hidden"></button>
                </div>
            </div> </div>
        `;
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        document.getElementById('perfilVolverBtn').addEventListener('click', _showMainMenu);
        document.getElementById('userProfileForm').addEventListener('submit', handleSaveProfile);
        try { const uDRef = _doc(_db, "users", _userId); const uDoc = await _getDoc(uDRef); if (uDoc.exists()) { const d = uDoc.data(); const _n = document.getElementById('profileNombre'), _a = document.getElementById('profileApellido'), _c = document.getElementById('profileCamion'); if (_n) _n.value = d.nombre||''; if (_a) _a.value = d.apellido||''; if (_c) _c.value = d.camion||''; } } catch (error) { _showModal('Error', 'No se pudo cargar.'); }
    }
    async function handleSaveProfile(e) {
        e.preventDefault(); const n=document.getElementById('profileNombre').value.trim(), a=document.getElementById('profileApellido').value.trim(), c=document.getElementById('profileCamion').value.trim(); if (!n||!a) { _showModal('Error', 'Requeridos.'); return; } 
        try { const uDRef = _doc(_db, "users", _userId); await _setDoc(uDRef, {nombre:n, apellido:a, camion:c}, { merge: true }); _showModal('Éxito','Perfil actualizado.'); } catch (error) { _showModal('Error','Error al guardar.'); }
    }

    // --- Obsequio Config ---
    async function showObsequioConfigView() {
         if (_floatingControls) _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-lg mx-auto"> <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                ${cabecera('Config Obsequio', 'Productos habilitados como obsequio', 'backToAdminMenuBtn')}
                <div class="p-4">
                    <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Productos de obsequio (marca uno o más)</label>
                    <div id="obsequioProductList" class="border border-slate-200 rounded-lg p-2 max-h-72 overflow-y-auto space-y-1 mt-1"><p class="text-sm text-slate-400 text-center py-3">Cargando...</p></div>
                    <button id="saveObsequioConfigBtn" class="w-full mt-3 py-2.5 text-white rounded-lg font-bold text-sm transition" style="background:${AZUL}">Guardar configuración</button>
                </div>
            </div> </div>
        `;
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView); document.getElementById('saveObsequioConfigBtn').addEventListener('click', handleSaveObsequioConfig); await loadAndPopulateObsequioSelect();
    }
    async function loadAndPopulateObsequioSelect() {
        const listEl = document.getElementById('obsequioProductList'); if (!listEl) return;
        try {
            const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const snap = await _getDocs(invRef);
            const pVal = snap.docs.map(d=>({id: d.id,...d.data()})).filter(p=>p.manejaVacios&&p.ventaPor?.cj).sort((a,b)=>`${a.marca} ${a.segmento} ${a.presentacion}`.localeCompare(`${b.marca} ${b.segmento} ${b.presentacion}`));
            // IDs ya configurados (compat: productoIds nuevo o productoId viejo)
            let selectedIds = [];
            const confRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/config/obsequio`);
            const confSnap = await _getDoc(confRef);
            if (confSnap.exists()) { const d = confSnap.data(); selectedIds = Array.isArray(d.productoIds) ? d.productoIds : (d.productoId ? [d.productoId] : []); }
            if (!pVal.length) { listEl.innerHTML='<p class="text-sm text-gray-400 text-center py-3">No hay productos que manejen vacío por caja.</p>'; return; }
            listEl.innerHTML = pVal.map(p=>`<label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"><input type="checkbox" class="obsequio-chk h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" value="${p.id}" ${selectedIds.includes(p.id)?'checked':''}><span class="text-sm text-gray-800">${p.marca} - ${p.segmento} - ${p.presentacion}</span></label>`).join('');
        } catch (error) { listEl.innerHTML='<p class="text-sm text-red-500 text-center py-3">Error al cargar productos.</p>'; }
    }
    async function handleSaveObsequioConfig() {
        const ids = Array.from(document.querySelectorAll('.obsequio-chk:checked')).map(c => c.value);
        if (!ids.length) { _showModal('Error', 'Selecciona al menos un producto.'); return; }
        _showModal('Progreso','Guardando...');
        try {
            const confRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/config/obsequio`);
            await _setDoc(confRef, { productoIds: ids });
            _showModal('Éxito', `Configuración guardada (${ids.length} producto(s) de obsequio).`); showAdminSubMenuView();
        }
        catch (error) { _showModal('Error','Error al guardar.'); }
    }

    // ==========================================
    // SECCIÓN: PROPAGACIÓN (LÓGICA ACTUALIZADA)
    // ==========================================

    async function _getAllOtherUserIds() {
        try { const uRef = _collection(_db, "users"); const snap = await _getDocs(uRef); return snap.docs.map(d => d.id); } catch (error) { return []; }
    }

    // [NUEVO] Helper para escribir en el Catálogo Maestro (Centralizado)
    async function _saveToMasterCatalog(productId, productData) {
        if (!productId) return;
        // CORRECCIÓN: Usar PUBLIC_DATA_ID
        const masterPath = `artifacts/${PUBLIC_DATA_ID}/public/data/productos`;
        const masterRef = _doc(_db, masterPath, productId);

        try {
            if (productData === null) {
                // TOMBSTONE: antes de borrar, archivar el producto para tener
                // referencia futura del id (auditorías, limpieza de huérfanos).
                try {
                    const prev = await _getDoc(masterRef);
                    if (prev.exists()) {
                        const tombRef = _doc(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos_eliminados`, productId);
                        await _setDoc(tombRef, { ...prev.data(), id: productId, fechaEliminado: new Date(), eliminadoPor: _userId }, { merge: true });
                    }
                } catch (eTomb) { console.warn("No se pudo archivar el producto eliminado (tombstone):", eTomb); }
                // Si el dato es null, es un borrado
                await _deleteDoc(masterRef);
                window.invalidarCatalogo?.(); // el catálogo cambió: refrescar el caché global
                console.log("🗑️ Eliminado del Catálogo Maestro");
            } else {
                // SEPARACIÓN DE RESPONSABILIDADES:
                // El catálogo maestro guarda definiciones (Precio, Nombre, Marca, ORDEN), NO Stock.
                // Extraemos cantidadUnidades para no guardarla en el maestro.
                const { cantidadUnidades, ...masterData } = productData;
                masterData.lastUpdated = new Date(); 
                
                await _setDoc(masterRef, masterData, { merge: true });
                window.invalidarCatalogo?.(); // el catálogo cambió: refrescar el caché global
                console.log("✅ Sincronizado con Catálogo Maestro");
            }
        } catch (e) {
            console.warn("⚠️ Advertencia: No se pudo escribir en Catálogo Maestro (¿Faltan permisos de admin?)", e);
        }
    }

    // [MODIFICADO] Propagación con Estrategia "Double Write"
    async function propagateProductChange(productId, productData) {
        if (!productId) return;

        // 1. FASE NUEVA: Escribir en la base de datos centralizada
        await _saveToMasterCatalog(productId, productData);

        // 2. FASE LEGACY: Mantener el comportamiento antiguo (Fan-out)
        // NOTA: Para usuarios 100% migrados a Fase 2, esto ya no es estrictamente necesario,
        // pero lo mantenemos por seguridad hasta asegurar que todos lean del Maestro.
        const allUIds = await _getAllOtherUserIds();
        const BATCH_LIMIT = 490;
        let batch = _writeBatch(_db);
        let ops = 0;

        try { 
            console.log(`🔄 Iniciando propagación Legacy a ${allUIds.length} usuarios...`);
            for (const tUserId of allUIds) { 
                const tPRef = _doc(_db, `artifacts/${_appId}/users/${tUserId}/inventario`, productId); 
                if (productData === null) { 
                    batch.delete(tPRef); 
                } else { 
                    const { cantidadUnidades, ...defData } = productData; 
                    batch.set(tPRef, defData, { merge: true }); 
                } 
                ops++; 
                if (ops >= BATCH_LIMIT) { 
                    await batch.commit(); 
                    batch = _writeBatch(_db); 
                    ops = 0; 
                } 
            } 
            if (ops > 0) await batch.commit(); 
            console.log("✅ Propagación Legacy completada"); 
        } catch (error) { 
            console.error("❌ Error en propagación Legacy:", error); 
        }
    }

    // Propagación de Categorías (Ya no se usa intensivamente para orden de productos, 
    // pero se mantiene para nombres de categorías y orden de segmentos/marcas a nivel macro si fuera necesario)
    async function propagateCategoryChange(collectionName, itemId, itemData) {
        if (!collectionName || !itemId) return;
        
        // 1. FASE NUEVA: Intentar guardar en carpeta pública también
        try {
            // CORRECCIÓN: Usar PUBLIC_DATA_ID
            const publicPath = `artifacts/${PUBLIC_DATA_ID}/public/data/${collectionName}`;
            const publicRef = _doc(_db, publicPath, itemId);
            if (itemData === null) await _deleteDoc(publicRef);
            else await _setDoc(publicRef, itemData, { merge: true });
        } catch (e) {
            console.warn(`No se pudo sincronizar ${collectionName} público`, e);
        }

        // 2. FASE LEGACY
        const allUIds = await _getAllOtherUserIds();
        const BATCH_LIMIT = 490;
        let batch = _writeBatch(_db);
        let ops = 0;
        try { 
            for (const tUserId of allUIds) { 
                const tIRef = _doc(_db, `artifacts/${_appId}/users/${tUserId}/${collectionName}`, itemId); 
                if (itemData === null) batch.delete(tIRef); 
                else batch.set(tIRef, itemData); 
                ops++; 
                if (ops >= BATCH_LIMIT) { 
                    await batch.commit(); 
                    batch = _writeBatch(_db); 
                    ops = 0; 
                } 
            } 
            if (ops > 0) await batch.commit(); 
            console.log(`Propagado Categoría Legacy: ${collectionName}`); 
        } catch (error) { console.error(error); }
    }

    // Asigna una ruta de reparto a un usuario (vendedor/despachador). Solo toca zonaPreventa.
    async function handleRutaChange(userId, nuevaRuta) {
        try {
            await _setDoc(_doc(_db, "users", userId), { zonaPreventa: nuevaRuta }, { merge: true });
            _showModal('Éxito', nuevaRuta ? `Ruta asignada: <strong>${nuevaRuta}</strong>.` : 'Ruta quitada.');
            renderUserList();
        } catch (e) {
            console.error('Error asignando ruta:', e);
            _showModal('Error', 'No se pudo asignar la ruta.');
            renderUserList();
        }
    }

    window.adminModule = {
        handleRoleChange,
        handleRutaChange,
        propagateProductChange,
        propagateCategoryChange
    };

})();



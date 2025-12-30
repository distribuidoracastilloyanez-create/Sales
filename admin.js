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
        if (!_floatingControls) {
            console.warn("Admin Init Warning: floatingControls no encontrado.");
        }
        if (typeof limit !== 'function' || typeof startAfter !== 'function') {
            console.error("CRITICAL Admin Init Error: Funciones Firestore 'limit' o 'startAfter' no proveídas.");
        }
    };

    window.showAdminOrProfileView = function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        if (_userRole === 'admin') {
            showAdminSubMenuView();
        } else {
            showUserProfileView();
        }
    };

    function showAdminSubMenuView() {
        _floatingControls?.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-md">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Panel Admin</h1>
                        <div class="space-y-4">
                            <button id="userManagementBtn" class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700">Gestión Usuarios</button>
                            <button id="obsequioConfigBtn" class="w-full px-6 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700">Config Obsequio</button>
                            <button id="importExportInventarioBtn" class="w-full px-6 py-3 bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700">Importar/Exportar Inventario</button>
                            <button id="deepCleanBtn" class="w-full px-6 py-3 bg-red-700 text-white rounded-lg shadow-md hover:bg-red-800">Limpieza Profunda</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver Menú</button>
                        </div>
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

    function showDeepCleanView() {
        _floatingControls?.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h1 class="text-3xl font-bold text-red-600 mb-4 text-center">⚠️ Limpieza Profunda ⚠️</h1>
                        <p class="text-center text-red-700 mb-6 font-semibold">
                            ¡ADVERTENCIA! Eliminará permanentemente datos de TODOS los usuarios. NO SE PUEDE DESHACER. Descarga respaldo.
                        </p>
                        <div class="space-y-4 text-left mb-6 border p-4 rounded-lg bg-gray-50">
                            <label class="flex items-center space-x-3">
                                <input type="checkbox" id="cleanInventario" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <span>Inventario y Categorías (Todos los Usuarios)</span>
                            </label>
                            <label class="flex items-center space-x-3">
                                <input type="checkbox" id="cleanClientes" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <span>Clientes y Sectores (Público)</span>
                            </label>
                            <label class="flex items-center space-x-3">
                                <input type="checkbox" id="cleanVentas" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <span>Ventas y Cierres (Privados de Todos y Públicos)</span>
                            </label>
                             <label class="flex items-center space-x-3">
                                <input type="checkbox" id="cleanObsequios" class="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500">
                                <span>Config. y Registros Obsequios (Privados y Públicos)</span>
                            </label>
                        </div>
                        <div class="mb-6">
                            <label for="confirmCleanText" class="block text-sm font-medium text-gray-700 mb-1">Escribe "BORRAR DATOS":</label>
                            <input type="text" id="confirmCleanText" class="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-red-500 focus:border-red-500" placeholder="BORRAR DATOS">
                        </div>
                        <div class="space-y-4">
                            <button id="executeCleanBtn" class="w-full px-6 py-3 bg-red-700 text-white font-semibold rounded-lg shadow-md hover:bg-red-800 disabled:opacity-50" disabled>Iniciar Limpieza...</button>
                            <button id="backToAdminMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const confirmInput = document.getElementById('confirmCleanText');
        const executeBtn = document.getElementById('executeCleanBtn');
        confirmInput.addEventListener('input', () => { executeBtn.disabled = confirmInput.value !== 'BORRAR DATOS'; });
        document.getElementById('executeCleanBtn').addEventListener('click', handleBackupPromptBeforeClean);
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView);
    }

    function handleBackupPromptBeforeClean() {
        const confirmInput = document.getElementById('confirmCleanText');
        if (confirmInput.value !== 'BORRAR DATOS') { _showModal('Error', 'Escribe "BORRAR DATOS" para confirmar.'); return; }
        const cleanInv = document.getElementById('cleanInventario').checked, cleanCli = document.getElementById('cleanClientes').checked, cleanVen = document.getElementById('cleanVentas').checked, cleanObs = document.getElementById('cleanObsequios').checked;
        if (!cleanInv && !cleanCli && !cleanVen && !cleanObs) { _showModal('Aviso', 'No has seleccionado secciones.'); return; }

        const modalBackupContent = `
            <div class="text-center"> <h3 class="text-xl font-bold mb-4">Descargar Respaldo (Opcional)</h3> <p class="text-gray-600 mb-6">¿Deseas descargar un Excel de respaldo antes de eliminar?</p>
                <div class="flex flex-col sm:flex-row justify-center gap-3 mt-6">
                    <button id="backupAndContinueBtn" class="w-full sm:w-auto px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Descargar y Continuar</button>
                    <button id="continueWithoutBackupBtn" class="w-full sm:w-auto px-5 py-2.5 bg-yellow-500 text-gray-800 rounded-lg hover:bg-yellow-600">Continuar SIN Respaldo</button>
                    <button id="cancelCleanBtnModal" class="w-full sm:w-auto px-5 py-2.5 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Cancelar Limpieza</button>
                </div> </div> `;
        _showModal('Respaldo Opcional', modalBackupContent, null, '');

        document.getElementById('backupAndContinueBtn').addEventListener('click', async () => { await handleBackupBeforeClean(); handleDeepCleanConfirmation(); });
        document.getElementById('continueWithoutBackupBtn').addEventListener('click', handleDeepCleanConfirmation);
        document.getElementById('cancelCleanBtnModal').addEventListener('click', () => document.getElementById('modalContainer').classList.add('hidden'));
    }

    async function handleBackupBeforeClean() {
        // --- CORRECCIÓN: Revisar si ExcelJS está cargado, no XLSX ---
        if (typeof ExcelJS === 'undefined') { 
            _showModal('Error', 'Librería ExcelJS no cargada.'); 
            return false; 
        }
        _showModal('Progreso', 'Generando respaldo...');
        const cleanInv=document.getElementById('cleanInventario').checked, cleanCli=document.getElementById('cleanClientes').checked, cleanVen=document.getElementById('cleanVentas').checked, cleanObs=document.getElementById('cleanObsequios').checked;
        const pubProjId = 'ventas-9a210'; const today = new Date().toISOString().slice(0, 10); 
        
        // --- CORRECCIÓN: Usar ExcelJS ---
        const wb = new ExcelJS.Workbook(); 
        let sheetsAdded = 0;
        try {
            const fetchData = async (path) => { try { const snap = await _getDocs(_collection(_db, path)); return snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (err) { console.error(`Error backup ${path}:`, err); return []; } };
            
            // Helper para añadir hoja con datos
            const addSheet = (workbook, sheetName, data) => {
                if (data.length === 0) return;
                const ws = workbook.addWorksheet(sheetName);
                // Crear cabeceras dinámicamente
                const headers = Array.from(new Set(data.flatMap(row => Object.keys(row))));
                ws.columns = headers.map(h => ({ header: h, key: h, width: 20 }));
                ws.getRow(1).font = { bold: true };
                ws.addRows(data);
                sheetsAdded++;
            };

            if (cleanInv) { 
                addSheet(wb, 'Inventario_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/inventario`));
                addSheet(wb, 'Rubros_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/rubros`));
                addSheet(wb, 'Segmentos_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/segmentos`));
                addSheet(wb, 'Marcas_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/marcas`));
            }
            if (cleanCli) { 
                addSheet(wb, 'Clientes_Public', await fetchData(`artifacts/${pubProjId}/public/data/clientes`));
                addSheet(wb, 'Sectores_Public', await fetchData(`artifacts/${pubProjId}/public/data/sectores`));
            }
            if (cleanVen) { 
                addSheet(wb, 'Ventas_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/ventas`));
                addSheet(wb, 'Cierres_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/cierres`));
                addSheet(wb, 'Cierres_Vendedores', await fetchData(`public_data/${_appId}/user_closings`));
            }
            if (cleanObs) { 
                addSheet(wb, 'Obsequios_Admin', await fetchData(`artifacts/${_appId}/users/${_userId}/obsequios_entregados`));
                const admConfRef = _doc(_db,`artifacts/${_appId}/users/${_userId}/config/obsequio`); 
                const pubConfRef = _doc(_db,`artifacts/${pubProjId}/public/data/config/obsequio`); 
                const [admConfS, pubConfS] = await Promise.allSettled([_getDoc(admConfRef), _getDoc(pubConfRef)]); 
                const confs=[]; 
                if(admConfS.status==='fulfilled'&&admConfS.value.exists())confs.push({origen:'admin',...admConfS.value.data()}); 
                if(pubConfS.status==='fulfilled'&&pubConfS.value.exists())confs.push({origen:'public',...pubConfS.value.data()}); 
                addSheet(wb, 'Config_Obsequio', confs);
            }
            
            if (sheetsAdded > 0) { 
                // Descargar usando ExcelJS
                const buffer = await wb.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `Respaldo_Limpieza_${today}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);

                _showModal('Respaldo Descargado', `Archivo "Respaldo_Limpieza_${today}.xlsx" generado.`, null, 'OK'); await new Promise(r=>setTimeout(r,1500)); return true; 
            }
            else { _showModal('Aviso', 'No se encontraron datos para respaldar.', null, 'OK'); await new Promise(r=>setTimeout(r,1500)); return true; }
        } catch (error) { console.error("Error respaldo:", error); _showModal('Error Respaldo', `Error: ${error.message}. Limpieza cancelada.`); await new Promise(r=>setTimeout(r,1500)); return false; }
        finally { const modal = document.getElementById('modalContainer'); if(modal && !modal.classList.contains('hidden') && modal.querySelector('h3')?.textContent.startsWith('Progreso')) modal.classList.add('hidden'); }
    }

    function handleDeepCleanConfirmation() {
         _showModal('Confirmación Final Extrema', `<p class="text-red-600 font-bold">¡ÚLTIMA ADVERTENCIA!</p> Vas a borrar permanentemente las secciones seleccionadas para TODOS los usuarios. ¿Seguro?`, executeDeepClean, 'Sí, BORRAR DATOS');
    }

    async function executeDeepClean() {
        _showModal('Progreso', 'Iniciando limpieza profunda...');
        const cleanInv=document.getElementById('cleanInventario').checked, cleanCli=document.getElementById('cleanClientes').checked, cleanVen=document.getElementById('cleanVentas').checked, cleanObs=document.getElementById('cleanObsequios').checked;
        const colsToDelPub = []; const pubProjId = 'ventas-9a210'; let allUserIds = [];
        try { const uSnap = await _getDocs(_collection(_db, "users")); allUserIds = uSnap.docs.map(d => d.id); console.log(`Limpieza para ${allUserIds.length} usuarios.`); }
        catch (uErr) { console.error("Error obteniendo usuarios:", uErr); _showModal('Error Crítico', `No se pudo obtener lista usuarios. Limpieza cancelada: ${uErr.message}`); return; }

        if (cleanCli) { colsToDelPub.push({ path: `artifacts/${pubProjId}/public/data/clientes`, name: 'Clientes Públicos' }); colsToDelPub.push({ path: `artifacts/${pubProjId}/public/data/sectores`, name: 'Sectores Públicos' }); }
        if (cleanVen) { colsToDelPub.push({ path: `public_data/${_appId}/user_closings`, name: 'Cierres Vendedores Públicos' }); }
        if (cleanObs) { const pubConfRef = _doc(_db,`artifacts/${pubProjId}/public/data/config/obsequio`); try { await _deleteDoc(pubConfRef); console.log("Deleted public obsequio config."); } catch(e){ console.warn("Could not delete public obsequio config:", e.code); } }

        const privColsToClean = []; 
        if(cleanInv){
            privColsToClean.push({sub:'inventario',n:'Inventario'}); 
            privColsToClean.push({sub:'rubros',n:'Rubros'}); 
            privColsToClean.push({sub:'segmentos',n:'Segmentos'}); 
            privColsToClean.push({sub:'marcas',n:'Marcas'});
            // --- AÑADIDOS ---
            privColsToClean.push({sub:'config/productSortOrder',n:'Config Orden Catálogo',isDoc:true});
            privColsToClean.push({sub:'config/reporteCierreVentas',n:'Config Diseño Reporte',isDoc:true});
        } 
        if(cleanVen){
            privColsToClean.push({sub:'ventas',n:'Ventas'}); 
            privColsToClean.push({sub:'cierres',n:'Cierres'});
            // --- AÑADIDO ---
            privColsToClean.push({sub:'config/cargaInicialSnapshot',n:'Snapshot Carga Inicial',isDoc:true});
        } 
        if(cleanObs){
            privColsToClean.push({sub:'obsequios_entregados',n:'Obsequios Entregados'}); 
            privColsToClean.push({sub:'config/obsequio',n:'Config Obsequio Privada',isDoc:true});
        }
        
        let errorsOccurred = false; let deletedDocCount = 0; let deletedColCount = 0;

        for (const colInfo of colsToDelPub) { _showModal('Progreso', `Eliminando ${colInfo.name}...`); try { if(typeof limit!=='function'||typeof startAfter!=='function')throw new Error("Funciones limit/startAfter no disponibles."); const count = await deleteCollection(colInfo.path); console.log(`Deleted ${count} docs from ${colInfo.name}`); deletedDocCount+=count; deletedColCount++; } catch (error) { console.error(`Error public ${colInfo.name}:`, error); errorsOccurred=true; _showModal('Error Parcial', `Error ${colInfo.name}: ${error.message}. Continuando...`, null, 'OK'); await new Promise(r=>setTimeout(r,2000)); } }

        for (const targetUserId of allUserIds) { _showModal('Progreso', `Limpiando ${targetUserId.substring(0,6)}... (${allUserIds.indexOf(targetUserId)+1}/${allUserIds.length})`); console.log(`--- Cleaning private for ${targetUserId} ---`);
            for (const privCol of privColsToClean) { const fullPath = `artifacts/${_appId}/users/${targetUserId}/${privCol.sub}`; try { if (privCol.isDoc) { const docRef = _doc(_db, fullPath); await _deleteDoc(docRef); console.log(`  - Deleted doc ${privCol.n} (${fullPath})`); deletedDocCount++; } else { if(typeof limit!=='function'||typeof startAfter!=='function')throw new Error("Funciones limit/startAfter no disponibles."); const count = await deleteCollection(fullPath); console.log(`  - Deleted ${count} docs from ${privCol.n} (${fullPath})`); deletedDocCount+=count; } } catch (error) { if(error.code!=='not-found'&&error.code!=='permission-denied'){console.error(`  - Error ${privCol.n} for ${targetUserId}:`, error); errorsOccurred=true;} else if(error.code==='permission-denied'){console.warn(`  - Permission denied ${privCol.n} for ${targetUserId}.`); errorsOccurred=true;} else {console.log(`  - ${privCol.n} not found for ${targetUserId}.`);} } } }

        _rubroOrderCacheAdmin=null; _segmentoOrderCacheAdmin=null; if(window.inventarioModule)window.inventarioModule.invalidateSegmentOrderCache(); if(window.catalogoModule)window.catalogoModule.invalidateCache(); if(window.ventasModule)window.ventasModule.invalidateCache();
        _showModal(errorsOccurred?'Limpieza Completada (con errores)':'Limpieza Completada', `Intentado para ${allUserIds.length} usuarios. Docs/Configs eliminados: ${deletedDocCount}. ${errorsOccurred?'Ocurrieron errores. Revisa consola.':''}`, showAdminSubMenuView, 'OK');
    }

    async function deleteCollection(collectionPath) {
        if (typeof limit !== 'function' || typeof startAfter !== 'function') throw new Error("limit/startAfter no disponibles.");
        const batchSize = 400; const colRef = _collection(_db, collectionPath); let queryCursor = _query(colRef, limit(batchSize)); let deletedCount = 0; let lastVisible = null;
        while (true) { const snap = await _getDocs(queryCursor); if (snap.size === 0) break; const batch = _writeBatch(_db); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); deletedCount += snap.size; if (snap.docs.length > 0) lastVisible = snap.docs[snap.docs.length - 1]; else break; queryCursor = _query(colRef, startAfter(lastVisible), limit(batchSize)); }
        console.log(`Finished deleting ${deletedCount} docs from ${collectionPath}`); return deletedCount;
    }

    // --- Funciones para Importar/Exportar Inventario ---
    async function getRubroOrderMapAdmin() {
        if (_rubroOrderCacheAdmin) return _rubroOrderCacheAdmin; const map = {}; const ref = _collection(_db, `artifacts/${_appId}/users/${_userId}/rubros`); try { const snap = await _getDocs(ref); snap.docs.forEach(d => { const data = d.data(); map[data.name] = data.orden ?? 9999; }); _rubroOrderCacheAdmin = map; return map; } catch (e) { console.warn("Error getRubroOrderMapAdmin:", e); return {}; }
    }
    async function getSegmentoOrderMapAdmin() {
         if (_segmentoOrderCacheAdmin) return _segmentoOrderCacheAdmin; const map = {}; const ref = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`); try { const snap = await _getDocs(ref); snap.docs.forEach(d => { const data = d.data(); map[data.name] = data.orden ?? 9999; }); _segmentoOrderCacheAdmin = map; return map; } catch (e) { console.warn("Error getSegmentoOrderMapAdmin:", e); return {}; }
    }
    function showImportExportInventarioView() {
        _floatingControls?.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-lg"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold mb-6 text-center">Importar / Exportar Inventario</h1>
                <p class="text-center text-gray-600 mb-6 text-sm"> Exporta a Excel. Importa para añadir productos NUEVOS (ignora cantidad). </p>
                <div class="space-y-4">
                    <button id="exportInventarioBtn" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600">Exportar Inventario</button>
                    <button id="importInventarioBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Importar Inventario</button>
                    <button id="backToAdminMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                </div>
            </div> </div> </div>
        `;
        document.getElementById('exportInventarioBtn').addEventListener('click', handleExportInventario);
        document.getElementById('importInventarioBtn').addEventListener('click', showImportInventarioView);
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView);
    }
    async function handleExportInventario() {
        // --- CORRECCIÓN ---
        // Se cambió la librería de 'XLSX' (SheetJS) a 'ExcelJS' para soportar estilos.
        // La función de exportar inventario no se había actualizado.
        
        // 1. Revisar la librería correcta (ExcelJS)
        if (typeof ExcelJS === 'undefined') { 
            _showModal('Error', 'Librería ExcelJS no cargada.'); 
            return; 
        }
        _showModal('Progreso', 'Generando Excel...');
        
        try { 
            const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); 
            const snap = await _getDocs(invRef); 
            let inv = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
            const rOMap = await getRubroOrderMapAdmin(); 
            const sOMap = await getSegmentoOrderMapAdmin();
            
            // 2. Ordenar datos (lógica existente, sin cambios)
            inv.sort((a,b)=>{ const rOA=rOMap[a.rubro]??9999, rOB=rOMap[b.rubro]??9999; if(rOA!==rOB) return rOA-rOB; const sOA=sOMap[a.segmento]??9999, sOB=sOMap[b.segmento]??9999; if(sOA!==sOB) return sOA-sOB; const mC=(a.marca||'').localeCompare(b.marca||''); if(mC!==0) return mC; return (a.presentacion||'').localeCompare(b.presentacion||''); });
            
            // 3. Mapear datos (lógica existente, sin cambios)
            const dExport = inv.map(p=>({
                'Rubro':p.rubro||'',
                'Segmento':p.segmento||'',
                'Marca':p.marca||'',
                'Presentacion':p.presentacion||'',
                'CantidadActualUnidades':p.cantidadUnidades||0,
                'VentaPorUnd':p.ventaPor?.und?'SI':'NO',
                'VentaPorPaq':p.ventaPor?.paq?'SI':'NO',
                'VentaPorCj':p.ventaPor?.cj?'SI':'NO',
                'UnidadesPorPaquete':p.unidadesPorPaquete||'',
                'UnidadesPorCaja':p.unidadesPorCaja||'',
                'PrecioUnd':p.precios?.und||'',
                'PrecioPaq':p.precios?.paq||'',
                'PrecioCj':p.precios?.cj||'',
                'ManejaVacios':p.manejaVacios?'SI':'NO',
                'TipoVacio':p.tipoVacio||'',
                'IVA':p.iva!==undefined?`${p.iva}%`:''
            }));

            // 4. Crear el Excel usando ExcelJS (Lógica nueva)
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Inventario');
            
            // Definir columnas basadas en las claves de dExport
            worksheet.columns = [
                { header: 'Rubro', key: 'Rubro', width: 20 },
                { header: 'Segmento', key: 'Segmento', width: 20 },
                { header: 'Marca', key: 'Marca', width: 25 },
                { header: 'Presentacion', key: 'Presentacion', width: 35 },
                { header: 'CantidadActualUnidades', key: 'CantidadActualUnidades', width: 15, style: { numFmt: '0' } },
                { header: 'VentaPorUnd', key: 'VentaPorUnd', width: 10 },
                { header: 'VentaPorPaq', key: 'VentaPorPaq', width: 10 },
                { header: 'VentaPorCj', key: 'VentaPorCj', width: 10 },
                { header: 'UnidadesPorPaquete', key: 'UnidadesPorPaquete', width: 15, style: { numFmt: '0' } },
                { header: 'UnidadesPorCaja', key: 'UnidadesPorCaja', width: 15, style: { numFmt: '0' } },
                { header: 'PrecioUnd', key: 'PrecioUnd', width: 12, style: { numFmt: '$#,##0.00' } },
                { header: 'PrecioPaq', key: 'PrecioPaq', width: 12, style: { numFmt: '$#,##0.00' } },
                { header: 'PrecioCj', key: 'PrecioCj', width: 12, style: { numFmt: '$#,##0.00' } },
                { header: 'ManejaVacios', key: 'ManejaVacios', width: 10 },
                { header: 'TipoVacio', key: 'TipoVacio', width: 15 },
                { header: 'IVA', key: 'IVA', width: 8, style: { numFmt: '0"%"' } }
            ];
            
            // Poner cabecera en negrita
            worksheet.getRow(1).font = { bold: true };
            
            // Añadir los datos
            worksheet.addRows(dExport);
            
            // 5. Descargar el archivo (Lógica nueva)
            const today = new Date().toISOString().slice(0, 10); 
            const fileName = `Inventario_${today}.xlsx`;
            
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            const modal = document.getElementById('modalContainer'); 
            if(modal && !modal.classList.contains('hidden') && modal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                 modal.classList.add('hidden');
            }
            
        } catch (error) { 
            console.error("Error exportando:", error); 
            _showModal('Error', `Error: ${error.message}`); 
        }
        // --- FIN CORRECCIÓN ---
    }
    function showImportInventarioView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-4xl"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold mb-4 text-center">Importar Inventario</h2>
                <p class="text-center text-gray-600 mb-6 text-sm"> Selecciona archivo. Columnas MÍNIMAS: <strong>Rubro, Segmento, Marca, Presentacion</strong>. Opcionales: VentaPorUnd(SI/NO), VentaPorPaq, VentaPorCj, UnidadesPorPaquete, UnidadesPorCaja, PrecioUnd, PrecioPaq, PrecioCj, ManejaVacios(SI/NO), TipoVacio, IVA(%). La columna <strong>CantidadActualUnidades</strong> se IGNORARÁ. Los productos nuevos se añadirán con cantidad 0. </p>
                <input type="file" id="inventario-excel-uploader" accept=".xlsx,.xls,.csv" class="w-full p-4 border-2 border-dashed rounded-lg mb-6">
                <div id="inventario-preview-container" class="overflow-auto max-h-72 border rounded-lg"></div>
                <div id="inventario-import-actions" class="mt-6 flex flex-col sm:flex-row gap-4 hidden"> <button id="confirmInventarioImportBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Confirmar e Importar</button> <button id="cancelInventarioImportBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Cancelar</button> </div>
                 <button id="backToImportExportBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        document.getElementById('inventario-excel-uploader').addEventListener('change', handleFileUploadInventario);
        document.getElementById('backToImportExportBtn').addEventListener('click', showImportExportInventarioView);
    }

    // --- INICIO DE LA CORRECCIÓN (Error XLSX is not defined) ---
    function handleFileUploadInventario(event) {
        // --- CORRECCIÓN: Comprobación más robusta ---
        if (!event.target || !event.target.files || event.target.files.length === 0) {
            console.warn("handleFileUploadInventario llamado sin archivo.");
            renderPreviewTableInventario([]);
            return;
        }
        const file = event.target.files[0];
        // --- FIN CORRECCIÓN ---

        _inventarioParaImportar = [];
        const reader = new FileReader(); 
        
        // 1. Convertir la función a 'async' para poder usar 'await'
        reader.onload = async function(e) { 
            // 2. 'data' ahora es un ArrayBuffer (ver reader.readAsArrayBuffer abajo)
            const data = e.target.result; 
            let jsonData = []; 
            try { 
                // 3. Usar ExcelJS para leer el ArrayBuffer en lugar de XLSX.read
                if (typeof ExcelJS === 'undefined') {
                     throw new Error("La librería ExcelJS no está cargada.");
                }
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);
                const worksheet = workbook.getWorksheet(1); // Obtener la primera hoja

                // 4. Convertir las filas de ExcelJS al formato esperado (array de arrays)
                jsonData = [];
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    // row.values es [null, 'valor1', 'valor2', ...]
                    // Usamos .slice(1) para omitir el primer 'null' y que coincida con el formato de sheet_to_json
                    // Si la fila 1 (cabecera) tiene valores vacíos (ej: undefined o null), reemplazarlos con string vacío
                    // para evitar que el .toString() falle más adelante
                    if (rowNumber === 1) {
                         const headerValues = row.values.slice(1).map(val => val === null || val === undefined ? '' : val);
                         jsonData.push(headerValues);
                    } else {
                         jsonData.push(row.values.slice(1));
                    }
                });
            
            } catch (readError) { 
                console.error("Error al leer el archivo Excel con ExcelJS:", readError);
                // CORRECCIÓN: Usar el mensaje de error real
                _showModal('Error Lectura', `Error: ${readError.message}`); 
                renderPreviewTableInventario([]); // Limpiar vista previa en error
                return; 
            }

            if (jsonData.length < 2) { _showModal('Error', 'Archivo vacío.'); renderPreviewTableInventario([]); return; }
            
            // Asegurarse de que las cabeceras sean strings antes de llamar a .toLowerCase()
            const headers = jsonData[0].map(h=>(h?h.toString().toLowerCase().trim().replace(/\s+/g,''):''));
            
            const reqHeaders=['rubro','segmento','marca','presentacion'];
            const optHeaders=['ventaporund','ventaporpaq','ventaporcj','unidadesporpaquete','unidadesporcaja','preciound','preciopaq','preciocj','manejavacios','tipovacio','iva'];
            const hMap={}; let missing=false;
            reqHeaders.forEach(rh=>{ const i=headers.indexOf(rh); if(i!==-1)hMap[rh]=i; else{_showModal('Error',`Falta columna requerida: "${rh}"`); missing=true;}}); if(missing){renderPreviewTableInventario([]); return;}
            optHeaders.forEach(oh=>{ const i=headers.indexOf(oh); if(i!==-1)hMap[oh]=i; });

            _inventarioParaImportar = jsonData.slice(1).map((row, rIdx) => {
                const item = {
                    rubro: (row[hMap['rubro']] || '').toString().trim().toUpperCase(),
                    segmento: (row[hMap['segmento']] || '').toString().trim().toUpperCase(),
                    marca: (row[hMap['marca']] || '').toString().trim().toUpperCase(),
                    presentacion: (row[hMap['presentacion']] || '').toString().trim(),
                    ventaPor: {
                        und: (row[hMap['ventaporund']] || 'SI').toString().trim().toUpperCase() === 'SI',
                        paq: (row[hMap['ventaporpaq']] || 'NO').toString().trim().toUpperCase() === 'SI',
                        cj: (row[hMap['ventaporcj']] || 'NO').toString().trim().toUpperCase() === 'SI'
                    },
                    unidadesPorPaquete: parseInt(row[hMap['unidadesporpaquete']], 10) || 1,
                    unidadesPorCaja: parseInt(row[hMap['unidadesporcaja']], 10) || 1,
                    precios: {
                        und: parseFloat(row[hMap['preciound']]) || 0,
                        paq: parseFloat(row[hMap['preciopaq']]) || 0,
                        cj: parseFloat(row[hMap['preciocj']]) || 0
                    },
                    manejaVacios: (row[hMap['manejavacios']] || 'NO').toString().trim().toUpperCase() === 'SI',
                    tipoVacio: (row[hMap['tipovacio']] || null)?.toString().trim() || null,
                    iva: parseInt((row[hMap['iva']] || '16').toString().replace('%','').trim(), 10) || 16,
                    isValid: true,
                    key: '',
                    originalRow: row
                };
                if (!item.rubro || !item.segmento || !item.marca || !item.presentacion) { console.warn(`Fila ${rIdx+2}: Faltan campos clave. Fila ignorada.`); item.isValid = false; item.error = 'Faltan campos clave'; return null; }
                if (!item.ventaPor.paq) item.unidadesPorPaquete = 1;
                if (!item.ventaPor.cj) item.unidadesPorCaja = 1;
                if (!item.ventaPor.und && !item.ventaPor.paq && !item.ventaPor.cj) item.ventaPor.und = true;
                if (item.manejaVacios && !item.tipoVacio) item.manejaVacios = false;
                let pFinalUnd = 0; if (item.precios.und > 0) pFinalUnd = item.precios.und; else if (item.precios.paq > 0 && item.unidadesPorPaquete > 0) pFinalUnd = item.precios.paq / item.unidadesPorPaquete; else if (item.precios.cj > 0 && item.unidadesPorCaja > 0) pFinalUnd = item.precios.cj / item.unidadesPorCaja; item.precioPorUnidad = parseFloat(pFinalUnd.toFixed(2));
                item.key = `${item.rubro}|${item.segmento}|${item.marca}|${item.presentacion}`.toUpperCase();
                return item;
            }).filter(item => item !== null);

            renderPreviewTableInventario(_inventarioParaImportar);
        }; 
        reader.onerror = function(e){_showModal('Error Archivo','No se pudo leer.');renderPreviewTableInventario([]);}; 
        
        // --- CORRECCIÓN: Leer como ArrayBuffer para ExcelJS, no como BinaryString ---
        reader.readAsArrayBuffer(file);
    }
    // --- FIN DE LA CORRECCIÓN ---


    function renderPreviewTableInventario(items) {
        const cont=document.getElementById('inventario-preview-container'), acts=document.getElementById('inventario-import-actions'), back=document.getElementById('backToImportExportBtn'), upInp=document.getElementById('inventario-excel-uploader'); if(!cont||!acts||!back||!upInp) return;
        if(items.length===0){cont.innerHTML=`<p class="text-center text-gray-500 p-4">No hay productos válidos.</p>`; acts.classList.add('hidden'); back.classList.remove('hidden'); return;}
        const vCount=items.length;
        // --- CORRECCIÓN: tHTML -> tableHTML ---
        let tableHTML=`<div class="p-4"><h3 class="font-bold text-lg mb-2">Vista Previa (${vCount} productos a procesar)</h3><p class="text-sm text-gray-600 mb-2">Los productos existentes se ignorarán. Los nuevos se añadirán con cantidad 0.</p><table class="min-w-full bg-white text-xs"><thead class="bg-gray-200 sticky top-0"><tr><th>Rubro</th><th>Segmento</th><th>Marca</th><th>Presentación</th><th>Precio Und</th><th>Precio Paq</th><th>Precio Cj</th><th>IVA</th></tr></thead><tbody>`;
        items.forEach(i=>{
             tableHTML+=`<tr class="border-b"><td class="py-1 px-2">${i.rubro}</td><td class="py-1 px-2">${i.segmento}</td><td class="py-1 px-2">${i.marca}</td><td class="py-1 px-2">${i.presentacion}</td><td class="py-1 px-2 text-right">${i.precios.und.toFixed(2)}</td><td class="py-1 px-2 text-right">${i.precios.paq.toFixed(2)}</td><td class="py-1 px-2 text-right">${i.precios.cj.toFixed(2)}</td><td class="py-1 px-2 text-center">${i.iva}%</td></tr>`;
        });
        tableHTML+='</tbody></table></div>'; cont.innerHTML=tableHTML;
        // --- FIN CORRECCIÓN ---
        acts.classList.remove('hidden'); back.classList.add('hidden'); document.getElementById('confirmInventarioImportBtn').onclick=handleConfirmInventarioImport; document.getElementById('cancelInventarioImportBtn').onclick=()=>{_inventarioParaImportar=[]; upInp.value=''; cont.innerHTML=''; acts.classList.add('hidden'); back.classList.remove('hidden');};
    }

    async function handleConfirmInventarioImport() {
        const itemsToProcess = _inventarioParaImportar;
        if (itemsToProcess.length === 0) { _showModal('Aviso', 'No hay productos válidos para procesar.'); return; }

        _showModal('Progreso', `Verificando ${itemsToProcess.length} productos con inventario actual...`);

        try {
            // --- INICIO: Lógica para identificar y agregar nuevas categorías ---
            const categoriasNuevas = { rubros: new Set(), segmentos: new Set(), marcas: new Set() };
            itemsToProcess.forEach(item => {
                if (item.rubro) categoriasNuevas.rubros.add(item.rubro);
                if (item.segmento) categoriasNuevas.segmentos.add(item.segmento);
                if (item.marca) categoriasNuevas.marcas.add(item.marca);
            });

            const categoriasParaAgregar = { rubros: [], segmentos: [], marcas: [] };

            for (const tipoCategoria of ['rubros', 'segmentos', 'marcas']) {
                const nombresNuevos = Array.from(categoriasNuevas[tipoCategoria]);
                if (nombresNuevos.length > 0) {
                    _showModal('Progreso', `Verificando ${tipoCategoria} existentes...`);
                    const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${tipoCategoria}`);
                    const snapshot = await _getDocs(collectionRef);
                    const nombresExistentes = new Set(snapshot.docs.map(doc => doc.data().name));
                    nombresNuevos.forEach(nombre => {
                        if (!nombresExistentes.has(nombre)) {
                            categoriasParaAgregar[tipoCategoria].push({ name: nombre });
                        }
                    });
                }
            }
            // --- FIN: Lógica para identificar nuevas categorías ---

            // Verificar productos existentes (igual que antes)
            const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const snap = await _getDocs(invRef);
            const curInvMap = new Map();
            snap.docs.forEach(d => {
                const data = d.data();
                const key = `${data.rubro || ''}|${data.segmento || ''}|${data.marca || ''}|${data.presentacion || ''}`.toUpperCase();
                curInvMap.set(key, d.id);
            });

            // Preparar batch para productos NUEVOS
            const batchProductos = _writeBatch(_db);
            let addedProductCount = 0;
            let skippedProductCount = 0;
            const addedProductsData = []; // Para propagación

            itemsToProcess.forEach(item => {
                const key = item.key;
                if (!curInvMap.has(key)) {
                    // Excluir propiedades temporales antes de guardar
                    const { isValid, key: itemKey, originalRow, error, ...newProductData } = item;
                    newProductData.cantidadUnidades = 0; // Añadir con cantidad 0
                    const newDocRef = _doc(invRef); // Generar ID localmente
                    batchProductos.set(newDocRef, newProductData);
                    addedProductCount++;
                    // Guardar datos + ID para propagación posterior
                    addedProductsData.push({ id: newDocRef.id, data: newProductData });
                    console.log(`Adding new product: ${item.presentacion}`);
                } else {
                    skippedProductCount++;
                    console.log(`Skipping existing product: ${item.presentacion}`);
                }
            });

            // Contar categorías nuevas
            const addedRubroCount = categoriasParaAgregar.rubros.length;
            const addedSegmentoCount = categoriasParaAgregar.segmentos.length;
            const addedMarcaCount = categoriasParaAgregar.marcas.length;
            const totalCategoriasNuevas = addedRubroCount + addedSegmentoCount + addedMarcaCount;

            // Mensaje de confirmación
            let confirmMsg = '';
            if (addedProductCount > 0) confirmMsg += `Se añadirán ${addedProductCount} producto(s) nuevo(s) (stock 0). `;
            if (skippedProductCount > 0) confirmMsg += `${skippedProductCount} producto(s) existentes serán ignorados. `;
            if (totalCategoriasNuevas > 0) confirmMsg += `Se añadirán ${totalCategoriasNuevas} categorías nuevas (${addedRubroCount}R/${addedSegmentoCount}S/${addedMarcaCount}M). `;
            if (!confirmMsg) {
                 _showModal('Aviso', 'No hay productos ni categorías nuevas para importar.');
                 showImportExportInventarioView();
                 return;
            }
            confirmMsg += '¿Continuar?';

            _showModal('Confirmar Importación', confirmMsg, async () => {
                _showModal('Progreso', 'Guardando cambios...');
                try {
                    // --- INICIO: Guardar categorías nuevas ---
                    let batchCategorias = _writeBatch(_db);
                    let catOps = 0;
                    const BATCH_LIMIT = 490;
                    const addedCategoriesData = []; // Para propagación

                    for (const tipoCategoria of ['rubros', 'segmentos', 'marcas']) {
                        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${tipoCategoria}`);
                        for (const catData of categoriasParaAgregar[tipoCategoria]) {
                            const newCatRef = _doc(collectionRef); // Generar ID
                            batchCategorias.set(newCatRef, catData);
                            addedCategoriesData.push({ collectionName: tipoCategoria, id: newCatRef.id, data: catData }); // Guardar para propagar
                            catOps++;
                            if (catOps >= BATCH_LIMIT) {
                                await batchCategorias.commit();
                                batchCategorias = _writeBatch(_db);
                                catOps = 0;
                            }
                        }
                    }
                    if (catOps > 0) {
                        await batchCategorias.commit();
                        console.log(`Added ${totalCategoriasNuevas} new categories locally.`);
                    }
                    // --- FIN: Guardar categorías nuevas ---

                    // --- INICIO: Guardar productos nuevos ---
                    if (addedProductCount > 0) {
                        await batchProductos.commit();
                        console.log(`Added ${addedProductCount} new products locally.`);
                    }
                    // --- FIN: Guardar productos nuevos ---

                    // --- INICIO: Propagación ---
                    _showModal('Progreso', 'Propagando cambios a otros usuarios...');
                    let propErrors = 0;

                    // Propagar categorías nuevas
                    if (addedCategoriesData.length > 0 && window.adminModule?.propagateCategoryChange) {
                        for (const catInfo of addedCategoriesData) {
                            try {
                                await window.adminModule.propagateCategoryChange(catInfo.collectionName, catInfo.id, catInfo.data);
                            } catch (propError) {
                                console.error(`Error propagating new category ${catInfo.collectionName}/${catInfo.id}:`, propError);
                                propErrors++;
                            }
                        }
                    } else if (addedCategoriesData.length > 0) {
                        console.warn('Propagate category function not found, skipping category propagation.');
                        // Opcional: Mostrar advertencia al usuario
                    }

                    // Propagar productos nuevos
                    if (addedProductsData.length > 0 && window.adminModule?.propagateProductChange) {
                        for (const prodInfo of addedProductsData) {
                            try {
                                await window.adminModule.propagateProductChange(prodInfo.id, prodInfo.data);
                            } catch (propError) {
                                console.error(`Error propagating new product ${prodInfo.id}:`, propError);
                                propErrors++;
                            }
                        }
                    } else if (addedProductsData.length > 0) {
                         console.warn('Propagate product function not found, skipping product propagation.');
                         // Opcional: Mostrar advertencia al usuario
                    }
                    // --- FIN: Propagación ---

                    // Mostrar resultado final
                    let finalMsg = '';
                    if (addedProductCount > 0) finalMsg += `Se añadieron ${addedProductCount} producto(s). `;
                    if (totalCategoriasNuevas > 0) finalMsg += `Se añadieron ${totalCategoriasNuevas} categoría(s). `;
                    if (propErrors > 0) {
                         _showModal('Advertencia', `${finalMsg} Ocurrieron ${propErrors} errores al propagar.`, showImportExportInventarioView);
                    } else {
                         _showModal('Éxito', `${finalMsg} Propagado correctamente.`, showImportExportInventarioView);
                    }
                    // Invalidar caché local de categorías si existe (ej. en inventario.js)
                    if (window.inventarioModule?.invalidateSegmentOrderCache) {
                         window.inventarioModule.invalidateSegmentOrderCache(); // Esto también limpia caché de marcas
                    }


                } catch (commitError) {
                    console.error("Error committing changes:", commitError);
                    _showModal('Error', `Error al guardar cambios: ${commitError.message}`);
                }
            }, 'Sí, Importar');

        } catch (error) {
            console.error("Error during inventory import preparation:", error);
            _showModal('Error', `Error durante la preparación de la importación: ${error.message}`);
        }
        finally {
             // Limpiar caché de importación independientemente del resultado
            _inventarioParaImportar = [];
            // Resetear input de archivo
            const uploader = document.getElementById('inventario-excel-uploader');
            if (uploader) uploader.value = '';
        }
    }


    // --- Funciones de Gestión de Usuarios, Perfil, Config Obsequio, Propagación ---
    function showUserManagementView() {
         _floatingControls?.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <div class="flex justify-between items-center mb-6"> <h1 class="text-3xl font-bold flex-grow text-center">Gestión Usuarios</h1> <button id="backToAdminMenuBtn" class="px-4 py-2 bg-gray-400 text-white text-sm rounded-lg shadow-md hover:bg-gray-500 ml-4 flex-shrink-0">Volver</button> </div>
                <div id="user-list-container" class="overflow-x-auto max-h-96"> <p class="text-center text-gray-500">Cargando...</p> </div>
            </div> </div> </div>
        `;
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView); renderUserList();
    };
    async function renderUserList() {
        const cont = document.getElementById('user-list-container'); if (!cont) return;
        try { const uRef = _collection(_db, "users"); const snap = await _getDocs(uRef); const users = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>(a.email||'').localeCompare(b.email||''));
            if (users.length === 0) { cont.innerHTML = `<p class="text-center text-gray-500">No hay usuarios.</p>`; return; }
            let tHTML = `<table class="min-w-full bg-white text-sm"><thead class="bg-gray-200 sticky top-0 z-10"><tr><th class="py-2 px-4 border-b text-left">Email</th><th class="py-2 px-4 border-b text-left">Rol</th></tr></thead><tbody>`;
            users.forEach(u => { tHTML += `<tr class="hover:bg-gray-50"><td class="py-2 px-4 border-b">${u.email||'N/A'}</td><td class="py-2 px-4 border-b"><select onchange="window.adminModule.handleRoleChange('${u.id}', this.value, '${u.email||'N/A'}')" class="w-full p-1 border rounded-lg bg-gray-50 text-sm"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></td></tr>`; });
            tHTML += `</tbody></table>`; cont.innerHTML = tHTML;
        } catch (error) { console.error("Error lista usuarios:", error); cont.innerHTML = `<p class="text-red-500">Error al cargar.</p>`; }
    }
    async function handleRoleChange(userIdToChange, newRole, userEmail) {
        if (userIdToChange === _userId && newRole === 'user') { const uRef = _collection(_db, "users"); const qAd = _query(uRef, _where("role", "==", "admin")); const adSnap = await _getDocs(qAd); if (adSnap.size <= 1) { _showModal('No Permitido', 'No puedes quitarte el rol si eres el único admin.'); renderUserList(); return; } }
        _showModal('Confirmar Cambio Rol', `Cambiar rol de <strong>${userEmail}</strong> a <strong>${newRole}</strong>?`, async () => { _showModal('Progreso', 'Actualizando...'); try { const uDRef = _doc(_db, "users", userIdToChange); await _setDoc(uDRef, { role: newRole }, { merge: true }); _showModal('Éxito', 'Rol actualizado.'); renderUserList(); } catch (error) { console.error("Error cambiando rol:", error); _showModal('Error', 'No se pudo actualizar.'); renderUserList(); } }, 'Sí, Cambiar Rol', ()=>{renderUserList();});
    }
    async function showUserProfileView() {
         _floatingControls?.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-lg"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h1 class="text-3xl font-bold mb-6 text-center">Mi Perfil</h1>
                <form id="userProfileForm" class="space-y-4 text-left"> <div> <label for="profileNombre">Nombre:</label> <input type="text" id="profileNombre" class="w-full px-4 py-2 border rounded-lg" required> </div> <div> <label for="profileApellido">Apellido:</label> <input type="text" id="profileApellido" class="w-full px-4 py-2 border rounded-lg" required> </div> <div> <label for="profileCamion">Camión:</label> <input type="text" id="profileCamion" class="w-full px-4 py-2 border rounded-lg" placeholder="Ej: Placa ABC-123"> </div> <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Guardar</button> </form>
                <button id="backToMenuBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div> </div> </div>
        `;
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu); document.getElementById('userProfileForm').addEventListener('submit', handleSaveProfile);
        try { const uDRef = _doc(_db, "users", _userId); const uDoc = await _getDoc(uDRef); if (uDoc.exists()) { const d = uDoc.data(); document.getElementById('profileNombre').value = d.nombre||''; document.getElementById('profileApellido').value = d.apellido||''; document.getElementById('profileCamion').value = d.camion||''; } else { const cUser = auth.currentUser; if(cUser){ await _setDoc(uDRef, { email: cUser.email, role: 'user', createdAt: new Date() }); } else { _showModal('Error', 'No autenticado.'); } } } catch (error) { console.error("Error cargando perfil:", error); _showModal('Error', 'No se pudo cargar.'); }
    }
    async function handleSaveProfile(e) {
        e.preventDefault(); const n=document.getElementById('profileNombre').value.trim(), a=document.getElementById('profileApellido').value.trim(), c=document.getElementById('profileCamion').value.trim(); if (!n||!a) { _showModal('Error', 'Nombre y apellido requeridos.'); return; } const pData={nombre:n, apellido:a, camion:c}; _showModal('Progreso','Guardando...'); try { const uDRef = _doc(_db, "users", _userId); await _setDoc(uDRef, pData, { merge: true }); _showModal('Éxito','Perfil actualizado.'); } catch (error) { console.error("Error guardando perfil:", error); _showModal('Error','Error al guardar.'); }
    }
    async function showObsequioConfigView() {
         _floatingControls?.classList.add('hidden'); const pubConfPath = `artifacts/ventas-9a210/public/data/config/obsequio`;
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"> <div class="container mx-auto max-w-lg"> <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <div class="flex justify-between items-center mb-6"> <h1 class="text-2xl font-bold flex-grow text-center">Configurar Obsequio</h1> <button id="backToAdminMenuBtn" class="px-4 py-2 bg-gray-400 text-white text-sm rounded-lg shadow-md hover:bg-gray-500 ml-4 flex-shrink-0">Volver</button> </div>
                <p class="text-gray-600 mb-4 text-center text-sm">Selecciona producto obsequio (maneja vacíos, venta por caja). Configuración pública.</p>
                <div class="space-y-4 text-left"> <div> <label for="obsequioProductSelect">Producto:</label> <select id="obsequioProductSelect" class="w-full px-4 py-2 border rounded-lg"> <option value="">Cargando...</option> </select> </div> <button id="saveObsequioConfigBtn" class="w-full px-6 py-3 bg-purple-500 text-white rounded-lg shadow-md hover:bg-purple-600">Guardar Config Pública</button> </div>
            </div> </div> </div>
        `;
        document.getElementById('backToAdminMenuBtn').addEventListener('click', showAdminSubMenuView); document.getElementById('saveObsequioConfigBtn').addEventListener('click', handleSaveObsequioConfig); await loadAndPopulateObsequioSelect();
    }
    async function loadAndPopulateObsequioSelect() {
        const selEl = document.getElementById('obsequioProductSelect'); if (!selEl) return; const pubConfPath = `artifacts/ventas-9a210/public/data/config/obsequio`;
        try { const invRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`); const snap = await _getDocs(invRef); const pVal = snap.docs.map(d=>({id: d.id,...d.data()})).filter(p=>p.manejaVacios&&p.ventaPor?.cj).sort((a,b)=>`${a.marca} ${a.segmento} ${a.presentacion}`.localeCompare(`${b.marca} ${b.segmento} ${b.presentacion}`));
            selEl.innerHTML='<option value="">-- Seleccione --</option>'; const saveBtn = document.getElementById('saveObsequioConfigBtn');
            if (pVal.length===0) { selEl.innerHTML='<option value="">No hay productos válidos</option>'; selEl.disabled=true; if(saveBtn) saveBtn.disabled=true; }
            else { pVal.forEach(p=>{selEl.innerHTML+=`<option value="${p.id}">${p.marca} - ${p.segmento} - ${p.presentacion}</option>`;}); selEl.disabled=false; if(saveBtn) saveBtn.disabled=false; const confRef = _doc(_db, pubConfPath); const confSnap = await _getDoc(confRef); if (confSnap.exists()){ _obsequioProductId = confSnap.data().productoId; if (_obsequioProductId && pVal.some(p=>p.id===_obsequioProductId)) selEl.value=_obsequioProductId; else if (_obsequioProductId) _obsequioProductId=null; } }
        } catch (error) { console.error("Error cargando obsequio:", error); selEl.innerHTML='<option value="">Error</option>'; selEl.disabled=true; const saveBtn = document.getElementById('saveObsequioConfigBtn'); if(saveBtn) saveBtn.disabled=true; }
    }
    async function handleSaveObsequioConfig() {
        const selPId = document.getElementById('obsequioProductSelect').value; const pubConfPath = `artifacts/ventas-9a210/public/data/config/obsequio`; if (!selPId) { _showModal('Error', 'Selecciona producto.'); return; } _showModal('Progreso','Guardando...');
        try { const confRef = _doc(_db, pubConfPath); await _setDoc(confRef, { productoId: selPId }); _obsequioProductId = selPId; _showModal('Éxito','Configuración guardada.'); showAdminSubMenuView(); }
        catch (error) { console.error("Error guardando obsequio:", error); _showModal('Error','Error al guardar.'); }
    }
    async function _getAllOtherUserIds() {
        try { const uRef = _collection(_db, "users"); const snap = await _getDocs(uRef); const uIds = snap.docs.map(d => d.id); console.log("User IDs for propagation:", uIds); return uIds; }
        catch (error) { console.error("Error get users:", error); _showModal('Error', 'No se pudo obtener lista usuarios.'); return []; }
    }
    async function propagateProductChange(productId, productData) {
        if (!productId) { console.error("propagateProductChange: productId missing."); return; } const allUIds = await _getAllOtherUserIds(); if (allUIds.length === 0) return; console.log(`Propagating product ${productId} to users:`, allUIds); const BATCH_LIMIT = 490; let batch = _writeBatch(_db); let ops = 0; let errors = false;
        try { for (const tUserId of allUIds) { const tPRef = _doc(_db, `artifacts/${_appId}/users/${tUserId}/inventario`, productId); if (productData === null) { batch.delete(tPRef); } else { const { cantidadUnidades, ...defData } = productData; const tDSnap = await _getDoc(tPRef); if (tDSnap.exists()) { batch.set(tPRef, defData, { merge: true }); } else { const initData = { ...defData, cantidadUnidades: 0 }; batch.set(tPRef, initData); } } ops++; if (ops >= BATCH_LIMIT) { await batch.commit(); batch = _writeBatch(_db); ops = 0; } } if (ops > 0) await batch.commit(); const modal = document.getElementById('modalContainer'); if(modal && !modal.classList.contains('hidden') && modal.querySelector('h3')?.textContent.startsWith('Progreso')) modal.classList.add('hidden'); console.log(`Propagation complete for product ${productId}.`); } catch (error) { errors = true; console.error("Error propagating product:", error); window.showModal('Error', `Error propagando producto: ${error.message}.`); }
    }
     async function propagateCategoryChange(collectionName, itemId, itemData) {
         if (!collectionName || !itemId) { console.error("propagateCategoryChange: missing args."); return; } const allUIds = await _getAllOtherUserIds(); if (allUIds.length === 0) return; console.log(`Propagating category ${collectionName} (${itemId}) to ${allUIds.length} users...`); const BATCH_LIMIT = 490; let batch = _writeBatch(_db); let ops = 0; let errors = false;
         try { for (const tUserId of allUIds) { const tIRef = _doc(_db, `artifacts/${_appId}/users/${tUserId}/${collectionName}`, itemId); if (itemData === null) batch.delete(tIRef); else batch.set(tIRef, itemData); ops++; if (ops >= BATCH_LIMIT) { await batch.commit(); batch = _writeBatch(_db); ops = 0; } } if (ops > 0) await batch.commit(); console.log(`Propagation complete for category ${collectionName} (${itemId}).`); } catch (error) { errors = true; console.error(`Error propagating category ${collectionName} (${itemId}):`, error); window.showModal('Error Propagación', `Error al actualizar categoría.`); }
     }
     async function propagateCategoryOrderChange(collectionName, orderedIds) {
          if (!collectionName || !Array.isArray(orderedIds)) { console.error("propagateCategoryOrderChange: missing args."); return; } const allUIds = await _getAllOtherUserIds(); if (allUIds.length === 0) return; console.log(`Propagating order for ${collectionName} to users:`, allUIds); const BATCH_LIMIT = 490; let errors = false;
          try { const oMap = new Map(orderedIds.map((id, i) => [id, i])); let maxOrdAdmin = orderedIds.length - 1;
              for (const tUserId of allUIds) { let batch = _writeBatch(_db); let ops = 0; const tColRef = _collection(_db, `artifacts/${_appId}/users/${tUserId}/${collectionName}`); const snap = await _getDocs(tColRef); let uMaxOrd = maxOrdAdmin; const itemsUser = snap.docs.map(d => ({ id: d.id, data: d.data() }));
                  for (const item of itemsUser) { const cOrd = item.data.orden; let nOrd; if (oMap.has(item.id)) { nOrd = oMap.get(item.id); if (cOrd !== nOrd) { const tIRef = _doc(tColRef, item.id); batch.update(tIRef, { orden: nOrd }); ops++; } uMaxOrd = Math.max(uMaxOrd, nOrd); } if (ops >= BATCH_LIMIT) { await batch.commit(); batch = _writeBatch(_db); ops = 0; } }
                  itemsUser.sort((a,b)=> (a.data.name || '').localeCompare(b.data.name || ''));
                  for (const item of itemsUser) { if (!oMap.has(item.id)) { uMaxOrd++; const nOrd = uMaxOrd; const cOrd = item.data.orden; if (cOrd !== nOrd) { const tIRef = _doc(tColRef, item.id); batch.update(tIRef, { orden: nOrd }); ops++; } } if (ops >= BATCH_LIMIT) { await batch.commit(); batch = _writeBatch(_db); ops = 0; } }
                  if (ops > 0) await batch.commit();
              } const modal = document.getElementById('modalContainer'); if(modal && !modal.classList.contains('hidden') && modal.querySelector('h3')?.textContent.startsWith('Progreso')) modal.classList.add('hidden'); console.log(`Order propagation complete for ${collectionName}.`);
          } catch (error) { errors = true; console.error(`Error propagando orden ${collectionName}:`, error); window.showModal('Error Propagación', `Error: ${error.message}`); }
     }

    window.adminModule = {
        handleRoleChange,
        propagateProductChange,
        propagateCategoryChange,
        propagateCategoryOrderChange
    };

})();

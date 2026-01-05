// --- Lógica del módulo de Gestión de Obsequios ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal;
    
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _getDocs, _writeBatch, _runTransaction, _query, _where, _deleteDoc;

    // Estado específico del módulo
    let _clientesCache = [];
    let _inventarioCache = []; // Caché del inventario del usuario actual
    let _obsequioConfig = { productoId: null, productoData: null }; // Configuración del producto de obsequio
    let _obsequioActual = { cliente: null, cantidadEntregada: 0, vaciosRecibidos: 0, observacion: '' };
    let _lastObsequiosSearch = []; // Caché para los resultados de búsqueda del registro

    // Constante para tipos de vacío (debe coincidir con inventario.js)
    const TIPOS_VACIO = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    
    // RUTA ACTUALIZADA PARA EL NUEVO PROYECTO
    const OBSEQUIO_CONFIG_PATH = `artifacts/${'dist-castillo-sales'}/public/data/config/obsequio`;

    /**
     * Inicializa el módulo de obsequios con las dependencias de la app.
     */
    window.initObsequios = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;

        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _getDoc = dependencies.getDoc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch;
        _runTransaction = dependencies.runTransaction;
        _query = dependencies.query;
        _where = dependencies.where;
        _deleteDoc = dependencies.deleteDoc;

        console.log("Módulo Obsequios vinculado exitosamente a: dist-castillo-sales");
    };

    /**
     * Renderiza la vista principal de obsequios.
     */
    const renderObsequios = async () => {
        _mainContent.innerHTML = `
            <div class="space-y-6 animate-fade-in-up pb-20">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h2 class="text-3xl font-black text-gray-900 tracking-tight">Obsequios</h2>
                        <p class="text-gray-500 text-sm">Entrega de cortesías y promociones</p>
                    </div>
                    <div class="flex gap-2 w-full md:w-auto">
                         <button id="btnVerRegistroObsequios" class="flex-1 md:flex-none bg-indigo-50 text-indigo-700 px-5 py-3 rounded-xl hover:bg-indigo-100 transition shadow-sm font-bold text-sm">Ver Registro</button>
                         <button id="btnNuevaEntrega" class="flex-1 md:flex-none bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700 transition shadow-md font-bold text-sm">Nueva Entrega</button>
                    </div>
                </div>

                <div id="obsequiosDynamicArea" class="space-y-6">
                    <!-- Contenido dinámico (Formulario o Registro) -->
                    <div class="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
                        <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                             <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path></svg>
                        </div>
                        <h3 class="font-bold text-gray-800">Módulo de Obsequios</h3>
                        <p class="text-gray-400 text-sm mt-1">Selecciona una acción arriba para comenzar.</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnVerRegistroObsequios').addEventListener('click', renderRegistroObsequios);
        document.getElementById('btnNuevaEntrega').addEventListener('click', renderFormularioEntrega);

        // Cargar configuración de obsequio y datos iniciales en paralelo
        Promise.all([
            _loadObsequioConfig(),
            _loadClientes(),
            _loadInventarioUsuario()
        ]).catch(err => console.error("Error en precarga de obsequios:", err));
    };

    /**
     * Carga la configuración del producto que se entrega como obsequio.
     */
    const _loadObsequioConfig = async () => {
        try {
            const snap = await _getDoc(_doc(_db, OBSEQUIO_CONFIG_PATH));
            if (snap.exists()) {
                _obsequioConfig = snap.data();
                console.log("Configuración de obsequio cargada:", _obsequioConfig);
            } else {
                console.warn("No existe configuración de obsequio en la ruta:", OBSEQUIO_CONFIG_PATH);
            }
        } catch (e) {
            console.error("Error cargando config de obsequio:", e);
        }
    };

    const _loadClientes = async () => {
        const path = `artifacts/${'dist-castillo-sales'}/public/data/clientes`;
        const snap = await _getDocs(_collection(_db, path));
        _clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    };

    const _loadInventarioUsuario = async () => {
        const path = `artifacts/${_appId}/users/${_userId}/inventario`;
        const snap = await _getDocs(_collection(_db, path));
        _inventarioCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    };

    /**
     * Renderiza el formulario de entrega.
     */
    const renderFormularioEntrega = () => {
        const area = document.getElementById('obsequiosDynamicArea');
        if (!area) return;

        // Verificar si hay producto configurado
        const producto = _inventarioCache.find(p => p.id === _obsequioConfig.productoId);
        
        if (!producto) {
            area.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-100 p-8 rounded-3xl text-center">
                    <p class="text-yellow-700 font-bold mb-2">Producto de Obsequio no disponible</p>
                    <p class="text-yellow-600 text-sm">No tienes el producto configurado para obsequios en tu inventario o el administrador no ha definido uno aún.</p>
                </div>
            `;
            return;
        }

        area.innerHTML = `
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6 animate-fade-in-up">
                <div class="bg-blue-600 p-4 rounded-2xl text-white flex justify-between items-center">
                    <div>
                        <span class="block text-[10px] font-black uppercase tracking-widest opacity-70">Producto de Regalo</span>
                        <span class="text-lg font-black">${producto.marca} ${producto.presentacion}</span>
                    </div>
                    <div class="text-right">
                        <span class="block text-[10px] font-black uppercase tracking-widest opacity-70">Stock</span>
                        <span class="text-xl font-black">${producto.stock || 0}</span>
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">Seleccionar Cliente</label>
                        <select id="obsCliente" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-gray-800">
                            <option value="">Buscar cliente...</option>
                            ${_clientesCache.sort((a,b) => a.nombreNegocio.localeCompare(b.nombreNegocio)).map(c => `
                                <option value="${c.id}">${c.nombreNegocio}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Cantidad a Entregar</label>
                            <input type="number" id="obsCantidad" value="1" min="1" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-black text-xl text-center">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Vacíos Recibidos</label>
                            <input type="number" id="obsVacios" value="0" min="0" class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-black text-xl text-center">
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Observación / Motivo</label>
                        <textarea id="obsNota" rows="2" placeholder="Ej. Por buen volumen de compra..." class="w-full p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-sm"></textarea>
                    </div>
                </div>

                <button id="btnProcesarEntrega" class="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg active:scale-95 transform">
                    Registrar y Generar Ticket
                </button>
            </div>
        `;

        document.getElementById('btnProcesarEntrega').addEventListener('click', () => handleEntregaObsequio(producto));
    };

    /**
     * Procesa la entrega del obsequio, descuenta stock y registra la transacción.
     */
    const handleEntregaObsequio = async (producto) => {
        const clienteId = document.getElementById('obsCliente').value;
        const cantidad = parseInt(document.getElementById('obsCantidad').value) || 0;
        const vacios = parseInt(document.getElementById('obsVacios').value) || 0;
        const nota = document.getElementById('obsNota').value.trim();

        if (!clienteId) return _showModal('Atención', 'Debes seleccionar un cliente.');
        if (cantidad <= 0) return _showModal('Atención', 'La cantidad debe ser mayor a cero.');
        if (cantidad > (producto.stock || 0)) return _showModal('Stock Insuficiente', `Solo tienes ${producto.stock} unidades disponibles.`);

        const cliente = _clientesCache.find(c => c.id === clienteId);

        _showModal('Procesando...', '<div class="flex justify-center p-8"><div class="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>');

        try {
            await _runTransaction(_db, async (transaction) => {
                // 1. Descontar del inventario del usuario
                const invRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, producto.id);
                const invSnap = await transaction.get(invRef);
                if (!invSnap.exists()) throw "Producto no encontrado en inventario.";
                const nuevoStock = (invSnap.data().stock || 0) - cantidad;
                transaction.update(invRef, { stock: nuevoStock });

                // 2. Registrar el obsequio
                const obsRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios`));
                const obsequioData = {
                    clienteId,
                    clienteNombre: cliente.nombreNegocio,
                    productoId: producto.id,
                    productoNombre: `${producto.marca} ${producto.presentacion}`,
                    cantidadEntregada: cantidad,
                    vaciosRecibidos: vacios,
                    observacion: nota,
                    fecha: new Date(),
                    fechaString: new Date().toISOString().split('T')[0]
                };
                transaction.set(obsRef, obsequioData);

                // 3. Si el producto maneja vacíos, actualizar saldo del cliente (si hay diferencia)
                if (producto.manejaVacios && producto.tipoVacio) {
                    const diff = cantidad - vacios;
                    if (diff !== 0) {
                        const clRef = _doc(_db, `artifacts/${'dist-castillo-sales'}/public/data/clientes`, clienteId);
                        const clSnap = await transaction.get(clRef);
                        if (clSnap.exists()) {
                            const currentSaldos = clSnap.data().saldoVacios || {};
                            currentSaldos[producto.tipoVacio] = (currentSaldos[producto.tipoVacio] || 0) + diff;
                            transaction.update(clRef, { saldoVacios: currentSaldos, fechaActualizacion: new Date() });
                        }
                    }
                }
                
                // Guardar para el ticket
                _obsequioActual = { ...obsequioData, id: obsRef.id };
            });

            // Actualizar caché local de inventario inmediatamente
            const pIdx = _inventarioCache.findIndex(p => p.id === producto.id);
            if (pIdx !== -1) _inventarioCache[pIdx].stock -= cantidad;

            // Mostrar el Ticket
            showTicketObsequio(_obsequioActual, producto);

        } catch (error) {
            console.error("Error en transacción de obsequio:", error);
            _showModal('Error', 'No se pudo completar la entrega: ' + error);
        }
    };

    /**
     * Muestra un ticket visual del obsequio y permite compartirlo.
     */
    const showTicketObsequio = (obs, prod) => {
        const ticketId = `ticket-obs-${obs.id}`;
        const content = document.createElement('div');
        content.className = 'space-y-4';
        content.innerHTML = `
            <div id="${ticketId}" class="bg-white p-8 border border-gray-100 rounded-3xl shadow-sm text-center relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
                
                <h4 class="font-black text-blue-600 uppercase tracking-widest text-xs mb-6">Comprobante de Obsequio</h4>
                
                <div class="space-y-4 mb-8">
                    <div>
                        <span class="block text-[10px] text-gray-400 font-bold uppercase">Cliente</span>
                        <span class="text-xl font-black text-gray-800">${obs.clienteNombre}</span>
                    </div>
                    
                    <div class="flex justify-center gap-8 py-4 border-y border-gray-50">
                        <div>
                            <span class="block text-[9px] text-gray-400 font-bold uppercase">Entregado</span>
                            <span class="text-2xl font-black text-blue-600">${obs.cantidadEntregada}</span>
                        </div>
                        <div>
                            <span class="block text-[9px] text-gray-400 font-bold uppercase">Recibido</span>
                            <span class="text-2xl font-black text-gray-400">${obs.vaciosRecibidos}</span>
                        </div>
                    </div>

                    <div>
                        <span class="block text-[10px] text-gray-400 font-bold uppercase">Producto</span>
                        <span class="font-bold text-gray-700">${prod.marca} ${prod.presentacion}</span>
                    </div>

                    ${obs.observacion ? `
                        <div class="bg-gray-50 p-3 rounded-xl italic text-xs text-gray-500">
                            "${obs.observacion}"
                        </div>
                    ` : ''}
                </div>

                <div class="pt-4 border-t border-dashed border-gray-200">
                    <span class="text-[9px] text-gray-300 font-medium">${new Date(obs.fecha).toLocaleString()}</span>
                    <p class="text-[8px] text-gray-300 font-bold mt-1 uppercase tracking-tighter">ID: ${obs.id}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-1 gap-2">
                <button id="btnShareTicketObs" class="w-full bg-blue-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-md">
                    Compartir Ticket
                </button>
            </div>
        `;

        _showModal('Obsequio Registrado', content, () => renderFormularioEntrega(), 'Aceptar', false);

        document.getElementById('btnShareTicketObs').addEventListener('click', () => _showSharingOptionsObsequio(obs, prod));
    };

    /**
     * Genera imagen del ticket y abre el diálogo de compartir.
     */
    const _showSharingOptionsObsequio = async (obs, prod) => {
        const ticketId = `ticket-obs-${obs.id}`;
        const btn = document.getElementById('btnShareTicketObs');
        const originalText = btn.textContent;
        
        btn.textContent = 'Generando Imagen...';
        btn.disabled = true;

        try {
            const ticketEl = document.getElementById(ticketId);
            const canvas = await html2canvas(ticketEl, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true
            });

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `Obsequio_${obs.clienteNombre.replace(/\s+/g, '_')}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Ticket de Obsequio',
                    text: `Cortesía entregada a ${obs.clienteNombre}: ${obs.cantidadEntregada} ${prod.marca}`
                });
            } else {
                // Descarga si no hay Share API
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = `Obsequio_${obs.id}.png`;
                link.click();
            }
        } catch (e) {
            console.error("Error al compartir ticket:", e);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    /**
     * Renderiza el registro histórico de obsequios entregados.
     */
    const renderRegistroObsequios = async () => {
        const area = document.getElementById('obsequiosDynamicArea');
        if (!area) return;

        area.innerHTML = `
            <div class="space-y-4 animate-fade-in-up">
                <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
                    <div class="relative flex-grow w-full">
                        <input type="date" id="registroObsFecha" class="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-100 outline-none">
                        <svg class="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002-2z"></path></svg>
                    </div>
                    <button id="btnConsultarRegistroObs" class="w-full md:w-auto bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition">Consultar</button>
                </div>
                
                <div id="listaRegistroObsequios" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                    <p class="col-span-full text-center text-gray-400 py-10 italic">Selecciona una fecha para ver el registro.</p>
                </div>
            </div>
        `;

        document.getElementById('btnConsultarRegistroObs').addEventListener('click', loadObsequios);
    };

    /**
     * Carga obsequios de Firestore para una fecha específica.
     */
    const loadObsequios = async () => {
        const fecha = document.getElementById('registroObsFecha').value;
        const list = document.getElementById('listaRegistroObsequios');
        if (!fecha) return _showModal('Atención', 'Selecciona una fecha.');

        list.innerHTML = `<div class="col-span-full flex justify-center py-10"><div class="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>`;

        try {
            const q = _query(
                _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios`),
                _where('fechaString', '==', fecha)
            );
            const snap = await _getDocs(q);
            _lastObsequiosSearch = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (_lastObsequiosSearch.length === 0) {
                list.innerHTML = `<p class="col-span-full text-center text-gray-400 py-10">No se registraron obsequios en esta fecha.</p>`;
                return;
            }

            list.innerHTML = _lastObsequiosSearch.sort((a,b) => b.fecha - a.fecha).map(o => `
                <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition group">
                    <div class="flex justify-between items-start mb-3">
                        <h4 class="font-black text-gray-900 truncate pr-2">${o.clienteNombre}</h4>
                        <span class="shrink-0 bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest">${o.cantidadEntregada} Und</span>
                    </div>
                    <p class="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-4">${o.productoNombre}</p>
                    
                    <div class="flex justify-between items-center mt-auto pt-3 border-t border-gray-50">
                        <span class="text-[9px] text-gray-300 font-bold">${new Date(o.fecha.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div class="flex space-x-3">
                            <button onclick="window.obsequiosModule.shareObsequio('${o.id}')" class="text-blue-600 hover:text-blue-800 transition">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-6 3 3 0 000 6zm0 12a3 3 0 100-6 3 3 0 000 6z"></path></svg>
                            </button>
                            <button onclick="window.obsequiosModule.deleteObsequio('${o.id}')" class="text-red-300 hover:text-red-500 transition">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

        } catch (e) {
            console.error(e);
            list.innerHTML = `<p class="col-span-full text-center text-red-500 py-10 italic text-sm">Error cargando el registro.</p>`;
        }
    };

    /**
     * Eliminación de un registro de obsequio y reversión parcial si es posible.
     */
    const deleteObsequio = async (id) => {
        if (!confirm("¿Deseas eliminar este registro? Nota: Esto no devolverá el stock automáticamente, deberás ajustarlo en Inventario.")) return;

        try {
            await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/obsequios`, id));
            loadObsequios(); // Recargar lista
        } catch (e) {
            _showModal('Error', 'No se pudo eliminar el registro.');
        }
    };

    /**
     * Re-genera y permite compartir un ticket desde el registro.
     */
    const shareObsequio = async (id) => {
        const obs = _lastObsequiosSearch.find(o => o.id === id);
        if (!obs) return;

        const prod = _inventarioCache.find(p => p.id === obs.productoId) || { 
            marca: obs.productoNombre.split(' ')[0], 
            presentacion: obs.productoNombre.split(' ').slice(1).join(' ') 
        };

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'fixed';
        tempDiv.style.left = '-1000px';
        tempDiv.id = `temp-share-${obs.id}`;
        
        tempDiv.innerHTML = `
            <div id="ticket-obs-${obs.id}" class="bg-white p-8 border border-gray-100 rounded-3xl text-center w-[350px]">
                <div class="h-2 bg-blue-600 mb-6"></div>
                <h4 class="font-black text-blue-600 uppercase tracking-widest text-xs mb-6">Comprobante de Obsequio</h4>
                <div class="space-y-4 mb-8">
                    <div>
                        <span class="block text-[10px] text-gray-400 font-bold uppercase">Cliente</span>
                        <span class="text-xl font-black text-gray-800">${obs.clienteNombre}</span>
                    </div>
                    <div class="flex justify-center gap-8 py-4 border-y border-gray-50">
                        <div>
                            <span class="block text-[9px] text-gray-400 font-bold uppercase">Entregado</span>
                            <span class="text-2xl font-black text-blue-600">${obs.cantidadEntregada}</span>
                        </div>
                    </div>
                    <div>
                        <span class="block text-[10px] text-gray-400 font-bold uppercase">Producto</span>
                        <span class="font-bold text-gray-700">${obs.productoNombre}</span>
                    </div>
                </div>
                <div class="pt-4 border-t border-dashed border-gray-200">
                    <span class="text-[9px] text-gray-300 font-medium">${new Date(obs.fecha.seconds * 1000).toLocaleString()}</span>
                </div>
            </div>
        `;
        document.body.appendChild(tempDiv);

        try {
            const canvas = await html2canvas(document.getElementById(`ticket-obs-${obs.id}`), { scale: 2 });
            const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            const file = new File([blob], `Obsequio_${obs.clienteNombre.replace(/\s+/g, '_')}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Ticket Obsequio' });
            } else {
                const a = document.createElement('a');
                a.href = canvas.toDataURL();
                a.download = `Obsequio_${obs.id}.png`;
                a.click();
            }
        } catch (e) {
            console.error(e);
        } finally {
            document.body.removeChild(tempDiv);
        }
    };

    // --- API Pública del Módulo ---
    window.obsequiosModule = {
        renderObsequios,
        editObsequio: (id) => console.log("Editar no implementado aún"),
        deleteObsequio,
        shareObsequio
    };

})();

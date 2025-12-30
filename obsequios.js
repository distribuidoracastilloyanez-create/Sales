// --- Lógica del módulo de Gestión de Obsequios ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal;
    // --- MODIFICACIÓN: Añadida dependencia _deleteDoc ---
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _getDocs, _writeBatch, _runTransaction, _query, _where, _deleteDoc;

    // Estado específico del módulo
    let _clientesCache = [];
    let _inventarioCache = []; // Caché del inventario del usuario actual
    let _obsequioConfig = { productoId: null, productoData: null }; // Configuración del producto de obsequio
    let _obsequioActual = { cliente: null, cantidadEntregada: 0, vaciosRecibidos: 0, observacion: '' };
    let _lastObsequiosSearch = []; // Caché para los resultados de búsqueda del registro

    // Constante para tipos de vacío (debe coincidir con inventario.js)
    const TIPOS_VACIO = window.TIPOS_VACIO_GLOBAL || ["1/4 - 1/3", "ret 350 ml", "ret 1.25 Lts"];
    // Definir ruta pública para la configuración
    const OBSEQUIO_CONFIG_PATH = `artifacts/${'ventas-9a210'}/public/data/config/obsequio`; // Usar ID de proyecto hardcoded

    /**
     * Inicializa el módulo de obsequios.
     */
    window.initObsequios = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _userRole = dependencies.userRole; // Aunque la vista es para 'user', guardamos por si acaso
        _appId = dependencies.appId; // Se obtiene appId aquí
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _activeListeners = dependencies.activeListeners;
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
        // --- MODIFICACIÓN: Añadir _deleteDoc ---
        _deleteDoc = dependencies.deleteDoc;
    };

    /**
     * Muestra el NUEVO sub-menú de obsequios.
     * Esta es ahora la función principal llamada desde el menú de index.html.
     */
    window.showGestionObsequiosView = function() {
        if (_userRole !== 'user') {
            _showModal('Acceso Denegado', 'Esta función es solo para vendedores.');
            _showMainMenu();
            return;
        }
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Obsequios</h1>
                        <div class="space-y-4">
                            <button id="generarObsequioBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600">Generar Obsequio</button>
                            <button id="registroObsequiosBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Registro de Obsequios</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('generarObsequioBtn').addEventListener('click', showGenerarObsequioView);
        document.getElementById('registroObsequiosBtn').addEventListener('click', showRegistroObsequiosView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    };

    /**
     * Muestra la vista para generar una nueva entrega de obsequio.
     * (Esta era la antigua función 'window.showGestionObsequiosView')
     */
    async function showGenerarObsequioView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _obsequioActual = { cliente: null, cantidadEntregada: 0, vaciosRecibidos: 0, observacion: '' }; // Resetear
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto max-w-lg">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <div class="flex justify-between items-center mb-6">
                            <h1 class="text-2xl font-bold text-gray-800">Generar Obsequio</h1>
                            <!-- CORRECCIÓN: El botón "Volver" ahora regresa al sub-menú de obsequios -->
                            <button id="backToObsequiosMenuBtn" class="px-4 py-2 bg-gray-400 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>

                        <div id="obsequio-loader" class="text-center text-gray-500 mb-4">Cargando configuración...</div>
                        <div id="obsequio-content" class="hidden space-y-4">
                            <!-- Selección de Cliente -->
                            <div id="client-search-container-obsequio">
                                <label for="clienteSearchObsequio" class="block text-gray-700 font-medium mb-2">Seleccionar Cliente:</label>
                                <div class="relative">
                                    <input type="text" id="clienteSearchObsequio" placeholder="Buscar cliente..." class="w-full px-4 py-2 border rounded-lg">
                                    <div id="clienteDropdownObsequio" class="autocomplete-list hidden"></div>
                                </div>
                            </div>
                            <div id="client-display-container-obsequio" class="hidden p-3 bg-gray-100 rounded-lg">
                                <p class="text-gray-700"><span class="font-medium">Cliente:</span> <span id="selected-client-name-obsequio" class="font-bold"></span></p>
                            </div>

                            <!-- Formulario de Obsequio (cuando se selecciona cliente) -->
                            <form id="obsequioForm" class="hidden space-y-4 text-left border-t pt-4">
                                <p class="font-semibold text-center text-gray-800">Producto: <span id="obsequioProductName"></span></p>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label for="cantidadEntregada" class="block text-gray-700 font-medium mb-1">Cajas Entregadas:</label>
                                        <input type="number" id="cantidadEntregada" min="0" class="w-full px-4 py-2 border rounded-lg" required>
                                        <p class="text-xs text-gray-500 mt-1">Stock disponible: <span id="obsequioStock">--</span> cajas</p>
                                    </div>
                                    <div>
                                        <label for="vaciosRecibidos" class="block text-gray-700 font-medium mb-1">Vacíos Recibidos:</label>
                                        <input type="number" id="vaciosRecibidos" min="0" value="0" class="w-full px-4 py-2 border rounded-lg">
                                        <p id="vaciosTipoInfo" class="text-xs text-gray-500 mt-1">Tipo: --</p>
                                    </div>
                                </div>
                                <div>
                                    <label for="observacion" class="block text-gray-700 font-medium mb-1">Información/Observación:</label>
                                    <textarea id="observacion" rows="3" class="w-full px-4 py-2 border rounded-lg" placeholder="Motivo de la entrega del obsequio..."></textarea>
                                </div>
                                <button type="submit" class="w-full px-6 py-3 bg-pink-500 text-white font-semibold rounded-lg shadow-md hover:bg-pink-600">Registrar y Generar Ticket</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
        // CORRECCIÓN: Listener del botón "Volver"
        document.getElementById('backToObsequiosMenuBtn').addEventListener('click', window.showGestionObsequiosView);

        // Cargar datos necesarios en paralelo
        await Promise.all([
            _loadClientes(),
            _loadInventarioUsuario(),
            _loadObsequioProduct() // Carga la configuración Y el producto del inventario
        ]);

        const loader = document.getElementById('obsequio-loader');
        const content = document.getElementById('obsequio-content');

        if (_obsequioConfig.productoId && _obsequioConfig.productoData) {
            loader.classList.add('hidden');
            content.classList.remove('hidden');
            setupObsequioUI(); // Configurar UI después de cargar todo
        } else {
            loader.textContent = 'Error: No se ha configurado un producto de obsequio o no se encontró en el inventario.';
             _showModal('Error de Configuración', 'No hay un producto de obsequio configurado por el administrador o no se encuentra en tu inventario. Contacta al administrador.');
        }
    };

    /**
     * Carga la configuración del producto de obsequio desde la ruta pública.
     * También carga los datos del producto desde el inventario del usuario actual.
     */
    async function _loadObsequioProduct() {
        try {
            // 1. Leer la configuración pública directamente
            const configRef = _doc(_db, OBSEQUIO_CONFIG_PATH); // Usa la ruta pública definida
            const configSnap = await _getDoc(configRef); // <-- ESTA LÍNEA FALTABA

            if (configSnap.exists()) {
                _obsequioConfig.productoId = configSnap.data().productoId;

                // 2. Buscar el producto en el inventario del usuario actual (esto permanece igual)
                if (_inventarioCache.length === 0) {
                     await _loadInventarioUsuario(); // Cargar si está vacío
                }
                const productoDataEnInventario = _inventarioCache.find(p => p.id === _obsequioConfig.productoId);

                if (productoDataEnInventario) {
                     _obsequioConfig.productoData = productoDataEnInventario;
                     // Validar que maneje vacíos y sea por caja (esto permanece igual)
                     if (!productoDataEnInventario.manejaVacios || !productoDataEnInventario.ventaPor?.cj) {
                         throw new Error(`El producto "${productoDataEnInventario.presentacion}" configurado como obsequio no maneja vacíos o no se vende por caja.`);
                     }
                      if (!productoDataEnInventario.tipoVacio) {
                          throw new Error(`El producto "${productoDataEnInventario.presentacion}" configurado como obsequio no tiene un tipo de vacío asignado.`);
                      }
                } else {
                    throw new Error("El producto configurado como obsequio no se encontró en tu inventario.");
                }
            } else {
                throw new Error("No se ha configurado un producto de obsequio en la ruta pública.");
            }

        } catch (error) {
            console.error("Error al cargar configuración de obsequio:", error);
            _obsequioConfig = { productoId: null, productoData: null }; // Resetear si hay error
             // El mensaje de error se mostrará en showGestionObsequiosView
        }
    }

    /** Carga el inventario del usuario actual */
    async function _loadInventarioUsuario() {
         try {
             const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
             const snapshot = await _getDocs(inventarioRef);
             _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
         } catch (error) {
             console.error("Error cargando inventario del usuario:", error);
             _inventarioCache = []; // Dejar vacío si hay error
             _showModal('Error', 'No se pudo cargar tu inventario.');
         }
    }

    /** Carga los clientes desde la colección pública */
    async function _loadClientes() {
        try {
            // Usa el ID de proyecto hardcoded para la colección pública
            const clientesRef = _collection(_db, `artifacts/ventas-9a210/public/data/clientes`);
            const snapshot = await _getDocs(clientesRef);
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error cargando clientes:", error);
            _clientesCache = [];
             _showModal('Error', 'No se pudo cargar la lista de clientes.');
        }
    }

    /** Configura los listeners y elementos de la UI de obsequios */
    function setupObsequioUI() {
        const clienteSearchInput = document.getElementById('clienteSearchObsequio');
        const cantidadInput = document.getElementById('cantidadEntregada');
        const vaciosInput = document.getElementById('vaciosRecibidos');
        const observacionInput = document.getElementById('observacion');
        const form = document.getElementById('obsequioForm');

        // Poblar nombre y stock del producto
        const productNameSpan = document.getElementById('obsequioProductName');
        const stockSpan = document.getElementById('obsequioStock');
        const vaciosTipoInfo = document.getElementById('vaciosTipoInfo');

        if (_obsequioConfig.productoData) {
            const prod = _obsequioConfig.productoData;
            productNameSpan.textContent = `${prod.marca} - ${prod.segmento} - ${prod.presentacion}`;
            const stockEnCajas = Math.floor((prod.cantidadUnidades || 0) / (prod.unidadesPorCaja || 1));
            stockSpan.textContent = stockEnCajas;
            cantidadInput.max = stockEnCajas; // Establecer máximo
            vaciosTipoInfo.textContent = `Tipo: ${prod.tipoVacio}`; // Mostrar tipo
        } else {
             // Si por alguna razón productoData es nulo aquí, mostrar error
             productNameSpan.textContent = "Error";
             stockSpan.textContent = "Error";
             vaciosTipoInfo.textContent = "Tipo: Error";
             if (form) form.style.display = 'none'; // Ocultar form si no hay producto
        }


        // Setup búsqueda de cliente
        clienteSearchInput.addEventListener('input', () => {
            const searchTerm = clienteSearchInput.value.toLowerCase();
            const filteredClients = _clientesCache.filter(c => c.nombreComercial.toLowerCase().includes(searchTerm) || c.nombrePersonal.toLowerCase().includes(searchTerm));
            _renderClienteDropdown(filteredClients);
            document.getElementById('clienteDropdownObsequio').classList.remove('hidden');
        });

        // Setup formulario
        cantidadInput.addEventListener('input', (e) => _obsequioActual.cantidadEntregada = parseInt(e.target.value, 10) || 0);
        vaciosInput.addEventListener('input', (e) => _obsequioActual.vaciosRecibidos = parseInt(e.target.value, 10) || 0);
        observacionInput.addEventListener('input', (e) => _obsequioActual.observacion = e.target.value.trim());
        form.addEventListener('submit', handleRegistrarObsequio);

        // Ocultar dropdown si se hace clic fuera
        document.addEventListener('click', function(event) {
             const dropdown = document.getElementById('clienteDropdownObsequio');
             const searchInput = document.getElementById('clienteSearchObsequio');
            if (dropdown && !dropdown.contains(event.target) && event.target !== searchInput) {
                dropdown.classList.add('hidden');
            }
        });
    }

    /** Renderiza el dropdown de clientes para obsequios */
    function _renderClienteDropdown(filteredClients) {
        const clienteDropdown = document.getElementById('clienteDropdownObsequio');
        if(!clienteDropdown) return;
        clienteDropdown.innerHTML = '';
        filteredClients.forEach(cliente => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = `${cliente.nombreComercial} (${cliente.nombrePersonal})`;
            item.addEventListener('click', () => _selectCliente(cliente));
            clienteDropdown.appendChild(item);
        });
    }

    /** Selecciona un cliente y muestra el formulario */
    function _selectCliente(cliente) {
        _obsequioActual.cliente = cliente;
        document.getElementById('client-search-container-obsequio').classList.add('hidden');
        document.getElementById('clienteDropdownObsequio').classList.add('hidden');
        document.getElementById('selected-client-name-obsequio').textContent = cliente.nombreComercial;
        document.getElementById('client-display-container-obsequio').classList.remove('hidden');
        document.getElementById('obsequioForm').classList.remove('hidden');
    }

    /**
     * Valida, registra la entrega de obsequio, actualiza stock/saldos y genera ticket.
     * --- CORREGIDO PARA AJUSTAR SALDO VACIOS CORRECTAMENTE ---
     */
    async function handleRegistrarObsequio(e) {
        e.preventDefault();
        if (!_obsequioActual.cliente) {
            _showModal('Error', 'Debes seleccionar un cliente.');
            return;
        }
        if (!_obsequioConfig.productoId || !_obsequioConfig.productoData) {
            _showModal('Error', 'Producto de obsequio no configurado o no encontrado.');
            return;
        }

        const cantidadEntregada = _obsequioActual.cantidadEntregada;
        const vaciosRecibidos = _obsequioActual.vaciosRecibidos;
        const productoObsequio = _obsequioConfig.productoData;
        const unidadesPorCaja = productoObsequio.unidadesPorCaja || 1;
        const tipoVacioProducto = productoObsequio.tipoVacio; // Ya validado en _loadObsequioProduct

        // Leer stock actual desde la caché (para validación inicial)
        const prodEnCache = _inventarioCache.find(p => p.id === _obsequioConfig.productoId);
        const stockActualUnidades = prodEnCache?.cantidadUnidades || 0;
        const stockActualCajas = Math.floor(stockActualUnidades / unidadesPorCaja);

        if (cantidadEntregada <= 0) {
            _showModal('Error', 'La cantidad de cajas entregadas debe ser mayor que cero.');
            return;
        }
        if (cantidadEntregada > stockActualCajas) {
            _showModal('Error', `Stock insuficiente. Solo hay ${stockActualCajas} cajas disponibles.`);
            return;
        }
        // Validación de tipoVacio ya hecha al cargar

        const confirmMsg = `
            Confirmar entrega:<br>
            - Cliente: ${_obsequioActual.cliente.nombreComercial}<br>
            - Producto: ${productoObsequio.presentacion}<br>
            - Cajas Entregadas: ${cantidadEntregada}<br>
            - Vacíos Recibidos (${tipoVacioProducto}): ${vaciosRecibidos}<br>
            - Observación: ${_obsequioActual.observacion || 'Ninguna'}
        `;

        _showModal('Confirmar Obsequio', confirmMsg, async () => {
            _showModal('Progreso', 'Registrando entrega...');

            try {
                // --- INICIO: Lógica dentro de Transacción ---
                const inventarioRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, _obsequioConfig.productoId);
                const clienteRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, _obsequioActual.cliente.id);
                const registroRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`)); // Generar ID para registro

                const registroData = { // Preparar datos del registro
                    fecha: new Date(),
                    clienteId: _obsequioActual.cliente.id,
                    clienteNombre: _obsequioActual.cliente.nombreComercial,
                    productoId: _obsequioConfig.productoId,
                    productoNombre: productoObsequio.presentacion,
                    cantidadCajas: cantidadEntregada,
                    vaciosRecibidos: vaciosRecibidos,
                    tipoVacio: tipoVacioProducto,
                    observacion: _obsequioActual.observacion,
                    userId: _userId
                };

                await _runTransaction(_db, async (transaction) => {
                    // 1. Leer inventario y cliente DENTRO de la transacción
                    const inventarioDoc = await transaction.get(inventarioRef);
                    const clienteDoc = await transaction.get(clienteRef);

                    if (!inventarioDoc.exists()) throw "El producto de obsequio no existe en el inventario.";
                    if (!clienteDoc.exists()) throw "El cliente no existe.";

                    // 2. Validar stock DENTRO de la transacción
                    const stockActualTrans = inventarioDoc.data().cantidadUnidades || 0;
                    const unidadesARestar = cantidadEntregada * unidadesPorCaja;
                    if (unidadesARestar > stockActualTrans) {
                        throw `Stock insuficiente DENTRO de la transacción. Disponible: ${Math.floor(stockActualTrans / unidadesPorCaja)} cajas.`;
                    }
                    const nuevoStockUnidades = stockActualTrans - unidadesARestar;

                    // 3. Calcular nuevo saldo de vacíos
                    const clienteData = clienteDoc.data();
                    const saldoVaciosActual = clienteData.saldoVacios || {};
                    const saldoActualTipo = saldoVaciosActual[tipoVacioProducto] || 0;
                    // Ajuste: +CajasEntregadas (aumenta deuda) - VaciosRecibidos (disminuye deuda)
                    const nuevoSaldoTipo = saldoActualTipo + cantidadEntregada - vaciosRecibidos;
                    const nuevoSaldoVacios = { ...saldoVaciosActual, [tipoVacioProducto]: nuevoSaldoTipo };

                    // 4. Escribir todas las actualizaciones
                    transaction.update(inventarioRef, { cantidadUnidades: nuevoStockUnidades });
                    transaction.update(clienteRef, { saldoVacios: nuevoSaldoVacios });
                    transaction.set(registroRef, registroData); // Guardar el registro
                });
                // --- FIN: Lógica dentro de Transacción ---

                // Si la transacción fue exitosa, generar ticket
                 // CORRECCIÓN: Llamar a window.showGestionObsequiosView (el sub-menú)
                 _showSharingOptionsObsequio(registroData, productoObsequio, window.showGestionObsequiosView);

            } catch (error) {

                console.error("Error al registrar obsequio:", error);
                // Si la transacción falla, Firestore revierte todo
                _showModal('Error', `No se pudo registrar la entrega: ${error.message || error}`);

            }

        }, 'Sí, Confirmar', null, true); // triggerConfirmLogic = true
    }


    // --- Funciones adaptadas para Tickets de Obsequio (sin cambios) ---

    function _createTicketHTMLObsequio(registro, producto) {
        const fecha = registro.fecha.toLocaleDateString('es-ES');
        const clienteNombre = registro.clienteNombre;

        // Obtener nombre personal del cliente (requiere buscar en _clientesCache o pasar el objeto cliente)
        const clienteObj = _clientesCache.find(c => c.id === registro.clienteId);
        const clienteNombrePersonal = clienteObj?.nombrePersonal || '';


        const titulo = 'ENTREGA DE OBSEQUIO';

        return `
            <div id="temp-ticket-for-image" class="bg-white text-black p-4 font-bold" style="width: 768px; font-family: 'Courier New', Courier, monospace;">

                <div class="text-center">
                    <h2 class="text-4xl uppercase">${titulo}</h2>
                    <p class="text-3xl">DISTRIBUIDORA CASTILLO YAÑEZ</p>

                </div>
                <div class="text-3xl mt-8">
                    <p>FECHA: ${fecha}</p>

                    <p>CLIENTE: ${clienteNombre}</p>
                </div>
                <table class="w-full text-3xl mt-6">

                    <thead>
                        <tr>
                            <th class="pb-2 text-left">PRODUCTO ENTREGADO</th>

                            <th class="pb-2 text-center">CANT.</th>
                        </tr>
                    </thead>
                    <tbody>

                         <tr class="align-top">
                            <td class="py-2 pr-2 text-left" style="width: 80%;">
                                <div style="line-height: 1.2;">${producto.segmento || ''} ${producto.marca || ''} ${registro.productoNombre}</div>

                            </td>
                            <td class="py-2 text-center" style="width: 20%;">${registro.cantidadCajas} CJ</td>
                        </tr>

                    </tbody>
                </table>
                 ${registro.vaciosRecibidos > 0 ? `
                 <div class="text-3xl mt-6 border-t border-black border-dashed pt-4">

                     <p>ENVASES RECIBIDOS:</p>
                     <table class="w-full text-3xl mt-2">
                         <tbody>

                            <tr>
                                <td class="py-1 pr-2 text-left" style="width: 70%;">${registro.tipoVacio}</td>
                                <td class="py-1 pl-2 text-right" style="width: 30%;">${registro.vaciosRecibidos} CJ</td>

                            </tr>
                         </tbody>
                     </table>

                 </div>
                 ` : ''}
                 ${registro.observacion ? `
                 <div class="text-3xl mt-6 border-t border-black border-dashed pt-4">

                     <p>OBSERVACIÓN:</p>
                     <p class="font-normal">${registro.observacion}</p>
                 </div>

                 ` : ''}
                <div class="text-center mt-16">
                    <p class="border-t border-black w-96 mx-auto"></p>

                    <p class="mt-4 text-3xl">${clienteNombrePersonal}</p>
                </div>
                <hr class="border-dashed border-black mt-6">

            </div>
        `;
    }
    function _createRawTextTicketObsequio(registro, producto) {

        const fecha = registro.fecha.toLocaleDateString('es-ES');

        const toTitleCase = (str) => {

            if (!str) return '';
            return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        };

        const clienteNombre = toTitleCase(registro.clienteNombre);

        const clienteObj = _clientesCache.find(c => c.id === registro.clienteId);
        const clienteNombrePersonal = toTitleCase(clienteObj?.nombrePersonal || '');

        const LINE_WIDTH = 48;

        let ticket = '';

        const center = (text) => text.padStart(Math.floor((LINE_WIDTH - text.length) / 2) + text.length, ' ').padEnd(LINE_WIDTH, ' ');
         const wordWrap = (text, maxWidth) => {

            const lines = [];
            if (!text) return lines;
            let currentLine = '';

            const words = text.split(' ');
            for (const word of words) {
                if ((currentLine + ' ' + word).trim().length > maxWidth) {

                    if(currentLine.length > 0) lines.push(currentLine.trim());
                    currentLine = word;
                } else {

                    currentLine = (currentLine + ' ' + word).trim();
                }
            }

            if (currentLine) lines.push(currentLine.trim());
            return lines;
        };

        ticket += center('Distribuidora Castillo Yañez') + '\n';

        ticket += center('Entrega de Obsequio') + '\n\n';

        const wrappedClientName = wordWrap(`Cliente: ${clienteNombre}`, LINE_WIDTH);
        wrappedClientName.forEach(line => {

            ticket += line + '\n';
        });
        ticket += `Fecha: ${fecha}\n`;

        ticket += '-'.repeat(LINE_WIDTH) + '\n';

        ticket += 'PRODUCTO ENTREGADO'.padEnd(LINE_WIDTH - 9) + 'CANT.'.padStart(9) + '\n';
        const productName = toTitleCase(`${producto.segmento || ''} ${producto.marca || ''} ${registro.productoNombre}`);

        const wrappedProductName = wordWrap(productName, LINE_WIDTH - 10); // Dejar espacio para cantidad
        wrappedProductName.forEach((line, index) => {
             const qtyStr = index === wrappedProductName.length - 1 ? `${registro.cantidadCajas} CJ` : '';

             ticket += line.padEnd(LINE_WIDTH - 9) + qtyStr.padStart(9) + '\n';
        });

        if (registro.vaciosRecibidos > 0) {

            ticket += '-'.repeat(LINE_WIDTH) + '\n';
            ticket += center('ENVASES RECIBIDOS') + '\n';
            const vacioText = `${registro.tipoVacio}`;

            const vacioQtyText = `${registro.vaciosRecibidos} CJ`;
             ticket += vacioText.padEnd(LINE_WIDTH - vacioQtyText.length) + vacioQtyText + '\n';
        }

         if (registro.observacion) {

            ticket += '-'.repeat(LINE_WIDTH) + '\n';
            ticket += 'OBSERVACION:\n';
             const wrappedObs = wordWrap(registro.observacion, LINE_WIDTH);

             wrappedObs.forEach(line => { ticket += line + '\n'; });
        }


        ticket += '-'.repeat(LINE_WIDTH) + '\n\n';

        ticket += '\n\n\n\n';
        ticket += center('________________________') + '\n';
        ticket += center(clienteNombrePersonal) + '\n\n';

        ticket += '-'.repeat(LINE_WIDTH) + '\n';

        return ticket;
    }

    async function _handleShareTicketObsequio(htmlContent, successCallback) {
         _showModal('Progreso', 'Generando imagen...');
        const tempDiv = document.createElement('div');

        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';

        tempDiv.innerHTML = htmlContent;
        document.body.appendChild(tempDiv);

        const ticketElement = document.getElementById('temp-ticket-for-image');

        if (!ticketElement) {
             _showModal('Error', 'No se pudo encontrar el elemento del ticket.');
             document.body.removeChild(tempDiv);

             successCallback(false); // Indicar fallo
             return;
        }

        try {

            await new Promise(resolve => setTimeout(resolve, 100)); // Pequeña pausa para renderizar
            const canvas = await html2canvas(ticketElement, { scale: 3 });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

            if (navigator.share && blob) {

                await navigator.share({ files: [new File([blob], "obsequio.png", { type: "image/png" })], title: "Ticket de Obsequio" });
                 _showModal('Éxito', 'Entrega registrada. Imagen compartida.', () => successCallback(true)); // Indicar éxito
            } else {

                 _showModal('Error', 'Función de compartir no disponible.', () => successCallback(false)); // Indicar fallo
            }
        } catch(e) {

             _showModal('Error', `No se pudo generar/compartir imagen: ${e.message}`, () => successCallback(false)); // Indicar fallo
        } finally {
            if (document.body.contains(tempDiv)) {

                 document.body.removeChild(tempDiv);
            }
        }
    }
    async function _handleShareRawTextObsequio(textContent, successCallback) {

        let success = false;
         if (navigator.share) {
            try {

                await navigator.share({ title: 'Ticket de Obsequio', text: textContent });
                _showModal('Éxito', 'Entrega registrada. Ticket listo para imprimir.', () => successCallback(true));
                success = true;

            } catch (err) {
                 _showModal('Aviso', 'No se compartió el ticket. Entrega registrada.', () => successCallback(false));
            }
        } else {

            try {
                const textArea = document.createElement("textarea");
                textArea.value = textContent;

                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');

                document.body.removeChild(textArea);
                 _showModal('Copiado', 'Texto del ticket copiado. Pégalo en tu app de impresión.', () => successCallback(true));
                 success = true;

            } catch (copyErr) {
                 _showModal('Error', 'No se pudo compartir ni copiar. Entrega registrada.', () => successCallback(false));
            }
        }

        // Llamar callback si no se usó en los modales anteriores (caso share cancelado o error sin modal)
        // if (!success) {
        //     successCallback(false);
        // }
    }
    function _showSharingOptionsObsequio(registro, producto, callbackFinal) {

        const modalContent = `
            <div class="text-center">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Generar Ticket de Obsequio</h3>

                <p class="text-gray-600 mb-6">Elige el formato para el comprobante.</p>
                <div class="space-y-4">
                    <button id="printTextBtnObs" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Imprimir (Texto)</button>

                    <button id="shareImageBtnObs" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Compartir (Imagen)</button>
                </div>
            </div>`;

         _showModal('Elige una opción', modalContent, null, ''); // No mostrar botón de confirmación por defecto

        document.getElementById('printTextBtnObs').addEventListener('click', () => {

            const rawTextTicket = _createRawTextTicketObsequio(registro, producto);
             // El callbackFinal (showGestionObsequiosView) se pasa a la función de compartir/copiar
             _handleShareRawTextObsequio(rawTextTicket, callbackFinal);

        });

        document.getElementById('shareImageBtnObs').addEventListener('click', () => {
            const ticketHTML = _createTicketHTMLObsequio(registro, producto);

             // El callbackFinal se pasa a la función de compartir/copiar
             _handleShareTicketObsequio(ticketHTML, callbackFinal);
        });
    }

    // --- NUEVAS FUNCIONES PARA EL REGISTRO DE OBSEQUIOS ---

    /**
     * Muestra la vista del registro de obsequios con filtro de mes.
     */
    function showRegistroObsequiosView() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        _lastObsequiosSearch = []; // Limpiar caché

        // Obtener mes y año actual en formato YYYY-MM
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7); // "2025-11" (o el mes actual)

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Registro de Obsequios</h2>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg items-end">
                            <div class="md:col-span-1">
                                <label for="obsequioMonth" class="block text-sm font-medium">Mes y Año:</label>
                                <input type="month" id="obsequioMonth" value="${currentMonth}" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm text-sm">
                            </div>
                            <button id="searchObsequiosBtn" class="md:col-span-1 w-full px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700">Buscar</button>
                            <button id="downloadObsequiosBtn" class="md:col-span-1 w-full px-6 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50" disabled>Descargar Excel</button>
                        </div>
                        <div id="obsequios-list-container" class="overflow-x-auto max-h-96">
                            <p class="text-center text-gray-500">Seleccione un mes y presione "Buscar".</p>
                        </div>
                        <button id="backToObsequiosMenuBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToObsequiosMenuBtn').addEventListener('click', window.showGestionObsequiosView); // Vuelve al sub-menú
        document.getElementById('searchObsequiosBtn').addEventListener('click', handleSearchObsequios);
        document.getElementById('downloadObsequiosBtn').addEventListener('click', handleDownloadObsequios);
    }

    /**
     * Maneja la búsqueda de registros de obsequios por mes.
     */
    async function handleSearchObsequios() {
        const container = document.getElementById('obsequios-list-container');
        const monthInput = document.getElementById('obsequioMonth').value;
        const downloadBtn = document.getElementById('downloadObsequiosBtn');
        
        if (!container || !downloadBtn) return;
        container.innerHTML = `<p class="text-center text-gray-500">Buscando...</p>`;
        downloadBtn.disabled = true;
        _lastObsequiosSearch = [];

        if (!monthInput) {
            _showModal('Error', 'Seleccione un mes y año.');
            container.innerHTML = `<p class="text-center text-gray-500">Seleccione un mes y presione "Buscar".</p>`;
            return;
        }

        try {
            // Calcular fechas
            const [year, month] = monthInput.split('-').map(Number);
            const fechaDesde = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)); // Inicio del mes en UTC
            const fechaHasta = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // Inicio del *siguiente* mes en UTC

            // Consultar Firestore
            const obsequiosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`);
            // CORRECCIÓN: Usar '<' para fechaHasta para no incluir el primer milisegundo del siguiente mes
            const q = _query(obsequiosRef, _where("fecha", ">=", fechaDesde), _where("fecha", "<", fechaHasta));
            
            const snapshot = await _getDocs(q);
            _lastObsequiosSearch = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            renderObsequiosList(_lastObsequiosSearch);
            if (_lastObsequiosSearch.length > 0) {
                downloadBtn.disabled = false;
            }
        } catch (error) {
            console.error("Error buscando obsequios:", error);
            container.innerHTML = `<p class="text-center text-red-500">Error al buscar registros.</p>`;
        }
    }

    /**
     * Renderiza la lista de obsequios encontrados.
     */
    function renderObsequiosList(obsequios) {
        const container = document.getElementById('obsequios-list-container');
        if (obsequios.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">No se encontraron obsequios para este mes.</p>`;
            return;
        }

        // Ordenar por fecha descendente
        obsequios.sort((a, b) => (b.fecha?.toDate() || 0) - (a.fecha?.toDate() || 0));

        let tableHTML = `
            <table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-200 sticky top-0 z-10">
                    <tr>
                        <th class="py-2 px-3 border-b text-left">Fecha</th>
                        <th class="py-2 px-3 border-b text-left">Cliente</th>
                        <th class="py-2 px-3 border-b text-left">Producto</th>
                        <th class="py-2 px-3 border-b text-center">Cjs Entreg.</th>
                        <th class="py-2 px-3 border-b text-center">Vacíos Recib.</th>
                        <th class="py-2 px-3 border-b text-left">Observación</th>
                        <!-- MODIFICACIÓN: Añadir columna de Acciones -->
                        <th class="py-2 px-3 border-b text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody>`;
        
        obsequios.forEach(reg => {
            const fechaStr = reg.fecha?.toDate() ? reg.fecha.toDate().toLocaleDateString('es-ES') : 'N/A';
            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-3 border-b">${fechaStr}</td>
                    <td class="py-2 px-3 border-b">${reg.clienteNombre || 'N/A'}</td>
                    <td class="py-2 px-3 border-b">${reg.productoNombre || 'N/A'}</td>
                    <td class="py-2 px-3 border-b text-center font-semibold">${reg.cantidadCajas || 0}</td>
                    <td class="py-2 px-3 border-b text-center font-semibold">${reg.vaciosRecibidos || 0}</td>
                    <td class="py-2 px-3 border-b text-xs">${reg.observacion || ''}</td>
                    <!-- INICIO: Modificación de Botones -->
                    <td class="py-2 px-3 border-b text-center space-x-1">
                        <button onclick="window.obsequiosModule.shareObsequio('${reg.id}')" class="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Compartir</button>
                        
                        <!-- SE ELIMINÓ LA CONDICIÓN DE ADMIN -->
                        <button onclick="window.obsequiosModule.editObsequio('${reg.id}')" class="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600">Edt</button>
                        <button onclick="window.obsequiosModule.deleteObsequio('${reg.id}')" class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Del</button>
                        
                    </td>
                    <!-- FIN: Modificación de Botones -->
                </tr> `;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    /**
     * Maneja la descarga del registro de obsequios en Excel.
     */
    function handleDownloadObsequios() {
        if (_lastObsequiosSearch.length === 0) {
            _showModal('Aviso', 'No hay datos para descargar.');
            return;
        }
        // --- CORRECCIÓN: Usar ExcelJS, no XLSX ---
        if (typeof ExcelJS === 'undefined') {
            _showModal('Error', 'La librería de Excel (ExcelJS) no está cargada.');
            return;
        }

        _showModal('Progreso', 'Generando Excel...');
        try {
            const dataToExport = _lastObsequiosSearch.map(reg => ({
                Fecha: reg.fecha?.toDate() ? reg.fecha.toDate().toLocaleDateString('es-ES') : 'N/A',
                Cliente: reg.clienteNombre || 'N/A',
                Producto: reg.productoNombre || 'N/A',
                'Cajas Entregadas': reg.cantidadCajas || 0,
                'Vacíos Recibidos': reg.vaciosRecibidos || 0,
                'Tipo Vacío': reg.tipoVacio || 'N/A',
                Observacion: reg.observacion || ''
            }));
            
            // --- INICIO CORRECCIÓN: Usar ExcelJS ---
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Registro Obsequios');
            
            // Definir columnas basadas en las claves de dataToExport
            worksheet.columns = [
                { header: 'Fecha', key: 'Fecha', width: 12 },
                { header: 'Cliente', key: 'Cliente', width: 30 },
                { header: 'Producto', key: 'Producto', width: 30 },
                { header: 'Cajas Entregadas', key: 'Cajas Entregadas', width: 18, style: { numFmt: '0', alignment: { horizontal: 'center' } } },
                { header: 'Vacíos Recibidos', key: 'Vacíos Recibidos', width: 18, style: { numFmt: '0', alignment: { horizontal: 'center' } } },
                { header: 'Tipo Vacío', key: 'Tipo Vacío', width: 15 },
                { header: 'Observacion', key: 'Observacion', width: 40 }
            ];
            
            worksheet.getRow(1).font = { bold: true };
            worksheet.addRows(dataToExport);
            
            const monthInput = document.getElementById('obsequioMonth').value || 'mes_actual';
            const fileName = `Registro_Obsequios_${monthInput}.xlsx`;

            // Descargar
            workbook.xlsx.writeBuffer().then(buffer => {
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                
                // Ocultar modal de progreso
                const modal = document.getElementById('modalContainer');
                if(modal) modal.classList.add('hidden');
            });
            // --- FIN CORRECCIÓN ---

        } catch (error) {
            console.error("Error generando Excel:", error);
            _showModal('Error', `No se pudo generar el archivo: ${error.message}`);
        }
    }


    // --- INICIO: NUEVAS FUNCIONES PARA EDITAR Y ELIMINAR ---

    /**
     * Muestra el modal para editar un registro de obsequio existente.
     */
    async function editObsequio(obsequioId) {
        const obsequio = _lastObsequiosSearch.find(o => o.id === obsequioId);
        if (!obsequio) {
            _showModal('Error', 'No se encontró el registro de obsequio para editar.');
            return;
        }

        // Cargar el producto de inventario para obtener el stock actual y unidades/caja
        if (_inventarioCache.length === 0) await _loadInventarioUsuario();
        const producto = _inventarioCache.find(p => p.id === obsequio.productoId);
        if (!producto) {
            _showModal('Error', 'El producto asociado a este obsequio ya no existe en tu inventario. No se puede editar.');
            return;
        }

        const unidadesPorCaja = producto.unidadesPorCaja || 1;
        const stockActualUnidades = producto.cantidadUnidades || 0;
        const stockActualCajas = Math.floor(stockActualUnidades / unidadesPorCaja);
        
        // El stock máximo es el stock actual MÁS lo que se entregó originalmente
        const stockMaximoCajas = stockActualCajas + obsequio.cantidadCajas;

        const modalContentHTML = `
            <form id="editObsequioForm" class="text-left space-y-4">
                <p><span class="font-medium">Cliente:</span> ${obsequio.clienteNombre}</p>
                <p><span class="font-medium">Producto:</span> ${obsequio.productoNombre}</p>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="editCantidadEntregada" class="block text-gray-700 font-medium mb-1">Cajas Entregadas:</label>
                        <input type="number" id="editCantidadEntregada" value="${obsequio.cantidadCajas}" min="0" max="${stockMaximoCajas}" class="w-full px-4 py-2 border rounded-lg" required>
                        <p class="text-xs text-gray-500 mt-1">Stock disponible total (actual + este obsequio): ${stockMaximoCajas} cajas</p>
                    </div>
                    <div>
                        <label for="editVaciosRecibidos" class="block text-gray-700 font-medium mb-1">Vacíos Recibidos:</label>
                        <input type="number" id="editVaciosRecibidos" value="${obsequio.vaciosRecibidos}" min="0" class="w-full px-4 py-2 border rounded-lg">
                        <p class="text-xs text-gray-500 mt-1">Tipo: ${obsequio.tipoVacio}</p>
                    </div>
                </div>
                <div>
                    <label for="editObservacion" class="block text-gray-700 font-medium mb-1">Información/Observación:</label>
                    <textarea id="editObservacion" rows="3" class="w-full px-4 py-2 border rounded-lg" placeholder="Motivo de la entrega...">${obsequio.observacion || ''}</textarea>
                </div>
            </form>
        `;

        _showModal(
            'Editar Obsequio', 
            modalContentHTML,
            () => {
                // Pasar el 'obsequio' original y el 'producto' (para unidades/caja) a la función de guardado
                handleGuardarEdicionObsequio(obsequio, producto);
            },
            'Guardar Cambios',
            null,
            true // triggerConfirmLogic
        );
    }

    /**
     * Guarda los cambios de un obsequio editado mediante una transacción.
     */
    async function handleGuardarEdicionObsequio(obsequioOriginal, producto) {
        const form = document.getElementById('editObsequioForm');
        if (!form) return;

        const nuevaCantidadCajas = parseInt(form.editCantidadEntregada.value, 10);
        const nuevosVaciosRecibidos = parseInt(form.editVaciosRecibidos.value, 10);
        const nuevaObservacion = form.editObservacion.value.trim();

        if (isNaN(nuevaCantidadCajas) || isNaN(nuevosVaciosRecibidos) || nuevaCantidadCajas < 0 || nuevosVaciosRecibidos < 0) {
            _showModal('Error', 'Las cantidades deben ser números positivos.');
            return false; // Evita que el modal se cierre
        }
        
        const unidadesPorCaja = producto.unidadesPorCaja || 1;
        const stockActualUnidades = producto.cantidadUnidades || 0;
        const stockMaximoUnidades = stockActualUnidades + (obsequioOriginal.cantidadCajas * unidadesPorCaja);
        const nuevasUnidadesRequeridas = nuevaCantidadCajas * unidadesPorCaja;

        if (nuevasUnidadesRequeridas > stockMaximoUnidades) {
             _showModal('Error', `Stock insuficiente. El stock máximo (incluyendo este obsequio) es ${Math.floor(stockMaximoUnidades / unidadesPorCaja)} cajas.`);
             return false; // Evita que el modal se cierre
        }

        // Calcular Deltas (Diferencias)
        const deltaCajas = nuevaCantidadCajas - obsequioOriginal.cantidadCajas;
        const deltaVacios = nuevosVaciosRecibidos - obsequioOriginal.vaciosRecibidos;
        const deltaUnidadesStock = deltaCajas * unidadesPorCaja;

        // Si no hay cambios, no hacer nada
        if (deltaCajas === 0 && deltaVacios === 0 && nuevaObservacion === obsequioOriginal.observacion) {
            _showModal('Aviso', 'No se detectaron cambios.');
            return true; // Cierra el modal
        }

        _showModal('Progreso', 'Guardando cambios...');

        try {
            const obsequioRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`, obsequioOriginal.id);
            const inventarioRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, obsequioOriginal.productoId);
            const clienteRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, obsequioOriginal.clienteId);

            await _runTransaction(_db, async (transaction) => {
                // 1. Leer inventario y cliente DENTRO de la transacción
                const inventarioDoc = await transaction.get(inventarioRef);
                const clienteDoc = await transaction.get(clienteRef);

                if (!inventarioDoc.exists()) throw "El producto de obsequio no existe en el inventario.";
                if (!clienteDoc.exists()) throw "El cliente no existe.";
                
                // 2. Validar stock DENTRO de la transacción
                const stockActualTrans = inventarioDoc.data().cantidadUnidades || 0;
                // El nuevo stock será el stock actual MENOS el delta de unidades
                const nuevoStockUnidades = stockActualTrans - deltaUnidadesStock; 
                
                if (nuevoStockUnidades < 0) {
                    // Esta validación es una doble comprobación contra la validación de stockMaximoCajas
                    throw `Stock insuficiente DENTRO de la transacción. Disponible: ${Math.floor(stockActualTrans / unidadesPorCaja)} cajas.`;
                }

                // 3. Calcular nuevo saldo de vacíos
                const clienteData = clienteDoc.data();
                const saldoVaciosActual = clienteData.saldoVacios || {};
                const tipoVacio = obsequioOriginal.tipoVacio;
                const saldoActualTipo = saldoVaciosActual[tipoVacio] || 0;
                
                // Ajustar el saldo actual con los DELTAS
                // deltaCajas > 0: más deuda. deltaVacios > 0: menos deuda.
                const nuevoSaldoTipo = saldoActualTipo + deltaCajas - deltaVacios;
                const nuevoSaldoVacios = { ...saldoVaciosActual, [tipoVacio]: nuevoSaldoTipo };

                // 4. Escribir todas las actualizaciones
                transaction.update(inventarioRef, { cantidadUnidades: nuevoStockUnidades });
                transaction.update(clienteRef, { saldoVacios: nuevoSaldoVacios });
                transaction.update(obsequioRef, {
                    cantidadCajas: nuevaCantidadCajas,
                    vaciosRecibidos: nuevosVaciosRecibidos,
                    observacion: nuevaObservacion,
                    fechaModificacion: new Date()
                });
            });

            _showModal('Éxito', 'Obsequio actualizado correctamente.');
            await handleSearchObsequios(); // Refrescar la lista

        } catch (error) {
            console.error("Error al editar obsequio:", error);
            _showModal('Error', `No se pudo actualizar la entrega: ${error.message || error}`);
        }
    }


    /**
     * Elimina un registro de obsequio y revierte los cambios en inventario y saldos.
     */
    async function deleteObsequio(obsequioId) {
        const obsequio = _lastObsequiosSearch.find(o => o.id === obsequioId);
        if (!obsequio) {
            _showModal('Error', 'No se encontró el registro de obsequio para eliminar.');
            return;
        }

        _showModal('Confirmar Eliminación', `¿Eliminar este obsequio? Esta acción <strong>restaurará ${obsequio.cantidadCajas} caja(s)</strong> a tu inventario y <strong>revertirá el ajuste de vacíos</strong> en el cliente <strong>${obsequio.clienteNombre}</strong>.`, async () => {
            _showModal('Progreso', 'Revertiendo y eliminando...');

            try {
                const obsequioRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/obsequios_entregados`, obsequioId);
                const inventarioRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, obsequio.productoId);
                const clienteRef = _doc(_db, `artifacts/ventas-9a210/public/data/clientes`, obsequio.clienteId);

                await _runTransaction(_db, async (transaction) => {
                    // 1. Leer todos los documentos
                    const inventarioDoc = await transaction.get(inventarioRef);
                    const clienteDoc = await transaction.get(clienteRef);
                    // No es necesario leer obsequioRef si ya tenemos los datos, solo lo borramos.

                    if (!inventarioDoc.exists()) throw "El producto de obsequio ya no existe en el inventario.";
                    if (!clienteDoc.exists()) throw "El cliente no existe.";
                    
                    // 2. Calcular reversión de inventario
                    const inventarioData = inventarioDoc.data();
                    const unidadesPorCaja = inventarioData.unidadesPorCaja || 1;
                    const unidadesARestaurar = obsequio.cantidadCajas * unidadesPorCaja;
                    const stockActual = inventarioData.cantidadUnidades || 0;
                    const nuevoStockUnidades = stockActual + unidadesARestaurar; // Añadir de vuelta

                    // 3. Calcular reversión de saldo de vacíos
                    const clienteData = clienteDoc.data();
                    const saldoVaciosActual = clienteData.saldoVacios || {};
                    const tipoVacio = obsequio.tipoVacio;
                    const saldoActualTipo = saldoVaciosActual[tipoVacio] || 0;
                    
                    // Revertir la fórmula original: (saldoActualTipo - cantidadEntregada + vaciosRecibidos)
                    const nuevoSaldoTipo = saldoActualTipo - obsequio.cantidadCajas + obsequio.vaciosRecibidos;
                    const nuevoSaldoVacios = { ...saldoVaciosActual, [tipoVacio]: nuevoSaldoTipo };

                    // 4. Escribir actualizaciones y borrado
                    transaction.update(inventarioRef, { cantidadUnidades: nuevoStockUnidades });
                    transaction.update(clienteRef, { saldoVacios: nuevoSaldoVacios });
                    transaction.delete(obsequioRef); // Eliminar el registro del obsequio
                });

                _showModal('Éxito', 'Obsequio eliminado y revertido correctamente.');
                await handleSearchObsequios(); // Refrescar la lista

            } catch (error) {
                console.error("Error al eliminar obsequio:", error);
                _showModal('Error', `No se pudo eliminar la entrega: ${error.message || error}`);
            }
        }, 'Sí, Eliminar y Revertir', null, true); // triggerConfirmLogic
    }


    // --- FIN: NUEVAS FUNCIONES ---

    // --- INICIO: NUEVA FUNCIÓN PARA COMPARTIR ---
    /**
     * Muestra las opciones para compartir/imprimir un obsequio ya registrado.
     */
    async function shareObsequio(obsequioId) {
        const obsequio = _lastObsequiosSearch.find(o => o.id === obsequioId);
        if (!obsequio) {
            _showModal('Error', 'No se encontró el registro de obsequio.');
            return;
        }

        // Cargar inventario si no está en caché (necesario para datos del producto)
        if (_inventarioCache.length === 0) {
            _showModal('Progreso', 'Cargando datos del producto...');
            await _loadInventarioUsuario();
            const progressModal = document.getElementById('modalContainer');
            if (progressModal && !progressModal.classList.contains('hidden') && progressModal.querySelector('h3')?.textContent.startsWith('Progreso')) {
                progressModal.classList.add('hidden');
            }
        }

        const producto = _inventarioCache.find(p => p.id === obsequio.productoId);
        if (!producto) {
            // Si no está en inventario (raro), crear un objeto temporal para el ticket
             _showModal('Error', 'No se encontraron los datos del producto asociado a este obsequio.');
             return;
        }

        // Llamar a la función de sharing existente con un callback vacío
        _showSharingOptionsObsequio(obsequio, producto, () => {
            // No se necesita hacer nada después de compartir un ticket antiguo
        });
    }
    // --- FIN: NUEVA FUNCIÓN PARA COMPARTIR ---


    // --- MODIFICACIÓN: Exponer el módulo ---
    window.obsequiosModule = {
        editObsequio,
        deleteObsequio,
        shareObsequio // --- AÑADIDO ---
    };

})(); // Fin del IIFE

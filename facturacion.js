// --- Módulo de Simulación de Facturación Fiscal v4 ---
// Novedades v4:
//  · Selector de tipo de simulación: Venta Individual o Venta Mensual
//  · Venta Mensual: agrega los totales por producto de todas las ventas del mes
//    (por defecto el mes anterior, seleccionable)
//  · Panel de detalle con productos y totales antes de generar
//  · Plantilla rediseñada al formato "FACTURA GUÍA" de la hoja física

(function () {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where, _getDoc, _doc, _orderBy, _limit;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    let _clientesCache   = [];
    let _tasasCache      = {};
    let _productosCache  = {};
    let _ventasEncontradas   = [];
    let _clienteSeleccionado = null;
    let _ventaParaFacturar   = null;
    let _tipoSimulacion      = null; // 'individual' | 'mensual'
    let _tipoFacturacion     = null; // 'cerveceria' | 'alimentos'
    let _esVentaSimulada     = false;
    let _simuladaItems       = {}; // { productoId: { cj, paq, und } }

    // ─────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────
    window.initFacturacion = function (deps) {
        _db               = deps.db;
        _userId           = deps.userId;
        _userRole         = deps.userRole;
        _appId            = deps.appId;
        _mainContent      = deps.mainContent;
        _floatingControls = deps.floatingControls;
        _showMainMenu     = deps.showMainMenu;
        _showModal        = deps.showModal;
        _collection       = deps.collection;
        _getDocs          = deps.getDocs;
        _query            = deps.query;
        _where            = deps.where;
        _getDoc           = deps.getDoc;
        _doc              = deps.doc;
        _orderBy          = deps.orderBy;
        _limit            = deps.limit;
        console.log('Módulo Facturación v4 inicializado.');
    };

    // Fecha local helpers
    function hoyLocalISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function mesAnteriorISO() {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // ─────────────────────────────────────────────
    // VISTA PRINCIPAL
    // ─────────────────────────────────────────────
    window.showFacturacionView = async function () {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        const today = hoyLocalISO();
        _tipoSimulacion    = null;
        _tipoFacturacion   = null;
        _ventaParaFacturar = null;
        _clienteSeleccionado = null;

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-8 w-full max-w-5xl mx-auto flex flex-col min-h-screen">
                <div class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col flex-grow border-t-4 border-blue-800">

                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
                        <h2 class="text-xl sm:text-2xl font-black text-gray-800 tracking-tight">🧾 Simulador de Facturación</h2>
                        <button id="btnVolverFacturacion" class="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition">Volver al Menú</button>
                    </div>

                    <!-- Simular Venta (armar venta desde cero) -->
                    <div class="mb-4">
                        <button id="btnSimularVenta"
                            class="w-full px-4 py-3 bg-purple-600 text-white font-bold rounded-lg shadow hover:bg-purple-700 transition flex items-center justify-center gap-2 text-sm">
                            🧪 Simular Venta <span class="text-xs font-normal opacity-80">(armar una venta de prueba)</span>
                        </button>
                    </div>

                    <div id="facSepOr" class="flex items-center gap-3 mb-4">
                        <div class="flex-1 h-px bg-gray-300"></div>
                        <span class="text-xs text-gray-400 font-bold uppercase">o factura una venta real</span>
                        <div class="flex-1 h-px bg-gray-300"></div>
                    </div>

                    <!-- Paso 1: Cliente -->
                    <div id="facPanelCliente" class="p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-inner mb-4">
                        <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">1. Seleccionar Cliente:</label>
                        <div class="relative">
                            <input type="text" id="facClientSearch" placeholder="Escriba el nombre o RIF..."
                                class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition">
                            <div id="facClientDropdown"
                                class="absolute z-50 w-full bg-white border border-gray-300 rounded-b-md shadow-lg hidden max-h-60 overflow-y-auto mt-1"></div>
                            <div id="facClientSelected"
                                class="hidden mt-1 p-2 bg-blue-100 text-blue-800 font-bold rounded flex justify-between items-center border border-blue-200 shadow-sm">
                                <span id="facClientName" class="truncate pr-2 text-sm sm:text-base"></span>
                                <button id="facClientClear" class="text-red-500 hover:text-red-700 text-xl leading-none font-black px-2">&times;</button>
                            </div>
                        </div>
                    </div>

                    <!-- Paso 2: Tipo de simulación -->
                    <div id="facPanelTipo" class="hidden p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-inner mb-4">
                        <label class="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">2. Tipo de Simulación:</label>
                        <div class="grid grid-cols-2 gap-3">
                            <button id="btnTipoIndividual"
                                class="fac-tipo-btn px-3 py-3 rounded-lg border-2 border-gray-300 bg-white text-gray-700 font-bold text-sm transition hover:border-blue-400">
                                📄 Venta Individual
                            </button>
                            <button id="btnTipoMensual"
                                class="fac-tipo-btn px-3 py-3 rounded-lg border-2 border-gray-300 bg-white text-gray-700 font-bold text-sm transition hover:border-blue-400">
                                📆 Venta Mensual
                            </button>
                        </div>

                        <!-- Sub-panel: venta individual -->
                        <div id="facSubIndividual" class="hidden mt-4">
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Seleccionar Venta:</label>
                            <select id="facSelectVenta"
                                class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm disabled:bg-gray-200 transition cursor-pointer"
                                disabled>
                                <option value="">Cargando ventas...</option>
                            </select>
                        </div>

                        <!-- Sub-panel: venta mensual -->
                        <div id="facSubMensual" class="hidden mt-4">
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Mes a Facturar:</label>
                            <div class="flex gap-2 items-center">
                                <input type="month" id="facMesInput" value="${mesAnteriorISO()}"
                                    class="flex-1 border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm">
                            </div>
                            <p id="facMesResumen" class="text-xs text-gray-500 mt-2 font-semibold"></p>
                        </div>
                    </div>

                    <!-- Paso 3: Tipo de facturación -->
                    <div id="facPanelTipoFact" class="hidden p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-inner mb-4">
                        <label class="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">3. Tipo de Facturación:</label>
                        <div class="grid grid-cols-2 gap-3">
                            <button id="btnFactCerveceria"
                                class="fac-fact-btn px-3 py-3 rounded-lg border-2 border-gray-300 bg-white text-gray-700 font-bold text-sm transition hover:border-amber-400">
                                🍺 Cervecería
                            </button>
                            <button id="btnFactAlimentos"
                                class="fac-fact-btn px-3 py-3 rounded-lg border-2 border-gray-300 bg-white text-gray-700 font-bold text-sm transition hover:border-red-400">
                                🥫 Alimentos
                            </button>
                        </div>
                    </div>

                    <!-- Paso 4: Datos de emisión -->
                    <div id="facPanelTasa" class="hidden flex-col bg-indigo-50 border border-indigo-200 rounded-lg p-4 sm:p-5 shadow-sm mb-4">
                        <h3 class="font-bold text-indigo-900 border-b border-indigo-200 pb-2 mb-4 text-sm sm:text-base">4. Datos de Emisión</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label class="block text-xs font-bold text-indigo-800 mb-1 uppercase tracking-wider">Fecha Tasa BCV:</label>
                                <input type="date" id="facFechaTasa" value="${today}"
                                    class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-800 mb-1 uppercase tracking-wider">Valor Tasa (Bs):</label>
                                <input type="number" id="facValorTasa" step="0.0001" placeholder="Ej: 36.50"
                                    class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-900">
                            </div>
                            <div class="sm:col-span-2 md:col-span-1">
                                <button id="btnGenerarFactura"
                                    class="w-full bg-green-600 text-white py-2.5 rounded-md shadow hover:bg-green-700 font-bold transition text-sm flex items-center justify-center gap-2">
                                    <span>📄</span> Generar Factura
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Panel de detalle previo -->
                    <div id="facPanelDetalle" class="hidden bg-white border border-gray-300 rounded-lg shadow-sm mb-4 overflow-hidden">
                        <div class="bg-gray-800 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider flex justify-between items-center">
                            <span>Detalle de la Simulación</span>
                            <span id="facDetalleTag" class="bg-blue-500 px-2 py-0.5 rounded text-[10px]"></span>
                        </div>
                        <div id="facDetalleBody" class="overflow-x-auto"></div>
                    </div>

                    <div id="facEmptyState"
                        class="flex-grow flex items-center justify-center text-gray-400 font-medium border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 text-center p-6 min-h-[120px]">
                        Seleccione un cliente para comenzar.
                    </div>
                </div>
            </div>`;

        // ── Eventos ──────────────────────────────────────
        document.getElementById('btnVolverFacturacion').addEventListener('click', _showMainMenu);
        document.getElementById('btnSimularVenta').addEventListener('click', abrirSimuladorVenta);

        let _facSearchDebounce = null;
        document.getElementById('facClientSearch').addEventListener('input', (e) => {
            clearTimeout(_facSearchDebounce);
            _facSearchDebounce = setTimeout(() => {
                const term = e.target.value.toLowerCase().trim();
                if (!term) { document.getElementById('facClientDropdown').classList.add('hidden'); return; }
                const filtered = _clientesCache.filter(c =>
                    (c.nombreComercial || '').toLowerCase().includes(term) ||
                    (c.rif || '').toLowerCase().includes(term)
                ).slice(0, 15);
                renderClientDropdown(filtered);
            }, 200);
        });

        document.getElementById('facClientClear').addEventListener('click', resetFlujo);

        document.getElementById('btnTipoIndividual').addEventListener('click', () => seleccionarTipo('individual'));
        document.getElementById('btnTipoMensual').addEventListener('click', () => seleccionarTipo('mensual'));

        document.getElementById('btnFactCerveceria').addEventListener('click', () => seleccionarTipoFacturacion('cerveceria'));
        document.getElementById('btnFactAlimentos').addEventListener('click', () => seleccionarTipoFacturacion('alimentos'));

        document.getElementById('facSelectVenta').addEventListener('change', (e) => {
            if (e.target.value !== '') {
                _ventaParaFacturar = _ventasEncontradas[parseInt(e.target.value)];
                mostrarPanelTipoFact();
            } else {
                _ventaParaFacturar = null;
                ocultarEmisionYDetalle();
            }
        });

        document.getElementById('facMesInput').addEventListener('change', (e) => {
            procesarMesSeleccionado(e.target.value);
        });

        document.getElementById('facFechaTasa').addEventListener('change', (e) =>
            cargarTasaBcvPorFecha(e.target.value));

        document.getElementById('btnGenerarFactura').addEventListener('click', generarFacturaFiscal);

        await cargarDatosIniciales();

        // Si venimos desde CXC (recibo encontrado), armar la venta y saltar al paso 3
        if (window.__ventaDesdeCXC) {
            const v = window.__ventaDesdeCXC;
            window.__ventaDesdeCXC = null; // consumir una sola vez
            cargarVentaDesdeCXC(v);
        }
    };

    // Recibe una venta encontrada en CXC y la prepara para facturar (salta a tipo de facturación)
    function cargarVentaDesdeCXC(v) {
        const productos = (v.productos || []).map(p => ({
            id:              p.id || '',
            marca:           p.marca || '',
            segmento:        p.segmento || '',
            presentacion:    p.presentacion || '',
            rubro:           p.rubro || (p.id && _productosCache[p.id] ? _productosCache[p.id].rubro : '') || '',
            precios:         p.precios || { cj: 0, paq: 0, und: p.precioPorUnidad || 0 },
            cantidadVendida: p.cantidadVendida || { cj: 0, paq: 0, und: 0 },
            cantidad:        p.cantidad || 0,
            total:           p.total || 0
        }));

        _esVentaSimulada   = false;
        _clienteSeleccionado = {
            id:              v.clienteId || '__desde_cxc__',
            nombreComercial: v.clienteNombre || 'Cliente',
            nombrePersonal:  v.clienteNombrePersonal || '',
            rif:             v.clienteRif || v.rif || 'N/A',
            aplicaRetencion: v.aplicaRetencion || false
        };
        _ventaParaFacturar = { productos, total: v.total || 0, esMensual: false, desdeCXC: true };

        // Ocultar los paneles de origen (cliente / simular / tipo de venta), ir directo al paso 3
        document.getElementById('facPanelCliente')?.classList.add('hidden');
        document.getElementById('facSepOr')?.classList.add('hidden');
        document.getElementById('facPanelTipo')?.classList.add('hidden');

        const bSim = document.getElementById('btnSimularVenta');
        if (bSim) {
            bSim.innerHTML = '📄 Venta recuperada desde CXC — <span class="text-xs font-normal opacity-80">' +
                productos.length + ' producto(s) · $' + (v.total || 0).toFixed(2) + '</span>';
            bSim.classList.remove('bg-purple-600', 'hover:bg-purple-700');
            bSim.classList.add('bg-blue-700');
        }

        mostrarPanelTipoFact();
    }

    function resetFlujo() {
        _clienteSeleccionado = null;
        _ventaParaFacturar   = null;
        _tipoSimulacion      = null;
        _esVentaSimulada     = false;
        _simuladaItems       = {};
        // Restaurar botón y paneles de venta real
        const bSim = document.getElementById('btnSimularVenta');
        if (bSim) {
            bSim.innerHTML = '🧪 Simular Venta <span class="text-xs font-normal opacity-80">(armar una venta de prueba)</span>';
            bSim.classList.remove('bg-purple-800');
            bSim.classList.add('bg-purple-600', 'hover:bg-purple-700');
        }
        document.getElementById('facPanelCliente')?.classList.remove('hidden');
        document.getElementById('facSepOr')?.classList.remove('hidden');
        document.getElementById('facClientSelected').classList.add('hidden');
        document.getElementById('facClientSearch').classList.remove('hidden');
        document.getElementById('facClientSearch').value = '';
        document.getElementById('facPanelTipo').classList.add('hidden');
        document.getElementById('facSubIndividual').classList.add('hidden');
        document.getElementById('facSubMensual').classList.add('hidden');
        document.querySelectorAll('.fac-tipo-btn').forEach(b => b.classList.remove('border-blue-600', 'bg-blue-50', 'text-blue-800'));
        _tipoFacturacion = null;
        document.getElementById('facPanelTipoFact').classList.add('hidden');
        document.querySelectorAll('.fac-fact-btn').forEach(b => b.classList.remove('border-amber-600', 'bg-amber-50', 'text-amber-900', 'border-red-600', 'bg-red-50', 'text-red-900'));
        ocultarEmisionYDetalle();
        const es = document.getElementById('facEmptyState');
        es.classList.remove('hidden');
        es.textContent = 'Seleccione un cliente para comenzar.';
    }

    function ocultarEmisionYDetalle() {
        document.getElementById('facPanelTasa').classList.add('hidden');
        document.getElementById('facPanelDetalle').classList.add('hidden');
        document.getElementById('facPanelTipoFact')?.classList.add('hidden');
        document.getElementById('facEmptyState').classList.remove('hidden');
    }

    function mostrarPanelTipoFact() {
        document.getElementById('facPanelTipoFact').classList.remove('hidden');
        document.getElementById('facEmptyState').classList.add('hidden');
        if (_tipoFacturacion) {
            mostrarEmisionYDetalle();
        } else {
            document.getElementById('facPanelTasa').classList.add('hidden');
            document.getElementById('facPanelDetalle').classList.add('hidden');
        }
    }

    function seleccionarTipoFacturacion(tipo) {
        _tipoFacturacion = tipo;
        const bC = document.getElementById('btnFactCerveceria');
        const bA = document.getElementById('btnFactAlimentos');
        bC.classList.remove('border-amber-600', 'bg-amber-50', 'text-amber-900');
        bA.classList.remove('border-red-600', 'bg-red-50', 'text-red-900');
        if (tipo === 'cerveceria') bC.classList.add('border-amber-600', 'bg-amber-50', 'text-amber-900');
        else bA.classList.add('border-red-600', 'bg-red-50', 'text-red-900');
        mostrarEmisionYDetalle();
    }

    function mostrarEmisionYDetalle() {
        document.getElementById('facPanelTasa').classList.remove('hidden');
        document.getElementById('facEmptyState').classList.add('hidden');
        renderDetallePrevio();
    }

    function seleccionarTipo(tipo) {
        _tipoSimulacion = tipo;
        _ventaParaFacturar = null;
        ocultarEmisionYDetalle();

        const bI = document.getElementById('btnTipoIndividual');
        const bM = document.getElementById('btnTipoMensual');
        [bI, bM].forEach(b => b.classList.remove('border-blue-600', 'bg-blue-50', 'text-blue-800'));
        (tipo === 'individual' ? bI : bM).classList.add('border-blue-600', 'bg-blue-50', 'text-blue-800');

        document.getElementById('facSubIndividual').classList.toggle('hidden', tipo !== 'individual');
        document.getElementById('facSubMensual').classList.toggle('hidden', tipo !== 'mensual');

        if (tipo === 'individual') {
            const sel = document.getElementById('facSelectVenta');
            if (sel.options.length > 0 && !sel.disabled) sel.value = '';
        } else {
            procesarMesSeleccionado(document.getElementById('facMesInput').value);
        }
    }

    // ─────────────────────────────────────────────
    // AGREGACIÓN MENSUAL
    // ─────────────────────────────────────────────
    function procesarMesSeleccionado(mesStr) {
        const resumen = document.getElementById('facMesResumen');
        if (!mesStr) { resumen.textContent = ''; _ventaParaFacturar = null; ocultarEmisionYDetalle(); return; }

        const [y, m] = mesStr.split('-').map(Number);
        const ventasMes = _ventasEncontradas.filter(v =>
            v.fechaObj.getFullYear() === y && (v.fechaObj.getMonth() + 1) === m);

        if (!ventasMes.length) {
            resumen.textContent = '⚠️ No hay ventas registradas para este mes.';
            resumen.className = 'text-xs text-amber-600 mt-2 font-semibold';
            _ventaParaFacturar = null;
            ocultarEmisionYDetalle();
            return;
        }

        // Agregar cantidades por producto (los precios se toman de la venta más reciente
        // porque _ventasEncontradas está ordenado descendente por fecha)
        const productosMap = {};
        ventasMes.forEach(v => {
            (v.productos || []).forEach(p => {
                const key = p.id || `${p.marca || ''}|${p.presentacion || ''}`;
                if (!productosMap[key]) {
                    productosMap[key] = JSON.parse(JSON.stringify(p));
                    productosMap[key].cantidadVendida = {
                        cj:  parseInt(p.cantidadVendida?.cj)  || 0,
                        paq: parseInt(p.cantidadVendida?.paq) || 0,
                        und: parseInt(p.cantidadVendida?.und) || 0
                    };
                    productosMap[key].cantidad = parseInt(p.cantidad) || 0;
                    productosMap[key].total    = parseFloat(p.total)  || 0;
                } else {
                    const t = productosMap[key];
                    t.cantidadVendida.cj  += parseInt(p.cantidadVendida?.cj)  || 0;
                    t.cantidadVendida.paq += parseInt(p.cantidadVendida?.paq) || 0;
                    t.cantidadVendida.und += parseInt(p.cantidadVendida?.und) || 0;
                    t.cantidad += parseInt(p.cantidad) || 0;
                    t.total    += parseFloat(p.total)  || 0;
                }
            });
        });

        const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
        const nombreMes = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

        _ventaParaFacturar = {
            productos: Object.values(productosMap),
            total:     totalMes,
            esMensual: true,
            mes:       mesStr,
            nombreMes: nombreMes,
            numVentas: ventasMes.length
        };

        resumen.textContent = `✅ ${ventasMes.length} venta(s) en ${nombreMes} · Total: $${totalMes.toFixed(2)}`;
        resumen.className = 'text-xs text-green-700 mt-2 font-semibold';
        mostrarPanelTipoFact();
    }

    // ─────────────────────────────────────────────
    // PANEL DE DETALLE PREVIO
    // ─────────────────────────────────────────────
    function renderDetallePrevio() {
        const panel = document.getElementById('facPanelDetalle');
        const body  = document.getElementById('facDetalleBody');
        const tag   = document.getElementById('facDetalleTag');
        if (!panel || !_ventaParaFacturar) return;

        const tipoTag = _tipoFacturacion
            ? (_tipoFacturacion === 'cerveceria' ? '🍺 CERVECERÍA · ' : '🥫 ALIMENTOS · ')
            : '';
        tag.textContent = tipoTag + (_ventaParaFacturar.esMensual
            ? `MENSUAL · ${_ventaParaFacturar.nombreMes.toUpperCase()}`
            : 'VENTA INDIVIDUAL');

        // Ordenar como inventario. Si es ALIMENTOS, los productos del rubro
        // CERVECERIA Y VINOS se omiten de la factura y se listan aparte.
        let todos = ordenarComoInventario((_ventaParaFacturar.productos || []).slice());
        let productosOmitidos = [];
        let productosDetalle = todos;
        if (_tipoFacturacion === 'alimentos') {
            productosDetalle   = todos.filter(p => !esProductoCerveceria(p));
            productosOmitidos  = todos.filter(p =>  esProductoCerveceria(p));
        }

        if (!productosDetalle.length && !productosOmitidos.length) {
            body.innerHTML = '<p class="p-4 text-center text-xs text-amber-600 font-semibold">⚠️ La venta seleccionada no contiene productos.</p>';
            panel.classList.remove('hidden');
            return;
        }

        let rowsHtml = '';
        let totalGeneral = 0;

        productosDetalle.forEach(p => {
            const qCj  = parseInt(p.cantidadVendida?.cj)  || 0;
            const qPaq = parseInt(p.cantidadVendida?.paq) || 0;
            const qUnd = parseInt(p.cantidadVendida?.und) || 0;
            const pCj  = parseFloat(p.precios?.cj)  || 0;
            const pPaq = parseFloat(p.precios?.paq) || 0;
            const pUnd = parseFloat(p.precios?.und) || parseFloat(p.precioPorUnidad) || 0;

            let cantidades = [];
            let totalProd = 0;
            if (qCj  > 0) { cantidades.push(`${qCj} Cj`);  totalProd += qCj  * pCj; }
            if (qPaq > 0) { cantidades.push(`${qPaq} Pq`); totalProd += qPaq * pPaq; }
            if (qUnd > 0) { cantidades.push(`${qUnd} Un`); totalProd += qUnd * pUnd; }

            if (!cantidades.length) {
                const fQty = parseInt(p.cantidad) || 1;
                const fPrc = pUnd > 0 ? pUnd : ((parseFloat(p.total) || 0) / fQty);
                cantidades.push(`${fQty} Un`);
                totalProd = fQty * fPrc;
            }

            totalGeneral += totalProd;
            const desc = [p.marca, p.segmento, p.presentacion].filter(s => s && !['S/M','S/S'].includes(s)).join(' · ') || 'Producto';

            rowsHtml += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="px-3 py-1.5 text-xs text-gray-800">${desc}</td>
                    <td class="px-3 py-1.5 text-xs text-center font-bold text-gray-700 whitespace-nowrap">${cantidades.join(' + ')}</td>
                    <td class="px-3 py-1.5 text-xs text-right font-bold text-green-700 whitespace-nowrap">$${totalProd.toFixed(2)}</td>
                </tr>`;
        });

        body.innerHTML = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-gray-100 text-[10px] uppercase text-gray-500 tracking-wider">
                        <th class="px-3 py-2">Producto</th>
                        <th class="px-3 py-2 text-center">Cantidades</th>
                        <th class="px-3 py-2 text-right">Total USD</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr class="bg-gray-800 text-white">
                        <td class="px-3 py-2 text-xs font-black uppercase" colspan="2">Total General</td>
                        <td class="px-3 py-2 text-sm font-black text-right">$${totalGeneral.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            ${productosOmitidos.length ? `
            <div class="border-t-2 border-amber-300 bg-amber-50 px-3 py-3">
                <p class="text-[11px] font-black text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                    ⚠️ Se omitirán al generar (Cervecería y Vinos) — ${productosOmitidos.length}
                </p>
                <ul class="space-y-1">
                    ${productosOmitidos.map(p => {
                        const d = [p.marca, p.segmento, p.presentacion].filter(s => s && !['S/M','S/S'].includes(s)).join(' · ') || 'Producto';
                        return `<li class="text-xs text-amber-700 flex items-center gap-1.5">
                            <span class="text-amber-400">✕</span> <span class="line-through">${d}</span>
                        </li>`;
                    }).join('')}
                </ul>
                <p class="text-[10px] text-amber-600 mt-2 italic">Estos productos son de Cervecería; use el tipo de facturación "Cervecería" para incluirlos.</p>
            </div>` : ''}`;

        panel.classList.remove('hidden');
    }

    // ─────────────────────────────────────────────
    // CARGA DE DATOS INICIALES
    // ─────────────────────────────────────────────

    // ═════════════════════════════════════════════
    // SIMULADOR DE VENTA — armar una venta puntual desde el catálogo
    // ═════════════════════════════════════════════
    function abrirSimuladorVenta() {
        _simuladaItems = {};
        const productos = ordenarComoInventario(
            Object.entries(_productosCache).map(([id, d]) => ({ id, ...d }))
                .filter(p => p.presentacion || p.marca)
        );

        if (!productos.length) {
            _showModal('Aviso', 'El catálogo de productos aún no ha cargado. Intente de nuevo en unos segundos.');
            return;
        }

        const rubros = [...new Set(productos.map(p => p.rubro).filter(Boolean))].sort();

        document.getElementById('facSimOverlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'facSimOverlay';
        overlay.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4';
        overlay.innerHTML = `
            <div class="bg-white w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div class="bg-purple-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
                    <h3 class="font-bold text-base flex items-center gap-2">🧪 Simular Venta</h3>
                    <button id="simClose" class="text-white text-2xl leading-none font-black px-2 hover:opacity-70">&times;</button>
                </div>

                <div class="p-3 border-b border-gray-200 shrink-0 flex gap-2">
                    <div class="relative flex-1 min-w-0">
                        <input type="text" id="simSearch" placeholder="Buscar producto..."
                            class="w-full pl-8 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none">
                        <svg class="absolute left-2 top-2.5 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                    </div>
                    <select id="simRubro" class="shrink-0 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-400 outline-none max-w-[130px]">
                        <option value="">Todos</option>
                        ${rubros.map(r => `<option value="${r}">${r}</option>`).join('')}
                    </select>
                </div>

                <div class="flex-1 overflow-y-auto">
                    <table class="min-w-full bg-white text-sm">
                        <thead class="bg-gray-200 sticky top-0 z-10">
                            <tr class="uppercase text-xs">
                                <th class="py-2 px-2 text-center w-20">Cant</th>
                                <th class="py-2 px-2 text-left">Producto</th>
                                <th class="py-2 px-2 text-left">Precio</th>
                            </tr>
                        </thead>
                        <tbody id="simList" class="text-gray-600"></tbody>
                    </table>
                </div>

                <div class="border-t border-gray-200 p-3 shrink-0 bg-gray-50">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-gray-500 uppercase">Productos en la venta:</span>
                        <span id="simCount" class="text-sm font-black text-purple-700">0</span>
                    </div>
                    <button id="simConfirm"
                        class="w-full px-4 py-2.5 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                        disabled>
                        Continuar a Facturación →
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        let currentSearch = '', currentRubro = '';

        const renderList = () => {
            const list = document.getElementById('simList');
            let filtered = productos;
            if (currentRubro)  filtered = filtered.filter(p => p.rubro === currentRubro);
            if (currentSearch) filtered = filtered.filter(p =>
                (p.presentacion || '').toLowerCase().includes(currentSearch) ||
                (p.marca || '').toLowerCase().includes(currentSearch) ||
                (p.segmento || '').toLowerCase().includes(currentSearch));

            if (!filtered.length) {
                list.innerHTML = '<tr><td colspan="3" class="text-center text-gray-400 py-6 text-sm">No se encontraron productos.</td></tr>';
                return;
            }

            // Mismo formato que "Nueva Venta": filas por modo de venta, agrupadas por segmento
            let html = '';
            let lastHeaderKey = null;

            filtered.forEach(prod => {
                const curHeaderVal = prod.segmento || 'Sin segmento';
                if (curHeaderVal !== lastHeaderKey) {
                    lastHeaderKey = curHeaderVal;
                    html += `<tr><td colspan="3" class="py-1.5 px-2 font-bold text-gray-700 bg-gray-200 border-y border-gray-300 uppercase text-xs tracking-wide">${lastHeaderKey}</td></tr>`;
                }

                const vp = prod.ventaPor || { und: true };
                const it = _simuladaItems[prod.id] || { cj: 0, paq: 0, und: 0 };
                const precios = prod.precios || { und: prod.precioPorUnidad || 0 };

                const createRow = (tipo, currentQty, price, descText) => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-2 px-2 text-center align-middle">
                            <input type="number" min="0" value="${currentQty}" inputmode="numeric"
                                class="sim-qty w-16 p-1 text-center border rounded-md font-bold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
                                data-id="${prod.id}" data-tipo="${tipo}">
                        </td>
                        <td class="py-2 px-2 text-left align-middle font-medium text-gray-700">
                            ${descText} <span class="text-xs text-gray-500">${prod.marca || 'S/M'}</span>
                        </td>
                        <td class="py-2 px-2 text-left align-middle font-bold text-gray-900">$${parseFloat(price || 0).toFixed(2)}</td>
                    </tr>`;

                let filas = 0;
                if (vp.cj) {
                    const uCj = prod.unidadesPorCaja || 1;
                    html += createRow('cj', it.cj || 0, precios.cj || 0, `${prod.presentacion} (Cj/${uCj} und)`);
                    filas++;
                }
                if (vp.paq) {
                    const uPaq = prod.unidadesPorPaquete || 1;
                    html += createRow('paq', it.paq || 0, precios.paq || 0, `${prod.presentacion} (Paq/${uPaq} und)`);
                    filas++;
                }
                if (vp.und) {
                    html += createRow('und', it.und || 0, precios.und || prod.precioPorUnidad || 0, `${prod.presentacion} (Und)`);
                    filas++;
                }
                if (filas === 0) {
                    html += createRow('und', it.und || 0, precios.und || prod.precioPorUnidad || 0, `${prod.presentacion} (Und)`);
                }
            });

            list.innerHTML = html;

            list.querySelectorAll('.sim-qty').forEach(inp => {
                inp.addEventListener('wheel', e => e.preventDefault(), { passive: false });
                inp.addEventListener('input', () => {
                    const id = inp.dataset.id, tipo = inp.dataset.tipo;
                    const val = Math.max(0, parseInt(inp.value, 10) || 0);
                    if (!_simuladaItems[id]) _simuladaItems[id] = { cj: 0, paq: 0, und: 0 };
                    _simuladaItems[id][tipo] = val;
                    if (_simuladaItems[id].cj + _simuladaItems[id].paq + _simuladaItems[id].und === 0)
                        delete _simuladaItems[id];
                    actualizarContador();
                });
            });
        };

        const actualizarContador = () => {
            const n = Object.keys(_simuladaItems).length;
            document.getElementById('simCount').textContent = n;
            document.getElementById('simConfirm').disabled = n === 0;
        };

        let _simDebounce = null;
        document.getElementById('simSearch').addEventListener('input', e => {
            clearTimeout(_simDebounce);
            _simDebounce = setTimeout(() => { currentSearch = e.target.value.toLowerCase().trim(); renderList(); }, 180);
        });
        document.getElementById('simRubro').addEventListener('change', e => { currentRubro = e.target.value; renderList(); });
        document.getElementById('simClose').addEventListener('click', () => overlay.remove());
        document.getElementById('simConfirm').addEventListener('click', () => {
            construirVentaSimulada();
            overlay.remove();
        });

        renderList();
    }

    function construirVentaSimulada() {
        const productos = [];
        let total = 0;

        Object.entries(_simuladaItems).forEach(([id, qty]) => {
            const cat = _productosCache[id];
            if (!cat) return;
            const pCj  = parseFloat(cat.precios?.cj)  || 0;
            const pPaq = parseFloat(cat.precios?.paq) || 0;
            const pUnd = parseFloat(cat.precios?.und) || parseFloat(cat.precioPorUnidad) || 0;
            total += (qty.cj * pCj) + (qty.paq * pPaq) + (qty.und * pUnd);

            productos.push({
                id,
                marca:        cat.marca || '',
                segmento:     cat.segmento || '',
                presentacion: cat.presentacion || '',
                rubro:        cat.rubro || '',
                precios:      { cj: pCj, paq: pPaq, und: pUnd },
                cantidadVendida: { cj: qty.cj, paq: qty.paq, und: qty.und }
            });
        });

        _esVentaSimulada = true;
        _clienteSeleccionado = {
            id: '__simulada__',
            nombreComercial: 'CLIENTE DE PRUEBA (SIMULACIÓN)',
            rif: 'J-00000000-0',
            aplicaRetencion: false
        };
        _ventaParaFacturar = { productos, total, esMensual: false, esSimulada: true };

        // Ocultar los paneles de cliente y tipo de venta; ir directo a tipo de facturación
        document.getElementById('facPanelCliente')?.classList.add('hidden');
        document.getElementById('facSepOr')?.classList.add('hidden');
        document.getElementById('facPanelTipo')?.classList.add('hidden');
        document.getElementById('btnSimularVenta').innerHTML =
            '✅ Venta simulada lista — <span class="text-xs font-normal opacity-80">' +
            productos.length + ' producto(s) · $' + total.toFixed(2) + '</span>';
        document.getElementById('btnSimularVenta').classList.remove('bg-purple-600', 'hover:bg-purple-700');
        document.getElementById('btnSimularVenta').classList.add('bg-purple-800');

        mostrarPanelTipoFact();
    }


    async function cargarDatosIniciales() {
        try {
            const [snapClientes, snapTasas, snapProductos] = await Promise.all([
                _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`)),
                _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/tasas_bcv`)),
                _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/productos`))
            ]);
            _clientesCache = snapClientes.docs.map(d => ({ id: d.id, ...d.data() }));
            _tasasCache    = {};
            snapTasas.forEach(d => { _tasasCache[d.id] = d.data().rate; });
            _productosCache = {};
            snapProductos.docs.forEach(d => { _productosCache[d.id] = d.data(); });
            const fi = document.getElementById('facFechaTasa');
            if (fi) cargarTasaBcvPorFecha(fi.value);
        } catch (e) { console.error('Error cargando datos iniciales Facturación:', e); }
    }

    function renderClientDropdown(clientes) {
        const dd = document.getElementById('facClientDropdown');
        if (!dd) return;
        dd.innerHTML = '';
        if (!clientes.length) { dd.classList.add('hidden'); return; }
        clientes.forEach(c => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-blue-50 cursor-pointer text-sm text-gray-800 transition flex flex-wrap items-center gap-1';
            const badge = c.aplicaRetencion
                ? `<span class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">Retención</span>` : '';
            div.innerHTML = `<span class="font-bold truncate max-w-[60%]">${c.nombreComercial}</span>
                             <span class="text-xs text-gray-500">(${c.rif || 'Sin RIF'})</span>${badge}`;
            div.onclick = () => {
                _clienteSeleccionado = c;
                document.getElementById('facClientSearch').classList.add('hidden');
                dd.classList.add('hidden');
                document.getElementById('facClientSelected').classList.remove('hidden');
                const badge2 = c.aplicaRetencion
                    ? `<span class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold ml-1">Retención</span>` : '';
                document.getElementById('facClientName').innerHTML = c.nombreComercial + badge2;
                cargarVentasCliente(c);
            };
            dd.appendChild(div);
        });
        dd.classList.remove('hidden');
    }

    function cargarTasaBcvPorFecha(fechaStr) {
        const inp = document.getElementById('facValorTasa');
        if (!inp || !fechaStr) return;
        if (_tasasCache[fechaStr]) {
            inp.value = _tasasCache[fechaStr];
            inp.classList.add('bg-green-50');
            inp.classList.remove('bg-yellow-50');
            inp.placeholder = 'Ej: 36.50';
        } else {
            inp.value = '';
            inp.classList.add('bg-yellow-50');
            inp.classList.remove('bg-green-50');
            inp.placeholder = 'No registrada — ingrese manual';
        }
    }

    async function cargarVentasCliente(cliente) {
        _esVentaSimulada = false; // al elegir cliente real dejamos de estar en modo simulación
        const es  = document.getElementById('facEmptyState');
        document.getElementById('facPanelTipo').classList.add('hidden');
        ocultarEmisionYDetalle();
        es.innerHTML = '<p class="animate-pulse text-blue-500 font-semibold">Consultando base de datos...</p>';
        es.classList.remove('hidden');

        try {
            const usersSnap = await _getDocs(_collection(_db, 'users'));
            const uids = usersSnap.docs.map(d => d.id);
            _ventasEncontradas = [];

            for (const uid of uids) {
                try {
                    const qA = _query(
                        _collection(_db, `artifacts/${_appId}/users/${uid}/ventas`),
                        _where('clienteId', '==', cliente.id)
                    );
                    (await _getDocs(qA)).docs.forEach(d => {
                        const v = d.data();
                        const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                        _ventasEncontradas.push({ id: d.id, origen: 'Activa', ...v, fechaObj: f });
                    });

                    const qC = _query(
                        _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`),
                        _orderBy('fecha', 'desc'), _limit(150)
                    );
                    (await _getDocs(qC)).docs.forEach(dc => {
                        const cierre = dc.data();
                        (cierre.ventas || []).forEach(v => {
                            if (v.clienteId === cliente.id) {
                                const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha || cierre.fecha);
                                _ventasEncontradas.push({
                                    id: dc.id + '-' + Math.random().toString(36).substr(2, 5),
                                    origen: 'Histórico', ...v, fechaObj: f
                                });
                            }
                        });
                    });
                } catch (_) { /* permisos */ }
            }

            if (!_ventasEncontradas.length) {
                es.textContent = 'El cliente no posee historial de compras.';
                return;
            }

            _ventasEncontradas.sort((a, b) => b.fechaObj - a.fechaObj);

            // Poblar el select de venta individual
            const sel = document.getElementById('facSelectVenta');
            sel.innerHTML = '<option value="">— Seleccione una venta —</option>';
            _ventasEncontradas.forEach((v, i) => {
                const fd = v.fechaObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const fh = v.fechaObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const o  = document.createElement('option');
                o.value  = i;
                o.textContent = `📅 ${fd} ${fh}  |  $${(v.total || 0).toFixed(2)}  (${v.origen})`;
                sel.appendChild(o);
            });
            sel.disabled = false;

            // Mostrar el panel de tipo de simulación
            document.getElementById('facPanelTipo').classList.remove('hidden');
            es.textContent = '← Seleccione el tipo de simulación (Individual o Mensual).';
        } catch (err) {
            console.error('Error cargando ventas:', err);
            es.textContent = 'Error al consultar la base de datos.';
        }
    }

    // ─────────────────────────────────────────────
    // CLASIFICACIÓN DE PRODUCTO EN CATEGORÍA
    // Orden: 0-MALTIN · 1-RETORNABLES · 2-PET · 3-EXENTOS por marca · 4-GRAVADOS por marca
    // ─────────────────────────────────────────────
    function determinarCategoria(p, esExento) {
        const n = s => (s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const seg   = n(p.segmento   || '');
        const marca = n(p.marca      || '');
        const pres  = n(p.presentacion || '');

        if (seg.includes('malta') || marca.includes('maltin')) {
            return { label: 'MALTIN', orden: 0 };
        }

        const tiposVacio = (window.TIPOS_VACIO_GLOBAL || []).map(t => n(t));
        const esRetornable = seg.includes('retornable')
            || tiposVacio.some(tv => pres.includes(tv))
            || /\bret(ornable)?\b/.test(pres);
        if (esRetornable) {
            return { label: 'REFRESCOS\nRETORNABLES', orden: 1 };
        }

        const esPET = seg.includes('pet')
            || pres.includes('pet')
            || /\b(1[\s.]?000|1[\s.]?500|2[\s.]?000)\b/.test(pres)
            || /\b(1\.?5?\s*lts?|2\s*lts?|1\s*lts?)\b/.test(pres);
        if (esPET) {
            return { label: 'REFRESCOS\nPET', orden: 2 };
        }

        const marcaDisplay = (p.marca && !['s/m','sin marca'].includes(marca))
            ? p.marca.toUpperCase().trim()
            : 'VARIOS';

        return esExento
            ? { label: marcaDisplay, orden: 3 }
            : { label: marcaDisplay, orden: 4 };
    }

    // ─────────────────────────────────────────────
    // GENERACIÓN DE FACTURA
    // ─────────────────────────────────────────────
    let _isGeneratingFactura = false;

    function generarFacturaFiscal() {
        if (_isGeneratingFactura) return;

        const tasaBs = parseFloat(document.getElementById('facValorTasa').value);
        if (isNaN(tasaBs) || tasaBs <= 0) {
            _showModal('Error', 'Debe ingresar una Tasa BCV válida mayor a 0.');
            document.getElementById('facValorTasa').focus();
            return;
        }
        if (!_ventaParaFacturar) {
            _showModal('Error', 'Debe seleccionar una venta o un mes con ventas.');
            return;
        }
        if (!_tipoFacturacion) {
            _showModal('Error', 'Seleccione el tipo de facturación (Cervecería o Alimentos).');
            return;
        }

        // Ordenar como inventario. Si es ALIMENTOS, se omiten los productos
        // del rubro CERVECERIA Y VINOS (van solo en la hoja de Cervecería).
        let productosFactura = ordenarComoInventario((_ventaParaFacturar.productos || []).slice());
        if (_tipoFacturacion === 'alimentos') {
            productosFactura = productosFactura.filter(p => !esProductoCerveceria(p));
            if (!productosFactura.length) {
                _showModal('Aviso', 'Todos los productos de esta venta son de Cervecería. Use el tipo de facturación "Cervecería".');
                return;
            }
        }

        _isGeneratingFactura = true;
        try {

        let subtotalBase   = 0;
        let subtotalExento = 0;
        let ivaTotal       = 0;

        const catMap = {};
        const lineasPlanas = [];

        productosFactura.forEach(p => {
            const prod     = _productosCache[p.id] || p;
            const esExento = !(prod.iva && parseFloat(prod.iva) > 0);

            const cat = determinarCategoria(p, esExento);
            const key = `${cat.orden}__${cat.label}`;
            if (!catMap[key]) catMap[key] = { label: cat.label, orden: cat.orden, lineas: [] };

            const segStr = (p.segmento && !['S/S','sin segmento'].includes((p.segmento || '').toLowerCase()))
                ? p.segmento : '';
            const presStr   = p.presentacion || '';
            const descCorta = [segStr, presStr].filter(Boolean).join(' ') || (p.marca || 'VARIOS');

            const unidades  = prod.unidadesXCaja || prod.unidades || prod.unidadesCaja
                            || prod.unidadesXcaja || prod.uds || '';
            const contenido = prod.contenidoLts || prod.litros || prod.contenido
                            || prod.litrosPorUnidad || prod.ml || '';

            const pCj  = parseFloat(p.precios?.cj)  || 0;
            const pPaq = parseFloat(p.precios?.paq) || 0;
            const pUnd = parseFloat(p.precios?.und) || parseFloat(p.precioPorUnidad) || 0;
            const qCj  = parseInt(p.cantidadVendida?.cj)  || 0;
            const qPaq = parseInt(p.cantidadVendida?.paq) || 0;
            const qUnd = parseInt(p.cantidadVendida?.und) || 0;

            const addLinea = (cantidad, unidadMedida, pvpUSD) => {
                if (cantidad <= 0 || pvpUSD <= 0) return;
                let baseUSD;
                if (esExento) {
                    baseUSD = pvpUSD;
                    subtotalExento += cantidad * baseUSD;
                } else {
                    baseUSD = pvpUSD / 1.16;
                    subtotalBase += cantidad * baseUSD;
                    ivaTotal     += cantidad * (pvpUSD - baseUSD);
                }
                const linea = {
                    descripcion:      descCorta,
                    unidades:         String(unidades),
                    contenido:        String(contenido),
                    cantidad,
                    unidadMedida,
                    exento:           esExento,
                    alicuota:         esExento ? '' : '16',
                    precioUnitarioBs: baseUSD * tasaBs,
                    totalBs:          cantidad * baseUSD * tasaBs,
                    marca:            p.marca || '',
                    segmento:         p.segmento || '',
                    presentacion:     p.presentacion || ''
                };
                catMap[key].lineas.push(linea);
                lineasPlanas.push(linea);
            };

            addLinea(qCj,  'Cj', pCj);
            addLinea(qPaq, 'Pq', pPaq);
            addLinea(qUnd, 'Un', pUnd);

            if (qCj === 0 && qPaq === 0 && qUnd === 0) {
                const fQty   = parseInt(p.cantidad) || parseInt(p.totalUnidadesVendidas) || 1;
                const fPrice = pUnd > 0 ? pUnd : ((parseFloat(p.total) || 0) / fQty);
                if (fPrice > 0) addLinea(fQty, 'Un', fPrice);
            }
        });

        const categoriasOrdenadas = Object.values(catMap)
            .filter(c => c.lineas.length > 0)
            .sort((a, b) => a.orden !== b.orden
                ? a.orden - b.orden
                : a.label.localeCompare(b.label));

        const totalOp      = subtotalBase + subtotalExento + ivaTotal;
        const retencionUSD = _clienteSeleccionado.aplicaRetencion ? ivaTotal * 0.75 : 0;
        const totalPagar   = totalOp - retencionUSD;

        const numFactura = String(Math.floor(1000 + Math.random() * 9000)).padStart(6, '0');
        const numControl = '00-' + String(Math.floor(10000 + Math.random() * 89999)).padStart(6, '0');

        const datosFactura = {
            cliente:    _clienteSeleccionado,
            fechaISO:   document.getElementById('facFechaTasa').value,
            tasaBs,
            categoriasOrdenadas,
            lineasPlanas,
            subtotalBase, subtotalExento, ivaTotal,
            totalOp, retencionUSD, totalPagar,
            numFactura, numControl,
            esMensual:  !!_ventaParaFacturar.esMensual,
            nombreMes:  _ventaParaFacturar.nombreMes || ''
        };

        const html = (_tipoFacturacion === 'cerveceria')
            ? buildFacturaCerveceriaHtml(datosFactura)
            : buildFacturaHtml(datosFactura);

        abrirFacturaFullscreen(html);

        } finally {
            _isGeneratingFactura = false;
        }
    }

    // ─────────────────────────────────────────────
    // OVERLAY FULLSCREEN (sin scroll, deslizable)
    // ─────────────────────────────────────────────
    function abrirFacturaFullscreen(facturaHtml) {
        document.getElementById('facFSOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'facFSOverlay';
        overlay.innerHTML = `
<style>
#facFSOverlay{
    position:fixed;inset:0;z-index:9999;
    background:#b8bec8;
    display:flex;flex-direction:column;
    overscroll-behavior:contain;
}
#facTopBar{
    background:#1a3560;color:#fff;
    padding:10px 12px;
    display:flex;align-items:center;gap:8px;
    flex-shrink:0;
    box-shadow:0 3px 10px rgba(0,0,0,.45);
    z-index:10;
}
#facTopBar .fac-tit{
    flex:1;font-size:13px;font-weight:700;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    font-family:system-ui,sans-serif;
}
.fac-bw{display:flex;gap:6px;flex-shrink:0;}
.fac-b{
    padding:8px 14px;border:none;border-radius:8px;
    font-weight:700;font-size:13px;cursor:pointer;
    font-family:system-ui,sans-serif;
    -webkit-tap-highlight-color:transparent;
    transition:filter .15s;white-space:nowrap;
}
.fac-b:active{filter:brightness(.75);}
.fac-b.comp{background:#2563eb;color:#fff;}
.fac-b.desc{background:#16a34a;color:#fff;}
.fac-b.cerr{background:#dc2626;color:#fff;}
#facPanArea{
    flex:1;
    overflow:scroll;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;
    scrollbar-width:none;
    -ms-overflow-style:none;
    padding:14px;
    cursor:grab;
}
#facPanArea:active{cursor:grabbing;}
#facPanArea::-webkit-scrollbar{display:none;}
#facPaper{
    width:960px;
    background:#fff;
    box-shadow:0 6px 32px rgba(0,0,0,.35);
    border-radius:2px;
    display:inline-block;
}
.fac-hint{
    position:fixed;bottom:18px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,.68);color:#fff;
    padding:7px 20px;border-radius:22px;
    font-size:12px;pointer-events:none;white-space:nowrap;
    font-family:system-ui,sans-serif;
    animation:facHintFade 3.8s ease-out forwards;
}
@keyframes facHintFade{0%,65%{opacity:1}100%{opacity:0;visibility:hidden;}}
</style>

<div id="facTopBar">
    <span class="fac-tit">🧾 ${_clienteSeleccionado.nombreComercial}</span>
    <div class="fac-bw">
        <button class="fac-b comp" id="btnFacComp">📤 Compartir</button>
        <button class="fac-b desc" id="btnFacDesc">⬇️ Guardar</button>
        <button class="fac-b cerr" id="btnFacCerrar">✕</button>
    </div>
</div>

<div id="facPanArea">
    <div id="facPaper">
        <div id="facDocCapture">${facturaHtml}</div>
    </div>
</div>

<div class="fac-hint">👆 Desliza con el dedo para navegar · Pellizca para hacer zoom</div>
`;
        document.body.appendChild(overlay);

        document.getElementById('btnFacCerrar').onclick = () => overlay.remove();
        document.getElementById('btnFacDesc').onclick   = () => capturarYProcesar('download');
        document.getElementById('btnFacComp').onclick   = () => capturarYProcesar('share');
    }

    // ─────────────────────────────────────────────
    // CAPTURA DE IMAGEN (html2canvas)
    // ─────────────────────────────────────────────
    async function capturarYProcesar(action) {
        const btnId = action === 'download' ? 'btnFacDesc' : 'btnFacComp';
        const btn   = document.getElementById(btnId);
        const orig  = btn.innerHTML;
        btn.innerHTML = '⏳';
        btn.disabled  = true;

        try {
            const el = document.getElementById('facDocCapture');
            if (!el) throw new Error('Elemento de captura no encontrado.');

            const canvas = await html2canvas(el, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true
            });

            const blob  = await new Promise(r => canvas.toBlob(r, 'image/png'));
            const fname = `Factura_${(_clienteSeleccionado.nombreComercial || 'Cliente')
                            .replace(/\s+/g, '_')}_${Date.now()}.png`;

            const canShare = action === 'share' && navigator.share
                && typeof navigator.canShare === 'function'
                && navigator.canShare({ files: [new File([], 'x.png', { type: 'image/png' })] });

            if (canShare) {
                const file = new File([blob], fname, { type: 'image/png' });
                try { await navigator.share({ files: [file], title: 'Factura — Dist. Castillo Yañez' }); }
                catch (e) { if (e.name !== 'AbortError') throw e; }
            } else {
                const url  = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url; link.download = fname; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 6000);
            }
        } catch (err) {
            console.error('Error capturando factura:', err);
            alert('Error al generar imagen: ' + err.message);
        } finally {
            btn.innerHTML = orig;
            btn.disabled  = false;
        }
    }


    // ─────────────────────────────────────────────
    // ORDEN DE INVENTARIO (mismo criterio que inventario/ventas)
    // ─────────────────────────────────────────────
    function ordenarComoInventario(arr) {
        return arr.slice().sort((a, b) => {
            const ca = _productosCache[a.id] || a;
            const cb = _productosCache[b.id] || b;
            const rA = ((ca.rubro ?? a.rubro) || 'SIN RUBRO').toUpperCase();
            const rB = ((cb.rubro ?? b.rubro) || 'SIN RUBRO').toUpperCase();
            if (rA !== rB) return rA.localeCompare(rB);
            const sOA = ca.ordenSegmento ?? 9999, sOB = cb.ordenSegmento ?? 9999;
            if (sOA !== sOB) return sOA - sOB;
            const sA = ((ca.segmento ?? a.segmento) || '').toUpperCase();
            const sB = ((cb.segmento ?? b.segmento) || '').toUpperCase();
            if (sA !== sB) return sA.localeCompare(sB);
            const mOA = ca.ordenMarca ?? 9999, mOB = cb.ordenMarca ?? 9999;
            if (mOA !== mOB) return mOA - mOB;
            const mA = ((ca.marca ?? a.marca) || '').toUpperCase();
            const mB = ((cb.marca ?? b.marca) || '').toUpperCase();
            if (mA !== mB) return mA.localeCompare(mB);
            const pOA = ca.ordenProducto ?? 9999, pOB = cb.ordenProducto ?? 9999;
            if (pOA !== pOB) return pOA - pOB;
            return ((ca.presentacion ?? a.presentacion) || '').toUpperCase()
                .localeCompare(((cb.presentacion ?? b.presentacion) || '').toUpperCase());
        });
    }

    // ─────────────────────────────────────────────
    // DETECCIÓN DE PRODUCTO DE CERVECERÍA
    // ─────────────────────────────────────────────
    function esProductoCerveceria(p) {
        const cat = _productosCache[p.id] || {};
        const rubro = ((cat.rubro || p.rubro) || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (rubro.includes('cerveceria') || rubro.includes('cerveza') || rubro.includes('vinos')) return true;
        const s = ((p.marca || '') + ' ' + (p.segmento || '') + ' ' + (p.presentacion || '')).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return /pilsen|solera|sangria|carore/.test(s);
    }

    // ─────────────────────────────────────────────
    // FORMATO FIJO DE LA HOJA DE CERVECERÍA
    // (filas preimpresas de la FACTURA GUÍA física)
    // ─────────────────────────────────────────────
    const FORMATO_CERVECERIA = [
        { marca: 'POLAR<br>PILSEN', sub: '4,5 %<br>VOL (°GL)', key: 'pilsen', filas: [
            { desc: '36 BOTELLAS RETORNABLES', lts: '0,222 Lts', ltsCaja: '7,992' },
            { desc: '24 BOTELLAS RETORNABLES', lts: '0,330 Lts', ltsCaja: '7,920' },
            { desc: '24 LATAS',                lts: '0,250 Lts', ltsCaja: '6,000' },
            { desc: '24 LATAS',                lts: '0,355 Lts', ltsCaja: '8,520' },
            {}, {}
        ]},
        { marca: 'POLAR<br>LIGHT', sub: '3,5 %<br>VOL (°GL)', key: 'polarlight', filas: [
            { desc: '36 BOTELLAS RETORNABLES', lts: '0,222 Lts', ltsCaja: '7,992' },
            { desc: '24 LATAS',                lts: '0,250 Lts', ltsCaja: '6,000' },
            { desc: '24 LATAS',                lts: '0,355 Lts', ltsCaja: '8,520' },
            {}, {}
        ]},
        { marca: 'SOLERA<br>LIGHT', sub: '4,3 %<br>VOL (°GL)', key: 'soleralight', filas: [
            { desc: '36 BOTELLAS RETORNABLES', lts: '0,222 Lts', ltsCaja: '7,992' },
            { desc: '12 LATAS',                lts: '0,250 Lts', ltsCaja: '3,000' },
            {}, {}
        ]},
        { marca: 'SOLERA', sub: '6 %<br>VOL (°GL)', key: 'solera', filas: [
            { desc: '36 BOTELLAS RETORNABLES', lts: '0,222 Lts', ltsCaja: '7,992' },
            { desc: '12 LATAS',                lts: '0,250 Lts', ltsCaja: '3,000' },
            {}, {}
        ]},
        { marca: 'SANGRIA<br>CAROREÑA', sub: '9,5% Vol. (°G.L.)', key: 'sangria', filas: [
            { desc: '6 PET',                          lts: '1,750 Lts', ltsCaja: '10,500' },
            { desc: '36 BOTELLAS RET (TINTO VERANO)', lts: '0,222 Lts', ltsCaja: '7,992' },
            { desc: '12 LATAS',                       lts: '0,250 Lts', ltsCaja: '3,000' },
            {}, {}
        ]},
        { marca: 'OTROS<br>PRODUCTOS', sub: '', key: 'otros', filas: [
            {}, {}, {}, {}, {}, {}, {}, {}
        ]}
    ];

    function _nrm(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function matchSeccionCerveceria(texto) {
        const s = _nrm(texto);
        if (s.includes('pilsen')) return 0;
        if (s.includes('solera') && s.includes('light')) return 2;
        if (s.includes('solera')) return 3;
        if (s.includes('light')) return 1;
        if (s.includes('sangria') || s.includes('carore')) return 4;
        return 5; // OTROS PRODUCTOS
    }

    function matchFilaSeccion(sec, texto) {
        // Mapeo de las presentaciones del inventario a las filas fijas de la hoja física:
        //   1/4  → 36 botellas retornables (0,222 Lts)
        //   1/3  → 24 botellas retornables (0,330 Lts, solo en Pilsen)
        //   1.75 Lts (en Sangría) → 6 PET
        //   latas por litraje (250 / 355 ml)
        const t = _nrm(texto);

        // Detección de la presentación de origen
        const es14   = /\b1\s*\/\s*4\b/.test(t) || t.includes('1 4') || /\b1\.?/.test(t) && t.includes('/4');
        const es13   = /\b1\s*\/\s*3\b/.test(t) || t.includes('1 3');
        const esPet  = t.includes('pet') || /1[.,]?75\s*lt/.test(t) || t.includes('1.75') || t.includes('1,75');
        const esLata = t.includes('lata') || /\blta\b/.test(t) || t.includes('lat');
        const c355   = /355|0[.,]?355/.test(t);
        const cTinto = t.includes('tinto') || t.includes('verano');
        // Retornable genérico (cuando no dice 1/4 ni 1/3 explícito pero es botella/ret)
        const esRet  = es14 || es13 || /\bret/.test(t) || t.includes('retornable') || t.includes('botella');

        // ¿La sección tiene una única fila retornable? (caso Sangría: solo tinto verano)
        const filasRet = sec.filas.filter(f => f.desc &&
            (_nrm(f.desc).includes('botella') || _nrm(f.desc).includes('ret')));
        const unicaFilaRet = filasRet.length === 1;

        let best = -1;
        sec.filas.forEach((f, i) => {
            if (!f.desc) return;
            const fd = _nrm(f.desc);
            const fEs36 = fd.includes('36') && (fd.includes('botella') || fd.includes('ret'));
            const fEs24Ret = fd.includes('24') && (fd.includes('botella') || fd.includes('ret'));
            const fEsRet = fd.includes('botella') || fd.includes('ret');
            const fEsPet = fd.includes('pet');
            const fEsLata = fd.includes('lata');
            const fEsTinto = fd.includes('tinto') || fd.includes('verano');

            // ── PET / 1.75 Lts ──
            if (esPet && fEsPet) { if (best < 0) best = i; return; }

            // ── Retornables ──
            if (esRet && fEsRet) {
                // Si la sección solo tiene una fila retornable (Sangría), cualquier
                // retornable de esa marca va ahí sin importar el "tinto verano".
                if (unicaFilaRet) { best = i; return; }
                // Tinto verano explícito
                if (cTinto && fEsTinto) { best = i; return; }
                if (fEsTinto && !cTinto) return; // no mezclar tinto con no-tinto
                // 1/3 → 24 botellas retornables
                if (es13 && fEs24Ret) { best = i; return; }
                // 1/4 → 36 botellas retornables
                if (es14 && fEs36) { best = i; return; }
                // Sin especificar → 36 botellas por defecto
                if (!es13 && !es14 && fEs36 && best < 0) best = i;
                return;
            }

            // ── Latas ──
            if (esLata && fEsLata) {
                if (c355 && (f.lts || '').includes('355')) { best = i; return; }
                if (!c355 && (f.lts || '').includes('250')) { best = i; return; }
                if (best < 0) best = i;
            }
        });
        return best;
    }

    function llenarFormatoCerveceria(lineas) {
        const fmt = FORMATO_CERVECERIA.map(sec => ({
            marca: sec.marca, sub: sec.sub, key: sec.key,
            filas: sec.filas.map(f => ({
                desc: f.desc || '', lts: f.lts || '', ltsCaja: f.ltsCaja || '',
                cantidad: 0, unidad: '', precioBs: 0, montoBs: 0, descOverride: ''
            }))
        }));
        const otros = fmt[fmt.length - 1];

        lineas.forEach(l => {
            const texto = [l.marca, l.segmento, l.presentacion, l.descripcion].filter(Boolean).join(' ');
            const secIdx = matchSeccionCerveceria(texto);
            const sec = fmt[secIdx];

            let target = null;
            if (secIdx < fmt.length - 1) {
                const fIdx = matchFilaSeccion(sec, texto);
                if (fIdx >= 0) {
                    const f = sec.filas[fIdx];
                    if (f.cantidad === 0 || f.unidad === l.unidadMedida) target = f;
                }
            }
            if (!target) {
                target = sec.filas.find(f => !f.desc && f.cantidad === 0);
                if (target) target.descOverride = (l.descripcion || '').toUpperCase();
            }
            if (!target) {
                target = otros.filas.find(f => f.cantidad === 0 && !f.desc);
                if (!target) {
                    otros.filas.push({ desc: '', lts: '', ltsCaja: '', cantidad: 0, unidad: '', precioBs: 0, montoBs: 0, descOverride: '' });
                    target = otros.filas[otros.filas.length - 1];
                }
                target.descOverride = (l.descripcion || '').toUpperCase();
            }
            target.cantidad += l.cantidad;
            target.unidad    = l.unidadMedida;
            target.precioBs  = l.precioUnitarioBs;
            target.montoBs  += l.totalBs;
        });
        return fmt;
    }

    // ─────────────────────────────────────────────
    // PLANTILLA HTML — formato "FACTURA GUÍA" fiel a la hoja física
    // ─────────────────────────────────────────────
    function buildFacturaHtml({
        cliente, fechaISO, tasaBs, categoriasOrdenadas,
        subtotalBase, subtotalExento, ivaTotal,
        totalOp, retencionUSD, totalPagar,
        numFactura, numControl,
        esMensual, nombreMes
    }) {
        const fBs  = n => (isFinite(n) ? n : 0)
            .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fUSD = n => (isFinite(n) ? n : 0).toFixed(2);

        const [year, month, day] = (fechaISO || '2026-01-01').split('-');

        const B  = 'border:1px solid #333;';
        const td = `${B}padding:3px 5px;font-size:10px;`;
        const tR = `${td}text-align:right;padding-right:6px;`;
        const tC = `${td}text-align:center;`;
        const th = `${B}padding:3px 3px;font-size:8px;font-weight:700;text-align:center;background:#e8e8e8;`;

        // ── Filas de productos ──────────────────────────────────────────────
        let rows = '';
        let totalLineas = 0;

        categoriasOrdenadas.forEach(cat => {
            const lineas = cat.lineas;
            if (!lineas.length) return;
            totalLineas += lineas.length;
            const labelHtml = cat.label.replace(/\n/g, '<br>');

            lineas.forEach((l, i) => {
                rows += '<tr>';
                if (i === 0) {
                    rows += `<td rowspan="${lineas.length}"
                        style="${B}padding:3px 2px;vertical-align:middle;text-align:center;
                                font-weight:900;font-size:9px;line-height:1.35;
                                font-family:Arial,sans-serif;letter-spacing:0.3px;
                                word-break:break-word;max-width:70px;">
                        ${labelHtml}</td>`;
                }
                // DESCRIPCIÓN estilo hoja: "24 BOTELLAS RETORNABLES", "12 LATAS"...
                const descLinea = [
                    l.unidades ? `${l.unidades}` : '',
                    l.descripcion.toUpperCase()
                ].filter(Boolean).join(' ');

                const litrosStr = l.contenido
                    ? `${l.contenido} Lts`.replace('LtsLts','Lts')
                    : '';

                rows += `
                    <td style="${td}text-transform:uppercase;">${descLinea}</td>
                    <td style="${tC}white-space:nowrap;">${litrosStr}</td>
                    <td style="${tC}font-weight:700;white-space:nowrap;">${l.cantidad.toLocaleString('es-VE')}&nbsp;${l.unidadMedida}</td>
                    <td style="${tC}font-weight:900;color:#b00000;">${l.exento ? 'E' : ''}</td>
                    <td style="${tR}">${fBs(l.precioUnitarioBs)}</td>
                    <td style="${tR}font-weight:700;">${fBs(l.totalBs)}</td>
                `;
                rows += '</tr>';
            });
        });

        // Filas vacías de relleno (para llenar la hoja como el formato físico)
        const relleno = Math.max(0, 22 - totalLineas);
        for (let i = 0; i < relleno; i++) {
            rows += `<tr>
                <td style="${B}height:19px;"></td>
                <td style="${B}"></td><td style="${B}"></td><td style="${B}"></td>
                <td style="${B}"></td><td style="${B}"></td>
            </tr>`;
        }

        // ── Conversiones a Bs ───────────────────────────────────────────────
        const exentoBs     = subtotalExento * tasaBs;
        const baseBs       = subtotalBase   * tasaBs;
        const ivaBs        = ivaTotal       * tasaBs;
        const retBs        = retencionUSD   * tasaBs;
        const subTotalBs   = (subtotalBase + subtotalExento) * tasaBs;
        const totalVentaBs = totalOp        * tasaBs;
        const totalPagarBs = totalPagar     * tasaBs;

        const filaRetencion = cliente.aplicaRetencion ? `
            <tr>
                <td style="${B}font-size:8px;padding:3px 6px;color:#9b0000;font-weight:700;">
                    RETENCIÓN I.V.A. (75%) &nbsp; Bs.
                </td>
                <td style="${B}text-align:right;padding:3px 6px;font-weight:900;font-size:10px;color:#9b0000;">
                    &minus;${fBs(retBs)}
                </td>
            </tr>` : '';

        const chkBox = `<span style="display:inline-block;width:11px;height:11px;border:1.5px solid #333;
                        vertical-align:middle;margin:0 4px 0 8px;"></span>`;

        const mensualBadge = esMensual ? `
            <div style="text-align:center;font-size:9px;font-weight:900;color:#1a3560;
                        border:1.5px dashed #1a3560;padding:2px 6px;margin-top:4px;
                        text-transform:uppercase;letter-spacing:1px;">
                Consolidado Mensual · ${nombreMes}
            </div>` : '';

        // ── HTML FINAL ──────────────────────────────────────────────────────
        return `
<div style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#111;
            background:#fff;padding:14px 16px;position:relative;
            min-width:960px;box-sizing:border-box;">

  <!-- MARCA DE AGUA -->
  <div style="position:absolute;inset:0;display:flex;align-items:center;
              justify-content:center;pointer-events:none;overflow:hidden;z-index:0;">
    <span style="font-size:120px;font-weight:900;font-family:Arial,sans-serif;
                 color:rgba(0,0,0,0.028);transform:rotate(-38deg);
                 letter-spacing:12px;white-space:nowrap;">SIMULADOR</span>
  </div>

  <div style="position:relative;z-index:1;">

  <!-- ══ BANNER SUPERIOR ══ -->
  <div style="border:2px solid #1a1a1a;border-bottom:0;text-align:center;
              font-size:12px;font-weight:900;font-family:Arial,sans-serif;
              letter-spacing:1px;padding:4px 0;background:#fff;">
    ESTA FACTURA VA SIN TACHADURA NI ENMENDADURA
  </div>

  <!-- ══ FILA: EMPRESA DESPACHADORA / TERRITORIO / AGENCIA / REGISTRO / LEGAL ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <td style="${B}padding:3px 6px;width:22%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">EMPRESA DESPACHADORA:</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">CERVECERÍA POLAR C.A.</div>
      </td>
      <td style="${B}padding:3px 6px;width:16%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">TERRITORIO COMERCIAL:</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">LOS ANDES</div>
      </td>
      <td style="${B}padding:3px 6px;width:14%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">AGENCIA:</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">SAN CRISTÓBAL</div>
      </td>
      <td style="${B}padding:3px 6px;width:12%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">REGISTRO N°</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">My 679</div>
      </td>
      <td style="${B}padding:3px 6px;width:36%;vertical-align:middle;">
        <div style="font-size:6.3px;line-height:1.35;font-weight:700;text-align:justify;">
          PRODUCTO CONSUMIBLE, SE GARANTIZA QUE EL PRODUCTO ES APTO PARA EL CONSUMO HUMANO
          Y EL SANEAMIENTO QUE CORRESPONDA DE CONFORMIDAD CON LA LEY.
          (RESOLUCIÓN 071 DEL MINISTERIO DE PRODUCCIÓN Y COMERCIO)
        </div>
      </td>
    </tr>
    <tr>
      <td style="${B}padding:3px 6px;" colspan="2">
        <div style="font-size:8px;font-weight:900;text-align:center;letter-spacing:1px;">OTROS PRODUCTOS</div>
      </td>
      <td style="${B}padding:3px 6px;" colspan="1">
        <div style="font-size:7px;font-weight:700;text-align:center;">ORIGEN:</div>
        <div style="font-size:8.5px;font-weight:900;text-align:center;">FERMENTACIÓN</div>
      </td>
      <td style="${B}padding:3px 6px;" colspan="2">
        <div style="font-size:8px;font-weight:900;text-align:center;">FABRICADO POR: CERVECERÍA POLAR, C.A.</div>
      </td>
    </tr>
  </table>

  <!-- ══ CABECERA PRINCIPAL: EMPRESA + RIF + FECHA + CONTROL ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <!-- Empresa + domicilio fiscal -->
      <td style="${B}padding:8px 12px;width:52%;vertical-align:top;">
        <div style="font-size:17px;font-weight:900;font-family:Arial,sans-serif;letter-spacing:0.3px;">
          Distribuidora Castillo Yañez, C.A.
        </div>
        <div style="font-size:7.5px;line-height:1.5;margin-top:4px;color:#222;">
          Domicilio Fiscal: Calle Urbanización Santa Inés Local No. B-PB-3<br>
          Conjunto Residencial El Alcázar Etapa A Torre B<br>
          San Cristóbal Estado Táchira Zona Postal 5001
        </div>
        ${mensualBadge}
      </td>

      <!-- RIF + Fecha expedición -->
      <td style="${B}padding:5px;width:24%;vertical-align:top;">
        <div style="text-align:center;font-weight:900;font-size:11px;
                    border:1.5px solid #333;padding:3px 0;margin-bottom:4px;">
          RIF: J-40214875-5
        </div>
        <div style="text-align:center;font-size:7px;font-weight:700;
                    background:#d8d8d8;padding:2px 0;border:1px solid #666;
                    border-bottom:0;letter-spacing:1.5px;">
          FECHA DE EXPEDICIÓN
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #666;">
          <tr>
            <th style="border:1px solid #666;text-align:center;font-size:7px;padding:2px;background:#ebebeb;width:33%;">DÍA</th>
            <th style="border:1px solid #666;text-align:center;font-size:7px;padding:2px;background:#ebebeb;width:34%;">MES</th>
            <th style="border:1px solid #666;text-align:center;font-size:7px;padding:2px;background:#ebebeb;width:33%;">AÑO</th>
          </tr>
          <tr>
            <td style="border:1px solid #666;text-align:center;font-size:17px;font-weight:900;padding:2px;">${day}</td>
            <td style="border:1px solid #666;text-align:center;font-size:17px;font-weight:900;padding:2px;">${month}</td>
            <td style="border:1px solid #666;text-align:center;font-size:17px;font-weight:900;padding:2px;">${year}</td>
          </tr>
        </table>
      </td>

      <!-- CONTROL N° + FACTURA GUÍA N° -->
      <td style="${B}padding:6px;width:24%;vertical-align:top;text-align:center;">
        <div style="font-size:10px;font-weight:900;">CONTROL N° <span style="color:#c00000;font-size:12px;letter-spacing:1px;">${numControl}</span></div>
        <div style="border-top:1px solid #999;margin:6px 0;"></div>
        <div style="font-size:11px;font-weight:900;letter-spacing:0.5px;">FACTURA GUÍA</div>
        <div style="font-size:15px;font-weight:900;color:#c00000;letter-spacing:2px;margin-top:2px;">N° ${numFactura}</div>
        <div style="border-top:1px solid #999;margin:6px 0;"></div>
        <div style="font-size:7px;font-weight:700;text-align:left;">PROVIENE DE LA GUÍA N°: <span style="border-bottom:1px solid #999;display:inline-block;min-width:60px;"></span></div>
      </td>
    </tr>
  </table>

  <!-- ══ LEYENDA DE REMESA + DATOS DEL CLIENTE ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <td style="${B}padding:3px 8px;font-size:7px;font-weight:700;" colspan="2">
        LA REMESA DE PRODUCTOS QUE A CONTINUACIÓN SE DETALLA, HA SIDO EXPEDIDA EN ESTA FECHA, CON DESTINO AL ESTABLECIMIENTO MERCANTIL:
      </td>
    </tr>
    <tr>
      <td style="${B}padding:4px 8px;width:65%;">
        <span style="font-size:7px;color:#555;text-transform:uppercase;">Nombre y Apellido o Razón Social:&nbsp;</span>
        <span style="font-size:12px;font-weight:900;">${cliente.nombreComercial}</span>
      </td>
      <td style="${B}padding:4px 8px;width:35%;">
        <span style="font-size:7px;color:#555;text-transform:uppercase;">N° RIF, Cédula o Pasaporte:&nbsp;</span>
        <span style="font-size:11px;font-weight:900;">${cliente.rif || 'N/A'}</span>
      </td>
    </tr>
    <tr>
      <td style="${B}padding:4px 8px;" colspan="2">
        <span style="font-size:7px;color:#555;text-transform:uppercase;">Domicilio Fiscal:&nbsp;</span>
        <span style="font-size:10px;font-weight:700;">${cliente.sector || cliente.sectorNombre || cliente.domicilio || 'N/A'}</span>
        ${cliente.telefono ? `<span style="font-size:8.5px;color:#555;"> &nbsp;|&nbsp; Tel: ${cliente.telefono}</span>` : ''}
      </td>
    </tr>
  </table>

  <!-- ══ TABLA DE PRODUCTOS (formato FACTURA GUÍA) ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <thead>
      <tr>
        <th style="${th}width:9%;"></th>
        <th style="${th}width:33%;text-align:left;padding-left:5px;">DESCRIPCIÓN</th>
        <th style="${th}width:9%;">LITROS</th>
        <th style="${th}width:12%;">CANT.&nbsp;EN&nbsp;CAJAS</th>
        <th style="${th}width:4%;">(E)</th>
        <th style="${th}width:16%;text-align:right;padding-right:5px;">PRECIO&nbsp;UNITARIO<br>Bs.</th>
        <th style="${th}width:17%;text-align:right;padding-right:5px;">MONTO<br>Bs.</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- ══ PIE: FORMA DE PAGO / CONDUCTOR / OBSERVACIONES | TOTALES ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;">
    <tr>
      <!-- Columna izquierda -->
      <td style="${B}padding:0;width:55%;vertical-align:top;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${B}padding:4px 8px;font-size:8px;" colspan="2">
              <strong>FORMA DE PAGO:</strong>
              ${chkBox}EFECTIVO ${chkBox}CHEQUE ${chkBox}OTRO
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;font-size:8px;width:60%;">
              NOMBRE DEL CONDUCTOR: <span style="border-bottom:1px solid #999;display:inline-block;min-width:110px;"></span>
            </td>
            <td style="${B}padding:4px 8px;font-size:8px;">
              C.I.: <span style="border-bottom:1px solid #999;display:inline-block;min-width:80px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;font-size:8px;">
              TIPO DE VEHÍCULO: <span style="border-bottom:1px solid #999;display:inline-block;min-width:110px;"></span>
            </td>
            <td style="${B}padding:4px 8px;font-size:8px;">
              PLACAS: <span style="border-bottom:1px solid #999;display:inline-block;min-width:80px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;font-size:7px;line-height:1.4;" colspan="2">
              <strong>OBSERVACIONES</strong> (EN CASO DE VENTA A PERSONA NATURAL, ESCRIBA "NO DA DERECHO A CRÉDITO FISCAL"):<br>
              <span style="border-bottom:1px solid #999;display:inline-block;width:98%;margin-top:8px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;vertical-align:bottom;" colspan="2">
              <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;">
                <div style="flex:1;">
                  <div style="font-size:7px;font-weight:700;margin-bottom:24px;">FECHA DE CANCELACIÓN:</div>
                  <div style="border-bottom:1px solid #999;width:90%;"></div>
                </div>
                <div style="flex:1;text-align:center;">
                  <div style="font-size:7px;font-weight:700;margin-bottom:24px;">FIRMA Y SELLO DEL CLIENTE</div>
                  <div style="border-bottom:1px solid #999;width:90%;margin:0 auto;"></div>
                </div>
              </div>
              <div style="margin-top:10px;border-top:1px dashed #bbb;padding-top:6px;display:flex;gap:16px;font-size:7.5px;">
                <div><span style="color:#555;">Tasa BCV aplicada:</span> <strong style="color:#1a3560;font-size:9.5px;">Bs. ${fBs(tasaBs)}</strong></div>
                <div><span style="color:#555;">Ref. USD:</span> <strong style="color:#1a3560;font-size:9.5px;">$${fUSD(totalPagar)}</strong></div>
              </div>
            </td>
          </tr>
        </table>
      </td>

      <!-- Columna derecha: totales fiscales -->
      <td style="${B}padding:0;width:45%;vertical-align:top;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;width:68%;">SUB-TOTAL &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(subTotalBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;color:#555;">ADICIONES AL PRECIO &nbsp; Bs.</td>
            <td style="${B}padding:3px 6px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;color:#555;">DESCUENTOS, BONIFICACIONES, ANULACIONES &nbsp; Bs.</td>
            <td style="${B}padding:3px 6px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;line-height:1.35;">MONTO TOTAL EXENTO O EXONERADO &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(exentoBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;line-height:1.35;">MONTO TOTAL DE LA BASE IMPONIBLE DEL I.V.A.<br>SEGÚN ALÍCUOTA <strong>16</strong>% &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(baseBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;line-height:1.35;">MONTO DEL I.V.A. SEGÚN ALÍCUOTA <strong>16</strong>% &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(ivaBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8.5px;padding:3px 6px;font-weight:900;">VALOR TOTAL DE LA VENTA &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:900;font-size:11px;">${fBs(totalVentaBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;color:#555;">DEPÓSITO POR ENVASE RETORNABLE &nbsp; Bs.</td>
            <td style="${B}padding:3px 6px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;color:#555;">DIFERENCIA POR ENVASE RETORNABLE &nbsp; Bs.</td>
            <td style="${B}padding:3px 6px;"></td>
          </tr>
          ${filaRetencion}
          <tr style="background:#e8e8e8;">
            <td style="border:2px solid #1a1a1a;font-size:10px;padding:5px 6px;font-weight:900;letter-spacing:1px;">TOTAL A PAGAR &nbsp; Bs.</td>
            <td style="border:2px solid #1a1a1a;text-align:right;padding:5px 6px;font-weight:900;font-size:13px;">${fBs(totalPagarBs)}</td>
          </tr>
          <tr>
            <td style="${B}padding:4px 6px;" colspan="2">
              <div style="font-size:6.5px;color:#555;line-height:1.4;">
                <strong>DEPÓSITO A COBRAR POR ENVASES RETORNABLES:</strong> el monto será reembolsado
                a la devolución de los envases en buen estado.
              </div>
              <table style="width:100%;border-collapse:collapse;margin-top:3px;">
                <tr>
                  <th style="border:1px solid #999;font-size:6.5px;padding:2px;background:#f0f0f0;">TIPO DE ENVASE</th>
                  <th style="border:1px solid #999;font-size:6.5px;padding:2px;background:#f0f0f0;">ENTREGADOS</th>
                  <th style="border:1px solid #999;font-size:6.5px;padding:2px;background:#f0f0f0;">DEVUELTOS</th>
                  <th style="border:1px solid #999;font-size:6.5px;padding:2px;background:#f0f0f0;">TOTAL Bs.</th>
                </tr>
                <tr>
                  <td style="border:1px solid #999;font-size:7px;padding:2px 4px;">ENVASE 1/4</td>
                  <td style="border:1px solid #999;padding:2px;"></td>
                  <td style="border:1px solid #999;padding:2px;"></td>
                  <td style="border:1px solid #999;padding:2px;"></td>
                </tr>
                <tr>
                  <td style="border:1px solid #999;font-size:7px;padding:2px 4px;">ENVASE 1/3</td>
                  <td style="border:1px solid #999;padding:2px;"></td>
                  <td style="border:1px solid #999;padding:2px;"></td>
                  <td style="border:1px solid #999;padding:2px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Datos de imprenta -->
  <div style="font-size:7px;color:#777;margin-top:6px;text-align:center;
              border-top:1px solid #ddd;padding-top:4px;line-height:1.5;">
    LITOANDES, S.A. Av. Carabobo Esq. Carrera 20 · Sector La Romera · Tlf: (0276) 356.19.55
    San Cristóbal, Edo. Táchira &nbsp;/&nbsp; RIF: J-30406057-2
    &nbsp;·&nbsp; N° PROVIDENCIA SENIAT 05/00579 de 14/03/2008 &nbsp;·&nbsp; Reg. Los Andes
    (Control N° 00-010501 / 00-011500) &nbsp;·&nbsp; (Factura SERIE "A" N° 002501 / 003500)
  </div>

  <!-- Aviso simulación -->
  <div style="text-align:center;margin-top:4px;font-size:7.5px;font-weight:700;
              color:#cc0000;letter-spacing:1px;">
    *** DOCUMENTO SIMULADO SIN VALIDEZ FISCAL — DIST. CASTILLO YAÑEZ APP ***
  </div>

  </div><!-- /z-index:1 -->
</div>`;
    }

    // ─────────────────────────────────────────────
    // PLANTILLA HTML — HOJA DE CERVECERÍA (formato fijo preimpreso)
    // ─────────────────────────────────────────────
    function buildFacturaCerveceriaHtml({
        cliente, fechaISO, tasaBs, lineasPlanas,
        subtotalBase, subtotalExento, ivaTotal,
        totalOp, retencionUSD, totalPagar,
        numFactura, numControl,
        esMensual, nombreMes
    }) {
        const fBs  = n => (isFinite(n) ? n : 0)
            .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fUSD = n => (isFinite(n) ? n : 0).toFixed(2);
        const [year, month, day] = (fechaISO || '2026-01-01').split('-');

        const B  = 'border:1px solid #333;';
        const th = `${B}padding:3px 3px;font-size:8px;font-weight:700;text-align:center;background:#e8e8e8;`;

        const fmt = llenarFormatoCerveceria(lineasPlanas);

        // ── Filas del formato fijo ──────────────────────────────────────────
        let rows = '';
        fmt.forEach(sec => {
            sec.filas.forEach((f, i) => {
                rows += '<tr>';
                if (i === 0) {
                    rows += `<td rowspan="${sec.filas.length}"
                        style="${B}padding:4px 3px;vertical-align:middle;text-align:center;
                                font-family:Arial,sans-serif;">
                        <div style="font-weight:900;font-size:11px;line-height:1.25;letter-spacing:0.3px;">${sec.marca}</div>
                        ${sec.sub ? `<div style="font-weight:700;font-size:8px;margin-top:6px;line-height:1.3;">${sec.sub}</div>` : ''}
                    </td>`;
                }
                const desc = f.descOverride || f.desc;
                const cantStr = f.cantidad > 0
                    ? f.cantidad.toLocaleString('es-VE') + (f.unidad && f.unidad !== 'Cj' ? '&nbsp;' + f.unidad : '')
                    : '';
                rows += `
                    <td style="${B}padding:3px 5px;font-size:9.5px;font-weight:700;text-align:center;text-transform:uppercase;height:18px;">${desc}</td>
                    <td style="${B}padding:3px 3px;font-size:9px;text-align:center;white-space:nowrap;font-weight:700;">${f.lts}</td>
                    <td style="${B}padding:3px 3px;font-size:9px;text-align:center;white-space:nowrap;font-weight:700;">${f.ltsCaja}</td>
                    <td style="${B}padding:3px 4px;font-size:10px;text-align:center;font-weight:900;">${cantStr}</td>
                    <td style="${B}padding:3px 6px;font-size:10px;text-align:right;">${f.precioBs > 0 ? fBs(f.precioBs) : ''}</td>
                    <td style="${B}padding:3px 6px;font-size:10px;text-align:right;font-weight:700;">${f.montoBs > 0 ? fBs(f.montoBs) : ''}</td>
                `;
                rows += '</tr>';
            });
        });

        // ── Conversiones a Bs ───────────────────────────────────────────────
        const exentoBs     = subtotalExento * tasaBs;
        const baseBs       = subtotalBase   * tasaBs;
        const ivaBs        = ivaTotal       * tasaBs;
        const retBs        = retencionUSD   * tasaBs;
        const subTotalBs   = (subtotalBase + subtotalExento) * tasaBs;
        const totalVentaBs = totalOp        * tasaBs;
        const totalPagarBs = totalPagar     * tasaBs;

        const filaRetencion = cliente.aplicaRetencion ? `
            <tr>
                <td style="${B}font-size:8px;padding:3px 6px;color:#9b0000;font-weight:700;text-align:right;">RETENCIÓN I.V.A. (75%) &nbsp; Bs.</td>
                <td style="${B}text-align:right;padding:3px 6px;font-weight:900;font-size:10px;color:#9b0000;">&minus;${fBs(retBs)}</td>
            </tr>
            <tr style="background:#e8e8e8;">
                <td style="border:2px solid #1a1a1a;font-size:9.5px;padding:4px 6px;font-weight:900;text-align:right;letter-spacing:0.5px;">TOTAL A PAGAR &nbsp; Bs.</td>
                <td style="border:2px solid #1a1a1a;text-align:right;padding:4px 6px;font-weight:900;font-size:12px;">${fBs(totalPagarBs)}</td>
            </tr>` : '';

        const chkBox = `<span style="display:inline-block;width:11px;height:11px;border:1.5px solid #333;
                        vertical-align:middle;margin:0 4px 0 8px;"></span>`;

        const mensualBadge = esMensual ? `
            <div style="text-align:center;font-size:9px;font-weight:900;color:#1a3560;
                        border:1.5px dashed #1a3560;padding:2px 6px;margin-top:4px;
                        text-transform:uppercase;letter-spacing:1px;">
                Consolidado Mensual · ${nombreMes}
            </div>` : '';

        const depositoCols = () => `
            <td style="border:1px solid #999;padding:3px;"></td>
            <td style="border:1px solid #999;padding:3px;"></td>
            <td style="border:1px solid #999;padding:3px;"></td>
            <td style="border:1px solid #999;padding:3px;"></td>`;

        return `
<div style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#111;
            background:#fff;padding:14px 16px;position:relative;
            min-width:960px;box-sizing:border-box;">

  <!-- MARCA DE AGUA -->
  <div style="position:absolute;inset:0;display:flex;align-items:center;
              justify-content:center;pointer-events:none;overflow:hidden;z-index:0;">
    <span style="font-size:120px;font-weight:900;font-family:Arial,sans-serif;
                 color:rgba(0,0,0,0.028);transform:rotate(-38deg);
                 letter-spacing:12px;white-space:nowrap;">SIMULADOR</span>
  </div>

  <div style="position:relative;z-index:1;">

  <!-- ══ BANNER ══ -->
  <div style="border:2px solid #1a1a1a;border-bottom:0;text-align:center;
              font-size:12px;font-weight:900;font-family:Arial,sans-serif;
              letter-spacing:1px;padding:4px 0;background:#fff;">
    ESTA FACTURA VA SIN TACHADURA NI ENMENDADURA
  </div>

  <!-- ══ EMPRESA DESPACHADORA ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <td style="${B}padding:3px 6px;width:22%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">EMPRESA DESPACHADORA:</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">CERVECERÍA POLAR C.A.</div>
      </td>
      <td style="${B}padding:3px 6px;width:16%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">TERRITORIO COMERCIAL:</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">LOS ANDES</div>
      </td>
      <td style="${B}padding:3px 6px;width:14%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">AGENCIA:</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">SAN CRISTÓBAL</div>
      </td>
      <td style="${B}padding:3px 6px;width:12%;vertical-align:top;">
        <div style="font-size:7px;font-weight:700;">REGISTRO N°</div>
        <div style="font-size:9.5px;font-weight:900;text-align:center;margin-top:2px;">My 679</div>
      </td>
      <td style="${B}padding:3px 6px;width:36%;vertical-align:middle;">
        <div style="font-size:6.3px;line-height:1.35;font-weight:700;text-align:justify;">
          PRODUCTO CONSUMIBLE, SE GARANTIZA QUE EL PRODUCTO ES APTO PARA EL CONSUMO HUMANO
          Y EL SANEAMIENTO QUE CORRESPONDA DE CONFORMIDAD CON LA LEY.
          (RESOLUCIÓN 071 DEL MINISTERIO DE PRODUCCIÓN Y COMERCIO)
        </div>
      </td>
    </tr>
    <tr>
      <td style="${B}padding:3px 6px;" colspan="2">
        <div style="font-size:8px;font-weight:900;text-align:center;letter-spacing:1px;">CERVEZA Y MALTA</div>
      </td>
      <td style="${B}padding:3px 6px;">
        <div style="font-size:7px;font-weight:700;text-align:center;">ORIGEN:</div>
        <div style="font-size:8.5px;font-weight:900;text-align:center;">FERMENTACIÓN</div>
      </td>
      <td style="${B}padding:3px 6px;" colspan="2">
        <div style="font-size:8px;font-weight:900;text-align:center;">FABRICADO POR: CERVECERÍA POLAR, C.A.</div>
      </td>
    </tr>
  </table>

  <!-- ══ CABECERA: EMPRESA + RIF/FECHA + CONTROL ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <td style="${B}padding:8px 12px;width:52%;vertical-align:top;">
        <div style="font-size:17px;font-weight:900;font-family:Arial,sans-serif;letter-spacing:0.3px;">
          Distribuidora Castillo Yañez, C.A.
        </div>
        <div style="font-size:7.5px;line-height:1.5;margin-top:4px;color:#222;">
          Domicilio Fiscal: Calle Urbanización Santa Inés Local No. B-PB-3<br>
          Conjunto Residencial El Alcázar Etapa A Torre B<br>
          San Cristóbal Estado Táchira Zona Postal 5001
        </div>
        ${mensualBadge}
      </td>
      <td style="${B}padding:5px;width:24%;vertical-align:top;">
        <div style="text-align:center;font-weight:900;font-size:11px;border:1.5px solid #333;padding:3px 0;margin-bottom:4px;">
          RIF: J-40214875-5
        </div>
        <div style="text-align:center;font-size:7px;font-weight:700;background:#d8d8d8;padding:2px 0;
                    border:1px solid #666;border-bottom:0;letter-spacing:1.5px;">
          FECHA DE EXPEDICIÓN
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #666;">
          <tr>
            <th style="border:1px solid #666;text-align:center;font-size:7px;padding:2px;background:#ebebeb;width:33%;">DÍA</th>
            <th style="border:1px solid #666;text-align:center;font-size:7px;padding:2px;background:#ebebeb;width:34%;">MES</th>
            <th style="border:1px solid #666;text-align:center;font-size:7px;padding:2px;background:#ebebeb;width:33%;">AÑO</th>
          </tr>
          <tr>
            <td style="border:1px solid #666;text-align:center;font-size:17px;font-weight:900;padding:2px;">${day}</td>
            <td style="border:1px solid #666;text-align:center;font-size:17px;font-weight:900;padding:2px;">${month}</td>
            <td style="border:1px solid #666;text-align:center;font-size:17px;font-weight:900;padding:2px;">${year}</td>
          </tr>
        </table>
      </td>
      <td style="${B}padding:6px;width:24%;vertical-align:top;text-align:center;">
        <div style="font-size:10px;font-weight:900;">CONTROL N° <span style="color:#c00000;font-size:12px;letter-spacing:1px;">${numControl}</span></div>
        <div style="border-top:1px solid #999;margin:6px 0;"></div>
        <div style="font-size:11px;font-weight:900;letter-spacing:0.5px;">FACTURA GUÍA</div>
        <div style="font-size:15px;font-weight:900;color:#c00000;letter-spacing:2px;margin-top:2px;">N° ${numFactura}</div>
        <div style="border-top:1px solid #999;margin:6px 0;"></div>
        <div style="font-size:7px;font-weight:700;text-align:left;">PROVIENE DE LA GUÍA N°: <span style="border-bottom:1px solid #999;display:inline-block;min-width:60px;"></span></div>
      </td>
    </tr>
  </table>

  <!-- ══ REMESA + CLIENTE ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <td style="${B}padding:3px 8px;font-size:7px;font-weight:700;" colspan="2">
        LA REMESA DE PRODUCTOS QUE A CONTINUACIÓN SE DETALLA, HA SIDO EXPEDIDA EN ESTA FECHA, CON DESTINO AL ESTABLECIMIENTO MERCANTIL:
      </td>
    </tr>
    <tr>
      <td style="${B}padding:4px 8px;width:65%;">
        <span style="font-size:7px;color:#555;text-transform:uppercase;">Nombre y Apellido o Razón Social:&nbsp;</span>
        <span style="font-size:12px;font-weight:900;">${cliente.nombreComercial}</span>
      </td>
      <td style="${B}padding:4px 8px;width:35%;">
        <span style="font-size:7px;color:#555;text-transform:uppercase;">N° RIF, Cédula o Pasaporte:&nbsp;</span>
        <span style="font-size:11px;font-weight:900;">${cliente.rif || 'N/A'}</span>
      </td>
    </tr>
    <tr>
      <td style="${B}padding:4px 8px;" colspan="2">
        <span style="font-size:7px;color:#555;text-transform:uppercase;">Domicilio Fiscal:&nbsp;</span>
        <span style="font-size:10px;font-weight:700;">${cliente.sector || cliente.sectorNombre || cliente.domicilio || 'N/A'}</span>
        ${cliente.telefono ? `<span style="font-size:8.5px;color:#555;"> &nbsp;|&nbsp; Tel: ${cliente.telefono}</span>` : ''}
      </td>
    </tr>
  </table>

  <!-- ══ TABLA FIJA DE PRODUCTOS ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <thead>
      <tr>
        <th style="${th}width:11%;"></th>
        <th style="${th}width:30%;">DESCRIPCIÓN</th>
        <th style="${th}width:9%;"></th>
        <th style="${th}width:8%;">LITROS</th>
        <th style="${th}width:11%;">CANT.&nbsp;EN&nbsp;CAJAS</th>
        <th style="${th}width:15%;">PRECIO&nbsp;UNITARIO</th>
        <th style="${th}width:16%;">MONTO&nbsp;Bs.</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- ══ PIE: OBSERVACIONES / FORMA DE PAGO | TOTALES ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;border-bottom:0;">
    <tr>
      <td style="${B}padding:0;width:52%;vertical-align:top;">
        <table style="width:100%;border-collapse:collapse;height:100%;">
          <tr>
            <td style="${B}padding:4px 8px;font-size:7px;line-height:1.4;">
              <strong>OBSERVACIONES</strong> (EN CASO DE VENTA A PERSONA NATURAL ESCRIBA "NO DA DERECHO A CRÉDITO FISCAL"):<br>
              <span style="border-bottom:1px solid #999;display:inline-block;width:98%;margin-top:10px;"></span>
              <span style="border-bottom:1px solid #999;display:inline-block;width:98%;margin-top:12px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;font-size:8px;">
              <strong>FORMA DE PAGO:</strong>
              ${chkBox}EFECTIVO ${chkBox}CHEQUE ${chkBox}OTRO <span style="border-bottom:1px solid #999;display:inline-block;min-width:80px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;font-size:8px;">
              NOMBRE DEL CONDUCTOR: <span style="border-bottom:1px solid #999;display:inline-block;min-width:180px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;font-size:8px;">
              TIPO DE VEHÍCULO: <span style="border-bottom:1px solid #999;display:inline-block;min-width:100px;"></span>
              &nbsp;&nbsp;PLACAS: <span style="border-bottom:1px solid #999;display:inline-block;min-width:80px;"></span>
            </td>
          </tr>
          <tr>
            <td style="${B}padding:4px 8px;vertical-align:bottom;">
              <div style="display:flex;gap:16px;font-size:7.5px;border-top:1px dashed #bbb;padding-top:6px;">
                <div><span style="color:#555;">Tasa BCV aplicada:</span> <strong style="color:#1a3560;font-size:9.5px;">Bs. ${fBs(tasaBs)}</strong></div>
                <div><span style="color:#555;">Ref. USD:</span> <strong style="color:#1a3560;font-size:9.5px;">$${fUSD(totalPagar)}</strong></div>
              </div>
            </td>
          </tr>
        </table>
      </td>
      <td style="${B}padding:0;width:48%;vertical-align:top;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;text-align:right;width:70%;">SUB-TOTAL &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(subTotalBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;color:#555;text-align:right;">ADICIONES AL PRECIO &nbsp; Bs.</td>
            <td style="${B}padding:3px 6px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;color:#555;text-align:right;">DESCUENTOS, BONIFICACIONES, ANULACIONES &nbsp; Bs.</td>
            <td style="${B}padding:3px 6px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;text-align:right;">SUB-TOTAL &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(subTotalBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;text-align:right;">MONTO TOTAL EXENTO, EXONERADO O NO GRAVADO &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(exentoBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;text-align:right;">MONTO TOTAL DE LA BASE IMPONIBLE DEL I.V.A. SEGÚN ALÍCUOTA <strong>16</strong>% &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(baseBs)}</td>
          </tr>
          <tr>
            <td style="${B}font-size:8px;padding:3px 6px;text-align:right;">MONTO DEL I.V.A. SEGÚN ALÍCUOTA <strong>16</strong>% &nbsp; Bs.</td>
            <td style="${B}text-align:right;padding:3px 6px;font-weight:700;font-size:10px;">${fBs(ivaBs)}</td>
          </tr>
          <tr style="${cliente.aplicaRetencion ? '' : 'background:#e8e8e8;'}">
            <td style="border:2px solid #1a1a1a;font-size:9.5px;padding:4px 6px;font-weight:900;text-align:right;letter-spacing:0.5px;">VALOR TOTAL DE LA VENTA &nbsp; Bs.</td>
            <td style="border:2px solid #1a1a1a;text-align:right;padding:4px 6px;font-weight:900;font-size:12px;">${fBs(totalVentaBs)}</td>
          </tr>
          ${filaRetencion}
        </table>
      </td>
    </tr>
  </table>

  <!-- ══ DEPÓSITO EN GARANTÍA POR ENVASES RETORNABLES ══ -->
  <table style="width:100%;border-collapse:collapse;border:2px solid #1a1a1a;">
    <tr>
      <td colspan="13" style="${B}padding:3px;text-align:center;font-size:8px;font-weight:900;letter-spacing:0.5px;background:#e8e8e8;">
        DEPÓSITO EN GARANTÍA A COBRAR O A DESCONTAR POR ENVASES RETORNABLES
      </td>
    </tr>
    <tr>
      <td style="${B}padding:2px;font-size:6.5px;font-weight:900;text-align:center;" rowspan="2">BASE</td>
      <td colspan="4" style="border:1px solid #999;padding:2px;text-align:center;font-size:7px;font-weight:900;background:#f0f0f0;">CASILLEROS CON BOTELLAS</td>
      <td colspan="4" style="border:1px solid #999;padding:2px;text-align:center;font-size:7px;font-weight:900;background:#f0f0f0;">CASILLEROS SIN BOTELLAS</td>
      <td colspan="4" style="border:1px solid #999;padding:2px;text-align:center;font-size:7px;font-weight:900;background:#f0f0f0;">BOTELLAS SUELTAS O BARRILES</td>
    </tr>
    <tr>
      ${['ENTREGADOS','DEVUELTOS','DIFERENCIA','TOTAL Bs.','ENTREGADOS','DEVUELTOS','DIFERENCIA','TOTAL Bs.','ENTREGADOS','DEVUELTOS','DIFERENCIA','TOTAL Bs.']
        .map(h => `<th style="border:1px solid #999;padding:2px;font-size:6px;background:#f7f7f7;">${h}</th>`).join('')}
    </tr>
    <tr>
      <td style="${B}padding:4px;height:16px;"></td>
      ${depositoCols()}${depositoCols()}${depositoCols()}
    </tr>
    <tr>
      <td style="${B}padding:4px;height:16px;"></td>
      ${depositoCols()}${depositoCols()}${depositoCols()}
    </tr>
  </table>

  <!-- Imprenta -->
  <div style="font-size:7px;color:#777;margin-top:6px;text-align:center;
              border-top:1px solid #ddd;padding-top:4px;line-height:1.5;">
    LITOANDES, S.A. Av. Carabobo Esq. Carrera 20 · Sector La Romera · Tlf: (0276) 356.19.55
    San Cristóbal, Edo. Táchira &nbsp;/&nbsp; RIF: J-30406057-2
    &nbsp;·&nbsp; N° PROVIDENCIA SENIAT 05/00579 de 14/03/2008 &nbsp;·&nbsp; Reg. Los Andes
  </div>

  <div style="text-align:center;margin-top:4px;font-size:7.5px;font-weight:700;
              color:#cc0000;letter-spacing:1px;">
    *** DOCUMENTO SIMULADO SIN VALIDEZ FISCAL — DIST. CASTILLO YAÑEZ APP ***
  </div>

  </div>
</div>`;
    }


})();
// redeploy trigger 1783027831


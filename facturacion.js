// --- Módulo de Simulación de Facturación Fiscal v3 ---
// Layout fiel a la factura física de Dist. Castillo Yañez
// Vista: pantalla completa, sin scroll visible, deslizable con el dedo (Android)

(function () {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where, _getDoc, _doc, _orderBy, _limit;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;

    let _clientesCache   = [];
    let _tasasCache      = {};
    let _productosCache  = {};
    let _ventasEncontradas  = [];
    let _clienteSeleccionado = null;
    let _ventaParaFacturar   = null;

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
        console.log('Módulo Facturación v3 inicializado.');
    };

    // ─────────────────────────────────────────────
    // VISTA PRINCIPAL (selección cliente / venta / tasa)
    // ─────────────────────────────────────────────
    window.showFacturacionView = async function () {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        const today = new Date().toISOString().split('T')[0];

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 pt-8 w-full max-w-5xl mx-auto flex flex-col h-screen">
                <div class="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border-t-4 border-blue-800">

                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                        <h2 class="text-xl sm:text-2xl font-black text-gray-800 tracking-tight">🧾 Simulador de Facturación</h2>
                        <button id="btnVolverFacturacion" class="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition">Volver al Menú</button>
                    </div>

                    <!-- Paso 1 y 2 -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 p-4 sm:p-5 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
                        <div class="relative">
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">1. Seleccionar Cliente:</label>
                            <input type="text" id="facClientSearch" placeholder="Escriba el nombre o RIF..."
                                class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition">
                            <div id="facClientDropdown"
                                class="absolute z-50 w-full bg-white border border-gray-300 rounded-b-md shadow-lg hidden max-h-60 overflow-y-auto mt-1"></div>
                            <div id="facClientSelected"
                                class="hidden mt-2 p-2 bg-blue-100 text-blue-800 font-bold rounded flex justify-between items-center border border-blue-200 shadow-sm">
                                <span id="facClientName" class="truncate pr-2 text-sm sm:text-base"></span>
                                <button id="facClientClear" class="text-red-500 hover:text-red-700 text-xl leading-none font-black px-2">&times;</button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">2. Seleccionar Venta:</label>
                            <select id="facSelectVenta"
                                class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm disabled:bg-gray-200 transition cursor-pointer"
                                disabled>
                                <option value="">Primero seleccione un cliente...</option>
                            </select>
                        </div>
                    </div>

                    <!-- Paso 3: tasa -->
                    <div id="facPanelTasa" class="hidden flex-col bg-indigo-50 border border-indigo-200 rounded-lg p-4 sm:p-5 shadow-sm mt-2">
                        <h3 class="font-bold text-indigo-900 border-b border-indigo-200 pb-2 mb-4 text-sm sm:text-base">3. Datos de Emisión</h3>
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

                    <div id="facEmptyState"
                        class="flex-grow flex items-center justify-center text-gray-400 font-medium border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 mt-4 text-center p-4">
                        Seleccione un cliente para cargar su historial de ventas.
                    </div>
                </div>
            </div>`;

        // ── Eventos ──────────────────────────────────────
        document.getElementById('btnVolverFacturacion').addEventListener('click', _showMainMenu);

        document.getElementById('facClientSearch').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) { document.getElementById('facClientDropdown').classList.add('hidden'); return; }
            const filtered = _clientesCache.filter(c =>
                (c.nombreComercial || '').toLowerCase().includes(term) ||
                (c.rif || '').toLowerCase().includes(term)
            ).slice(0, 15);
            renderClientDropdown(filtered);
        });

        document.getElementById('facClientClear').addEventListener('click', () => {
            _clienteSeleccionado = null;
            _ventaParaFacturar   = null;
            document.getElementById('facClientSelected').classList.add('hidden');
            document.getElementById('facClientSearch').classList.remove('hidden');
            document.getElementById('facClientSearch').value = '';
            const sel = document.getElementById('facSelectVenta');
            sel.innerHTML = '<option value="">Primero seleccione un cliente...</option>';
            sel.disabled = true;
            document.getElementById('facPanelTasa').classList.add('hidden');
            const es = document.getElementById('facEmptyState');
            es.classList.remove('hidden');
            es.textContent = 'Seleccione un cliente para cargar su historial de ventas.';
        });

        document.getElementById('facSelectVenta').addEventListener('change', (e) => {
            if (e.target.value !== '') {
                _ventaParaFacturar = _ventasEncontradas[parseInt(e.target.value)];
                document.getElementById('facPanelTasa').classList.remove('hidden');
                document.getElementById('facEmptyState').classList.add('hidden');
                document.getElementById('btnGenerarFactura').onclick = generarFacturaFiscal;
            } else {
                _ventaParaFacturar = null;
                document.getElementById('facPanelTasa').classList.add('hidden');
                document.getElementById('facEmptyState').classList.remove('hidden');
            }
        });

        document.getElementById('facFechaTasa').addEventListener('change', (e) =>
            cargarTasaBcvPorFecha(e.target.value));

        await cargarDatosIniciales();
    };

    // ─────────────────────────────────────────────
    // CARGA DE DATOS INICIALES
    // ─────────────────────────────────────────────
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
        const sel = document.getElementById('facSelectVenta');
        const es  = document.getElementById('facEmptyState');
        sel.innerHTML = '<option value="">Buscando ventas...</option>';
        sel.disabled  = true;
        document.getElementById('facPanelTasa').classList.add('hidden');
        es.innerHTML  = '<p class="animate-pulse text-blue-500 font-semibold">Consultando base de datos...</p>';
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
                sel.innerHTML = '<option value="">Sin ventas registradas</option>';
                es.textContent = 'El cliente no posee historial de compras.';
                return;
            }

            _ventasEncontradas.sort((a, b) => b.fechaObj - a.fechaObj);
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
            es.textContent = '← Seleccione una venta del menú desplegable.';
        } catch (err) {
            console.error('Error cargando ventas:', err);
            sel.innerHTML = '<option value="">Error al cargar</option>';
            es.textContent = 'Error al consultar la base de datos.';
        }
    }

    // ─────────────────────────────────────────────
    // GENERACIÓN DE FACTURA
    // ─────────────────────────────────────────────
    function generarFacturaFiscal() {
        const tasaBs = parseFloat(document.getElementById('facValorTasa').value);
        if (isNaN(tasaBs) || tasaBs <= 0) {
            _showModal('Error', 'Debe ingresar una Tasa BCV válida mayor a 0.');
            document.getElementById('facValorTasa').focus();
            return;
        }
        if (!_ventaParaFacturar) {
            _showModal('Error', 'Debe seleccionar una venta de la lista.');
            return;
        }

        let subtotalBase   = 0;
        let subtotalExento = 0;
        let ivaTotal       = 0;

        // Agrupamos productos por marca (para columna izquierda con rowspan)
        const productosPorMarca = {};

        (_ventaParaFacturar.productos || []).forEach(p => {
            const prod    = _productosCache[p.id] || p;
            const esExento = !(prod.iva && parseFloat(prod.iva) > 0);

            const marca = (p.marca && !['S/M', 'sin marca'].includes((p.marca || '').toLowerCase()))
                ? p.marca.toUpperCase().trim()
                : 'VARIOS';

            if (!productosPorMarca[marca]) productosPorMarca[marca] = [];

            const segStr = (p.segmento && !['S/S', 'sin segmento'].includes((p.segmento || '').toLowerCase()))
                ? p.segmento : '';
            const presStr   = p.presentacion || '';
            const descCorta = [segStr, presStr].filter(Boolean).join(' ') || marca;

            // Intentamos varios nombres de campo posibles en el catálogo
            const unidades = prod.unidadesXCaja || prod.unidades || prod.unidadesCaja
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
                productosPorMarca[marca].push({
                    descripcion:     descCorta,
                    unidades:        String(unidades),
                    contenido:       String(contenido),
                    cantidad,
                    unidadMedida,
                    exento:          esExento,
                    alicuota:        esExento ? '' : '16',
                    precioUnitarioBs: baseUSD * tasaBs,
                    totalBs:          cantidad * baseUSD * tasaBs
                });
            };

            addLinea(qCj,  'Cj', pCj);
            addLinea(qPaq, 'Pq', pPaq);
            addLinea(qUnd, 'Un', pUnd);

            // Fallback para tickets viejos sin desglose
            if (qCj === 0 && qPaq === 0 && qUnd === 0) {
                const fQty   = parseInt(p.cantidad) || parseInt(p.totalUnidadesVendidas) || 1;
                const fPrice = pUnd > 0 ? pUnd : ((p.total || 0) / fQty);
                if (fPrice > 0) addLinea(fQty, 'Un', fPrice);
            }
        });

        const totalOp      = subtotalBase + subtotalExento + ivaTotal;
        const retencionUSD = _clienteSeleccionado.aplicaRetencion ? ivaTotal * 0.75 : 0;
        const totalPagar   = totalOp - retencionUSD;

        const numControl = String(Math.floor(10000 + Math.random() * 90000)).padStart(6, '0');
        const numFactura = String(Math.floor(1000  + Math.random() * 9000)).padStart(6, '0');

        const html = buildFacturaHtml({
            cliente: _clienteSeleccionado,
            fechaISO: document.getElementById('facFechaTasa').value,
            tasaBs, productosPorMarca,
            subtotalBase, subtotalExento, ivaTotal,
            totalOp, retencionUSD, totalPagar,
            numControl, numFactura
        });

        abrirFacturaFullscreen(html);
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
/* ── Barra superior ── */
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
/* ── Área de pan (drag to navigate) ── */
#facPanArea{
    flex:1;
    overflow:scroll;                   /* scroll nativo = deslizamiento suave */
    -webkit-overflow-scrolling:touch;  /* inercia en Android/iOS              */
    overscroll-behavior:contain;
    scrollbar-width:none;              /* Firefox: sin barra visible           */
    -ms-overflow-style:none;
    padding:14px;
    cursor:grab;
}
#facPanArea:active{cursor:grabbing;}
#facPanArea::-webkit-scrollbar{display:none;}  /* Chrome/Android: sin barra */
/* ── Papel de la factura ── */
#facPaper{
    width:900px;             /* ancho fijo del "papel" */
    background:#fff;
    box-shadow:0 6px 32px rgba(0,0,0,.35);
    border-radius:2px;
    display:inline-block;   /* se encoge al ancho del contenido si es menor */
}
/* ── Hint de deslizamiento ── */
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
    // PLANTILLA HTML — fiel a la factura física
    // ─────────────────────────────────────────────
    function buildFacturaHtml({
        cliente, fechaISO, tasaBs, productosPorMarca,
        subtotalBase, subtotalExento, ivaTotal,
        totalOp, retencionUSD, totalPagar,
        numControl, numFactura
    }) {
        // ── Formateadores ────────────────────────────────
        const fBs  = n => (isFinite(n) ? n : 0)
            .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fUSD = n => (isFinite(n) ? n : 0).toFixed(2);

        const [year, month, day] = (fechaISO || '2026-01-01').split('-');

        // ── Estilos reutilizables ────────────────────────
        const B  = 'border:1px solid #444;';           // borde normal
        const BB = 'border:2px solid #1a1a1a;';        // borde grueso externo
        const td = `${B}padding:4px 5px;font-size:10px;`;
        const tR = `${td}text-align:right;padding-right:6px;`;
        const tC = `${td}text-align:center;`;
        const th = `${B}padding:4px 3px;font-size:8.5px;font-weight:700;`
                 + `text-align:center;background:#e0e0e0;`;
        const thL = th + 'text-align:left;padding-left:5px;';

        // ── Filas de productos ───────────────────────────
        let rows = '';
        let totalLineas = 0;
        const marcas = Object.keys(productosPorMarca);

        marcas.forEach(marca => {
            const lineas = productosPorMarca[marca] || [];
            if (!lineas.length) return;
            totalLineas += lineas.length;

            lineas.forEach((l, i) => {
                rows += '<tr>';
                // Celda de marca (rowspan): columna más a la izquierda
                if (i === 0) {
                    rows += `<td rowspan="${lineas.length}"
                        style="${B}padding:3px;vertical-align:middle;text-align:center;
                                font-weight:900;font-size:9px;line-height:1.25;
                                word-break:break-word;max-width:58px;
                                background:#fafafa;">${marca}</td>`;
                }
                rows += `
                    <td style="${td}">${l.descripcion}</td>
                    <td style="${tC}">${l.unidades}</td>
                    <td style="${tC}">${l.contenido}</td>
                    <td style="${tC}font-weight:700;">${String(l.cantidad).padStart(2,'0')}&nbsp;${l.unidadMedida}</td>
                    <td style="${tC}font-weight:900;color:#b00000;">${l.exento ? 'E' : ''}</td>
                    <td style="${tC}">${l.alicuota}</td>
                    <td style="${tR}">${fBs(l.precioUnitarioBs)}</td>
                    <td style="${tR}font-weight:700;">${fBs(l.totalBs)}</td>
                `;
                rows += '</tr>';
            });
        });

        // Relleno de filas vacías para llenar la hoja (mínimo 24 filas)
        const relleno = Math.max(0, 24 - totalLineas);
        for (let i = 0; i < relleno; i++) {
            rows += `<tr><td colspan="9" style="${B}height:20px;"></td></tr>`;
        }

        // ── Conversiones finales a Bs ────────────────────
        const exentoBs    = subtotalExento * tasaBs;
        const baseBs      = subtotalBase   * tasaBs;
        const ivaBs       = ivaTotal       * tasaBs;
        const retBs       = retencionUSD   * tasaBs;
        const totalPagarBs = totalPagar    * tasaBs;

        const filaRetencion = cliente.aplicaRetencion ? `
            <tr style="background:#fff5f5;">
                <td style="${B}font-size:8.5px;padding:4px 8px;color:#9b0000;font-weight:700;" colspan="2">
                    Retención I.V.A. (75%) &nbsp;·&nbsp; Ref: &minus;$${fUSD(retencionUSD)} USD
                </td>
                <td style="${B}text-align:right;padding:4px 8px;font-weight:900;font-size:10.5px;color:#9b0000;">
                    &minus;Bs.&nbsp;${fBs(retBs)}
                </td>
            </tr>` : '';

        // ── HTML final ───────────────────────────────────
        return `
<div style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#111;
            background:#fff;padding:16px 18px;position:relative;
            min-width:900px;box-sizing:border-box;">

  <!-- MARCA DE AGUA -->
  <div style="position:absolute;inset:0;display:flex;align-items:center;
              justify-content:center;pointer-events:none;overflow:hidden;z-index:0;">
    <span style="font-size:120px;font-weight:900;font-family:Arial,sans-serif;
                 color:rgba(0,0,0,0.028);transform:rotate(-38deg);
                 letter-spacing:12px;white-space:nowrap;">SIMULADOR</span>
  </div>

  <div style="position:relative;z-index:1;">

  <!-- ══════════════════════════════════════════
       CABECERA: Empresa | RIF+Fecha | Registro
       ══════════════════════════════════════════ -->
  <table style="width:100%;border-collapse:collapse;${BB}">
    <tr>
      <!-- Datos empresa -->
      <td style="${B}padding:10px 14px;width:54%;vertical-align:middle;">
        <div style="font-size:17px;font-weight:900;font-family:Arial,sans-serif;
                    letter-spacing:0.2px;margin-bottom:5px;">
          Distribuidora Castillo Yañez, C.A.
        </div>
        <div style="font-size:8px;color:#444;line-height:1.6;">
          Domicilio Fiscal: Calle Urbanización Santa Inés Local Nro. B-PB-3<br>
          Conj. Resid. El Alcázar Etapa 2 Torre B<br>
          San Cristóbal, Estado Táchira &nbsp;·&nbsp; Zona Postal 5001
        </div>
      </td>

      <!-- RIF + Fecha -->
      <td style="${B}padding:6px;width:29%;vertical-align:top;">
        <div style="text-align:center;font-weight:900;font-size:12px;
                    border:1.5px solid #333;padding:3px 0;margin-bottom:4px;
                    letter-spacing:0.5px;">
          RIF: J-40214875-5
        </div>
        <div style="text-align:center;font-size:7.5px;font-weight:700;
                    background:#d8d8d8;padding:2px 0;border:1px solid #666;
                    border-bottom:0;letter-spacing:2px;">
          FECHA DE EXPEDICIÓN
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #666;">
          <tr>
            <th style="border:1px solid #666;text-align:center;font-size:7px;
                       padding:2px;background:#ebebeb;width:33%;">DÍA</th>
            <th style="border:1px solid #666;text-align:center;font-size:7px;
                       padding:2px;background:#ebebeb;width:34%;">MES</th>
            <th style="border:1px solid #666;text-align:center;font-size:7px;
                       padding:2px;background:#ebebeb;width:33%;">AÑO</th>
          </tr>
          <tr>
            <td style="border:1px solid #666;text-align:center;font-size:20px;
                       font-weight:900;padding:3px;">${day}</td>
            <td style="border:1px solid #666;text-align:center;font-size:20px;
                       font-weight:900;padding:3px;">${month}</td>
            <td style="border:1px solid #666;text-align:center;font-size:20px;
                       font-weight:900;padding:3px;">${year}</td>
          </tr>
        </table>
      </td>

      <!-- Registro -->
      <td style="${B}padding:8px;width:17%;vertical-align:middle;text-align:center;">
        <div style="font-size:7.5px;color:#555;">Registro</div>
        <div style="font-size:11.5px;font-weight:900;margin:2px 0;">MY-DISTR-037</div>
        <div style="font-size:7px;color:#555;">de Fecha</div>
        <div style="font-size:10px;font-weight:700;">18-07-2022</div>
      </td>
    </tr>
  </table>

  <!-- ══════════════════════════════════════════
       CONTROL N° — | FACTURA SERIE "A" | N°
       ══════════════════════════════════════════ -->
  <table style="width:100%;border-collapse:collapse;${BB}border-top:0;">
    <tr>
      <td style="${B}padding:7px 14px;width:54%;">
        <span style="font-size:13px;font-weight:900;">CONTROL N° 00 &nbsp;&mdash;&nbsp;</span>
        <span style="font-size:17px;font-weight:900;color:#cc0000;letter-spacing:1px;">${numControl}</span>
      </td>
      <td style="${B}padding:5px;width:28%;text-align:center;vertical-align:middle;">
        <div style="font-size:16px;font-weight:900;letter-spacing:2px;">FACTURA</div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;">SERIE "A"</div>
      </td>
      <td style="${B}padding:6px 10px;width:18%;vertical-align:middle;">
        <span style="font-size:11px;font-weight:700;">N°&nbsp;</span>
        <span style="font-size:16px;font-weight:900;">${numFactura}</span>
      </td>
    </tr>
  </table>

  <!-- ══════════════════════════════════════════
       DATOS DEL CLIENTE
       ══════════════════════════════════════════ -->
  <table style="width:100%;border-collapse:collapse;${BB}border-top:0;">
    <tr>
      <td style="${B}padding:5px 10px;width:62%;">
        <div style="font-size:7px;color:#666;text-transform:uppercase;letter-spacing:1px;">
          Nombre y Apellido o Razón Social:
        </div>
        <div style="font-size:14px;font-weight:900;border-bottom:1px dashed #aaa;
                    padding-bottom:2px;margin-top:3px;">
          ${cliente.nombreComercial}
        </div>
      </td>
      <td style="${B}padding:5px 10px;width:38%;vertical-align:top;">
        <div style="font-size:7px;color:#666;text-transform:uppercase;letter-spacing:1px;">
          N° RIF, N° Cédula o Pasaporte N°:
        </div>
        <div style="font-size:13px;font-weight:900;border-bottom:1px dashed #aaa;
                    padding-bottom:2px;margin-top:3px;">
          ${cliente.rif || 'N/A'}
        </div>
        <div style="font-size:7px;color:#666;text-transform:uppercase;margin-top:4px;">
          Condiciones de Pago:
        </div>
        <div style="font-size:10.5px;font-weight:700;">Crédito 70 días</div>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="${B}padding:5px 10px;">
        <span style="font-size:7px;color:#666;text-transform:uppercase;">Domicilio Fiscal:&nbsp;</span>
        <span style="font-size:11px;font-weight:700;">
          ${cliente.sector || cliente.sectorNombre || cliente.domicilio || 'N/A'}
        </span>
        ${cliente.telefono
            ? `<span style="font-size:8.5px;color:#666;"> &nbsp;|&nbsp; Tel: ${cliente.telefono}</span>`
            : ''}
      </td>
    </tr>
  </table>

  <!-- ══════════════════════════════════════════
       TABLA DE PRODUCTOS
       ══════════════════════════════════════════ -->
  <table style="width:100%;border-collapse:collapse;${BB}border-top:0;">
    <thead>
      <tr>
        <th style="${th}width:7%;"></th>
        <th style="${thL}width:24%;">DESCRIPCIÓN</th>
        <th style="${th}width:8%;">UNI&shy;DADES</th>
        <th style="${th}width:9%;">LITROS</th>
        <th style="${th}width:9%;">CANTI&shy;DAD</th>
        <th style="${th}width:5%;">(E)</th>
        <th style="${th}width:7%;">ALÍ&shy;C.&nbsp;%</th>
        <th style="${th}width:16%;text-align:right;padding-right:5px;">PRECIO&nbsp;UNIT.<br>Bs.</th>
        <th style="${th}width:15%;text-align:right;padding-right:5px;">MONTO<br>Bs.</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- ══════════════════════════════════════════
       PIE DE FACTURA — TOTALES FISCALES
       ══════════════════════════════════════════ -->
  <table style="width:100%;border-collapse:collapse;${BB}border-top:0;">
    <tr>
      <!-- Caja izquierda -->
      <td style="${B}padding:10px;width:30%;vertical-align:top;text-align:center;">
        <div style="font-size:8.5px;font-weight:700;color:#333;line-height:1.6;
                    border:1px solid #999;padding:6px;">
          ESTA FACTURA VA SIN TACHADURA<br>NI ENMENDADURA
        </div>
        <div style="margin-top:14px;font-size:15px;font-weight:900;
                    color:#cc0000;letter-spacing:3px;">ORIGINAL</div>
        <div style="margin-top:16px;border-top:1px dashed #bbb;padding-top:8px;">
          <div style="font-size:7.5px;color:#555;">Tasa BCV aplicada:</div>
          <div style="font-size:12px;font-weight:900;color:#1a3560;">Bs.&nbsp;${fBs(tasaBs)}</div>
        </div>
        <div style="margin-top:6px;">
          <div style="font-size:7.5px;color:#555;">Referencia en USD:</div>
          <div style="font-size:11px;font-weight:900;color:#1a3560;">$${fUSD(totalPagar)}</div>
        </div>
      </td>

      <!-- Tabla de totales fiscales -->
      <td style="${B}padding:0;width:70%;vertical-align:top;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${B}font-size:8.5px;padding:5px 8px;width:72%;line-height:1.4;">
              Monto Total de Bienes o Servicios Exentos o Exonerados<br>
              del Impuesto al Valor Agregado &nbsp; Bs.
            </td>
            <td style="${B}text-align:right;padding:5px 8px;font-weight:700;font-size:11px;">
              ${fBs(exentoBs)}
            </td>
          </tr>
          <tr>
            <td style="${B}font-size:8.5px;padding:5px 8px;color:#555;">
              Adiciones al precio por concepto de: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Bs.
            </td>
            <td style="${B}padding:5px 8px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8.5px;padding:5px 8px;color:#555;">
              Valor de los descuentos, bonificaciones, anulaciones al precio &nbsp; Bs.
            </td>
            <td style="${B}padding:5px 8px;"></td>
          </tr>
          <tr>
            <td style="${B}font-size:8.5px;padding:5px 8px;line-height:1.4;">
              Monto Total de la Base Imponible del I.V.A.<br>
              según Alícuota <strong>16</strong> % &nbsp; Bs.
            </td>
            <td style="${B}text-align:right;padding:5px 8px;font-weight:700;font-size:11px;">
              ${fBs(baseBs)}
            </td>
          </tr>
          <tr>
            <td style="${B}font-size:8.5px;padding:5px 8px;line-height:1.4;">
              Monto Total del Impuesto al Valor Agregado<br>
              según Alícuota <strong>16</strong> % &nbsp; Bs.
            </td>
            <td style="${B}text-align:right;padding:5px 8px;font-weight:700;font-size:11px;">
              ${fBs(ivaBs)}
            </td>
          </tr>
          ${filaRetencion}
          <tr style="background:#f0f0f0;">
            <td style="border:2px solid #222;font-size:10px;padding:6px 8px;font-weight:900;
                       text-transform:uppercase;letter-spacing:0.3px;">
              Valor Total de la Venta de los Bienes &nbsp; Bs.
            </td>
            <td style="border:2px solid #222;text-align:right;padding:6px 8px;
                       font-weight:900;font-size:13px;">
              ${fBs(totalPagarBs)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ══════════════════════════════════════════
       DATOS DE IMPRENTA (igual a la factura física)
       ══════════════════════════════════════════ -->
  <div style="font-size:7px;color:#777;margin-top:7px;text-align:center;
              border-top:1px solid #ddd;padding-top:5px;line-height:1.5;">
    LITOANDES, S.A. Av. Carabobo Esq. Carrera 20 · Sector La Romera · Tlf: (0276) 356.19.55
    San Cristóbal, Edo. Táchira &nbsp;/&nbsp; RIF: J-30406057-2
    &nbsp;·&nbsp; N° PROVIDENCIA SENIAT 05/00579 de 14/03/2008
    &nbsp;·&nbsp; Región Los Andes · 20 Talonarios Original y 1 Copia
    (Control N° 00-010501 hasta N° 00-011500) &nbsp;·&nbsp;
    (Factura SERIE "A" N° 002501 hasta N° 003500) · Elaboración 12/02/2022
  </div>

  <!-- Aviso simulación -->
  <div style="text-align:center;margin-top:6px;font-size:7.5px;font-weight:700;
              color:#cc0000;letter-spacing:1px;">
    *** DOCUMENTO SIMULADO SIN VALIDEZ FISCAL — DIST. CASTILLO YAÑEZ APP ***
  </div>

  </div><!-- /z-index:1 -->
</div>`;
    }

})();

// --- Módulo de Simulación de Facturación Fiscal ---

(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where, _getDoc, _doc;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    
    let _clientesCache = [];
    let _tasasCache = {};
    let _ventasEncontradas = [];
    let _clienteSeleccionado = null;

    window.initFacturacion = function(dependencies) {
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
        _query = dependencies.query;
        _where = dependencies.where;
        _getDoc = dependencies.getDoc;
        _doc = dependencies.doc;

        console.log("Módulo Facturación Inicializado.");
    };

    window.showFacturacionView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');

        const today = new Date().toISOString().split('T')[0];

        _mainContent.innerHTML = `
            <div class="p-4 pt-8 w-full max-w-5xl mx-auto flex flex-col h-screen">
                <div class="bg-white/95 backdrop-blur-sm p-6 rounded-lg shadow-xl flex flex-col flex-grow overflow-hidden border-t-4 border-blue-800">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-black text-gray-800 tracking-tight">🧾 Simulador de Facturación</h2>
                        <button id="btnVolverFacturacion" class="px-4 py-2 bg-gray-500 text-white font-bold rounded shadow hover:bg-gray-600 transition">Volver al Menú</button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-5 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
                        <div class="md:col-span-2 relative">
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">1. Seleccionar Cliente:</label>
                            <input type="text" id="facClientSearch" placeholder="Escriba para buscar..." class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm">
                            <div id="facClientDropdown" class="absolute z-50 w-full bg-white border border-gray-300 rounded-b-md shadow-lg hidden max-h-60 overflow-y-auto mt-1"></div>
                            <div id="facClientSelected" class="hidden mt-2 p-2 bg-blue-100 text-blue-800 font-bold rounded flex justify-between items-center border border-blue-200">
                                <span id="facClientName"></span>
                                <button id="facClientClear" class="text-red-500 hover:text-red-700 text-lg leading-none">&times;</button>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">2. Fecha de Venta:</label>
                            <input type="date" id="facFechaVenta" value="${today}" class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm">
                        </div>

                        <div class="flex items-end">
                            <button id="btnBuscarVentaFac" class="w-full bg-blue-600 text-white py-2.5 rounded-md shadow hover:bg-blue-700 font-bold transition flex justify-center items-center gap-2">
                                <span>🔍</span> Buscar Venta
                            </button>
                        </div>
                    </div>

                    <div id="facResultadosContainer" class="hidden flex-col flex-grow overflow-hidden">
                        <h3 class="font-bold text-gray-700 border-b pb-2 mb-3">Ventas Encontradas:</h3>
                        <div id="facListaVentas" class="space-y-2 overflow-y-auto mb-4 max-h-40"></div>

                        <div id="facPanelTasa" class="hidden grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg mt-4 items-end">
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">3. Fecha Tasa BCV:</label>
                                <input type="date" id="facFechaTasa" value="${today}" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Valor Tasa (Bs):</label>
                                <input type="number" id="facValorTasa" step="0.0001" placeholder="Ej: 36.50" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-900">
                            </div>
                            <div>
                                <button id="btnGenerarFactura" class="w-full bg-green-600 text-white py-2 rounded-md shadow hover:bg-green-700 font-bold transition text-sm">
                                    Generar Factura
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="facEmptyState" class="flex-grow flex items-center justify-center text-gray-400 font-medium border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                        Seleccione un cliente y una fecha para buscar sus ventas.
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnVolverFacturacion').addEventListener('click', _showMainMenu);
        document.getElementById('btnBuscarVentaFac').addEventListener('click', buscarVentasFiscales);
        
        const searchInput = document.getElementById('facClientSearch');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = _clientesCache.filter(c => 
                (c.nombreComercial || '').toLowerCase().includes(term) || 
                (c.rif || '').toLowerCase().includes(term)
            ).slice(0, 10);
            renderClientDropdown(filtered);
        });

        document.getElementById('facClientClear').addEventListener('click', () => {
            _clienteSeleccionado = null;
            document.getElementById('facClientSelected').classList.add('hidden');
            document.getElementById('facClientSearch').classList.remove('hidden');
            document.getElementById('facClientSearch').value = '';
            document.getElementById('facResultadosContainer').classList.add('hidden');
            document.getElementById('facEmptyState').classList.remove('hidden');
        });

        document.getElementById('facFechaTasa').addEventListener('change', (e) => cargarTasaBcvPorFecha(e.target.value));

        await cargarClientesYTasas();
    };

    async function cargarClientesYTasas() {
        try {
            const [snapClientes, snapTasas] = await Promise.all([
                _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/clientes`)),
                _getDocs(_collection(_db, `artifacts/${PUBLIC_DATA_ID}/public/data/tasas_bcv`))
            ]);
            
            _clientesCache = snapClientes.docs.map(d => ({ id: d.id, ...d.data() }));
            _tasasCache = {};
            snapTasas.forEach(d => { _tasasCache[d.id] = d.data().rate; });
            
            cargarTasaBcvPorFecha(document.getElementById('facFechaTasa').value);
        } catch (e) {
            console.error("Error cargando datos:", e);
        }
    }

    function renderClientDropdown(clientes) {
        const dropdown = document.getElementById('facClientDropdown');
        dropdown.innerHTML = '';
        if (clientes.length === 0 || document.getElementById('facClientSearch').value.trim() === '') {
            dropdown.classList.add('hidden');
            return;
        }
        
        clientes.forEach(c => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-blue-50 cursor-pointer text-sm text-gray-800';
            const badge = c.aplicaRetencion ? `<span class="ml-2 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Retiene IVA</span>` : '';
            div.innerHTML = `<span class="font-bold">${c.nombreComercial}</span> <span class="text-xs text-gray-500">(${c.rif || 'Sin RIF'})</span> ${badge}`;
            div.onclick = () => {
                _clienteSeleccionado = c;
                document.getElementById('facClientSearch').classList.add('hidden');
                document.getElementById('facClientDropdown').classList.add('hidden');
                const selDiv = document.getElementById('facClientSelected');
                selDiv.classList.remove('hidden');
                document.getElementById('facClientName').innerHTML = `${c.nombreComercial} ${badge}`;
            };
            dropdown.appendChild(div);
        });
        dropdown.classList.remove('hidden');
    }

    function cargarTasaBcvPorFecha(fechaStr) {
        const inputTasa = document.getElementById('facValorTasa');
        if (!inputTasa) return;
        
        if (_tasasCache[fechaStr]) {
            inputTasa.value = _tasasCache[fechaStr];
            inputTasa.classList.add('bg-green-50');
            inputTasa.classList.remove('bg-yellow-50');
        } else {
            inputTasa.value = '';
            inputTasa.classList.add('bg-yellow-50');
            inputTasa.classList.remove('bg-green-50');
            inputTasa.placeholder = 'No registrada. Ingrese manual';
        }
    }

    async function buscarVentasFiscales() {
        if (!_clienteSeleccionado) { _showModal('Atención', 'Debe seleccionar un cliente primero.'); return; }
        const fechaStr = document.getElementById('facFechaVenta').value;
        if (!fechaStr) { _showModal('Atención', 'Debe seleccionar una fecha de venta.'); return; }

        const emptyState = document.getElementById('facEmptyState');
        const container = document.getElementById('facResultadosContainer');
        const lista = document.getElementById('facListaVentas');
        
        emptyState.classList.add('hidden');
        container.classList.remove('hidden');
        container.classList.add('flex');
        lista.innerHTML = '<p class="text-center text-gray-500 py-4 animate-pulse">Buscando en base de datos...</p>';
        document.getElementById('facPanelTasa').classList.add('hidden');

        try {
            // Buscamos en todas las carpetas de usuarios
            const usersSnap = await _getDocs(_collection(_db, "users"));
            const userIds = usersSnap.docs.map(d => d.id);
            
            const targetDate = new Date(fechaStr + 'T00:00:00');
            const nextDay = new Date(targetDate);
            nextDay.setDate(targetDate.getDate() + 1);

            _ventasEncontradas = [];

            for (const uid of userIds) {
                try {
                    // 1. Buscar en Ventas Activas
                    const vActivasRef = _collection(_db, `artifacts/${_appId}/users/${uid}/ventas`);
                    const qActivas = _query(vActivasRef, _where("clienteId", "==", _clienteSeleccionado.id));
                    const snapActivas = await _getDocs(qActivas);
                    
                    snapActivas.docs.forEach(d => {
                        const v = d.data();
                        const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                        if (f >= targetDate && f < nextDay) {
                            _ventasEncontradas.push({ id: d.id, origen: 'Activa', ...v, fechaObj: f });
                        }
                    });

                    // 2. Buscar en Cierres Pasados
                    const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const qCierres = _query(cierresRef, _where("fecha", ">=", targetDate), _where("fecha", "<", nextDay));
                    const snapCierres = await _getDocs(qCierres);

                    snapCierres.docs.forEach(docCierre => {
                        const cierre = docCierre.data();
                        (cierre.ventas || []).forEach(v => {
                            if (v.clienteId === _clienteSeleccionado.id) {
                                const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha || cierre.fecha);
                                _ventasEncontradas.push({ id: docCierre.id + '-' + Math.random().toString(36).substr(2,5), origen: 'Cierre', ...v, fechaObj: f });
                            }
                        });
                    });

                } catch (e) { /* Ignorar errores de permisos por carpeta */ }
            }

            if (_ventasEncontradas.length === 0) {
                lista.innerHTML = `<div class="p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">No se encontraron ventas para <b>${_clienteSeleccionado.nombreComercial}</b> en la fecha <b>${targetDate.toLocaleDateString()}</b>.</div>`;
                return;
            }

            // Renderizar lista
            lista.innerHTML = '';
            _ventasEncontradas.sort((a,b) => b.fechaObj - a.fechaObj);

            _ventasEncontradas.forEach((v, index) => {
                const fStr = v.fechaObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center p-3 border border-gray-200 rounded hover:bg-blue-50 bg-white shadow-sm transition cursor-pointer';
                div.innerHTML = `
                    <div>
                        <span class="font-bold text-gray-800">Venta: $${v.total.toFixed(2)}</span>
                        <span class="text-xs text-gray-500 ml-2">Hora: ${fStr} | Estado: ${v.origen}</span>
                    </div>
                    <button class="px-4 py-1.5 bg-blue-100 text-blue-700 font-bold text-xs rounded border border-blue-300 hover:bg-blue-200">Seleccionar</button>
                `;
                div.onclick = () => seleccionarVentaParaFactura(index, div);
                lista.appendChild(div);
            });

        } catch (error) {
            console.error(error);
            lista.innerHTML = `<p class="text-red-500">Error al buscar ventas: ${error.message}</p>`;
        }
    }

    let _ventaParaFacturar = null;
    function seleccionarVentaParaFactura(index, elementDiv) {
        _ventaParaFacturar = _ventasEncontradas[index];
        
        // Efecto visual
        const lista = document.getElementById('facListaVentas');
        Array.from(lista.children).forEach(c => {
            c.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
            c.querySelector('button').innerText = 'Seleccionar';
            c.querySelector('button').className = 'px-4 py-1.5 bg-blue-100 text-blue-700 font-bold text-xs rounded border border-blue-300 hover:bg-blue-200';
        });
        
        elementDiv.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
        const btn = elementDiv.querySelector('button');
        btn.innerText = 'Seleccionada';
        btn.className = 'px-4 py-1.5 bg-blue-600 text-white font-bold text-xs rounded shadow';

        // Mostrar panel de tasa
        document.getElementById('facPanelTasa').classList.remove('hidden');
        document.getElementById('btnGenerarFactura').onclick = generarFacturaFiscal;
    }

    function generarFacturaFiscal() {
        const tasaBs = parseFloat(document.getElementById('facValorTasa').value);
        if (isNaN(tasaBs) || tasaBs <= 0) {
            _showModal('Error', 'Debe ingresar una Tasa BCV válida mayor a 0 para generar la factura.');
            return;
        }

        _showModal('Procesando', 'Generando factura fiscal...', null, '', null, false);

        // LÓGICA DE CÁLCULO FISCAL
        let subtotalBase = 0;
        let subtotalExento = 0;
        let ivaTotal = 0;
        
        const productosProcesados = [];

        (_ventaParaFacturar.productos || []).forEach(p => {
            // Calcular total de la linea
            const pCj = p.precios?.cj || 0;
            const pPaq = p.precios?.paq || 0;
            const pUnd = p.precios?.und || p.precioPorUnidad || 0;
            
            const qCj = p.cantidadVendida?.cj || 0;
            const qPaq = p.cantidadVendida?.paq || 0;
            const qUnd = p.cantidadVendida?.und || 0;

            const totalLinea = (qCj * pCj) + (qPaq * pPaq) + (qUnd * pUnd);
            
            // Extraer Cantidad Total para mostrar
            let cantDisplay = '';
            if (qCj > 0) cantDisplay += `${qCj} Cj `;
            if (qPaq > 0) cantDisplay += `${qPaq} Pq `;
            if (qUnd > 0) cantDisplay += `${qUnd} Un`;
            if (cantDisplay === '') cantDisplay = `${p.totalUnidadesVendidas} Un`;

            // Verificar IVA (Si p.iva > 0 asumimos que el precio ya INCLUYE IVA en la BD según el estandar del sistema)
            // Para la factura, debemos extraer la Base Imponible. Base = Total / 1.16
            let esExento = !(p.iva > 0);
            let precioUnitarioBase = 0;
            let totalLineaBase = 0;

            if (esExento) {
                subtotalExento += totalLinea;
                precioUnitarioBase = totalLinea / (p.totalUnidadesVendidas || 1);
                totalLineaBase = totalLinea;
            } else {
                totalLineaBase = totalLinea / 1.16;
                const ivaLinea = totalLinea - totalLineaBase;
                subtotalBase += totalLineaBase;
                ivaTotal += ivaLinea;
                precioUnitarioBase = totalLineaBase / (p.totalUnidadesVendidas || 1);
            }

            productosProcesados.push({
                cantidad: cantDisplay.trim(),
                descripcion: p.presentacion,
                precioUnitario: precioUnitarioBase,
                total: totalLineaBase,
                exento: esExento
            });
        });

        // Totales Finales
        const totalOperacion = subtotalBase + subtotalExento + ivaTotal; // Debería coincidir con _ventaParaFacturar.total
        let retencionIva = 0;

        if (_clienteSeleccionado.aplicaRetencion) {
            retencionIva = ivaTotal * 0.75;
        }

        const totalPagar = totalOperacion - retencionIva;

        // Conversiones a Bs
        const totalBaseBs = subtotalBase * tasaBs;
        const totalExentoBs = subtotalExento * tasaBs;
        const totalIvaBs = ivaTotal * tasaBs;
        const totalOperacionBs = totalOperacion * tasaBs;
        const retencionBs = retencionIva * tasaBs;
        const totalPagarBs = totalPagar * tasaBs;

        // RENDERIZAR PLANTILLA
        const facturaHtml = crearPlantillaFactura(
            _clienteSeleccionado, 
            _ventaParaFacturar.fechaObj, 
            tasaBs, 
            productosProcesados,
            { subtotalBase, subtotalExento, ivaTotal, totalOperacion, retencionIva, totalPagar },
            { totalBaseBs, totalExentoBs, totalIvaBs, totalOperacionBs, retencionBs, totalPagarBs }
        );

        const modalWrapper = `
            <div class="flex flex-col items-center max-h-[75vh] overflow-y-auto bg-gray-200 p-4 rounded-lg">
                <div id="captureFacturaArea" class="bg-white p-8 w-full max-w-3xl shadow-lg border border-gray-300" style="font-family: 'Courier New', Courier, monospace;">
                    ${facturaHtml}
                </div>
            </div>
            <div class="mt-4 flex gap-2">
                <button id="btnDescargarFactura" class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow transition flex justify-center items-center gap-2">
                    <span>⬇️</span> Descargar Imagen
                </button>
            </div>
        `;

        _showModal('Factura Fiscal Simulada', modalWrapper, null, 'Cerrar');

        setTimeout(() => {
            document.getElementById('btnDescargarFactura').onclick = async () => {
                const element = document.getElementById('captureFacturaArea');
                _showModal('Progreso', 'Generando imagen...');
                try {
                    const canvas = await html2canvas(element, { scale: 2 });
                    const dataUrl = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = `Factura_${_clienteSeleccionado.nombreComercial.replace(/\\s+/g, '_')}.png`;
                    link.click();
                    document.getElementById('modalContainer').classList.add('hidden');
                } catch (err) {
                    console.error(err);
                    _showModal('Error', 'Fallo al generar la imagen de la factura.');
                }
            };
        }, 300);
    }

    function crearPlantillaFactura(cliente, fecha, tasaBs, productos, totales, totalesBs) {
        // Formateadores
        const fUSD = (n) => `$${n.toFixed(2)}`;
        const fBS = (n) => `Bs ${n.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        const fechaStr = fecha.toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit', year:'numeric'});

        // Filas de productos
        let filasProd = '';
        productos.forEach(p => {
            filasProd += `
                <tr class="text-sm">
                    <td class="py-1 border-b border-dashed border-gray-300">${p.cantidad}</td>
                    <td class="py-1 border-b border-dashed border-gray-300">${p.descripcion} ${p.exento ? '(E)' : ''}</td>
                    <td class="py-1 border-b border-dashed border-gray-300 text-right">${fUSD(p.precioUnitario)}</td>
                    <td class="py-1 border-b border-dashed border-gray-300 text-right">${fUSD(p.total)}</td>
                </tr>
            `;
        });

        const numFactura = Math.floor(100000 + Math.random() * 900000); // Simulamos un Nro Control

        return `
            <div class="text-center mb-6">
                <h1 class="text-2xl font-bold font-sans">DISTRIBUIDORA CASTILLO YAÑEZ C.A.</h1>
                <p class="text-sm">RIF: J-40214875-5</p>
                <p class="text-xs mt-1 text-gray-500">*** DOCUMENTO SIMULADO SIN VALIDEZ FISCAL ***</p>
            </div>

            <div class="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
                <div>
                    <p><strong>Lugar y Fecha:</strong> San Cristóbal, ${fechaStr}</p>
                </div>
                <div class="text-right">
                    <p class="text-xl font-bold text-red-600">FACTURA</p>
                    <p><strong>Nro Control:</strong> 00-${numFactura}</p>
                </div>
            </div>

            <div class="mb-6 space-y-1 text-sm">
                <p><strong>Razón Social:</strong> ${cliente.nombreComercial}</p>
                <p><strong>RIF/Cédula:</strong> ${cliente.rif || 'N/A'}</p>
                <p><strong>Dirección:</strong> ${cliente.direccion || 'N/A'}</p>
                <p><strong>Teléfono:</strong> ${cliente.telefono || 'N/A'}</p>
            </div>

            <table class="w-full mb-6">
                <thead>
                    <tr class="border-y-2 border-black text-left">
                        <th class="py-2 w-1/6">CANT.</th>
                        <th class="py-2 w-1/2">DESCRIPCIÓN</th>
                        <th class="py-2 w-1/6 text-right">P. UNIT ($)</th>
                        <th class="py-2 w-1/6 text-right">TOTAL ($)</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasProd}
                </tbody>
            </table>

            <div class="flex justify-between mt-8">
                <div class="w-[45%] border border-gray-400 p-3 rounded bg-gray-50 text-sm h-fit">
                    <p class="font-bold mb-2 border-b border-gray-300 pb-1">EQUIVALENTE EN BOLÍVARES</p>
                    <p><strong>Tasa BCV:</strong> ${fBS(tasaBs).replace('Bs ', '')}</p>
                    <div class="space-y-1 mt-2">
                        <div class="flex justify-between"><span class="text-gray-600">Sub-Total Exento:</span> <span>${fBS(totalesBs.totalExentoBs)}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600">Sub-Total Base:</span> <span>${fBS(totalesBs.totalBaseBs)}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600">IVA (16%):</span> <span>${fBS(totalesBs.totalIvaBs)}</span></div>
                        <div class="flex justify-between font-bold pt-1 border-t border-gray-300"><span>TOTAL FACTURA:</span> <span>${fBS(totalesBs.totalOperacionBs)}</span></div>
                        ${cliente.aplicaRetencion ? `<div class="flex justify-between text-red-600 mt-1"><span>Retención IVA (75%):</span> <span>-${fBS(totalesBs.retencionBs)}</span></div>` : ''}
                    </div>
                    <div class="flex justify-between font-black text-lg mt-3 pt-2 border-t-2 border-black">
                        <span>TOTAL A PAGAR:</span> <span>${fBS(totalesBs.totalPagarBs)}</span>
                    </div>
                </div>

                <div class="w-[45%] text-sm flex flex-col justify-end">
                    <div class="space-y-1">
                        <div class="flex justify-between"><span class="font-bold">Sub-Total Exento:</span> <span>${fUSD(totales.subtotalExento)}</span></div>
                        <div class="flex justify-between"><span class="font-bold">Sub-Total Base Imponible:</span> <span>${fUSD(totales.subtotalBase)}</span></div>
                        <div class="flex justify-between"><span class="font-bold">I.V.A (16%):</span> <span>${fUSD(totales.ivaTotal)}</span></div>
                        <div class="flex justify-between font-black text-base pt-1 mt-1 border-t border-gray-400"><span>TOTAL FACTURA:</span> <span>${fUSD(totales.totalOperacion)}</span></div>
                        
                        ${cliente.aplicaRetencion ? `
                        <div class="flex justify-between text-red-600 mt-2 font-bold">
                            <span>Retención IVA (75%):</span> <span>-${fUSD(totales.retencionIva)}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="flex justify-between font-black text-xl mt-4 pt-2 border-t-2 border-black">
                        <span>TOTAL A PAGAR:</span> <span>${fUSD(totales.totalPagar)}</span>
                    </div>
                </div>
            </div>
        `;
    }

})();

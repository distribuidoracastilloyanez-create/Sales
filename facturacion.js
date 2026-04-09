// --- Módulo de Simulación de Facturación Fiscal ---

(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal, _collection, _getDocs, _query, _where, _getDoc, _doc, _orderBy, _limit;

    const PUBLIC_DATA_ID = window.AppConfig.PUBLIC_DATA_ID;
    
    let _clientesCache = [];
    let _tasasCache = {};
    let _ventasEncontradas = [];
    let _clienteSeleccionado = null;
    let _ventaParaFacturar = null;

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
        _orderBy = dependencies.orderBy;
        _limit = dependencies.limit;

        console.log("Módulo Facturación Inicializado (Fix html2canvas).");
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

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 p-5 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
                        <div class="relative">
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">1. Seleccionar Cliente:</label>
                            <input type="text" id="facClientSearch" placeholder="Escriba el nombre o RIF..." class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition">
                            <div id="facClientDropdown" class="absolute z-50 w-full bg-white border border-gray-300 rounded-b-md shadow-lg hidden max-h-60 overflow-y-auto mt-1"></div>
                            
                            <div id="facClientSelected" class="hidden mt-2 p-2 bg-blue-100 text-blue-800 font-bold rounded flex justify-between items-center border border-blue-200 shadow-sm">
                                <span id="facClientName"></span>
                                <button id="facClientClear" class="text-red-500 hover:text-red-700 text-xl leading-none font-black px-2">&times;</button>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">2. Seleccionar Venta:</label>
                            <select id="facSelectVenta" class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm disabled:bg-gray-200 disabled:text-gray-500 transition cursor-pointer" disabled>
                                <option value="">Primero seleccione un cliente...</option>
                            </select>
                        </div>
                    </div>

                    <div id="facPanelTasa" class="hidden flex-col bg-indigo-50 border border-indigo-200 rounded-lg p-5 shadow-sm mt-2">
                        <h3 class="font-bold text-indigo-900 border-b border-indigo-200 pb-2 mb-4">3. Datos de Emisión</h3>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label class="block text-xs font-bold text-indigo-800 mb-1 uppercase tracking-wider">Fecha Tasa BCV:</label>
                                <input type="date" id="facFechaTasa" value="${today}" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-indigo-800 mb-1 uppercase tracking-wider">Valor Tasa (Bs):</label>
                                <input type="number" id="facValorTasa" step="0.0001" placeholder="Ej: 36.50" class="w-full border border-indigo-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-900">
                            </div>
                            <div>
                                <button id="btnGenerarFactura" class="w-full bg-green-600 text-white py-2.5 rounded-md shadow hover:bg-green-700 font-bold transition text-sm flex items-center justify-center gap-2">
                                    <span>📄</span> Generar Factura
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="facEmptyState" class="flex-grow flex items-center justify-center text-gray-400 font-medium border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 mt-4">
                        Seleccione un cliente para cargar su historial de ventas.
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnVolverFacturacion').addEventListener('click', _showMainMenu);
        
        const searchInput = document.getElementById('facClientSearch');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = _clientesCache.filter(c => 
                (c.nombreComercial || '').toLowerCase().includes(term) || 
                (c.rif || '').toLowerCase().includes(term)
            ).slice(0, 15);
            renderClientDropdown(filtered);
        });

        document.getElementById('facClientClear').addEventListener('click', () => {
            _clienteSeleccionado = null;
            _ventaParaFacturar = null;
            
            // Resetear UI
            document.getElementById('facClientSelected').classList.add('hidden');
            document.getElementById('facClientSearch').classList.remove('hidden');
            document.getElementById('facClientSearch').value = '';
            
            const selectVenta = document.getElementById('facSelectVenta');
            selectVenta.innerHTML = '<option value="">Primero seleccione un cliente...</option>';
            selectVenta.disabled = true;
            
            document.getElementById('facPanelTasa').classList.add('hidden');
            document.getElementById('facEmptyState').classList.remove('hidden');
        });

        // Al cambiar el desplegable de ventas, mostrar panel de tasa
        document.getElementById('facSelectVenta').addEventListener('change', (e) => {
            if (e.target.value !== "") {
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
            div.className = 'p-3 border-b hover:bg-blue-50 cursor-pointer text-sm text-gray-800 transition';
            const badge = c.aplicaRetencion ? `<span class="ml-2 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Aplica Retención</span>` : '';
            div.innerHTML = `<span class="font-bold">${c.nombreComercial}</span> <span class="text-xs text-gray-500 ml-1">(${c.rif || 'Sin RIF'})</span> ${badge}`;
            
            div.onclick = () => {
                _clienteSeleccionado = c;
                document.getElementById('facClientSearch').classList.add('hidden');
                document.getElementById('facClientDropdown').classList.add('hidden');
                const selDiv = document.getElementById('facClientSelected');
                selDiv.classList.remove('hidden');
                document.getElementById('facClientName').innerHTML = `${c.nombreComercial} ${badge}`;
                
                // Activar búsqueda de ventas
                cargarVentasCliente(c);
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

    async function cargarVentasCliente(cliente) {
        const selectVenta = document.getElementById('facSelectVenta');
        const emptyState = document.getElementById('facEmptyState');
        
        // Estado de Carga
        selectVenta.innerHTML = '<option value="">Buscando historial de ventas...</option>';
        selectVenta.disabled = true;
        document.getElementById('facPanelTasa').classList.add('hidden');
        emptyState.innerHTML = '<p class="animate-pulse">Consultando base de datos...</p>';
        emptyState.classList.remove('hidden');

        try {
            // Obtenemos todos los vendedores para buscar las ventas de este cliente en todas las rutas
            const usersSnap = await _getDocs(_collection(_db, "users"));
            const userIds = usersSnap.docs.map(d => d.id);
            
            _ventasEncontradas = [];

            for (const uid of userIds) {
                try {
                    // 1. Buscar en Ventas Activas del día
                    const vActivasRef = _collection(_db, `artifacts/${_appId}/users/${uid}/ventas`);
                    const qActivas = _query(vActivasRef, _where("clienteId", "==", cliente.id));
                    const snapActivas = await _getDocs(qActivas);
                    
                    snapActivas.docs.forEach(d => {
                        const v = d.data();
                        const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                        _ventasEncontradas.push({ id: d.id, origen: 'Activa (Hoy)', ...v, fechaObj: f });
                    });

                    // 2. Buscar en Cierres Pasados
                    const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const qCierres = _query(cierresRef, _orderBy("fecha", "desc"), _limit(150)); 
                    const snapCierres = await _getDocs(qCierres);

                    snapCierres.docs.forEach(docCierre => {
                        const cierre = docCierre.data();
                        (cierre.ventas || []).forEach(v => {
                            if (v.clienteId === cliente.id) {
                                const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha || cierre.fecha);
                                _ventasEncontradas.push({ id: docCierre.id + '-' + Math.random().toString(36).substr(2,5), origen: 'Cierre Histórico', ...v, fechaObj: f });
                            }
                        });
                    });

                } catch (e) { /* Ignorar errores de permisos */ }
            }

            if (_ventasEncontradas.length === 0) {
                selectVenta.innerHTML = '<option value="">El cliente no tiene ventas registradas.</option>';
                emptyState.innerHTML = 'El cliente seleccionado no posee historial de compras.';
                return;
            }

            // Ordenar de MÁS RECIENTE a MÁS ANTIGUA
            _ventasEncontradas.sort((a,b) => b.fechaObj - a.fechaObj);

            // Poblar el select
            selectVenta.innerHTML = '<option value="">-- Despliegue para seleccionar una venta --</option>';
            _ventasEncontradas.forEach((v, index) => {
                const fechaFormat = v.fechaObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const horaFormat = v.fechaObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `📅 ${fechaFormat} a las ${horaFormat} | Total: $${v.total.toFixed(2)}  (${v.origen})`;
                selectVenta.appendChild(option);
            });

            selectVenta.disabled = false;
            emptyState.innerHTML = '← Seleccione una venta en el menú desplegable superior.';

        } catch (error) {
            console.error("Error al cargar historial de ventas:", error);
            selectVenta.innerHTML = '<option value="">Error al cargar historial</option>';
            emptyState.innerHTML = 'Ocurrió un error al consultar la base de datos.';
        }
    }

    function generarFacturaFiscal() {
        const tasaBs = parseFloat(document.getElementById('facValorTasa').value);
        if (isNaN(tasaBs) || tasaBs <= 0) {
            _showModal('Error', 'Debe ingresar una Tasa BCV válida mayor a 0 para generar la factura.');
            document.getElementById('facValorTasa').focus();
            return;
        }

        if (!_ventaParaFacturar) {
            _showModal('Error', 'Debe seleccionar una venta de la lista.');
            return;
        }

        _showModal('Procesando', 'Generando diseño de la factura...', null, '', null, false);

        // LÓGICA DE CÁLCULO FISCAL
        let subtotalBase = 0;
        let subtotalExento = 0;
        let ivaTotal = 0;
        
        const productosProcesados = [];

        (_ventaParaFacturar.productos || []).forEach(p => {
            const pCj = p.precios?.cj || 0;
            const pPaq = p.precios?.paq || 0;
            const pUnd = p.precios?.und || p.precioPorUnidad || 0;
            
            const qCj = p.cantidadVendida?.cj || 0;
            const qPaq = p.cantidadVendida?.paq || 0;
            const qUnd = p.cantidadVendida?.und || 0;

            const totalLinea = (qCj * pCj) + (qPaq * pPaq) + (qUnd * pUnd);
            
            let cantDisplay = '';
            if (qCj > 0) cantDisplay += `${qCj} Cj `;
            if (qPaq > 0) cantDisplay += `${qPaq} Pq `;
            if (qUnd > 0) cantDisplay += `${qUnd} Un`;
            if (cantDisplay === '') cantDisplay = `${p.totalUnidadesVendidas} Un`;

            let esExento = !(p.iva > 0);
            let precioUnitarioBaseUSD = 0;
            let totalLineaBaseUSD = 0;

            if (esExento) {
                subtotalExento += totalLinea;
                precioUnitarioBaseUSD = totalLinea / (p.totalUnidadesVendidas || 1);
                totalLineaBaseUSD = totalLinea;
            } else {
                totalLineaBaseUSD = totalLinea / 1.16;
                const ivaLinea = totalLinea - totalLineaBaseUSD;
                subtotalBase += totalLineaBaseUSD;
                ivaTotal += ivaLinea;
                precioUnitarioBaseUSD = totalLineaBaseUSD / (p.totalUnidadesVendidas || 1);
            }

            const precioUnitarioBaseBs = precioUnitarioBaseUSD * tasaBs;
            const totalLineaBaseBs = totalLineaBaseUSD * tasaBs;

            productosProcesados.push({
                cantidad: cantDisplay.trim(),
                descripcion: p.presentacion,
                precioUnitarioUSD: precioUnitarioBaseUSD,
                precioUnitarioBs: precioUnitarioBaseBs,
                totalBs: totalLineaBaseBs,
                exento: esExento
            });
        });

        // Totales Finales Matemáticos
        const totalOperacion = subtotalBase + subtotalExento + ivaTotal;
        let retencionIva = 0;

        if (_clienteSeleccionado.aplicaRetencion) {
            retencionIva = ivaTotal * 0.75;
        }

        const totalPagar = totalOperacion - retencionIva;

        // Conversiones a Bolívares de los totales
        const totalBaseBs = subtotalBase * tasaBs;
        const totalExentoBs = subtotalExento * tasaBs;
        const totalIvaBs = ivaTotal * tasaBs;
        const totalOperacionBs = totalOperacion * tasaBs;
        const retencionBs = retencionIva * tasaBs;
        const totalPagarBs = totalPagar * tasaBs;

        // RENDERIZAR PLANTILLA
        const facturaHtml = crearPlantillaFactura(
            _clienteSeleccionado, 
            document.getElementById('facFechaTasa').value, 
            tasaBs, 
            productosProcesados,
            { totalOperacion, totalPagar }, 
            { totalBaseBs, totalExentoBs, totalIvaBs, totalOperacionBs, retencionBs, totalPagarBs }
        );

        const modalWrapper = `
            <div class="flex flex-col items-center max-h-[75vh] overflow-y-auto bg-gray-200 p-2 sm:p-4 rounded-lg">
                <div id="captureFacturaArea" class="bg-white p-6 sm:p-8 w-full max-w-4xl shadow-lg border border-gray-300 relative" style="font-family: 'Courier New', Courier, monospace;">
                    ${facturaHtml}
                </div>
            </div>
            <div class="mt-4 flex flex-col sm:flex-row gap-2">
                <button id="btnCompartirFactura" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow transition flex justify-center items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Compartir
                </button>
                <button id="btnDescargarFactura" class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow transition flex justify-center items-center gap-2">
                    <span>⬇️</span> Descargar
                </button>
            </div>
        `;

        _showModal('Factura Fiscal Simulada', modalWrapper, null, 'Cerrar');

        setTimeout(() => {
            const handleImageGeneration = async (action, btnElement) => {
                const element = document.getElementById('captureFacturaArea');
                
                // Efecto visual en el botón sin destruir el DOM del modal
                const originalText = btnElement.innerHTML;
                btnElement.innerHTML = '<span class="animate-pulse">Generando...</span>';
                btnElement.disabled = true;

                try {
                    await new Promise(r => setTimeout(r, 50)); 
                    
                    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                    
                    if (action === 'share' && navigator.share) {
                        const file = new File([blob], `Factura_${_clienteSeleccionado.nombreComercial.replace(/\\s+/g, '_')}.png`, { type: 'image/png' });
                        await navigator.share({ files: [file], title: 'Factura Simulada' });
                    } else {
                        const dataUrl = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = dataUrl;
                        link.download = `Factura_${_clienteSeleccionado.nombreComercial.replace(/\\s+/g, '_')}.png`;
                        link.click();
                    }
                    
                    btnElement.innerHTML = originalText;
                    btnElement.disabled = false;
                    
                } catch (err) {
                    console.error(err);
                    btnElement.innerHTML = originalText;
                    btnElement.disabled = false;
                    _showModal('Error', 'Fallo al procesar la imagen de la factura.');
                }
            };

            const btnDesc = document.getElementById('btnDescargarFactura');
            const btnComp = document.getElementById('btnCompartirFactura');

            btnDesc.onclick = () => handleImageGeneration('download', btnDesc);
            btnComp.onclick = () => handleImageGeneration('share', btnComp);

        }, 300);
    }

    function crearPlantillaFactura(cliente, fechaEmisionISO, tasaBs, productos, totalesUSD, totalesBs) {
        const fUSD = (n) => `${n.toFixed(2)}`;
        const fBS = (n) => `${n.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        
        const [year, month, day] = fechaEmisionISO.split('-');
        const fechaStr = `${day}/${month}/${year}`;

        let filasProd = '';
        productos.forEach(p => {
            filasProd += `
                <tr class="text-xs sm:text-sm">
                    <td class="py-1.5 border-b border-dashed border-gray-300 text-center font-semibold">${p.cantidad}</td>
                    <td class="py-1.5 border-b border-dashed border-gray-300">${p.descripcion} <span class="font-bold">${p.exento ? '(E)' : ''}</span></td>
                    <td class="py-1.5 border-b border-dashed border-gray-300 text-right">${fUSD(p.precioUnitarioUSD)}</td>
                    <td class="py-1.5 border-b border-dashed border-gray-300 text-right">${fBS(p.precioUnitarioBs)}</td>
                    <td class="py-1.5 border-b border-dashed border-gray-300 text-right font-semibold">${fBS(p.totalBs)}</td>
                </tr>
            `;
        });

        const numFactura = Math.floor(100000 + Math.random() * 900000);

        return `
            <div class="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                <span class="text-8xl font-black transform -rotate-45 tracking-widest">SIMULADOR</span>
            </div>

            <div class="relative z-10">
                <div class="text-center mb-6">
                    <h1 class="text-xl sm:text-2xl font-bold font-sans tracking-wide">DISTRIBUIDORA CASTILLO YAÑEZ C.A.</h1>
                    <p class="text-sm font-semibold">RIF: J-40214875-5</p>
                    <p class="text-[10px] mt-1 text-gray-500 font-bold tracking-widest">*** DOCUMENTO SIMULADO SIN VALIDEZ FISCAL ***</p>
                </div>

                <div class="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
                    <div>
                        <p class="text-sm"><strong>Lugar y Fecha:</strong> San Cristóbal, ${fechaStr}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-black text-red-600 tracking-wider">FACTURA</p>
                        <p class="text-sm"><strong>Nro Control:</strong> 00-${numFactura}</p>
                    </div>
                </div>

                <div class="mb-6 space-y-1 text-xs sm:text-sm bg-gray-50 p-3 border border-gray-200 rounded">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <p><strong>Razón Social:</strong> ${cliente.nombreComercial}</p>
                        <p><strong>RIF/Cédula:</strong> ${cliente.rif || 'N/A'}</p>
                    </div>
                    <p><strong>Dirección:</strong> ${cliente.direccion || 'N/A'}</p>
                    <p><strong>Teléfono:</strong> ${cliente.telefono || 'N/A'}</p>
                </div>

                <table class="w-full mb-6">
                    <thead>
                        <tr class="border-y-2 border-black text-left text-xs sm:text-sm">
                            <th class="py-2 w-24 text-center">CANT.</th>
                            <th class="py-2">DESCRIPCIÓN</th>
                            <th class="py-2 w-24 text-right">P. UNIT ($)</th>
                            <th class="py-2 w-28 text-right">P. UNIT (Bs)</th>
                            <th class="py-2 w-32 text-right">TOTAL (Bs)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasProd}
                    </tbody>
                </table>

                <div class="flex flex-col items-end mt-8">
                    <div class="w-full sm:w-2/3 md:w-1/2 text-xs sm:text-sm">
                        
                        <div class="flex justify-between mb-4 border-b border-gray-300 pb-1">
                            <span class="font-bold text-gray-700 uppercase tracking-wider">Tasa BCV Aplicada:</span> 
                            <span class="font-bold">Bs ${fBS(tasaBs)}</span>
                        </div>

                        <div class="space-y-1.5">
                            <div class="flex justify-between">
                                <span class="font-bold text-gray-600">Base Imponible:</span> 
                                <span>Bs ${fBS(totalesBs.totalBaseBs)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-bold text-gray-600">Monto Exento:</span> 
                                <span>Bs ${fBS(totalesBs.totalExentoBs)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-bold text-gray-600">I.V.A (16%):</span> 
                                <span>Bs ${fBS(totalesBs.totalIvaBs)}</span>
                            </div>
                            
                            <div class="flex justify-between font-black text-sm sm:text-base pt-1.5 mt-1.5 border-t border-gray-400">
                                <span>TOTAL FACTURA:</span> 
                                <span>Bs ${fBS(totalesBs.totalOperacionBs)}</span>
                            </div>
                            
                            ${cliente.aplicaRetencion ? `
                            <div class="flex justify-between text-red-600 mt-2 font-bold bg-red-50 p-1 px-2 rounded">
                                <span>Retención IVA (75%):</span> 
                                <span>-Bs ${fBS(totalesBs.retencionBs)}</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <div class="flex justify-between font-black text-lg sm:text-xl mt-4 pt-2 border-t-2 border-black">
                            <span>TOTAL A PAGAR:</span> 
                            <span class="text-blue-800">Bs ${fBS(totalesBs.totalPagarBs)}</span>
                        </div>
                        
                        <div class="flex justify-end mt-1 text-gray-500 font-bold text-xs">
                            Equivalente a: $${fUSD(totalesUSD.totalPagar)} USD
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

})();

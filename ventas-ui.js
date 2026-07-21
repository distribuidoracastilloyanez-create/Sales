(function() {
    // Helper interno para formateo de moneda en la vista
    function _formatCurrency(value, currency, tasaCOP, tasaBs) {
        if (isNaN(value)) value = 0;
        if (currency === 'COP' && tasaCOP > 0) {
            return `COP ${(Math.ceil((value * tasaCOP) / 100) * 100).toLocaleString('es-CO')}`;
        }
        if (currency === 'Bs' && tasaBs > 0) {
            return `Bs.S ${(value * tasaBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return `$${value.toFixed(2)}`;
    }

    function _toTitleCase(str) {
        if (!str) return '';
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    window.ventasUI = {
        /**
         * Vista Principal: Menú de Ventas
         */
        getMainViewTemplate: () => `
            <div class="p-4 pt-8"> 
                <div class="container mx-auto"> 
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Ventas</h1>
                        <div class="space-y-4">
                            <button id="nuevaVentaBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Nueva Venta / Consignación</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                    </div> 
                </div> 
            </div>
        `,

        /**
         * Vista: Formulario de Nueva Venta
         * @param {Array} tiposVacio - Array de strings con los tipos de vacío disponibles
         */
        getNewSaleTemplate: (tiposVacio) => `
            <div class="p-2 w-full"> 
                <div class="bg-white/90 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl flex flex-col h-full" style="min-height: calc(100vh - 1rem);">
                    <div id="venta-header-section" class="mb-2">
                        <div class="flex justify-between items-center mb-2"> 
                            <h2 class="text-lg font-bold">Nueva Operación</h2> 
                            <button id="backToVentasBtn" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded-lg shadow-md hover:bg-gray-500">Volver</button> 
                        </div>
                        <div id="client-search-container"> 
                            <label for="clienteSearch" class="block font-medium mb-2">Cliente:</label> 
                            <div class="relative">
                                <input type="text" id="clienteSearch" placeholder="Buscar..." class="w-full px-4 py-2 border rounded-lg">
                                <div id="clienteDropdown" class="autocomplete-list hidden"></div>
                            </div> 
                        </div>
                        <div id="client-display-container" class="hidden flex-wrap items-center justify-between gap-2"> 
                            <p class="flex-grow text-sm">
                                <span class="font-medium">Cliente:</span> 
                                <span id="selected-client-name" class="font-bold"></span>
                            </p> 
                            
                            <div class="w-full sm:w-auto mt-2 sm:mt-0">
                                <label for="tipoOperacionSelect" class="text-xs font-bold text-gray-600 block mb-1">Tipo de Documento:</label>
                                <select id="tipoOperacionSelect" class="w-full sm:w-auto px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800">
                                    <option value="venta">🛒 Venta Regular (Factura/Nota)</option>
                                    <option value="consignacion">📦 Dejada a Consignación</option>
                                </select>
                            </div>

                            <div id="tasasContainer" class="flex flex-row items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0"> 
                                <div class="flex items-center space-x-1"> 
                                    <label for="tasaCopInput" class="text-xs font-bold text-gray-600">COP:</label> 
                                    <input type="number" id="tasaCopInput" placeholder="4000" class="w-16 px-1 py-1 text-sm border rounded-lg"> 
                                </div> 
                                <div class="flex items-center space-x-1"> 
                                    <label for="tasaBsInput" class="text-xs font-bold text-gray-600">Bs.:</label> 
                                    <input type="number" id="tasaBsInput" placeholder="36.5" class="w-16 px-1 py-1 text-sm border rounded-lg"> 
                                </div> 
                            </div> 
                        </div>
                    </div>
                    <div id="vacios-devueltos-section" class="mb-2 hidden"> 
                        <h3 class="text-sm font-semibold text-cyan-700 mb-1">Vacíos Devueltos:</h3> 
                        <div class="grid grid-cols-3 gap-2"> 
                            ${tiposVacio.map(tipo => `
                                <div> 
                                    <label for="vacios-${tipo.replace(/\s+/g, '-')}" class="text-xs mb-1 block">${tipo}</label> 
                                    <input type="number" min="0" value="0" id="vacios-${tipo.replace(/\s+/g, '-')}" class="w-16 p-1 text-center border rounded-md" data-tipo-vacio="${tipo}" oninput="window.ventasModule.handleTipoVacioChange(event)"> 
                                </div>
                            `).join('')} 
                        </div> 
                    </div>
                    <div id="inventarioTableContainer" class="hidden animate-fade-in flex-grow flex flex-col overflow-hidden">
                        <div id="rubro-filter-container" class="mb-2"> 
                            <label for="rubroFilter" class="text-xs font-medium">Filtrar Rubro:</label> 
                            <select id="rubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select> 
                        </div>
                        <div class="overflow-auto flex-grow rounded-lg shadow"> 
                            <table class="min-w-full bg-white text-sm">
                                <thead class="bg-gray-200 sticky top-0">
                                    <tr class="uppercase text-xs">
                                        <th class="py-2 px-2 text-center w-24">Cant</th>
                                        <th class="py-2 px-2 text-left">Producto</th>
                                        <th class="py-2 px-2 text-left price-toggle" onclick="window.ventasModule.toggleMoneda()">Precio</th>
                                        <th class="py-2 px-1 text-center">Stock</th>
                                    </tr>
                                </thead>
                                <tbody id="inventarioTableBody" class="text-gray-600"></tbody>
                            </table> 
                        </div>
                    </div>
                    <div id="venta-footer-section" class="mt-2 flex items-center justify-between hidden"> 
                        <span id="ventaTotal" class="text-base font-bold">$0.00</span> 
                        <button id="generarTicketBtn" class="px-5 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 font-bold transition">Continuar...</button> 
                    </div>
                </div> 
            </div>
        `,

        /**
         * Genera las filas de la tabla de inventario
         */
        getInventoryTableRows: (inventoryList, ventaActualProductos, currentCurrency, tasaCOP, tasaBs, sortKey = 'segmento') => {
            if (inventoryList.length === 0) return `<tr><td colspan="4" class="text-center text-gray-500">No hay productos disponibles.</td></tr>`;
            
            let html = '';
            let lastHeaderKey = null;

            inventoryList.forEach(prod => {
                const curHeaderVal = prod[sortKey] || `Sin ${sortKey}`; 
                if (curHeaderVal !== lastHeaderKey) { 
                    lastHeaderKey = curHeaderVal; 
                    html += `<tr class="bg-gray-100"><td colspan="4" class="py-1 px-2 font-bold sticky top-[calc(theme(height.10))] z-[9]">${lastHeaderKey}</td></tr>`; 
                }

                const vPor = prod.ventaPor || { und: true };
                const vActProd = ventaActualProductos[prod.id] || {};
                const precios = prod.precios || { und: prod.precioPorUnidad || 0 };
                const stockU = prod.cantidadUnidades || 0;

                const createRow = (type, currentQty, maxQty, price, stockText, descText) => {
                    // ACUERDO COMERCIAL: si este precio tiene descuento, se marca de forma
                    // visible (precio anterior tachado + insignia con el porcentaje).
                    const dto = (prod._acDescuento || []).find(d => d.tipo === type);
                    const badge = dto
                        ? ` <span class="text-[9px] bg-amber-500 text-white px-1 py-0.5 rounded font-bold whitespace-nowrap align-middle">-${dto.porcentaje}%</span>`
                        : '';
                    const tachado = dto
                        ? `<span class="block text-[10px] text-gray-400 line-through font-normal">${_formatCurrency(dto.original, currentCurrency, tasaCOP, tasaBs)}</span>`
                        : '';
                    return `
                    <tr class="border-b hover:bg-gray-50${dto ? ' bg-amber-50/60' : ''}">
                        <td class="py-2 px-2 text-center align-middle"> 
                            <input type="number" min="0" max="${maxQty}" value="${currentQty}" 
                                   class="w-16 p-1 text-center border rounded-md font-bold text-gray-800 focus:ring-2 focus:ring-blue-500" 
                                   data-product-id="${prod.id}" 
                                   data-tipo-venta="${type}" 
                                   oninput="window.ventasModule.handleQuantityChange(event)"> 
                        </td> 
                        <td class="py-2 px-2 text-left align-middle font-medium text-gray-700"> 
                            ${descText} <span class="text-xs text-gray-500">${prod.marca || 'S/M'}</span>${badge}
                        </td> 
                        <td class="py-2 px-2 text-left align-middle font-bold ${dto ? 'text-amber-700' : 'text-gray-900'} price-toggle" onclick="window.ventasModule.toggleMoneda()">
                            ${tachado}${_formatCurrency(price, currentCurrency, tasaCOP, tasaBs)}
                        </td> 
                        <td class="py-2 px-1 text-center align-middle text-xs font-semibold text-gray-500">${stockText}</td>
                    </tr>`;
                };

                if (vPor.cj) { 
                    const uCj = prod.unidadesPorCaja || 1; 
                    const maxCj = Math.floor(stockU / uCj); 
                    html += createRow('cj', vActProd.cantCj || 0, maxCj, precios.cj || 0, `${maxCj} Cj`, `${prod.presentacion} (Cj/${uCj} und)`); 
                }
                if (vPor.paq) { 
                    const uPaq = prod.unidadesPorPaquete || 1; 
                    const maxPaq = Math.floor(stockU / uPaq); 
                    html += createRow('paq', vActProd.cantPaq || 0, maxPaq, precios.paq || 0, `${maxPaq} Paq`, `${prod.presentacion} (Paq/${uPaq} und)`); 
                }
                if (vPor.und) { 
                    html += createRow('und', vActProd.cantUnd || 0, stockU, precios.und || 0, `${stockU} Und`, `${prod.presentacion} (Und)`); 
                }
            });
            return html;
        },

        /**
         * Genera HTML del Ticket (Factura/Nota de Entrega)
         * @param {string} tipoOperacion - 'venta' o 'consignacion'
         */
        getTicketHTML: (venta, productosVendidos, vaciosDevueltos, tipo = 'ticket', tipoOperacion = 'venta') => {
            const fecha = venta.fecha ? (venta.fecha.toDate ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date(venta.fecha).toLocaleDateString('es-ES')) : new Date().toLocaleDateString('es-ES');
            const clienteNombre = venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre;
            const clienteNombrePersonal = (venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '';
            
            // LÓGICA DE TÍTULO PARA CONSIGNACIÓN
            let titulo = tipo === 'factura' ? 'FACTURA FISCAL' : 'NOTA DE ENTREGA';
            if (tipoOperacion === 'consignacion' || venta.tipoOperacion === 'consignacion') {
                titulo = 'NOTA DE CONSIGNACIÓN';
            }
            
            let total = 0;
            let productosHTML = '';
            
            const entregadosPorTipo = {};

            productosVendidos.forEach(p => {
                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                const cant = p.cantidadVendida || { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 };
                
                let exentoLabel = (p.iva === 0 || p.iva === "0") ? " (E)" : "";
                let desc = `${p.segmento || ''} ${p.marca || ''} ${p.presentacion}${exentoLabel}`;
                let qtyText = '', priceText = '', subtotal = 0;

                if (p.manejaVacios && p.tipoVacio && cant.cj > 0) {
                    entregadosPorTipo[p.tipoVacio] = (entregadosPorTipo[p.tipoVacio] || 0) + cant.cj;
                }

                if (cant.cj > 0) {
                    subtotal = (precios.cj || 0) * cant.cj; qtyText = `${cant.cj} CJ`; priceText = `$${(precios.cj || 0).toFixed(2)}`;
                } else if (cant.paq > 0) {
                    subtotal = (precios.paq || 0) * cant.paq; qtyText = `${cant.paq} PAQ`; priceText = `$${(precios.paq || 0).toFixed(2)}`;
                } else if (cant.und > 0) {
                    subtotal = (precios.und || 0) * cant.und; qtyText = `${cant.und} UND`; priceText = `$${(precios.und || 0).toFixed(2)}`;
                } else { return; }
                
                total += subtotal;

                productosHTML += `
                     <tr class="align-top">
                        <td class="py-2 pr-2 text-left" style="width: 55%;"><div style="line-height: 1.2;">${desc}</div></td>
                        <td class="py-2 px-2 text-center" style="width: 15%;">${qtyText}</td>
                        <td class="py-2 px-2 text-right" style="width: 15%;">${priceText}</td>
                        <td class="py-2 pl-2 text-right font-bold" style="width: 15%;">$${subtotal.toFixed(2)}</td>
                    </tr>`;
            });

            let vaciosHTML = '';
            const tiposConDev = Object.entries(vaciosDevueltos || {}).filter(([t, c]) => c > 0);
            if (tiposConDev.length > 0) {
                vaciosHTML += `<div class="text-3xl mt-6 border-t border-black border-dashed pt-4"> <p>VACÍOS DEVUELTOS:</p> <table class="w-full text-3xl mt-2"><tbody>`;
                tiposConDev.forEach(([t, c]) => {
                    vaciosHTML += `<tr><td class="py-1 pr-2 text-left" style="width: 70%;">${t}</td><td class="py-1 pl-2 text-right" style="width: 30%;">${c} CJ</td></tr>`;
                });
                vaciosHTML += `</tbody></table></div>`;
            }

            let prestadosHTML = '';
            const prestados = [];
            Object.keys(entregadosPorTipo).forEach(t => {
                const ent = entregadosPorTipo[t] || 0;
                const dev = (vaciosDevueltos || {})[t] || 0;
                const dif = ent - dev;
                if (dif > 0) { 
                    prestados.push({ tipo: t, cant: dif });
                }
            });

            if (prestados.length > 0) {
                prestadosHTML += `<div class="text-3xl mt-4 border-t border-black border-dashed pt-4"> <p>VACÍOS PRESTADOS:</p> <table class="w-full text-3xl mt-2"><tbody>`;
                prestados.forEach(p => {
                    prestadosHTML += `<tr><td class="py-1 pr-2 text-left" style="width: 70%;">${p.tipo}</td><td class="py-1 pl-2 text-right" style="width: 30%;">${p.cant} CJ</td></tr>`;
                });
                prestadosHTML += `</tbody></table></div>`;
            }

            // AVISO LEGAL PARA CONSIGNACIÓN
            let notaConsignacionHTML = '';
            if (tipoOperacion === 'consignacion' || venta.tipoOperacion === 'consignacion') {
                notaConsignacionHTML = `
                    <div class="mt-6 border-2 border-black p-4 text-center">
                        <p class="text-xl font-bold uppercase mb-2">Aviso de Consignación</p>
                        <p class="text-lg leading-tight">La mercancía detallada en este recibo se entrega a modo de consignación y sigue siendo propiedad exclusiva de Distribuidora Castillo Yañez hasta su liquidación total.</p>
                    </div>
                `;
            }

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
                                <th class="pb-2 text-left border-b border-black">DESCRIPCION</th>
                                <th class="pb-2 text-center border-b border-black">CANT</th>
                                <th class="pb-2 text-right border-b border-black">PRECIO</th>
                                <th class="pb-2 text-right border-b border-black">SUBTOTAL</th>
                            </tr>
                        </thead>
                        <tbody>${productosHTML}</tbody>
                    </table>
                    <div class="text-right text-3xl mt-4 pr-2">
                        <p class="border-t border-black pt-2 font-bold">TOTAL: $${total.toFixed(2)}</p>
                    </div>
                    ${vaciosHTML}
                    ${prestadosHTML}
                    
                    ${notaConsignacionHTML}

                    <div class="text-center mt-16">
                        <p class="border-t border-black w-96 mx-auto"></p>
                        <p class="mt-4 text-3xl">${clienteNombrePersonal}</p>
                    </div>
                    <hr class="border-dashed border-black mt-6">
                </div>`;
        },

        /**
         * Genera String de Texto Plano del Ticket (para clipboard/WhatsApp)
         * @param {string} tipoOperacion - 'venta' o 'consignacion'
         */
        getTicketRawText: (venta, productosVendidos, vaciosDevueltos, tipoOperacion = 'venta') => {
            const fecha = venta.fecha ? (venta.fecha.toDate ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date(venta.fecha).toLocaleDateString('es-ES')) : new Date().toLocaleDateString('es-ES');
            const clienteNombre = _toTitleCase(venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre);
            const clienteNombrePersonal = _toTitleCase((venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '');
            const LINE_WIDTH = 48; 
            let total = 0; 
            let ticket = '';
            
            // LÓGICA DE TÍTULO PARA CONSIGNACIÓN EN TEXTO PLANO
            let titulo = 'Nota de Entrega';
            if (tipoOperacion === 'consignacion' || venta.tipoOperacion === 'consignacion') {
                titulo = 'NOTA DE CONSIGNACION';
            }
            
            const center = (text) => text.padStart(Math.floor((LINE_WIDTH - text.length) / 2) + text.length, ' ').padEnd(LINE_WIDTH, ' ');
            const wordWrap = (text, maxWidth) => { 
                const lines = []; if (!text) return lines; 
                let currentLine = ''; const words = text.split(' '); 
                for (const word of words) { 
                    if ((currentLine + ' ' + word).trim().length > maxWidth) { 
                        if(currentLine.length > 0) lines.push(currentLine.trim()); currentLine = word; 
                    } else { currentLine = (currentLine + ' ' + word).trim(); } 
                } 
                if (currentLine) lines.push(currentLine.trim()); 
                return lines; 
            };

            ticket += center('Distribuidora Castillo Yanez') + '\n';
            ticket += center(`*** ${titulo} ***`) + '\n';
            ticket += center('(no valido como factura fiscal)') + '\n\n';

            wordWrap(`Cliente: ${clienteNombre}`, LINE_WIDTH).forEach(line => { ticket += line + '\n'; });
            ticket += `Fecha: ${fecha}\n` + '-'.repeat(LINE_WIDTH) + '\n';

            const entregadosPorTipo = {};

            if (productosVendidos.length > 0) {
                ticket += 'Producto'.padEnd(26) + 'Cant'.padStart(6) + 'Precio'.padStart(8) + 'Subt'.padStart(8) + '\n';
                ticket += '-'.repeat(LINE_WIDTH) + '\n';
                productosVendidos.forEach(p => {
                    const precios = p.precios || { und: p.precioPorUnidad || 0 };
                    const cant = p.cantidadVendida || { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 };
                    
                    let exentoLabel = (p.iva === 0 || p.iva === "0") ? " (E)" : "";

                    let desc = _toTitleCase(`${p.segmento || ''} ${p.marca || ''} ${p.presentacion}${exentoLabel}`);
                    let qtyText = '', priceText = '', subtotal = 0;

                    if (p.manejaVacios && p.tipoVacio && cant.cj > 0) {
                        entregadosPorTipo[p.tipoVacio] = (entregadosPorTipo[p.tipoVacio] || 0) + cant.cj;
                    }

                    // ACUERDO COMERCIAL: si el precio lleva descuento, se indica en el ticket
                    const dtoDe = (tipo) => (p.descuentoAC || []).find(d => d.tipo === tipo);
                    let dtoAplicado = null;

                    if (cant.cj > 0) {
                        subtotal = (precios.cj || 0) * cant.cj; qtyText = `${cant.cj} CJ`; priceText = `$${(precios.cj || 0).toFixed(2)}`;
                        dtoAplicado = dtoDe('cj');
                    } else if (cant.paq > 0) {
                        subtotal = (precios.paq || 0) * cant.paq; qtyText = `${cant.paq} PQ`; priceText = `$${(precios.paq || 0).toFixed(2)}`;
                        dtoAplicado = dtoDe('paq');
                    } else if (cant.und > 0) {
                        subtotal = (precios.und || 0) * cant.und; qtyText = `${cant.und} UN`; priceText = `$${(precios.und || 0).toFixed(2)}`;
                        dtoAplicado = dtoDe('und');
                    } else { return; }
                    if (dtoAplicado) desc += ` (-${dtoAplicado.porcentaje}%)`;
                    total += subtotal;

                    const wrappedDesc = wordWrap(desc, 25); 
                    wrappedDesc.forEach((line, index) => {
                        const qtyStr = index === wrappedDesc.length - 1 ? qtyText : '';
                        const priceStr = index === wrappedDesc.length - 1 ? priceText : '';
                        const subtStr = index === wrappedDesc.length - 1 ? `$${subtotal.toFixed(2)}` : '';
                        ticket += line.padEnd(26) + qtyStr.padStart(6) + priceStr.padStart(8) + subtStr.padStart(8) + '\n';
                    });
                });
            }

            const tiposConDev = Object.entries(vaciosDevueltos || {}).filter(([t, c]) => c > 0);
            if (tiposConDev.length > 0) {
                ticket += '-'.repeat(LINE_WIDTH) + '\n' + center('VACIOS DEVUELTOS') + '\n';
                tiposConDev.forEach(([t, c]) => {
                    ticket += t.padEnd(LINE_WIDTH - `${c} CJ`.length) + `${c} CJ` + '\n';
                });
            }

            const prestados = [];
            Object.keys(entregadosPorTipo).forEach(t => {
                const ent = entregadosPorTipo[t] || 0;
                const dev = (vaciosDevueltos || {})[t] || 0;
                const dif = ent - dev;
                if (dif > 0) {
                    prestados.push({ tipo: t, cant: dif });
                }
            });

            if (prestados.length > 0) {
                ticket += '-'.repeat(LINE_WIDTH) + '\n' + center('VACIOS PRESTADOS') + '\n';
                prestados.forEach(p => {
                    ticket += p.tipo.padEnd(LINE_WIDTH - `${p.cant} CJ`.length) + `${p.cant} CJ` + '\n';
                });
            }

            ticket += '-'.repeat(LINE_WIDTH) + '\n';
            ticket += `TOTAL: $${total.toFixed(2)}`.padStart(LINE_WIDTH, ' ') + '\n\n';
            
            // AVISO LEGAL EN TEXTO PLANO
            if (tipoOperacion === 'consignacion' || venta.tipoOperacion === 'consignacion') {
                ticket += '-'.repeat(LINE_WIDTH) + '\n';
                wordWrap("La mercancia detallada en este recibo se entrega a modo de consignacion y sigue siendo propiedad exclusiva de Distribuidora Castillo Yanez.", LINE_WIDTH).forEach(line => { ticket += center(line) + '\n'; });
                ticket += '-'.repeat(LINE_WIDTH) + '\n\n\n';
            } else {
                ticket += '\n\n';
            }

            ticket += center('________________________') + '\n';
            ticket += center(clienteNombrePersonal) + '\n';
            ticket += '-'.repeat(LINE_WIDTH) + '\n';
            return ticket;
        },

        /**
         * Vista: Submenú Ventas Totales
         */
        getSalesMenuTemplate: () => `
            <div class="p-4 pt-8"> 
                <div class="container mx-auto"> 
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Ventas Totales</h2>
                        <div class="space-y-4">
                            <button id="ventasActualesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-bold rounded-lg shadow-md hover:bg-teal-600 transition">Listado de Ventas y Consignaciones</button>
                            <button id="cierreVentasBtn" class="w-full px-6 py-3 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 transition">Generar Cierre de Jornada</button>
                        </div>
                        <button id="backToVentasBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button>
                    </div> 
                </div> 
            </div>
        `,

        /**
         * Vista: Submenú Cierre
         */
        getClosingMenuTemplate: () => `
            <div class="p-4 pt-8"> 
                <div class="container mx-auto"> 
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Cierre de Jornada</h2>
                        <p class="text-gray-600 mb-6 text-sm">Este proceso agrupará todas las ventas y consignaciones activas en un solo reporte de cierre.</p>
                        <div class="space-y-4">
                            <button id="verCierreBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-bold rounded-lg shadow-md hover:bg-cyan-600 transition">Ver Vista Previa del Cierre</button>
                            <button id="ejecutarCierreBtn" class="w-full px-6 py-3 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 transition">Ejecutar Cierre Definitivo</button>
                        </div>
                        <button id="backToVentasTotalesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button>
                    </div> 
                </div> 
            </div>
        `,

        /**
         * Vista: Edición de Venta
         */
        getEditSaleTemplate: (venta, tiposVacio) => {
            const isConsignacion = venta.tipoOperacion === 'consignacion';
            
            return `
            <div class="p-2 sm:p-4 w-full"> 
                <div class="bg-white/90 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col h-full border-t-4 border-yellow-500" style="min-height: calc(100vh - 2rem);">
                    <div id="venta-header-section" class="mb-4">
                        <div class="flex justify-between items-center mb-4"> 
                            <h2 class="text-xl font-bold">Editando Registro</h2> 
                            <button id="backToVentasBtn" class="px-4 py-2 bg-gray-400 text-white text-sm rounded-lg shadow-md hover:bg-gray-500 transition">Volver</button> 
                        </div>
                        <div class="p-4 bg-gray-100 rounded-lg border border-gray-200 shadow-sm"> 
                            <p><span class="font-medium">Cliente:</span> <span class="font-bold text-gray-800">${venta.clienteNombre || 'N/A'}</span></p> 
                            <p class="text-sm"><span class="font-medium">Fecha:</span> ${venta.fecha?.toDate ? venta.fecha.toDate().toLocaleString('es-ES') : 'N/A'}</p> 
                            
                            <div class="mt-3">
                                <label for="editTipoOperacion" class="text-xs font-bold text-gray-600 block mb-1">Tipo de Operación Registrada:</label>
                                <select id="editTipoOperacion" class="w-full sm:w-auto px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-yellow-500 outline-none font-bold text-gray-800">
                                    <option value="venta" ${!isConsignacion ? 'selected' : ''}>🛒 Venta Regular</option>
                                    <option value="consignacion" ${isConsignacion ? 'selected' : ''}>📦 Consignación</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div id="vacios-devueltos-section" class="mb-4"> 
                        <h3 class="text-sm font-semibold text-cyan-700 mb-1 border-b border-cyan-100 pb-1">Vacíos Devueltos en esta operación:</h3> 
                        <div class="grid grid-cols-3 gap-2"> 
                            ${tiposVacio.map(t => `
                                <div>
                                    <label for="vacios-${t.replace(/\s+/g,'-')}" class="text-xs mb-1 block font-medium">${t}</label>
                                    <input type="number" min="0" value="${venta.vaciosDevueltosPorTipo ? (venta.vaciosDevueltosPorTipo[t] || 0) : 0}" id="vacios-${t.replace(/\s+/g,'-')}" class="w-16 p-1.5 text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-cyan-500 font-bold text-gray-800" data-tipo-vacio="${t}" oninput="window.ventasModule.handleTipoVacioChange(event)">
                                </div>
                            `).join('')} 
                        </div> 
                    </div>
                    <div id="inventarioTableContainer" class="flex-grow flex flex-col overflow-hidden">
                        <div class="mb-2"> 
                            <label for="rubroFilter" class="text-xs font-bold text-gray-600">Filtrar Rubro:</label> 
                            <select id="rubroFilter" class="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-yellow-500 outline-none"><option value="">Todos</option></select> 
                        </div>
                        <div class="overflow-auto flex-grow rounded-lg shadow border border-gray-200"> 
                            <table class="min-w-full bg-white text-xs relative">
                                <thead class="bg-gray-800 text-white sticky top-0 z-10 shadow-sm">
                                    <tr class="uppercase tracking-wider"> 
                                        <th class="py-2.5 px-1 text-center font-semibold">Cant.</th> 
                                        <th class="py-2.5 px-2 text-left font-semibold">Producto a editar</th> 
                                        <th class="py-2.5 px-2 text-left font-semibold price-toggle" onclick="window.ventasModule.toggleMoneda()">Precio Unit.</th> 
                                        <th class="py-2.5 px-1 text-center font-semibold">Stock</th> 
                                    </tr>
                                </thead>
                                <tbody id="inventarioTableBody" class="text-gray-600 divide-y divide-gray-100"></tbody>
                            </table> 
                        </div>
                    </div>
                    <div id="venta-footer-section" class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 pt-4"> 
                        <div class="w-full sm:w-auto text-center sm:text-left bg-gray-50 px-4 py-2 rounded border border-gray-200">
                            <span class="text-xs font-bold text-gray-500 uppercase block mb-1">Total de la Operación</span>
                            <span id="ventaTotal" class="text-xl font-black text-gray-900">$0.00</span> 
                        </div>
                        <button id="saveChangesBtn" class="w-full sm:w-auto px-8 py-3 bg-yellow-500 text-white font-bold rounded-lg shadow-md hover:bg-yellow-600 transition uppercase tracking-wide">Guardar Cambios</button> 
                    </div>
                </div> 
            </div>
            `;
        },
        
        /**
         * Renderiza la lista simple de ventas (Historial)
         */
        getSalesListTemplate: (ventasList) => {
            if (ventasList.length === 0) return `<p class="text-center text-gray-500 p-8 font-medium bg-gray-50 rounded-lg border border-dashed">No hay registros de ventas ni consignaciones.</p>`;
            
            let html = `
            <div class="overflow-x-auto shadow-sm rounded-lg border border-gray-200">
            <table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-800 text-white sticky top-0 z-10 shadow">
                    <tr> 
                        <th class="py-3 px-3 text-left font-semibold uppercase tracking-wider text-xs">Cliente / Tipo</th> 
                        <th class="py-3 px-3 text-left font-semibold uppercase tracking-wider text-xs">Fecha</th> 
                        <th class="py-3 px-3 text-right font-semibold uppercase tracking-wider text-xs">Total</th> 
                        <th class="py-3 px-3 text-center font-semibold uppercase tracking-wider text-xs">Acciones</th> 
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">`;
            
            ventasList.forEach(v => {
                const fV = v.fecha?.toDate ? v.fecha.toDate() : new Date(0);
                const fF = fV.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
                
                // DETECCIÓN DE CONSIGNACIÓN PARA LA ETIQUETA VISUAL
                const isConsignacion = v.tipoOperacion === 'consignacion' || v.origen === 'Consignación';
                const esPreventa = v.origen === 'preventa';
                const rowBadge = esPreventa
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider mt-1">🚚 Pre-Venta</span>`
                    : (isConsignacion 
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-800 border border-orange-200 uppercase tracking-wider mt-1">📦 Consignación</span>` 
                    : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 uppercase tracking-wider mt-1">🛒 Venta Regular</span>`);
                
                const rowBg = isConsignacion ? 'hover:bg-orange-50/50' : 'hover:bg-blue-50/50';

                // --- RESTAURANDO LÓGICA DE SUBTOTALES POR RUBRO ---
                let subtotales = {};
                (v.productos || []).forEach(p => {
                    const r = (p.rubro || 'OTROS').toUpperCase();
                    let shortR = r;
                    // Simplificar nombres de rubros para que quepan en la vista
                    if (r.includes('CERVE') || r.includes('VINO')) shortR = 'CERV';
                    else if (r.includes('MALT') || r.includes('PEPSI')) shortR = 'PEPSI';
                    else if (r.includes('ALIM')) shortR = 'ALIM';
                    else if (r.includes('P&G') || r.includes('PROCTER')) shortR = 'P&G';
                    else shortR = r.substring(0, 6); 

                    const cC = p.cantidadVendida?.cj || 0;
                    const cP = p.cantidadVendida?.paq || 0;
                    const cU = p.cantidadVendida?.und || 0;
                    const pC = p.precios?.cj || 0;
                    const pP = p.precios?.paq || 0;
                    const pU = p.precios?.und || 0;
                    const sub = (cC * pC) + (cP * pP) + (cU * pU);

                    if (!subtotales[shortR]) subtotales[shortR] = 0;
                    subtotales[shortR] += sub;
                });

                let totalHtml = '';
                const rubrosKeys = Object.keys(subtotales);
                const gTotal = v.total || 0;

                if (rubrosKeys.length > 1) {
                    totalHtml += `<div class="text-[11px] text-gray-500 mb-1 space-y-0.5">`;
                    rubrosKeys.forEach(rk => {
                        if (subtotales[rk] > 0) {
                            totalHtml += `<div class="text-right whitespace-nowrap"><span class="font-medium">${rk}:</span> <span class="text-gray-700">$${subtotales[rk].toFixed(2)}</span></div>`;
                        }
                    });
                    totalHtml += `</div><div class="font-black text-gray-900 border-t border-gray-200 pt-1 text-right text-base whitespace-nowrap">Total: $${gTotal.toFixed(2)}</div>`;
                } else if (rubrosKeys.length === 1 && subtotales[rubrosKeys[0]] > 0) {
                    totalHtml = `<div class="text-[10px] text-gray-400 text-right mb-0.5 uppercase tracking-wide font-bold whitespace-nowrap">${rubrosKeys[0]}</div>
                                 <div class="font-black text-gray-900 text-right text-base whitespace-nowrap">Total: $${gTotal.toFixed(2)}</div>`;
                } else {
                    totalHtml = `<div class="font-black text-gray-900 text-right text-base whitespace-nowrap">Total: $${gTotal.toFixed(2)}</div>`;
                }
                // --- FIN LÓGICA SUBTOTALES ---

                html += `
                <tr class="${rowBg} transition-colors">
                    <td class="py-3 px-3 align-middle">
                        <div class="font-bold text-gray-900">${v.clienteNombre || 'N/A'}</div>
                        <div class="text-[11px] text-gray-500 font-medium">${fF}</div>
                        ${rowBadge}
                    </td>
                    <td class="py-3 px-3 align-middle text-gray-600 font-medium hidden sm:table-cell">${fF}</td>
                    <td class="py-3 px-3 text-right align-middle">
                        ${totalHtml}
                    </td>
                    <td class="py-2 px-3 align-middle">
                        <div class="flex flex-col sm:flex-row items-center justify-center gap-1.5 w-full">
                            <button onclick="window.ventasModule.showPastSaleOptions('${v.id}','ticket')" class="w-full sm:w-auto px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition">Ver</button>
                            <button onclick="window.ventasModule.editVenta('${v.id}')" class="w-full sm:w-auto px-3 py-1.5 bg-yellow-500 text-white text-xs font-bold rounded shadow-sm hover:bg-yellow-600 transition text-gray-900">Edit</button>
                            ${esPreventa
                                ? `<span class="w-full sm:w-auto px-2 py-1.5 bg-gray-100 text-gray-400 text-[10px] font-bold rounded text-center leading-tight" title="Anular desde Pre-Venta → Estado del Pedido">Anular en Pre-Venta</span>`
                                : `<button onclick="window.ventasModule.deleteVenta('${v.id}')" class="w-full sm:w-auto px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded shadow-sm hover:bg-red-700 transition">Del</button>`}
                        </div>
                    </td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
            return html;
        }
    };
})();


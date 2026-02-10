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
                            <button id="nuevaVentaBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Nueva Venta</button>
                            <button id="ventasTotalesBtn" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600">Ventas Totales</button>
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
                            <h2 class="text-lg font-bold">Nueva Venta</h2> 
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
                            <div id="tasasContainer" class="flex flex-row items-center gap-2"> 
                                <div class="flex items-center space-x-1"> 
                                    <label for="tasaCopInput" class="text-xs">COP:</label> 
                                    <input type="number" id="tasaCopInput" placeholder="4000" class="w-16 px-1 py-1 text-sm border rounded-lg"> 
                                </div> 
                                <div class="flex items-center space-x-1"> 
                                    <label for="tasaBsInput" class="text-xs">Bs.:</label> 
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
                        <button id="generarTicketBtn" class="px-5 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Generar Ticket</button> 
                    </div>
                </div> 
            </div>
        `,

        /**
         * Genera las filas de la tabla de inventario
         * @param {Array} inventoryList - Lista de productos ya filtrada y ordenada
         * @param {Object} ventaActualProductos - Estado actual de productos seleccionados en la venta { id: { cantCj: 0... } }
         * @param {String} currentCurrency - 'USD', 'COP', 'Bs'
         * @param {Number} tasaCOP 
         * @param {Number} tasaBs 
         * @param {String} sortKey - Clave de agrupamiento (ej: 'segmento')
         */
        getInventoryTableRows: (inventoryList, ventaActualProductos, currentCurrency, tasaCOP, tasaBs, sortKey = 'segmento') => {
            if (inventoryList.length === 0) return `<tr><td colspan="4" class="text-center text-gray-500">No hay productos disponibles.</td></tr>`;
            
            let html = '';
            let lastHeaderKey = null;

            inventoryList.forEach(prod => {
                // Header de Agrupación
                const curHeaderVal = prod[sortKey] || `Sin ${sortKey}`; 
                if (curHeaderVal !== lastHeaderKey) { 
                    lastHeaderKey = curHeaderVal; 
                    html += `<tr class="bg-gray-100"><td colspan="4" class="py-1 px-2 font-bold sticky top-[calc(theme(height.10))] z-[9]">${lastHeaderKey}</td></tr>`; 
                }

                // Datos del producto y estado actual en venta
                const vPor = prod.ventaPor || { und: true };
                const vActProd = ventaActualProductos[prod.id] || {};
                const precios = prod.precios || { und: prod.precioPorUnidad || 0 };
                const stockU = prod.cantidadUnidades || 0;

                // Función interna para crear fila
                const createRow = (type, currentQty, maxQty, price, stockText, descText) => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-2 px-2 text-center align-middle"> 
                            <input type="number" min="0" max="${maxQty}" value="${currentQty}" 
                                   class="w-16 p-1 text-center border rounded-md" 
                                   data-product-id="${prod.id}" 
                                   data-tipo-venta="${type}" 
                                   oninput="window.ventasModule.handleQuantityChange(event)"> 
                        </td> 
                        <td class="py-2 px-2 text-left align-middle"> 
                            ${descText} <span class="text-xs text-gray-500">${prod.marca || 'S/M'}</span> 
                        </td> 
                        <td class="py-2 px-2 text-left align-middle font-semibold price-toggle" onclick="window.ventasModule.toggleMoneda()">
                            ${_formatCurrency(price, currentCurrency, tasaCOP, tasaBs)}
                        </td> 
                        <td class="py-2 px-1 text-center align-middle text-xs">${stockText}</td>
                    </tr>`;

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
         */
        getTicketHTML: (venta, productosVendidos, vaciosDevueltos, tipo = 'ticket') => {
            const fecha = venta.fecha ? (venta.fecha.toDate ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date(venta.fecha).toLocaleDateString('es-ES')) : new Date().toLocaleDateString('es-ES');
            const clienteNombre = venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre;
            const clienteNombrePersonal = (venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '';
            const titulo = tipo === 'factura' ? 'FACTURA FISCAL' : 'TICKET DE VENTA';
            
            let total = 0;
            let productosHTML = '';

            productosVendidos.forEach(p => {
                const precios = p.precios || { und: p.precioPorUnidad || 0 };
                const cant = p.cantidadVendida || { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 };
                let desc = `${p.segmento || ''} ${p.marca || ''} ${p.presentacion}`;
                let qtyText = '', priceText = '', subtotal = 0;

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
                vaciosHTML = `<div class="text-3xl mt-6 border-t border-black border-dashed pt-4"> <p>ENVASES DEVUELTOS:</p> <table class="w-full text-3xl mt-2"><tbody>`;
                tiposConDev.forEach(([t, c]) => {
                    vaciosHTML += `<tr><td class="py-1 pr-2 text-left" style="width: 70%;">${t}</td><td class="py-1 pl-2 text-right" style="width: 30%;">${c} CJ</td></tr>`;
                });
                vaciosHTML += `</tbody></table></div>`;
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
                                <th class="pb-2 text-left">DESCRIPCION</th>
                                <th class="pb-2 text-center">CANT</th>
                                <th class="pb-2 text-right">PRECIO</th>
                                <th class="pb-2 text-right">SUBTOTAL</th>
                            </tr>
                        </thead>
                        <tbody>${productosHTML}</tbody>
                    </table>
                    <div class="text-right text-3xl mt-4 pr-2">
                        <p class="border-t border-black pt-2 font-bold">TOTAL: $${total.toFixed(2)}</p>
                    </div>
                    ${vaciosHTML}
                    <div class="text-center mt-16">
                        <p class="border-t border-black w-96 mx-auto"></p>
                        <p class="mt-4 text-3xl">${clienteNombrePersonal}</p>
                    </div>
                    <hr class="border-dashed border-black mt-6">
                </div>`;
        },

        /**
         * Genera String de Texto Plano del Ticket (para clipboard/WhatsApp)
         */
        getTicketRawText: (venta, productosVendidos, vaciosDevueltos) => {
            const fecha = venta.fecha ? (venta.fecha.toDate ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date(venta.fecha).toLocaleDateString('es-ES')) : new Date().toLocaleDateString('es-ES');
            const clienteNombre = _toTitleCase(venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre);
            const clienteNombrePersonal = _toTitleCase((venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '');
            const LINE_WIDTH = 48; 
            let total = 0; 
            let ticket = '';
            
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

            ticket += center('Distribuidora Castillo Yañez') + '\n';
            ticket += center('Nota de Entrega') + '\n';
            ticket += center('(no valido como factura fiscal)') + '\n\n';

            wordWrap(`Cliente: ${clienteNombre}`, LINE_WIDTH).forEach(line => { ticket += line + '\n'; });
            ticket += `Fecha: ${fecha}\n` + '-'.repeat(LINE_WIDTH) + '\n';

            if (productosVendidos.length > 0) {
                ticket += 'Producto'.padEnd(26) + 'Cant'.padStart(6) + 'Precio'.padStart(8) + 'Subt'.padStart(8) + '\n';
                productosVendidos.forEach(p => {
                    const precios = p.precios || { und: p.precioPorUnidad || 0 };
                    const cant = p.cantidadVendida || { cj: p.cantCj || 0, paq: p.cantPaq || 0, und: p.cantUnd || 0 };
                    let desc = _toTitleCase(`${p.segmento || ''} ${p.marca || ''} ${p.presentacion}`);
                    let qtyText = '', priceText = '', subtotal = 0;

                    if (cant.cj > 0) {
                        subtotal = (precios.cj || 0) * cant.cj; qtyText = `${cant.cj} CJ`; priceText = `$${(precios.cj || 0).toFixed(2)}`;
                    } else if (cant.paq > 0) {
                        subtotal = (precios.paq || 0) * cant.paq; qtyText = `${cant.paq} PQ`; priceText = `$${(precios.paq || 0).toFixed(2)}`;
                    } else if (cant.und > 0) {
                        subtotal = (precios.und || 0) * cant.und; qtyText = `${cant.und} UN`; priceText = `$${(precios.und || 0).toFixed(2)}`;
                    } else { return; }
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
                ticket += '-'.repeat(LINE_WIDTH) + '\n' + center('ENVASES DEVUELTOS') + '\n';
                tiposConDev.forEach(([t, c]) => {
                    ticket += t.padEnd(LINE_WIDTH - `${c} CJ`.length) + `${c} CJ` + '\n';
                });
            }

            ticket += '-'.repeat(LINE_WIDTH) + '\n';
            ticket += `TOTAL: $${total.toFixed(2)}`.padStart(LINE_WIDTH, ' ') + '\n\n\n\n\n';
            ticket += center('________________________') + '\n';
            ticket += center(clienteNombrePersonal) + '\n\n';
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
                            <button id="ventasActualesBtn" class="w-full px-6 py-3 bg-teal-500 text-white rounded-lg shadow-md hover:bg-teal-600">Ventas Actuales</button>
                            <button id="cierreVentasBtn" class="w-full px-6 py-3 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600">Cierre de Ventas</button>
                        </div>
                        <button id="backToVentasBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
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
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Cierre de Ventas</h2>
                        <div class="space-y-4">
                            <button id="verCierreBtn" class="w-full px-6 py-3 bg-cyan-500 text-white rounded-lg shadow-md hover:bg-cyan-600">Ver Cierre</button>
                            <button id="ejecutarCierreBtn" class="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700">Ejecutar Cierre</button>
                        </div>
                        <button id="backToVentasTotalesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div> 
                </div> 
            </div>
        `,

        /**
         * Vista: Edición de Venta
         */
        getEditSaleTemplate: (venta, tiposVacio) => `
            <div class="p-2 sm:p-4 w-full"> 
                <div class="bg-white/90 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col h-full" style="min-height: calc(100vh - 2rem);">
                    <div id="venta-header-section" class="mb-4">
                        <div class="flex justify-between items-center mb-4"> 
                            <h2 class="text-xl font-bold">Editando Venta</h2> 
                            <button id="backToVentasBtn" class="px-4 py-2 bg-gray-400 text-white text-sm rounded-lg shadow-md hover:bg-gray-500">Volver</button> 
                        </div>
                        <div class="p-4 bg-gray-100 rounded-lg"> 
                            <p><span class="font-medium">Cliente:</span> <span class="font-bold">${venta.clienteNombre || 'N/A'}</span></p> 
                            <p class="text-sm"><span class="font-medium">Fecha Orig:</span> ${venta.fecha?.toDate ? venta.fecha.toDate().toLocaleString('es-ES') : 'N/A'}</p> 
                        </div>
                    </div>
                    <div id="vacios-devueltos-section" class="mb-4"> 
                        <h3 class="text-sm font-semibold text-cyan-700 mb-1">Vacíos Devueltos:</h3> 
                        <div class="grid grid-cols-3 gap-2"> 
                            ${tiposVacio.map(t => `
                                <div>
                                    <label for="vacios-${t.replace(/\s+/g,'-')}" class="text-xs mb-1 block">${t}</label>
                                    <input type="number" min="0" value="${venta.vaciosDevueltosPorTipo ? (venta.vaciosDevueltosPorTipo[t] || 0) : 0}" id="vacios-${t.replace(/\s+/g,'-')}" class="w-16 p-1 text-center border rounded-md" data-tipo-vacio="${t}" oninput="window.ventasModule.handleTipoVacioChange(event)">
                                </div>
                            `).join('')} 
                        </div> 
                    </div>
                    <div id="inventarioTableContainer" class="animate-fade-in flex-grow flex flex-col overflow-hidden">
                        <div class="mb-2"> 
                            <label for="rubroFilter" class="text-xs">Filtrar Rubro:</label> 
                            <select id="rubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select> 
                        </div>
                        <div class="overflow-auto flex-grow rounded-lg shadow"> 
                            <table class="min-w-full bg-white text-xs">
                                <thead class="bg-gray-200 sticky top-0 z-10">
                                    <tr class="uppercase"> 
                                        <th class="py-2 px-1 text-center">Cant.</th> 
                                        <th class="py-2 px-2 text-left">Producto</th> 
                                        <th class="py-2 px-2 text-left price-toggle" onclick="window.ventasModule.toggleMoneda()">Precio</th> 
                                        <th class="py-2 px-1 text-center">Stock Disp.</th> 
                                    </tr>
                                </thead>
                                <tbody id="inventarioTableBody" class="text-gray-600"></tbody>
                            </table> 
                        </div>
                    </div>
                    <div id="venta-footer-section" class="mt-4 flex items-center justify-between"> 
                        <span id="ventaTotal" class="text-lg font-bold">$0.00</span> 
                        <button id="saveChangesBtn" class="px-6 py-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button> 
                    </div>
                </div> 
            </div>
        `,
        
        /**
         * Renderiza la lista simple de ventas (Historial)
         */
        getSalesListTemplate: (ventasList) => {
            if (ventasList.length === 0) return `<p class="text-center text-gray-500">No hay ventas registradas.</p>`;
            
            let html = `<table class="min-w-full bg-white text-sm"><thead class="bg-gray-200 sticky top-0 z-10"><tr> <th class="py-2 px-3 border-b text-left">Cliente</th> <th class="py-2 px-3 border-b text-left">Fecha</th> <th class="py-2 px-3 border-b text-right">Total</th> <th class="py-2 px-3 border-b text-center">Acciones</th> </tr></thead><tbody>`;
            
            ventasList.forEach(v => {
                const fV = v.fecha?.toDate ? v.fecha.toDate() : new Date(0);
                const fF = fV.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                html += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-3 border-b align-middle">${v.clienteNombre || 'N/A'}</td>
                    <td class="py-2 px-3 border-b align-middle">${fF}</td>
                    <td class="py-2 px-3 border-b text-right font-semibold align-middle">$${(v.total || 0).toFixed(2)}</td>
                    <td class="py-2 px-3 border-b">
                        <div class="flex flex-col items-center space-y-1">
                            <button onclick="window.ventasModule.showPastSaleOptions('${v.id}','ticket')" class="w-full px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600">Compartir</button>
                            <button onclick="window.ventasModule.editVenta('${v.id}')" class="w-full px-3 py-1.5 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600">Editar</button>
                            <button onclick="window.ventasModule.deleteVenta('${v.id}')" class="w-full px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600">Eliminar</button>
                        </div>
                    </td>
                </tr>`;
            });
            html += `</tbody></table>`;
            return html;
        }
    };
})();

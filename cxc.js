(function() {
    let _db, _userId, _userRole, _appId, _mainContent, _floatingControls, _showMainMenu, _showModal, _collection, _getDocs, _doc, _setDoc, _getDoc, _query, _where, _limit;

    // Ruta donde guardaremos la data parseada del PDF
    const CXC_PUBLIC_PATH = 'artifacts/ventas-9a210/public/data/cxc';
    const CIERRES_COLLECTION_PATH = 'public_data/ventas-9a210/user_closings'; // Ruta tentativa para buscar ventas globales, o iterar usuarios.

    // Caché local
    let _cxcDataCache = null;
    let _lastUpdateDate = null;

    window.initCXC = function(dependencies) {
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
        _setDoc = dependencies.setDoc;
        _getDoc = dependencies.getDoc;
        _query = dependencies.query;
        _where = dependencies.where;
        _limit = dependencies.limit;
    };

    window.showCXCView = async function() {
        if (_floatingControls) _floatingControls.classList.add('hidden');
        
        _mainContent.innerHTML = `
            <div class="p-4 pt-8 w-full max-w-4xl mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl min-h-[80vh]">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h1 class="text-3xl font-bold text-gray-800">Cuentas por Cobrar (CXC)</h1>
                        <div class="flex flex-col items-end">
                            <button id="backToMenuBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg shadow hover:bg-gray-500 text-sm mb-2">Volver al Menú</button>
                            ${_userRole === 'admin' ? `
                                <div class="flex items-center gap-2">
                                    <span id="lastUpdateLabel" class="text-xs text-gray-500 italic"></span>
                                    <button id="updateCXCBtn" class="px-4 py-2 bg-orange-600 text-white rounded-lg shadow hover:bg-orange-700 text-sm font-bold flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        Actualizar CXC
                                    </button>
                                </div>
                                <input type="file" id="pdfInput" accept=".pdf" class="hidden">
                            ` : `<span id="lastUpdateLabel" class="text-xs text-gray-500 italic"></span>`}
                        </div>
                    </div>

                    <div class="mb-6 relative">
                        <input type="text" id="clientSearch" placeholder="Buscar cliente por nombre..." class="w-full px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 outline-none pl-10">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <div id="cxcListContainer" class="overflow-y-auto max-h-[60vh] border rounded-lg bg-gray-50 p-2">
                        <p class="text-center text-gray-500 py-10">Cargando información...</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        
        if (_userRole === 'admin') {
            const btn = document.getElementById('updateCXCBtn');
            const input = document.getElementById('pdfInput');
            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', handlePDFUpload);
        }

        document.getElementById('clientSearch').addEventListener('input', (e) => renderCXCList(e.target.value));

        await loadCXCData();
    };

    async function loadCXCData() {
        try {
            const docRef = _doc(_db, CXC_PUBLIC_PATH, 'current');
            const docSnap = await _getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                _cxcDataCache = data.clients || [];
                _lastUpdateDate = data.updatedAt ? data.updatedAt.toDate() : null;
                
                const label = document.getElementById('lastUpdateLabel');
                if (label && _lastUpdateDate) {
                    label.textContent = `Actualizado: ${_lastUpdateDate.toLocaleDateString()} ${_lastUpdateDate.toLocaleTimeString()}`;
                }
                
                renderCXCList();
            } else {
                document.getElementById('cxcListContainer').innerHTML = `<p class="text-center text-gray-500 py-10">No hay información de CXC cargada aún.</p>`;
            }
        } catch (error) {
            console.error("Error loading CXC:", error);
            document.getElementById('cxcListContainer').innerHTML = `<p class="text-center text-red-500 py-10">Error al cargar datos.</p>`;
        }
    }

    function renderCXCList(searchTerm = '') {
        const container = document.getElementById('cxcListContainer');
        if (!_cxcDataCache || _cxcDataCache.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-10">Lista vacía.</p>`;
            return;
        }

        const term = searchTerm.toLowerCase();
        // Filtrar clientes que coincidan con el nombre
        const filtered = _cxcDataCache.filter(c => c.name.toLowerCase().includes(term));

        if (filtered.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-4">No se encontraron clientes.</p>`;
            return;
        }

        let html = '<div class="space-y-3">';
        filtered.forEach(client => {
            // Determinar color basado en deuda (positivo) o abono (negativo)
            const amountClass = client.amount > 0 ? 'text-red-600' : 'text-green-600';
            const amountLabel = client.amount > 0 ? 'Deuda' : 'Saldo a Favor';
            const bgClass = client.amount > 0 ? 'bg-white' : 'bg-green-50';
            
            html += `
                <div class="${bgClass} p-4 rounded-lg shadow border border-gray-200 flex justify-between items-center transition hover:shadow-md">
                    <div>
                        <h3 class="font-bold text-gray-800 text-lg">${client.name}</h3>
                        ${client.index ? `<span class="text-xs text-gray-400">Ref: ${client.index}</span>` : ''}
                    </div>
                    <div class="text-right cursor-pointer" onclick="window.cxcModule.handleAmountClick('${client.name}', ${client.amount})">
                        <p class="text-xs text-gray-500 uppercase">${amountLabel}</p>
                        <p class="text-xl font-bold ${amountClass}">$${client.amount.toFixed(2)}</p>
                        ${client.amount > 0 ? '<p class="text-[10px] text-blue-500 hover:underline">Ver detalle</p>' : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    // --- LÓGICA DE PARSEO DE PDF ---
    async function handlePDFUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        _showModal('Procesando', 'Leyendo archivo PDF... Por favor espere.');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                // Unir items de texto. Nota: El orden visual depende de las coordenadas,
                // pdf.js generalmente devuelve en orden de lectura, pero no siempre es perfecto para tablas.
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }

            const parsedClients = parseCXCText(fullText);

            if (parsedClients.length === 0) {
                _showModal('Error', 'No se pudieron extraer datos válidos del PDF. Verifique el formato.');
                return;
            }

            // Guardar en Firebase
            const docRef = _doc(_db, CXC_PUBLIC_PATH, 'current');
            await _setDoc(docRef, {
                clients: parsedClients,
                updatedAt: new Date(),
                updatedBy: _userId
            });

            _showModal('Éxito', `Se importaron ${parsedClients.length} registros correctamente.`, () => {
                showCXCView(); // Recargar vista
            });

        } catch (error) {
            console.error("PDF Parse Error:", error);
            _showModal('Error', `Error al procesar el PDF: ${error.message}`);
        } finally {
            event.target.value = ''; // Reset input
        }
    }

    /**
     * Intenta extraer filas con formato: [Índice opcional] [NOMBRE CLIENTE] [MONTO]
     * Basado en el PDF proporcionado: "1 ABASTO ANTONY 770.65"
     */
    function parseCXCText(text) {
        const clients = [];
        // Normalizar espacios y saltos de línea
        // Estrategia: Buscar patrones de números al final de segmentos de texto que parecen nombres.
        // Regex Explicación:
        // (?:^|\s) -> Inicio de línea o espacio
        // (\d+)?   -> Grupo 1: Índice opcional (ej: "1", "2")
        // \s* -> Espacios
        // ([A-ZÁÉÍÓÚÑ\s\.\-]+?) -> Grupo 2: Nombre (Letras mayúsculas, espacios, puntos, guiones, no codicioso)
        // \s+      -> Espacios obligatorios antes del monto
        // (-?[\d\.,]+) -> Grupo 3: Monto (Opcional negativo, dígitos, puntos, comas)
        
        // Dado que pdf.js a veces junta todo en una línea larga o rompe líneas raro, 
        // vamos a intentar tokenizar mejor.
        
        // 1. Limpiar el texto: Reemplazar saltos de línea extraños con espacios únicos
        // Pero cuidado, los saltos de línea son útiles delimitadores.
        
        // Analizando el PDF visualmente, parece una tabla.
        // Vamos a intentar dividir por líneas lógicas o usar una regex global.
        
        // Regex ajustada para capturar "1 ABASTO ANTONY 770.65" o "-29"
        // Asumimos que el monto está al final de la línea lógica o seguido de un salto.
        
        // Simulación básica basada en el texto extraído probable:
        // "1 ABASTO ANTONY 770.65 1 0 MENOR" -> Esto es una fila completa.
        // Nos interesa el nombre y el PRIMER monto grande que aparece después del nombre.
        
        const lines = text.split(/\r?\n/);
        const extracted = [];

        // Regex para buscar: Inicio -> (Numero opcional) -> Texto Nombre -> Numero Decimal (Monto)
        const rowRegex = /^(\d+)?\s*([A-ZÁÉÍÓÚÑ\s\.\-&]+)\s+(-?[\d\.,]+)/;

        // Otra estrategia: Buscar todas las secuencias que cumplan el patrón en todo el texto crudo si las líneas están rotas.
        // Pero vamos a intentar iterar sobre el texto completo buscando coincidencias.
        
        // Limpiamos caracteres que no sean texto útil para facilitar regex
        const cleanText = text.replace(/[\r\n]+/g, ' ### '); // Usar un separador temporal
        
        // Buscamos patrones: "Numero (opcional) NOMBRE MONTO"
        // El nombre debe tener al menos 2 letras. El monto debe tener formato de dinero.
        // El PDF tiene montos como "770.65" o "-29".
        
        const matches = cleanText.matchAll(/(\d+\s+)?([A-ZÁÉÍÓÚÑ\.\-&]{3,}[A-ZÁÉÍÓÚÑ\s\.\-&]*?)\s+(-?[\d]{1,3}(?:[,]\d{3})*(?:[\.]\d{1,2})?|-?[\d]+)(?=\s|$)/g);

        for (const match of matches) {
            let index = match[1] ? match[1].trim() : '';
            let name = match[2].trim();
            let amountStr = match[3].replace(',', ''); // Quitar comas de miles si las hubiera, dejar punto decimal
            
            // Validar que no sea basura del encabezado
            if (name.includes("TOTAL") || name.includes("FECHA") || name.includes("CLIENTE") || name.length < 3) continue;

            let amount = parseFloat(amountStr);
            if (isNaN(amount)) continue;

            // En el PDF, a veces hay columnas intermedias.
            // Si el nombre termina en palabras clave como "FACTURA", limpiarlo.
            
            clients.push({
                index: index,
                name: name,
                amount: amount
            });
        }

        return clients;
    }

    // --- LÓGICA DE BÚSQUEDA DE VENTAS ---
    window.cxcModule = {
        handleAmountClick: async (clientName, amount) => {
            if (amount <= 0) return; // Solo deudas positivas

            _showModal('Buscando Detalle', `Buscando ventas por $${amount.toFixed(2)} para ${clientName}...`);

            try {
                // Estrategia: Buscar en las colecciones de cierres de usuarios.
                // Como no hay un índice global fácil, esto es costoso. 
                // Optimizaremos buscando en los cierres del mes actual o reciente.
                // LIMITACIÓN: Esto es una búsqueda aproximada.
                
                // 1. Obtener lista de usuarios (vendedores)
                const usersSnap = await _getDocs(_collection(_db, "users"));
                const userIds = usersSnap.docs.map(d => d.id);
                
                let foundVentas = [];

                // Buscamos en los cierres de cada usuario (últimos 30 días para no saturar)
                // O mejor, buscamos en la colección de 'ventas' activas si el sistema las mantiene.
                // El sistema actual archiva las ventas en 'cierres'.
                
                // Vamos a buscar en los 'cierres' de cada usuario.
                const fechaLimite = new Date();
                fechaLimite.setDate(fechaLimite.getDate() - 60); // Últimos 2 meses

                for (const uid of userIds) {
                    const cierresRef = _collection(_db, `artifacts/${_appId}/users/${uid}/cierres`);
                    const q = _query(cierresRef, _where("fecha", ">=", fechaLimite), _limit(20)); // Limitar búsqueda
                    const cierresSnap = await _getDocs(q);

                    cierresSnap.docs.forEach(doc => {
                        const cierre = doc.data();
                        const ventas = cierre.ventas || [];
                        // Buscar ventas que coincidan aproximadamente con el monto y nombre
                        const matches = ventas.filter(v => {
                            const montoMatch = Math.abs(v.total - amount) < 0.5; // Margen de error de 50 centavos
                            const nameMatch = (v.clienteNombre || '').toUpperCase().includes(clientName.split(' ')[0]); // Coincidencia parcial de nombre
                            return montoMatch; // Priorizamos monto, el nombre a veces varía
                        });
                        
                        matches.forEach(m => {
                            foundVentas.push({ ...m, vendedorId: uid, cierreFecha: cierre.fecha });
                        });
                    });
                }

                const modal = document.getElementById('modalContainer');
                if(modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');

                if (foundVentas.length > 0) {
                    showFoundVentasModal(clientName, amount, foundVentas);
                } else {
                    _showModal('Sin resultados', 'No se encontraron registros de ventas digitales que coincidan con este monto en los últimos 60 días. Es posible que sea una venta antigua o manual.');
                }

            } catch (error) {
                console.error("Error searching details:", error);
                _showModal('Error', 'Error al buscar detalles.');
            }
        }
    };

    function showFoundVentasModal(clientName, amount, ventas) {
        let html = `<div class="text-left"><p class="mb-4 text-sm text-gray-600">Posibles coincidencias para <b>${clientName}</b> ($${amount}):</p>`;
        
        ventas.forEach(v => {
            const fecha = v.fecha && v.fecha.toDate ? v.fecha.toDate().toLocaleDateString() : 'N/A';
            const prods = (v.productos || []).map(p => `${p.cantidadVendida?.cj || 0} ${p.presentacion}`).join(', ');
            
            html += `
                <div class="border-b py-2 mb-2">
                    <p class="font-bold text-gray-800">${v.clienteNombre}</p>
                    <p class="text-xs text-gray-500">Fecha: ${fecha} | Total: $${v.total.toFixed(2)}</p>
                    <p class="text-xs mt-1 italic">${prods}</p>
                </div>
            `;
        });
        html += '</div>';
        
        _showModal('Detalle de Deuda', html, null, 'Cerrar');
    }

})();

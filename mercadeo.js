// ═══════════════════════════════════════════════════════════════════════
// MÓDULO EJECUCIÓN Y MERCADEO
//
// Flujo: buscar cliente → elegir el tipo de gestión → tomar/elegir la foto
// → la app arma el texto del comprobante y lo comparte por WhatsApp.
//
// El catálogo de gestiones y los datos del equipo (GNV, GAV, GTV, CDV, TV,
// FQ) son editables por un administrador, para no depender del código.
// ═══════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _storage, _userId, _mainContent, _showMainMenu, _showModal;
    let _collection, _doc, _getDoc, _getDocs, _setDoc;

    window.initMercadeo = function (deps) {
        _db           = deps.db;
        _storage      = deps.storage;
        _userId       = deps.userId;
        _mainContent  = deps.mainContent;
        _showMainMenu = deps.showMainMenu;
        _showModal    = deps.showModal;
        _collection   = deps.collection;
        _doc          = deps.doc;
        _getDoc       = deps.getDoc;
        _getDocs      = deps.getDocs;
        _setDoc       = deps.setDoc;
    };

    const PUB = () => window.AppConfig.PUBLIC_DATA_ID;
    const pathClientes = () => `artifacts/${PUB()}/public/data/clientes`;
    const pathConfig   = () => `artifacts/${PUB()}/public/data/config/mercadeo`;
    const pathHistorial = () => `artifacts/${PUB()}/public/data/mercadeo_historial`;
    const esAdmin = () => window.userRole === 'admin';

    // Gestiones por defecto (el admin puede cambiarlas desde la app)
    const CONFIG_DEFAULT = {
        gestiones: [
            { nombre: 'Ejecución en el PDV', marca: 'Multimarca' },
            { nombre: 'Activación de marca', marca: 'Multimarca' },
            { nombre: 'Exhibición adicional', marca: 'Multimarca' },
            { nombre: 'Material POP', marca: 'Multimarca' },
            { nombre: 'Visita de seguimiento', marca: 'Multimarca' }
        ],
        equipo: { GNV: '', GAV: '', GTV: '', CDV: '', TV: '', FQ: 'Distribuidora Castillo Yañez C.A' }
    };

    let _cfg = JSON.parse(JSON.stringify(CONFIG_DEFAULT));
    let _clientes = [];
    let _sel = { cliente: null, gestion: null, archivo: null };

    const DIAS  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    async function cargarConfig() {
        try {
            const snap = await _getDoc(_doc(_db, pathConfig()));
            if (snap.exists()) {
                const d = snap.data();
                _cfg = {
                    gestiones: Array.isArray(d.gestiones) && d.gestiones.length ? d.gestiones : CONFIG_DEFAULT.gestiones,
                    equipo: { ...CONFIG_DEFAULT.equipo, ...(d.equipo || {}) }
                };
            }
        } catch (e) { console.warn('Mercadeo: usando configuración por defecto', e); }
        return _cfg;
    }

    // ═══════════════ PANTALLA PRINCIPAL ═══════════════
    window.showMercadeo = async function () {
        _sel = { cliente: null, gestion: null, archivo: null };
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-lg mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="bg-slate-800 px-4 py-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Ejecución y Mercadeo</h2>
                            <p class="text-[10px] text-slate-400 mt-0.5">Comprobante de gestión en el punto de venta</p>
                        </div>
                        <button id="mkBack" class="px-3 py-1.5 bg-white/10 text-slate-100 text-xs rounded-md hover:bg-white/20 font-medium transition">Volver</button>
                    </div>

                    <div class="p-4 space-y-4">
                        ${esAdmin() ? `<div class="grid grid-cols-2 gap-2">
                            <button id="mkEditGestion" class="py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition border border-slate-300">Edit Formato</button>
                            <button id="mkHistorial" class="py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition border border-slate-300">Historial</button>
                        </div>` : ''}

                        <div>
                            <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">1. Cliente</label>
                            <div id="mkCliBuscador">
                                <input type="text" id="mkCliente" placeholder="Buscar cliente por nombre o CEP..." autocomplete="off"
                                       class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none mt-1 focus:ring-2 focus:ring-slate-400">
                                <div id="mkCliDrop" class="hidden border border-slate-200 rounded-lg max-h-40 overflow-y-auto mt-1"></div>
                            </div>
                            <div id="mkCliElegido" class="hidden mt-1 flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                <span id="mkCliNombre" class="text-xs font-bold text-slate-800 truncate"></span>
                                <button type="button" id="mkCliCambiar" class="text-[10px] text-slate-500 hover:text-slate-800 underline shrink-0">Cambiar</button>
                            </div>
                        </div>

                        <div id="mkPaso2" class="hidden">
                            <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">2. Tipo de gestión</label>
                            <div id="mkGestiones" class="space-y-1.5 mt-1"></div>
                            <div id="mkGestElegida" class="hidden mt-1 flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                <span id="mkGestNombre" class="text-xs font-bold text-slate-800 truncate"></span>
                                <button type="button" id="mkGestCambiar" class="text-[10px] text-slate-500 hover:text-slate-800 underline shrink-0">Cambiar</button>
                            </div>
                        </div>

                        <div id="mkPaso3" class="hidden">
                            <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">3. Foto del comprobante</label>
                            <input type="file" id="mkFoto" accept="image/*" capture="environment" class="hidden">
                            <input type="file" id="mkGaleria" accept="image/*" multiple class="hidden">
                            <div class="grid grid-cols-2 gap-2 mt-1">
                                <button id="mkTomarFoto" class="py-3 bg-slate-100 text-slate-700 rounded-lg font-semibold text-xs hover:bg-slate-200 transition border border-slate-300 flex flex-col items-center justify-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                    Tomar foto
                                </button>
                                <button id="mkElegirGaleria" class="py-3 bg-slate-100 text-slate-700 rounded-lg font-semibold text-xs hover:bg-slate-200 transition border border-slate-300 flex flex-col items-center justify-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                    Galería (hasta 4)
                                </button>
                            </div>

                            <div id="mkCollageOpts" class="hidden mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Composición del collage</p>
                                <div id="mkLayouts" class="grid grid-cols-3 gap-1.5"></div>
                                <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-3 mb-1">Orden de las imágenes</p>
                                <p class="text-[9px] text-slate-400 mb-1.5">Toca una imagen y luego otra para intercambiarlas de posición.</p>
                                <div id="mkOrden" class="grid grid-cols-4 gap-1.5"></div>
                            </div>

                            <div id="mkPreview" class="hidden mt-2">
                                <img id="mkPreviewImg" class="w-full max-h-56 object-contain rounded-lg border border-slate-200 bg-slate-50">
                            </div>
                            <div id="mkEditor" class="hidden mt-2">
                                <p class="text-[10px] text-slate-500 mb-1">Arrastra sobre una imagen para elegir qué parte se ve.</p>
                                <canvas id="mkCanvas" class="w-full rounded-lg border border-slate-200 bg-white touch-none"></canvas>
                            </div>
                        </div>

                        <div id="mkPaso4" class="hidden">
                            <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">4. Comprobante</label>
                            <pre id="mkTexto" class="mt-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-700 whitespace-pre-wrap font-sans"></pre>
                            <button id="mkCompartir" class="w-full mt-2 py-3 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition">Compartir por WhatsApp</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('mkBack').addEventListener('click', () => _showMainMenu());
        document.getElementById('mkEditGestion')?.addEventListener('click', editarGestiones);
        document.getElementById('mkHistorial')?.addEventListener('click', verHistorial);

        await Promise.all([cargarConfig(), cargarClientes()]);
        enlazarBuscadorCliente();
        renderGestiones();

        document.getElementById('mkGestCambiar').addEventListener('click', () => { _sel.gestion = null; colapsarGestion(false); actualizarTexto(); });
        document.getElementById('mkTomarFoto').addEventListener('click', () => document.getElementById('mkFoto').click());
        document.getElementById('mkElegirGaleria').addEventListener('click', () => document.getElementById('mkGaleria').click());
        document.getElementById('mkFoto').addEventListener('change', onFotoElegida);
        document.getElementById('mkGaleria').addEventListener('change', onGaleriaElegida);
        document.getElementById('mkCompartir').addEventListener('click', compartir);
    };

    async function cargarClientes() {
        if (_clientes.length) return;
        try {
            const snap = await _getDocs(_collection(_db, pathClientes()));
            _clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { _clientes = []; }
    }

    function enlazarBuscadorCliente() {
        const inp = document.getElementById('mkCliente');
        const drop = document.getElementById('mkCliDrop');
        const bus = document.getElementById('mkCliBuscador');
        const eleg = document.getElementById('mkCliElegido');

        const fijar = (c) => {
            _sel.cliente = c;
            document.getElementById('mkCliNombre').textContent = c.nombreComercial || c.nombrePersonal || '(sin nombre)';
            drop.classList.add('hidden'); inp.value = '';
            bus.classList.add('hidden'); eleg.classList.remove('hidden');
            document.getElementById('mkPaso2').classList.remove('hidden');
            actualizarTexto();
        };
        document.getElementById('mkCliCambiar').addEventListener('click', () => {
            _sel.cliente = null;
            eleg.classList.add('hidden'); bus.classList.remove('hidden');
            document.getElementById('mkPaso2').classList.add('hidden');
            document.getElementById('mkPaso4').classList.add('hidden');
            _sel.gestion = null; colapsarGestion(false);
            inp.focus();
        });
        inp.addEventListener('input', () => {
            const t = inp.value.toLowerCase().trim();
            if (!t) { drop.classList.add('hidden'); return; }
            const res = _clientes.filter(c =>
                (c.nombreComercial || '').toLowerCase().includes(t) ||
                (c.nombrePersonal || '').toLowerCase().includes(t) ||
                (c.codigoCEP || '').toString().toLowerCase().includes(t)).slice(0, 20);
            drop.innerHTML = res.map(c => `
                <button type="button" data-id="${c.id}" class="mk-cli w-full text-left px-2.5 py-2 text-xs hover:bg-slate-50 border-b border-slate-100">
                    <span class="font-semibold text-slate-800">${c.nombreComercial || c.nombrePersonal || '(sin nombre)'}</span>
                    <span class="block text-[10px] text-slate-400">${c.codigoCEP ? 'CEP ' + c.codigoCEP : ''}${c.sector ? ' · ' + c.sector : ''}</span>
                </button>`).join('') || '<p class="text-[11px] text-slate-400 p-2">Sin resultados</p>';
            drop.classList.remove('hidden');
            drop.querySelectorAll('.mk-cli').forEach(b => b.addEventListener('click', () => {
                const c = _clientes.find(x => x.id === b.dataset.id);
                if (c) fijar(c);
            }));
        });
    }

    function renderGestiones() {
        const cont = document.getElementById('mkGestiones');
        if (!cont) return;
        cont.innerHTML = _cfg.gestiones.map((g, i) => `
            <button type="button" data-i="${i}" class="mk-gest w-full text-left px-3 py-2.5 border rounded-lg text-xs transition ${_sel.gestion === i ? 'bg-slate-800 text-white border-slate-800 font-bold' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'}">
                ${g.nombre}${g.marca ? `<span class="block text-[10px] ${_sel.gestion === i ? 'text-slate-300' : 'text-slate-400'}">Marca: ${g.marca}</span>` : ''}
            </button>`).join('');
        cont.querySelectorAll('.mk-gest').forEach(b => b.addEventListener('click', () => {
            _sel.gestion = Number(b.dataset.i);
            colapsarGestion(true);
            document.getElementById('mkPaso3').classList.remove('hidden');
            actualizarTexto();
        }));
    }

    // Tras elegir la gestión se oculta la lista y queda solo la seleccionada,
    // para no ocupar media pantalla con opciones ya descartadas.
    function colapsarGestion(colapsar) {
        const lista = document.getElementById('mkGestiones');
        const elegida = document.getElementById('mkGestElegida');
        if (!lista || !elegida) return;
        if (colapsar && _sel.gestion !== null) {
            const g = _cfg.gestiones[_sel.gestion] || {};
            document.getElementById('mkGestNombre').textContent = g.nombre + (g.marca ? ` · ${g.marca}` : '');
            lista.classList.add('hidden');
            elegida.classList.remove('hidden');
        } else {
            renderGestiones();
            lista.classList.remove('hidden');
            elegida.classList.add('hidden');
        }
    }

    function mostrarPreview(file) {
        _sel.archivo = file;
        // En collage la vista previa es el lienzo editable, no una imagen fija
        if (!_imgsCollage.length) {
            document.getElementById('mkPreviewImg').src = URL.createObjectURL(file);
            document.getElementById('mkPreview').classList.remove('hidden');
        }
        actualizarTexto();
    }

    function onFotoElegida() {
        const f = document.getElementById('mkFoto').files?.[0];
        if (!f) return;
        _imgsCollage = []; _offsets = [];
        document.getElementById('mkCollageOpts').classList.add('hidden');
        document.getElementById('mkEditor').classList.add('hidden');
        mostrarPreview(f);
    }

    // ── COLLAGE ──────────────────────────────────────────────────────────
    // Hasta 4 imágenes de la galería, combinadas en una sola con la
    // composición que elija el usuario.
    let _imgsCollage = [];
    let _offsets = [];          // encuadre de cada imagen {x,y} entre 0 y 1

    // ── Editor de encuadre: se arrastra sobre el collage para mover la parte
    //    visible de cada imagen dentro de su recuadro ──
    const PREV = 600;           // lado del lienzo de edición

    function dibujarPreview() {
        const cv = document.getElementById('mkCanvas');
        if (!cv || !_layoutActual) return;
        cv.width = PREV; cv.height = PREV;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PREV, PREV);
        const B = 4;
        _layoutActual.celdas.forEach(([x, y, w, h], i) => {
            const img = _imgsCollage[i];
            if (!img) return;
            dibujarCubriendo(ctx, img, x * PREV + B / 2, y * PREV + B / 2, w * PREV - B, h * PREV - B, _offsets[i]);
            // Número de la imagen, para relacionarla con el orden
            ctx.save();
            ctx.fillStyle = 'rgba(15,23,42,.75)';
            ctx.fillRect(x * PREV + 4, y * PREV + 4, 20, 18);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
            ctx.fillText(String(i + 1), x * PREV + 10, y * PREV + 17);
            ctx.restore();
        });
    }

    function celdaEn(px, py) {
        if (!_layoutActual) return -1;
        return _layoutActual.celdas.findIndex(([x, y, w, h]) =>
            px >= x && px <= x + w && py >= y && py <= y + h);
    }

    function enlazarEditor() {
        const cv = document.getElementById('mkCanvas');
        if (!cv || cv.dataset.bound) return;
        cv.dataset.bound = '1';
        let activo = -1, px0 = 0, py0 = 0, off0 = null, rect = null;

        cv.addEventListener('pointerdown', e => {
            rect = cv.getBoundingClientRect();
            const rx = (e.clientX - rect.left) / rect.width;
            const ry = (e.clientY - rect.top) / rect.height;
            activo = celdaEn(rx, ry);
            if (activo < 0) return;
            cv.setPointerCapture(e.pointerId);
            px0 = e.clientX; py0 = e.clientY;
            off0 = { ..._offsets[activo] };
        });

        cv.addEventListener('pointermove', e => {
            if (activo < 0 || !rect) return;
            const img = _imgsCollage[activo];
            const [cx, cy, cw, ch] = _layoutActual.celdas[activo];
            const w = cw * PREV, h = ch * PREV;
            const escala = Math.max(w / img.width, h / img.height);
            const sobraX = img.width * escala - w;
            const sobraY = img.height * escala - h;
            // Escala de pantalla -> lienzo
            const k = PREV / rect.width;
            const dx = (e.clientX - px0) * k;
            const dy = (e.clientY - py0) * k;
            const nx = sobraX > 0 ? off0.x - dx / sobraX : 0.5;
            const ny = sobraY > 0 ? off0.y - dy / sobraY : 0.5;
            _offsets[activo] = { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) };
            dibujarPreview();
        });

        const soltar = async () => {
            if (activo < 0) return;
            activo = -1;
            await generarCollage(_layoutActual);   // imagen final con el nuevo encuadre
        };
        cv.addEventListener('pointerup', soltar);
        cv.addEventListener('pointercancel', soltar);
    }

    const LAYOUTS = {
        2: [
            { id: 'h', nombre: 'Lado a lado', celdas: [[0, 0, .5, 1], [.5, 0, .5, 1]] },
            { id: 'v', nombre: 'Una sobre otra', celdas: [[0, 0, 1, .5], [0, .5, 1, .5]] }
        ],
        3: [
            { id: '1-2', nombre: '1 arriba, 2 abajo', celdas: [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] },
            { id: '2-1', nombre: '2 arriba, 1 abajo', celdas: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, 1, .5]] },
            { id: 'v3', nombre: 'En columna', celdas: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] }
        ],
        4: [
            { id: '2x2', nombre: 'Cuadrícula', celdas: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] },
            { id: 'v4', nombre: 'En columna', celdas: [[0, 0, 1, .25], [0, .25, 1, .25], [0, .5, 1, .25], [0, .75, 1, .25]] },
            { id: '1-3', nombre: '1 grande, 3 abajo', celdas: [[0, 0, 1, .6], [0, .6, 1 / 3, .4], [1 / 3, .6, 1 / 3, .4], [2 / 3, .6, 1 / 3, .4] ] }
        ]
    };

    async function onGaleriaElegida() {
        const files = Array.from(document.getElementById('mkGaleria').files || []);
        if (!files.length) return;
        if (files.length > 4) {
            _showModal('Máximo 4 imágenes', 'Puedes combinar hasta <strong>4 fotos</strong> en el collage. Se tomarán las primeras 4.');
        }
        const sel = files.slice(0, 4);

        // Una sola imagen: no hay collage que hacer
        if (sel.length === 1) {
            _imgsCollage = []; _offsets = [];
            document.getElementById('mkCollageOpts').classList.add('hidden');
            document.getElementById('mkEditor').classList.add('hidden');
            mostrarPreview(sel[0]);
            return;
        }

        try {
            _imgsCollage = await Promise.all(sel.map(cargarImagen));
            _offsets = _imgsCollage.map(() => ({ x: 0.5, y: 0.5 }));  // centradas
            _intercambioOrigen = null;
            renderLayouts();
            renderOrden();
            await generarCollage(LAYOUTS[_imgsCollage.length][0]);
            document.getElementById('mkEditor').classList.remove('hidden');
            document.getElementById('mkPreview').classList.add('hidden');
            enlazarEditor();
            dibujarPreview();
        } catch (e) {
            console.error('Collage:', e);
            _showModal('Error', 'No se pudieron procesar las imágenes seleccionadas.');
        }
    }

    function cargarImagen(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    function renderLayouts() {
        const cont = document.getElementById('mkLayouts');
        const opts = LAYOUTS[_imgsCollage.length] || [];
        document.getElementById('mkCollageOpts').classList.remove('hidden');
        cont.innerHTML = opts.map((l, i) => `
            <button type="button" data-i="${i}" class="mk-layout px-2 py-2 border rounded-lg text-[10px] font-bold transition ${i === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}">
                ${miniatura(l)}
                <span class="block mt-1 leading-tight">${l.nombre}</span>
            </button>`).join('');
        cont.querySelectorAll('.mk-layout').forEach(b => b.addEventListener('click', async () => {
            cont.querySelectorAll('.mk-layout').forEach((x, j) => {
                const act = Number(b.dataset.i) === j;
                x.className = `mk-layout px-2 py-2 border rounded-lg text-[10px] font-bold transition ${act ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`;
            });
            await generarCollage(opts[Number(b.dataset.i)]);
            dibujarPreview();
        }));
    }

    // ── Orden de las imágenes dentro de la composición ──
    // En el teléfono arrastrar es incómodo, así que se intercambian tocando
    // una imagen y luego la otra.
    let _intercambioOrigen = null;

    function renderOrden() {
        const cont = document.getElementById('mkOrden');
        if (!cont) return;
        cont.innerHTML = _imgsCollage.map((img, i) => `
            <button type="button" data-i="${i}" class="mk-ord relative rounded-lg overflow-hidden border-2 ${_intercambioOrigen === i ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-slate-300'} transition">
                <img src="${img.src}" class="w-full h-14 object-cover">
                <span class="absolute top-0.5 left-0.5 bg-slate-800/80 text-white text-[9px] font-black rounded px-1">${i + 1}</span>
            </button>`).join('');
        cont.querySelectorAll('.mk-ord').forEach(b => b.addEventListener('click', async () => {
            const i = Number(b.dataset.i);
            if (_intercambioOrigen === null) {
                _intercambioOrigen = i;           // primera selección
                renderOrden();
            } else if (_intercambioOrigen === i) {
                _intercambioOrigen = null;        // se canceló
                renderOrden();
            } else {
                const a = _intercambioOrigen;
                [_imgsCollage[a], _imgsCollage[i]] = [_imgsCollage[i], _imgsCollage[a]];
                [_offsets[a], _offsets[i]] = [_offsets[i], _offsets[a]];
                _intercambioOrigen = null;
                renderOrden();
                await generarCollage(_layoutActual);
                dibujarPreview();
            }
        }));
    }

    // Diagrama simple de la composición
    function miniatura(l) {
        const rects = l.celdas.map(([x, y, w, h]) =>
            `<rect x="${x * 30 + 1}" y="${y * 30 + 1}" width="${w * 30 - 2}" height="${h * 30 - 2}" rx="1.5" fill="currentColor" opacity="0.5"/>`).join('');
        return `<svg viewBox="0 0 32 32" class="w-7 h-7 mx-auto">${rects}</svg>`;
    }

    // Dibuja la imagen recortada para llenar la celda sin deformarse.
    // `off` {x,y} va de 0 a 1 e indica QUÉ PARTE de la imagen se ve:
    // 0.5 es el centro (por defecto), 0 el borde izquierdo/superior, 1 el opuesto.
    function dibujarCubriendo(ctx, img, x, y, w, h, off) {
        const escala = Math.max(w / img.width, h / img.height);
        const nw = img.width * escala, nh = img.height * escala;
        const ox = off && typeof off.x === 'number' ? off.x : 0.5;
        const oy = off && typeof off.y === 'number' ? off.y : 0.5;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.drawImage(img, x + (w - nw) * ox, y + (h - nh) * oy, nw, nh);
        ctx.restore();
    }

    let _layoutActual = null;

    async function generarCollage(layout) {
        _layoutActual = layout;
        const LADO = 1200, BORDE = 8;
        const canvas = document.createElement('canvas');
        canvas.width = LADO; canvas.height = LADO;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, LADO, LADO);

        layout.celdas.forEach(([x, y, w, h], i) => {
            const img = _imgsCollage[i];
            if (!img) return;
            dibujarCubriendo(ctx, img,
                x * LADO + BORDE / 2, y * LADO + BORDE / 2,
                w * LADO - BORDE, h * LADO - BORDE, _offsets[i]);
        });

        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
        if (!blob) { _showModal('Error', 'No se pudo generar el collage.'); return; }
        mostrarPreview(new File([blob], `gestion_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }

    // ── Texto del comprobante (formato exacto acordado) ──
    function construirTexto() {
        const hoy = new Date();
        const g = (_sel.gestion !== null) ? _cfg.gestiones[_sel.gestion] : null;
        const eq = _cfg.equipo || {};
        const cli = _sel.cliente ? (_sel.cliente.nombreComercial || _sel.cliente.nombrePersonal || '') : '';
        const lineas = [
            `Visita en Gestión: ${DIAS[hoy.getDay()]} ${hoy.getDate()}`,
            `📅 Mes: ${MESES[hoy.getMonth()]}`,
            `👤 Cliente: ${cli}`,
            `🎯 Proposito: ${g ? g.nombre : ''}`,
            `🏷️ Marca: ${g && g.marca ? g.marca : 'Multimarca'}`,
            `      GNV: ${eq.GNV || ''}`,
            `📊 GAV: ${eq.GAV || ''}`,
            `📈 GTV: ${eq.GTV || ''}`,
            `👥 CDV: ${eq.CDV || ''}`,
            `🎤 TV: ${eq.TV || ''}`,
            `📋 FQ: ${eq.FQ || ''}`
        ];
        return lineas.join('\n');
    }

    function actualizarTexto() {
        const listo = _sel.cliente && _sel.gestion !== null;
        const paso4 = document.getElementById('mkPaso4');
        if (!paso4) return;
        paso4.classList.toggle('hidden', !listo);
        if (listo) document.getElementById('mkTexto').textContent = construirTexto();
    }

    async function compartir() {
        const texto = construirTexto();
        const btn = document.getElementById('mkCompartir');
        btn.disabled = true;

        try {
            // Con foto: se comparte la imagen junto al texto (WhatsApp la toma como pie)
            if (_sel.archivo && navigator.canShare && navigator.canShare({ files: [_sel.archivo] })) {
                await navigator.share({ files: [_sel.archivo], text: texto, title: 'Visita en Gestión' });
            } else if (navigator.share) {
                await navigator.share({ text: texto, title: 'Visita en Gestión' });
                if (_sel.archivo) {
                    _showModal('Atención', 'Este dispositivo no permite enviar la imagen junto al texto. El texto ya se compartió; adjunta la foto manualmente en WhatsApp.');
                }
            } else {
                // Respaldo: abrir WhatsApp con el texto ya escrito
                window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
            }
        } catch (e) {
            if (e && e.name !== 'AbortError') {
                console.warn('Mercadeo compartir:', e);
                window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
            }
        } finally {
            btn.disabled = false;
        }

        // Respaldo de la ejecución (no bloquea el envío: va en segundo plano)
        guardarEnHistorial(texto).catch(err => console.warn('Historial mercadeo:', err));
    }

    // Reduce la imagen antes de archivarla, para no llenar el almacenamiento.
    async function reducirImagen(file, ladoMax = 900, calidad = 0.72) {
        try {
            const img = await cargarImagen(file);
            const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
            const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', calidad));
            return blob || file;
        } catch (e) { return file; }
    }

    async function guardarEnHistorial(texto) {
        if (!_sel.archivo || !_sel.cliente) return;
        const g = (_sel.gestion !== null) ? _cfg.gestiones[_sel.gestion] : {};
        const ahora = new Date();
        try {
            const blob = await reducirImagen(_sel.archivo);
            const nombre = `MERCADEO_${ahora.getTime()}.jpg`;
            const ruta = `clientes/${_sel.cliente.id}/imagenes/${nombre}`;
            const ref = window.firebaseStorageFunctions.ref(_storage, ruta);
            await window.firebaseStorageFunctions.uploadBytes(ref, blob);
            const url = await window.firebaseStorageFunctions.getDownloadURL(ref);

            const docRef = _doc(_collection(_db, pathHistorial()));
            await _setDoc(docRef, {
                clienteId: _sel.cliente.id,
                clienteNombre: _sel.cliente.nombreComercial || _sel.cliente.nombrePersonal || '',
                gestion: g.nombre || '',
                marca: g.marca || '',
                texto,
                url, storagePath: ruta,
                fecha: ahora.toISOString(),
                creadoPor: _userId
            });
            console.log('Mercadeo: ejecución archivada.');
        } catch (e) {
            console.warn('No se pudo archivar la ejecución:', e);
        }
    }

    // ═══════════════ HISTORIAL DE EJECUCIONES (solo admin) ═══════════════
    let _histCache = null;

    async function verHistorial() {
        if (!esAdmin()) return;
        document.getElementById('mkHistOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'mkHistOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-slate-200">
                <div class="bg-slate-800 text-white px-4 py-3 shrink-0">
                    <div class="font-semibold text-sm">Historial de ejecuciones</div>
                    <div class="text-[10px] text-slate-400">Comprobantes archivados al compartir</div>
                </div>
                <div class="px-4 pt-3 shrink-0">
                    <input type="text" id="mkHistBuscar" placeholder="Buscar por cliente..." autocomplete="off"
                           class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-400">
                </div>
                <div id="mkHistLista" class="p-4 overflow-y-auto flex-1">
                    <p class="text-sm text-slate-400 text-center py-6 animate-pulse">Cargando historial...</p>
                </div>
                <div class="p-3 border-t border-slate-100 shrink-0">
                    <button id="mkHistCerrar" class="w-full py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('mkHistCerrar').addEventListener('click', () => ov.remove());

        try {
            const snap = await _getDocs(_collection(_db, pathHistorial()));
            _histCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));   // más recientes primero
            pintarHistorial('');
            document.getElementById('mkHistBuscar').addEventListener('input', e => pintarHistorial(e.target.value));
        } catch (e) {
            console.error('Historial mercadeo:', e);
            document.getElementById('mkHistLista').innerHTML = '<p class="text-sm text-red-500 text-center py-6">No se pudo cargar el historial.</p>';
        }
    }

    function pintarHistorial(filtro) {
        const cont = document.getElementById('mkHistLista');
        if (!cont) return;
        const t = (filtro || '').toLowerCase().trim();
        const lista = (_histCache || []).filter(h => !t || (h.clienteNombre || '').toLowerCase().includes(t));
        if (!lista.length) {
            cont.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">${t ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay ejecuciones archivadas.'}</p>`;
            return;
        }
        cont.innerHTML = lista.slice(0, 120).map(h => {
            const f = new Date(h.fecha);
            const fechaStr = isNaN(f.getTime()) ? '' : f.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
            return `
            <button type="button" data-id="${h.id}" class="mk-hist-item w-full text-left flex gap-2 border border-slate-200 rounded-lg p-2 mb-1.5 hover:bg-slate-50 hover:border-slate-400 transition">
                <img src="${h.url}" loading="lazy" class="w-14 h-14 object-cover rounded border border-slate-200 shrink-0 bg-slate-100">
                <div class="min-w-0 flex-1">
                    <div class="text-xs font-semibold text-slate-800 truncate">${h.clienteNombre || '(sin cliente)'}</div>
                    <div class="text-[10px] text-slate-500 truncate">${h.gestion || ''}${h.marca ? ' · ' + h.marca : ''}</div>
                    <div class="text-[10px] text-slate-400">${fechaStr}</div>
                </div>
            </button>`;
        }).join('');
        cont.querySelectorAll('.mk-hist-item').forEach(b => b.addEventListener('click', () => {
            const h = (_histCache || []).find(x => x.id === b.dataset.id);
            if (h) verEjecucion(h);
        }));
    }

    function verEjecucion(h) {
        document.getElementById('mkVerOverlay')?.remove();
        const f = new Date(h.fecha);
        const fechaStr = isNaN(f.getTime()) ? '' : f.toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'short' });
        const ov = document.createElement('div');
        ov.id = 'mkVerOverlay';
        ov.className = 'fixed inset-0 z-[10000] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="bg-slate-800 text-white px-4 py-3 shrink-0">
                    <div class="font-bold text-sm truncate">${h.clienteNombre || ''}</div>
                    <div class="text-[11px] text-slate-300">${fechaStr}</div>
                </div>
                <div class="p-3 overflow-y-auto flex-1">
                    <img src="${h.url}" class="w-full rounded-lg border border-slate-200">
                    <pre class="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-700 whitespace-pre-wrap font-sans">${h.texto || ''}</pre>
                </div>
                <div class="p-3 border-t shrink-0 grid grid-cols-2 gap-2">
                    <a href="${h.url}" target="_blank" rel="noopener" class="py-2.5 bg-slate-800 text-white rounded-lg font-bold text-sm text-center">Abrir imagen</a>
                    <button id="mkVerCerrar" class="py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('mkVerCerrar').addEventListener('click', () => ov.remove());
    }

    // ═══════════════ EDITAR GESTIONES (solo admin) ═══════════════
    function editarGestiones() {
        if (!esAdmin()) return;
        document.getElementById('mkCfgOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'mkCfgOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4';

        const filaGestion = (g, i) => `
            <div class="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
                <input type="text" value="${(g.nombre || '').replace(/"/g, '&quot;')}" data-i="${i}" data-campo="nombre" class="mk-g-inp flex-1 min-w-0 text-xs border border-transparent hover:border-slate-300 focus:border-slate-400 rounded px-1 py-1 outline-none">
                <input type="text" value="${(g.marca || '').replace(/"/g, '&quot;')}" data-i="${i}" data-campo="marca" placeholder="Marca" class="mk-g-inp w-24 shrink-0 text-[11px] border border-transparent hover:border-slate-300 focus:border-slate-400 rounded px-1 py-1 outline-none">
                <button data-i="${i}" class="mk-g-del text-[10px] text-red-500 font-bold shrink-0">Quitar</button>
            </div>`;

        const campoEquipo = (k, etiqueta) => `
            <div class="flex items-center gap-2 py-1">
                <span class="w-12 shrink-0 text-[11px] font-bold text-slate-500">${etiqueta}</span>
                <input type="text" value="${(_cfg.equipo[k] || '').replace(/"/g, '&quot;')}" data-k="${k}" class="mk-e-inp flex-1 min-w-0 text-xs border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-slate-400">
            </div>`;

        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-slate-200">
                <div class="bg-slate-800 text-white px-4 py-3 shrink-0">
                    <div class="font-semibold text-sm">Edit Formato</div>
                    <div class="text-[10px] text-slate-400">Tipos de gestión y datos del equipo</div>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipos de gestión</p>
                    <div id="mkCfgGest" class="border border-slate-200 rounded-lg max-h-48 overflow-y-auto"></div>
                    <div class="flex gap-2 mt-2">
                        <input type="text" id="mkGestNueva" placeholder="Nueva gestión..." class="flex-1 min-w-0 px-2.5 py-2 border border-slate-300 rounded-lg text-xs outline-none">
                        <button id="mkGestAdd" class="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg">Agregar</button>
                    </div>

                    <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Datos del equipo</p>
                    ${['GNV', 'GAV', 'GTV', 'CDV', 'TV', 'FQ'].map(k => campoEquipo(k, k)).join('')}
                </div>
                <div class="p-3 border-t shrink-0 grid grid-cols-2 gap-2">
                    <button id="mkCfgGuardar" class="py-2.5 bg-slate-800 text-white rounded-lg font-bold text-sm">Guardar</button>
                    <button id="mkCfgCerrar" class="py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('mkCfgCerrar').addEventListener('click', () => ov.remove());

        const pintar = () => {
            document.getElementById('mkCfgGest').innerHTML = _cfg.gestiones.map(filaGestion).join('');
            document.querySelectorAll('.mk-g-inp').forEach(i => i.addEventListener('input', () => {
                _cfg.gestiones[Number(i.dataset.i)][i.dataset.campo] = i.value;
            }));
            document.querySelectorAll('.mk-g-del').forEach(b => b.addEventListener('click', () => {
                _cfg.gestiones.splice(Number(b.dataset.i), 1); pintar();
            }));
        };
        pintar();
        document.getElementById('mkGestAdd').addEventListener('click', () => {
            const v = document.getElementById('mkGestNueva').value.trim();
            if (!v) return;
            _cfg.gestiones.push({ nombre: v, marca: 'Multimarca' });
            document.getElementById('mkGestNueva').value = '';
            pintar();
        });
        document.querySelectorAll('.mk-e-inp').forEach(i => i.addEventListener('input', () => {
            _cfg.equipo[i.dataset.k] = i.value;
        }));

        document.getElementById('mkCfgGuardar').addEventListener('click', async () => {
            const limpias = _cfg.gestiones
                .map(g => ({ nombre: (g.nombre || '').trim(), marca: (g.marca || '').trim() }))
                .filter(g => g.nombre);
            try {
                await _setDoc(_doc(_db, pathConfig()), {
                    gestiones: limpias, equipo: _cfg.equipo,
                    actualizado: new Date().toISOString(), actualizadoPor: _userId
                });
                _cfg.gestiones = limpias;
                ov.remove();
                _sel.gestion = null;
                renderGestiones();
                actualizarTexto();
                _showModal('Guardado', 'La configuración de mercadeo se actualizó.');
            } catch (e) { _showModal('Error', 'No se pudo guardar la configuración.'); }
        });
    }

})();

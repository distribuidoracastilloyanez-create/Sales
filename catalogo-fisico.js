// ═══════════════════════════════════════════════════════════════════════
// CATÁLOGO FÍSICO / PRESENTACIÓN
//
// Capa de PRESENTACIÓN sobre el catálogo maestro: imágenes de producto,
// logos de marca y textos. No toca precios, stock ni definiciones; solo
// decide qué se muestra y cómo se ve en el catálogo impreso/digital.
//
// Datos:
//   config/catalogo_fisico        → título, subtítulo, intro por categoría
//   catalogo_fisico_items/{prodId}→ imagen, visible, orden, descripción
//   catalogo_fisico_marcas/{id}   → logo de la marca y su orden
// Imágenes: Storage en catalogo/… (regla propia en Firebase)
// ═══════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _storage, _userId, _mainContent, _showModal, _volver;
    let _collection, _doc, _getDoc, _getDocs, _setDoc;

    window.initCatalogoFisico = function (deps) {
        _db          = deps.db;
        _storage     = deps.storage;
        _userId      = deps.userId;
        _mainContent = deps.mainContent;
        _showModal   = deps.showModal;
        _collection  = deps.collection;
        _doc         = deps.doc;
        _getDoc      = deps.getDoc;
        _getDocs     = deps.getDocs;
        _setDoc      = deps.setDoc;
    };

    const PUB = () => window.AppConfig.PUBLIC_DATA_ID;
    const pConfig = () => `artifacts/${PUB()}/public/data/config/catalogo_fisico`;
    const pItems  = () => `artifacts/${PUB()}/public/data/catalogo_fisico_items`;
    const pMarcas = () => `artifacts/${PUB()}/public/data/catalogo_fisico_marcas`;
    const esAdmin = () => window.userRole === 'admin';
    const idMarca = (m) => (m || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'SIN_MARCA';

    const CFG_DEFAULT = {
        titulo: 'Catálogo de Productos',
        empresa: 'DISTRIBUIDORA CASTILLO YAÑEZ',
        pie: 'DISTRIBUIDORA CASTILLO YAÑEZ, C.A.',
        anio: new Date().getFullYear(),
        logoUrl: '',
        categorias: {}       // { RUBRO: { intro, subtitulo, orden } }
    };

    let _cfg = JSON.parse(JSON.stringify(CFG_DEFAULT));
    let _productos = [];
    let _items = {};      // productoId -> datos de presentación
    let _marcas = {};      // idMarca -> { logoUrl, ... }
    let _filtro = { rubro: '', marca: '', estado: '' , texto: '' };

    // ─────────────────────────── CARGA ───────────────────────────
    async function cargarTodo() {
        const [cfgSnap, prodSnap, itSnap, mkSnap] = await Promise.all([
            _getDoc(_doc(_db, pConfig())).catch(() => null),
            (window.getCatalogoSnapshot ? window.getCatalogoSnapshot() : _getDocs(_collection(_db, `artifacts/${PUB()}/public/data/productos`))),
            _getDocs(_collection(_db, pItems())).catch(() => ({ docs: [] })),
            _getDocs(_collection(_db, pMarcas())).catch(() => ({ docs: [] }))
        ]);
        if (cfgSnap && cfgSnap.exists()) _cfg = { ...CFG_DEFAULT, ...cfgSnap.data(), categorias: (cfgSnap.data().categorias || {}) };
        _productos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        try { const fn = window.getGlobalProductSortFunction ? await window.getGlobalProductSortFunction() : null; if (fn) _productos.sort(fn); } catch (e) {}
        _items = {}; itSnap.docs.forEach(d => { _items[d.id] = d.data(); });
        _marcas = {}; mkSnap.docs.forEach(d => { _marcas[d.id] = d.data(); });
    }

    const uniq = a => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y));
    const visible = p => (_items[p.id] || {}).visible !== false;   // por defecto se muestra
    const imagenDe = p => (_items[p.id] || {}).imagenUrl || '';

    // ─────────────────────── PANTALLA EDITOR ───────────────────────
    window.showCatalogoFisico = async function (volverFn) {
        if (volverFn) _volver = volverFn;
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-3xl mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="px-4 py-3 flex items-center justify-between" style="background:#16305C">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Físico / Presentación</h2>
                            <p class="text-[10px] mt-0.5" style="color:#BBD2EE">Catálogo impreso y digital</p>
                        </div>
                        <button id="cfBack" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition">Volver</button>
                    </div>
                    <div class="p-4">
                        <div id="cfLoading" class="text-center py-10 text-slate-400 text-sm animate-pulse">Cargando catálogo...</div>
                        <div id="cfBody" class="hidden">
                            <div class="grid grid-cols-2 gap-2 mb-3">
                                <button id="cfVerCatalogo" class="py-2.5 text-white rounded-lg font-bold text-sm transition" style="background:#16305C">Ver / Imprimir</button>
                                ${esAdmin() ? `<button id="cfAjustes" class="py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 border border-slate-300">Ajustes</button>` : '<div></div>'}
                            </div>

                            <div id="cfResumen" class="mb-3"></div>

                            ${esAdmin() ? `
                            <div class="grid grid-cols-3 gap-1.5 mb-1.5">
                                <select id="cfFRubro" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Rubro</option></select>
                                <select id="cfFMarca" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Marca</option></select>
                                <select id="cfFEstado" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none">
                                    <option value="">Todos</option><option value="sin">Sin foto</option><option value="con">Con foto</option><option value="off">Ocultos</option>
                                </select>
                            </div>
                            <input type="text" id="cfBuscar" placeholder="Buscar producto..." class="w-full text-xs border border-slate-300 rounded-md p-2 mb-2 outline-none focus:ring-2 focus:ring-slate-400">
                            <div id="cfLista" class="max-h-[46vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100"></div>
                            <input type="file" id="cfFoto" accept="image/*" class="hidden">
                            <input type="file" id="cfLogo" accept="image/*" class="hidden">
                            ` : '<p class="text-xs text-slate-500">Solo los administradores pueden editar el catálogo.</p>'}
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('cfBack').addEventListener('click', () => {
            if (_volver) _volver(); else if (window.showCatalogoSubMenu) window.showCatalogoSubMenu();
        });

        try { await cargarTodo(); }
        catch (e) {
            console.error('Catálogo físico:', e);
            document.getElementById('cfLoading').innerHTML = '<span class="text-red-500">Error al cargar.</span>';
            return;
        }
        document.getElementById('cfLoading').classList.add('hidden');
        document.getElementById('cfBody').classList.remove('hidden');
        document.getElementById('cfVerCatalogo').addEventListener('click', () => abrirCatalogo());
        document.getElementById('cfAjustes')?.addEventListener('click', abrirAjustes);

        if (esAdmin()) {
            document.getElementById('cfFRubro').innerHTML = '<option value="">Rubro</option>' + uniq(_productos.map(p => p.rubro)).map(v => `<option>${v}</option>`).join('');
            ['cfFRubro', 'cfFMarca', 'cfFEstado'].forEach(id => document.getElementById(id).addEventListener('change', e => {
                _filtro[id === 'cfFRubro' ? 'rubro' : id === 'cfFMarca' ? 'marca' : 'estado'] = e.target.value;
                renderLista();
            }));
            document.getElementById('cfBuscar').addEventListener('input', e => { _filtro.texto = e.target.value; renderLista(); });
            renderLista();
        }
        renderResumen();
    };

    function renderResumen() {
        const cont = document.getElementById('cfResumen');
        if (!cont) return;
        const incl = _productos.filter(visible);
        const conFoto = incl.filter(p => imagenDe(p)).length;
        const pct = incl.length ? Math.round(conFoto * 100 / incl.length) : 0;
        cont.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <div class="flex justify-between text-[11px] font-semibold text-slate-600">
                    <span>${conFoto} de ${incl.length} productos con foto</span><span>${pct}%</span>
                </div>
                <div class="h-1.5 bg-slate-200 rounded mt-1 overflow-hidden"><div class="h-full" style="width:${pct}%;background:#16305C"></div></div>
                <div class="text-[10px] text-slate-400 mt-1">${uniq(incl.map(p => p.rubro)).length} categorías · ${uniq(incl.map(p => p.marca)).length} marcas</div>
            </div>`;
    }

    function renderLista() {
        const cont = document.getElementById('cfLista');
        if (!cont) return;
        const rv = _filtro.rubro, mv = _filtro.marca, est = _filtro.estado;
        const q = (_filtro.texto || '').toLowerCase().trim();

        document.getElementById('cfFMarca').innerHTML = '<option value="">Marca</option>' +
            uniq(_productos.filter(p => !rv || p.rubro === rv).map(p => p.marca)).map(v => `<option ${v === mv ? 'selected' : ''}>${v}</option>`).join('');

        let lista = _productos.filter(p => (!rv || p.rubro === rv) && (!mv || p.marca === mv) &&
            (!q || [p.presentacion, p.marca, p.segmento].filter(Boolean).join(' ').toLowerCase().includes(q)));
        if (est === 'sin') lista = lista.filter(p => !imagenDe(p));
        if (est === 'con') lista = lista.filter(p => imagenDe(p));
        if (est === 'off') lista = lista.filter(p => !visible(p));

        if (!lista.length) { cont.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Sin productos.</p>'; return; }

        // Encabezado de marca con su logo, para poder cargarlo
        let html = '', marcaPrev = null;
        lista.slice(0, 300).forEach(p => {
            if (p.marca !== marcaPrev) {
                marcaPrev = p.marca;
                const mk = _marcas[idMarca(p.marca)] || {};
                html += `<div class="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 sticky top-0">
                    <div class="w-7 h-7 rounded-full border overflow-hidden bg-white flex items-center justify-center shrink-0" style="border-color:#16305C">
                        ${mk.logoUrl ? `<img src="${mk.logoUrl}" class="w-full h-full object-contain">` : '<span class="text-[6px] font-bold" style="color:#16305C">LOGO</span>'}
                    </div>
                    <span class="text-[11px] font-black flex-1 truncate" style="color:#16305C">${p.marca || 'SIN MARCA'}</span>
                    <button data-marca="${(p.marca || '').replace(/"/g, '&quot;')}" class="cf-logo text-[10px] font-bold underline" style="color:#2E75B6">Logo</button>
                </div>`;
            }
            const img = imagenDe(p), vis = visible(p);
            html += `<div class="flex items-center gap-2 px-2.5 py-1.5 ${vis ? '' : 'opacity-40'}">
                <button data-id="${p.id}" class="cf-foto w-12 h-12 rounded border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                    ${img ? `<img src="${img}" class="w-full h-full object-contain">` : '<span class="text-[8px] text-slate-400">+ foto</span>'}
                </button>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-semibold text-slate-800 truncate">${p.presentacion || ''}</div>
                    <div class="text-[10px] text-slate-400 truncate">${p.unidadesPorCaja ? p.unidadesPorCaja + ' und/caja' : ''}</div>
                </div>
                <button data-id="${p.id}" class="cf-vis text-[10px] font-bold px-2 py-1 rounded shrink-0 ${vis ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${vis ? 'Visible' : 'Oculto'}</button>
            </div>`;
        });
        cont.innerHTML = html;

        cont.querySelectorAll('.cf-foto').forEach(b => b.addEventListener('click', () => subirFoto(b.dataset.id)));
        cont.querySelectorAll('.cf-vis').forEach(b => b.addEventListener('click', () => alternarVisible(b.dataset.id)));
        cont.querySelectorAll('.cf-logo').forEach(b => b.addEventListener('click', () => subirLogo(b.dataset.marca)));
    }

    // ─────────────────────── SUBIDA DE IMÁGENES ───────────────────────
    // Se reducen antes de subir: el catálogo no necesita alta resolución.
    async function reducir(file, lado = 700, calidad = 0.82) {
        try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
            const k = Math.min(1, lado / Math.max(img.width, img.height));
            const w = Math.round(img.width * k), h = Math.round(img.height * k);
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            return await new Promise(r => cv.toBlob(r, 'image/jpeg', calidad)) || file;
        } catch (e) { return file; }
    }

    function pedirArchivo(inputId) {
        return new Promise(resolve => {
            const inp = document.getElementById(inputId);
            inp.value = '';
            inp.onchange = () => resolve(inp.files?.[0] || null);
            inp.click();
        });
    }

    async function subirFoto(prodId) {
        const file = await pedirArchivo('cfFoto');
        if (!file) return;
        _showModal('Subiendo', 'Procesando la imagen...', null, '', null, false);
        try {
            const blob = await reducir(file);
            const ruta = `catalogo/productos/${prodId}_${Date.now()}.jpg`;
            const ref = window.firebaseStorageFunctions.ref(_storage, ruta);
            await window.firebaseStorageFunctions.uploadBytes(ref, blob);
            const url = await window.firebaseStorageFunctions.getDownloadURL(ref);
            await _setDoc(_doc(_db, pItems(), prodId), { imagenUrl: url, storagePath: ruta, actualizado: new Date().toISOString(), actualizadoPor: _userId }, { merge: true });
            _items[prodId] = { ...(_items[prodId] || {}), imagenUrl: url, storagePath: ruta };
            document.getElementById('modalContainer')?.classList.add('hidden');
            renderLista(); renderResumen();
        } catch (e) {
            console.error(e);
            _showModal('Error', 'No se pudo subir la imagen. Verifica que las reglas de Storage permitan la carpeta <strong>catalogo/</strong>.');
        }
    }

    async function subirLogo(marca) {
        const file = await pedirArchivo('cfLogo');
        if (!file) return;
        _showModal('Subiendo', 'Procesando el logo...', null, '', null, false);
        try {
            const blob = await reducir(file, 300, 0.85);
            const mid = idMarca(marca);
            const ruta = `catalogo/marcas/${mid}_${Date.now()}.jpg`;
            const ref = window.firebaseStorageFunctions.ref(_storage, ruta);
            await window.firebaseStorageFunctions.uploadBytes(ref, blob);
            const url = await window.firebaseStorageFunctions.getDownloadURL(ref);
            await _setDoc(_doc(_db, pMarcas(), mid), { marca, logoUrl: url, storagePath: ruta, actualizado: new Date().toISOString() }, { merge: true });
            _marcas[mid] = { ...(_marcas[mid] || {}), marca, logoUrl: url };
            document.getElementById('modalContainer')?.classList.add('hidden');
            renderLista();
        } catch (e) {
            console.error(e);
            _showModal('Error', 'No se pudo subir el logo. Verifica las reglas de Storage para <strong>catalogo/</strong>.');
        }
    }

    async function alternarVisible(prodId) {
        const actual = (_items[prodId] || {}).visible !== false;
        try {
            await _setDoc(_doc(_db, pItems(), prodId), { visible: !actual }, { merge: true });
            _items[prodId] = { ...(_items[prodId] || {}), visible: !actual };
            renderLista(); renderResumen();
        } catch (e) { _showModal('Error', 'No se pudo cambiar la visibilidad.'); }
    }

    // ─────────────────────── AJUSTES ───────────────────────
    function abrirAjustes() {
        const rubros = uniq(_productos.map(p => p.rubro));
        document.getElementById('cfAjOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'cfAjOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="px-4 py-3 text-white shrink-0" style="background:#16305C">
                    <div class="font-semibold text-sm">Ajustes del catálogo</div>
                </div>
                <div class="p-4 overflow-y-auto flex-1 space-y-3">
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Título</label>
                        <input type="text" id="ajTitulo" value="${(_cfg.titulo || '').replace(/"/g, '&quot;')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none mt-1">
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Empresa (cabecera)</label>
                        <input type="text" id="ajEmpresa" value="${(_cfg.empresa || '').replace(/"/g, '&quot;')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none mt-1">
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pie de página</label>
                        <input type="text" id="ajPie" value="${(_cfg.pie || '').replace(/"/g, '&quot;')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none mt-1">
                    </div>
                    <div class="border-t border-slate-200 pt-3">
                        <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Texto introductorio por categoría</p>
                        <p class="text-[9px] text-slate-400 mb-2">Aparece solo en la primera hoja de cada categoría.</p>
                        ${rubros.map(r => {
                            const c = _cfg.categorias[r] || {};
                            return `<div class="mb-2">
                                <div class="text-[11px] font-bold" style="color:#16305C">${r}</div>
                                <input type="text" data-r="${r}" data-k="subtitulo" value="${(c.subtitulo || '').replace(/"/g, '&quot;')}" placeholder="Subtítulo (ej: HARINAS · ACEITES)" class="aj-cat w-full px-2 py-1.5 border border-slate-300 rounded text-[11px] outline-none mt-1">
                                <textarea data-r="${r}" data-k="intro" rows="2" placeholder="Texto introductorio..." class="aj-cat w-full px-2 py-1.5 border border-slate-300 rounded text-[11px] outline-none mt-1">${c.intro || ''}</textarea>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                <div class="p-3 border-t shrink-0 grid grid-cols-2 gap-2">
                    <button id="ajGuardar" class="py-2.5 text-white rounded-lg font-bold text-sm" style="background:#16305C">Guardar</button>
                    <button id="ajCerrar" class="py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('ajCerrar').addEventListener('click', () => ov.remove());
        document.getElementById('ajGuardar').addEventListener('click', async () => {
            _cfg.titulo = document.getElementById('ajTitulo').value.trim();
            _cfg.empresa = document.getElementById('ajEmpresa').value.trim();
            _cfg.pie = document.getElementById('ajPie').value.trim();
            document.querySelectorAll('.aj-cat').forEach(i => {
                const r = i.dataset.r;
                _cfg.categorias[r] = { ...(_cfg.categorias[r] || {}), [i.dataset.k]: i.value.trim() };
            });
            try {
                await _setDoc(_doc(_db, pConfig()), { ..._cfg, actualizado: new Date().toISOString() });
                ov.remove();
                _showModal('Guardado', 'Ajustes del catálogo actualizados.');
            } catch (e) { _showModal('Error', 'No se pudo guardar.'); }
        });
    }

    // ─────────────────── GENERACIÓN DEL CATÁLOGO ───────────────────
    // Se abre en una ventana aparte, ya paginado en tamaño carta vertical,
    // listo para imprimir o guardar como PDF desde el navegador.
    function abrirCatalogo() {
        const incl = _productos.filter(visible);
        if (!incl.length) { _showModal('Sin productos', 'No hay productos marcados como visibles para el catálogo.'); return; }

        // Agrupar: categoría -> marca -> productos (respetando el orden global)
        const porCat = {};
        incl.forEach(p => {
            const r = p.rubro || 'OTROS';
            const m = p.marca || 'SIN MARCA';
            porCat[r] = porCat[r] || {};
            porCat[r][m] = porCat[r][m] || [];
            porCat[r][m].push(p);
        });

        const esc = s => (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const MAX_FILAS = 26;   // capacidad aproximada de una hoja

        let hojas = [];
        Object.keys(porCat).forEach(cat => {
            const marcas = Object.keys(porCat[cat]);
            let actual = [], peso = 0, primera = true;
            marcas.forEach(m => {
                const prods = porCat[cat][m];
                const costo = Math.max(prods.length, Math.ceil(prods.length / 4) * 2) + 2;
                if (peso + costo > MAX_FILAS && actual.length) {
                    hojas.push({ cat, bloques: actual, primera });
                    primera = false; actual = []; peso = 0;
                }
                actual.push({ marca: m, prods });
                peso += costo;
            });
            if (actual.length) hojas.push({ cat, bloques: actual, primera });
        });

        // Numerar hojas por categoría
        const totalPorCat = {};
        hojas.forEach(h => { totalPorCat[h.cat] = (totalPorCat[h.cat] || 0) + 1; });
        const idxPorCat = {};

        const htmlHojas = hojas.map(h => {
            idxPorCat[h.cat] = (idxPorCat[h.cat] || 0) + 1;
            const c = _cfg.categorias[h.cat] || {};
            const bloques = h.bloques.map(b => {
                const mk = _marcas[idMarca(b.marca)] || {};
                const filas = b.prods.map(p => `<tr><td>${esc(p.presentacion)}</td><td class="c">${p.unidadesPorCaja || ''}</td></tr>`).join('');
                const fotos = b.prods.map(p => {
                    const u = imagenDe(p);
                    return `<div class="f">${u ? `<img src="${esc(u)}">` : '<span>foto</span>'}</div>`;
                }).join('');
                return `<div class="bloque">
                    <div class="mlogo">
                        <div class="circ">${mk.logoUrl ? `<img src="${esc(mk.logoUrl)}">` : 'LOGO'}</div>
                        <div class="nom">${esc(b.marca)}</div>
                    </div>
                    <div class="tabla"><table><thead><tr><th>EMPAQUE</th><th class="c">UND/CAJA</th></tr></thead><tbody>${filas}</tbody></table></div>
                    <div class="fotos">${fotos}</div>
                </div>`;
            }).join('');

            return `<div class="hoja">
                <div class="head">
                    <div><div class="cat">${esc(h.cat)}</div>${c.subtitulo ? `<div class="sub">${esc(c.subtitulo)}</div>` : ''}</div>
                    <div class="dcy">
                        <div class="txt"><div class="n">${esc(_cfg.empresa)}</div><div class="t">${esc(_cfg.titulo)} ${_cfg.anio || ''}</div></div>
                        <div class="iso">${_cfg.logoUrl ? `<img src="${esc(_cfg.logoUrl)}">` : 'DCY'}</div>
                    </div>
                </div>
                ${(h.primera && c.intro) ? `<div class="intro">${esc(c.intro)}</div>` : ''}
                ${bloques}
                <div class="pie"><span>${esc(h.cat)} · hoja ${idxPorCat[h.cat]} de ${totalPorCat[h.cat]}</span><b>${esc(_cfg.pie)}</b></div>
            </div>`;
        }).join('');

        const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(_cfg.titulo)}</title>
<style>
@page{size:letter portrait;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#8a8a8a}
.hoja{width:8.5in;height:11in;position:relative;background:#fff;overflow:hidden;margin:0 auto 14px;page-break-after:always;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.head{padding:.3in .28in .13in;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #16305C}
.cat{font-size:23pt;font-weight:800;color:#16305C;letter-spacing:-.5px;line-height:1}
.sub{font-size:7pt;color:#7F7F7F;margin-top:4px;letter-spacing:.3px}
.dcy{display:flex;align-items:center;gap:9px;text-align:right}
.dcy .n{font-size:8.5pt;font-weight:800;color:#16305C;letter-spacing:.3px}
.dcy .t{font-size:6pt;color:#7F7F7F;letter-spacing:.5px}
.iso{width:.46in;height:.46in;border-radius:50%;background:#16305C;color:#fff;display:flex;align-items:center;justify-content:center;font-size:8pt;font-weight:800;overflow:hidden;flex:0 0 .46in}
.iso img{width:100%;height:100%;object-fit:cover}
.intro{padding:.12in .28in .09in;font-size:7.5pt;color:#595959;line-height:1.45}
.bloque{display:flex;gap:.16in;padding:.12in .28in;border-bottom:1px solid #EDF1F7;align-items:flex-start}
.mlogo{width:.64in;flex:0 0 .64in;text-align:center}
.circ{width:.64in;height:.64in;border-radius:50%;background:#fff;border:2px solid #16305C;display:flex;align-items:center;justify-content:center;font-size:6pt;font-weight:800;color:#16305C;overflow:hidden}
.circ img{width:100%;height:100%;object-fit:contain}
.nom{font-size:6.5pt;font-weight:800;color:#16305C;margin-top:4px;letter-spacing:.2px}
.tabla{flex:0 0 2.9in}
.tabla table{width:100%;border-collapse:collapse;font-size:6.8pt}
.tabla th{background:#16305C;color:#fff;text-align:left;padding:3px 6px;font-size:6pt;font-weight:700;letter-spacing:.4px}
.tabla th.c{text-align:center;width:.55in}
.tabla td{padding:2.6px 7px;border-bottom:1px solid #EDF1F7;color:#404040}
.tabla td.c{text-align:center;font-weight:800;color:#16305C}
.tabla tr:nth-child(even) td{background:#F7F9FC}
.fotos{flex:1;display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start;padding-top:2px}
.f{width:.86in;height:.86in;background:#F7F9FC;border:1px solid #E3E9F2;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:5.5pt;color:#9AA8BC;overflow:hidden}
.f img{width:100%;height:100%;object-fit:contain}
.pie{position:absolute;bottom:0;left:0;right:0;height:.4in;background:#16305C;display:flex;align-items:center;justify-content:space-between;padding:0 .28in;color:#BBD2EE;font-size:6.5pt}
.pie b{color:#fff;letter-spacing:.4px}
.barra{position:sticky;top:0;z-index:10;background:#16305C;color:#fff;padding:9px 14px;display:flex;gap:9px;align-items:center;justify-content:center}
.barra button{background:#fff;color:#16305C;border:0;border-radius:6px;padding:7px 15px;font-weight:800;font-size:12px;cursor:pointer}
.barra span{font-size:11px;color:#BBD2EE}
@media print{.barra{display:none}body{background:#fff}.hoja{margin:0;box-shadow:none}}
</style></head><body>
<div class="barra">
  <button onclick="window.print()">Imprimir / Guardar PDF</button>
  <span>${hojas.length} hoja(s) · tamaño carta vertical</span>
</div>
${htmlHojas}
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) { _showModal('Aviso', 'El navegador bloqueó la ventana. Permite las ventanas emergentes e inténtalo de nuevo.'); return; }
        w.document.open(); w.document.write(doc); w.document.close();
    }

})();

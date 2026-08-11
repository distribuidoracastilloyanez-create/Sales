// ═══════════════════════════════════════════════════════════════
// MÓDULO ACUERDO COMERCIAL (AC)
// Permite al admin fijar un % de descuento por producto para un
// cliente específico. Los descuentos se guardan en una colección
// propia y aislada; no modifican el catálogo ni las ventas pasadas.
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _userId, _appId, _mainContent;
    let _showMainMenu, _showModal;
    let _collection, _doc, _getDoc, _setDoc, _getDocs, _deleteDoc;

    window.initAC = function (deps) {
        _db          = deps.db;
        _userId      = deps.userId;
        _appId       = deps.appId;
        _mainContent = deps.mainContent;
        _showMainMenu = deps.showMainMenu;
        _showModal   = deps.showModal;
        _collection  = deps.collection;
        _doc         = deps.doc;
        _getDoc      = deps.getDoc;
        _setDoc      = deps.setDoc;
        _getDocs     = deps.getDocs;
        _deleteDoc   = deps.deleteDoc;
    };

    const getPublicDataId = () => window.AppConfig.PUBLIC_DATA_ID;
    // Colecciones que solo se LEEN
    const pathClientes  = () => `artifacts/${getPublicDataId()}/public/data/clientes`;
    const pathProductos = () => `artifacts/${getPublicDataId()}/public/data/productos`;
    // Colección NUEVA y aislada de los acuerdos
    const pathAcuerdos  = () => `artifacts/${getPublicDataId()}/public/data/acuerdos_comerciales`;

    let _acClientes  = [];
    let _acProductos = [];
    let _acSortFn    = null;   // orden global (igual que Ventas)
    let _acCliente   = null;   // cliente seleccionado
    let _acAcuerdo   = null;   // acuerdo del cliente { descuentos: {...} }

    const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── API pública para el resto del sistema ──
    //
    // MODELO DE DATOS (compatible hacia atrás):
    //   descuentos: { productoId: {...} }   ← formato LEGADO, se sigue leyendo
    //   reglas: [ {                          ← formato NUEVO
    //       id, alcance: { tipo, valores[], etiqueta },
    //       porcentajes: {cj,paq,und} | pctTotal,
    //       temporalidad: { tipo:'proxima'|'cantidad'|'indefinido', total, restantes },
    //       activo, usos
    //   } ]
    // Alcances: 'producto' | 'productos' | 'rubro' | 'marca' | 'segmento' | 'total'

    window.acGetAcuerdoCliente = async function (clienteId) {
        if (!clienteId || !_db) return null;
        try {
            const snap = await _getDoc(_doc(_db, pathAcuerdos(), clienteId));
            if (!snap.exists()) return null;
            const d = snap.data();
            const tieneLegado = d && d.descuentos && Object.keys(d.descuentos).length;
            const tieneReglas = d && Array.isArray(d.reglas) && d.reglas.length;
            return (tieneLegado || tieneReglas) ? d : null;
        } catch (e) {
            console.warn('AC: no se pudo leer el acuerdo:', e);
            return null;
        }
    };

    // ¿La regla sigue vigente? (temporalidad agotada = no aplica)
    function _reglaVigente(r) {
        if (!r || r.activo === false) return false;
        const t = r.temporalidad || { tipo: 'indefinido' };
        if (t.tipo === 'indefinido') return true;
        return (Number(t.restantes) || 0) > 0;
    }

    // ¿La regla cubre a este producto?
    function _reglaCubreProducto(r, prod) {
        if (!r || !prod) return false;
        const a = r.alcance || {};
        const v = a.valores || [];
        switch (a.tipo) {
            case 'producto':
            case 'productos': return v.includes(prod.id);
            case 'rubro':     return v.includes(prod.rubro);
            case 'marca':     return v.includes(prod.marca);
            case 'segmento':  return v.includes(prod.segmento);
            default:          return false; // 'total' no aplica por producto
        }
    }

    // Reglas de producto vigentes que cubren a un producto (sin las de tipo 'total')
    window.acReglasParaProducto = function (acuerdo, prod) {
        if (!acuerdo || !Array.isArray(acuerdo.reglas) || !prod) return [];
        return acuerdo.reglas.filter(r => _reglaVigente(r) && _reglaCubreProducto(r, prod));
    };

    // Regla vigente de descuento sobre el TOTAL de la venta (o null)
    window.acReglaTotalVenta = function (acuerdo) {
        if (!acuerdo || !Array.isArray(acuerdo.reglas)) return null;
        return acuerdo.reglas.find(r => _reglaVigente(r) && (r.alcance || {}).tipo === 'total') || null;
    };

    // Aplica los descuentos a un objeto de precios {cj,paq,und}.
    // Acepta el producto COMPLETO (nuevo) o solo su id (compatibilidad con
    // versiones anteriores de ventas.js que aún estén en uso en la calle).
    window.acAplicarDescuento = function (acuerdo, productoOrId, precios) {
        const base = { ...(precios || {}) };
        const aplicado = [];
        if (!acuerdo) return { precios: base, aplicado };

        const esObjeto = productoOrId && typeof productoOrId === 'object';
        const prod = esObjeto ? productoOrId : { id: productoOrId };
        const pid = prod.id;

        // 1) Formato NUEVO: reglas por producto/rubro/marca/segmento.
        //    Si se recibió solo el id, únicamente pueden evaluarse las reglas de producto.
        let pct = null, reglaId = null;
        const reglas = (window.acReglasParaProducto(acuerdo, prod) || []);
        if (reglas.length) {
            // No se permiten reglas solapadas al guardar, así que normalmente hay una.
            // Si aun así hubiera varias, gana la más específica.
            const prioridad = { producto: 1, productos: 2, segmento: 3, marca: 4, rubro: 5 };
            reglas.sort((a, b) => (prioridad[(a.alcance || {}).tipo] || 9) - (prioridad[(b.alcance || {}).tipo] || 9));
            pct = reglas[0].porcentajes || {};
            reglaId = reglas[0].id;
        }

        // 2) Formato LEGADO (descuentos por productoId), si no hubo regla nueva.
        if (!pct && acuerdo.descuentos && acuerdo.descuentos[pid]) {
            const d = acuerdo.descuentos[pid];
            if (d.activo !== false) pct = d.porcentajes || {};
        }
        if (!pct) return { precios: base, aplicado };

        ['cj', 'paq', 'und'].forEach(tipo => {
            const p = Number(pct[tipo]) || 0;
            if (p > 0 && base[tipo] > 0) {
                const original = base[tipo];
                const final = original * (1 - p / 100);
                base[tipo] = final;
                aplicado.push({ tipo, porcentaje: p, original, final, reglaId });
            }
        });
        return { precios: base, aplicado, reglaId };
    };

    // Registra el USO de las reglas aplicadas en una venta: descuenta el contador
    // de las temporalidades 'proxima' (1 vez) y 'cantidad' (X ventas).
    // Solo se llama cuando el descuento REALMENTE se aplicó en esa venta.
    window.acRegistrarUsoReglas = async function (clienteId, reglaIds) {
        if (!clienteId || !Array.isArray(reglaIds) || !reglaIds.length || !_db) return;
        const unicos = [...new Set(reglaIds.filter(Boolean))];
        if (!unicos.length) return;
        try {
            const ref = _doc(_db, pathAcuerdos(), clienteId);
            const snap = await _getDoc(ref);
            if (!snap.exists()) return;
            const data = snap.data();
            const reglas = Array.isArray(data.reglas) ? data.reglas : [];
            let cambio = false;
            reglas.forEach(r => {
                if (!unicos.includes(r.id)) return;
                const t = r.temporalidad || { tipo: 'indefinido' };
                if (t.tipo === 'indefinido') return;
                t.restantes = Math.max(0, (Number(t.restantes) || 0) - 1);
                r.temporalidad = t;
                r.usos = (Number(r.usos) || 0) + 1;
                if (t.restantes === 0) r.activo = false; // agotada
                cambio = true;
            });
            if (cambio) await _setDoc(ref, { reglas, actualizado: new Date().toISOString() }, { merge: true });
        } catch (e) {
            console.warn('AC: no se pudo registrar el uso de las reglas.', e);
        }
    };

    // ── PANTALLA PRINCIPAL ──

    const ALCANCES = [
        { k: 'producto',  t: 'Un producto' },
        { k: 'productos', t: 'Varios productos' },
        { k: 'rubro',     t: 'Rubro completo' },
        { k: 'marca',     t: 'Marca completa' },
        { k: 'segmento',  t: 'Segmento completo' },
        { k: 'total',     t: 'Total de la venta' }
    ];

    let _nuevaRegla = { tipo: 'producto', valores: [], porcentajes: {}, pctTotal: 0, temp: 'indefinido', cant: 5 };

    window.showAcuerdoComercial = async function () {
        if (window.userRole !== 'admin') {
            if (_showModal) _showModal('Acceso restringido', 'Esta función es solo para administradores.');
            return;
        }
        _acCliente = null;
        _acAcuerdo = null;
        _nuevaRegla = { tipo: 'producto', valores: [], porcentajes: {}, pctTotal: 0, temp: 'indefinido', cant: 5 };

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="bg-slate-800 px-4 py-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Acuerdo Comercial</h2>
                            <p class="text-[10px] text-slate-400 mt-0.5">Descuentos negociados por cliente</p>
                        </div>
                        <div class="flex gap-1.5">
                            <button id="acVerTodos" class="px-3 py-1.5 bg-white/10 text-slate-100 text-xs rounded-md hover:bg-white/20 font-medium transition">Ver todos</button>
                            <button id="acBack" class="px-3 py-1.5 bg-white/10 text-slate-100 text-xs rounded-md hover:bg-white/20 font-medium transition">Volver</button>
                        </div>
                    </div>

                    <div class="p-4">
                        <div id="acLoading" class="text-center py-10 text-slate-400 text-sm">
                            <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                            Cargando clientes y catálogo...
                        </div>

                        <div id="acCuerpo" class="hidden space-y-4">
                            <div>
                                <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cliente</label>
                                <input type="text" id="acBuscarCliente" placeholder="Buscar cliente..." autocomplete="off"
                                       class="w-full text-sm border border-slate-300 rounded-lg p-2.5 mt-1 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition">
                                <div id="acDropCliente" class="hidden bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto mt-1 relative z-20"></div>
                                <div id="acClienteSel" class="hidden mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5"></div>
                            </div>

                            <div id="acListaWrap" class="hidden">
                                <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Descuentos vigentes</p>
                                <div id="acLista" class="space-y-1.5"></div>
                            </div>

                            <div id="acAgregarWrap" class="hidden border-t border-slate-200 pt-4">
                                <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Nuevo descuento</p>

                                <label class="text-[10px] text-slate-500">Aplicar a</label>
                                <select id="acTipoAlcance" class="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white outline-none mb-2 mt-0.5 focus:ring-2 focus:ring-slate-400">
                                    ${ALCANCES.map(a => `<option value="${a.k}">${a.t}</option>`).join('')}
                                </select>

                                <div id="acSelectorWrap" class="mb-2"></div>

                                <div id="acPctWrap" class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-2"></div>

                                <div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3">
                                    <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Vigencia</p>
                                    <div class="flex flex-wrap gap-1.5">
                                        <label class="flex items-center gap-1.5 text-xs cursor-pointer bg-white border border-slate-300 rounded-md px-2.5 py-1.5 has-[:checked]:border-slate-800 has-[:checked]:bg-slate-800 has-[:checked]:text-white transition">
                                            <input type="radio" name="acTemp" value="proxima" class="hidden"><span>Próxima venta</span></label>
                                        <label class="flex items-center gap-1.5 text-xs cursor-pointer bg-white border border-slate-300 rounded-md px-2.5 py-1.5 has-[:checked]:border-slate-800 has-[:checked]:bg-slate-800 has-[:checked]:text-white transition">
                                            <input type="radio" name="acTemp" value="cantidad" class="hidden"><span>Cantidad de ventas</span></label>
                                        <label class="flex items-center gap-1.5 text-xs cursor-pointer bg-white border border-slate-300 rounded-md px-2.5 py-1.5 has-[:checked]:border-slate-800 has-[:checked]:bg-slate-800 has-[:checked]:text-white transition">
                                            <input type="radio" name="acTemp" value="indefinido" checked class="hidden"><span>Indefinido</span></label>
                                    </div>
                                    <div id="acCantWrap" class="hidden mt-2 flex items-center gap-2">
                                        <span class="text-[11px] text-slate-600">Número de ventas:</span>
                                        <input type="number" id="acCantVentas" min="1" max="99" value="5" class="w-16 p-1 text-center border border-slate-300 rounded-md text-sm font-semibold outline-none">
                                    </div>
                                </div>

                                <button id="acGuardar" class="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition disabled:opacity-30">Guardar descuento</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('acBack').addEventListener('click', () => _showMainMenu());
        document.getElementById('acVerTodos').addEventListener('click', mostrarTodosLosAcuerdos);

        try {
            const [cliSnap, prodSnap] = await Promise.all([
                _getDocs(_collection(_db, pathClientes())),
                (window.getCatalogoSnapshot ? window.getCatalogoSnapshot() : _getDocs(_collection(_db, pathProductos())))
            ]);
            _acClientes  = cliSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _acProductos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (window.getGlobalProductSortFunction) {
                try { _acSortFn = await window.getGlobalProductSortFunction(); } catch (e) { _acSortFn = null; }
            }
        } catch (e) {
            console.error('AC: error cargando datos', e);
            const l = document.getElementById('acLoading');
            if (l) l.innerHTML = '<span class="text-red-500">Error al cargar los datos.</span>';
            return;
        }

        document.getElementById('acLoading').classList.add('hidden');
        document.getElementById('acCuerpo').classList.remove('hidden');

        const inp = document.getElementById('acBuscarCliente');
        let deb = null;
        inp.addEventListener('input', () => {
            clearTimeout(deb);
            deb = setTimeout(() => {
                const term = inp.value.toLowerCase().trim();
                const drop = document.getElementById('acDropCliente');
                if (!term) { drop.classList.add('hidden'); return; }
                const res = _acClientes.filter(c =>
                    (c.nombreComercial || '').toLowerCase().includes(term) ||
                    (c.nombrePersonal || '').toLowerCase().includes(term)).slice(0, 30);
                drop.innerHTML = res.length
                    ? res.map(c => `<div class="ac-cli px-2.5 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-100" data-id="${c.id}">
                        <div class="font-semibold text-slate-800">${c.nombreComercial || '(sin nombre)'}</div>
                        <div class="text-[10px] text-slate-400">${c.nombrePersonal || ''}${c.sector ? ' · ' + c.sector : ''}</div></div>`).join('')
                    : '<div class="px-2 py-2 text-xs text-slate-400">Sin coincidencias</div>';
                drop.classList.remove('hidden');
                drop.querySelectorAll('.ac-cli').forEach(el =>
                    el.addEventListener('click', () => seleccionarCliente(el.dataset.id)));
            }, 200);
        });

        document.getElementById('acTipoAlcance').addEventListener('change', (e) => {
            _nuevaRegla.tipo = e.target.value;
            _nuevaRegla.valores = [];
            _nuevaRegla.porcentajes = {};
            renderSelectorAlcance();
            renderCamposPct();
        });
        document.querySelectorAll('input[name="acTemp"]').forEach(r =>
            r.addEventListener('change', () => {
                _nuevaRegla.temp = document.querySelector('input[name="acTemp"]:checked').value;
                document.getElementById('acCantWrap').classList.toggle('hidden', _nuevaRegla.temp !== 'cantidad');
            }));
        document.getElementById('acGuardar').addEventListener('click', guardarRegla);
        renderSelectorAlcance();
        renderCamposPct();
    };

    async function seleccionarCliente(id) {
        const c = _acClientes.find(x => x.id === id);
        if (!c) return;
        _acCliente = c;
        document.getElementById('acBuscarCliente').value = '';
        document.getElementById('acDropCliente').classList.add('hidden');
        const sel = document.getElementById('acClienteSel');
        sel.classList.remove('hidden');
        sel.innerHTML = `<div class="flex items-center justify-between">
            <div><strong class="text-slate-800">${c.nombreComercial || '(sin nombre)'}</strong>
            <span class="text-slate-500">${c.nombrePersonal ? '· ' + c.nombrePersonal : ''}${c.sector ? ' · ' + c.sector : ''}</span></div>
            <button id="acQuitarCli" class="text-[10px] text-slate-500 hover:text-slate-800 hover:underline">Cambiar</button></div>`;
        document.getElementById('acQuitarCli').addEventListener('click', () => {
            _acCliente = null; _acAcuerdo = null;
            sel.classList.add('hidden');
            document.getElementById('acListaWrap').classList.add('hidden');
            document.getElementById('acAgregarWrap').classList.add('hidden');
        });

        _acAcuerdo = await window.acGetAcuerdoCliente(c.id) || { clienteId: c.id, descuentos: {}, reglas: [] };
        if (!Array.isArray(_acAcuerdo.reglas)) _acAcuerdo.reglas = [];
        document.getElementById('acListaWrap').classList.remove('hidden');
        document.getElementById('acAgregarWrap').classList.remove('hidden');
        renderListaDescuentos();
        renderSelectorAlcance();
    }

    // ── Lista de descuentos vigentes (reglas nuevas + legado) ──
    function _textoVigencia(r) {
        const t = r.temporalidad || { tipo: 'indefinido' };
        if (t.tipo === 'indefinido') return 'Indefinido';
        if (t.tipo === 'proxima') return (t.restantes > 0) ? 'Próxima venta' : 'Usado';
        const usados = (Number(t.total) || 0) - (Number(t.restantes) || 0);
        return `${usados} de ${t.total} ventas usadas`;
    }

    function renderListaDescuentos() {
        const cont = document.getElementById('acLista');
        if (!cont) return;
        const reglas = (_acAcuerdo && _acAcuerdo.reglas) || [];
        const legado = (_acAcuerdo && _acAcuerdo.descuentos) || {};
        const keysLeg = Object.keys(legado);
        if (!reglas.length && !keysLeg.length) {
            cont.innerHTML = '<p class="text-xs text-slate-400 py-2">Este cliente no tiene descuentos configurados.</p>';
            return;
        }
        const pctTexto = (r) => {
            if ((r.alcance || {}).tipo === 'total') return `${r.pctTotal}% sobre el total`;
            const p = r.porcentajes || {};
            const partes = [];
            if (p.cj) partes.push(`Caja ${p.cj}%`);
            if (p.paq) partes.push(`Paq ${p.paq}%`);
            if (p.und) partes.push(`Und ${p.und}%`);
            return partes.join(' · ') || 'sin porcentajes';
        };
        const agotada = (r) => !((r.temporalidad || {}).tipo === 'indefinido' || ((r.temporalidad || {}).restantes || 0) > 0) || r.activo === false;

        const htmlReglas = reglas.map(r => {
            const off = agotada(r);
            return `<div class="border ${off ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-300 bg-white'} rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-xs font-semibold text-slate-800 truncate">${(r.alcance || {}).etiqueta || 'Descuento'}</div>
                    <div class="text-[10px] text-slate-600 font-medium">${pctTexto(r)}</div>
                    <div class="text-[10px] ${off ? 'text-slate-400' : 'text-emerald-700'} font-medium mt-0.5">${off ? 'Agotado' : _textoVigencia(r)}</div>
                </div>
                <button class="ac-del-regla text-[10px] text-red-500 hover:underline shrink-0" data-id="${r.id}">Eliminar</button>
            </div>`;
        }).join('');

        const htmlLegado = keysLeg.map(pid => {
            const d = legado[pid];
            const p = d.porcentajes || {};
            const partes = [];
            if (p.cj) partes.push(`Caja ${p.cj}%`);
            if (p.paq) partes.push(`Paq ${p.paq}%`);
            if (p.und) partes.push(`Und ${p.und}%`);
            return `<div class="border border-slate-300 bg-white rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-xs font-semibold text-slate-800 truncate">${d.productoNombre || pid}</div>
                    <div class="text-[10px] text-slate-600 font-medium">${partes.join(' · ') || 'sin porcentajes'}</div>
                    <div class="text-[10px] text-emerald-700 font-medium mt-0.5">Indefinido</div>
                </div>
                <button class="ac-del text-[10px] text-red-500 hover:underline shrink-0" data-pid="${pid}">Eliminar</button>
            </div>`;
        }).join('');

        cont.innerHTML = htmlReglas + htmlLegado;
        cont.querySelectorAll('.ac-del').forEach(b => b.addEventListener('click', () => eliminarDescuento(b.dataset.pid)));
        cont.querySelectorAll('.ac-del-regla').forEach(b => b.addEventListener('click', () => eliminarRegla(b.dataset.id)));
    }

    // ── Selector según el alcance elegido ──
    const _uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

    function renderSelectorAlcance() {
        const wrap = document.getElementById('acSelectorWrap');
        if (!wrap) return;
        const t = _nuevaRegla.tipo;

        if (t === 'total') { wrap.innerHTML = '<p class="text-[11px] text-slate-500">El descuento se aplicará sobre el monto total de la factura.</p>'; return; }

        if (t === 'rubro' || t === 'marca' || t === 'segmento') {
            const campo = t;
            const lista = _uniq(_acProductos.map(p => p[campo]));
            wrap.innerHTML = `<select id="acValorUnico" class="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-slate-400">
                <option value="">— Elige ${t} —</option>
                ${lista.map(v => `<option value="${v}" ${_nuevaRegla.valores[0] === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>`;
            document.getElementById('acValorUnico').addEventListener('change', (e) => {
                _nuevaRegla.valores = e.target.value ? [e.target.value] : [];
                renderCamposPct();
            });
            return;
        }

        // producto / productos: filtros + lista
        let lista = _acProductos.slice();
        if (_acSortFn) lista.sort(_acSortFn); else lista.sort((a, b) => (a.presentacion || '').localeCompare(b.presentacion || ''));
        const multiple = (t === 'productos');
        wrap.innerHTML = `
            <div class="grid grid-cols-3 gap-1.5 mb-1.5">
                <select id="acFRubro" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Rubro</option>${_uniq(_acProductos.map(p => p.rubro)).map(v => `<option>${v}</option>`).join('')}</select>
                <select id="acFSegmento" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Segmento</option></select>
                <select id="acFMarca" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Marca</option></select>
            </div>
            <input type="text" id="acBuscarProd" placeholder="Buscar producto..." class="w-full text-xs border border-slate-300 rounded-md p-2 mb-1.5 outline-none focus:ring-2 focus:ring-slate-400">
            <div id="acProdLista" class="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100"></div>
            <p id="acProdSel" class="text-[10px] text-slate-500 mt-1"></p>`;

        const pintar = () => {
            const rv = document.getElementById('acFRubro').value;
            const sv = document.getElementById('acFSegmento').value;
            const mv = document.getElementById('acFMarca').value;
            const q = (document.getElementById('acBuscarProd').value || '').toLowerCase().trim();
            // cascada
            const segs = _uniq(_acProductos.filter(p => !rv || p.rubro === rv).map(p => p.segmento));
            const marcas = _uniq(_acProductos.filter(p => (!rv || p.rubro === rv) && (!sv || p.segmento === sv)).map(p => p.marca));
            const sSeg = document.getElementById('acFSegmento'), sMar = document.getElementById('acFMarca');
            sSeg.innerHTML = '<option value="">Segmento</option>' + segs.map(v => `<option ${v === sv ? 'selected' : ''}>${v}</option>`).join('');
            sMar.innerHTML = '<option value="">Marca</option>' + marcas.map(v => `<option ${v === mv ? 'selected' : ''}>${v}</option>`).join('');

            const res = lista.filter(p => (!rv || p.rubro === rv) && (!sv || p.segmento === sv) && (!mv || p.marca === mv) &&
                (!q || [p.presentacion, p.marca, p.segmento].filter(Boolean).join(' ').toLowerCase().includes(q)));
            const cont = document.getElementById('acProdLista');
            cont.innerHTML = res.slice(0, 200).map(p => {
                const sel = _nuevaRegla.valores.includes(p.id);
                return `<button type="button" data-id="${p.id}" class="ac-prod w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 ${sel ? 'bg-slate-800 text-white hover:bg-slate-800' : ''}">
                    ${p.presentacion || ''}${p.marca ? ' · ' + p.marca : ''}</button>`;
            }).join('') || '<p class="text-[11px] text-slate-400 p-2">Sin resultados.</p>';
            cont.querySelectorAll('.ac-prod').forEach(b => b.addEventListener('click', () => {
                const id = b.dataset.id;
                if (multiple) {
                    if (_nuevaRegla.valores.includes(id)) _nuevaRegla.valores = _nuevaRegla.valores.filter(x => x !== id);
                    else _nuevaRegla.valores.push(id);
                } else {
                    _nuevaRegla.valores = [id];
                }
                pintar(); renderCamposPct();
            }));
            document.getElementById('acProdSel').textContent = _nuevaRegla.valores.length
                ? `${_nuevaRegla.valores.length} producto(s) seleccionado(s)` : '';
        };
        ['acFRubro', 'acFSegmento', 'acFMarca'].forEach(id => document.getElementById(id).addEventListener('change', pintar));
        document.getElementById('acBuscarProd').addEventListener('input', pintar);
        pintar();
    }

    // ── Campos de porcentaje ──
    function renderCamposPct() {
        const wrap = document.getElementById('acPctWrap');
        if (!wrap) return;
        if (_nuevaRegla.tipo === 'total') {
            wrap.innerHTML = `<div class="flex items-center gap-2">
                <span class="text-[11px] text-slate-600">Descuento sobre el total</span>
                <input type="number" id="acPctTotal" min="0" max="100" step="0.5" value="${_nuevaRegla.pctTotal || 0}" class="w-20 p-1 text-center border border-slate-300 rounded-md text-sm font-semibold outline-none">
                <span class="text-[11px] text-slate-500">%</span></div>`;
            document.getElementById('acPctTotal').addEventListener('input', e => { _nuevaRegla.pctTotal = parseFloat(e.target.value) || 0; });
            return;
        }
        wrap.innerHTML = `<p class="text-[10px] text-slate-500 mb-1.5">Descuento por presentación (deja en 0 la que no aplique):</p>
            <div class="space-y-1.5">
            ${[['cj', 'Caja'], ['paq', 'Paquete'], ['und', 'Unidad']].map(([k, l]) => `
                <div class="flex items-center gap-2">
                    <span class="text-[11px] text-slate-600 w-16">${l}</span>
                    <input type="number" min="0" max="100" step="0.5" value="${_nuevaRegla.porcentajes[k] || 0}" data-tipo="${k}"
                           class="ac-pct w-16 p-1 text-center border border-slate-300 rounded-md text-sm font-semibold outline-none">
                    <span class="text-[11px] text-slate-500">%</span>
                </div>`).join('')}
            </div>`;
        wrap.querySelectorAll('.ac-pct').forEach(i => i.addEventListener('input', () => {
            _nuevaRegla.porcentajes[i.dataset.tipo] = parseFloat(i.value) || 0;
        }));
    }

    // ── Detección de conflictos: no se permiten descuentos que se solapen ──
    function _productosDeAlcance(tipo, valores) {
        if (tipo === 'total') return null; // no compite con los de producto
        if (tipo === 'producto' || tipo === 'productos') return new Set(valores);
        const campo = tipo; // rubro | marca | segmento
        return new Set(_acProductos.filter(p => valores.includes(p[campo])).map(p => p.id));
    }

    function _buscarConflicto(tipoNuevo, valoresNuevos) {
        const reglas = (_acAcuerdo && _acAcuerdo.reglas) || [];
        if (tipoNuevo === 'total') {
            const yaTotal = reglas.find(r => (r.alcance || {}).tipo === 'total' && r.activo !== false);
            return yaTotal ? { regla: yaTotal, motivo: 'Ya existe un descuento sobre el total de la venta.' } : null;
        }
        const setNuevo = _productosDeAlcance(tipoNuevo, valoresNuevos);
        // contra reglas nuevas
        for (const r of reglas) {
            if (r.activo === false) continue;
            const a = r.alcance || {};
            if (a.tipo === 'total') continue;
            const setR = _productosDeAlcance(a.tipo, a.valores || []);
            if (!setR) continue;
            for (const id of setNuevo) {
                if (setR.has(id)) {
                    const prod = _acProductos.find(p => p.id === id);
                    return { regla: r, motivo: `Se solapa con "${a.etiqueta}" en el producto ${(prod && prod.presentacion) || id}.` };
                }
            }
        }
        // contra el formato legado
        const legado = (_acAcuerdo && _acAcuerdo.descuentos) || {};
        for (const pid of Object.keys(legado)) {
            if (setNuevo.has(pid)) {
                return { regla: null, motivo: `Se solapa con el descuento existente de "${legado[pid].productoNombre || pid}".` };
            }
        }
        return null;
    }

    function _etiquetaAlcance(tipo, valores) {
        if (tipo === 'total') return 'Total de la venta';
        if (tipo === 'rubro') return `Rubro: ${valores[0]}`;
        if (tipo === 'marca') return `Marca: ${valores[0]}`;
        if (tipo === 'segmento') return `Segmento: ${valores[0]}`;
        if (tipo === 'producto') {
            const p = _acProductos.find(x => x.id === valores[0]);
            return p ? [p.presentacion, p.marca].filter(Boolean).join(' · ') : 'Producto';
        }
        return `${valores.length} productos seleccionados`;
    }

    async function guardarRegla() {
        if (!_acCliente) { _showModal('Aviso', 'Primero elige un cliente.'); return; }
        const tipo = _nuevaRegla.tipo;
        const valores = _nuevaRegla.valores.slice();

        if (tipo !== 'total' && !valores.length) { _showModal('Aviso', 'Selecciona a qué aplica el descuento.'); return; }

        let porcentajes = {}, pctTotal = 0;
        if (tipo === 'total') {
            pctTotal = Number(_nuevaRegla.pctTotal) || 0;
            if (pctTotal <= 0 || pctTotal > 100) { _showModal('Aviso', 'El descuento debe estar entre 0 y 100%.'); return; }
        } else {
            ['cj', 'paq', 'und'].forEach(k => {
                const v = Number(_nuevaRegla.porcentajes[k]) || 0;
                if (v > 0) porcentajes[k] = v;
            });
            const malo = Object.values(porcentajes).some(v => v < 0 || v > 100);
            if (malo) { _showModal('Aviso', 'El descuento debe estar entre 0 y 100%.'); return; }
            if (!Object.keys(porcentajes).length) { _showModal('Aviso', 'Ingresa al menos un porcentaje mayor a 0.'); return; }
        }

        // Conflictos: no se permite más de un descuento sobre el mismo producto
        const conf = _buscarConflicto(tipo, valores);
        if (conf) {
            _showModal('Más de un descuento coincide',
                `No se puede guardar porque este descuento se solaparía con otro ya existente.<br><br>` +
                `<span class="text-xs text-slate-600">${conf.motivo}</span><br><br>` +
                `Elimina primero el descuento que se solapa y vuelve a intentarlo.`);
            return;
        }

        const temp = _nuevaRegla.temp;
        const cant = Math.max(1, parseInt(document.getElementById('acCantVentas')?.value, 10) || 1);
        const temporalidad = temp === 'indefinido'
            ? { tipo: 'indefinido' }
            : (temp === 'proxima' ? { tipo: 'proxima', total: 1, restantes: 1 } : { tipo: 'cantidad', total: cant, restantes: cant });

        const regla = {
            id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            alcance: { tipo, valores, etiqueta: _etiquetaAlcance(tipo, valores) },
            porcentajes, pctTotal,
            temporalidad,
            activo: true,
            usos: 0,
            creadoPor: _userId,
            fecha: new Date().toISOString()
        };

        const btn = document.getElementById('acGuardar');
        btn.disabled = true; btn.textContent = 'Guardando...';
        try {
            _acAcuerdo = _acAcuerdo || { clienteId: _acCliente.id, descuentos: {}, reglas: [] };
            _acAcuerdo.reglas = Array.isArray(_acAcuerdo.reglas) ? _acAcuerdo.reglas : [];
            _acAcuerdo.reglas.push(regla);
            await _setDoc(_doc(_db, pathAcuerdos(), _acCliente.id), {
                clienteId: _acCliente.id,
                clienteNombre: _acCliente.nombreComercial || '',
                reglas: _acAcuerdo.reglas,
                actualizado: new Date().toISOString(),
                actualizadoPor: _userId
            }, { merge: true });

            _nuevaRegla.valores = []; _nuevaRegla.porcentajes = {}; _nuevaRegla.pctTotal = 0;
            renderListaDescuentos();
            renderSelectorAlcance();
            renderCamposPct();
            _showModal('Descuento guardado', `<strong>${regla.alcance.etiqueta}</strong> para <strong>${_acCliente.nombreComercial}</strong>.`);
        } catch (e) {
            console.error('AC: error guardando', e);
            _showModal('Error', 'No se pudo guardar el descuento.');
        } finally {
            btn.disabled = false; btn.textContent = 'Guardar descuento';
        }
    }

    async function eliminarRegla(id) {
        if (!_acCliente || !_acAcuerdo) return;
        const r = (_acAcuerdo.reglas || []).find(x => x.id === id);
        if (!r) return;
        _showModal('Eliminar descuento', `¿Eliminar <strong>${(r.alcance || {}).etiqueta || 'este descuento'}</strong>?`, async () => {
            try {
                _acAcuerdo.reglas = _acAcuerdo.reglas.filter(x => x.id !== id);
                await _setDoc(_doc(_db, pathAcuerdos(), _acCliente.id), {
                    reglas: _acAcuerdo.reglas, actualizado: new Date().toISOString(), actualizadoPor: _userId
                }, { merge: true });
                renderListaDescuentos();
                renderSelectorAlcance();
            } catch (e) { _showModal('Error', 'No se pudo eliminar.'); }
        }, 'Eliminar', null, true);
    }

    async function eliminarDescuento(pid) {
        if (!_acCliente || !_acAcuerdo) return;
        const d = (_acAcuerdo.descuentos || {})[pid];
        if (!d) return;
        _showModal('Eliminar descuento', `¿Eliminar el descuento de <strong>${d.productoNombre || pid}</strong>?`, async () => {
            try {
                delete _acAcuerdo.descuentos[pid];
                await _setDoc(_doc(_db, pathAcuerdos(), _acCliente.id), {
                    descuentos: _acAcuerdo.descuentos, actualizado: new Date().toISOString(), actualizadoPor: _userId
                });
                renderListaDescuentos();
                renderSelectorAlcance();
            } catch (e) { _showModal('Error', 'No se pudo eliminar.'); }
        }, 'Eliminar', null, true);
    }

    async function mostrarTodosLosAcuerdos() {
        _showModal('Consultando', 'Buscando acuerdos...');
        try {
            const snap = await _getDocs(_collection(_db, pathAcuerdos()));
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(a => (a.reglas && a.reglas.length) || (a.descuentos && Object.keys(a.descuentos).length));
            if (!items.length) { _showModal('Acuerdos comerciales', 'No hay acuerdos registrados.'); return; }
            const html = items.map(a => {
                const nReglas = (a.reglas || []).filter(r => r.activo !== false).length;
                const nLeg = Object.keys(a.descuentos || {}).length;
                return `<div class="border-b border-slate-100 py-1.5 text-left">
                    <div class="text-xs font-semibold text-slate-800">${a.clienteNombre || a.id}</div>
                    <div class="text-[10px] text-slate-500">${nReglas + nLeg} descuento(s)</div>
                </div>`;
            }).join('');
            _showModal('Acuerdos comerciales', `<div class="max-h-72 overflow-y-auto">${html}</div>`);
        } catch (e) {
            _showModal('Error', 'No se pudieron cargar los acuerdos.');
        }
    }

})();

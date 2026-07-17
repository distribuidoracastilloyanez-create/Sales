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
    // Devuelve el acuerdo (descuentos) de un cliente, o null.
    window.acGetAcuerdoCliente = async function (clienteId) {
        if (!clienteId || !_db) return null;
        try {
            const snap = await _getDoc(_doc(_db, pathAcuerdos(), clienteId));
            if (!snap.exists()) return null;
            const d = snap.data();
            return (d && d.descuentos && Object.keys(d.descuentos).length) ? d : null;
        } catch (e) {
            console.warn('AC: no se pudo leer el acuerdo:', e);
            return null;
        }
    };

    // Aplica los descuentos de un acuerdo a un objeto de precios {cj,paq,und}.
    // Devuelve { precios, aplicado:[{tipo,porcentaje,original,final}] }
    window.acAplicarDescuento = function (acuerdo, productoId, precios) {
        const base = { ...(precios || {}) };
        if (!acuerdo || !acuerdo.descuentos || !acuerdo.descuentos[productoId]) {
            return { precios: base, aplicado: [] };
        }
        const d = acuerdo.descuentos[productoId];
        if (d.activo === false) return { precios: base, aplicado: [] };
        const pct = d.porcentajes || {};
        const aplicado = [];
        ['cj', 'paq', 'und'].forEach(tipo => {
            const p = Number(pct[tipo]) || 0;
            if (p > 0 && base[tipo] > 0) {
                const original = base[tipo];
                const final = original * (1 - p / 100);
                base[tipo] = final;
                aplicado.push({ tipo, porcentaje: p, original, final });
            }
        });
        return { precios: base, aplicado };
    };

    // ── PANTALLA PRINCIPAL ──
    window.showAcuerdoComercial = async function () {
        if (window.userRole !== 'admin') {
            if (_showModal) _showModal('Acceso restringido', 'Esta función es solo para administradores.');
            return;
        }
        _acCliente = null;
        _acAcuerdo = null;

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-2xl mx-auto">
                <div class="bg-white/95 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">🤝 Acuerdo Comercial</h2>
                        <div class="flex gap-1.5">
                            <button id="acVerTodos" class="px-2.5 py-1.5 bg-amber-100 text-amber-700 text-xs rounded hover:bg-amber-200 font-bold transition">Ver todos</button>
                            <button id="acBack" class="px-3 py-1.5 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 font-bold transition">Volver</button>
                        </div>
                    </div>
                    <p class="text-[11px] text-gray-500 mb-3">Fija un descuento por producto para un cliente. Se aplicará automáticamente en sus ventas.</p>

                    <div id="acLoading" class="text-center py-8 text-gray-400 text-sm">
                        <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                        Cargando clientes y catálogo...
                    </div>

                    <div id="acCuerpo" class="hidden space-y-3">
                        <!-- Cliente -->
                        <div>
                            <label class="text-[10px] font-bold text-amber-700 uppercase">Cliente</label>
                            <input type="text" id="acBuscarCliente" placeholder="Buscar cliente..." autocomplete="off"
                                   class="w-full text-sm border border-amber-300 rounded p-2 outline-none focus:ring-2 focus:ring-amber-400">
                            <div id="acDropCliente" class="hidden bg-white border border-gray-200 rounded shadow-lg max-h-44 overflow-y-auto mt-1 relative z-20"></div>
                            <div id="acClienteSel" class="hidden mt-1 text-xs bg-amber-50 border border-amber-200 rounded p-2"></div>
                        </div>

                        <!-- Acuerdos vigentes del cliente -->
                        <div id="acListaWrap" class="hidden">
                            <p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Descuentos vigentes</p>
                            <div id="acLista" class="space-y-1.5"></div>
                        </div>

                        <!-- Agregar descuento -->
                        <div id="acAgregarWrap" class="hidden border-t pt-3">
                            <p class="text-[10px] font-bold text-amber-700 uppercase mb-1.5">Agregar descuento a un producto</p>
                            <div class="grid grid-cols-3 gap-1.5 mb-1.5">
                                <select id="acRubro" class="text-xs border border-amber-300 rounded p-1.5 bg-white outline-none">
                                    <option value="">Rubro</option>
                                </select>
                                <select id="acSegmento" class="text-xs border border-amber-300 rounded p-1.5 bg-white outline-none">
                                    <option value="">Segmento</option>
                                </select>
                                <select id="acMarca" class="text-xs border border-amber-300 rounded p-1.5 bg-white outline-none">
                                    <option value="">Marca</option>
                                </select>
                            </div>
                            <select id="acProducto" class="w-full text-sm border border-amber-300 rounded p-2 bg-white outline-none mb-2">
                                <option value="">— Elige el producto —</option>
                            </select>

                            <div id="acPreciosWrap" class="hidden bg-gray-50 rounded-lg p-2 mb-2">
                                <p class="text-[10px] text-gray-500 mb-1.5">Descuento por presentación (deja en 0 la que no aplique):</p>
                                <div id="acPreciosCampos" class="space-y-1.5"></div>
                            </div>

                            <button id="acGuardar" class="w-full py-2.5 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition disabled:opacity-40" disabled>Guardar descuento</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('acBack').addEventListener('click', () => _showMainMenu());
        document.getElementById('acVerTodos').addEventListener('click', mostrarTodosLosAcuerdos);

        // Cargar datos
        try {
            const [cliSnap, prodSnap] = await Promise.all([
                _getDocs(_collection(_db, pathClientes())),
                _getDocs(_collection(_db, pathProductos()))
            ]);
            _acClientes  = cliSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _acProductos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Mismo orden que usa Ventas
            if (window.getGlobalProductSortFunction) {
                try { _acSortFn = await window.getGlobalProductSortFunction(); } catch (e) { _acSortFn = null; }
            }
        } catch (e) {
            console.error('AC: error cargando datos', e);
            document.getElementById('acLoading').innerHTML = '<span class="text-red-500">Error al cargar los datos.</span>';
            return;
        }

        document.getElementById('acLoading').classList.add('hidden');
        document.getElementById('acCuerpo').classList.remove('hidden');

        // Buscador de cliente
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
                    ? res.map(c => `<div class="ac-cli px-2 py-1.5 text-xs hover:bg-amber-50 cursor-pointer border-b border-gray-100" data-id="${c.id}">
                        <div class="font-semibold text-gray-800">${c.nombreComercial || '(sin nombre)'}</div>
                        <div class="text-[10px] text-gray-400">${c.nombrePersonal || ''}${c.sector ? ' · ' + c.sector : ''}</div></div>`).join('')
                    : '<div class="px-2 py-2 text-xs text-gray-400">Sin coincidencias</div>';
                drop.classList.remove('hidden');
                drop.querySelectorAll('.ac-cli').forEach(el =>
                    el.addEventListener('click', () => seleccionarCliente(el.dataset.id)));
            }, 200);
        });

        poblarFiltros();
        ['acRubro', 'acSegmento', 'acMarca'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => { poblarFiltros(id); poblarProductos(); }));
        document.getElementById('acProducto').addEventListener('change', renderCamposPrecio);
        document.getElementById('acGuardar').addEventListener('click', guardarDescuento);
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
            <div><strong class="text-amber-800">${c.nombreComercial || '(sin nombre)'}</strong>
            <span class="text-gray-500">${c.nombrePersonal ? '· ' + c.nombrePersonal : ''}${c.sector ? ' · ' + c.sector : ''}</span></div>
            <button id="acQuitarCli" class="text-[10px] text-red-500 hover:underline">Cambiar</button></div>`;
        document.getElementById('acQuitarCli').addEventListener('click', () => {
            _acCliente = null; _acAcuerdo = null;
            sel.classList.add('hidden');
            document.getElementById('acListaWrap').classList.add('hidden');
            document.getElementById('acAgregarWrap').classList.add('hidden');
        });

        // Cargar su acuerdo
        _acAcuerdo = await window.acGetAcuerdoCliente(c.id) || { clienteId: c.id, descuentos: {} };
        document.getElementById('acListaWrap').classList.remove('hidden');
        document.getElementById('acAgregarWrap').classList.remove('hidden');
        renderListaDescuentos();
        poblarProductos();
    }

    function renderListaDescuentos() {
        const cont = document.getElementById('acLista');
        if (!cont) return;
        const ds = (_acAcuerdo && _acAcuerdo.descuentos) || {};
        const keys = Object.keys(ds);
        if (!keys.length) {
            cont.innerHTML = '<p class="text-xs text-gray-400 py-2">Este cliente no tiene descuentos configurados.</p>';
            return;
        }
        cont.innerHTML = keys.map(pid => {
            const d = ds[pid];
            const p = d.porcentajes || {};
            const partes = [];
            if (p.cj)  partes.push(`Caja ${p.cj}%`);
            if (p.paq) partes.push(`Paq ${p.paq}%`);
            if (p.und) partes.push(`Und ${p.und}%`);
            return `<div class="border border-amber-200 bg-amber-50 rounded-lg p-2 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-xs font-bold text-gray-800 truncate">${d.productoNombre || pid}</div>
                    <div class="text-[10px] text-amber-700 font-semibold">${partes.join(' · ') || 'sin porcentajes'}</div>
                </div>
                <button class="ac-del text-[10px] text-red-500 hover:underline shrink-0" data-pid="${pid}">Eliminar</button>
            </div>`;
        }).join('');
        cont.querySelectorAll('.ac-del').forEach(b =>
            b.addEventListener('click', () => eliminarDescuento(b.dataset.pid)));
    }

    // Filtros en cascada rubro → segmento → marca
    function poblarFiltros(cambiado) {
        const rSel = document.getElementById('acRubro');
        const sSel = document.getElementById('acSegmento');
        const mSel = document.getElementById('acMarca');
        if (!rSel) return;

        if (cambiado === 'acRubro') { sSel.value = ''; mSel.value = ''; }
        if (cambiado === 'acSegmento') { mSel.value = ''; }

        const rubros = [...new Set(_acProductos.map(p => p.rubro).filter(Boolean))].sort();
        if (!cambiado) {
            rSel.innerHTML = '<option value="">Rubro</option>' + rubros.map(r => `<option value="${r}">${r}</option>`).join('');
        }
        const rv = rSel.value;
        const segs = [...new Set(_acProductos.filter(p => !rv || p.rubro === rv).map(p => p.segmento).filter(Boolean))].sort();
        const sv0 = sSel.value;
        sSel.innerHTML = '<option value="">Segmento</option>' + segs.map(s => `<option value="${s}" ${s === sv0 ? 'selected' : ''}>${s}</option>`).join('');
        const sv = sSel.value;
        const marcas = [...new Set(_acProductos.filter(p => (!rv || p.rubro === rv) && (!sv || p.segmento === sv)).map(p => p.marca).filter(Boolean))].sort();
        const mv0 = mSel.value;
        mSel.innerHTML = '<option value="">Marca</option>' + marcas.map(m => `<option value="${m}" ${m === mv0 ? 'selected' : ''}>${m}</option>`).join('');
    }

    function poblarProductos() {
        const sel = document.getElementById('acProducto');
        if (!sel) return;
        const rv = document.getElementById('acRubro').value;
        const sv = document.getElementById('acSegmento').value;
        const mv = document.getElementById('acMarca').value;
        let lista = _acProductos.filter(p =>
            (!rv || p.rubro === rv) && (!sv || p.segmento === sv) && (!mv || p.marca === mv));
        // Mismo orden que Ventas
        if (_acSortFn) lista.sort(_acSortFn);
        else lista.sort((a, b) => (a.presentacion || '').localeCompare(b.presentacion || ''));

        sel.innerHTML = '<option value="">— Elige el producto —</option>' +
            lista.map(p => {
                const ya = _acAcuerdo && _acAcuerdo.descuentos && _acAcuerdo.descuentos[p.id];
                return `<option value="${p.id}">${p.presentacion}${p.marca ? ' · ' + p.marca : ''}${ya ? '  (ya tiene descuento)' : ''}</option>`;
            }).join('');
        document.getElementById('acPreciosWrap').classList.add('hidden');
        document.getElementById('acGuardar').disabled = true;
    }

    // Muestra un campo de % por cada presentación que el producto venda
    function renderCamposPrecio() {
        const pid = document.getElementById('acProducto').value;
        const wrap = document.getElementById('acPreciosWrap');
        const campos = document.getElementById('acPreciosCampos');
        const btn = document.getElementById('acGuardar');
        if (!pid) { wrap.classList.add('hidden'); btn.disabled = true; return; }

        const prod = _acProductos.find(p => p.id === pid);
        if (!prod) return;
        const precios = prod.precios || {};
        const vPor = prod.ventaPor || { und: true };
        const yaTiene = (_acAcuerdo && _acAcuerdo.descuentos && _acAcuerdo.descuentos[pid]) || null;
        const pctPrev = (yaTiene && yaTiene.porcentajes) || {};

        const campo = (tipo, label) => {
            const precio = precios[tipo] || 0;
            if (!precio) return '';
            return `<div class="flex items-center gap-2">
                <span class="text-[11px] text-gray-600 w-16">${label}</span>
                <span class="text-[11px] text-gray-400 w-16">${fmt(precio)}</span>
                <input type="number" min="0" max="100" step="0.5" value="${pctPrev[tipo] || 0}" data-tipo="${tipo}"
                       class="ac-pct w-16 p-1 text-center border border-amber-300 rounded text-sm font-bold outline-none">
                <span class="text-[11px] text-gray-500">%</span>
                <span class="text-[11px] font-bold text-green-700 ac-final" data-tipo="${tipo}">${fmt(precio)}</span>
            </div>`;
        };

        let html = '';
        if (vPor.cj)  html += campo('cj', 'Caja');
        if (vPor.paq) html += campo('paq', 'Paquete');
        if (vPor.und) html += campo('und', 'Unidad');
        if (!html) html = '<p class="text-xs text-gray-400">Este producto no tiene precios configurados.</p>';
        campos.innerHTML = html;
        wrap.classList.remove('hidden');

        const recalc = () => {
            let algun = false;
            campos.querySelectorAll('.ac-pct').forEach(i => {
                const tipo = i.dataset.tipo;
                const pct = parseFloat(i.value) || 0;
                if (pct > 0) algun = true;
                const base = precios[tipo] || 0;
                const fin = base * (1 - pct / 100);
                const out = campos.querySelector(`.ac-final[data-tipo="${tipo}"]`);
                if (out) {
                    out.textContent = fmt(fin);
                    out.className = `text-[11px] font-bold ac-final ${pct > 0 ? 'text-green-700' : 'text-gray-400'}`;
                }
            });
            btn.disabled = !algun;
        };
        campos.querySelectorAll('.ac-pct').forEach(i => i.addEventListener('input', recalc));
        recalc();
    }

    async function guardarDescuento() {
        if (!_acCliente) return;
        const pid = document.getElementById('acProducto').value;
        if (!pid) return;
        const prod = _acProductos.find(p => p.id === pid);
        if (!prod) return;

        const porcentajes = {};
        let valido = true;
        document.querySelectorAll('#acPreciosCampos .ac-pct').forEach(i => {
            const pct = parseFloat(i.value) || 0;
            if (pct < 0 || pct > 100) valido = false;
            if (pct > 0) porcentajes[i.dataset.tipo] = pct;
        });
        if (!valido) { _showModal('Aviso', 'El descuento debe estar entre 0 y 100%.'); return; }
        if (!Object.keys(porcentajes).length) { _showModal('Aviso', 'Ingresa al menos un porcentaje mayor a 0.'); return; }

        const btn = document.getElementById('acGuardar');
        btn.disabled = true; btn.textContent = 'Guardando...';

        const nombreProd = [prod.presentacion, prod.marca].filter(Boolean).join(' · ');
        _acAcuerdo = _acAcuerdo || { clienteId: _acCliente.id, descuentos: {} };
        _acAcuerdo.descuentos = _acAcuerdo.descuentos || {};
        _acAcuerdo.descuentos[pid] = {
            productoNombre: nombreProd,
            presentacion: prod.presentacion || '',
            marca: prod.marca || '',
            porcentajes,
            activo: true,
            creadoPor: _userId,
            fecha: new Date().toISOString()
        };

        try {
            await _setDoc(_doc(_db, pathAcuerdos(), _acCliente.id), {
                clienteId: _acCliente.id,
                clienteNombre: _acCliente.nombreComercial || '',
                descuentos: _acAcuerdo.descuentos,
                actualizado: new Date().toISOString(),
                actualizadoPor: _userId
            }, { merge: true });

            renderListaDescuentos();
            poblarProductos();
            _showModal('Descuento guardado',
                `<strong>${nombreProd}</strong> con descuento para <strong>${_acCliente.nombreComercial}</strong>.`);
        } catch (e) {
            console.error('AC: error guardando', e);
            _showModal('Error', 'No se pudo guardar el descuento.');
        } finally {
            btn.disabled = false; btn.textContent = 'Guardar descuento';
        }
    }

    async function eliminarDescuento(pid) {
        if (!_acCliente || !_acAcuerdo) return;
        const d = _acAcuerdo.descuentos[pid];
        _showModal('Eliminar descuento',
            `¿Quitar el descuento de <strong>${d?.productoNombre || pid}</strong> para ${_acCliente.nombreComercial}?`,
            async () => {
                delete _acAcuerdo.descuentos[pid];
                try {
                    await _setDoc(_doc(_db, pathAcuerdos(), _acCliente.id), {
                        clienteId: _acCliente.id,
                        clienteNombre: _acCliente.nombreComercial || '',
                        descuentos: _acAcuerdo.descuentos,
                        actualizado: new Date().toISOString(),
                        actualizadoPor: _userId
                    });
                    renderListaDescuentos();
                    poblarProductos();
                } catch (e) {
                    console.error('AC: error eliminando', e);
                    _showModal('Error', 'No se pudo eliminar el descuento.');
                }
            }, 'Sí, quitar', () => {});
    }

    // ── VER TODOS LOS ACUERDOS ──
    async function mostrarTodosLosAcuerdos() {
        _showModal('Cargando', 'Buscando acuerdos...', null, '', null, false);
        let acuerdos = [];
        try {
            const snap = await _getDocs(_collection(_db, pathAcuerdos()));
            acuerdos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(a => a.descuentos && Object.keys(a.descuentos).length);
        } catch (e) {
            console.error('AC: error listando', e);
            _showModal('Error', 'No se pudieron cargar los acuerdos.');
            return;
        }
        if (!acuerdos.length) {
            _showModal('Acuerdos comerciales', 'Todavía no hay acuerdos configurados.');
            return;
        }
        acuerdos.sort((a, b) => (a.clienteNombre || '').localeCompare(b.clienteNombre || ''));
        const html = `<div class="text-left max-h-[60vh] overflow-y-auto">
            <p class="text-xs text-gray-500 mb-2">${acuerdos.length} cliente(s) con acuerdo:</p>
            ${acuerdos.map(a => {
                const ds = Object.values(a.descuentos || {});
                return `<div class="border border-gray-200 rounded-lg p-2 mb-1.5">
                    <div class="font-bold text-xs text-gray-800">${a.clienteNombre || a.id}</div>
                    ${ds.map(d => {
                        const p = d.porcentajes || {};
                        const t = [];
                        if (p.cj) t.push(`Caja ${p.cj}%`);
                        if (p.paq) t.push(`Paq ${p.paq}%`);
                        if (p.und) t.push(`Und ${p.und}%`);
                        return `<div class="text-[10px] text-gray-600 pl-2">• ${d.productoNombre} — <span class="text-amber-700 font-semibold">${t.join(' · ')}</span></div>`;
                    }).join('')}
                </div>`;
            }).join('')}
        </div>`;
        _showModal('Acuerdos comerciales', html, null, 'Cerrar');
    }

})();

// ═══════════════════════════════════════════════════════════════
// MÓDULO SEGUIMIENTO DE PRODUCTO (solo admin)
// Reconstruye, día por día y hacia atrás, todo lo que le pasó a uno
// o varios productos en el inventario de uno o varios vendedores:
// recargas (con quién la hizo), ventas, pedidos de preventa entregados,
// correcciones de inventario y el stock resultante.
// Objetivo: comparar contra el cuadre manual cuando hay discrepancias.
// Es una vista de SOLO LECTURA: no escribe nada.
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _userId, _appId, _mainContent;
    let _showMainMenu, _showModal;
    let _collection, _doc, _getDoc, _getDocs, _query, _where;

    window.initSeguimiento = function (deps) {
        _db           = deps.db;
        _userId       = deps.userId;
        _appId        = deps.appId;
        _mainContent  = deps.mainContent;
        _showMainMenu = deps.showMainMenu;
        _showModal    = deps.showModal;
        _collection   = deps.collection;
        _doc          = deps.doc;
        _getDoc       = deps.getDoc;
        _getDocs      = deps.getDocs;
        _query        = deps.query;
        _where        = deps.where;
    };

    const getPublicDataId = () => window.AppConfig.PUBLIC_DATA_ID;
    const pathProductos = () => `artifacts/${getPublicDataId()}/public/data/productos`;

    let _sgVendedores = [];
    let _sgProductos  = [];
    let _sgSortFn     = null;
    let _selVend      = new Set();
    let _selProd      = new Set();
    let _dias         = 15;

    // ── Fechas en hora de Venezuela (GMT-4) ──
    // Toda la agrupación por día usa la fecha local del negocio, no UTC.
    const OFFSET_VE = -4 * 60; // minutos
    function _claveDia(fecha) {
        const d = (fecha instanceof Date) ? fecha : _aFecha(fecha);
        if (!d || isNaN(d.getTime())) return null;
        // Desplazar a hora de Venezuela (GMT-4) y tomar la parte de fecha
        const ve = new Date(d.getTime() + (OFFSET_VE * 60000) + (d.getTimezoneOffset() * 60000));
        return `${ve.getFullYear()}-${String(ve.getMonth() + 1).padStart(2, '0')}-${String(ve.getDate()).padStart(2, '0')}`;
    }
    function _aFecha(v) {
        if (!v) return null;
        if (v instanceof Date) return v;
        if (v && typeof v.toDate === 'function') return v.toDate();
        if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
        if (typeof v === 'number') return new Date(v);
        return null;
    }
    function _etiquetaDia(clave) {
        const [a, m, d] = clave.split('-').map(Number);
        const f = new Date(a, m - 1, d);
        const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${dias[f.getDay()]} ${d} ${meses[m - 1]}`;
    }
    const _hora = (f) => {
        const d = _aFecha(f);
        return d ? d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
    };
    const _nombreVend = (v) => [v.nombre, v.apellido].filter(Boolean).join(' ') || v.email || v.uid;

    // ═══════════════ PANTALLA ═══════════════
    window.showSeguimientoProducto = async function () {
        if (window.userRole !== 'admin') {
            if (_showModal) _showModal('Acceso restringido', 'Esta función es solo para administradores.');
            return;
        }
        // Consulta inventarios, ventas y recargas de otros usuarios: necesita servidor.
        if (window.requiereConexion && !window.requiereConexion('El Seguimiento de Producto')) return;
        _selVend = new Set(); _selProd = new Set(); _dias = 15;

        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-3xl mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="bg-slate-800 px-4 py-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Seguimiento de Producto</h2>
                            <p class="text-[10px] text-slate-400 mt-0.5">Historial diario para contrastar con el cuadre manual</p>
                        </div>
                        <button id="sgBack" class="px-3 py-1.5 bg-white/10 text-slate-100 text-xs rounded-md hover:bg-white/20 font-medium transition">Volver</button>
                    </div>
                    <div class="p-4">
                        <div id="sgLoading" class="text-center py-10 text-slate-400 text-sm">
                            <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                            Cargando vendedores y catálogo...
                        </div>
                        <div id="sgSetup" class="hidden space-y-4"></div>
                        <div id="sgResultado" class="hidden"></div>
                    </div>
                </div>
            </div>`;
        document.getElementById('sgBack').addEventListener('click', () => _showMainMenu());

        try {
            const [uSnap, pSnap] = await Promise.all([
                _getDocs(_query(_collection(_db, 'users'), _where('role', 'in', ['user', 'vendedor']))),
                (window.getCatalogoSnapshot ? window.getCatalogoSnapshot() : _getDocs(_collection(_db, pathProductos())))
            ]);
            _sgVendedores = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
                .sort((a, b) => _nombreVend(a).localeCompare(_nombreVend(b)));
            _sgProductos = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (window.getGlobalProductSortFunction) {
                try { _sgSortFn = await window.getGlobalProductSortFunction(); } catch (e) { _sgSortFn = null; }
            }
            if (_sgSortFn) _sgProductos.sort(_sgSortFn);
        } catch (e) {
            console.error('Seguimiento: error cargando', e);
            document.getElementById('sgLoading').innerHTML = '<span class="text-red-500">Error al cargar los datos.</span>';
            return;
        }
        document.getElementById('sgLoading').classList.add('hidden');
        renderSetup();
    };

    const _uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

    function renderSetup() {
        const cont = document.getElementById('sgSetup');
        cont.classList.remove('hidden');
        document.getElementById('sgResultado').classList.add('hidden');
        cont.innerHTML = `
            <div>
                <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Vendedores</p>
                <div class="flex flex-wrap gap-1.5">
                    ${_sgVendedores.map(v => `
                        <button data-uid="${v.uid}" class="sg-v px-2.5 py-1.5 text-xs rounded-md border transition ${_selVend.has(v.uid) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'}">${_nombreVend(v)}</button>`).join('')}
                </div>
                ${_sgVendedores.length > 1 ? `<button id="sgTodosV" class="mt-1.5 text-[10px] text-slate-500 hover:text-slate-800 underline">Seleccionar todos</button>` : ''}
            </div>

            <div>
                <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Productos</p>
                <div class="grid grid-cols-3 gap-1.5 mb-1.5">
                    <select id="sgFRubro" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Rubro</option>${_uniq(_sgProductos.map(p => p.rubro)).map(v => `<option>${v}</option>`).join('')}</select>
                    <select id="sgFSegmento" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Segmento</option></select>
                    <select id="sgFMarca" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Marca</option></select>
                </div>
                <input type="text" id="sgBuscarProd" placeholder="Buscar producto..." class="w-full text-xs border border-slate-300 rounded-md p-2 mb-1.5 outline-none focus:ring-2 focus:ring-slate-400">
                <div id="sgProdLista" class="border border-slate-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-slate-100"></div>
                <p id="sgProdSel" class="text-[10px] text-slate-500 mt-1"></p>
            </div>

            <div class="flex items-center gap-2">
                <span class="text-[11px] text-slate-600">Días hacia atrás:</span>
                <input type="number" id="sgDias" min="1" max="120" value="${_dias}" class="w-20 p-1.5 text-center border border-slate-300 rounded-md text-sm font-semibold outline-none">
            </div>

            <button id="sgGenerar" class="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition disabled:opacity-30" disabled>Generar seguimiento</button>`;

        cont.querySelectorAll('.sg-v').forEach(b => b.addEventListener('click', () => {
            const u = b.dataset.uid;
            _selVend.has(u) ? _selVend.delete(u) : _selVend.add(u);
            renderSetup();
        }));
        document.getElementById('sgTodosV')?.addEventListener('click', () => {
            if (_selVend.size === _sgVendedores.length) _selVend.clear();
            else _sgVendedores.forEach(v => _selVend.add(v.uid));
            renderSetup();
        });

        const pintar = () => {
            const rv = document.getElementById('sgFRubro').value;
            const sv = document.getElementById('sgFSegmento').value;
            const mv = document.getElementById('sgFMarca').value;
            const q  = (document.getElementById('sgBuscarProd').value || '').toLowerCase().trim();
            const segs   = _uniq(_sgProductos.filter(p => !rv || p.rubro === rv).map(p => p.segmento));
            const marcas = _uniq(_sgProductos.filter(p => (!rv || p.rubro === rv) && (!sv || p.segmento === sv)).map(p => p.marca));
            document.getElementById('sgFSegmento').innerHTML = '<option value="">Segmento</option>' + segs.map(v => `<option ${v === sv ? 'selected' : ''}>${v}</option>`).join('');
            document.getElementById('sgFMarca').innerHTML = '<option value="">Marca</option>' + marcas.map(v => `<option ${v === mv ? 'selected' : ''}>${v}</option>`).join('');
            const res = _sgProductos.filter(p => (!rv || p.rubro === rv) && (!sv || p.segmento === sv) && (!mv || p.marca === mv) &&
                (!q || [p.presentacion, p.marca, p.segmento].filter(Boolean).join(' ').toLowerCase().includes(q)));
            const lista = document.getElementById('sgProdLista');
            lista.innerHTML = res.slice(0, 200).map(p => {
                const sel = _selProd.has(p.id);
                return `<button type="button" data-id="${p.id}" class="sg-p w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 ${sel ? 'bg-slate-800 text-white hover:bg-slate-800' : ''}">${p.presentacion || ''}${p.marca ? ' · ' + p.marca : ''}</button>`;
            }).join('') || '<p class="text-[11px] text-slate-400 p-2">Sin resultados.</p>';
            lista.querySelectorAll('.sg-p').forEach(b => b.addEventListener('click', () => {
                const id = b.dataset.id;
                _selProd.has(id) ? _selProd.delete(id) : _selProd.add(id);
                pintar(); actualizarBoton();
            }));
            document.getElementById('sgProdSel').textContent = _selProd.size ? `${_selProd.size} producto(s) seleccionado(s)` : '';
        };
        const actualizarBoton = () => {
            document.getElementById('sgGenerar').disabled = !(_selVend.size && _selProd.size);
        };
        ['sgFRubro', 'sgFSegmento', 'sgFMarca'].forEach(id => document.getElementById(id).addEventListener('change', pintar));
        document.getElementById('sgBuscarProd').addEventListener('input', pintar);
        document.getElementById('sgDias').addEventListener('input', e => { _dias = Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 15)); });
        document.getElementById('sgGenerar').addEventListener('click', generarSeguimiento);
        pintar(); actualizarBoton();
    }

    // ═══════════════ RECOLECCIÓN DE DATOS ═══════════════
    async function generarSeguimiento() {
        const res = document.getElementById('sgResultado');
        document.getElementById('sgSetup').classList.add('hidden');
        res.classList.remove('hidden');
        res.innerHTML = '<p class="text-sm text-slate-400 text-center py-10 animate-pulse">Reconstruyendo el historial...</p>';

        const desde = new Date();
        desde.setDate(desde.getDate() - (_dias - 1));
        desde.setHours(0, 0, 0, 0);

        // movimientos[claveDia][productoId] = { ventas:[], recargas:[], correcciones:[], pedidos:[] }
        const dias = {};
        const stockActual = {}; // uid -> productoId -> unidades
        const asegurar = (dia, pid) => {
            dias[dia] = dias[dia] || {};
            dias[dia][pid] = dias[dia][pid] || { ventas: [], recargas: [], correcciones: [], pedidos: [] };
            return dias[dia][pid];
        };

        try {
            for (const uid of _selVend) {
                const v = _sgVendedores.find(x => x.uid === uid) || { uid };
                const nom = _nombreVend(v);

                // ── Stock actual del vendedor ──
                try {
                    const invSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/inventario`));
                    stockActual[uid] = {};
                    invSnap.docs.forEach(d => {
                        if (_selProd.has(d.id)) stockActual[uid][d.id] = (d.data().cantidadUnidades || 0);
                    });
                } catch (e) { }

                // ── VENTAS ──
                try {
                    const vSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/ventas`));
                    vSnap.docs.forEach(d => {
                        const venta = d.data();
                        const f = _aFecha(venta.fecha);
                        if (!f || f < desde) return;
                        const dia = _claveDia(f);
                        if (!dia) return;
                        (venta.productos || []).forEach(p => {
                            if (!_selProd.has(p.id)) return;
                            const u = p.totalUnidadesVendidas || 0;
                            if (!u) return;
                            asegurar(dia, p.id).ventas.push({
                                vendedor: nom, uid,
                                cliente: venta.clienteNombre || '(sin cliente)',
                                unidades: u,
                                detalle: p.cantidadVendida || {},
                                hora: _hora(f),
                                tipo: venta.tipoOperacion || ''
                            });
                        });
                    });
                } catch (e) { }

                // ── VENTAS dentro de CIERRES (histórico ya cerrado) ──
                try {
                    const cSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/cierres`));
                    cSnap.docs.forEach(d => {
                        const cierre = d.data();
                        const f = _aFecha(cierre.fecha);
                        if (!f || f < desde) return;
                        const dia = _claveDia(f);
                        if (!dia) return;
                        (cierre.ventas || []).forEach(venta => {
                            const fv = _aFecha(venta.fecha) || f;
                            const diaV = _claveDia(fv) || dia;
                            (venta.productos || []).forEach(p => {
                                if (!_selProd.has(p.id)) return;
                                const u = p.totalUnidadesVendidas || 0;
                                if (!u) return;
                                asegurar(diaV, p.id).ventas.push({
                                    vendedor: nom, uid,
                                    cliente: venta.clienteNombre || '(sin cliente)',
                                    unidades: u,
                                    detalle: p.cantidadVendida || {},
                                    hora: _hora(fv),
                                    tipo: venta.tipoOperacion || '',
                                    enCierre: true
                                });
                            });
                        });
                    });
                } catch (e) { }

                // ── RECARGAS ──
                try {
                    const rSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/recargas`));
                    rSnap.docs.forEach(d => {
                        const rec = d.data();
                        const f = _aFecha(rec.fecha);
                        if (!f || f < desde) return;
                        const dia = _claveDia(f);
                        if (!dia) return;
                        (rec.detalles || []).forEach(det => {
                            if (!_selProd.has(det.productoId)) return;
                            const dif = det.diferenciaUnidades || 0;
                            if (!dif) return;
                            asegurar(dia, det.productoId).recargas.push({
                                vendedor: nom, uid,
                                unidades: dif,
                                antes: det.unidadesAnteriores,
                                despues: det.unidadesNuevas,
                                hora: _hora(f)
                            });
                        });
                    });
                } catch (e) { }

                // ── CORRECCIONES DE INVENTARIO ──
                try {
                    const hSnap = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${uid}/historial_correcciones`));
                    hSnap.docs.forEach(d => {
                        const h = d.data();
                        const f = _aFecha(h.fecha || h.fechaCorreccion);
                        if (!f || f < desde) return;
                        const dia = _claveDia(f);
                        if (!dia) return;
                        const items = h.items || h.detalles || (h.productoId ? [h] : []);
                        items.forEach(it => {
                            const pid = it.productoId || it.id;
                            if (!_selProd.has(pid)) return;
                            const dif = (it.diferenciaUnidades !== undefined)
                                ? it.diferenciaUnidades
                                : ((it.unidadesNuevas || 0) - (it.unidadesAnteriores || 0));
                            if (!dif) return;
                            asegurar(dia, pid).correcciones.push({
                                vendedor: nom, uid,
                                unidades: dif,
                                motivo: h.motivo || it.motivo || 'Corrección',
                                por: h.realizadoPor || h.usuarioId || '',
                                hora: _hora(f)
                            });
                        });
                    });
                } catch (e) { }
            }

            // ── PEDIDOS DE PREVENTA ENTREGADOS ──
            try {
                const pSnap = await _getDocs(_collection(_db, `artifacts/${getPublicDataId()}/public/data/preventa_pedidos`));
                pSnap.docs.forEach(d => {
                    const ped = d.data();
                    if (!_selVend.has(ped.vendedorId)) return;
                    const f = _aFecha(ped.fechaCreacion);
                    if (!f || f < desde) return;
                    const dia = _claveDia(f);
                    if (!dia) return;
                    (ped.productos || []).forEach(p => {
                        if (!_selProd.has(p.id)) return;
                        const u = (p.cantCj || 0) * (p.unidadesPorCaja || 1) + (p.cantPaq || 0) * (p.unidadesPorPaquete || 1) + (p.cantUnd || 0);
                        if (!u) return;
                        asegurar(dia, p.id).pedidos.push({
                            vendedor: ped.vendedorNombre || '',
                            cliente: ped.clienteNombre || '',
                            unidades: u,
                            estado: ped.estado || '',
                            hora: _hora(f)
                        });
                    });
                });
            } catch (e) { }

            renderResultado(dias, stockActual, desde);
        } catch (e) {
            console.error('Seguimiento:', e);
            res.innerHTML = '<p class="text-sm text-red-500 text-center py-10">Error al construir el historial.</p>';
        }
    }

    // ═══════════════ RESULTADO ═══════════════
    function renderResultado(dias, stockActual, desde) {
        const res = document.getElementById('sgResultado');
        const claves = Object.keys(dias).sort().reverse(); // del día actual hacia atrás
        const prods = _sgProductos.filter(p => _selProd.has(p.id));
        const nombreProd = (pid) => {
            const p = _sgProductos.find(x => x.id === pid);
            return p ? [p.presentacion, p.marca].filter(Boolean).join(' · ') : pid;
        };
        const variosVend = _selVend.size > 1;

        // Totales del período por producto
        const tot = {};
        prods.forEach(p => tot[p.id] = { ventas: 0, recargas: 0, correcciones: 0, pedidos: 0 });
        claves.forEach(dia => Object.keys(dias[dia]).forEach(pid => {
            if (!tot[pid]) return;
            const m = dias[dia][pid];
            m.ventas.forEach(x => tot[pid].ventas += x.unidades);
            m.recargas.forEach(x => tot[pid].recargas += x.unidades);
            m.correcciones.forEach(x => tot[pid].correcciones += x.unidades);
            m.pedidos.forEach(x => tot[pid].pedidos += x.unidades);
        }));

        const stockTotal = (pid) => {
            let s = 0;
            Object.keys(stockActual).forEach(uid => { s += (stockActual[uid][pid] || 0); });
            return s;
        };

        const cabecera = `
            <div class="flex items-center justify-between mb-3">
                <div>
                    <p class="text-xs font-semibold text-slate-800">${prods.length} producto(s) · ${_selVend.size} vendedor(es)</p>
                    <p class="text-[10px] text-slate-500">Últimos ${_dias} días (hora de Venezuela)</p>
                </div>
                <button id="sgVolverSetup" class="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs rounded-md hover:bg-slate-200 font-medium">Cambiar selección</button>
            </div>

            <div class="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <div class="bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Resumen del período</div>
                <div class="divide-y divide-slate-100">
                ${prods.map(p => {
                    const t = tot[p.id] || { ventas: 0, recargas: 0, correcciones: 0 };
                    return `<div class="px-3 py-2">
                        <div class="text-xs font-semibold text-slate-800">${[p.presentacion, p.marca].filter(Boolean).join(' · ')}</div>
                        <div class="text-[11px] text-slate-600 mt-0.5 flex flex-wrap gap-x-3">
                            <span>Recargado: <b class="text-emerald-700">+${t.recargas}</b></span>
                            <span>Vendido: <b class="text-red-600">-${t.ventas}</b></span>
                            ${t.correcciones ? `<span>Correcciones: <b class="text-amber-600">${t.correcciones > 0 ? '+' : ''}${t.correcciones}</b></span>` : ''}
                            <span>Stock hoy: <b class="text-slate-800">${stockTotal(p.id)}</b></span>
                        </div>
                    </div>`;
                }).join('')}
                </div>
            </div>`;

        if (!claves.length) {
            res.innerHTML = cabecera + '<p class="text-sm text-slate-400 text-center py-8">No hubo movimientos en el período seleccionado.</p>';
            document.getElementById('sgVolverSetup').addEventListener('click', renderSetup);
            return;
        }

        const bloqueDia = (dia) => {
            const porProd = dias[dia];
            const pids = Object.keys(porProd).filter(pid => {
                const m = porProd[pid];
                return m.ventas.length || m.recargas.length || m.correcciones.length || m.pedidos.length;
            });
            if (!pids.length) return '';

            return `
            <div class="border border-slate-200 rounded-lg overflow-hidden mb-2">
                <div class="bg-slate-800 px-3 py-1.5">
                    <span class="text-xs font-semibold text-white capitalize">${_etiquetaDia(dia)}</span>
                </div>
                <div class="divide-y divide-slate-100">
                ${pids.map(pid => {
                    const m = porProd[pid];
                    const sumV = m.ventas.reduce((s, x) => s + x.unidades, 0);
                    const sumR = m.recargas.reduce((s, x) => s + x.unidades, 0);
                    const sumC = m.correcciones.reduce((s, x) => s + x.unidades, 0);
                    return `<div class="px-3 py-2">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <span class="text-xs font-semibold text-slate-800 truncate">${nombreProd(pid)}</span>
                            <span class="text-[11px] shrink-0">
                                ${sumR ? `<b class="text-emerald-700">+${sumR}</b>` : ''}
                                ${sumV ? ` <b class="text-red-600">-${sumV}</b>` : ''}
                                ${sumC ? ` <b class="text-amber-600">${sumC > 0 ? '+' : ''}${sumC}</b>` : ''}
                            </span>
                        </div>

                        ${m.recargas.length ? `<div class="mb-1">
                            <div class="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Recargas</div>
                            ${m.recargas.map(r => `<div class="text-[11px] text-slate-600 flex justify-between gap-2">
                                <span class="truncate">${variosVend ? r.vendedor : 'Recarga'} ${r.hora ? '· ' + r.hora : ''}</span>
                                <span class="shrink-0">+${r.unidades} <span class="text-slate-400">(${r.antes}&rarr;${r.despues})</span></span>
                            </div>`).join('')}
                        </div>` : ''}

                        ${m.ventas.length ? `<div class="mb-1">
                            <div class="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Ventas (${m.ventas.length})</div>
                            ${m.ventas.map(v => `<div class="text-[11px] text-slate-600 flex justify-between gap-2">
                                <span class="truncate">${v.cliente}${variosVend ? ' · ' + v.vendedor : ''} ${v.hora ? '· ' + v.hora : ''}</span>
                                <span class="shrink-0">-${v.unidades}</span>
                            </div>`).join('')}
                        </div>` : ''}

                        ${m.correcciones.length ? `<div class="mb-1">
                            <div class="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Correcciones</div>
                            ${m.correcciones.map(c => `<div class="text-[11px] text-slate-600 flex justify-between gap-2">
                                <span class="truncate">${c.motivo}${variosVend ? ' · ' + c.vendedor : ''}</span>
                                <span class="shrink-0">${c.unidades > 0 ? '+' : ''}${c.unidades}</span>
                            </div>`).join('')}
                        </div>` : ''}

                        ${m.pedidos.length ? `<div>
                            <div class="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Pedidos preventa</div>
                            ${m.pedidos.map(p => `<div class="text-[11px] text-slate-600 flex justify-between gap-2">
                                <span class="truncate">${p.cliente} <span class="text-slate-400">(${p.estado})</span></span>
                                <span class="shrink-0">${p.unidades}</span>
                            </div>`).join('')}
                        </div>` : ''}
                    </div>`;
                }).join('')}
                </div>
            </div>`;
        };

        res.innerHTML = cabecera +
            `<p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Historial por día</p>` +
            `<div class="max-h-[60vh] overflow-y-auto pr-1">${claves.map(bloqueDia).join('')}</div>`;
        document.getElementById('sgVolverSetup').addEventListener('click', renderSetup);
    }

})();

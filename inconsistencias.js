// ═══════════════════════════════════════════════════════════════════════
// CLIENTES POR GESTIONAR
//
// Lista de trabajo para resolver las diferencias entre los clientes de la
// empresa matriz y los del sistema propio. Permite llegar a cada uno por
// GPS y marcarlo como gestionado indicando qué se hizo.
//
// Datos: artifacts/{PUB}/public/data/clientes_gestion/{id}
// ═══════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _userId, _userRole, _mainContent, _showMainMenu, _showModal;
    let _collection, _doc, _getDocs, _setDoc, _deleteDoc, _writeBatch;

    window.initInconsistencias = function (deps) {
        _db          = deps.db;
        _userId      = deps.userId;
        _userRole    = deps.userRole;
        _mainContent = deps.mainContent;
        _showMainMenu = deps.showMainMenu;
        _showModal   = deps.showModal;
        _collection  = deps.collection;
        _doc         = deps.doc;
        _getDocs     = deps.getDocs;
        _setDoc      = deps.setDoc;
        _deleteDoc   = deps.deleteDoc;
        _writeBatch  = deps.writeBatch;
    };

    const AZUL = '#16305C';
    const AZUL_CLARO = '#BBD2EE';
    const PUB = () => window.AppConfig.PUBLIC_DATA_ID;
    const pGestion = () => `artifacts/${PUB()}/public/data/clientes_gestion`;
    const esAdmin = () => (window.userRole || _userRole) === 'admin';

    // Resultados posibles de la gestión
    const RESULTADOS = [
        { k: 'creado',      t: 'Creado en el sistema',       c: 'emerald' },
        { k: 'actualizado', t: 'Cliente existente, actualizado', c: 'blue' },
        { k: 'cerrado',     t: 'Cerrado en la empresa matriz', c: 'slate' },
        { k: 'no_ubicado',  t: 'No se pudo ubicar',           c: 'amber' }
    ];

    let _items = [];
    let _filtro = { estado: 'pendiente', texto: '' };
    let _mapa = null, _marcadores = [];

    // ─────────────────────────── PANTALLA ───────────────────────────
    window.showClientesGestion = async function () {
        if (!esAdmin()) { _showModal('Acceso restringido', 'Esta función es solo para administradores.'); return; }
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-3xl mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="px-4 py-3 flex items-center justify-between" style="background:${AZUL}">
                        <div class="min-w-0">
                            <h2 class="text-base font-semibold text-white tracking-tight">Clientes por Gestionar</h2>
                            <p class="text-[10px] mt-0.5" style="color:${AZUL_CLARO}">Diferencias con la empresa matriz</p>
                        </div>
                        <button id="cgVolver" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition shrink-0">Volver</button>
                    </div>

                    <div class="p-4">
                        <div id="cgResumen" class="mb-3"></div>

                        <div class="grid grid-cols-2 gap-2 mb-3">
                            <button id="cgVerMapa" class="py-2.5 text-white rounded-lg font-bold text-sm transition" style="background:${AZUL}">Ver en el mapa</button>
                            <button id="cgImportar" class="py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 border border-slate-300 transition">Cargar Excel</button>
                        </div>
                        <input type="file" id="cgArchivo" accept=".xlsx,.xls" class="hidden">

                        <div class="flex gap-1.5 mb-2">
                            <button data-e="pendiente" class="cg-tab flex-1 py-1.5 rounded text-[11px] font-bold border transition">Pendientes</button>
                            <button data-e="gestionado" class="cg-tab flex-1 py-1.5 rounded text-[11px] font-bold border transition">Gestionados</button>
                            <button data-e="" class="cg-tab flex-1 py-1.5 rounded text-[11px] font-bold border transition">Todos</button>
                        </div>
                        <input type="text" id="cgBuscar" placeholder="Buscar por nombre, CEP o RIF..." class="w-full text-xs border border-slate-300 rounded-md p-2 mb-2 outline-none focus:ring-2 focus:ring-slate-400">

                        <div id="cgLista" class="max-h-[52vh] overflow-y-auto space-y-1.5">
                            <p class="text-sm text-slate-400 text-center py-8 animate-pulse">Cargando...</p>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('cgVolver').addEventListener('click', () => _showMainMenu());
        document.getElementById('cgVerMapa').addEventListener('click', verMapa);
        document.getElementById('cgImportar').addEventListener('click', () => document.getElementById('cgArchivo').click());
        document.getElementById('cgArchivo').addEventListener('change', importarExcel);
        document.getElementById('cgBuscar').addEventListener('input', e => { _filtro.texto = e.target.value; render(); });
        document.querySelectorAll('.cg-tab').forEach(b => b.addEventListener('click', () => {
            _filtro.estado = b.dataset.e;
            pintarTabs(); render();
        }));

        pintarTabs();
        await cargar();
        render();
    };

    function pintarTabs() {
        document.querySelectorAll('.cg-tab').forEach(b => {
            const act = b.dataset.e === _filtro.estado;
            b.className = `cg-tab flex-1 py-1.5 rounded text-[11px] font-bold border transition ${act ? 'text-white' : 'bg-white text-slate-600 border-slate-300'}`;
            b.style.background = act ? AZUL : '';
            b.style.borderColor = act ? AZUL : '';
        });
    }

    async function cargar() {
        try {
            const snap = await _getDocs(_collection(_db, pGestion()));
            _items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''));
        } catch (e) { console.error('Clientes por gestionar:', e); _items = []; }
    }

    function filtrados() {
        const t = (_filtro.texto || '').toLowerCase().trim();
        return _items.filter(i =>
            (!_filtro.estado || (i.estado || 'pendiente') === _filtro.estado) &&
            (!t || [i.nombreComercial, i.cep, i.rif, i.tipo].filter(Boolean).join(' ').toLowerCase().includes(t)));
    }

    function render() {
        const cont = document.getElementById('cgLista');
        if (!cont) return;
        const pend = _items.filter(i => (i.estado || 'pendiente') === 'pendiente').length;
        const gest = _items.length - pend;

        const res = document.getElementById('cgResumen');
        if (res) {
            const pct = _items.length ? Math.round(gest * 100 / _items.length) : 0;
            res.innerHTML = _items.length ? `
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <div class="flex justify-between text-[11px] font-semibold text-slate-600">
                        <span><b>${pend}</b> por gestionar · ${gest} resueltos</span><span>${pct}%</span>
                    </div>
                    <div class="h-1.5 bg-slate-200 rounded mt-1 overflow-hidden"><div class="h-full" style="width:${pct}%;background:${AZUL}"></div></div>
                </div>` : '';
        }

        const lista = filtrados();
        if (!lista.length) {
            cont.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">${_items.length ? 'Sin clientes en esta vista.' : 'No hay clientes cargados. Usa <strong>Cargar Excel</strong> para empezar.'}</p>`;
            return;
        }

        cont.innerHTML = lista.map(i => {
            const hecho = (i.estado || 'pendiente') === 'gestionado';
            const r = RESULTADOS.find(x => x.k === i.resultado);
            return `
            <div class="border rounded-lg p-2.5 ${hecho ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="text-xs font-bold ${hecho ? 'text-slate-500' : 'text-slate-800'} truncate">${i.nombreComercial || '(sin nombre)'}</div>
                        <div class="text-[10px] text-slate-500">CEP ${i.cep || '—'}${i.rif ? ' · ' + i.rif : ''}</div>
                        <div class="text-[10px] text-slate-400">${i.tipo || ''}${i.adc === 'Si' ? ' · tiene ADC' : ''}</div>
                        ${hecho && r ? `<div class="text-[10px] font-bold text-${r.c}-700 mt-0.5">${r.t}${i.notas ? ' · ' + i.notas : ''}</div>` : ''}
                    </div>
                    ${!hecho ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style="background:${AZUL_CLARO};color:${AZUL}">PENDIENTE</span>` : ''}
                </div>
                <div class="grid grid-cols-3 gap-1.5 mt-2">
                    <button data-nav="${i.id}" class="cg-nav py-1.5 text-white text-[10px] font-bold rounded" style="background:${AZUL}">Cómo llegar</button>
                    <button data-ok="${i.id}" class="cg-ok py-1.5 text-[10px] font-bold rounded ${hecho ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white'}">${hecho ? 'Reabrir' : 'Gestionado'}</button>
                    <button data-del="${i.id}" class="cg-del py-1.5 bg-slate-100 text-red-600 text-[10px] font-bold rounded border border-slate-300">Eliminar</button>
                </div>
            </div>`;
        }).join('');

        cont.querySelectorAll('.cg-nav').forEach(b => b.addEventListener('click', () => navegar(b.dataset.nav)));
        cont.querySelectorAll('.cg-ok').forEach(b => b.addEventListener('click', () => alternarGestionado(b.dataset.ok)));
        cont.querySelectorAll('.cg-del').forEach(b => b.addEventListener('click', () => eliminar(b.dataset.del)));
    }

    // ── Navegación GPS ──
    function navegar(id) {
        const i = _items.find(x => x.id === id);
        if (!i || !i.lat || !i.lon) { _showModal('Sin ubicación', 'Este cliente no tiene coordenadas registradas.'); return; }
        document.getElementById('cgNavOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'cgNavOverlay';
        ov.className = 'fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-xs rounded-xl overflow-hidden shadow-2xl">
                <div class="px-4 py-3 text-white" style="background:${AZUL}">
                    <div class="font-bold text-sm truncate">${i.nombreComercial || ''}</div>
                    <div class="text-[10px]" style="color:${AZUL_CLARO}">${i.lat}, ${i.lon}</div>
                </div>
                <div class="p-3 space-y-2">
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lon}" target="_blank" rel="noopener"
                       class="block w-full py-2.5 text-white rounded-lg font-bold text-sm text-center" style="background:${AZUL}">Abrir en Google Maps</a>
                    <a href="https://waze.com/ul?ll=${i.lat},${i.lon}&navigate=yes" target="_blank" rel="noopener"
                       class="block w-full py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm text-center border border-slate-300">Abrir en Waze</a>
                    <button id="cgNavCerrar" class="w-full py-2 text-slate-500 text-xs font-bold">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('cgNavCerrar').addEventListener('click', () => ov.remove());
    }

    // ── Marcar gestionado ──
    function alternarGestionado(id) {
        const i = _items.find(x => x.id === id);
        if (!i) return;

        if ((i.estado || 'pendiente') === 'gestionado') {
            _showModal('Reabrir', `¿Volver a marcar <strong>${i.nombreComercial}</strong> como pendiente?`, async () => {
                await guardar(id, { estado: 'pendiente', resultado: '', notas: '' });
            }, 'Reabrir', null, true);
            return;
        }

        document.getElementById('cgOkOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'cgOkOverlay';
        ov.className = 'fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4';
        ov.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-xl overflow-hidden shadow-2xl">
                <div class="px-4 py-3 text-white" style="background:${AZUL}">
                    <div class="font-bold text-sm truncate">${i.nombreComercial || ''}</div>
                    <div class="text-[10px]" style="color:${AZUL_CLARO}">¿Qué se hizo con este cliente?</div>
                </div>
                <div class="p-4 space-y-1.5">
                    ${RESULTADOS.map(r => `<button data-r="${r.k}" class="cg-res w-full text-left px-3 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">${r.t}</button>`).join('')}
                    <input type="text" id="cgNotas" placeholder="Nota (opcional)" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none mt-1">
                </div>
                <button id="cgOkCerrar" class="w-full py-2.5 bg-slate-100 text-slate-600 font-bold text-sm">Cancelar</button>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('cgOkCerrar').addEventListener('click', () => ov.remove());
        ov.querySelectorAll('.cg-res').forEach(b => b.addEventListener('click', async () => {
            const notas = document.getElementById('cgNotas').value.trim();
            ov.remove();
            await guardar(id, {
                estado: 'gestionado', resultado: b.dataset.r, notas,
                fechaGestion: new Date().toISOString(), gestionadoPor: _userId
            });
        }));
    }

    async function guardar(id, datos) {
        try {
            await _setDoc(_doc(_db, pGestion(), id), datos, { merge: true });
            const i = _items.find(x => x.id === id);
            if (i) Object.assign(i, datos);
            render();
        } catch (e) { _showModal('Error', 'No se pudo guardar el cambio.'); }
    }

    function eliminar(id) {
        const i = _items.find(x => x.id === id);
        if (!i) return;
        _showModal('Eliminar de la lista',
            `¿Quitar <strong>${i.nombreComercial}</strong> de la lista de gestión?<br><br>Solo se borra de esta lista de trabajo; no afecta a los clientes del sistema.`,
            async () => {
                try {
                    await _deleteDoc(_doc(_db, pGestion(), id));
                    _items = _items.filter(x => x.id !== id);
                    render();
                } catch (e) { _showModal('Error', 'No se pudo eliminar.'); }
            }, 'Eliminar', null, true);
    }

    // ── Importar el Excel de la matriz ──
    async function importarExcel() {
        const file = document.getElementById('cgArchivo').files?.[0];
        if (!file) return;
        _showModal('Procesando', 'Leyendo el archivo...', null, '', null, false);
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
            if (!rows.length) throw new Error('El archivo está vacío.');

            // Ubicar las columnas por su encabezado (tolerante a cambios de orden)
            const cab = (rows[0] || []).map(c => (c || '').toString().toLowerCase());
            const col = (...claves) => cab.findIndex(c => claves.some(k => c.includes(k)));
            const iCep = col('cep'), iNom = col('nombre comercial', 'nombre'), iRif = col('rif'),
                  iTipo = col('tdc'), iGrupo = col('gr. clientes', 'grupo'), iMda = col('mda'),
                  iAdc = col('adc'), iXY = col('xy');

            if (iCep < 0 || iXY < 0) throw new Error('No se encontraron las columnas CEP y XY.');

            const nuevos = [];
            for (let r = 1; r < rows.length; r++) {
                const f = rows[r];
                if (!f || !f[iCep]) continue;
                const cep = (f[iCep] || '').toString().trim();
                const xy = (f[iXY] || '').toString().trim().split(',');
                const lat = parseFloat(xy[0]), lon = parseFloat(xy[1]);
                nuevos.push({
                    id: 'CEP' + cep.replace(/[^0-9A-Za-z]/g, ''),
                    cep,
                    nombreComercial: (f[iNom] || '').toString().trim(),
                    rif: iRif >= 0 ? (f[iRif] || '').toString().trim() : '',
                    tipo: iTipo >= 0 ? (f[iTipo] || '').toString().trim() : '',
                    grupo: iGrupo >= 0 ? (f[iGrupo] || '').toString().trim() : '',
                    mda: iMda >= 0 ? (f[iMda] || '').toString().trim() : '',
                    adc: iAdc >= 0 ? (f[iAdc] || '').toString().trim() : '',
                    lat: isNaN(lat) ? null : lat,
                    lon: isNaN(lon) ? null : lon,
                    estado: 'pendiente',
                    importado: new Date().toISOString()
                });
            }
            if (!nuevos.length) throw new Error('No se encontraron clientes en el archivo.');

            // Los que ya estaban gestionados conservan su estado
            const previos = {};
            _items.forEach(i => { previos[i.id] = i; });

            let batch = _writeBatch(_db), ops = 0, agregados = 0, conservados = 0;
            for (const n of nuevos) {
                const p = previos[n.id];
                if (p && p.estado === 'gestionado') {
                    conservados++;
                    continue;   // no se reabre lo ya resuelto
                }
                const { id, ...datos } = n;
                batch.set(_doc(_db, pGestion(), id), datos, { merge: true });
                ops++; agregados++;
                if (ops >= 400) { await batch.commit(); batch = _writeBatch(_db); ops = 0; }
            }
            if (ops > 0) await batch.commit();

            await cargar();
            render();
            _showModal('Importación lista',
                `Se cargaron <strong>${agregados}</strong> cliente(s) por gestionar.` +
                (conservados ? `<br><span class="text-xs text-slate-500">${conservados} ya estaban gestionados y se dejaron como estaban.</span>` : ''));
        } catch (e) {
            console.error('Importar gestión:', e);
            _showModal('Error', `No se pudo leer el archivo.<br><br><span class="text-xs text-slate-500">${e.message || ''}</span>`);
        } finally {
            document.getElementById('cgArchivo').value = '';
        }
    }

    // ── Mapa ──
    function verMapa() {
        const lista = filtrados().filter(i => i.lat && i.lon);
        if (!lista.length) { _showModal('Sin ubicaciones', 'No hay clientes con coordenadas en esta vista.'); return; }
        document.getElementById('cgMapaOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'cgMapaOverlay';
        ov.className = 'fixed inset-0 z-[10000] bg-white flex flex-col';
        ov.innerHTML = `
            <div class="px-4 py-3 flex items-center justify-between shrink-0" style="background:${AZUL}">
                <div>
                    <div class="text-white font-semibold text-sm">Mapa de gestión</div>
                    <div class="text-[10px]" style="color:${AZUL_CLARO}">${lista.length} cliente(s) · toca un punto para navegar</div>
                </div>
                <button id="cgMapaCerrar" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md font-medium shrink-0">Cerrar</button>
            </div>
            <div id="cg-map" class="flex-1" style="background:#e5e7eb"></div>`;
        document.body.appendChild(ov);
        document.getElementById('cgMapaCerrar').addEventListener('click', () => { _mapa = null; _marcadores = []; ov.remove(); });

        setTimeout(() => {
            if (typeof L === 'undefined') {
                document.getElementById('cg-map').innerHTML = '<p class="text-red-500 text-center p-6 text-sm">No se pudo cargar el mapa.</p>';
                return;
            }
            _mapa = L.map('cg-map').setView([lista[0].lat, lista[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(_mapa);
            const icono = (color) => new L.Icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });
            const pts = [];
            lista.forEach(i => {
                const hecho = (i.estado || 'pendiente') === 'gestionado';
                const m = L.marker([i.lat, i.lon], { icon: icono(hecho ? 'green' : 'red') }).addTo(_mapa);
                m.bindPopup(`
                    <div style="min-width:160px">
                        <div style="font-weight:800;font-size:12px">${i.nombreComercial || ''}</div>
                        <div style="font-size:10px;color:#64748b">CEP ${i.cep || ''}${i.tipo ? ' · ' + i.tipo : ''}</div>
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lon}" target="_blank"
                           style="display:block;margin-top:6px;background:${AZUL};color:#fff;text-align:center;padding:5px;border-radius:4px;font-size:11px;font-weight:700;text-decoration:none">Cómo llegar</a>
                    </div>`);
                _marcadores.push(m);
                pts.push([i.lat, i.lon]);
            });
            if (pts.length) { try { _mapa.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 }); } catch (e) {} }
        }, 60);
    }

})();

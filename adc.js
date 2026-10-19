// ═══════════════════════════════════════════════════════════════════════
// MÓDULO GESTIÓN DE ADC (equipos de frío de la compañía)
//
// Cada equipo es una ENTIDAD PROPIA en `adc_equipos`, con el CÓDIGO como
// identificador del documento (siempre en MAYÚSCULAS, así la búsqueda y el
// registro nunca fallan por diferencias de escritura).
//
// Permisos:
//   · Vendedor  → consultar, subir fotos, marcar "por regularizar".
//   · Admin     → además: registrar, editar, reasignar, eliminar y
//                 administrar la lista de tipos de equipo.
// ═══════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    let _db, _storage, _userId, _userRole, _mainContent;
    let _showModal, _volverArchivos;
    let _collection, _doc, _getDoc, _getDocs, _setDoc, _deleteDoc, _query, _where;

    window.initADC = function (deps) {
        _db          = deps.db;
        _storage     = deps.storage;
        _userId      = deps.userId;
        _userRole    = deps.userRole;
        _mainContent = deps.mainContent;
        _showModal   = deps.showModal;
        _collection  = deps.collection;
        _doc         = deps.doc;
        _getDoc      = deps.getDoc;
        _getDocs     = deps.getDocs;
        _setDoc      = deps.setDoc;
        _deleteDoc   = deps.deleteDoc;
        _query       = deps.query;
        _where       = deps.where;
    };

    const PUB = () => window.AppConfig.PUBLIC_DATA_ID;
    const pathEquipos = () => `artifacts/${PUB()}/public/data/adc_equipos`;
    const pathTipos   = () => `artifacts/${PUB()}/public/data/config/adc_tipos`;
    const pathClientes = () => `artifacts/${PUB()}/public/data/clientes`;
    const pathArchivos = () => `artifacts/${PUB()}/public/data/archivos_clientes`;

    const esAdmin = () => (window.userRole || _userRole) === 'admin';

    // Traduce los errores de Firebase a algo accionable (sobre todo permisos).
    function explicarError(e) {
        const code = (e && (e.code || e.message) || '').toString();
        if (/storage\/unauthorized|permission|insufficient/i.test(code)) {
            return 'El servidor rechazó la subida por permisos. Avisa al administrador: hay que revisar las reglas de Storage en Firebase.';
        }
        if (/storage\/quota-exceeded/i.test(code)) return 'No hay espacio disponible en el almacenamiento.';
        if (/storage\/retry-limit-exceeded|network/i.test(code)) return 'La conexión falló durante la subida. Inténtalo de nuevo con mejor señal.';
        if (/storage\/unauthenticated/i.test(code)) return 'La sesión expiró. Cierra sesión y vuelve a entrar.';
        return 'No se pudo completar la operación. Detalle: ' + code;
    }
    // Normaliza el código: mayúsculas y sin espacios, para registro Y búsqueda.
    const normCod = (s) => (s || '').toString().trim().toUpperCase().replace(/\s+/g, '');

    const RUBROS = ['CERVECERIA', 'PEPSI'];
    const TIPOS_DEFAULT = [
        'Visicooler 1 puerta', 'Visicooler 2 puertas',
        'Cervecero 1 puerta', 'Cervecero 2 puertas', 'Cervecero 3 puertas',
        'Froster',
        'Babycooler'
    ];

    let _equipos = [];
    let _tipos = [];
    let _clientes = [];
    let _filtro = { rubro: '', tipo: '', gps: '', estado: '', texto: '' };
    let _vistaActual = 'lista';

    // ── Carga de datos ──
    async function cargarTipos() {
        try {
            const snap = await _getDoc(_doc(_db, pathTipos()));
            const d = snap.exists() ? snap.data() : null;
            _tipos = (d && Array.isArray(d.tipos) && d.tipos.length) ? d.tipos : TIPOS_DEFAULT.slice();
            // Froster se incorporó después: si la lista guardada aún no lo tiene, se
            // agrega para que esté disponible al registrar.
            if (!_tipos.some(t => /froster/i.test(t))) _tipos.push('Froster');
        } catch (e) { _tipos = TIPOS_DEFAULT.slice(); }
        return _tipos;
    }

    async function cargarEquipos() {
        try {
            const snap = await _getDocs(_collection(_db, pathEquipos()));
            _equipos = snap.docs.map(d => ({ codigo: d.id, ...d.data() }));
        } catch (e) { console.warn('ADC: error cargando equipos', e); _equipos = []; }
        return _equipos;
    }

    async function cargarClientes() {
        if (_clientes.length) return _clientes;
        try {
            const snap = await _getDocs(_collection(_db, pathClientes()));
            _clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { _clientes = []; }
        return _clientes;
    }

    const nombreCliente = (id) => {
        const c = _clientes.find(x => x.id === id);
        return c ? (c.nombreComercial || c.nombrePersonal || id) : '';
    };

    // ═══════════════ PANTALLA PRINCIPAL ═══════════════
    window.showGestionADC = async function (volverFn) {
        if (volverFn) _volverArchivos = volverFn;
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-3xl mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="bg-slate-800 px-4 py-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Gestión de ADC</h2>
                            <p class="text-[10px] text-slate-400 mt-0.5">Equipos de frío de la compañía</p>
                        </div>
                        <button id="adcBack" class="px-3 py-1.5 bg-white/10 text-slate-100 text-xs rounded-md hover:bg-white/20 font-medium transition">Volver</button>
                    </div>

                    <div class="p-4">
                        <div class="mb-3">
                            <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Buscar equipo</label>
                            <div class="relative mt-1">
                                <input type="text" id="adcBuscar" placeholder="Código del equipo, cliente o CEP" autocomplete="off"
                                       class="w-full px-3 py-2.5 pr-8 border border-slate-300 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-400 transition">
                                <button id="adcBuscarLimpiar" class="hidden absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none font-bold">&times;</button>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">La lista se filtra mientras escribes: código, nombre del cliente o código CEP.</p>
                        </div>

                        <div class="flex gap-1.5 mb-3">
                            <button data-v="lista" class="adc-vista flex-1 py-1.5 rounded text-[11px] font-bold border bg-slate-800 text-white border-slate-800">Todos</button>
                            <button data-v="regular" class="adc-vista flex-1 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300">Por regularizar</button>
                            <button data-v="gps" class="adc-vista flex-1 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300">Con rastreo</button>
                        </div>

                        <div id="adcFiltros" class="grid grid-cols-2 gap-1.5 mb-2">
                            <select id="adcFRubro" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Rubro: todos</option>${RUBROS.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
                            <select id="adcFTipo" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none"><option value="">Tipo: todos</option></select>
                        </div>

                        <div id="adcLista" class="max-h-[46vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            <p class="text-xs text-slate-400 text-center py-6 animate-pulse">Cargando equipos...</p>
                        </div>

                        <div class="mt-3 grid ${esAdmin() ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
                            <button id="adcNuevo" class="py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition">Registrar equipo</button>
                            ${esAdmin() ? `<button id="adcTipos" class="py-2.5 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200 transition">Tipos de equipo</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('adcBack').addEventListener('click', () => {
            if (_volverArchivos) _volverArchivos();
            else if (window.showArchivosView) window.showArchivosView(true);
        });
        const inp = document.getElementById('adcBuscar');
        const btnLimpiar = document.getElementById('adcBuscarLimpiar');
        // Filtrado EN VIVO: no hay que presionar buscar, la lista se reduce al escribir.
        inp.addEventListener('input', () => {
            _filtro.texto = inp.value.trim();
            btnLimpiar.classList.toggle('hidden', !_filtro.texto);
            renderLista(_vistaActual);
        });
        btnLimpiar.addEventListener('click', () => {
            inp.value = ''; _filtro.texto = '';
            btnLimpiar.classList.add('hidden');
            renderLista(_vistaActual);
            inp.focus();
        });
        document.getElementById('adcNuevo').addEventListener('click', () => formularioEquipo(null));
        document.getElementById('adcTipos')?.addEventListener('click', administrarTipos);

        await Promise.all([cargarTipos(), cargarEquipos(), cargarClientes()]);
        await migrarDesdeArchivos();

        const selT = document.getElementById('adcFTipo');
        if (selT) selT.innerHTML = '<option value="">Tipo: todos</option>' + _tipos.map(t => `<option value="${t}">${t}</option>`).join('');

        _vistaActual = 'lista';
        const pintarVista = () => {
            document.querySelectorAll('.adc-vista').forEach(b => {
                const act = b.dataset.v === _vistaActual;
                b.className = `adc-vista flex-1 py-1.5 rounded text-[11px] font-bold border ${act ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300'}`;
            });
            renderLista(_vistaActual);
        };
        document.querySelectorAll('.adc-vista').forEach(b => b.addEventListener('click', () => { _vistaActual = b.dataset.v; pintarVista(); }));
        document.getElementById('adcFRubro').addEventListener('change', e => { _filtro.rubro = e.target.value; renderLista(_vistaActual); });
        document.getElementById('adcFTipo').addEventListener('change', e => { _filtro.tipo = e.target.value; renderLista(_vistaActual); });
        pintarVista();
    };

    // Migración suave: los equipos que ya estaban guardados como metadato de un
    // archivo (adcInfo) se registran como equipos propios la primera vez.
    async function migrarDesdeArchivos() {
        try {
            const snap = await _getDocs(_query(_collection(_db, pathArchivos()), _where('categoria', '==', 'adc')));
            const nuevos = [];
            snap.docs.forEach(d => {
                const a = d.data();
                const info = a.adcInfo;
                if (!info || !info.codigo) return;
                const cod = normCod(info.codigo);
                if (!cod || _equipos.some(e => e.codigo === cod)) return;
                const rubro = /CMYV|CERVEC/i.test(info.division || '') ? 'CERVECERIA' : 'PEPSI';
                const puertas = Number(info.puertas) || 1;
                let tipo = info.modelo || '';
                if (/visicooler/i.test(tipo)) tipo = `Visicooler ${puertas} puerta${puertas > 1 ? 's' : ''}`;
                else if (/froster/i.test(tipo)) tipo = 'Froster';
                else if (/cervec/i.test(tipo)) tipo = `Cervecero ${puertas} puerta${puertas > 1 ? 's' : ''}`;
                else if (/baby/i.test(tipo)) tipo = 'Babycooler';
                nuevos.push({
                    codigo: cod, rubro, tipo,
                    clienteId: a.clienteId || '',
                    gpsTrack: false, porRegularizar: false,
                    fotos: (a.archivos || []).map(x => ({ url: x.url, storagePath: x.storagePath })),
                    origen: 'migrado',
                    actualizado: new Date().toISOString(), actualizadoPor: _userId
                });
            });
            for (const eq of nuevos) {
                const { codigo, ...resto } = eq;
                await _setDoc(_doc(_db, pathEquipos(), codigo), resto, { merge: true });
                _equipos.push(eq);
            }
            if (nuevos.length) console.log(`ADC: ${nuevos.length} equipo(s) migrados desde archivos.`);
        } catch (e) { console.warn('ADC: migración omitida', e); }
    }

    async function marcarPorRegularizar(cod, equipoExistente) {
        const nota = prompt('Nota para la gestión (opcional):', '') || '';
        try {
            const datos = equipoExistente
                ? { porRegularizar: true, notaRegularizacion: nota, actualizado: new Date().toISOString(), actualizadoPor: _userId }
                : { rubro: '', tipo: '', clienteId: '', gpsTrack: false, fotos: [], porRegularizar: true,
                    notaRegularizacion: nota || 'Equipo hallado en campo, sin registro previo.',
                    creado: new Date().toISOString(), actualizado: new Date().toISOString(), actualizadoPor: _userId };
            await _setDoc(_doc(_db, pathEquipos(), cod), datos, { merge: true });
            _showModal('Marcado', `El equipo <strong>${cod}</strong> quedó en la lista <strong>Por regularizar</strong>.`);
            await cargarEquipos();
            renderLista('regular');
        } catch (e) { _showModal('Error', 'No se pudo marcar el equipo.'); }
    }

    // ═══════════════ LISTA ═══════════════
    function renderLista(vista) {
        const cont = document.getElementById('adcLista');
        if (!cont) return;
        let lista = _equipos.slice();
        if (vista === 'regular') lista = lista.filter(e => e.porRegularizar);
        if (vista === 'gps') lista = lista.filter(e => e.gpsTrack);
        if (_filtro.rubro) lista = lista.filter(e => e.rubro === _filtro.rubro);
        if (_filtro.tipo)  lista = lista.filter(e => e.tipo === _filtro.tipo);

        // Filtro de texto EN VIVO: código del equipo, nombre del cliente o código CEP
        const txt = (_filtro.texto || '').trim();
        if (txt) {
            const t = txt.toLowerCase();
            const tCod = normCod(txt);
            lista = lista.filter(e => {
                if (e.codigo.includes(tCod)) return true;
                const c = _clientes.find(x => x.id === e.clienteId);
                if (!c) return false;
                return (c.nombreComercial || '').toLowerCase().includes(t)
                    || (c.nombrePersonal || '').toLowerCase().includes(t)
                    || (c.codigoCEP || '').toString().toLowerCase().includes(t);
            });
        }
        lista.sort((a, b) => a.codigo.localeCompare(b.codigo));

        if (!lista.length) {
            cont.innerHTML = txt
                ? `<div class="text-center py-5">
                       <p class="text-xs text-slate-400">Ningún equipo coincide con "${txt}".</p>
                       <button id="adcSinResReg" class="mt-2 px-3 py-1.5 bg-slate-800 text-white text-[11px] font-bold rounded-lg">Registrar ${normCod(txt)}</button>
                       <button id="adcSinResMarc" class="mt-2 ml-1 px-3 py-1.5 bg-amber-600 text-white text-[11px] font-bold rounded-lg">Marcar por regularizar</button>
                   </div>`
                : '<p class="text-xs text-slate-400 text-center py-6">No hay equipos que coincidan.</p>';
            document.getElementById('adcSinResReg')?.addEventListener('click', () => formularioEquipo(null, normCod(txt)));
            document.getElementById('adcSinResMarc')?.addEventListener('click', () => marcarPorRegularizar(normCod(txt)));
            return;
        }
        cont.innerHTML = lista.map(e => `
            <button type="button" data-cod="${e.codigo}" class="adc-item w-full text-left px-3 py-2 hover:bg-slate-50 transition">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-black text-slate-800">${e.codigo}</span>
                    <span class="flex gap-1 shrink-0">
                        ${e.gpsTrack ? '<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">TRACK</span>' : ''}
                        ${e.porRegularizar ? '<span class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">REGULARIZAR</span>' : ''}
                    </span>
                </div>
                <div class="text-[10px] text-slate-500 truncate">${e.tipo || 'Sin tipo'}${e.rubro ? ' · ' + e.rubro : ''}</div>
                <div class="text-[10px] text-slate-400 truncate">${e.clienteId ? nombreCliente(e.clienteId) : 'Sin cliente asignado'}</div>
            </button>`).join('');
        cont.querySelectorAll('.adc-item').forEach(b => b.addEventListener('click', () => {
            const eq = _equipos.find(x => x.codigo === b.dataset.cod);
            if (eq) verEquipo(eq);
        }));
    }

    // ═══════════════════════════════════════════════════════════════════
    // MAPA ADC
    // Ubica los equipos usando las COORDENADAS DEL CLIENTE donde están
    // instalados (los equipos no tienen coordenadas propias). Permite
    // filtrar por los que tienen rastreo SCS Connect Track y los que no.
    // ═══════════════════════════════════════════════════════════════════
    let _mapaADC = null;
    let _mapaMarcadores = [];
    let _mapaFiltro = { track: '', rubro: '' };

    window.showMapaADC = async function (volverFn) {
        if (volverFn) _volverArchivos = volverFn;
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-3 pt-5 w-full max-w-4xl mx-auto">
                <div class="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
                    <div class="bg-slate-800 px-4 py-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-base font-semibold text-white tracking-tight">Mapa ADC</h2>
                            <p class="text-[10px] text-slate-400 mt-0.5">Ubicación de los equipos de la compañía</p>
                        </div>
                        <button id="mapBack" class="px-3 py-1.5 bg-white/10 text-slate-100 text-xs rounded-md hover:bg-white/20 font-medium transition">Volver</button>
                    </div>
                    <div class="p-3">
                        <div class="flex gap-1.5 mb-2">
                            <button data-t="" class="map-f flex-1 py-1.5 rounded text-[11px] font-bold border bg-slate-800 text-white border-slate-800">Todos</button>
                            <button data-t="si" class="map-f flex-1 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300">Con rastreo</button>
                            <button data-t="no" class="map-f flex-1 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300">Sin rastreo</button>
                        </div>
                        <select id="mapFRubro" class="w-full text-xs border border-slate-300 rounded-md p-1.5 bg-white outline-none mb-2">
                            <option value="">Rubro: todos</option>
                            ${RUBROS.map(r => `<option value="${r}">${r}</option>`).join('')}
                        </select>

                        <div id="mapResumen" class="text-[11px] text-slate-500 mb-1.5"></div>
                        <div id="adc-map" class="w-full rounded-lg shadow-inner z-0" style="height:58vh; border:1px solid #ccc; background:#e5e7eb;">
                            <p class="text-center text-gray-500 pt-10 font-medium animate-pulse">Iniciando mapa...</p>
                        </div>
                        <div class="flex flex-wrap gap-3 mt-2 text-[10px] text-slate-600">
                            <span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png" style="height:18px;margin-right:4px;"> Con SCS Connect Track</span>
                            <span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png" style="height:18px;margin-right:4px;"> Sin rastreo</span>
                            <span class="flex items-center"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png" style="height:18px;margin-right:4px;"> Por regularizar</span>
                        </div>
                    </div>
                </div>
            </div>`;
        document.getElementById('mapBack').addEventListener('click', () => {
            _mapaADC = null; _mapaMarcadores = [];
            if (_volverArchivos) _volverArchivos();
            else if (window.showArchivosView) window.showArchivosView(false);
        });

        _mapaFiltro = { track: '', rubro: '' };
        document.querySelectorAll('.map-f').forEach(b => b.addEventListener('click', () => {
            _mapaFiltro.track = b.dataset.t;
            document.querySelectorAll('.map-f').forEach(x => {
                const act = x.dataset.t === _mapaFiltro.track;
                x.className = `map-f flex-1 py-1.5 rounded text-[11px] font-bold border ${act ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300'}`;
            });
            pintarMarcadores();
        }));
        document.getElementById('mapFRubro').addEventListener('change', e => { _mapaFiltro.rubro = e.target.value; pintarMarcadores(); });

        await Promise.all([cargarEquipos(), cargarClientes()]);
        iniciarMapa();
    };

    function iniciarMapa() {
        const cont = document.getElementById('adc-map');
        if (!cont) return;
        if (typeof L === 'undefined') {
            cont.innerHTML = '<p class="text-red-500 font-bold p-4 text-center">No se pudo cargar el motor de mapas. Revisa tu conexión a internet.</p>';
            return;
        }
        cont.innerHTML = '';
        _mapaADC = L.map('adc-map').setView([7.77, -72.22], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(_mapaADC);
        pintarMarcadores();
    }

    // Coordenadas del cliente: vienen como "lat,lon" y se validan dentro de Venezuela
    function coordsDe(cliente) {
        if (!cliente || !cliente.coordenadas) return null;
        const p = cliente.coordenadas.split(',');
        if (p.length !== 2) return null;
        const lat = parseFloat(p[0]), lon = parseFloat(p[1]);
        if (isNaN(lat) || isNaN(lon)) return null;
        if (lat < 0 || lat > 13 || lon < -74 || lon > -59) return null;
        return [lat, lon];
    }

    function pintarMarcadores() {
        if (!_mapaADC || typeof L === 'undefined') return;
        _mapaMarcadores.forEach(m => _mapaADC.removeLayer(m));
        _mapaMarcadores = [];

        const icono = (color) => new L.Icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        });

        let lista = _equipos.slice();
        if (_mapaFiltro.track === 'si') lista = lista.filter(e => e.gpsTrack);
        if (_mapaFiltro.track === 'no') lista = lista.filter(e => !e.gpsTrack);
        if (_mapaFiltro.rubro) lista = lista.filter(e => e.rubro === _mapaFiltro.rubro);

        // Varios equipos pueden estar en el mismo cliente: se agrupan por coordenada
        const porCliente = {};
        let sinUbicacion = 0;
        lista.forEach(e => {
            const c = _clientes.find(x => x.id === e.clienteId);
            const co = coordsDe(c);
            if (!co) { sinUbicacion++; return; }
            const k = e.clienteId;
            if (!porCliente[k]) porCliente[k] = { coords: co, cliente: c, equipos: [] };
            porCliente[k].equipos.push(e);
        });

        const puntos = [];
        Object.values(porCliente).forEach(g => {
            const hayTrack = g.equipos.some(e => e.gpsTrack);
            const hayRegular = g.equipos.some(e => e.porRegularizar);
            const color = hayRegular ? 'orange' : (hayTrack ? 'green' : 'blue');
            const m = L.marker(g.coords, { icon: icono(color) }).addTo(_mapaADC);
            const nom = g.cliente.nombreComercial || g.cliente.nombrePersonal || '(sin nombre)';
            m.bindPopup(`
                <div style="min-width:170px">
                    <div style="font-weight:800;font-size:12px;margin-bottom:2px">${nom}</div>
                    <div style="font-size:10px;color:#64748b;margin-bottom:4px">${g.cliente.codigoCEP ? 'CEP ' + g.cliente.codigoCEP : ''}${g.cliente.sector ? ' · ' + g.cliente.sector : ''}</div>
                    ${g.equipos.map(e => `
                        <div style="border-top:1px solid #e2e8f0;padding-top:3px;margin-top:3px">
                            <div style="font-weight:700;font-size:11px">${e.codigo}</div>
                            <div style="font-size:10px;color:#475569">${e.tipo || 'Sin tipo'}${e.rubro ? ' · ' + e.rubro : ''}</div>
                            <div style="font-size:10px;color:${e.gpsTrack ? '#047857' : '#94a3b8'};font-weight:700">
                                ${e.gpsTrack ? 'SCS Connect Track' : 'Sin rastreo'}${e.porRegularizar ? ' · POR REGULARIZAR' : ''}
                            </div>
                        </div>`).join('')}
                </div>`);
            _mapaMarcadores.push(m);
            puntos.push(g.coords);
        });

        const resumen = document.getElementById('mapResumen');
        if (resumen) {
            const conTrack = lista.filter(e => e.gpsTrack).length;
            resumen.innerHTML = `<strong>${lista.length}</strong> equipo(s) · ${conTrack} con rastreo · ` +
                `<strong>${_mapaMarcadores.length}</strong> ubicación(es) en el mapa` +
                (sinUbicacion ? ` · <span class="text-amber-600">${sinUbicacion} sin coordenadas del cliente</span>` : '');
        }

        if (puntos.length) {
            try { _mapaADC.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 16 }); } catch (e) {}
        }
    }

    // ═══════════════ FICHA DEL EQUIPO ═══════════════
    function verEquipo(eq) {
        document.getElementById('adcFichaOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'adcFichaOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4';
        const fotos = eq.fotos || [];
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="bg-slate-800 text-white px-4 py-3 shrink-0">
                    <div class="font-black text-sm">${eq.codigo}</div>
                    <div class="text-[11px] text-slate-300">${eq.tipo || 'Sin tipo'}${eq.rubro ? ' · ' + eq.rubro : ''}</div>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    <div class="text-xs text-slate-600 mb-2">
                        <div><span class="text-slate-400">Cliente:</span> <strong>${eq.clienteId ? nombreCliente(eq.clienteId) : 'Sin asignar'}</strong></div>
                        <div class="mt-1"><span class="text-slate-400">SCS Connect Track:</span> <strong class="${eq.gpsTrack ? 'text-emerald-700' : 'text-slate-500'}">${eq.gpsTrack ? 'Sí' : 'No'}</strong></div>
                        ${eq.porRegularizar ? `<div class="mt-1.5 bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800"><strong>Por regularizar.</strong> ${eq.notaRegularizacion || ''}</div>` : ''}
                    </div>

                    <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Fotos (${fotos.length})</p>
                    <div class="grid grid-cols-3 gap-1.5 mb-3">
                        ${fotos.length ? fotos.map(f => `<a href="${f.url}" target="_blank" class="block"><img src="${f.url}" class="w-full h-20 object-cover rounded border border-slate-200"></a>`).join('')
                                       : '<p class="col-span-3 text-[11px] text-slate-400">Sin fotos cargadas.</p>'}
                    </div>
                    <input type="file" id="adcFotoInput" accept="image/*" multiple class="hidden">
                    <button id="adcSubirFotos" class="w-full py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Agregar o actualizar fotos</button>
                </div>
                <div class="p-3 border-t shrink-0 grid grid-cols-2 gap-2">
                    <button id="adcFichaReg" class="py-2 ${eq.porRegularizar ? 'bg-emerald-600' : 'bg-amber-600'} text-white rounded-lg text-xs font-bold">${eq.porRegularizar ? 'Marcar regularizado' : 'Por regularizar'}</button>
                    ${esAdmin()
                        ? `<button id="adcFichaEditar" class="py-2 bg-slate-800 text-white rounded-lg text-xs font-bold">Editar</button>`
                        : `<button id="adcFichaCerrar2" class="py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">Cerrar</button>`}
                    <button id="adcFichaCerrar" class="col-span-2 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('adcFichaCerrar').addEventListener('click', () => ov.remove());
        document.getElementById('adcFichaCerrar2')?.addEventListener('click', () => ov.remove());
        document.getElementById('adcFichaEditar')?.addEventListener('click', () => { ov.remove(); formularioEquipo(eq); });
        document.getElementById('adcFichaReg').addEventListener('click', async () => {
            if (eq.porRegularizar) {
                await _setDoc(_doc(_db, pathEquipos(), eq.codigo), { porRegularizar: false, notaRegularizacion: '', actualizado: new Date().toISOString(), actualizadoPor: _userId }, { merge: true });
                eq.porRegularizar = false;
                _showModal('Listo', `El equipo <strong>${eq.codigo}</strong> ya no está pendiente.`);
                ov.remove(); await cargarEquipos(); renderLista('lista');
            } else {
                ov.remove(); await marcarPorRegularizar(eq.codigo, true);
            }
        });

        const fileInput = document.getElementById('adcFotoInput');
        document.getElementById('adcSubirFotos').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const files = Array.from(fileInput.files || []);
            if (!files.length) return;
            _showModal('Subiendo', `Subiendo ${files.length} foto(s)...`, null, '', null, false);
            try {
                const subidas = [];
                for (let i = 0; i < files.length; i++) {
                    // La ruta debe tener EXACTAMENTE la misma forma que la del resto de la
                    // app (clientes/{clienteId}/{categoria}/{archivo}); un nivel de carpetas
                    // adicional no coincide con las reglas de Storage y la subida se rechaza.
                    // Por eso el código del equipo va dentro del NOMBRE del archivo.
                    const nombre = `ADC_${eq.codigo}_${Date.now()}_${i}_${files[i].name}`;
                    const baseCli = eq.clienteId || 'sin-cliente';
                    const ruta = `clientes/${baseCli}/imagenes/${nombre}`;
                    const r = window.firebaseStorageFunctions.ref(_storage, ruta);
                    await window.firebaseStorageFunctions.uploadBytes(r, files[i]);
                    const url = await window.firebaseStorageFunctions.getDownloadURL(r);
                    subidas.push({ url, storagePath: ruta });
                }
                const nuevas = (eq.fotos || []).concat(subidas);
                await _setDoc(_doc(_db, pathEquipos(), eq.codigo), { fotos: nuevas, actualizado: new Date().toISOString(), actualizadoPor: _userId }, { merge: true });
                eq.fotos = nuevas;
                _showModal('Listo', 'Fotos actualizadas.');
                ov.remove(); verEquipo(eq);
            } catch (e) { console.error('ADC subir fotos:', e); _showModal('Error al subir las fotos', explicarError(e)); }
        });
    }

    // ═══════════════ ALTA / EDICIÓN ═══════════════
    function formularioEquipo(eq, codigoSugerido) {
        if (!esAdmin() && eq) { _showModal('Solo lectura', 'Solo un administrador puede editar los datos del equipo. Puedes subir fotos o marcarlo por regularizar.'); return; }
        document.getElementById('adcFormOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'adcFormOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4';
        const edit = !!eq;
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="bg-slate-800 text-white px-4 py-3 shrink-0">
                    <div class="font-semibold text-sm">${edit ? 'Editar equipo' : 'Registrar equipo'}</div>
                </div>
                <div class="p-4 overflow-y-auto flex-1 space-y-3">
                    <div id="fCliBloque">
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">1. Cliente donde está instalado</label>
                        <div id="fCliBuscador" class="${edit && eq.clienteId ? 'hidden' : ''}">
                            <input type="text" id="fCliente" placeholder="Buscar cliente por nombre o CEP..." autocomplete="off"
                                   class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none mt-1">
                            <div id="fCliDrop" class="hidden border border-slate-200 rounded-lg max-h-40 overflow-y-auto mt-1"></div>
                        </div>
                        <div id="fCliElegido" class="${edit && eq.clienteId ? '' : 'hidden'} mt-1 flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                            <span id="fCliNombre" class="text-xs font-bold text-slate-800 truncate">${edit && eq.clienteId ? nombreCliente(eq.clienteId) : ''}</span>
                            <button type="button" id="fCliCambiar" class="text-[10px] text-slate-500 hover:text-slate-800 underline shrink-0">Cambiar</button>
                        </div>
                    </div>

                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">2. Código del equipo</label>
                        <input type="text" id="fCodigo" value="${edit ? eq.codigo : (codigoSugerido || '')}" ${edit ? 'disabled' : ''}
                               class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm uppercase font-semibold outline-none mt-1 ${edit ? 'bg-slate-100' : ''}">
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">3. Rubro</label>
                        <select id="fRubro" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none mt-1">
                            <option value="">Seleccione...</option>
                            ${RUBROS.map(r => `<option value="${r}" ${edit && eq.rubro === r ? 'selected' : ''}>${r === 'CERVECERIA' ? 'ADC de Cervecería' : 'ADC de Pepsi'}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">4. Tipo de equipo</label>
                        <select id="fTipo" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none mt-1">
                            <option value="">Seleccione...</option>
                            ${_tipos.map(t => `<option value="${t}" ${edit && eq.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <label class="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <input type="checkbox" id="fGps" class="w-4 h-4 accent-emerald-600" ${edit && eq.gpsTrack ? 'checked' : ''}>
                        <span class="text-xs font-bold text-slate-700">SCS Connect Track</span>
                        <span class="text-[10px] text-slate-400">(rastreo GPS)</span>
                    </label>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">5. Fotos del equipo</label>
                        <input type="file" id="fFotos" accept="image/*" multiple class="w-full text-xs mt-1 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-white">
                        <p id="fFotosInfo" class="text-[10px] text-slate-400 mt-1">${edit ? 'Las fotos que agregues se suman a las existentes.' : 'Puedes subir las fotos ahora o después.'}</p>
                    </div>
                </div>
                <div class="p-3 border-t shrink-0 grid grid-cols-2 gap-2">
                    <button id="fGuardar" class="py-2.5 bg-slate-800 text-white rounded-lg font-bold text-sm">Guardar</button>
                    <button id="fCancelar" class="py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cancelar</button>
                    ${edit && esAdmin() ? `<button id="fEliminar" class="col-span-2 py-2 text-red-600 text-xs font-bold hover:underline">Eliminar equipo</button>` : ''}
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('fCancelar').addEventListener('click', () => ov.remove());

        const fc = document.getElementById('fCodigo');
        fc.addEventListener('input', () => { fc.value = fc.value.toUpperCase(); });

        let clienteSel = edit ? (eq.clienteId || '') : '';
        const inpCli   = document.getElementById('fCliente');
        const bloqueBus = document.getElementById('fCliBuscador');
        const bloqueSel = document.getElementById('fCliElegido');
        const dropCli  = document.getElementById('fCliDrop');

        // Al elegir el cliente se OCULTA el buscador y queda la selección visible,
        // con opción de cambiarla.
        const fijarCliente = (id) => {
            clienteSel = id;
            document.getElementById('fCliNombre').textContent = nombreCliente(id);
            dropCli.classList.add('hidden');
            inpCli.value = '';
            bloqueBus.classList.add('hidden');
            bloqueSel.classList.remove('hidden');
        };
        document.getElementById('fCliCambiar').addEventListener('click', () => {
            clienteSel = '';
            bloqueSel.classList.add('hidden');
            bloqueBus.classList.remove('hidden');
            inpCli.focus();
        });

        inpCli.addEventListener('input', () => {
            const t = inpCli.value.toLowerCase().trim();
            if (!t) { dropCli.classList.add('hidden'); return; }
            const res = _clientes.filter(c =>
                (c.nombreComercial || '').toLowerCase().includes(t) ||
                (c.nombrePersonal || '').toLowerCase().includes(t) ||
                (c.codigoCEP || '').toString().toLowerCase().includes(t)
            ).slice(0, 20);
            dropCli.innerHTML = res.map(c => `
                <button type="button" data-id="${c.id}" class="fcli w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-100">
                    <span class="font-semibold text-slate-800">${c.nombreComercial || c.nombrePersonal || '(sin nombre)'}</span>
                    <span class="block text-[10px] text-slate-400">${c.codigoCEP ? 'CEP ' + c.codigoCEP : ''}${c.sector ? ' · ' + c.sector : ''}</span>
                </button>`).join('') || '<p class="text-[11px] text-slate-400 p-2">Sin resultados</p>';
            dropCli.classList.remove('hidden');
            dropCli.querySelectorAll('.fcli').forEach(b => b.addEventListener('click', () => fijarCliente(b.dataset.id)));
        });

        document.getElementById('fGuardar').addEventListener('click', async () => {
            const cod = normCod(fc.value);
            const rubro = document.getElementById('fRubro').value;
            const tipo = document.getElementById('fTipo').value;
            const gps = document.getElementById('fGps').checked;
            if (!clienteSel) { _showModal('Aviso', 'Primero selecciona el cliente donde está instalado el equipo.'); return; }
            if (!cod) { _showModal('Aviso', 'Indica el código del equipo.'); return; }
            if (!rubro || !tipo) { _showModal('Aviso', 'Selecciona el rubro y el tipo de equipo.'); return; }
            if (!edit && _equipos.some(e => e.codigo === cod)) { _showModal('Aviso', `Ya existe un equipo con el código <strong>${cod}</strong>.`); return; }
            const files = Array.from(document.getElementById('fFotos').files || []);
            const btnG = document.getElementById('fGuardar');
            btnG.disabled = true; btnG.textContent = files.length ? 'Subiendo fotos...' : 'Guardando...';
            try {
                // Las fotos del equipo se guardan en su propia carpeta de ADC
                let fotos = edit ? (eq.fotos || []).slice() : [];
                for (let i = 0; i < files.length; i++) {
                    // Misma forma de ruta que usa Archivos (4 niveles), para respetar las
                    // reglas de Storage. El código del equipo va en el nombre del archivo.
                    const nombre = `ADC_${cod}_${Date.now()}_${i}_${files[i].name}`;
                    const baseCli = clienteSel || 'sin-cliente';
                    const ruta = `clientes/${baseCli}/imagenes/${nombre}`;
                    const r = window.firebaseStorageFunctions.ref(_storage, ruta);
                    await window.firebaseStorageFunctions.uploadBytes(r, files[i]);
                    const url = await window.firebaseStorageFunctions.getDownloadURL(r);
                    fotos.push({ url, storagePath: ruta });
                }
                await _setDoc(_doc(_db, pathEquipos(), cod), {
                    rubro, tipo, clienteId: clienteSel, gpsTrack: gps, fotos,
                    ...(edit ? {} : { porRegularizar: false, creado: new Date().toISOString() }),
                    actualizado: new Date().toISOString(), actualizadoPor: _userId
                }, { merge: true });
                ov.remove();
                _showModal('Guardado', `Equipo <strong>${cod}</strong> guardado${files.length ? ` con ${files.length} foto(s)` : ''}.`);
                await cargarEquipos();
                renderLista('lista');
            } catch (e) {
                console.error('ADC guardar equipo:', e);
                _showModal('Error al guardar', explicarError(e));
                btnG.disabled = false; btnG.textContent = 'Guardar';
            }
        });

        document.getElementById('fEliminar')?.addEventListener('click', () => {
            _showModal('Eliminar equipo', `¿Eliminar <strong>${eq.codigo}</strong> del registro? Las fotos no se borran.`, async () => {
                try {
                    await _deleteDoc(_doc(_db, pathEquipos(), eq.codigo));
                    ov.remove();
                    await cargarEquipos();
                    renderLista('lista');
                } catch (e) { _showModal('Error', 'No se pudo eliminar.'); }
            }, 'Eliminar', null, true);
        });
    }

    // ═══════════════ TIPOS DE EQUIPO (admin) ═══════════════
    function administrarTipos() {
        document.getElementById('adcTiposOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'adcTiposOverlay';
        ov.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4';
        const pintar = () => `
            <div id="tiposLista" class="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                ${_tipos.map((t, i) => `
                    <div class="flex items-center gap-2 px-2.5 py-1.5">
                        <input type="text" value="${t}" data-i="${i}" class="tipo-inp flex-1 min-w-0 text-xs border border-transparent hover:border-slate-300 focus:border-slate-400 rounded px-1 py-1 outline-none">
                        <button data-i="${i}" class="tipo-del text-[10px] text-red-500 font-bold shrink-0">Quitar</button>
                    </div>`).join('')}
            </div>`;
        ov.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div class="bg-slate-800 text-white px-4 py-3 shrink-0">
                    <div class="font-semibold text-sm">Tipos de equipo</div>
                    <div class="text-[10px] text-slate-400">Agrega, edita o quita según cambien los modelos</div>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    <div id="tiposCont">${pintar()}</div>
                    <div class="flex gap-2 mt-2">
                        <input type="text" id="tipoNuevo" placeholder="Nuevo tipo..." class="flex-1 min-w-0 px-2.5 py-2 border border-slate-300 rounded-lg text-xs outline-none">
                        <button id="tipoAdd" class="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg">Agregar</button>
                    </div>
                </div>
                <div class="p-3 border-t shrink-0 grid grid-cols-2 gap-2">
                    <button id="tiposGuardar" class="py-2.5 bg-slate-800 text-white rounded-lg font-bold text-sm">Guardar</button>
                    <button id="tiposCerrar" class="py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        document.getElementById('tiposCerrar').addEventListener('click', () => ov.remove());

        const refrescar = () => {
            document.getElementById('tiposCont').innerHTML = pintar();
            enlazar();
        };
        const enlazar = () => {
            document.querySelectorAll('.tipo-inp').forEach(i => i.addEventListener('input', () => { _tipos[Number(i.dataset.i)] = i.value; }));
            document.querySelectorAll('.tipo-del').forEach(b => b.addEventListener('click', () => { _tipos.splice(Number(b.dataset.i), 1); refrescar(); }));
        };
        enlazar();
        document.getElementById('tipoAdd').addEventListener('click', () => {
            const v = document.getElementById('tipoNuevo').value.trim();
            if (!v) return;
            _tipos.push(v);
            document.getElementById('tipoNuevo').value = '';
            refrescar();
        });
        document.getElementById('tiposGuardar').addEventListener('click', async () => {
            const limpios = _tipos.map(t => (t || '').trim()).filter(Boolean);
            try {
                await _setDoc(_doc(_db, pathTipos()), { tipos: limpios, actualizado: new Date().toISOString(), actualizadoPor: _userId });
                _tipos = limpios;
                ov.remove();
                const selT = document.getElementById('adcFTipo');
                if (selT) selT.innerHTML = '<option value="">Tipo: todos</option>' + _tipos.map(t => `<option value="${t}">${t}</option>`).join('');
                _showModal('Guardado', 'Lista de tipos actualizada.');
            } catch (e) { _showModal('Error', 'No se pudo guardar.'); }
        });
    }

})();

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
    // Normaliza el código: mayúsculas y sin espacios, para registro Y búsqueda.
    const normCod = (s) => (s || '').toString().trim().toUpperCase().replace(/\s+/g, '');

    const RUBROS = ['CERVECERIA', 'PEPSI'];
    const TIPOS_DEFAULT = [
        'Visicooler 1 puerta', 'Visicooler 2 puertas',
        'Cervecero 1 puerta', 'Cervecero 2 puertas', 'Cervecero 3 puertas',
        'Babycooler'
    ];

    let _equipos = [];
    let _tipos = [];
    let _clientes = [];
    let _filtro = { rubro: '', tipo: '', gps: '', estado: '' };

    // ── Carga de datos ──
    async function cargarTipos() {
        try {
            const snap = await _getDoc(_doc(_db, pathTipos()));
            const d = snap.exists() ? snap.data() : null;
            _tipos = (d && Array.isArray(d.tipos) && d.tipos.length) ? d.tipos : TIPOS_DEFAULT.slice();
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
                            <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Buscar equipo por código</label>
                            <div class="flex gap-2 mt-1">
                                <input type="text" id="adcBuscar" placeholder="Ej: ADC-12345" autocomplete="off"
                                       class="flex-1 min-w-0 px-3 py-2.5 border border-slate-300 rounded-lg text-sm uppercase font-semibold outline-none focus:ring-2 focus:ring-slate-400 transition">
                                <button id="adcBuscarBtn" class="px-4 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-900 transition">Buscar</button>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">El código se guarda y se busca siempre en mayúsculas.</p>
                        </div>

                        <div id="adcResultado" class="mb-3"></div>

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
        inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') buscarEquipo(); });
        document.getElementById('adcBuscarBtn').addEventListener('click', buscarEquipo);
        document.getElementById('adcNuevo').addEventListener('click', () => formularioEquipo(null));
        document.getElementById('adcTipos')?.addEventListener('click', administrarTipos);

        await Promise.all([cargarTipos(), cargarEquipos(), cargarClientes()]);
        await migrarDesdeArchivos();

        const selT = document.getElementById('adcFTipo');
        if (selT) selT.innerHTML = '<option value="">Tipo: todos</option>' + _tipos.map(t => `<option value="${t}">${t}</option>`).join('');

        let vista = 'lista';
        const pintarVista = () => {
            document.querySelectorAll('.adc-vista').forEach(b => {
                const act = b.dataset.v === vista;
                b.className = `adc-vista flex-1 py-1.5 rounded text-[11px] font-bold border ${act ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300'}`;
            });
            renderLista(vista);
        };
        document.querySelectorAll('.adc-vista').forEach(b => b.addEventListener('click', () => { vista = b.dataset.v; pintarVista(); }));
        document.getElementById('adcFRubro').addEventListener('change', e => { _filtro.rubro = e.target.value; renderLista(vista); });
        document.getElementById('adcFTipo').addEventListener('change', e => { _filtro.tipo = e.target.value; renderLista(vista); });
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
                else if (/froster|cervec/i.test(tipo)) tipo = `Cervecero ${puertas} puerta${puertas > 1 ? 's' : ''}`;
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

    // ═══════════════ BÚSQUEDA POR CÓDIGO ═══════════════
    async function buscarEquipo() {
        const cod = normCod(document.getElementById('adcBuscar').value);
        const cont = document.getElementById('adcResultado');
        if (!cod) { cont.innerHTML = ''; return; }
        const eq = _equipos.find(e => e.codigo === cod);

        if (!eq) {
            // No está registrado: permitir registrarlo o dejarlo marcado para gestión
            cont.innerHTML = `
                <div class="border border-amber-300 bg-amber-50 rounded-lg p-3">
                    <div class="text-xs font-bold text-amber-800">El equipo ${cod} no está registrado</div>
                    <p class="text-[11px] text-amber-700 mt-0.5">Puedes registrarlo ahora o marcarlo para que la compañía lo regularice.</p>
                    <div class="flex gap-2 mt-2">
                        <button id="adcRegNuevo" class="flex-1 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg">Registrar equipo</button>
                        <button id="adcMarcarReg" class="flex-1 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg">Marcar por regularizar</button>
                    </div>
                </div>`;
            document.getElementById('adcRegNuevo').addEventListener('click', () => formularioEquipo(null, cod));
            document.getElementById('adcMarcarReg').addEventListener('click', () => marcarPorRegularizar(cod));
            return;
        }
        cont.innerHTML = '';
        verEquipo(eq);
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
            document.getElementById('adcResultado').innerHTML = '';
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
        lista.sort((a, b) => a.codigo.localeCompare(b.codigo));

        if (!lista.length) {
            cont.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay equipos que coincidan.</p>';
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
                    const nombre = `${Date.now()}_${i}_${files[i].name}`;
                    const ruta = `adc/${eq.codigo}/${nombre}`;
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
            } catch (e) { console.error(e); _showModal('Error', 'No se pudieron subir las fotos.'); }
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
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Código</label>
                        <input type="text" id="fCodigo" value="${edit ? eq.codigo : (codigoSugerido || '')}" ${edit ? 'disabled' : ''}
                               class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm uppercase font-semibold outline-none mt-1 ${edit ? 'bg-slate-100' : ''}">
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Rubro</label>
                        <select id="fRubro" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none mt-1">
                            <option value="">Seleccione...</option>
                            ${RUBROS.map(r => `<option value="${r}" ${edit && eq.rubro === r ? 'selected' : ''}>${r === 'CERVECERIA' ? 'ADC de Cervecería' : 'ADC de Pepsi'}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tipo de equipo</label>
                        <select id="fTipo" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none mt-1">
                            <option value="">Seleccione...</option>
                            ${_tipos.map(t => `<option value="${t}" ${edit && eq.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cliente donde está instalado</label>
                        <input type="text" id="fCliente" placeholder="Buscar cliente..." autocomplete="off"
                               class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none mt-1">
                        <div id="fCliDrop" class="hidden border border-slate-200 rounded-lg max-h-36 overflow-y-auto mt-1"></div>
                        <p id="fCliSel" class="text-[11px] text-slate-600 mt-1">${edit && eq.clienteId ? 'Actual: <strong>' + nombreCliente(eq.clienteId) + '</strong>' : ''}</p>
                    </div>
                    <label class="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <input type="checkbox" id="fGps" class="w-4 h-4 accent-emerald-600" ${edit && eq.gpsTrack ? 'checked' : ''}>
                        <span class="text-xs font-bold text-slate-700">SCS Connect Track</span>
                        <span class="text-[10px] text-slate-400">(rastreo GPS)</span>
                    </label>
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
        const inpCli = document.getElementById('fCliente');
        inpCli.addEventListener('input', () => {
            const t = inpCli.value.toLowerCase().trim();
            const drop = document.getElementById('fCliDrop');
            if (!t) { drop.classList.add('hidden'); return; }
            const res = _clientes.filter(c => (c.nombreComercial || '').toLowerCase().includes(t) || (c.nombrePersonal || '').toLowerCase().includes(t)).slice(0, 20);
            drop.innerHTML = res.map(c => `<button type="button" data-id="${c.id}" class="fcli w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-100">${c.nombreComercial || c.nombrePersonal}</button>`).join('') || '<p class="text-[11px] text-slate-400 p-2">Sin resultados</p>';
            drop.classList.remove('hidden');
            drop.querySelectorAll('.fcli').forEach(b => b.addEventListener('click', () => {
                clienteSel = b.dataset.id;
                document.getElementById('fCliSel').innerHTML = 'Seleccionado: <strong>' + nombreCliente(clienteSel) + '</strong>';
                drop.classList.add('hidden'); inpCli.value = '';
            }));
        });

        document.getElementById('fGuardar').addEventListener('click', async () => {
            const cod = normCod(fc.value);
            const rubro = document.getElementById('fRubro').value;
            const tipo = document.getElementById('fTipo').value;
            const gps = document.getElementById('fGps').checked;
            if (!cod) { _showModal('Aviso', 'Indica el código del equipo.'); return; }
            if (!rubro || !tipo) { _showModal('Aviso', 'Selecciona el rubro y el tipo de equipo.'); return; }
            if (!edit && _equipos.some(e => e.codigo === cod)) { _showModal('Aviso', `Ya existe un equipo con el código <strong>${cod}</strong>.`); return; }
            try {
                await _setDoc(_doc(_db, pathEquipos(), cod), {
                    rubro, tipo, clienteId: clienteSel, gpsTrack: gps,
                    ...(edit ? {} : { fotos: [], porRegularizar: false, creado: new Date().toISOString() }),
                    actualizado: new Date().toISOString(), actualizadoPor: _userId
                }, { merge: true });
                ov.remove();
                _showModal('Guardado', `Equipo <strong>${cod}</strong> guardado.`);
                await cargarEquipos();
                renderLista('lista');
            } catch (e) { console.error(e); _showModal('Error', 'No se pudo guardar el equipo.'); }
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

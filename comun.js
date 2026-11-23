// ═══════════════════════════════════════════════════════════════════════════
// COMUN.JS — Utilidades compartidas por todos los módulos
//
// Este archivo existe para que las cosas que se usan en toda la aplicación
// estén escritas UNA sola vez. Antes la verificación de administrador estaba
// repetida 37 veces en 16 módulos con cuatro redacciones distintas, y la
// cabecera del estilo profesional copiada en cinco. Cuando algo así se repite,
// un arreglo en un módulo deja a los demás con el error.
//
// Se carga ANTES que los módulos (sin defer), para que todos lo encuentren
// listo. Ver index.html.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ───────────────────────────── ROLES ─────────────────────────────
    // El rol vive en window.userRole, que index.html actualiza al iniciar
    // sesión y al cambiar de usuario. Los módulos guardan una copia suya
    // (_userRole) cuando arrancan, y esa copia se queda vieja si el rol
    // cambia durante la sesión. Por eso aquí siempre se consulta el global.
    //
    // 'user' es el nombre antiguo de 'vendedor' y sigue existiendo en
    // usuarios creados hace tiempo: se tratan como lo mismo.

    function rolActual() {
        return window.userRole || '';
    }

    function esAdmin() {
        return rolActual() === 'admin';
    }

    function esVendedor() {
        const r = rolActual();
        return r === 'vendedor' || r === 'user';
    }

    function esDespachador() {
        return rolActual() === 'despachador';
    }

    // ──────────────────────── ESTILO PROFESIONAL ────────────────────────
    // Azul corporativo de la empresa. Si algún día cambia la identidad
    // visual, se cambia aquí y la aplicación completa lo toma.
    const AZUL = '#16305C';
    const AZUL_CLARO = '#BBD2EE';

    // Barra superior de una pantalla: título, subtítulo y botón Volver.
    function cabecera(titulo, subtitulo, idVolver) {
        return `<div class="px-4 py-3 flex items-center justify-between" style="background:${AZUL}">
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold text-white tracking-tight truncate">${titulo}</h2>
                        <p class="text-[10px] mt-0.5 truncate" style="color:${AZUL_CLARO}">${subtitulo}</p>
                    </div>
                    <button id="${idVolver}" class="px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20 font-medium transition shrink-0">Volver</button>
                </div>`;
    }

    // La misma cabecera, pero a sangre dentro de una tarjeta que ya tiene
    // relleno propio (se sale del padding con márgenes negativos).
    function cabeceraCard(titulo, subtitulo, idVolver) {
        return `<div class="-m-3 sm:-m-4 mb-3 sm:mb-4">${cabecera(titulo, subtitulo, idVolver)}</div>`;
    }

    // Botón de menú con título y descripción.
    function tarjetaMenu(id, titulo, descripcion) {
        return `<button id="${id}" class="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-[#16305C] hover:shadow-md transition group">
                    <p class="font-semibold text-gray-900 group-hover:text-[#16305C] transition">${titulo}</p>
                    <p class="text-xs text-gray-500 mt-0.5 leading-snug">${descripcion}</p>
                </button>`;
    }

    // ───────────────────────────── FECHAS ─────────────────────────────
    // La empresa trabaja en hora de Venezuela (GMT-4). El teléfono o la
    // computadora pueden estar en otra zona, y toISOString() siempre devuelve
    // UTC: una venta del 30/07 a las 8 de la noche es "31/07" en UTC. De ahí
    // salió el error de los cierres que no aparecían con el filtro de fechas.
    //
    // Todo lo que sea fecha pasa por aquí y se calcula en América/Caracas,
    // sin importar cómo esté configurado el aparato.
    const ZONA = 'America/Caracas';

    // Acepta lo que guarda Firestore (Timestamp), una fecha ISO, milisegundos
    // o un Date, y devuelve siempre un Date, o null si no se puede interpretar.
    function aFecha(v) {
        if (!v && v !== 0) return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        if (typeof v.toDate === 'function') { try { return v.toDate(); } catch (e) { return null; } }
        if (typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
        if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
        return null;
    }

    // 'AAAA-MM-DD' del día en Venezuela. Es la clave para agrupar, filtrar y
    // nombrar archivos: ordena sola y no depende de la zona del aparato.
    function clave(v) {
        const d = v === undefined ? new Date() : aFecha(v);
        if (!d) return '';
        return d.toLocaleDateString('en-CA', { timeZone: ZONA });
    }

    // '30/7/2026'
    function fecha(v, opciones) {
        const d = v === undefined ? new Date() : aFecha(v);
        if (!d) return '';
        return d.toLocaleDateString('es-VE', Object.assign({ timeZone: ZONA }, opciones || {}));
    }

    // '30/7/2026, 09:30 p. m.'
    function fechaHora(v, opciones) {
        const d = v === undefined ? new Date() : aFecha(v);
        if (!d) return '';
        return d.toLocaleString('es-VE', Object.assign({ timeZone: ZONA }, opciones || {}));
    }

    // '09:30 p. m.'
    function hora(v) {
        const d = v === undefined ? new Date() : aFecha(v);
        if (!d) return '';
        return d.toLocaleTimeString('es-VE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
    }

    // 'lunes 23 nov', a partir de una clave 'AAAA-MM-DD'
    function etiquetaDia(claveDia) {
        if (!claveDia) return '';
        const [a, m, dd] = claveDia.split('-').map(Number);
        const f = new Date(a, m - 1, dd); // fecha "suelta", sin hora ni zona
        const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${dias[f.getDay()]} ${dd} ${meses[m - 1]}`;
    }

    // Límites del día en Venezuela, para filtrar rangos en Firestore.
    // Una clave '2026-07-30' va de las 00:00 a las 23:59:59 de ESE día aquí,
    // que en UTC es desde las 04:00 del 30 hasta las 03:59 del 31.
    function inicioDia(claveDia) {
        return new Date(`${claveDia}T00:00:00-04:00`);
    }
    function finDia(claveDia) {
        return new Date(`${claveDia}T23:59:59.999-04:00`);
    }

    const Fechas = { ZONA, aFecha, clave, fecha, fechaHora, hora, etiquetaDia, inicioDia, finDia };

    // ───────────────────────────── EXPOSICIÓN ─────────────────────────────
    window.Comun = {
        rolActual, esAdmin, esVendedor, esDespachador,
        AZUL, AZUL_CLARO, cabecera, cabeceraCard, tarjetaMenu,
        Fechas
    };
    window.Fechas = Fechas;

    // Atajos globales: son los que más se usan y se leen mejor sueltos.
    window.esAdmin = esAdmin;
    window.esVendedor = esVendedor;
})();

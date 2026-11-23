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

    // ───────────────────────────── EXPOSICIÓN ─────────────────────────────
    window.Comun = {
        rolActual, esAdmin, esVendedor, esDespachador,
        AZUL, AZUL_CLARO, cabecera, cabeceraCard, tarjetaMenu
    };

    // Atajos globales: son los que más se usan y se leen mejor sueltos.
    window.esAdmin = esAdmin;
    window.esVendedor = esVendedor;
})();

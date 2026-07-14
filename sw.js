const CACHE_NAME = 'ventas-app-cache-v39'; // v39: preventa - quitar emojis de botones del menu

// Archivos críticos que componen la aplicación ("App Shell")
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './config.js',
    // --- Módulos de Lógica ---
    './admin.js',
    './data.js',
    './inventario.js',
    './catalogo.js',
    './clientes.js',
    './ventas.js',
    './ventas-ui.js',
    './obsequios.js',
    './cxc.js',
    './edit-inventario.js',
    './supervision.js',
    './facturacion.js',
    './administracion.js',
    './preventa.js',
    './archivos.js',
    './calculadora.js',
    // --- Librerías Externas ---
    './tailwind.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js',
    // --- Imágenes ---
    './images/icons/icon-192x192.png',
    './images/icons/icon-512x512.png'
];

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL — Cachear App Shell
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', CACHE_NAME);
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Cacheando App Shell...');
            return Promise.all(
                urlsToCache.map(url =>
                    cache.add(url).catch(err => {
                        console.warn(`[SW] No se pudo cachear: ${url}`, err);
                    })
                )
            );
        })
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE — Limpiar cachés obsoletas
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activando versión:', CACHE_NAME);

    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME && name !== 'share-queue')
                    .map(name => {
                        console.log('[SW] Borrando caché obsoleta:', name);
                        return caches.delete(name);
                    })
            )
        )
    );

    return self.clients.claim();
});

// ─────────────────────────────────────────────────────────────────────────────
// FETCH — Interceptar peticiones
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // ── 1. WEB SHARE TARGET ───────────────────────────────────────────────────
    // Android comparte archivos a la app mediante un POST a ?share-pending=1.
    // El SW almacena los archivos en la caché 'share-queue' y redirige
    // al usuario a la app para que pueda seleccionar cliente y categoría.
    if (event.request.method === 'POST' && url.searchParams.get('share-pending') === '1') {
        event.respondWith(
            (async () => {
                try {
                    const formData = await event.request.formData();
                    const files    = formData.getAll('file');

                    if (!files.length) {
                        return Response.redirect('./index.html', 303);
                    }

                    const cache = await caches.open('share-queue');
                    const meta  = [];

                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const buf  = await file.arrayBuffer();

                        await cache.put(
                            `/sq-file-${i}`,
                            new Response(buf, {
                                headers: {
                                    'Content-Type': file.type || 'application/octet-stream',
                                    'X-File-Name':  file.name
                                }
                            })
                        );

                        meta.push({ name: file.name, type: file.type, index: i });
                    }

                    // Guardar metadatos para que la app los lea al arrancar
                    await cache.put(
                        '/sq-meta',
                        new Response(JSON.stringify(meta), {
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );

                    console.log(`[SW] Share Target: ${files.length} archivo(s) almacenados.`);

                    // Redirigir a la app con el flag para que la detecte
                    return Response.redirect('./index.html?share-pending=1', 303);

                } catch (err) {
                    console.error('[SW] Error procesando Share Target:', err);
                    return Response.redirect('./index.html', 303);
                }
            })()
        );
        return; // Salir para no continuar con el handler GET
    }

    // ── 2. Ignorar peticiones que no sean GET ─────────────────────────────────
    if (event.request.method !== 'GET') return;

    // ── 3. Ignorar protocolos no cacheables (extensiones de Chrome, etc.) ─────
    if (!event.request.url.startsWith('http')) return;

    // ── 4. Ignorar Firebase / Google APIs (tienen su propia persistencia) ─────
    if (
        url.origin.includes('firestore.googleapis.com') ||
        url.origin.includes('googleapis.com') ||
        url.origin.includes('firebase')
    ) {
        return;
    }

    // ── 5. ESTRATEGIA: Network First (Red primero, caché como respaldo) ───────
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Guardar copia fresca en caché si la respuesta es válida
                if (
                    networkResponse &&
                    networkResponse.status === 200 &&
                    networkResponse.type === 'basic'
                ) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    }).catch(err => {
                        console.warn('[SW] Falló escritura en caché:', err);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Sin red → servir desde caché (modo offline)
                console.log('[SW] Offline: sirviendo desde caché →', event.request.url);
                return caches.match(event.request);
            })
    );
});

























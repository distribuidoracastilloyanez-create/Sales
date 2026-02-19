const CACHE_NAME = 'ventas-app-cache-v13'; // ACTUALIZADO A v13 PARA FORZAR LIMPIEZA

// Archivos críticos que componen la aplicación ("App Shell")
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './config.js',            // CRÍTICO: Archivo de configuración central
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
    // --- Librerías Externas (Para que funcione sin internet y con estilo) ---
    './tailwind.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js',
    // --- Imágenes (Solo las que seguro existen) ---
    './images/icons/icon-192x192.png',
    './images/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando versión:', CACHE_NAME);
    self.skipWaiting(); // Forzar activación inmediata
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Cacheando App Shell');
                return Promise.all(
                    urlsToCache.map(url => {
                        return cache.add(url).catch(err => {
                            console.warn(`[Service Worker] No se pudo cachear ${url}, se continuará sin él.`, err);
                        });
                    })
                );
            })
    );
});

self.addEventListener('activate', event => {
    console.log('[Service Worker] Activando nueva versión...');
    const cacheWhitelist = [CACHE_NAME];

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log(`[Service Worker] Borrando caché obsoleta: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Tomar control inmediatamente de las pestañas abiertas
});

self.addEventListener('fetch', event => {
    // Solo procesar peticiones GET
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // 1. Ignorar peticiones a Firebase/Google APIs (Firebase SDK maneja su propia persistencia)
    if (url.origin.includes('firestore.googleapis.com') || 
        url.origin.includes('googleapis.com') || 
        url.origin.includes('firebase')) {
        return;
    }

    // 2. NUEVA ESTRATEGIA: Network First (Red primero, Caché como respaldo)
    // Esto garantiza que siempre veas el código más nuevo si tienes internet.
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Si la red responde bien, guardamos una copia fresca en caché
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse; // Entregamos la versión fresca
            })
            .catch(() => {
                // Si falla la red (offline), sacamos el archivo de la caché
                console.log('[Service Worker] Modo Offline: Sirviendo desde caché', event.request.url);
                return caches.match(event.request);
            })
    );
});

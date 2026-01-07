const CACHE_NAME = 'ventas-app-cache-v9'; // Actualizado a v9 para forzar recarga

const urlsToCache = [
    './',
    './index.html',
    './admin.js',
    './data.js',
    './inventario.js',
    './catalogo.js',
    './clientes.js',
    './ventas.js',
    './obsequios.js',
    './manifest.json',
    './images/icons/icon-192x192.png',
    './images/icons/icon-512x512.png',
    './images/fondo.png',
    './images/cervezayvinos.png',
    './images/maltinypepsi.png',
    './images/alimentospolar.png',
    './images/p&g.png'
];

self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando versión v9...');
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Guardando App Shell local en caché.');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('[Service Worker] Falló el precaching del App Shell:', error);
            })
    );
});

self.addEventListener('activate', event => {
    console.log('[Service Worker] Activando v9 y limpiando cachés antiguas...');
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log(`[Service Worker] Eliminando caché antigua: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }
    
    // No cachear solicitudes a terceros (CDNs, Firebase, etc.)
    if (!event.request.url.startsWith(self.location.origin)) {
        return; 
    }
    
    if (event.request.url.includes('firestore.googleapis.com')) {
        return;
    }

    // Estrategia: Red primero, luego caché (SOLO para archivos locales críticos)
    // Esto ayuda a que los cambios en JS se vean más rápido en desarrollo
    if (event.request.url.includes('.js')) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Estrategia Cache First para lo demás (imágenes, css, html estático)
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return fetch(event.request)
                .then(networkResponse => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                })
                .catch(() => {
                    return cache.match(event.request);
                });
        })
    );
});

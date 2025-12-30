const CACHE_NAME = 'ventas-app-cache-v8'; 

const urlsToCache = [
    './',
    './index.html',
    './admin.js',
    './data.js',
    './inventario.js',
    './catalogo.js',
    './clientes.js',
    './ventas.js',
    './obsequios.js', // Añadido para caché
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
    console.log('[Service Worker] Instalando...');
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
    console.log('[Service Worker] Activando...');
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

    // Estrategia: Red primero, luego caché (SOLO para archivos locales)
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return fetch(event.request)
                .then(networkResponse => {
                    console.log(`[Service Worker] Guardando en caché: ${event.request.url}`);
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                })
                .catch(() => {
                    // Si la red falla, servir desde la caché
                    return cache.match(event.request);
                });
        })
    );
});

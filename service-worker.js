const CACHE_NAME = 'ventas-app-cache-v9'; // Incrementa esto cada vez que subas cambios

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
    './css/tailwind.min.css', // Asegúrate de incluir CSS locales si los tienes
    './css/inter.css',
    './images/icons/icon-192x192.png',
    './images/icons/icon-512x512.png',
    './images/fondo.png',
    './images/cervezayvinos.png',
    './images/maltinypepsi.png',
    './images/alimentospolar.png',
    './images/p&g.png',
    './images/no-image.png' // Añadido por si acaso
];

self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando...');
    self.skipWaiting(); // Forzar activación inmediata
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Cacheando archivos estáticos.');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('[Service Worker] Falló el precaching:', error);
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
                        console.log(`[Service Worker] Borrando caché obsoleta: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Tomar control de todos los clientes inmediatamente
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

    // 2. Estrategia para archivos estáticos locales: Cache First, Network Fallback
    // Busca en caché primero. Si está, devuélvelo. Si no, ve a la red.
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Si no está en caché, ir a la red
                return fetch(event.request).then(networkResponse => {
                    // Verificar respuesta válida
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    // Clonar respuesta para guardarla en caché
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                }).catch(err => {
                    console.log('[Service Worker] Fetch fallido (Offline):', err);
                    // Opcional: Devolver una página offline.html si es una navegación
                });
            })
    );
});

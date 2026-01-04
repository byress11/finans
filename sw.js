// Service Worker for Hızlı Bütçe PWA
const CACHE_NAME = 'hizli-butce-v2';

// Assets to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/app.css',
    './js/app.js',
    './manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn('[Service Worker] Cache failed, continuing without cache:', err);
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => {
                            console.log('[Service Worker] Deleting old cache:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => self.clients.claim())
            .catch((err) => {
                console.warn('[Service Worker] Activation cleanup failed:', err);
                return self.clients.claim();
            })
    );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Skip chrome-extension and other non-http requests
    if (!request.url.startsWith('http')) return;
    
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Clone response for caching
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(request, responseClone);
                        })
                        .catch(() => {
                            // Ignore cache errors
                        });
                }
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Offline fallback for HTML
                        if (request.headers.get('accept')?.includes('text/html')) {
                            return caches.match('./index.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

console.log('[Service Worker] Script loaded');

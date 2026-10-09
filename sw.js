// Service Worker for Hızlı Bütçe PWA
const CACHE_NAME = 'hizli-butce-v9';

// Assets to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/app.css',
    './css/mobile-responsive.css',
    './css/interface.css',
    './js/interface.js',
    './js/app.js',
    './js/data-safety.js',
    './js/database.js',
    './js/sync.js',
    './js/firebase-config.js',
    './js/modules.js',
    './js/receipt-scanner.js',
    './js/vendor/purify.min.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
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
                        .filter((key) => key.startsWith('hizli-butce-') && key !== CACHE_NAME)
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

    // Never cache authenticated API responses. Only this application's static files.
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || !STATIC_ASSETS.some(asset => new URL(asset, self.registration.scope).pathname === url.pathname)) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                // Clone response for caching
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(request, responseClone).catch(() => {
                                // Silently ignore cache put errors
                            });
                        })
                        .catch(() => {
                            // Ignore cache open errors
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

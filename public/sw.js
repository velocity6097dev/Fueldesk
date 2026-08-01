// FuelDesk service worker.
//
// Two jobs:
//   1. When a page navigation fails because there's no connection,
//      serve our own /error.html instead of letting Chrome show its
//      built-in "No internet" (ERR_INTERNET_DISCONNECTED) screen.
//   2. Make sure error.html's own assets (css, image) are available
//      from cache, since they'd otherwise need network too — which
//      defeats the point on a page whose whole job is to work offline.
//
// Bump CACHE_NAME whenever PRECACHE_ASSETS changes so old caches get
// cleaned up on the next activate.

const CACHE_NAME = 'fueldesk-offline-v1';
const OFFLINE_URL = '/error.html?type=offline';

const PRECACHE_ASSETS = [
    '/error.html',
    '/error.js',
    '/ui.js',
    '/css/style.css',
    '/resources/bg.gif',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Full page loads (typing the URL, tapping a link, refreshing).
    // Try the network first; if that fails, hand back our cached
    // offline page instead of letting the browser show its own.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Assets the offline page itself needs (css/js/image). Network
    // first so updates still get picked up when online, cache as the
    // offline fallback.
    const url = new URL(request.url);
    if (PRECACHE_ASSETS.includes(url.pathname)) {
        event.respondWith(
            fetch(request).catch(() => caches.match(request))
        );
    }
});

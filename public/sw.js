// FuelDesk service worker.
//
// Three jobs:
//   1. When a page navigation fails because there's no connection,
//      serve our own /error.html instead of letting Chrome show its
//      built-in "No internet" (ERR_INTERNET_DISCONNECTED) screen.
//   2. Keep every font, image, and core css/js file cached so the app
//      still looks and behaves right with zero network.
//   3. Stay in sync automatically with whatever's actually in /fonts
//      and /resources — the list isn't hardcoded here. It comes from
//      GET /api/asset-manifest, which reads those two folders live on
//      the server (see server.js). Add or remove a file there and
//      this worker picks it up on its next install, no edits needed.
//
// assetPreloader.js (the in-page loader with the progress bar) reads
// the exact same endpoint and writes into the exact same cache bucket
// name, so whichever of the two gets to a file first "wins" — no
// duplicate downloads between them.

const CACHE_PREFIX = 'fueldesk-assets-';
const OFFLINE_URL = '/error.html?type=offline';
const MANIFEST_URL = '/api/asset-manifest';

// Everything under these two folders should be cached, whatever's in
// them — this is what makes "download all the fonts and resources"
// true without listing filenames here. The install handler below is
// what actually seeds the cache; this just tells the fetch handler
// which requests are allowed to fall back to that cache when offline.
const PRECACHEABLE_PREFIXES = ['/fonts/', '/resources/'];
const PRECACHEABLE_PATHS = [
    '/css/style.css',
    '/js/ui.js',
    '/js/pageLoader.js',
    '/js/authGuard.js',
    '/js/supabaseClient.js',
    '/js/assetPreloader.js',
    '/js/sync.js',
    '/error.html',
    '/error.js',
    '/sw.js',
];

function isPrecacheable(pathname) {
    return PRECACHEABLE_PATHS.includes(pathname)
        || PRECACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function fetchManifest() {
    return fetch(MANIFEST_URL, { cache: 'no-store' }).then((res) => res.json());
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        fetchManifest()
            .then(({ version, assets }) => caches.open(CACHE_PREFIX + version)
                .then((cache) => Promise.all(
                    // cache.addAll() is all-or-nothing — one missing/renamed
                    // file would sink the entire install. Add each asset on
                    // its own instead, so a single bad URL doesn't cost us
                    // every other one; assetPreloader.js retries whatever
                    // didn't make it in on the next page load anyway.
                    assets.map((asset) => cache.add(asset.url).catch(() => {}))
                )))
            .catch(() => {
                // Offline (or the server's briefly down) during install.
                // Nothing to precache yet — the fetch handler still works
                // for anything already cached from a previous install.
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        fetchManifest()
            .then(({ version }) => CACHE_PREFIX + version)
            .catch(() => null) // couldn't reach the server — skip cleanup this round, try again next activate
            .then((currentCache) => caches.keys().then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== currentCache)
                    .map((key) => caches.delete(key))
            )))
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

    // Fonts, images, and core app files. Network first so updates
    // still get picked up when online, cache as the offline fallback.
    const url = new URL(request.url);
    if (isPrecacheable(url.pathname)) {
        event.respondWith(
            fetch(request).catch(() => caches.match(request))
        );
    }
});

// Shared "Sync" button — sits in the topbar of every logged-in screen,
// for every role. One tap forces the app to re-check everything it
// depends on (css, fonts, logo/resources, the service worker itself)
// straight from the server instead of whatever's already cached, then
// reloads so the fresh copies actually take effect.
//
// This is deliberately more aggressive than assetPreloader.js (which
// only fills in what's *missing*, quietly, on every page load) — Sync
// re-downloads everything currently in the manifest regardless of
// whether it's already cached, so a changed font/logo/css file (same
// filename, new content) gets picked up immediately instead of only
// on a cache-clear.
//
// Any page can opt in with zero JS: just include this script and add
// a button with id="sync-btn" to the topbar (see billing.html for an
// example). Wiring happens automatically on DOMContentLoaded below.
window.FuelDeskSync = (function () {
    const MANIFEST_URL = '/api/asset-manifest';
    let running = false;

    async function refreshServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        } catch (err) {
            // Non-fatal — asset refresh below still runs either way.
        }
    }

    // Force-refetches every font/resource/core-file the app depends on
    // straight from the network (bypassing both the browser's HTTP
    // cache and whatever's already in Cache Storage), then overwrites
    // the Cache Storage entry so offline mode also has the fresh copy.
    async function refreshAllAssets() {
        if (!('caches' in window)) return { total: 0, ok: 0 };

        const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
        const manifest = await res.json();
        if (!manifest || !manifest.version || !Array.isArray(manifest.assets)) {
            return { total: 0, ok: 0 };
        }

        const cacheName = 'fueldesk-assets-' + manifest.version;
        const cache = await caches.open(cacheName);

        // Fonts + resources (from the live manifest) plus the core
        // css/js files every screen needs — same list sw.js precaches.
        const corePaths = [
            '/css/style.css',
            '/js/ui.js', '/js/pageLoader.js', '/js/authGuard.js',
            '/js/supabaseClient.js', '/js/assetPreloader.js', '/js/sync.js',
            '/error.html', '/error.js',
        ];
        const urls = Array.from(new Set([...manifest.assets.map((a) => a.url), ...corePaths]));

        let ok = 0;
        for (const url of urls) {
            try {
                const fresh = await fetch(url, { cache: 'reload' }); // bypass HTTP cache too
                if (fresh && fresh.ok) {
                    await cache.put(url, fresh.clone());
                    ok++;
                }
            } catch (err) {
                // Offline mid-sync, or a file genuinely isn't there — skip
                // it and keep going rather than aborting the whole sync.
            }
        }

        // Old version buckets are now safe to drop.
        try {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter((k) => k.startsWith('fueldesk-assets-') && k !== cacheName)
                    .map((k) => caches.delete(k))
            );
        } catch (err) { /* non-fatal */ }

        return { total: urls.length, ok };
    }

    async function run(buttonEl) {
        if (running) return;
        running = true;

        const iconEl = buttonEl?.querySelector('svg');
        if (buttonEl) buttonEl.disabled = true;
        if (iconEl) iconEl.classList.add('spin');

        window.Toast?.show('Syncing styles, fonts & assets...', { duration: 8000 });

        try {
            const [, assetResult] = await Promise.all([refreshServiceWorker(), refreshAllAssets()]);
            window.Toast?.show(
                assetResult.total ? `Synced ${assetResult.ok}/${assetResult.total} files — reloading...` : 'Synced — reloading...'
            );
            setTimeout(() => window.location.reload(), 500);
        } catch (err) {
            window.Toast?.show('Sync failed — check your connection and try again.', { error: true, duration: 5000 });
            if (buttonEl) buttonEl.disabled = false;
            if (iconEl) iconEl.classList.remove('spin');
            running = false;
        }
    }

    function wire(buttonEl) {
        if (!buttonEl || buttonEl.dataset.syncWired) return;
        buttonEl.dataset.syncWired = '1';
        buttonEl.addEventListener('click', () => run(buttonEl));
    }

    return { run, wire };
})();

document.addEventListener('DOMContentLoaded', () => {
    window.FuelDeskSync.wire(document.getElementById('sync-btn'));
});

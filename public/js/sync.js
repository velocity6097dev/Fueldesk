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
    let overlay, fillEl, pctEl, labelEl;

    // Reuses the exact .asset-preloader-* classes from style.css (already
    // used by the first-run asset loader) so this looks like the same
    // "real" loading screen, just triggered manually instead of on first
    // visit. A dedicated #sync-overlay id keeps its own z-index/backdrop
    // so it can't collide with that other loader if both ever somehow
    // overlap.
    function buildOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'sync-overlay';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = `
            <div class="asset-preloader-mark">
                <span class="page-loader-word">FuelDesk</span>
                <div class="asset-preloader-track"><div class="asset-preloader-fill"></div></div>
                <div class="asset-preloader-status">
                    <span class="asset-preloader-label">Preparing sync...</span>
                    <span class="asset-preloader-pct">0%</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.setAttribute('aria-busy', 'true');
        fillEl = overlay.querySelector('.asset-preloader-fill');
        pctEl = overlay.querySelector('.asset-preloader-pct');
        labelEl = overlay.querySelector('.asset-preloader-label');
        window.ScrollLock.lock(); // blocks scrolling/interaction with everything underneath
        return overlay;
    }

    function setProgress(fraction, text) {
        const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
        if (fillEl) fillEl.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
        if (text && labelEl) labelEl.textContent = text;
    }

    function removeOverlay() {
        if (!overlay) return;
        overlay.remove();
        document.body.removeAttribute('aria-busy');
        window.ScrollLock.unlock();
        overlay = fillEl = pctEl = labelEl = null;
    }

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
    // Calls onProgress(done, total, currentUrl) after each file so the
    // caller can drive a real (not fake/animated) progress bar.
    async function refreshAllAssets(onProgress) {
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
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            if (onProgress) onProgress(i, urls.length, url);
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
            if (onProgress) onProgress(i + 1, urls.length, url);
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

        buildOverlay();
        setProgress(0, 'Checking for updates...');

        try {
            await refreshServiceWorker();
            const assetResult = await refreshAllAssets((done, total, url) => {
                const fileName = url ? url.split('/').pop() || url : '';
                setProgress(total ? done / total : 0, total ? `Syncing ${fileName} (${done}/${total})` : 'Syncing...');
            });
            setProgress(1, assetResult.total ? `Synced ${assetResult.ok}/${assetResult.total} files` : 'Synced');
            window.Toast?.show('Sync complete — reloading...');
            // Deliberately leaves the overlay up (full bar, blocking
            // everything) through this short delay and into the reload —
            // that's the "don't allow anyone to touch anything until
            // it's finished" behavior. The reload clears it for free.
            setTimeout(() => window.location.reload(), 500);
        } catch (err) {
            window.Toast?.show('Sync failed — check your connection and try again.', { error: true, duration: 5000 });
            if (buttonEl) buttonEl.disabled = false;
            if (iconEl) iconEl.classList.remove('spin');
            removeOverlay();
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

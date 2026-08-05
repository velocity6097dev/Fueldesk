// First-run (and "cache got wiped") asset downloader.
//
// FuelDesk leans on a handful of custom fonts plus a couple of images
// that never change once shipped. Rather than let the browser fetch
// them lazily — fallback fonts flashing, logos popping in late — this
// grabs everything up front, the first time anyone opens the app, and
// shows a real <progress> bar (percentage + which file it's on) while
// it does.
//
// The list of what to fetch isn't hardcoded here — it comes from
// GET /api/asset-manifest, which the server builds by reading whatever
// is actually inside /fonts and /resources right now (see server.js).
// Add a font, drop in a new logo — it's picked up automatically, next
// page load, no code change anywhere.
//
// Everything downloaded here goes into the exact same Cache Storage
// bucket sw.js precaches on install, so this doubles as what keeps the
// app usable offline — no separate mechanism to keep in sync.
//
// On every later visit this just checks the cache still has everything
// the manifest currently expects — cheap, local lookups, no network —
// and if so, does nothing: no overlay, no flash, nothing shown. If the
// cache was cleared, a file got evicted, or a font/image changed (which
// changes the manifest's version automatically), it falls back into
// download mode again on its own — nothing to configure, nothing the
// user has to do, which matters most on a mobile device where digging
// into browser storage settings isn't realistic.
window.AssetPreloader = (function () {
    if (!('caches' in window)) {
        // Cache Storage unavailable (very old / locked-down browser).
        // Nothing to preload into — let the page fetch assets normally.
        return { run: () => Promise.resolve() };
    }

    const MANIFEST_URL = '/api/asset-manifest';
    const FALLBACK_ASSET_BYTES = 50000; // used only if an asset is missing a size

    let overlay, progressEl, pctEl, labelEl;

    function waitForBody() {
        if (document.body) return Promise.resolve();
        return new Promise((resolve) => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    function buildOverlay(firstLabel) {
        overlay = document.createElement('div');
        overlay.id = 'asset-preloader';
        // Announces label/percentage changes to screen readers as they
        // happen, without stealing focus — important on a touch device
        // where a focus jump could yank the keyboard or scroll position.
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = [
            '<div class="asset-preloader-mark">',
            '  <span class="page-loader-word">FuelDesk</span>',
            '  <label class="asset-preloader-proglabel">',
            '    <span class="sr-only">Loading progress</span>',
            '    <progress class="asset-preloader-progress" value="0" max="100"></progress>',
            '  </label>',
            '  <div class="asset-preloader-status">',
            '    <span class="asset-preloader-label"></span>',
            '    <span class="asset-preloader-pct">0%</span>',
            '  </div>',
            '</div>',
        ].join('');
        document.body.appendChild(overlay);
        document.body.classList.add('asset-loader-active');
        document.body.setAttribute('aria-busy', 'true');

        progressEl = overlay.querySelector('.asset-preloader-progress');
        pctEl = overlay.querySelector('.asset-preloader-pct');
        labelEl = overlay.querySelector('.asset-preloader-label');
        labelEl.textContent = firstLabel;
    }

    function setProgress(fraction, text) {
        const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
        progressEl.value = pct;
        progressEl.setAttribute('aria-valuenow', String(pct));
        pctEl.textContent = pct + '%';
        if (text) labelEl.textContent = text;
    }

    function removeOverlay() {
        overlay.classList.add('is-hidden');
        document.body.classList.remove('asset-loader-active');
        document.body.removeAttribute('aria-busy');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }

    // Which manifest entries the cache doesn't already have. A handful
    // of local cache.match() lookups — no network involved.
    async function findMissing(cache, assets) {
        const checks = await Promise.all(
            assets.map((asset) => cache.match(asset.url).then((hit) => (hit ? null : asset)))
        );
        return checks.filter(Boolean);
    }

    // Downloads each missing asset in turn, storing it into `cache` as
    // it goes and reporting real byte-level progress (via the response
    // stream) blended with the manifest's size so the bar moves
    // smoothly even for the very first file.
    async function downloadMissing(cache, missing) {
        const totalBytes = missing.reduce((sum, a) => sum + (a.bytes || FALLBACK_ASSET_BYTES), 0) || 1;
        let doneBytes = 0;

        for (const asset of missing) {
            setProgress(doneBytes / totalBytes, asset.label);

            let response;
            try {
                response = await fetch(asset.url, { cache: 'reload' });
            } catch (err) {
                // Offline mid-download, or the file genuinely isn't
                // there. Skip it rather than getting stuck — the check
                // runs again next page load and retries anything
                // still missing.
                continue;
            }
            if (!response || !response.ok) continue;

            const assetBytes = asset.bytes || FALLBACK_ASSET_BYTES;
            const contentLength = Number(response.headers.get('content-length')) || assetBytes;
            const toCache = response.clone(); // clone before the body gets read below

            if (response.body && response.body.getReader) {
                const reader = response.body.getReader();
                let loaded = 0;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    loaded += value.byteLength;
                    setProgress((doneBytes + Math.min(loaded, contentLength)) / totalBytes, asset.label);
                }
            }

            try {
                await cache.put(asset.url, toCache);
            } catch (err) {
                // Storage quota exceeded, private-browsing restrictions, etc.
                // Non-fatal — the asset just won't be cached this round.
            }

            doneBytes += assetBytes;
            setProgress(doneBytes / totalBytes, asset.label);
        }

        setProgress(1, 'Ready');
    }

    async function run() {
        let manifest;
        try {
            const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
            manifest = await res.json();
        } catch (err) {
            return; // offline, or the server's briefly unreachable — nothing to preload into yet
        }
        if (!manifest || !manifest.version || !Array.isArray(manifest.assets)) return;

        const cacheName = 'fueldesk-assets-' + manifest.version;
        let cache;
        try {
            cache = await caches.open(cacheName);
        } catch (err) {
            return; // Cache Storage blocked/unavailable — skip preloading silently.
        }

        const missing = await findMissing(cache, manifest.assets);
        if (missing.length === 0) return; // Nothing to fetch — stay invisible.

        await waitForBody();
        buildOverlay(missing[0].label);
        await downloadMissing(cache, missing);
        removeOverlay();
    }

    return { run };
})();

window.AssetPreloader.run();

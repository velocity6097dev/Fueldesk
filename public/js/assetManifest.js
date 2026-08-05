// Shared manifest of static assets FuelDesk needs locally — custom
// fonts, logos/background, and the core css/js every screen depends on
// — plus the Cache Storage bucket name they all live in.
//
// This file is loaded in two very different places that both need to
// agree on the exact same list and cache name:
//   1. sw.js              — precaches everything when the service
//                            worker installs, so offline navigation
//                            still has fonts/images/css to work with.
//   2. assetPreloader.js  — on every page load, checks what's missing
//                            from that same cache and, if anything is,
//                            downloads it with a visible progress bar
//                            before the app appears.
// Because both write into ASSET_CACHE_NAME, whichever one gets there
// first "wins" and the other just finds the file already cached —
// no duplicate downloads in practice.
//
// It's a plain classic script (no import/export) on purpose: the
// service worker loads it with importScripts(), and pages load it with
// a normal <script src> tag. `self` refers to the same global object
// (window) in both contexts, so attaching to `self` makes the values
// available either way.
//
// Bump ASSET_CACHE_VERSION whenever an asset here is added, removed,
// or replaced with different content at the same URL. That changes the
// cache name, so returning visitors drop the old bucket and rebuild a
// fresh one instead of quietly keeping a stale file forever.
//
// `bytes` is the approximate file size, used only to weight how much
// of the progress bar each asset accounts for before its real
// Content-Length header is known (see assetPreloader.js). It doesn't
// need to stay byte-perfect if a file changes slightly — it just keeps
// the bar from jumping unevenly, since bg.gif alone is ~30x bigger
// than most of the fonts combined.

const ASSET_CACHE_VERSION = 'v1';
const ASSET_CACHE_NAME = `fueldesk-assets-${ASSET_CACHE_VERSION}`;

const FUELDESK_ASSET_MANIFEST = [
    { url: '/css/style.css', label: 'Stylesheet', bytes: 40978 },

    { url: '/fonts/CSAliceMono-Regular_demo-BF673d3a6435a92.woff2', label: 'Font — CSAlice Mono', bytes: 2420 },
    { url: '/fonts/ReceiptMono-Regular.woff2', label: 'Font — Receipt Mono', bytes: 8604 },
    { url: '/fonts/ReceiptMono-Regular1.woff2', label: 'Font — Receipt Mono Alt', bytes: 14916 },
    { url: '/fonts/ReceiptDotMono-Regular2.woff2', label: 'Font — Receipt Dot Mono', bytes: 1468 },
    { url: '/fonts/GilbarcoByVelocity.woff2', label: 'Font — Gilbarco By Velocity', bytes: 31296 },
    { url: '/fonts/merchant-copy.ttf', label: 'Font — Merchant Copy', bytes: 120304 },
    { url: '/fonts/merchant-copy-wide.ttf', label: 'Font — Merchant Copy Wide', bytes: 173760 },

    { url: '/resources/favicon.ico', label: 'Favicon', bytes: 4286 },
    { url: '/resources/bpcl.png', label: 'BPCL logo', bytes: 17002 },
    { url: '/resources/iocl.png', label: 'IOCL logo', bytes: 7848 },
    { url: '/resources/bg.gif', label: 'Background image', bytes: 1373645 },

    { url: '/js/ui.js', label: 'App core', bytes: 13495 },
    { url: '/js/pageLoader.js', label: 'App core', bytes: 1468 },
    { url: '/js/authGuard.js', label: 'App core', bytes: 6104 },
    { url: '/js/supabaseClient.js', label: 'App core', bytes: 2040 },

    { url: '/error.html', label: 'Offline page', bytes: 2185 },
    { url: '/error.js', label: 'Offline page script', bytes: 2594 },
    { url: '/sw.js', label: 'Service worker', bytes: 2200 },
];

self.ASSET_CACHE_VERSION = ASSET_CACHE_VERSION;
self.ASSET_CACHE_NAME = ASSET_CACHE_NAME;
self.FUELDESK_ASSET_MANIFEST = FUELDESK_ASSET_MANIFEST;

// Full-page loader shown the instant a protected page starts loading
// (it's static markup in the HTML, so it paints before any JS runs —
// no flash of the page underneath). It's only hidden once the page's
// own init() calls PageLoader.ready(), which each page does after
// FuelDeskAuth.requireSession() has resolved, renderPanelSwitcher()
// has added the bottom nav, and the page's real data has replaced its
// "--" / "&nbsp;" placeholders. That's what stops the skeleton values
// and the bottom nav bar from visibly popping in after the page has
// already been on screen for a moment.
window.PageLoader = (function () {
    const MIN_DISPLAY_MS = 300;  // avoids a flash-then-instant-hide if everything resolves instantly
    const MAX_WAIT_MS = 12000;   // safety net: a stalled request can never trap someone behind this
    const startedAt = Date.now();
    let hidden = false;

    function hide() {
        if (hidden) return;
        hidden = true;

        const overlay = document.getElementById('page-loader');
        if (!overlay) return;

        const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt));
        setTimeout(() => {
            overlay.classList.add('is-hidden');
            document.body.classList.remove('loader-active');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }, wait);
    }

    setTimeout(hide, MAX_WAIT_MS);

    return { ready: hide };
})();

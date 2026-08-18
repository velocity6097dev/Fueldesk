// Shared little UI helpers used by every screen. Load after style.css's
// classes are available (no dependency on Supabase, safe to load early).

// Registers sw.js so failed navigations (no internet) show our own
// /error.html instead of Chrome's built-in ERR_INTERNET_DISCONNECTED
// screen, and so the offline page's image/css still load with zero
// network. Runs on every screen since ui.js is loaded everywhere.
// Safe no-op in browsers without service worker support.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Non-fatal — app still works, just without the offline fallback page.
        });
    });
}

// Locks the page from scrolling while a modal/sheet/overlay is open.
// The actual styling lives in style.css under body.scroll-locked — this
// just toggles that class and sets the one value that has to be dynamic
// (how far the page had scrolled), via a CSS variable. Restores the
// exact scroll position on unlock.
//
// Counts open locks instead of a plain boolean, so if one popup opens
// while another is already open (e.g. an InfoTip opened from inside a
// SheetPicker), the page only unlocks once *all* of them have closed.
window.ScrollLock = (function () {
    let count = 0;
    let savedScrollY = 0;

    function lock() {
        if (count === 0) {
            savedScrollY = window.scrollY;
            document.documentElement.style.setProperty('--scroll-lock-offset', `-${savedScrollY}px`);
            document.body.classList.add('scroll-locked');
        }
        count++;
    }

    function unlock() {
        count = Math.max(0, count - 1);
        if (count === 0) {
            document.body.classList.remove('scroll-locked');
            document.documentElement.style.removeProperty('--scroll-lock-offset');
            window.scrollTo(0, savedScrollY);
        }
    }

    return { lock, unlock };
})();

window.Toast = (function () {
    let el = null;
    let hideTimer = null;

    function ensure() {
        if (el) return el;
        el = document.createElement('div');
        el.className = 'toast';
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }

    function show(message, { error = false, duration = 3000 } = {}) {
        const node = ensure();
        node.textContent = message;
        node.className = 'toast' + (error ? ' error' : '');
        node.style.display = 'block';
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { node.style.display = 'none'; }, duration);
    }

    return { show };
})();

// Self-initializing: shows a full-screen overlay the moment the browser
// goes offline, on top of whatever page/form the person is in the
// middle of — deliberately NOT a navigation, so nothing they've typed
// gets lost. Hides itself automatically the moment connectivity returns.
(function initOfflineWatcher() {
    let overlay = null;

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'offline-overlay hidden';
        overlay.innerHTML = `
            <div class="offline-card">
                <img src="/resources/bg.gif" alt="" class="offline-illustration">
                <h2>You're Offline</h2>
                <p>FuelDesk needs an internet connection to load rates and save bills. Reconnect, then try again.</p>
                <p class="offline-status">Waiting for a connection...</p>
                <button type="button" class="btn btn-primary btn-block offline-retry-btn">Try Again</button>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.offline-retry-btn').addEventListener('click', () => {
            if (navigator.onLine) {
                hide();
            } else {
                overlay.querySelector('.offline-status').textContent = 'Still offline — check your connection.';
            }
        });
        return overlay;
    }

    function show() {
        const node = ensureOverlay();
        if (node.classList.contains('hidden')) {
            node.classList.remove('hidden');
            window.ScrollLock.lock();
        }
    }
    function hide() {
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
            window.ScrollLock.unlock();
        }
    }

    window.addEventListener('offline', show);
    window.addEventListener('online', hide);

    if (!navigator.onLine) show(); // page happened to load while already offline
})();

// Small "what can I type here" help popover — used by the (i) buttons
// next to the Address and Receipt Footer fields in Admin.
window.InfoTip = (function () {
    let modal = null;

    function ensure() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-card">
                <div class="sheet-title" style="padding:0;"></div>
                <div class="info-body"></div>
                <button type="button" class="btn btn-primary btn-block info-close">Got it</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        modal.querySelector('.info-close').addEventListener('click', close);
        return modal;
    }

    function close() {
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            window.ScrollLock.unlock();
        }
    }

    function show({ title, bodyHtml }) {
        const node = ensure();
        node.querySelector('.sheet-title').textContent = title || '';
        node.querySelector('.info-body').innerHTML = bodyHtml || '';
        if (node.classList.contains('hidden')) {
            window.ScrollLock.lock();
        }
        node.classList.remove('hidden');
    }

    return { show, close };
})();

// Wires an (i) button to open InfoTip with the shared formatting-commands
// help text (BillTemplates.COMMANDS_HELP_HTML), for the Address/Footer
// fields that both support the same <center>/<right>/<b> commands.
function wireCommandsInfoButton(buttonEl, fieldLabel) {
    buttonEl.addEventListener('click', () => {
        window.InfoTip.show({
            title: `Formatting "${fieldLabel}"`,
            bodyHtml: window.BillTemplates.COMMANDS_HELP_HTML,
        });
    });
}

// Waits for any <img> inside the receipt (i.e. the logo) to finish
// loading before printing. Without this, printing right after the page
// injects a fresh logo <img src="..."> can capture the receipt before
// the image has actually downloaded/decoded, so the logo prints blank
// — it would then work the next time only because the browser had
// since cached the image. Falls back to a timeout so a broken/slow
// image can never hang the print indefinitely.
function waitForReceiptImages(container, timeoutMs = 2500) {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (imgs.length === 0) return Promise.resolve();

    const loaded = imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true }); // don't hang forever on a broken image
        });
    });

    return Promise.race([
        Promise.all(loaded),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

// Shows a hosting-renewal reminder banner at the top of the page if the
// subscription expiry date is within 5 days (or already past). Never
// shows amounts or plan details — just a prompt to contact the
// developer. Pass the raw `subscription_expiry_date` string from
// daily_config (or null/undefined, in which case nothing renders).
function renderSubscriptionBanner(expiryDateStr) {
    if (document.getElementById('subscription-banner-el')) return; // already showing

    if (!expiryDateStr) return;

    const expiry = new Date(`${expiryDateStr}T23:59:59`);
    if (isNaN(expiry.getTime())) return;

    const daysLeft = Math.ceil((expiry - new Date()) / (24 * 60 * 60 * 1000));
    // Once it's actually expired, the full-screen block (below) takes
    // over instead of this banner.
    if (daysLeft < 0 || daysLeft > 5) return;

    const banner = document.createElement('div');
    banner.id = 'subscription-banner-el';
    banner.className = 'subscription-banner';
    banner.textContent = `⚠️ Hosting renewal due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — please confirm payment with the developer to renew.`;
    document.body.insertBefore(banner, document.body.firstChild);
}

// Full-screen blockade shown once the hosting subscription has actually
// expired (not just "due soon" — that's the banner above). Locks the
// whole page behind an unmissable overlay — same visual language as
// the offline overlay (illustration + card) and the same ScrollLock
// every other modal/overlay in the app uses — with a WhatsApp link
// pre-filled with an "I've paid" message. Safe to call repeatedly
// (e.g. on every live config sync) — it only adds/removes the overlay
// when the expired state actually changes, and un-does the scroll lock
// exactly once per lock.
const SUBSCRIPTION_WHATSAPP_NUMBER = '919875345863';
const SUBSCRIPTION_WHATSAPP_MESSAGE = 'I have made the payment for my station kindly resume the services';

function escapeForBlockCard(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function renderSubscriptionBlock(expiryDateStr, stationName) {
    const existing = document.getElementById('subscription-block-overlay');

    const clear = () => {
        if (existing) {
            existing.remove();
            window.ScrollLock.unlock();
        }
    };

    // Super Admin is the only role that can actually fix an expired
    // subscription (they're the only one who can edit it in Settings),
    // so they're never blocked by it — anywhere, on any page. Admin
    // Staff and Station Staff can't renew it themselves, so they're the
    // ones this blockade is actually for.
    if (window.currentProfile?.role === 'SUPER_ADMIN') return clear();

    if (!expiryDateStr) return clear();

    const expiry = new Date(`${expiryDateStr}T23:59:59`);
    if (isNaN(expiry.getTime())) return clear();

    const isExpired = expiry.getTime() < Date.now();
    if (!isExpired) return clear();
    if (existing) return; // already blocked, nothing changed

    const waLink = `https://wa.me/${SUBSCRIPTION_WHATSAPP_NUMBER}?text=${encodeURIComponent(SUBSCRIPTION_WHATSAPP_MESSAGE)}`;
    const stationLabel = escapeForBlockCard(stationName || 'your station');

    const overlay = document.createElement('div');
    overlay.id = 'subscription-block-overlay';
    overlay.className = 'offline-overlay subscription-block-overlay';
    overlay.innerHTML = `
        <div class="offline-card subscription-block-card">
            <img src="/resources/505_Error.svg" alt="" class="offline-illustration">
            <h2>Hosting Subscription Expired</h2>
            <p>Hosting for <strong>${stationLabel}</strong> has expired. Kindly make the payment to the developer, <strong>Velocity.logs</strong>, to resume services.</p>
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block subscription-block-whatsapp-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.1 8.1 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1s-.7.8-.9 1c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.2-.4a.5.5 0 0 0 0-.5c-.1-.1-.6-1.4-.8-2-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.6 1.1 2.8s1.7 2.7 4.2 3.7a5 5 0 0 0 3 .6 2.6 2.6 0 0 0 1.7-1.2 2 2 0 0 0 .1-1.2c-.1-.1-.2-.2-.5-.3Z"/></svg>
                Message on WhatsApp
            </a>
            <div class="offline-status subscription-block-number">+91 98753 45863</div>
            <div class="app-footer-brand subscription-block-brand"><span class="bolt">&#9889;</span> Made by Velocity.logs</div>
        </div>
    `;
    document.body.appendChild(overlay);
    window.ScrollLock.lock();
}

// Lightweight check for pages that don't already fetch the full
// daily_config row themselves (Staff, Integrations). Billing, Admin,
// Format, etc. already have the row loaded and call
// renderSubscriptionBlock directly with it — this is just for the
// rest, so every screen enforces the same blockade without duplicating
// the fetch everywhere. (Super Admin is exempted inside
// renderSubscriptionBlock itself, not here — see above.)
async function checkSubscriptionBlock() {
    try {
        const { data, error } = await window.sb
            .from('daily_config')
            .select('subscription_expiry_date, station_name')
            .eq('id', 1)
            .single();
        if (error || !data) return;
        renderSubscriptionBlock(data.subscription_expiry_date, data.station_name);
    } catch (err) {
        // Offline or a transient error — same "just skip this round" as
        // everywhere else that reads daily_config.
    }
}
// width (in cm). Call this before window.print() so @page picks it up.
// Falls back to the 58mm default in style.css if never called.
function applyReceiptWidth(widthCm) {
    const cm = Number(widthCm) || 5.8;
    let styleEl = document.getElementById('receipt-width-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'receipt-width-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
        @media print {
            @page { margin: 0; size: ${cm}cm auto; }
            #thermal-receipt { width: ${cm}cm !important; }
        }
    `;
}
// Bottom-sheet picker: a mobile-friendly stand-in for <select>.
//
//   SheetPicker.open({
//     title: 'Select Product',
//     options: [{ value: 'MS', label: 'Petrol (MS)' }, ...],
//     selectedValue: 'MS',
//     onSelect: (value) => { ... }
//   });
window.SheetPicker = (function () {
    let overlay = null;

    function ensure() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'sheet-overlay';
        overlay.innerHTML = `
            <div class="sheet-card">
                <div class="sheet-handle"></div>
                <div class="sheet-title"></div>
                <div class="sheet-options"></div>
                <button type="button" class="sheet-cancel">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.sheet-cancel').addEventListener('click', close);
        return overlay;
    }

    function close() {
        if (overlay && overlay.classList.contains('open')) {
            overlay.classList.remove('open');
            window.ScrollLock.unlock();
        }
    }

    function open({ title, options, selectedValue, onSelect }) {
        const node = ensure();
        if (!node.classList.contains('open')) {
            window.ScrollLock.lock();
        }
        node.querySelector('.sheet-title').textContent = title || '';

        const optsEl = node.querySelector('.sheet-options');
        optsEl.innerHTML = '';
        options.forEach((opt) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sheet-option' + (opt.value === selectedValue ? ' selected' : '');
            btn.innerHTML = `
                <span class="opt-label">${opt.label}</span>
                ${opt.value === selectedValue
                    ? '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
                    : ''}
            `;
            btn.addEventListener('click', () => { close(); onSelect(opt.value); });
            optsEl.appendChild(btn);
        });

        requestAnimationFrame(() => node.classList.add('open'));
    }

    return { open, close };
})();

// Wires a .picker-btn to open a SheetPicker and keep a label + hidden
// state value in sync. Returns a `{ get, set }` accessor for the value.
function makePickerField({ buttonEl, labelEl, title, options, initialValue }) {
    let value = initialValue;
    const labelFor = (v) => (options.find((o) => o.value === v) || {}).label || '';

    labelEl.textContent = labelFor(value);
    buttonEl.addEventListener('click', () => {
        window.SheetPicker.open({
            title,
            options,
            selectedValue: value,
            onSelect: (v) => {
                value = v;
                labelEl.textContent = labelFor(v);
                buttonEl.dispatchEvent(new CustomEvent('picker-change', { detail: v }));
            },
        });
    });

    return {
        get: () => value,
        set: (v) => { value = v; labelEl.textContent = labelFor(v); },
    };
}

// Adds a "lifted" shadow to the sticky top bar once the page has scrolled
// underneath it (class toggled in CSS: .app-topbar.is-scrolled). rAF-
// throttled so it costs nothing while idle. Pages without a topbar (e.g.
// login) simply skip this.
(function initTopbarElevation() {
    const topbar = document.querySelector('.app-topbar');
    if (!topbar) return;

    let ticking = false;
    function update() {
        topbar.classList.toggle('is-scrolled', window.scrollY > 4);
        ticking = false;
    }
    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });
    update(); // covers the case where the page is restored already scrolled
})();
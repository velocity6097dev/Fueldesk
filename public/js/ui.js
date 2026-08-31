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

// Custom confirm dialog — used in place of the browser's native
// confirm()/alert() so account-affecting or irreversible actions (log
// out, delete/deactivate staff) look and feel like the rest of the app
// instead of a plain OS popup. Promise-based: resolves true only if the
// person taps the confirm button, false for Cancel or tapping outside.
//
//   const ok = await window.ConfirmDialog.show({
//     title: 'Log Out?',
//     message: 'You will need to log in again to continue.',
//     confirmLabel: 'Log Out',
//     danger: true,
//   });
//   if (!ok) return;
window.ConfirmDialog = (function () {
    let modal = null;

    function ensure() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-card">
                <div class="sheet-title confirm-title" style="padding:0;"></div>
                <div class="info-body confirm-message"></div>
                <div class="confirm-actions">
                    <button type="button" class="btn btn-ghost confirm-cancel-btn"></button>
                    <button type="button" class="btn confirm-ok-btn"></button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function close(node) {
        node.classList.add('hidden');
        window.ScrollLock.unlock();
    }

    function show({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
        const node = ensure();
        node.querySelector('.confirm-title').textContent = title || '';
        node.querySelector('.confirm-message').textContent = message || '';

        const okBtn = node.querySelector('.confirm-ok-btn');
        const cancelBtn = node.querySelector('.confirm-cancel-btn');
        okBtn.textContent = confirmLabel;
        okBtn.className = 'btn confirm-ok-btn ' + (danger ? 'btn-danger' : 'btn-primary');
        cancelBtn.textContent = cancelLabel;

        window.ScrollLock.lock();
        node.classList.remove('hidden');

        return new Promise((resolve) => {
            function settle(result) {
                cleanup();
                close(node);
                resolve(result);
            }
            function onBackdrop(e) { if (e.target === node) settle(false); }
            function cleanup() {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                node.removeEventListener('click', onBackdrop);
            }
            function onOk() { settle(true); }
            function onCancel() { settle(false); }

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            node.addEventListener('click', onBackdrop);
        });
    }

    return { show };
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

    // The service worker's own offline fallback (fetch -> catch -> cache
    // match) only kicks in once it's actually controlling this page,
    // which briefly isn't true right after the very first page load —
    // there's a short window before install/activate/claim finish. If
    // the person goes offline inside that window, an <img> pointed
    // straight at /resources/bg.gif would fail outright (this is the
    // "works after 1-2 times" symptom). Grabbing the bytes into memory
    // up front sidesteps that timing entirely: once we have the blob,
    // showing it later needs no network and no service worker at all.
    let illustrationUrl = '/resources/bg.gif';
    fetch('/resources/bg.gif')
        .then((res) => (res.ok ? res.blob() : Promise.reject()))
        .then((blob) => {
            illustrationUrl = URL.createObjectURL(blob);
            // Overlay may already exist if it was built before this
            // resolved — patch its <img> in place rather than leaving
            // it pointed at a network path that might be gone by now.
            const img = overlay?.querySelector('.offline-illustration');
            if (img) img.src = illustrationUrl;
        })
        .catch(() => {}); // stay on the network path; SW cache may still cover it

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'offline-overlay hidden';
        overlay.innerHTML = `
            <div class="offline-card">
                <img src="${illustrationUrl}" alt="" class="offline-illustration">
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
    if (!expiryDateStr) return;

    const expiry = new Date(`${expiryDateStr}T23:59:59`);
    if (isNaN(expiry.getTime())) return;

    const daysLeft = Math.ceil((expiry - new Date()) / (24 * 60 * 60 * 1000));
    if (daysLeft > 5) return;

    const isOverdue = daysLeft < 0;
    const banner = document.createElement('div');
    banner.className = 'subscription-banner' + (isOverdue ? ' overdue' : '');
    const message = isOverdue
        ? 'Hosting renewal is overdue — please confirm payment with the developer to keep the service running.'
        : `Hosting renewal due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — please confirm payment with the developer to renew.`;
    banner.innerHTML = `
        <svg class="sub-banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>${message}</span>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
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

// Wires a native <select> element — opens the browser/OS's own dropdown
// list rather than a custom popup — and keeps it to the same { get, set }
// shape as makePickerField above, so pages that used to read/write a
// picker's value didn't need to change how they do that. Still fires a
// 'picker-change' CustomEvent on the element itself when the value
// changes, so any existing `elementEl.addEventListener('picker-change', ...)`
// call sites keep working untouched.
function makeNativeSelectField({ selectEl, options, initialValue }) {
    function applyOptions(opts) {
        selectEl.innerHTML = '';
        opts.forEach((opt) => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value;
            optionEl.textContent = opt.label;
            selectEl.appendChild(optionEl);
        });
    }

    if (options && options.length) applyOptions(options);
    if (initialValue !== undefined) selectEl.value = initialValue;

    selectEl.addEventListener('change', () => {
        selectEl.dispatchEvent(new CustomEvent('picker-change', { detail: selectEl.value }));
    });

    return {
        get: () => selectEl.value,
        set: (v) => { selectEl.value = v; },
        // Used by fields whose option list isn't known until data loads
        // later (e.g. receipt templates, which register themselves as
        // their own <script> tags run) — rebuilds the <option>s in place.
        setOptions: (opts, selectedValue) => {
            applyOptions(opts);
            if (selectedValue !== undefined) selectEl.value = selectedValue;
        },
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

// Stops the mouse wheel from changing a focused <input type="number">'s
// value — the browser's default behavior on desktop, and an easy way to
// accidentally change the amount/rate/density while just scrolling the
// page. Blurring the field on wheel-over lets the page keep scrolling
// normally instead of nudging the number up or down. Applies app-wide,
// to every number input on every page, not just one specific field.
document.addEventListener('wheel', () => {
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number') {
        el.blur();
    }
}, { passive: true });
// Shared little UI helpers used by every screen. Load after style.css's
// classes are available (no dependency on Supabase, safe to load early).

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
        if (overlay) overlay.classList.remove('open');
    }

    function open({ title, options, selectedValue, onSelect }) {
        const node = ensure();
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

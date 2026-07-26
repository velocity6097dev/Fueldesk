// Load this file BEFORE the individual template files (bpclTokheim.js etc.)
// and BEFORE billing.js.
//
// Each template file calls:
//   window.BillTemplates.register({ id, label, render(data) { ... } });
//
// `render(data)` must return an HTML string for the #thermal-receipt div.
// `data` shape (all fields already formatted as strings unless noted):
//   {
//     station: { name, address, phone, gstin, logoUrl, logoWidthMm },
//     footer,                          // printed at the bottom, may contain "\n"
//     receiptNo, productLabel,
//     density, presetTypeLabel, rate, volume, amount,
//     dateStr, timeStr, printDateStr, printTimeStr,
//     attendantUsername, vehicleNo, mobileNo
//   }
//
// `station.address` and `footer` may contain literal "\n" line breaks
// (typed into a <textarea> in the admin panel) — use the multiline()
// helper below rather than dropping them straight into HTML.
//
// IMPORTANT: any station/user-supplied text (name, address, footer,
// vehicle/mobile numbers) must go through escapeHtml() or multiline()
// before being placed in the returned HTML — never interpolate it raw.

window.BillTemplates = (function () {
    const templates = {};

    function register(template) {
        if (!template || !template.id || typeof template.render !== 'function') {
            console.error('Invalid template registration', template);
            return;
        }
        templates[template.id] = template;
    }

    function get(id) {
        return templates[id] || templates['BPCL_TOKHEIM'] || Object.values(templates)[0];
    }

    function list() {
        return Object.values(templates);
    }

    // Templates receive plain strings that may contain user-typed "\n"
    // (from the address / footer textareas). These two helpers turn that
    // into safe, correctly line-broken HTML for the printed receipt.
    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function multiline(str, attrs = '') {
        return escapeHtml(str).split('\n').filter((l) => l.trim() !== '')
            .map((l) => `<div${attrs ? ` ${attrs}` : ''}>${l}</div>`).join('');
    }

    return { register, get, list, escapeHtml, multiline };
})();

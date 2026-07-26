// Load this file BEFORE the individual template files (bpclTokheim.js etc.)
// and BEFORE billing.js.
//
// Each template file calls:
//   window.BillTemplates.register({ id, label, render(data) { ... } });
//
// `render(data)` must return an HTML string for the #thermal-receipt div.
// `data` shape (all fields already formatted as strings unless noted):
//   {
//     station:  { name, address, phone, gstin },
//     receiptNo, productLabel,
//     density, presetTypeLabel, rate, volume, amount,
//     dateStr, timeStr, printDateStr, printTimeStr,
//     attendantUsername
//   }

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

    return { register, get, list };
})();

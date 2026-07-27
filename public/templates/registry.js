// Load this file BEFORE the individual template files (bpclTokheim.js etc.)
// and BEFORE billing.js.
//
// Each template file calls:
//   window.BillTemplates.register({ id, label, render(data) { ... } });
//
// `render(data)` must return an HTML string for the #thermal-receipt div.
// `data` shape (all fields already formatted as strings unless noted):
//   {
//     station: {
//       name, address, phone, gstin,
//       logoUrl, logoWidthMm, logoMarginTopMm, logoMarginBottomMm, logoAlign,
//     },
//     footer,                          // printed at the bottom, may contain "\n" + commands
//     receiptNo, transactionId, fpId, nozzleNo, productLabel,
//     density, presetTypeLabel, rate, volume, amount,
//     dateStr, timeStr, printDateStr, printTimeStr,
//     attendantUsername, vehicleNo, mobileNo
//   }
//
// `station.address` and `footer` come straight from an admin's <textarea>
// and may contain literal "\n" line breaks plus a tiny set of formatting
// commands. Always render them with formattedBlock() below — never drop
// them into HTML raw, and never build your own regex against them.
//
// IMPORTANT: any other station/user-supplied text (name, vehicle/mobile
// numbers, attendant name) must go through escapeHtml() before being
// placed in the returned HTML.

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

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // Renders admin-typed text (address / footer) as left-aligned lines by
    // default, with three opt-in commands recognized on their own line:
    //   <center>text</center>   <right>text</right>   <b>text</b>
    // Everything is escaped first, so this can never inject real HTML —
    // only these exact whitelisted patterns are turned back into markup.
    // This is also what the (i) info button documents to admins.
    const COMMANDS_HELP_HTML = `
        <ul>
            <li>Press <b>Enter</b> for a new line.</li>
            <li><code>&lt;center&gt;text&lt;/center&gt;</code> — centers that line.</li>
            <li><code>&lt;right&gt;text&lt;/right&gt;</code> — right-aligns that line.</li>
            <li><code>&lt;b&gt;text&lt;/b&gt;</code> — bolds part or all of a line.</li>
        </ul>
        <p>Lines are left-aligned unless you wrap them in one of these.</p>
    `;

    function formattedLine(rawLine, extraAttrs = '') {
        let align = 'left';
        let body = rawLine;

        const centerMatch = body.match(/^<center>([\s\S]*)<\/center>$/i);
        const rightMatch = !centerMatch && body.match(/^<right>([\s\S]*)<\/right>$/i);
        if (centerMatch) { align = 'center'; body = centerMatch[1]; }
        else if (rightMatch) { align = 'right'; body = rightMatch[1]; }

        let html = escapeHtml(body).replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/gi, '<b>$1</b>');
        const attrs = `style="text-align:${align};"${extraAttrs ? ` ${extraAttrs}` : ''}`;
        return `<div ${attrs}>${html}</div>`;
    }

    function formattedBlock(text, extraAttrs = '') {
        return String(text ?? '').split('\n')
            .filter((l) => l.trim() !== '')
            .map((l) => formattedLine(l, extraAttrs))
            .join('');
    }

    // Shared by every template: renders the logo image (if the admin
    // uploaded one) or a template-specific placeholder, positioned per
    // the admin's alignment + top/bottom spacing settings.
    function renderLogoBlock(station, placeholderHtml) {
        const align = (station.logoAlign || 'CENTER').toLowerCase();
        const top = station.logoMarginTopMm ?? 0;
        const bottom = station.logoMarginBottomMm ?? 4;
        const inner = station.logoUrl
            ? `<img class="receipt-logo-img" src="${escapeHtml(station.logoUrl)}" style="width:${station.logoWidthMm || 32}mm;">`
            : placeholderHtml;
        return `<div style="text-align:${align};margin-top:${top}mm;margin-bottom:${bottom}mm;">${inner}</div>`;
    }

    return { register, get, list, escapeHtml, formattedBlock, renderLogoBlock, COMMANDS_HELP_HTML };
})();

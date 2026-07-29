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
//       name, address, phone, logoUrl, logoWidthMm,
//       logoPositionPct, logoMarginTopMm, logoMarginBottomMm,
//       logoRatioLocked, logoHeightMm,
//     },
//     footer,                          // printed at the bottom, may contain "\n" + commands
//     receiptNo, transactionId, billDateTimeIso, product, productLabel,
//     density, presetTypeLabel, rate, volume, amount,
//     dateStr, timeStr, printDateStr, printTimeStr,
//     attendantUsername, vehicleNo, mobileNo
//   }
//
// FP ID / Nozzle No are NOT passed in `data` — every template generates
// these itself via BillTemplates.randomFpId() / randomNozzleNo() (fresh
// on every render, matching a real pump printer's jitter between bills).
//
// `billDateTimeIso` is the bill's timestamp as a full ISO string — use
// this (via `new Date(data.billDateTimeIso)`) if a template needs a date
// or time format other than the pre-formatted dateStr/timeStr (e.g. a
// 4-digit year, or seconds).
//
// `station.address` and `footer` come straight from an admin's <textarea>
// (and `station.name` from a text input) and may contain literal "\n"
// line breaks plus a tiny set of formatting commands. Always render them
// with formattedBlock(text, extraStyle, defaultAlign) below — never drop
// them into HTML raw, and never build your own regex against them.
// `extraStyle` is raw CSS declarations merged into the line's single
// `style` attribute (e.g. `'font-size:10px;'`) — do NOT pass a full
// `style="..."` string, since HTML silently drops a second `style`
// attribute on the same tag. `defaultAlign` ('left' by default) lets a
// template opt into e.g. "centered unless the admin overrides it".
//
// IMPORTANT: any other station/user-supplied text (vehicle/mobile
// numbers, attendant name) must go through escapeHtml() before being
// placed in the returned HTML.
//
// Each template file should wrap its contents in an IIFE (see
// ioclGilbarco.js) if it declares any top-level const/function — every
// template <script> shares one global scope on the page.
//
// After calling template.render(data), pass the result through
// BillTemplates.wrapForOutput(html, opts) before injecting it into the
// receipt container — this applies the global margin/top-spacing/line-
// height/base-font-size settings (edited live on the Format page) on
// top of whatever the template itself renders. Templates should NOT
// implement their own version of this — it's meant to be identical
// regardless of which template is active.

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

    function formattedLine(rawLine, extraStyle = '', defaultAlign = 'left') {
        let align = defaultAlign;
        let body = rawLine;

        const centerMatch = body.match(/^<center>([\s\S]*)<\/center>$/i);
        const rightMatch = !centerMatch && body.match(/^<right>([\s\S]*)<\/right>$/i);
        if (centerMatch) { align = 'center'; body = centerMatch[1]; }
        else if (rightMatch) { align = 'right'; body = rightMatch[1]; }

        let html = escapeHtml(body).replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/gi, '<b>$1</b>');
        return `<div style="text-align:${align};${extraStyle}">${html}</div>`;
    }

    // extraStyle: raw CSS declarations merged into the line's single style
    // attribute, e.g. formattedBlock(text, 'font-size:10px;'). Do NOT pass
    // a full `style="..."` string here — just the declarations.
    function formattedBlock(text, extraStyle = '', defaultAlign = 'left') {
        return String(text ?? '').split('\n')
            .filter((l) => l.trim() !== '')
            .map((l) => formattedLine(l, extraStyle, defaultAlign))
            .join('');
    }

    // Shared by every template: renders the logo image (if the admin
    // uploaded one) or a template-specific placeholder, positioned per
    // the admin's continuous position slider (0 = flush left, 50 =
    // centered, 100 = flush right) + top/bottom spacing settings.
    //
    // Position uses `margin-left: calc((100% - width) * pos/100)` — this
    // is exact at ANY slider value, not just three fixed stops, and
    // still resolves to a normal length value (mixing % and mm is valid
    // CSS), so it's as compatible as the old fixed left/center/right.
    //
    // Aspect ratio: locked (default) means height is always "auto", so
    // the logo can never look stretched no matter what width you pick.
    // Unlocked means logoHeightMm is used explicitly too — width and
    // height become independent, which CAN distort the image; that's
    // the point of unlocking it.
    function renderLogoBlock(station, placeholderHtml) {
        const top = station.logoMarginTopMm ?? 0;
        const bottom = station.logoMarginBottomMm ?? 4;
        const posPct = Math.max(0, Math.min(100, station.logoPositionPct ?? 50));
        const widthMm = station.logoWidthMm || 32;
        const marginLeft = `calc((100% - ${widthMm}mm) * ${(posPct / 100).toFixed(3)})`;
        const heightRule = (!station.logoRatioLocked && station.logoHeightMm)
            ? `height:${station.logoHeightMm}mm;`
            : 'height:auto;';

        const inner = station.logoUrl
            ? `<img class="receipt-logo-img" src="${escapeHtml(station.logoUrl)}" style="display:block;width:${widthMm}mm;${heightRule}margin-left:${marginLeft};margin-right:0;">`
            : placeholderHtml; // generic placeholder box — a rough left/center/right zone is precise enough for it

        const wrapAlign = posPct < 33 ? 'left' : posPct > 67 ? 'right' : 'center';
        return `<div style="display:flow-root;width:100%;box-sizing:border-box;text-align:${wrapAlign};margin-top:${top}mm;margin-bottom:${bottom}mm;">${inner}</div>`;
    }

    // Every template uses these for FP ID / Nozzle No — freshly
    // randomized on every print/preview to match a real pump printer's
    // jitter between bills. Purely cosmetic: your real receipt number,
    // database row id, and everything used for reporting/attribution
    // elsewhere in the app are completely unaffected.
    function randomFpId() {
        return Math.random() < 0.5 ? '1' : '2';
    }
    function randomNozzleNo() {
        return String(Math.floor(Math.random() * 4) + 1); // 1-4
    }

    // Applies GLOBAL formatting (side margin, top spacing, line height,
    // base font size, space after the footer) around a template's
    // rendered HTML. This is independent of any one template — used by
    // billing.js / admin.js / format.js right before injecting into the
    // receipt container, so it applies the same way no matter which
    // template is active. Values come from daily_config
    // (receipt_margin_mm, receipt_margin_top_mm, receipt_line_spacing,
    // receipt_base_font_px, receipt_footer_space_mm), editable live with
    // a preview on the Format page.
    //
    // `display:flow-root` is important here, not decorative: without it,
    // a child's margin-top (e.g. the logo's "Space Above") can CSS-
    // collapse straight through this wrapper and leak out above it
    // instead of pushing content down inside it — which looked exactly
    // like "Space Above does nothing." flow-root gives this wrapper its
    // own containing block, so margins always behave the way the
    // sliders promise.
    function wrapForOutput(innerHtml, opts = {}) {
        const marginMm = opts.marginMm ?? 3;
        const marginTopMm = opts.marginTopMm ?? 0;
        const lineSpacing = opts.lineSpacing ?? 1.2;
        const baseFontPx = opts.baseFontPx ?? 11;
        const footerSpaceMm = opts.footerSpaceMm ?? 4;
        return `<div style="display:flow-root;box-sizing:border-box;width:100%;padding:${marginTopMm}mm ${marginMm}mm ${footerSpaceMm}mm ${marginMm}mm;line-height:${lineSpacing};font-size:${baseFontPx}px;">${innerHtml}</div>`;
    }

    return { register, get, list, escapeHtml, formattedBlock, renderLogoBlock, wrapForOutput, randomFpId, randomNozzleNo, COMMANDS_HELP_HTML };
})();

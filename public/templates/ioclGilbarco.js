// IOCL Gilbarco -- "classic" dot-matrix pump receipt layout.
(function () {
    // ---------------------------------------------------------------
    // TEXT SCALE -- edit these directly to resize parts of this
    // template RELATIVE to each other. These are `em` multipliers
    // against the inherited base size, not fixed px -- the actual base
    // size is the ONE global "Base Text Size" control in the Format
    // panel, so it now actually affects this template's text (it
    // did not used to, when this file had its own separate fixed-px
    // sizes that silently overrode the global one).
    // ---------------------------------------------------------------
    const TEXT_SCALE = {
        stationName: 1.0,
        addressPhone: 1.0,
        fieldBlock: 1.0,
        labelColWidth: 4.9,  // em -- reserved width for the label column before the colon
        footer: 1.0,
        cashMemo: 1.0, // font size of the fixed "CASH MEMO" line printed above the station name
    };

    // Vertical gap between the logo and the "CASH MEMO" line right below
    // it, in mm. This is this template's own spacing knob, separate from
    // the global margin/line-height controls in the Format panel (those
    // apply uniformly around the whole receipt, not between these two
    // specific pieces).
    const LOGO_TO_TEXT_GAP_MM = 4;

    const FUEL_NAMES = { MS: 'PETROL', HSD: 'DIESEL', PREMIUM: 'PREMIUM' };
    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function pad2(n) { return String(n).padStart(2, '0'); }

    // Cosmetic, print-only number meant to match a real pump printer's
    // jitter between bills -- this is NOT your real database ID. Your
    // actual unique receipt number / row id are still tracked normally
    // everywhere else in the app (transactions table, staff attribution,
    // etc.) -- only what's printed on THIS template's paper is randomized.
    // Format: <Month abbreviation of the bill date>-<random 4 digits>-ORGNL,
    // e.g. "Aug-3354-ORGNL".
    function randomBillNo(dt) {
        const month = MONTH_ABBR[dt.getMonth()];
        const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        return `${month}-${digits}-ORGNL`;
    }

    // Same cosmetic, print-only idea as randomBillNo above -- not the real
    // database transaction id, just a plausible-looking number so the
    // field isn't left blank on the printed receipt.
    function randomTransactionId() {
        const last9 = String(Math.floor(Math.random() * 1000000000)).padStart(9, '0');
        return `0000000${last9}`;
    }

    // FP ID / Nozzle No on THIS template are fixed per fuel type instead
    // of randomized like the other templates: Petrol (MS) always prints
    // as 1, Diesel (HSD) always prints as 2. Any other product (e.g.
    // PREMIUM) falls back to the normal random behavior shared by every
    // other template.
    function fixedFpId(product) {
        if (product === 'MS') return '1';
        if (product === 'HSD') return '2';
        return window.BillTemplates.randomFpId();
    }
    function fixedNozzleNo(product) {
        if (product === 'MS') return '1';
        if (product === 'HSD') return '2';
        return window.BillTemplates.randomNozzleNo();
    }

    window.BillTemplates.register({
        id: 'IOCL_GILBARCO',
        label: 'IOCL Gilbarco (Classic Receipt)',

        render(data) {
            const s = data.station;
            const { formattedBlock, renderLogoBlock, escapeHtml } = window.BillTemplates;
            const footer = data.footer || '<center>Thank You! Please Visit Again..</center>';

            // No text logo placeholder here -- if no photo is uploaded, this
            // template shows a plain circle only (the wordmark lives in your
            // uploaded logo photo itself, not hardcoded text).
            const logoBlock = renderLogoBlock(s, `<div class="classic-circle-logo"></div>`);

            const line = (label, value) => `
                <div class="classic-line" style="font-size:${TEXT_SCALE.fieldBlock}em;">
                    <span class="classic-label" style="width:${TEXT_SCALE.labelColWidth}em;">${label}</span><span>:${escapeHtml(value)}</span>
                </div>
            `;

            const fuelName = FUEL_NAMES[data.product] || data.productLabel;
            // `presetOverride` (set via the "Volume Preset" toggle on the
            // billing page) always wins when present — it prints the fixed
            // placeholder value on the Preset line while Sale/Volume/Rate
            // below stay exactly what was actually entered/dispensed.
            const preset = data.presetOverride || (data.presetTypeLabel === 'Amount' ? `Rs.${data.amount}` : `${data.volume}L`);

            const dt = data.billDateTimeIso ? new Date(data.billDateTimeIso) : new Date();
            const dateStr4 = `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
            const timeStrSec = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;

            return `
                ${logoBlock}
                <div style="font-size:${TEXT_SCALE.cashMemo}em;margin-top:${LOGO_TO_TEXT_GAP_MM}mm;">CASH MEMO</div>
                ${formattedBlock(s.name, `font-size:${TEXT_SCALE.stationName}em;`)}
                ${s.address ? formattedBlock(s.address, `font-size:${TEXT_SCALE.addressPhone}em;`) : ''}
                ${s.phone && s.phone.trim() ? `<div style="font-size:${TEXT_SCALE.addressPhone}em;">PH. ${escapeHtml(s.phone.trim())}</div>` : ''}
                ${line('Bill No', randomBillNo(dt))}
                ${line('Trns.ID', randomTransactionId())}
                ${line('Atnd.ID', '')}
                ${line('Receipt', 'No Receipt')}
                ${line('Vehi.No', data.vehicleNo || 'Not Entered')}
                ${data.mobileNo ? line('Mob.No', `+91${data.mobileNo}`) : ''}
                ${line('Date', dateStr4)}
                ${line('Time', timeStrSec)}
                ${line('FP. ID', fixedFpId(data.product))}
                ${line('Nozl No', fixedNozzleNo(data.product))}
                ${line('Fuel', fuelName)}
                ${line('Density', `${data.density}kg/m3`)}
                ${line('Preset', preset)}
                ${line('Rate', `Rs.${data.rate}`)}
                ${line('Sale', `Rs.${data.amount}`)}
                ${line('Volume', `${data.volume}L`)}
                <div style="font-size:${TEXT_SCALE.footer}em;">${formattedBlock(footer)}</div>
            `;
        },
    });
})();
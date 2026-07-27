// IOCL Gilbarco — "classic" dot-matrix pump receipt layout.
(function () {
    // ---------------------------------------------------------------
    // TEXT SIZES — edit these directly to resize the receipt's text.
    // This is intentionally a plain constants block in the template
    // file itself, not a Settings UI control.
    // ---------------------------------------------------------------
    const TEXT_SIZES = {
        base: 11,          // overall receipt text size (px) — everything scales from this
        stationName: 12,   // station name line (px)
        addressPhone: 10,  // address + phone lines (px)
        fieldBlock: 11,    // the Bill No / Date / Fuel / etc. label:value block (px)
        labelColWidth: 54, // px reserved for the label column before the colon
        footer: 11,        // footer text size (px)
    };

    const FUEL_NAMES = { MS: 'PETROL', HSD: 'DIESEL', PREMIUM: 'PREMIUM' };

    function pad2(n) { return String(n).padStart(2, '0'); }

    // Cosmetic, print-only numbers meant to match a real pump printer's
    // jitter between bills — these are NOT your real database IDs. Your
    // actual unique receipt number / row id are still tracked normally
    // everywhere else in the app (transactions table, staff attribution,
    // etc.) — only what's printed on THIS template's paper is randomized,
    // per your spec.
    function randomBillNo() {
        const digits = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        return `${digits}-ORGNL`;
    }
    function randomTransactionId() {
        const last9 = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
        return `0000000${last9}`; // 7 zeros + 9 random digits = 16 digits
    }
    function randomFpId() {
        return Math.random() < 0.5 ? '1' : '2';
    }
    function randomNozzleNo() {
        return String(Math.floor(Math.random() * 4) + 1); // 1-4
    }

    window.BillTemplates.register({
        id: 'IOCL_GILBARCO',
        label: 'IOCL Gilbarco (Classic Receipt)',

        render(data) {
            const s = data.station;
            const { formattedBlock, renderLogoBlock, escapeHtml } = window.BillTemplates;
            const footer = data.footer || '<center>Thank You! Please Visit Again..</center>';

            // No text logo placeholder here — if no photo is uploaded, this
            // template shows a plain circle only (the wordmark lives in your
            // uploaded logo photo itself, not hardcoded text).
            const logoBlock = renderLogoBlock(s, `<div class="classic-circle-logo"></div>`);

            const line = (label, value) => `
                <div class="classic-line" style="font-size:${TEXT_SIZES.fieldBlock}px;">
                    <span class="classic-label" style="width:${TEXT_SIZES.labelColWidth}px;">${label}</span><span>:${escapeHtml(value)}</span>
                </div>
            `;

            const fuelName = FUEL_NAMES[data.product] || data.productLabel;
            const preset = data.presetTypeLabel === 'Amount' ? `Rs.${data.amount}` : `${data.volume}L`;

            const dt = data.billDateTimeIso ? new Date(data.billDateTimeIso) : new Date();
            const dateStr4 = `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
            const timeStrSec = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;

            return `
                <div style="font-size:${TEXT_SIZES.base}px;">
                    ${logoBlock}
                    ${formattedBlock(s.name, `font-size:${TEXT_SIZES.stationName}px;`)}
                    ${s.address ? formattedBlock(s.address, `font-size:${TEXT_SIZES.addressPhone}px;`) : ''}
                    ${s.phone ? `<div style="font-size:${TEXT_SIZES.addressPhone}px;">${escapeHtml(s.phone)}</div>` : ''}
                    <div class="my-2"></div>
                    ${line('Bill No', randomBillNo())}
                    ${line('Trns.ID', randomTransactionId())}
                    ${line('Atnd.ID', '')}
                    ${line('Vehi.No', data.vehicleNo || 'Not Entered')}
                    ${line('Date', dateStr4)}
                    ${line('Time', timeStrSec)}
                    ${line('FP. ID', randomFpId())}
                    ${line('Nozl No', randomNozzleNo())}
                    ${line('Fuel', fuelName)}
                    ${line('Density', `${data.density}kg/m3`)}
                    ${line('Preset', preset)}
                    ${line('Rate', `Rs.${data.rate}`)}
                    ${line('Sale', `Rs.${data.amount}`)}
                    ${line('Volume', `${data.volume}L`)}
                    ${data.mobileNo ? line('Mobile', data.mobileNo) : ''}
                    <div class="my-3"></div>
                    <div style="font-size:${TEXT_SIZES.footer}px;">${formattedBlock(footer)}</div>
                </div>
            `;
        },
    });
})();

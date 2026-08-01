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
    };

    const FUEL_NAMES = { MS: 'PETROL', HSD: 'DIESEL', PREMIUM: 'PREMIUM' };

    function pad2(n) { return String(n).padStart(2, '0'); }

    // Cosmetic, print-only numbers meant to match a real pump printer's
    // jitter between bills -- these are NOT your real database IDs. Your
    // actual unique receipt number / row id are still tracked normally
    // everywhere else in the app (transactions table, staff attribution,
    // etc.) -- only what's printed on THIS template's paper is randomized.
    function randomBillNo() {
        const digits = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        return `${digits}-ORGNL`;
    }
    function randomTransactionId() {
        const last9 = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
        return `0000000${last9}`; // 7 zeros + 9 random digits = 16 digits
    }

    window.BillTemplates.register({
        id: 'IOCL_GILBARCO',
        label: 'IOCL Gilbarco (Classic Receipt)',

        render(data) {
            const s = data.station;
            const { formattedBlock, renderLogoBlock, escapeHtml, randomFpId, randomNozzleNo } = window.BillTemplates;
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
            const preset = data.presetTypeLabel === 'Amount' ? `Rs.${data.amount}` : `${data.volume}L`;

            const dt = data.billDateTimeIso ? new Date(data.billDateTimeIso) : new Date();
            const dateStr4 = `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
            const timeStrSec = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;

            return `
                ${logoBlock}
                ${formattedBlock(s.name, `font-size:${TEXT_SCALE.stationName}em;`)}
                ${s.address ? formattedBlock(s.address, `font-size:${TEXT_SCALE.addressPhone}em;`) : ''}
                ${s.phone ? `<div style="font-size:${TEXT_SCALE.addressPhone}em;">PH. ${escapeHtml(s.phone)}</div>` : ''}
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
                <div style="font-size:${TEXT_SCALE.footer}em;">${formattedBlock(footer)}</div>
            `;
        },
    });
})();

// This matches the field layout of a real dot-matrix pump receipt:
// label + colon + value, one field per line, in the order Bill No,
// Trns.ID, Atnd.ID, Vehi.No, Date, Time, FP.ID, Nozl No, Fuel, Density,
// Preset, Rate, Sale, Volume.
//
// The circular logo frame is a plain generic shape — if you upload your
// real Indian Oil signage photo in Admin, it's used instead and this
// exact-copy template will look identical to your printed dealer bills.

const FUEL_NAMES = { MS: 'PETROL', HSD: 'DIESEL', PREMIUM: 'PREMIUM' };

window.BillTemplates.register({
    id: 'IOCL_CLASSIC',
    label: 'Indian Oil (Classic Receipt)',

    render(data) {
        const s = data.station;
        const { formattedBlock, renderLogoBlock, escapeHtml } = window.BillTemplates;
        const footer = data.footer || '<center>Thank You! Please Visit Again..</center>';

        const line = (label, value) => `
            <div class="classic-line">
                <span class="classic-label">${label}</span><span>:${escapeHtml(value)}</span>
            </div>
        `;

        const placeholder = `
            <div class="classic-circle-logo"><span>${escapeHtml((s.name || 'LOGO').slice(0, 3).toUpperCase())}</span></div>
        `;
        const logoBlock = renderLogoBlock(s, placeholder);

        const fuelName = FUEL_NAMES[data.product] || data.productLabel;
        const preset = data.presetTypeLabel === 'Amount' ? `Rs.${data.amount}` : `${data.volume}L`;

        return `
            ${logoBlock}
            <div class="text-center font-bold" style="font-size:15px;margin-bottom:4px;">IndianOil</div>
            <div class="text-center font-bold uppercase" style="font-size:12px;">${escapeHtml(s.name)}</div>
            ${s.address ? formattedBlock(s.address, 'style="font-size:11px;"') : ''}
            <div class="my-2"></div>
            ${line('Bill No', data.receiptNo)}
            ${line('Trns.ID', data.transactionId)}
            ${line('Atnd.ID', data.attendantUsername || '')}
            ${line('Vehi.No', data.vehicleNo || 'Not Entered')}
            ${line('Date', data.dateStr)}
            ${line('Time', data.timeStr)}
            ${line('FP. ID', data.fpId)}
            ${line('Nozl No', data.nozzleNo)}
            ${line('Fuel', fuelName + '.')}
            ${line('Density', `${data.density}kg/m3`)}
            ${line('Preset', preset)}
            ${line('Rate', `Rs.${data.rate}`)}
            ${line('Sale', `Rs.${data.amount}`)}
            ${line('Volume', `${data.volume}L`)}
            ${data.mobileNo ? line('Mobile', data.mobileNo) : ''}
            <div class="my-3"></div>
            <div class="font-bold">${formattedBlock(footer)}</div>
            <div class="my-2"></div>
            <div class="text-left" style="font-size:10px;">Printed: ${data.printDateStr} ${data.printTimeStr}</div>
        `;
    },
});

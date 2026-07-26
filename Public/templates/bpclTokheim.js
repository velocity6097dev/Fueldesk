window.BillTemplates.register({
    id: 'BPCL_TOKHEIM',
    label: 'BPCL Tokheim',

    render(data) {
        const s = data.station;
        const { multiline, escapeHtml } = window.BillTemplates;

        const logoHtml = s.logoUrl
            ? `<img class="receipt-logo-img" src="${escapeHtml(s.logoUrl)}" style="width:${s.logoWidthMm}mm;">`
            : `<div class="receipt-logo-box font-bold uppercase">Bharat<br/>Petroleum</div>`;

        return `
            <div class="text-center">
                ${logoHtml}
                <div style="font-size:13px;letter-spacing:1px;margin-bottom:2px;">Welcomes You</div>
                <div class="font-bold uppercase" style="font-size:12px;">${escapeHtml(s.name)}</div>
                ${s.address ? multiline(s.address, 'class="uppercase" style="font-size:10px;"') : ''}
                ${s.phone ? `<div style="font-size:10px;">Tel. No.: ${escapeHtml(s.phone)}</div>` : ''}
                ${s.gstin ? `<div style="font-size:10px;">GSTIN: ${escapeHtml(s.gstin)}</div>` : ''}
            </div>
            <div class="my-2"></div>
            <div class="grid-3-col">
                <span>Receipt No.</span><span>:</span><span class="text-right">${data.receiptNo}</span>
                <span>FIP No.</span><span>:</span><span class="text-right">02</span>
                <span>Nozzle No.</span><span>:</span><span class="text-right">04</span>
                <span>Product</span><span>:</span><span>${data.productLabel}</span>
                <span>Density</span><span>:</span><span>${data.density} Kg/Cu.mtr</span>
                <span>Preset Type</span><span>:</span><span>${data.presetTypeLabel}</span>
                <span>Rate</span><span>:</span><span class="text-right">${data.rate}</span>
                <span>Volume</span><span>:</span><span class="text-right">${data.volume}</span>
                <span>Amount</span><span>:</span><span class="text-right">${data.amount}</span>
            </div>
            <div class="my-2"></div>
            <div>
                <div class="flex-between"><span>Vehicle No:</span><span>${escapeHtml(data.vehicleNo || 'Not Entered')}</span></div>
                <div class="flex-between"><span>Mobile No :</span><span>${escapeHtml(data.mobileNo || 'Not Entered')}</span></div>
                <div class="flex-between"><span>Attendant :</span><span>${escapeHtml(data.attendantUsername)}</span></div>
            </div>
            <div class="my-2"></div>
            <div>Date : ${data.dateStr}  Time: ${data.timeStr}</div>
            <div class="my-3"></div>
            <div class="text-center font-bold">${multiline(data.footer)}</div>
            <div class="my-3"></div>
            <div class="text-left" style="font-size:10px;">Printed on: ${data.printDateStr} ${data.printTimeStr}</div>
        `;
    },
});

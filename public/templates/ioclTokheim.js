(function () {
    const SCALE = {
        tagline: 1.18,      // "*** Fuelling Trust ***"
        stationName: 1.09,
        addressPhone: 0.91,
        printedOn: 0.91,
    };

    window.BillTemplates.register({
        id: 'IOCL_TOKHEIM',
        label: 'IOCL Tokheim',

        render(data) {
            const s = data.station;
            const { formattedBlock, renderLogoBlock, escapeHtml, randomFpId, randomNozzleNo } = window.BillTemplates;
            const footer = data.footer || '<center>Thank You! Please Visit Again..</center>';

            const logoBlock = renderLogoBlock(s, `<div class="receipt-logo-box font-bold uppercase">Indian<br/>Oil</div>`);

            return `
                ${logoBlock}
                <div class="text-center" style="font-size:${SCALE.tagline}em;letter-spacing:1px;margin-bottom:2px;">*** Fuelling Trust ***</div>
                ${formattedBlock(s.name, `font-size:${SCALE.stationName}em;`, 'center')}
                ${s.address ? formattedBlock(s.address, `font-size:${SCALE.addressPhone}em;`) : ''}
                ${s.phone ? `<div style="font-size:${SCALE.addressPhone}em;">Ph: ${escapeHtml(s.phone)}</div>` : ''}
                <div class="my-2"></div>
                <div class="grid-3-col">
                    <span>Bill No.</span><span>:</span><span class="text-right">${data.receiptNo}</span>
                    <span>DU No.</span><span>:</span><span class="text-right">${randomFpId()}</span>
                    <span>Nozzle</span><span>:</span><span class="text-right">${randomNozzleNo()}</span>
                    <span>Product</span><span>:</span><span>${data.productLabel}</span>
                    <span>Density</span><span>:</span><span>${data.density} Kg/Cu.mtr</span>
                    <span>Mode</span><span>:</span><span>${data.presetTypeLabel}</span>
                    <span>Rate/Ltr</span><span>:</span><span class="text-right">${data.rate}</span>
                    <span>Qty (Ltr)</span><span>:</span><span class="text-right">${data.volume}</span>
                    <span>Total Amt</span><span>:</span><span class="text-right">${data.amount}</span>
                </div>
                <div class="my-2"></div>
                <div>
                    <div class="flex-between"><span>Vehicle No:</span><span>${escapeHtml(data.vehicleNo || 'Not Entered')}</span></div>
                    <div class="flex-between"><span>Mobile No :</span><span>${escapeHtml(data.mobileNo || 'Not Entered')}</span></div>
                    <div class="flex-between"><span>Operator  :</span><span>${escapeHtml(data.attendantUsername)}</span></div>
                </div>
                <div class="my-2"></div>
                <div>Date : ${data.dateStr}  Time: ${data.timeStr}</div>
                <div class="my-3"></div>
                <div class="font-bold">${formattedBlock(footer)}</div>
                <div class="my-3"></div>
                <div class="text-left" style="font-size:${SCALE.printedOn}em;">Printed: ${data.printDateStr} ${data.printTimeStr}</div>
            `;
        },
    });
})();

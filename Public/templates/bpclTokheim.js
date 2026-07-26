window.BillTemplates.register({
    id: 'BPCL_TOKHEIM',
    label: 'BPCL Tokheim',

    render(data) {
        const s = data.station;
        return `
            <div class="text-center">
                <div class="receipt-logo-box font-bold uppercase">Bharat<br/>Petroleum</div>
                <div style="font-size:13px;letter-spacing:1px;margin-bottom:2px;">Welcomes You</div>
                <div class="font-bold uppercase" style="font-size:12px;">${s.name}</div>
                ${s.address ? `<div class="uppercase" style="font-size:10px;">${s.address}</div>` : ''}
                ${s.phone ? `<div style="font-size:10px;">Tel. No.: ${s.phone}</div>` : ''}
                ${s.gstin ? `<div style="font-size:10px;">GSTIN: ${s.gstin}</div>` : ''}
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
                <div class="flex-between"><span>Vehicle No:</span><span>Not Entered</span></div>
                <div class="flex-between"><span>Attendant :</span><span>${data.attendantUsername}</span></div>
            </div>
            <div class="my-2"></div>
            <div>Date : ${data.dateStr}  Time: ${data.timeStr}</div>
            <div class="my-3"></div>
            <div class="text-center font-bold">Thank You! Please Visit Again..</div>
            <div class="my-3"></div>
            <div class="text-left" style="font-size:10px;">Printed on: ${data.printDateStr} ${data.printTimeStr}</div>
        `;
    },
});

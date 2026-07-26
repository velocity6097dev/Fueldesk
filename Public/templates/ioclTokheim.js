window.BillTemplates.register({
    id: 'IOCL_TOKHEIM',
    label: 'IOCL Tokheim',

    render(data) {
        const s = data.station || {};
        
        // Formats the address to break into multiple lines with a period at the end of each
        const addressHtml = s.address 
            ? s.address.split(',').map(line => `<div>${line.trim().toUpperCase()}.</div>`).join('') 
            : '';

        // The physical Tokheim printout pads every label to a fixed 7-character
        // field (monospace) before the colon — that's why 7-letter labels like
        // "Density" and "Trns.ID" butt straight up against the colon, while
        // shorter ones like "Date" or "Rate" get extra space. A fixed pixel
        // width doesn't reproduce that, so we pad by character count instead.
        const LABEL_WIDTH = 7;
        const field = (label, value) => {
            const pad = '&nbsp;'.repeat(Math.max(0, LABEL_WIDTH - label.length));
            return `<div>${label}${pad}:${value}</div>`;
        };

        return `
            <div>
                <!-- Station Info (Left Aligned) -->
                <div style="text-transform: uppercase; font-size: 10px; margin-bottom: 3px;">
                    ${s.name ? `<div>${s.name.toUpperCase()}.</div>` : ''}
                    ${addressHtml}
                </div>

                <!-- Transaction Details (character-padded, monospace column alignment) -->
                <div style="font-size: 10px;">
                    ${field('Bill No', data.receiptNo || '')}
                    ${field('Trns.ID', data.transactionId || '00000000300242980')}
                    ${field('Atnd.ID', data.attendantUsername || '')}
                    ${field('Vehi.No', data.vehicleNo || '')}
                    ${field('Date', data.dateStr || '')}
                    ${field('Time', data.timeStr || '')}
                    ${field('FP. ID', '1')}
                    ${field('Nozl No', '1')}
                    ${field('Fuel', (data.productLabel ? data.productLabel.toUpperCase() : 'PETROL') + '.')}
                    ${field('Density', (data.density || '0') + 'kg/m3')}
                    ${field('Preset', 'Rs.' + (data.amount || '0'))}
                    ${field('Rate', 'Rs.' + (data.rate || '0'))}
                    ${field('Sale', 'Rs.' + (data.amount || '0'))}
                    ${field('Volume', (data.volume || '0') + 'L')}
                </div>

                <!-- Footer Section -->
                <div style="margin-top: 3px; font-size: 10px;">
                    ${s.phone ? `<div>PH.MO.- ${s.phone}.</div>` : ''}
                    ${s.phone2 ? `<div>PH.NO.  ${s.phone2}</div>` : ''}
                </div>
            </div>
        `;
    },
});
const TEMPLATE_OPTIONS_FALLBACK = [];
let stationConfig = null; // real station name/address/logo/footer, for a meaningful preview

const marginSideSlider = document.getElementById('margin-side');
const marginSideValue = document.getElementById('margin-side-value');
const marginTopSlider = document.getElementById('margin-top');
const marginTopValue = document.getElementById('margin-top-value');
const lineSpacingSlider = document.getElementById('line-spacing');
const lineSpacingValue = document.getElementById('line-spacing-value');
const baseFontSlider = document.getElementById('base-font');
const baseFontValue = document.getElementById('base-font-value');
const saveFormatBtn = document.getElementById('save-format-btn');
const receiptEl = document.getElementById('thermal-receipt');

document.getElementById('back-btn').addEventListener('click', () => window.location.href = '/admin.html');

const templatePicker = makePickerField({
    buttonEl: document.getElementById('template-picker-btn'),
    labelEl: document.getElementById('template-picker-label'),
    title: 'Preview With Template',
    options: TEMPLATE_OPTIONS_FALLBACK,
    initialValue: 'BPCL_TOKHEIM',
});
document.getElementById('template-picker-btn').addEventListener('picker-change', renderPreview);

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

async function patchConfig(fields) {
    const res = await fetch('/api/config', {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify(fields),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Save failed');
    return body;
}

function sampleData() {
    return {
        station: {
            name: stationConfig?.station_name || 'Your Service Station',
            address: stationConfig?.station_address || '',
            phone: stationConfig?.station_phone || '',
            gstin: stationConfig?.station_gstin || '',
            logoUrl: stationConfig?.logo_url || null,
            logoWidthMm: stationConfig?.logo_width_mm ?? 32,
            logoMarginTopMm: stationConfig?.logo_margin_top_mm ?? 0,
            logoMarginBottomMm: stationConfig?.logo_margin_bottom_mm ?? 4,
            logoAlign: stationConfig?.logo_align ?? 'CENTER',
        },
        footer: stationConfig?.receipt_footer || '<center>Thank You! Please Visit Again..</center>',
        receiptNo: 'G0000',
        transactionId: '0000000000000001',
        billDateTimeIso: new Date().toISOString(),
        fpId: stationConfig?.fp_id || '1',
        nozzleNo: stationConfig?.nozzle_no || '1',
        product: 'MS',
        productLabel: 'MS (Petrol)',
        density: stationConfig?.ms_density || '755.0',
        presetTypeLabel: 'Volume',
        rate: Number(stationConfig?.ms_rate || 100).toFixed(2),
        volume: '10.00',
        amount: (Number(stationConfig?.ms_rate || 100) * 10).toFixed(2),
        dateStr: '01/01/26',
        timeStr: '12:00',
        printDateStr: '01/01/26',
        printTimeStr: '12:00',
        attendantUsername: window.currentProfile?.username || 'staff_demo',
        vehicleNo: 'MH12AB1234',
        mobileNo: '9876543210',
    };
}

function renderPreview() {
    const template = window.BillTemplates.get(templatePicker.get());
    const rendered = template.render(sampleData());

    receiptEl.style.width = `${stationConfig?.receipt_width_cm ?? 5.8}cm`;
    receiptEl.innerHTML = window.BillTemplates.wrapForOutput(rendered, {
        marginMm: Number(marginSideSlider.value),
        marginTopMm: Number(marginTopSlider.value),
        lineSpacing: Number(lineSpacingSlider.value),
        baseFontPx: Number(baseFontSlider.value),
    });
}

function wireLiveSlider(slider, valueEl, format) {
    slider.addEventListener('input', () => {
        valueEl.textContent = format(slider.value);
        renderPreview();
    });
}
wireLiveSlider(marginSideSlider, marginSideValue, (v) => `${v}mm`);
wireLiveSlider(marginTopSlider, marginTopValue, (v) => `${v}mm`);
wireLiveSlider(lineSpacingSlider, lineSpacingValue, (v) => Number(v).toFixed(2));
wireLiveSlider(baseFontSlider, baseFontValue, (v) => `${v}px`);

saveFormatBtn.addEventListener('click', async () => {
    saveFormatBtn.disabled = true;
    saveFormatBtn.textContent = 'Saving...';
    try {
        await patchConfig({
            receipt_margin_mm: Number(marginSideSlider.value),
            receipt_margin_top_mm: Number(marginTopSlider.value),
            receipt_line_spacing: Number(lineSpacingSlider.value),
            receipt_base_font_px: Number(baseFontSlider.value),
        });
        Toast.show('Format saved — every bill will use this from now on.');
    } catch (err) {
        Toast.show(err.message, { error: true, duration: 5000 });
    } finally {
        saveFormatBtn.disabled = false;
        saveFormatBtn.textContent = 'Save';
    }
});

async function loadConfig() {
    const { data, error } = await window.sb.from('daily_config').select('*').eq('id', 1).single();
    if (error || !data) {
        Toast.show('Could not load settings.', { error: true, duration: 5000 });
        return;
    }
    stationConfig = data;

    marginSideSlider.value = data.receipt_margin_mm ?? 3;
    marginSideValue.textContent = `${marginSideSlider.value}mm`;
    marginTopSlider.value = data.receipt_margin_top_mm ?? 0;
    marginTopValue.textContent = `${marginTopSlider.value}mm`;
    lineSpacingSlider.value = data.receipt_line_spacing ?? 1.2;
    lineSpacingValue.textContent = Number(lineSpacingSlider.value).toFixed(2);
    baseFontSlider.value = data.receipt_base_font_px ?? 11;
    baseFontValue.textContent = `${baseFontSlider.value}px`;

    templatePicker.set(data.active_template);
    renderPreview();
}

(async function init() {
    const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
    if (!profile) return;

    const options = window.BillTemplates.list().map((t) => ({ value: t.id, label: t.label }));
    TEMPLATE_OPTIONS_FALLBACK.push(...options);

    await loadConfig();
})();

const TEMPLATE_OPTIONS_FALLBACK = [];
let stationConfig = null; // real station name/address/logo/footer, for a meaningful preview
let paperWidthCm = 5.8;

const receiptEl = document.getElementById('thermal-receipt');

// ---- Logo controls ----
const logoPositionSlider = document.getElementById('logo-position');
const logoPositionValue = document.getElementById('logo-position-value');
const logoWidthSlider = document.getElementById('logo-width');
const logoWidthValue = document.getElementById('logo-width-value');
const logoRatioLock = document.getElementById('logo-ratio-lock');
const logoHeightField = document.getElementById('logo-height-field');
const logoHeightSlider = document.getElementById('logo-height');
const logoHeightValue = document.getElementById('logo-height-value');

// ---- Paper ----
const paperWidthSegmented = document.getElementById('paper-width-segmented');

// ---- Margins & spacing ----
const marginSideSlider = document.getElementById('margin-side');
const marginSideValue = document.getElementById('margin-side-value');
const lineSpacingSlider = document.getElementById('line-spacing');
const lineSpacingValue = document.getElementById('line-spacing-value');
const baseFontSlider = document.getElementById('base-font');
const baseFontValue = document.getElementById('base-font-value');
const saveFormatBtn = document.getElementById('save-format-btn');

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
            logoUrl: stationConfig?.logo_url || null,
            logoWidthMm: Number(logoWidthSlider.value),
            logoPositionPct: Number(logoPositionSlider.value),
            logoRatioLocked: logoRatioLock.checked,
            logoHeightMm: Number(logoHeightSlider.value),
        },
        footer: stationConfig?.receipt_footer || '<center>Thank You! Please Visit Again..</center>',
        receiptNo: 'G0000',
        transactionId: '0000000000000001',
        billDateTimeIso: new Date().toISOString(),
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
        attendantUsername: FuelDeskAuth.displayName(window.currentProfile) || 'staff_demo',
        vehicleNo: 'MH12AB1234',
        mobileNo: '9876543210',
    };
}

function renderPreview() {
    const template = window.BillTemplates.get(templatePicker.get());
    const rendered = template.render(sampleData());

    receiptEl.style.width = `${paperWidthCm}cm`;
    receiptEl.innerHTML = window.BillTemplates.wrapForOutput(rendered, {
        marginMm: Number(marginSideSlider.value),
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

wireLiveSlider(logoWidthSlider, logoWidthValue, (v) => `${v}mm`);
wireLiveSlider(logoHeightSlider, logoHeightValue, (v) => `${v}mm`);
wireLiveSlider(marginSideSlider, marginSideValue, (v) => `${v}mm`);
wireLiveSlider(lineSpacingSlider, lineSpacingValue, (v) => Number(v).toFixed(2));
wireLiveSlider(baseFontSlider, baseFontValue, (v) => `${v}px`);

logoPositionSlider.addEventListener('input', () => {
    const v = Number(logoPositionSlider.value);
    logoPositionValue.textContent = v === 0 ? 'Left' : v === 100 ? 'Right' : v === 50 ? 'Center' : `${v}%`;
    renderPreview();
});

logoRatioLock.addEventListener('change', () => {
    logoHeightField.style.display = logoRatioLock.checked ? 'none' : 'block';
    renderPreview();
});

document.getElementById('base-font-minus').addEventListener('click', () => {
    baseFontSlider.value = Math.max(Number(baseFontSlider.min), Number(baseFontSlider.value) - 0.5);
    baseFontValue.textContent = `${baseFontSlider.value}px`;
    renderPreview();
});
document.getElementById('base-font-plus').addEventListener('click', () => {
    baseFontSlider.value = Math.min(Number(baseFontSlider.max), Number(baseFontSlider.value) + 0.5);
    baseFontValue.textContent = `${baseFontSlider.value}px`;
    renderPreview();
});

paperWidthSegmented.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
        paperWidthCm = Number(btn.dataset.cm);
        paperWidthSegmented.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        renderPreview();
    });
});

saveFormatBtn.addEventListener('click', async () => {
    saveFormatBtn.disabled = true;
    saveFormatBtn.textContent = 'Saving...';
    try {
        await patchConfig({
            logo_position_pct: Number(logoPositionSlider.value),
            logo_width_mm: Number(logoWidthSlider.value),
            logo_ratio_locked: logoRatioLock.checked,
            logo_height_mm: Number(logoHeightSlider.value),
            receipt_width_cm: paperWidthCm,
            receipt_margin_mm: Number(marginSideSlider.value),
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

    logoPositionSlider.value = data.logo_position_pct ?? 50;
    const v = Number(logoPositionSlider.value);
    logoPositionValue.textContent = v === 0 ? 'Left' : v === 100 ? 'Right' : v === 50 ? 'Center' : `${v}%`;

    logoWidthSlider.value = data.logo_width_mm ?? 32;
    logoWidthValue.textContent = `${logoWidthSlider.value}mm`;

    logoRatioLock.checked = data.logo_ratio_locked ?? true;
    logoHeightField.style.display = logoRatioLock.checked ? 'none' : 'block';
    logoHeightSlider.value = data.logo_height_mm ?? 20;
    logoHeightValue.textContent = `${logoHeightSlider.value}mm`;

    paperWidthCm = Number(data.receipt_width_cm ?? 5.8);
    paperWidthSegmented.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', Math.abs(Number(b.dataset.cm) - paperWidthCm) < 0.05);
    });

    marginSideSlider.value = data.receipt_margin_mm ?? 3;
    marginSideValue.textContent = `${marginSideSlider.value}mm`;
    lineSpacingSlider.value = data.receipt_line_spacing ?? 1.2;
    lineSpacingValue.textContent = Number(lineSpacingSlider.value).toFixed(2);
    baseFontSlider.value = data.receipt_base_font_px ?? 11;
    baseFontValue.textContent = `${baseFontSlider.value}px`;

    templatePicker.set(data.active_template);
    renderPreview();
}

(async function init() {
    const profile = await FuelDeskAuth.requireSession('SUPER_ADMIN');
    if (!profile) return;

    const options = window.BillTemplates.list().map((t) => ({ value: t.id, label: t.label }));
    TEMPLATE_OPTIONS_FALLBACK.push(...options);

    await loadConfig();
    window.PageLoader?.ready();
})();

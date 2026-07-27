const TEMPLATE_OPTIONS_FALLBACK = []; // populated from window.BillTemplates.list()

const whoami = document.getElementById('whoami');

const stationNameInput = document.getElementById('station-name');
const stationAddressInput = document.getElementById('station-address');
const stationPhoneInput = document.getElementById('station-phone');
const stationGstinInput = document.getElementById('station-gstin');
const receiptFooterInput = document.getElementById('receipt-footer');

const logoPreview = document.getElementById('logo-preview');
const logoUploadBtn = document.getElementById('logo-upload-btn');
const logoRemoveBtn = document.getElementById('logo-remove-btn');
const logoFileInput = document.getElementById('logo-file-input');
const logoWidthSlider = document.getElementById('logo-width');
const logoWidthValue = document.getElementById('logo-width-value');
const logoMarginTopSlider = document.getElementById('logo-margin-top');
const logoMarginTopValue = document.getElementById('logo-margin-top-value');
const logoMarginBottomSlider = document.getElementById('logo-margin-bottom');
const logoMarginBottomValue = document.getElementById('logo-margin-bottom-value');
const logoAlignSegmented = document.getElementById('logo-align-segmented');
const previewReceiptBtn = document.getElementById('preview-receipt-btn');

const fpIdInput = document.getElementById('fp-id');
const nozzleNoInput = document.getElementById('nozzle-no');
const receiptWidthInput = document.getElementById('receipt-width');

const msRateInput = document.getElementById('ms-rate');
const msDensityInput = document.getElementById('ms-density');
const hsdRateInput = document.getElementById('hsd-rate');
const hsdDensityInput = document.getElementById('hsd-density');
const premiumRateInput = document.getElementById('premium-rate');
const premiumDensityInput = document.getElementById('premium-density');

const saveConfigBtn = document.getElementById('save-config-btn');

let currentLogoUrl = null;
let currentLogoAlign = 'CENTER';

const templatePicker = makePickerField({
    buttonEl: document.getElementById('template-picker-btn'),
    labelEl: document.getElementById('template-picker-label'),
    title: 'Receipt Template',
    options: TEMPLATE_OPTIONS_FALLBACK,
    initialValue: 'BPCL_TOKHEIM',
});

wireCommandsInfoButton(document.getElementById('name-info-btn'), 'Station Name');
wireCommandsInfoButton(document.getElementById('address-info-btn'), 'Station Address');
wireCommandsInfoButton(document.getElementById('footer-info-btn'), 'Receipt Footer');

document.getElementById('staff-nav-btn').addEventListener('click', () => window.location.href = '/staff.html');

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

// Sends only the given fields — /api/config only touches keys present in
// the body, so this is safe to call for a quick partial save (e.g. just
// the logo) without clobbering the rest of daily_config.
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

function renderLogoPreview(url) {
    logoPreview.innerHTML = url ? `<img src="${url}" alt="Station logo">` : 'No logo';
    logoRemoveBtn.style.display = url ? 'inline-block' : 'none';
}

logoUploadBtn.addEventListener('click', () => logoFileInput.click());

logoFileInput.addEventListener('change', async () => {
    const file = logoFileInput.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        Toast.show('Please choose an image file.', { error: true });
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        Toast.show('Image is too large — please use one under 2MB.', { error: true });
        return;
    }

    logoUploadBtn.disabled = true;
    logoUploadBtn.textContent = 'Uploading...';

    try {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const path = `logo.${ext}`;

        const { error: uploadError } = await window.sb.storage
            .from('station-assets')
            .upload(path, file, { upsert: true, cacheControl: '0' });
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = window.sb.storage.from('station-assets').getPublicUrl(path);
        // Cache-bust so the new logo shows immediately, since we upsert the same path.
        const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;

        currentLogoUrl = url;
        renderLogoPreview(url);
        await patchConfig({ logo_url: url });
        Toast.show('Logo updated.');
    } catch (err) {
        Toast.show('Could not upload logo: ' + err.message, { error: true, duration: 5000 });
    } finally {
        logoUploadBtn.disabled = false;
        logoUploadBtn.textContent = 'Upload Photo';
        logoFileInput.value = '';
    }
});

logoRemoveBtn.addEventListener('click', async () => {
    try {
        currentLogoUrl = null;
        renderLogoPreview(null);
        await patchConfig({ logo_url: null });
        Toast.show('Logo removed.');
    } catch (err) {
        Toast.show('Could not remove logo: ' + err.message, { error: true });
    }
});

// Live-updating sliders that persist as soon as you let go (no need to
// hit "Save Settings" just to see/keep a logo tweak).
function wireLiveRange(slider, valueEl, unit, configKey) {
    slider.addEventListener('input', () => { valueEl.textContent = `${slider.value}${unit}`; });
    slider.addEventListener('change', async () => {
        try {
            await patchConfig({ [configKey]: Number(slider.value) });
        } catch (err) {
            Toast.show('Could not save: ' + err.message, { error: true });
        }
    });
}
wireLiveRange(logoWidthSlider, logoWidthValue, 'mm', 'logo_width_mm');
wireLiveRange(logoMarginTopSlider, logoMarginTopValue, 'mm', 'logo_margin_top_mm');
wireLiveRange(logoMarginBottomSlider, logoMarginBottomValue, 'mm', 'logo_margin_bottom_mm');

logoAlignSegmented.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
        currentLogoAlign = btn.dataset.value;
        logoAlignSegmented.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        try {
            await patchConfig({ logo_align: currentLogoAlign });
        } catch (err) {
            Toast.show('Could not save alignment: ' + err.message, { error: true });
        }
    });
});

document.querySelectorAll('.chip-btn[data-cm]').forEach((btn) => {
    btn.addEventListener('click', () => { receiptWidthInput.value = btn.dataset.cm; });
});

async function loadConfig() {
    const { data, error } = await window.sb.from('daily_config').select('*').eq('id', 1).single();
    if (error || !data) {
        Toast.show('Could not load settings.', { error: true, duration: 5000 });
        return;
    }

    stationNameInput.value = data.station_name || '';
    stationAddressInput.value = data.station_address || '';
    stationPhoneInput.value = data.station_phone || '';
    stationGstinInput.value = data.station_gstin || '';
    receiptFooterInput.value = data.receipt_footer || '';

    currentLogoUrl = data.logo_url || null;
    renderLogoPreview(currentLogoUrl);

    logoWidthSlider.value = data.logo_width_mm ?? 32;
    logoWidthValue.textContent = `${logoWidthSlider.value}mm`;
    logoMarginTopSlider.value = data.logo_margin_top_mm ?? 0;
    logoMarginTopValue.textContent = `${logoMarginTopSlider.value}mm`;
    logoMarginBottomSlider.value = data.logo_margin_bottom_mm ?? 4;
    logoMarginBottomValue.textContent = `${logoMarginBottomSlider.value}mm`;

    currentLogoAlign = data.logo_align || 'CENTER';
    logoAlignSegmented.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === currentLogoAlign));

    fpIdInput.value = data.fp_id || '1';
    nozzleNoInput.value = data.nozzle_no || '1';
    receiptWidthInput.value = data.receipt_width_cm ?? 5.8;

    msRateInput.value = data.ms_rate;
    msDensityInput.value = data.ms_density;
    hsdRateInput.value = data.hsd_rate;
    hsdDensityInput.value = data.hsd_density;
    premiumRateInput.value = data.premium_rate;
    premiumDensityInput.value = data.premium_density;

    templatePicker.set(data.active_template);

    document.querySelectorAll('.settings-block').forEach((el) => el.classList.add('fade-in'));
}

saveConfigBtn.addEventListener('click', async () => {
    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = 'Saving...';

    try {
        await patchConfig({
            station_name: stationNameInput.value.trim(),
            station_address: stationAddressInput.value, // keep newlines/commands as typed
            station_phone: stationPhoneInput.value.trim(),
            station_gstin: stationGstinInput.value.trim(),
            receipt_footer: receiptFooterInput.value,
            logo_width_mm: Number(logoWidthSlider.value),
            logo_margin_top_mm: Number(logoMarginTopSlider.value),
            logo_margin_bottom_mm: Number(logoMarginBottomSlider.value),
            logo_align: currentLogoAlign,
            fp_id: fpIdInput.value.trim() || '1',
            nozzle_no: nozzleNoInput.value.trim() || '1',
            receipt_width_cm: parseFloat(receiptWidthInput.value) || 5.8,
            ms_rate: parseFloat(msRateInput.value),
            ms_density: parseFloat(msDensityInput.value),
            hsd_rate: parseFloat(hsdRateInput.value),
            hsd_density: parseFloat(hsdDensityInput.value),
            premium_rate: parseFloat(premiumRateInput.value),
            premium_density: parseFloat(premiumDensityInput.value),
            active_template: templatePicker.get(),
        });
        Toast.show('Settings saved.');
    } catch (err) {
        Toast.show(err.message, { error: true, duration: 5000 });
    } finally {
        saveConfigBtn.disabled = false;
        saveConfigBtn.textContent = 'Save Settings';
    }
});

previewReceiptBtn.addEventListener('click', () => {
    const template = window.BillTemplates.get(templatePicker.get());
    applyReceiptWidth(parseFloat(receiptWidthInput.value) || 5.8);
    document.getElementById('thermal-receipt').innerHTML = template.render({
        station: {
            name: stationNameInput.value.trim() || 'Your Service Station',
            address: stationAddressInput.value,
            phone: stationPhoneInput.value.trim(),
            gstin: stationGstinInput.value.trim(),
            logoUrl: currentLogoUrl,
            logoWidthMm: Number(logoWidthSlider.value),
            logoMarginTopMm: Number(logoMarginTopSlider.value),
            logoMarginBottomMm: Number(logoMarginBottomSlider.value),
            logoAlign: currentLogoAlign,
        },
        footer: receiptFooterInput.value || '<center>Thank You! Please Visit Again..</center>',
        receiptNo: 'G0000',
        transactionId: '0000000000000001',
        billDateTimeIso: new Date().toISOString(),
        fpId: fpIdInput.value.trim() || '1',
        nozzleNo: nozzleNoInput.value.trim() || '1',
        product: 'MS',
        productLabel: 'MS (Petrol)',
        density: msDensityInput.value || '755.0',
        presetTypeLabel: 'Volume',
        rate: Number(msRateInput.value || 0).toFixed(2),
        volume: '10.00',
        amount: (Number(msRateInput.value || 0) * 10).toFixed(2),
        dateStr: '01/01/26',
        timeStr: '12:00',
        printDateStr: '01/01/26',
        printTimeStr: '12:00',
        attendantUsername: window.currentProfile.username,
        vehicleNo: 'MH12AB1234',
        mobileNo: '9876543210',
    });
    window.print();
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
    if (!profile) return;

    whoami.textContent = `Logged in as ${profile.username}`;

    // The template picker was created with an empty option list (templates
    // register themselves as their <script> tags load); fill it in now.
    const options = window.BillTemplates.list().map((t) => ({ value: t.id, label: t.label }));
    TEMPLATE_OPTIONS_FALLBACK.push(...options);

    FuelDeskAuth.renderPanelSwitcher('admin');
    await loadConfig();
})();

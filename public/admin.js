const TEMPLATE_OPTIONS_FALLBACK = []; // populated from window.BillTemplates.list()
const PLAN_OPTIONS = [
    { value: '1M', label: '1 Month — ₹250' },
    { value: '6M', label: '6 Months — ₹1350' },
    { value: '12M', label: '12 Months — ₹2500' },
];

const whoami = document.getElementById('whoami');
const roleBadge = document.getElementById('role-badge');
const superAdminSection = document.getElementById('super-admin-section');

const stationNameInput = document.getElementById('station-name');
const stationAddressInput = document.getElementById('station-address');
const stationPhoneInput = document.getElementById('station-phone');
const receiptFooterInput = document.getElementById('receipt-footer');

const logoPreview = document.getElementById('logo-preview');
const logoUploadBtn = document.getElementById('logo-upload-btn');
const logoRemoveBtn = document.getElementById('logo-remove-btn');
const logoFileInput = document.getElementById('logo-file-input');
const previewReceiptBtn = document.getElementById('preview-receipt-btn');

const subscriptionExpiryInput = document.getElementById('subscription-expiry');
const saveSubscriptionBtn = document.getElementById('save-subscription-btn');

const msRateInput = document.getElementById('ms-rate');
const msDensityInput = document.getElementById('ms-density');
const hsdRateInput = document.getElementById('hsd-rate');
const hsdDensityInput = document.getElementById('hsd-density');
const premiumRateInput = document.getElementById('premium-rate');
const premiumDensityInput = document.getElementById('premium-density');

const saveConfigBtn = document.getElementById('save-config-btn');

let currentLogoUrl = null;
let currentConfig = null; // full loaded row — logo position/size/lock, etc. now live in Format, but Preview here needs to read them

const templatePicker = makePickerField({
    buttonEl: document.getElementById('template-picker-btn'),
    labelEl: document.getElementById('template-picker-label'),
    title: 'Receipt Template',
    options: TEMPLATE_OPTIONS_FALLBACK,
    initialValue: 'BPCL_TOKHEIM',
});

const planPicker = makePickerField({
    buttonEl: document.getElementById('plan-picker-btn'),
    labelEl: document.getElementById('plan-picker-label'),
    title: 'Hosting Plan',
    options: PLAN_OPTIONS,
    initialValue: '1M',
});

wireCommandsInfoButton(document.getElementById('name-info-btn'), 'Station Name');
wireCommandsInfoButton(document.getElementById('address-info-btn'), 'Station Address');
wireCommandsInfoButton(document.getElementById('footer-info-btn'), 'Receipt Footer');

document.getElementById('staff-nav-btn').addEventListener('click', () => window.location.href = '/staff.html');
document.getElementById('format-panel-btn').addEventListener('click', () => window.location.href = '/format.html');
document.getElementById('integrations-btn').addEventListener('click', () => window.location.href = '/integrations.html');

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

// Sends only the given fields — /api/config only touches keys present in
// the body (and only ones the caller's role is allowed to touch), so
// this is safe for a quick partial save.
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
        Toast.show('Logo updated. Adjust its size/position in the Format panel.');
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

async function loadConfig() {
    const { data, error } = await window.sb.from('daily_config').select('*').eq('id', 1).single();
    if (error || !data) {
        Toast.show('Could not load settings.', { error: true, duration: 5000 });
        return;
    }
    currentConfig = data;

    stationNameInput.value = data.station_name || '';
    stationAddressInput.value = data.station_address || '';
    stationPhoneInput.value = data.station_phone || '';
    receiptFooterInput.value = data.receipt_footer || '';

    currentLogoUrl = data.logo_url || null;
    renderLogoPreview(currentLogoUrl);

    planPicker.set(data.subscription_plan || '1M');
    subscriptionExpiryInput.value = data.subscription_expiry_date || '';

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
            receipt_footer: receiptFooterInput.value,
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

saveSubscriptionBtn.addEventListener('click', async () => {
    saveSubscriptionBtn.disabled = true;
    saveSubscriptionBtn.textContent = 'Saving...';
    try {
        await patchConfig({
            subscription_plan: planPicker.get(),
            subscription_expiry_date: subscriptionExpiryInput.value || null,
        });
        Toast.show('Subscription info saved.');
    } catch (err) {
        Toast.show(err.message, { error: true, duration: 5000 });
    } finally {
        saveSubscriptionBtn.disabled = false;
        saveSubscriptionBtn.textContent = 'Save Subscription Info';
    }
});

previewReceiptBtn.addEventListener('click', async () => {
    const template = window.BillTemplates.get(templatePicker.get());
    applyReceiptWidth(currentConfig?.receipt_width_cm ?? 5.8);
    const rendered = template.render({
        station: {
            name: stationNameInput.value.trim() || 'Your Service Station',
            address: stationAddressInput.value,
            phone: stationPhoneInput.value.trim(),
            logoUrl: currentLogoUrl,
            logoWidthMm: currentConfig?.logo_width_mm,
            logoPositionPct: currentConfig?.logo_position_pct,
            logoRatioLocked: currentConfig?.logo_ratio_locked,
            logoHeightMm: currentConfig?.logo_height_mm,
        },
        footer: receiptFooterInput.value || '<center>Thank You! Please Visit Again..</center>',
        receiptNo: 'G0000',
        transactionId: '0000000000000001',
        billDateTimeIso: new Date().toISOString(),
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
        attendantUsername: FuelDeskAuth.displayName(window.currentProfile),
        vehicleNo: 'MH12AB1234',
        mobileNo: '9876543210',
    });

    const receiptEl = document.getElementById('thermal-receipt');
    receiptEl.innerHTML = window.BillTemplates.wrapForOutput(rendered, {
        marginMm: currentConfig?.receipt_margin_mm,
        lineSpacing: currentConfig?.receipt_line_spacing,
        baseFontPx: currentConfig?.receipt_base_font_px,
    });
    await waitForReceiptImages(receiptEl);
    window.print();
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession(['SUPER_ADMIN', 'ADMIN_STAFF']);
    if (!profile) return;

    whoami.textContent = `Logged in as ${FuelDeskAuth.displayName(profile)}`;
    roleBadge.textContent = FuelDeskAuth.roleLabel(profile.role);

    if (profile.role !== 'SUPER_ADMIN') {
        superAdminSection.style.display = 'none';
    }

    // The template picker was created with an empty option list (templates
    // register themselves as their <script> tags load); fill it in now.
    const options = window.BillTemplates.list().map((t) => ({ value: t.id, label: t.label }));
    TEMPLATE_OPTIONS_FALLBACK.push(...options);

    FuelDeskAuth.renderPanelSwitcher('admin');
    await loadConfig();
})();

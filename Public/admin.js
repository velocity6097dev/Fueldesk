const TEMPLATE_OPTIONS_FALLBACK = []; // populated from window.BillTemplates.list()
const ROLE_OPTIONS = [
    { value: 'STATION_STAFF', label: 'Station Staff' },
    { value: 'ADMIN_STAFF', label: 'Admin Staff' },
];

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
const previewReceiptBtn = document.getElementById('preview-receipt-btn');

const msRateInput = document.getElementById('ms-rate');
const msDensityInput = document.getElementById('ms-density');
const hsdRateInput = document.getElementById('hsd-rate');
const hsdDensityInput = document.getElementById('hsd-density');
const premiumRateInput = document.getElementById('premium-rate');
const premiumDensityInput = document.getElementById('premium-density');

const saveConfigBtn = document.getElementById('save-config-btn');

const staffUsernameInput = document.getElementById('new-staff-username');
const staffPinInput = document.getElementById('new-staff-pin');
const addStaffBtn = document.getElementById('add-staff-btn');
const staffListEl = document.getElementById('staff-list');

let currentLogoUrl = null;

const templatePicker = makePickerField({
    buttonEl: document.getElementById('template-picker-btn'),
    labelEl: document.getElementById('template-picker-label'),
    title: 'Receipt Template',
    options: TEMPLATE_OPTIONS_FALLBACK,
    initialValue: 'BPCL_TOKHEIM',
});

const rolePicker = makePickerField({
    buttonEl: document.getElementById('role-picker-btn'),
    labelEl: document.getElementById('role-picker-label'),
    title: 'Staff Role',
    options: ROLE_OPTIONS,
    initialValue: 'STATION_STAFF',
});

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

// Sends only the given fields — /api/config only touches keys present in
// the body, so this is safe to call for a quick logo-only save without
// clobbering the rest of daily_config.
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

logoWidthSlider.addEventListener('input', () => {
    logoWidthValue.textContent = `${logoWidthSlider.value}mm`;
});
logoWidthSlider.addEventListener('change', async () => {
    try {
        await patchConfig({ logo_width_mm: Number(logoWidthSlider.value) });
    } catch (err) {
        Toast.show('Could not save logo size: ' + err.message, { error: true });
    }
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
    logoWidthSlider.value = data.logo_width_mm || 32;
    logoWidthValue.textContent = `${logoWidthSlider.value}mm`;

    msRateInput.value = data.ms_rate;
    msDensityInput.value = data.ms_density;
    hsdRateInput.value = data.hsd_rate;
    hsdDensityInput.value = data.hsd_density;
    premiumRateInput.value = data.premium_rate;
    premiumDensityInput.value = data.premium_density;

    templatePicker.set(data.active_template);
}

saveConfigBtn.addEventListener('click', async () => {
    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = 'Saving...';

    try {
        await patchConfig({
            station_name: stationNameInput.value.trim(),
            station_address: stationAddressInput.value, // keep newlines as typed
            station_phone: stationPhoneInput.value.trim(),
            station_gstin: stationGstinInput.value.trim(),
            receipt_footer: receiptFooterInput.value,
            logo_width_mm: Number(logoWidthSlider.value),
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
    document.getElementById('thermal-receipt').innerHTML = template.render({
        station: {
            name: stationNameInput.value.trim() || 'Your Service Station',
            address: stationAddressInput.value,
            phone: stationPhoneInput.value.trim(),
            gstin: stationGstinInput.value.trim(),
            logoUrl: currentLogoUrl,
            logoWidthMm: Number(logoWidthSlider.value),
        },
        footer: receiptFooterInput.value || 'Thank You! Please Visit Again..',
        receiptNo: 'G0000',
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

function staffRowHtml(member, currentUserId) {
    const roleTag = member.role === 'ADMIN_STAFF'
        ? '<span class="tag tag-admin">Admin</span>'
        : '<span class="tag tag-staff">Staff</span>';
    const inactiveTag = member.is_active ? '' : '<span class="tag tag-inactive">Inactive</span>';
    const isSelf = member.id === currentUserId;

    return `
        <div class="manage-item staff-item" data-id="${member.id}">
            <div class="staff-main">
                <div class="staff-name">${member.username}${roleTag}${inactiveTag}</div>
                <div class="staff-meta">Added ${new Date(member.created_at).toLocaleDateString()}</div>
            </div>
            <div class="staff-actions">
                ${isSelf ? '' : `
                    <button type="button" class="btn btn-ghost btn-xs toggle-active-btn" data-active="${member.is_active}">
                        ${member.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" class="btn btn-danger-text btn-xs delete-staff-btn">Delete</button>
                `}
            </div>
        </div>
    `;
}

async function loadStaff() {
    staffListEl.innerHTML = '<div class="loading-veil">Loading staff...</div>';
    try {
        const res = await fetch('/api/staff', { headers: await authHeaders() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load staff');

        if (!body.staff.length) {
            staffListEl.innerHTML = '<div class="empty-state">No staff yet.</div>';
            return;
        }

        staffListEl.innerHTML = body.staff.map((m) => staffRowHtml(m, window.currentSession.user.id)).join('');

        staffListEl.querySelectorAll('.toggle-active-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('.staff-item');
                const isActive = e.target.dataset.active === 'true';
                await updateStaff(row.dataset.id, { is_active: !isActive });
            });
        });
        staffListEl.querySelectorAll('.delete-staff-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('.staff-item');
                if (!confirm('Permanently delete this staff account? This cannot be undone.')) return;
                await deleteStaff(row.dataset.id);
            });
        });
    } catch (err) {
        staffListEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

async function updateStaff(id, updates) {
    try {
        const res = await fetch(`/api/staff/${id}`, {
            method: 'PATCH',
            headers: await authHeaders(),
            body: JSON.stringify(updates),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Update failed');
        await loadStaff();
    } catch (err) {
        Toast.show(err.message, { error: true });
    }
}

async function deleteStaff(id) {
    try {
        const res = await fetch(`/api/staff/${id}`, { method: 'DELETE', headers: await authHeaders() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Delete failed');
        await loadStaff();
    } catch (err) {
        Toast.show(err.message, { error: true });
    }
}

addStaffBtn.addEventListener('click', async () => {
    const username = staffUsernameInput.value.trim();
    const password = staffPinInput.value;
    const role = rolePicker.get();

    if (!username) return Toast.show('Enter a username.', { error: true });
    if (!password || password.length < 6) return Toast.show('Password/PIN must be at least 6 characters.', { error: true });

    addStaffBtn.disabled = true;
    addStaffBtn.textContent = 'Creating...';

    try {
        const res = await fetch('/api/staff', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ username, password, role }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not create staff');

        staffUsernameInput.value = '';
        staffPinInput.value = '';
        Toast.show(`${username} added.`);
        await loadStaff();
    } catch (err) {
        Toast.show(err.message, { error: true, duration: 5000 });
    } finally {
        addStaffBtn.disabled = false;
        addStaffBtn.textContent = 'Create Staff';
    }
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
    if (!profile) return;

    whoami.textContent = `Logged in as ${profile.username}`;

    // The template picker was created with an empty option list (templates
    // register themselves as their <script> tags load); fill it in now.
    templatePickerOptionsReady();

    FuelDeskAuth.renderPanelSwitcher('admin');
    await loadConfig();
    await loadStaff();
})();

function templatePickerOptionsReady() {
    const options = window.BillTemplates.list().map((t) => ({ value: t.id, label: t.label }));
    TEMPLATE_OPTIONS_FALLBACK.push(...options);
}

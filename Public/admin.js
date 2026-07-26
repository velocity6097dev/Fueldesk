const whoami = document.getElementById('whoami');

const stationNameInput = document.getElementById('station-name');
const stationAddressInput = document.getElementById('station-address');
const stationPhoneInput = document.getElementById('station-phone');
const stationGstinInput = document.getElementById('station-gstin');

const msRateInput = document.getElementById('ms-rate');
const msDensityInput = document.getElementById('ms-density');
const hsdRateInput = document.getElementById('hsd-rate');
const hsdDensityInput = document.getElementById('hsd-density');
const premiumRateInput = document.getElementById('premium-rate');
const premiumDensityInput = document.getElementById('premium-density');
const templateSelect = document.getElementById('active-template');

const saveConfigBtn = document.getElementById('save-config-btn');
const configAlert = document.getElementById('config-alert');
const configError = document.getElementById('config-error');

const staffUsernameInput = document.getElementById('new-staff-username');
const staffPinInput = document.getElementById('new-staff-pin');
const staffRoleSelect = document.getElementById('new-staff-role');
const addStaffBtn = document.getElementById('add-staff-btn');
const staffAlert = document.getElementById('staff-alert');
const staffError = document.getElementById('staff-error');
const staffListEl = document.getElementById('staff-list');

function flash(el, ms = 2500) {
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), ms);
}
function showError(el, message) {
    el.textContent = message;
    el.classList.add('show');
}
function hideError(el) {
    el.classList.remove('show');
}

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

function populateTemplateOptions(selected) {
    templateSelect.innerHTML = '';
    window.BillTemplates.list().forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.label;
        if (t.id === selected) opt.selected = true;
        templateSelect.appendChild(opt);
    });
}

async function loadConfig() {
    const { data, error } = await window.sb.from('daily_config').select('*').eq('id', 1).single();
    if (error || !data) {
        showError(configError, 'Could not load settings.');
        return;
    }
    stationNameInput.value = data.station_name || '';
    stationAddressInput.value = data.station_address || '';
    stationPhoneInput.value = data.station_phone || '';
    stationGstinInput.value = data.station_gstin || '';

    msRateInput.value = data.ms_rate;
    msDensityInput.value = data.ms_density;
    hsdRateInput.value = data.hsd_rate;
    hsdDensityInput.value = data.hsd_density;
    premiumRateInput.value = data.premium_rate;
    premiumDensityInput.value = data.premium_density;

    populateTemplateOptions(data.active_template);
}

saveConfigBtn.addEventListener('click', async () => {
    hideError(configError);
    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = 'Saving...';

    try {
        const res = await fetch('/api/config', {
            method: 'PUT',
            headers: await authHeaders(),
            body: JSON.stringify({
                station_name: stationNameInput.value.trim(),
                station_address: stationAddressInput.value.trim(),
                station_phone: stationPhoneInput.value.trim(),
                station_gstin: stationGstinInput.value.trim(),
                ms_rate: parseFloat(msRateInput.value),
                ms_density: parseFloat(msDensityInput.value),
                hsd_rate: parseFloat(hsdRateInput.value),
                hsd_density: parseFloat(hsdDensityInput.value),
                premium_rate: parseFloat(premiumRateInput.value),
                premium_density: parseFloat(premiumDensityInput.value),
                active_template: templateSelect.value,
            }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Save failed');
        flash(configAlert);
    } catch (err) {
        showError(configError, err.message);
    } finally {
        saveConfigBtn.disabled = false;
        saveConfigBtn.textContent = 'Save Settings';
    }
});

function staffRowHtml(member, currentUserId) {
    const roleBadge = member.role === 'ADMIN_STAFF'
        ? '<span class="badge badge-admin">Admin</span>'
        : '<span class="badge badge-staff">Staff</span>';
    const inactiveBadge = member.is_active ? '' : '<span class="badge badge-inactive">Inactive</span>';
    const isSelf = member.id === currentUserId;

    return `
        <div class="staff-row" data-id="${member.id}">
            <div class="staff-info">
                <div class="name">${member.username}${roleBadge}${inactiveBadge}</div>
                <div class="meta">Added ${new Date(member.created_at).toLocaleDateString()}</div>
            </div>
            <div class="staff-actions">
                ${isSelf ? '' : `
                    <button class="btn btn-ghost btn-sm toggle-active-btn" data-active="${member.is_active}">
                        ${member.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-danger btn-sm delete-staff-btn">Delete</button>
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
                const row = e.target.closest('.staff-row');
                const isActive = e.target.dataset.active === 'true';
                await updateStaff(row.dataset.id, { is_active: !isActive });
            });
        });
        staffListEl.querySelectorAll('.delete-staff-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('.staff-row');
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
        alert(err.message);
    }
}

async function deleteStaff(id) {
    try {
        const res = await fetch(`/api/staff/${id}`, {
            method: 'DELETE',
            headers: await authHeaders(),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Delete failed');
        await loadStaff();
    } catch (err) {
        alert(err.message);
    }
}

addStaffBtn.addEventListener('click', async () => {
    hideError(staffError);

    const username = staffUsernameInput.value.trim();
    const password = staffPinInput.value;
    const role = staffRoleSelect.value;

    if (!username) return showError(staffError, 'Enter a username.');
    if (!password || password.length < 6) return showError(staffError, 'Password/PIN must be at least 6 characters.');

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
        flash(staffAlert);
        await loadStaff();
    } catch (err) {
        showError(staffError, err.message);
    } finally {
        addStaffBtn.disabled = false;
        addStaffBtn.textContent = 'Create Staff';
    }
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
    if (!profile) return;

    whoami.textContent = `Logged in as ${profile.username}`;
    await loadConfig();
    await loadStaff();
})();

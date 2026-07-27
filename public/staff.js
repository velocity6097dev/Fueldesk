const ROLE_OPTIONS = [
    { value: 'STATION_STAFF', label: 'Station Staff' },
    { value: 'ADMIN_STAFF', label: 'Admin Staff' },
];

const whoami = document.getElementById('whoami');
const staffUsernameInput = document.getElementById('new-staff-username');
const staffPinInput = document.getElementById('new-staff-pin');
const addStaffBtn = document.getElementById('add-staff-btn');
const staffListEl = document.getElementById('staff-list');

const rolePicker = makePickerField({
    buttonEl: document.getElementById('role-picker-btn'),
    labelEl: document.getElementById('role-picker-label'),
    title: 'Staff Role',
    options: ROLE_OPTIONS,
    initialValue: 'STATION_STAFF',
});

document.getElementById('back-btn').addEventListener('click', () => window.location.href = '/admin.html');

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

function staffRowHtml(member, currentUserId) {
    const roleTag = member.role === 'ADMIN_STAFF'
        ? '<span class="tag tag-admin">Admin</span>'
        : '<span class="tag tag-staff">Staff</span>';
    const inactiveTag = member.is_active ? '' : '<span class="tag tag-inactive">Inactive</span>';
    const isSelf = member.id === currentUserId;

    return `
        <div class="manage-item staff-item fade-in" data-id="${member.id}">
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

function staffSkeletonHtml() {
    return `
        <div class="skel-row"><div class="skel skel-line w-60"></div></div>
        <div class="skel-row"><div class="skel skel-line w-40"></div></div>
        <div class="skel-row"><div class="skel skel-line w-80"></div></div>
    `;
}

async function loadStaff() {
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
        staffListEl.innerHTML = staffSkeletonHtml();
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
        staffListEl.innerHTML = staffSkeletonHtml();
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
        staffListEl.innerHTML = staffSkeletonHtml();
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
    FuelDeskAuth.renderPanelSwitcher('admin'); // Staff lives under the Settings tab conceptually
    await loadStaff();
})();

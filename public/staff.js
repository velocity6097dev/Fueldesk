const ROLE_OPTIONS_BY_RANK = {
    SUPER_ADMIN: [
        { value: 'STATION_STAFF', label: 'Station Staff' },
        { value: 'ADMIN_STAFF', label: 'Admin Staff' },
        { value: 'SUPER_ADMIN', label: 'Super Admin' },
    ],
    ADMIN_STAFF: [
        { value: 'STATION_STAFF', label: 'Station Staff' },
    ],
};

const ROLE_TAGS = {
    SUPER_ADMIN: '<span class="tag tag-admin">Super Admin</span>',
    ADMIN_STAFF: '<span class="tag tag-admin">Admin</span>',
    STATION_STAFF: '<span class="tag tag-staff">Staff</span>',
};

const whoami = document.getElementById('whoami');
const staffDisplayNameInput = document.getElementById('new-staff-display-name');
const staffUsernameInput = document.getElementById('new-staff-username');
const staffPinInput = document.getElementById('new-staff-pin');
const addStaffBtn = document.getElementById('add-staff-btn');
const staffListEl = document.getElementById('staff-list');

let rolePicker = null;

document.getElementById('back-btn').addEventListener('click', () => window.location.href = '/admin.html');

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

function staffRowHtml(member, currentUserId) {
    const roleTag = ROLE_TAGS[member.role] || '';
    const inactiveTag = member.is_active ? '' : '<span class="tag tag-inactive">Inactive</span>';
    const isSelf = member.id === currentUserId;
    const name = member.display_name || member.username;

    return `
        <div class="manage-item staff-item fade-in" data-id="${member.id}">
            <div class="staff-main">
                <div class="staff-name">${name}${roleTag}${inactiveTag}</div>
                <div class="staff-meta">@${member.username} · Added ${new Date(member.created_at).toLocaleDateString()}</div>
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
                const name = row.querySelector('.staff-name')?.firstChild?.textContent?.trim() || 'this staff member';
                const ok = await window.ConfirmDialog.show({
                    title: isActive ? 'Deactivate Staff?' : 'Activate Staff?',
                    message: isActive
                        ? `${name} will immediately lose the ability to log in. You can reactivate them anytime.`
                        : `${name} will be able to log in again.`,
                    confirmLabel: isActive ? 'Deactivate' : 'Activate',
                    danger: isActive,
                });
                if (!ok) return;
                await updateStaff(row.dataset.id, { is_active: !isActive });
            });
        });
        staffListEl.querySelectorAll('.delete-staff-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('.staff-item');
                const name = row.querySelector('.staff-name')?.firstChild?.textContent?.trim() || 'this staff account';
                const ok = await window.ConfirmDialog.show({
                    title: 'Delete Staff Account?',
                    message: `Permanently delete ${name}? This cannot be undone.`,
                    confirmLabel: 'Delete',
                    danger: true,
                });
                if (!ok) return;
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
    const displayName = staffDisplayNameInput.value.trim();
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
            body: JSON.stringify({ display_name: displayName, username, password, role }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not create staff');

        staffDisplayNameInput.value = '';
        staffUsernameInput.value = '';
        staffPinInput.value = '';
        Toast.show(`${displayName || username} added.`);
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
    const profile = await FuelDeskAuth.requireSession(['SUPER_ADMIN', 'ADMIN_STAFF']);
    if (!profile) return;

    whoami.textContent = `Logged in as ${FuelDeskAuth.displayName(profile)}`;

    const roleOptions = ROLE_OPTIONS_BY_RANK[profile.role] || ROLE_OPTIONS_BY_RANK.ADMIN_STAFF;
    rolePicker = makeNativeSelectField({
        selectEl: document.getElementById('role-picker-btn'),
        options: roleOptions,
        initialValue: 'STATION_STAFF',
    });

    FuelDeskAuth.renderPanelSwitcher('admin'); // Staff lives under the Settings tab conceptually
    await loadStaff();
    window.PageLoader?.ready();
})();

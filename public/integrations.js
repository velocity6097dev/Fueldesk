const whoami = document.getElementById('whoami');
const statusTag = document.getElementById('discord-status-tag');
const webhookUrlInput = document.getElementById('webhook-url');
const enabledCheckbox = document.getElementById('discord-enabled');
const notifyBillCreatedCheckbox = document.getElementById('notify-bill-created');
const notifyWeeklyCheckbox = document.getElementById('notify-weekly');
const notifyMonthlyCheckbox = document.getElementById('notify-monthly');
const saveBtn = document.getElementById('save-discord-btn');
const testBtn = document.getElementById('test-discord-btn');

document.getElementById('back-btn').addEventListener('click', () => window.location.href = '/admin.html');

async function authHeaders() {
    const { data: { session } } = await window.sb.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

async function loadStatus() {
    try {
        const res = await fetch('/api/integrations/discord', { headers: await authHeaders() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load integration status');

        statusTag.textContent = body.configured ? 'Configured' : 'Not configured';
        statusTag.className = 'tag ' + (body.configured ? 'tag-admin' : 'tag-inactive');

        enabledCheckbox.checked = Boolean(body.enabled);
        notifyBillCreatedCheckbox.checked = Boolean(body.notifyBillCreated);
        notifyWeeklyCheckbox.checked = Boolean(body.notifyWeeklySummary);
        notifyMonthlyCheckbox.checked = Boolean(body.notifyMonthlySummary);
    } catch (err) {
        statusTag.textContent = 'Error';
        statusTag.className = 'tag tag-inactive';
        Toast.show(err.message, { error: true, duration: 5000 });
    }
}

saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
        const res = await fetch('/api/integrations/discord', {
            method: 'PUT',
            headers: await authHeaders(),
            body: JSON.stringify({
                webhookUrl: webhookUrlInput.value.trim() || undefined,
                enabled: enabledCheckbox.checked,
                notifyBillCreated: notifyBillCreatedCheckbox.checked,
                notifyWeeklySummary: notifyWeeklyCheckbox.checked,
                notifyMonthlySummary: notifyMonthlyCheckbox.checked,
            }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Save failed');

        webhookUrlInput.value = '';
        Toast.show('Integration settings saved.');
        await loadStatus();
    } catch (err) {
        Toast.show(err.message, { error: true, duration: 5000 });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
});

testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.textContent = 'Sending...';
    try {
        const res = await fetch('/api/integrations/discord/test', { method: 'POST', headers: await authHeaders() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not send test message');
        Toast.show('Test message sent — check your Discord channel.');
    } catch (err) {
        Toast.show(err.message, { error: true, duration: 5000 });
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Send Test Message';
    }
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession('SUPER_ADMIN');
    if (!profile) return;

    whoami.textContent = `Logged in as ${FuelDeskAuth.displayName(profile)}`;
    await loadStatus();
})();

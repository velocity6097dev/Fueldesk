(async function init() {
    const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
    if (!profile) return;

    document.getElementById('whoami').textContent = `Logged in as ${profile.username}`;
    document.getElementById('go-billing').addEventListener('click', () => window.location.href = '/billing.html');
    document.getElementById('go-admin').addEventListener('click', () => window.location.href = '/admin.html');
})();

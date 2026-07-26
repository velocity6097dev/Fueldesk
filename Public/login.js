const form = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const alertBox = document.getElementById('login-alert');

function showError(message) {
    alertBox.textContent = message;
    alertBox.classList.add('show');
}
function hideError() {
    alertBox.classList.remove('show');
}

// If a message was passed in via ?msg=... (e.g. "session expired"), show it.
const params = new URLSearchParams(window.location.search);
if (params.get('msg')) showError(params.get('msg'));

// If already logged in, skip straight to the right home screen.
(async () => {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session) {
        const { data: profile } = await window.sb.from('profiles').select('role').eq('id', session.user.id).single();
        if (profile?.role === 'ADMIN_STAFF') window.location.replace('/admin.html');
        else if (profile?.role === 'STATION_STAFF') window.location.replace('/billing.html');
    }
})();

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showError('Enter both a username and password.');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    const email = `${username}@${window.__ENV__.AUTH_EMAIL_DOMAIN}`;
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });

    if (error) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
        showError('Incorrect username or password.');
        return;
    }

    const { data: profile, error: profileError } = await window.sb
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) {
        await window.sb.auth.signOut();
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
        showError('Your account has no profile set up. Contact an admin.');
        return;
    }

    if (!profile.is_active) {
        await window.sb.auth.signOut();
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
        showError('This account has been deactivated.');
        return;
    }

    window.location.replace(profile.role === 'ADMIN_STAFF' ? '/admin.html' : '/billing.html');
});

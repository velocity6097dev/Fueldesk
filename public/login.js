const form = document.getElementById('authForm');
const loginBtn = document.getElementById('login-btn');
const msgEl = document.getElementById('login-msg');
const pwInput = document.getElementById('password');
const pwToggle = document.getElementById('pw-toggle');

function showMsg(message, success = false) {
    msgEl.textContent = message;
    msgEl.classList.toggle('success', success);
}

pwToggle.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

const HOME_BY_ROLE = { ADMIN_STAFF: '/billing.html', STATION_STAFF: '/billing.html' };

// If a message was passed in via ?msg=... (e.g. "session expired"), show it.
const params = new URLSearchParams(window.location.search);
if (params.get('msg')) showMsg(params.get('msg'));

// If already logged in, skip straight to the right home screen.
(async () => {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) return;
    const { data: profile } = await window.sb.from('profiles').select('role').eq('id', session.user.id).single();
    if (profile?.role) window.location.replace(HOME_BY_ROLE[profile.role] || '/login.html');
})();

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg('');

    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = pwInput.value;

    if (!username || !password) {
        showMsg('Enter both a username and password.');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    window.FuelDeskSetRememberMe(document.getElementById('remember-me').checked);
    localStorage.setItem('fueldesk:loginAt', String(Date.now()));

    const email = `${username}@${window.__ENV__.AUTH_EMAIL_DOMAIN}`;
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });

    if (error) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
        showMsg('Incorrect username or password.');
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
        showMsg('Your account has no profile set up. Contact an admin.');
        return;
    }

    if (!profile.is_active) {
        await window.sb.auth.signOut();
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
        showMsg('This account has been deactivated.');
        return;
    }

    window.location.replace(HOME_BY_ROLE[profile.role] || '/login.html');
});

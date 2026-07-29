// Requires supabaseClient.js (window.sb) loaded first.
//
// Usage at the top of a protected page's script:
//
//   const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
//   // profile is null if the guard already redirected away — bail out.
//   if (!profile) return;

window.FuelDeskAuth = (function () {
    const HOME_BY_ROLE = {
        ADMIN_STAFF: '/billing.html',
        STATION_STAFF: '/billing.html',
    };

    const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
    const LOGIN_AT_KEY = 'fueldesk:loginAt';

    function goToLogin(message) {
        const q = message ? `?msg=${encodeURIComponent(message)}` : '';
        window.location.replace(`/login.html${q}`);
    }

    // Forces a fresh login every 12 hours, regardless of "Remember Me" —
    // that setting only controls whether the session survives closing
    // the browser, not how long it lasts while open. If there's no
    // recorded login time (e.g. a session that was already active before
    // this feature shipped), we start the clock now instead of logging
    // someone out unexpectedly.
    async function enforceSessionAge() {
        const loginAt = Number(localStorage.getItem(LOGIN_AT_KEY));
        if (!loginAt) {
            localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
            return true;
        }
        if (Date.now() - loginAt > MAX_SESSION_MS) {
            await window.sb.auth.signOut();
            localStorage.removeItem(LOGIN_AT_KEY);
            goToLogin('You were logged out after 12 hours for security. Please log in again.');
            return false;
        }
        return true;
    }

    async function requireSession(requiredRole) {
        const { data: { session }, error: sessionError } = await window.sb.auth.getSession();

        if (sessionError || !session) {
            goToLogin('Please log in to continue.');
            return null;
        }

        if (!(await enforceSessionAge())) return null;

        const { data: profile, error: profileError } = await window.sb
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError || !profile) {
            await window.sb.auth.signOut();
            goToLogin('Your account is not set up correctly. Contact an admin.');
            return null;
        }

        if (!profile.is_active) {
            await window.sb.auth.signOut();
            goToLogin('This account has been deactivated.');
            return null;
        }

        if (requiredRole && profile.role !== requiredRole) {
            // Logged in, just on the wrong screen for their role — send them home
            // instead of showing an error, since this is a normal thing to happen
            // (e.g. a staff member bookmarked the admin page).
            window.location.replace(HOME_BY_ROLE[profile.role] || '/login.html');
            return null;
        }

        window.currentProfile = profile;
        window.currentSession = session;
        wireLogoutButtons();
        return profile;
    }

    function wireLogoutButtons() {
        document.querySelectorAll('.logout-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                await window.sb.auth.signOut();
                localStorage.removeItem(LOGIN_AT_KEY);
                window.location.replace('/login.html');
            });
        });
    }

    // Only admins get this — it's how they hop between the Billing and
    // Admin panels without logging out. Station staff never see it,
    // since they only ever have access to Billing.
    function renderPanelSwitcher(activePage) {
        if (!window.currentProfile || window.currentProfile.role !== 'ADMIN_STAFF') return;

        const nav = document.createElement('div');
        nav.className = 'bottom-nav';
        nav.innerHTML = `
            <button type="button" class="nav-btn${activePage === 'billing' ? ' active' : ''}" data-target="/billing.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/></svg>
                <span>Billing</span>
            </button>
            <button type="button" class="nav-btn${activePage === 'admin' ? ' active' : ''}" data-target="/admin.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
                <span>Settings</span>
            </button>
        `;
        nav.querySelectorAll('.nav-btn').forEach((btn) => {
            btn.addEventListener('click', () => window.location.href = btn.dataset.target);
        });
        document.body.appendChild(nav);
    }

    return { requireSession, renderPanelSwitcher };
})();

// Requires supabaseClient.js (window.sb) loaded first.
//
// Usage at the top of a protected page's script:
//
//   const profile = await FuelDeskAuth.requireSession('SUPER_ADMIN');
//   // or a list of roles: requireSession(['SUPER_ADMIN', 'ADMIN_STAFF'])
//   // or no argument at all: any active, logged-in user
//   // profile is null if the guard already redirected away — bail out.
//   if (!profile) return;

window.FuelDeskAuth = (function () {
    const HOME_BY_ROLE = {
        SUPER_ADMIN: '/billing.html',
        ADMIN_STAFF: '/billing.html',
        STATION_STAFF: '/billing.html',
    };

    const ROLE_LABELS = {
        SUPER_ADMIN: 'Super Admin',
        ADMIN_STAFF: 'Admin',
        STATION_STAFF: 'Staff',
    };

    const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
    const LOGIN_AT_KEY = 'fueldesk:loginAt';

    function goToLogin(message) {
        const q = message ? `?msg=${encodeURIComponent(message)}` : '';
        window.location.replace(`/login.html${q}`);
    }

    function roleLabel(role) {
        return ROLE_LABELS[role] || role;
    }

    function displayName(profile) {
        return profile?.display_name || profile?.username || '';
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

    // requiredRoles: undefined/null (any active user), a role string, or
    // an array of role strings.
    async function requireSession(requiredRoles) {
        const allowed = requiredRoles ? [].concat(requiredRoles) : null;

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

        if (allowed && !allowed.includes(profile.role)) {
            // Logged in, just on the wrong screen for their role — send them home
            // instead of showing an error, since this is a normal thing to happen
            // (e.g. a staff member bookmarked the admin page).
            window.location.replace(HOME_BY_ROLE[profile.role] || '/login.html');
            return null;
        }

        window.currentProfile = profile;
        window.currentSession = session;
        wireLogoutButtons();

        if (!(await checkSubscriptionAccess(profile))) return null;

        // Start watching for hosting-status changes from here on, for as
        // long as this page stays open — not just when we've already
        // found the user blocked. Without this, a session that was fine
        // at page-load time keeps working right through an admin marking
        // it overdue a minute later; the page only ever noticed at the
        // moment it loaded.
        watchSubscriptionChanges(profile);

        return profile;
    }

    // Developer's WhatsApp number for the "renew hosting" contact button
    // on the overdue blocker below.
    const DEVELOPER_WHATSAPP = '919875345863';
    const WHATSAPP_MESSAGE = 'plz verify the payment and resume my services';

    function isOverdue(expiryDateStr) {
        if (!expiryDateStr) return false;
        const expiry = new Date(`${expiryDateStr}T23:59:59`);
        return !isNaN(expiry.getTime()) && expiry < new Date();
    }

    // Blocks ADMIN_STAFF / STATION_STAFF from using the app once hosting
    // is overdue (SUPER_ADMIN always passes through untouched, since they
    // need access to fix it). Returns false and renders a full-screen,
    // unclosable blocker if blocked; returns true otherwise. Fails OPEN
    // (i.e. doesn't block) if the subscription row can't be read, so a
    // transient network/query hiccup never locks staff out by accident.
    async function checkSubscriptionAccess(profile) {
        if (profile.role === 'SUPER_ADMIN') return true;

        const { data, error } = await window.sb.from('daily_config').select('subscription_expiry_date').eq('id', 1).single();
        if (error || !data || !isOverdue(data.subscription_expiry_date)) return true;

        showSubscriptionBlocker();
        return false;
    }

    // One realtime channel per page load, set up the moment we know the
    // user is allowed in. Reacts both ways: blocks instantly (mid-session,
    // no reload needed to notice) the moment an admin pushes an overdue
    // date, and — if the blocker is already up — reloads the instant a
    // future date restores access. SUPER_ADMIN never gets blocked, so
    // never needs to watch for it.
    let watching = false;
    function watchSubscriptionChanges(profile) {
        if (profile.role === 'SUPER_ADMIN' || watching) return;
        watching = true;

        window.sb
            .channel('daily_config-subscription-watch')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'daily_config' }, (payload) => {
                const expiryStr = payload.new?.subscription_expiry_date;
                if (isOverdue(expiryStr)) {
                    showSubscriptionBlocker();
                } else if (document.querySelector('.subscription-blocker')) {
                    window.location.reload();
                }
            })
            .subscribe();
    }

    function showSubscriptionBlocker() {
        if (document.querySelector('.subscription-blocker')) return; // already shown

        // The full-page loader sits above everything else (z-index 999,
        // vs. this overlay's 200) and is only ever dismissed by the calling
        // page's own init() on the success path — which never runs once
        // requireSession() returns null here. Left alone, the blocker would
        // render immediately but stay hidden underneath the spinner until
        // PageLoader's own 12-second safety-net timeout fires. Telling it
        // to hide right now is what makes the block screen appear
        // instantly on login instead of after that long wait.
        window.PageLoader?.ready();

        const waText = encodeURIComponent(WHATSAPP_MESSAGE);
        const overlay = document.createElement('div');
        // Same overlay/card classes as the "You're Offline" popup so this
        // looks identical to it — dimmed backdrop, centered white card,
        // same illustration sizing and text styling. "subscription-blocker"
        // is just a hook for querying/URL — it doesn't carry its own look.
        overlay.className = 'offline-overlay subscription-blocker';
        overlay.innerHTML = `
            <div class="offline-card">
                <img src="/resources/505_Error.svg" alt="" class="offline-illustration" onerror="this.style.display='none';">
                <h2>Service Stopped</h2>
                <p>The service has stopped due to non-renewal of hosting. Kindly renew hosting by confirming payment to the developer below.</p>
                <a class="btn btn-primary btn-block" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px;" href="https://wa.me/${DEVELOPER_WHATSAPP}?text=${waText}" target="_blank" rel="noopener">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;flex-shrink:0;"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.37-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.8.37c-.27.3-1.04 1.02-1.04 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z"/><path d="M12.02 2C6.5 2 2.02 6.48 2.02 12c0 1.85.5 3.58 1.36 5.07L2 22l5.08-1.33A9.94 9.94 0 0 0 12.02 22C17.55 22 22 17.52 22 12S17.55 2 12.02 2zm0 18.15c-1.7 0-3.29-.47-4.65-1.28l-.33-.2-3.14.82.84-3.06-.21-.32a8.15 8.15 0 0 1-1.26-4.31c0-4.5 3.66-8.15 8.15-8.15A8.13 8.13 0 0 1 20.15 12c0 4.5-3.65 8.15-8.13 8.15z"/></svg>
                    Contact on WhatsApp
                </a>
                <button type="button" class="btn btn-ghost btn-block" style="margin-top:10px;" id="subscription-blocker-logout-btn">Log Out</button>
            </div>
        `;
        document.body.appendChild(overlay);
        window.ScrollLock.lock();
        document.getElementById('subscription-blocker-logout-btn').addEventListener('click', async () => {
            await window.sb.auth.signOut();
            localStorage.removeItem(LOGIN_AT_KEY);
            goToLogin();
        });
    }

    function wireLogoutButtons() {
        document.querySelectorAll('.logout-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const ok = await window.ConfirmDialog.show({
                    title: 'Log Out?',
                    message: 'You will need to log in again to continue.',
                    confirmLabel: 'Log Out',
                    danger: true,
                });
                if (!ok) return;
                await window.sb.auth.signOut();
                localStorage.removeItem(LOGIN_AT_KEY);
                window.location.replace('/login.html');
            });
        });
    }

    // Both admin tiers get this — it's how they hop between Billing and
    // Settings without logging out. Station staff never see it, since
    // they only ever have access to Billing.
    function renderPanelSwitcher(activePage) {
        const role = window.currentProfile?.role;
        if (role !== 'SUPER_ADMIN' && role !== 'ADMIN_STAFF') return;

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

    return { requireSession, renderPanelSwitcher, roleLabel, displayName };
})();

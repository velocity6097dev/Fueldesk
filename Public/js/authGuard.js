// Requires supabaseClient.js (window.sb) loaded first.
//
// Usage at the top of a protected page's script:
//
//   const profile = await FuelDeskAuth.requireSession('ADMIN_STAFF');
//   // profile is null if the guard already redirected away — bail out.
//   if (!profile) return;

window.FuelDeskAuth = (function () {
    const HOME_BY_ROLE = {
        ADMIN_STAFF: '/admin.html',
        STATION_STAFF: '/billing.html',
    };

    function goToLogin(message) {
        const q = message ? `?msg=${encodeURIComponent(message)}` : '';
        window.location.replace(`/login.html${q}`);
    }

    async function requireSession(requiredRole) {
        const { data: { session }, error: sessionError } = await window.sb.auth.getSession();

        if (sessionError || !session) {
            goToLogin('Please log in to continue.');
            return null;
        }

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
                window.location.replace('/login.html');
            });
        });
    }

    return { requireSession };
})();

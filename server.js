require('dotenv').config();

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const {
    PORT = 3000,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    AUTH_EMAIL_DOMAIN = 'station.local',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        '\nMissing Supabase env vars. Copy .env.example to .env and fill in ' +
        'SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.\n'
    );
    process.exit(1);
}

// Service-role client: bypasses Row Level Security. Server-side only,
// never sent to the browser. Used to create/deactivate staff logins and
// to write admin settings after we've verified the caller is an admin.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// Public runtime config for the browser (anon key only — this key
// is meant to be public, Row Level Security is what protects data).
// This is what lets the front-end files use `.env` values without
// needing a bundler/build step.
// ---------------------------------------------------------------
app.get('/env.js', (req, res) => {
    res.type('application/javascript').send(
        `window.__ENV__ = ${JSON.stringify({
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            AUTH_EMAIL_DOMAIN,
        })};`
    );
});

app.use(express.static(path.join(__dirname, 'public')));

function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

// ---------------------------------------------------------------
// requireAdmin: verifies the bearer token belongs to a real,
// active, ADMIN_STAFF user before letting a request through.
// ---------------------------------------------------------------
async function requireAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !userData?.user) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', userData.user.id)
            .single();

        if (profileError || !profile || profile.role !== 'ADMIN_STAFF' || !profile.is_active) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.authUser = userData.user;
        req.profile = profile;
        next();
    } catch (err) {
        console.error('requireAdmin error:', err);
        res.status(500).json({ error: 'Auth check failed' });
    }
}

// ---------------------------------------------------------------
// Staff management (admin only)
// ---------------------------------------------------------------

app.get('/api/staff', requireAdmin, async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, username, role, is_active, created_at')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ staff: data });
});

app.post('/api/staff', requireAdmin, async (req, res) => {
    const { username, password, role } = req.body || {};

    if (!username || !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-50 characters (letters, numbers, _ . -)' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password/PIN must be at least 6 characters' });
    }
    if (!['ADMIN_STAFF', 'STATION_STAFF'].includes(role)) {
        return res.status(400).json({ error: 'Role must be ADMIN_STAFF or STATION_STAFF' });
    }

    const email = usernameToEmail(username);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (createError) {
        const msg = /already registered|already exists/i.test(createError.message)
            ? 'That username is already taken'
            : createError.message;
        return res.status(400).json({ error: msg });
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
        id: created.user.id,
        username,
        role,
        is_active: true,
    }]);

    if (profileError) {
        // Roll back the auth user so we don't leave an orphaned login.
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return res.status(500).json({ error: profileError.message });
    }

    res.status(201).json({ id: created.user.id, username, role, is_active: true });
});

app.patch('/api/staff/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { is_active, role } = req.body || {};

    if (id === req.authUser.id && is_active === false) {
        return res.status(400).json({ error: "You can't deactivate your own account" });
    }

    const updates = {};
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (role && ['ADMIN_STAFF', 'STATION_STAFF'].includes(role)) updates.role = role;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
    }

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete('/api/staff/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (id === req.authUser.id) {
        return res.status(400).json({ error: "You can't delete your own account" });
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ error: error.message });

    // profiles row cascades on auth.users delete, but clean up defensively
    await supabaseAdmin.from('profiles').delete().eq('id', id);

    res.json({ deleted: true });
});

// ---------------------------------------------------------------
// Rates / density / template / station details (admin only)
// ---------------------------------------------------------------
app.put('/api/config', requireAdmin, async (req, res) => {
    const allowedFields = [
        'station_name', 'station_address', 'station_phone', 'station_gstin',
        'receipt_footer', 'logo_url', 'logo_width_mm',
        'ms_rate', 'ms_density',
        'hsd_rate', 'hsd_density',
        'premium_rate', 'premium_density',
        'active_template',
    ];

    const updates = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
        .from('daily_config')
        .update(updates)
        .eq('id', 1)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Fallback: send everyone through the login gate first.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`FuelDesk running at http://localhost:${PORT}`);
    console.log(`- Login:   http://localhost:${PORT}/login.html`);
    console.log(`- Billing: http://localhost:${PORT}/billing.html`);
    console.log(`- Admin:   http://localhost:${PORT}/admin.html`);
});

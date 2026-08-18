require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createDiscordIntegration } = require('./discord');

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
// to write admin settings after we've verified the caller's role.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const discord = createDiscordIntegration(supabaseAdmin);

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// Health check for uptime monitors (UptimeRobot, cron-job.org, etc.)
// keeping a free Render instance from sleeping. Deliberately does
// nothing but respond — no Supabase query, no Redis round-trip — so
// a ping every few minutes costs nothing and can never itself become
// a load problem or fail because a dependency is briefly down.
// ---------------------------------------------------------------
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------
// Public runtime config for the browser (anon key only — this key
// is meant to be public, Row Level Security is what protects data).
// ---------------------------------------------------------------
app.get('/env.js', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript').send(
        `window.__ENV__ = ${JSON.stringify({
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            AUTH_EMAIL_DOMAIN,
        })};`
    );
});

// ---------------------------------------------------------------
// Asset manifest for the first-run loader (assetPreloader.js) and the
// service worker (sw.js). Rather than a hand-maintained list, this
// reads whatever files actually exist in /fonts and /resources right
// now — drop a new font or logo in either folder and it's picked up
// automatically, no code change needed anywhere.
//
// `version` is a short hash of every asset's path + byte size. It
// changes on its own whenever a file is added, removed, or replaced
// with different content, which is what tells returning visitors'
// browsers to drop the old cache bucket and fetch the new one — no
// manual "bump the version" step to remember.
// ---------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');

function listPublicDir(relDir, labelPrefix) {
    const absDir = path.join(PUBLIC_DIR, relDir);
    let entries;
    try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
        return []; // folder doesn't exist — nothing to list, not fatal
    }
    return entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => {
            const stat = fs.statSync(path.join(absDir, entry.name));
            return { url: `/${relDir}/${entry.name}`, label: `${labelPrefix} — ${entry.name}`, bytes: stat.size };
        });
}

// The app-shell files (css/js/offline page/service worker itself) are
// few and stable enough to name explicitly, unlike fonts/resources
// which are meant to grow without touching this file.
const APP_SHELL_ASSETS = [
    { url: '/css/style.css', label: 'Stylesheet' },
    { url: '/js/ui.js', label: 'App core' },
    { url: '/js/pageLoader.js', label: 'App core' },
    { url: '/js/authGuard.js', label: 'App core' },
    { url: '/js/supabaseClient.js', label: 'App core' },
    { url: '/js/assetPreloader.js', label: 'App core' },
    { url: '/error.html', label: 'Offline page' },
    { url: '/error.js', label: 'Offline page script' },
    { url: '/sw.js', label: 'Service worker' },
].map((asset) => {
    try {
        return { ...asset, bytes: fs.statSync(path.join(PUBLIC_DIR, asset.url)).size };
    } catch (err) {
        return { ...asset, bytes: 20000 }; // file missing — keep a rough fallback weight rather than crash
    }
});

function buildAssetManifest() {
    const assets = [
        ...APP_SHELL_ASSETS,
        ...listPublicDir('fonts', 'Font'),
        ...listPublicDir('resources', 'Image'),
    ];
    const fingerprint = assets.map((a) => `${a.url}:${a.bytes}`).sort().join('|');
    const version = crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 10);
    return { version, assets };
}

app.get('/api/asset-manifest', (req, res) => {
    res.set('Cache-Control', 'no-store'); // always the live directory listing, never a stale cached one
    res.json(buildAssetManifest());
});

app.use(express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    // Cache-Control: no-cache (NOT no-store) — the browser still keeps a
    // local copy for speed, but is required to check back with the
    // server on every load via ETag before using it. Nobody has to
    // manually clear their cache after an update.
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
    },
}));

function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

const RANK = { SUPER_ADMIN: 3, ADMIN_STAFF: 2, STATION_STAFF: 1 };

// ---------------------------------------------------------------
// Auth middlewares. All three verify the bearer token belongs to a
// real, active user and attach req.authUser / req.profile — they only
// differ in which role(s) they let through.
// ---------------------------------------------------------------
async function loadProfileFromToken(req) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return { error: 'Missing Authorization header', status: 401 };

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
        return { error: 'Invalid or expired session', status: 401 };
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !profile || !profile.is_active) {
        return { error: 'Account not found or inactive', status: 403 };
    }

    return { authUser: userData.user, profile };
}

// Any active, logged-in user — station staff included. Used for routes
// like bill-created notifications, which staff trigger by billing.
async function requireActiveUser(req, res, next) {
    const result = await loadProfileFromToken(req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    req.authUser = result.authUser;
    req.profile = result.profile;
    next();
}

// Admin Staff or Super Admin.
async function requireAdmin(req, res, next) {
    const result = await loadProfileFromToken(req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!RANK[result.profile.role] || RANK[result.profile.role] < RANK.ADMIN_STAFF) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    req.authUser = result.authUser;
    req.profile = result.profile;
    next();
}

// Super Admin only — branding, format, integrations, and managing
// Admin-tier accounts.
async function requireSuperAdmin(req, res, next) {
    const result = await loadProfileFromToken(req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.profile.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin access required' });
    }
    req.authUser = result.authUser;
    req.profile = result.profile;
    next();
}

// ---------------------------------------------------------------
// Staff management. Each rank can only see/create/modify ranks
// strictly below it: Super Admin manages everyone, Admin Staff
// manages Station Staff only, Station Staff has no access at all
// (this route requires requireAdmin, so they're already blocked).
// ---------------------------------------------------------------

app.get('/api/staff', requireAdmin, async (req, res) => {
    let query = supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, role, is_active, created_at')
        .order('created_at', { ascending: false });

    if (req.profile.role === 'ADMIN_STAFF') {
        query = query.eq('role', 'STATION_STAFF');
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ staff: data });
});

app.post('/api/staff', requireAdmin, async (req, res) => {
    const { username, password, role, display_name: displayNameRaw } = req.body || {};
    const displayName = (displayNameRaw || '').trim().slice(0, 80) || null;

    if (!username || !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-50 characters (letters, numbers, _ . -)' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password/PIN must be at least 6 characters' });
    }
    if (!RANK[role]) {
        return res.status(400).json({ error: 'Role must be SUPER_ADMIN, ADMIN_STAFF, or STATION_STAFF' });
    }
    // Admin Staff can only create Station Staff — never their own tier or above.
    if (req.profile.role === 'ADMIN_STAFF' && role !== 'STATION_STAFF') {
        return res.status(403).json({ error: 'Admins can only create Station Staff accounts' });
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
        display_name: displayName,
        role,
        is_active: true,
    }]);

    if (profileError) {
        // Roll back the auth user so we don't leave an orphaned login.
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return res.status(500).json({ error: profileError.message });
    }

    res.status(201).json({ id: created.user.id, username, display_name: displayName, role, is_active: true });
});

async function assertCanManageTarget(req, res, targetId) {
    if (targetId === req.authUser.id) {
        res.status(400).json({ error: "You can't modify your own account here" });
        return null;
    }
    const { data: target, error } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', targetId)
        .single();
    if (error || !target) {
        res.status(404).json({ error: 'Staff member not found' });
        return null;
    }
    if (RANK[req.profile.role] <= RANK[target.role]) {
        res.status(403).json({ error: 'You can only manage accounts below your own rank' });
        return null;
    }
    return target;
}

app.patch('/api/staff/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const target = await assertCanManageTarget(req, res, id);
    if (!target) return; // response already sent

    const { is_active, role, display_name: displayNameRaw } = req.body || {};
    const updates = {};
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (typeof displayNameRaw === 'string') updates.display_name = displayNameRaw.trim().slice(0, 80) || null;
    if (role) {
        if (!RANK[role]) return res.status(400).json({ error: 'Invalid role' });
        if (req.profile.role === 'ADMIN_STAFF' && role !== 'STATION_STAFF') {
            return res.status(403).json({ error: 'Admins can only assign the Station Staff role' });
        }
        updates.role = role;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
    }

    // Safety net: never let the last active Super Admin be demoted/deactivated.
    if (target.role === 'SUPER_ADMIN' && (updates.is_active === false || (updates.role && updates.role !== 'SUPER_ADMIN'))) {
        const { count } = await supabaseAdmin
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'SUPER_ADMIN')
            .eq('is_active', true);
        if ((count ?? 0) <= 1) {
            return res.status(400).json({ error: 'This is the last active Super Admin — promote another account first' });
        }
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
    const target = await assertCanManageTarget(req, res, id);
    if (!target) return;

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ error: error.message });

    // profiles row cascades on auth.users delete, but clean up defensively
    await supabaseAdmin.from('profiles').delete().eq('id', id);

    res.json({ deleted: true });
});

// ---------------------------------------------------------------
// Rates / density / template / station details / subscription.
// Admin Staff can touch rate & density fields, plus a "name +
// receipt branding" slice (station_name, station_address,
// station_phone, receipt_footer) -- but NOT the logo, the active
// template, or any of the format/subscription fields, which stay
// Super Admin only. Fields outside a caller's allowed set are
// silently ignored rather than erroring, matching how partial saves
// already work. This list is the source of truth for the permission
// -- the admin.html UI hiding those controls for Admin Staff is just
// a courtesy; it's this server-side allow-list that actually
// enforces it.
// ---------------------------------------------------------------
const RATE_FIELDS = ['ms_rate', 'ms_density', 'hsd_rate', 'hsd_density', 'premium_rate', 'premium_density'];
const ADMIN_STAFF_BRANDING_FIELDS = ['station_name', 'station_address', 'station_phone', 'receipt_footer'];
const SUPER_ADMIN_ONLY_FIELDS = [
    'logo_url', 'logo_width_mm',
    'logo_position_pct', 'logo_ratio_locked', 'logo_height_mm',
    'receipt_width_cm', 'receipt_margin_mm', 'receipt_line_spacing', 'receipt_base_font_px',
    'receipt_print_darkness_pct', 'receipt_text_thickness_pct',
    'active_template', 'subscription_plan', 'subscription_expiry_date',
];

app.put('/api/config', requireAdmin, async (req, res) => {
    const allowedFields = req.profile.role === 'SUPER_ADMIN'
        ? [...RATE_FIELDS, ...ADMIN_STAFF_BRANDING_FIELDS, ...SUPER_ADMIN_ONLY_FIELDS]
        : [...RATE_FIELDS, ...ADMIN_STAFF_BRANDING_FIELDS];

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

// ---------------------------------------------------------------
// Discord integration (Super Admin only). The webhook URL itself is
// never sent back to the browser after saving — only whether one is
// configured — since it's a bearer credential (see sql/schema.sql).
// ---------------------------------------------------------------
app.get('/api/integrations/discord', requireSuperAdmin, async (req, res) => {
    const { data, error } = await supabaseAdmin.from('integrations').select('*').eq('id', 1).single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({
        configured: Boolean(data.discord_webhook_url),
        enabled: data.discord_enabled,
        notifyBillCreated: data.discord_notify_bill_created,
        notifyWeeklySummary: data.discord_notify_weekly_summary,
        notifyMonthlySummary: data.discord_notify_monthly_summary,
    });
});

app.put('/api/integrations/discord', requireSuperAdmin, async (req, res) => {
    const { webhookUrl, enabled, notifyBillCreated, notifyWeeklySummary, notifyMonthlySummary } = req.body || {};

    const updates = { updated_at: new Date().toISOString() };
    if (typeof webhookUrl === 'string' && webhookUrl.trim()) {
        if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhookUrl.trim())) {
            return res.status(400).json({ error: 'That doesn\'t look like a Discord webhook URL' });
        }
        updates.discord_webhook_url = webhookUrl.trim();
    }
    if (typeof enabled === 'boolean') updates.discord_enabled = enabled;
    if (typeof notifyBillCreated === 'boolean') updates.discord_notify_bill_created = notifyBillCreated;
    if (typeof notifyWeeklySummary === 'boolean') updates.discord_notify_weekly_summary = notifyWeeklySummary;
    if (typeof notifyMonthlySummary === 'boolean') updates.discord_notify_monthly_summary = notifyMonthlySummary;

    const { error } = await supabaseAdmin.from('integrations').update(updates).eq('id', 1);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ saved: true });
});

app.post('/api/integrations/discord/test', requireSuperAdmin, async (req, res) => {
    try {
        await discord.sendTestMessage();
        res.json({ sent: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Manual "send today's summary now" — Admin Staff + Station Staff only
// (Super Admin's own bills, if any, excluded). Independent of the
// scheduled weekly/monthly jobs and doesn't touch their reset pointers.
app.post('/api/integrations/discord/summary/today', requireSuperAdmin, async (req, res) => {
    try {
        await discord.sendTodaySummary();
        res.json({ sent: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ---------------------------------------------------------------
// Bill-created notification. Any active logged-in user can call this
// (station staff create most bills) — the server re-fetches the
// transaction itself rather than trusting client-supplied amounts, and
// checks the transaction actually belongs to the caller.
// ---------------------------------------------------------------
app.post('/api/notify/bill-created', requireActiveUser, async (req, res) => {
    const { transactionId } = req.body || {};
    if (!transactionId) return res.status(400).json({ error: 'transactionId required' });

    const { data: transaction, error } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

    if (error || !transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (transaction.attendant_id !== req.authUser.id) {
        return res.status(403).json({ error: 'Not your transaction' });
    }

    discord.notifyBillCreated(transaction).catch((err) => console.error('notifyBillCreated error:', err));
    res.json({ notified: true });
});

// Fallback: send everyone through the login gate first.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ---------------------------------------------------------------
// 404 / generic error handling. API requests get a JSON response
// (so fetch() callers can still parse it normally); anything else —
// a bad/old link, a typo'd URL — goes to the same error page the
// offline overlay uses, styled to match the rest of the app instead
// of a bare Express/browser error screen.
// ---------------------------------------------------------------
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.redirect('/error.html?type=404');
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ error: 'Internal server error' });
    }
    res.redirect('/error.html?type=500');
});

app.listen(PORT, () => {
    console.log(`FuelDesk running at http://localhost:${PORT}`);
    console.log(`- Login:   http://localhost:${PORT}/login.html`);
    console.log(`- Billing: http://localhost:${PORT}/billing.html`);
    console.log(`- Admin:   http://localhost:${PORT}/admin.html`);
    discord.scheduleJobs();
});

// Close the BullMQ worker/queue and Redis connection cleanly on
// restart/redeploy (e.g. `pm2 restart`, Docker stop, Ctrl+C) instead of
// just killing the process mid-job.
async function gracefulShutdown(signal) {
    console.log(`\n${signal} received, shutting down...`);
    try {
        await discord.shutdown();
    } catch (err) {
        console.error('Error while shutting down Discord queue:', err.message);
    }
    process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

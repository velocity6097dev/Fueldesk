// Run once, from the project root:
//   node scripts/create-first-admin.js <username> <password>
//
// Creates the very first ADMIN_STAFF login directly with the service
// role key. After this, use the Admin screen in the app to add more
// staff (admins or station staff) — you won't need this script again.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const [, , username, password] = process.argv;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTH_EMAIL_DOMAIN = 'station.local' } = process.env;

if (!username || !password) {
    console.error('Usage: node scripts/create-first-admin.js <username> <password>');
    process.exit(1);
}
if (password.length < 6) {
    console.error('Password/PIN must be at least 6 characters.');
    process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
    const email = `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (createError) {
        console.error('Could not create auth user:', createError.message);
        process.exit(1);
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
        id: created.user.id,
        username: username.trim().toLowerCase(),
        role: 'ADMIN_STAFF',
        is_active: true,
    }]);

    if (profileError) {
        console.error('Auth user created but profile insert failed:', profileError.message);
        console.error('Fix it manually in the Supabase table editor, or delete the auth user and retry.');
        process.exit(1);
    }

    console.log(`\n✅ Admin account created. Log in at /login.html with:`);
    console.log(`   username: ${username.trim().toLowerCase()}`);
    console.log(`   password: (what you just typed)\n`);
    process.exit(0);
})();

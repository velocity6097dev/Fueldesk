# FuelDesk

Mobile-first billing + admin app for a fuel station, rebuilt on top of your
original files. What changed and why is explained below — read the
"What changed" section even if you just want to get running quickly, since
a couple of things (Row Level Security) matter for security, not just style.

## 1. Set up Supabase

1. Create a project at supabase.com (or use your existing one).
2. Open the SQL editor and run **`sql/schema.sql`** top to bottom.
   - If you already have the old tables (`users`, `daily_config`,
     `transactions`) from the previous version, drop them first — the
     commented-out `drop table` lines at the top of the file do this.
3. In **Project Settings → API**, copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (click "reveal")

## 2. Configure the app

```bash
cp .env.example .env
# then edit .env and paste in the three values above
npm install
```

## 3. Create your first admin login

There's a chicken-and-egg problem: creating staff normally requires an
admin to already be logged in. Solve it once with:

```bash
npm run create-admin -- yourname yourpassword
```

(password/PIN must be at least 6 characters). After this, log in at
`/login.html` with that username/password and use the Admin screen to add
everyone else — you won't need this script again.

## 4. Run it

```bash
npm start
```

- Login: `http://localhost:3000/login.html`
- Everyone (admin and station staff) logs in at the same URL — the app
  reads their role and sends them to the right screen automatically.

## What changed from your original files, and why

**Environment variables.** The Supabase URL/keys are no longer hardcoded
in `admin.js`/`billing.js`. `server.js` reads them from `.env` and hands
the browser only the `anon` key via a small `/env.js` endpoint at runtime.

**This alone doesn't secure your data — Row Level Security does.**
Supabase's `anon` key is *meant* to be public; it's sent to every visitor's
browser no matter where you store it. Your original schema had no Row
Level Security policies, which means with the old setup, anyone who
opened the browser dev tools and copied that key could read or rewrite
your entire database — rates, staff, transactions — directly through
Supabase's API. `sql/schema.sql` turns RLS on for every table:

- `daily_config` (rates/density/template/station info) can only be
  **read** by a logged-in user, and can only be **written** through the
  server's `/api/config` route, which double-checks the caller is an
  active admin before touching anything.
- `profiles` (staff accounts) can only be read by yourself, or by an
  admin. Staff are only ever created/deactivated/deleted through
  `/api/staff`, using the `service_role` key, which never leaves the
  server.
- `transactions` can be inserted by a logged-in staff member for
  themselves, and read by themselves or an admin.

**Real login instead of a fake one.** The old admin panel had a "PIN"
field that was collected but never actually saved or checked anywhere —
there was no real authentication at all. Login now uses Supabase Auth.
Since staff think in usernames, not emails, the app quietly turns
`rahul` into `rahul@station.local` (configurable via `AUTH_EMAIL_DOMAIN`
in `.env`) behind the scenes — staff only ever see "username" on screen.

**One login screen, role-based redirect.** `/login.html` is shared by
admin and station staff. After signing in, the app checks the person's
role in `profiles` and sends them to `/admin.html` or `/billing.html`.
Each of those pages re-checks the role on load (`public/js/authGuard.js`)
and bounces anyone who doesn't belong there.

**Admin can now do everything asked for:**
- Set price *and* density per product (MS, HSD, Premium — your schema
  already had `hsd_rate`/`premium_rate` columns that the old UI never
  used).
- Edit the printed station name/address/phone/GSTIN.
- Add staff (this now actually creates a working login, not just a
  database row).
- Deactivate or permanently delete staff, with a guard so you can't
  lock yourself out.

**Bill templates are now real, swappable files** in `public/templates/`
(`bpclTokheim.js`, `ioclTokheim.js`) instead of one hardcoded receipt
layout. The admin's "Receipt Template" dropdown is generated from
whichever templates are registered — add a new pump brand by copying
one of those files, changing the markup, and adding a `<script>` tag for
it in `billing.html`/`admin.html`.

**Billing fixes:**
- Receipt numbers are now assigned by a Postgres sequence
  (`sql/schema.sql`), not `Math.random()` — the old approach could
  silently collide and fail to save a bill.
- The backdate fields were two free-text boxes ("DD/MM/YY", "HH:MM")
  with no validation; that's now a single `datetime-local` picker.
  This also fixed the underlying bug where the printed receipt could
  disagree with what was actually saved, since both now come from one
  parsed `Date`.
  the same source.
- Every bill records which attendant created it (`attendant_id`,
  `attendant_username`) for accountability.
- Product selection (Petrol/Diesel/Premium) actually exists now, using
  the rate/density that matches what was sold.

## Adding another receipt template

1. Copy `public/templates/bpclTokheim.js` to e.g. `public/templates/myBrand.js`.
2. Change `id`, `label`, and the HTML inside `render()`.
3. Add `<script src="/templates/myBrand.js"></script>` in both
   `billing.html` and `admin.html`, after `registry.js`.
4. It'll show up automatically in the admin's "Receipt Template" dropdown.

## Project structure

```
server.js              Express server: static files, /env.js, admin API
scripts/create-first-admin.js
sql/schema.sql          Tables + RLS policies
public/
  login.html / login.js
  billing.html / billing.js
  admin.html / admin.js
  css/style.css          Shared design tokens + components
  js/supabaseClient.js   Builds the Supabase client from server-injected env
  js/authGuard.js        Session + role check used by billing.html & admin.html
  templates/              One file per receipt layout
```

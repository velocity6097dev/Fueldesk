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
   - **Already running an earlier version of FuelDesk?** Don't drop your
     tables — run the migration files in order instead:
     - `sql/migrations/002_photo_vehicle_mobile.sql`
     - `sql/migrations/003_logo_position_width_commands.sql`
     Both are safe to run even if part of them is already applied. **If
     your receipt footer wasn't showing up on printed bills**, that's
     almost certainly because `002` (which adds the `receipt_footer`
     column) hadn't been run yet — run it and it'll start appearing.
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
`/login.html` with that username/password and use the Staff page
(top-bar icon) to add everyone else — you won't need this script again.

## 4. Run it

```bash
npm start
```

- Login: `http://localhost:3000/login.html`
- Everyone (admin and station staff) logs in at the same URL and lands
  on the Billing screen. Admins additionally get a bottom nav to switch
  to Settings, and a Staff icon in the top bar.

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

**One login screen for everyone.** `/login.html` is shared by admin and
station staff. After signing in, everyone lands on `/billing.html`.
Admins get an extra bottom nav to reach `/admin.html` (Settings) and a
Staff icon in the top bar for `/staff.html`; station staff only ever see
Billing. Each protected page re-checks the session and role on load
(`public/js/authGuard.js`) and bounces anyone who doesn't belong there.

**Admin can now do everything asked for:**
- Set price *and* density per product (MS, HSD, Premium — your schema
  already had `hsd_rate`/`premium_rate` columns that the old UI never
  used).
- Edit the printed station name/address/phone/GSTIN.
- Add staff (this now actually creates a working login, not just a
  database row) from a dedicated **Staff** page, reached via the icon
  in the top bar — not buried inside Settings.
- Deactivate or permanently delete staff, with a guard so you can't
  lock yourself out.

**Bill templates are real, swappable files** in `public/templates/`
(`bpclTokheim.js`, `ioclTokheim.js`, `ioclGilbarco.js`) instead of one
hardcoded receipt layout. `ioclGilbarco.js` matches the exact field
layout of a real dot-matrix pump receipt — Bill No, Trns.ID, Atnd.ID,
Vehi.No, Date, Time, FP. ID, Nozl No, Fuel, Density, Preset, Rate, Sale,
Volume, colon-aligned — with a few deliberate print-only touches to
match a real printer's behavior: Bill No / Trns.ID / FP. ID / Nozl No
are freshly randomized on every print (Bill No is 6 random digits +
`-ORGNL`, Trns.ID is 16 digits with the last 9 random, FP. ID is
randomly 1 or 2, Nozzle is randomly 1–4). **These are cosmetic only** —
your real receipt number, database row id, and everything used for
staff attribution/reporting elsewhere in the app are untouched; only
what's printed on this specific template's paper varies. Text sizes for
this template are a plain `TEXT_SIZES` constants block at the top of
`ioclGilbarco.js` — edit that file directly to resize things; there's no
Settings UI toggle for it by design. Upload your real logo photo in
Settings and it prints in the frame at the top instead of a blank
circle (no "IndianOil" text is hardcoded — the wordmark is expected to
already be part of your uploaded photo). The Settings "Receipt Template"
picker is generated from whichever templates are registered — add a new
pump/brand combo by copying one of those files, changing the markup,
and adding a `<script>` tag for it in both `billing.html` and
`admin.html` (after `registry.js`). **If you add a template with its own
top-level `const`/`function` declarations, wrap the file in an IIFE**
(see `ioclGilbarco.js`) — every template `<script>` on the page shares
one global scope, so un-wrapped same-named declarations across two
template files will throw a syntax error.

**Multi-line, formattable station name, address, and receipt footer.**
All three fields are left-aligned by default (press Enter for a new
line). Wrap a line in `<center>...</center>` or `<right>...</right>` to
align just that line, or `<b>...</b>` to bold part of it — tap the small
**i** button next to any of the three fields for a reminder. These are
the only three patterns recognized; everything else you type is shown
literally and safely (there's no way to inject real HTML through these
fields). Note: which template is active can still apply its own default
— e.g. BPCL Tokheim / IOCL Tokheim center the station name unless you
explicitly left/right-align a line, since that matches their branded
look; `ioclGilbarco.js` leaves it left-aligned like everything else on
that layout, matching a real printed receipt.

**Custom, positionable logo.** Admin can upload a photo/logo (stored in
a Supabase Storage bucket, `station-assets`) that replaces the plain
text logo box at the top of the receipt. You control its width (15–50mm),
left/center/right alignment, and the space above/below it — all with
live sliders that save as soon as you let go, no need to hit "Save
Settings" first. Removing the logo falls back to the template's default
text placeholder.

**Configurable receipt width.** "Bill Width (cm)" in Settings (with
58mm/80mm quick-select chips) controls the actual printed paper width —
applied dynamically right before printing. Height is always automatic,
the same as a real thermal roll.

**"Preview Receipt" button** in Settings lets you check how the logo,
footer, address, and chosen template will actually look on paper, using
dummy numbers, without needing to save settings or bill a real
transaction first.

**Fixed: pickers/dropdowns going "stuck".** The bottom-sheet picker
(used for Product, Mode, Template, Role, etc.) had a CSS bug — when
closed, its full-screen backdrop was invisible but still capable of
catching taps, so after opening a picker once, parts of the page could
stop responding to touch. Fixed in `style.css` (the backdrop now has
`pointer-events: none` while closed).

**Fixed: font-size silently ignored on formatted address/footer lines.**
The formatting helper was emitting two `style="..."` attributes on the
same line (one for alignment, one for font-size) — HTML only honors the
first one it sees, so the font-size was being silently dropped. Fixed
by merging both into a single `style` attribute.

**Billing fixes:**
- Receipt numbers are now assigned by a Postgres sequence
  (`sql/schema.sql`), not `Math.random()` — the old approach could
  silently collide and fail to save a bill.
- The backdate fields were two free-text boxes ("DD/MM/YY", "HH:MM")
  with no validation; that's now a single `datetime-local` picker, so
  the printed receipt and the saved row always agree.
- Every bill records which attendant created it (`attendant_id`,
  `attendant_username`) for accountability.
- Product selection (Petrol/Diesel/Premium) actually exists now, using
  the rate/density that matches what was sold.
- Vehicle & mobile number fields, saved with the transaction and
  printed on the receipt (mobile is validated as 10 digits if entered).

## Adding another receipt template

1. Copy `public/templates/bpclTokheim.js` (boxed/grid style) or
   `public/templates/ioclGilbarco.js` (colon-aligned dot-matrix style) to
   a new file, e.g. `public/templates/myBrand.js`.
2. Change `id`, `label`, and the HTML inside `render()`. If your new
   file declares any top-level `const`/`function`, wrap the whole thing
   in an IIFE like `ioclGilbarco.js` does.
3. Add `<script src="/templates/myBrand.js"></script>` in both
   `billing.html` and `admin.html`, after `registry.js`.
4. It'll show up automatically in the Settings "Receipt Template" picker.

## Project structure

```
server.js              Express server: static files, /env.js, admin API
scripts/create-first-admin.js
sql/schema.sql                                    Full schema (fresh installs)
sql/migrations/002_photo_vehicle_mobile.sql       Incremental: logo/footer/vehicle/mobile
sql/migrations/003_logo_position_width_commands.sql   Incremental: logo position, width, commands
public/
  login.html / login.js     Universal login
  billing.html / billing.js Lands here after login (everyone)
  admin.html / admin.js     "Settings" — rates, branding, receipt setup (admin only)
  staff.html / staff.js     Add/deactivate/delete staff (admin only)
  css/style.css              Shared design tokens + components
  js/supabaseClient.js       Builds the Supabase client from server-injected env
  js/authGuard.js            Session + role check, Billing/Settings switcher nav
  js/ui.js                   Toast, bottom-sheet picker, info popover, print-width helper
  templates/                 One file per receipt layout
```

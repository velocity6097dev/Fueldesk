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
     - `sql/migrations/004_format_panel.sql`
     - `sql/migrations/005_logo_slider_random_pump_ids.sql`
     - `sql/migrations/006_footer_space.sql`
     - `sql/migrations/007_super_admin_discord_subscription.sql`
     - `sql/migrations/008_fix_staff_delete_fk.sql`
     All are safe to run even if part of them is already applied. **If
     your receipt footer wasn't showing up on printed bills**, that's
     almost certainly because `002` (which adds the `receipt_footer`
     column) hadn't been run yet — run it and it'll start appearing.
     **After running `007`**, promote whichever existing account should
     be your Super Admin (see the comment inside that file for the exact
     `update profiles set role = 'SUPER_ADMIN' ...` line) — otherwise
     everyone who was previously an Admin is now the restricted,
     rates-only Admin tier and nobody can reach Settings/Format/
     Integrations until you do this.
3. In **Project Settings → API**, copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (click "reveal")

**Requires Node.js 18 or newer** (the Discord integration uses the
built-in `fetch`, not a separate HTTP library).

## 2. Configure the app

```bash
cp .env.example .env
# then edit .env and paste in the three values above
npm install
```

## 3. Create your first Super Admin login

There's a chicken-and-egg problem: creating staff normally requires an
admin to already be logged in. Solve it once with:

```bash
npm run create-admin -- yourname yourpassword
```

(password/PIN must be at least 6 characters; add a display name as
extra arguments if you want one, e.g. `-- yourname yourpassword Jane Doe`).
This creates a **Super Admin** — the top rank, with access to every
adjustment feature. After this, log in at `/login.html` with that
username/password and use the Staff page (top-bar icon) to add Admins
and Station Staff — you won't need this script again.

## 4. Run it

```bash
npm start
```

- Login: `http://localhost:3000/login.html`
- Everyone logs in at the same URL and lands on the Billing screen.
  Super Admin and Admin additionally get a bottom nav to switch to
  Settings, and a Staff icon in the top bar.

## Roles

Three tiers, each able to manage (add/deactivate/delete) only the ranks
strictly below it:

| Rank | Billing | Rates/Density | Settings (branding, Format, Integrations) | Manage Staff |
|---|---|---|---|---|
| **Super Admin** | ✅ | ✅ | ✅ everything | Everyone |
| **Admin Staff** | ✅ | ✅ | ❌ (rates/density card only) | Station Staff only |
| **Station Staff** | ✅ | ❌ | ❌ | ❌ |

This is enforced server-side in `server.js` (not just hidden in the
UI) — an Admin Staff account can't reach Super-Admin-only data even by
calling the API directly.

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

## Latest round of fixes

**Logo centering, made robust.** The logo now centers two ways at once
— `text-align` on a wrapper explicitly forced to 100% width, *and*
`margin: 0 auto` block-centering on the image itself. Some simple
HTML-to-thermal-printer converters only honor one of these; using both
guarantees the logo is actually centered across the paper's breadth
regardless of renderer, for all three alignment options (left/center/
right).

**You never need to manually clear your cache after an update.**
`server.js` now sends `Cache-Control: no-cache` on every static file —
the browser still keeps a local copy for speed, but is required to
check back with the server every time via ETag before using it. If a
file changed, it gets the new one automatically; if not, the server
just replies 304 and the old copy is reused. `/env.js` is sent with
`no-store` (never cached at all) since it's cheap to regenerate and
should always be current.

**Remember Me at login.** Checked by default. When checked, your
session is stored in `localStorage` and survives closing the browser/
app. Unchecked, it goes to `sessionStorage` instead and disappears when
the tab or browser closes — useful on a shared device where you don't
want the next person automatically logged in as you.

**New: Format panel** (`/format.html`, reached via "Adjust Margins &
Spacing (Live)" in Settings) — a live, on-screen preview of the actual
receipt (not a print dialog) that updates instantly as you drag:
- **Side Margin** — left/right space, in mm (default 3mm).
- **Space Before Content Starts** — top margin, in mm.
- **Line Spacing** — a line-height multiplier.
- **Base Text Size** — overall receipt font size, in px.

These apply globally on top of *whichever* template is active — they're
not a per-template setting. (Per-template field sizing, like the exact
size of the "Bill No" line on the Gilbarco layout, is still a
`TEXT_SIZES` block in that template's own file, by design — see below.)
Switch templates right there in the panel to preview each one with your
real station name, address, and logo before committing. Nothing is
saved until you tap "Save."

**Branding.** "Made by Velocity.logs" appears at the bottom of every
screen in the app (login, Billing, Settings, Staff, Format) — never on
the printed receipt itself.

## Second round of fixes

**Everything sizing/position/spacing now lives in one place: Format.**
Logo alignment, logo width, logo top/bottom spacing, and paper width
used to be split between Settings and Format. They're all in Format now
— Settings only has the logo *upload* button (since that's a file
action, not a slider) plus station details, footer, and rates.

**Logo alignment is a slider now, not three buttons.** Drag anywhere
from Left to Right (0–100%), not just three fixed stops — 50% is exact
center. Uses `margin-left: calc((100% - width) * position)`, which is
exact at any position, not an approximation.

**Logo aspect-ratio lock.** New toggle in Format: locked (default)
means height always follows width automatically, so the logo can never
end up stretched. Unlock it and a Height slider appears, letting you
set width and height independently if you want to.

**Fixed: "Base Text Size" doing nothing.** This was a real bug — the
Gilbarco template had its own internal fixed-pixel sizes for every
line, which silently overrode the global slider (CSS gives an
element's own explicit size priority over an inherited one). All three
templates now use sizes *relative* to the global base (`em` units, not
`px`), so the one Base Text Size control actually scales the whole
receipt — confirmed by literally rendering the same bill at two
different sizes and checking the output differs. There are also +/−
buttons next to the slider now for quick nudges.

**Removed: Pump & Paper Setup.** FP ID and Nozzle No are no longer
admin-configured — every template now generates them randomly on each
bill (this was already true for the Gilbarco layout; now it's true for
all three). "Paper Width" moved into Format as a simple 58mm/80mm
choice, since it's a sizing control like everything else there.

**Fixed: phone number with no label on the Gilbarco template.** Now
prints `PH. <number>` instead of the bare digits.

**Fixed: logo sometimes missing right after entering a bill.** Printing
immediately after typing a bill could capture the receipt before a
freshly-set logo `<img>` had actually finished loading — it would then
"start working" only because the browser had since cached the image.
Billing/Settings/Format now explicitly wait for the logo to finish
loading (with a 2.5s safety timeout for a slow/broken image) before the
print dialog opens.

**Fixed: blank second page when printing.** `.app-screen` had
`min-height: 100vh` and `html`/`body` had `height: 100%` — even hidden
via `visibility:hidden` during print, they still reserved their full
layout height, which could push the page past a single sheet and print
an extra blank page. These now collapse to `height: auto` during print.

## Third round of fixes

**Fixed: "Space Before Content Starts" doing nothing in print.** This
was a genuine CSS bug, not a fake explanation — margin collapsing. The
wrapper div had no non-zero top padding by default, so a child's
`margin-top` (e.g. the logo's "Space Above") could collapse straight
through it and leak out *above* the wrapper instead of pushing content
down *inside* it. Fixed with `display: flow-root` on the wrapper, which
gives it a proper containing block so margins always behave the way the
sliders promise — verified by rendering the same bill and checking the
actual padding shows up in the output.

**New: "Space Below Footer."** Extra blank space at the very bottom of
the receipt, after the footer — useful as paper feed before tearing
off. Lives in Format alongside the other spacing controls.

**Logo shifting when changing text size.** I could not find a code path
where the logo's own width/position (both set in `mm`/`%`, never `em`)
mathematically depends on font size — but the margin-collapsing bug
above is a very plausible explanation for it *looking* that way, since
an inconsistently-collapsing margin combined with line-height (which
scales with font size) would make the whole layout reflow
unpredictably around the logo. Also defensively added `vertical-align:
top` to the no-logo placeholder shapes, since inline-block elements can
shift with line-height regardless. If the logo still visibly resizes
(not just repositions) after this update, let me know specifically
whether it's the width or the position that's changing — that'll help
me find whatever's left.

**Removed the GSTIN field** from Settings and every template — it's
gone from the form, not just hidden when blank.

**12-hour auto-logout.** Independent of "Remember Me" (which only
controls whether a session survives closing the browser) — after 12
hours from login, the next page load signs you out and sends you back
to `/login.html` with an explanation. Existing sessions from before
this update get a fresh 12-hour clock starting now, rather than being
logged out immediately.

## Fourth round of changes

**Removed "Space Above" / "Space Below Footer" entirely**, per direct
testing feedback — both relied on CSS padding, which apparently isn't
reliable through every print path. Rather than guess further, they're
gone so it can be tested without that variable in play. Side margin,
line spacing, and text size (which don't have the same issue) are still
in Format.

**Three-tier roles: Super Admin / Admin / Station Staff.** See the
table in the setup section above. This is a real permission boundary —
`server.js` checks the caller's rank on every relevant route, not just
the UI hiding buttons.

**Staff display names.** Add Staff (on the Staff page) now has a
Display Name field — "Logged in as ..." throughout the app shows that
instead of the login username. Username still exists and is still what
you type to log in; display name is purely cosmetic.

**Discord integration** (Settings → Integrations, Super Admin only):
bill-created notifications, weekly summaries (every Monday), and
monthly summaries (1st of the month) — each independently toggleable,
plus a master on/off switch and a "Send Test Message" button. All the
logic lives in `discord.js` on the server, scheduled with `node-cron`.
The webhook URL is **write-only from the UI's perspective** — once
saved, it's never sent back to any browser, even a Super Admin's, since
anyone holding it could post to your channel. The status shown is just
"Configured" / "Not configured."

**1-month automatic data retention.** Every night at 2am server time, a
background job deletes `transactions` rows older than 30 days. This
isn't configurable from the UI — it's a fixed job in `discord.js` — but
you can change the schedule/window by editing that file directly if you
need something different.

**Hosting/subscription renewal reminder.** Super Admin can record a
plan (1/6/12 months, shown with price *only* on that Super-Admin-only
screen) and an expiry date in Settings. Starting 5 days before that
date, everyone with Admin rank or above sees a banner at the top of the
app — it never states an amount, just prompts confirming payment with
the developer. This is a reminder for the account owner's own tracking,
not a payment gate or lockout — the app keeps working regardless of
what the date says.

**Live rate sync.** Billing no longer shows a possibly-stale cached
rate while fetching — the Print button stays disabled with a "Loading
rates..." label until a fresh fetch completes. While the Billing screen
stays open, it also listens for rate/density changes via Supabase
Realtime and updates instantly (with a toast) if an admin changes
something elsewhere — no reload needed. This requires Realtime enabled
on `daily_config`, which `sql/schema.sql` and migration `007` both
already do for you.

## Fifth round of fixes

**Fixed: deleting staff failed with a 500 / foreign-key error.**
`transactions.attendant_id` referenced `profiles(id)` with no `ON
DELETE` behavior (the Postgres default, `NO ACTION`), so deleting a
staff account that had ever billed anything was blocked outright —
exactly the error Supabase's own table editor surfaced. Fixed to `ON
DELETE SET NULL`: the login can now be deleted, its past bills stay
intact (the receipt still shows the attendant's name, since
`attendant_username` is a separate stored snapshot, not a live join),
and those bills still get cleaned up normally by the 1-month retention
job. **Run `sql/migrations/008_fix_staff_delete_fk.sql`** to pick this
up on an existing database.

**Backdated bills now ask for that day's rate.** A "Rate That Day
(₹/L)" field appears only when Backdated is selected, pre-filled with
today's rate as a starting point but editable — the bill is calculated
against and printed with whatever you enter there, not today's live
rate. Bills using "Current Time" are unaffected and still use today's
rate as before.

**The hosting-renewal banner is now visible to everyone**, not just
Admin ranks — so any staff member can notice it and flag it to an
admin, as asked.

**Subscription expiry: auto-calculate.** A "Renewed Today — Auto-Fill
Expiry" button in Settings → Hosting Subscription sets the expiry date
to today plus the selected plan's length, instead of requiring manual
date math.

**Fixed: brief flash of Super Admin-only settings for Admin accounts.**
The Super-Admin-only section of Settings was visible by default in the
HTML and only hidden by JavaScript after the role check finished,
creating a real (if brief) flash of content an Admin account shouldn't
see. It now starts hidden and is only revealed once the role is
confirmed. Also parallelized the rates fetch with the login/role check
on Billing and Settings (they don't actually depend on each other) to
shave a network round-trip off every page load, which should help with
switching between Billing and Settings feeling faster. Some of that
delay is inherent to this being a normal multi-page app (each switch is
a full page load, not a single-page-app transition) — that part isn't
something a targeted fix changes.

**Fixed: Discord messages arriving out of order and sometimes missing
entirely.** Both were symptoms of the same root cause — messages were
fired off concurrently with no ordering guarantee and no handling for
Discord's webhook rate limit (~5 requests/2 seconds), so a burst of
bills printed close together could get silently dropped by a 429
response. Rewrote `discord.js` around a proper send queue: every
message now goes through one at a time, in the order it was created,
with automatic retry (honoring Discord's own `retry_after`) if a send
is rate-limited or fails. I verified this fixes both symptoms with an
actual test — enqueuing three messages where the middle one is forced
to hit a simulated rate-limit and confirming all three still arrive in
original order. **Discord messages now also show the staff member's
display name**, not their login username, resolved server-side for
both bill notifications and the weekly/monthly summaries.

## Sixth round: error page & offline handling

**New `/error.html`** replaces the plain 404 template you sent over —
same illustration (`public/resources/bg.gif`), rebuilt with the app's
own navy/amber design system instead of Bootstrap + a green button.
Handles four situations via `?type=`: `404`, `500`, `offline`, and
`402` (available if you ever need a "payment required" message, but
nothing automatically triggers it — see the note below). Every variant
has a **Try Again** button (reloads the page) and a **Go to Home**
button (`/billing.html`, which is the correct landing spot for every
role — Station Staff, Admin, and Super Admin alike).

**The server actually routes to it now.** Any unmatched page URL
(a bad or old link, a typo) 302-redirects to `/error.html?type=404`.
Unmatched `/api/...` requests get a plain JSON 404 instead, so
`fetch()` callers elsewhere in the app aren't handed HTML they can't
parse. A generic error-handling middleware does the same for
unexpected 500s.

**Offline detection doesn't navigate you away.** Losing your
connection mid-bill and getting redirected to a whole other page would
lose whatever you'd typed, so this is a full-screen **overlay** instead
(`initOfflineWatcher()` in `public/js/ui.js`, self-starting on every
page that loads `ui.js` — which is now all of them, including login).
It appears the instant the browser fires its `offline` event, shows a
live "waiting for a connection..." status, and disappears on its own
the moment `online` fires — no page reload, nothing lost. `error.html`
itself uses the same live status text for the same reason, in case
someone lands there directly while offline.

**On the `402` type — being explicit about what this is and isn't.**
I added the message variant since you mentioned it, but I did **not**
wire up any automatic payment-enforcement logic that would trigger it
— nothing in the app currently redirects here based on subscription
status. That's consistent with the hosting-renewal banner from earlier:
it's a reminder for the account owner, not a lockout. If you do want an
actual enforced paywall at some point, that's a meaningfully bigger
(and more consequential) feature worth discussing directly rather than
something to bundle in quietly.

## Adding another receipt template

1. Copy `public/templates/bpclTokheim.js` (boxed/grid style) or
   `public/templates/ioclGilbarco.js` (colon-aligned dot-matrix style) to
   a new file, e.g. `public/templates/myBrand.js`.
2. Change `id`, `label`, and the HTML inside `render()`. If your new
   file declares any top-level `const`/`function`, wrap the whole thing
   in an IIFE like `ioclGilbarco.js` does.
   - Use `em` for any font-size you set, not `px` — the global "Receipt
     Text Size" control in Format only works if templates size things
     relative to the inherited base, not with their own fixed pixel
     values (that was a real bug in an earlier version).
   - Use `window.BillTemplates.randomFpId()` / `randomNozzleNo()` for
     FP ID / Nozzle No — don't add new admin-configured fields for
     these, every template generates them randomly per bill on purpose.
3. Add `<script src="/templates/myBrand.js"></script>` in both
   `billing.html` and `admin.html`, after `registry.js`.
4. It'll show up automatically in the Settings "Receipt Template" picker
   and in the Format panel's template picker.

## Project structure

```
server.js              Express server: static files, /env.js, RBAC-checked API, no-cache headers
discord.js              Discord webhooks + scheduled jobs (bill/weekly/monthly, 1-month wipe)
scripts/create-first-admin.js   Bootstraps the first Super Admin
sql/schema.sql                                            Full schema (fresh installs)
sql/migrations/002_photo_vehicle_mobile.sql               Incremental: logo/footer/vehicle/mobile
sql/migrations/003_logo_position_width_commands.sql       Incremental: logo position, width, commands
sql/migrations/004_format_panel.sql                       Incremental: global margin/spacing/font size
sql/migrations/005_logo_slider_random_pump_ids.sql        Incremental: logo slider, random FP/nozzle
sql/migrations/006_footer_space.sql                       Incremental: (superseded by 007's removal)
sql/migrations/007_super_admin_discord_subscription.sql   Incremental: roles, Discord, subscription
sql/migrations/008_fix_staff_delete_fk.sql                Incremental: fixes staff deletion (important)
public/
  login.html / login.js     Universal login, Remember Me
  billing.html / billing.js Lands here after login (everyone) — live rate sync
  admin.html / admin.js     "Settings" — role-gated: Super Admin sees everything, Admin sees rates only
  staff.html / staff.js     Add/deactivate/delete staff, scoped to caller's rank
  format.html / format.js   Live logo/margin/spacing/font-size editor (Super Admin only)
  integrations.html / integrations.js   Discord webhook setup (Super Admin only)
  error.html / error.js     404 / offline / 500 / 402 — matches the app's own design system
  resources/bg.gif           Illustration used by error.html and the offline overlay
  css/style.css              Shared design tokens + components
  js/supabaseClient.js       Builds the Supabase client, Remember Me storage adapter
  js/authGuard.js            Session + role check, 12h expiry, Billing/Settings switcher nav
  js/ui.js                   Toast, bottom-sheet picker, info popover, subscription banner, offline overlay, print helpers
  templates/                 One file per receipt layout
```

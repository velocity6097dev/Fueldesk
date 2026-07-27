-- =========================================================
-- FuelDesk schema
-- Run this in Supabase SQL editor on a fresh project.
--
-- If you're migrating from the old schema, drop the old
-- tables first (this WILL delete existing data):
--
--   drop table if exists transactions;
--   drop table if exists users;
--   drop table if exists daily_config;
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles
--    One row per login, linked 1:1 to a Supabase Auth user.
--    Created/deactivated only through the server's /api/staff
--    routes (using the service role key) — never directly
--    from the browser.
-- ---------------------------------------------------------
create table if not exists profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    username    varchar(50) unique not null,
    role        varchar(20) not null check (role in ('ADMIN_STAFF', 'STATION_STAFF')),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- Helper used inside RLS policies. SECURITY DEFINER so it can read
-- profiles even though profiles' own RLS would otherwise block the check.
create or replace function is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from profiles
        where id = uid and role = 'ADMIN_STAFF' and is_active = true
    );
$$;

alter table profiles enable row level security;

create policy "profiles: read own row"
    on profiles for select
    using (auth.uid() = id);

create policy "profiles: admins read all rows"
    on profiles for select
    using (is_admin(auth.uid()));

-- Intentionally no insert/update/delete policies for the "authenticated"
-- role. Staff are created/deactivated only via the server's service-role
-- key (server.js), which bypasses RLS entirely and double-checks the
-- caller is an active admin first.

-- ---------------------------------------------------------
-- 2. daily_config
--    Singleton row (id = 1) with per-product rate/density,
--    receipt template, and printed station details.
-- ---------------------------------------------------------
create table if not exists daily_config (
    id                int primary key default 1 check (id = 1),

    station_name      varchar(100) not null default 'Your Service Station',
    -- `text` (not varchar) because the admin UI is a textarea: line breaks
    -- typed there are stored as literal "\n" and reproduced on the receipt.
    station_address   text         not null default '',
    station_phone     varchar(30)  not null default '',
    station_gstin     varchar(30)  not null default '',

    -- Printed at the very bottom of every receipt. Supports "\n" line
    -- breaks and a tiny set of formatting commands (see the (i) button
    -- next to the field in the admin UI): <center>...</center>,
    -- <right>...</right>, <b>...</b>. Plain lines are left-aligned.
    receipt_footer    text         not null default '<center>Thank You! Please Visit Again..</center>',

    -- Optional custom logo shown at the top of the receipt instead of the
    -- plain text logo box. Uploaded to the "station-assets" storage bucket.
    logo_url            text,
    logo_width_mm       numeric(4,1) not null default 32.0 check (logo_width_mm between 15 and 50),
    logo_margin_top_mm  numeric(4,1) not null default 0 check (logo_margin_top_mm between 0 and 30),
    logo_margin_bottom_mm numeric(4,1) not null default 4 check (logo_margin_bottom_mm between 0 and 30),
    logo_align          varchar(10) not null default 'CENTER' check (logo_align in ('LEFT', 'CENTER', 'RIGHT')),

    -- Fixed identifiers some templates print (e.g. the classic dot-matrix
    -- Indian Oil layout). Free text since dealers label these differently.
    fp_id               varchar(10) not null default '1',
    nozzle_no           varchar(10) not null default '1',

    -- Printed receipt width, in centimeters. 5.8 = 58mm thermal paper
    -- (the common default), 8.0 = 80mm. Height is always "auto", like a
    -- real thermal roll — only width is fixed.
    receipt_width_cm   numeric(4,1) not null default 5.8 check (receipt_width_cm between 4 and 12),

    ms_rate           numeric(10,2) not null default 108.97,
    ms_density        numeric(6,1)  not null default 755.0,
    hsd_rate          numeric(10,2) not null default 92.00,
    hsd_density       numeric(6,1)  not null default 832.0,
    premium_rate      numeric(10,2) not null default 112.00,
    premium_density   numeric(6,1)  not null default 745.0,

    active_template   varchar(50) not null default 'BPCL_TOKHEIM',
    updated_at        timestamptz not null default now()
);

insert into daily_config (id) values (1)
    on conflict (id) do nothing;

alter table daily_config enable row level security;

create policy "daily_config: any signed-in user can read"
    on daily_config for select
    using (auth.role() = 'authenticated');

-- No write policies here on purpose: rate/density/template/station
-- details are only ever updated through the server's PUT /api/config
-- route, which checks the caller is an admin and then writes with the
-- service role key. This stops a station-staff account (or anyone who
-- opens dev tools) from changing prices directly through Supabase.

-- ---------------------------------------------------------
-- 3. transactions
--    Receipt numbers are assigned server-side by Postgres
--    (not by the browser's Math.random) so they can never collide.
-- ---------------------------------------------------------
create sequence if not exists receipt_seq start 1000;

create table if not exists transactions (
    id               bigserial primary key,
    receipt_no       varchar(20) unique,

    product          varchar(10) not null check (product in ('MS', 'HSD', 'PREMIUM')),
    rate             numeric(10,2) not null,
    density          numeric(6,1) not null,
    volume           numeric(10,3) not null,
    amount           numeric(10,2) not null,
    preset_type      varchar(10) not null check (preset_type in ('VOLUME', 'AMOUNT')),

    bill_datetime    timestamptz not null,
    bill_date        varchar(20) not null,   -- cached "DD/MM/YY" for fast receipt reprints
    bill_time        varchar(20) not null,   -- cached "HH:MM"
    is_backdated     boolean not null default false,

    vehicle_no       varchar(20),
    mobile_no        varchar(15),

    attendant_id       uuid references profiles(id),
    attendant_username varchar(50),

    created_at       timestamptz not null default now()
);

create or replace function set_receipt_no()
returns trigger
language plpgsql
as $$
begin
    if new.receipt_no is null then
        new.receipt_no := 'G' || nextval('receipt_seq');
    end if;
    return new;
end;
$$;

drop trigger if exists trg_set_receipt_no on transactions;
create trigger trg_set_receipt_no
    before insert on transactions
    for each row
    execute function set_receipt_no();

alter table transactions enable row level security;

create policy "transactions: staff insert their own bills"
    on transactions for insert
    with check (attendant_id = auth.uid());

create policy "transactions: staff read own, admins read all"
    on transactions for select
    using (attendant_id = auth.uid() or is_admin(auth.uid()));

-- No update/delete policy: printed bills are immutable. If you need
-- voids/refunds later, add a separate `voided` boolean + an admin-only
-- update policy rather than allowing edits to historical rows.

-- ---------------------------------------------------------
-- 4. Storage bucket for the receipt logo
--    Public read (so it can be embedded as an <img> on the printed
--    receipt without needing a signed URL); only admins can upload,
--    replace, or remove the file.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('station-assets', 'station-assets', true)
on conflict (id) do nothing;

create policy "station-assets: public read"
    on storage.objects for select
    using (bucket_id = 'station-assets');

create policy "station-assets: admins upload"
    on storage.objects for insert
    with check (bucket_id = 'station-assets' and is_admin(auth.uid()));

create policy "station-assets: admins update"
    on storage.objects for update
    using (bucket_id = 'station-assets' and is_admin(auth.uid()));

create policy "station-assets: admins delete"
    on storage.objects for delete
    using (bucket_id = 'station-assets' and is_admin(auth.uid()));

-- =========================================================
-- Migration 007: SUPER_ADMIN role tier, staff display names,
-- subscription renewal reminder fields, and the Discord
-- integrations table.
--
-- Safe to run even if you already applied 001-006.
-- =========================================================

-- ---- profiles: display_name + SUPER_ADMIN role ----
alter table profiles
    add column if not exists display_name varchar(80);

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
    check (role in ('SUPER_ADMIN', 'ADMIN_STAFF', 'STATION_STAFF'));

-- ---- is_admin() now also recognizes SUPER_ADMIN; is_super_admin() is new ----
create or replace function is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from profiles
        where id = uid and role in ('ADMIN_STAFF', 'SUPER_ADMIN') and is_active = true
    );
$$;

create or replace function is_super_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from profiles
        where id = uid and role = 'SUPER_ADMIN' and is_active = true
    );
$$;

-- ---- Promote your existing admin(s) ----
-- After running this migration, promote whichever account should be
-- the Super Admin (everyone else who was ADMIN_STAFF stays ADMIN_STAFF,
-- now restricted to rates/density + managing station staff only):
--
--   update profiles set role = 'SUPER_ADMIN' where username = 'yourname';

-- ---- daily_config: subscription renewal reminder ----
alter table daily_config
    add column if not exists subscription_plan varchar(10);

alter table daily_config
    add column if not exists subscription_expiry_date date;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'daily_config_subscription_plan_check') then
        alter table daily_config add constraint daily_config_subscription_plan_check check (subscription_plan in ('1M', '6M', '12M'));
    end if;
end $$;

-- ---- integrations: Discord webhook (service-role only, see schema.sql for why) ----
create table if not exists integrations (
    id                              int primary key default 1 check (id = 1),
    discord_webhook_url             text,
    discord_enabled                 boolean not null default false,
    discord_notify_bill_created     boolean not null default true,
    discord_notify_weekly_summary   boolean not null default true,
    discord_notify_monthly_summary  boolean not null default true,
    updated_at                      timestamptz not null default now()
);

insert into integrations (id) values (1)
    on conflict (id) do nothing;

alter table integrations enable row level security;
-- No policies at all on purpose — only the service role (server.js) can
-- read or write this table, so the webhook URL is never exposed to any
-- browser client.

-- ---- Realtime: lets billing.js sync rate/density changes live ----
do $$
begin
    execute 'alter publication supabase_realtime add table daily_config';
exception when duplicate_object then
    null; -- already added, nothing to do
end $$;

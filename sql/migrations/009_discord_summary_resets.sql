-- =========================================================
-- Migration 009: weekly/monthly Discord summary "reset" pointers.
--
-- Previously the weekly/monthly summaries counted a fixed rolling
-- window (last 7 / last 30 days) every time the cron job ran. Now
-- each period counts bills since the last time that summary was
-- actually sent — sending a summary (cron or the manual "Today"
-- button's siblings) bumps the pointer to now(), which is the
-- "reset the count to 0" behaviour.
--
-- Safe to run even if you already applied 001-008.
-- =========================================================

alter table integrations
    add column if not exists discord_weekly_reset_at timestamptz not null default now();

alter table integrations
    add column if not exists discord_monthly_reset_at timestamptz not null default now();

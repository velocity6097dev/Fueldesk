-- =========================================================
-- Migration 010: fix discord_weekly_reset_at / discord_monthly_reset_at
-- values on installs that already ran migration 009 before its default
-- was corrected. Those got stamped with the exact moment the migration
-- ran (e.g. 2026-08-02 19:58:56 UTC) instead of a clean IST calendar
-- boundary. This snaps them to the correct boundary as of right now:
--   - weekly  -> most recent Monday, 00:00 IST
--   - monthly -> the 1st of the current month, 00:00 IST
--
-- Safe to run more than once — it's idempotent, always recomputing
-- from the current date.
-- =========================================================

update integrations
set
    discord_weekly_reset_at  = date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',
    discord_monthly_reset_at = date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
where id = 1;

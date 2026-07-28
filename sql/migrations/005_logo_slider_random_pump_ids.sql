-- =========================================================
-- Migration 005: continuous logo position (for a slider instead
-- of Left/Center/Right buttons), logo aspect-ratio lock, and
-- removal of the FP ID / Nozzle No admin fields (every template
-- now generates those randomly per bill instead).
--
-- Safe to run even if you already applied 001-004.
-- =========================================================

alter table daily_config
    add column if not exists logo_position_pct numeric(5,1) not null default 50.0;

alter table daily_config
    add column if not exists logo_ratio_locked boolean not null default true;

alter table daily_config
    add column if not exists logo_height_mm numeric(4,1);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'daily_config_logo_position_pct_check') then
        alter table daily_config add constraint daily_config_logo_position_pct_check check (logo_position_pct between 0 and 100);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_logo_height_mm_check') then
        alter table daily_config add constraint daily_config_logo_height_mm_check check (logo_height_mm between 5 and 60);
    end if;
end $$;

-- Carry over the old Left/Center/Right choice as a starting slider
-- position, if the old logo_align column still exists from an earlier
-- install (harmless no-op otherwise).
do $$
begin
    if exists (select 1 from information_schema.columns where table_name = 'daily_config' and column_name = 'logo_align') then
        update daily_config set logo_position_pct = case logo_align
            when 'LEFT' then 0
            when 'RIGHT' then 100
            else 50
        end;
    end if;
end $$;

-- logo_align, fp_id, and nozzle_no are no longer read by the app (the
-- logo now uses a continuous slider position, and FP/Nozzle are
-- generated randomly per bill by every template). Left in place rather
-- than dropped, in case you have reporting/exports that reference them
-- — safe to drop yourself later if you're sure you don't need them:
--
--   alter table daily_config drop column if exists logo_align;
--   alter table daily_config drop column if exists fp_id;
--   alter table daily_config drop column if exists nozzle_no;

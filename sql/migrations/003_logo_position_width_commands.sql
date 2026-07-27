-- =========================================================
-- Migration 003: logo positioning (top/bottom spacing + align),
-- FP/nozzle identifiers, configurable receipt width, and the
-- new <center>/<right>/<b> footer/address command syntax.
--
-- Safe to run even if you already applied 001/002 — every
-- statement is idempotent.
-- =========================================================

alter table daily_config
    add column if not exists logo_margin_top_mm numeric(4,1) not null default 0;

alter table daily_config
    add column if not exists logo_margin_bottom_mm numeric(4,1) not null default 4;

alter table daily_config
    add column if not exists logo_align varchar(10) not null default 'CENTER';

alter table daily_config
    add column if not exists fp_id varchar(10) not null default '1';

alter table daily_config
    add column if not exists nozzle_no varchar(10) not null default '1';

alter table daily_config
    add column if not exists receipt_width_cm numeric(4,1) not null default 5.8;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'daily_config_logo_margin_top_mm_check') then
        alter table daily_config add constraint daily_config_logo_margin_top_mm_check check (logo_margin_top_mm between 0 and 30);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_logo_margin_bottom_mm_check') then
        alter table daily_config add constraint daily_config_logo_margin_bottom_mm_check check (logo_margin_bottom_mm between 0 and 30);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_logo_align_check') then
        alter table daily_config add constraint daily_config_logo_align_check check (logo_align in ('LEFT', 'CENTER', 'RIGHT'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_width_cm_check') then
        alter table daily_config add constraint daily_config_receipt_width_cm_check check (receipt_width_cm between 4 and 12);
    end if;
end $$;

-- If your footer is still the plain old default text (i.e. you haven't
-- customized it yet), upgrade it to use the new <center> command so it
-- keeps rendering centered like before. If you've already edited it,
-- this does nothing.
update daily_config
set receipt_footer = '<center>Thank You! Please Visit Again..</center>'
where id = 1 and receipt_footer = 'Thank You! Please Visit Again..';

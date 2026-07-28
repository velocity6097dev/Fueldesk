-- =========================================================
-- Migration 004: global receipt formatting (margin, top space,
-- line spacing, base font size) — editable live in the new
-- Format panel, applied on top of whichever template is active.
--
-- Safe to run even if you already applied 001/002/003.
-- =========================================================

alter table daily_config
    add column if not exists receipt_margin_mm numeric(4,1) not null default 3.0;

alter table daily_config
    add column if not exists receipt_margin_top_mm numeric(4,1) not null default 0;

alter table daily_config
    add column if not exists receipt_line_spacing numeric(3,2) not null default 1.20;

alter table daily_config
    add column if not exists receipt_base_font_px numeric(4,1) not null default 11.0;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_margin_mm_check') then
        alter table daily_config add constraint daily_config_receipt_margin_mm_check check (receipt_margin_mm between 0 and 15);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_margin_top_mm_check') then
        alter table daily_config add constraint daily_config_receipt_margin_top_mm_check check (receipt_margin_top_mm between 0 and 20);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_line_spacing_check') then
        alter table daily_config add constraint daily_config_receipt_line_spacing_check check (receipt_line_spacing between 1.0 and 2.0);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_base_font_px_check') then
        alter table daily_config add constraint daily_config_receipt_base_font_px_check check (receipt_base_font_px between 8 and 16);
    end if;
end $$;

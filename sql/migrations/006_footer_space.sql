-- =========================================================
-- Migration 006: space after the footer (extra feed before
-- tear-off), plus fixes to margin-collapsing and the logo/
-- text-size interaction — those are code-only changes (in
-- registry.js and style.css), nothing else to run for them.
--
-- Safe to run even if you already applied 001-005.
-- =========================================================

alter table daily_config
    add column if not exists receipt_footer_space_mm numeric(4,1) not null default 4.0;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_footer_space_mm_check') then
        alter table daily_config add constraint daily_config_receipt_footer_space_mm_check check (receipt_footer_space_mm between 0 and 30);
    end if;
end $$;

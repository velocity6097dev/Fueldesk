    -- =========================================================
    -- Migration 011: print "ink" controls — text darkness (light vs
    -- dark print) and text thickness (thin vs bold print). Editable
    -- live in the Format panel, applied on top of whichever template
    -- is active, same mechanism as margin/line-spacing/font-size.
    --
    -- Safe to run even if you already applied earlier migrations.
    -- =========================================================

    alter table daily_config
        add column if not exists receipt_print_darkness_pct numeric(5,1) not null default 100.0;

    alter table daily_config
        add column if not exists receipt_text_thickness_pct numeric(5,1) not null default 0.0;

    do $$
    begin
        if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_print_darkness_pct_check') then
            alter table daily_config add constraint daily_config_receipt_print_darkness_pct_check check (receipt_print_darkness_pct between 20 and 100);
        end if;
        if not exists (select 1 from pg_constraint where conname = 'daily_config_receipt_text_thickness_pct_check') then
            alter table daily_config add constraint daily_config_receipt_text_thickness_pct_check check (receipt_text_thickness_pct between 0 and 100);
        end if;
    end $$;

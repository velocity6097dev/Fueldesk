-- =========================================================
-- Migration 002: multi-line address, receipt footer, logo,
-- vehicle/mobile number capture.
--
-- Safe to run even if you already applied sql/schema.sql from
-- before this change — every statement is idempotent.
-- =========================================================

alter table daily_config
    alter column station_address type text;

alter table daily_config
    add column if not exists receipt_footer text not null default 'Thank You! Please Visit Again..';

alter table daily_config
    add column if not exists logo_url text;

alter table daily_config
    add column if not exists logo_width_mm numeric(4,1) not null default 32.0;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'daily_config_logo_width_mm_check'
    ) then
        alter table daily_config
            add constraint daily_config_logo_width_mm_check check (logo_width_mm between 15 and 50);
    end if;
end $$;

alter table transactions
    add column if not exists vehicle_no varchar(20);

alter table transactions
    add column if not exists mobile_no varchar(15);

-- Storage bucket + policies for the receipt logo (see schema.sql section 4
-- for the full explanation).
insert into storage.buckets (id, name, public)
values ('station-assets', 'station-assets', true)
on conflict (id) do nothing;

do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'station-assets: public read') then
        create policy "station-assets: public read"
            on storage.objects for select
            using (bucket_id = 'station-assets');
    end if;

    if not exists (select 1 from pg_policies where policyname = 'station-assets: admins upload') then
        create policy "station-assets: admins upload"
            on storage.objects for insert
            with check (bucket_id = 'station-assets' and is_admin(auth.uid()));
    end if;

    if not exists (select 1 from pg_policies where policyname = 'station-assets: admins update') then
        create policy "station-assets: admins update"
            on storage.objects for update
            using (bucket_id = 'station-assets' and is_admin(auth.uid()));
    end if;

    if not exists (select 1 from pg_policies where policyname = 'station-assets: admins delete') then
        create policy "station-assets: admins delete"
            on storage.objects for delete
            using (bucket_id = 'station-assets' and is_admin(auth.uid()));
    end if;
end $$;

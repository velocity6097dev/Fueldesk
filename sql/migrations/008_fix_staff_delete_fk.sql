-- =========================================================
-- Migration 008: fixes staff deletion (the FK from transactions
-- had no ON DELETE behavior, so deleting a staff account with
-- any billing history failed with a foreign-key error / 500).
--
-- Safe to run even if you already applied 001-007.
-- =========================================================

alter table transactions
    drop constraint if exists transactions_attendant_id_fkey;

alter table transactions
    add constraint transactions_attendant_id_fkey
    foreign key (attendant_id) references profiles(id) on delete set null;

-- Nothing else to do here — display names in Discord messages and the
-- backdated custom rate are resolved/entered in application code
-- (discord.js and billing.js), no further schema changes needed for
-- those.

-- ============================================================================
-- Petbnb MVP — Step 5.5 — Pet health fields
-- Run AFTER 0005_admin_rpc.sql.
--
-- Adds three nullable text columns to public.pets so the customer profile's
-- "My Cats" section can capture the medical context a host needs before
-- accepting a booking. All existing rows default to NULL (no backfill needed).
--
-- No RLS changes: the existing pets policies (owner read/write + host read
-- via live booking, admin bypass) cover these new columns automatically.
-- ============================================================================

alter table public.pets add column if not exists medical_needs        text;
alter table public.pets add column if not exists dietary_restrictions text;
alter table public.pets add column if not exists medications          text;

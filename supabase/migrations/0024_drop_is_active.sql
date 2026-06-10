-- Step 8i — final cleanup of the legacy is_active column.
--
-- Background: migration 0021 added the listings.status text column and
-- a bidirectional bridge trigger (listings_sync_is_active) keeping
-- is_active aligned with status during the 8b read+write migration
-- window. By 8b every app read and write in src/ targets status; only
-- is_active itself, the bridge trigger, and the (unused) is_active
-- index referenced the legacy column. This migration removes them all.
--
-- Safe order: trigger first (so no event handler references the
-- function it depends on after the function is gone), then the
-- function (idempotent if absent), then the index (if it exists from
-- 0001), then the column.

drop trigger if exists listings_sync_is_active on public.listings;
drop function if exists public.sync_listing_is_active();
-- The original 0001 migration didn't create an is_active index, but
-- some local environments may have added one ad-hoc; drop defensively.
drop index if exists public.listings_is_active_idx;
alter table public.listings drop column if exists is_active;


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Column is gone.
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'listings'
--     and column_name = 'is_active';
--   expect: 0 rows.
--
-- 2. Trigger is gone.
--   select tgname from pg_trigger
--   where tgrelid = 'public.listings'::regclass
--     and tgname = 'listings_sync_is_active';
--   expect: 0 rows.
--
-- 3. Function is gone.
--   select proname from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'sync_listing_is_active';
--   expect: 0 rows.
--
-- 4. status column still present + healthy.
--   select status, count(*) from public.listings group by status order by status;
--   expect: rows distributed across pending/approved/paused/admin_disabled
--   as expected for your data.

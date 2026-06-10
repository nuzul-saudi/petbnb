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
-- function (idempotent if absent), then any policy still referencing
-- is_active gets rewritten to reference status='approved' (Postgres
-- refuses DROP COLUMN otherwise — RLS USING/WITH CHECK expressions
-- are real dependencies), then the index, then the column.
--
-- The three policies below were defined in migration 0004 and still
-- carry `is_active = true` predicates. We DROP + recreate each with
-- the same shape but `status = 'approved'` substituted. Same external
-- behavior — anon/authenticated callers see the same set of rows the
-- 8b read migration already lined up with at the app layer.

drop trigger if exists listings_sync_is_active on public.listings;
drop function if exists public.sync_listing_is_active();


-- ============================================================
-- Rewrite the three policies that depend on is_active
-- (defined in migration 0004; bodies preserved verbatim except for
-- `is_active = true` → `status = 'approved'`).
-- ============================================================

drop policy if exists "listings_select_active_verified_or_own" on public.listings;
create policy "listings_select_active_verified_or_own"
  on public.listings for select
  to anon, authenticated
  using (
    public.is_admin()
    or host_id = (select auth.uid())
    or (
      status = 'approved'
      and exists (
        select 1 from public.profiles host
        where host.id = listings.host_id
          and host.is_verified = true
          and host.is_suspended = false
      )
    )
  );

drop policy if exists "listing_photos_select_public_or_host" on public.listing_photos;
create policy "listing_photos_select_public_or_host"
  on public.listing_photos for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.listings l
      where l.id = listing_photos.listing_id
        and (
          l.host_id = (select auth.uid())
          or (
            l.status = 'approved'
            and exists (
              select 1 from public.profiles host
              where host.id = l.host_id
                and host.is_verified = true
                and host.is_suspended = false
            )
          )
        )
    )
  );

drop policy if exists "listing_photos_storage_select_public_or_host" on storage.objects;
create policy "listing_photos_storage_select_public_or_host"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'listing-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.listings l
        where l.id::text = (storage.foldername(name))[1]
          and (
            l.host_id = (select auth.uid())
            or (
              l.status = 'approved'
              and exists (
                select 1 from public.profiles host
                where host.id = l.host_id
                  and host.is_verified = true
                  and host.is_suspended = false
              )
            )
          )
      )
    )
  );


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

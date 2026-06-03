-- Step 7 prep: condition reports become HOST-ONLY filing.
--
-- The original policies (0004 row-level, 0003 storage) allowed BOTH the
-- booking owner AND the listing host to file condition reports. The
-- intended design is host-only — the host is the evidence-of-record
-- provider; the owner is a read-only reviewer.
--
-- SELECT policies stay unchanged (both owner and host can still READ
-- both the rows and the photo blobs). UPDATE/DELETE remain absent, so
-- the immutability invariant is preserved at both levels.
--
-- Renaming convention: _insert_participants → _insert_host, matching
-- the pattern from 0004's daily_updates_insert_host and 0014's
-- daily_updates_update_host. Makes the host-only intent visible at
-- grep time.


-- ============================================================
-- 1. condition_reports — row-level INSERT (host only)
-- ============================================================
-- Drop both old and new policy names so the migration is idempotent
-- whether or not it's been (partially) applied before.
drop policy if exists "condition_reports_insert_participants" on public.condition_reports;
drop policy if exists "condition_reports_insert_host"         on public.condition_reports;
create policy "condition_reports_insert_host"
  on public.condition_reports for insert
  to authenticated
  with check (
    public.is_active_user()
    and reporter_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = condition_reports.booking_id
        and l.host_id = (select auth.uid())
    )
  );


-- ============================================================
-- 2. Storage: condition-report-photos bucket INSERT (host only)
-- ============================================================
-- Mirrors the row-level tightening so a host can't insert a row but
-- have its photos rejected (or vice versa). Path convention from
-- 0003: condition-report-photos/<booking_id>/<filename> — the booking
-- id is the first segment.
drop policy if exists "condition_report_photos_storage_insert_participants" on storage.objects;
drop policy if exists "condition_report_photos_storage_insert_host"         on storage.objects;
create policy "condition_report_photos_storage_insert_host"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'condition-report-photos'
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and l.host_id = (select auth.uid())
    )
  );

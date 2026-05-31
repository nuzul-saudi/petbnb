-- Step 6.3 follow-up: restrict daily_updates host UPDATE + DELETE to
-- run only while the related booking is in status = 'active'.
--
-- Migration 0014 allowed edit + delete regardless of booking status
-- (the gate was app-layer only). This migration tightens RLS so the
-- database itself rejects writes once the stay is no longer active —
-- belt-and-braces against UI bugs, stale clients, or direct API calls.
--
-- The shape is identical to 0014 except for an added `and b.status =
-- 'active'` inside the EXISTS subquery. INSERT and SELECT policies are
-- intentionally left alone (the INSERT compose path is UI-gated on
-- active; SELECT must keep working for past entries so owner and host
-- can still read them after the stay completes).

-- ---- UPDATE ----
drop policy if exists "daily_updates_update_host" on public.daily_updates;
create policy "daily_updates_update_host"
  on public.daily_updates for update
  to authenticated
  using (
    public.is_active_user()
    and host_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = daily_updates.booking_id
        and l.host_id = (select auth.uid())
        and b.status = 'active'
    )
  )
  with check (
    public.is_active_user()
    and host_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = daily_updates.booking_id
        and l.host_id = (select auth.uid())
        and b.status = 'active'
    )
  );

-- ---- DELETE ----
drop policy if exists "daily_updates_delete_host" on public.daily_updates;
create policy "daily_updates_delete_host"
  on public.daily_updates for delete
  to authenticated
  using (
    public.is_active_user()
    and host_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = daily_updates.booking_id
        and l.host_id = (select auth.uid())
        and b.status = 'active'
    )
  );

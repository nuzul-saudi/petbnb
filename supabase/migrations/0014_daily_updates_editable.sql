-- Step 6.3: make daily_updates editable + deletable by the original host.
--
-- Pre-existing policies on public.daily_updates:
--   SELECT: owner + host + admin (daily_updates_select_participants)
--   INSERT: host posting on their own listing (daily_updates_insert_host)
-- There were no UPDATE or DELETE policies, so rows were effectively
-- immutable once posted. This migration deliberately relaxes that:
-- the host can now edit + delete their own updates while they still own
-- the booking's listing. Owners remain read-only. Admin is NOT bypassed
-- here; moderation of daily updates goes through other channels for now.

-- ---- UPDATE ----
-- USING gates which existing rows can be touched.
-- WITH CHECK gates what the row may look like after the UPDATE — both
-- mirror the INSERT policy so the host can't reassign host_id away from
-- themselves or move the row to a booking on a listing they don't own.
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
    )
  );

-- ---- DELETE ----
-- Same gating as UPDATE's USING clause. (DELETE policies don't take a
-- WITH CHECK — there's no post-delete row to validate.)
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
    )
  );

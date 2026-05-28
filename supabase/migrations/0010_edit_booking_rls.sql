-- Step 5.6F: relax child-table RLS to support owner-side edits.
--
-- Booking edits (5.6F) are restricted to status='requested' on the app
-- side (and verified server-side via the EXISTS subquery below). Once
-- the host has accepted, child tables become immutable again — the
-- WHERE on bookings.status enforces it at the row level.
--
-- INSERT policies on both tables already exist (migrations 0002, 0007,
-- 0009) and stay as-is. This migration adds UPDATE and DELETE.
--
-- Why DELETE: the edit flow is delete-old-children + insert-fresh-children
-- rather than a surgical diff. Cleaner code, fewer edge cases.


-- ============================================================
-- 1. booking_pets — UPDATE + DELETE for owner while 'requested'
-- ============================================================

-- UPDATE: owner can swap pets on a requested booking. The with-check
-- guard re-validates ownership of the (possibly new) pet to prevent
-- attaching another user's pet via an edit.
drop policy if exists "booking_pets_update_owner_while_requested"
  on public.booking_pets;
create policy "booking_pets_update_owner_while_requested"
  on public.booking_pets for update
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_pets.booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'requested'
    )
  )
  with check (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_pets.booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'requested'
    )
    and exists (
      -- The pet being assigned must still belong to the booking owner
      -- (defence in depth — prevents attaching another user's pet via edit).
      select 1 from public.pets p
      where p.id = booking_pets.pet_id
        and p.owner_id = (select auth.uid())
    )
  );

-- DELETE: lets the edit flow drop old child rows before re-inserting
-- a fresh set. Same status='requested' gate.
drop policy if exists "booking_pets_delete_owner_while_requested"
  on public.booking_pets;
create policy "booking_pets_delete_owner_while_requested"
  on public.booking_pets for delete
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_pets.booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'requested'
    )
  );


-- ============================================================
-- 2. booking_addons — UPDATE + DELETE for owner while 'requested'
-- ============================================================

-- UPDATE: same status='requested' gate as booking_pets. The with-check
-- mirrors the 0009 INSERT guard: if pet_id is set, it must reference a
-- pet currently attached to this booking.
drop policy if exists "booking_addons_update_owner_while_requested"
  on public.booking_addons;
create policy "booking_addons_update_owner_while_requested"
  on public.booking_addons for update
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_addons.booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'requested'
    )
  )
  with check (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_addons.booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'requested'
    )
    and (
      -- If pet_id is set on the updated row, it must reference a pet
      -- attached to this booking (mirrors the 0009 INSERT guard).
      booking_addons.pet_id is null
      or exists (
        select 1 from public.booking_pets bp
        where bp.booking_id = booking_addons.booking_id
          and bp.pet_id = booking_addons.pet_id
      )
    )
  );

-- DELETE: lets the edit flow drop the old add-on rows before
-- re-inserting a fresh set. Same status='requested' gate.
drop policy if exists "booking_addons_delete_owner_while_requested"
  on public.booking_addons;
create policy "booking_addons_delete_owner_while_requested"
  on public.booking_addons for delete
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_addons.booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'requested'
    )
  );

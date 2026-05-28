-- ============================================================================
-- Petbnb MVP — Step 5.6D: per-pet pricing + per-pet add-ons
-- Run AFTER 0008_pet_breed_other.sql.
--
-- Four changes, in order:
--   1. listings.additional_pet_discount — host's discount on pets 2..n.
--   2. bookings snapshot columns — keep original pricing if host edits later.
--   3. booking_addons.pet_id — optional per-pet scoping for add-ons.
--   4. booking_addons INSERT RLS — when pet_id is set, must belong to a pet
--      that's actually attached to this booking.
-- ============================================================================


-- ============================================================
-- 1. listings.additional_pet_discount
-- ============================================================
-- Fraction OFF the nightly rate for pets 2..n. 0.70 = 70% off, so additional
-- pets pay 30% of nightly. First pet always full price. Host-configurable
-- later (Step 7); platform default 0.70.
alter table public.listings
  add column if not exists additional_pet_discount numeric(3,2)
    not null default 0.70
    check (additional_pet_discount >= 0 and additional_pet_discount <= 1);


-- ============================================================
-- 2. bookings snapshot columns
-- ============================================================
-- additional_pet_discount = the listing's discount captured at booking time
-- (so later host edits don't retroactively reprice an existing booking).
-- base_subtotal_sar = computed base hosting cost across all pets, all nights,
-- at booking time. Relationship at write time:
--   total_sar = base_subtotal_sar + addons_total_sar
-- (base_price_sar stays as-is = nightly rate snapshot for the FIRST pet.)
-- Both nullable because existing rows predate this migration; new rows
-- always set them in code.
alter table public.bookings
  add column if not exists additional_pet_discount numeric(3,2)
    check (additional_pet_discount is null
           or (additional_pet_discount >= 0 and additional_pet_discount <= 1)),
  add column if not exists base_subtotal_sar integer
    check (base_subtotal_sar is null or base_subtotal_sar >= 0);


-- ============================================================
-- 3. booking_addons.pet_id (optional per-pet scoping)
-- ============================================================
-- null = booking-wide add-on (e.g. transport applies to the whole stay).
-- set  = add-on applies to that specific pet (grooming / vet / insurance).
-- No discount on add-ons — each per-pet add-on is full price per pet.
alter table public.booking_addons
  add column if not exists pet_id uuid references public.pets(id) on delete restrict;

create index if not exists booking_addons_pet_id_idx
  on public.booking_addons(pet_id);


-- ============================================================
-- 4. booking_addons INSERT RLS hardening
-- ============================================================
-- Keeps the existing owner-only insert (active user, owns the booking) and
-- adds: if pet_id is set, it must reference a pet already attached to this
-- booking via booking_pets. Prevents attaching add-ons to pets not in the
-- booking, or to other users' pets.
drop policy if exists "booking_addons_insert_owner" on public.booking_addons;
create policy "booking_addons_insert_owner"
  on public.booking_addons for insert
  to authenticated
  with check (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_addons.booking_id
        and b.owner_id = (select auth.uid())
    )
    and (
      booking_addons.pet_id is null
      or exists (
        select 1 from public.booking_pets bp
        where bp.booking_id = booking_addons.booking_id
          and bp.pet_id = booking_addons.pet_id
      )
    )
  );

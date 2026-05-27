-- ============================================================================
-- Petbnb MVP — Step 5.6 schema
-- Run AFTER 0006_pet_health_fields.sql.
--
-- Three things in this migration:
--   1. New junction table public.booking_pets so a booking can reference
--      multiple pets (one cat, two cats, eventually dog+cat). The existing
--      bookings.pet_id column stays in place for now — Step 5.6B backfills
--      it INTO booking_pets so no Step 5 data is lost. A later migration
--      (post-5.6 verification) drops bookings.pet_id once no callers
--      remain on the singular field.
--   2. lat / lng columns on listings (both nullable; geocoded later for
--      new listings, backfilled for the 5 seed listings below).
--   3. Seed-listing lat/lng backfill (Riyadh neighborhood coordinates
--      provided by the founder).
-- ============================================================================


-- ============================================================
-- 1. booking_pets junction table
-- ============================================================
create table if not exists public.booking_pets (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  pet_id     uuid not null references public.pets(id)     on delete restrict,
  created_at timestamptz not null default now(),
  primary key (booking_id, pet_id)
);

-- Composite PK indexes (booking_id, pet_id). We also want lookups by pet
-- ("which bookings is this pet in?") to be fast — separate index.
create index if not exists booking_pets_pet_id_idx
  on public.booking_pets(pet_id);

alter table public.booking_pets enable row level security;

-- SELECT: booking owner, listing host, or admin. Mirrors bookings_select.
drop policy if exists "booking_pets_select_owner_or_host" on public.booking_pets;
create policy "booking_pets_select_owner_or_host"
  on public.booking_pets for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = booking_pets.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

-- INSERT: only the booking owner can attach pets, and only while not
-- suspended. Admins do not insert these (no admin bypass on INSERT —
-- bookings.insert mirrors this stance).
drop policy if exists "booking_pets_insert_owner" on public.booking_pets;
create policy "booking_pets_insert_owner"
  on public.booking_pets for insert
  to authenticated
  with check (
    public.is_active_user()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_pets.booking_id
        and b.owner_id = (select auth.uid())
    )
  );

-- No UPDATE policy — junction rows are immutable (you delete + re-insert
-- if you need to change pets). Defaults to deny under RLS.
-- No DELETE policy — pets locked in at booking time (same as
-- booking_addons). Defaults to deny under RLS.


-- ============================================================
-- 2. lat / lng on listings
-- ============================================================
-- numeric(9,6) gives ~10cm precision; ample for distance sort.
-- Nullable: new self-registered listings won't have a value until
-- geocoded (post-5.6 work). The owner feed gracefully hides the
-- distance line for listings without coordinates.
alter table public.listings
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);


-- ============================================================
-- 3. Backfill existing data
-- ============================================================
-- 3a. Copy every existing bookings.pet_id into booking_pets so Step 5
-- bookings (the test "بسبس" booking and any other from 5.5 testing)
-- aren't orphaned when the app starts reading the junction table.
-- ON CONFLICT DO NOTHING makes this re-runnable.
insert into public.booking_pets (booking_id, pet_id)
select id, pet_id from public.bookings
on conflict do nothing;

-- 3b. Riyadh neighborhood centroids for the 5 seed listings.
-- Coordinates from founder; sourced from public mapping data.
update public.listings set lat = 24.8138, lng = 46.6347 where neighborhood = 'الياسمين';
update public.listings set lat = 24.7873, lng = 46.6342 where neighborhood = 'الملقا';
update public.listings set lat = 24.7569, lng = 46.6322 where neighborhood = 'النخيل';
update public.listings set lat = 24.6900, lng = 46.6900 where neighborhood = 'العليا';
update public.listings set lat = 24.7300, lng = 46.6900 where neighborhood = 'الورود';

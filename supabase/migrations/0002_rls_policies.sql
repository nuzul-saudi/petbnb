-- ============================================================================
-- Petbnb MVP — Row Level Security (Step 3 of build plan)
-- Run this AFTER 0001_initial_schema.sql.
--
-- Conventions used below:
--   * `(select auth.uid())` (not bare `auth.uid()`) — Supabase performance
--     recommendation; lets Postgres treat the call as an initPlan instead of
--     re-evaluating per row.
--   * Tables with no UPDATE/DELETE policy are deliberately immutable. RLS
--     denies-by-default on enabled tables, so the absence of a policy is the
--     enforcement.
--   * Column-level rules (e.g., "owner can only change `status`") are not
--     enforced here — RLS is row-scoped. The app layer enforces field rules.
--
-- KNOWN TRADE-OFF: bookings UPDATE is row-level permissive — either the
-- owner or the host can update the row. Column-level transition rules
-- (e.g., only host can set status='accepted', only owner can cancel a
-- 'requested' booking) are enforced in app code in Step 8. Future
-- hardening: move to triggers / column-level grants if abuse is observed.
-- ============================================================================


-- ============================================================
-- Enable RLS on every table (deny by default; policies opt in)
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.pets              enable row level security;
alter table public.listings          enable row level security;
alter table public.listing_photos    enable row level security;
alter table public.bookings          enable row level security;
alter table public.booking_addons    enable row level security;
alter table public.condition_reports enable row level security;
alter table public.daily_updates     enable row level security;
alter table public.messages          enable row level security;
alter table public.reviews           enable row level security;
alter table public.products          enable row level security;


-- ============================================================
-- profiles
-- ============================================================
-- Authenticated users can read any profile so booking parties see each
-- other's display name + avatar. Anonymous visitors cannot.
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Self-insert exists for completeness; in practice the trigger
-- on_auth_user_created (SECURITY DEFINER) handles inserts.
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No DELETE policy — profiles cascade only via auth.users deletion.


-- ============================================================
-- pets
-- ============================================================
-- Owner sees their own pets unconditionally. A host also sees any pet
-- that's part of a booking on one of their listings — but ONLY while
-- the booking is in a live lifecycle state. A host who declined or had
-- the booking cancelled loses read access immediately; a host who
-- completed (or is currently disputing) the booking retains it as
-- history.
create policy "pets_select_owner_or_booking_host"
  on public.pets for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.pet_id = pets.id
        and l.host_id = (select auth.uid())
        and b.status in ('requested', 'accepted', 'active', 'completed', 'disputed')
    )
  );

create policy "pets_insert_owner"
  on public.pets for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "pets_update_owner"
  on public.pets for update
  to authenticated
  using      (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "pets_delete_owner"
  on public.pets for delete
  to authenticated
  using (owner_id = (select auth.uid()));


-- ============================================================
-- listings
-- ============================================================
-- Anyone (incl. anon) can browse active listings. Hosts always see all
-- their own listings, including inactive ones.
create policy "listings_select_active_or_own"
  on public.listings for select
  to anon, authenticated
  using (
    is_active = true
    or host_id = (select auth.uid())
  );

create policy "listings_insert_host"
  on public.listings for insert
  to authenticated
  with check (host_id = (select auth.uid()));

create policy "listings_update_host"
  on public.listings for update
  to authenticated
  using      (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy "listings_delete_host"
  on public.listings for delete
  to authenticated
  using (host_id = (select auth.uid()));


-- ============================================================
-- listing_photos  (visibility mirrors the parent listing)
-- ============================================================
create policy "listing_photos_select_public_or_host"
  on public.listing_photos for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_photos.listing_id
        and (l.is_active = true or l.host_id = (select auth.uid()))
    )
  );

create policy "listing_photos_insert_host"
  on public.listing_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_photos.listing_id
        and l.host_id = (select auth.uid())
    )
  );

create policy "listing_photos_update_host"
  on public.listing_photos for update
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_photos.listing_id
        and l.host_id = (select auth.uid())
    )
  );

create policy "listing_photos_delete_host"
  on public.listing_photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_photos.listing_id
        and l.host_id = (select auth.uid())
    )
  );


-- ============================================================
-- bookings
-- ============================================================
create policy "bookings_select_owner_or_host"
  on public.bookings for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id
        and l.host_id = (select auth.uid())
    )
  );

-- New bookings always start as 'requested' and belong to the caller.
create policy "bookings_insert_owner"
  on public.bookings for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'requested'
  );

-- Either side can update the row; column-level allowed transitions
-- (owner cancels; host accepts/declines/marks active/completed) are
-- enforced in app code, not here.
create policy "bookings_update_owner_or_host"
  on public.bookings for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id
        and l.host_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id
        and l.host_id = (select auth.uid())
    )
  );

-- No DELETE — bookings are an auditable record.


-- ============================================================
-- booking_addons
-- ============================================================
create policy "booking_addons_select_owner_or_host"
  on public.booking_addons for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = booking_addons.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

-- Only the owner attaches addons (at booking-creation time).
create policy "booking_addons_insert_owner"
  on public.booking_addons for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_addons.booking_id
        and b.owner_id = (select auth.uid())
    )
  );

-- No UPDATE/DELETE — addons are locked at booking time.


-- ============================================================
-- condition_reports  (IMMUTABLE)
-- ============================================================
create policy "condition_reports_select_participants"
  on public.condition_reports for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = condition_reports.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

create policy "condition_reports_insert_participants"
  on public.condition_reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = condition_reports.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

-- No UPDATE/DELETE — evidence is immutable.


-- ============================================================
-- daily_updates  (IMMUTABLE; host-only insert)
-- ============================================================
create policy "daily_updates_select_participants"
  on public.daily_updates for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = daily_updates.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

create policy "daily_updates_insert_host"
  on public.daily_updates for insert
  to authenticated
  with check (
    host_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = daily_updates.booking_id
        and l.host_id = (select auth.uid())
    )
  );

-- No UPDATE/DELETE.


-- ============================================================
-- messages  (IMMUTABLE)
-- ============================================================
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = messages.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = messages.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

-- No UPDATE/DELETE.


-- ============================================================
-- reviews
-- ============================================================
-- Ratings are public so anon browsers can judge hosts before signing up.
create policy "reviews_select_public"
  on public.reviews for select
  to anon, authenticated
  using (true);

-- One review per booking per rater is enforced by the UNIQUE constraint
-- on (booking_id, rater_id). This policy enforces: the rater is a real
-- participant in the booking, the booking is completed, and they're
-- rating the *other* party.
create policy "reviews_insert_participant_after_completed"
  on public.reviews for insert
  to authenticated
  with check (
    rater_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = reviews.booking_id
        and b.status = 'completed'
        and (
          (b.owner_id = (select auth.uid()) and reviews.ratee_id = l.host_id)
          or (l.host_id = (select auth.uid()) and reviews.ratee_id = b.owner_id)
        )
    )
  );

-- No UPDATE/DELETE — reviews are permanent.


-- ============================================================
-- products  (read-only marketplace; admin-managed in dashboard)
-- ============================================================
create policy "products_select_public"
  on public.products for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE — products are seeded by Supabase dashboard only.

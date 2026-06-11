-- Round 2 behavior batch — single migration covering three concerns.
-- Apply AFTER the Round 1 migrations (0024–0028) per the same protocol
-- as previous unattended batches: Omar reviews the SQL, then runs it
-- in the Supabase SQL Editor.
--
-- Parts:
--   1. Self-booking guard — bookings_insert_owner RLS tightened so
--      a host cannot insert a booking against their own listing.
--      App-level surfaces in listings/[id]/index.tsx + request.tsx +
--      createBookingRequest land in the same R2C1 commit.
--   2. Guest-mode policies — anon SELECT on the surfaces guests need
--      to browse: listings (status='approved' filter), listing_photos,
--      listing_blocked_dates. The existing 0024 policies already let
--      anon read these for verified+approved listings; this part
--      verifies + tightens them. Listings_select_active_verified_or_own
--      already covers anon — but we double-check the photo + blocked-
--      dates policies have anon coverage.
--   3. Two-way reviews — INSERT policy on reviews that lets the
--      booking owner OR the listing host write exactly one review per
--      booking, but only after the booking has reached 'completed'.
--      Read policy for authenticated viewers (anon stays out — guest
--      mode shows aggregates only, not individual reviews). The
--      unique(booking_id, rater_id) constraint from 0001 is the
--      backstop against double-reviews.

-- ============================================================
-- PART 1 — Self-booking guard
-- ============================================================
--
-- Tighten bookings_insert_owner with an extra with-check clause:
--   owner_id <> (select host_id from public.listings l where l.id = listing_id)
-- The owner of the booking row cannot equal the host of the target
-- listing. Combined with the existing app-level throw, a crafted
-- API call that bypasses the UI still gets rejected.

drop policy if exists "bookings_insert_owner" on public.bookings;
create policy "bookings_insert_owner"
  on public.bookings for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and owner_id = (select auth.uid())
      and status = 'requested'
      and owner_id <> (
        select host_id from public.listings l where l.id = listing_id
      )
    )
  );


-- ============================================================
-- PART 2 — Guest-mode policies
-- ============================================================
--
-- The owner feed + listing detail screens become accessible to anon
-- visitors in the same commit (R2C3). Storage + public-table SELECTs
-- for anon are mostly already in place from 0004 / 0024 (every active-
-- verified listing visible to anon, photos visible via storage policy,
-- listing_blocked_dates visible to authenticated). We need:
--   - listing_blocked_dates SELECT for anon (date-picker pre-check)
--
-- The 0027 policy was 'to authenticated' only. Anon needs read access
-- so a signed-out visitor on the listing detail can still see when
-- the host is blocked. The trigger is the hard gate at write time;
-- this is read-only.

drop policy if exists "listing_blocked_dates_select_authenticated"
  on public.listing_blocked_dates;
drop policy if exists "listing_blocked_dates_select_public"
  on public.listing_blocked_dates;
create policy "listing_blocked_dates_select_public"
  on public.listing_blocked_dates for select
  to anon, authenticated
  using (true);


-- ============================================================
-- PART 3 — Two-way reviews policies
-- ============================================================
--
-- Reviews schema was created in 0001 with RLS enabled but no policies
-- (a deliberate "ship the table, design the policies later" move).
-- This is "later". Three policies:
--
--   reviews_insert_participant — INSERT one row per (booking, rater)
--     where:
--       • rater_id = auth.uid()
--       • the booking exists, is 'completed', and the rater is
--         either its owner_id OR its listing's host_id
--       • the ratee_id is THE OTHER party (owner → host, host → owner)
--     The unique(booking_id, rater_id) constraint from 0001 prevents
--     double-reviews from the same rater on the same booking.
--
--   reviews_select_authenticated — any signed-in user can read
--     reviews. Used by the public listing card to show host rating
--     aggregates + by the booking detail to show "you already
--     reviewed". Anon is intentionally NOT included — guest mode
--     shows pre-aggregated stars on cards via the existing rollup;
--     individual reviews stay behind sign-in for now.
--
--   reviews_update / reviews_delete — DELIBERATELY ABSENT. Reviews
--     are immutable once posted (mirrors condition_reports immutability
--     from 0017). If a rater wants a change, MVP answer is "ask
--     admin" — a future moderation workflow can introduce an admin-
--     only update path.

drop policy if exists "reviews_insert_participant" on public.reviews;
create policy "reviews_insert_participant"
  on public.reviews for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and rater_id = (select auth.uid())
      and exists (
        select 1
        from public.bookings b
        join public.listings l on l.id = b.listing_id
        where b.id = reviews.booking_id
          and b.status = 'completed'
          and (
            -- Owner reviewing host:  rater = owner_id, ratee = host_id
            (rater_id = b.owner_id  and ratee_id = l.host_id)
            -- Host reviewing owner: rater = host_id, ratee = owner_id
            or (rater_id = l.host_id and ratee_id = b.owner_id)
          )
      )
    )
  );

drop policy if exists "reviews_select_authenticated" on public.reviews;
create policy "reviews_select_authenticated"
  on public.reviews for select
  to authenticated
  using (true);


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. bookings_insert_owner has the self-booking guard.
--   select pg_get_expr(polwithcheck, polrelid) from pg_policy
--   where polname = 'bookings_insert_owner'
--     and polrelid = 'public.bookings'::regclass;
--   expect: output mentions `owner_id <> ( select host_id from public.listings`
--
-- 2. listing_blocked_dates SELECT now includes anon.
--   select polroles::regrole[] from pg_policy
--   where polname = 'listing_blocked_dates_select_public'
--     and polrelid = 'public.listing_blocked_dates'::regclass;
--   expect: array contains both anon and authenticated.
--
-- 3. Three review policies present (insert/select; no update/delete).
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.reviews'::regclass
--   order by polname;
--   expect:
--     reviews_insert_participant       INSERT
--     reviews_select_authenticated     SELECT
--     (no UPDATE, no DELETE — reviews are immutable)
--
-- 4. Self-booking smoke (run as a host of an approved listing):
--   insert into public.bookings (listing_id, owner_id, pet_id, start_date,
--     end_date, base_price_sar, base_subtotal_sar, additional_pet_discount,
--     total_sar, addons_total_sar, status)
--   values
--     ('<your listing id>', auth.uid(), '<a pet id you own>',
--      '2026-08-01','2026-08-02', 100, 100, 0, 100, 0, 'requested');
--   expect: RLS rejection (new row violates row-level security policy).

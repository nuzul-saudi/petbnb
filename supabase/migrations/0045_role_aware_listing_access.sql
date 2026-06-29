-- ============================================================
-- 0045 — Role-aware listing visibility + editability (Option A)
-- ============================================================
--
-- Founder decision (locked 2026-06-29, Strategy review cleared):
-- when an admin demotes a user from role='host' \xe2\x86\x92 role='owner',
-- the user's listings should INSTANTLY become invisible to the
-- public AND un-editable by the former host \xe2\x80\x94 reversibly, on
-- re-promotion.
--
-- Pre-0045 the schema gates visibility on host.is_verified +
-- host.is_suspended but NOT host.role. A demoted user's
-- is_verified stays true (admin only flipped role, per the
-- locked pure-flip semantics), so their listings stay browsable
-- and editable. This migration closes that gap.
--
-- Design covered in docs/migration-0045-plan.md \xe2\x80\x94 read that for
-- the rationale. This SQL implements the full sweep cleared by
-- Strategy on 2026-06-29:
--
--   6 visibility sites (listing's-host's current role, inline
--                      `host.role = 'host'` in the existing
--                      EXISTS / top-level USING):
--     1. listings_select_active_verified_or_own  (was 0024)
--     2. available_listings RPC                  (was 0036) \xe2\xad\x90
--        — the make-or-break feed gate, SECURITY DEFINER, would
--          otherwise bypass any RLS change
--     3. profiles_select_public_host_anon        (was 0037)
--     4. inquiries_insert_starter                (was 0040)
--     5. listing_photos_select_public_or_host    (was 0024)
--     6. listing_photos_storage_select_public_or_host (was 0024)
--
--   ~14 editability sites (caller's current role via the new
--                          is_host() helper, alongside the
--                          existing host_id + is_active_user
--                          checks):
--     listings_update_host                       (was 0004)
--     listing_drafts_select_host_or_admin        (was 0022)
--     listing_drafts_insert_host                 (was 0022)
--     listing_drafts_update_host                 (was 0022)
--     listing_drafts_delete_host                 (was 0022)
--     listing_photos_insert_host                 (was 0004)
--     listing_photos_update_host                 (was 0002)
--     listing_photos_delete_host                 (was 0002)
--     listing_photo_drafts_select_host_or_admin  (was 0022)
--     listing_photo_drafts_insert_host           (was 0022)
--     listing_photo_drafts_update_host           (was 0022)
--     listing_photo_drafts_delete_host           (was 0022)
--     listing_blocked_dates_insert_host          (was 0027)
--     listing_blocked_dates_update_host          (was 0027)
--     listing_blocked_dates_delete_host          (was 0027)
--
-- NOT touched:
--   * listings_insert_host (0039) \xe2\x80\x94 already requires role='host'.
--   * storage MUTATION policies (0003) \xe2\x80\x94 left untouched per the
--     plan; orphan cleanup is the existing pattern.
--   * Any profile column writes (no is_verified /
--     host_application_status / host_profile_complete mutation
--     happens here \xe2\x80\x94 pure reversible role flip per (f) of plan).
--
-- ============================================================
-- LEGITIMACY CHECK
-- ============================================================
-- For every change below, a real (non-demoted) host with
-- role='host' satisfies the new clause trivially. The gate only
-- bites users whose role is NOT 'host' \xe2\x80\x94 i.e. exactly the
-- demotion case this migration addresses.
--
-- ============================================================
-- ANON CAVEAT
-- ============================================================
-- The visibility policies that touch anon (listings,
-- listing_photos rows, storage.objects, profiles) gain ONE more
-- column read on the existing profile probe (host.role).
-- Information about a demoted host's identity / phone / photo
-- URLs becomes inaccessible to anon \xe2\x80\x94 a tightening, never a
-- widening.


-- ============================================================
-- 1. public.is_host() helper
-- ============================================================
-- Mirrors public.is_active_user() from 0004 + 0038:
--   * STABLE \xe2\x80\x94 single read of profiles row keyed by auth.uid().
--   * SECURITY DEFINER \xe2\x80\x94 same hardening pattern as the other
--     policy helpers; bypasses caller column grants on profiles
--     so the function works even from anon contexts (it'll just
--     return false there, since auth.uid() is null).
--   * search_path = public \xe2\x80\x94 pinned to prevent the classic
--     SECURITY DEFINER privilege escalation via a malicious
--     search_path override.
--
-- Returns true iff the caller is signed in AND their profile
-- row has role='host'. Returns false for anon, for users with
-- role='owner' or role='admin', and for the rare case where the
-- profiles row hasn't been backfilled yet.

create or replace function public.is_host()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role = 'host'
      from public.profiles
      where id = (select auth.uid())
    ),
    false
  );
$$;


-- ============================================================
-- 2. VISIBILITY SWEEP \xe2\x80\x94 6 sites gated on listing's-host's role
-- ============================================================
-- All six follow the same inline pattern: the existing EXISTS
-- (or top-level USING for the profiles anon policy) already
-- joins the listing's host (or queries the profile row itself);
-- add `host.role = 'host'` (or `role = 'host'`) alongside the
-- existing `is_verified` + `is_suspended` clauses. Every other
-- byte of every policy is preserved.


-- 2a. listings_select_active_verified_or_own (was 0024).
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
          and host.role = 'host'         -- NEW 0045
          and host.is_verified = true
          and host.is_suspended = false
      )
    )
  );


-- 2b. available_listings RPC (was 0036). THE FEED GATE.
-- Body preserved BYTE-IDENTICAL except for the one new clause in
-- the host-visibility EXISTS. Signature, return type, language,
-- stability, SECURITY DEFINER, search_path \xe2\x80\x94 all unchanged.
-- All other predicate clauses (status, city/neighborhood, female-
-- only, grooming, no-resident-pets, price band, dates,
-- blocked-range, capacity, order, limit, offset) byte-identical.

create or replace function public.available_listings(
  p_search_start          date,
  p_search_end            date,
  p_pet_count             integer default 1,
  p_city                  text    default null,
  p_neighborhood          text    default null,
  p_female_only           boolean default false,
  p_grooming_only         boolean default false,
  p_no_resident_pets_only boolean default false,
  p_min_price_sar         numeric default null,
  p_max_price_sar         numeric default null,
  p_limit                 integer default 20,
  p_offset                integer default 0
)
returns setof public.listings
language sql
stable
security definer
set search_path = public
as $$
  select l.*
  from public.listings l
  where l.status = 'approved'
    -- 0045 \xe2\x80\x94 add host.role='host' to the 0036 visibility EXISTS.
    -- Without this the RPC still surfaces demoted hosts' listings
    -- even after policy 2a above filters them out at the
    -- hydration step. The RPC is SECURITY DEFINER so it bypasses
    -- the listings_select policy; the predicate has to be mirrored
    -- here as it was for is_verified + is_suspended in 0036.
    and exists (
      select 1
      from public.profiles host
      where host.id = l.host_id
        and host.role = 'host'           -- NEW 0045
        and host.is_verified = true
        and host.is_suspended = false
    )
    and (p_city is null or l.city = p_city)
    and (p_neighborhood is null or l.neighborhood = p_neighborhood)
    and (not coalesce(p_female_only, false) or l.host_gender = 'female')
    and (not coalesce(p_grooming_only, false) or l.offers_grooming = true)
    and (not coalesce(p_no_resident_pets_only, false) or l.has_resident_pets = false)
    and (p_min_price_sar is null or l.nightly_price_sar >= p_min_price_sar)
    and (p_max_price_sar is null or l.nightly_price_sar <= p_max_price_sar)
    and p_search_end > p_search_start
    and not exists (
      select 1
      from public.listing_blocked_dates lb
      where lb.listing_id = l.id
        and p_search_start < lb.end_date
        and p_search_end   > lb.start_date
    )
    and l.max_concurrent_pets >= coalesce(p_pet_count, 1) + coalesce((
      select sum(
        greatest(
          (select count(*) from public.booking_pets where booking_id = b.id),
          1
        )
      )::integer
      from public.bookings b
      where b.listing_id = l.id
        and b.status in ('accepted', 'active')
        and p_search_start < b.end_date
        and p_search_end   > b.start_date
    ), 0)
  order by l.created_at desc
  limit  coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;

-- Re-state GRANT for parity with 0036 (CREATE OR REPLACE
-- preserves grants but being explicit avoids surprise).
grant execute on function public.available_listings(
  date, date, integer, text, text, boolean, boolean, boolean,
  numeric, numeric, integer, integer
) to anon, authenticated;


-- 2c. profiles_select_public_host_anon (was 0037).
-- Top-level USING gains `and role = 'host'`. This is the
-- profile's OWN role, not a JOIN \xe2\x80\x94 unlike the other 5
-- visibility sites which look up the LISTING's host, here the
-- row IS the host. Same intent: a demoted user's row is no
-- longer anon-visible.
--
-- Existing column-level GRANTs to anon (from 0037 sections 2 +
-- 3) are UNCHANGED \xe2\x80\x94 the policy filters which ROWS anon can
-- see; the GRANTs filter which COLUMNS. Both stay correctly
-- scoped together.

drop policy if exists "profiles_select_public_host_anon" on public.profiles;
create policy "profiles_select_public_host_anon"
  on public.profiles for select
  to anon
  using (
    role = 'host'                        -- NEW 0045
    and is_verified = true
    and is_suspended = false
  );


-- 2d. inquiries_insert_starter (was 0040).
-- Pre-0045 a guest could POST an inquiry against any
-- approved-listing-by-verified-host pair. Add host.role='host'
-- to the visibility EXISTS so a demoted host's listing can't
-- have fresh inquiries opened against it (existing inquiries
-- aren't affected \xe2\x80\x94 their existence is governed by
-- inquiries_select_participants which doesn't change).
--
-- Every other byte of the policy is preserved BYTE-IDENTICAL
-- from 0040.

drop policy if exists "inquiries_insert_starter" on public.inquiries;
create policy "inquiries_insert_starter"
  on public.inquiries for insert
  to authenticated
  with check (
    public.is_active_user()
    and starter_id = (select auth.uid())
    and status = 'open'
    -- Snapshot lock: host_id at creation must equal listing.host_id
    -- right now. Combined with the EXISTS below, also enforces that
    -- the listing actually exists.
    and host_id = (
      select l.host_id from public.listings l
      where l.id = inquiries.listing_id
    )
    -- Public-visibility predicate \xe2\x80\x94 same as
    -- listings_select_active_verified_or_own (now policy 2a).
    and exists (
      select 1
      from public.listings l
      join public.profiles host on host.id = l.host_id
      where l.id = inquiries.listing_id
        and l.status = 'approved'
        and host.role = 'host'           -- NEW 0045
        and host.is_verified = true
        and host.is_suspended = false
    )
  );


-- 2e. listing_photos_select_public_or_host (was 0024).
-- Photo-ROW visibility. Add host.role='host' to the inner
-- EXISTS that probes the host's profile. The l.host_id =
-- auth.uid() short-circuit stays so the host can read their
-- own photos regardless of role (preserves their ability to
-- see their library in the host UI even right after demotion,
-- before the UX gate ships).

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
                and host.role = 'host'   -- NEW 0045
                and host.is_verified = true
                and host.is_suspended = false
            )
          )
        )
    )
  );


-- 2f. listing_photos_storage_select_public_or_host (was 0024).
-- Storage bucket READ policy on storage.objects. Gates the
-- actual image files (not just the DB rows). Same shape as
-- the DB-row policy above \xe2\x80\x94 inner EXISTS gains host.role='host'.

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
                  and host.role = 'host' -- NEW 0045
                  and host.is_verified = true
                  and host.is_suspended = false
              )
            )
          )
      )
    )
  );


-- ============================================================
-- 3. EDITABILITY SWEEP \xe2\x80\x94 caller's current role via is_host()
-- ============================================================
-- Every host-scoped mutation policy gains `and public.is_host()`
-- alongside its existing checks. Admin bypass stays unchanged
-- (admin can mutate regardless of role).
--
-- Strategy answer on the draft-SELECT decision: YES \xe2\x80\x94 gate the
-- two _select_host_or_admin policies on caller role too.
-- Consistent with the edit-block: a demoted user reading drafts
-- of edits they can no longer publish is incoherent.


-- 3a. listings_update_host (was 0004).

drop policy if exists "listings_update_host" on public.listings;
create policy "listings_update_host"
  on public.listings for update
  to authenticated
  using (
    public.is_admin()
    or (
      host_id = (select auth.uid())
      and public.is_active_user()
      and public.is_host()                -- NEW 0045
    )
  )
  with check (
    public.is_admin()
    or (
      host_id = (select auth.uid())
      and public.is_active_user()
      and public.is_host()                -- NEW 0045
    )
  );


-- 3b. listing_drafts \xe2\x80\x94 SELECT + INSERT + UPDATE + DELETE.

drop policy if exists "listing_drafts_select_host_or_admin" on public.listing_drafts;
create policy "listing_drafts_select_host_or_admin"
  on public.listing_drafts for select
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_host()                    -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_drafts_insert_host" on public.listing_drafts;
create policy "listing_drafts_insert_host"
  on public.listing_drafts for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_drafts_update_host" on public.listing_drafts;
create policy "listing_drafts_update_host"
  on public.listing_drafts for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_drafts_delete_host" on public.listing_drafts;
create policy "listing_drafts_delete_host"
  on public.listing_drafts for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- 3c. listing_photos \xe2\x80\x94 INSERT + UPDATE + DELETE.
-- SELECT was 2e (visibility branch); the host-self-read path
-- inside uses l.host_id = auth.uid() with no is_host() check
-- so the host can still read their own photos to inspect what's
-- in their library even right after demotion (consistent with
-- the visibility design \xe2\x80\x94 they're not public-visible, but the
-- former host can see their own catalog).

drop policy if exists "listing_photos_insert_host" on public.listing_photos;
create policy "listing_photos_insert_host"
  on public.listing_photos for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photos.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_photos_update_host" on public.listing_photos;
create policy "listing_photos_update_host"
  on public.listing_photos for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photos.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_photos_delete_host" on public.listing_photos;
create policy "listing_photos_delete_host"
  on public.listing_photos for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photos.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- 3d. listing_photo_drafts \xe2\x80\x94 SELECT + INSERT + UPDATE + DELETE.

drop policy if exists "listing_photo_drafts_select_host_or_admin" on public.listing_photo_drafts;
create policy "listing_photo_drafts_select_host_or_admin"
  on public.listing_photo_drafts for select
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_host()                    -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_photo_drafts_insert_host" on public.listing_photo_drafts;
create policy "listing_photo_drafts_insert_host"
  on public.listing_photo_drafts for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_photo_drafts_update_host" on public.listing_photo_drafts;
create policy "listing_photo_drafts_update_host"
  on public.listing_photo_drafts for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_photo_drafts_delete_host" on public.listing_photo_drafts;
create policy "listing_photo_drafts_delete_host"
  on public.listing_photo_drafts for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- 3e. listing_blocked_dates \xe2\x80\x94 INSERT + UPDATE + DELETE.
-- The SELECT policy listing_blocked_dates_select_public (from
-- 0029) is public-readable and intentionally NOT role-gated:
-- the booking-request UI shows blocked dates as visually dimmed
-- on the calendar even to anon viewers, so the read remains
-- open. A demoted host's listings no longer surface in the feed
-- (policy 2a), so anon never sees the blocked-dates rows in
-- practice \xe2\x80\x94 the public read is harmless.

drop policy if exists "listing_blocked_dates_insert_host" on public.listing_blocked_dates;
create policy "listing_blocked_dates_insert_host"
  on public.listing_blocked_dates for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_blocked_dates_update_host" on public.listing_blocked_dates;
create policy "listing_blocked_dates_update_host"
  on public.listing_blocked_dates for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

drop policy if exists "listing_blocked_dates_delete_host" on public.listing_blocked_dates;
create policy "listing_blocked_dates_delete_host"
  on public.listing_blocked_dates for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and public.is_host()                -- NEW 0045
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- ============================================================
-- Verification queries \xe2\x80\x94 run after applying.
-- ============================================================
--
-- 1. is_host() helper exists, SECURITY DEFINER, search_path pinned.
--
--   select proname, prosecdef, proconfig
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'is_host';
--   expect: 1 row. prosecdef = t. proconfig contains
--           'search_path=public'.
--
-- 2. All 6 visibility sites now reference host.role / role check.
--
--   -- 2a. listings_select_active_verified_or_own
--   select pg_get_expr(qual, polrelid) ilike '%host.role = ''host''%'
--     from pg_policies
--    where schemaname = 'public'
--      and tablename = 'listings'
--      and policyname = 'listings_select_active_verified_or_own';
--   expect: t.
--
--   -- 2b. available_listings RPC body
--   select pg_get_functiondef(p.oid) ilike '%host.role = ''host''%'
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'available_listings';
--   expect: t.
--
--   -- 2c. profiles_select_public_host_anon \xe2\x80\x94 top-level USING
--   --     references the OWN role column (not the joined alias).
--   select pg_get_expr(qual, polrelid) ilike '%role = ''host''%'
--     from pg_policies
--    where schemaname = 'public'
--      and tablename = 'profiles'
--      and policyname = 'profiles_select_public_host_anon';
--   expect: t.
--
--   -- 2d. inquiries_insert_starter \xe2\x80\x94 the EXISTS body.
--   select pg_get_expr(with_check, polrelid) ilike '%host.role = ''host''%'
--     from pg_policies
--    where schemaname = 'public'
--      and tablename = 'inquiries'
--      and policyname = 'inquiries_insert_starter';
--   expect: t.
--
--   -- 2e. listing_photos_select_public_or_host
--   select pg_get_expr(qual, polrelid) ilike '%host.role = ''host''%'
--     from pg_policies
--    where schemaname = 'public'
--      and tablename = 'listing_photos'
--      and policyname = 'listing_photos_select_public_or_host';
--   expect: t.
--
--   -- 2f. listing_photos_storage_select_public_or_host
--   --     (storage.objects, not public.*)
--   select pg_get_expr(qual, polrelid) ilike '%host.role = ''host''%'
--     from pg_policies
--    where schemaname = 'storage'
--      and tablename = 'objects'
--      and policyname = 'listing_photos_storage_select_public_or_host';
--   expect: t.
--
-- 3. Editability sweep: every host-scoped mutation policy
--    references is_host().
--
--   select schemaname, tablename, policyname,
--          (pg_get_expr(qual, polrelid) ilike '%is_host()%'
--           or pg_get_expr(with_check, polrelid) ilike '%is_host()%') as has_is_host
--     from pg_policies
--    where schemaname = 'public'
--      and policyname in (
--        'listings_update_host',
--        'listing_drafts_select_host_or_admin',
--        'listing_drafts_insert_host',
--        'listing_drafts_update_host',
--        'listing_drafts_delete_host',
--        'listing_photos_insert_host',
--        'listing_photos_update_host',
--        'listing_photos_delete_host',
--        'listing_photo_drafts_select_host_or_admin',
--        'listing_photo_drafts_insert_host',
--        'listing_photo_drafts_update_host',
--        'listing_photo_drafts_delete_host',
--        'listing_blocked_dates_insert_host',
--        'listing_blocked_dates_update_host',
--        'listing_blocked_dates_delete_host'
--      );
--   expect: 15 rows, all has_is_host = t.
--
-- 4. listings_insert_host (0039) is UNCHANGED.
--
--   select pg_get_expr(with_check, polrelid)
--     from pg_policies
--    where schemaname = 'public'
--      and tablename = 'listings'
--      and policyname = 'listings_insert_host';
--   expect: 1 row, the 0039 predicate (mentions role = 'host'
--           AND host_application_status = 'approved' AND
--           host_profile_complete = true). NOT mentioning
--           is_host() (the helper isn't used here).
--
-- 5. Behavioral spot-check (manual on a non-prod listing):
--    a) Admin: select a host's user_id (h_id) with at least one
--       approved listing visible in available_listings.
--    b) Note the listing visible to anon via available_listings.
--    c) update profiles set role='owner' where id = h_id;
--    d) Re-run available_listings; the listing disappears.
--       Re-run a row read against public.listings as anon for
--       that listing id; RLS hides it.
--       Re-fetch the host's profiles row as anon; RLS hides it.
--    e) update profiles set role='host' where id = h_id;
--    f) Re-run all three of (d); everything reappears.
--    g) During the entire test, NO is_verified /
--       host_application_status / host_profile_complete row
--       was mutated by 0045's code path \xe2\x80\x94 only the manual
--       role flip in (c) and (e).

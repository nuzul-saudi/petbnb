-- ============================================================================
-- Petbnb MVP — Step 4.5 — Admin role, host verification, account suspension
-- Run AFTER 0003_storage_buckets.sql.
--
-- This migration:
--   1. Extends profiles.role CHECK to allow 'admin'.
--   2. Adds profiles.is_verified (host trust badge — admin gates feed
--      visibility on this per CLAUDE.md §12).
--   3. Adds profiles.is_suspended (admin block — affected user can sign
--      in but cannot insert listings, bookings, messages, etc.).
--   4. Creates two helper functions: public.is_admin() and
--      public.is_active_user(). Both are STABLE so the planner can treat
--      them as initPlans, avoiding per-row re-eval.
--   5. Drops and recreates every RLS policy that needs admin-bypass,
--      suspend-block, or the Q6 verified-host visibility gating
--      (listings + listing_photos, plus the matching storage policies).
-- ============================================================================


-- ============================================================
-- 1. Schema
-- ============================================================
-- Replace the role CHECK so 'admin' is allowed.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'host', 'both', 'admin'));

-- New booleans. Default false so existing rows remain in pending/active state.
alter table public.profiles add column if not exists is_verified  boolean not null default false;
alter table public.profiles add column if not exists is_suspended boolean not null default false;


-- ============================================================
-- 2. Helper functions
-- ============================================================
-- True iff the calling user has role='admin'. STABLE so the planner can
-- cache the result across rows in the same query.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- True iff the calling user is NOT suspended. Defaults to false (i.e., treat
-- "no profile yet" as suspended) so a transient missing-profile state can't
-- accidentally permit writes.
create or replace function public.is_active_user()
returns boolean
language sql
stable
as $$
  select coalesce(
    not (
      select is_suspended
      from public.profiles
      where id = (select auth.uid())
    ),
    false
  );
$$;


-- ============================================================
-- 3. Recreate table RLS policies (drop + create for each that changes)
-- ============================================================

-- ---- profiles ----
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using      (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());


-- ---- pets ----
drop policy if exists "pets_select_owner_or_booking_host" on public.pets;
create policy "pets_select_owner_or_booking_host"
  on public.pets for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.pet_id = pets.id
        and l.host_id = (select auth.uid())
        and b.status in ('requested', 'accepted', 'active', 'completed', 'disputed')
    )
  );

drop policy if exists "pets_insert_owner" on public.pets;
create policy "pets_insert_owner"
  on public.pets for insert
  to authenticated
  with check (
    public.is_admin()
    or (owner_id = (select auth.uid()) and public.is_active_user())
  );

drop policy if exists "pets_update_owner" on public.pets;
create policy "pets_update_owner"
  on public.pets for update
  to authenticated
  using (
    public.is_admin()
    or (owner_id = (select auth.uid()) and public.is_active_user())
  )
  with check (
    public.is_admin()
    or (owner_id = (select auth.uid()) and public.is_active_user())
  );

drop policy if exists "pets_delete_owner" on public.pets;
create policy "pets_delete_owner"
  on public.pets for delete
  to authenticated
  using (
    public.is_admin()
    or (owner_id = (select auth.uid()) and public.is_active_user())
  );


-- ---- listings (Q6 visibility rewrite + admin bypass) ----
-- Anon and authenticated users see a listing IFF it is active AND its host
-- is verified AND its host is not suspended. Hosts always see their own
-- listings regardless of state (so they can manage drafts). Admins see all.
drop policy if exists "listings_select_active_or_own" on public.listings;
create policy "listings_select_active_verified_or_own"
  on public.listings for select
  to anon, authenticated
  using (
    public.is_admin()
    or host_id = (select auth.uid())
    or (
      is_active = true
      and exists (
        select 1 from public.profiles host
        where host.id = listings.host_id
          and host.is_verified = true
          and host.is_suspended = false
      )
    )
  );

drop policy if exists "listings_insert_host" on public.listings;
create policy "listings_insert_host"
  on public.listings for insert
  to authenticated
  with check (
    public.is_admin()
    or (host_id = (select auth.uid()) and public.is_active_user())
  );

drop policy if exists "listings_update_host" on public.listings;
create policy "listings_update_host"
  on public.listings for update
  to authenticated
  using (
    public.is_admin()
    or (host_id = (select auth.uid()) and public.is_active_user())
  )
  with check (
    public.is_admin()
    or (host_id = (select auth.uid()) and public.is_active_user())
  );

drop policy if exists "listings_delete_host" on public.listings;
create policy "listings_delete_host"
  on public.listings for delete
  to authenticated
  using (
    public.is_admin()
    or (host_id = (select auth.uid()) and public.is_active_user())
  );


-- ---- listing_photos (mirror listings: Q6 gating + admin bypass) ----
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
            l.is_active = true
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

drop policy if exists "listing_photos_insert_host" on public.listing_photos;
create policy "listing_photos_insert_host"
  on public.listing_photos for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
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
      and exists (
        select 1 from public.listings l
        where l.id = listing_photos.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- ---- bookings ----
drop policy if exists "bookings_select_owner_or_host" on public.bookings;
create policy "bookings_select_owner_or_host"
  on public.bookings for select
  to authenticated
  using (
    public.is_admin()
    or owner_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id
        and l.host_id = (select auth.uid())
    )
  );

drop policy if exists "bookings_insert_owner" on public.bookings;
create policy "bookings_insert_owner"
  on public.bookings for insert
  to authenticated
  with check (
    -- Admins don't book on behalf of others; no admin bypass on insert.
    owner_id = (select auth.uid())
    and status = 'requested'
    and public.is_active_user()
  );

drop policy if exists "bookings_update_owner_or_host" on public.bookings;
create policy "bookings_update_owner_or_host"
  on public.bookings for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and (
        owner_id = (select auth.uid())
        or exists (
          select 1 from public.listings l
          where l.id = bookings.listing_id
            and l.host_id = (select auth.uid())
        )
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and (
        owner_id = (select auth.uid())
        or exists (
          select 1 from public.listings l
          where l.id = bookings.listing_id
            and l.host_id = (select auth.uid())
        )
      )
    )
  );


-- ---- booking_addons ----
drop policy if exists "booking_addons_select_owner_or_host" on public.booking_addons;
create policy "booking_addons_select_owner_or_host"
  on public.booking_addons for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = booking_addons.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

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
  );


-- ---- condition_reports ----
drop policy if exists "condition_reports_select_participants" on public.condition_reports;
create policy "condition_reports_select_participants"
  on public.condition_reports for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = condition_reports.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

drop policy if exists "condition_reports_insert_participants" on public.condition_reports;
create policy "condition_reports_insert_participants"
  on public.condition_reports for insert
  to authenticated
  with check (
    public.is_active_user()
    and reporter_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = condition_reports.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );


-- ---- daily_updates ----
drop policy if exists "daily_updates_select_participants" on public.daily_updates;
create policy "daily_updates_select_participants"
  on public.daily_updates for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = daily_updates.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

drop policy if exists "daily_updates_insert_host" on public.daily_updates;
create policy "daily_updates_insert_host"
  on public.daily_updates for insert
  to authenticated
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


-- ---- messages ----
drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = messages.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    public.is_active_user()
    and sender_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = messages.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );


-- ---- reviews ----
drop policy if exists "reviews_insert_participant_after_completed" on public.reviews;
create policy "reviews_insert_participant_after_completed"
  on public.reviews for insert
  to authenticated
  with check (
    public.is_active_user()
    and rater_id = (select auth.uid())
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


-- ============================================================
-- 4. Recreate storage RLS policies
-- ============================================================
-- listing-photos bucket: mirror the table's Q6 verified-host visibility.
drop policy if exists "listing_photos_storage_select_public" on storage.objects;
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
              l.is_active = true
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

drop policy if exists "listing_photos_storage_insert_host" on storage.objects;
create policy "listing_photos_storage_insert_host"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and exists (
          select 1 from public.listings l
          where l.id::text = (storage.foldername(name))[1]
            and l.host_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists "listing_photos_storage_update_host" on storage.objects;
create policy "listing_photos_storage_update_host"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and exists (
          select 1 from public.listings l
          where l.id::text = (storage.foldername(name))[1]
            and l.host_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists "listing_photos_storage_delete_host" on storage.objects;
create policy "listing_photos_storage_delete_host"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and exists (
          select 1 from public.listings l
          where l.id::text = (storage.foldername(name))[1]
            and l.host_id = (select auth.uid())
        )
      )
    )
  );


-- profile-avatars: writes need active_user; admin can manage anyone's avatar.
drop policy if exists "profile_avatars_storage_insert_self" on storage.objects;
create policy "profile_avatars_storage_insert_self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    )
  );

drop policy if exists "profile_avatars_storage_update_self" on storage.objects;
create policy "profile_avatars_storage_update_self"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    )
  );

drop policy if exists "profile_avatars_storage_delete_self" on storage.objects;
create policy "profile_avatars_storage_delete_self"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    )
  );


-- pet-photos: admins can view all; writes need active_user.
drop policy if exists "pet_photos_storage_select_owner_or_booking_host" on storage.objects;
create policy "pet_photos_storage_select_owner_or_booking_host"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.bookings b
        join public.listings l on l.id = b.listing_id
        where b.pet_id::text = (storage.foldername(name))[2]
          and l.host_id = (select auth.uid())
          and b.status in ('requested','accepted','active','completed','disputed')
      )
    )
  );

drop policy if exists "pet_photos_storage_insert_owner" on storage.objects;
create policy "pet_photos_storage_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pet-photos'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    )
  );

drop policy if exists "pet_photos_storage_update_owner" on storage.objects;
create policy "pet_photos_storage_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    )
  );

drop policy if exists "pet_photos_storage_delete_owner" on storage.objects;
create policy "pet_photos_storage_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (
      public.is_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    )
  );


-- condition-report-photos: admin can read all; writes still by participants only.
drop policy if exists "condition_report_photos_storage_select_participants" on storage.objects;
create policy "condition_report_photos_storage_select_participants"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'condition-report-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.bookings b
        left join public.listings l on l.id = b.listing_id
        where b.id::text = (storage.foldername(name))[1]
          and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "condition_report_photos_storage_insert_participants" on storage.objects;
create policy "condition_report_photos_storage_insert_participants"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'condition-report-photos'
    and public.is_active_user()
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );


-- daily-update-media: same shape — admin read-all, writes by host + active.
drop policy if exists "daily_update_media_storage_select_participants" on storage.objects;
create policy "daily_update_media_storage_select_participants"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'daily-update-media'
    and (
      public.is_admin()
      or exists (
        select 1 from public.bookings b
        left join public.listings l on l.id = b.listing_id
        where b.id::text = (storage.foldername(name))[1]
          and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "daily_update_media_storage_insert_host" on storage.objects;
create policy "daily_update_media_storage_insert_host"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'daily-update-media'
    and public.is_active_user()
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and l.host_id = (select auth.uid())
    )
  );


-- product-images is read-public, admin manages via dashboard — no change.

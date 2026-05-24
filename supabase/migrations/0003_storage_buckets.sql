-- ============================================================================
-- Petbnb MVP — Storage buckets + storage.objects RLS (Step 3 of build plan)
-- Run AFTER 0002_rls_policies.sql.
--
-- Path conventions (enforced by these policies):
--   listing-photos/<listing_id>/<filename>
--   profile-avatars/<user_id>/<filename>
--   pet-photos/<owner_id>/<pet_id>/<filename>
--   condition-report-photos/<booking_id>/<filename>
--   daily-update-media/<booking_id>/<filename>
--   product-images/<product_id>/<filename>
--
-- The first path segment is what the policies key off via
-- (storage.foldername(name))[1] — a Supabase-provided helper that splits
-- the object key on '/' and returns a text array (1-indexed).
--
-- Immutability: buckets that hold evidence (condition-report-photos,
-- daily-update-media) get only SELECT and INSERT policies. With no
-- UPDATE/DELETE policy, RLS's default-deny blocks overwrites and removals.
-- ============================================================================


-- ============================================================
-- Create buckets
-- ============================================================
-- 5 MB cap on still images; 50 MB on the daily-update bucket which also
-- accepts a short video. Mime-type allowlists prevent random uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-photos',          'listing-photos',          true,  5242880,
     array['image/jpeg','image/png','image/webp']),
  ('profile-avatars',         'profile-avatars',         true,  5242880,
     array['image/jpeg','image/png','image/webp']),
  ('pet-photos',              'pet-photos',              false, 5242880,
     array['image/jpeg','image/png','image/webp','application/pdf']),  -- pdf = vaccination doc
  ('condition-report-photos', 'condition-report-photos', false, 5242880,
     array['image/jpeg','image/png','image/webp']),
  ('daily-update-media',      'daily-update-media',      false, 52428800,
     array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
  ('product-images',          'product-images',          true,  5242880,
     array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;


-- Note: storage.objects has RLS enabled on Supabase by default, and the
-- table is owned by supabase_storage_admin — the SQL Editor's role
-- cannot ALTER it. We don't need to: RLS is already on, so we go
-- straight to CREATE POLICY statements below.


-- ============================================================
-- listing-photos  (public read; host of the listing writes)
-- ============================================================
create policy "listing_photos_storage_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'listing-photos');

create policy "listing_photos_storage_insert_host"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.host_id = (select auth.uid())
    )
  );

create policy "listing_photos_storage_update_host"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.host_id = (select auth.uid())
    )
  );

create policy "listing_photos_storage_delete_host"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.host_id = (select auth.uid())
    )
  );


-- ============================================================
-- profile-avatars  (public read; user writes only their own folder)
-- ============================================================
create policy "profile_avatars_storage_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'profile-avatars');

create policy "profile_avatars_storage_insert_self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "profile_avatars_storage_update_self"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "profile_avatars_storage_delete_self"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- ============================================================
-- pet-photos  (private; owner + host-via-live-booking read; owner writes)
-- ============================================================
-- Mirrors the public.pets SELECT rule, including the same booking
-- status filter — hosts who declined/cancelled lose photo access too.
create policy "pet_photos_storage_select_owner_or_booking_host"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
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

create policy "pet_photos_storage_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pet_photos_storage_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pet_photos_storage_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- ============================================================
-- condition-report-photos  (private; participants only; IMMUTABLE)
-- ============================================================
create policy "condition_report_photos_storage_select_participants"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'condition-report-photos'
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

create policy "condition_report_photos_storage_insert_participants"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'condition-report-photos'
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

-- No UPDATE/DELETE — immutable evidence trail.


-- ============================================================
-- daily-update-media  (private; participants read; host inserts; IMMUTABLE)
-- ============================================================
create policy "daily_update_media_storage_select_participants"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'daily-update-media'
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

create policy "daily_update_media_storage_insert_host"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'daily-update-media'
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id::text = (storage.foldername(name))[1]
        and l.host_id = (select auth.uid())
    )
  );

-- No UPDATE/DELETE — daily updates are immutable.


-- ============================================================
-- product-images  (public read; no client writes)
-- ============================================================
create policy "product_images_storage_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

-- No INSERT/UPDATE/DELETE — uploaded only via the Supabase dashboard.

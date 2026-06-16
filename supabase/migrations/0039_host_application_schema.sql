-- 0039 — Host application schema + persona separation.
--
-- Founder decision (2026-06-15/16): replace the persona-toggle model
-- with two distinct account types — Owner and Host. Same email
-- cannot create both (enforced by Supabase Auth's email uniqueness
-- on auth.users + app-layer gating on the "Become a Host" CTA).
--
-- The two account types:
--   Owner — instant signup. Can book stays. Cannot create listings.
--   Host  — signup is a separate "Become a Host" path that collects
--           an application (name, gender, city + neighborhood, pet
--           type they can host, experience years, their own pets).
--           Goes to admin queue with host_application_status='pending'.
--           Admin approves → 'approved'. Host then completes profile
--           (bio + pictures + Nafath stub) → host_profile_complete=true.
--           Only then can they create listings. They can still BOOK
--           stays at every stage — booking is universal.
--
-- Steps in this migration:
--   1. Drop 'both' from the role CHECK. Migrate any existing 'both'
--      user → 'owner' (pre-launch test data; founder confirmed clean
--      wipe is fine).
--   2. Drop the persona column (only meaningful for the now-removed
--      'both' role).
--   3. Add host application columns to public.profiles.
--   4. Add an index on host_application_status for the admin queue.
--   5. Tighten listings_insert_host RLS so only hosts with
--      host_application_status='approved' AND host_profile_complete
--      can create listings.
--
-- NOT changed in this migration:
--   - listings.host_gender stays as-is. The app populates it from
--     profile.host_gender at listing-creation time. Existing test
--     listings keep their current host_gender value.
--   - profiles_select_public_host_anon (0037) policy + column grants
--     remain unchanged. The new host_* columns are not exposed to
--     anon; they're admin-and-self only via the existing
--     authenticated-role blanket SELECT.


-- ============================================================
-- 1. Drop 'both' from role CHECK constraint.
-- ============================================================
update public.profiles set role = 'owner' where role = 'both';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'host', 'admin'));


-- ============================================================
-- 2. Drop the persona column.
-- ============================================================
alter table public.profiles drop column if exists persona;


-- ============================================================
-- 3. Add host application columns.
-- ============================================================
alter table public.profiles
  add column if not exists host_application_status text
    check (
      host_application_status is null
      or host_application_status in ('pending', 'approved', 'rejected')
    ),
  add column if not exists host_application_submitted_at timestamptz,
  add column if not exists host_application_reviewed_at  timestamptz,
  add column if not exists host_application_reviewer_id  uuid
    references public.profiles(id) on delete set null,
  add column if not exists host_application_admin_notes  text,
  add column if not exists host_gender                   text
    check (host_gender is null or host_gender in ('female', 'male')),
  add column if not exists host_city                     text,
  add column if not exists host_neighborhood             text,
  -- 'cats' for MVP. 'dogs' / 'cats_and_dogs' unlock when SPECIES_ENABLED
  -- flips on. Schema is forward-compatible so the form can collect a
  -- broader value once dogs lights up — no migration needed at that
  -- point.
  add column if not exists host_pet_type_accepted        text
    check (
      host_pet_type_accepted is null
      or host_pet_type_accepted in ('cats', 'dogs', 'cats_and_dogs')
    ),
  add column if not exists host_experience_years         integer
    check (host_experience_years is null or host_experience_years >= 0),
  -- Collected at the post-approval profile-completion step.
  add column if not exists host_bio_ar                   text,
  -- True once host has finished the post-approval profile-completion
  -- flow (bio + pictures + Nafath stub). Gates listing creation.
  add column if not exists host_profile_complete         boolean not null default false;


-- ============================================================
-- 4. Index — admin queue filters on status='pending'.
--    Partial index keeps it small (most rows are NULL).
-- ============================================================
create index if not exists profiles_host_application_status_idx
  on public.profiles(host_application_status)
  where host_application_status is not null;


-- ============================================================
-- 5. Tighten listings_insert_host RLS.
--
--    Pre-0039:
--      with check (
--        public.is_admin()
--        or (host_id = (select auth.uid()) and public.is_active_user())
--      )
--
--    Post-0039:
--      Add the requirement that the inserting user is an APPROVED,
--      PROFILE-COMPLETE host. Pending applicants and rejected
--      applicants cannot insert. Admin bypass is preserved.
-- ============================================================
drop policy if exists "listings_insert_host" on public.listings;
create policy "listings_insert_host"
  on public.listings for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      host_id = (select auth.uid())
      and public.is_active_user()
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'host'
          and p.host_application_status = 'approved'
          and p.host_profile_complete = true
      )
    )
  );


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
-- 1. 'both' role gone:
--   select role, count(*) from public.profiles group by role;
--   expect: rows for owner / host / admin only.
--
-- 2. persona column dropped:
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='profiles'
--     and column_name='persona';
--   expect: 0 rows.
--
-- 3. New host_ columns present:
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='profiles'
--     and column_name like 'host_%'
--   order by column_name;
--   expect: host_application_admin_notes, host_application_reviewed_at,
--           host_application_reviewer_id, host_application_status,
--           host_application_submitted_at, host_bio_ar, host_city,
--           host_experience_years, host_gender, host_neighborhood,
--           host_pet_type_accepted, host_profile_complete  (12 rows).
--
-- 4. Listings INSERT RLS now requires completed onboarding:
--   select polname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy
--   where polrelid='public.listings'::regclass
--     and polname='listings_insert_host';
--   expect: with_check references host_application_status='approved'
--           AND host_profile_complete=true.

-- Reconcile reviews-table policies after 0029 part 3 collided with
-- pre-existing 0002 + 0004 policies.
--
-- BACKGROUND
-- 0001 created public.reviews with RLS enabled (no policies).
-- 0002 added the first policies:
--     reviews_select_public                       — anon + authenticated, using(true)
--     reviews_insert_participant_after_completed  — completed + role-symmetric
-- 0004 refreshed reviews_insert_participant_after_completed to gate
--     on is_active_user() for the new suspended-user pattern.
-- 0029 part 3 (mine) added a parallel pair WITHOUT dropping 0002/0004's,
--     because my header comment incorrectly believed reviews had no
--     policies:
--       reviews_insert_participant     — admin bypass + same predicate
--       reviews_select_authenticated   — to authenticated, using(true)
--
-- Postgres OR's same-cmd policies. So:
--   INSERT — mine is a strict superset (adds admin bypass; otherwise
--            equivalent). Keeping both is harmless but confusing.
--   SELECT — the 0002 `_public` (anon + authenticated) is strictly
--            more permissive than my `_authenticated`, so mine is
--            already shadowed. Keeping both does nothing.
--
-- FOUNDER DECISION (2026-06-11, Option A)
-- Keep the original 0002 design intent: anon visitors to the new
-- guest mode (R2C3) CAN read review text. Rationale:
--   - matches the schema author's original choice
--   - guest-mode is shipping precisely to maximize conversion; review
--     text is part of that
--   - SEO benefit on review text is real for a marketplace
--   - reversible by a one-line policy swap later if abuse appears
--
-- RECONCILIATION
-- Drop the 0004 INSERT — mine supersedes it (adds admin bypass).
-- Drop my redundant SELECT — `_public` covers it and more.
-- Net result on public.reviews: TWO policies, no duplicates:
--   reviews_insert_participant   (INSERT, my 0029, admin bypass + active-user/completed/symmetric)
--   reviews_select_public        (SELECT, 0002, anon + authenticated public read)


drop policy if exists "reviews_insert_participant_after_completed"
  on public.reviews;

drop policy if exists "reviews_select_authenticated"
  on public.reviews;


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Exactly two policies remain on public.reviews, no duplicates.
--   select polname,
--          case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' end as cmd,
--          polroles::regrole[] as roles
--   from pg_policy
--   where polrelid = 'public.reviews'::regclass
--   order by polname;
--   expect:
--     reviews_insert_participant   INSERT  {authenticated}
--     reviews_select_public        SELECT  {anon,authenticated}
--   (Order may vary in the second column — anon/authenticated is what matters.)
--
-- 2. Sanity — guest-mode anon read still works.
--   set role anon;
--   select count(*) from public.reviews;
--   reset role;
--   expect: a number, no permission_denied. (Will be 0 until real reviews
--   exist, but the read is permitted.)
--
-- 3. Self-rating still blocked (sanity that the dropped insert wasn't
--    the only thing keeping the role-symmetric rule in place — mine
--    still enforces it).
--   As a user who is the owner of a completed booking, try:
--     insert into public.reviews (booking_id, rater_id, ratee_id, stars)
--     values ('<completed booking>', auth.uid(), auth.uid(), 5);
--   expect: row-level security policy violation (ratee_id = rater_id
--   fails the role-symmetric pair check in my policy).

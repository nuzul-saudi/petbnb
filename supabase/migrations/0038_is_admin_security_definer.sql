-- 0038 — follow-up to 0037 — make the policy-helper functions
-- SECURITY DEFINER so they don't depend on caller column grants.
--
-- After 0037 narrowed anon's column-level SELECT on public.profiles
-- to six display fields, the listings SELECT policy began throwing
-- when the caller was anon:
--
--   policy USING clause: public.is_admin() OR host_id = auth.uid()
--                        OR (status='approved' AND EXISTS (...))
--
--   public.is_admin() body: SELECT EXISTS (SELECT 1 FROM profiles
--                            WHERE id = auth.uid() AND role = 'admin')
--
-- `language sql stable` runs as the CALLER. Anon doesn't have SELECT
-- on profiles.role (we deliberately excluded it to avoid leaking
-- admin status), so the WHERE clause's reference to `role` raises
-- `permission denied for column role`. The error propagates through
-- the OR chain and 4xxs the whole listings request — exactly the
-- "تعذّر تحميل الإعلانات" / "Couldn't load the listings" symptom
-- on the deployed guest feed.
--
-- The same shape applies to public.is_active_user() — its body
-- references is_suspended (currently granted to anon) but the
-- principle is identical: the function should answer "am I the
-- caller an admin / active user?" regardless of the caller's
-- column-level grants.
--
-- Fix: convert both helpers to SECURITY DEFINER so they execute
-- under the function owner's privileges, bypassing the caller's
-- RLS + column grants. They still read the CALLER'S identity via
-- auth.uid() (session-level, not role-level), so they return the
-- same answer they did before — just without needing the caller
-- to have SELECT on every column they touch.
--
-- Safety:
--   - is_admin() returns boolean; doesn't echo any profile data.
--     Worst case it returns true for an admin who's signed in,
--     which is the intended behavior.
--   - is_active_user() same shape — boolean only.
--   - Both functions are `STABLE` and read-only; SECURITY DEFINER
--     here is the standard pattern for policy helpers (matches
--     promote_listing_draft and friends in this codebase).
--   - `search_path = public` is set explicitly so a search_path
--     override by the caller can't redirect either function at
--     a malicious schema.

alter function public.is_admin()       security definer;
alter function public.is_active_user() security definer;

-- Pin search_path on both (defense-in-depth — SECURITY DEFINER
-- without a pinned path is the classic privilege-escalation
-- pattern).
alter function public.is_admin()       set search_path = public;
alter function public.is_active_user() set search_path = public;


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. Both functions are SECURITY DEFINER.
--   select proname, prosecdef
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and proname in ('is_admin', 'is_active_user')
--   order by proname;
--   expect: 2 rows, prosecdef = t for both.
--
-- 2. search_path is pinned to public.
--   select proname, proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and proname in ('is_admin', 'is_active_user');
--   expect: proconfig contains 'search_path=public' for both.
--
-- 3. Guest feed populates. Refresh https://<vercel>.vercel.app
--    in incognito; should now show 4 verified-host Riyadh
--    listings. No app code change, no Vercel redeploy.

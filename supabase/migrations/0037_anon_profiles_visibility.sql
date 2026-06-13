-- 0037 — Bug fix: guest mode shows empty feed.
--
-- Symptom: deployed web app, opened in an incognito window (no
-- session), shows "no hosts available currently" even though the
-- DB has approved listings with verified hosts. The browser
-- DevTools Network tab confirms /rest/v1/listings returns
-- 200 OK with content-length 2 (empty JSON array).
--
-- Cause: the profiles SELECT policy from 0002 is `to authenticated`
-- only:
--
--   create policy "profiles_select_authenticated"
--     on public.profiles for select
--     to authenticated
--     using (true);
--
-- The listings_select_active_verified_or_own RLS policy (0004 →
-- 0024) does an EXISTS subquery against public.profiles to check
-- the host's is_verified + is_suspended status:
--
--   exists (
--     select 1 from public.profiles host
--     where host.id = listings.host_id
--       and host.is_verified = true
--       and host.is_suspended = false
--   )
--
-- That subquery runs as the calling role. For anon, the
-- profiles_select_authenticated policy doesn't match (not anon),
-- so anon sees zero profile rows, the EXISTS returns false for
-- every listing, and PostgREST returns []. The same chain hides
-- listing_photos via listing_photos_select_public_or_host (0024).
--
-- The exact same chain hides EVERY join-through-profiles read
-- path for anon — listings feed, listing detail's host embed,
-- listing_photos embed. The diagnosis is "guest feed empty" but
-- the root cause is profile invisibility.
--
-- Fix: expose a NARROW slice of profiles to anon.
--   Rows:    verified, non-suspended profiles only (the same
--            shape the listings policy already gates on).
--   Columns: id, full_name, full_name_en, avatar_url + the two
--            visibility flags (is_verified, is_suspended) needed
--            by the EXISTS subqueries. Phone, email,
--            nafath_verified, id_document_url stay private to
--            authenticated users — anon cannot read them even
--            via /rest/v1/profiles?select=phone.

-- ============================================================
-- 1. Anon RLS policy: verified-host rows only
-- ============================================================
create policy "profiles_select_public_host_anon"
  on public.profiles for select
  to anon
  using (
    is_verified = true
    and is_suspended = false
  );

-- ============================================================
-- 2. Column-level GRANTs: replace the blanket SELECT with a
--    narrow per-column SELECT for anon.
--
--    Supabase auto-grants `SELECT (all columns)` to anon on every
--    public table. We revoke that here and re-grant only the
--    host display fields + visibility flags. Authenticated keeps
--    its blanket grant unchanged.
--
--    Without this step, anon could still craft a request like
--    /rest/v1/profiles?select=phone&is_verified=eq.true and read
--    every verified host's phone number. The RLS policy would
--    permit the row, the blanket grant would permit the column.
-- ============================================================
revoke select on public.profiles from anon;
grant select (
  id,
  full_name,
  full_name_en,
  avatar_url,
  is_verified,
  is_suspended
) on public.profiles to anon;


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. The new anon policy exists.
--   select polname
--   from pg_policy
--   where polrelid = 'public.profiles'::regclass
--     and polname = 'profiles_select_public_host_anon';
--   expect: 1 row.
--
-- 2. Column-level grants for anon are narrowed to the 6 display
--    fields, NOT including phone / email / nafath_verified /
--    id_document_url.
--   select column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public'
--     and table_name = 'profiles'
--     and grantee = 'anon'
--     and privilege_type = 'SELECT'
--   order by column_name;
--   expect: id, full_name, full_name_en, avatar_url,
--           is_verified, is_suspended (six rows).
--
-- 3. The deployed feed populates. In an incognito browser at the
--    Vercel URL, the guest feed should now show 4 listings
--    (Riyadh, verified hosts). No redeploy needed — RLS / GRANT
--    changes take effect immediately for new requests.

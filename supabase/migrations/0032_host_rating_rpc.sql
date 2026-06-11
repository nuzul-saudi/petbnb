-- Server-side host rating aggregation RPC.
--
-- Background: before this migration, the owner feed's
-- `listActiveListings` aggregated host ratings client-side — it
-- fetched every (ratee_id, stars) row for the set of host_ids visible
-- on the feed page, then averaged in JS. At 4 listings on a page
-- that's a handful of rows; at 20 listings × 50 reviews per host
-- that's ~1000 rows per feed load, shipped over the wire just to
-- compute an average.
--
-- This RPC pushes the aggregation down to Postgres. One round-trip,
-- one row per host on the page, average + count already computed.
-- The function is STABLE + SECURITY DEFINER so:
--   STABLE — the planner can hoist it as an initPlan within the
--     same query if a caller ever joins it directly (not the
--     current usage, but cheap to leave on).
--   SECURITY DEFINER — runs with the owner role's privileges, which
--     means anon callers (guest mode, R2C3) get the same rating data
--     authenticated callers do. Reviews themselves are already
--     anon-readable via reviews_select_public (kept by migration
--     0030 per founder Option A).
--
-- The set_search_path = public guard is the standard SECURITY DEFINER
-- hardening — without it, a malicious search_path could redirect the
-- function's table references to an attacker-controlled schema. Belt
-- and braces.

create or replace function public.get_host_ratings(host_ids uuid[])
returns table (
  host_id uuid,
  avg_rating numeric(2,1),
  review_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.ratee_id            as host_id,
    round(avg(r.stars)::numeric, 1) as avg_rating,
    count(*)              as review_count
  from public.reviews r
  where r.ratee_id = any(host_ids)
  group by r.ratee_id;
$$;


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Function exists with expected signature.
--   select proname, pronargs
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'get_host_ratings';
--   expect: 1 row, pronargs = 1.
--
-- 2. SECURITY DEFINER + STABLE + search_path are set as intended.
--   select prosecdef, provolatile, proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'get_host_ratings';
--   expect: prosecdef=t (definer), provolatile='s' (stable),
--   proconfig contains 'search_path=public'.
--
-- 3. Empty-input behavior — no rows returned, no error raised.
--   select * from public.get_host_ratings(array[]::uuid[]);
--   expect: 0 rows.
--
-- 4. Real-input shape — pass any host id that's been reviewed.
--   select * from public.get_host_ratings(array[
--     (select ratee_id from public.reviews limit 1)
--   ]::uuid[]);
--   expect: 1 row with avg_rating (e.g. 4.0) and review_count (e.g. 1).

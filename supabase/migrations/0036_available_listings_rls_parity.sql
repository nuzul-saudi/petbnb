-- 0036 — Bug fix: 0035 available_listings RLS parity.
--
-- Symptom: dated search returns fewer listings than the undated path
-- shows, even when no real availability conflict exists.
--
-- Cause: 0035's available_listings is SECURITY DEFINER, which bypasses
-- RLS. The listings_select RLS policy on public.listings requires the
-- host to be VERIFIED and NOT SUSPENDED in addition to the listing
-- being approved:
--
--   USING (
--     is_admin() OR host_id = auth.uid()
--     OR (status = 'approved' AND EXISTS (
--           SELECT 1 FROM profiles host
--           WHERE host.id = listings.host_id
--             AND host.is_verified = true
--             AND host.is_suspended = false
--        ))
--   )
--
-- The 0035 RPC only checked status='approved'. It would return rows
-- whose hosts are unverified/suspended; the client's hydration step
-- (`select * from listings where id in (...)`) then runs under RLS
-- and drops those rows. Result: the user-visible feed count comes up
-- short compared to what the RPC said was available, and the dated
-- and undated feeds disagree on which listings even exist.
--
-- Fix: mirror the RLS host-visibility check in the RPC body. After
-- this, RPC reach == hydration reach == undated query reach, minus
-- only actual availability hits (blocked range / capacity).
--
-- Everything else stays exactly as 0035: same overlap math, same
-- status filter, same capacity sum, same signature.

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
    -- NEW (0036): mirror the listings_select RLS host-visibility
    -- predicate. An unverified or suspended host's listing is
    -- RLS-hidden from the hydration step, so excluding it here keeps
    -- the RPC and the hydration step in agreement.
    and exists (
      select 1
      from public.profiles host
      where host.id = l.host_id
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
    -- Blocked-range check — identical predicate to 0027 trigger.
    and not exists (
      select 1
      from public.listing_blocked_dates lb
      where lb.listing_id = l.id
        and p_search_start < lb.end_date
        and p_search_end   > lb.start_date
    )
    -- Capacity check — identical predicate to 0027 trigger.
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

-- CREATE OR REPLACE preserves grants in Postgres, but being explicit
-- avoids surprise if a future change drops + recreates.
grant execute on function public.available_listings(
  date, date, integer, text, text, boolean, boolean, boolean,
  numeric, numeric, integer, integer
) to anon, authenticated;


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. The two counts below should match. Pre-0036 the RPC count was
--    higher than the listings-table count (RPC over-reached). After
--    0036 they must equal.
--
--    select count(*) from public.available_listings(
--      '2026-06-16'::date, '2026-06-24'::date, 1, 'riyadh',
--      null, false, false, false, null, null, 50, 0
--    );
--
--    select count(*) from public.listings
--    where status = 'approved' and city = 'riyadh';
--
-- 2. Confirm the function body now references the host-visibility
--    predicate.
--
--    select position('is_verified' in pg_get_functiondef(p.oid)) > 0
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'available_listings';
--
--    expect: t (true).
--
-- 3. Spot-check with an unverified host. Pick a profile id where
--    is_verified=false, create or identify an approved listing for
--    them, then confirm the RPC excludes the listing (it should).
--    Pre-0036 this query would have returned the listing; post-0036
--    it must not.

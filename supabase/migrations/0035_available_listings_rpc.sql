-- Feature 1 (2026-06-13) — search-time availability filtering.
--
-- New RPC: available_listings(start, end, pet_count, ...filters).
-- Returns plain public.listings rows that:
--   1. Pass the standard feed predicates (status='approved' + the
--      same optional filters listActiveListings already accepts).
--   2. Do NOT overlap any host-blocked range
--      (listing_blocked_dates) for the searched [start, end).
--   3. Have enough capacity to fit `pet_count` more pets in the
--      searched [start, end) window, given the listing's existing
--      accepted/active bookings.
--
-- Half-open overlap convention: ranges [a, a') and [b, b') overlap
-- iff a < b' AND a' > b. Same predicate as 0027's
-- guard_booking_capacity trigger. Identical math, so the submit-
-- time guard and this read-time filter agree by construction — if
-- a booking would be allowed by the trigger, the listing shows up
-- in this RPC's result; if the trigger would reject, the listing
-- is filtered out.
--
-- The RPC returns RAW public.listings rows. Callers re-hydrate host
-- profile + photos via a follow-up nested-embed select (the
-- existing hydration path in listActiveListings). Keeps the RPC's
-- job narrow ("which listings are available right now?") and lets
-- the SELECT + RPC paths share the same join shape.
--
-- SECURITY DEFINER so anon/authenticated callers don't need direct
-- SELECT on listing_blocked_dates / bookings / booking_pets — those
-- have RLS that would otherwise filter rows mid-query and break the
-- capacity sum.

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
    and (p_city is null or l.city = p_city)
    and (p_neighborhood is null or l.neighborhood = p_neighborhood)
    and (not coalesce(p_female_only, false) or l.host_gender = 'female')
    and (not coalesce(p_grooming_only, false) or l.offers_grooming = true)
    and (not coalesce(p_no_resident_pets_only, false) or l.has_resident_pets = false)
    and (p_min_price_sar is null or l.nightly_price_sar >= p_min_price_sar)
    and (p_max_price_sar is null or l.nightly_price_sar <= p_max_price_sar)
    -- Defensive: an invalid search range (end <= start) collapses
    -- the result set rather than returning nonsense.
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
    -- COALESCE the sum so a listing with no overlapping committed
    -- bookings is treated as 0 concurrent pets, not NULL.
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

grant execute on function public.available_listings(
  date, date, integer, text, text, boolean, boolean, boolean,
  numeric, numeric, integer, integer
) to anon, authenticated;


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. Function exists and is SECURITY DEFINER.
--    select proname, prosecdef
--    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname = 'available_listings';
--    expect: 1 row, prosecdef = t.
--
-- 2. Smoke test against a known free range — should return >= 1 row
--    for a fresh test DB. Substitute your real test listing id.
--    select id, title_ar, max_concurrent_pets
--    from available_listings('2026-12-01', '2026-12-05', 1, 'riyadh');
--
-- 3. Submit-guard parity check. Pick a real accepted booking, plug
--    its dates + listing into the RPC with pet_count high enough
--    to fail capacity — the listing must NOT appear.
--    -- with the booking row's b.listing_id, b.start_date, b.end_date:
--    select count(*) from available_listings(
--      b.start_date, b.end_date,
--      (select max_concurrent_pets from listings where id = b.listing_id) + 1,
--      null
--    ) where id = b.listing_id;
--    expect: 0.
--
-- 4. Touching-boundary check. A booking ending on the searched
--    range's start (or starting on the searched range's end) must
--    NOT remove the listing — half-open convention.
--    -- with a real accepted booking row b:
--    select id from available_listings(b.end_date, b.end_date + 5, 1)
--    where id = b.listing_id;
--    expect: 1 row (assuming capacity isn't otherwise exceeded).

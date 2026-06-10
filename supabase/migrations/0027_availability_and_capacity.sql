-- Milestone B — Availability + capacity.
--
-- Two things:
--   1. listing_blocked_dates — host-managed unavailable date ranges
--      (host vacation, deep-clean weeks, etc).
--   2. Capacity guard — DB-level trigger that refuses to put a booking
--      into 'accepted' or 'active' if doing so would either:
--        a) push the listing's concurrent pets over max_concurrent_pets
--           across all overlapping accepted/active bookings, OR
--        b) overlap any range in listing_blocked_dates.
--
-- Date convention: half-open ranges [start_date, end_date). end_date is
-- the day the pet leaves (or the day the block is lifted) — so two
-- bookings where one ends on the same date the other starts do NOT
-- overlap (same-day handover is allowed).
--
-- Overlap predicate: ranges (a1, a2) and (b1, b2) overlap iff
--   a1 < b2 AND a2 > b1.

-- ============================================================
-- listing_blocked_dates table
-- ============================================================
create table public.listing_blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  check (end_date > start_date)
);
create index listing_blocked_dates_listing_id_idx
  on public.listing_blocked_dates (listing_id);
create index listing_blocked_dates_range_idx
  on public.listing_blocked_dates (listing_id, start_date, end_date);


-- ============================================================
-- RLS: authenticated read (any signed-in user — owners need to see
-- blocked dates when picking arrival/departure); host of listing OR
-- admin can mutate.
-- ============================================================
alter table public.listing_blocked_dates enable row level security;

create policy "listing_blocked_dates_select_authenticated"
  on public.listing_blocked_dates for select
  to authenticated
  using (true);

create policy "listing_blocked_dates_insert_host"
  on public.listing_blocked_dates for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

create policy "listing_blocked_dates_update_host"
  on public.listing_blocked_dates for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
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
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

create policy "listing_blocked_dates_delete_host"
  on public.listing_blocked_dates for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_blocked_dates.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- ============================================================
-- Capacity + blocked-range guard trigger on bookings.
--
-- Fires on INSERT or UPDATE. Only enforces when this booking is
-- becoming "committed" — status IN ('accepted','active'). Bookings
-- in 'requested' (waiting for host accept), 'declined', 'cancelled',
-- 'completed', 'disputed' don't count toward capacity and aren't
-- gated.
--
-- "needs re-check" on UPDATE means EITHER:
--   - the booking is transitioning INTO committed status
--     (OLD.status NOT IN ('accepted','active') AND NEW.status IN
--     ('accepted','active')), OR
--   - the booking is ALREADY committed AND the dates changed
--     (NEW.status IN ('accepted','active') AND start/end_date moved).
--
-- A date edit on an already-committed booking could push the booking
-- into a new overlap window that no longer respects capacity or
-- collides with a blocked range. Re-running the same checks against
-- the new dates closes that gap. The overlap query excludes
-- b.id <> NEW.id so re-checking a booking against itself is safe.
-- On INSERT, only the status check applies (dates have no OLD).
-- ============================================================
create or replace function public.guard_booking_capacity()
returns trigger
language plpgsql
as $$
declare
  v_committed boolean;
  v_this_pet_count integer;
  v_concurrent_pets integer;
  v_max integer;
  v_blocked_count integer;
begin
  -- Decide whether this transition triggers the check.
  -- On INSERT: any committed status fires.
  -- On UPDATE: fires when becoming committed OR when dates change on
  --   an already-committed booking (so a date shift on an
  --   accepted/active booking still gets capacity + blocked-range
  --   re-checked against the new window).
  if TG_OP = 'INSERT' then
    v_committed := NEW.status in ('accepted', 'active');
  else
    v_committed := NEW.status in ('accepted', 'active')
                 and (
                   OLD.status not in ('accepted', 'active')
                   or NEW.start_date is distinct from OLD.start_date
                   or NEW.end_date is distinct from OLD.end_date
                 );
  end if;

  if not v_committed then
    return NEW;
  end if;

  -- Pet count on THIS booking. Prefer booking_pets junction (modern
  -- post-0009 model); fall back to 1 if the junction is empty
  -- (legacy single bookings.pet_id rows).
  select count(*) into v_this_pet_count
    from public.booking_pets
   where booking_id = NEW.id;
  if v_this_pet_count = 0 then
    v_this_pet_count := 1;
  end if;

  -- Sum pet counts across OTHER overlapping committed bookings.
  -- Half-open overlap: NEW.start < other.end AND NEW.end > other.start.
  select coalesce(sum(
    greatest(
      (select count(*) from public.booking_pets where booking_id = b.id),
      1
    )
  ), 0)
    into v_concurrent_pets
    from public.bookings b
   where b.listing_id = NEW.listing_id
     and b.id <> NEW.id
     and b.status in ('accepted', 'active')
     and NEW.start_date < b.end_date
     and NEW.end_date > b.start_date;

  -- Listing capacity.
  select max_concurrent_pets into v_max
    from public.listings
   where id = NEW.listing_id;
  if v_max is null then
    v_max := 1;
  end if;

  if v_this_pet_count + v_concurrent_pets > v_max then
    raise exception 'capacity_exceeded: % concurrent pets would exceed listing max of %',
      v_this_pet_count + v_concurrent_pets, v_max
      using errcode = '23514';
  end if;

  -- Blocked-range check.
  select count(*) into v_blocked_count
    from public.listing_blocked_dates lb
   where lb.listing_id = NEW.listing_id
     and NEW.start_date < lb.end_date
     and NEW.end_date > lb.start_date;

  if v_blocked_count > 0 then
    raise exception 'blocked_range: booking overlaps a host-blocked range'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

drop trigger if exists bookings_capacity_guard on public.bookings;
create trigger bookings_capacity_guard
  before insert or update on public.bookings
  for each row
  execute function public.guard_booking_capacity();


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Table exists with expected columns.
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'listing_blocked_dates';
--   expect: id (uuid), listing_id (uuid), start_date (date),
--   end_date (date), created_at (timestamp).
--
-- 2. RLS enabled.
--   select relrowsecurity from pg_class
--   where oid = 'public.listing_blocked_dates'::regclass;
--   expect: t (true).
--
-- 3. 4 policies present (select / insert / update / delete).
--   select polname from pg_policy
--   where polrelid = 'public.listing_blocked_dates'::regclass;
--   expect: 4 rows.
--
-- 4. Trigger present.
--   select tgname from pg_trigger
--   where tgrelid = 'public.bookings'::regclass
--     and tgname = 'bookings_capacity_guard';
--   expect: 1 row.
--
-- 5. Function present.
--   select proname from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and proname = 'guard_booking_capacity';
--   expect: 1 row.

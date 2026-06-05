-- Step 7.2: multi-city + approval-gate column defaults.
-- Single transaction; two listings-table changes that belong to the
-- same product moment, so one migration-pause covers both.
--
-- 1) CITY column. The app was Riyadh-only through Step 7.1; existing
--    listings backfill to 'riyadh'. New self-registered listings must
--    pick from {'riyadh','dammam'} (enforced via CHECK, not a Postgres
--    enum, so adding a third city later is a one-line ALTER instead
--    of an enum-altering dance). The existing `neighborhood` column
--    keeps its meaning — it's now the district within the city.
--
-- 2) APPROVAL-GATE default flip. Today listings.is_active defaults to
--    TRUE, which means a self-registered listing would auto-go-live
--    with no admin review. Flipping the default to FALSE makes the
--    admin-approval moment the explicit transition. EXISTING rows are
--    NOT touched — column defaults only apply to INSERTs that omit
--    the column. Today's live seed listings stay live.
--
-- RLS: no policy change needed. listings_insert_host (0004) already
-- permits a non-suspended host to INSERT a row where host_id = themself
-- with no column-value restriction; listings_update_host already lets
-- the host edit their own pending listings; listings_select_* already
-- lets the host read their own listings regardless of is_active /
-- verification (proven in Step 7.1a by listOwnListings). The new city
-- column and the flipped default are entirely orthogonal to RLS.

-- 1a. Add city column nullable so the existing rows can be backfilled
--     before we tighten in the same transaction.
alter table public.listings
  add column if not exists city text;

-- 1b. Backfill: every existing row was created during the Riyadh-only
--     era. Idempotent — re-running this migration is a no-op.
update public.listings
  set city = 'riyadh'
  where city is null;

-- 1c. Tighten: NOT NULL + CHECK. The two valid values are the
--     lowercased English city keys; display names resolve via the
--     i18n layer (city.riyadh / city.dammam).
alter table public.listings
  alter column city set not null;

alter table public.listings
  add constraint listings_city_check
    check (city in ('riyadh','dammam'));

-- 1d. Index for the city-aware feed query in 7.2c.
--     (city, is_active) mirrors how listings_active_neighborhood_idx
--     supports the existing active+district lookup pattern.
create index if not exists listings_city_idx
  on public.listings (city, is_active);

-- 2. Flip the default for the approval gate. Existing rows' is_active
--    values are untouched — column defaults only fire on INSERTs that
--    omit the column. The admin-approval flip will UPDATE is_active to
--    true once the listing is reviewed.
alter table public.listings
  alter column is_active set default false;

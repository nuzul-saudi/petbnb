-- 0041 — per-host service-addon opt-in flags.
--
-- Founder feedback 2026-06-25: 'the services are all shown although
-- they are not provided by the host.' Currently only offers_grooming
-- is per-listing. The other booking addons (vet, insurance, transport)
-- are always shown to every booking. The founder wants each host to
-- declare which addons they offer; the booking request screen filters
-- the addon checkboxes by that declaration.
--
-- Migration adds three boolean columns to public.listings, default
-- false (a new listing offers nothing until the host opts in,
-- matching offers_grooming's existing default).
--
-- ============================================================
-- ANON CAVEAT
-- ============================================================
-- listings RLS (0024) lets anon read approved + verified-host rows,
-- and 0037 narrowed anon's column-level GRANT on profiles only.
-- Authenticated callers have the blanket grant on listings. New
-- columns inherit the table's column-level GRANTs automatically —
-- no special action needed for anon vs authenticated visibility.
-- The booking request screen is gated on session anyway, so anon
-- never reads these flags.

alter table public.listings
  add column offers_vet       boolean not null default false,
  add column offers_insurance boolean not null default false,
  add column offers_transport boolean not null default false;

-- 8d two-copy edit model: hosts editing approved/paused listings go
-- through listing_drafts. Add the same three flags to the drafts
-- table so an edit can propose toggling them. promote_listing_draft
-- (0023, extended 0026) then needs to copy these too — that RPC
-- update lives in the next migration if/when we adopt the addons UI
-- on the edit screen's draft path. For pending listings (no draft),
-- direct UPDATE on listings handles it.
alter table public.listing_drafts
  add column offers_vet       boolean,
  add column offers_insurance boolean,
  add column offers_transport boolean;


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. All three new columns exist on listings + defaults are false.
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'listings'
--     and column_name in ('offers_vet', 'offers_insurance', 'offers_transport')
--   order by column_name;
--   expect 3 rows, all boolean, default 'false', NOT NULL.
--
-- 2. Same columns exist on listing_drafts (nullable — draft might
--    not be touching the flag).
--   select column_name, is_nullable
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'listing_drafts'
--     and column_name in ('offers_vet', 'offers_insurance', 'offers_transport')
--   order by column_name;
--   expect 3 rows, all is_nullable = YES.
--
-- 3. Spot-check: existing listings now have all three offers_* = false.
--   select id, offers_grooming, offers_vet, offers_insurance, offers_transport
--   from public.listings
--   limit 5;
--   expect: every offers_* column populated; new ones false.

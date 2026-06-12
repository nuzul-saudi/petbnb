-- 0034 — Step 5.7 / Round 12 Phase A — multi-species expansion (dogs).
--
-- The MVP scope grows from cat-only to cat + dog. Listings declare which
-- species they accept; the owner feed will filter on that. We do this as
-- an array column (rather than two booleans) so future species (rabbit,
-- bird, etc.) extend without a schema change.
--
-- Why default '{cat}': the entire existing seed/test data is cat-only.
-- Backfilling cat keeps every existing listing visible to cat owners
-- (current default), and hosts opt INTO dogs explicitly via the listing
-- edit form (Round 12b). This is the safe direction — surprise visibility
-- (defaulting to '{cat,dog}') could route owners to hosts who don't want
-- their species.
--
-- Note: `pets.species` already exists since 0001 with default 'cat'. No
-- pets-side change here — the species selector in the pet creation form
-- writes through the existing column.

alter table public.listings
  add column accepts_species text[] not null default array['cat'];

-- Constraint: every entry must be a supported species. Today: cat | dog.
-- Adding a new species means dropping & recreating this constraint plus
-- updating the species enum in src/lib/species.ts.
alter table public.listings
  add constraint listings_accepts_species_valid
  check (
    array_length(accepts_species, 1) >= 1
    and accepts_species <@ array['cat','dog']
  );

-- GIN index supports the planned owner-feed filter:
--   .from('listings').contains('accepts_species', [filterSpecies])
-- without a sequential scan once the listing pool grows. Cheap at <100
-- rows but the right shape from the start.
create index listings_accepts_species_gin_idx
  on public.listings using gin (accepts_species);


-- ============================================================
-- listing_drafts — mirror accepts_species so the two-copy edit
-- model lets hosts opt in/out of species after approval.
-- ============================================================
alter table public.listing_drafts
  add column accepts_species text[] not null default array['cat'];

alter table public.listing_drafts
  add constraint listing_drafts_accepts_species_valid
  check (
    array_length(accepts_species, 1) >= 1
    and accepts_species <@ array['cat','dog']
  );


-- ============================================================
-- promote_listing_draft — extend the column copy.
-- CREATE OR REPLACE; everything else (auth check, photo swap,
-- orphan return, status='approved' flip) stays as 0026.
-- ============================================================
create or replace function public.promote_listing_draft(
  p_listing_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_draft_exists boolean;
  v_photo_draft_exists boolean;
  v_orphan_urls        text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  perform 1 from public.listings where id = p_listing_id for update;
  if not found then
    return v_orphan_urls;
  end if;

  select exists (
    select 1 from public.listing_drafts where listing_id = p_listing_id
  ) into v_field_draft_exists;

  select exists (
    select 1 from public.listing_photo_drafts where listing_id = p_listing_id
  ) into v_photo_draft_exists;

  if v_field_draft_exists then
    update public.listings
       set city                 = d.city,
           neighborhood         = d.neighborhood,
           title_ar             = d.title_ar,
           title_en             = d.title_en,
           description_ar       = d.description_ar,
           description_en       = d.description_en,
           nightly_price_sar    = d.nightly_price_sar,
           max_concurrent_pets  = d.max_concurrent_pets,
           has_resident_pets    = d.has_resident_pets,
           resident_pets_note   = d.resident_pets_note,
           offers_grooming      = d.offers_grooming,
           host_gender          = d.host_gender,
           requires_vaccination = d.requires_vaccination,
           accepts_species      = d.accepts_species,
           status               = 'approved'
      from public.listing_drafts d
     where public.listings.id = p_listing_id
       and d.listing_id = p_listing_id;
  elsif v_photo_draft_exists then
    update public.listings
       set status = 'approved'
     where id = p_listing_id;
  end if;

  if v_photo_draft_exists then
    select coalesce(array_agg(photo_url), array[]::text[])
      into v_orphan_urls
      from public.listing_photos
     where listing_id = p_listing_id
       and photo_url not in (
         select photo_url
         from public.listing_photo_drafts
         where listing_id = p_listing_id
       );

    delete from public.listing_photos where listing_id = p_listing_id;

    insert into public.listing_photos (listing_id, photo_url, sort_order)
      select listing_id, photo_url, sort_order
      from public.listing_photo_drafts
     where listing_id = p_listing_id;

    delete from public.listing_photo_drafts where listing_id = p_listing_id;
  end if;

  if v_field_draft_exists then
    delete from public.listing_drafts where listing_id = p_listing_id;
  end if;

  return v_orphan_urls;
end;
$$;


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Both tables have accepts_species column.
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and column_name = 'accepts_species';
--   expect: 2 rows (listings, listing_drafts), data_type 'ARRAY',
--           column_default '{cat}'.
--
-- 2. promote_listing_draft references accepts_species.
--   select pg_get_functiondef(p.oid) ilike '%accepts_species%'
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'promote_listing_draft';
--   expect: 1 row, value = t.
--
-- 3. GIN index is in place.
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'listings'
--     and indexname = 'listings_accepts_species_gin_idx';
--   expect: 1 row.

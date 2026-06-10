-- Milestone A — Vaccination & care.
--
-- Pets gain three vaccination fields + a care-notes textarea. The
-- vaccination doc upload reuses the existing pet-photos private
-- bucket (per CLAUDE.md §5 + migration 0003: bucket allows pdf in
-- addition to image mime types, scoped to owner_id/pet_id paths).
--
-- Listings gain a requires_vaccination boolean — the host can opt
-- their listing into requiring vaccinated pets only. This column
-- ALSO has to flow through the two-copy edit model:
--   • listing_drafts mirrors the column.
--   • promote_listing_draft RPC's column-copy gains it.
--
-- Booking-flow behavior is implemented client-side (Step 8 hooks):
-- when listing.requires_vaccination AND the selected pet is missing
-- vaccination dates, the owner sees a warning before submitting.
-- WARN, NOT BLOCK — host can decide case-by-case.

-- ============================================================
-- pets — vaccination + care
-- ============================================================
alter table public.pets
  add column if not exists rabies_vaccinated_at  date,
  add column if not exists fvrcp_vaccinated_at   date,
  add column if not exists vaccination_doc_url   text,
  add column if not exists care_notes            text;


-- ============================================================
-- listings — requires_vaccination
-- ============================================================
alter table public.listings
  add column if not exists requires_vaccination boolean not null default false;


-- ============================================================
-- listing_drafts — mirror requires_vaccination
-- ============================================================
alter table public.listing_drafts
  add column if not exists requires_vaccination boolean not null default false;


-- ============================================================
-- promote_listing_draft — extend the column copy
-- ============================================================
-- CREATE OR REPLACE the function with requires_vaccination added to
-- the UPDATE column list. Everything else (auth check, photo swap,
-- orphan return, status='approved' flip) stays exactly as 0023.
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
-- 1. Pets columns present with expected types.
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'pets'
--     and column_name in (
--       'rabies_vaccinated_at','fvrcp_vaccinated_at',
--       'vaccination_doc_url','care_notes'
--     );
--   expect: 4 rows — dates for rabies/fvrcp, text for doc_url + care_notes.
--
-- 2. Listings + drafts have requires_vaccination.
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and column_name = 'requires_vaccination';
--   expect: 2 rows (listings + listing_drafts), boolean, default 'false'.
--
-- 3. promote_listing_draft references requires_vaccination.
--   select pg_get_functiondef(p.oid) ilike '%requires_vaccination%'
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'promote_listing_draft';
--   expect: 1 row, value = t (true).

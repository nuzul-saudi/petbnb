-- ============================================================
-- 0042 — promote_listing_draft data-loss fix for 0041's addon flags
-- ============================================================
--
-- BUG (confirmed 2026-06-27 via the migration-apply audit):
-- 0041 added offers_vet / offers_insurance / offers_transport to
-- both public.listings AND public.listing_drafts but did NOT update
-- promote_listing_draft to copy those three columns from draft →
-- listing during admin approval. 0041's in-line comment acknowledged
-- this deferral:
--
--   "promote_listing_draft (0023, extended 0026) then needs to copy
--    these too — that RPC update lives in the next migration if/when
--    we adopt the addons UI on the edit screen's draft path."
--
-- This is that next migration. Symptom path:
--   1. Host edits an APPROVED listing's addon toggles (any of the
--      three new flags).
--   2. The edit goes into listing_drafts because the two-copy model
--      (8d) routes approved-listing edits to a draft.
--   3. Admin approves the draft. promote_listing_draft fires.
--   4. The UPDATE column list omits the three new flags. listings
--      keeps whatever values it had BEFORE the host's edit.
--   5. The draft row is deleted. The host's edit is silently lost.
--
-- offers_grooming was correctly added to the column list back in
-- 0023 and is preserved through every subsequent CREATE OR REPLACE
-- (0026, 0034). The three from 0041 are the only ones missing.
--
-- FIX:
-- CREATE OR REPLACE promote_listing_draft with the body BYTE-IDENTICAL
-- to its current live form (0034 is the most recent redefinition;
-- 0026 was the previous; 0023 the original). The ONLY change is three
-- new lines inserted into the UPDATE column list immediately after
-- offers_grooming, mirroring its pattern exactly:
--
--   offers_vet           = d.offers_vet,
--   offers_insurance     = d.offers_insurance,
--   offers_transport     = d.offers_transport,
--
-- No coalesce, no null-handling, no defaults — same shape as the
-- existing offers_grooming line. If draft.offers_grooming works
-- under the current model (it does — the draft-create code path
-- populates the draft row from the listing's current values, so
-- the column is never truly null in practice), the same model
-- works for the three new flags.
--
-- BYTE-FOR-BYTE PRESERVATION CHECKLIST (vs 0034):
--   * Function signature                          unchanged
--   * `returns text[]`                            unchanged
--   * `language plpgsql`                          unchanged
--   * `security definer`                          unchanged
--   * `set search_path = public`                  unchanged
--   * `declare` block + three vars                unchanged
--   * is_admin() check + 42501 raise              unchanged
--   * FOR UPDATE row lock                         unchanged
--   * v_field_draft_exists / v_photo_draft_exists unchanged
--   * UPDATE listings ... SET city ... resident_pets_note (10 cols)  unchanged
--   * offers_grooming line                        unchanged
--   * host_gender / requires_vaccination / accepts_species lines     unchanged
--   * status = 'approved' literal                 unchanged
--   * FROM listing_drafts d join                  unchanged
--   * elsif photo-only branch (status flip only)  unchanged
--   * Photo orphan collection + reinsert          unchanged
--   * listing_drafts delete                       unchanged
--   * return v_orphan_urls                        unchanged
--
-- The diff vs 0034 is EXACTLY three contiguous added lines.
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
           offers_vet           = d.offers_vet,
           offers_insurance     = d.offers_insurance,
           offers_transport     = d.offers_transport,
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
-- GRANTs — re-stated for parity with 0023.
-- CREATE OR REPLACE preserves the existing privileges on a
-- function, so these are NO-OPs in normal apply order (they
-- already match what 0023 set up). Kept here so a fresh DB
-- rebuilt from migrations doesn't drift if 0023 is ever
-- consolidated. Order matches 0023: revoke from broad
-- grantees first, then grant to authenticated only.
-- ============================================================
revoke execute on function public.promote_listing_draft(uuid) from public;
revoke execute on function public.promote_listing_draft(uuid) from anon;
revoke execute on function public.promote_listing_draft(uuid) from service_role;
grant  execute on function public.promote_listing_draft(uuid) to   authenticated;


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. The redefined promote_listing_draft references all four
--    offers_* columns. Quick sanity check that the three new
--    lines are present AND the existing offers_grooming line
--    survived (would catch the case where a future edit drops
--    one of them).
--
--   select
--     pg_get_functiondef(p.oid) ilike '%offers_grooming%'  as has_grooming,
--     pg_get_functiondef(p.oid) ilike '%offers_vet%'       as has_vet,
--     pg_get_functiondef(p.oid) ilike '%offers_insurance%' as has_insurance,
--     pg_get_functiondef(p.oid) ilike '%offers_transport%' as has_transport
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'promote_listing_draft';
--   expect: 1 row, all four columns = t (true).
--
-- 2. Sanity: the other columns from 0034 (accepts_species) and 0026
--    (requires_vaccination) and 0023 (everything else) are still
--    present — confirms 0042 didn't accidentally strip a prior
--    extension.
--
--   select
--     pg_get_functiondef(p.oid) ilike '%accepts_species%'      as has_species,
--     pg_get_functiondef(p.oid) ilike '%requires_vaccination%' as has_vaccination,
--     pg_get_functiondef(p.oid) ilike '%host_gender%'          as has_host_gender,
--     pg_get_functiondef(p.oid) ilike '%resident_pets_note%'   as has_resident_note
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'promote_listing_draft';
--   expect: 1 row, all four columns = t (true).
--
-- 3. Behavioral check (manual, on a non-prod listing): create a
--    listing_drafts row that flips all three new flags to true on
--    an approved listing, then call promote_listing_draft as admin
--    and confirm the listings row reflects them. This is the bug
--    fix verification — the data-loss path described in the header
--    should no longer reproduce.

-- Step 8f — Listing-draft promote / discard RPCs + draft reorder RPC.
--
-- Three SECURITY DEFINER functions that complete the admin loop on
-- the two-copy edit model:
--
--   promote_listing_draft(p_listing_id)
--     ADMIN-ONLY. Applies whatever drafts exist (fields, photos, or
--     both) onto the live listing, sets status='approved', and wipes
--     the draft rows. Returns the array of now-orphaned live-photo
--     URLs so the admin client can best-effort storage.remove them.
--
--   discard_listing_draft(p_listing_id)
--     ADMIN or HOST of listing. Deletes both draft tables for the
--     listing. Returns the array of draft-photo URLs that are NOT
--     also referenced by the live listing_photos — those are safe
--     to clean up from storage. Replaces the non-atomic host-side
--     delete from 8d.
--
--   reorder_listing_photo_drafts(p_listing_id, p_order)
--     ADMIN or HOST of listing. Drafts-table sibling of the
--     reorder_listing_photos RPC from migration 0020. Same caller-
--     owns check, same two-phase negative-sentinel write under the
--     unique(listing_id, sort_order) constraint, against
--     listing_photo_drafts instead of listing_photos.
--
-- All three: SET search_path = public, GRANT EXECUTE to authenticated
-- only (Supabase default-privileges' anon + service_role explicitly
-- revoked; public revoked too).

-- ============================================================
-- promote_listing_draft — admin approves drafts onto live
-- ============================================================
--
-- Auth: admin-only. The very first statement raises 'unauthorized'
-- (errcode 42501) if public.is_admin() returns false. There's no
-- host or anon path through this function. SECURITY DEFINER lets the
-- function operate across the table policies, but the in-function
-- check binds the authorization to the calling user — auth.uid()
-- inside a SECURITY DEFINER function still returns the JWT subject,
-- and is_admin() reads public.profiles for that subject's role.
--
-- Three-case handling (field-only / photo-only / both):
--
--   v_field_draft_exists is true → copy every draft field onto the
--     listings row AND set status='approved' in the same UPDATE.
--
--   v_field_draft_exists is false AND v_photo_draft_exists is true →
--     run a smaller UPDATE that only sets status='approved' (no
--     field columns touched).
--
--   v_photo_draft_exists is true → capture live photo URLs to return,
--     DELETE listing_photos, INSERT listing_photo_drafts rows into
--     listing_photos (sort_order preserved), DELETE
--     listing_photo_drafts.
--
--   v_field_draft_exists is true → DELETE listing_drafts at the end.
--
--   Neither exists → no-op, returns empty orphan array.
--
-- Locked decision: status is unconditionally set to 'approved' — a
-- paused listing whose draft is approved comes back LIVE (per Step 8
-- Part 1 review).
--
-- Orphan return: the function returns the array of URLs that USED to
-- live on listing_photos for this listing but are NOT in the new
-- (promoted) photo set. The admin client calls storage.remove on
-- those after the RPC succeeds. URLs the draft re-uses (shared with
-- live via the 8e snapshot-on-first-touch step) are deliberately
-- excluded from the orphan list — removing those would break the
-- now-live photo.

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
  -- 1. AUTHORIZATION: admin only.
  if not public.is_admin() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- 2. Lock the parent row. If missing, no-op.
  perform 1 from public.listings where id = p_listing_id for update;
  if not found then
    return v_orphan_urls;
  end if;

  -- 3. Detect drafts.
  select exists (
    select 1 from public.listing_drafts where listing_id = p_listing_id
  ) into v_field_draft_exists;

  select exists (
    select 1 from public.listing_photo_drafts where listing_id = p_listing_id
  ) into v_photo_draft_exists;

  -- 4a. Field draft → copy fields + flip status. The bridge trigger
  --     from migration 0021 syncs is_active in the same UPDATE.
  if v_field_draft_exists then
    update public.listings
       set city                = d.city,
           neighborhood        = d.neighborhood,
           title_ar            = d.title_ar,
           title_en            = d.title_en,
           description_ar      = d.description_ar,
           description_en      = d.description_en,
           nightly_price_sar   = d.nightly_price_sar,
           max_concurrent_pets = d.max_concurrent_pets,
           has_resident_pets   = d.has_resident_pets,
           resident_pets_note  = d.resident_pets_note,
           offers_grooming     = d.offers_grooming,
           host_gender         = d.host_gender,
           status              = 'approved'
      from public.listing_drafts d
     where public.listings.id = p_listing_id
       and d.listing_id = p_listing_id;
  -- 4b. Photo-only path → still bump status to approved (locked
  --     decision: approving brings paused back live).
  elsif v_photo_draft_exists then
    update public.listings
       set status = 'approved'
     where id = p_listing_id;
  end if;

  -- 5. Photo draft → replace live photos with draft photos.
  if v_photo_draft_exists then
    -- 5a. Capture orphan URLs: URLs currently in listing_photos that
    --     are NOT in the new draft set. Those are the ones whose
    --     storage objects become unreferenced after the swap.
    select coalesce(array_agg(photo_url), array[]::text[])
      into v_orphan_urls
      from public.listing_photos
     where listing_id = p_listing_id
       and photo_url not in (
         select photo_url
         from public.listing_photo_drafts
         where listing_id = p_listing_id
       );

    -- 5b. Wipe live photo rows for this listing.
    delete from public.listing_photos where listing_id = p_listing_id;

    -- 5c. Copy draft photo rows into live (preserving sort_order).
    insert into public.listing_photos (listing_id, photo_url, sort_order)
      select listing_id, photo_url, sort_order
      from public.listing_photo_drafts
     where listing_id = p_listing_id;

    -- 5d. Wipe draft photo rows.
    delete from public.listing_photo_drafts where listing_id = p_listing_id;
  end if;

  -- 6. Wipe field draft row.
  if v_field_draft_exists then
    delete from public.listing_drafts where listing_id = p_listing_id;
  end if;

  return v_orphan_urls;
end;
$$;

revoke execute on function public.promote_listing_draft(uuid) from public;
revoke execute on function public.promote_listing_draft(uuid) from anon;
revoke execute on function public.promote_listing_draft(uuid) from service_role;
grant  execute on function public.promote_listing_draft(uuid) to   authenticated;


-- ============================================================
-- discard_listing_draft — admin or host wipes drafts
-- ============================================================
--
-- Auth: admin OR (host of parent listing AND is_active_user()).
-- Mirrors the RLS DELETE policies on the draft tables — a suspended
-- host cannot discard their drafts either by direct DELETE or via
-- this RPC. Replaces the non-atomic host-side delete from 8d's
-- discardListingDraft helper, which did two sequential DELETEs.
--
-- Orphan return: filtered to URLs that exist in listing_photo_drafts
-- but NOT in listing_photos. Snapshot-on-first-touch shares URLs
-- between live and draft; reporting those as orphans would break the
-- public-facing photo when the admin client called storage.remove
-- on them. Filtered urls = "safe to remove."

create or replace function public.discard_listing_draft(
  p_listing_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_host_id     uuid;
  v_orphan_urls text[] := array[]::text[];
begin
  -- Reject anonymous callers.
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Listing must exist. Missing → 'unauthorized' (don't leak).
  select host_id into v_host_id
    from public.listings
   where id = p_listing_id;
  if v_host_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Admin OR (host AND active).
  if not (
    public.is_admin()
    or (public.is_active_user() and v_host_id = v_uid)
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Safe-orphan filter: draft URLs NOT also in live.
  select coalesce(array_agg(photo_url), array[]::text[])
    into v_orphan_urls
    from public.listing_photo_drafts
   where listing_id = p_listing_id
     and photo_url not in (
       select photo_url from public.listing_photos
       where listing_id = p_listing_id
     );

  delete from public.listing_photo_drafts where listing_id = p_listing_id;
  delete from public.listing_drafts where listing_id = p_listing_id;

  return v_orphan_urls;
end;
$$;

revoke execute on function public.discard_listing_draft(uuid) from public;
revoke execute on function public.discard_listing_draft(uuid) from anon;
revoke execute on function public.discard_listing_draft(uuid) from service_role;
grant  execute on function public.discard_listing_draft(uuid) to   authenticated;


-- ============================================================
-- reorder_listing_photo_drafts — atomic draft reorder
-- ============================================================
--
-- Same shape as reorder_listing_photos (migration 0020). Auth: admin
-- OR (host of parent listing AND is_active_user()). Two-phase write
-- with sentinel negative sort_orders to dodge the
-- unique(listing_id, sort_order) constraint. Replaces the inline
-- client-side reorder from 8e with an atomic single-call.

create or replace function public.reorder_listing_photo_drafts(
  p_listing_id uuid,
  p_order      uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_host_id     uuid;
  v_photo_count integer;
  v_match_count integer;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select host_id into v_host_id
    from public.listings
   where id = p_listing_id;
  if v_host_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if not (
    public.is_admin()
    or (public.is_active_user() and v_host_id = v_uid)
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Completeness: p_order must be a full reordering.
  select count(*) into v_photo_count
    from public.listing_photo_drafts
   where listing_id = p_listing_id;

  if coalesce(array_length(p_order, 1), 0) <> v_photo_count then
    raise exception 'order_length_mismatch' using errcode = '22023';
  end if;

  select count(*) into v_match_count
    from public.listing_photo_drafts
   where listing_id = p_listing_id
     and id = any(p_order);

  if v_match_count <> v_photo_count then
    raise exception 'order_contains_foreign_ids' using errcode = '22023';
  end if;

  -- Phase 1: sentinel negative sort_orders.
  with new_order as (
    select id, (ordinality - 1)::int as new_pos
    from unnest(p_order) with ordinality as t(id, ordinality)
  )
  update public.listing_photo_drafts lp
     set sort_order = -1000000 - n.new_pos
    from new_order n
   where lp.id = n.id
     and lp.listing_id = p_listing_id;

  -- Phase 2: final 0..N-1.
  with new_order as (
    select id, (ordinality - 1)::int as new_pos
    from unnest(p_order) with ordinality as t(id, ordinality)
  )
  update public.listing_photo_drafts lp
     set sort_order = n.new_pos
    from new_order n
   where lp.id = n.id
     and lp.listing_id = p_listing_id;
end;
$$;

revoke execute on function public.reorder_listing_photo_drafts(uuid, uuid[]) from public;
revoke execute on function public.reorder_listing_photo_drafts(uuid, uuid[]) from anon;
revoke execute on function public.reorder_listing_photo_drafts(uuid, uuid[]) from service_role;
grant  execute on function public.reorder_listing_photo_drafts(uuid, uuid[]) to   authenticated;

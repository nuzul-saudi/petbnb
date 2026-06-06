-- Step 7.3a: atomic photo reorder RPC.
--
-- Why this exists: listing_photos has unique (listing_id, sort_order).
-- A naive client-side "update one row at a time" sequence trips the
-- unique check mid-swap, and is N round-trips of latency. This function
-- does the whole reorder atomically server-side: the client passes the
-- photo ids in their new display order, the position in the array
-- becomes sort_order (0-based — index 0 is the cover, matching the
-- "lowest sort_order = cover" rule used by the feed transform in
-- src/lib/listings.ts).
--
-- Unique-constraint approach: TWO-PHASE WRITE inside the function.
-- The unique constraint from 0001 is the default NOT DEFERRABLE
-- INITIALLY IMMEDIATE; we deliberately do NOT alter it. Phase 1 parks
-- every targeted row at a sentinel sort_order in the negative range
-- (real sort_order is always >= 0, so it never collides). Phase 2
-- writes the final 0..N-1 values. Both updates run inside the
-- function's transaction, so a mid-way failure rolls back — same
-- atomicity a deferred constraint would give us, but local to this
-- function with no global schema change.
--
-- Authorization: SECURITY DEFINER + a hard pre-flight check that the
-- caller owns p_listing_id (or is an admin). Without that check, any
-- authenticated user could rewrite anyone's photo order — the whole
-- reason listing_photos has owner-gated policies in 0002/0004.
-- Mirrors the unauthorized-with-42501 pattern from 0005's
-- admin_list_users.
--
-- An explicit auth.uid() IS NULL guard sits at the top of the auth
-- block. Without it an anonymous caller would slip through, because
-- `v_host_id <> null` evaluates to NULL (three-valued logic) and the
-- `if` falls through. Defense in depth: even if a future grant slip
-- re-exposed this RPC to anon, the in-function check would still
-- reject. The grant block below also explicitly strips anon and
-- service_role — Supabase's default-privileges rule on schema public
-- auto-grants EXECUTE to all three roles on every new function, and
-- a plain `revoke ... from public` does not strip them.
--
-- Completeness: p_order must be a full reordering. Partial arrays and
-- arrays containing ids that don't belong to p_listing_id both raise.
-- Add and delete flows do not call this RPC — they go through the
-- host's INSERT/DELETE policies and call this afterwards with the
-- new full list.

create or replace function public.reorder_listing_photos(
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
  -- 1. AUTHORIZATION.
  --    1a. Reject anonymous callers explicitly (null auth.uid()).
  --        Without this, the v_host_id <> v_uid comparison below
  --        evaluates to NULL and the `if` falls through.
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  --    1b. Listing must exist; missing → 'unauthorized' to avoid
  --        leaking existence.
  select host_id into v_host_id
  from public.listings
  where id = p_listing_id;

  if v_host_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  --    1c. Caller must be the host, or an admin.
  if not public.is_admin()
     and v_host_id <> v_uid then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- 2. COMPLETENESS — p_order must be a full reordering.
  select count(*) into v_photo_count
  from public.listing_photos
  where listing_id = p_listing_id;

  if coalesce(array_length(p_order, 1), 0) <> v_photo_count then
    raise exception 'order_length_mismatch'
      using errcode = '22023';
  end if;

  select count(*) into v_match_count
  from public.listing_photos
  where listing_id = p_listing_id
    and id = any(p_order);

  if v_match_count <> v_photo_count then
    raise exception 'order_contains_foreign_ids'
      using errcode = '22023';
  end if;

  -- 3. PHASE 1 — park at sentinel negative sort_order.
  with new_order as (
    select id, (ordinality - 1)::int as new_pos
    from unnest(p_order) with ordinality as t(id, ordinality)
  )
  update public.listing_photos lp
  set sort_order = -1000000 - n.new_pos
  from new_order n
  where lp.id = n.id
    and lp.listing_id = p_listing_id;

  -- 4. PHASE 2 — write final 0..N-1.
  with new_order as (
    select id, (ordinality - 1)::int as new_pos
    from unnest(p_order) with ordinality as t(id, ordinality)
  )
  update public.listing_photos lp
  set sort_order = n.new_pos
  from new_order n
  where lp.id = n.id
    and lp.listing_id = p_listing_id;
end;
$$;

-- Grant cleanup. Supabase's default-privileges rule on schema public
-- auto-grants EXECUTE on every new function to anon, authenticated, and
-- service_role; a plain `revoke ... from public` does NOT strip those
-- explicit role grants. We strip anon and service_role here so only
-- authenticated callers can invoke the RPC. service_role can be
-- re-granted the day we add a server-side caller that needs it.
revoke execute on function public.reorder_listing_photos(uuid, uuid[]) from public;
revoke execute on function public.reorder_listing_photos(uuid, uuid[]) from anon;
revoke execute on function public.reorder_listing_photos(uuid, uuid[]) from service_role;
grant  execute on function public.reorder_listing_photos(uuid, uuid[]) to   authenticated;

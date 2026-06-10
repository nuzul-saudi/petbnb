-- Step 8.0b — DB-level status transition guard for the listings table.
--
-- Background: until now, the soft approval gate has lived entirely at
-- the app layer. createListing inserts with status='pending', the
-- host edit screen flips approved↔paused via setListingStatus, and
-- only admin paths set 'approved' or 'admin_disabled'. RLS lets the
-- host UPDATE their own row freely, so a determined host (or a
-- buggy future code path) could write status='approved' or
-- status='admin_disabled' directly and bypass the queue.
--
-- This migration installs a BEFORE INSERT OR UPDATE trigger that
-- enforces the transition matrix at the DB layer. is_admin() is
-- always permitted; for non-admins:
--
--   INSERT: status MUST be 'pending'. Brand-new listings always
--           start in the queue.
--
--   UPDATE where status is unchanged: pass.
--
--   UPDATE where status changes: ONLY the two host-controlled
--   pause toggles are allowed:
--     approved → paused   (host turns off)
--     paused   → approved (host turns back on)
--
--   Everything else raises 'unauthorized' (errcode 42501):
--     pending → approved          (must go through admin Approve)
--     paused / admin_disabled →
--       approved/pending/admin_disabled (admin-only paths)
--     any → admin_disabled        (admin Take-offline / Reject-new)
--     promote_listing_draft sets 'approved' too — but that RPC is
--       SECURITY DEFINER with admin-only auth, so its UPDATE rides
--       through the is_admin() bypass at the top of this trigger.
--
-- Non-status UPDATEs (price changes, photo edits via drafts, etc)
-- are untouched. Only status transitions are policed.

create or replace function public.guard_listing_status_transition()
returns trigger
language plpgsql
as $$
begin
  -- Admin: full bypass. promote_listing_draft / approve / take-offline
  -- / restore / rejectNewListing all run as admin.
  if public.is_admin() then
    return NEW;
  end if;

  -- Non-admin INSERT: status must be 'pending'. The column default
  -- is 'pending' so this only bites if a caller explicitly tried
  -- to insert with a different value.
  if TG_OP = 'INSERT' then
    if NEW.status is distinct from 'pending' then
      raise exception 'unauthorized: new listings must start in pending status'
        using errcode = '42501';
    end if;
    return NEW;
  end if;

  -- Non-admin UPDATE: only inspect status transitions.
  if TG_OP = 'UPDATE' then
    -- Status unchanged → allow (field edits, photo edits via drafts,
    -- tier changes by admin tooling that runs as admin, etc).
    if NEW.status is not distinct from OLD.status then
      return NEW;
    end if;

    -- The two permitted host transitions.
    if (OLD.status = 'approved' and NEW.status = 'paused')
       or (OLD.status = 'paused' and NEW.status = 'approved') then
      return NEW;
    end if;

    raise exception
      'unauthorized: only admin can transition listings.status from % to %',
      OLD.status, NEW.status
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists listings_status_guard on public.listings;
create trigger listings_status_guard
  before insert or update on public.listings
  for each row
  execute function public.guard_listing_status_transition();


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Trigger present and enabled.
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.listings'::regclass
--     and tgname = 'listings_status_guard';
--   expect: 1 row, tgenabled = 'O'.
--
-- 2. Function present.
--   select proname from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and proname = 'guard_listing_status_transition';
--   expect: 1 row.
--
-- 3. Compatibility sanity (smoke-test, NOT run as part of migration):
--    Sign in as a non-admin host and try:
--      update listings set status = 'admin_disabled' where id = '<own listing>';
--    expect: ERROR 42501 unauthorized.
--    Then try:
--      update listings set status = 'paused' where id = '<own approved listing>';
--    expect: success.
--
-- 4. Admin sanity:
--    As admin, the same admin_disabled UPDATE on any listing succeeds.
--
-- ============================================================
-- Compatibility verification (stated in the batch report):
-- ============================================================
--
-- createListing                      INSERT pending                       ✓ allowed
-- host deactivate (edit screen)      UPDATE approved → paused             ✓ allowed
-- host reactivate (edit screen)      UPDATE paused → approved             ✓ allowed
-- promote_listing_draft RPC          UPDATE * → approved (SECURITY DEFINER, admin-gated)  ✓ allowed via is_admin() bypass
-- approveNewListing (admin)          UPDATE pending → approved            ✓ allowed via is_admin() bypass
-- rejectNewListing (admin)           UPDATE pending → admin_disabled      ✓ allowed via is_admin() bypass
-- adminTakeOffline                   UPDATE approved → admin_disabled     ✓ allowed via is_admin() bypass
-- adminRestoreListing                UPDATE admin_disabled → approved     ✓ allowed via is_admin() bypass
-- updateListing field edits          UPDATE with status unchanged         ✓ allowed (no status change)
-- discard_listing_draft              DELETE on drafts, not listings       ✓ doesn't touch listings.status

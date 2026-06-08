-- Step 8a — listings.status column + bidirectional bridge trigger.
--
-- Replaces the binary is_active flag with a four-state status field
-- as the canonical visibility signal for listings:
--   pending        — never approved, awaiting admin
--   approved       — live, public
--   paused         — host turned it off (host can reactivate)
--   admin_disabled — admin took it down (host CANNOT reactivate;
--                    only admin lifts this state)
--
-- This is the first migration in Step 8 (listing status + two-copy
-- edit model). It runs BEFORE any app reads or writes migrate:
--   * Pre-8b code keeps reading and writing is_active.
--   * The new status column is backfilled from is_active.
--   * A BIDIRECTIONAL bridge trigger keeps the two columns aligned
--     during the bridge window:
--       - If status was the field that just changed → mirror to
--         is_active.
--       - If is_active was the field that just changed (pre-8b code
--         path) → mirror back to status, mapping true → 'approved'
--         and false → 'pending'.
--     The back-direction can only express two of the four states;
--     a row sitting at 'paused' or 'admin_disabled' touched by
--     pre-8b code collapses to 'approved' or 'pending'. Harmless
--     in the bridge window: pre-8b code has no way to CREATE rows
--     at 'paused' or 'admin_disabled', so none exist during the
--     window where pre-8b writes are still possible.
--   * 8b migrates every is_active read AND write to status. Once 8b
--     ships, nothing in app code writes is_active; the back-direction
--     of the trigger goes dormant, and is_active becomes a passive
--     shadow column kept current via the forward direction.
--   * 8i drops is_active + this trigger entirely.
--
-- Backfill mapping (pre-flight checked: no rows in this DB should
-- land on 'paused' or 'admin_disabled' at backfill time — those
-- states have no provenance from the current is_active model):
--   is_active=true  → 'approved'
--   is_active=false → 'pending'

-- 1. Add the column (nullable for the backfill step).
alter table public.listings
  add column if not exists status text;

-- 2. Backfill from is_active. Idempotent — only fills NULLs, so
--    re-running this migration after rows have flipped via normal
--    app paths leaves them alone.
update public.listings
  set status = case when is_active then 'approved' else 'pending' end
  where status is null;

-- 3. Tighten: NOT NULL + CHECK with all four states + default.
--    Default 'pending' matches the post-7.2 approval-gate behavior
--    of is_active defaulting to false (migration 0019).
alter table public.listings
  alter column status set not null;

alter table public.listings
  add constraint listings_status_check
  check (status in ('pending','approved','paused','admin_disabled'));

alter table public.listings
  alter column status set default 'pending';

-- 4. Index — listActiveListings will filter .eq('status','approved')
--    after 8b. Single-column btree is enough; the existing city /
--    host_id / etc indexes still serve the rest of the feed filters.
create index if not exists listings_status_idx
  on public.listings(status);

-- 5. Bidirectional bridge trigger — sync_listing_is_active.
--
--    Forward (status → is_active): fires when status is the column
--    that just changed. is_active = (status = 'approved'). Keeps
--    is_active aligned for any leftover DB-side reader after 8b.
--
--    Back (is_active → status): fires when only is_active changed
--    (pre-8b code paths). status = case when is_active then
--    'approved' else 'pending' end. Two-state collapse is acceptable
--    because no pre-8b code path can produce 'paused' or
--    'admin_disabled', so no row in those states can be touched by
--    pre-8b code.
--
--    Together, the bridge guarantees the two columns can never be
--    observed disagreeing — regardless of which side wrote, the
--    other side aligns within the same UPDATE.
--
--    No INSERT branch: createListing sets is_active=false explicitly
--    and status defaults to 'pending' via the column default — fresh
--    rows land consistent without trigger help. Other INSERT paths
--    that omit both columns also land consistent (defaults:
--    false / 'pending').
create or replace function public.sync_listing_is_active()
returns trigger
language plpgsql
as $$
begin
  if NEW.status is distinct from OLD.status then
    NEW.is_active = (NEW.status = 'approved');
  elsif NEW.is_active is distinct from OLD.is_active then
    NEW.status = case when NEW.is_active then 'approved' else 'pending' end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists listings_sync_is_active on public.listings;
create trigger listings_sync_is_active
  before update on public.listings
  for each row
  execute function public.sync_listing_is_active();

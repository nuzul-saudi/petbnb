-- ============================================================
-- 0046 — β Thread Continuity
-- ============================================================
--
-- Plan doc: docs/migration-0046-beta-thread-continuity-plan.md
--
-- Goal: enable the inquiry/conversation page to render the
-- COMPREHENSIVE host-owner timeline by linking bookings back to
-- the inquiry they originated from + recording every status
-- transition's timestamp for the lifecycle dividers.
--
-- SAFETY GUARANTEE — load-bearing for the merge model:
-- messages stay PHYSICALLY in their own threads. No row repointing,
-- no message-row migration. The 0040 messages_one_thread_check
-- CHECK constraint (booking_id XOR inquiry_id) stays correct; the
-- 0044 messages_update_own_until_read policy + guard_message_update
-- trigger + mark_thread_read RPC are all untouched. The merge is
-- purely query + display in the app layer.
--
-- Strategy review status (2026-06-30): plan CLEARED with the four
-- decisions baked in below.
--
-- ============================================================
-- DECISIONS BAKED IN
-- ============================================================
--
-- Q1 — Capture timestamps for ALL transitions even if they never
-- fire under current code. Strategy verified that:
--   accepted   → written by src/lib/bookings.ts:863 (acceptBookingAsHost)
--   completed  → written by src/lib/bookings.ts:903 (completeBooking)
--   cancelled  → written by src/lib/bookings.ts:727 (cancelBooking) +
--                cancelled_at also set in the same UPDATE (0028 owns it)
--   disputed   → written by src/lib/bookings.ts:785 (disputeBooking)
--   declined   → NEVER written by current code (payment.ts:15 mention
--                is the MockPaymentProvider's return type, not a
--                booking-status write). Schema enum allows it; column
--                added for forward-compat. Stays null → no divider.
--   active     → NEVER written by current code. Same posture as
--                declined. Stays null → no divider.
-- A status that never occurs leaves its _at null and simply shows
-- no divider. Zero harm; cheap; schema-stable for future helpers.
--
-- Q2 — Backfill ambiguity: OPTION α. If more than one inquiry
-- matches a booking by (listing_id, owner_id, created_at ordering),
-- leave bookings.inquiry_id NULL. Never auto-pick; a wrong link
-- merges a stranger's conversation into the timeline. The booking
-- still works standalone; the timeline just falls back to "no
-- inquiry context" for that booking.
--
-- Q3 — Stamping: TRIGGER. New guard_booking_status_stamp fires
-- BEFORE UPDATE on bookings, stamps <status>_at = now() when the
-- status transition fires AND the column is currently null.
-- Idempotency guaranteed by the IS NULL check — re-transitions
-- into the same status preserve the original stamp.
--
-- cancelled_at RECONCILIATION (Strategy's required pick):
--   THE STAMPER DOES NOT TOUCH cancelled_at.
--   0028 owns cancelled_at exclusively via src/lib/bookings.ts:728
--   (cancelBooking, which writes status + cancelled_at + refund_sar
--   in a single UPDATE). The cancel transition is an event with
--   side data (refund), not a pure status flip; mixing the
--   app-supplied refund_sar UPDATE with a trigger-supplied
--   cancelled_at stamp is unnecessary complexity. The stamper's
--   case statement covers accepted / declined / active /
--   completed / disputed only. cancelled is omitted by design.
--
-- Q4 — Merge surface: CLIENT-SIDE. No new SECURITY DEFINER RPC.
-- The app PR fetches the inquiry messages + linked bookings +
-- each booking's messages via existing helpers (RLS-permitted)
-- and merges chronologically into blocks in app code. The
-- viewer's RLS reach already covers every piece. This SQL ships
-- schema only; no RPC for the merge itself.
--
-- ============================================================
-- POSITIVE INVARIANTS (worth naming so future-Claude doesn't
-- "fix" them as bugs)
-- ============================================================
--
-- A) inquiry.status STAYS 'open' forever (effectively).
--    0043 removed the close affordance. 0046 does NOT add a
--    convert step (the comprehensive-timeline model means
--    post-booking messages route BACK to the inquiry, so closing
--    the inquiry would silently block them). inquiry.status is
--    near-vestigial. The enum + check stay in place because
--    legacy 'closed' rows may exist and future product moves
--    might reuse the field.
--
-- B) The partial-unique index inquiries_one_open_per_pair
--    (UNIQUE (listing_id, starter_id) WHERE status = 'open',
--    defined at 0040:116-118) NOW permanently enforces ONE
--    conversation per (listing, starter). Because (A), every
--    inquiry is 'open' forever, so the partial-unique is
--    effectively a non-partial unique on the pair. This is
--    EXACTLY the β model: at most one conversation per (listing,
--    starter), with any number of bookings linked to it. The
--    index is doing structural work it was originally designed
--    for as a half-measure; we're now leaning on it as a
--    feature. Do NOT change this index.
--
-- ============================================================
-- "OPEN BOOKING" semantic (baked here for the app PR to honor)
-- ============================================================
--
-- The smart-compose router in the comprehensive timeline routes a
-- new message to a CURRENTLY-OPEN linked booking if one exists;
-- otherwise to the inquiry. Definition of "open":
--
--   OPEN     : status in ('requested', 'accepted', 'active', 'disputed')
--   CLOSED   : status in ('completed', 'declined', 'cancelled')
--
-- Multiple open simultaneously → route to the MOST RECENT by
-- created_at (the booking the user is currently engaging with).
-- A booking with no active conversation just sits in its own
-- block; the inquiry compose handles the catch-all. The DB does
-- not enforce this rule (it's app-layer routing); it's documented
-- here so the SQL serves as authoritative reference.
--
-- ============================================================
-- TRIGGER COEXISTENCE — confirmed disjoint
-- ============================================================
--
-- public.bookings already has TWO BEFORE-triggers. Adding a third
-- needs to coexist with them. Postgres fires BEFORE triggers in
-- alphabetical name order on each event.
--
--   bookings_capacity_guard      (0027) BEFORE INSERT OR UPDATE
--   guard_booking_status_stamp   (NEW)  BEFORE UPDATE
--   guard_booking_update         (0044) BEFORE UPDATE
--
-- Alphabetical firing order on UPDATE: b < g, then within g- the
-- statuS_stamp sorts before the _update. So:
--   bookings_capacity_guard       runs first
--   guard_booking_status_stamp    runs second
--   guard_booking_update          runs third
--
-- Disjoint column responsibilities:
--   capacity guard       READS  status, start_date, end_date, listing_id
--                        WRITES nothing (raises or returns NEW unchanged)
--   stamper (NEW)        READS  old.status, new.status, new.<status>_at
--                        WRITES new.<status>_at (only when null)
--   monotonicity guard   READS  old.*_last_opened_at, new.*_last_opened_at
--                        WRITES nothing (raises or returns NEW unchanged)
--
-- Stamper's writes to <status>_at are invisible to the
-- monotonicity guard (different columns). Capacity guard fires
-- first, so the stamper sees whatever status survived. No
-- collision.
-- ============================================================


-- ============================================================
-- 1. bookings.inquiry_id — link a booking to the inquiry it
--    originated from
-- ============================================================
-- Nullable: bookings created directly from a listing detail page
-- (no preceding inquiry) leave this null. That's the correct
-- semantic; the timeline for such bookings just doesn't extend
-- backward into a pre-booking thread.
--
-- ON DELETE SET NULL: losing the inquiry parent shouldn't cascade-
-- delete a real booking row. The booking can stand on its own
-- (its booking_id-scoped messages and lifecycle stay intact);
-- the timeline falls back to "no inquiry context."

alter table public.bookings
  add column inquiry_id uuid
    references public.inquiries(id) on delete set null;

-- Partial index — most rows are null, so a full B-tree would
-- waste space. The lookup "give me all bookings linked to this
-- inquiry" is exactly the merged-timeline query's hot path.

create index bookings_inquiry_id_idx
  on public.bookings(inquiry_id)
  where inquiry_id is not null;


-- ============================================================
-- 2. Status-transition timestamps
-- ============================================================
-- Q1 decision: capture EVERY transition the enum permits even if
-- no current code path writes that status. Future helpers (admin
-- decline action, derived-active from dates) can land without
-- another schema migration.
--
-- cancelled_at is NOT added here — it already exists from 0028
-- (Section 6 of CLAUDE.md, payments foundations migration). The
-- stamper SKIPS cancelled per the reconciliation decision in the
-- header.

alter table public.bookings
  add column accepted_at  timestamptz,
  add column declined_at  timestamptz,
  add column active_at    timestamptz,
  add column completed_at timestamptz,
  add column disputed_at  timestamptz;


-- ============================================================
-- 3. guard_booking_status_stamp — BEFORE UPDATE trigger
-- ============================================================
-- Stamps <status>_at = now() when the status transitions INTO
-- that status AND the column is currently null. The IS NULL check
-- is the idempotency lever:
--   * a status change accepted → active → completed leaves
--     accepted_at, active_at, completed_at all populated.
--   * a hypothetical re-transition (status flipped away and back)
--     preserves the original stamp — first-time-this-status
--     wins.
--   * an UPDATE that doesn't change status (touching only
--     last_opened_at, refund_sar, etc.) does NOT touch any
--     <status>_at because old.status = new.status fails the
--     transition check.
--
-- Defense-in-depth note: if a future caller manually sets BOTH
-- status AND <status>_at in the same UPDATE (the way 0028 does
-- for cancelled_at), this trigger's IS NULL check on
-- new.<status>_at sees the app-supplied value and skips the
-- stamp. So app-layer pre-stamping and trigger stamping coexist
-- without conflict — first one to fill the column wins. (For
-- this migration the stamper is the only writer for the five
-- new _at columns; 0028 stays the sole writer for cancelled_at.)

create or replace function public.guard_booking_status_stamp()
returns trigger
language plpgsql
as $$
begin
  -- Only fire on actual status transitions. If status didn't
  -- change, this trigger has nothing to do.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Stamp the matching _at column when the new status is one we
  -- track AND the column is currently null. cancelled is
  -- deliberately omitted (0028 owns cancelled_at).
  if new.status = 'accepted' and new.accepted_at is null then
    new.accepted_at := now();
  elsif new.status = 'declined' and new.declined_at is null then
    new.declined_at := now();
  elsif new.status = 'active' and new.active_at is null then
    new.active_at := now();
  elsif new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status = 'disputed' and new.disputed_at is null then
    new.disputed_at := now();
  end if;

  return new;
end;
$$;

create trigger guard_booking_status_stamp
  before update on public.bookings
  for each row
  execute function public.guard_booking_status_stamp();


-- ============================================================
-- 4. Backfill — best-effort, OPTION α (leave null on ambiguity)
-- ============================================================
-- Match each existing booking to an inquiry by:
--   * same listing_id
--   * booking.owner_id = inquiry.starter_id
--   * inquiry was OPENED before the booking was placed
--     (inquiry.created_at <= booking.created_at)
--
-- Multiple candidates that all satisfy → leave inquiry_id NULL.
-- The booking still works standalone; only the timeline back-link
-- is missing. The renderer treats that as "no inquiry context"
-- and the booking stands alone in a single-block view.
--
-- Why no recency tiebreak: a recency tiebreak could attach a
-- stranger's later inquiry on the same listing (if two distinct
-- owners' inquiries both predate the booking — wait, the
-- owner_id check filters by user already, so distinct owners
-- can't collide here). The realistic ambiguity is: same user
-- opened multiple inquiries on the same listing over time, then
-- booked. The user clearly intended ONE of those; we can't tell
-- which. Leaving null is the only privacy-safe answer.
--
-- The pre-2026-06-29 historical-null fallback for transition
-- timestamps is intentional: existing bookings have no recorded
-- accepted_at / declined_at / active_at / completed_at /
-- disputed_at, so dividers for prior transitions simply don't
-- render. The placed-divider uses created_at (always set) and
-- the cancelled-divider uses cancelled_at (set on cancelled
-- bookings since 0028). Flagged in the plan doc; not a bug.

update public.bookings b
   set inquiry_id = i.id
  from public.inquiries i
 where b.inquiry_id is null
   and b.listing_id = i.listing_id
   and b.owner_id   = i.starter_id
   and i.created_at <= b.created_at
   and not exists (
     select 1 from public.inquiries i2
     where i2.id <> i.id
       and i2.listing_id = b.listing_id
       and i2.starter_id = b.owner_id
       and i2.created_at <= b.created_at
   );


-- ============================================================
-- 5. RLS — INTENTIONALLY UNCHANGED
-- ============================================================
-- The comprehensive timeline's three read classes (inquiry's
-- messages, each linked booking's messages, the linked bookings
-- themselves + new _at columns) are all permitted by the
-- existing 0040 messages_select_participants policy and the
-- 0004 bookings_select_owner_or_host policy. Verified against
-- each path in docs/migration-0046-beta-thread-continuity-plan.md
-- §3. Zero new policies in 0046.
--
-- Bookings policy count, messages policy count, and storage
-- policy count are all unchanged by this migration. Verification
-- query (5) below asserts that.


-- ============================================================
-- Verification queries — run after applying. Wrap in a
-- read-only transaction.
-- ============================================================
--
-- NOTE on query shape: pg_policies is a VIEW that already
-- exposes qual / with_check as textified strings (it runs
-- pg_get_expr internally). Do NOT wrap them in pg_get_expr —
-- that errors with 'column polrelid does not exist'. Same
-- lesson as 0045.
--
-- 1. New schema is present.
--
--    select column_name, data_type, is_nullable
--      from information_schema.columns
--     where table_schema = 'public'
--       and table_name = 'bookings'
--       and column_name in (
--         'inquiry_id',
--         'accepted_at', 'declined_at', 'active_at',
--         'completed_at', 'disputed_at'
--       )
--     order by column_name;
--    expect: 6 rows. inquiry_id is uuid + YES (nullable). Each
--            _at column is timestamp with time zone + YES.
--
-- 2. The partial index exists.
--
--    select indexname, indexdef
--      from pg_indexes
--     where schemaname = 'public'
--       and tablename = 'bookings'
--       and indexname = 'bookings_inquiry_id_idx';
--    expect: 1 row. indexdef contains 'WHERE (inquiry_id IS NOT NULL)'.
--
-- 3. The FK is present with ON DELETE SET NULL.
--
--    select conname, confdeltype
--      from pg_constraint
--     where conrelid = 'public.bookings'::regclass
--       and contype = 'f'
--       and confrelid = 'public.inquiries'::regclass;
--    expect: 1 row. confdeltype = 'n' (SET NULL).
--
-- 4. The trigger is wired and fires BEFORE UPDATE only.
--
--    select tgname, tgtype
--      from pg_trigger
--     where tgrelid = 'public.bookings'::regclass
--       and tgname = 'guard_booking_status_stamp'
--       and not tgisinternal;
--    expect: 1 row.
--
-- 5. Policy counts are UNCHANGED (no new RLS).
--
--    select schemaname, tablename, count(*) as policy_count
--      from pg_policies
--     where (schemaname = 'public' and tablename in ('bookings', 'messages'))
--        or (schemaname = 'storage' and tablename = 'objects')
--     group by schemaname, tablename
--     order by schemaname, tablename;
--    expect (vs pre-0046 snapshot):
--      public.bookings — same count as pre-apply
--      public.messages — same count as pre-apply
--      storage.objects — same count as pre-apply
--    Compare to the count you noted before running 0046. If any
--    table's count changed, 0046 added RLS it shouldn't have —
--    abort.
--
-- 6. Behavioral spot-check (transactional rollback) — stamps fire
--    correctly. Pick a real test booking by id (B_ID) currently
--    in status 'requested'.
--
--    begin;
--
--    -- Acceptance stamp.
--    update public.bookings
--       set status = 'accepted'
--     where id = B_ID;
--    select status, accepted_at, completed_at
--      from public.bookings where id = B_ID;
--    -- expect: status='accepted', accepted_at is a timestamp
--    --         within the last few seconds, completed_at NULL.
--
--    -- Idempotency: a non-status UPDATE doesn't move accepted_at.
--    update public.bookings
--       set total_sar = total_sar  -- no-op
--     where id = B_ID;
--    -- expect: accepted_at unchanged.
--
--    -- Completion stamp.
--    update public.bookings
--       set status = 'completed'
--     where id = B_ID;
--    select status, accepted_at, completed_at
--      from public.bookings where id = B_ID;
--    -- expect: status='completed', accepted_at unchanged,
--    --         completed_at within the last few seconds.
--
--    rollback;
--
-- 7. cancelled_at is NOT touched by the stamper. Pick a test
--    booking currently in status 'requested' (B_ID).
--
--    begin;
--    update public.bookings
--       set status = 'cancelled'  -- intentionally NO cancelled_at
--     where id = B_ID;
--    select status, cancelled_at from public.bookings where id = B_ID;
--    -- expect: status='cancelled', cancelled_at NULL — confirming
--    --         the stamper deliberately omits cancelled.
--    -- (Real-world cancels go through cancelBooking() which sets
--    --  cancelled_at explicitly per 0028's contract; this query
--    --  is just confirming the trigger isn't double-stamping.)
--    rollback;
--
-- 8. Backfill report — how many rows got linked vs left null.
--
--    select
--      count(*) filter (where inquiry_id is not null) as backfilled,
--      count(*) filter (where inquiry_id is null) as unlinked,
--      count(*) as total
--      from public.bookings;
--    -- Record in docs/migration-apply-log.md.
--
-- 9. The partial-unique invariant from §B of the header holds.
--
--    select count(*) as non_open_count
--      from public.inquiries
--     where status <> 'open';
--    -- expect: 0 (or whatever legacy closed rows existed before
--    --         0043; should be 0 per 2026-06-28's
--    --         legacy_closed_count check). Confirms the
--    --         partial-unique index now functions as a
--    --         non-partial unique on (listing_id, starter_id)
--    --         in practice.

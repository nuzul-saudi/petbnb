-- ============================================================
-- 0043 — Archive removal (inquiry threads never close)
-- ============================================================
--
-- Founder decision (locked 2026-06-28): the "Close inquiry"
-- affordance is removed from the product. Inquiry threads stay
-- open forever; the only valid terminal status remains
-- 'converted' (an inquiry that became a booking).
--
-- This migration does THREE things at the DB layer. The app-layer
-- removal of the Close button + closeInquiry() helper ships in
-- the same commit (separate files, same logical unit).
--
-- 1. Trigger guard: reject any new 'open → closed' transition.
--    Existing 'closed' rows stay 'closed' (the keep-unreachable
--    posture — we don't want a data migration moving them).
--    Existing 'closed' → 'closed' updates (e.g. timestamp touches)
--    remain allowed.
--
-- 2. messages INSERT RLS: today the inquiry branch gates on
--    `i.status = 'open'`. With the archive removed, 'closed'
--    rows must remain messageable (otherwise the existing
--    closed rows turn into dead read-only artifacts). New rule:
--    block only `i.status = 'converted'` — open + closed both
--    writable, converted blocked.
--
-- 3. Enum kept intact: `check (status in ('open','converted',
--    'closed'))` from 0040 is preserved. Dropping 'closed' from
--    the enum would force a data migration of any existing
--    'closed' rows. The keep-unreachable approach lets existing
--    'closed' rows stay valid without code that can produce new
--    ones.
--
-- ============================================================
-- OPEN QUESTION FLAGGED FOR FOUNDER (see comment block at end):
-- ============================================================
-- The partial-unique index inquiries_one_open_per_pair from 0040
-- is defined as: `unique (listing_id, starter_id) where status =
-- 'open'`. With closes now blocked at trigger level, this index
-- becomes effectively a non-partial unique on (listing_id,
-- starter_id) FOR NEW THREADS. However, EXISTING 'closed' rows
-- are excluded from the unique constraint. Under the new RLS
-- they're now messageable. So an existing 'closed' inquiry on a
-- listing does not block a new 'open' inquiry on the same
-- (listing, starter) pair — the founder might end up with two
-- live threads. NOT addressed here; flagged in the verification
-- block. Possible follow-up: widen the partial-unique to
-- `where status <> 'converted'`, which would unify both 'open'
-- and 'closed' under the constraint.


-- ============================================================
-- 1. guard_inquiry_update — reject new 'closed' transitions
-- ============================================================
-- Preserved BYTE-IDENTICAL from 0040 EXCEPT for the one added
-- block: `old.status <> 'closed' AND new.status = 'closed'`
-- now raises. The existing `closed → anything-else` rule
-- (line 263-265 of 0040) is kept so existing 'closed' rows
-- can never escape (which would expose them to fresh transitions
-- the trigger no longer permits).

create or replace function public.guard_inquiry_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'inquiries.id is immutable';
  end if;
  if new.listing_id is distinct from old.listing_id then
    raise exception 'inquiries.listing_id is immutable';
  end if;
  if new.starter_id is distinct from old.starter_id then
    raise exception 'inquiries.starter_id is immutable';
  end if;
  if new.host_id is distinct from old.host_id then
    raise exception 'inquiries.host_id is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'inquiries.created_at is immutable';
  end if;

  if old.status = 'converted' and new.status <> 'converted' then
    raise exception 'inquiry status cannot leave converted';
  end if;
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'inquiry status cannot leave closed';
  end if;

  -- 0043 — new: block fresh closes. Archive affordance is gone
  -- from the product; the only valid status transitions are
  -- open → open (no-op) and open → converted (booking accepted
  -- out of the inquiry). Existing 'closed' rows stay closed
  -- (the previous block already enforced that).
  if old.status <> 'closed' and new.status = 'closed' then
    raise exception 'closing inquiries is no longer permitted (archive removed)';
  end if;

  new.updated_at := now();
  return new;
end;
$$;


-- ============================================================
-- 2. messages_insert_participants — loosen inquiry status gate
-- ============================================================
-- Preserved BYTE-IDENTICAL from 0040 EXCEPT the inquiry-scoped
-- branch's `i.status = 'open'` becomes `i.status <> 'converted'`.
-- The booking-scoped branch is unchanged.
--
-- Net effect:
--   - 'open' inquiry → messageable (unchanged)
--   - 'converted' inquiry → NOT messageable (unchanged — the
--     conversation moved to the booking thread)
--   - 'closed' inquiry → NOW messageable (was blocked pre-0043)
--
-- The trigger above prevents NEW 'closed' rows from being
-- created, so 'closed' only applies to legacy rows. Combined,
-- the practical effect is: new inquiries are messageable while
-- 'open'; on conversion to a booking, the conversation moves
-- to the booking thread; legacy 'closed' rows un-archive
-- themselves the moment either party sends a message.

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    public.is_active_user()
    and sender_id = (select auth.uid())
    and (
      (
        -- BOOKING-SCOPED branch — preserved byte-identical from 0040.
        booking_id is not null and inquiry_id is null
        and exists (
          select 1 from public.bookings b
          left join public.listings l on l.id = b.listing_id
          where b.id = messages.booking_id
            and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
        )
      )
      or
      (
        -- INQUIRY-SCOPED branch — 0043 widens i.status='open' to
        -- i.status <> 'converted' (open + closed both writable).
        inquiry_id is not null and booking_id is null
        and exists (
          select 1 from public.inquiries i
          where i.id = messages.inquiry_id
            and i.status <> 'converted'
            and (
              i.starter_id = (select auth.uid())
              or i.host_id = (select auth.uid())
            )
        )
      )
    )
  );


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. The trigger now rejects open → closed transitions.
--    Manual test (run as a participant on an open inquiry):
--      update public.inquiries set status = 'closed' where id = '<test-id>';
--    expect: SQLSTATE 'P0001' with message
--      'closing inquiries is no longer permitted (archive removed)'
--
-- 2. The trigger still allows the converted-terminal rule.
--      update public.inquiries set status = 'converted' where id = '<test-id>';
--    expect: success (open → converted).
--    Then:
--      update public.inquiries set status = 'open' where id = '<test-id>';
--    expect: SQLSTATE 'P0001' 'inquiry status cannot leave converted'.
--
-- 3. The messages INSERT predicate now references status <> 'converted'.
--      select pg_get_functiondef(p.oid) is not null
--        from pg_policies
--       where schemaname = 'public'
--         and tablename = 'messages'
--         and policyname = 'messages_insert_participants';
--      (or read the policy via pg_policies.qual / with_check)
--    Easier: select definition from pg_policies where ... and grep for
--    'status <> ''converted''' in the output.
--
-- 4. The enum is unchanged.
--      select pg_get_constraintdef(c.oid)
--        from pg_constraint c
--        join pg_class t on t.oid = c.conrelid
--       where t.relname = 'inquiries' and c.contype = 'c';
--    expect: the existing CHECK still includes 'open', 'converted', 'closed'.
--
-- 5. Existing 'closed' rows (if any) are now messageable. (Manual
--    test as a participant on a legacy closed inquiry, if one
--    exists in the live DB:)
--      insert into public.messages (inquiry_id, sender_id, body)
--           values ('<closed-id>', auth.uid(), 'test');
--    expect: success (pre-0043 this would have been blocked by RLS).
--
-- ============================================================
-- OPEN QUESTION FOR FOUNDER — flagged from the migration header.
-- ============================================================
-- The partial-unique index `inquiries_one_open_per_pair` on
-- (listing_id, starter_id) WHERE status = 'open' was designed for
-- a world where 'closed' threads were genuinely terminal. With
-- 0043 widening writes to closed threads, a legacy 'closed' row
-- and a new 'open' row could both exist for the same (listing,
-- starter) pair. If that's not desired, follow-up: drop and
-- recreate the partial unique with `where status <> 'converted'`.
-- Not done in 0043 because (a) it changes the index's semantics
-- and (b) the live DB likely has zero 'closed' rows today (the
-- Close button was barely surfaced and Round 5 inquiry shipped
-- recently). Founder confirms either: leave as-is (most likely),
-- or follow-up migration 0043b to widen the index.

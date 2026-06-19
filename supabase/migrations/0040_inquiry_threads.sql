-- 0040 — Round 5b / Step 9.5 — pre-booking inquiry path.
--
-- Closes the trust-conversation gap surfaced by the Round 5 review
-- (2026-06-17). Before this migration, public.messages.booking_id is
-- NOT NULL — so a thread cannot exist before the owner commits to a
-- booking request. The trust-building conversation an owner needs
-- BEFORE handing their cat to a stranger has no home in the product.
--
-- Design lives in docs/round-5b-inquiry-plan.md. Option A (chosen):
-- a first-class `inquiries` parent table + a new `messages.inquiry_id`
-- FK + a CHECK constraint enforcing exactly one of `booking_id` or
-- `inquiry_id` is set per message row.
--
-- This migration covers SCHEMA + RLS ONLY. UI, helper functions in
-- src/lib/, and the `/inquiries` inbox screen are the next round's
-- scope.
--
-- ============================================================
-- ORDERING NOTES
-- ============================================================
-- The booking-scoped messages RLS predicate from 0004 is preserved
-- BYTE-IDENTICAL — it gets dropped and recreated wrapped in a
-- (booking_id IS NOT NULL AND ...) guard so it short-circuits against
-- the new inquiry-scoped rows. The CHECK constraint added below
-- guarantees no row can satisfy both branches simultaneously, so the
-- behavior for the existing booking-scoped thread is unchanged.
--
-- ============================================================
-- ANON CAVEAT
-- ============================================================
-- All inquiries policies are `to authenticated`. Anon never executes
-- these RLS clauses. The EXISTS subqueries against public.listings
-- and public.profiles inside the inquiry INSERT check run as the
-- authenticated caller, which has full SELECT grants on both tables
-- (0037 only narrowed anon's column-level GRANT, not authenticated's).
-- No new anon-readable path is introduced.
--
-- public.is_admin() and public.is_active_user() are SECURITY DEFINER
-- with pinned search_path=public (0038), so the OR-bypass clauses on
-- inquiries reuse the same hardened helpers the rest of the codebase
-- uses.


-- ============================================================
-- 1. inquiries table
-- ============================================================
create table public.inquiries (
  id              uuid primary key default gen_random_uuid(),
  -- Cascade on listing delete: if the listing is gone, no point
  -- preserving the thread. Mirrors messages.booking_id cascade on
  -- bookings (0001). Admin-disable doesn't delete the listing row,
  -- so an `admin_disabled` listing's inquiries stay readable.
  listing_id      uuid not null references public.listings(id)
                    on delete cascade,
  -- The owner-side participant who opened the thread.
  starter_id      uuid not null references public.profiles(id)
                    on delete restrict,
  -- Snapshot of listings.host_id at thread open. Locked by the
  -- INSERT RLS CHECK below to equal the current listing.host_id at
  -- creation time. If the host is later transferred (admin op), the
  -- inquiry still references the original host — same posture as
  -- bookings.owner_id snapshot.
  host_id         uuid not null references public.profiles(id)
                    on delete restrict,
  status          text not null default 'open'
                    check (status in ('open', 'converted', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Touched by the touch_inquiry_last_message_at trigger below.
  -- NULL until the first message is sent.
  last_message_at timestamptz,
  -- Self-inquiry guard. Mirrors R2C1's bookings_insert_owner check
  -- (0029 Part A). Defense-in-depth: the INSERT RLS CHECK also
  -- forces host_id = listing.host_id, and starter_id = auth.uid(),
  -- so a self-inquiry would have already been rejected by the
  -- starter_id <> host_id implication. This constraint catches the
  -- case where a future migration loosens either of those clauses.
  constraint inquiries_no_self_inquiry check (starter_id <> host_id)
  -- The "one thread per (listing, starter) pair" rule lives in the
  -- partial unique INDEX below (inquiries_one_open_per_pair) — it
  -- has to be a partial index, not a table constraint, so it sits
  -- outside the CREATE TABLE block.
);

-- Inbox queries (host-side and owner-side) read by participant
-- ordered by recency. The DESC NULLS LAST puts brand-new threads
-- (last_message_at IS NULL) at the bottom, where they belong until
-- the first message is sent.
create index inquiries_host_id_last_msg_idx
  on public.inquiries (host_id, last_message_at desc nulls last);
create index inquiries_starter_id_last_msg_idx
  on public.inquiries (starter_id, last_message_at desc nulls last);
-- Per-listing scans (admin views, future "open inquiries on this
-- listing" UI).
create index inquiries_listing_id_idx
  on public.inquiries (listing_id);

-- At most one OPEN thread per (listing, starter) pair. Partial on
-- status='open' so a fresh thread can be opened after a previous
-- one converts (booking accepted out of it) or closes (archived).
-- Without the WHERE clause, an owner would be permanently locked
-- out of re-engaging with the same host on the same listing once
-- the prior thread terminates (and guard_inquiry_update blocks
-- reopen).
--
-- A partial unique can't live as a table-level constraint in
-- PostgreSQL — it has to be a unique INDEX, which is why this
-- sits outside the CREATE TABLE block.
--
-- APP-LAYER NOTE (UI round): the "re-tap Message host returns
-- the existing thread" logic cannot be a blind ON CONFLICT
-- upsert against this index. The app must SELECT the open thread
-- first and only INSERT if none exists. If any future code path
-- uses ON CONFLICT, it MUST target
-- (listing_id, starter_id) WHERE status = 'open'.
create unique index inquiries_one_open_per_pair
  on public.inquiries (listing_id, starter_id)
  where status = 'open';

alter table public.inquiries enable row level security;


-- ============================================================
-- 2. RLS on inquiries
-- ============================================================

-- SELECT — admin bypass OR participant. Mirrors 0004's
-- messages_select_participants posture. is_admin() is SECURITY
-- DEFINER (0038) so the bypass doesn't depend on caller column
-- grants on profiles.
create policy "inquiries_select_participants"
  on public.inquiries for select
  to authenticated
  using (
    public.is_admin()
    or starter_id = (select auth.uid())
    or host_id = (select auth.uid())
  );

-- INSERT — only the starter can open the thread on their own
-- behalf, must be active (is_active_user() — SECURITY DEFINER,
-- 0038), and the listing must be one the public can see (status =
-- 'approved' + verified host + non-suspended host). The host_id
-- snapshot must equal the listing's current host_id at this moment
-- — prevents the starter from spoofing the wrong host into the
-- thread.
--
-- The verified-host predicate mirrors 0024's
-- listings_select_active_verified_or_own clause byte-identically,
-- so inquiries can't pre-open against a listing the public can't
-- see (pending, paused, admin_disabled, or hosted by an
-- unverified/suspended account).
create policy "inquiries_insert_starter"
  on public.inquiries for insert
  to authenticated
  with check (
    public.is_active_user()
    and starter_id = (select auth.uid())
    and status = 'open'
    -- Snapshot lock: host_id at creation must equal listing.host_id
    -- right now. Combined with the EXISTS below, also enforces that
    -- the listing actually exists.
    and host_id = (
      select l.host_id from public.listings l
      where l.id = inquiries.listing_id
    )
    -- Public-visibility predicate — same as
    -- listings_select_active_verified_or_own (0024).
    and exists (
      select 1
      from public.listings l
      join public.profiles host on host.id = l.host_id
      where l.id = inquiries.listing_id
        and l.status = 'approved'
        and host.is_verified = true
        and host.is_suspended = false
    )
  );

-- UPDATE — TIGHTLY SCOPED. Two reasons this exists despite the
-- default immutability posture of the audit-trail tables:
--   (1) status transitions: open → converted (when a booking
--       accepts this inquiry) and open → closed (when a
--       participant archives the thread from their inbox). Both
--       are first-class product features in the plan.
--   (2) last_message_at + updated_at: touched by the
--       AFTER INSERT trigger on messages below. Without an UPDATE
--       policy, the trigger's update would be blocked even though
--       the trigger is SECURITY DEFINER (it's still subject to
--       RLS on the target table when invoked via a normal user
--       statement — SECURITY DEFINER bypasses caller column
--       grants but not the target table's row policies).
--
-- WHO can UPDATE is gated here (participants or admin).
-- WHAT can change is gated by the BEFORE UPDATE trigger below
-- (guard_inquiry_update). Without that trigger, a participant
-- could re-write starter_id / host_id / listing_id; with it, only
-- status (within the allowed transitions) and the system-managed
-- timestamps can change.
create policy "inquiries_update_participants"
  on public.inquiries for update
  to authenticated
  using (
    public.is_admin()
    or starter_id = (select auth.uid())
    or host_id = (select auth.uid())
  )
  with check (
    public.is_admin()
    or starter_id = (select auth.uid())
    or host_id = (select auth.uid())
  );

-- No DELETE policy. Default-deny enforces immutability, mirroring
-- bookings, condition_reports, daily_updates, reviews. If
-- retention or GDPR requires deletion, that arrives via a separate
-- SECURITY DEFINER admin RPC, not as a normal policy.


-- ============================================================
-- 3. BEFORE UPDATE trigger — column + transition guard
-- ============================================================
-- RLS allows participants and admin to UPDATE, but only certain
-- columns and status transitions are meaningful. This trigger
-- enforces:
--   - Immutable columns: id, listing_id, starter_id, host_id,
--     created_at. Any attempt to change these raises.
--   - Status transitions allowed:
--       open       → open | converted | closed
--       converted  → converted (terminal)
--       closed     → closed (terminal — reopening is a founder
--                            decision deferred to a later round)
--   - updated_at auto-stamps to now() on every UPDATE so app code
--     never has to set it.
--
-- Plain (not SECURITY DEFINER): trigger runs as the caller, which
-- is fine because the policies already gated WHO can update.

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

  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_inquiry_update
  before update on public.inquiries
  for each row
  execute function public.guard_inquiry_update();


-- ============================================================
-- 4. messages — nullable booking_id + new inquiry_id + CHECK
-- ============================================================
-- The 0001 NOT NULL on booking_id was the structural enforcement
-- of "messages belong to a booking". With inquiries now a peer
-- thread type, the NOT NULL flips to a CHECK that exactly one of
-- booking_id / inquiry_id is set per row.
--
-- ON DELETE CASCADE on inquiry_id mirrors the 0001 booking_id
-- cascade — deleting the parent thread deletes its messages.

alter table public.messages
  alter column booking_id drop not null;

alter table public.messages
  add column inquiry_id uuid
    references public.inquiries(id) on delete cascade;

alter table public.messages
  add constraint messages_one_thread_check check (
    (booking_id is not null and inquiry_id is null)
    or
    (booking_id is null and inquiry_id is not null)
  );

create index messages_inquiry_id_idx on public.messages(inquiry_id);


-- ============================================================
-- 5. Recreate messages RLS to cover both thread types
-- ============================================================
-- The booking-scoped predicate is preserved BYTE-IDENTICAL — the
-- EXISTS body, the LEFT JOIN, the column references, the
-- `b.owner_id = ... or l.host_id = ...` participant clause are all
-- copied line-for-line from the 0004 policy. The only structural
-- change is wrapping that EXISTS in a `(booking_id IS NOT NULL AND
-- ...)` guard so it short-circuits cleanly against the new
-- inquiry-scoped rows.
--
-- The CHECK constraint above guarantees that no row can satisfy
-- both the booking branch and the inquiry branch simultaneously,
-- so the existing booking-scoped thread's read/write behavior is
-- identical to pre-0040.

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    public.is_admin()
    or (
      -- BOOKING-SCOPED branch — preserved byte-identical from 0004.
      booking_id is not null
      and exists (
        select 1 from public.bookings b
        left join public.listings l on l.id = b.listing_id
        where b.id = messages.booking_id
          and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
      )
    )
    or (
      -- INQUIRY-SCOPED branch — new. Joins through public.inquiries
      -- (NOT through messages itself — no self-reference, no
      -- recursion risk).
      inquiry_id is not null
      and exists (
        select 1 from public.inquiries i
        where i.id = messages.inquiry_id
          and (
            i.starter_id = (select auth.uid())
            or i.host_id = (select auth.uid())
          )
      )
    )
  );

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    public.is_active_user()
    and sender_id = (select auth.uid())
    and (
      (
        -- BOOKING-SCOPED branch — preserved byte-identical from
        -- 0004. The `inquiry_id IS NULL` extra clause is structural
        -- (CHECK enforces it anyway) but makes the intent obvious
        -- and lets the planner short-circuit faster on
        -- inquiry-scoped writes.
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
        -- INQUIRY-SCOPED branch — new. The status='open' guard
        -- prevents new messages on converted ('this is a booking
        -- now, use the booking thread') or closed ('archived')
        -- inquiries.
        inquiry_id is not null and booking_id is null
        and exists (
          select 1 from public.inquiries i
          where i.id = messages.inquiry_id
            and i.status = 'open'
            and (
              i.starter_id = (select auth.uid())
              or i.host_id = (select auth.uid())
            )
        )
      )
    )
  );

-- No UPDATE/DELETE policies on messages. The 0004 posture (default-
-- deny immutability) is preserved unchanged.


-- ============================================================
-- 6. AFTER INSERT trigger on messages — touch inquiry timestamps
-- ============================================================
-- Cheap denormalization that powers the inbox sort by recency
-- without a window function over the messages table. Only fires
-- for inquiry-scoped messages (booking-scoped messages don't need
-- it — the booking detail screen orders by messages.created_at
-- already).
--
-- SECURITY DEFINER + pinned search_path = public. Reason: the
-- target inquiries row has RLS UPDATE permission for participants,
-- and the message sender is always a participant (the
-- messages_insert_participants policy above guarantees that). So
-- in theory a caller-privileged update would succeed. But:
--   (a) defense-in-depth — if a future migration tightens
--       inquiries' UPDATE policy further (e.g., disallow
--       last_message_at from non-trigger contexts), this trigger
--       keeps working;
--   (b) the trigger only mutates two narrowly-scoped columns
--       (last_message_at, updated_at) on exactly one row (the
--       inquiry the message belongs to) — no surface for misuse.
-- Matches the SECURITY DEFINER + search_path pattern used by
-- is_admin / is_active_user (0038) and the promote_listing_draft
-- RPC (0023).

create or replace function public.touch_inquiry_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inquiry_id is not null then
    update public.inquiries
       set last_message_at = new.created_at,
           updated_at      = new.created_at
     where id = new.inquiry_id;
  end if;
  return new;
end;
$$;

-- WHEN clause skips the function call entirely on booking-scoped
-- inserts (high-volume — every booking-thread message). The
-- in-function `if new.inquiry_id is not null` is kept below as
-- defense-in-depth in case a future migration changes this trigger
-- to fire conditionally for another reason.
create trigger touch_inquiry_last_message_at
  after insert on public.messages
  for each row
  when (new.inquiry_id is not null)
  execute function public.touch_inquiry_last_message_at();


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. inquiries table exists with the expected indexes.
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'inquiries'
--   order by indexname;
--   expect: 5 rows —
--     inquiries_host_id_last_msg_idx
--     inquiries_listing_id_idx
--     inquiries_one_open_per_pair
--     inquiries_pkey
--     inquiries_starter_id_last_msg_idx
--
-- 1a. The one-open-per-pair index is partial on status='open'.
--   select indexdef from pg_indexes
--   where schemaname = 'public'
--     and indexname = 'inquiries_one_open_per_pair';
--   expect indexdef to contain: WHERE (status = 'open'::text)
--
-- 2. messages.booking_id is nullable; messages.inquiry_id exists.
--   select column_name, is_nullable, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'messages'
--     and column_name in ('booking_id', 'inquiry_id')
--   order by column_name;
--   expect: booking_id  YES  uuid
--           inquiry_id  YES  uuid
--
-- 3. messages CHECK constraint installed.
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.messages'::regclass
--     and contype = 'c'
--   order by conname;
--   expect to see: messages_one_thread_check
--                  CHECK ((((booking_id IS NOT NULL) AND
--                           (inquiry_id IS NULL)) OR
--                          ((booking_id IS NULL) AND
--                           (inquiry_id IS NOT NULL))))
--
-- 4. Policies on inquiries: 3 rows.
--   select polname, polcmd
--   from pg_policy
--   where polrelid = 'public.inquiries'::regclass
--   order by polname;
--   expect:
--     inquiries_insert_starter        a   (a = INSERT)
--     inquiries_select_participants   r   (r = SELECT)
--     inquiries_update_participants   w   (w = UPDATE)
--
-- 5. Policies on messages: still exactly 2 — no policy bloat.
--   select polname, polcmd
--   from pg_policy
--   where polrelid = 'public.messages'::regclass
--   order by polname;
--   expect:
--     messages_insert_participants    a
--     messages_select_participants    r
--
-- 6. Both functions exist + the SECURITY DEFINER posture on the
--    touch trigger function.
--   select proname, prosecdef, proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and proname in ('guard_inquiry_update',
--                     'touch_inquiry_last_message_at')
--   order by proname;
--   expect:
--     guard_inquiry_update            f   NULL
--     touch_inquiry_last_message_at   t   {search_path=public}
--
-- 7. Both triggers wired up.
--   select tgname, tgrelid::regclass, tgtype
--   from pg_trigger
--   where tgrelid in ('public.inquiries'::regclass,
--                     'public.messages'::regclass)
--     and tgname in ('guard_inquiry_update',
--                    'touch_inquiry_last_message_at')
--   order by tgname;
--   expect: 2 rows, both with non-zero tgtype.

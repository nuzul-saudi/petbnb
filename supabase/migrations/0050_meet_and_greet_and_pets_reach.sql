-- ============================================================
-- 0050 — Meet & greet v1 + pets host-visibility reach (Phase 4)
-- ============================================================
-- Plan: docs/migration-0050-meet-and-greet-plan.md
-- WRITTEN, not applied. Line-by-line review before Omar applies.
--
-- Approved decisions:
--   D-A1 TIGHT  — kind-vs-role enforced in the messages INSERT WITH
--                 CHECK (a forged host-confirmation pill is dispute-
--                 relevant for a trust-first brand).
--   D-A2 YES    — meet & greet is inquiry-scoped ONLY.
--   D-A3 YES    — reuse the 0047 message_received notification (no new
--                 type); MG inserts are ordinary message INSERTs so the
--                 existing trigger already notifies the other party.
--   R1          — pets policy recreated from the CURRENT 0004 text:
--                 preserve owner + is_admin() + legacy pet_id, ADD the
--                 booking_pets junction branch.
--
-- Patterns reused: `to authenticated` policies, forward-only/immutable
-- guard triggers, single drop+recreate per policy (0030 lesson),
-- verification-query tail.


-- ============================================================
-- 1. messages.kind — pill type (A1)
-- ============================================================
-- NOT NULL DEFAULT 'text' backfills every existing row to 'text' in one
-- shot — no data migration. Live MG rows still carry a non-empty body
-- (the client inserts a localized marker), so the 0044
-- messages_body_presence CHECK is satisfied unchanged; the UI renders a
-- pill keyed on kind and treats the body as a no-JS fallback.
alter table public.messages
  add column kind text not null default 'text'
    check (kind in ('text', 'meet_greet_request', 'meet_greet_confirmed'));


-- ============================================================
-- 2. guard_message_update — add `kind` to the immutable set (A3)
-- ============================================================
-- Preserved BYTE-IDENTICAL from 0044 except the one new kind
-- immutability check. The only permitted UPDATE is a soft-delete
-- (deleted_at null->non-null + body->null); kind must never change on
-- that path (a flipped kind would rewrite the record of what happened).
create or replace function public.guard_message_update()
returns trigger
language plpgsql
as $$
begin
  -- Column immutability.
  if new.id is distinct from old.id then
    raise exception 'messages.id is immutable';
  end if;
  if new.booking_id is distinct from old.booking_id then
    raise exception 'messages.booking_id is immutable';
  end if;
  if new.inquiry_id is distinct from old.inquiry_id then
    raise exception 'messages.inquiry_id is immutable';
  end if;
  if new.sender_id is distinct from old.sender_id then
    raise exception 'messages.sender_id is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'messages.created_at is immutable';
  end if;
  -- 0050 — kind is immutable (incl. across a soft-delete).
  if new.kind is distinct from old.kind then
    raise exception 'messages.kind is immutable';
  end if;

  -- Transition rules (unchanged from 0044).
  if old.deleted_at is not null then
    raise exception 'messages cannot be updated once deleted';
  end if;
  if new.deleted_at is null then
    raise exception 'messages update must set deleted_at (only soft-delete is permitted)';
  end if;
  if new.body is not null then
    raise exception 'messages update must null body on delete (content removal is intentional)';
  end if;

  return new;
end;
$$;
-- The trigger itself (guard_message_update BEFORE UPDATE, 0044) is
-- unchanged — replacing the function body is sufficient.


-- ============================================================
-- 3. messages_insert_participants — kind-vs-role WITH CHECK (A4, D-A1)
-- ============================================================
-- Rebuilt from the CURRENT 0043 policy, byte-identical, PLUS one added
-- top-level conjunct enforcing the meet & greet role rules:
--   * kind='text'                 → any participant (unchanged).
--   * kind='meet_greet_request'   → ONLY the inquiry starter (the owner).
--   * kind='meet_greet_confirmed' → ONLY the inquiry host.
--   * both MG kinds are inquiry-scoped ONLY (D-A2): inquiry_id present,
--     booking_id null.
-- A forged insert (e.g. the starter inserting 'meet_greet_confirmed', or
-- ANY MG kind on a booking thread) fails WITH CHECK → RLS error.
drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    public.is_active_user()
    and sender_id = (select auth.uid())
    and (
      (
        -- BOOKING-SCOPED branch — preserved byte-identical from 0040/0043.
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
        -- INQUIRY-SCOPED branch — preserved byte-identical from 0043.
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
    -- 0050 (D-A1 TIGHT) — kind-vs-role gate. Text is unrestricted; a MG
    -- kind must be inquiry-scoped AND inserted by the correct role.
    and (
      kind = 'text'
      or (
        inquiry_id is not null and booking_id is null
        and exists (
          select 1 from public.inquiries i
          where i.id = messages.inquiry_id
            and (
              (kind = 'meet_greet_request'   and i.starter_id = (select auth.uid()))
              or (kind = 'meet_greet_confirmed' and i.host_id  = (select auth.uid()))
            )
        )
      )
    )
  );


-- ============================================================
-- 4. pets_select_owner_or_booking_host — junction reach (B2, R1)
-- ============================================================
-- Recreated from the CURRENT 0004 text (owner + is_admin() + legacy
-- pet_id), ADDING an EXISTS over the booking_pets junction so a host
-- sees ALL pets on a multi-pet booking — not just the one in the
-- pre-0009 bookings.pet_id column. Prod white-screen evidence: bookings
-- 494087eb (2 pets) + bdbbb950 (3 pets). Legacy pet_id clause kept for
-- any genuinely pre-0009 rows.
drop policy if exists "pets_select_owner_or_booking_host" on public.pets;
create policy "pets_select_owner_or_booking_host"
  on public.pets for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or public.is_admin()
    -- NEW (0050) — junction reach: host sees a pet linked via booking_pets.
    or exists (
      select 1 from public.booking_pets bp
      join public.bookings b on b.id = bp.booking_id
      join public.listings l on l.id = b.listing_id
      where bp.pet_id = pets.id
        and l.host_id = (select auth.uid())
        and b.status in ('requested', 'accepted', 'active', 'completed', 'disputed')
    )
    -- LEGACY (from 0004) — pre-0009 single-pet column.
    or exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.pet_id = pets.id
        and l.host_id = (select auth.uid())
        and b.status in ('requested', 'accepted', 'active', 'completed', 'disputed')
    )
  );


-- ============================================================
-- Verification queries — run after applying (do NOT run inline).
-- ============================================================
--
-- 1. kind column + CHECK present; all existing rows backfilled to 'text'.
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='messages' and column_name='kind';
--   expect: text, NOT NULL, default 'text'.
--   select count(*) from public.messages where kind <> 'text';
--   expect: 0 immediately after apply.
--
-- 2. guard_message_update rejects a kind change.
--   As the sender of an un-read message, soft-delete WHILE flipping kind:
--     update public.messages set deleted_at=now(), body=null,
--            kind='meet_greet_confirmed' where id='<own live msg>';
--   expect: P0001 'messages.kind is immutable'.
--   (Plain soft-delete without touching kind still succeeds — 0044 rules.)
--
-- 3. INSERT kind-vs-role (D-A1 TIGHT) — the R2 forged-confirm check:
--   (a) As the inquiry STARTER, insert a meet_greet_request → SUCCESS.
--   (b) As the inquiry HOST, insert a meet_greet_confirmed → SUCCESS.
--   (c) FORGED: as the inquiry STARTER, insert kind='meet_greet_confirmed'
--         into the same inquiry:
--         insert into public.messages (inquiry_id, sender_id, body, kind)
--         values ('<inquiry>', auth.uid(), 'x', 'meet_greet_confirmed');
--       expect: RLS error — 'new row violates row-level security policy
--       for table "messages"'.
--   (d) FORGED SCOPE: any MG kind with booking_id set (booking thread) →
--       same RLS error (MG is inquiry-only).
--   (e) kind='text' by any participant → SUCCESS (unchanged).
--
-- 4. pets host-visibility reach (the prod bug — before/after).
--   As a host, on a multi-pet booking on their listing:
--     select
--       (select count(*) from public.booking_pets bp where bp.booking_id='<494087eb...>') as linked,
--       (select count(*) from public.pets p
--          where exists (select 1 from public.booking_pets bp
--                         where bp.booking_id='<494087eb...>' and bp.pet_id=p.id)) as visible;
--   expect POST-fix: visible == linked (was 1 pre-fix — only the pet_id pet).
--   Owner still sees own pets; a non-participant sees none.
--
-- 5. Policy shape sanity.
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='pets' and policyname='pets_select_owner_or_booking_host';
--   expect: 1 SELECT policy (no parallel duplicate).

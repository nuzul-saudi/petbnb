-- ============================================================
-- 0047 — Notifications v1 (Phase 2, part 2a — the in_app channel)
-- ============================================================
-- Plan: docs/migration-0047-notifications-plan.md
--
-- Ships the persistent notifications table + the in_app channel:
-- SECURITY DEFINER triggers insert a notification row on each source
-- event, so every write path is covered regardless of which client
-- performed it (mirrors the 0046 stamper philosophy).
--
-- The email channel (part 2b) is a SEPARATE follow-on
-- (Database Webhook -> Edge Function -> Resend). The emailed_at column
-- ships here so 2b needs no new migration; 2a never writes it, and the
-- guard below rejects any emailed_at change. 2b will `create or replace`
-- the guard to permit the email path's forward-only emailed_at stamp.
--
-- Decisions locked (plan doc §12): param-free titles (D6); throttle via
-- emailed_at + link_path (D3); split 2a/2b (D4); body_params may carry
-- short display names but never phone/email (D1 — not exercised in 2a,
-- all v1 titles are param-free).
--
-- Patterns reused from 0044/0046: SECURITY DEFINER + pinned
-- search_path, forward-only guard trigger, `to authenticated` policies,
-- the GRANT convention, and a verification-query tail block.
-- ============================================================


-- ============================================================
-- 1. notifications table
-- ============================================================
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,  -- the RECIPIENT (R3: profiles FK, per 0001/0040 convention)
  type         text not null check (type in (
                 'booking_requested',
                 'booking_accepted',
                 'booking_declined',
                 'booking_cancelled',
                 'message_received',
                 'host_application_approved',
                 'host_application_rejected'
               )),
  title_key    text not null,                       -- i18n key: t(title_key, body_params)
  body_params  jsonb not null default '{}'::jsonb,  -- placeholder values (IDs / short names) — never phone/email
  link_path    text not null,                       -- in-app deep link, e.g. /bookings/<id>
  created_at   timestamptz not null default now(),
  read_at      timestamptz,                         -- NULL = unread; set once, forward-only
  emailed_at   timestamptz                          -- set by the 2b email channel; also the throttle stamp
);

alter table public.notifications enable row level security;

-- Hot path: the unread-badge count per user.
create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

-- The /notifications list, newest-first.
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);


-- ============================================================
-- 2. RLS — self read; self update of read_at only
-- ============================================================
-- SELECT: a user reads only their own notifications. No admin read for
-- v1 (support tooling can land later as a SECURITY DEFINER RPC — same
-- "no quiet admin override" stance as 0040/0044).
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- UPDATE: a user may update only their own rows; the guard trigger
-- (section 3) restricts WHAT changes to read_at, forward-only.
--
-- No INSERT policy: rows are created ONLY by the SECURITY DEFINER
-- triggers in section 5 (which run as the definer and bypass RLS), so a
-- client can neither forge nor suppress-by-not-calling a notification.
-- No DELETE policy: notifications are durable for v1.
create policy "notifications_update_own_read"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ============================================================
-- 3. guard_notification_update — read_at-only, forward-only
-- ============================================================
-- The WHAT-gate. The UPDATE policy gates WHO (owner); this trigger gates
-- WHAT can change: only read_at, and only forward. emailed_at is
-- rejected here in 2a (nothing writes it yet); 2b redefines this
-- function to allow the email path's forward-only emailed_at stamp.
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
as $$
begin
  if new.id          is distinct from old.id
     or new.user_id     is distinct from old.user_id
     or new.type        is distinct from old.type
     or new.title_key   is distinct from old.title_key
     or new.body_params is distinct from old.body_params
     or new.link_path   is distinct from old.link_path
     or new.created_at  is distinct from old.created_at
     or new.emailed_at  is distinct from old.emailed_at then
    raise exception 'notifications: only read_at may be updated';
  end if;

  -- read_at is forward-only: NULL -> non-null allowed; never back to
  -- NULL; never to a smaller value.
  if old.read_at is not null
     and (new.read_at is null or new.read_at < old.read_at) then
    raise exception 'notifications.read_at is monotonic forward-only';
  end if;

  return new;
end;
$$;

create trigger guard_notification_update
  before update on public.notifications
  for each row
  execute function public.guard_notification_update();


-- ============================================================
-- 4. mark_all_notifications_read — SECURITY DEFINER RPC
-- ============================================================
-- Backs the "mark all read" button. Single-row reads use the plain
-- UPDATE policy from the list screen; this marks every unread row for
-- the caller in one statement (each row's read_at NULL -> now() passes
-- the guard's forward-only check).
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.notifications
     set read_at = now()
   where user_id = v_caller
     and read_at is null;
end;
$$;

revoke execute on function public.mark_all_notifications_read() from public;
revoke execute on function public.mark_all_notifications_read() from anon;
revoke execute on function public.mark_all_notifications_read() from service_role;
grant  execute on function public.mark_all_notifications_read() to   authenticated;


-- ============================================================
-- 5. emit_notification helper + the four source-event triggers
-- ============================================================
-- emit_notification centralizes the INSERT. SECURITY DEFINER + pinned
-- search_path. Execute is revoked from EVERY role — it is reachable
-- ONLY from the SECURITY DEFINER trigger functions below (which run as
-- the definer/owner and so may call it). Defensive: a NULL recipient or
-- link is silently skipped so a notification insert can never roll back
-- the source write that fired it.
create or replace function public.emit_notification(
  p_user_id     uuid,
  p_type        text,
  p_title_key   text,
  p_body_params jsonb,
  p_link_path   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_link_path is null then
    return;
  end if;
  insert into public.notifications (user_id, type, title_key, body_params, link_path)
  values (p_user_id, p_type, p_title_key, coalesce(p_body_params, '{}'::jsonb), p_link_path);
end;
$$;

revoke execute on function public.emit_notification(uuid, text, text, jsonb, text) from public;
revoke execute on function public.emit_notification(uuid, text, text, jsonb, text) from anon;
revoke execute on function public.emit_notification(uuid, text, text, jsonb, text) from authenticated;
revoke execute on function public.emit_notification(uuid, text, text, jsonb, text) from service_role;


-- 5a. booking_requested — AFTER INSERT on bookings → notify the host.
create or replace function public.notify_booking_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  if new.status <> 'requested' then
    return new;
  end if;
  select l.host_id into v_host
    from public.listings l
   where l.id = new.listing_id;
  perform public.emit_notification(
    v_host,
    'booking_requested',
    'notifications.booking_requested',
    '{}'::jsonb,
    '/bookings/' || new.id::text
  );
  return new;
end;
$$;

create trigger notify_booking_requested
  after insert on public.bookings
  for each row
  execute function public.notify_booking_requested();


-- 5b. booking_accepted / booking_declined — AFTER UPDATE on bookings
--     (only on a real status change into accepted/declined) → notify
--     the owner. Coexists with the BEFORE guard_booking_status_stamp
--     (0046) — different timing.
create or replace function public.notify_booking_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'accepted' then
    perform public.emit_notification(
      new.owner_id, 'booking_accepted',
      'notifications.booking_accepted', '{}'::jsonb,
      '/bookings/' || new.id::text
    );
  elsif new.status = 'declined' then
    perform public.emit_notification(
      new.owner_id, 'booking_declined',
      'notifications.booking_declined', '{}'::jsonb,
      '/bookings/' || new.id::text
    );
  elsif new.status = 'cancelled' then
    -- R1 — owner-initiated cancel is the ONLY cancel path today, so the
    -- recipient is always the listing's host. Revisit recipient logic if
    -- a host-initiated cancel ever ships.
    select l.host_id into v_host
      from public.listings l
     where l.id = new.listing_id;
    perform public.emit_notification(
      v_host, 'booking_cancelled',
      'notifications.booking_cancelled', '{}'::jsonb,
      '/bookings/' || new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger notify_booking_decided
  after update on public.bookings
  for each row
  execute function public.notify_booking_decided();


-- 5c. message_received — AFTER INSERT on messages → notify the OTHER
--     participant of whichever thread kind (booking | inquiry). Fires
--     only on INSERT, so a sender's own soft-delete UPDATE (0044) never
--     notifies. Coexists with touch_inquiry_last_message_at (0040).
--     ASSUMPTION (R4): the sender is a thread participant, so "the other
--     participant" is the recipient. No admin-compose UI exists today; if
--     one ever ships, recipient resolution must become sender-aware.
create or replace function public.notify_message_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_link      text;
begin
  if new.booking_id is not null then
    select case when b.owner_id = new.sender_id then l.host_id else b.owner_id end
      into v_recipient
      from public.bookings b
      join public.listings l on l.id = b.listing_id
     where b.id = new.booking_id;
    v_link := '/bookings/' || new.booking_id::text;
  elsif new.inquiry_id is not null then
    select case when i.starter_id = new.sender_id then i.host_id else i.starter_id end
      into v_recipient
      from public.inquiries i
     where i.id = new.inquiry_id;
    v_link := '/inquiries/' || new.inquiry_id::text;
  end if;

  -- R2 — per-thread dedupe. The unread badge counts unread THREADS, not
  -- individual messages: if the recipient already has an UNREAD
  -- message_received notification for this thread, don't stack another.
  -- Once they open the thread and it's marked read, the next message
  -- creates a fresh unread row. This same (user_id, link_path, unread)
  -- row is also the natural anchor for the 2b email throttle.
  if v_recipient is not null and v_link is not null and exists (
    select 1 from public.notifications
     where user_id = v_recipient
       and type = 'message_received'
       and link_path = v_link
       and read_at is null
  ) then
    return new;
  end if;

  perform public.emit_notification(
    v_recipient,
    'message_received',
    'notifications.message_received',
    '{}'::jsonb,
    v_link
  );
  return new;
end;
$$;

create trigger notify_message_received
  after insert on public.messages
  for each row
  execute function public.notify_message_received();


-- 5d. host_application_approved / rejected — AFTER UPDATE on profiles
--     (only on a real host_application_status change) → notify the
--     applicant.
create or replace function public.notify_host_application_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.host_application_status is not distinct from old.host_application_status then
    return new;
  end if;
  if new.host_application_status = 'approved' then
    perform public.emit_notification(
      new.id, 'host_application_approved',
      'notifications.host_application_approved', '{}'::jsonb,
      '/become-host/complete-profile'
    );
  elsif new.host_application_status = 'rejected' then
    perform public.emit_notification(
      new.id, 'host_application_rejected',
      'notifications.host_application_rejected', '{}'::jsonb,
      '/profile'
    );
  end if;
  return new;
end;
$$;

create trigger notify_host_application_decided
  after update on public.profiles
  for each row
  execute function public.notify_host_application_decided();


-- ============================================================
-- Verification queries — run after applying (do NOT run inline).
-- ============================================================
--
-- 1. Table + columns present, RLS enabled.
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'notifications'
--    order by ordinal_position;
--   expect: id, user_id, type, title_key, body_params(jsonb),
--           link_path, created_at, read_at(nullable), emailed_at(nullable).
--   select relrowsecurity from pg_class where oid = 'public.notifications'::regclass;
--   expect: t.
--
-- 2. Both indexes present (one partial).
--   select indexname, indexdef from pg_indexes
--    where schemaname='public' and tablename='notifications';
--   expect: notifications_user_unread_idx (indexdef contains
--           'WHERE (read_at IS NULL)') + notifications_user_created_idx.
--
-- 3. Exactly the expected policies; no INSERT/DELETE policy.
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='notifications' order by policyname;
--   expect: notifications_select_own (SELECT),
--           notifications_update_own_read (UPDATE). Nothing else.
--
-- 4. Guard: only read_at, forward-only. As the row owner:
--   update public.notifications set title_key='x' where id='<own id>';
--     expect: P0001 'notifications: only read_at may be updated'.
--   update public.notifications set read_at = now() where id='<own unread id>';
--     expect: success.
--   update public.notifications set read_at = null where id='<that id>';
--     expect: P0001 'notifications.read_at is monotonic forward-only'.
--   update public.notifications set emailed_at = now() where id='<own id>';
--     expect: P0001 'notifications: only read_at may be updated'.
--
-- 5. mark_all_notifications_read present, SECURITY DEFINER, auth-only.
--   select prosecdef, proconfig from pg_proc
--    where proname='mark_all_notifications_read';
--   expect: prosecdef=t, proconfig contains 'search_path=public'.
--
-- 6. emit_notification is not callable by any role directly.
--   select has_function_privilege('authenticated',
--     'public.emit_notification(uuid,text,text,jsonb,text)', 'execute');
--   expect: f (and f for anon / service_role too).
--
-- 7. Behavioral (rollback-wrapped, non-prod rows):
--   (a) INSERT a booking with status='requested' → exactly one
--       notifications row for the listing's host, type='booking_requested',
--       link_path='/bookings/<id>'.
--   (b) UPDATE that booking to 'accepted' → one row for the owner,
--       type='booking_accepted'. To 'declined' → 'booking_declined'.
--       To 'cancelled' → one row for the HOST, type='booking_cancelled'
--       (R1). A no-op UPDATE (status unchanged) → NO new row.
--   (c) INSERT a message on a booking as the owner → one row for the
--       host; as the host → one row for the owner. Same for an inquiry
--       (starter/host). Two rapid messages in the SAME thread while the
--       recipient hasn't opened it → exactly ONE unread message_received
--       row (R2 dedupe); after the recipient reads it, the next message
--       creates a fresh unread row.
--   (d) UPDATE a profile host_application_status pending→approved → one
--       row for that profile id, link '/become-host/complete-profile';
--       →rejected → link '/profile'.
--   (e) Confirm a recipient sees ONLY their own rows (RLS) and a
--       non-recipient sees none.
--
-- 8. Anon surface unchanged.
--   set role anon; select count(*) from public.notifications; reset role;
--   expect: 0 rows visible (no anon policy).

-- ============================================================
-- 0049 — Notifications email guard (Phase 2b prerequisite)
-- ============================================================
-- WRITTEN, not applied. Apply BEFORE enabling the notify-email
-- Database Webhook (runbook: docs/phase-2b-email-runbook.md).
--
-- 0047's guard_notification_update rejected ANY emailed_at change
-- (nothing wrote it in 2a). The 2b email channel's Edge Function
-- stamps emailed_at after a successful Resend delivery — service role
-- bypasses RLS but NOT triggers, so the guard must permit it. This
-- migration `create or replace`s the guard exactly as the 0047 header
-- promised: emailed_at becomes writable FORWARD-ONLY (NULL → non-null
-- once; never back, never smaller), same monotonicity rule as read_at.
--
-- NUMBERING NOTE: 0048 is reserved for the Phase 3 trust-surface
-- migration (profiles.tos_accepted_at) per Strategy's sequencing.
-- 0048 and 0049 are fully independent — either may be applied first.
--
-- Everything else about the guard is byte-identical to 0047: all other
-- columns stay immutable; read_at stays forward-only. Clients still
-- cannot write emailed_at in practice: the UPDATE policy's USING scopes
-- to the row owner, and a row owner setting their own emailed_at would
-- pass this trigger — acceptable, because emailed_at's only consumer is
-- the send-throttle, and self-inflating it merely SUPPRESSES one's own
-- future emails (no security or money impact). Noted for review.

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
     or new.created_at  is distinct from old.created_at then
    raise exception 'notifications: only read_at and emailed_at may be updated';
  end if;

  -- read_at is forward-only (unchanged from 0047).
  if old.read_at is not null
     and (new.read_at is null or new.read_at < old.read_at) then
    raise exception 'notifications.read_at is monotonic forward-only';
  end if;

  -- 0049 — emailed_at is forward-only (the 2b email channel's stamp).
  if old.emailed_at is not null
     and (new.emailed_at is null or new.emailed_at < old.emailed_at) then
    raise exception 'notifications.emailed_at is monotonic forward-only';
  end if;

  return new;
end;
$$;

-- The trigger itself (guard_notification_update BEFORE UPDATE, 0047)
-- is unchanged — replacing the function body is sufficient.


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. Function body updated (mentions emailed_at monotonicity).
--   select prosrc like '%emailed_at is monotonic%' as has_email_rule
--     from pg_proc where proname = 'guard_notification_update';
--   expect: t.
--
-- 2. Behavioral (rollback-wrapped, as service role / SQL editor):
--   begin;
--   -- pick any notification id
--   update public.notifications set emailed_at = now() where id = '<id>';
--     expect: success (NULL → non-null).
--   update public.notifications set emailed_at = null  where id = '<id>';
--     expect: P0001 'notifications.emailed_at is monotonic forward-only'.
--   update public.notifications set title_key = 'x'    where id = '<id>';
--     expect: P0001 'notifications: only read_at and emailed_at may be updated'.
--   rollback;
--
-- 3. read_at rules unchanged: repeat 0047 verification #4 — same results.

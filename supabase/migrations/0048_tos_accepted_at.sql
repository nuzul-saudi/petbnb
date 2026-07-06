-- ============================================================
-- 0048 — profiles.tos_accepted_at (Phase 3 trust surface)
-- ============================================================
-- WRITTEN, not applied. Plan: docs/migration-0048-trust-surface-plan.md
-- Decisions locked: D1 (consent checkbox on set-password, signup mode
-- only — both funnels pass it exactly once), D2 (existing users stay
-- NULL until the real PDPL text lands), D3 (forward-only guard, with
-- Strategy's constraint: the trigger is COLUMN-SCOPED — it enforces
-- monotonicity on tos_accepted_at ONLY and must not restrict any other
-- profiles column. profiles takes legitimate updates constantly
-- (name/avatar/locale edits, host-application writes, admin actions),
-- so this deliberately does NOT copy the 0047 whole-row guard style.
--
-- Independent of 0049 (notifications email guard) — either applies first.

alter table public.profiles
  add column tos_accepted_at timestamptz;  -- NULL = never consented

comment on column public.profiles.tos_accepted_at is
  'PDPL consent evidence: when the user accepted the Terms + Privacy Policy at signup (Phase 3). NULL for accounts predating the consent flow. Forward-only via guard_profile_tos_stamp.';


-- ============================================================
-- guard_profile_tos_stamp — COLUMN-SCOPED forward-only guard (D3)
-- ============================================================
-- Fires only when the UPDATE actually touches tos_accepted_at (the
-- WHEN clause below), and checks ONLY that column: once set, it can't
-- be nulled or moved backward. Every other profiles column passes
-- through untouched — no restriction, no opinion.
create or replace function public.guard_profile_tos_stamp()
returns trigger
language plpgsql
as $$
begin
  if old.tos_accepted_at is not null
     and (new.tos_accepted_at is null
          or new.tos_accepted_at < old.tos_accepted_at) then
    raise exception 'profiles.tos_accepted_at is monotonic forward-only';
  end if;
  return new;
end;
$$;

-- The WHEN clause keeps the trigger out of the hot path: profile
-- updates that don't touch tos_accepted_at never invoke the function.
create trigger guard_profile_tos_stamp
  before update on public.profiles
  for each row
  when (old.tos_accepted_at is distinct from new.tos_accepted_at)
  execute function public.guard_profile_tos_stamp();


-- ============================================================
-- Verification queries — run after applying.
-- ============================================================
--
-- 1. Column present.
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'tos_accepted_at';
--   expect: 1 row, timestamptz, nullable YES.
--
-- 2. Trigger wired with the WHEN clause (column-scoped).
--   select tgname, pg_get_triggerdef(oid) like '%WHEN%' as has_when
--     from pg_trigger
--    where tgname = 'guard_profile_tos_stamp' and not tgisinternal;
--   expect: 1 row, has_when = t.
--
-- 3. Behavioral (rollback-wrapped, any test profile):
--   begin;
--   update public.profiles set tos_accepted_at = now() where id = '<id>';
--     expect: success (NULL → non-null).
--   update public.profiles set tos_accepted_at = null  where id = '<id>';
--     expect: P0001 'profiles.tos_accepted_at is monotonic forward-only'.
--   update public.profiles set full_name = full_name || '' where id = '<id>';
--     expect: success — OTHER columns are unrestricted (Strategy's
--     column-scoped constraint; the trigger doesn't even fire here).
--   rollback;
--
-- 4. Existing rows untouched (D2).
--   select count(*) from public.profiles where tos_accepted_at is not null;
--   expect: 0 immediately after apply.

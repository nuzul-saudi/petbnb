-- Stretch S1 — Payments foundations (MOCK payments only).
--
-- Schema + state machine for the money flow. NO real gateway, NO
-- real money movement — the payment provider stays the mock
-- (src/lib/payments).
--
-- Fee policy (LOCKED per batch instructions):
--   owner service fee  = 5%  of booking total
--   host fee           = 15% of booking total
--   cancellation refund =
--     >=48h before start          : full refund of total_charged_sar
--     <48h before start, not yet active : 50% of total_charged_sar
--     after start_date / active   : 0
--
-- Money lifecycle:
--   On host accept: snapshot fees + total_charged + mark paid_at +
--     payout_status='held'.
--   On completion (host completes after check-out report filed):
--     payout_status='released'.
--   On owner cancel: compute refund_sar per policy, set cancelled_at.
--
-- All new columns default such that this migration is safe on rows
-- created before payment fields existed (booking lifecycle code
-- patches in the new fields at accept-time).

alter table public.bookings
  add column if not exists owner_fee_sar      numeric,
  add column if not exists total_charged_sar  numeric,
  add column if not exists host_fee_sar       numeric,
  add column if not exists payout_sar         numeric,
  add column if not exists paid_at            timestamptz,
  add column if not exists payout_status      text,
  add column if not exists cancelled_at       timestamptz,
  add column if not exists refund_sar         numeric;

-- CHECK on payout_status values. NULL is fine (booking not yet
-- accepted); valid non-null values are 'held' and 'released'.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_payout_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_payout_status_check
      check (payout_status is null or payout_status in ('held','released'));
  end if;
end$$;


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Columns present.
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'bookings'
--     and column_name in (
--       'owner_fee_sar','total_charged_sar','host_fee_sar','payout_sar',
--       'paid_at','payout_status','cancelled_at','refund_sar'
--     );
--   expect: 8 rows.
--
-- 2. CHECK constraint present.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.bookings'::regclass
--     and conname = 'bookings_payout_status_check';
--   expect: 1 row, "CHECK ((payout_status IS NULL OR payout_status =
--   ANY (ARRAY['held'::text, 'released'::text])))".

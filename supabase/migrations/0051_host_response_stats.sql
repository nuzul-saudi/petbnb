-- ============================================================
-- 0051 — host_response_stats RPC (Phase 5, Part C)
-- ============================================================
-- Plan: docs/migration-0051-realtime-photos-response-plan.md
-- WRITTEN, not applied. Line-by-line review before Omar applies.
--
-- Purpose: a liquidity trust signal on listings — "usually responds
-- within an hour". The owner feed renders one bucketed badge per host,
-- so this RPC is BATCHABLE (host_ids uuid[] → one row per host) to
-- avoid an N+1 across the feed page, mirroring get_host_ratings (0032).
--
-- Metric (approved decision D-C1): for each inquiry the host has
-- answered, first_response = (host's earliest message in that inquiry
-- thread) − inquiry.created_at, in minutes. The badge shows the MEDIAN
-- across those inquiries (percentile_cont(0.5)) and the SAMPLE COUNT.
-- The client hides the badge under 3 samples (never a fabricated signal
-- on thin data — same posture as the "new host" badge).
--
-- ⚠️ SURVIVORSHIP BIAS (accepted for v1, flagged by Strategy): this
-- medians ONLY inquiries the host actually answered. A host who ignores
-- 90% of inquiries but replies fast to the 10% they answer still looks
-- fast. The honest companion metric is response RATE (answered / total
-- inquiries); it is tracked in docs/post-pilot-backlog.md for a future
-- pass where the badge shows both. Do not read this median as
-- "responsiveness" — it is "speed WHEN they respond".
--
-- Clock anchor: openInquiry inserts the inquiry row immediately before
-- the starter's first message, so inquiry.created_at is a fair "clock
-- starts" point. Booking accept-time is a separate signal, out of v1.
--
-- Why the inquiry thread only (m.inquiry_id = i.id): the host's first
-- reply to a NEW owner is the trust moment the badge is about. Messages
-- that live on a booking that grew out of the inquiry (β model, 0046)
-- are post-commitment coordination, not first-contact response — so
-- they are deliberately excluded from the numerator.
--
-- Soft-deleted messages (0044: deleted_at set, body nulled) are NOT
-- filtered out — the host DID respond at that timestamp even if they
-- later retracted the text; the timing signal stands.
--
-- STABLE + SECURITY DEFINER + pinned search_path: identical hardening
-- to get_host_ratings. The function returns ONLY aggregates (median +
-- count) — no message bodies, no row leakage — so running as definer
-- (which lets anon read the badge in guest mode) is safe.

begin;

create or replace function public.host_response_stats(host_ids uuid[])
returns table (
  host_id uuid,
  median_minutes int,
  sample_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with first_response as (
    select
      i.host_id                                                    as host_id,
      extract(epoch from (min(m.created_at) - i.created_at)) / 60.0 as minutes
    from public.inquiries i
    join public.messages m
      on m.inquiry_id = i.id
     and m.sender_id  = i.host_id
    where i.host_id = any(host_ids)
    group by i.id, i.host_id, i.created_at
  )
  select
    fr.host_id,
    round(
      percentile_cont(0.5) within group (order by fr.minutes)
    )::int                    as median_minutes,
    count(*)::int             as sample_count
  from first_response fr
  group by fr.host_id;
$$;

-- The badge renders on public listing cards (guest mode, R2C3), so anon
-- must be able to read it. Aggregate-only output makes this safe.
grant execute on function public.host_response_stats(uuid[]) to anon;
grant execute on function public.host_response_stats(uuid[]) to authenticated;

commit;

-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Function exists with the expected signature.
--   select proname, pronargs
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'host_response_stats';
--   expect: 1 row, pronargs = 1.
--
-- 2. SECURITY DEFINER + STABLE + search_path pinned.
--   select prosecdef, provolatile, proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'host_response_stats';
--   expect: prosecdef=t, provolatile='s', proconfig contains
--   'search_path=public'.
--
-- 3. Empty input — no rows, no error.
--   select * from public.host_response_stats(array[]::uuid[]);
--   expect: 0 rows.
--
-- 4. Thin host (< 3 answered inquiries) → sample_count < 3 so the
--    client hides the badge. Pick a host with one answered inquiry:
--   select * from public.host_response_stats(array[
--     (select host_id from public.inquiries i
--       where exists (select 1 from public.messages m
--         where m.inquiry_id = i.id and m.sender_id = i.host_id)
--       limit 1)
--   ]::uuid[]);
--   expect: 1 row, median_minutes populated, sample_count = 1.
--
-- 5. anon can execute (guest badge path).
--   set role anon;
--   select * from public.host_response_stats(array[]::uuid[]);
--   reset role;
--   expect: 0 rows, no permission error.

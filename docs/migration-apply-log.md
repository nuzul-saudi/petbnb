# Migration apply log

The `supabase/migrations/` directory holds the source-of-truth SQL files.
This log records which numbered migrations have been APPLIED to the live
Supabase project, with the evidence that confirms it. Append a new row
every time a migration is run on prod.

> **Why this file exists.** Before 2026-06-27 the only apply evidence in
> the repo was `docs/round-2-smoke-status.md` (which only covered 0029 +
> 0030). Everything past that was conversation memory — which means
> every fresh Claude session had to re-ask the founder "did you apply
> XYZ?" By logging applied migrations here, the apply state lives in
> git instead of in chat history.

## Confirmed applied

| Migration | Apply confirmed | Confirming check |
|---|---|---|
| 0001 – 0028 | n/a — early build, applied as written. | Foundation flows (auth, profiles, listings, bookings, condition reports, RLS) depend on these; a gap would have surfaced as runtime errors well before now. |
| 0029 (`round2_behavior`) | 2026-06-11 | Round 2 smoke checklist — see `docs/round-2-smoke-status.md`. |
| 0030 (`reconcile_review_policies`) | 2026-06-11 | Same smoke run as 0029. |
| 0040 (`inquiry_threads`) | 2026-06-27 (schema), 2026-06-28 (RLS smoke) | **Schema:** `select exists (select 1 from information_schema.tables where table_schema='public' and table_name='inquiries')` → `APPLIED`. **RLS smoke (manual, live, 2026-06-28):** four checks, all four passed. (A) Owner can open an inquiry on a listing and send the first message. (B) Second-open on the SAME listing by the SAME owner returns the existing thread (the partial-unique index holds — no duplicate threads created). (C) Cross-owner isolation — a different owner cannot see the thread row or its messages (inquiry RLS + messages-via-inquiry RLS both deny). (D) Booking-scoped messages thread unaffected — the existing `messages.booking_id` path still serves booking conversations independently of the new `inquiry_id` path. Confirms the 0040 RLS design from `docs/round-5b-inquiry-plan.md` holds under real auth contexts. |
| 0041 (`per_host_service_offers`) | 2026-06-27 | `select count(*) from information_schema.columns where table_schema='public' and table_name='listings' and column_name in ('offers_vet','offers_insurance','offers_transport')` → `3`. All three columns present. |
| 0042 (`promote_addon_flags`) | 2026-06-27 | Two `pg_get_functiondef ilike` checks against `pg_proc` for `promote_listing_draft`. Check 1: `has_grooming = has_vet = has_insurance = has_transport = t` — all four addon flags now copied by the RPC. Check 2: `has_species = has_vaccination = has_host_gender = has_resident_note = t` — prior 0023/0026/0034 extensions survived the redefinition. |

## Unconfirmed but presumed applied

0031 – 0039 between Round 2 and the design-review batch. No explicit
paper-trail confirmation for any of these, but:

- The deployed app currently uses functionality each of them adds (e.g.
  `0034_listings_accepts_species` powers the species filter on the home
  feed; `0038_is_admin_security_definer` is hit by every admin gate;
  `0039_host_application_schema` is the entire host signup funnel that
  Omar test-drove in Round 4).
- If any were missing, the corresponding code paths would 500 or
  silently return empty rows, which Omar has not reported.

If a future Claude session sees an unexplained anomaly in any of those
surfaces, re-confirm the relevant migration via a one-row
`information_schema` check before assuming a code bug.

## Known unwritten

_(none currently — 0042 landed on 2026-06-27 and is recorded above.)_

## Convention for future entries

When you (Claude or human) apply a new migration to the live Supabase
project:

1. Run a single read-only check against `information_schema` (or
   `pg_proc` for functions, `pg_policies` for RLS policies) that
   proves the migration's structural change is present.
2. Append a row to the **Confirmed applied** table above with the
   date, the migration number, and the exact SQL you ran.
3. Commit the doc edit as `docs: log <NNNN> apply confirmation`.

Keeps the apply state in git instead of in conversation memory.

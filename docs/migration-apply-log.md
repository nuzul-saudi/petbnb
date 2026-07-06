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
| 0043 (`archive_removal`) | 2026-06-28 | Three checks, all passed. **(1)** Inspected `messages_insert_participants` via `pg_policies`; inquiry branch reads `i.status <> 'converted'` (was `i.status = 'open'` pre-0043), booking-scoped branch byte-identical to 0040. **(2)** Policy count on `public.messages` is still 2 — no bloat from the drop+recreate. **(3)** Trigger guard verified live via `begin / update public.inquiries set status='closed' where id=<test-id> / rollback`; the UPDATE raised SQLSTATE `P0001` 'closing inquiries is no longer permitted (archive removed)'. Pre-apply lookup `select count(*) from public.inquiries where status='closed'` returned 0, so no data flip needed and the partial-unique index `inquiries_one_open_per_pair` was left unchanged. App-layer Close-button + `closeInquiry()` helper removed in the same commit (`693d593`). |
| 0044 (`message_deletion_and_read_tracking`) | 2026-06-28 | Five checks, all passed. **(1)** `messages.deleted_at` added (timestamptz, nullable); `messages.body` now nullable. **(2)** `messages_body_check` dropped; replacement `messages_body_presence` installed with definition `CHECK ((deleted_at IS NULL AND body IS NOT NULL AND length(body) > 0) OR deleted_at IS NOT NULL)`. **(3)** Read-tracking columns present: `bookings.owner_last_opened_at` + `bookings.host_last_opened_at`; `inquiries.starter_last_opened_at` + `inquiries.host_last_opened_at` — all timestamptz, all nullable. **(4)** `mark_thread_read(text, uuid)` RPC present with `prosecdef = t` (SECURITY DEFINER) and `proconfig` containing `search_path=public`; GRANT execute is on `authenticated` only. **(5)** All three trigger guards wired: `guard_message_update` (new — column immutability + soft-delete transition rules), `guard_booking_update` (new — forward-only monotonicity on the two read columns, coexists with the existing `bookings_capacity_guard` alphabetically), and the extended `guard_inquiry_update` (0040+0043+0044 — preserves all prior rules + adds forward-only monotonicity on the new read columns). `public.messages` now has **3 policies** including the new `messages_update_own_until_read` (UPDATE), composed cleanly with the existing SELECT + INSERT. Strategy cleared the migration + the paired admin-browse commit (`cfbff71`) before apply. |
| 0045 (`role_aware_listing_access`) | 2026-06-29 | Applied wrapped in `begin / commit`. Four checks, all passed. **(1)** `is_host()` helper present with `prosecdef = t` (SECURITY DEFINER) + `proconfig` containing `search_path=public`; mirrors the `is_active_user` / `is_admin` hardening pattern from 0038. **(2)** All **6 visibility sites** carry the new `host.role = 'host'` (or `role = 'host'` for the profiles-anon site where the row IS the host): `listings_select_active_verified_or_own`, `available_listings` RPC body, `profiles_select_public_host_anon`, `inquiries_insert_starter`, `listing_photos_select_public_or_host`, and `storage.objects` policy `listing_photos_storage_select_public_or_host`. Combined `union all` query returned 6 rows × `has_role_check = t`. **(3)** All **15 editability policies** reference `is_host()` — single `pg_policies` rollup returned 15 rows × `has_is_host = t` across `listings_update_host`, four `listing_drafts_*`, three `listing_photos_*` (mutation), four `listing_photo_drafts_*`, and three `listing_blocked_dates_*`. **(4)** `listings_insert_host` (0039) UNCHANGED — its `with_check` still carries the 0039 predicate (`role = 'host' AND host_application_status = 'approved' AND host_profile_complete = true`), no `is_host()` reference (the helper isn't needed here; the inline 3-clause check is stricter). **Behavioral spot-check (rollback-wrapped, non-prod listing):** `feed_after_demote = 0` rows — running `available_listings(...)` after a transactional `update profiles set role='owner' where id=<host>` returned zero rows for the demoted host's previously-visible listing; same call after rollback returned 1 row. Pure reversible role flip confirmed — no mutation of `is_verified` / `host_application_status` / `host_profile_complete` anywhere in 0045's code path or the spot-check. Strategy cleared the SQL (commit `df559cc`) + the verification-query fix (commit `212672f`) before apply. |
| 0046 (`beta_thread_continuity`) | 2026-06-30 | Applied wrapped in `begin / commit`. **Nine checks, all passed.** **(1)** `bookings.inquiry_id uuid` nullable + 5 new `<status>_at` columns (`accepted_at`, `declined_at`, `active_at`, `completed_at`, `disputed_at`) all `timestamp with time zone` + nullable; 6 rows in `information_schema.columns`. **(2)** Partial index `bookings_inquiry_id_idx` present with `indexdef` containing `WHERE (inquiry_id IS NOT NULL)`. **(3)** FK to `public.inquiries(id)` present with `confdeltype = 'n'` (ON DELETE SET NULL). **(4)** Trigger `guard_booking_status_stamp` wired, `tgtype = 19` (BEFORE UPDATE ROW per the bitmask), `tgisinternal = false`. **(5) ZERO new RLS — confirmed:** `pg_policies` rollup returned `public.bookings = 3`, `public.messages = 3`, `storage.objects = 17` — identical to pre-apply snapshot. The merge is purely additive at the data layer; reads continue to flow through the existing `0040 messages_select_participants` + `0004 bookings_select_owner_or_host` policies. **(6/7) Behavioral (rollback-wrapped):** stamp fires on real transition (`status='requested' → 'accepted'` stamps `accepted_at` within seconds; subsequent `→'completed'` stamps `completed_at`; `accepted_at` unchanged through both = idempotent + first-time-wins). A status flip to `'cancelled'` WITHOUT explicit `cancelled_at` left `cancelled_at` null — confirms the stamper deliberately omits `cancelled` per the 0028-reconciliation decision. **(8) Backfill report (Option α — conservative):** 1 booking linked to its origin inquiry; 16 left null (no matching inquiry OR multi-match leave-null per the no-auto-pick rule). The 1 linked / 16 unlinked split confirms the heuristic ran across all existing bookings; unlinked rows still work standalone (timeline falls back to no-inquiry-context). **(9) Positive invariant from SQL header §B holds:** `select count(*) from public.inquiries where status <> 'open'` → `0`. Confirms the partial-unique index `inquiries_one_open_per_pair` (UNIQUE `(listing_id, starter_id)` WHERE `status='open'`, 0040:116-118) NOW structurally enforces the β model: one conversation per (listing, starter) in perpetuity, since 0043 removed close + 0046 deliberately doesn't add convert. **Safety guarantee held end-to-end:** messages stayed PHYSICALLY in their own threads (no row repointing); the 0040 `messages_one_thread_check` + 0044 `messages_update_own_until_read` policy + `guard_message_update` trigger + `mark_thread_read` RPC are all untouched. Strategy cleared the SQL (commit `ad06814`) before apply. Next: the app PR (comprehensive timeline + smart-compose router) builds on this schema. |
| 0047 (`notifications`, Phase 2a) | 2026-07-06 | Applied after the R1–R4 review amendments (commit `b79a277`). **Structural checks passed:** **(1)** all 9 columns present with correct types (`created_at` NOT NULL; `read_at` + `emailed_at` nullable); `relrowsecurity = t`. **(2)** both indexes present incl. the partial `notifications_user_unread_idx … WHERE (read_at IS NULL)` + `…_user_created_idx (user_id, created_at DESC)`. **(3)** exactly two policies — `notifications_select_own` (SELECT) + `notifications_update_own_read` (UPDATE); no INSERT/DELETE. **(5)** `mark_all_notifications_read` present, `prosecdef = t`, `proconfig = {search_path=public}`. **(6)** `emit_notification(...)` execute privilege = `f` for `authenticated` (reachable only from the SECURITY DEFINER triggers). **(8)** anon `select count(*)` = 0. **R1:** type CHECK includes `booking_cancelled` (7 values). **R3:** `user_id` FK `references public.profiles` (not `auth.users`). **Triggers:** all 5 wired on the right tables (`guard_notification_update`→notifications; `notify_booking_requested`/`notify_booking_decided`→bookings; `notify_message_received`→messages; `notify_host_application_decided`→profiles). **Pending:** guard behavioral (#4 — the rollback-wrapped read_at-only/forward-only script) and per-trigger behavioral (#7) to be confirmed via the app smoke once the 2a client (bell + `/notifications`) lands. Part 2b (email via Edge Function → Resend) not yet built; `emailed_at` column ships here so 2b needs no new migration. |

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

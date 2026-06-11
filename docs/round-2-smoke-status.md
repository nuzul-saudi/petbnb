# Round 2 — Smoke-test status

**Date:** 2026-06-11 (DB validation morning, full UI validation evening after env fix)
**Branch:** `main`
**Migrations applied:** `0029_round2_behavior.sql` + `0030_reconcile_review_policies.sql`
**Final status:** ✅ **All checks passed. Round 1 + Round 2 closed.**

Three columns, ordered by strength of evidence — not two, because "tested vs not tested" hides the difference between logic verified by automated tests and UI rendering verified by human eyeballs. Both matter; they're not the same.

---

## 1. DB-validated by behavior (the strongest evidence)

Four end-to-end RLS smoke tests run today against the live Supabase database, each impersonating an `authenticated` role inside a `begin/rollback` transaction so the policy is actually evaluated against real auth context.

| # | What was tested | Result |
|---|---|---|
| 1 | Self-booking insert rejected — host inserting a booking on their own listing | `42501 row violates RLS` ✓ |
| 2 | Anon SELECT on `listing_blocked_dates` allowed | count returned, no `permission denied` ✓ |
| 3 | Valid review INSERT — owner→host on a `completed` booking | row returned with assigned `id` + `created_at` ✓ |
| 4 | Self-rating REJECTED — `rater_id = ratee_id` on the same booking | `42501 row violates RLS` ✓ |

**Locked:** migrations 0029 (A + B + C) and 0030. The self-booking guard (the security-critical piece), guest-mode anon read, the reviews INSERT happy path, and the role-symmetric clause against self-rating are all confirmed enforcing at the database layer.

---

## 2. Validated at code-review + CI + unit-test layers (logic, not rendering)

These pieces have automated guarantees on their math/logic but were not interactively walked through on a running app. The unit tests run on every push to `main` via `.github/workflows/ci.yml`.

| Change | Locked by |
|---|---|
| **R1C1 — money rounding (whole SAR)** | 9 vitest cases in `tests/payments-policy.test.ts`, incl. the 01:30 Riyadh-time cancellation edge that audit finding C3 introduced |
| **R1C2 — vaccination recency (>365d = expired)** | 9 vitest cases in `tests/vaccination.test.ts`, incl. the exact 365-day boundary |
| **R1C4 — confirm dialog migration** | 14 call sites swapped to `confirmDialog`; `tsc --noEmit` green; each call site code-reviewed |
| **R1C5 — Button component adoption** | 3 screens migrated (`listings/[id]`, `profile`, `admin/listings/[id]`); same-shape replacement, dead styles removed |
| **R2C2 — Rejected-by-admin label** | i18n key swap on `listings.status.admin_disabled` + `_with_draft`; i18n parity check at 524 keys |
| **R2C5 — sort-selector sort logic** | Client-side sort over already-loaded `ListingFeedItem`s; logic is `[...items].sort(comparator)` — straightforward and TypeScript-checked |

**Locked:** the math, the i18n, the component swaps. **Not locked:** what they look like on screen.

---

## 3. Visual rendering — VERIFIED 2026-06-11 (evening)

Originally deferred due to a Windows Metro environment issue (web returned `ERR_EMPTY_RESPONSE`; Expo Go on phone hit "network connection lost"). **Root cause turned out to be Node v24.14.0 — not LTS.** Expo SDK 55 + Metro have known HTTP/streaming regressions on Node ≥23. Side finding: McAfee Management Service (`macmnsvc`) was independently holding port 8081, masking the symptom further. Fix: install Node 22.18.0 LTS, full `rm node_modules && npm ci`, restart Metro on a clean port (8082). Web target restored; full UI smoke ran on `localhost:8082` in Chrome incognito.

Five highest-value UI checks, all passed:

| # | Check | Result |
|---|---|---|
| 1 | **R2C5 — owner feed sort selector.** Tapped Newest / Price ↑ / Price ↓ / Rating / Nearest chips; cards reordered correctly. 4 visible listings with prices 150/150/180/150 gave clear Price ↑/↓ verification. | ✅ |
| 2 | **R2C4 — host home tinted section pills.** Gold pill "DRAFTS · PENDING REVIEW" shown first; moss pill "LIVE · PUBLIC" shown second. Pill colors match the badges on cards inside each section. | ✅ |
| 2 bonus | **R2C2 — Rejected by admin label.** The `admin_disabled` listing in the Drafts section rendered with the "Rejected by admin" red pill (replaced "Removed by admin"). | ✅ |
| 3 | **R2C1 — self-listing notice card (UI layer).** Owner persona viewing own listing showed the inert "هذا إعلانكِ — بدّلي إلى وضع المضيفة لإدارته" notice instead of the Request-booking CTA. Feminine register confirmed. | ✅ |
| 4 | **R2C6 — review flow end-to-end.** On a completed booking (booking `434db8d9` on Noura's listing), submitted 4 stars + text via the ReviewCard. Card flipped to read-only immediately. Hard-refresh kept read-only state. DB row `a7efbcc6-810c-...` confirmed with stars=4, rater=Omar, ratee=Noura. | ✅ |
| 5 | **R1C1 — fee integers.** Fresh booking accepted as host (Khalid's request on "yes yes" at 750 SAR). DB snapshot: `owner_fee_sar=38`, `host_fee_sar=113`, `total_charged_sar=788`, `payout_sar=637` — all whole integers, exact match to `Math.round` formula. Legacy row (4bd4d8fc, pre-R1C1) confirmed to still hold decimal values from the old `round2` math — expected and consistent. | ✅ |
| — | **R2C7 — unread dot + focus refresh.** Live observation during fee verification: pending-requests badge incremented from 1 → 2 when Khalid's request landed, decremented 2 → 1 immediately after Accept without persona switch. The unread-dot half wasn't exercised here (no daily updates posted today); the focus-refresh half is verified. | ✅ (focus refresh) |

**One UX gap surfaced and logged**, not a regression of Round 1 or 2: the host's booking detail screen omits the owner's name/rating and the pet's name/breed/care notes — the host has no context on who they're committing to before they tap Accept. Logged in `docs/batch-decisions.md` as a future-milestone backlog item (host booking detail — owner & pet identity surface).

---

## Final scoreboard

| Layer | Status |
|---|---|
| 4 DB smoke tests (self-booking RLS, anon blocked-dates SELECT, valid review INSERT, self-rating REJECTED) | ✅ verified 2026-06-11 morning |
| Migrations 0029 (parts A+B+C) and 0030 applied | ✅ green |
| 7 code-review + CI + unit-test items (R1C1, R1C2, R1C4, R1C5, R2C2, R2C5 sort logic) | ✅ locked at commit time |
| 5 high-value UI checks + R2C7 focus-refresh | ✅ verified 2026-06-11 evening |
| Round 1 + Round 2 + env saga | ✅ closed |

---

## Cross-reference

Underlying decisions and full audit trail for every commit in Round 1 + Round 2: see [`docs/batch-decisions.md`](./batch-decisions.md). The host-detail UX gap that surfaced during the smoke test is in the "Future-milestone backlog" section there. Migration SQL bodies + verification queries: [`supabase/migrations/0029_round2_behavior.sql`](../supabase/migrations/0029_round2_behavior.sql) and [`0030_reconcile_review_policies.sql`](../supabase/migrations/0030_reconcile_review_policies.sql).

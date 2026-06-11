# Round 2 — Smoke-test status

**Date:** 2026-06-11
**Branch:** `main` (latest commit at smoke-test time: `ae1e857`)
**Migrations applied:** `0029_round2_behavior.sql` + `0030_reconcile_review_policies.sql`

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

## 3. Visual rendering UNVERIFIED — deferred due to Windows Metro env issue

Web target returned `ERR_EMPTY_RESPONSE`; Expo Go on phone hit "network connection lost"; neither web bundle nor native bundle would complete. The five highest-value UI checks below are what to run **first** when the env is back, before grinding through every screen.

1. **R1C3 — `DateField` on the availability screen.** The shared component already validated on the booking request flow visually; this is the third (last) surface adopting it. Open `/listings/<your-listing>/availability` and confirm both date fields render as native HTML5 calendars (web) or the YYYY-MM-DD fallback (native).
2. **R2C1 — self-listing notice card.** Switch a 'both' user to OWNER persona, open their own listing detail. Confirm an inert tinted notice ("This is your listing — switch to host mode to manage it") appears instead of the Request booking CTA. DB layer is already locked (column 1, Test 1); this is the user-facing surface.
3. **R2C4 — host-home tinted section pills.** Switch to HOST persona, land on `/`. Confirm the two SectionList headers render as colored pills — gold for Drafts (shown first), moss for Live (shown second) — not plain uppercase text.
4. **R2C6 — `ReviewCard` end-to-end render + persistence.** On the `434db8d9` booking marked `completed` today (now reverted to `requested` — re-mark it `completed` first), open as owner, submit a 5-star review, refresh the page, confirm the card flips to read-only mode showing the persisted review.
5. **R2C7 — unread dot + focus refresh.** As host on an active booking, post a daily update. As owner, open `/bookings` and confirm a terracotta dot appears before the booking title. Tap into the booking; navigate back; confirm the dot is gone. Separately confirm the pending-requests badge in the AppHeader decrements after accepting a booking, without needing a persona switch.

If 1–5 all pass, the remaining UI changes (R2C3 guest mode, R1 spot checks) are lower-risk visual confirmations of behavior that's already locked at other layers.

---

## Recovery sequence when you come back

Run, in order, from `C:\Users\Administrator\Petbnb`:

1. **Restart Windows.** Genuinely clears stale Metro daemons, lock files, firewall state. Often enough on its own.
2. **`npm run ci`** — confirms i18n parity (524 keys), `tsc --noEmit` clean, 35 vitest cases green. If any of the three turn red, fix BEFORE touching Metro.
3. **`npx expo start`** — let it bind. Try web in incognito at `http://localhost:8081`. If web is back, do the five UI checks above on web.
4. **If web still broken**, switch to phone via Expo Go (`npx expo start --tunnel` if LAN is blocked). Same five UI checks on phone.

If the env still fails after all of the above, escalate to: `rmdir /s node_modules .expo; npm install; npx expo start`. After that, the issue is system-level (PATH, antivirus, corporate proxy) and out of repo scope.

---

## Cross-reference

Underlying decisions and full audit trail for every commit in Round 1 + Round 2: see [`docs/batch-decisions.md`](./batch-decisions.md). Migration SQL bodies + verification queries: [`supabase/migrations/0029_round2_behavior.sql`](../supabase/migrations/0029_round2_behavior.sql) and [`0030_reconcile_review_policies.sql`](../supabase/migrations/0030_reconcile_review_policies.sql).

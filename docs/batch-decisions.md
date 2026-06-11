# Batch decisions log

One line per decision made autonomously during the batch run.

- **2026-06-10** — Started batch. Resuming from clean tree after 8h.5.
- **0c sweep** — admin host-gender chips: bug was both EN `host_female`/`host_male` set to "Sitter". Fixed to "Female sitter" / "Male sitter" (mirrors AR pattern, no separate admin-only key needed).
- **0c sweep** — zero-count admin dashboard cards become inert (disabled + faded) rather than navigating into an empty list.
- **0c sweep — 8e last-photo edge case** — chose "block the delete with a friendly message" over the count-tracking column approach. Simpler, no migration, prevents the re-snapshot bug.
- **Milestone A — pet vaccination dates** — free-text `yyyy-mm-dd` input instead of native date picker for MVP. Real picker is polish; not blocking.
- **Milestone A — vaccination check** — SOFT warn before submitting booking (per spec), NOT a hard block. Host can decline on their side.
- **Milestone A — care_notes visibility** — shown to host only when `booking.status IN ('accepted','active','completed')`. Pre-accept the host shouldn't see private care notes; they only need them once committed. (Owner already knows their own pet's notes — only host gets the display.)
- **Milestone A — vaccination_doc_url** — column was already in 0001's pets schema; not adding upload UI in this batch (would need pet-photo bucket pattern replication). Deferred to a polish pass after the data model proves out.

## Future-milestone backlog (logged during batch run)

- **Change / cancellation policy engine (flight-style).** Pre-launch milestone, AFTER real payments land. Today's locked 48h-cliff refund tiers (full / 50% / none) are the launch-sufficient interim; a richer engine should support: change & cancel rules varying by host preference (Flexible / Moderate / Strict tiers à la Airbnb), date-change fees, host re-approval of changed dates (vs auto-accept inside the same booking), and host compensation on late owner cancel (so hosts who blocked their calendar aren't left empty-handed). Design as its own milestone once the gateway integration lands — change/cancel penalties are meaningless until real money moves.

## Round 1 (2026-06-11) — code-review audit response

- **R1C1 — money correctness (audit C1+C3).** Whole-SAR rounding via `Math.round` on fee snapshots (replaces decimal-leaking `round2()`). Refund start anchored to `T00:00:00+03:00` (Riyadh midnight, no DST) rather than UTC midnight (= 3 AM Riyadh) — closes the gap where a 01:30 Riyadh cancellation landed in the 50% tier instead of no-refund. Server-side clock (C2) deferred to the gateway swap; in-code comment marks the requirement.
- **R1C2 — vaccination recency (audit C4).** New pure `src/lib/vaccination.ts` adds 365-day boundary. Warning copy split into `_missing` and `_expired` variants (both still soft-warn, neither blocks submit). Smoke-test checklist's "more than 1 year old" rule now actually implemented.
- **R1C3 — date input standardization (audit S1).** availability.tsx's last raw `TextInput`s swapped for the shared `DateField` with min-date wiring mirroring request.tsx exactly. All three date surfaces (booking request / pet vaccination / availability) now identical on web.
- **R1C4 — confirm dialog unification (audit S2).** New `src/lib/confirm.ts` exporting `confirmDialog(message): Promise<boolean>`. 14 destructive-action sites migrated across 6 files; per-screen wrappers deleted. Two `confirmLeaveIfDirty` helpers stay synchronous (sync nav-gate from AppHeader can't easily go async — separate follow-up).
- **R1C5 — CTA Button adoption (audit S3) + console gating (S4).** Three screens (listing detail, profile, admin listing detail) migrated their primary/destructive CTAs to the shared `Button` component — disabled/loading/spinner free. New `src/lib/log.ts` provides `__DEV__`-gated `logWarn/logInfo/logError`; 76 console call sites swapped across 33 files. Stale `formatRiyadhStamp` docstring fixed.
- **R1C6 — CI workflow + first tests (audit §6).** `.github/workflows/ci.yml` runs i18n parity + tsc + vitest on every push to main and every PR. `scripts/check-i18n-parity.mjs` (pure Node, no deps) — 505 keys verified, 400 referenced from code. Vitest + 35 tests over `payments-policy`, `pricing`, `availability` (via new pure `src/lib/range-overlap.ts`), and `vaccination`. Decision: vitest over jest-expo for lighter setup; pure-lib scope today, component testing later.

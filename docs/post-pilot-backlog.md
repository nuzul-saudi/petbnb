# Post-pilot backlog

The single home for deferred items — things intentionally punted until
after the pilot validates the core loop. Each entry names its trigger /
prod evidence so we know *why* it's safe to defer and *when* it stops
being safe.

---

## Data model / RLS

### `bookings.pet_id` — keep the dual-write or migrate off it?
**Trigger:** the 0050 pets host-visibility fix (Phase 4) makes the
`booking_pets` junction the source of truth for a host's pet-visibility.
After that, `bookings.pet_id` (a pre-0009 single-pet column, still
**dual-written** by the request flow) is pure legacy — the only thing it
still powers is the OR-ed legacy clause in
`pets_select_owner_or_booking_host` (for any genuinely pre-0009 rows).

**Decision (post-0050):**
- **Keep the dual-write** — cheap back-compat, one redundant column, the
  legacy OR-clause stays as a safety net. OR
- **Migrate off `bookings.pet_id`** — stop dual-writing, backfill any
  legacy-only rows into `booking_pets`, drop the column + the legacy
  OR-clause once no code reads it. Cleaner model, one migration.

Not urgent; do it when touching the booking-request/junction code next.

## Product / lifecycle gaps

### Admin-disable should cascade to pending requests
When a listing is set to `admin_disabled`, its **pending booking
requests are not touched** — they sit in `requested` forever, and the
owner is never told the listing went away. Admin-disable should
**auto-decline the listing's pending requests and notify the affected
owners** (a `booking_declined` notification already exists via 0047 —
wire the admin-disable path to emit it, with an admin-disabled reason).
**Prod evidence:** booking `5331357f` — pending forever on a
disabled listing.

## Data hygiene (pre-pilot sweep)

### Orphaned legacy-only booking + junk test pets
- **Booking `5331357f` has zero `booking_pets` rows** — an orphaned,
  legacy-only booking (pet linked via `bookings.pet_id` only, nothing in
  the junction). Clean up (or backfill its junction row) during the
  pre-pilot sweep; also a data point for the `bookings.pet_id`
  migrate-off decision above.
- **Junk test pets throughout the pending set** — names like `"test"`,
  `"adf"`, `"12"`, `"11"`. Purge together with the shell/test accounts
  (`@petbnb.local`, `perbnb1`/`petbnb1`, `testtest`, `s234324`, the
  `+tos` aliases) so they don't pollute the first real pilot analytics.
  Add the detect + purge SQL to `docs/data-hygiene-prelaunch.md` when
  running the sweep.

## Growth / distribution

### Per-listing OG cards (server-side rendering)
Status: deferred post-pilot (Omar decision, 2026-07-06). Today every
shared link unfurls the same site-wide brand card (verified on WhatsApp
2026-07-06). Wanted: sharing a listing link shows THAT listing — host
area, price/night, photo. Deferred because the app is an SPA: crawlers
read the raw HTML shell and never run JS, so per-listing cards need a
Vercel serverless/edge function that intercepts /listings/:id, looks up
the listing, and injects its meta into <head> before any JS (bot-targeted
SSR; humans still get the SPA). Effort ~half-day+.
Trigger to build: real payments live + organic sharing at volume; or
earlier as a host-recruiting demo if recruiting stalls.
GUARDRAIL: the og:image/description must honor the district-only privacy
posture — no host address, no exact geo, same rule as listing detail.

## Notifications (Phase 2 follow-ons)

- Phase 2b email — DEPLOY (written + reviewed; commit b8822d9 + migration
  0049). Waits on Omar's runbook checkpoint (Resend key, apply 0049,
  deploy function, webhook). Runbook: docs/phase-2b-email-runbook.md.
- Read receipts / ticks — deferred per the 0047 plan.
- Per-type notification preferences / mute — deferred per the 0047 plan.
- Push notifications — needs native builds; post-pilot.
- Dedicated meet_greet_* notification types (v1 reuses message_received
  per 0050 plan A6).

## Analytics (Phase 1.5 follow-ons)

- North-star nights metric: dashboard proxies completed nights with a
  weekly booking_completed COUNT; add a nights prop for a true nights-sum
  (noted in docs/posthog-dashboard-recipe.md).
- Session replay: intentionally OFF. Revisit at pilot start, gated on
  (a) the live privacy policy and (b) mask-all-text config.

## Code health (from Strategy review, non-blocking)

- File diet: bookings/[id].tsx (~1,900 lines, regrown past its
  post-refactor ~1,200) and request.tsx (~1,540). Extraction only, zero
  behavior change; schedule before a phase adds more to these files.
- E2E smoke in CI: one Playwright golden-path test (guest browse →
  sign-in → inquiry → request) against the web build, as a 4th CI step.
- Leakage measurement: once PostHog is live, add the contact_nudge_shown
  vs contact_nudge_sent_anyway ratio to the dashboard.
- Sign-in email button arms on any single character — disable until a
  basic email-format check passes (rider previously sent; land it in the
  next convenient batch).

## UX decisions parked for pilot data

### 📥 pending-requests badge vs 🔔 bell — one badge or two?
Status: KEEP BOTH through the pilot (Strategy decision 2026-07-06,
supersedes D5's "absorb later" assumption; also logged in
batch-decisions).
Rationale: post-sweep the semantics diverged — 🔔 clears on READ
(thread-open sweep), 📥 clears on DECIDE (accept/decline). 📥 is the only
"undecided work" signal once a host has opened a request without
deciding; response rate is a core liquidity metric.
Merge target design (if pilot data says merge): one 🔔 icon; inside, a
pinned "يتطلب إجراء / Action needed" section (live pending count, clears
on DECIDE) above the activity feed (clears on READ); badge = unread +
pending. Decide with PostHog: pageviews on /notifications vs
reservations + time-to-decide funnel.

### Response-time badge — add response RATE as the companion metric
Status: shipped the SPEED half (Phase 5 / 0051 `host_response_stats` —
"usually responds within an hour", median first-response over ANSWERED
inquiries, hidden under 3 samples). Gap: **survivorship bias** — it
medians only the inquiries a host actually replied to, so a host who
ignores 90% of inquiries but answers the other 10% fast still shows a
fast badge. The honest companion is **response RATE = answered inquiries
/ total inquiries received**. Post-pilot: extend the RPC to also return
`total_inquiries` (and/or `answered_count`), and have the badge show
both — e.g. "responds within an hour · replies to 8 in 10". Until then
the copy deliberately says "responds within…", never "responsiveness",
so it doesn't overclaim. Decide the exact surface with pilot data (does
rate move bookings? is a low-rate host worth surfacing at all, or hide
the badge below some rate floor?).

### Owner feed empty-state nudge
For brand-new owners: "أضف ملف قطتك ليكون الطلب أسرع" linking to
pet-profile creation. Small conversion polish, post-pilot.

## Parked product scope (North Star, NOT roadmap)

Explicitly out of scope until well after pilot — recorded so they stay
parked: dogs (behind SPECIES_ENABLED), super-app tiles / services
marketplace, merchandise marketplace, text search over listings, native
iOS/Android builds, insurance add-on product (offers_insurance flag
exists per-host; hidden until a partner — e.g. Tree Digital Insurance —
is signed; business-track outreach item, not code).

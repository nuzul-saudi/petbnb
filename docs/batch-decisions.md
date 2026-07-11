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

## Overnight batch (2026-06-13 → 14)

Six AUTH milestones + three HD milestones + two stretch items, all
committed. CI green at end (46 tests, i18n parity OK, tsc clean).

### AUTH decisions
- **Migration numbering**: brief said next is 0031, but the live
  highest is 0038. Continuing from 0039 if needed (none in this
  batch — all AUTH work is client-only via Supabase APIs).
- **Arabic register**: kept masculine (founder's last call). The
  brief mentioned feminine but the live decision was masculine.
- **Password minimum**: 8 characters (per AUTH-2 spec).
- **New-vs-returning user detection** (AUTH-2): check whether
  profile.full_name is empty after OTP verify. Brand-new accounts
  have an empty full_name (the on_auth_user_created trigger
  creates the row with defaults). Cleaner than reading
  auth.created_at or user_metadata.
- **Forgot-password routing** (AUTH-4): the `flow=reset` URL param
  on /verify tells the verify screen to forward into
  /set-password?mode=reset instead of the signup flow. No
  separate forgot-password screen — the existing OTP and
  set-password screens compose into the reset flow.
- **Google OAuth gate** (AUTH-5): EXPO_PUBLIC_GOOGLE_AUTH_ENABLED
  must equal the literal string 'true' to render the button. The
  default (env var absent) hides the button, so the button doesn't
  accidentally appear before Omar configures the OAuth client in
  Supabase Dashboard. The redirect URL uses window.location.origin
  + returnTo so it works from both the local dev URL and the
  Vercel-deployed URL without code change.
- **Guest link** (AUTH-1): "Continue as guest" always routes to
  '/' (the feed) regardless of returnTo. The intent is to exit
  the auth funnel; sending the user back to the page that
  triggered sign-in would re-enter it.

### HD decisions
- **Care notes pre-accept** (HD-2): removed the
  `status in ('accepted','active','completed')` gate so the host
  sees care_notes on every booking status. This is a deliberate
  reversal of the original Milestone A posture — the founder
  decided the host needs the context BEFORE accepting, not after.
- **Pet age display** (HD-2): added a `Ny Nm` form when months
  ≥ 12 + remainder > 0; plain "N months" / "N years" otherwise.
  Reused existing pets.age_months / age_months_one i18n keys for
  the < 12 path; added pet_age_years / pet_age_year_one /
  pet_age_year_month for the new path. Feminine→masculine
  baseline maintained.
- **Completed-bookings-as-owner count**: deferred. The naive
  count(*) from bookings query is RLS-gated to the participant,
  so a host querying another owner's completed-booking count
  returns 0. Doing it right needs a SECURITY DEFINER RPC
  (mirror of get_host_ratings). Logged as a follow-up below.

### Stretch decisions
- **S1 photo-count warning**: SOFT warn (admin can override),
  not a hard block. Confirm dialog with count + recommended
  minimum. Threshold = 3 photos (per founder's note in the prior
  batch's batch-decisions backlog).
- **S2 host card**: same identity-card pattern as OwnerPetsSection's
  owner block. Same 56 px avatar, same colors.cream background,
  same 20-size heading. Visual consistency over inventing a new
  shape.
- **S3 "New here?" hint**: folded into AUTH-1 directly (italic
  hint line below the subtitle). Same wording in both locales.

### Deferred (still worth doing later)
- **completed-bookings-as-owner count RPC**: mirror of
  get_host_ratings — `get_completed_booking_counts(user_ids)`
  returning per-id counts via SECURITY DEFINER. Would let the
  host see "X completed bookings as owner" on the OwnerPetsSection
  card. Cheap migration; logged for the next batch.

## Future-milestone backlog (logged during batch run)

- **Minimum photo count enforcement (pre-launch).** Surfaced
  2026-06-13 on the deployed Vercel build: a listing with zero
  photos shows the 🏠 emoji placeholder on the feed card AND
  inside the detail mosaic, looking abandoned. Founder wants a
  hard minimum (e.g., 3 photos) before admin approval. Two
  enforcement points to add:
  1. **Listing form** — disable "Save / Submit for review" until
     ≥3 photos uploaded. Friendly inline counter ("Add 2 more
     photos to submit"). Reuses the existing photos screen.
  2. **Admin approve flow** — show a warning banner in the
     admin queue if a pending listing has <3 photos; admin can
     override but it's the deliberate friction. Cheap addition
     to the existing approve action in admin/listings/[id].
  Not blocking today — the deployed test has 4 listings and most
  already have photos. Worth landing before the friends-and-
  family broader test so first impressions aren't 🏠 placeholders.

- **Change / cancellation policy engine (flight-style).** Pre-launch milestone, AFTER real payments land. Today's locked 48h-cliff refund tiers (full / 50% / none) are the launch-sufficient interim; a richer engine should support: change & cancel rules varying by host preference (Flexible / Moderate / Strict tiers à la Airbnb), date-change fees, host re-approval of changed dates (vs auto-accept inside the same booking), and host compensation on late owner cancel (so hosts who blocked their calendar aren't left empty-handed). Design as its own milestone once the gateway integration lands — change/cancel penalties are meaningless until real money moves.

- **Host booking detail — owner & pet identity surface.** When a host opens a `requested` or accepted booking, the screen omits the owner's name/avatar/rating and the pet's name/breed/age/care_notes/photo/vaccination — the host has no context on who or what they're committing to. Mirrors the owner-side detail screen built in Step 5.5; host-side has been minimal since Step 7. Pre-launch milestone — a host has to know who they're hosting. Surfaced during the 2026-06-11 Round 2 smoke test when Omar accepted his first fresh request and noted the detail screen showed only listing + dates + total, no owner/pet info.

## Round 1 (2026-06-11) — code-review audit response

- **R1C1 — money correctness (audit C1+C3).** Whole-SAR rounding via `Math.round` on fee snapshots (replaces decimal-leaking `round2()`). Refund start anchored to `T00:00:00+03:00` (Riyadh midnight, no DST) rather than UTC midnight (= 3 AM Riyadh) — closes the gap where a 01:30 Riyadh cancellation landed in the 50% tier instead of no-refund. Server-side clock (C2) deferred to the gateway swap; in-code comment marks the requirement.
- **R1C2 — vaccination recency (audit C4).** New pure `src/lib/vaccination.ts` adds 365-day boundary. Warning copy split into `_missing` and `_expired` variants (both still soft-warn, neither blocks submit). Smoke-test checklist's "more than 1 year old" rule now actually implemented.
- **R1C3 — date input standardization (audit S1).** availability.tsx's last raw `TextInput`s swapped for the shared `DateField` with min-date wiring mirroring request.tsx exactly. All three date surfaces (booking request / pet vaccination / availability) now identical on web.
- **R1C4 — confirm dialog unification (audit S2).** New `src/lib/confirm.ts` exporting `confirmDialog(message): Promise<boolean>`. 14 destructive-action sites migrated across 6 files; per-screen wrappers deleted. Two `confirmLeaveIfDirty` helpers stay synchronous (sync nav-gate from AppHeader can't easily go async — separate follow-up).
- **R1C5 — CTA Button adoption (audit S3) + console gating (S4).** Three screens (listing detail, profile, admin listing detail) migrated their primary/destructive CTAs to the shared `Button` component — disabled/loading/spinner free. New `src/lib/log.ts` provides `__DEV__`-gated `logWarn/logInfo/logError`; 76 console call sites swapped across 33 files. Stale `formatRiyadhStamp` docstring fixed.
- **R1C6 — CI workflow + first tests (audit §6).** `.github/workflows/ci.yml` runs i18n parity + tsc + vitest on every push to main and every PR. `scripts/check-i18n-parity.mjs` (pure Node, no deps) — 505 keys verified, 400 referenced from code. Vitest + 35 tests over `payments-policy`, `pricing`, `availability` (via new pure `src/lib/range-overlap.ts`), and `vaccination`. Decision: vitest over jest-expo for lighter setup; pure-lib scope today, component testing later.

## Round 2 (2026-06-11) — behavior audit response

- **R2C1 — self-booking guard (behavior §1).** Three-layer block on a host booking their own listing. UI: own-listing-in-owner-persona swaps the "Request booking" CTA for an inert notice; `/listings/[id]/request` mirrors the same notice if hit directly. App: `createBookingRequest` reads `host_id` alongside `max_concurrent_pets` and throws when `owner_id === host_id`. DB: migration 0029 part 1 tightens `bookings_insert_owner` with `owner_id <> (select host_id from listings where id = listing_id)`. Closes the fake-rating vector before R2C6 ships reviews.
- **R2C2 — Rejected by admin label (behavior §2).** Host-facing `admin_disabled` badges relabel from "Removed by admin" → "Rejected by admin" / "مرفوض من الإدارة" in both locales. Admin-side label (`admin.status_admin_disabled`) deliberately UNCHANGED — admin's mental model is "I disabled it" (action they took), host's is "rejected" (state the listing is in). Founder confirmed the relabel via AskUserQuestion.
- **R2C3 — guest mode (behavior §3).** Owner feed + listing detail render for anon visitors; every gated action (Request booking, persona toggle, bookings list, account) routes to `/sign-in?returnTo=<current>` and honors returnTo through verify. AppHeader hides middle nav + account + persona toggle for guests, surfaces a "Sign in" pill in their place. Migration 0029 part 2 widens `listing_blocked_dates` SELECT from `authenticated` to `anon, authenticated` so the date picker works for guests. Sign-in copy decided: "Sign in or create an account" / "سجّلي دخولاً أو أنشئي حساباً" — not "subscribe" (no paid tier).
- **R2C4 — host section framing (behavior §4).** SectionList headers in HostHome become tinted pills — gold for Drafts (matches the in-flight badge color), moss for Live (matches the published badge color). Added a `tone` field to the section type so renderer picks the right pill style. Plain text `sectionHeader` style retained but unused on this screen.
- **R2C5 — owner feed sort selector (behavior §4).** Chip strip above the feed: Newest (default) · Price ↑ · Price ↓ · Rating · Distance. Newest is a no-op (base query already orders by `created_at desc`); Distance hands off to the existing `sortByDistance` haversine path; Price/Rating are client-side sorts over the loaded items. Distance chip only renders when `coords` is available. No schema/query changes needed — every field already returns on `ListingFeedItem`.
- **R2C6 — two-way reviews (behavior §5).** `src/lib/reviews.ts` adds `createReview` (1..5 stars, optional text) + `findMyReview` (caller's prior review for back-and-forth UI flips). New `src/components/bookings/ReviewCard.tsx` — tappable stars + textarea in compose mode, read-only stars + thanks copy when an existing review exists. Wired into bookings/[id].tsx with persona gates: owner mode renders "Rate your host", host mode renders "Rate the owner". Migration 0029 part 3 adds `reviews_insert_participant` (rater = auth.uid, booking completed, rater ∈ {owner_id, host_id}, ratee = the other) + `reviews_select_authenticated`. No update/delete policies — reviews are immutable (mirrors condition_reports posture). `unique(booking_id, rater_id)` backstops double-submits.
- **R2C7 — in-app notification signals (behavior §7 Phase 1).** New `src/lib/last-seen-storage.ts` (AsyncStorage, per-user-per-booking ISO stamps, batched `multiGet` for the list). `MyBookingListItem` gains `latest_update_at` populated by one follow-up `daily_updates` query per index load. Owner bookings list draws a terracotta 8px dot when `latest_update_at > lastSeen[id]`; booking detail calls `markSeen()` on mount. `useFocusEffect` calls `refreshPendingHostCount()` on HostHome and `/bookings` so the host badge decrements without waiting for a persona switch. Admin index already had focus-refresh — no change.
- **Future-milestone backlog addition.** Phase 2 notifications (real push via `expo-notifications`) stays out of any unattended batch — needs Expo project credentials + a real device for testing. Same status as the payment gateway swap: physical prerequisites only the founder can provide. Sequence after payments.

## Round 3 (2026-06-11) — Opsec + DB Hardening (VC review response)

Source: VC due-diligence review + Claude Code technical feedback convergence (plan v2).

### Decisions
- **Admin email rotation, not git filter-repo.** Scrubbing the founder's `@gmail` from history would rewrite every commit hash. Rotating identity (new admin address with hardware 2FA) + privatizing the repo achieves the same outcome with zero hash churn.
- **Repo goes private after this round's push.** Standing strategy + RLS + competitor analysis sitting in a public repo was unforced opsec leak. The codebase remains transferable to a future hire; the public-repo signaling value didn't justify the exposure.
- **EXIF stripping added to upload pipeline** (`src/lib/image-strip.ts`). Privacy-critical for the female-trust positioning — a host home photo with embedded GPS = her home address. Wired into all four user-photo upload paths: listing photos, pet photos, condition-report photos, daily-update photos (the briefing flagged three; daily-updates has the same exposure and got swept in).
- **Feed pagination at 20 default; load-more is a follow-up.** Unpaginated feed was hot-pathed at every approved listing every load. Trivial at 30 listings, painful at 300.
- **Rating aggregation moved server-side via RPC** (migration 0032). The client-side aggregate was fetching every `(ratee_id, stars)` row for the visible host set. RPC does avg + count in Postgres and ships one row per host.
- **Composite index on `(status, city)`** (migration 0031). Restores the hot-path covering that died with `is_active` in migration 0024.
- **Analytics deferred to provider-choice decision.** The plan v2's "stub analytics now" round was pulled out. Sprinkling `track()` calls without a provider chosen is noise; the decision (PostHog vs Amplitude vs Mixpanel — KSA data-residency matters) is the hard part. Re-open after Round 7.
- **window.confirm deferral:** The 2 remaining `window.confirm` sites in `confirmLeaveIfDirty` (`bookings/[id].tsx` and `photos.tsx`) are a deliberate known limitation, not oversight. `Pressable.onPress` cannot await an async confirm before navigation fires. Fixing requires an architectural change to AppHeader's nav-gate contract (intercept → dialog → re-dispatch nav after confirm). Documented in ONBOARDING.md §9. Re-evaluate only if the AppHeader nav-gate contract is being changed for another reason.

### Items NOT acted on
- **git filter-repo:** rotating email is sufficient.
- **Playwright integration tests:** deferred until payments make integration tests worth the Expo Web setup cost.
- **TanStack Query migration:** Context + Supabase direct is fine at MVP scale; the React Query benefits don't justify the migration footprint today.
- **Hardcoded add-on catalog → DB table:** deferred until hosts request custom pricing. Today's 4 fixed add-ons sit in `pricing.ts` as constants imported by both `request.tsx` and the booking detail; no actual duplication.

### Migrations written (Omar applies after review)
- `0031_feed_index.sql` — composite index on `(status, city)`.
- `0032_host_rating_rpc.sql` — `get_host_ratings(host_ids uuid[])` RPC.

### Founder-lane follow-ups (after push)
- Privatize repo (GitHub → Settings → Danger Zone → Change visibility).
- Rotate Supabase admin to a dedicated address with hardware 2FA.
- Trademark opinion + backup brand name (BEFORE any brand spend).

## Round 4 (2026-06-12) — Host booking detail surface

Source: Plan v2 Round 4. Long-standing UX gap — host accepted bookings blind.

### Decisions
- **Shared UserAvatar component extracted** alongside the new section, not after. This is now the 3rd site needing the photo→initial→'?' fallback (others: sitter-first ListingCard, listing detail sitterHeader). Inline patterns at the other two sites stay for now — sweep them in a future cleanup.
- **OwnerPetsSection is presentational + host-only.** Owner persona already knows their own pets and an owner row would be self-referential.
- **Vaccination pill uses worst-of-two semantics** — if either rabies or FVRCP is expired, the pill is expired (terracotta). Missing wins over current. Matches the booking-request screen's warning logic.

## Round 5a (2026-06-12) — Messaging data layer

Source: Plan v2 Round 5a. Step 9 → launch blocker.

### Decisions
- **Migration 0033 SKIPPED.** Briefing's claim that the original 0002 messages_insert_participants policy predates suspension was inverted — 0004 already drop-and-recreated the policy with `is_active_user()` in the with-check. Wasted-migration trap avoided by the operating-rule-10 grep step.
- **containsContactInfo regex covers Arabic-Indic digits + Arabic keyword spellings** (واتساب, تليجرام, سناب) in addition to Latin. Saudi senders write phone numbers in either digit family; the nudge would silently fail without this.

## Round 5b (2026-06-12) — Messaging chat UI

Source: Plan v2 Round 5b.

### Decisions
- **Realtime explicitly out of scope.** Without Supabase Realtime subscription, the other party won't see new messages until they next focus the screen. The parent's `useFocusEffect(refetchMessages)` makes "navigate away + back" the implicit pull-to-refresh gesture. Documented in the MessagesSection component header and committed-message body.
- **canSend gates off declined / cancelled / disputed.** An immutable booking shouldn't accept new conversation either.

## Round 6 (2026-06-12) — Pet photo URL (path-not-signed + batch-sign)

Source: Plan v2 Round 6.

### Decisions
- **Round 6 NOT 5 in the plan ordering** because path-not-signed touches 4 consumer screens and needs the new useSignedPetPhotoUrls hook — naturally fits AFTER 5b's chat UI lands.
- **1-hour signed URLs at render** (was 7-day at upload). Hosts open booking details continuously; a 1-hour signed URL is comfortably longer than any single browsing session.
- **Legacy compatibility via `startsWith('https://')` detection** — pre-Round-6 rows hold signed URLs that already work. The cleanup is logged in `docs/data-hygiene-prelaunch.md` for when the founder wants to delete the legacy branch.

## Round 7 (2026-06-12) — Dispute workflow

Source: Plan v2 Round 7 (was in v1 as Tier 2; promoted to blocker).

### Decisions
- **No new RLS migration needed.** The existing 0004 bookings_update_owner_or_host policy permits both parties (active or admin) to update; no transitioning trigger exists on bookings. Status enum already includes 'disputed' from 0001.
- **Admin visibility = a third queue card on the dashboard** routing to the all-bookings screen. Founder filters visually until volume justifies a dedicated screen.
- **Email/Slack notification deferred.** An Edge Function trigger on transition INTO 'disputed' would page the founder immediately. For MVP the dashboard counter is enough — founder checks daily.

## Round 8 (2026-06-12) — Pre-launch data hygiene doc

Source: Plan v2 Round 8.

### Decisions
- **Cleanup SQL is COMMITTED COMMENTED-OUT.** Safe in the repo; running each block is a deliberate founder action with reviewable diff via the SQL editor. Each section has a detect query + a fix block + a verify follow-up.
- **Pre-0009 legacy bookings + pre-R1C1 decimal fees stay as-is.** Immutable evidence records — rounding them after the fact would lose the audit trail of what each party actually paid. The display layer's branches handle them correctly.

## Migrations written (Round 3-7) — Omar applies after review

- `0031_feed_index.sql` (Round 3)
- `0032_host_rating_rpc.sql` (Round 3)
- (Round 5a SKIPPED, see decision above)
- (Round 7 needed no migration, see decision above)

## Round 9 (2026-06-12) — Supabase Realtime for in-booking messaging

Source: Plan v2 Round 9.

### Decisions
- **Channel-per-booking** (`messages:{bookingId}`) over a global channel so RLS gives us free isolation: a subscriber on booking A can't peek at booking B even by guessing the channel name. Postgres filter on `booking_id=eq.${bookingId}` keeps it tight.
- **No optimistic insert in the realtime path.** We refetch on INSERT so the cached query is the single source of truth and the sender sees their own send via the same path everyone else does.

## Round 10 (2026-06-12) — Price band filter chips

Source: Plan v2 Round 10.

### Decisions
- **Three preset bands over a range slider.** RN Web has no clean range slider primitive and the value of a fine-grained slider on a feed of <30 listings is questionable. Three buckets — budget (≤200), midrange (201–400), premium (>400) — read as one tap, no friction.
- **Bands wire through existing `listActiveListings({minPriceSAR, maxPriceSAR})`** — no new RPC; the helper has accepted those args since Step 5.

## Round 11 (2026-06-12) — Saved listings (favorites)

Source: Plan v2 Round 11.

### Decisions
- **Composite PK `(user_id, listing_id)` over a synthetic id.** The natural key is also the uniqueness constraint — no surrogate adds value, and DELETE by composite PK is cheap with the PK index.
- **Optimistic toggle in the hook** with revert-on-error. Heart tap latency at intercontinental Supabase RTT was sluggish; the hook updates the local Set immediately and reverts on failure with `logWarn`.
- **No UPDATE RLS policy.** Favorites are insert-or-delete only; no mutable column anyone would want to UPDATE. Three policies (select / insert / delete), not four.
- **Favorites screen surfaced from the profile screen,** not the AppHeader. The header is already dense (Home + Bookings + Account + persona toggle + language). Adding a fifth pill crowds the nav; a profile link is the canonical "account-scoped resource" idiom and matches "My Pets" right next to it.
- **PostgREST nested-join used for `listFavoriteListings`** so the My Favorites screen renders the same `ListingFeedItem` shape the feed uses — one round trip, one ListingCard component on both screens.

## Migrations written (Round 9-11) — Omar applies after review

- (Round 9 needed no migration — channel subscription is client-side only.)
- (Round 10 needed no migration — band → minPriceSAR/maxPriceSAR happens in the client.)
- `0033_favorites.sql` (Round 11) — favorites table + 3 RLS policies + recency index.

## Round 12 (2026-06-12) — Step 5.7 multi-species (dogs)

Source: CLAUDE.md §13 Test Round 2 item 10. The MVP expands from
cat-only to cat + dog.

### Phase A decisions

- **`pets.species` already exists** since migration 0001 with `default 'cat'`. No new column on the pets side; `createPet` gains an optional species (defaults 'cat') and the existing rows backfill correctly.
- **Species enum is `'cat' | 'dog'`, not a Postgres enum.** Keeping it as a TS union + a check constraint on `text[]` makes adding a third species a code-only change for everything except one ALTER CONSTRAINT.
- **Dog breeds ship without thumbnails in Phase A.** The picker already renders text-only tiles for the existing `unknown` row; reusing that fallback gets the surface working today. Wikipedia-commons thumbnails for dogs come in a follow-up polish round.
- **Species locked on edit.** Switching a pet's species after creation would mismatch its breed AND its vaccination schedule (rabies + FVRCP is cat-only — dogs have a different shot set). The SpeciesPicker `disabled` prop renders both tiles inert in edit mode.

### Phase B decisions

- **`listings.accepts_species text[]` (not two booleans).** Future species (rabbit, bird, etc.) extend without a schema change. GIN-indexed for the `contains` filter.
- **Migration 0034 covers BOTH `listings` AND `listing_drafts`** plus a `CREATE OR REPLACE promote_listing_draft` — mirrors the exact pattern from 0026 (vaccination). A host opting INTO dogs on an already-approved listing has to flow through admin review like any other field edit.
- **Owner-feed filter chip — cat | dog. No "all" chip.** Tapping the active chip clears back to all-species. Same pattern as the existing price-band chips (mutually exclusive, tap-active-to-clear). Saves a row of chrome.
- **Default new listings to `['cat']`.** Existing wedge is female + cats; opting into dogs is an explicit toggle in the form, not a default. Matches the column default in 0034 — host can always add `dog` before first save.
- **Comprehensive i18n sweep deferred to Round 12c.** The pet form, listing form, owner feed filter, species picker, and SpeciesPicker labels are all wired through new species-aware keys (species.cat / species.dog / pets.species_label / listings.form.accepts_species_label). The dozens of cat-specific phrases in older copy (e.g. "أقصى عدد للقطط", "أبحث عن مكان لقطتي", "هذا المضيف يستقبل حتى {count} قطط") stay as-is for now — generalizing them well is its own pass and would balloon this commit.

### Migrations written (Round 12)

- `0034_listings_accepts_species.sql` — listings + listing_drafts columns, check constraints, GIN index on listings.accepts_species, `CREATE OR REPLACE promote_listing_draft` to include the new column in the field-draft → live copy.

---

## Phase 1 (2026-07-05) — Observability (Sentry + PostHog)

First batch of the Pre-Pilot Hardening plan (`docs/systemupdateplan`). Goal:
stop flying blind before real users touch the product. No migration.

### Decisions

- **Sentry SDK: `@sentry/browser`, NOT `@sentry/react-native`** (deviation
  from the plan's literal wording, per engineering judgement + batch rule 4).
  Rationale: the pilot deploys to Vercel (web) and "native app builds" is an
  explicit plan non-goal, so the native wrapper's Metro/config-plugin weight
  buys nothing and its web bundle can't be verified in the headless CC env.
  `@sentry/browser` is the purpose-built web SDK. Native error tracking is a
  post-pilot add when native builds happen.
- **Lazy, guarded imports for both SDKs.** `initSentry()` / `initAnalytics()`
  dynamically `import()` the SDK only when the DSN/key is present AND on web.
  With no key configured (today's state until Omar sets them), the SDKs are
  NEVER imported — a no-key build carries zero observability runtime and can't
  be destabilized by them. tsc still type-checks the dynamic-import targets.
- **`logError` is the Sentry seam.** Extended to forward the underlying Error
  to Sentry in production (`!__DEV__`); DEV still logs to console. Zero
  callsite changes — every existing `logError('[tag]', err)` across the app
  now has error visibility for free.
- **Closed `AnalyticsEvent` union + IDs-only props.** `track()` accepts only
  the 8 funnel events the plan named; event props are scalars/IDs only — no
  names, emails, phones, or free text. Instrumented at the **lib layer**
  (single choke point per event) so every caller is covered once.
- **Identity via `identifyUser(user.id)` on auth.** Wired in the auth session
  lifecycle (identify on session, reset on sign-out). User id is an id, not
  PII, consistent with the ids-only rule.
- **`.env.example` added** documenting all env vars (Supabase + the three new
  observability keys) so the Omar checkpoint is unambiguous.

### ⛔ Omar checkpoint (external, before acceptance can be verified)

1. Create a **Sentry** project (Platform: Browser/JavaScript) → copy its DSN.
2. Create a **PostHog** project → copy the Project API Key (+ note the API host).
3. Put `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST` in local `.env` AND as Vercel
   project env vars (Production + Preview). Redeploy.
4. Smoke: trigger a forced error on the deployed build → confirm it lands in
   Sentry; walk the funnel (view a listing → open inquiry → send message →
   request/accept/complete a booking → leave a review) → confirm the events in
   PostHog.

### Migrations written (Phase 1)

- None. Phase 1 is code-only.

---

## Phase 3 (2026-07-06) — Trust surface batch (0048 written)

Plan: docs/migration-0048-trust-surface-plan.md (approved with D1/D2/D3).

### Decisions

- **D1 applied:** consent checkbox lives on `(auth)/set-password.tsx`,
  signup mode only — both funnels pass it exactly once; reset mode and
  returning users never see it. Submit disabled until checked; the
  stamp write is best-effort (a failure logs, never strands the funnel —
  the stamp is evidence, not the gate).
- **D2 applied:** existing accounts keep `tos_accepted_at = NULL`;
  re-consent prompt is a Business-Track follow-up with the real PDPL text.
- **D3 applied with Strategy's constraint:** `guard_profile_tos_stamp`
  is COLUMN-SCOPED — a `WHEN (old.tos_accepted_at IS DISTINCT FROM
  new.tos_accepted_at)` clause keeps it out of every other profiles
  update entirely; the body checks only that one column (forward-only).
  Deliberately NOT the 0047 whole-row style.
- **Cancellation copy renders from code:** the 48h/50% literals moved to
  exported constants (CANCELLATION_FULL_REFUND_HOURS /
  CANCELLATION_LATE_REFUND_RATE) consumed by both the refund math and
  the i18n placeholders — text can't drift from behavior.
- **OG meta is SITE-WIDE (honest SPA limitation):** per-listing dynamic
  OG needs server rendering — post-pilot follow-up. og:image is built
  from EXPO_PUBLIC_APP_URL at export time (WhatsApp needs absolute
  URLs); documented in .env.example. Brand card generated from the §8
  tokens with the app's own Reem Kufi/Tajawal fonts (public/og-card.png).
- **Legal placeholders are i18n-only swaps:** final PDPL/ToS text
  replaces locale strings — zero code changes. /privacy ships the
  required analytics-disclosure section (PostHog, anonymous IDs,
  purpose, Sentry, no message contents).

### Migrations written (Phase 3)

- `0048_tos_accepted_at.sql` — profiles.tos_accepted_at + column-scoped
  forward-only guard + verification block. WRITTEN, not applied; Omar
  applies after Strategy's SQL review. Independent of 0049 (either first).

### ⛔ Omar checkpoint

Apply 0048 → verifications → log in migration-apply-log.md. Smoke both
signup funnels (checkbox blocks; tos_accepted_at populated for the new
user). Set EXPO_PUBLIC_APP_URL in .env + Vercel, redeploy, share a link
to yourself on WhatsApp → brand unfurl card.

---

## UX decisions parked for pilot data (2026-07-06)

### 📥 pending-requests badge vs 🔔 bell — one badge or two?

**Status: KEEP BOTH through the pilot** (Strategy decision 2026-07-06 —
**supersedes** the migration-0047 plan doc's D5 "keep one release, then
absorb" assumption).

**Rationale:** post-thread-open-sweep, the two badges' semantics
diverged and are no longer redundant:
- 🔔 bell clears on **READ** (the thread-open notification sweep marks
  its rows read).
- 📥 pending-requests clears on **DECIDE** (accept/decline flips the
  booking out of `requested`).

The read-vs-act gap means 📥 is the **only** "you have undecided work"
signal once a host has opened a request without deciding on it. Response
rate is a core liquidity metric, so we don't remove the action counter
for aesthetics.

**Decide with pilot data:** PostHog `$pageview` on `/notifications` vs.
the reservations screen + a time-to-decide funnel
(`booking_requested` → `booking_accepted`/`booking_declined`). If hosts
act from 🔔, retire 📥; if 📥 drives accepts, keep it — possibly expand
it into a general "action needed" counter.

## PostHog/Sentry observability go-live (2026-07-08)

- **Root cause of the "PostHog never initializes" saga was a STALE VERCEL DEPLOY, not code.** Env vars, `app.config.ts` plumbing, and the init code were all correct throughout. Vercel was serving an old build; a genuine git-sourced deployment of the latest commit brought PostHog + Sentry live (confirmed: real Web-vitals events in PostHog Activity, `__SENTRY__` defined). Lesson: `Redeploy` reuses the cached artifact — force a fresh build with a real new commit, and verify the Production alias points at the newest deployment.
- **`window.posthog` is a FALSE diagnostic signal — never use it as a health check.** The npm-module build of posthog-js does NOT populate `window.posthog` (snippet-loader-only behavior); it stays `undefined` even when `capture()` works. This wrongly implied init was failing and cost a debug round. Verify PostHog via the dashboard Activity feed (or the module-level `posthog` var in `analytics.ts`), never a `window` global. Pinned as a code comment at `analytics.ts` `let posthog`.
- **SPA-rewrite-swallows-the-chunk theory: formally dead.** The runtime `import('posthog-js')` RESOLVED on the phone; no `vercel.json` change was needed.

## Realtime channel discipline (2026-07-10 — mandatory for all future channels)

Locked after the inquiry-timeline channel-collision crash (fixed in
`6eb29a3`; latent from Jul 8, armed the moment the realtime publication
went live). Every Supabase realtime subscription in this codebase MUST
follow all three rules:

1. **Effect deps = topic identity ONLY** (the ids that name the channel —
   e.g. `[bookingId]`, `[id, linkedBookingIdsKey]`, `[user?.id]`). Never
   put a refetch/callback the handler itself calls into the deps — a
   handler-triggered state change then re-runs the effect mid-flight.
2. **Handlers read the latest callback via a ref** (`ref.current = fn`
   each render; handler calls `ref.current()`), so callbacks stay fresh
   without being deps.
3. **Teardown via `supabase.removeChannel(channel)` — never bare
   `channel.unsubscribe()`.** Bare unsubscribe leaves the topic in the
   client registry, so the next `supabase.channel(<same topic>)` collides
   with the stale instance and throws.

All three existing channels (`useMessages`, inquiry timeline,
host-notifications) conform as of `6eb29a3`. New channels copy that
pattern verbatim.

## RTL horizontal paging on web (2026-07-11 — rule for all carousels)

Locked after the Part A carousel fixes (two prod repros: dead arrows +
index desync on the listing hero; blank photo on the host-home card).
**Never do LTR offset math against an RTL-laid-out strip.** Browsers
disagree about RTL scroll geometry (negative vs reverse scrollLeft
models), so:

1. **Scroll-based paging** (PhotoGallery): force the strip to LTR
   geometry (`style direction:'ltr'`) and render items in RAW order —
   reversed under RTL — so all offsets stay positive LTR math. Map
   logical↔raw via `src/lib/carousel-paging.ts` (`logicalToRaw`,
   `offsetForLogical`, `rawPageFromOffset`).
2. **Transform-strip paging** (ListingPhotoCarousel): keep logical
   order and flip the translate SIGN (`stripTranslateX`): a flex row
   under RTL right-aligns, so revealing photo i slides the strip
   RIGHT (+i·W), never left.
3. **Index state derives from position, never optimistically** — from
   normalized scroll events (scroll paging) or is the transform input
   itself (strip paging). No setIndex-then-hope.
4. **Arrows are logical, not physical**: next sits where the next
   photo enters from (LEFT under RTL), via nextArrowSide/prevArrowSide
   + the shared 44pt CarouselArrow. Swipe direction flips via
   swipeTarget.

The pure math is vitest-pinned (tests/carousel-paging.test.ts) in both
directions so LTR can't regress while fixing RTL.

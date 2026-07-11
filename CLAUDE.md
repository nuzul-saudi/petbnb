# CLAUDE.md — Project Build Specification
## Petbnb — Saudi Pet Care Marketplace (MVP)

> This file is the single source of truth for Claude Code. Read this fully before writing any code. Do not deviate from the architecture or scope without explicit instruction. The founder is NOT a deep technical expert — explain decisions in plain language, go one step at a time, and never assume prior knowledge.
>
> NOTE ON NAME: "Petbnb" is the working/codebase name. The public brand name is not finalized (pending Saudi trademark check + an Arabic brand name). Use "Petbnb" throughout code, folder, and config for now.

---

## 0. What we are building (one paragraph)

A two-sided mobile marketplace for Saudi Arabia connecting cat owners with verified hosts who board pets in their own homes (Airbnb-style), plus add-on services (grooming, vet, transport) and a facilitation-only product marketplace. Arabic-first, RTL, mobile-first. This is an MVP to validate the model with the first ~100 bookings in one Riyadh neighborhood — NOT a scaled production system. Prioritize working core flows over feature completeness.

---

## Scope clarification (post-prototype review, 2026-05-26)

A long-term-vision prototype surfaced a multi-service pet super-app (hosting,
vet, grooming, transport, store, insurance, records, consultation). After
review with the founder, we agreed:

- **MVP = hosting wedge only.** The current build (Steps 1–10) ships hosting
  exclusively. The other seven services are post-launch.
- **Prototype = North Star, not roadmap.** Its visual language (warm sand,
  moss, gold, generous spacing) is the design target. Its scope is the
  1–2 year horizon.
- **Hub-style home with "قريباً" tiles** for the other seven services is a
  Phase 2 polish task — listed in Section 11.
- **Female-trust positioning is the wedge.** Every early host is personally
  vetted by the founder. This is why Step 4.5 introduces the `admin` role
  and the admin dashboard *before* Step 5 resumes.

---

## 1. Working with a non-technical founder (READ THIS CAREFULLY)

- The founder has done light technical work before but is NOT an engineer.
- After EVERY step: explain in plain language what you did, why, and what the founder should see on screen.
- Before installing anything or running commands, tell the founder exactly what to type and what should happen.
- If something fails, do not dump raw errors — explain what went wrong in plain words and the fix.
- Never proceed past a numbered build step without the founder confirming "it works, continue."
- When the founder must act outside the code (create a Supabase account, get a key, etc.), give numbered click-by-click instructions.

---

## 2. Tech stack (do not substitute without asking)

- **Framework:** Expo (React Native) with Expo Router. One codebase → iOS, Android, Web.
- **Language:** TypeScript (strict mode).
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security).
  - Use the NEW Supabase API keys (`sb_publishable_...`), not legacy `anon` keys.
  - Config in `app.config.ts` via `extra`, injected from `.env`. Never commit `.env`.
- **Auth:** Supabase **Phone (SMS OTP) authentication** for Saudi mobile numbers (+966). This REPLACES Nafath for the MVP. Nafath is explicitly out of scope. Keep a `nafath_verified` boolean in the profile for the future, default false; build no Nafath flow.
- **Payments:** Mock/stub only. Architect a `PaymentProvider` interface so Moyasar/HyperPay (mada, STC Pay, Apple Pay) can be added later. Do NOT integrate real payments.
- **State:** React Context for auth/session; TanStack Query for server state.
- **Styling:** Single theme file with the tokens in Section 8. RTL by default.
- **i18n:** All user-facing strings in an `ar` locale file from day one. No hardcoded strings in components. Structure for future `en`.

---

## 3. Build order (STRICT — one at a time, confirm each before next)

1. Project scaffold + run it blank on web + Arabic/RTL + theme + i18n skeleton
2. Supabase project connection + `.env` + client helper (founder creates the Supabase project — give instructions)
3. Database schema + Row Level Security (Section 5)
4. Auth: email → OTP → set password → set name → owner home. (Saudi phone OTP is the pre-launch swap — Section 11. The current `(auth)/sign-in.tsx → verify.tsx → set-password.tsx → name.tsx` funnel always creates an OWNER account; host signup is a separate funnel — Step 4.6.)
4.5. **Admin role + admin dashboard.** Extends `profiles.role` with `'admin'`, adds `is_verified` (host trust badge) and `is_suspended` (account block) columns. Builds an admin dashboard for the founder to personally vet every early host. Must land before Step 5.
4.6. **Host signup funnel + application flow** (shipped 2026-06-16 / migration 0039). Replaces the in-flight "role picker at signup" model. Two account types separated at the email level — same email cannot create both an owner and a host account. Host signup is the only path through `/become-host` → `/sign-in?flow=host` → multi-field application → admin approval → post-approval profile completion (bio + pictures + Nafath stub) → listing creation unlocked. Hosts can book stays without approval — only listing creation is gated. See Section 12 for the lifecycle. The previous `'both'` role + persona-toggle UI was removed by 0039.
5. Owner flow: browse Riyadh hosts → host detail with home photo gallery → request booking + optional add-on → confirmation (mock payment). Feed gates on `listings.status='approved'` + host `is_verified=true` + host `is_suspended=false`.
6. Check-in / check-out condition report flow (CRITICAL — Section 6)
7. Host flow: create listing + upload home gallery photos + accept/decline requests + post daily updates. Self-registered listings default to `status='pending'` and enter the admin approval queue (Step 4.5).
8. Bookings list + status tracking + profile/settings expansion (pickup/dropoff coordination, emergency vet contact — see Section 13 items i, j)
9. Basic in-app messaging (owner ↔ host)
10. Marketplace screen (display only — products + "sold by X" label, NO cart/checkout)

STOP after each numbered item. Run it. Show the founder. Wait for "continue."

---

## 4. Scope discipline (do NOT build these in MVP)

Even if useful: real payments, real insurance, Nafath, push notifications, merchandise cart/checkout, multi-city, dogs, ratings algorithm (auto-scoring/weighting), subscriptions/wellness plans. If you think something out of scope is needed, ASK first.

(Admin dashboard was previously out of scope but moved IN-scope by Step 4.5 — see Scope clarification above. Founder personally vets early hosts; this is the female-trust wedge.)

**Since-built / since-decided (no longer "do NOT build" — see §11 + §13):**
- **Reviews are SHIPPED** — simple 1–5 stars + `text_ar`, two-way, immutable (R2C6), including written-review surfacing on the listing detail (2026-07-02). What stays out is any *ratings algorithm* (auto weighting/promotion), not reviews themselves.
- **Cancellation-policy math is BUILT** (full/50%/none tiers, Riyadh-midnight anchored) in `src/lib/payments-policy.ts`. **Commission split is DECIDED + BUILT** (15% host + 5% owner) in the same file. Only *real charging* stays out — the mock `PaymentProvider` moves no money until the merchant account lands.
- **Dogs:** the founder DECIDED to launch cats + dogs (Step 5.7) but it is not built yet — **decided, pending** (schema-ready via `pets.species` + `listings.accepts_species`, gated behind `SPECIES_ENABLED=false`).

---

## 5. Data model (core tables, RLS ON for every table)

- **profiles**: id (uuid fk auth.users), full_name, full_name_en (nullable), phone, role (`owner`|`host`|`admin` — `'both'` was dropped by migration 0039), avatar_url, created_at, locale (`'ar'`|`'en'`, default `'ar'`), nafath_verified (bool default false — Nafath UI is stubbed behind a feature flag in `/become-host/complete-profile`), id_document_url (nullable, future), is_verified (bool default false — flipped true when admin approves host application), is_suspended (bool default false — admin blocks abusers from writes).
  - **Host application fields (0039)**: host_application_status (`pending`|`approved`|`rejected`|null — null for owners), host_application_submitted_at, host_application_reviewed_at, host_application_reviewer_id (admin who acted), host_application_admin_notes (rejection reason shown to applicant), host_gender (`female`|`male` — collected at apply time), host_city, host_neighborhood, host_pet_type_accepted (`cats`|`dogs`|`cats_and_dogs` — `cats` only for MVP; dogs gated behind `SPECIES_ENABLED`), host_experience_years (int nullable), host_bio_ar (collected at post-approval profile-completion step), host_profile_complete (bool default false — listing creation RLS requires true).
- **pets**: id, owner_id, name, species (default 'cat'), breed, age_months, vaccination_doc_url, behavioral_notes, photo_url
- **listings**: id, host_id, title_ar, description_ar, neighborhood, nightly_price_sar, max_concurrent_pets, has_resident_pets (bool), resident_pets_note, status (`pending`|`approved`|`paused`|`admin_disabled` — replaced `is_active` in migration 0021/0024), tier (`bronze`|`silver`|`gold` default bronze), offers_grooming (bool default false), host_gender (`female`|`male`)
- **listing_photos**: id, listing_id, photo_url, sort_order  (THE AIRBNB-STYLE HOME GALLERY)
- **bookings**: id, listing_id, owner_id, pet_id, start_date, end_date, nights, base_price_sar, addons_total_sar, total_sar, status (`requested`|`accepted`|`declined`|`active`|`completed`|`cancelled`|`disputed`), created_at. **Payment snapshot (0028):** owner_fee_sar, host_fee_sar, total_charged_sar, payout_sar, payout_status (`held`|`released`|null), paid_at, cancelled_at, refund_sar (all nullable; set at host-accept / completion / cancel). **Read tracking (0044):** owner_last_opened_at, host_last_opened_at (nullable; forward-only via `mark_thread_read` RPC). **β thread continuity (0046):** inquiry_id (nullable fk inquiries, ON DELETE SET NULL — links a booking back to the inquiry it grew from) + status-transition timestamps accepted_at / declined_at / active_at / completed_at / disputed_at, stamped by the `guard_booking_status_stamp` BEFORE UPDATE trigger (first-time-wins; `cancelled_at` deliberately excluded — owned by the 0028 cancel path).
- **booking_addons**: id, booking_id, type (`grooming`|`vet`|`transport`|`insurance`), provider_label, price_sar
- **condition_reports**: id, booking_id, phase (`check_in`|`check_out`), reporter_id, weight_note, health_notes, behavior_notes, photos (jsonb url array), created_at  (Section 6)
- **daily_updates**: id, booking_id, host_id, photos (jsonb array), video_url (nullable), note_ar, created_at
- **messages**: id, booking_id (nullable), inquiry_id (nullable, 0040), sender_id, body (nullable since 0044 — nulled on soft-delete; a CHECK requires non-null non-empty body while `deleted_at IS NULL`), created_at, deleted_at (nullable, 0044 soft-delete marker; once set the row is immutable). A message references exactly one of booking_id / inquiry_id (CHECK constraint).
- **inquiries** (0040 — pre-booking trust threads): id, listing_id, starter_id (the owner), host_id, status (`open`|`converted`|`closed` enum — but see model note below: live rows stay `open` in perpetuity), created_at, updated_at, last_message_at (nullable), starter_last_opened_at / host_last_opened_at (nullable read-tracking, 0044). Fetch-or-create on "Message host" via the `(listing_id, starter_id)` partial-unique index `WHERE status='open'`.
- **reviews**: id, booking_id, rater_id, ratee_id, stars (1–5), text_ar, created_at
- **products** (display only): id, name_ar, seller_name, brand, price_sar, category, image_url, is_halal_certified (bool)

**Messaging model (0040–0046 arc, shipped through 0046 / 2026-06-30).**
Two thread kinds share the `messages` table: booking-scoped (`booking_id`)
and pre-booking inquiries (`inquiry_id`). Key behaviors:
- **Pre-booking inquiries (0040):** an owner can "Message host" from the
  listing detail before committing — the trust conversation that should
  precede handing over a pet. One inquiry per `(listing, starter)`.
- **Delete-until-read (0044):** a sender can soft-delete their own message
  (`deleted_at` set, `body` nulled) only until the other party has opened
  the thread; per-thread read tracking via the `*_last_opened_at` columns
  + `mark_thread_read` RPC.
- **Inquiry-as-comprehensive-timeline (0046, "β model"):** once a booking
  grows out of an inquiry (`bookings.inquiry_id`), the booking's messages
  carry back into the same inquiry thread so the whole relationship reads
  as one timeline. Inquiries stay `open` **forever** — 0043 removed the
  close capability and 0046 deliberately never adds "convert", so despite
  the 3-value enum the shipped reality is one perpetual conversation per
  `(listing, starter)`. RLS was unchanged by 0046 (purely additive).

RLS: users read/write only their own rows; a booking is visible to both its owner and the listing's host; approved listings publicly readable. **Listing INSERT (0039)** requires `role='host' AND host_application_status='approved' AND host_profile_complete=true` — pending applicants and approved-but-incomplete hosts cannot create listings even though they can read/update their own profile row.

---

## 6. Check-In Condition Report (HIGHEST PRIORITY FEATURE)

The single most important risk-mitigation feature. Not optional polish.

- At drop-off both owner and host complete a shared report, phase=`check_in`: min 3 photos of the cat, weight note, visible health notes, behavior notes. Both tap "I confirm this is accurate."
- At pickup, same with phase=`check_out`.
- Reports are immutable once submitted (no edit/delete).
- A booking cannot become `active` until a confirmed `check_in` report exists.
- This is the evidence record for disputes. Fast but thorough UX.

---

## 7. Cultural & language requirements (non-negotiable)

- RTL by default. Test every screen in RTL.
- All text in Arabic via i18n. Natural Saudi tone, not stiff MSA.
- **LATIN display digits everywhere** (locked decision, test-round-3 2026-05-27). `toArabicDigits()` in `src/lib/format.ts` is a deliberate no-op pass-through; do NOT reintroduce Arabic-Indic conversion. Rationale: Arabic-Indic digits scan poorly against the Latin digits Saudis see in WhatsApp / Snap / banking apps. Pinned by a regression test in `tests/format.test.ts` since 2026-06-26 — flipping this needs a founder re-decision + that test rewritten in the same PR.
- Currency always "ر.س", never "$".
- `host_gender` on listings + owner filter "female hosts only" (real feature).
- Saudi phone format +966 5X XXX XXXX in the auth flow.
- Fonts: Tajawal (body), Reem Kufi (headings) via expo-font.
- Stub `notificationsAllowed()` helper (future prayer-time awareness) — leave the seam.

---

## 8. Design tokens (use exactly these)

```
--sand: #F5EFE6   --cream: #FAF6EE   --paper: #FFFCF5
--ink: #1F2A1D    --ink-soft: #3D4A3A
--moss: #2D4A2F   --moss-deep: #1A3018   --moss-light: #4A6B4A
--gold: #C4A464   --gold-deep: #8C7340
--terracotta: #B45842   --rose: #D49389   --whisper: #E8DFCC
```
Warm, premium, trust-conveying. Deep moss green primary, sand/cream backgrounds, gold accents. NOT bright/cartoonish. Rounded corners 16–22px, soft shadows, generous spacing.

**Persona-aware accent.** `useTheme().accent` resolves to `colors.mossDeep` for owner/admin and `colors.goldDeep` for host. Surfaces that should "go gold in host mode" (host name, price, section pills, success states) pass `theme.accent` as an inline style override on top of the static StyleSheet color. Static styles still ship `colors.mossDeep` as a defensive fallback (would only render if the theme provider failed to mount).

**Trust-mark exception — `colors.verified`.** Pinned to `#2D4A2F` (moss) in BOTH personas via a dedicated token alias in `src/theme/tokens.ts`. Used for the verified ✓ next to host names. Do NOT replace with `theme.accent` — the trust mark must read as "platform-verified by Petbnb" and not as a persona accent (a gold ✓ in host mode would suggest the host verified themselves, defeating the trust signal). Added 2026-06-26 in commit `7f67c79` as part of the design-review batch.

---

## 9. Engineering principles

- Small reviewable commits, one feature each.
- TypeScript strict; no `any` without a justifying comment.
- Every Supabase call in try/catch with a friendly Arabic error message.
- Loading + empty states on every screen — never a blank screen.
- `.env` + `.gitignore` from the very first commit. No secrets in code.
- Comment the "why", not the "what".
- After each step: run on web preview, confirm, summarize changes + next step. Do not batch features.

---

## 10. Definition of done (the entire MVP)

A test user can: sign up with a Saudi phone number via SMS code → browse Riyadh hosts → open a host with a home photo gallery → request a booking with one add-on → (as host) accept it → both complete a check-in condition report → host posts a daily update → owner sees it → both complete check-out → both leave a review. All in Arabic, RTL, on web + one mobile platform. Nothing more until that works end to end.

---

## 11. Pre-launch tasks (do NOT skip before going live)

These are deferred from MVP build but MUST land before public launch. Each one
has a specific reason it's safe to defer during build but unsafe to defer at
launch.

> **SHIPPED 2026-06 (Step 6 + Step 8):** check-in/check-out condition reports
> (Section 6) and the listings status + two-copy edit model (Step 8) are now
> live in `main`. The two-copy model replaces the earlier "saving a live edit
> flips it back to pending" gate from 7.5 — host edits now create an invisible
> draft, public sees the live copy, admin approves the draft via the queue.
> Status is the 4-state column `pending/approved/paused/admin_disabled` with a
> DB-level transition guard (migration 0025). is_active is gone (0024).

> **SHIPPED 2026-06-16 / 0039 (Step 4.6 — host signup funnel):** owner signup
> simplified (email → OTP → password → name → home, no role picker); host
> signup is a separate funnel via the "Become a Host" CTA on the home page
> that any visitor can tap. The funnel collects a 6-field application
> (name + gender + city + neighborhood + pet type + experience), goes to an
> admin review queue, and on approval prompts the host to complete their
> profile (bio + pictures + Nafath stub) before listing creation unlocks.
> Same email cannot create both an owner and a host account — to act as
> both, the user signs out and signs in to the other account. The 'both'
> role + persona toggle were removed.

- **Swap email OTP → Saudi phone OTP.** Step 4 ships with email OTP for dev
  speed. Before launch: enable Supabase Phone Auth, wire a Send SMS Hook (Edge
  Function calling Unifonic or Taqnyat), swap `{email}` for `{phone}` in
  `signInWithOtp` / `verifyOtp`. The E.164 normalizer in `src/lib/phone.ts` is
  pre-staged; see the TODO block at the top of `src/lib/auth.tsx`.
  **Blocker:** requires Saudi CR + CITC alpha sender ID registration
  (multi-day approval).

- **Configure custom SMTP for transactional email.** Supabase's built-in email
  sender is rate-limited to **2 emails per hour per recipient** — fine for dev
  but will break sign-up at any meaningful volume, and any password-reset
  retry will silently fail for an hour. Recommended: Resend (free tier covers
  ~3,000 emails/month, instant signup, no domain verification required for
  their default sending domain). Set in Supabase: Project Settings → Auth →
  SMTP Settings.

- **Payments.** MVP uses a mock `PaymentProvider` (`src/lib/payment.ts`,
  moves no money). **Moyasar is the identified provider** (mada + STC Pay +
  Apple Pay); HyperPay is the fallback. Swap in `MoyasarProvider` before any
  real money moves. **Blocker:** requires the Saudi CR / merchant account
  (multi-day external gate). Note the fee + refund *math* already exists in
  `src/lib/payments-policy.ts` (see the Cancellation + Service-fee items
  below) — only the real gateway + server-side charging is missing.

- **Nafath ID verification for hosts.** `profiles.nafath_verified` ships as a
  `false` default. The post-approval profile-completion screen at
  `/become-host/complete-profile` already renders a Nafath stub block behind
  a local `NAFATH_ENABLED = false` flag — flip the flag, wire the verifier,
  and gate `host_profile_complete = true` on Nafath success before launch.

- **Push notifications + prayer-time awareness.** The `notificationsAllowed()`
  helper stub exists; wire to expo-notifications and add the prayer-time
  silence window.

- **Real insurance integration.** The `insurance` booking-addon type is a
  placeholder; partner with a Saudi insurer before launch.

- **Hub-style home with "قريباً" tiles for the other 7 services** (vet,
  grooming, transport, store, insurance, records, consultation). Phase 2
  polish — the prototype's grid of service tiles, with the deferred ones
  showing a "coming soon" overlay. Does not block launch but is the path
  to expanding from hosting wedge → super-app.

- **Cancellation policy. — SHIPPED (math), real charging pending.** A
  single platform-wide policy is BUILT in `src/lib/payments-policy.ts`:
  **full refund ≥48h before start / 50% <48h / none on-or-after start**,
  anchored to **Asia/Riyadh midnight** (UTC+3, no DST) and computed on
  `total_charged_sar` (whole SAR via `Math.round`). The per-sitter
  flexible/moderate/strict (Rover) model was NOT chosen — one policy for
  everyone. **Still pending:** the tier is computed client-side today
  (spoofable); pre-launch it must be recomputed server-side via a Postgres
  RPC using `now()`, and it only bites once real charging exists (mock
  provider moves no money). Unit-tested incl. the 01:30 Riyadh boundary in
  `tests/payments-policy.test.ts`.

- **Service fee model. — DECIDED + BUILT (math), real charging pending.**
  Commission is LOCKED and implemented in `src/lib/payments-policy.ts`:
  **15% host-fee** (`HOST_FEE_RATE`, deducted from total before payout) +
  **5% owner-fee** (`OWNER_SERVICE_FEE_RATE`, added on top of total), both
  whole-SAR via `Math.round` and snapshotted onto the booking at
  host-accept (`owner_fee_sar` / `host_fee_sar` / `payout_sar` /
  `total_charged_sar`). No longer "mock charges 0%" — the fee columns are
  populated. **Still pending:** the numbers only move real money once the
  gateway (Payments item above) is wired.

- **Completed-bookings counter visible across users.**
  `countCompletedBookingsForHost()` in `src/lib/listings.ts` returns 0
  when the viewer isn't the host of the listing, because bookings RLS
  restricts SELECT to the booking owner / listing host / admin. For MVP
  this is fine (no completed bookings exist, every host shows "جديد").
  Before real completions ship (post-Step 10 reviews), pick one of:
  (a) `SECURITY DEFINER` RPC returning the count, bypassing RLS, OR
  (b) Denormalized `completed_bookings_count` column on `profiles`,
  updated via Postgres trigger on `bookings.status` transitions.
  Lean toward (b) — cheaper at read time, single source of truth,
  matches how Rover/Airbnb track host stats. See JSDoc on the helper
  for context.

- **Listing tier criteria (bronze / silver / gold).** The `listings.tier`
  enum exists (default `bronze`) and ListingCard renders a Silver/Gold
  overlay; Bronze stays unbadged so it reads as "default" rather than
  "rank 3 of 3". Today the tier is set MANUALLY by admin on the listing
  detail screen (`src/app/admin/listings/[id].tsx` — `setTier` state) —
  no defined criteria, no scoring logic. Pre-launch decisions needed:
  (a) what earns silver vs gold — e.g. completed-booking count, average
  rating, repeat-customer share, host tenure — and (b) whether tiers
  stay a manual admin lever (current behavior) or become auto-promoted
  by an algorithm that runs on `bookings.status` transitions /
  `reviews` inserts. Affects every listing card across the owner feed.

- **Message anti-leakage policy.** Messaging ships with a SOFT nudge:
  `containsContactInfo(body)` in `src/lib/messages.ts` matches Saudi
  phone formats (Latin + Arabic-Indic digits), email shape, and the
  WhatsApp / Telegram / Snap / Instagram / email keyword list in
  English and Arabic transliterations. On match, the compose `onSend`
  in `src/app/bookings/[id].tsx` shows
  `confirmDialog(t('messages.contact_warning'))` — if the user
  confirms, the message still sends. This protects platform
  commission lightly; observed-and-sent leaks remain possible.
  Pre-launch decision: stay at SOFT nudge or escalate to HARD
  block-and-rephrase. Recommendation is to spot-check message logs
  via admin first (no current admin UI for this — would need a small
  message-search screen) and decide based on observed leak rate.
  Escalation is mechanical — change the call site from
  "confirm and send" to "block until rephrased" using the same
  regex. False positives are the real risk; tightening too early
  frustrates legitimate conversations.

- **Pre-booking inquiry path. — ✅ SHIPPED (0040–0046).** This was the
  Round 5b / Step 9.5 gap: messaging used to be BOOKING-SCOPED ONLY
  (`messages.booking_id` NOT NULL since 0001), so no thread could exist
  before an owner committed to a booking. Now built: the `inquiries`
  parent table + nullable `messages.inquiry_id` + a CHECK enforcing
  exactly one of `booking_id` / `inquiry_id` per row (0040), a
  "Message host" CTA on the listing detail, and an `/inquiries` inbox.
  Follow-on migrations completed the arc — 0043 removed the archive/close
  path, 0044 added delete-until-read + per-thread read tracking, and 0046
  made an inquiry the comprehensive timeline that a booking grows out of
  (`bookings.inquiry_id`; inquiries stay `open` forever). Design trail in
  [`docs/round-5b-inquiry-plan.md`](./docs/round-5b-inquiry-plan.md) +
  [`docs/migration-0046-beta-thread-continuity-plan.md`](./docs/migration-0046-beta-thread-continuity-plan.md).
  **Still pending for launch:** anti-leakage stays at the SOFT nudge
  (see the item above) and pre-booking remains the highest-priority
  surface for admin spot-checks — pre-booking is where commission leaks.

- **DateField → RangeCalendar single-mode migration. — ✅ SHIPPED
  (FIX 2 tail, 2026-07-11).** `RangeCalendar` gained a `mode: 'single'
  | 'range'` prop (+ a `maxDate` prop and no-implicit-lower-bound in
  single mode so PAST dates like vaccinations are reachable). New
  `src/components/SingleDateField.tsx` (a date card that opens a
  single-mode `RangeCalendar` modal, Latin-digit display via
  `formatDate`, optional ✕ clear) replaces the old inline input. By
  2026-07-11 the only surviving `DateField` caller was `/pets/[id]`'s
  two vaccination dates (availability had already migrated to a single
  `RangeCalendar`, and `request.tsx` never used it) — those two swapped
  to `SingleDateField` and **`DateField.tsx` is deleted**. One calendar
  component for the whole app. **UX note for the visual pass:** paging
  a month grid back to a far-past vaccination date is more taps than
  the old native date input — acceptable (vaccinations are recent) but
  worth an eyeball; the ✕ clear keeps the field optional.

- **🔍 magnifier emoji on the home search button.** Flagged in
  the Claude Design handoff as off-roster (the rest of the UI is
  emoji-light and uses Reem Kufi typography for visual weight,
  not glyphs). `src/components/SearchHero.tsx:140` still renders
  `🔍`. Replace with an inline SVG (or a vector icon library
  decision) before launch. Comment at line 57 marks the known
  gap. Cosmetic; doesn't block functionality.

- **`KeyboardAvoidingView` around the booking-request sticky
  bar. — ✅ SHIPPED (FIX 5 tail, 2026-07-11).** The ScrollView +
  sticky bar in `src/app/listings/[id]/request.tsx` are now wrapped
  in a `KeyboardAvoidingView` (`behavior='padding'` on iOS;
  `undefined` on web/Android so it's inert and the e2e web build is
  unchanged). This lifts the absolute sticky bar above the keyboard
  when the notes `TextInput` focuses. **Still wants a real-iOS-device
  eyeball** to confirm the chosen behavior (lift-with-keyboard) reads
  right vs. stay-anchored — `padding` is the safe default; flip to
  `position` / add a `keyboardVerticalOffset` if the device test says
  so.

- **Scroll-to-field + red-ring on blocked-date overlap.** Same
  request screen. Today, when the picked date range overlaps a
  host's blocked range, the only signal is that the submit
  Button goes disabled (via `blockedRangeWarning`). No visual
  highlight on the date card, no scroll-into-view. Wire
  `useRef` + `measureInWindow` + an animated border-color on
  the date card so the error has somewhere to look. Owner can
  miss the disabled-button-state otherwise. Logged during
  Round 6 design review.

---

## 12. Roles

Migration 0039 split owner and host into separate account types — same email
cannot create both. The `profiles.role` column has three values (was four;
`'both'` was dropped):

- **`owner`** — signs up via the regular `/sign-in` funnel (email → OTP →
  password → name → home). No approval, no verification. Browses hosts,
  requests bookings, posts in messaging, files condition reports as a
  participant, leaves reviews. **Cannot create listings, ever.** Tapping
  "Become a Host" routes to `/become-host` which shows a notice asking
  them to sign out and create a separate account with a different email.
- **`host`** — signs up only via the "Become a Host" CTA → `/become-host`
  → `/sign-in?flow=host` → email → OTP → password → multi-field
  application form (`/become-host/application`). Goes through the
  `host_application_status` lifecycle below. Booking stays is always
  available on a host account — only listing creation is gated. Hosts
  can accept/decline bookings on their listings, post daily updates,
  file condition reports as a participant, leave reviews.
- **`admin`** — founder vetting account. Sees the admin dashboard as
  their home screen. Can approve/reject host applications via the
  Host Applications queue at `/admin/hosts`, approve/reject listings,
  edit any profile, edit any listing, suspend/unsuspend users.
  Multi-admin permission levels are post-MVP — for now it's binary.

### Host application lifecycle

After a user submits the application form, their profile carries one of
four `host_application_status` values, all gated by RLS and surfaced by
a status panel on `/profile`:

| `host_application_status` | `host_profile_complete` | What the user can do |
|---|---|---|
| `null` (owner) | n/a | Book stays. Cannot list. |
| `pending` | `false` | Book stays. Cannot list. Sees "Application under review" panel. |
| `approved` | `false` | Book stays. Cannot list yet. Sees "Complete your profile" CTA → routes to `/become-host/complete-profile` for bio + pictures + Nafath stub. |
| `approved` | `true` | Book stays AND create listings. Verified pill in feed. |
| `rejected` | `false` | Book stays. Cannot list. Sees rejection notice with admin's reason. May re-apply later. |

Listing INSERT RLS (migration 0039) enforces the gate at the DB layer:
`role='host' AND host_application_status='approved' AND host_profile_complete=true`.
The UI mirrors this — `/listings/new` redirects pre-conditions to the
appropriate screen instead of letting the user fill the form and hit a
500.

Suspended users (`profiles.is_suspended = true`) can sign in but see a
dedicated "account suspended" screen instead of their normal home. They
cannot insert listings, bookings, messages, addons, condition reports,
daily updates, or reviews — enforced at the RLS layer via
`public.is_active_user()`.

Verified hosts (`profiles.is_verified = true`) display a verified badge
in the feed. Verification is **not** the visibility gate — that's
`listings.status='approved'`. Admin sets both independently; the
`approveHostApplication()` helper flips both `is_verified=true` AND
`host_application_status='approved'` in one update.

---

## 13. Known gaps from test round 1 (2026-05-27)

> **Current state as of migration 0053 (2026-07-11) — live baseline.**
> Apply state is tracked in [`docs/migration-apply-log.md`](./docs/migration-apply-log.md).
> A full ledger-vs-database audit on **2026-07-11** confirmed **prod
> conforms to the migration ledger**, with the SOLE delta being **0049**
> (written-not-applied by design — Phase 2b email runbook). 0050 / 0051 /
> 0052 / 0053 are all applied + verified; **0034** was the only historical
> phantom (its `listing_drafts` half never ran) and has been repaired
> (0052 + manual gap blocks). See
> [`docs/audit-2026-07-11.md`](./docs/audit-2026-07-11.md). Since this
> section's early rounds:
> Steps 1–10 core flows, condition reports (Step 6), listings status +
> two-copy edit (Step 8), the host-signup funnel (Step 4.6 / 0039),
> two-way reviews + written-review surfacing (R2C6 + 2026-07-02), and the
> full pre-booking → booking messaging arc (inquiries 0040, per-host
> service offers 0041–0042, archive removal 0043, delete-until-read +
> read-tracking 0044, role-aware listing access 0045, β thread continuity
> 0046) are all SHIPPED. Commission (15%+5%) and the single-tier
> cancellation policy are DECIDED + built as pure math (§11) — only real
> charging is pending. Reading below: treat the round-by-round entries as
> the historical decision trail; where an item says "deferred / to
> decide" cross-check §11 and this note before assuming it's still open.

Surfaced when the founder first browsed the Step 5 owner feed with a
non-developer eye. Items split into "fixed in Step 5.5" and "deferred" —
each deferred item names where it lands and why it's safe to skip for now.

### Fixed in Step 5.5 (post-Step-5 customer polish pass)

1. **Pet profile model.** "My Cats" section in customer profile, with
   name / breed / age / behavioral_notes / medical_needs /
   dietary_restrictions / medications / photo / vaccination doc. Booking
   flow picks from existing pets or adds one inline.
2. **Multi-select addons.** UI changes from radio to checkboxes;
   `booking_addons` was already a child table so no schema change.
3. **Real date-picker UI.** Replaces the free-text date fields, rejects
   past dates, RTL-aware.
4. **"My Bookings" screen.** Accessible from customer home, shows all
   bookings with status badges, taps through to the existing
   `/bookings/[id]` screen.
5. **Customer profile screen.** View + edit name, view/edit pets list,
   role switcher reusing the Step 4 RoleEditor (extracted to a shared
   component in Step 5.5).
6. **Listing card refactor — sitter-first framing.** Avatar + name +
   verified ✓ + tier + neighborhood up top; home photo as secondary
   evidence. Mirrored as a light header rearrangement on the listing
   detail screen. Hosts with no completed bookings show a "جديد" badge
   instead of fabricated stats — no fake numbers.

### Deferred — with rationale and target step

| # | Gap | Lands in | Why deferred |
|---|-----|----------|--------------|
| a | Booking type variants (overnight / day-care / hourly). `bookings` needs `booking_type` enum + start_time/end_time; per-listing pricing needs hourly_rate/daycare_rate. | Step 5.6 (day-care); hourly indefinite | MVP target is overnight cat boarding; day-care is common in KSA but adds significant schema/UI scope. Hourly sitting is rare for cats. |
| b | Cancellation policy — flexible/moderate/strict per sitter vs single platform-wide. | ✅ DECIDED + built (math) | Single platform-wide policy chosen: full ≥48h / 50% <48h / none on-or-after, Riyadh-midnight anchored, in `src/lib/payments-policy.ts`. Only server-side recompute + real charging pending — see §11. |
| c | Sitter availability calendar — per-listing available/blocked days. | Step 7 | Belongs in the host flow; today every listing is bookable any time. |
| d | Daily photo updates during stay. | Step 7 | Lives where host listing creation lives — host needs to be set up before they can post updates. |
| e | Messaging (owner ↔ sitter). | Step 9 | Already in build order. Critical pre-booking comms; nobody books without messaging first. |
| f | Reviews / two-way ratings after completed stay. | Step 10 | Already in build order. |
| g | Service fee — Petbnb's cut per booking. | ✅ DECIDED + built (math) | Locked at 15% host + 5% owner, in `src/lib/payments-policy.ts`, snapshotted onto bookings at accept. Only real charging pending — see §11. |
| h | Insurance partnership. | Section 11 | Need a real Saudi insurance partner before the `تأمين` addon can sell. |
| i | Pickup / dropoff coordination — address on profile + drop-off method per booking. | Step 8 expansion | Folds with profile/settings expansion (Step 8 renamed to "Bookings list + status tracking + profile/settings expansion"). |
| j | Emergency vet contact — preferred vet + emergency phone on profile. | Step 8 expansion | Same as above. |
| k | Photo requirements for listings — mandatory categories (sleeping area, etc.). | Step 7 | Quality lever for host listings; lives where listing creation lives. |
| l | Pet temperament tagging. | Parked indefinitely | Nice-to-have; not MVP. |
| m | Family / household considerations — multi-occupant Saudi homes, who counts as "verified". | Open — investigate during first 5 host interviews | Unresolved spec question; can't write code against an unknown answer. |

### Test round 2 — 2026-05-27 evening

Surfaced when the founder smoke-tested Step 5.5 (sitter-first cards,
customer profile, pet management, My Bookings). Items grouped by size:
route/UI bugs land in the next session's opening batch; product features
go to Step 5.6 (small fixes), with one item promoted to Step 5.7 because
of its breadth.

**Route / UI bugs — fix in next session's opening batch:**

1. **Booking flow has no back button.** Browser back is brittle. Add a
   header back chevron or `← العودة إلى الإعلان` link on each step of
   the request flow.
2. **Sweep for raw English error keys in catch blocks.** The
   `load_failed` symptom on `/bookings` was partially fixed in the
   route-bug patch; other screens may have the same pattern (catch
   blocks displaying `e.message` instead of a translated user-facing
   message). One-pass audit of every screen's error rendering.
3. **Booking confirmation shows only `addons[0]` instead of all addons.**
   Self-flagged in the Phase 5.5C report; promote to actual fix — map
   across `booking.addons` in the summary card.

**Product features — Step 5.6 (small fixes batch):**

4. **Pet selection in booking flow uses existing pets, not inline
   create.** Booking screen shows a pet picker with thumbnails; a
   `+ add new pet` button routes to `/pets/new` when none exists.
5. **Multi-pet booking.** Allow selecting multiple pets per booking.
   **Schema change required:** drop `bookings.pet_id` (single FK), add
   junction table `booking_pets(booking_id, pet_id)`. Migration +
   `createBookingRequest` helper update + UI multi-select.
6. **Cat breed picker with thumbnails.** Curated hardcoded list of
   ~10 common breeds (Persian / British Shorthair / Saudi Local /
   Maine Coon / Sphynx / Siamese / Mixed / Unknown). Bundle thumbnails
   in the app (no upload pipeline needed for breed images).
7. **Pet photo upload in "My Cats".** DB column `pets.photo_url` and the
   `pet-photos` storage bucket already exist with RLS — just need image
   picker integration + upload helper + display.
8. **Calendar UX polish.** After picking arrival date in the booking
   request, auto-advance focus to the departure-date picker.
9. **Location / proximity / map view.**
   - Add `latitude` + `longitude` columns to `listings` (migration).
   - Browser geolocation on web; `react-native-location` (or
     `expo-location`) on native.
   - Show `X.X كم` distance on each listing card.
   - Default sort: nearest first.
   - Optional: toggle between list view and map pin view.

**Product feature — Step 5.7 (Pet-hosting / multi-species expansion):**

10. **Broaden from cat-only to multi-species (dogs at MVP).** Founder
    decided to launch with both cats and dogs. This is a meaningful
    expansion — larger than the Step 5.6 items, hence its own step
    number. Scope:
    - Tagline change: `رعاية القطط في الرياض` →
      `رعاية الحيوانات الأليفة في الرياض`.
    - Full i18n sweep for cat-only language; phrases made species-aware.
    - Species selector in pet creation (cat / dog, default cat). The
      `pets.species` column already exists with `default 'cat'`.
    - Breed picker becomes species-aware — separate cat-breed and
      dog-breed lists with separate thumbnail sets.
    - Listings: hosts choose which species they accept. Add either
      `accepts_species text[]` or two boolean columns
      (`accepts_cats` / `accepts_dogs`) to `listings`.
    - Owner feed filter by species.
    - Listing detail / card icons updated per species.
    - Section 11 cross-check: "تأمين" addon copy and insurance partner
      requirements may differ by species — flag during launch prep.

### Test round 4 — 2026-06-15 / persona-separation (Step 4.6)

Surfaced when the founder reviewed the deployed signup flow and asked
"how does a new host sign up?" The answer was that they couldn't —
the "Become a Host" CTA was owner-only and the destination was a
stub. The same review also surfaced that the existing in-flight
3-way role picker at signup let any new user instantly pick "host"
or "both" with no verification — undercutting the female-trust wedge
that the admin-vetting model in §0 is built around.

Founder decisions (locked):

- **Two account types separated at the email level.** Owner and host
  are different accounts. Same email cannot create both. To act as
  both, the user signs out and signs in to the other account. The
  `'both'` role is gone (migration 0039 drops it from the CHECK
  constraint; existing 'both' users migrated to 'owner').
- **Owner signup is instant — no approval.** Email → OTP → password →
  name → home feed. No role picker.
- **Host signup is the only path through `/become-host`.** Two-stage:
  application (name + gender + city + neighborhood + pet type +
  experience yes/no + years), then post-approval profile completion
  (bio + pictures + Nafath stub). Listing creation gated until both
  stages are done.
- **Booking is universal.** Hosts can book stays without verification —
  only listing creation is gated. The booking RLS is unchanged.
- **Gender is collected at apply time and stays required for hosts.**
  Both male and female allowed (was previously female-trust-positioned
  but never female-only at the schema level). The female-only filter
  on the owner feed remains as a customer-facing choice.
- **Persona toggle removed.** No more "Switch to Owner / Sitter" pill
  in the header. A user IS what they signed up as.

Implementation lives in:
- Migration `0039_host_application_schema.sql`
- `src/app/become-host.tsx` (intro)
- `src/app/become-host/application.tsx` (the form)
- `src/app/become-host/submitted.tsx` (confirmation)
- `src/app/become-host/complete-profile.tsx` (post-approval bio + pics + Nafath stub)
- `src/lib/host-application.ts` (submit/list/approve/reject/markComplete helpers)
- `src/app/admin/hosts.tsx` (review queue, rewritten — was an
  `is_verified=false` filter; now a proper application detail view)
- Profile screen's `HostStatusPanel` (`src/app/profile.tsx`)

### Round 5 review — 2026-06-17 / pre-booking trust gap

Surfaced when the founder reviewed the deployed messaging surface
and asked: "can an owner message a host from the listing page
before committing to a booking request? If not, the trust
conversation only starts after they've already committed — backwards
for 'hand my cat to a stranger.'"

**Audit answer:** no. `messages.booking_id` is NOT NULL since
migration 0001; every `listMessages` / `sendMessage` call requires a
booking id; `MessagesSection` only mounts inside
`src/app/bookings/[id].tsx`. The listing-detail CTAs are "Request
booking" or guest-sign-in only — no "Message host". So the only
trust-building conversation the product supports happens AFTER the
owner has already committed to a booking request. Backwards.

**Decision:** build a pre-booking inquiry path as Round 5b / Step
9.5 BEFORE kicking off the merchant-account application (the
payments work has a multi-day external gate; inquiry path is local
code work — start the long-running one, work on inquiry in parallel).
Without this, the Step 9 messaging product solves only
post-acceptance coordination, not the trust conversation that
should precede the booking.

**Design lives in [`docs/round-5b-inquiry-plan.md`](./docs/round-5b-inquiry-plan.md)** —
covers the existing-state audit of every migration touching
`public.messages` (0001 + 0002 + 0004; nothing else), the
recommended data model (Option A: `inquiries` parent table + a
nullable `messages.inquiry_id` + a CHECK constraint that messages
reference exactly one of `booking_id` or `inquiry_id`), the
migration shape, the RLS design composing with the existing
messages policies, the route + UI layout, the anti-leakage stance
(stay at soft nudge but flag pre-booking as the highest-risk
commission-leak surface), and one OPEN decision left for the
founder: when an inquiry becomes a booking, does the booking thread
start fresh (option α, simpler) or carry the inquiry messages over
(option β, unified UX but cancel-deletion footgun via cascade).
Pre-launch tracking is in Section 11.

### Round 6 — design review batch + iOS Safari layout fix (2026-06-26 → 2026-06-27)

Surfaced when the founder ran the deployed build through a Claude
Design handoff bundle (lives at `docs/design-review-2026-06-26/`).
Six numbered fixes (FIX 1 – FIX 6) + a cleanup pass. Founder
chose **Option C** (all six + cleanup). Mid-batch, a separate
mobile-Safari clipping bug surfaced from a WhatsApp-browser
screenshot — diagnosed as missing `viewport-fit=cover` + flex
chain assuming a static viewport — and got merged into the same
round as the closing commits.

**Locked decisions reaffirmed during this round:**

- **Latin display digits stay locked.** `toArabicDigits()` in
  `src/lib/format.ts` is now PINNED by a regression test
  (`tests/format.test.ts`) asserting it returns its input
  verbatim. Flipping back to Arabic-Indic conversion requires a
  founder re-decision AND that test rewritten in the same PR.
  Already noted in §7; the test is the new enforcement layer.
- **Masculine register stays locked.** No changes — re-confirmed
  during the cleanup audit (commit `b57eba3` updated
  `ONBOARDING.md` from "feminine" to "MASCULINE register (locked
  2026-06-14)").
- **`'both'` role is gone.** Already true post-0039; the cleanup
  removed the stale `OwnerFeedHome` "Owner / both home" header
  comment.

**Outcome by fix:**

| Fix | What | Commit | Status |
|---|---|---|---|
| FIX 1 | Sweep hardcoded `colors.moss` / `mossDeep` → `theme.accent` at host-mode surfaces (ListingCard, listing detail, HostHome, booking detail). Trust mark ✓ pinned via new `colors.verified` alias. Host names render in Reem Kufi (`fonts.headingBold`). | `7f67c79` + `f5b8ccd` | Applied. Static `mossDeep` left in StyleSheet blocks as defensive fallback (inline `theme.accent` always wins). |
| FIX 2 | One date-range picker — delete `AvailabilityCalendar.tsx`; migrate `DateField` callers to `RangeCalendar mode="single"`. | `ca4f48b` + FIX-2-tail 2026-07-11 | **✅ DONE.** AvailabilityCalendar deleted (`ca4f48b`); `RangeCalendar` gained `mode`/`maxDate`; new `SingleDateField` wraps single-mode; the last caller (`/pets/[id]` vaccination dates) migrated and **`DateField.tsx` deleted**. One calendar for the whole app. |
| FIX 3 | New `src/lib/date.ts` owns date math (collapsed `todayIso` / `addDaysIso` / `daysInMonth` / `firstWeekdayOfMonth` from two old homes) and adds `formatDate(iso, locale, style?)` returning Latin-digit display strings. Sweep raw ISO leaks at booking detail + booking list + request flow. Add regression test. | `9d44bfd` | Applied (with one missed leak: `src/app/admin/bookings.tsx:76` still pipes ISO through `toArabicDigits` — admin-only, cosmetic). |
| FIX 4 | Route primary CTAs through the shared `<Button>` component (booking request submit, become-host submit, pet add). Remove hand-rolled `Pressable` + `styles.cta` / `styles.emptyButton`. | `0c184cc` | Applied at 4 sites. 🔍 magnifier emoji on `SearchHero` deferred — needs an SVG/icon-library decision. Tracked in §11. |
| FIX 5 | Sticky booking-summary bar pinned to viewport on the request screen — running total + nights/pets summary + submit `<Button>` on the trailing edge. Top shadow + whisper top border. | `ae44df1` | Sticky bar applied. Scroll-to-field red-ring on blocked-date overlap applied (L4). **`KeyboardAvoidingView` wrapper now SHIPPED (2026-07-11)** — iOS `padding`, web/Android inert; still wants a real-device eyeball on the exact behavior. |
| FIX 6 | Status-aware booking-detail header — IIFE branches glyph + circle color + title key + title color on `booking.status`. Six statuses mapped (requested → ⏳ neutral; accepted/active/completed → ✓ `theme.accent`; declined/cancelled → ✕ terracotta; disputed → ! terracotta). Fixes the previous bug where declined/cancelled/disputed all rendered a celebratory ✓. | `c27db11` | Applied. |
| Cleanup | Rename `src/lib/persona.tsx` → `src/lib/host-notifications.tsx`. Update all import sites. Sync `CLAUDE.md` §7 + `ONBOARDING.md` to the locked Latin-digits + masculine-register state. Drop stale "/ both home" header comment from `OwnerFeedHome` (historical context retained in body). | `b57eba3` | Applied. |

**iOS Safari layout fix (post-design-review, same batch):**

Founder reported via WhatsApp screenshot that the home page on
iOS Safari clipped the CategoryStrip, the filter chip row, and
the bottom of listing cards once the address bar settled. After
diagnosing (no `vh` usage; SafeAreaView present but no
`viewport-fit=cover`; ScrollViewStyleReset's `height: 100%`
chain assumes a static viewport), shipped:

| Commit | What |
|---|---|
| `bdf611b` | `CategoryStrip.tsx` emoji `lineHeight` 26 → 32 (iOS emoji glyph intrinsic heights exceeded 26px). Home `filterChip` `paddingVertical` xs → sm + `filterChipText` explicit `lineHeight: 18` (Arabic descenders ج/ع/ي were dropping below the chip border). |
| `a5086e5` | NEW `src/app/+html.tsx` — Expo Router web-only HTML shell override. Adds `viewport-fit=cover` to the viewport meta so iOS Safari supplies meaningful `env(safe-area-inset-*)`. Inline `<style id="petbnb-viewport-fix">` placed AFTER `ScrollViewStyleReset` to override its `height: 100%` with `height: 100vh; height: 100dvh;` (vh fallback + dvh override). Plus safe-area-aware FlatList bottom padding via `useSafeAreaInsets()` in both OwnerFeedHome and HostHome: `Math.max(insets.bottom, spacing.xxl) + spacing.md`. Verified `react-native-safe-area-context` web implementation does NOT read body env padding so body env() padding would double-pad — deliberately omitted. |
| `914cb9e` | Pin `<SafeAreaView edges={['top','bottom','left','right']}>` explicitly on home — insulates against a future safe-area-context default change. |

**Deferred items from Round 6 — status (all were tracked in §11):**
**all now shipped.** DateField → RangeCalendar single-mode migration
(FIX 2 tail, 2026-07-11 — `DateField.tsx` deleted), magnifier emoji
replacement (`SearchHero` now uses an on-brand label), the
KeyboardAvoidingView around the booking sticky bar (FIX 5 tail,
2026-07-11), and scroll-to-field + red-ring on blocked-date overlap
(L4). None blocked function; the only remaining eyeball items are the
two device/visual validations noted in §11 (the KAV behavior and the
single-date past-navigation UX).

### Review surfacing on listing detail — 2026-07-02 (app-only)

The listing-detail screen (`src/app/listings/[id]/index.tsx`) already
fetched host reviews via `listReviewsForHost(hostId)` into a `reviews`
state, but only rendered the **numeric aggregate pill** (★ avg · count)
in the host card. The written content — star rating + `text_ar` + rater
name + date — was fetched and discarded at the display layer. That
written content is the whole trust payload, so this pass surfaces it.

**Scope was deliberately narrow — app-only. NO schema, NO RLS, NO
migration, NO lib changes.** `createReview` / `listReviewsForHost` /
`findMyReview`, the reviews RLS, and `get_host_ratings` were all left
untouched (they already existed and are verified).

**What shipped:**

- A **Reviews section** on the listing detail (after the amenities
  block), rendered **only when `reviews.length > 0`**. The empty case is
  already covered by the "new host" (`جديد`) badge in the host card, so
  there's no redundant empty state.
- Each review row renders: the star rating (inline filled/empty to 5),
  `text_ar` **only when non-null and non-empty** (many reviews are
  stars-only — those rows render cleanly with no empty text block), the
  rater name, and `created_at` formatted via `formatDate()` from
  `src/lib/date.ts` (`rv.created_at.slice(0, 10)` → medium style, Latin
  digits per the locked decision).
- Newest-first ordering is guaranteed by the existing fetch
  (`order created_at desc, limit 10`); no "show more" for v1.
- New i18n key **`reviews.anon_rater`** (`ar` "مستخدم" / `en` "User",
  masculine register) as the graceful fallback for a null rater name,
  replacing a hardcoded `—`. The section heading keeps the existing
  `listing.section.reviews` key (no redundant duplicate). The now-unused
  `listing.reviews_empty` key was left in place (parity check tolerates
  unreferenced keys).

**Anon-read finding (confirmed, per §5):** guests **DO** see the full
written review list. The authoritative RLS state is `reviews_select_public`
(anon + authenticated, `using(true)`), restored by migration `0030`
under the founder's Option A decision. Note: the JSDoc on
`listReviewsForHost` in `src/lib/reviews.ts` still claims *"Guests (anon)
cannot [read]"* — that comment is **stale/wrong** (predates 0030); left
in place under the no-lib-changes constraint, worth a one-line doc fix
later.

**CI note:** this review-surfacing change adds zero new tsc errors;
i18n parity + all 55 vitest cases pass. It landed on top of the
`fix(ci)` commit that immediately precedes it — that fix removed two
unrelated `TS2578: Unused '@ts-expect-error' directive` errors in
`src/app/inquiries/[id].tsx` (from the prior 0046 messaging work) which
had been failing CI because the workflow runs `tsc` without generating
Expo Router typed-route definitions. With that fix in place, the GitHub
Actions run on the pushed commit is green.

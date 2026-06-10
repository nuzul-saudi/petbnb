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
4. Auth: Saudi phone number → SMS OTP → verify → create profile → choose role (owner/host/both)
4.5. **Admin role + admin dashboard** (added after prototype review — see Scope clarification above). Extends `profiles.role` with `'admin'`, adds `is_verified` (host trust badge) and `is_suspended` (account block) columns. Builds an admin dashboard for the founder to personally vet every early host. **Must land before Step 5 resumes** so the host-vetting workflow is in place when self-signups arrive.
5. Owner flow: browse Riyadh hosts → host detail with home photo gallery → request booking + optional add-on → confirmation (mock payment). Feed filters to `is_active = true` AND host not suspended.
6. Check-in / check-out condition report flow (CRITICAL — Section 6)
7. Host flow: create listing + upload home gallery photos + accept/decline requests + post daily updates. **Self-registered listings default to `is_active = false`** and enter the admin approval queue (Step 4.5).
8. Bookings list + status tracking + profile/settings expansion (pickup/dropoff coordination, emergency vet contact — see Section 13 items i, j)
9. Basic in-app messaging (owner ↔ host)
10. Marketplace screen (display only — products + "sold by X" label, NO cart/checkout)

STOP after each numbered item. Run it. Show the founder. Wait for "continue."

---

## 4. Scope discipline (do NOT build these in MVP)

Even if useful: real payments, real insurance, Nafath, push notifications, merchandise cart/checkout, multi-city, dogs, ratings algorithm (simple 1–5 stars + text only), subscriptions/wellness plans. If you think something out of scope is needed, ASK first.

(Admin dashboard was previously out of scope but moved IN-scope by Step 4.5 — see Scope clarification above. Founder personally vets early hosts; this is the female-trust wedge.)

---

## 5. Data model (core tables, RLS ON for every table)

- **profiles**: id (uuid fk auth.users), full_name, phone, role (`owner`|`host`|`both`|`admin`), avatar_url, created_at, nafath_verified (bool default false), id_document_url (nullable, future), is_verified (bool default false — admin marks hosts trusted), is_suspended (bool default false — admin blocks abusers from writes)
- **pets**: id, owner_id, name, species (default 'cat'), breed, age_months, vaccination_doc_url, behavioral_notes, photo_url
- **listings**: id, host_id, title_ar, description_ar, neighborhood, nightly_price_sar, max_concurrent_pets, has_resident_pets (bool), resident_pets_note, is_active, tier (`bronze`|`silver`|`gold` default bronze), offers_grooming (bool default false), host_gender (`female`|`male`)
- **listing_photos**: id, listing_id, photo_url, sort_order  (THE AIRBNB-STYLE HOME GALLERY)
- **bookings**: id, listing_id, owner_id, pet_id, start_date, end_date, nights, base_price_sar, addons_total_sar, total_sar, status (`requested`|`accepted`|`declined`|`active`|`completed`|`cancelled`|`disputed`), created_at
- **booking_addons**: id, booking_id, type (`grooming`|`vet`|`transport`|`insurance`), provider_label, price_sar
- **condition_reports**: id, booking_id, phase (`check_in`|`check_out`), reporter_id, weight_note, health_notes, behavior_notes, photos (jsonb url array), created_at  (Section 6)
- **daily_updates**: id, booking_id, host_id, photos (jsonb array), video_url (nullable), note_ar, created_at
- **messages**: id, booking_id, sender_id, body, created_at
- **reviews**: id, booking_id, rater_id, ratee_id, stars (1–5), text_ar, created_at
- **products** (display only): id, name_ar, seller_name, brand, price_sar, category, image_url, is_halal_certified (bool)

RLS: users read/write only their own rows; a booking is visible to both its owner and the listing's host; active listings publicly readable.

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
- Arabic-Indic numerals in display where appropriate (helper function).
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

- **Payments.** MVP uses a mock `PaymentProvider`. Swap to Moyasar or
  HyperPay (mada + STC Pay + Apple Pay) before any real money moves.

- **Nafath ID verification for hosts.** `profiles.nafath_verified` ships as a
  `false` default with no UI to set it. Before launch hosts must complete
  Nafath to be listable.

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

- **Cancellation policy.** No policy exists today. Pre-launch decision
  needed: flexible / moderate / strict tiers per sitter (Rover model) or
  a single platform-wide policy (simpler). Affects what we show on the
  listing detail and what we let users do on a confirmed booking. See
  Section 13 for the test-round-1 surfacing.

- **Service fee model.** Decide Petbnb's cut per booking (Rover ~20%,
  Cat in a Flat ~15%, Trusted Housesitters subscription-based). Affects
  every displayed price across the owner feed, detail, and booking flow.
  The mock provider currently charges 0%; pre-launch this must reflect
  reality. See Section 13.

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

---

## 12. Roles

The `profiles.role` column has four values. Each describes both what UI the
user sees on signed-in home and what they can do across the app.

- **`owner`** — has at least one cat needing care. Browses hosts, requests
  bookings, posts in messaging, files condition reports as a participant,
  leaves reviews. Cannot create listings.
- **`host`** — boards cats. Creates listings (pending admin approval),
  accepts/declines bookings, posts daily updates, files condition reports
  as a participant, leaves reviews. Cannot request bookings.
- **`both`** — owner and host simultaneously. Can do everything owners and
  hosts can do. Sees the owner browse feed as their home screen by default
  (host dashboard reached separately).
- **`admin`** — founder vetting account. Sees the admin dashboard as their
  home screen. Can approve/reject host applications, approve/reject
  listings, edit any profile, edit any listing, suspend/unsuspend users.
  Multi-admin permission levels are post-MVP — for now it's binary
  (you're admin or you're not).

Suspended users (`profiles.is_suspended = true`) can sign in but see a
dedicated "account suspended" screen instead of their normal home. They
cannot insert listings, bookings, messages, addons, condition reports,
daily updates, or reviews — enforced at the RLS layer via
`public.is_active_user()`.

Verified hosts (`profiles.is_verified = true`) display a verified badge in
the feed. Verification is **not** gating visibility — that's controlled by
`listings.is_active`. Admin sets both independently.

---

## 13. Known gaps from test round 1 (2026-05-27)

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
| b | Cancellation policy — flexible/moderate/strict per sitter vs single platform-wide. | Section 11 (launch-blocker) | Business decision required first; both models are easy to implement once chosen. |
| c | Sitter availability calendar — per-listing available/blocked days. | Step 7 | Belongs in the host flow; today every listing is bookable any time. |
| d | Daily photo updates during stay. | Step 7 | Lives where host listing creation lives — host needs to be set up before they can post updates. |
| e | Messaging (owner ↔ sitter). | Step 9 | Already in build order. Critical pre-booking comms; nobody books without messaging first. |
| f | Reviews / two-way ratings after completed stay. | Step 10 | Already in build order. |
| g | Service fee — Petbnb's cut per booking. | Section 11 (launch-blocker) | Affects every displayed price; needs founder decision before any UI work. |
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

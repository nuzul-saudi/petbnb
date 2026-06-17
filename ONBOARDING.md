# Petbnb — Onboarding for a Fresh Claude Session

> **You are picking up an in-progress build.** Read this whole document
> before touching code or making suggestions. The authoritative project
> spec is [`CLAUDE.md`](./CLAUDE.md) at the project root — Sections 11
> (pre-launch tasks) and 13 (known gaps from testing) are where most
> "why didn't they just…" questions get answered. Round-by-round decision
> trails live in [`docs/batch-decisions.md`](./docs/batch-decisions.md).

Last refresh: **2026-06-17** (immediately after the host-signup funnel
landed — migration 0039 + the persona-separation refactor — see
§7 "Step 4.6 — host signup funnel" and CLAUDE.md §12).

---

## 0. TL;DR

- **What:** Petbnb is a Saudi Arabia–first, Arabic-language, RTL pet-hosting
  marketplace MVP (Airbnb-for-cats, expanding to dogs in Step 5.7).

- **Stage:** Steps 1 → 8 + Phase 0a-c + Milestones A + B + Stretches S1 + S2
  + Round 1 audit response + Round 2 behavior batch + **Step 4.6 host
  signup funnel (0039)** all SHIPPED. 39 migrations applied through
  `0039_host_application_schema.sql`. 35 vitest unit tests over the
  pure money / pricing / availability / vaccination libraries gate every
  push via GitHub Actions (`.github/workflows/ci.yml`). Step 9 (in-app
  messaging) is the next planned build target.

- **Strategic context the doc-reading Claude should know:**
  - **Saudi pet market is growing fast** — Saudization, rising disposable
    income, social acceptance of cats and (increasingly) dogs as
    household pets. The founder is targeting first-mover advantage in
    structured boarding while the category is still informal.
  - **Competitors:** Anis (KSA-local, host-side weak; less RTL polish),
    PetBacker (multi-country, generic), informal Instagram / WhatsApp
    boarders (the actual large competitor today). Petbnb's wedge is
    **female-trust-first vetting** + Arabic-first UX + admin-approved
    hosts.
  - **Brand name "Petbnb" is provisional.** Saudi trademark check is
    pending and the Arabic brand name isn't finalized. Use "Petbnb" in
    code, folder names, and config until the founder says otherwise —
    don't rename anything preemptively.

- **Locked business decisions** (these have been settled; do NOT propose
  re-litigating without the founder asking):
  - **Commission split:** 5% owner-fee on top of total, 15% host-fee
    deducted before payout. Defined in `src/lib/payments-policy.ts`.
    Round 1 (R1C1) locked the snapshot at whole-SAR via `Math.round`.
  - **Cancellation refund tiers:** ≥48h before start = full refund,
    <48h before start = 50%, on/after start = none. Refund anchored to
    Asia/Riyadh midnight (`T00:00:00+03:00`). Server-side clock is a
    pre-launch milestone (CLAUDE.md §11).
  - **Anon visibility of reviews:** anon visitors CAN read full review
    text (founder choice 2026-06-11, Option A, kept the 0002-era
    `reviews_select_public` policy). Aggregated star rating shows on
    listing cards for both anon and authenticated.
  - **Latin numerals everywhere** in display (test-round-3 founder
    decision). `toArabicDigits` is a deliberate pass-through kept for
    compile compatibility; don't reintroduce Arabic-Indic conversion.
  - **Masculine Arabic register** (2026-06-14 founder decision,
    superseding the earlier feminine register). New strings use
    masculine forms: imperative `سجّل` not `سجّلي`, pronoun `لك`
    not `لكِ`, etc. The `feed.female_filter` ("مضيفات فقط") and
    listing `host_gender` are display labels for gender data and
    stay as-is.
  - **Two account types — owner and host are separate accounts**
    (2026-06-15 founder decision, migration 0039). Same email
    cannot create both. Owner signup is instant (email → OTP →
    password → name → home, no role picker). Host signup is the
    ONLY path through the `/become-host` CTA, goes through a
    multi-field application and admin approval, and a post-approval
    profile-completion step before listing creation unlocks. Hosts
    can book stays without approval — only listing creation is
    gated. The `'both'` role and persona toggle are gone. See
    CLAUDE.md §12 for the full lifecycle.

- **Who built it:** Non-technical founder + Claude (one Strategy + one
  Code instance, see the next section) pairing — sometimes interactively
  step by step, increasingly via unattended batches with explicit
  operating rules.

- **Stack:** Expo (React Native) + TypeScript strict + Supabase
  (Postgres + Auth + Storage + RLS) + Resend (custom SMTP for email OTP)
  + Vitest (unit tests) + GitHub Actions CI.

- **Web-first for development.** Metro starts via `npx expo start --clear`
  and picks its own port — usually 8081, falls back to 8082 if 8081 is
  squatted. Use whichever URL the terminal prints. Open in Chrome
  incognito to bypass stale service workers. **Node 22.x LTS required —
  Node 24 silently breaks Metro's HTTP layer** (see §10).

- **Working style:** strict one-file-per-turn for large writes, `tsc`
  after every edit, explicit commits per phase, no surprise scope
  changes. Unattended batches add: per-piece commits, decision log
  appended at end, migrations WRITTEN not run (founder applies after
  review), tests + i18n parity green at every commit.

If you only have time for two sections, read **§4 Repo layout** and
**§9 Conventions** — those will keep you from making mistakes that take
a back-and-forth round trip to fix.

---

## 1. Working with the founder

- Non-technical but engaged. After every meaningful change, summarize in
  plain language what you did, why, and what they'll see on screen.
- They review specs before code lands. Don't write code until they
  greenlight a plan (interactive mode) OR until you're inside an
  explicitly briefed unattended batch.
- One file per turn for large writes (50+ lines). Same-shape micro-edits
  across multiple files in one turn is fine (e.g., adding `logWarn` +
  `t()` to 15 catch blocks).
- Run `npx tsc --noEmit` after every file edit. Clean → continue. Errors
  that aren't transient route-regen → stop and report. For larger
  changes also run `npm run ci` (i18n parity + tsc + vitest, ~5 sec).
- Always confirm a smoke test passed before committing a phase that
  touches UI. The founder runs interactive tests in the browser; you
  don't. Round 1 + Round 2 added vitest coverage on the pure libs so
  many regressions are caught by `npm test` before the founder ever
  opens the app.
- Drops have hit us mid-session more than once. To survive drops: tiny
  turns + per-phase commits = safe checkpoints. Push after each round
  in unattended batches (founder-confirmed operating rule).

---

## Working with Claude

Petbnb is built using two Claude instances in parallel:

- **Strategy Claude** (claude.ai chat): drafts instructions, reviews
  code, designs smoke tests, debates product/architecture decisions
  with the founder.
- **Claude Code** (CLI in VS Code, sometimes also claude.ai/code on web):
  executes file edits, runs `tsc` / `vitest` / `git`, applies migrations
  to disk (not to Supabase), reports back to the founder.

The founder routes between them. Key conventions:

- **File reads should be pasted directly to chat by the founder** when
  the conversation is in Strategy Claude — this saves tokens and time.
  Claude Code reads files directly via tools.
- **Claude Code is for writes and verification** — edit instructions,
  `tsc` runs, git operations, grep searches, vitest runs.
- **Smoke test in the browser between phases (or batches).** `tsc`
  catches type errors; vitest catches money/date/pricing regressions;
  neither catches layout drift, RTL slips, or routing weirdness.
- **Migration pause pattern:** when a phase writes a SQL migration,
  Claude Code pauses and prints the SQL; the founder applies it in
  Supabase manually; the founder replies "continue" to resume. For
  unattended batches: migrations are written, never run; the founder
  reviews and applies them after the batch completes.
- **One commit per logical theme.** Don't bundle unrelated changes.
- **Push after each round in unattended batches.** Standing
  authorization from the founder; otherwise local-only.
- **Strategy Claude should push back** when the founder is about to make
  a mistake — silently losing user data, mega-bundle scope, premature
  features, naming inconsistencies. Pushback is welcome; default
  deference is not.

### Unattended-batch operating rules

When the founder briefs a multi-commit unattended run:

1. Per-piece commits with descriptive messages (matches §7 style).
2. `tsc --noEmit` green BEFORE every commit.
3. `npm run ci` green at end of round (i18n parity + tsc + vitest).
4. Decision log appended to `docs/batch-decisions.md` at end.
5. Migrations WRITTEN but NOT applied — founder applies after review.
6. Final report with: commit list, decision log delta, full migration
   SQL + verification queries, smoke-test checklist. Split into 2-3
   parts if long so a drop mid-report doesn't truncate.
7. Push after each round. Two rounds = two pushes.

---

## 2. What we're building (MVP scope)

A two-sided mobile marketplace for Saudi Arabia connecting **pet owners**
(cats today, dogs in Step 5.7) with **verified hosts** who board pets in
their own homes (Airbnb-style), plus add-on services (grooming, vet,
transport, insurance) and a facilitation-only product marketplace.
**Arabic-first, RTL, mobile-first, female-trust-first.**

This is an MVP — first ~100 bookings in one Riyadh neighborhood — NOT a
scaled production system. Working core flows > feature completeness.

### Why this market, why now

- Saudi pet ownership has moved from informal to mainstream over the
  last decade. Cats are the dominant household pet; dogs are growing
  fastest in young, urban households.
- The boarding market today runs largely on Instagram and WhatsApp —
  no structured trust signals, no escrow, no formal reviews, lots of
  cancelled bookings and last-minute price changes.
- Competitors exist (**Anis** local, **PetBacker** multi-country) but
  none have an Arabic-first, female-trust-first UX. Anis in particular
  is host-acquisition heavy but customer-side weak; PetBacker is
  generic and culturally unbranded. Petbnb's wedge is the female-trust
  positioning: every early host is personally vetted by the founder
  before they're listed (see CLAUDE.md §0.5).

### Post-prototype scope clarification (CLAUDE.md §0.5)

A long-term-vision prototype surfaced a multi-service pet super-app
(hosting + vet + grooming + transport + store + insurance + records +
consultation). We're shipping **hosting only** for MVP. The other 7
services are post-launch — they get "قريباً" (coming soon) tiles on a
Phase 2 home-screen polish task.

### Step 5.7 expansion

Founder decided to launch with cats AND dogs (originally cats-only).
Adds species selector, species-aware breed picker, listings declare
which species they accept. **Parked** — not yet built; see
`CLAUDE.md` §13 item 10 for full scope. Schema-ready (`pets.species`
defaults to `'cat'` since migration 0001).

---

## 3. Tech stack (do not substitute without asking)

| Layer | Choice |
|---|---|
| Framework | Expo (React Native) + Expo Router |
| Language | TypeScript, strict mode |
| Backend | Supabase: Postgres + Auth + Storage + Row Level Security |
| Auth (dev) | Email OTP (Supabase + Resend custom SMTP) |
| Auth (pre-launch) | Saudi phone OTP via Unifonic/Taqnyat (Send SMS Hook + Edge Function). `src/lib/phone.ts` is pre-staged with the E.164 normalizer. |
| Payments | Mocked. `PaymentProvider` interface in `src/lib/payment.ts` → `MockPaymentProvider` charges 0%. Fee policy + refund math live in pure `src/lib/payments-policy.ts` (whole-SAR, Riyadh-anchored — Round 1 R1C1). Pre-launch swap to Moyasar/HyperPay (CLAUDE.md §11). |
| State | React Context (auth/session, locale, host-notifications) + Supabase JS direct (server state — no TanStack yet) |
| i18n | `src/lib/i18n.tsx` (Context-aware) + `src/locales/(ar|en).json` (524 keys at parity, enforced by `scripts/check-i18n-parity.mjs` in CI). Plural-aware `t()` via `Intl.PluralRules`. |
| Styling | Single theme file `src/theme/tokens.ts`. RTL default. |
| Location | `src/lib/geo.ts` wraps `navigator.geolocation` (web) and `expo-location` (native). |
| Image picker | `expo-image-picker` (native) + `<input type="file">` (web), wrapped in `src/lib/pets.ts` `pickPetPhoto()` and `pickPhotosMulti()`. |
| Date input | Shared `src/components/DateField.tsx` — HTML5 `<input type="date">` on web (calendar picker), `TextInput` fallback on native. Used by booking request, pet vaccination, host availability (R1C3 standardization). Real native modal picker still TODO. |
| Confirm dialogs | `src/lib/confirm.ts` — single `confirmDialog(message): Promise<boolean>` used by all 14 destructive-action sites. Web wraps `window.confirm`; native uses `Alert.alert` with two buttons. Two `confirmLeaveIfDirty` helpers remain sync because they gate sync nav `onPress` — separate follow-up. |
| Console logging | `src/lib/log.ts` — `logWarn`/`logInfo`/`logError`. `__DEV__`-gated so production builds stay silent. 76 raw `console.*` sites swapped in R1C5. |
| Tests | Vitest (`tests/*.test.ts`). 35 cases across 4 files: payments-policy, pricing, availability/range-overlap, vaccination recency. Pure-lib scope only — component tests deferred. |
| CI | GitHub Actions (`.github/workflows/ci.yml`) on every push to `main` and every PR. Three steps: i18n parity → `tsc --noEmit` → vitest. All must be green. |
| Repository | **PUBLIC** at `github.com/nuzul-saudi/petbnb`. Auth via Git Credential Manager (Windows Credential Manager backs the token). `gh` CLI is NOT used (McAfee TLS-inspection breaks its Go HTTPS stack — see §10). |

**API keys:** Supabase uses the NEW publishable key format
(`sb_publishable_...`). Legacy `eyJ...` anon JWTs are rejected by our
strict-prefix check in `src/lib/supabase.ts`. Both values live in `.env`
(gitignored) and are bridged to runtime via `app.config.ts` → `extra`.
**Never** import `sb_secret_...` keys — those are server-only.

---

## 4. Repo layout

```
Petbnb/
├── CLAUDE.md                   ← Spec / source of truth. Read this.
├── ONBOARDING.md               ← This file. Read it second.
├── app.config.ts               ← Bridges .env into Constants.expoConfig.extra
├── app.json                    ← Expo base config. plugins[] includes expo-router + expo-image + expo-splash-screen.
├── package.json                ← Deps. Scripts: start, web, lint, test, check:i18n, ci.
├── package-lock.json
├── tsconfig.json               ← @/* maps to src/*
├── vitest.config.ts            ← Vitest config — node env, tests under tests/**
├── .env                        ← gitignored. Holds SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY
├── .gitignore
│
├── .github/
│   └── workflows/
│       └── ci.yml              ← Runs npm run check:i18n + tsc + npm test on every push/PR
│
├── docs/
│   ├── batch-decisions.md      ← Decision log per round/batch (Round 1, Round 2, future-milestone backlog)
│   ├── batch-plan.md           ← Active batch's plan + checklist
│   └── round-2-smoke-status.md ← Round 2 smoke-test verification record (2026-06-11)
│
├── scripts/
│   ├── check-i18n-parity.mjs   ← Pure Node — diffs ar.json vs en.json keys; CI-gated
│   └── reset-project.js
│
├── src/
│   ├── app/                    ← Expo Router file-based routes
│   │   ├── _layout.tsx         ← Root: AuthProvider + LocaleProvider + HostNotificationsProvider + Stack
│   │   ├── index.tsx           ← Signed-in home, role-branched (owner / host / admin). Owner feed + HostHome live here.
│   │   ├── suspended.tsx       ← Account-suspended dedicated screen
│   │   ├── profile.tsx         ← Customer profile (edit name + pets link + avatar). For role='host': HostStatusPanel (pending/approved/rejected/verified states).
│   │   ├── become-host.tsx     ← Host signup intro screen (3-step pitch + Start application CTA). 0039 entry point for hosts; guests + owners can both tap.
│   │   ├── (auth)/             ← Auth route group (no URL prefix)
│   │   │   ├── _layout.tsx
│   │   │   ├── sign-in.tsx     ← Email entry. Honors ?returnTo= (guest-mode) and ?flow=host (host signup banner). Threads flow=host through verify → set-password.
│   │   │   ├── verify.tsx      ← OTP entry. Routes new users to /set-password?mode=signup; threads flow=host.
│   │   │   ├── set-password.tsx ← AUTH-2/4. After password: flow=host → /become-host/application; else → /name. Reset mode → returnTo.
│   │   │   └── name.tsx        ← Owner-only final step. Just collects full_name; role defaults 'owner'. (Replaced /role + RoleEditor in 0039.)
│   │   ├── become-host/        ← Host application funnel (post-OTP+password)
│   │   │   ├── application.tsx   ← Six-field form (name + gender + city + neighborhood + pet type + experience yes/no + years). Submit flips role='host' + host_application_status='pending'.
│   │   │   ├── submitted.tsx     ← Confirmation screen. "We'll review your application."
│   │   │   └── complete-profile.tsx ← Post-approval step. Bio (min 30 chars) + avatar reminder + Nafath stub behind NAFATH_ENABLED=false flag. Submit → host_profile_complete=true → listings unlocked.
│   │   ├── admin/              ← Admin dashboard (role='admin' only)
│   │   │   ├── _layout.tsx     ← Admin gate (redirects non-admins)
│   │   │   ├── index.tsx       ← Dashboard with queue cards; useFocusEffect refresh. 'New host applications' card uses listPendingHostApplications().
│   │   │   ├── hosts.tsx       ← Host applications review queue (0039 rewrite). Shows gender + city + neighborhood + pet type + experience. Approve flips status='approved' + is_verified=true. Reject takes required notes.
│   │   │   ├── users.tsx       ← All users with search + filter chips
│   │   │   ├── users/[id].tsx  ← User detail/edit + suspend
│   │   │   ├── listings.tsx    ← All listings + pending filter
│   │   │   ├── listings/[id].tsx ← UNIFIED review: new_listing AND pending_edit on same layout (8h.1)
│   │   │   └── bookings.tsx    ← Read-only bookings overview
│   │   ├── bookings/
│   │   │   ├── index.tsx       ← "My Bookings" list. Role-driven mode (owner vs host views). R2C7 unread dot.
│   │   │   └── [id].tsx        ← Booking detail. Role-driven controls (was persona-gated; 0039 simplified). ReviewCard mount (R2C6).
│   │   ├── listings/
│   │   │   ├── new.tsx         ← Host: create a listing. Pre-condition redirects (0039): non-host → /, no application → /become-host/application, pending → /profile, approved+incomplete → /become-host/complete-profile.
│   │   │   └── [id]/
│   │   │       ├── index.tsx     ← Public listing detail. Guest mode + self-listing edit-CTA (R2C1+R2C3).
│   │   │       ├── request.tsx   ← Booking request flow
│   │   │       ├── edit.tsx      ← Host: edit listing. 8d two-copy model — pending → in-place, approved/paused → draft.
│   │   │       ├── photos.tsx    ← Host: manage photos. Draft-aware (8e).
│   │   │       └── availability.tsx ← Host: blocked date ranges (Milestone B / 0027). DateField (R1C3).
│   │   └── pets/
│   │       ├── index.tsx       ← "My Cats" list
│   │       └── [id].tsx        ← Pet edit (id="new" for create mode). Vaccination dates use DateField (R1C2+R1C3).
│   │
│   ├── components/             ← Reusable UI components
│   │   ├── ListingCard.tsx     ← Sitter-first card; passes status badge on host home, rating pill on owner feed
│   │   ├── ListingForm.tsx     ← Shared create/edit form (Step 7.2)
│   │   ├── PhotoGallery.tsx    ← Swipeable photos for listing detail
│   │   ├── PetAvatar.tsx       ← Photo → breed-thumbnail → emoji fallback chain (5.6C.4)
│   │   ├── BreedPicker.tsx     ← Horizontal breed tile picker (with "I don't know" + "Other")
│   │   ├── AppHeader.tsx       ← Top-nav bar. Become-a-Host CTA for guests + owners. Inbox badge for hosts (0039 — replaced the persona pill).
│   │   ├── Button.tsx          ← 3 variants × 2 sizes. The CTA component since the R1C5 audit migration.
│   │   ├── DateField.tsx       ← Web calendar picker + native TextInput fallback. Used by booking request, pet vacc, availability (R1C3).
│   │   └── bookings/           ← Booking-detail sub-components
│   │       ├── HostActions.tsx              ← Accept/Decline/Start/Complete buttons
│   │       ├── ConditionReportsSection.tsx  ← Heading + saved check-in + file button + compose form
│   │       ├── DailyUpdatesSection.tsx      ← Heading + updates list (inline-edit fork) + compose form
│   │       ├── CheckOutSection.tsx          ← Check-out report file form + Complete-stay button (Phase 6.4 finish)
│   │       └── ReviewCard.tsx               ← Two-way reviews — compose mode + read-only mode (R2C6)
│   │
│   ├── hooks/                  ← Custom React hooks
│   │   ├── useBooking.ts            ← getBooking + refetch (with onLoadError callback)
│   │   ├── useDailyUpdates.ts       ← listDailyUpdates + refetch
│   │   └── useConditionReports.ts   ← listConditionReports + refetch
│   │
│   ├── lib/                    ← Data + utility layer
│   │   ├── supabase.ts             ← Typed Supabase client + pingSupabase()
│   │   ├── auth.tsx                ← AuthProvider + useAuth(). Note KNOWN/TODO blocks for SMS swap.
│   │   ├── i18n.tsx                ← LocaleProvider + useTranslation() + module-scope t()
│   │   ├── persona.tsx             ← HostNotificationsProvider — exposes pendingHostCount + refreshPendingHostCount. Filename kept from the pre-0039 persona context (which managed owner/host toggling), now host-notifications only.
│   │   ├── host-application.ts     ← 0039 helpers: submitHostApplication, listPendingHostApplications, approveHostApplication, rejectHostApplication, markHostProfileComplete.
│   │   ├── format.ts               ← formatSAR (whole SAR), pickLocalized, todayIso, formatRiyadhStamp. toArabicDigits is now a deliberate pass-through.
│   │   ├── locale-storage.ts       ← AsyncStorage cache for locale
│   │   ├── log.ts                  ← logWarn/logInfo/logError. __DEV__-gated. Replaces raw console.*  (R1C5).
│   │   ├── confirm.ts              ← confirmDialog(msg): Promise<boolean>. Web window.confirm + native Alert.alert (R1C4).
│   │   ├── pricing.ts              ← Pure pricing engine: base × pets × nights × discount + add-ons.
│   │   ├── payments-policy.ts      ← OWNER_SERVICE_FEE_RATE 0.05, HOST_FEE_RATE 0.15, refund tiers, Math.round whole-SAR. R1C1 anchored to T00:00:00+03:00.
│   │   ├── payment.ts              ← PaymentProvider interface + MockPaymentProvider (gateway swap pre-launch)
│   │   ├── geo.ts                  ← Cross-platform getCurrentLocation()
│   │   ├── phone.ts                ← Saudi E.164 normalizer (pre-staged for SMS OTP swap)
│   │   ├── breeds.ts               ← BREEDS array (10 cat breeds + unknown)
│   │   ├── cities.ts               ← Cities + districts. findCity / findDistrict helpers.
│   │   ├── listings.ts             ← Feed queries + distance haversine. status-based filtering since 8b/0024.
│   │   ├── listing-photos.ts       ← Photo upload + draft-aware operations (8e two-copy model)
│   │   ├── pets.ts                 ← Pet CRUD + photo upload (pet-photos signed URLs)
│   │   ├── bookings.ts             ← Booking create/read/edit/cancel. acceptBookingAsHost snapshots fees. listBookingsForHost (R2C7).
│   │   ├── booking RPCs            ← (no separate file — RPCs called inline from bookings.ts)
│   │   ├── daily-updates.ts        ← Daily-update CRUD (host-only, active-only)
│   │   ├── condition-reports.ts    ← CR CRUD (immutable, host-only insert)
│   │   ├── availability.ts         ← BlockedRange CRUD + range overlap predicates (Milestone B)
│   │   ├── range-overlap.ts        ← Pure rangesOverlap helper — the math is unit-tested in availability.test.ts (R1C6)
│   │   ├── vaccination.ts          ← classifyVaccinationDate + worstVaccinationStatus. 365-day boundary (R1C2).
│   │   ├── reviews.ts              ← createReview + findMyReview (R2C6)
│   │   ├── last-seen-storage.ts    ← AsyncStorage per-user-per-booking last-seen stamps (R2C7 unread dot)
│   │   └── admin.ts                ← Admin queries: getAdminListingReview, promoteListingDraft, etc.
│   │
│   ├── types/
│   │   └── database.ts         ← Hand-maintained Database type. See §5.
│   │
│   ├── theme/
│   │   ├── tokens.ts           ← Single source of truth for colors/fonts/spacing/radii/shadows
│   │   ├── theme.tsx           ← useTheme() — role-driven background/accent (owner=moss/cream; host=goldDeep/honey)
│   │   └── rtl.ts              ← useReadingTextAlign() (mostly unused after the audit)
│   │
│   ├── locales/
│   │   ├── ar.json             ← Arabic strings — feminine register
│   │   └── en.json             ← English mirror. 524 keys at parity.
│   │
│   └── assets/
│       └── breeds/             ← Cat-breed JPGs from Wikimedia
│
├── tests/                      ← Vitest. 35 cases over pure libs only.
│   ├── payments-policy.test.ts ← Fee rounding + refund tiers (incl. 01:30 Riyadh boundary)
│   ├── pricing.test.ts         ← Multi-pet discount + add-on cadence
│   ├── availability.test.ts    ← Half-open overlap predicates
│   └── vaccination.test.ts     ← Missing/current/expired classification + 365-day boundary
│
└── supabase/
    └── migrations/             ← Numbered SQL files. Apply via Supabase dashboard SQL Editor.
        ├── 0001_initial_schema.sql      ← 11 tables (Step 3)
        ├── 0002_rls_policies.sql        ← Row-level security (Step 3). Reviews public-select since here.
        ├── 0003_storage_buckets.sql     ← 6 storage buckets (Step 3)
        ├── 0004_admin_role.sql          ← admin role + is_verified + is_suspended (Step 4.5)
        ├── 0005_admin_rpc.sql           ← admin_list_users SECURITY DEFINER (Step 4.5)
        ├── 0006_pet_health_fields.sql   ← medical/dietary/medications (Step 5.5)
        ├── 0007_step_56_schema.sql      ← booking_pets junction + listings.lat/lng (Step 5.6)
        ├── 0008_pet_breed_other.sql     ← pets.breed_other for free-text breed entry (5.6C)
        ├── 0009_per_pet_pricing.sql     ← listings.additional_pet_discount + booking snapshots + booking_addons.pet_id (5.6D)
        ├── 0010_edit_booking_rls.sql    ← owner UPDATE/DELETE on junction + addons, gated to status='requested' (5.6F)
        ├── 0011_profile_locale.sql      ← profiles.locale (5.8.3)
        ├── 0012_bilingual_content.sql   ← listings.title_en, description_en, profiles.display_name_en (Step 7 prep)
        ├── 0013_rename_display_name_en.sql ← rename to profiles.full_name_en (Step 7 prep)
        ├── 0014_daily_updates_editable.sql      ← UPDATE/DELETE for host on own active daily_updates (Phase 6.3)
        ├── 0015_daily_updates_active_only.sql   ← All daily_updates writes gated to booking.status='active' (Phase 6.3)
        ├── 0016_condition_reports_host_only.sql ← INSERT restricted to listing's host, booking active (Phase 6.4)
        ├── 0017_condition_reports_unique_phase.sql ← UNIQUE (booking_id, phase) — at most 1 check-in + 1 check-out (Phase 6.4)
        ├── 0018_profile_persona.sql     ← profiles.persona ('owner'|'host'). Cross-device persona memory for role=both (8c).
        ├── 0019_listings_multicity_approval.sql ← listings.city enum (riyadh/dammam/jeddah/khobar/medina), backfill (7.2c)
        ├── 0020_reorder_listing_photos.sql      ← listing_photos RLS hardening + reorder RPC (8e)
        ├── 0021_listing_status.sql       ← listings.status ('pending'|'approved'|'paused'|'admin_disabled') + bridge trigger keeping is_active in sync during 8b migration window
        ├── 0022_listing_drafts.sql       ← listing_drafts + listing_photo_drafts tables (8d two-copy edit model). UNIQUE(listing_id) on field drafts.
        ├── 0023_listing_draft_rpcs.sql   ← promote_listing_draft + discard_listing_draft RPCs (8f). Atomic.
        ├── 0024_drop_is_active.sql       ← Drops listings.is_active + the sync trigger. Rewrites three is_active-dependent RLS policies to use status='approved' (Step 8i).
        ├── 0025_listing_status_guard.sql ← BEFORE INSERT OR UPDATE trigger on listings. Non-admin transitions restricted to approved↔paused; admin bypass via is_admin() (Phase 0b).
        ├── 0026_vaccination_and_care.sql ← pets.{rabies_vaccinated_at, fvrcp_vaccinated_at, vaccination_doc_url, care_notes} + listings.requires_vaccination. Extends promote_listing_draft RPC. (Milestone A)
        ├── 0027_availability_and_capacity.sql ← listing_blocked_dates table + bookings_capacity_guard trigger. Half-open overlap predicate. Re-fires on date edits (Milestone B + 2346c1b follow-up).
        ├── 0028_payments_foundations.sql ← bookings.{owner_fee_sar, host_fee_sar, total_charged_sar, payout_sar, payout_status, paid_at, cancelled_at, refund_sar}. payout_status CHECK constraint. (Stretch S1)
        ├── 0029_round2_behavior.sql      ← THREE parts in one migration: (A) bookings_insert_owner RLS tighten with owner_id <> host_id; (B) listing_blocked_dates SELECT widened to anon; (C) reviews_insert_participant + reviews_select_authenticated. (Round 2)
        ├── 0030_reconcile_review_policies.sql ← Drops the redundant policies from 0002+0004 + 0029 part C SELECT. Net: reviews has reviews_insert_participant + reviews_select_public (anon+authenticated). (Round 2 founder-decision Option A)
        ├── 0031_feed_index.sql            ← Composite btree index on listings (city, status) for the owner feed's hot path.
        ├── 0032_host_rating_rpc.sql       ← SECURITY DEFINER RPC returning host avg rating + review count, bypassing reviews RLS for the listing card aggregate.
        ├── 0033_favorites.sql             ← Round 11 — user_favorites(user_id, listing_id) + RLS. Owner-only writes; SELECT scoped to self.
        ├── 0034_listings_accepts_species.sql ← Step 5.7 prep (PARKED) — listings.accepts_species text[]. Schema-ready; SPECIES_ENABLED flag in src/lib/features.ts is false.
        ├── 0035_available_listings_rpc.sql  ← Availability-aware RPC for the feed (Milestone B follow-up).
        ├── 0036_available_listings_rls_parity.sql ← Adds the host-visibility EXISTS predicate inside the RPC to mirror the RLS reach.
        ├── 0037_anon_profiles_visibility.sql ← Bug fix: guest feed was empty. Adds an anon SELECT policy on profiles + narrows anon column-level GRANT to 6 display fields (id, full_name, full_name_en, avatar_url, is_verified, is_suspended). Phone/email/nafath stay private.
        ├── 0038_is_admin_security_definer.sql ← Turns is_admin() + is_active_user() into SECURITY DEFINER with pinned search_path = public, so they bypass the narrowed anon column grants from 0037.
        └── 0039_host_application_schema.sql ← Step 4.6 host signup funnel. Drops 'both' from profiles.role CHECK + persona column. Adds 12 host_application_* columns (status, submitted_at, reviewed_at, reviewer_id, admin_notes, gender, city, neighborhood, pet_type_accepted, experience_years, bio_ar, profile_complete) + partial index on status='pending'. Tightens listings_insert_host RLS to require role='host' AND host_application_status='approved' AND host_profile_complete=true.
```

**Booking screen architecture:**

`src/app/bookings/[id].tsx` is the coordinator. Rendering sections live in
`src/components/bookings/`:

- `HostActions.tsx` — Accept/Decline/Start/Complete buttons
- `ConditionReportsSection.tsx` — heading + saved check-in + file button + compose form
- `DailyUpdatesSection.tsx` — heading + updates list (with inline-edit fork) + compose form
- `CheckOutSection.tsx` — check-out report file form + Complete-stay button
- `ReviewCard.tsx` — compose mode (tappable stars + textarea) flipping to read-only after submit (R2C6)

Data loads via three hooks in `src/hooks/`, each returning
`{ data, loading, refetch }`:

- `useBooking(id, onLoadError?)` — wraps `getBooking`
- `useDailyUpdates(id)` — wraps `listDailyUpdates`
- `useConditionReports(id)` — wraps `listConditionReports`

State and handlers stay in the parent; components are presentational.
The dirty-state predicates (`isUpdateFormDirty`, `isCrFormDirty`,
`isCheckOutFormDirty`, `isAnyFormDirty`) and `confirmLeaveIfDirty` +
`beforeunload` listener also live in the parent so the cross-section
leave-warning is preserved. Owner-side review state (`myReview`,
`reviewFetchTick`) also lives in the parent.

**Role-driven mode:** the parent computes `isOwnerMode` / `isHostMode`
from `profile.role` alone (was persona-driven; 0039 simplified after
the `'both'` role was dropped). Owners see Edit/Cancel on their own
bookings; hosts see Accept/Decline/Start/Complete on bookings against
their listings. Booking-on-own-listing isn't possible any more
(separate account types) but the gates remain defense-in-depth.

**Shared styles DUPLICATED** across the three section components (each
flagged `// shared with parent`). Tidy-up deferred.

---

## 5. The data model

**15 tables** in `public` (was 14; added `user_favorites` in 0033). All
with RLS enabled. Migration history in `supabase/migrations/`; type
mirror in `src/types/database.ts`.

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | 1:1 with `auth.users`. Auto-created by trigger. | Roles: `owner`, `host`, `admin` (`'both'` was dropped by 0039). Plus `is_verified` (host trust badge flipped true by application approval), `is_suspended` (admin block), `full_name_en` (optional English), `locale` (`'ar'`/`'en'`, default `'ar'`). **Host application fields (0039)**: `host_application_status` (`'pending'`/`'approved'`/`'rejected'`/null), `host_application_submitted_at`, `host_application_reviewed_at`, `host_application_reviewer_id`, `host_application_admin_notes`, `host_gender`, `host_city`, `host_neighborhood`, `host_pet_type_accepted` (`'cats'`/`'dogs'`/`'cats_and_dogs'`), `host_experience_years`, `host_bio_ar`, `host_profile_complete`. The `persona` column was dropped by 0039. |
| `pets` | Owner's pets (cats today, dogs after 5.7). | Health fields from 5.5: `medical_needs`, `dietary_restrictions`, `medications`, `behavioral_notes`. Vaccination from 0026: `rabies_vaccinated_at`, `fvrcp_vaccinated_at`, `vaccination_doc_url`, `care_notes`. `photo_url` is a 7-day signed URL from the `pet-photos` private bucket. `species` defaults `'cat'`. |
| `listings` | Host's home offering. | **`status` is now the canonical visibility column** (since 0021). 4 states: `pending`, `approved`, `paused`, `admin_disabled`. `is_active` was DROPPED in 0024. `requires_vaccination` (0026 Milestone A). `lat/lng` nullable. `title_en`, `description_en` optional bilingual. `additional_pet_discount` (5.6D). `max_concurrent_pets`. `city` is an enum (riyadh/dammam/jeddah/khobar/medina) since 0019. `tier` (bronze/silver/gold). `host_gender` ('female'/'male' for female-trust filter). |
| `listing_drafts` | **8d two-copy edit model.** Host-pending field edits on approved/paused listings. | UNIQUE(`listing_id`) — at most one draft per listing. Same shape as `listings` for editable columns (10 fields). Promoted into `listings` by `promote_listing_draft` RPC. |
| `listing_photo_drafts` | **8e two-copy edit model.** Pending photo edits. | One row per pending photo. Promoted by `promote_listing_draft` (same RPC swaps photos + fields atomically). |
| `listing_photos` | Approved-listing gallery. Public bucket. | `photo_url` is direct public URL. Reorder via the 0020 RPC. |
| `listing_blocked_dates` | **Milestone B / 0027.** Host availability blocks. | Half-open `[start_date, end_date)`. `listing_blocked_dates_select_public` opens read to anon for guest mode (0029 Part B). The 0027 `guard_booking_capacity` trigger enforces no-overlap at booking accept time. |
| `bookings` | Booking lifecycle rows. | Statuses: `requested → accepted → active → completed`; also `declined`, `cancelled`, `disputed`. `nights` is generated. `pet_id` is still NOT NULL but shadowed by `booking_pets` junction (5.6). Booking-creation snapshots: `base_price_sar`, `additional_pet_discount`, `base_subtotal_sar`, `total_sar`. **Payment snapshot (0028 / S1):** `owner_fee_sar`, `host_fee_sar`, `total_charged_sar`, `payout_sar`, `payout_status` ('pending'/'held'/'released'), `paid_at`, `cancelled_at`, `refund_sar`. Set on `acceptBookingAsHost` via `snapshotFees`. R1C1 made all four whole integers via `Math.round`. Legacy pre-0009 bookings have `additional_pet_discount IS NULL` — display falls back to `total_sar`. |
| `booking_pets` | **5.6 junction.** Multi-pet bookings. | Composite PK. RLS mirrors `bookings`. INSERT-only. |
| `booking_addons` | Multi-select services per booking. | `pet_id` nullable. Null = booking-wide (transport). Non-null = per-pet (grooming/vet/insurance). |
| `condition_reports` | Check-in / check-out evidence. | **Immutable** by RLS. Photos in private `condition-report-photos` bucket. UNIQUE(`booking_id`, `phase`) backstops at-most-one-of-each. Step 6 ships the UI; Phase 6.4 + the CheckOutSection completed it. |
| `daily_updates` | Host posts during stay. | Immutable. Gated to `booking.status='active'`. Photos in private `daily-update-media` bucket. Step 7 ships the UI; Phase 6.3 added inline edit. |
| `messages` | Booking-scoped chat. | Immutable. **Step 9 will build the UI** (not yet started). |
| `reviews` | Two-way post-stay reviews. | UNIQUE(`booking_id`, `rater_id`). **Live as of R2C6.** INSERT requires `booking.status='completed'` + role-symmetric pair (owner↔host). SELECT is `reviews_select_public` (anon + authenticated — founder Option A). No UPDATE/DELETE — immutable, mirrors condition_reports posture. |
| `products` | Marketplace display only. | Read-only for clients. Admin manages via Supabase dashboard. |

### RLS philosophy

- Two helper functions: `public.is_admin()` and `public.is_active_user()`,
  both `STABLE` so the planner treats them as initPlans.
- Almost every write policy has `OR public.is_admin()` (admin bypass)
  and `AND public.is_active_user()` (suspended block).
- **Listings Q6 verified-host gating (post-0024):** non-host viewers see
  listings where `status = 'approved'` AND the host's
  `is_verified = true AND is_suspended = false`. Host themselves always
  sees own listings. (Pre-0024 this used `is_active = true`; updated in
  the 0024 policy rewrite.)
- **Self-booking guard (R2C1 / 0029 Part A):** `bookings_insert_owner`
  rejects when `owner_id = (select host_id from listings where l.id =
  listing_id)`. Three-layer block — UI notice + app-level throw + this
  policy. Closes the fake-rating vector for R2C6.
- **Reviews INSERT (0029 Part C, kept by 0030):** rater = `auth.uid()`,
  booking is `completed`, role-symmetric pair (owner↔host). Self-rating
  rejected by the role-symmetric clause even with self-bookings.
- **Status transition guard (Phase 0b / 0025):** BEFORE INSERT OR UPDATE
  trigger on listings. Non-admins can only INSERT `'pending'` and only
  UPDATE between `'approved'` and `'paused'`. Admin bypass via
  `is_admin()`.
- **Capacity + blocked-range guard (0027):** BEFORE INSERT OR UPDATE
  trigger on bookings. Fires when status becomes committed (`accepted`/
  `active`) OR when dates change on an already-committed booking
  (2346c1b follow-up). Computes overlap via half-open `[start, end)`.
  Same predicate as the client-side warning in `availability.ts`.
- **Tables holding evidence** (`condition_reports`, `daily_updates`,
  `messages`, `reviews`) have **no UPDATE/DELETE policies** — RLS
  default-deny enforces immutability.
- **Anon visibility (R2C3 guest mode):**
  - `listings` — Q6-gated (status='approved' + verified host) since 0024
  - `listing_photos` — same gate (0024 policy rewrite)
  - `storage.objects` listing-photos bucket — same gate (0024 policy rewrite)
  - `listing_blocked_dates` — open to anon (0029 Part B) so the date
    picker pre-check works for guests
  - `reviews` — open to anon via `reviews_select_public` (0002, kept by
    0030 — Option A founder decision)
  - Everything else (bookings, pets, profiles deep fields, messages, etc.)
    requires authentication

### Storage buckets

- `listing-photos` (public): `<listing_id>/<filename>`
- `profile-avatars` (public): `<user_id>/<filename>`
- `pet-photos` (private): `<owner_id>/<pet_id>/<filename>`
- `condition-report-photos` (private, immutable): `<booking_id>/<filename>`
- `daily-update-media` (private, immutable): `<booking_id>/<filename>`
- `product-images` (public, admin-only writes)

**Database types are hand-maintained** in `src/types/database.ts` (the
Supabase CLI's type-gen requires reaching `api.supabase.com` which
McAfee TLS-inspects/breaks on this machine — see §10). When changing the
schema: update both the migration file AND `database.ts` in the same
commit.

---

## 6. Auth + routing

### Owner signup (Step 4 — the regular `/sign-in` funnel)

1. User enters email → `supabase.auth.signInWithOtp({ email })`
2. Resend (custom SMTP) sends a 6-digit code (template configured in
   Supabase dashboard, not in code)
3. User enters code → `supabase.auth.verifyOtp({ email, token, type: 'email' })`
4. First time only: `/set-password?mode=signup` (AUTH-2)
5. After password: `/name` — just collects `full_name`; row commits with
   `role='owner'` (was a 3-way role picker pre-0039)
6. Lands on `OwnerFeedHome` at `/`

**Forgot-password** branches at step 3 (`/sign-in` "Forgot password?" link)
into `signInWithOtp({ shouldCreateUser:false })`, then verify forwards to
`/set-password?mode=reset` instead of the signup chain.

**Guest mode (R2C3):** anon visitors can browse the owner feed and
listing detail without signing in. Any gated action (Request booking,
/bookings, /profile) routes to `/sign-in?returnTo=<current-path>`. The
verify step honors returnTo and lands the new session back on the
original URL.

### Host signup (Step 4.6 — the `/become-host` funnel, 0039)

Hosts cannot sign up through the regular `/sign-in` funnel. Email
uniqueness on `auth.users` enforces the founder's "same email cannot
create both" decision — owner and host are different accounts.

1. Guest (or signed-in owner) taps "Become a Host" in `AppHeader`
2. Lands on `/become-host` — the intro screen with a 3-step pitch
3. **Signed-in owner branch:** instead of the Start CTA, sees a notice
   *"Host accounts are separate. Please sign out and create a new
   account with a different email."* + a Sign-out button. After
   signing out the screen flips to the guest variant.
4. **Guest branch:** tap "Start application" → routes to
   `/sign-in?flow=host` (host-mode banner above the email field)
5. Email → OTP → `/set-password?mode=signup&flow=host`
6. After password: routes to `/become-host/application` (NOT `/name`).
   The `flow=host` URL param threads through verify and set-password
   to make this routing decision.
7. Fill the 6-field form (name + gender + city + neighborhood + pet
   type + experience yes/no + years). Submit → `submitHostApplication()`
   flips `role='host'`, `host_application_status='pending'`,
   timestamps the submission, and writes all six values.
8. Lands on `/become-host/submitted` — confirmation. From here the
   applicant browses the site like any logged-in user; can book stays,
   can read messages, cannot create listings.
9. **Admin** opens `/admin/hosts`, reviews the application card
   (renders gender/location/pet-type/experience), and either approves
   or rejects. Approve = `approveHostApplication()` which flips
   `host_application_status='approved'` AND `is_verified=true`.
   Reject = `rejectHostApplication()` with a required notes string
   that the applicant sees on their profile screen.
10. After approval, profile screen renders the "Complete your profile"
    card with a CTA to `/become-host/complete-profile`.
11. Complete-profile collects `host_bio_ar` (min 30 chars), reminds
    the user to add an avatar (links to `/profile`), and renders a
    Nafath stub block behind `NAFATH_ENABLED = false`. Submit →
    `markHostProfileComplete()` flips `host_profile_complete=true`.
12. Listing INSERT RLS now unblocks; `/listings/new` becomes
    accessible. Pre-completion taps to `/listings/new` redirect to the
    appropriate step.

**Auth context** lives in `src/lib/auth.tsx` (`.tsx` because JSX). `useAuth()`
returns `{ initializing, session, user, profile, signOut, refreshProfile }`.

**Host notifications context** lives in `src/lib/persona.tsx` (filename kept
from the pre-0039 persona context). `useHostNotifications()` returns
`{ pendingHostCount, refreshPendingHostCount }`. The host-side AppHeader
inbox badge reads this; pre-0039 it also owned the owner/host toggle, but
that's gone.

### Routing gates (current state, post-0039)

```
NOT signed in
  visiting /, /listings/[id], or /become-host   → render guest view
  visiting any other route                       → /sign-in?returnTo=<path>
  guest hits Request booking / /bookings/...    → /sign-in?returnTo=<path>
  guest taps "Become a Host"                    → /become-host (intro screen)
  guest taps "Start application" on /become-host → /sign-in?flow=host

session present
  profile.is_suspended                          → /suspended  (priority over role)
  profile.full_name empty + owner signup        → /name
  profile.full_name empty + host signup         → /become-host/application
  profile.role = 'admin'                        → /admin
  profile.role = 'host'                         → HostHome on /
  profile.role = 'owner'                        → OwnerFeedHome on /

/listings/new pre-conditions (mirrors listings_insert_host RLS):
  role != 'host'                                → /
  no application yet                            → /become-host/application
  host_application_status = 'pending'           → /profile (status panel)
  host_application_status = 'approved' + !complete → /become-host/complete-profile
  approved + complete                           → render form
```

### The Expo Router file-path-vs-URL quirk (still relevant)

When a folder has `index.tsx` AND `[id].tsx` (e.g., `bookings/index.tsx`
+ `bookings/[id].tsx`), Expo Router's typed-routes union lists
`/bookings/index` and `/bookings/[id]` but NOT `/bookings`. The runtime
URL however IS `/bookings`. Calling `router.push('/bookings/index')` at
runtime gets matched by the dynamic `[id]` route as `id='index'` → 400
error from PostgREST trying to query with `id=eq.index`.

**Fix pattern** (used in `src/app/index.tsx`, `src/app/profile.tsx`,
`src/app/pets/[id].tsx`, several others):

```tsx
// @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes.
router.replace('/bookings')
```

Use this pattern for any nav to `/bookings`, `/pets`, `/admin`, or any
similar URL where the typed-routes union doesn't include the bare path.

**Do NOT use `router.back()` anywhere** — it dispatches `GO_BACK` which
fails when no history exists (deep link, refresh, post-replace). Use
`router.replace(<explicit destination>)` instead. Zero `router.back()`
calls in the codebase; keep it that way.

### Roles (post-0039 — three values, no persona toggle)

The three `profiles.role` values (0039 dropped `'both'`):

- **`owner`** — created instantly via `/sign-in`. Browses, books,
  messages, files condition reports as a participant, leaves reviews.
  **Cannot create listings, ever.** Tapping "Become a Host" routes to
  `/become-host` which shows a separate-account notice and a
  Sign-out button.
- **`host`** — created only via the `/become-host` funnel + admin
  approval + profile completion (see §6 "Host signup"). Can do
  everything an owner can (book stays, leave reviews, etc.) plus
  list, accept/decline bookings, post daily updates, file CRs as a
  participant. The four `host_application_status` × `host_profile_complete`
  combinations gate listing creation; see CLAUDE.md §12 for the
  full table.
- **`admin`** — founder vetting account. Sees admin dashboard as
  home. Can approve/reject host applications, approve/reject listings
  + drafts, edit any profile/listing, suspend/unsuspend. Multi-admin
  permission tiers are post-MVP.

Suspended users see `/suspended` instead of their normal home. They can
sign in but cannot insert listings, bookings, messages, addons, CRs,
updates, or reviews — enforced at the RLS layer via
`public.is_active_user()`.

Verified hosts (`profiles.is_verified = true`) display a verified badge
in the feed. Verification is **not** the visibility gate — that's
`listings.status = 'approved'`. Admin sets both independently; the
`approveHostApplication()` helper flips both `is_verified=true` AND
`host_application_status='approved'` in one update.

---

## 7. What's been built

For the current commit log, run `git log --oneline -30` rather than reading
a frozen snapshot here — that list goes stale fast. The decision trail
for the most recent batches (Round 1 and Round 2) is in
[`docs/batch-decisions.md`](./docs/batch-decisions.md); the smoke-test
record for Round 2 is in
[`docs/round-2-smoke-status.md`](./docs/round-2-smoke-status.md).

What follows is the phase-level narrative — what each phase did, why,
and the migration / file it touched.

### Foundation phases (Step 1 → Phase 6 — pre-2026-05)

- **Step 1** — Expo scaffold, Arabic/RTL theme, i18n skeleton, Tajawal + Reem Kufi fonts.
- **Step 2** — Supabase wiring. `app.config.ts` reads `.env` and exposes via `Constants.expoConfig.extra`. Connection probe on home page.
- **Step 3** — 11 tables, RLS policies, 6 storage buckets, hand-maintained types.
- **Step 4** — Email OTP auth + 3-screen flow + role-pick + auth-gated home. Custom SMTP via Resend.
- **Step 4.5** — Admin role + admin dashboard + verified-host visibility gating + suspended-user screen.
- **Step 5** — Owner browse feed, listing detail, booking request flow, mock payment, booking confirmation.
- **Step 5.5** — Customer profile, pet management, My Bookings, multi-addon, real date picker (web), sitter-first listing cards.
- **Step 5.6 (A-F)** — Multi-pet bookings via `booking_pets` junction, pet photo upload (private bucket + 7-day signed URLs), breed picker with Wikimedia photos, location-aware feed with haversine distance sort, full Arabic error sweep, booking-flow back button, per-pet pricing engine + add-on cadence/scope model (migration 0009), edit booking in place (migration 0010).
- **Step 5.7** — `max_concurrent_pets` enforcement (UI gate + server-side check), same-day date blocking, cap badge on ListingCard. NOTE: 5.7 was previously labeled for multi-species; that got renamed/parked.
- **Step 5.8.1-5.8.5** — English locale file + i18n loader rewrite (Context, plural-aware) + locale persistence (migration 0011) + language toggle + RTL/LTR layout flip.
- **Step 6** — Top nav (AppHeader on all signed-in screens).
- **Step 7 prep** — Optional bilingual fields (migrations 0012 + 0013).
- **Phase 6.1-6.3** — Host booking lifecycle (accept/decline/start/complete), daily photo updates with inline edit (migrations 0014 + 0015), check-in condition reports (migrations 0016 + 0017), 6-photo caps. **Check-out filing was outstanding at this point.**
- **Design-system rollout** — Reusable `Button` component (3 × 2 variants), adopted incrementally.
- **Booking-screen refactor** — `bookings/[id].tsx` extracted from ~1,800 → ~1,200 lines. Hooks (`useBooking`, `useDailyUpdates`, `useConditionReports`) + components (`HostActions`, `ConditionReportsSection`, `DailyUpdatesSection`). State stays in the parent.

### Persona memory + multi-city + status model (Step 7-8, 2026-05-26 → 2026-06)

- **Step 7.1-7.2 — Host onboarding.** Persona context (`PersonaProvider`) + `profiles.persona` for cross-device memory (migration 0018). HostHome replaces the placeholder. Multi-city + neighborhood model (migration 0019 — riyadh/dammam/jeddah/khobar/medina enum). Listing creation form (`ListingForm`) + new route `listings/new.tsx`. Pending-approval lifecycle wired into the existing admin queue.
- **Step 7.5 — Listing edit + photo manager.** New routes `listings/[id]/edit.tsx` + `listings/[id]/photos.tsx`. Reorder photos via the 0020 RPC.
- **Step 8a-8h — Status model + two-copy edit.** The big one. `listings.status` (`pending`/`approved`/`paused`/`admin_disabled`) replaces `is_active` (migration 0021 — bridge trigger keeps both in sync during the migration window). Field drafts in `listing_drafts` + photo drafts in `listing_photo_drafts` (0022). Atomic promote/discard via two RPCs (0023). Host edits on approved/paused listings create an invisible draft; admin reviews and promotes via the queue. Admin listing-detail screen is unified — `new_listing` and `pending_edit` share the layout. Host home categorizes into Drafts (gold pill) + Live (moss pill). Multi-state badges (8h.2), self-view banner (8h.3), reactivate gating (8h.4), rejection flow (8h.6).
- **Step 8i — Drop `is_active`.** Migration 0024 drops the column + sync trigger. Rewrites three is_active-dependent RLS policies from migration 0004 to use `status='approved'` instead. Removes the bridge.

### Unattended batches A (2026-06-10) — phases 0a-c + Milestones + Stretches

These shipped together in one ~7-commit autonomous batch:

- **Phase 0b — DB status transition guard** (migration 0025). BEFORE INSERT/UPDATE trigger on listings restricting non-admin transitions to `approved↔paused`. Admin bypass via `is_admin()`.
- **Phase 0c — Post-8 sweep.** Admin filter chips ("Female/Male sitter" instead of duplicated "Sitter"), zero-count dashboard cards become inert, 8e last-photo edge case (block delete with friendly message instead of count-tracking column), check-out report filing UI (the long-outstanding Phase 6.4 finish).
- **Milestone A — Vaccination & care** (migration 0026). `pets.{rabies_vaccinated_at, fvrcp_vaccinated_at, vaccination_doc_url, care_notes}` + `listings.requires_vaccination`. Extends `promote_listing_draft` RPC. Soft-warn on booking submit (host can decline, owner can still send).
- **Milestone B — Availability & capacity** (migration 0027 + 2346c1b follow-up). `listing_blocked_dates` table + `guard_booking_capacity` trigger. Half-open `[start, end)` overlap. Trigger re-fires on date edits to already-committed bookings (the follow-up fix). Client-side warning in `availability.ts` uses the same predicate.
- **Stretch S1 — Payments foundations** (migration 0028). `bookings.{owner_fee_sar, host_fee_sar, total_charged_sar, payout_sar, payout_status, paid_at, cancelled_at, refund_sar}` + payout_status CHECK. `payments-policy.ts` with fee constants + refund tiers. `acceptBookingAsHost` snapshots fees. `cancelBookingAsOwner` computes refund.
- **Stretch S2 — Discovery + reviews** (no migration). Owner-feed filters (female-only, grooming, no-resident-pets, city), host rating rollup on ListingCard, distance sort wired.

### Test round 3 (2026-06-10 evening) — 8 founder-flagged polish fixes

The "test round 3" commit (`add88bd`) was 8 small UX fixes after a smoke
test surfaced rough edges:

- Latin numerals everywhere in display (founder choice)
- Host home Drafts shown FIRST (was Live first)
- Paused listing moved into Drafts section (was rendering under Live)
- Persona-aware listing detail CTA (own listing in owner persona shows
  Request booking, not Edit — fixed in a follow-up `40aeec1`)
- Header notification badge route + decrement on accept
- Calendar date picker for vaccination dates (extracted `DateField`)
- Host main menu shows "إعلاناتي / My Listings" instead of "My Bookings"
- Booking detail controls gated by persona, not just by ownership

### Round 1 — code-review audit response (2026-06-11 morning)

Seven commits responding to an independent code-review audit. Logged in
detail in `docs/batch-decisions.md` under "Round 1 (2026-06-11)":

- **R1C1** — `payments-policy.ts` now uses `Math.round` (whole SAR everywhere; no decimal-leaking `round2`). Cancellation refund anchored to `T00:00:00+03:00` (Riyadh midnight, no DST), closing the gap where a 01:30 Riyadh cancellation landed in the 50% tier instead of no-refund. C2 (server-side clock) marked in-code for the gateway swap.
- **R1C2** — `src/lib/vaccination.ts` adds 365-day boundary. Warning copy split `_missing` vs `_expired` (both soft-warn).
- **R1C3** — `availability.tsx` swapped raw TextInputs for the shared `DateField`. All three date surfaces now identical on web.
- **R1C4** — `src/lib/confirm.ts` adds `confirmDialog(msg): Promise<boolean>`. 14 call sites migrated.
- **R1C5** — Button-component adoption on listing-detail, profile, admin/listing-detail. `src/lib/log.ts` adds `__DEV__`-gated `logWarn`/`logInfo`/`logError`. 76 console call sites swapped.
- **R1C6** — CI workflow + first vitest suite + i18n parity script. `.github/workflows/ci.yml` runs on every push.

### Round 2 — behavior audit response (2026-06-11 morning → afternoon)

Seven commits + the 0029 migration responding to a separate behavior audit:

- **R2C1 — Self-booking guard.** Three layers: UI notice on own-listing detail, app-level throw in `createBookingRequest`, RLS clause `owner_id <> host_id` on `bookings_insert_owner` (0029 Part A).
- **R2C2 — "Rejected by admin" label.** Host-facing only; admin keeps "Disabled (admin)".
- **R2C3 — Guest mode.** Owner feed + listing detail anon-viewable. Gated actions route to `/sign-in?returnTo=<path>`. `listing_blocked_dates` SELECT widened to anon (0029 Part B). Sign-in copy: "Sign in or create an account".
- **R2C4 — Host section framing.** SectionList headers become tinted pills (gold Drafts, moss Live).
- **R2C5 — Owner feed sort selector.** Chip strip — Newest / Price ↑ / Price ↓ / Rating / Nearest. Client-side sort.
- **R2C6 — Two-way reviews.** `src/lib/reviews.ts` + `ReviewCard.tsx`. Wired into `bookings/[id].tsx` with persona gates. 0029 Part C adds `reviews_insert_participant` with role-symmetric clause + `reviews_select_authenticated`.
- **R2C7 — Notification signals.** AsyncStorage last-seen stamps drive an unread dot on owner bookings list. `useFocusEffect` triggers `refreshPendingHostCount()` so the host badge decrements without a persona switch.

### Step 4.6 — host signup funnel + persona separation (2026-06-15 → 2026-06-17)

Founder review of the deployed Step 5.5 sitter-first flow surfaced two
linked problems:

1. The in-flight 3-way role picker at signup (`/role`) let any new
   user instantly pick `host` or `both` with no verification —
   directly undercutting the female-trust wedge that the §0
   admin-vetting model is built around.
2. The deployed "Become a Host" CTA in the AppHeader was owner-only
   AND routed to a stub, so no working host-signup path existed at
   all.

Founder decisions (CLAUDE.md §13 "Test round 4"; locked):

- Owner signup stays instant — email → OTP → password → name → home.
- Host signup is the ONLY path through `/become-host` → 6-field
  application → admin review → post-approval profile completion.
- Two account types separated at the email level — same email can't
  create both. To act as both, sign out and use a different email.
- Booking is universal (hosts can book). Only listing creation is
  gated.

Implementation (5 commits, 39 migrations total now):

1. **Migration 0039.** Drops `'both'` from `profiles.role` CHECK +
   the `persona` column. Adds 12 host_application_* columns + a
   partial index on `host_application_status='pending'`. Tightens
   `listings_insert_host` to require `role='host' AND
   host_application_status='approved' AND host_profile_complete=true`.
2. **Persona-toggle removal + owner-signup simplification.** Drop
   the `/role` picker + RoleEditor + persona-storage cache. Replace
   the persona context with a `HostNotificationsProvider` that only
   exposes the pending-host-count badge. Drop every
   `(role==='both' && persona===X)` branch across home, bookings,
   listings detail, theme — those become role-driven.
3. **Guest entry + auth funnel threading.** AppHeader's "Become a
   Host" CTA visible to guests AND owners. Real `/become-host` intro
   screen with separate-account-notice branch for signed-in owners.
   `?flow=host` URL param threads through `/sign-in → /verify →
   /set-password` so post-password routing goes to
   `/become-host/application` instead of `/name`.
4. **Application form + status panel + completion + listing gate.**
   `/become-host/application` six-field form, `/become-host/submitted`
   confirmation, `HostStatusPanel` on `/profile` (4 visual states),
   `/become-host/complete-profile` with Nafath stub. `/listings/new`
   redirects pre-conditions to the appropriate step. New
   `src/lib/host-application.ts` with submit/list/approve/reject/
   markComplete helpers.
5. **Admin queue.** `/admin/hosts` rewritten — was an
   `is_verified=false` filter, now a proper application detail view
   with approve/reject buttons + a notes-required rejection modal.
   Admin home card relabeled "New host applications" and the counter
   uses `listPendingHostApplications()` directly (the
   `admin_list_users` RPC doesn't return the new columns).

Out of scope this batch (deferred, listed for future work):
- Updating the `admin_list_users` RPC to return host_application_*
  fields. Today the admin home does a separate query for the
  pending-count.
- Email-uniqueness UI on `/become-host/application` — currently
  the same-email-can't-be-both rule is enforced solely by
  Supabase Auth's email uniqueness on `auth.users`. A friendly
  pre-OTP "this email is already an owner" check would help.

### Round 2 follow-up — reviews policy reconciliation (2026-06-11 evening)

`ae1e857` — Migration 0030 fixes a collision discovered during smoke test:
my 0029 Part 3 didn't drop pre-existing reviews policies from 0002+0004.
Net result was 4 policies (2 duplicates) on the table. **Founder decision
(Option A):** keep the original `reviews_select_public` (anon + authenticated)
since that's the project's design intent and matches guest mode's
conversion-funnel needs. Drop the duplicate INSERT and my redundant
authenticated SELECT. Final state: exactly 2 policies on
`public.reviews` — `reviews_insert_participant` (INSERT) +
`reviews_select_public` (SELECT, anon + authenticated).

### Environment saga (2026-06-11 evening)

Worth knowing for whoever picks up next: Metro web target broke
mid-smoke-test with `ERR_EMPTY_RESPONSE`. Two compounding causes:

1. **Node v24.14.0** on the dev machine. Node ≥23 has known
   HTTP/streaming-layer regressions that break Metro's web bundling
   (and Expo Go native bundling — both go through the same Metro).
   **Fix: install Node 22 LTS.** Either nvm-windows or direct install.
2. **McAfee Management Service (`macmnsvc`)** was holding port 8081
   independently, masking the symptom further. Doesn't get killed
   easily — requires admin rights. Workaround: Metro auto-falls-back
   to 8082 if 8081 is busy.

After Node 22 install + `rm -rf node_modules && npm ci`, web target
came back on 8082. Documented in §10 below.

---

## 8. What's next

The build is in a clean stopping state — Rounds 1 + 2 closed, all
migrations applied, 30 migrations total, 35 vitest tests, CI green.

### Next build steps (per CLAUDE.md §3 build order)

- **Step 9 — In-app messaging (owner ↔ host).** Schema already exists
  (`messages` table from 0001, immutable per RLS posture). UI is the
  remaining work. Critical pre-booking comms — nobody books without
  messaging first.
- **Step 10 — Reviews polish.** R2C6 shipped the review-create flow
  and the listing-card aggregate display. Polish opportunities: text
  visibility on listing detail (not just on card), filter/sort by
  rating (S2 partial), badge rendering on host home self-view.

### Pre-launch milestones (CLAUDE.md §11)

These are the gates between MVP-complete and public launch. Each has
a specific reason it's safe to defer during build but unsafe at launch:

1. **Saudi phone OTP swap** — Email OTP today; phone OTP requires CR
   + CITC alpha sender ID (multi-day approval). `src/lib/phone.ts` is
   pre-staged.
2. **Custom SMTP** — Supabase built-in mailer is rate-limited 2/hour/
   recipient. Resend free tier covers MVP volume.
3. **Real payments** — Moyasar / HyperPay swap. `PaymentProvider`
   interface is ready; `MockPaymentProvider` charges 0%. Fee policy is
   locked at 5%/15%; refund math is locked at 48h cliff.
4. **Nafath ID verification for hosts.** Schema-ready
   (`profiles.nafath_verified` defaults false). The stub UI lives at
   `/become-host/complete-profile` behind `NAFATH_ENABLED = false`.
   Flip the flag, wire the verifier, and require Nafath success
   before flipping `host_profile_complete=true`.
5. **Push notifications + prayer-time silence** — Phase 2. Needs Expo
   project credentials + a real device. Out of unattended-batch scope.
6. **Real insurance partner** for the `تأمين` add-on.
7. **Hub-style home with "قريباً" tiles** for the 7 deferred services.
8. **Cancellation policy engine (Airbnb-style tiers).** Today's
   48h-cliff is launch-sufficient interim; richer engine designed
   AFTER real payments land.
9. **Service fee model decision.** Currently locked at 5% owner +
   15% host.
10. **Completed-bookings counter visible across users** — currently
    always 0 for non-host viewers due to RLS. SECURITY DEFINER RPC or
    counter-cache column.
11. **Pre-OTP email-uniqueness hint on `/become-host/application`** —
    today the same-email-can't-be-both rule is enforced only by
    Supabase Auth's `auth.users` uniqueness. The signup blows up at
    OTP send if the email is already an owner; a friendlier check at
    the email step would help.
12. **Update `admin_list_users` RPC to return host_application_***
    fields — today admin/index does a separate `listPendingHost
    Applications()` query for the count because the RPC's return
    shape doesn't include the new columns.

### Future-milestone backlog (per `docs/batch-decisions.md`)

- **Change/cancellation policy engine** — flight-style tiers.
- **Host booking detail — owner & pet identity surface** (logged
  2026-06-11). The host's booking detail screen omits the owner's
  name/rating and the pet's name/breed/care_notes — the host has no
  context on who they're committing to before tapping Accept. Mirror
  the owner-side detail screen built in Step 5.5.

---

## 9. Conventions to follow

### Code

- **TypeScript strict.** No `any` without a justifying comment.
- **Run `npx tsc --noEmit` after every file edit.** Catches typed-route
  drift and missing imports immediately. For larger changes, use
  `npm run ci` (i18n parity + tsc + vitest).
- **Per-phase commits.** Each batch gets one logical commit with a
  message that lists files + intent + rationale. See recent commit
  messages via `git log --oneline -30` for style.
- **Don't add features that weren't asked for.** "While I'm in there"
  refactors break the founder's review model.
- **Don't write docs files (READMEs) unless explicitly requested.**

### Tests (Vitest, since R1C6)

Tests live in `tests/*.test.ts`. Scope is **pure libs only** —
`payments-policy`, `pricing`, `range-overlap` (via `availability`),
`vaccination`. Component tests are deferred.

```bash
npm test                 # one-shot
npm run test:watch       # watcher mode
```

When adding logic to one of those libs, **also extend the test file**
in the same commit. The CI workflow gates merges on the test suite.

If the test you'd write requires Date.now() or Math.random(), refactor
the lib to accept `nowIso` / a seeded RNG as a parameter — that's how
`vaccination.ts` is structured (caller passes `nowIso`), and it's the
pattern to follow for new pure libs.

### Migrations

Numbered SQL files in `supabase/migrations/`. Apply via Supabase
dashboard SQL Editor.

- **Update both the migration file AND `src/types/database.ts`** in
  the same commit when changing the schema.
- **For unattended batches**, write the migration but do NOT apply it.
  Founder reviews after the batch and applies via the SQL Editor.
- **Drop-and-recreate policies** when renaming columns referenced in
  RLS bodies — see migration 0024 which had to rewrite three
  is_active-dependent policies before dropping the column.
- **Verification queries** as commented-out tail of each migration —
  the founder runs these after applying to confirm the migration took.
- **No mid-batch policy collision surprises** — `grep
  "policy.*reviews" supabase/migrations/` (or analogous) before
  writing new policies on a pre-existing table. Migration 0030 exists
  because I missed that 0002 already had reviews policies when
  writing 0029.

### i18n

Translations live in `src/locales/ar.json` and `src/locales/en.json`
(524 keys at parity, enforced by `scripts/check-i18n-parity.mjs` in
CI). Loader at `src/lib/i18n.tsx` provides a `LocaleProvider` React
Context plus a module-scope `t()` for non-React callers.

```ts
const { t, locale, setLocale } = useTranslation();
t('booking.confirm_subtitle');               // simple substitution
t('booking.nights_count', { nights: 3 });    // plural-aware via count
```

Plural rules: `t()` inspects params for `count` / `nights` / `pets`
(in that priority). When found, computes `Intl.PluralRules` category
for the current locale and looks up `<key>_<category>`. Fallback
chain: exact category → `_other` → bare key → key literal.

`setLocale` persists to both AsyncStorage (immediate) and
`profiles.locale` (cross-device, fire-and-forget). `configureRTL(locale)`
in `_layout.tsx` flips `document.dir` + `I18nManager.forceRTL`.

Bilingual user-entered content uses `pickLocalized(arField, enField,
locale)` from `lib/format.ts`. Falls back to Arabic primary when the
English field is empty. Used for `listings.title_en`,
`listings.description_en`, `profiles.full_name_en`.

**Masculine register in Arabic strings.** (Founder decision
2026-06-14, superseding the earlier feminine-register guidance.)
New copy uses ـك (masculine singular you) not ـكِ. Verbs in
masculine imperative — e.g. `قيّم` (rate), `بدّل` (switch),
`سجّل` (sign in), `اختر` (choose). The earlier feminine register
was swept in commit history; new code follows the masculine rule.

**Exceptions** — these are display labels for gender data, not
voice direction, and stay as-is:
- `feed.female_filter` — "مضيفات فقط" (female sitters only)
- `host_female` — "مضيفة" (the gender label "Female sitter")
- `host_application.gender_female` — "أنثى" (the form chip "Female")

### Arabic / RTL

- Layout direction is locale-aware. `configureRTL(locale)` in
  `_layout.tsx` sets `document.documentElement.dir` +
  `I18nManager.forceRTL`. `AppShell` (inside `LocaleProvider`) re-
  applies on every change. React Native's default `textAlign`
  honors `I18nManager.isRTL`, so most text aligns correctly without
  per-callsite overrides.
- **KNOWN DEFERRED:** ~35 hardcoded `textAlign: 'right'` instances
  in `admin/*` and `(auth)/*`. The Step 5.8.5 audit covered only
  signed-in non-admin/auth screens.
- **Numbers — Latin everywhere.** Test-round-3 founder decision.
  `toArabicDigits()` in `src/lib/format.ts` is a deliberate pass-through
  kept for compile compatibility; **do NOT reintroduce Arabic-Indic
  conversion**.
- **Currency**: always `ر.س`. Never `$`. Use `formatSAR(amount)` — it
  returns whole-SAR strings (no decimals).
- **Email and date inputs** are visually LTR (set `textAlign: 'left'`)
  even inside RTL layout.
- **Phone format**: `+966 5X XXX XXXX` per Saudi convention. E.164
  normalizer in `src/lib/phone.ts`.

### Error handling

The pattern since R1C5 (which standardized the logger):

```ts
import { logWarn } from '@/lib/log';

} catch (e) {
  logWarn('[scope.action]', e);  // dev console gets the technical detail
  setError(t('scope.action_failed'));  // user-facing Arabic message
}
```

`logWarn`/`logInfo`/`logError` from `src/lib/log.ts` are `__DEV__`-gated
— silent in production. **Don't** use raw `console.warn` in new code
unless you have a reason `logWarn` doesn't cover.

**Don't** `setError(e.message)` — that surfaces English Supabase error
text. **Don't** `setError(e instanceof Error ? e.message : t(...))` —
that's the old pattern (5.6A swept it).

### Confirm dialogs (since R1C4)

The pattern for destructive actions:

```ts
import { confirmDialog } from '@/lib/confirm';

const onDelete = async () => {
  if (!(await confirmDialog(t('scope.delete_confirm')))) return;
  // proceed with destructive action
};
```

Web wraps `window.confirm`, native wraps `Alert.alert` with two
buttons. **Don't** write per-screen `confirm` helper wrappers — that's
the anti-pattern R1C4 swept (the old wrappers silently auto-accepted
on native, which would have shipped data-loss bugs to mobile builds).

Two `confirmLeaveIfDirty` helpers in `bookings/[id].tsx` and
`photos.tsx` remain synchronous because they gate sync nav-`onPress`
calls; migrating those requires changing the AppHeader nav-gate
contract. Separate follow-up.

### Loading + empty states

Every screen must handle: `loading`, `error`, `empty`. Never render
a blank screen.

### Navigation

- Use `router.replace(<explicit destination>)`, never `router.back()`.
- For dynamic routes use the object form:
  `router.push({ pathname: '/listings/[id]', params: { id } })`.
- For URL forms the typed-routes union rejects (the index-route
  quirk): use `@ts-expect-error` directive with the standard comment
  block. See §6 for the exact pattern.

### Files

- `.tsx` extension is required for any file with JSX. `.ts` is for
  pure logic.
- Path alias `@/` maps to `src/`. Use `@/lib/auth`, not `../../lib/auth`.
- Components in `src/components/`. Screens in `src/app/`. Helpers in
  `src/lib/`. Tests in `tests/`. Scripts in `scripts/`.

### Comments

- Comment the **why**, not the **what**. Code shows what; comments
  explain non-obvious constraints, workarounds, trade-offs.
- Defaults to **no comments**. Only add when removing the comment
  would confuse a future reader.

---

## 10. Known quirks + deferred items

### Environment / network

- **Node version: 22 LTS REQUIRED.** Discovered 2026-06-11: Node v24
  (and likely v23) break Metro's HTTP layer in Expo SDK 55 — the
  server accepts TCP connections then closes them with no HTTP
  response. Both web and Expo Go native bundling go through the same
  Metro instance, so both targets fail identically. The Node 22.18.0
  LTS works cleanly. If `node -v` returns anything other than v20.x
  or v22.x, install Node 22 first via nvm-windows or direct install
  before debugging anything else. See §11 for the install + clean
  rebuild recipe.
- **McAfee Management Service (`macmnsvc`) holds port 8081** on this
  machine. NOT removable from non-elevated PowerShell. Metro
  auto-falls-back to **port 8082** when 8081 is busy — just use
  whichever URL the terminal prints, and open it in **Chrome
  incognito** to bypass any stale service worker from the broken
  state.
- **McAfee TLS-inspects `api.supabase.com`** — Supabase CLI auth and
  remote type-gen are blocked. We hand-maintain `src/types/database.ts`
  instead.
- **`.claude/settings.json`** may show as modified — that's the Claude
  Code per-developer config, intentionally not committed.
- **Background `expo start` workers don't always die with Ctrl+C.**
  After a kill, check `Get-Process node` and `netstat -ano | findstr :8081`
  to confirm no Metro children are still holding the port. See §11.

### Routing

- Index-route file-vs-URL quirk (see §6). Affects `/pets`, `/bookings`,
  `/admin`. Use `@ts-expect-error` + the bare URL string.

### Auth / Storage

- **Resend sandbox sender** (`onboarding@resend.dev`) only delivers to
  the Resend account owner's email (currently `<admin-email>`).
  Pre-launch: verify a real domain (e.g., `auth@petbnb.sa`).
- **Pet photos are 7-day signed URLs** stored in `pets.photo_url`.
  Production pattern is path-in-DB + on-render signing — listed in
  `CLAUDE.md §11`.
- **`completed_bookings_count`** is always 0 from non-host viewers due
  to bookings RLS. MVP-fine (no completions yet); listed in
  `CLAUDE.md §11` with the two viable fixes (SECURITY DEFINER RPC or
  denormalized counter cache).

### Styling

- **`"shadow*" deprecation warning** in console. From `shadows.card` in
  `theme/tokens.ts`. React Native Web's newer renderer prefers
  `boxShadow`. Functional but noisy. Deferred.
- **Dead style keys** in `src/app/admin/index.tsx` and
  `src/app/listings/[id]/index.tsx` from earlier edits. StyleSheet.create
  tolerates them. Same future tidy-pass.

### Native parity

- **`DateField` is web-calendar / native-text.** The web target uses
  HTML5 `<input type="date">` (real calendar picker). Native falls
  back to a `TextInput` with `placeholder="YYYY-MM-DD"`. A proper
  native picker via `@react-native-community/datetimepicker` is a
  follow-up — installed but not modally wired.
- **`expo-location`, `expo-image-picker`, `expo-image`** all install.
  `expo-image` is registered in `app.json` plugins (added during the
  Node 22 clean rebuild on 2026-06-11). `expo-location` /
  `expo-image-picker` use dynamic imports in `geo.ts` and `pets.ts`
  to avoid breaking web bundles.

### Founder business decisions — locked vs open

**LOCKED (do not relitigate without founder asking):**

- **Commission split:** 5% owner-fee on top of total, 15% host-fee
  deducted from total. Locked in `payments-policy.ts`.
- **Refund tiers:** ≥48h before start = full, <48h = 50%, on/after =
  none. Anchor at Riyadh midnight.
- **Anon visibility of reviews:** Option A — anon CAN read review
  text. (Kept `reviews_select_public` from 0002.)
- **Latin numerals everywhere** in display. `toArabicDigits()` is a
  no-op pass-through.
- **Masculine Arabic register** (2026-06-14, supersedes the earlier
  feminine register).
- **Two account types — owner and host are separate accounts**
  (2026-06-15 / migration 0039). Same email cannot create both.
  Owner signup is instant; host signup requires application + admin
  approval + profile completion. Booking is universal; only listing
  creation is gated. Persona toggle is gone. `'both'` role is gone.

**STILL OPEN (per CLAUDE.md §11):**

- **Cancellation policy engine** — flexible/moderate/strict per sitter
  vs platform-wide. Today's 48h cliff is the interim. Design AFTER
  real payments land.
- **Real Saudi insurance partner** for the `تأمين` addon.
- **Custom domain for Resend** (e.g., `auth@petbnb.sa`).
- **Saudi alpha sender ID for SMS OTP** (CITC registration, multi-day).
- **Final brand name + trademark** — "Petbnb" is provisional.
- **Nafath wiring.** Stub is at `/become-host/complete-profile`
  behind `NAFATH_ENABLED=false`. Flip + wire before launch.

### Branding / data-vs-display

- Brand name "Petbnb" stays untranslated in both locales — and
  provisional until trademark clears.
- `profiles.role` `'host'` renders as "Sitter" in English UI. This is
  intentional display/data separation; don't try to unify.

### Legacy data

- **Pre-0009 bookings:** `additional_pet_discount IS NULL`. The
  display layer detects this and falls back to the stored `total_sar`;
  edit shows a warning that some details may not have transferred
  (per-pet attribution was different pre-0009).
- **Pre-R1C1 booking fee snapshots:** may have decimals (`52.5`,
  `157.5`, etc.) from the old `round2` math. The 4 fee fields are
  guaranteed whole integers only for bookings accepted AFTER R1C1
  landed (2026-06-11). When testing R1C1, force a fresh accept rather
  than checking a legacy row.
- **Legacy self-bookings** (created before R2C1's guard landed) can
  exist with `owner_id = listing.host_id`. The DB guard blocks NEW
  ones; old rows may be in the data. Doesn't break anything; just
  don't use them to validate the role-symmetric review clause (it
  collapses to a tautology when owner = host).

### Scope discipline

- Hourly / sub-night bookings are out of scope. Would require a
  different pricing model and a re-think of the date picker
  (which uses `nextDayIso()` to block same-day).
- Real push notifications stay out of unattended-batch scope —
  needs Expo project credentials + a real device.

### Dependency management

- For RN-native packages on Expo, ALWAYS use `npx expo install <pkg>`,
  never `npm install --save <pkg>`. Plain npm grabs the latest major
  and frequently mismatches the SDK's compatibility matrix. The 2026-06-11
  env saga partially involved this — bumping `expo`, `expo-image`,
  `expo-router` patch versions via `npx expo install` was what
  triggered the `app.json` plugins update for `expo-image`.

---

## 11. Common commands

### Toolchain sanity

```powershell
node -v          # Must be v20.x or v22.x. v24/v23 BREAK Metro.
npm -v
```

### Dev server

```powershell
npx expo start --clear           # Lets Metro pick port (8081, falls back to 8082)
npx expo start --web --clear     # Web target only
npx expo start --tunnel          # If LAN/firewall is hostile (uses ngrok)
```

`--clear` is important after schema/types changes so Metro regenerates
the typed-routes file. **Don't hardcode `--port 19006`** — that was a
workaround for the Node-version issue, no longer needed on Node 22.

Open the URL the terminal prints (`http://localhost:8081` or `:8082`)
in **Chrome incognito** to bypass stale service workers.

### Full local CI

```powershell
npm run ci       # i18n parity → tsc → vitest. Same as GitHub Actions.
```

Three steps in sequence. All must be green. Same suite runs on every
push to `main` and every PR via `.github/workflows/ci.yml`.

Individual pieces:

```powershell
npm run check:i18n   # i18n parity only (524 keys, 412 referenced)
npx tsc --noEmit     # Type-check only
npm test             # Vitest only (35 cases)
npm run test:watch   # Watch mode for dev
```

### Clean rebuild (the 2026-06-11 env-saga recipe)

When something is wrong and you don't know what:

```powershell
# Kill any lingering Metro / node
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Wipe + reinstall
Remove-Item -Recurse -Force node_modules
npm ci                 # Clean install from package-lock — NOT npm install

# Restart
npx expo start --clear
```

This recovered the env in ~3 minutes after the Node 24 → 22 install.
Use it any time `npx expo start` behaves oddly.

### Apply a new migration

1. Write the SQL file at `supabase/migrations/000N_*.sql`.
2. **Before writing the policy**, grep existing migrations for prior
   policies on the table: `grep -r "policy.*<table>" supabase/migrations/`.
   This is the lesson from 0030 — 0029 collided with 0002+0004 policies
   because I didn't grep first.
3. Append verification queries as commented-out SQL at the tail of
   the file. (See 0024, 0029, 0030 for the pattern.)
4. Paste the SQL into Supabase dashboard's SQL Editor → Run.
5. Run the verification queries.
6. Update `src/types/database.ts` to match.
7. Verify with `npx tsc --noEmit` and `npm run ci`.
8. Commit migration file + types in the same commit.

**For unattended batches:** write the migration but do NOT apply it.
Founder reviews after the batch and applies via the SQL Editor.

### Promote yourself to admin

If the auth user is `<admin-email>` (the founder's account — replace the
placeholder with the actual address before running):

```sql
-- Replace <admin-email> with the actual admin email
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = '<admin-email>');
```

### Identify the port-8081 occupier

If you suspect a non-Metro process on 8081:

```powershell
netstat -ano | findstr :8081 | findstr LISTENING
Get-Process -Id <PID-from-above>
```

If the process name is `macmnsvc`, that's **McAfee Management Service**
— not killable from non-elevated PowerShell. Just use port 8082.

### Git

**Remote:** PUBLIC repo at `https://github.com/nuzul-saudi/petbnb`.
Auth via Git Credential Manager (Windows Credential Manager backs the
token). The `gh` CLI is NOT used — McAfee TLS-inspection breaks its
Go HTTPS stack on this machine. Plain `git push` / `git pull` work
fine since they go through GCM, not gh's own HTTPS client.

```powershell
git log --oneline -10        # Recent commits
git status --short            # What's pending
git diff --stat               # Summary of staged changes
git push                      # Push to PUBLIC origin/main (GCM handles auth)
```

**Push policy:**
- Interactive sessions: founder controls the push.
- Unattended batches: push after each round (founder's standing
  authorization).

**Never** commit `.env` (gitignored), API keys, Supabase project IDs,
the `re_...` Resend key, or screenshots containing real user data.

---

## 12. Onboarding checklist for a fresh Claude

When you pick up this project, run these checks before suggesting any
change:

1. **Read `CLAUDE.md` cover to cover.** Especially sections 3 (build
   order), 11 (pre-launch), 12 (roles), 13 (known gaps). Skim 5 (data
   model) and 8 (design tokens).
2. **Read this file (`ONBOARDING.md`) §0 TL;DR + §4 (repo layout) +
   §6 (routing) + §9 (conventions).** Those will keep you from common
   mistakes.
3. **Read `docs/batch-decisions.md`** for the Round 1 + Round 2
   decision log. Less essential but useful context for why current
   code looks the way it does.
4. **Run `node -v`.** Must be v20.x or v22.x. If v23 or v24, fix
   that first — Metro will not work.
5. **Check `git log --oneline -30`** to see what just landed. The most
   recent commit messages tell you what state the codebase is in.
6. **Check `git status`** for uncommitted state.
   `.claude/settings.json` showing modified is expected;
   `package.json` / `package-lock.json` may show modified from
   recent `npx expo install` patch bumps; anything else is
   in-progress work.
7. **Verify the toolchain.** `npm run ci` — i18n parity + tsc +
   vitest. If any of the three turn red, fix BEFORE writing new code.
8. **Verify dev server.** `npx expo start --clear` → open the URL it
   prints in incognito. If it doesn't load, do the clean rebuild
   recipe from §11.
9. **Ask the founder which phase you're picking up.** Don't assume.

**Things NOT to do:**

- Don't suggest tech stack changes. The choices are deliberate;
  pushing back wastes a round trip.
- Don't add libraries without asking. Use `npx expo install <pkg>`
  for RN-native packages, never `npm install <pkg>`.
- Don't refactor working code "while you're in there". The founder
  reviews changes line by line.
- Don't generate docs unless asked. This file is the exception —
  and even then, ask before regenerating.
- Don't claim a feature works without smoke-testing. Pure-lib
  logic is unit-tested (vitest); UI is the founder's call.
- Don't push to remote in interactive sessions — founder controls.
  Unattended batches push after each round (standing authorization).
- Don't reintroduce Arabic-Indic numeral conversion. Founder
  decision is Latin everywhere.
- Don't write new RLS policies without grep'ing existing migrations
  first for prior policies on the same table.

**Things TO do:**

- Default to small, reviewable batches.
- Run `tsc` after every edit; `npm run ci` for larger changes.
- Confirm before committing in interactive sessions.
- Write commit messages that document the *why*, not just the *what*.
- Update both the migration file AND `src/types/database.ts` in the
  same commit when changing the schema.
- Add i18n keys in the same commit as the component that uses them.
- Use feminine Arabic register (ـكِ not ـكَ).
- Use `logWarn`/`logInfo`/`logError` from `lib/log.ts`, not raw
  `console.*`.
- Use `confirmDialog` from `lib/confirm.ts` for destructive actions.
- Use `formatSAR` from `lib/format.ts` — whole SAR, no decimals.
- Surface trade-offs and let the founder decide. They have business
  context you don't.

---

## 13. Where to look when something seems off

| Symptom | First place to look |
|---|---|
| Metro accepts connection then drops (`ERR_EMPTY_RESPONSE`) | `node -v` — must be 20.x or 22.x. If v24/v23, install Node 22 + clean rebuild (§11). |
| Expo Go on phone: "network connection was lost" | Same root cause as above — Metro is broken at the bundler. Fix Node first. |
| Port 8081 collision on Windows | `netstat -ano \| findstr :8081` → if `macmnsvc`, that's McAfee. Use 8082. |
| White screen on `/` after sign-in | `src/app/index.tsx` gating order. Check suspended-before-role rule. |
| "GO_BACK was not handled" red toast | Find a `router.back()` call — there shouldn't be any. Use `router.replace(<dest>)`. |
| English error text leaks to user | Find a `setError(e.message)` pattern → swap to `setError(t('...'))` per §9. |
| Route 404 at runtime but tsc happy | Index-route quirk (§6). Use `@ts-expect-error` + bare URL string. |
| `tsc` rejects a known route | Restart dev server with `--clear` so typed routes regenerate. |
| Empty bookings/pets list | RLS — check `auth.uid()` matches `owner_id`. Likely signed-out / wrong account. |
| Listings missing from feed | **Not `is_active` anymore.** Check `status='approved'` AND host `is_verified=true` AND host `is_suspended=false` AND listing city matches the selected city. |
| Photo not loading | 7-day signed URL likely expired — re-upload via the pet/listing edit flow. |
| Admin can't see something | They should see everything — check `is_admin()` is invoked. Also check role really is `'admin'` in profiles. |
| Suspended user gets normal UI | Gating order in `src/app/index.tsx` — suspended must come before role. |
| Console flooded with `"shadow*"` warning | Known. `theme/tokens.ts` uses old shadow API. Deferred. |
| Build crashes mid-edit | Commit what you have (`wip:` prefix is fine), then resume with smaller turns. |
| Booking detail shows both Edit AND Accept buttons | Pre-R2C1 fix that's now defense-in-depth (owner and host are separate accounts since 0039). Mode is role-driven: `isOwnerMode = profile?.role !== 'host'`; `isHostMode = profile?.role === 'host'`. |
| Self-booking insert succeeds when it shouldn't | Check `bookings_insert_owner` policy body via `pg_get_expr(polwithcheck, polrelid)`. Should include `owner_id <> ( SELECT host_id FROM public.listings`. If missing, migration 0029 wasn't applied. |
| Anon visitor can't see review text | Check `reviews_select_public` policy. Should have `polroles = {anon,authenticated}`. If `{authenticated}` only, migration 0030 wasn't applied. |
| Whole-SAR fee fields show decimals | Booking accepted pre-R1C1 with the old `round2` math. NOT a current bug; force a fresh accept to verify R1C1. |
| Fresh `requested` booking but pending-host badge doesn't increment | The host-notifications context's `pendingRefreshTick` only fires on focus. Navigate away + back, or call `refreshPendingHostCount()`. |
| Host can't create a listing after admin approval | `/listings/new` redirects when `host_profile_complete=false`. They need to finish `/become-host/complete-profile` (bio at minimum). DB RLS in 0039 enforces; UI just routes them. |
| New host signup blows up at OTP send | Email already exists as an owner. Same email can't create both account types. Use a different email. (Pre-OTP hint is a pre-launch item.) |
| "Become a Host" CTA missing from header | Only shown to guests + `role='owner'`. Hosts and admin don't see it. If a guest doesn't see it, check `AppHeader.tsx` — the gate is `isGuest \|\| profile?.role === 'owner'`. |
| Listings missing from feed (anon) | Three layers: `status='approved'` + host `is_verified=true` + host `is_suspended=false`. Plus narrow anon SELECT on profiles (0037) and SECURITY DEFINER on `is_admin()` (0038). If broken: check column-level GRANTs on `public.profiles` for the `anon` role — should be exactly 6 fields. |

---

## Closing note

This document is intentionally session-agnostic: it covers stable
architecture, conventions, and gotchas. Session-specific state (what
was committed last, what's planned next) lives in chat handoff
messages and in `docs/batch-decisions.md`, not here. Update this file
as conventions or architecture evolve, not as commits land.

The authoritative project spec is and remains [`CLAUDE.md`](./CLAUDE.md).
This file exists so a new Claude session can come up to speed in one
read without losing context that's only in chat history. For decision
trails of recent batches, also read
[`docs/batch-decisions.md`](./docs/batch-decisions.md).

Good luck. 🐈

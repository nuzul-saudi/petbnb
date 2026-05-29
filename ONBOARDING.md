# Petbnb — Onboarding for a Fresh Claude Session

> **You are picking up an in-progress build.** Read this whole document
> before touching code or making suggestions. The authoritative project
> spec is [`CLAUDE.md`](./CLAUDE.md) at the project root — Sections 11
> (pre-launch tasks) and 13 (known gaps from testing) are where most
> "why didn't they just…" questions get answered.

---

## 0. TL;DR

- **What:** Petbnb is a Saudi Arabia–first, Arabic-language, RTL pet-hosting
  marketplace MVP (Airbnb-for-cats; pivoting to cats+dogs in Step 5.7).
- **Stage:** Steps 1 → 5.6 shipped; Step 5.7 (multi-species) and Steps 6–10
  (condition reports, host flow, bookings tracking, messaging, marketplace)
  are next.
- **Who built it:** Non-technical founder + Claude pairing one step at a
  time. Founder reviews every plan; Claude writes the code and runs
  verifications.
- **Stack:** Expo (React Native) + TypeScript + Supabase (Postgres + Auth
  + Storage + RLS) + Resend (custom SMTP for email OTP).
- **Web first.** Dev server runs on `http://localhost:19006`. Port 8081 is
  squatted by McAfee on this machine and silently breaks Expo's default —
  always start with `--port 19006`.
- **Working style:** strict one-file-per-turn for large writes, tsc after
  every edit, explicit commits per phase, no surprise scope changes.

If you only have time for two sections, read **§4 Repo layout** and
**§9 Conventions** — those will keep you from making mistakes that take a
back-and-forth round trip to fix.

---

## 1. Working with the founder

- Non-technical but engaged. After every meaningful change, summarize in
  plain language what you did, why, and what they'll see on screen.
- They review specs before code lands. Don't write code until they
  greenlight a plan.
- One file per turn for large writes (50+ lines). Same-shape micro-edits
  across multiple files in one turn is fine (e.g., adding `console.warn`
  + `t()` to 15 catch blocks).
- Run `npx tsc --noEmit` after every file edit. Clean → continue. Errors
  that aren't transient route-regen → stop and report.
- Always confirm a smoke test passed before committing a phase. The
  founder runs tests in the browser; you don't.
- Crashes have hit us mid-session. To survive crashes: tiny turns +
  per-phase commits = safe checkpoints.

---

## 2. What we're building (MVP scope)

A two-sided mobile marketplace for Saudi Arabia connecting **cat owners**
with **verified hosts** who board pets in their own homes (Airbnb-style),
plus add-on services (grooming, vet, transport, insurance) and a facilitation-only product
marketplace. **Arabic-first, RTL, mobile-first.**

This is an MVP — first ~100 bookings in one Riyadh neighborhood — NOT a
scaled production system. Working core flows > feature completeness.

**Post-prototype scope clarification (CLAUDE.md §0.5):** A long-term-vision
prototype surfaced a multi-service pet super-app (hosting + vet + grooming
+ transport + store + insurance + records + consultation). We're shipping
**hosting only** for MVP. The other 7 services are post-launch — they get
"قريباً" (coming soon) tiles on a Phase 2 home-screen polish task.

**Step 5.7 expansion:** Founder decided to launch with cats AND dogs
(originally cats-only). Adds species selector, species-aware breed picker,
listings declare which species they accept. Not yet built; see
`CLAUDE.md` §13 item 10 for full scope.

---

## 3. Tech stack (do not substitute without asking)

| Layer | Choice |
|---|---|
| Framework | Expo (React Native) + Expo Router |
| Language | TypeScript, strict mode |
| Backend | Supabase: Postgres + Auth + Storage + Row Level Security |
| Auth (dev) | Email OTP (Supabase + Resend custom SMTP) |
| Auth (pre-launch) | Saudi phone OTP via Unifonic/Taqnyat (Send SMS Hook + Edge Function). `src/lib/phone.ts` is pre-staged with the E.164 normalizer. |
| Payments | Mocked. `PaymentProvider` interface in `src/lib/payment.ts` → `MockPaymentProvider` charges 0%. Pre-launch swap to Moyasar/HyperPay. |
| State | React Context (auth/session) + Supabase JS direct (server state — no TanStack yet) |
| i18n | Hand-rolled. `src/lib/i18n.ts` + `src/locales/ar.json`. Param substitution via `{name}` style. |
| Styling | Single theme file `src/theme/tokens.ts`. RTL default. |
| Location | `src/lib/geo.ts` wraps `navigator.geolocation` (web) and `expo-location` (native). |
| Image picker | `expo-image-picker` (native) + `<input type="file">` (web), wrapped in `src/lib/pets.ts` `pickPetPhoto()`. |
| Date picker | HTML5 `<input type="date">` on web. Native picker is TODO (modal not wired). |

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
├── app.json                    ← Expo base config
├── package.json                ← Deps
├── tsconfig.json               ← @/* maps to src/*
├── .env                        ← gitignored. Holds SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY
├── .gitignore
│
├── src/
│   ├── app/                    ← Expo Router file-based routes
│   │   ├── _layout.tsx         ← Root: AuthProvider + Stack
│   │   ├── index.tsx           ← Signed-in home. Role-branched.
│   │   ├── suspended.tsx       ← Account-suspended dedicated screen
│   │   ├── profile.tsx         ← Customer profile (edit name + role + pets link)
│   │   ├── (auth)/             ← Auth route group (no URL prefix)
│   │   │   ├── _layout.tsx
│   │   │   ├── sign-in.tsx     ← Email entry
│   │   │   ├── verify.tsx      ← OTP entry (6 digits)
│   │   │   └── role.tsx        ← First-time role pick (uses RoleEditor)
│   │   ├── admin/              ← Admin dashboard (role='admin' only)
│   │   │   ├── _layout.tsx     ← Admin gate (redirects non-admins)
│   │   │   ├── index.tsx       ← Dashboard with queue cards
│   │   │   ├── hosts.tsx       ← Pending host applications queue
│   │   │   ├── users.tsx       ← All users with search + filter chips
│   │   │   ├── users/[id].tsx  ← User detail/edit + suspend
│   │   │   ├── listings.tsx    ← All listings + pending filter
│   │   │   ├── listings/[id].tsx ← Listing detail/edit + activate
│   │   │   └── bookings.tsx    ← Read-only bookings overview
│   │   ├── bookings/
│   │   │   ├── index.tsx       ← "My Bookings" list (owner-facing)
│   │   │   └── [id].tsx        ← Single booking confirmation/status
│   │   ├── listings/[id]/
│   │   │   ├── index.tsx       ← Public listing detail page
│   │   │   └── request.tsx     ← Booking request flow
│   │   └── pets/
│   │       ├── index.tsx       ← "My Cats" list
│   │       └── [id].tsx        ← Pet edit (id="new" for create mode)
│   │
│   ├── components/             ← Reusable UI components
│   │   ├── ListingCard.tsx     ← Sitter-first card for owner feed
│   │   ├── PhotoGallery.tsx    ← Swipeable photos for listing detail
│   │   ├── RoleEditor.tsx      ← Owner/host/both role-card picker
│   │   └── BreedPicker.tsx     ← Horizontal breed tile picker
│   │
│   ├── lib/                    ← Data + utility layer
│   │   ├── supabase.ts         ← Typed Supabase client + pingSupabase()
│   │   ├── auth.tsx            ← AuthProvider + useAuth(). Has KNOWN/TODO blocks.
│   │   ├── i18n.ts             ← t(key, params?) returning string
│   │   ├── format.ts           ← toArabicDigits, formatSAR, nightsBetween, todayIso
│   │   ├── geo.ts              ← Cross-platform getCurrentLocation()
│   │   ├── phone.ts            ← Saudi E.164 normalizer (pre-staged, no callers yet)
│   │   ├── payment.ts          ← PaymentProvider interface + MockPaymentProvider
│   │   ├── breeds.ts           ← BREEDS array (10 cat breeds + 'unknown')
│   │   ├── listings.ts         ← Feed queries + distanceKm haversine
│   │   ├── pets.ts             ← Pet CRUD + photo upload helpers
│   │   ├── bookings.ts         ← Booking create/read + multi-pet via junction
│   │   └── admin.ts            ← Admin queries (uses admin_list_users RPC)
│   │
│   ├── types/
│   │   └── database.ts         ← Hand-maintained Database type. See §5.
│   │
│   ├── theme/
│   │   └── tokens.ts           ← Single source of truth for colors/fonts/spacing
│   │
│   ├── locales/
│   │   └── ar.json             ← All Arabic strings. Hierarchical keys.
│   │
│   └── assets/
│       └── breeds/             ← 10 cat-breed JPGs from Wikimedia
│
└── supabase/
    └── migrations/             ← Numbered SQL files. Apply via Supabase dashboard SQL Editor.
        ├── 0001_initial_schema.sql      ← 11 tables (Step 3)
        ├── 0002_rls_policies.sql        ← Row-level security (Step 3)
        ├── 0003_storage_buckets.sql     ← 6 storage buckets (Step 3)
        ├── 0004_admin_role.sql          ← admin role + is_verified + is_suspended (Step 4.5)
        ├── 0005_admin_rpc.sql           ← admin_list_users SECURITY DEFINER (Step 4.5)
        ├── 0006_pet_health_fields.sql   ← medical/dietary/medications (Step 5.5)
        └── 0007_step_56_schema.sql      ← booking_pets junction + listings.lat/lng (Step 5.6)
```

---

## 5. The data model

11 tables in `public`, all with RLS enabled. Migration history in
`supabase/migrations/`; type mirror in `src/types/database.ts`.

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | 1:1 with `auth.users`. Auto-created by trigger. | Roles: `owner`, `host`, `both`, `admin`. Plus `is_verified` (admin-set trust badge for hosts) and `is_suspended` (admin block). |
| `pets` | Owner's cats. | Health fields added in 5.5. `photo_url` holds a 7-day signed URL from `pet-photos` bucket (private). |
| `listings` | Host's home offering. | `is_active` defaults `false` for self-registered (Step 7) and `true` for admin-created (seed). `lat/lng` added in 5.6 (nullable). |
| `listing_photos` | Airbnb-style home gallery. | `photo_url` is direct public URL (listing-photos bucket IS public). |
| `bookings` | Owner-side requests. | Statuses: `requested → accepted → active → completed`; also `declined`, `cancelled`, `disputed`. `nights` is a generated column. `pet_id` still NOT NULL but **shadowed by `booking_pets` junction** (5.6) — a follow-up migration will drop it. |
| `booking_pets` | **5.6 junction.** | Composite PK `(booking_id, pet_id)`. RLS mirrors `bookings`. INSERT-only (no UPDATE/DELETE policies). |
| `booking_addons` | Multi-select services per booking. | Multi was added in 5.5C — schema always supported it; UI used single-radio until then. |
| `condition_reports` | Check-in / check-out evidence. | **Immutable** by RLS (no UPDATE/DELETE policies). Step 6 builds the UI. |
| `daily_updates` | Host posts during stay. | Immutable. Step 7 builds the UI. |
| `messages` | Booking-scoped chat. | Immutable. Step 9 builds the UI. |
| `reviews` | Two-way post-stay. | Step 10 builds the UI. UNIQUE `(booking_id, rater_id)`. |
| `products` | Marketplace display only. | Read-only for clients. Admin manages via Supabase dashboard. |

**RLS philosophy:**
- Two helper functions: `public.is_admin()` and `public.is_active_user()`,
  both `STABLE` so the planner treats them as initPlans.
- Almost every write policy has `OR public.is_admin()` (admin bypass) and
  `AND public.is_active_user()` (suspended block).
- Listings have **Q6 verified-host gating**: non-host viewers only see
  listings where the host is `is_verified = true AND is_suspended = false`
  AND the listing is `is_active = true`. Host themselves always sees own
  listings.
- Tables holding evidence (`condition_reports`, `daily_updates`,
  `messages`, `reviews`) have **no UPDATE/DELETE policies** — RLS
  default-deny enforces immutability.

**Storage buckets (Step 3):**
- `listing-photos` (public): `<listing_id>/<filename>`
- `profile-avatars` (public): `<user_id>/<filename>`
- `pet-photos` (private): `<owner_id>/<pet_id>/<filename>`
- `condition-report-photos` (private, immutable): `<booking_id>/<filename>`
- `daily-update-media` (private, immutable): `<booking_id>/<filename>`
- `product-images` (public, admin-only writes)

**Database types are hand-maintained** in `src/types/database.ts` (the
Supabase CLI's type-gen requires reaching `api.supabase.com` which McAfee
TLS-inspects/breaks on this machine). When changing the schema, update
both the migration file AND the types file in the same commit.

---

## 6. Auth + routing

**Auth flow (Step 4):**
1. User enters email → `supabase.auth.signInWithOtp({ email })`
2. Resend (custom SMTP) sends a 6-digit code in Arabic (template configured
   in Supabase dashboard, not in code)
3. User enters code → `supabase.auth.verifyOtp({ email, token, type: 'email' })`
4. First time only: hits `/role` to pick name + role (RoleEditor)
5. Lands on the role-appropriate home

**Auth context** lives in `src/lib/auth.tsx` (`.tsx` because it has JSX —
the file extension matters). `useAuth()` returns `{ initializing, session,
user, profile, signOut, refreshProfile }`.

**Routing gates (Step 4.5):**
```
not signed in           → /sign-in
session + suspended     → /suspended         (priority over role)
session + empty name    → /role               (fresh-profile signal)
session + role=admin    → /admin
session + role=host     → host placeholder (Step 7 will fill in)
session + owner|both    → owner feed
```

**The Expo Router file-path-vs-URL quirk (important):**

When a folder has `index.tsx` AND `[id].tsx` (e.g., `bookings/index.tsx` +
`bookings/[id].tsx`), Expo Router's typed-routes union lists
`/bookings/index` and `/bookings/[id]` but NOT `/bookings`. The runtime
URL however IS `/bookings`. Calling `router.push('/bookings/index')` at
runtime gets matched by the dynamic `[id]` route as `id='index'` → 400
error from PostgREST trying to query with `id=eq.index`.

**Fix pattern (used in `src/app/index.tsx`, `src/app/profile.tsx`,
`src/app/pets/[id].tsx`):**
```tsx
// @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes.
router.replace('/bookings')
```
Use this pattern for any nav to `/bookings` or `/pets`. **Do NOT use
`router.back()` anywhere** — it dispatches `GO_BACK` which fails when no
history exists (deep link, refresh, post-replace). Use
`router.replace(<explicit destination>)` instead. There are zero
`router.back()` calls in the codebase; keep it that way.

**Roles in detail (CLAUDE.md §12):**
- `owner` — browses, books, messages, files condition reports, leaves
  reviews. Can't create listings.
- `host` — creates listings (Step 7), accepts/declines bookings (Step 7),
  posts daily updates (Step 7), participates in condition reports/messages/reviews.
- `both` — superset of owner + host. Sees owner feed as home; host dashboard
  reached separately (Step 7).
- `admin` — founder-only vetting account. Sees admin dashboard. Can
  approve/reject hosts, approve/reject listings, edit any profile/listing,
  suspend/unsuspend. Multi-admin permission levels are post-MVP.

---

## 7. What's been built (commit history)

```
46e58d9  5.6B.7: location-aware feed — geo prompt + distance display + nearest-first sort
9ad3e93  5.6B.6: booking flow — pet picker from profile, multi-select, calendar auto-focus
fdcea14  5.6B.5: BreedPicker + photo upload UI in pet edit
cc65631  5.6B.4: breed picker data (Wikimedia photos) + pet photo upload helper
5b84d2b  5.6B.3: backend — multi-pet bookings + geo helper + distance sort
7d7a0f4  5.6B.2: types — booking_pets junction + listings lat/lng
b4125f4  5.6A.1: back-link fix — use router.replace with explicit destination instead of router.back()
2184f94  5.6A: booking back button + Arabic error sweep + all-addons in confirmation
38b0af5  5.5B: backend helpers — pet CRUD + completed-bookings counter
999a821  5.5A: pet health fields (migration + types)
5906690  5.5C: multi-addon booking, date picker, sitter-first listing UX
f9ae1de  5.5C: customer profile, pet management, my bookings
792b168  5.5C: extract RoleEditor for reuse on profile screen
333523a  docs: section 11 — completed-bookings counter visibility note
652837e  docs: known gaps from test round 1 + Step 8 rename
4be0646  Step 4.5: admin role, host verification, account suspension
7381be7  Step 5: owner browse + booking request flow (mock payment)
9002564  Step 4: authentication (email OTP)
0481f24  Step 3: database schema, RLS, storage, and typed client
d871b8d  Step 2: Supabase wiring complete
794599d  Render layout immediately; let fonts swap in async
3c9752a  Step 1: scaffold Expo with Arabic/RTL theme + i18n foundation
```

**Phase summaries:**

- **Step 1** — Expo scaffold, Arabic/RTL theme, i18n skeleton, Tajawal + Reem Kufi fonts.
- **Step 2** — Supabase wiring. `app.config.ts` reads `.env` and exposes via `Constants.expoConfig.extra`. Connection probe on home page.
- **Step 3** — 11 tables, RLS policies, 6 storage buckets, hand-maintained types.
- **Step 4** — Email OTP auth + 3-screen flow + role-pick + auth-gated home. Custom SMTP via Resend.
- **Step 4.5** — Admin role + admin dashboard + verified-host visibility gating + suspended-user screen.
- **Step 5** — Owner browse feed, listing detail, booking request flow, mock payment, booking confirmation.
- **Step 5.5** — Customer profile, pet management, My Bookings, multi-addon, real date picker (web), sitter-first listing cards.
- **Step 5.6** — Pet/booking polish: multi-pet bookings (via `booking_pets` junction), pet photo upload (private bucket, 7-day signed URLs), breed picker with Wikimedia photos, location-aware feed with haversine distance sort, full Arabic error sweep, booking-flow back button.

---

## 8. What's next

Per the build order in `CLAUDE.md` §3 + the gaps log in §13:

1. **Step 5.6 follow-up items still open:**
   - Some `router.back()` may have crept back in user-submitted code —
     audit and replace if you see any.
   - Native date picker modal (`@react-native-community/datetimepicker`
     is installed but not wired with a modal).
   - Pet photo flow loses booking-request state when user navigates out
     to add a pet.
2. **Step 5.7 — Multi-species expansion.** Tagline update (cats → pets),
   species selector in pet creation, species-aware breed lists with
   separate thumbnails, listings declare `accepts_species`, owner feed
   filter by species. Larger than typical Step 5.x; warrants its own phase.
3. **Step 6 — Condition reports.** Check-in / check-out shared report,
   3+ photos per phase, both parties confirm. Immutable evidence per RLS.
   CLAUDE.md §6 — highest priority feature.
4. **Step 7 — Host flow.** Create listing, upload home gallery, accept/decline
   bookings, post daily updates, host availability calendar (gap c).
   Self-registered listings default `is_active=false` and enter the admin queue.
5. **Step 8 — Bookings list + status tracking + profile/settings expansion.**
   Adds pickup/dropoff coordination (i), emergency vet contact (j).
6. **Step 9 — Messaging** (owner ↔ host, booking-scoped).
7. **Step 10 — Marketplace** display-only.

Pre-launch tasks live in `CLAUDE.md §11` — none of them should land in a
build step; they're explicitly launch-blockers.

---

## 9. Conventions to follow

### Code

- **TypeScript strict.** No `any` without a justifying comment.
- **Run `npx tsc --noEmit` after every file edit.** Catches typed-route
  drift and missing imports immediately.
- **Per-phase commits.** Each batch gets one logical commit with a
  message that lists files + intent + rationale. See §7 for prior style.
- **Don't add features that weren't asked for.** "While I'm in there"
  refactors break the founder's review model.
- **Don't write docs files (READMEs) unless explicitly requested.**

### i18n

- All user-facing strings go through `t('scope.key')`.
- Keys are added to `src/locales/ar.json` in the same turn as the
  component using them.
- Param substitution: `t('home.signed_in_greeting', { name: x })` →
  the `{name}` placeholder is replaced.
- A missing key returns the key string and logs `[i18n] missing key: X`
  in dev console.

### Arabic / RTL

- Layout is RTL by default (`I18nManager.forceRTL(true)` + `document.dir = 'rtl'` on web).
- **Numbers**: use `toArabicDigits(n)` from `src/lib/format.ts` for
  display. Database stores Latin digits.
- **Currency**: always `ر.س`. Never `$`. Use `formatSAR(amount)`.
- **Email and date inputs** are visually LTR (set `textAlign: 'left'`)
  even inside RTL layout.
- **Phone format**: `+966 5X XXX XXXX` per Saudi convention. E.164
  normalizer in `src/lib/phone.ts`.

### Error handling

After Step 5.6's Arabic error sweep, the pattern is:

```ts
} catch (e) {
  console.warn('[scope.action]', e);  // dev console gets the technical detail
  setError(t('scope.action_failed'));  // user-facing Arabic message
}
```

**Don't** `setError(e.message)` — that surfaces English Supabase error
text. Don't `setError(e instanceof Error ? e.message : t(...))` — that's
the old pattern (5.6A swept it).

### Loading + empty states

Every screen must handle: `loading`, `error`, `empty`. Never render a
blank screen.

### Navigation

- Use `router.replace(<explicit destination>)`, never `router.back()`.
- For dynamic routes use the object form:
  `router.push({ pathname: '/listings/[id]', params: { id } })`.
- For URL forms that the typed-routes union rejects (the index-route
  quirk): use `@ts-expect-error` directive with the standard comment
  block. See §6 above for the exact pattern.

### Files

- `.tsx` extension is required for any file with JSX. `.ts` is for pure
  logic.
- Path alias `@/` maps to `src/`. Use `@/lib/auth`, not `../../lib/auth`.
- Components in `src/components/`. Screens in `src/app/`. Helpers in
  `src/lib/`.

### Comments

- Comment the **why**, not the **what**. Code shows what; comments
  explain non-obvious constraints, workarounds, trade-offs.
- Defaults to **no comments**. Only add when removing the comment would
  confuse a future reader.

---

## 10. Known quirks + deferred items

### Environment / network

- **McAfee squats port 8081** on this machine. Default Expo port. Always
  start with `--port 19006`: `npx expo start --web --port 19006 --clear`.
- **McAfee TLS-inspects `api.supabase.com`** — Supabase CLI auth and
  remote type-gen are blocked. We hand-maintain `src/types/database.ts`
  instead.
- **The `.claude/settings.json` file** may show as modified — that's the
  Claude Code per-developer config, intentionally not committed.

### Routing

- Index-route file-vs-URL quirk (see §6). Affects `/pets`, `/bookings`.
  `/admin` works fine because it has enough sibling files.

### Auth / Storage

- **Resend sandbox sender** (`onboarding@resend.dev`) only delivers to
  the Resend account owner's email (currently `nahdiua@gmail.com`).
  Pre-launch: verify a real domain (e.g., `auth@petbnb.sa`).
- **Pet photos are 7-day signed URLs** stored in `pets.photo_url`.
  Production pattern is path-in-DB + on-render signing — listed in
  `CLAUDE.md §11`.
- **`completed_bookings_count`** is always 0 from non-host viewers due
  to bookings RLS. MVP-fine (no completions yet); listed in
  `CLAUDE.md §11` with the two viable fixes.

### Styling

- **`"shadow*" deprecation warning** in console. From `shadows.card` in
  `theme/tokens.ts`. React Native Web's newer renderer prefers `boxShadow`.
  Functional but noisy. Deferred to a future tidy-pass commit.
- **Dead style keys** in `src/app/admin/index.tsx` (`cardDisabled`,
  `navRowDisabled`) and `src/app/listings/[id]/index.tsx` (`metaBlock`,
  `metaLine`) from earlier-state edits. StyleSheet.create tolerates them.
  Same tidy-pass.

### Native parity

- **Date picker is HTML5 web-only.** Native picker (`@react-native-community/datetimepicker`)
  is installed but not wired with a modal.
- **`expo-location` and `expo-image-picker` are installed.** Dynamic-imported in
  `geo.ts` and `pets.ts` to avoid breaking web bundles.
- **`app.config.ts` plugin entry** is NOT added for either — that's needed
  for native builds. Add when you build for iOS/Android.

### Founder business decisions still open (CLAUDE.md §11)

- Cancellation policy (flexible/moderate/strict per sitter, or platform-wide).
- Service fee model (Rover ~20% vs subscription vs other).
- Real Saudi insurance partner for the `تأمين` addon.
- Custom domain for Resend (e.g., `auth@petbnb.sa`).
- Saudi alpha sender ID for SMS OTP (CITC registration, multi-day).

---

## 11. Common commands

### Dev server

```powershell
npx expo start --web --port 19006 --clear
```

`--clear` is important after schema/types changes so Metro regenerates
the typed-routes file. Without `--port 19006`, McAfee on 8081 silently
breaks the server.

### Type-check

```powershell
npx tsc --noEmit
```

Empty output = success. Errors are usually real. If a route literal is
rejected, see §6's quirk.

### Apply a new migration

1. Write the SQL file at `supabase/migrations/000N_*.sql`.
2. Paste the SQL into Supabase dashboard's SQL Editor → Run.
3. Update `src/types/database.ts` to match (in the same commit).
4. Verify with `npx tsc --noEmit`.
5. Commit both the migration file and the types in one commit.

### Promote yourself to admin

If the auth user is `nahdiua@gmail.com` (the founder's account):

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'nahdiua@gmail.com');
```

### Reset the McAfee port collision

If the dev server seems stuck on 8081:

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 8081 }
```

If `OwningProcess` is `macmnsvc`, that's McAfee. Restart Expo with
`--port 19006`.

### Git

```powershell
git log --oneline -10        # Recent commits
git status --short            # What's pending
git diff --stat              # Summary of staged changes
```

**Never** commit `.env` (gitignored), API keys, Supabase project IDs, or
the `re_...` Resend key.

---

## 12. Onboarding checklist for a fresh Claude

When you pick up this project, run these checks before suggesting any
change:

1. **Read `CLAUDE.md` cover to cover.** Especially sections 3 (build
   order), 11 (pre-launch), 12 (roles), 13 (known gaps). Skim 5 (data
   model) and 8 (design tokens).
2. **Read this file (`ONBOARDING.md`) §4 (repo layout), §6 (routing),
   §9 (conventions).** Those will keep you from common mistakes.
3. **Check `git log --oneline -10`** to see what just landed. The most
   recent commit message tells you what state the codebase is in.
4. **Check `git status`** for uncommitted state. `.claude/settings.json`
   showing modified is expected; anything else is in-progress work.
5. **Verify dev server runs.** `npx expo start --web --port 19006 --clear`
   → wait for "Waiting on http://localhost:19006" → open it.
6. **Run `npx tsc --noEmit`.** Should be clean. If not, that's the first
   thing to fix.
7. **Ask the founder which phase you're picking up.** Don't assume.

**Things NOT to do:**

- Don't suggest tech stack changes. The choices are deliberate; pushing
  back wastes a round trip.
- Don't add libraries without asking. Especially nothing that introduces
  new dev-dep installs (npm flakes with McAfee + the build crashes mid-turn).
- Don't refactor working code "while you're in there". The founder reviews
  changes line by line.
- Don't generate docs unless asked. This file is the exception — and
  even then, ask before regenerating.
- Don't claim a feature works without the founder running a smoke test.
  You don't test in the browser; they do.
- Don't push to remote. The founder controls deploys.

**Things TO do:**

- Default to small, reviewable batches.
- Run `tsc` after every edit.
- Confirm before committing.
- Write commit messages that document the *why*, not just the *what*.
- Update both the migration file AND `src/types/database.ts` in the same
  commit when changing the schema.
- Add i18n keys in the same commit as the component that uses them.
- Surface trade-offs and let the founder decide. They have business
  context you don't.

---

## 13. Where to look when something seems off

| Symptom | First place to look |
|---|---|
| White screen on `/` after sign-in | `src/app/index.tsx` gating order |
| "GO_BACK was not handled" red toast | Find a `router.back()` call (there shouldn't be any) |
| English error text leaks to user | Find a `setError(e.message)` pattern → swap to §9's pattern |
| Route 404 at runtime but tsc happy | Index-route quirk (§6). Use `@ts-expect-error` + URL form. |
| `tsc` rejects a known route | Restart dev server with `--clear` so typed routes regenerate |
| Empty bookings/pets list | RLS — check `auth.uid()` matches `owner_id` |
| Photo not loading | 7-day signed URL likely expired — re-upload |
| Listings missing from feed | Host `is_verified=false` OR `is_suspended=true` OR listing `is_active=false` |
| Admin can't see something | They should see everything — check `is_admin()` is invoked |
| Suspended user gets normal UI | Gating order in `src/app/index.tsx` — suspended must come before role |
| Console flooded with `"shadow*"` warning | Known. `theme/tokens.ts` uses old shadow API. Deferred. |
| Build crashes mid-edit | Commit what you have, then resume with smaller turns |

---

## Closing note

This document is a snapshot of the project as of the end of **Step 5.6
Batch B**. When you make material changes — new phase commits, new
deferred items, new gotchas — append to the appropriate section and
commit the doc update separately.

The authoritative project spec is and remains [`CLAUDE.md`](./CLAUDE.md).
This file exists so a new Claude session can come up to speed in one
read without losing context that's only in chat history.

Good luck. 🐈

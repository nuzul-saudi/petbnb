# Migration 0051 / Phase 5 — Realtime + pet-photo paths + response badge (PLAN)

> **Status: PLAN — not yet built.** Plan-doc-first (a migration + a
> realtime dashboard toggle). Flow: this doc → Strategy review → build
> (SQL written-not-applied, app code) → line-by-line SQL review → Omar
> applies + flips the realtime toggle → verification → apply log.
>
> **Baseline:** main through Phase 4 (0050 applied; 0049 written-not-
> deployed). Migrations applied through **0050**.

## 1. Goal & scope (from the plan, extended by founder)

- **Realtime** — messages appear on the other side without a focus-
  refetch; **extended to the notifications table**: a live 🔔 badge bump
  + an in-page toast when a notification arrives.
- **Pet photos** — survive week-long bookings (no day-8 broken image).
- **Response-time badge** — a liquidity trust signal on listings.

## 2. Existing-state audit (this reshaped two of the three items)

- **Realtime — PARTIALLY built.** `src/hooks/useMessages.ts` (Round 9)
  already opens a `postgres_changes` INSERT channel per `bookingId` and
  refetches on event, with focus-refetch as fallback; it's wired into
  `bookings/[id].tsx`. **BUT:**
  - The **inquiry timeline** (`/inquiries/[id]`, the β-model primary chat
    surface) and the **notifications** bell have **no** realtime — both
    are focus/action-refetch only (`host-notifications.tsx` says as much).
  - Realtime **delivery** requires the table to be on the
    `supabase_realtime` **publication** — a dashboard toggle. **VERIFY
    whether `messages` is even published today**; if not, the Round 9
    subscription is dormant (subscribes, never receives) — which would
    explain any "chat isn't live" reports. That check is step 1 of Part A.
- **Pet photos — ALREADY BUILT (Round 6), just under a different column
  name.** `uploadPetPhoto` returns the **storage path** (not a signed
  URL); it's persisted in `pets.photo_url`; `signPetPhotoUrl(pathOrUrl)`
  signs on render with a **1-hour TTL** (legacy `https://…` rows returned
  as-is), and `signPetPhotoUrls` batches for lists. Render sites
  (`PetAvatar.tsx`, `pets/[id].tsx`) already call them. **So Strategy's
  "migration 0051 — `pets.photo_path`, sign-on-render 1h" is ~90% done —
  the path already lives in `photo_url`.** See Part B for the (small)
  remainder + the rename decision.
- **Response badge — NOT built.** `get_host_ratings` (0032) is the
  SECURITY DEFINER RPC pattern to copy. `ListingCard` already renders
  tier + rating pill + "new" badge — the response badge slots in there.
- **Toast — none exists.** Part A builds a minimal in-app toast.

## 3. Part A — Realtime (messages + notifications)

### A1. Enable the realtime publication (⛔ dashboard toggle)
Supabase Dashboard → Database → Replication → add `public.messages` and
`public.notifications` to the `supabase_realtime` publication. This is
**not a SQL migration file** — document it in `docs/migration-apply-log.md`
as a toggle (per the Round 9 precedent that "channel subscription is
client-side only"). Nothing client-side receives events until this is on.

### A2. Realtime for the inquiry timeline
Add the same `postgres_changes` INSERT pattern as `useMessages`, but keyed
to the inquiry + its linked bookings (the β timeline spans both):
- One channel per inquiry id; filter `inquiry_id=eq.<id>` for inquiry
  messages, plus the linked bookings' `booking_id` filters (or a single
  channel that refetches the timeline on any relevant INSERT — simpler,
  and the timeline already has `refetchTimeline`).
- **Refetch-on-INSERT** (no optimistic insert — Round 9 decision: the
  cached fetch stays the single source of truth). Keep the existing
  focus-refetch as fallback. Tear down on unmount / id change.

### A3. Realtime for notifications (badge bump + toast)
- In `host-notifications.tsx` (the provider that owns `unreadCount`),
  subscribe to `postgres_changes` INSERT on `notifications` filtered
  `user_id=eq.<me>`. On event: `refreshUnread()` (badge bumps live) and
  push a toast.
- **New `ToastProvider`** (`src/lib/toast.tsx`) mounted in `_layout.tsx`:
  a lightweight context exposing `showToast(message)`; renders a single
  transient card (auto-dismiss ~4s, tap to open). The notification toast
  shows the localized `title_key` + routes to `link_path` on tap.
- **D-A1:** toast only for the CURRENT user's own notifications (the RLS
  filter guarantees it) and only while the app is foregrounded (web). No
  OS push — that's post-pilot (needs native).

## 4. Part B — Pet photos (finish the Round-6 migration)

The core (store-path + 1h sign-on-render) is live. Remaining work is
small and mostly optional:

- **D-B1 (column rename?)** — the path lives in `pets.photo_url`, a
  misleading name. Options: **(a) keep `photo_url`** — zero churn, it
  already holds the path, the name is a wart but harmless; **(b) rename
  to `photo_path`** — clearer, but a migration + a sweep of every
  read/write site + `database.ts`. **Recommendation: (a) KEEP** — the
  behavior is correct; a rename is cosmetic and risky for no user value.
  If Strategy wants the rename for clarity, it's a mechanical migration
  0051 + code sweep; flag it.
- **Legacy `https://…` rows** (pre-Round-6 7-day signed URLs): the sign
  helpers already pass them through until expiry. Add: (1) a one-time
  **backfill** that parses the storage path out of any legacy signed URL
  and rewrites `photo_url` to the bare path (SQL or a script); (2) a
  **re-upload prompt** on `pets/[id].tsx` when a photo fails to sign
  (unparseable/expired legacy row) — "re-upload this photo." This is the
  only genuinely new UI in Part B.
- **No migration needed for the core** unless D-B1 picks the rename.

## 5. Part C — Response-time badge

### C1. `host_response_stats(host_id)` — SECURITY DEFINER RPC (0051)
Returns `{ median_minutes int, sample_count int }` — median first-response
time + how many data points. SECURITY DEFINER + pinned `search_path`,
granted to `anon` + `authenticated` (badge shows on public cards), same
posture as `get_host_ratings` (0032). It returns only aggregates (no row
leakage), so bypassing RLS is safe.

- **"First response" definition (D-C1):** per inquiry where this host has
  sent ≥1 message, `first_response = (host's earliest message created_at)
  − inquiry.created_at`, in minutes. Median via
  `percentile_cont(0.5) within group (order by …)`; sample_count = number
  of such inquiries. (Rationale: `openInquiry` creates the inquiry row
  immediately before the starter's first message, so `inquiry.created_at`
  is a fair "clock starts" anchor. Booking accept-time is a separate
  signal — out of v1.)

### C2. Bucketed badge (ListingCard + detail)
- Client maps `median_minutes` to a bucket label: `≤60` "usually responds
  within an hour", `≤360` "within a few hours", `≤1440` "within a day",
  else "within a few days". i18n both locales.
- **Hidden when `sample_count < 3`** (no badge on thin data — never a
  fabricated signal, same posture as the "new host" badge).
- Fetched alongside the existing ratings aggregate on the feed/detail
  (batch where possible to avoid N+1).

## 6. Migration 0051 shape + verification

1. `host_response_stats(host_id uuid)` RPC + GRANTs (anon+authenticated).
2. *(only if D-B1 = rename)* `alter table pets rename column photo_url to
   photo_path` + `database.ts` + code sweep — otherwise omit.
3. Verification tail: RPC returns `{median_minutes, sample_count}` for a
   seeded host with ≥3 replied inquiries; returns `sample_count < 3` (→
   badge hidden) for a thin host; SECURITY DEFINER + search_path pinned;
   anon can execute.

Realtime publication (A1) is a **dashboard toggle**, logged in the apply
log — not part of the SQL file.

## 7. ⛔ Omar checkpoints

- Apply 0051 (RPC) `begin;/commit;` → verifications → log.
- **Flip the realtime publication toggle** for `messages` +
  `notifications` (Dashboard → Database → Replication) → log it.
- *(if D-B1 rename)* apply the rename in the same migration.
- Smoke: two browsers — a message on one side appears on the other in
  <2s without a focus change; a booking request bumps the host's 🔔 +
  pops a toast live; a pet photo still renders after > 7 days (re-sign);
  a seeded host with ≥3 replies shows a response badge, a thin host none.

## 8. Open decisions

- **D-A1** — notification toast: current-user + foreground only for v1?
  *(rec: yes.)*
- **D-B1** — rename `photo_url` → `photo_path`, or keep the (correct but
  mis-named) `photo_url`? *(rec: KEEP — cosmetic; avoid a churny sweep.)*
- **D-C1** — first-response measured from `inquiry.created_at` to the
  host's first message? *(rec: yes.)*

## 9. Non-goals (Phase 5)

OS push notifications (needs native builds), optimistic message insert
(refetch-on-INSERT stays the source of truth), presence/typing
indicators, realtime on any surface beyond messages + notifications,
booking accept-time as a response-stat input (messaging first-response
only for v1), and any image-processing/thumbnailing on pet photos.

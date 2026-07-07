# Migration 0050 / Phase 4 — Meet & greet v1 + host booking context (PLAN)

> **Status: PLAN — not yet built.** Plan-doc-first (0050 is a migration +
> touches RLS). Flow: this doc → Strategy + founder review → build (SQL
> written-not-applied, app code) → line-by-line SQL review → Omar applies
> → verification → `docs/migration-apply-log.md`.
>
> **Baseline:** main through Phase 3 (0048 applied; 0049 written-not-
> deployed). Migrations applied through **0048**. 0050 is the next number.

## 1. Goal & scope (from the pre-pilot plan, Phase 4)

- **Meet & greet ("زيارة تعارف")** — productize the trust wedge: an owner
  can request a short meet-up with a host before committing, and the host
  can confirm it, right inside the pre-booking inquiry thread. No calendar
  logic in v1 — the actual scheduling happens in the conversation.
- **Host booking context** — let hosts see who/what they're accepting
  (owner + pet details) before they accept.

## 2. Existing-state audit (what's already here — READ THIS FIRST)

The audit changed the shape of this phase materially:

- **Host booking context is ALREADY SHIPPED.** `OwnerPetsSection`
  (`src/components/bookings/OwnerPetsSection.tsx`, gated on `isHostMode`
  in `bookings/[id].tsx`) already renders: owner name + avatar, the
  **owner rating aggregate** (`ownerAvgRating` / `ownerReviewCount`),
  and **pet cards** (name, breed, age, `care_notes`, vaccination status
  via `classifyVaccinationDate`). `getBooking` already embeds
  `owner:profiles(...)` + `booking_pets(pet:pets(*))`. So the UI is done.
- **Profiles RLS — NO gap.** `profiles_select_authenticated` (0002) is
  `to authenticated using (true)` — any signed-in user reads any profile
  row; the policy comment literally says "so booking parties see each
  other's display name + avatar." 0037 only narrowed the **anon** column
  grants; authenticated hosts read full owner rows. Owner name/avatar/
  rating all resolve for the host. **No change needed.**
- **Pets RLS — REAL GAP (the actual Part B deliverable).**
  `pets_select_owner_or_booking_host` (0002:74) grants a host SELECT on a
  pet only via `where b.pet_id = pets.id` — the **legacy single
  `bookings.pet_id`**. Since 0007 (5.6) multi-pet bookings live in the
  `booking_pets` junction, and `getBooking` reads pets THROUGH that
  junction (`booking_pets(pet:pets(*))`). Result: on a **multi-pet**
  booking a host sees only the one pet that happens to sit in the legacy
  `pet_id` slot; the junction pets are silently filtered out by RLS.
  Single-pet bookings are fine (that pet is in `pet_id`). **This is what
  Phase 4's "verify RLS reach first" was pointing at.** (Per the 0030
  lesson, grep-verified: this is the only pets SELECT policy; the fix
  redefines it, adds nothing parallel.)
- **messages constraints relevant to `kind`:**
  - 0044 `messages_body_presence` CHECK: a live (non-deleted) message
    must have a non-null non-empty `body`. → MG messages must carry a
    body (see A2).
  - 0044 `guard_message_update` immutable list: id, booking_id,
    inquiry_id, sender_id, created_at. `kind` will be added to it (A3).
  - 0043 `messages_insert_participants`: a thread participant may insert.
    Governs who can insert MG messages (A4).
  - 0046 β timeline + `MessageBubble` render the thread; MG pills slot in
    there (A5).

## 3. Part A — Meet & greet v1 (the new build)

### A1. Data — `messages.kind`
```
alter table public.messages
  add column kind text not null default 'text'
    check (kind in ('text', 'meet_greet_request', 'meet_greet_confirmed'));
```
- `NOT NULL DEFAULT 'text'` backfills every existing row to `'text'` in
  one shot — no data migration.

### A2. Body-CHECK interplay (no 0044 change)
MG messages **carry a non-empty marker body** (e.g. the localized label
`"طلب زيارة تعارف"` / `"Meet & greet requested"`), so `messages_body_
presence` is satisfied **unchanged**. The client renders MG rows as pills
keyed on `kind` and ignores the body text (the marker is just a graceful
fallback + keeps the CHECK happy). Chosen over relaxing the 0044 CHECK —
smaller blast radius, and a stored label is a fine no-JS fallback.

### A3. `guard_message_update` — add `kind` to the immutable list
`create or replace` the 0044 guard to also reject `kind` changes on
update. Otherwise the soft-delete UPDATE path (the only permitted update)
could flip a message's kind. Byte-identical to 0044 except one added
immutability check. (This is why 0050 touches the guard.)

### A4. Insert gating — who can insert which kind (DECISION D-A1)
- The owner (inquiry `starter`) inserts `meet_greet_request`; the host
  inserts `meet_greet_confirmed`. Both are participants, so
  `messages_insert_participants` already permits the inserts.
- **Open question:** do we RLS-enforce "only the host may insert
  `meet_greet_confirmed`" (and only the starter may request), or gate it
  app-side only? **Recommendation: app-layer gating for v1** (the Confirm
  action only renders for the host; the Request CTA only for the
  starter). Rationale: MG is a coordination nicety — it moves no money
  and gates no trust decision; the worst a crafted API insert does is let
  an owner "self-confirm" their own request, which is cosmetic. A
  stricter `WITH CHECK` (kind-vs-role) can land later if abuse appears.
  Flag for founder — if they want it tight from day one, it's a ~6-line
  policy addition and I'll fold it into 0050.

### A5. Flow + UI (inquiry thread only, v1)
- **Scope: the pre-booking inquiry thread** (`/inquiries/[id]`) — MG is
  the *pre*-commitment trust step. Not offered on booking threads in v1.
- Owner sees a **"Request a meet & greet"** CTA (near the compose bar) →
  inserts a `meet_greet_request` message via a new
  `sendMeetGreet(inquiryId, 'request')` helper.
- Host sees, on a thread that has an open (un-confirmed) request, a
  **"Confirm meet & greet"** action → inserts a `meet_greet_confirmed`.
- Both render as **distinct pill bubbles** with a **lifecycle divider**
  in the 0046 timeline (extend `MessageBubble` / the timeline builder to
  branch on `kind`). Request pill = neutral/gold; confirmed = moss/✓.
- **No calendar / no scheduling state** — the parties agree a time in
  normal messages. v1 tracks only requested → confirmed.

### A6. Notifications (reuse, don't add)
MG inserts are `messages` INSERTs, so the 0047 `notify_message_received`
trigger **already** notifies the other participant (host on request,
owner on confirm) with a `message_received` notification linking to the
thread. **v1 reuses this** — no new notification type. (Caveat: 0047's R2
per-thread dedupe means if an unread `message_received` already exists
for the thread, the MG one won't add a second bell — acceptable; the pill
is visible on open.) A dedicated `meet_greet_*` notification type is a
post-v1 nicety, logged to the backlog.

### A7. i18n
`meet_greet.*` keys: request CTA, confirm action, the two pill labels,
the lifecycle-divider caption, and the marker bodies (A2) — both locales,
masculine register.

## 4. Part B — Host booking context: the pets RLS-reach fix

The UI is already built (§2). The only work is closing the pets gap so a
host actually receives ALL pets on a multi-pet booking.

> **⚠️ PRODUCTION EVIDENCE (2026-07-07).** This RLS-reach item is no longer
> theoretical — it caused a **production white-screen** on the host
> `/bookings` list.
>
> **Refined diagnosis (from prod data):** `bookings.pet_id` is still
> **dual-written** by the request flow, so the legacy predicate DOES match
> the *first* pet — a host sees pet #1 fine. The nulls (and the crash) are
> **specific to MULTI-pet bookings**: every pet *beyond the first* lives
> only in `booking_pets`, which the stale predicate never checks, so those
> rows come back null. Single-pet bookings were never affected.
> **Prod repros:** booking `494087eb` (2 pets) and `bdbbb950` (3 pets).
>
> A **client-only Layer 1 hotfix** already shipped (commit `4da8bf4`):
> `.map((b) => b.pet).filter(Boolean)` on every pets assembly + a neutral
> host-row fallback, so the UI now *survives* the nulls (showing pet #1 +
> the placeholder for the rest). **This 0050 change is the Layer 2 ROOT
> FIX** — it makes the host actually *see* all the pets rather than just
> not crash. Ship it here (in Phase 4), NOT as a rushed standalone
> migration.
>
> **Decision-for-later (→ post-pilot backlog):** once B2 makes the junction
> the source of truth for host pet-visibility, `bookings.pet_id` is pure
> legacy. Decide post-0050 whether to **keep the dual-write** (cheap
> back-compat, one redundant column) or **migrate off `bookings.pet_id`**
> (drop the column + the legacy OR-clause once no code reads it). Logged
> in `docs/post-pilot-backlog.md`.

### B1. Verify FIRST (before writing the fix)
```sql
-- As a host, on a MULTI-pet booking on their listing, how many pets come
-- back vs. how many are actually linked? A mismatch proves the gap.
-- (Run in a host session / with RLS on.) Prod repros: 494087eb (2 pets),
-- bdbbb950 (3 pets) — pre-fix these return visible_to_host = 1.
select
  (select count(*) from public.booking_pets bp where bp.booking_id = '<multi-pet booking id>') as linked,
  (select count(*) from public.pets p
     where exists (select 1 from public.booking_pets bp
                    where bp.booking_id = '<id>' and bp.pet_id = p.id)) as visible_to_host;
-- Pre-fix expectation: visible_to_host < linked (only the bookings.pet_id
-- pet passes the current policy).
```

### B2. The fix (0050) — widen `pets_select_owner_or_booking_host`
`drop`+recreate the policy. The **root cause is junction-era staleness**:
the 0002 predicate checks `bookings.pet_id` (the single-pet column), but
the app has stored pets in the `booking_pets` junction since 0009. Add an
**EXISTS over the junction**, and keep the legacy `b.pet_id` clause OR-ed
for any pre-0009 rows (Strategy's specified form):
```sql
-- host may read a pet linked to a booking on their listing, via the
-- booking_pets junction (0009+) ...
or exists (
  select 1 from public.booking_pets bp
  join public.bookings b on b.id = bp.booking_id
  join public.listings l on l.id = b.listing_id
  where bp.pet_id = pets.id
    and l.host_id = (select auth.uid())
    and b.status in ('requested','accepted','active','completed','disputed')
)
-- ... OR the legacy single-pet column (pre-0009 rows).
or exists (
  select 1 from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.pet_id = pets.id
    and l.host_id = (select auth.uid())
    and b.status in ('requested','accepted','active','completed','disputed')
)
```
- Owner branch (`owner_id = auth.uid()`) preserved unchanged.
- The status set is preserved from 0002 (host sees pets only while a
  live/relevant booking exists).
- No new parallel policy — single `drop`+recreate (0030 lesson).

### B3. Owner rating aggregate — already wired
`OwnerPetsSection` already receives `ownerAvgRating`/`ownerReviewCount`;
`reviews_select_public` (0030) lets the host read the owner's received
reviews. No RLS change. (If the aggregate uses a host-only RPC, confirm
an owner-ratee path exists during build — the props are already populated
today, so this is a no-op check.)

### B4. Owner-profile visibility — check for the SAME junction-era staleness
Strategy flagged: while fixing the pets predicate, **audit the owner-side
join for the same pre-0009 assumption.** Findings from this plan's audit:
- **`profiles` — SAFE.** `profiles_select_authenticated` (0002) is
  `to authenticated using (true)`; a host reads any owner profile row
  regardless of how the booking links pets. No `pet_id`/junction
  dependency, so no staleness. `booking.owner` resolves.
- **`booking_pets` mutation policies — VERIFY.** `booking_pets_select_
  owner_or_host` (0007) and the 0010 owner update/delete policies are the
  junction-era analogues; confirm during build that the host-SELECT path
  there also keys off the junction (it should — it's the 0007 rewrite),
  not a stale `pet_id`. One-query `pg_policies` check, per the 0030 lesson.
- **Net:** the pets SELECT policy (B2) is the only confirmed stale
  predicate; B4 is a belt-and-suspenders audit, not a known second bug.

## 5. Migration 0050 shape (sections) + verification

1. `alter table messages add column kind ... check (...)` (A1).
2. `create or replace guard_message_update` — 0044 body + kind immutable
   (A3).
3. `drop`/recreate `pets_select_owner_or_booking_host` with the junction
   branch (B2).
4. (If D-A1 = tight) the kind-vs-role insert WITH CHECK.
5. Verification tail: `kind` column + CHECK present + all existing rows
   `'text'`; guard rejects a kind change; **the B1 query now returns
   visible_to_host == linked** for a host on a multi-pet booking;
   behavioral MG insert (request as starter, confirm as host) produces
   two rows of the right kinds; owner still sees own pets.

## 6. ⛔ Omar checkpoint

Review + apply 0050 (`begin;/commit;`) → run verifications (esp. the
pets-reach before/after) → log in `migration-apply-log.md`. Smoke: as an
owner open an inquiry, tap "Request a meet & greet" → host sees the pill +
a bell; host taps "Confirm" → owner sees the confirmed pill + divider.
On a multi-pet booking, the host's booking detail now shows **all** pets.

## 7. Open decisions

- **D-A1** — RLS-enforce which role inserts which MG kind, or app-layer
  gate for v1? *(rec: app-layer; MG is low-stakes coordination.)*
- **D-A2** — MG scoped to inquiry threads only for v1? *(rec: yes —
  it's the pre-commitment step; booking-thread MG is a later nicety.)*
- **D-A3** — reuse `message_received` notifications vs. add `meet_greet_*`
  types? *(rec: reuse for v1.)*

## 8. Non-goals (Phase 4)

Calendar/date-time scheduling or availability for MG (conversation-based
in v1), MG on booking threads, a distinct MG notification type, video
meet-greets, and any change to the owner-side booking view (this phase is
host-context + the shared MG thread only).

# Migration 0046 — β Thread Continuity (plan)

**Status:** plan doc for Strategy review. No SQL, no app code yet.

**Goal:** unify the inquiry timeline with all bookings that originated
from it, so the **inquiry/conversation page becomes the comprehensive
host↔owner timeline**. The booking page's Messages stays scoped to
its own booking — unchanged.

**Founder-locked model:**

The comprehensive timeline is a sequence of **BLOCKS**:

- **Conversation block** — messages not tied to a booking. One per
  stretch (the inquiry itself, or messages sent while no booking is
  open).
- **Booking block** — one collapsible block per booking, spanning
  `placed → terminal (completed / declined / cancelled)`, with
  lifecycle events as dividers inside it and that booking's messages
  interleaved chronologically.

**Founder example to reproduce EXACTLY:**

```
inquiry: "Hello"   ← conversation block
inquiry: "Hi"

─── Booking placed (dates / pet / total) ───   ← booking block opens
booking: "Hola"
booking: "Hi"
─── Booking accepted ───
booking: "Can I"
─── Booking finished ───                       ← booking block closes

inquiry: "Yes"                                  ← new conversation block
```

**Smart compose routing:** a message typed in the comprehensive view
routes to context. If a booking under this inquiry is currently OPEN
(`status in ('requested','accepted','active')`) it attaches to THAT
booking (`booking_id`); otherwise to the inquiry (`inquiry_id`). The
booking page compose always attaches to its own booking. This keeps
every new message landing in the correct physical thread, so the
display always reconstructs the right block.

**SAFETY GUARANTEE — repeated at the top because it's load-bearing:**
messages stay physically in their own threads (`booking_id XOR
inquiry_id`). NO row re-pointing. NO data migration of messages. The
`messages_one_thread_check` from 0040 stays correct; the
`messages_update_own_until_read` policy + `guard_message_update`
trigger from 0044 stay untouched. The merge is **query + display
only**.

---

## 1. `bookings.inquiry_id` — new nullable FK

### Schema

```
alter table public.bookings
  add column inquiry_id uuid
    references public.inquiries(id) on delete set null;

create index bookings_inquiry_id_idx
  on public.bookings(inquiry_id)
  where inquiry_id is not null;  -- partial — most rows are null
```

`ON DELETE SET NULL` — losing the inquiry parent shouldn't cascade-
delete a real booking row. The booking can still stand on its own
(its `booking_id`-scoped messages and lifecycle stay intact); the
timeline just falls back to "no inquiry context" for that booking.

### Where to set it at booking creation

Today the booking-create path is `createBookingRequest()` in
[src/lib/bookings.ts:51](src/lib/bookings.ts#L51). It is called from
[src/app/listings/[id]/request.tsx:85](src/app/listings/[id]/request.tsx#L85)
(the request screen) which currently accepts these URL params:

```ts
const params = useLocalSearchParams<{
  id?: string;                // listing id
  editBooking?: string;
  rebookFrom?: string;
  startDate?: string;
  endDate?: string;
  petId?: string;
  petIds?: string;
}>();
```

**There is currently NO inquiry → booking handoff.** The inquiry
detail screen ([src/app/inquiries/[id].tsx](src/app/inquiries/[id].tsx))
has no CTA that links to the booking-request flow with the inquiry
id attached. The booking request happens via the listing detail
screen's "Request booking" button, with no awareness of any
pre-existing inquiry. So an inquiry is never converted today — the
inquiry's `status` is left at `'open'` forever (which is what the
0043 `messages_insert_participants` policy expects anyway, since it
allows messages on any non-`converted` inquiry).

The app wiring (separate PR after 0046 lands):

1. **`createBookingRequest()` gains an optional `inquiryId?: string`
   input field.** When set, it inserts `inquiry_id` on the booking
   row. No other behavior change.
2. **The request screen reads a new `?inquiryId=<uuid>` URL param**
   alongside the existing ones and passes it through to
   `createBookingRequest()`.
3. **The inquiry detail screen gets a "Request booking" CTA** that
   routes to `/listings/[id]/request?inquiryId=<this-inquiry>`
   (where the listing id comes from `inquiry.listing_id`).
4. **The listing detail screen's existing "Request booking" CTA
   stays as-is** — bookings created from the listing page (without
   an inquiry first) leave `inquiry_id` null. That's the correct
   semantic: no pre-booking thread, no inquiry to link to.

### Inquiry status semantics — flag for Strategy

Today the 0043 rule is `messages_insert_participants` allows
messages on any inquiry where `status <> 'converted'`. With the
0046 model, the inquiry's conversation continues AFTER the booking
ends ("Yes" in the founder example lands BACK on the inquiry). So
we should **NOT** flip `inquiry.status = 'converted'` when a booking
is created — that would silently block the post-booking
conversation messages.

**Proposal:** leave `inquiry.status = 'open'` indefinitely. With
0043 having removed the close-button and 0046 not introducing a
convert step, `status` effectively becomes always `'open'`. Worth
flagging that the field is now near-vestigial. **Not removed**
because (a) the enum + check constraint is harmless, (b) some
legacy `'closed'` rows might exist (0043 didn't migrate them), and
(c) future product moves (manual archive, automated stale-cleanup)
could re-use it.

### Backfill heuristic for existing bookings

Best-effort post-`add column`:

```
update public.bookings b
   set inquiry_id = i.id
  from public.inquiries i
 where b.inquiry_id is null
   and b.listing_id = i.listing_id
   and b.owner_id   = i.starter_id
   -- pick the inquiry that was OPENED BEFORE the booking was placed
   and i.created_at <= b.created_at
   -- exactly one candidate
   and not exists (
     select 1 from public.inquiries i2
     where i2.id <> i.id
       and i2.listing_id = b.listing_id
       and i2.starter_id = b.owner_id
       and i2.created_at <= b.created_at
   );
```

**Ambiguity rule (OPEN for Strategy):**

- **Option α (recommended):** if more than one inquiry matches
  (listing_id + owner_id + created_at ≤ booking.created_at), leave
  `inquiry_id` null. The booking still works standalone; the
  timeline just doesn't reach back into a pre-booking thread.
  **Safer** — no guessing.
- **Option β:** pick the **most recent** matching inquiry by
  `created_at`. Probably right in practice (the user opened it,
  chatted, then booked) but a wrong match would attach a stranger's
  inquiry thread to a booking, which is a privacy leak.

Either way the backfill is best-effort and the heuristic is
non-strict (`inquiry.status` doesn't have to equal `'converted'`,
because as established above, nothing sets that). Backfill counts
land in the migration-apply-log.

### Open Q: should the backfill flip matched inquiries to
`status='converted'`? **No** — same reason as above. Bookings
linking to an inquiry doesn't terminate the inquiry's
conversation usefulness.

---

## 2. Status-transition timestamps

### Current state

Bookings table today carries:

- `status` (7-value enum, default `'requested'`) — [0001:117](supabase/migrations/0001_initial_schema.sql#L117)
- `created_at` — implicit "placed at"
- `cancelled_at` — added by [0028:33](supabase/migrations/0028_payments_foundations.sql#L33)

**Missing for the timeline dividers:** `accepted_at`, `declined_at`,
`completed_at`. Also: `active_at` (the check-in moment when status
flips `accepted → active`) and `disputed_at` — both open questions
on whether the timeline shows dividers for them.

### Add (always — these earn dividers per the founder example)

```
alter table public.bookings
  add column accepted_at  timestamptz,
  add column declined_at  timestamptz,
  add column completed_at timestamptz;
```

### Add IF Strategy says yes (see open questions)

```
alter table public.bookings
  add column active_at    timestamptz,  -- on accepted → active
  add column disputed_at  timestamptz;  -- on any → disputed
```

All nullable. Existing rows stay null — flagged honestly below.

### Stamping mechanism — recommend TRIGGER

Two options:

**(a) BEFORE UPDATE trigger** — stamp `<status>_at = now()` when
`new.status` is one of the named values AND `old.status` differs.
Robust: catches every UPDATE path regardless of caller (app, admin,
SQL editor, future RPC). Survives refactors. Idempotent (`status`
unchanged → no stamp; transitioning into already-stamped state →
keep the earliest stamp, see below).

**(b) App-layer stamping in `bookings.ts`** — every status-change
helper writes `{status: 'accepted', accepted_at: new Date().toISO...}`
on the UPDATE. Fragile: any future code path that bypasses the
helper (admin RPC, direct SQL fix-up) leaves the column null.

**Recommend (a).** This is exactly the "centralize the invariant at
the DB layer" pattern 0044's `guard_message_update` already uses.

Idempotency rule: if `old.<status>_at IS NOT NULL` already, do
NOT overwrite — preserves "the first time this happened" even if
the booking transitions back into the same status (which shouldn't
happen for terminal statuses but let's be defense-in-depth).

### CRITICAL — trigger interaction with the two existing bookings triggers

`public.bookings` already has TWO BEFORE-triggers:

| Name | Event | What it does | Defined |
|---|---|---|---|
| `bookings_capacity_guard` | BEFORE INSERT OR UPDATE | rejects bookings that overlap blocked dates or exceed `max_concurrent_pets` (touches `status`, `start_date`, `end_date`, `booking_pets`) | [0027:218-221](supabase/migrations/0027_availability_and_capacity.sql#L218) |
| `guard_booking_update` | BEFORE UPDATE | forward-only monotonicity on `owner_last_opened_at` + `host_last_opened_at` (touches ONLY the two read-tracking columns) | [0044:340-342](supabase/migrations/0044_message_deletion_and_read_tracking.sql#L340) |

Postgres fires BEFORE triggers in **trigger-name alphabetical
order** on each event. With the proposed new trigger
`guard_booking_status_stamp`:

```
bookings_capacity_guard      first  (b < g)
guard_booking_status_stamp   second
guard_booking_update         third  (s < u)
```

**Disjoint column responsibilities — confirmed:**

| Trigger | Reads | Writes |
|---|---|---|
| `bookings_capacity_guard` | `status`, `start_date`, `end_date`, `listing_id`, `id` | none — raises or returns NEW unchanged |
| `guard_booking_status_stamp` (new) | `old.status`, `new.status`, `new.<status>_at` | `new.<status>_at` (only when null) |
| `guard_booking_update` | `old.*_last_opened_at`, `new.*_last_opened_at` | none — raises or returns NEW unchanged |

The capacity guard checks `status`; our stamper reads the same
`status` to decide whether to stamp; both run in the same BEFORE
phase against the same NEW row. Since the capacity guard fires
FIRST and returns NEW unchanged (or raises and aborts the whole
UPDATE), our stamper sees whatever `status` survived the capacity
check. The monotonicity guard runs LAST and only touches its own
columns; our stamper's writes to `<status>_at` columns are
invisible to it. **No collision.**

### Historical data — flag honestly

Existing bookings have NO recorded `accepted_at` / `declined_at` /
`completed_at` for prior transitions. For dividers on past
bookings:

- **`placed`** divider → `created_at` (always set).
- **`cancelled`** divider → `cancelled_at` (set on cancelled bookings
  since 0028; null for cancelled-before-0028).
- **`accepted` / `declined` / `completed`** dividers → null for
  every booking that transitioned before 0046 applies.

The fallback for null `<status>_at` is: use `created_at` as a single
"this booking" anchor and skip the lifecycle divider. The block
header still shows `Booking placed` (rich) and the current `status`
as a label; the per-transition slim dividers just don't render for
those rows. Renders intelligibly; doesn't fabricate timestamps.

---

## 3. RLS — CONFIRM, don't assume

The comprehensive timeline reads three data classes for the viewer
(the inquiry's starter, who is also the booking's owner). Each
verified:

### (a) Inquiry's messages

Viewer is `inquiries.starter_id` (= `auth.uid()`). Policy
`messages_select_participants` ([0040:322-352](supabase/migrations/0040_inquiry_threads.sql#L322))
inquiry branch:

```
inquiry_id is not null
and exists (
  select 1 from public.inquiries i
  where i.id = messages.inquiry_id
    and (i.starter_id = auth.uid() or i.host_id = auth.uid())
)
```

Starter qualifies. **Permitted.**

### (b) Each linked booking's messages

Viewer is `bookings.owner_id` (= `auth.uid()`). Same
`messages_select_participants` policy, booking branch:

```
booking_id is not null
and exists (
  select 1 from public.bookings b
  left join public.listings l on l.id = b.listing_id
  where b.id = messages.booking_id
    and (b.owner_id = auth.uid() or l.host_id = auth.uid())
)
```

Owner qualifies. **Permitted.**

### (c) The linked bookings rows + new `_at` columns

Policy `bookings_select_owner_or_host`
([0004:263-275](supabase/migrations/0004_admin_role.sql#L263)):

```
is_admin()
or owner_id = auth.uid()
or exists (select 1 from listings l
           where l.id = bookings.listing_id
             and l.host_id = auth.uid())
```

Owner qualifies. The new `<status>_at` columns are just columns on
the row; column-level GRANTs aren't restricted on bookings (only
profiles narrowed those in 0037), so an authenticated read of the
booking row returns every column including the new ones.
**Permitted.**

### Conclusion

**Zero new RLS policies required.** 0046 ships schema-only changes
(new column on bookings, new timestamp columns, new trigger). No
`drop policy`, no `create policy`. Verification queries in the
migration's trailing comment block confirm this (policy count
on `public.bookings` and `public.messages` is the same after apply
as before).

---

## 4. SAFETY GUARANTEE (explicit)

Messages stay physically in their own threads:

- A message tied to a booking keeps `booking_id` set, `inquiry_id`
  null.
- A message tied to an inquiry keeps `inquiry_id` set, `booking_id`
  null.
- The `messages_one_thread_check` CHECK constraint from
  [0040:296-302](supabase/migrations/0040_inquiry_threads.sql#L296)
  is **untouched**.
- The `messages_update_own_until_read` policy + `guard_message_update`
  trigger from 0044 are **untouched**.
- The `mark_thread_read` RPC from 0044 is **untouched** (we just
  call it twice — see §5).

**No re-pointing. No message-row migration. The merge is purely
query + display.**

The smart-compose-routing rule enforces this from the write side:
a new message typed in the comprehensive view picks ONE thread
(`booking_id` OR `inquiry_id`) and the existing `messages_insert_*`
policies validate it. There's no path that produces a message with
both set or neither set.

---

## 5. Read-tracking in the merged view

The comprehensive timeline displays messages from N+1 threads (one
inquiry + N linked bookings). Per-thread read-state from 0044 stays
correct only if the viewer's "I just opened this" signal fires for
EVERY thread visible in the merged view.

**Behavior:** on focus of `/inquiries/[id]`, call `markThreadRead`
twice (or N+1 times):

```ts
useFocusEffect(useCallback(() => {
  void markThreadRead('inquiry', inquiryId);
  for (const b of linkedBookings) {
    void markThreadRead('booking', b.id);
  }
}, [inquiryId, linkedBookings]));
```

Each call is a fire-and-forget RPC (already swallows errors per
0044's `markThreadRead` helper). Cost: N+1 round-trips on every
timeline open. For an inquiry with 1-3 bookings (the common case)
this is 2-4 RPCs, negligible.

**Implication for delete-until-read:** if Alice and Bob are both
looking at the comprehensive view, Alice's `last_opened_at` on
EVERY linked booking advances to "now" the moment she opens the
timeline. A message Bob types in this view will be deletable only
until Alice opens the timeline next. That matches user expectation:
"if you saw the merged view, you saw the message."

**The booking page** continues to call `markThreadRead('booking', id)`
ONLY for its own booking (the existing 0044 wiring). Reading the
booking page does NOT mark the inquiry-scoped messages as read;
reading the inquiry page DOES mark every linked booking's
messages as read. That asymmetry is intentional: the inquiry is
the COMPREHENSIVE view; the booking page is a focused subview.

---

## 6. Merged timeline query — recommend CLIENT-SIDE merge

Two options:

**(a) Client-side merge (recommended).** New helper
`fetchInquiryTimeline(inquiryId)` that:

1. Fetches the inquiry row + its messages (already exists:
   `getInquiry()` + `listInquiryMessages()`).
2. Fetches linked bookings: `select * from bookings where
   inquiry_id = <inquiryId>` plus their addons + pets (for the
   rich placed-divider).
3. For each linked booking, fetches its messages
   (`select * from messages where booking_id = <id>`).
4. Merges client-side into a single sorted timeline.

RLS handles everything — every read already passes existing
policies (§3). No new privileged surface.

**(b) SECURITY DEFINER RPC.** Single round-trip, single sorted
result. But: introduces a new privileged surface; needs its own
`GRANT execute`; has to re-enforce participation server-side
(the SECURITY DEFINER bypass means RLS-equivalent logic must live
in the function body). More code, more maintenance, more
audit-surface.

**Recommend (a).** The viewer can already read every piece via
existing policies; concentrating the merge in client code keeps
the RLS surface unchanged. Cost: 3-5 round trips per timeline open
(1 inquiry + 1 inquiry-messages + 1 bookings + N booking-messages).
For inquiries with 0-3 bookings (the common case) this is 3-6
round trips, comparable to the booking detail page today. If
latency ever becomes an issue, an RPC can be added later as a
performance optimization without changing semantics.

### Block-grouping walk

Pseudocode for the client-side merge after the fetches return:

```
1. Build a flat list of TimelineEvent:
     - InquiryMessage(created_at, body, sender, ...)
     - BookingMessage(created_at, body, sender, booking_id, ...)
     - BookingPlaced(created_at, booking)           ← booking.created_at
     - BookingAccepted(accepted_at, booking)        ← if not null
     - BookingActive(active_at, booking)            ← if not null AND if Strategy says yes
     - BookingDeclined(declined_at, booking)        ← if not null
     - BookingCompleted(completed_at, booking)      ← if not null
     - BookingCancelled(cancelled_at, booking)      ← if not null
     - BookingDisputed(disputed_at, booking)        ← if not null AND if Strategy says yes
2. Sort the flat list by timestamp ascending.
3. Walk it, grouping into blocks:
     state = OUTSIDE_BOOKING
     currentBooking = null
     blocks = []
     for ev in events:
       if ev is BookingPlaced:
         flush conversation block
         open booking block for ev.booking
         emit placed-divider into the booking block
         state = INSIDE_BOOKING; currentBooking = ev.booking
       elif ev is BookingAccepted | BookingActive
                | BookingDeclined | BookingCompleted
                | BookingCancelled | BookingDisputed:
         emit slim divider into currentBooking's block
         if status is terminal (declined / completed / cancelled / disputed):
           close booking block
           state = OUTSIDE_BOOKING
       elif ev is BookingMessage:
         emit message into currentBooking's block
         (CHECK: ev.booking_id == currentBooking.id — if not, that's
          a bug in smart-compose-routing; render anyway, log warn)
       elif ev is InquiryMessage:
         if state == INSIDE_BOOKING:
           (rare — inquiry message arrived while a booking is open;
            possible if user typed in a non-comprehensive view that
            bypassed routing. Render in CURRENT conversation block —
            close booking block first IF its terminal already passed,
            else emit a "switching context" hint and continue)
         else:
           emit into open conversation block (open one if none yet)
     flush any open block
```

The walk handles every case from the founder example exactly:

- 2 inquiry messages before booking → conversation block.
- Booking placed → opens booking block with rich divider.
- 2 booking messages → into block.
- Booking accepted → slim divider into block.
- 1 booking message → into block.
- Booking finished (completed) → slim divider, closes block.
- 1 inquiry message → opens new conversation block.

### Smart-compose routing helper

In the comprehensive view's compose `onSend`:

```ts
function pickThreadForCompose(
  inquiryId: string,
  linkedBookings: { id: string; status: string }[],
): { kind: 'booking'; id: string } | { kind: 'inquiry'; id: string } {
  const openBooking = linkedBookings.find((b) =>
    b.status === 'requested' || b.status === 'accepted' || b.status === 'active'
  );
  return openBooking
    ? { kind: 'booking', id: openBooking.id }
    : { kind: 'inquiry', id: inquiryId };
}
```

Sends through `sendInquiryMessage(...)` or `sendMessage(bookingId, ...)`
accordingly — both already exist; no new lib helper needed.

---

## 7. App surface — files affected

Migration 0046 is schema-only. The app PR (separate, after 0046
applies + verifies) touches:

| File | Change |
|---|---|
| [src/types/database.ts](src/types/database.ts) | Add `inquiry_id: string \| null` to `bookings.Row/Insert/Update`. Add `accepted_at / declined_at / completed_at / [active_at / disputed_at if Strategy says yes]` timestamptz nullable to same. |
| [src/lib/bookings.ts](src/lib/bookings.ts) | `createBookingRequest()` gains optional `inquiryId` input; passes through to the INSERT. No behavior change when omitted. |
| [src/app/listings/[id]/request.tsx](src/app/listings/[id]/request.tsx) | Read new `?inquiryId=<uuid>` URL param; thread into `createBookingRequest()`. |
| [src/app/inquiries/[id].tsx](src/app/inquiries/[id].tsx) | Replace the current MessagesSection-only render with the comprehensive timeline (block-grouped). Add the "Request booking" CTA that routes to `/listings/[id]/request?inquiryId=<this>`. |
| [src/lib/inquiries.ts](src/lib/inquiries.ts) | New `fetchInquiryTimeline(inquiryId)` helper (the 3-5 fetches + the walk). |
| **New** `src/components/timeline/Block.tsx`, `BookingDivider.tsx`, `BookingBlock.tsx`, `ConversationBlock.tsx` | Block-level renderers. Each Booking/Conversation block reuses `<MessagesSection>` (or its internal bubble renderer) for the message bubbles — no new bubble component. The dividers are new. |
| [src/components/bookings/MessagesSection.tsx](src/components/bookings/MessagesSection.tsx) | If bubble rendering is extractable cleanly, split it out as a sub-component the block renderers can reuse. Otherwise leave as-is and have the block renderer call a smaller bubble-only export. |
| [src/app/bookings/[id].tsx](src/app/bookings/[id].tsx) | **UNCHANGED display.** Its compose still targets its own booking. Its existing `markThreadRead('booking', id)` stays. |

### What stays unchanged (load-bearing)

- The MessagesSection bubble look (deleted placeholder, delete
  affordance, sender avatar).
- The 0044 `markThreadRead` RPC.
- The booking detail page's behavior.
- Every existing message RLS policy.

---

## 8. Build SEQUENCE — one at a time

1. **Strategy reviews this plan.** Decisions on the four open
   questions below.
2. **Write 0046 SQL** (folded with Strategy's decisions).
3. **Strategy reviews the SQL.**
4. **Apply 0046** to live Supabase, run the verification queries,
   log to `docs/migration-apply-log.md`.
5. **THEN** the app PR: types, lib helpers, screen rewrite,
   compose routing.
6. Verify end-to-end against the founder's exact example.

Do NOT ship app code that references columns that don't exist on
the live DB yet. Same discipline as 0044 → admin browse pairing.

---

## OPEN QUESTIONS — for Strategy

### Q1 — Do `active` and `disputed` earn dividers?

The founder example has `placed → accepted → finished`. Implies
`completed` for sure; doesn't mention `active` or `disputed`.

- **`active`** — the booking transitions `accepted → active` when
  the check-in condition report is filed (Section 6 of CLAUDE.md).
  A divider for it would be meaningful: "the stay started." But
  it's an internal-state transition the user might not care to see
  inline.
- **`disputed`** — the booking transitions to `disputed` if either
  party flags a problem post-stay. Rare. A divider for it is
  high-signal but might surprise.

**My recommendation:** include both. `active_at` divider = "stay
started" / "بدأت الإقامة"; `disputed_at` divider in terracotta =
"booking disputed" / "تم رفع نزاع". Cheap to add the columns + the
trigger branch; cheap to NOT render in the UI if Strategy decides
later. Strategy's call.

### Q2 — Backfill ambiguity rule

Option α (recommended) — multiple matches → leave null. Privacy-safe,
no guessing.
Option β — pick most recent. Probably right in practice but a wrong
match attaches a stranger's inquiry to a booking.

### Q3 — Stamping mechanism

Option (a) — BEFORE UPDATE trigger (`guard_booking_status_stamp`).
Recommended. Catches every UPDATE path. Disjoint from the two
existing triggers per §2. Stamps null → non-null only (idempotent;
preserves first-time-this-status).
Option (b) — App-layer stamping. Fragile.

### Q4 — Client-side merge vs RPC

Option (a) — client-side merge (recommended). 3-6 round trips per
timeline open. No new RLS surface. Existing helpers cover the
reads.
Option (b) — SECURITY DEFINER RPC. Single round trip but new
privileged surface.

---

## Anti-scope (NOT in 0046)

- ❌ Re-pointing messages between threads.
- ❌ Migrating message rows.
- ❌ Changing the booking page's message display.
- ❌ Changing or dropping `inquiry.status`.
- ❌ Removing 0040's `messages_one_thread_check`.
- ❌ Read-receipt ticks (still Phase 2 of the messaging foundation).

If any of these become necessary mid-build, stop and re-circulate.

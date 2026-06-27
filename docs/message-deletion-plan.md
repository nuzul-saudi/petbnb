# Message deletion + (Phase 2) read receipts — plan

Plan-only doc, written 2026-06-28 for Strategy review. No code, no
migrations, no RLS changes have been written. Builds on the existing
messaging schema + RLS (0001 / 0002 / 0004 / 0040) and the inquiry
threads added by 0040.

Founder decisions locked going into this plan:

- **Phase 1 (build first):** a user can delete THEIR OWN message,
  but only until it has been read by the other participant. Once
  read, deletion is blocked.
- A deleted message leaves a **"message deleted" placeholder** in
  the thread. It is NOT hard-removed from the conversation flow.
- A user can delete only their own messages, never the other
  participant's.
- **Phase 2 (later):** delivered + read receipts (the visible tick
  marks). Phase 1 must not over-build for this but must leave the
  seam clean.
- **Separately:** the founder is removing the "archive / close
  inquiry" concept. Inquiry threads will no longer be closable. The
  implication for messages RLS is called out in §5.

---

## 1. Existing-state audit (do this first)

### 1.1 `public.messages` table (current shape)

From `supabase/migrations/0001_initial_schema.sql:178-185`:

```sql
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete restrict,
  body        text not null check (length(body) > 0),
  created_at  timestamptz not null default now()
);
create index messages_booking_id_idx on public.messages(booking_id);
```

Mutated by `0040_inquiry_threads.sql:289-303`:

- `booking_id` DROPped NOT NULL.
- New nullable FK `inquiry_id uuid references public.inquiries(id) on delete cascade`.
- CHECK constraint `messages_one_thread_check` — exactly one of
  `booking_id` / `inquiry_id` is non-null per row.
- Index `messages_inquiry_id_idx` added.

**No `updated_at` column today.** No deletion column. No status. Body
has a `CHECK (length(body) > 0)` that currently blocks empty/null
bodies — this matters for the soft-delete model in §2.

### 1.2 Current RLS on `public.messages`

Live policies, post-0040 (which dropped + recreated everything 0004
had set up to add the inquiry branch):

| Policy | Type | Surface |
|---|---|---|
| `messages_select_participants` | SELECT | `to authenticated` — admin OR (booking-scoped: caller is booking owner or listing host) OR (inquiry-scoped: caller is inquiry starter or host) |
| `messages_insert_participants` | INSERT | `to authenticated` — `is_active_user()` AND `sender_id = auth.uid()` AND (booking-scoped: participant on the booking) OR (inquiry-scoped: participant AND `inquiry.status = 'open'`) |

**NO UPDATE policy. NO DELETE policy.** Default-deny enforces
immutability today. The 0040 file's tail comment is explicit
(line 396-397):

> `-- No UPDATE/DELETE policies on messages. The 0004 posture (default-`
> `-- deny immutability) is preserved unchanged.`

### 1.3 What must change to allow scoped soft-delete

The four irreducible changes:

1. **Schema:** add a deletion marker column. Possibly alter the
   `length(body) > 0` CHECK to allow body=NULL on deleted rows
   (§2 covers).
2. **RLS:** add an UPDATE policy. **This is the only policy change
   in Phase 1.** No new SELECT/DELETE policies.
3. **Column immutability:** add a BEFORE UPDATE trigger that
   enforces "only the deletion fields can change, no other column
   can be edited via this surface." Without this, the UPDATE
   policy could let a sender re-write `body` text years later.
4. **App layer:** `src/lib/messages.ts` gains a `deleteMessage(id)`
   helper; `MessagesSection` gains the trash-can UI conditionally
   shown next to own messages within the eligibility window.

---

## 2. Soft-delete model

### 2.1 Schema choice

Add **one** new column on `public.messages`:

```
deleted_at  timestamptz null
```

`null` = live message. `not null` = deleted; the value is the
deletion timestamp (useful for audit / future moderation read).

### 2.2 Body handling — recommendation: null the content

Two viable patterns:

| Option | Body on delete | Pros | Cons |
|---|---|---|---|
| **Keep** | unchanged | content available for admin moderation / dispute audit | content still lives in the row; defeats the user's intent to retract |
| **Null** *(recommended)* | set to NULL | content is truly gone from the user-visible row + admin queries; matches WhatsApp / iMessage behavior | a privileged audit needs an out-of-band log if we ever need to investigate retracted abuse |

**Recommendation: null the body on delete.** Users retracting a
message expect the content to be gone. If admin audit becomes a
requirement later (e.g. for an abuse-reporting workflow), the right
home is a SECURITY DEFINER admin RPC that snapshots `body` to a
moderation table BEFORE the soft-delete fires — not "we kept the
text on the row." That's a Phase 2+ concern.

Schema impact of nulling:

- Drop the `0001` CHECK `length(body) > 0` and replace with:
  `check (deleted_at is not null or length(body) > 0)`.
- Alter `body` from `not null` to `null`.

The replacement CHECK enforces the same invariant for live messages
(non-empty body required) AND allows null body on deleted rows.

### 2.3 Why soft-delete, not hard DELETE

The founder's spec — *"a deleted message leaves a 'message deleted'
placeholder in the thread"* — explicitly requires the row to
survive. A hard DELETE would:

- Break message-ordering visual continuity in the thread.
- Remove the placeholder cue that recipients should see.
- Cascade through anything else that ever FKs `messages.id` (nothing
  today, but the cost of soft-delete is one nullable column; the
  cost of hard DELETE is everything that future code reads the row).

So this is UPDATE, not DELETE.

---

## 3. The "delete only until read" rule — Phase 1 enforcement

The crux. Phase 1 has NO read-tracking. The founder wants "until
read" semantics but won't have read receipts until Phase 2.

### 3.1 Options evaluated

#### Option A — Time window (e.g. deletable for 5 minutes after send)

- **Mechanism:** UPDATE policy clause `now() - created_at < interval '5 minutes'`.
- **Pros:** server-enforceable in one line; deterministic from
  sender's perspective; matches WhatsApp UX users already know;
  zero new tables/columns beyond `deleted_at`; replaces cleanly in
  Phase 2 (swap the time check for the read check).
- **Cons:** not actually "until read." A message sitting unread
  past 5 minutes is no longer deletable — sender wanted to retract
  it, can't. A message read within 5 minutes is still deletable —
  but the recipient already saw it.

#### Option B — Deletable until the other party fetches it

- **Mechanism:** track per-thread "other party last fetched" on the
  parent table. Add `owner_last_read_messages_at` /
  `host_last_read_messages_at` on `bookings`;
  `starter_last_read_messages_at` / `host_last_read_messages_at` on
  `inquiries`. On every `listMessages` call, the caller's "my last
  fetched" timestamp gets touched. UPDATE policy on messages joins
  through and checks `messages.created_at > other_party_last_fetched_at`.
- **Pros:** closer to "until read" semantics; survives Phase 2
  largely intact (the same columns become the read-receipt source
  of truth, just renamed / repurposed).
- **Cons:** starts building Phase 2 infrastructure now; per-fetch
  UPDATE on parent thread is a write amplification; fetch ≠ read
  (the other party's tab might be open in background); requires
  schema change on TWO parent tables (`bookings`, `inquiries`) +
  an RPC + per-fetch wiring on the listMessages code path.

#### Option C — Defer "until read" entirely; allow delete-anytime in Phase 1

- **Mechanism:** UPDATE policy gates only on `sender_id = auth.uid()`.
- **Pros:** smallest possible Phase 1; no time math, no schema
  beyond `deleted_at`.
- **Cons:** doesn't honor the founder's intent at all. A user can
  delete a 6-month-old message after the other party clearly read
  and replied. Conversations rewrite themselves.

### 3.2 Recommendation — Option A (5-minute time window)

Reasoning:

- **Closest to "until read" without over-building.** The founder's
  ask was "get as close as possible without over-building Phase 1."
  A time window is a reasonable proxy for "before the other party
  realistically engages with the message."
- **Server-enforceable, deterministic, single RLS clause.** No
  schema beyond `deleted_at`. No JOINs. No triggers tracking
  state. The simplest honest implementation.
- **Familiar UX.** WhatsApp shipped with 7 minutes for years and
  most Saudi users have built that mental model. iMessage has
  unlimited; Telegram has unlimited; we'd land between them at
  5 minutes — a defensible default that errs on the side of
  recipients keeping what they saw.
- **Phase 2 swap is a one-line policy edit.** When read receipts
  land, the `now() - created_at < interval '5 minutes'` clause
  gets replaced with a check against the new read-tracking
  columns (§4). The schema seam is the `deleted_at` column;
  the time window is purely policy.
- **No write amplification.** Option B's per-fetch parent UPDATE
  hits `bookings` / `inquiries` every time someone opens a thread.
  Option A is read-side-only until the actual delete fires.

Tradeoff accepted: a sender CAN delete a message the recipient
already read within those 5 minutes. The placeholder still leaves
"message deleted" in the thread, so recipients can see retraction
happened even if they saw the original. Mitigation comes for free
in Phase 2.

5-minute value is a pre-launch knob — Strategy / founder can pick
3 / 5 / 7 / 15. The code shape doesn't change.

### 3.3 Phase 1 UPDATE policy — design

```sql
create policy "messages_update_own_within_window"
  on public.messages for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and deleted_at is null
    and now() - created_at < interval '5 minutes'
  )
  with check (
    sender_id = (select auth.uid())
    and deleted_at is not null
  );
```

USING gates row visibility for UPDATE — sender owns it, not yet
deleted, within window. WITH CHECK forces the result to be a
deletion (deleted_at set). Without the WITH CHECK clause, the
policy would allow the sender to update the row WITHIN THE WINDOW
in any way they liked — including re-writing body text.

The USING clause does NOT validate the OLD body — that's irrelevant.
WITH CHECK validates the NEW row.

### 3.4 Column immutability — BEFORE UPDATE trigger

The RLS USING + WITH CHECK gate WHO can update and the
sender-not-changing constraint, but **cannot enforce column-level
immutability**. Without a trigger:

- A sender within the window could set `body = 'new content'` AND
  `deleted_at = now()` simultaneously. WITH CHECK only requires
  `deleted_at is not null` — it doesn't say body is unchanged.

The trigger (mirroring `guard_inquiry_update` from 0040) enforces:

- `id` / `booking_id` / `inquiry_id` / `sender_id` / `created_at`
  immutable — raise on any change.
- `deleted_at`: must transition from null to non-null. Setting it
  back to null (un-deletion) is rejected. Already-deleted rows
  reach this trigger with `old.deleted_at is not null`, which the
  USING clause filters out anyway — defense-in-depth.
- `body`: must transition from non-null to null on the same UPDATE
  that sets `deleted_at`. No other body change allowed.

Pseudocode shape (real SQL in the migration round, not here):

```
if new.id is distinct from old.id then raise ...
if new.booking_id is distinct from old.booking_id then raise ...
if new.inquiry_id is distinct from old.inquiry_id then raise ...
if new.sender_id is distinct from old.sender_id then raise ...
if new.created_at is distinct from old.created_at then raise ...
if old.deleted_at is not null then raise 'already deleted'
if new.deleted_at is null then raise 'must set deleted_at'
if new.body is not null then raise 'must null body on delete'
return new
```

### 3.5 What the app sees

`src/lib/messages.ts` gains:

```ts
export async function deleteMessage(messageId: string): Promise<void>
```

Calls `supabase.from('messages').update({ deleted_at: new Date().toISOString(), body: null }).eq('id', messageId)`. RLS does the gating. The helper does NOT need to pass `sender_id` (RLS reads it from the row) or check the time window client-side (RLS rejects past-window updates — UI just shows the error toast).

`MessagesSection` (component) shows a small trash icon next to OWN messages where `deleted_at IS NULL` AND `now() - created_at < 5 min` (client-side check for UI hint only — server is the truth). On delete success, the row renders as the `"message deleted"` placeholder using the existing message bubble shape but italicized + muted color. Same component handles both states based on `deleted_at`.

---

## 4. Phase 2 — read receipts (design only)

### 4.1 Read-tracking model recommendation

For a 2-party chat, per-thread "last read at" is cheaper than
per-message. Recommended shape:

- **`bookings`** gains: `owner_last_read_messages_at timestamptz`,
  `host_last_read_messages_at timestamptz` (both null until first
  read).
- **`inquiries`** gains: `starter_last_read_messages_at timestamptz`,
  `host_last_read_messages_at timestamptz`.

When the caller opens a thread, app calls an RPC
`mark_thread_read(thread_id, kind)` that updates the caller's
column to `now()`. Other party's column is the source of truth for
"have they seen my messages up to time X."

**Why per-thread, not per-message:**
- 2-party chat — group chats not on the roadmap.
- Write cost: one UPDATE per thread open, not one INSERT per
  message read.
- Read cost: zero — the timestamp is on the parent row that's
  already fetched.
- Read-receipt UI is "everything up to time X has been read by the
  other party" — exactly what one timestamp gives you.

A future move to group chats would migrate to a `message_reads`
junction table at that point — but that's not on the roadmap.

### 4.2 Replaces the time-window check

In Phase 2, the UPDATE policy USING clause changes from:

```
now() - created_at < interval '5 minutes'
```

to:

```
not exists (
  select 1
  from public.bookings b
  where b.id = messages.booking_id
    and (
      case when messages.sender_id = b.owner_id
           then b.host_last_read_messages_at
           else b.owner_last_read_messages_at
      end
    ) >= messages.created_at
)
and -- same for inquiry-scoped branch
not exists (
  select 1
  from public.inquiries i
  where i.id = messages.inquiry_id
    and (
      case when messages.sender_id = i.starter_id
           then i.host_last_read_messages_at
           else i.starter_last_read_messages_at
      end
    ) >= messages.created_at
)
```

Real predicate ends up structurally similar to the existing
participant-EXISTS pattern — same JOIN shape, just selecting a
timestamp instead of an identity. Phase 2 design will tighten this.

### 4.3 Implication for Phase 1 — leave seams clean

The Phase 1 `deleted_at` column is unaffected by Phase 2. The
trigger column-immutability list adds `owner_last_read_messages_at`,
`host_last_read_messages_at` etc. as immutable from app code (only
the `mark_thread_read` RPC writes them via SECURITY DEFINER), but
those columns don't exist in Phase 1 so the trigger doesn't
mention them yet.

**The seam:** the Phase 1 UPDATE policy is named
`messages_update_own_within_window`. Phase 2's policy is a DROP
POLICY + CREATE POLICY with the same name + the read-receipt
predicate. The trigger is unchanged.

---

## 5. Archive / close removal — implications

Founder is removing the close/archive concept from inquiries.

### 5.1 What "close" does today (live in 0040)

- `inquiries.status` enum: `'open'` / `'converted'` / `'closed'`.
- `'closed'` was the manual-archive value: a participant taps the
  Close button on the inquiry detail (`src/app/inquiries/[id].tsx`),
  the app calls `closeInquiry(id)` from `src/lib/inquiries.ts:323`,
  which UPDATEs `status = 'closed'`.
- `guard_inquiry_update` trigger (0040) allows `open → closed`,
  blocks `closed → open` (no reopen).
- The messages INSERT RLS check has the clause `i.status = 'open'`
  (0040 line 386) — once an inquiry is closed, no new messages can
  be added to it.
- The partial-unique index `inquiries_one_open_per_pair` on
  `(listing_id, starter_id) where status = 'open'` (line 116-118)
  allows the same owner to open a fresh inquiry on the same listing
  once a prior one is no longer 'open'.

### 5.2 What removing close means

App layer:

- Delete `closeInquiry` from `src/lib/inquiries.ts`.
- Remove the Close button + confirm dialog from
  `src/app/inquiries/[id].tsx` (the `t('inquiry.close_button')` +
  `t('inquiry.close_confirm')` strings; can deprecate the
  i18n keys too).
- The list-screen rendering at `src/app/inquiries/index.tsx:186`
  has a `status === 'closed'` color branch — becomes dead code,
  drop it.

DB layer (decision needed):

| Question | Option A (simpler) | Option B (cleaner) |
|---|---|---|
| Keep `'closed'` in the CHECK enum? | YES — existing rows stay valid; just stop transitioning into it | NO — drop from enum, but need to migrate any existing `'closed'` rows back to a valid value first |
| Messages INSERT `status = 'open'` check | KEEP — narrows allowed inserts; just trivially true for non-converted | DROP — allow inserts as long as inquiry exists |
| `guard_inquiry_update`'s `open → closed` transition rule | KEEP but unreachable (no app caller) | DROP |
| Partial-unique `where status = 'open'` | KEEP — protects against duplicate opens | EFFECTIVELY EQUIVALENT to plain unique since 'open' is the only non-terminal status, but the partial form is more honest about intent |

**Knock-on the messages INSERT RLS check.** Today line 386 has
`i.status = 'open'`. If close is removed, the only other status is
`'converted'` (an inquiry that became a booking). Strategy decides:

- **Option α:** keep the `status = 'open'` clause. Once an inquiry
  converts to a booking, no more messages on it — the conversation
  moves to the booking thread. (Matches founder's "converted =
  finished" model.)
- **Option β:** loosen to `status in ('open', 'converted')`. The
  inquiry stays a messaging surface even after conversion.
  Mixes the two thread types which the 0040 design deliberately
  kept separate.

**Recommendation: Option α (keep `status = 'open'`).** Founder's
removal targets the user-visible "Close inquiry" action — not the
underlying "this thread terminated when a booking was created"
state. Keeping `'converted'` as a terminal-for-messaging state
preserves the booking-vs-inquiry separation the 0040 design
established.

**Flagging:** this is a separate decision from the message-deletion
work and probably its own commit / migration. But the two share
the messaging-RLS surface, so a clean order is helpful — see §7.

---

## 6. RLS safety — interaction checklist

The new UPDATE policy in §3.3 must compose cleanly with everything
already in place:

| Concern | Check |
|---|---|
| Anon never widens | New policy is `to authenticated` only. Anon has no INSERT/UPDATE on `messages` today and gains none here. Confirmed by checking that 0002 / 0004 / 0040 all scoped to `authenticated`. |
| Participant can't touch other's rows | USING clause `sender_id = auth.uid()` — denies access to the other party's rows BEFORE the WITH CHECK ever runs. WITH CHECK also re-states `sender_id = auth.uid()` so a `sender_id` mutation attempt is rejected by the WITH CHECK pass. |
| Sender can't edit body to new content | WITH CHECK requires `deleted_at is not null`. Trigger requires `body is null` when `deleted_at is set`. Together: the only way to satisfy both is a deletion with body nulled. |
| Sender can't undelete | USING requires `deleted_at is null`. Once a row is deleted, the USING clause filters it out of the UPDATE eligible set entirely. Trigger also guards. |
| Sender can't delete-then-redelete to game timestamp | Same — USING blocks any UPDATE on already-deleted rows. |
| Admin bypass | Admin is NOT in the §3.3 policy. Question for Strategy: should `public.is_admin()` get a bypass on this UPDATE policy? **Recommend NO for Phase 1** — deletion is a user-intent action; an admin "deleting on behalf of" requires a separate moderation RPC with auditing, not a quiet override of the user's data. If pre-launch needs an admin moderation surface, that's a SECURITY DEFINER RPC. Mirrors the inquiry "no DELETE policy" stance from 0040 (which deferred admin deletion to a future RPC). |
| Suspended user can't delete | `is_active_user()` is currently on INSERT only. Question: should deletion also require active status? **Recommend YES** — a suspended user shouldn't be allowed to retract messages either. Add `public.is_active_user()` to USING. |
| SELECT policy unchanged | The select policy `messages_select_participants` already returns deleted rows because `deleted_at IS NULL` is not in its predicate. UI renders the placeholder; the row stays visible. No change needed. |
| 0040's CHECK constraint `messages_one_thread_check` unaffected | The CHECK reads `booking_id` / `inquiry_id`. The deletion mutation doesn't touch either column. Trigger also forbids changes to either. Constraint holds. |
| The 0040 AFTER INSERT trigger touching `inquiries.last_message_at` is unaffected | It's an INSERT trigger, doesn't fire on the soft-delete UPDATE. |

---

## 7. Recommended order for Strategy

Three commits (this round) + Phase 2 (later):

1. **Migration 0043 (optional, decoupled):** archive removal —
   removes the Close button code path, drops `closeInquiry`,
   handles the messages INSERT RLS clause per the §5
   recommendation. Strategy decides whether 0043 lands before or
   after 0044, or whether to bundle. Bundling means one cohesive
   "messaging surface refactor"; decoupling means each can be
   reverted alone.
2. **Migration 0044 (Phase 1 message deletion):** adds
   `messages.deleted_at`; alters the body CHECK; adds the
   UPDATE policy in §3.3; adds the BEFORE UPDATE trigger in §3.4.
3. **App PR (alongside 0044):** `deleteMessage()` helper in
   `src/lib/messages.ts` + the `MessagesSection` UI surface
   (trash icon on own recent messages + placeholder rendering).

**Phase 2 (later):**

4. Migration adds the four `last_read_messages_at` columns on
   `bookings` + `inquiries`. Adds `mark_thread_read` SECURITY
   DEFINER RPC.
5. Migration drops + recreates the UPDATE policy with the
   read-receipt predicate from §4.2.
6. App PR adds tick rendering + `mark_thread_read` call in
   `listMessages` post-fetch.

---

## 8. Open questions for Strategy

| # | Question |
|---|---|
| Q1 | Time-window value — 3 / 5 / 7 / 15 minutes? Recommendation 5 (matches WhatsApp historical default). |
| Q2 | Admin bypass on the new UPDATE policy — recommend NO; defer to a moderation RPC if needed. |
| Q3 | `is_active_user()` on UPDATE policy — recommend YES (suspended users can't retract either). |
| Q4 | Archive removal — bundle with deletion (one migration) or separate (two)? Recommend separate so revert blast-radius stays narrow. |
| Q5 | Archive removal — keep `'closed'` enum value or drop from CHECK? Recommend keep (Option A in §5.2) — no data migration needed; the value just becomes unreachable from app code. |
| Q6 | Messages INSERT on `'converted'` inquiry — block (Option α) or allow (Option β)? Recommend block; preserves the 0040 thread-type separation. |
| Q7 | Body-null on delete — confirmed Strategy is OK with content being unrecoverable from the row (no admin moderation snapshot in Phase 1)? |

---

## 9. Done-ness criteria for Phase 1

After 0043 + 0044 land and the app PR ships:

- A sender can tap a trash icon next to their OWN message sent
  ≤ 5 minutes ago.
- Tap → confirm → row UPDATEs `deleted_at = now()` + `body = null`.
- Thread re-render: the row stays in place, body replaced with
  *"message deleted"* placeholder bubble.
- Tap on the other party's message: no trash icon visible.
- Tap on own message sent > 5 minutes ago: trash icon hidden (UI
  hint); attempt via direct API call → RLS rejects.
- Attempt to update any column other than `deleted_at` / `body` →
  trigger raises.
- Attempt to undelete a row → trigger raises.
- Admin SELECT on the row still sees `deleted_at`; UI doesn't
  expose this surface in Phase 1.

Phase 2 done-ness adds: ticks render, ticks update when other side
opens the thread, deletion blocked once `other_party_last_read_at >= message.created_at`.

# Round 5b / Step 9.5 — Pre-booking inquiry path

> **Plan only.** This document specifies the design. No code, no SQL,
> no type changes have been written. Implementation is a follow-up
> session.

The booking-scoped messaging shipped in Round 5 (Step 9) is real, but
it only opens AFTER the owner has committed to a booking request. The
trust-building conversation an owner needs BEFORE handing their cat to
a stranger has no home in the product. Round 5b closes that gap.

---

## 1. Existing-state audit — every migration that touches `messages`

Three migrations touch `public.messages`. Listed with current state
(post-merge of all three; nothing in 0005-0039 touches the table).

### 1a. `0001_initial_schema.sql` — table creation

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

Key facts:
- `booking_id` is **`NOT NULL`** — structurally enforces "messages
  belong to a booking" at the database layer.
- `ON DELETE CASCADE` from bookings — deleting a booking deletes its
  messages (consistent with "messages are an audit trail of the
  booking lifecycle").
- `sender_id ON DELETE RESTRICT` — can't delete a profile while
  messages reference it (preserves the audit trail).
- `body` non-empty CHECK.
- Indexed on `booking_id` for the timeline read.

### 1b. `0002_rls_policies.sql` — initial RLS

Two policies, both `to authenticated` (anon has zero access to the
table):

```sql
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = messages.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );

create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      left join public.listings l on l.id = b.listing_id
      where b.id = messages.booking_id
        and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
    )
  );
```

- The participant check is the booking's owner OR the listing's host.
- INSERT also enforces `sender_id = auth.uid()` so a user can't
  impersonate the other party.
- **No UPDATE/DELETE policies.** RLS default-deny enforces
  immutability — same posture as `condition_reports`, `daily_updates`,
  `reviews`.

### 1c. `0004_admin_role.sql` — admin + suspend-aware rewrite

Step 4.5 dropped and recreated both policies. Net post-0004 state
(unchanged through 0039):

```sql
-- SELECT: admin bypass OR participant
using (
  public.is_admin()
  or exists (
    select 1 from public.bookings b
    left join public.listings l on l.id = b.listing_id
    where b.id = messages.booking_id
      and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
  )
)

-- INSERT: active-user guard + sender check + participant
with check (
  public.is_active_user()
  and sender_id = (select auth.uid())
  and exists (
    select 1 from public.bookings b
    left join public.listings l on l.id = b.listing_id
    where b.id = messages.booking_id
      and (b.owner_id = (select auth.uid()) or l.host_id = (select auth.uid()))
  )
)
```

- `public.is_admin()` is SECURITY DEFINER + `set search_path =
  public` (migration 0038), so the EXISTS subquery against profiles
  inside is_admin() bypasses caller column grants.
- `public.is_active_user()` is also SECURITY DEFINER post-0038.
- Suspended hosts/owners cannot INSERT new messages (silent block at
  RLS layer; UI surfaces a friendly notice elsewhere).
- Admin can read all booking-scoped threads but does not INSERT —
  no admin-as-impersonator vector.

### 1d. Application-layer code that touches messages

For the audit's completeness, these are the call sites the new design
must remain compatible with:

- `src/lib/messages.ts` — `listMessages(bookingId)`,
  `sendMessage(bookingId, body)`, `containsContactInfo(body)`.
- `src/components/bookings/MessagesSection.tsx` — chat UI; receives
  `messages`, `currentUserId`, `onSend(body)` from the parent.
- `src/app/bookings/[id].tsx:1183-1208` — parent mount point; owns
  the `containsContactInfo` confirm-dialog.

### Audit summary

| Property | Current state | What Round 5b touches |
|---|---|---|
| `messages.booking_id` | `NOT NULL`, FK to `bookings`, cascade on delete | Must become nullable (or stay NOT NULL via a different path — see §2) |
| `messages.sender_id` | `NOT NULL`, FK to `profiles`, restrict | Unchanged |
| `messages.body` | `NOT NULL`, length > 0 | Unchanged |
| Anon access | None — both policies `to authenticated` | Unchanged. Guests on a listing tap "Message host" → `/sign-in?returnTo=…` |
| Participant predicate | Booking's owner or listing's host | Extended to cover inquiry's host or starter — see §4 |
| Admin bypass | Yes on SELECT, not on INSERT | Unchanged |
| `is_active_user()` on INSERT | Yes | Unchanged |
| Immutable (no UPDATE/DELETE) | Yes | Unchanged |
| Cascade-on-booking-delete | Yes | Inquiry-scoped rows need their own cascade (see §3) |

The new design must not duplicate, conflict with, or weaken any of
the above.

---

## 2. Data model — two options + recommendation

### Option A: `inquiries` parent table; `messages.inquiry_id` reference

```
inquiries
  id             uuid PK
  listing_id     uuid NOT NULL FK → listings
  starter_id     uuid NOT NULL FK → profiles  (the owner-side participant)
  host_id        uuid NOT NULL FK → profiles  (snapshot of listing.host_id at thread open)
  status         text  ('open'|'converted'|'archived')
  created_at     timestamptz NOT NULL
  last_message_at timestamptz NULL  (updated by trigger or app)

messages  (modified)
  booking_id     uuid NULL FK → bookings    (was NOT NULL)
  inquiry_id     uuid NULL FK → inquiries   (NEW)
  CHECK (
    (booking_id IS NOT NULL AND inquiry_id IS NULL)
    OR
    (booking_id IS NULL AND inquiry_id IS NOT NULL)
  )
```

The thread is a first-class object. Status field lets the UI render
"Open inquiry" vs "Converted to booking" without joining through
messages. `last_message_at` powers inbox sorting cheaply.

**Pros:**
- Clean upgrade path: when the inquiry becomes a booking, set
  `status='converted'`. The booking thread starts fresh in the
  booking-scoped table (no thread-rewrite migration); the inquiry
  thread stays as a context record for both parties.
- Inbox query is a single read against `inquiries` joined to
  `profiles` + `listings`; no aggregate over `messages` needed.
- Stable thread identity even if every message gets deleted (e.g.,
  retention).
- Mirrors how Airbnb / Rover / Cat-in-a-Flat model pre-booking
  conversations.
- The pair `(listing_id, starter_id)` can be made `UNIQUE` — one
  inquiry thread per owner-host pair per listing. Prevents
  duplicate-thread sprawl from accidental re-taps.

**Cons:**
- One new table + one new FK column + a CHECK + a UNIQUE constraint.
  Higher schema footprint than option B.
- Two policies to manage on inquiries (SELECT + INSERT) on top of the
  expanded messages policy.

### Option B: `listing_id` + `recipient_id` on messages directly

```
messages  (modified)
  booking_id     uuid NULL FK → bookings    (was NOT NULL)
  listing_id     uuid NULL FK → listings    (NEW)
  recipient_id   uuid NULL FK → profiles    (NEW; the other party for listing-scoped rows)
  CHECK (
    (booking_id IS NOT NULL AND listing_id IS NULL AND recipient_id IS NULL)
    OR
    (booking_id IS NULL AND listing_id IS NOT NULL AND recipient_id IS NOT NULL)
  )
```

Each listing-scoped row carries its own (listing, sender, recipient)
tuple. A "thread" is the de-facto group-by of
`(listing_id, least(sender, recipient), greatest(sender, recipient))`.

**Pros:**
- One table to touch. Smaller migration.
- No new parent object.

**Cons:**
- No first-class thread → no `status`, no `last_message_at`. Inbox
  query becomes a distinct/GROUP BY across messages, expensive at
  scale.
- Upgrade-path is awkward: when an inquiry becomes a booking, either
  the old listing-scoped rows stay as orphan "pre-booking context"
  with no way to navigate from the booking back to them, OR you
  rewrite N rows to set their `booking_id`. Both worse than option A.
- No natural place to enforce "one thread per pair per listing" —
  needs a per-row UNIQUE on
  `(listing_id, least(sender,recipient), greatest(sender,recipient))`
  which is awkward and requires a `LEAST/GREATEST` expression index.
- Two new nullable columns plus the existing `booking_id` nullable
  means messages carry three FKs where one is meaningful per row.
  Harder to reason about, easier to mis-query.

### Recommendation: **Option A**

Strategy's preliminary lean validates against the code. The deciding
factors against B:

1. **Inbox cost.** "My Inquiries" needs the most-recent message per
   thread, sortable. Against B that's a window function over the
   whole messages table. Against A it's a SELECT on inquiries with
   the index already paying for itself.
2. **Upgrade-path cleanliness.** A's status flip is one UPDATE; B
   would require either an awkward N-row rewrite or accepting that
   pre-booking history is unreachable post-conversion. The latter
   matches the open decision in §7 (cleaner separation), but only A
   makes the OTHER answer (carry messages over) cheap.
3. **Anti-leak surface area.** A gives the admin one row per thread
   to spot-check; B gives them N rows per thread, every spot-check
   is a thread reconstruction.
4. **The existing booking-scoped thread is untouched.** A's CHECK
   constraint guarantees a message is either booking-scoped (old
   shape) or inquiry-scoped (new shape) — never both. The booking
   path's RLS predicate keeps working byte-identically because
   `messages.booking_id` is still the same column type and FK; only
   the NOT NULL flips.

### Paired type change (described, not written)

`src/types/database.ts` `messages` Row/Insert/Update will gain:

- `booking_id: string | null` (was `string`)
- `inquiry_id: string | null` (new)

A new `inquiries` table block with the four columns + status enum
`'open' | 'converted' | 'archived'`. New `Enums['inquiry_status']`
entry. Update the relationships array on messages to include the
inquiries FK.

The migration that introduces these MUST land in the same commit as
the type-shim update — per CLAUDE.md §11 / ONBOARDING.md §9
"Migrations" convention.

---

## 3. Migration shape — described, NOT written

The future migration (`0040_inquiry_threads.sql` per the next free
number) will do, in order:

1. **Create `public.inquiries`** with `id`, `listing_id` (FK,
   NOT NULL), `starter_id` (FK to profiles, NOT NULL), `host_id`
   (FK to profiles, NOT NULL), `status` (text NOT NULL, CHECK in the
   three-state enum, default `'open'`), `created_at`,
   `last_message_at` (nullable).
2. **Add UNIQUE `(listing_id, starter_id)`** — one inquiry per
   owner-host pair per listing. Re-tapping "Message host" should
   return the existing thread, not create a duplicate.
3. **Index `inquiries(host_id, last_message_at DESC NULLS LAST)`**
   and `inquiries(starter_id, last_message_at DESC NULLS LAST)` for
   the two inbox queries (one per role).
4. **Alter `public.messages`**:
   - `alter column booking_id drop not null`
   - `add column inquiry_id uuid references public.inquiries(id) on delete cascade`
   - `add constraint messages_one_thread_check check (...)` with the
     exactly-one predicate from §2 option A
   - `create index messages_inquiry_id_idx on public.messages(inquiry_id)`
5. **Enable RLS on inquiries** + the four policies in §4.
6. **Drop and recreate** `messages_select_participants` and
   `messages_insert_participants` so the predicate covers both
   thread types — see §4.

The `last_message_at` denormalization is best maintained by an
AFTER INSERT trigger on `messages` that sets
`inquiries.last_message_at = NEW.created_at WHERE id = NEW.inquiry_id`
when `NEW.inquiry_id IS NOT NULL`. Cheap, single-row update.

Verification queries at the tail of the migration (pattern from
0029/0030/0037): count policies on `inquiries`, count policies on
`messages`, confirm the CHECK constraint expression, confirm the
unique index.

---

## 4. RLS design

### Inquiries policies

```text
inquiries_select_participants    (to authenticated)
  using:
    is_admin()
    OR starter_id = auth.uid()
    OR host_id = auth.uid()

inquiries_insert_starter         (to authenticated)
  with check:
    is_active_user()
    AND starter_id = auth.uid()
    AND host_id = (select host_id from public.listings where id = inquiries.listing_id)
    AND status = 'open'
    AND starter_id <> host_id    -- can't inquire on your own listing
    AND exists (
      select 1 from public.listings l
      join public.profiles host on host.id = l.host_id
      where l.id = inquiries.listing_id
        and l.status = 'approved'
        and host.is_verified = true
        and host.is_suspended = false
    )                            -- can only inquire on listings the public can see

inquiries_update_participants    (to authenticated)
  -- Only status transitions: 'open' → 'converted' (when a booking
  -- accepts the inquiry) or 'open' → 'archived' (either party hides
  -- the thread from their inbox). UPDATE policy + CHECK constraint
  -- on allowed transitions enforced by a BEFORE UPDATE trigger.
  using:
    is_admin()
    OR starter_id = auth.uid()
    OR host_id = auth.uid()
  with check:
    is_admin()
    OR starter_id = auth.uid()
    OR host_id = auth.uid()

-- No DELETE policy. Inquiries are an audit trail like bookings.
```

The self-inquiry guard mirrors R2C1's self-booking guard (0029 Part
A). The verified-host + approved-listing predicate mirrors the
listings_select_active_verified_or_own clause from 0024 — guarantees
you can't pre-open a thread to a listing that the public can't see.

### Updated messages policies

```text
messages_select_participants     (to authenticated)
  using:
    is_admin()
    OR (
      -- Booking-scoped row (existing path, unchanged predicate)
      booking_id IS NOT NULL
      AND exists (
        select 1 from public.bookings b
        left join public.listings l on l.id = b.listing_id
        where b.id = messages.booking_id
          and (b.owner_id = auth.uid() or l.host_id = auth.uid())
      )
    )
    OR (
      -- Inquiry-scoped row (new path)
      inquiry_id IS NOT NULL
      AND exists (
        select 1 from public.inquiries i
        where i.id = messages.inquiry_id
          and (i.starter_id = auth.uid() or i.host_id = auth.uid())
      )
    )

messages_insert_participants     (to authenticated)
  with check:
    is_active_user()
    AND sender_id = auth.uid()
    AND (
      (
        booking_id IS NOT NULL AND inquiry_id IS NULL
        AND exists (existing booking participant check)
      )
      OR
      (
        inquiry_id IS NOT NULL AND booking_id IS NULL
        AND exists (
          select 1 from public.inquiries i
          where i.id = messages.inquiry_id
            and i.status = 'open'
            and (i.starter_id = auth.uid() or i.host_id = auth.uid())
        )
      )
    )
```

Composes with §1 cleanly:
- Admin bypass on SELECT is preserved.
- `is_active_user()` on INSERT is preserved.
- `sender_id = auth.uid()` impersonation guard is preserved.
- Booking-scoped read/write path is byte-identical for any row that
  has `booking_id IS NOT NULL`. The CHECK constraint guarantees these
  rows have `inquiry_id IS NULL`, so the "inquiry" branch of the OR
  is structurally inert for them.
- The `status = 'open'` clause on the inquiry-INSERT branch prevents
  new messages on a converted or archived inquiry. Pair this with
  application-level "this inquiry is closed" UI.
- Same as today: no UPDATE/DELETE on messages.

### Storage

No new storage buckets. Inquiries are text-only; if image-attach
lands in a later step it'll reuse `condition-report-photos` storage
posture (private + immutable).

---

## 5. Route / UI layout

### Listing detail — `src/app/listings/[id]/index.tsx`

A new "Message host" button lands next to (or above) the existing
"Request booking" CTA. Visibility matrix:

| Viewer | "Message host" | "Request booking" |
|---|---|---|
| Guest | Shows → `/sign-in?returnTo=/listings/[id]&action=inquire` | Hidden, replaced by guest-sign-in CTA |
| Owner (signed in, not the host) | Shows → opens compose surface | Shows |
| Host viewing own listing | Hidden | Hidden, replaced by Edit CTA (existing) |
| Suspended | Hidden in both | Hidden in both |

Tapping "Message host" → either:

- **5a — Modal compose** (simpler): a bottom-sheet or fullscreen
  modal with the host's avatar + name at the top and the existing
  `MessagesSection` mounted. On first send, the inquiry row is
  created (UPSERT against the `(listing_id, starter_id)` UNIQUE,
  conflict → fetch existing). Closes back to the listing.
- **5b — Dedicated route** (better deep-link UX): `/inquiries/[id]`
  or `/listings/[id]/inquire`. Same UI, navigable via URL, browser
  history works, refresh-safe. Recommended.

Both surfaces reuse `MessagesSection` — the component is already
presentational; the parent (listing-detail-inquire-route) owns the
state + handlers + the `containsContactInfo` confirm-dialog. The
`onSend` signature changes to support inquiry-scoped sends:

```text
// Pseudo-API for the lib helper. NOT WRITTEN.
sendInquiryMessage(inquiryId, body): Promise<Message>
  // RLS enforces inquiry participant + open status + active user
```

The first send creates the inquiry. A small helper
`openInquiryThread(listingId, starterId, hostId)` upserts the
inquiry row and returns the id.

### Inbox — `src/app/inquiries/index.tsx`

Mirror of `src/app/bookings/index.tsx`. Two views by role:

- **Owner view (default for `role='owner'`):** lists inquiries
  where `starter_id = auth.uid()`. Each row: host avatar + name,
  listing thumbnail, last-message snippet, last-message-at relative
  stamp, unread-dot (reuses the `last-seen-storage.ts` pattern from
  R2C7 if we want symmetric unread state).
- **Host view (for `role='host'`):** lists inquiries where
  `host_id = auth.uid()`. Each row: owner avatar + name, listing
  thumbnail, last-message snippet, last-message-at. Doubles as a
  lead funnel.

Tap → `/inquiries/[id]` which mounts `MessagesSection`.

### AppHeader hamburger menu

Mirror of the existing "My Bookings" entry. Single new MenuItem in
`src/components/AppHeader.tsx`:

```text
<MenuItem
  label={t('nav.inquiries')}
  onPress={goAndClose('/inquiries')}
/>
```

Position: right after "My Bookings". If we want a badge for unread
inquiry count, the existing `HostNotificationsProvider` is the
natural place — add `pendingInquiryCount` alongside
`pendingHostCount`. Out of scope for the first Round 5b commit;
flagged here as a follow-up.

---

## 6. Anti-leakage

The existing `containsContactInfo(body)` regex in `src/lib/messages.ts`
applies unchanged. The compose surface for inquiries calls it
identically to the booking-scoped compose:

```text
onSend = async (body) => {
  if (containsContactInfo(body)) {
    if (!(await confirmDialog(t('messages.contact_warning')))) return;
  }
  await sendInquiryMessage(inquiryId, body);
  ...
}
```

**Policy stays at SOFT nudge for MVP** — same decision as
booking-scoped messaging. Confirm-and-send, not block-and-rephrase.

**Flag for the founder + future ops:** pre-booking is the
highest-risk commission-leak surface in the product. An owner who
opens an inquiry has not yet committed money. A host who hands over
WhatsApp at this stage costs Petbnb the entire booking. Booking-
scoped messaging is comparatively low-risk because the booking is
already in the system (commission is captured on accept).

The CLAUDE.md §11 "Message anti-leakage policy" item should
explicitly call out inquiries as the priority surface for admin
spot-checks, even though both surfaces share the same regex. If
escalation to HARD block ever happens, doing it on inquiries FIRST
(asymmetric tightening) is a reasonable compromise: keeps the lower-
risk booking-scoped thread frictionless, hardens the high-risk
pre-booking thread.

---

## 7. OPEN DECISION — inquiry-to-booking message carry-over

When an inquiry leads to a booking, what happens to the inquiry's
messages?

### Option α — Booking thread starts fresh; inquiry thread stays as context

- Inquiry's `status` flips `'open' → 'converted'`. Inquiry row stays
  readable, messages stay attached to the inquiry, both parties can
  scroll back to "how we got here" by opening the inquiry from the
  inbox.
- Booking opens with an empty messages list. The booking-detail
  screen could surface a "View inquiry conversation" link that
  navigates to the inquiry route.
- Clean separation. No data rewrite. The CHECK constraint in §2
  (exactly one of booking_id / inquiry_id) is honored without
  contortion.
- Cost: two threads per converted booking, two unread states to
  track, slight UX overhead.

### Option β — Carry inquiry messages over to the booking thread

- On booking accept, all messages with `inquiry_id = X` get their
  `inquiry_id` cleared and `booking_id = NEW.id` set. The CHECK
  constraint requires this swap to be a single transaction.
- Inquiry row may stay as a stub for the lead-funnel analytics, or
  be hard-archived.
- One unified thread for the user. No "where did that conversation
  go?" confusion.
- Cost: schema operations on conversion (an UPDATE of N rows + the
  status flip), and the cascade-on-delete semantics now bind those
  pre-booking messages to the booking's lifecycle. Cancelling a
  booking would delete pre-booking history — almost certainly NOT
  what we want, so cancel semantics would need to fork
  (UPDATE booking to cancelled vs cascade-delete the booking row;
  we'd be choosing the former either way, but the implicit promise
  of `ON DELETE CASCADE` becomes a footgun).

### Trade-offs at a glance

| | Option α (fresh booking thread) | Option β (carry-over) |
|---|---|---|
| Implementation | Trivial — set status, move on | N-row UPDATE in a transaction |
| User mental model | Two threads — "we talked, then we booked" | One thread |
| Cancel safety | Inquiry history independent — preserved | Cancel deletes pre-booking messages unless cascade changed |
| Analytics | Inquiry-to-conversion funnel readable directly | Funnel readable but requires JOIN to booking |
| Cascade semantics | Untouched | Becomes load-bearing in a non-obvious way |
| Matches incumbent (Airbnb / Rover) | Closer — Airbnb threads are listing-scoped pre-booking | Different — Rover unifies post-acceptance |

### Strategy lean (not a decision)

Option α has fewer footguns and matches the founder's mental model
("the trust conversation is its own thing, the booking is its own
thing"). Option β reads cleaner in the day-to-day "scroll up" UX.

**This decision is for the founder.** Round 5b should NOT silently
ship option α without a sign-off — the cancel-deletion footgun in
option β is the kind of thing that's invisible at build time and
shows up as data loss during operations.

---

## Sequencing

Round 5b implementation order (later, not now):

1. Migration `0040_inquiry_threads.sql` + paired type update.
2. `src/lib/inquiries.ts` with the new helpers.
3. Compose-surface route + Message-host CTA on listing detail.
4. `/inquiries` inbox + AppHeader menu item.
5. Smoke test in incognito + signed-in test accounts.
6. Update CLAUDE.md §11: cross the pre-booking-inquiry item off
   the pre-launch list; leave the anti-leakage policy item open
   (the soft-nudge decision is unchanged but the surface area grew).

---

## Out of scope for Round 5b

- Realtime subscriptions on inquiries (same caveat as booking-
  scoped messaging; `useFocusEffect` refetch is the MVP).
- Image attach on inquiries (text-only first).
- An admin "search messages for contact-info matches" tool — the
  spot-check workflow is browser-Supabase-table for now.
- Push notifications on new inquiry message (same dependency on
  Expo credentials as the rest of push).
- Auto-archive on N days of inactivity.
- "Block this user" — a real feature but post-MVP.

The plan deliberately stays small. The point is to close the
trust-conversation gap, not to ship a full DMs product.

# Migration 0047 / Phase 2 — Notifications v1 (PLAN)

> **Status: PLAN — not yet built.** This is the plan-doc-first deliverable for
> Phase 2 of the Pre-Pilot Hardening plan. Nothing here is applied. Flow:
> CC writes this → Strategy Claude + founder review → SQL written → line-by-line
> review → Omar applies wrapped in `begin;/commit;` → verification queries →
> `docs/migration-apply-log.md`.
>
> **Baseline:** `main` through migration 0046 + Phase 1 observability (Sentry +
> PostHog). CI green.

---

## 1. Goal & scope (from the plan)

> No host ever misses a booking request; no owner misses an
> accept/decline/message. This is the biggest product hole in the current build.

In scope for Phase 2:

- A persistent `notifications` table (migration 0047) — the badge stops being a
  computed count and becomes table-backed.
- **In-app** notifications for **five event families**, inserted by **DB
  triggers** on the source events (so every write path is covered regardless of
  which client performed it — mirrors the 0046 stamper philosophy).
- **Email** notifications for the same families via Resend, throttled for
  messages.
- A **`NotificationProvider`** channel abstraction (`in_app` / `email` /
  `whatsapp`-stub-behind-flag), mirroring the `PaymentProvider` pattern.
- **UI**: `/notifications` list screen + a bell + unread badge in `AppHeader`.
- **i18n** keys for every notification type, both locales.

### The five event families → recipient

| # | Family | Fires on | Recipient | Link target |
|---|---|---|---|---|
| 1 | `booking_requested` | booking INSERT (`status='requested'`) | listing's **host** | `/bookings/[id]` |
| 2 | `booking_accepted` | booking UPDATE → `accepted` | booking **owner** | `/bookings/[id]` |
| 3 | `booking_declined` | booking UPDATE → `declined` | booking **owner** | `/bookings/[id]` |
| 4 | `message_received` | message INSERT | the **other** participant | `/bookings/[id]` or `/inquiries/[id]` |
| 5 | `host_application_approved` / `host_application_rejected` | profile UPDATE (`host_application_status` → approved/rejected) | the **applicant** | `/become-host/complete-profile` (approved) · `/profile` (rejected) |

Everything else (booking `active` / `completed` / `disputed`, review posted, etc.)
is **out of scope for v1** — easy to add later once the machinery exists.

---

## 2. Existing-state audit (what we're building on / around)

- **Badge today is computed, host-only.** `HostNotificationsProvider`
  (`src/lib/host-notifications.tsx`) fetches `countPendingHostBookings(user.id)`
  on user/role change + explicit refresh — no realtime, host accounts only.
  `AppHeader` renders a 📥 badge from it for `role='host'`. Owners get **no**
  signal for accepts/declines/messages today. That's the hole.
- **No `notifications` table exists.**
- **No Supabase Edge Functions exist** (`supabase/functions/` is absent).
- **Resend is wired ONLY as Supabase Auth SMTP** (OTP / password email). There
  is **no programmatic transactional-email path** — no Resend API key in the
  project, no server code that calls Resend. **Sending notification email is net-
  new infrastructure**, not "existing Resend setup." This is the single biggest
  new operational dependency in Phase 2 (see §6 + §9).
- **Reusable patterns from 0044** (this migration leans on them heavily):
  - SECURITY DEFINER + `set search_path = public` for RPCs / trigger fns.
  - Forward-only **guard trigger** (monotonic timestamps; reject going backward).
  - `to authenticated` policies; anon never gains a surface.
  - `is_active_user()` / `is_admin()` helpers (0038, SECURITY DEFINER).
  - A verification-query block at the tail of the migration.
- **Trigger-timing coexistence:** the new AFTER triggers coexist with existing
  ones — `guard_booking_status_stamp` (0046) is BEFORE UPDATE; `touch_inquiry_
  last_message_at` (0040) is AFTER INSERT on messages. Multiple triggers fire in
  name order; no conflict, but naming matters (see §5).

---

## 3. Data model — `notifications` table

```
notifications
  id           uuid primary key default gen_random_uuid()
  user_id      uuid not null references auth.users(id) on delete cascade  -- the RECIPIENT
  type         text not null   -- CHECK in the enum below
  title_key    text not null   -- i18n key the client renders: t(title_key, body_params)
  body_params  jsonb not null default '{}'::jsonb   -- placeholder values (IDs / names) for the i18n string
  link_path    text not null   -- in-app deep link, e.g. /bookings/<id>
  created_at   timestamptz not null default now()
  read_at      timestamptz     -- NULL = unread; set once when opened, forward-only
  emailed_at   timestamptz     -- NULL = email not sent; set by the email channel (also drives the throttle)
```

- **`type` CHECK** — closed set:
  `booking_requested`, `booking_accepted`, `booking_declined`,
  `message_received`, `host_application_approved`, `host_application_rejected`.
- **Indexes:**
  - `notifications_user_unread_idx` — **partial** `on (user_id) where read_at is null`
    — the hot path for the unread-badge count.
  - `notifications_user_created_idx` — `on (user_id, created_at desc)` — the
    `/notifications` list.
- **`body_params` holds IDs / short display strings only** (e.g.
  `{"petName":"مشمش","nights":3}`). The client renders the localized title from
  `title_key`; the row does NOT store a pre-rendered localized string, so a
  locale switch re-renders correctly and we never store two copies.
  - ⚠️ **Open decision (D1):** do we allow a display **name** (owner/pet name)
    in `body_params`, or IDs only? Names make the notification readable
    ("Reem requested a booking") but are mild PII living in a new table. Recommend
    **allow short display names** (they're already visible to the recipient in
    the linked screen) but never phone/email. Flag for founder.

Why these columns and not more: this is the minimum that renders a localized,
tappable, read-trackable notice and supports the email throttle. No `channel`
column — channel routing is a per-`type` spec (§4), not per-row state.

---

## 4. `NotificationProvider` — the channel abstraction

Per the plan, a channel abstraction mirroring `PaymentProvider`. Channels:
`in_app` (the table), `email` (Resend), `whatsapp` (stub behind
`WHATSAPP_ENABLED = false`).

**Where each channel actually executes** (this is the important clarification):

- **`in_app` executes in the DATABASE** (the trigger inserts the row). This is
  deliberate — it's the "every write path covered" guarantee. The client never
  inserts notifications (no INSERT policy for `authenticated`; see §5).
- **`email` / `whatsapp` execute SERVER-SIDE** in an Edge Function fired by a
  Database Webhook on `notifications` INSERT (§6).

So the **single source of truth for "which channels does type X use"** is a
typed spec, `NOTIFICATION_SPEC`, that lives in **`src/lib/notifications.ts`**
(client) AND is mirrored by a minimal server copy in the Edge Function:

```ts
// src/lib/notifications.ts (illustrative — final shape in the build PR)
export type NotificationType =
  | 'booking_requested' | 'booking_accepted' | 'booking_declined'
  | 'message_received'
  | 'host_application_approved' | 'host_application_rejected';

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp';

export const NOTIFICATION_SPEC: Record<NotificationType, {
  titleKey: string;
  channels: NotificationChannel[];   // whatsapp present but gated by WHATSAPP_ENABLED
  throttle?: 'per_thread_hour';      // message_received only
}> = { /* ... */ };
```

- **WhatsApp is a typed no-op** for v1: present in the `channels` array but the
  dispatcher skips it while `WHATSAPP_ENABLED = false`. Keeps the seam without
  building the adapter.
- The Edge Function can't import from `src/` (Deno vs. RN module systems), so it
  keeps a **small server-side mirror** of the email-relevant subset (subject +
  body template per type). This duplication is intentional and small; flagged
  as **D2** (accept the mirror vs. generate it from a shared JSON at build time —
  recommend accept the mirror for v1).

---

## 5. Insert mechanism — DB triggers (the `in_app` channel)

Three SECURITY DEFINER trigger functions insert into `notifications`. All pin
`search_path = public` and are written so a NULL recipient (shouldn't happen)
is skipped rather than erroring the source write.

1. **`bookings` — AFTER INSERT** → notify host of a new request.
   - Recipient = `listings.host_id` for `NEW.listing_id`.
   - `type='booking_requested'`, `link_path='/bookings/'||NEW.id`.
2. **`bookings` — AFTER UPDATE** (when `NEW.status` changed to `accepted` /
   `declined`) → notify `NEW.owner_id`.
   - Guard: only fire when `OLD.status IS DISTINCT FROM NEW.status` and new
     status ∈ {accepted, declined}. Coexists with the BEFORE `guard_booking_
     status_stamp` (0046) — different timing.
3. **`messages` — AFTER INSERT** → notify the **other** participant.
   - Booking-scoped: other = owner if sender is host, else host
     (`listings.host_id` lookup). Inquiry-scoped: other = starter/host opposite.
   - `link_path` = `/bookings/<booking_id>` or `/inquiries/<inquiry_id>`.
   - Do **not** notify on a sender's own soft-delete UPDATE (AFTER INSERT only).
   - Coexists with `touch_inquiry_last_message_at` (0040) — name the new trigger
     so ordering is irrelevant (both are independent inserts/updates).
4. **`profiles` — AFTER UPDATE** (when `host_application_status` changed to
   `approved` / `rejected`) → notify `NEW.id`.
   - `type` = `host_application_approved` | `host_application_rejected`.

**Recipient resolution note:** each trigger computes the recipient and the
`body_params` (e.g. pet name via a join for booking events). Kept to cheap
single-row lookups. Suspended users can't generate source events (RLS already
blocks their inserts), so no notification is generated for a suspended actor —
no extra guard needed.

**Why triggers, not a client RPC:** robustness. A client that forgets to call
`emitNotification()` would silently drop the signal; a trigger can't be
bypassed. Matches the plan's stated intent.

---

## 6. Email channel — Database Webhook → Edge Function → Resend

**This is the net-new infra.** Recommended architecture:

```
notifications INSERT
      │  (Supabase Database Webhook, configured in the dashboard)
      ▼
Edge Function  supabase/functions/notify-email/index.ts   (Deno)
      │  reads the row; looks up the type in the server template mirror;
      │  applies the throttle; renders subject+body in the recipient's locale
      ▼
Resend API  (RESEND_API_KEY secret)  ──►  recipient's email
      │
      └─ on send, stamp notifications.emailed_at (service-role update)
```

- **Recipient email** comes from `auth.users.email` (the Edge Function uses the
  service-role key, so it can read it) — email is never exposed to clients.
- **Locale**: render from `profiles.locale` for the recipient (default `ar`).
- **Throttle (message_received only), the proposed mechanism (D3):** before
  sending, the function checks
  `select 1 from notifications where user_id=$1 and type='message_received' and link_path=$2 and emailed_at > now() - interval '1 hour'`.
  If a row exists → **skip email** (the in-app row still exists). `link_path`
  IS the thread key (`/bookings/<id>` / `/inquiries/<id>`), so no extra column
  is needed beyond `emailed_at`. One email per thread per hour per recipient.
- **`emailed_at`** is written by the function (service role) after a successful
  send — doubles as "email sent" evidence and the throttle state.
- **WhatsApp**: the function has a `whatsapp` branch guarded by
  `WHATSAPP_ENABLED=false` → no-op for v1.

**Alternative considered & rejected:** `pg_net` calling Resend directly from the
trigger. Rejected because rendering localized HTML email bodies in plpgsql is
painful and couples templating to SQL. Edge Function keeps templating in TS.

### ⚠️ Recommended sub-sequencing — ship `in_app` first (2a), email second (2b)

The `in_app` channel is **pure SQL** (0047) — immediately shippable, closes the
core "no host misses a request" hole via the table + bell. The **email** channel
needs Omar to (a) get a Resend **API key** (distinct from the SMTP creds), (b)
have the Edge Function deployed (`supabase functions deploy` — Supabase CLI),
(c) configure the Database Webhook + the `RESEND_API_KEY` secret. That's a
multi-step operational lift.

**Recommendation:** split Phase 2 into **2a (in_app + UI, SQL-only)** and
**2b (email via Edge Function)**. 2a delivers most of the value with the least
operational risk; 2b follows once the Resend/Edge infra is set up. Flag for
founder as **D4**. (If the founder wants both in one go, fine — the design is
identical, just applied together.)

---

## 7. RLS & RPCs (migration 0047)

- **SELECT** `notifications_select_own` — `to authenticated`,
  `using (user_id = (select auth.uid()))`. (No admin read for v1; add a
  SECURITY DEFINER admin RPC later if support needs it — mirrors the 0040/0044
  "no quiet admin override" stance.)
- **UPDATE** `notifications_update_own_read` — `to authenticated`,
  `using (user_id = auth.uid())`, `with check (user_id = auth.uid())`. The
  **guard trigger** `guard_notification_update` enforces the WHAT: only
  `read_at` may change; it's forward-only (`NULL → non-null` once; never back to
  null, never smaller); `emailed_at` is **not** client-writable (only the
  service-role email function sets it — service role bypasses RLS, and the guard
  rejects a client touching it). All other columns immutable.
- **No INSERT policy** for `authenticated` → clients cannot forge notifications.
  Inserts come only from the SECURITY DEFINER triggers (which bypass RLS).
- **No DELETE** → notifications are durable for v1 (a "clear" affordance can come
  later as an UPDATE-based soft dismiss if wanted).
- **`mark_all_notifications_read()`** — SECURITY DEFINER RPC,
  `set search_path = public`, `to authenticated`: sets `read_at = now()` for the
  caller's unread rows. (Single-row read uses the plain UPDATE policy from the
  list screen; this RPC backs a "mark all read" button.)
- **anon**: no policy → no surface. Consistent with 0044.

---

## 8. Client architecture & UI

- **`src/lib/notifications.ts`** (new): `NotificationType` / `NotificationChannel`
  types, `NOTIFICATION_SPEC`, and read helpers: `listNotifications()`,
  `countUnread()`, `markNotificationRead(id)` (plain UPDATE), `markAllRead()`
  (RPC). All try/catch with friendly Arabic errors, per house style.
- **Provider**: extend the existing provider (currently
  `HostNotificationsProvider`) to expose `unreadCount` + `refreshUnread()`
  backed by the table, **keeping** the existing `pendingHostCount` API during
  transition. v1 refresh = on mount / focus / after actions (realtime is
  **Phase 5**, not here). **D5:** does the new universal bell **subsume** the
  host-only 📥 booking badge (a booking request now also creates a
  `booking_requested` notification)? Recommend **yes** — one bell for everyone,
  retire the 📥 count once the bell ships — but keep `pendingHostCount` wired for
  one release to de-risk. Flag for founder.
- **`AppHeader`**: a 🔔 bell for **all** signed-in users with an unread count
  badge (`9+` cap, matching the current 📥 style), routing to `/notifications`.
- **`/notifications`** (new screen): list newest-first, read/unread visual state,
  tap → `markNotificationRead(id)` then `router.push(link_path)`; empty + loading
  states (house rule). "Mark all read" action → `markAllRead()`.

---

## 9. i18n

- A `notifications.*` namespace: one `title_key` per `type` + screen chrome
  (`notifications.screen_title`, `notifications.empty`, `notifications.mark_all`,
  `nav.notifications_bell` a11y label). Both locales, masculine register,
  Latin digits — same commit as the code that references them (parity gate).
- Title strings take `body_params` placeholders, e.g.
  `notifications.booking_requested` = `"طلب حجز جديد"` (v1 can be param-free
  titles; richer templated bodies are a fast follow). **D6:** param-free titles
  vs. templated (`"طلب حجز من {ownerName}"`). Recommend **short param-free
  titles** for v1 to keep the i18n surface small; the linked screen carries the
  detail.
- **Email templates** (2b) are a **separate, server-side** copy in the Edge
  Function (Deno can't read `src/locales`). Small subject+body per type, both
  locales. Duplication acknowledged (D2).

---

## 10. Migration 0047 shape (sections) + verification

1. `create table public.notifications` (+ `type` CHECK) + `enable row level security`.
2. Two indexes (partial-unread, user+created).
3. RLS policies: `select_own`, `update_own_read`.
4. `guard_notification_update` trigger fn + trigger (read_at-only, forward-only,
   emailed_at not client-writable).
5. `mark_all_notifications_read()` RPC + GRANTs (revoke public/anon/service_role,
   grant authenticated) — matches the 0044 GRANT convention.
6. Four insert-trigger fns + triggers (bookings AFTER INSERT, bookings AFTER
   UPDATE, messages AFTER INSERT, profiles AFTER UPDATE), SECURITY DEFINER.
7. Verification-query block (tail comment), covering: table+columns present;
   both indexes present; exactly the expected policies; guard rejects a non-
   `read_at` change and a backward `read_at`; each insert trigger produces one
   row to the right recipient (behavioral, rollback-wrapped); anon sees nothing.

`emailed_at` ships in 0047 even though the email channel (2b) lands later — the
column is cheap and avoids a second migration.

---

## 11. ⛔ Omar checkpoints

- **2a (in_app + UI):** review + apply `0047` (wrapped in `begin;/commit;`);
  run the verification queries; log to `docs/migration-apply-log.md`. Smoke:
  as owner request a booking → host sees an in-app row + bell badge; accept →
  owner sees a row; send a message → recipient sees a row.
- **2b (email):** create a **Resend API key** (Dashboard → API Keys — this is
  NOT the SMTP cred); deploy the `notify-email` Edge Function
  (`supabase functions deploy notify-email`); set the `RESEND_API_KEY` function
  secret; configure a **Database Webhook** on `public.notifications` INSERT →
  the function URL. Smoke: the booking-request above also delivers an email;
  send two messages in one thread within an hour → exactly one email.

---

## 12. Open decisions for Strategy / founder (consolidated)

- **D1** — `body_params`: allow short display names, or IDs only? *(rec: allow
  names, never phone/email.)*
- **D2** — email templates: accept a small server-side mirror in the Edge
  Function vs. a build-time shared source? *(rec: accept the mirror for v1.)*
- **D3** — message-email throttle via `emailed_at` + `link_path` thread key.
  *(rec: yes — no extra columns.)*
- **D4** — split into **2a (in_app, SQL-only)** now and **2b (email)** after the
  Resend/Edge infra is set up? *(rec: yes.)*
- **D5** — does the universal 🔔 bell subsume the host-only 📥 badge? *(rec: yes,
  keep `pendingHostCount` one release for safety.)*
  **→ SUPERSEDED 2026-07-06:** KEEP BOTH through the pilot — post-sweep the
  semantics diverged (🔔 clears on READ, 📥 clears on DECIDE), so 📥 is now
  the only "undecided work" signal. Decide by pilot data. See the "UX
  decisions parked for pilot data" entry in `docs/batch-decisions.md`.
- **D6** — param-free titles vs. templated bodies for v1. *(rec: param-free.)*

## 13. Explicit non-goals (Phase 2)

Realtime notification delivery (Phase 5), notifications for booking
active/completed/disputed or review-posted, admin notification console, push
(APNs/FCM — native builds are a plan non-goal), a "clear/delete notification"
affordance, per-type user preferences/mute. All post-pilot or later phases.

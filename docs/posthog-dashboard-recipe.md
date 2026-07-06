# PostHog dashboard recipe — Petbnb pilot

> Click-by-click instructions to assemble the pilot dashboard from the
> events the app already sends (Phase 1 + 1.5). Prereq: the PostHog
> project exists and `POSTHOG_KEY` / `POSTHOG_HOST` are set in `.env`
> and Vercel (Phase 1 ⛔ checkpoint). Until then no data flows.
>
> Session replay is deliberately OFF (Strategy decision) — revisit at
> pilot start, gated on the live privacy policy + mask-all-text config.

## The event vocabulary (what the app sends)

| Event | Fires when | Useful props |
|---|---|---|
| `$pageview` | every screen change (guests included) | `path` |
| `listing_viewed` | listing detail loads (guests included) | `listingId` |
| `feed_filtered` | any feed filter/sort change | `city`, `femaleOnly`, `groomingOnly`, `noResidentPets`, `species`, `priceBand`, `sort` |
| `signup_started` | OTP sent from the sign-in screen | `flow` (`owner`/`host`) |
| `signup_completed` | owner saved name / host submitted application | `flow` |
| `inquiry_opened` | "Message host" opened a thread | `inquiryId`, `listingId` |
| `message_sent` | message sent (either thread kind) | `thread`, `bookingId`/`inquiryId` |
| `booking_requested` | owner submitted a request | `bookingId`, `listingId` |
| `booking_accepted` | host accepted | `bookingId`, `listingId` |
| `booking_declined` | host declined | `bookingId`, `listingId` |
| `booking_cancelled` | owner cancelled | `bookingId`, `listingId`, `refundTier` |
| `booking_completed` | host completed the stay | `bookingId`, `listingId` |
| `review_submitted` | review posted | `bookingId`, `stars` |
| `host_application_submitted` | host application submitted | `userId` |
| `contact_nudge_shown` / `contact_nudge_sent_anyway` | anti-leakage warning shown / overridden | `thread` |

Identity: anonymous visitors get an anonymous ID; on sign-in we call
`identify(user.id)`, so pre-signup activity stitches onto the person.
No PII in any event prop (IDs and scalars only).

## Create the dashboard

PostHog → **Dashboards → New dashboard** → name it **"Petbnb Pilot"**.
Add each insight below via **Add insight**, then save it to the dashboard.

### Block 1 — Traffic
1. **"Visitors (daily)"** — Insight type *Trends*; event `$pageview`;
   graphed as **Unique users**; interval Day.
2. **"Landing screens"** — *Trends*; `$pageview`; breakdown by prop
   `path`; display as table, last 7 days. (Paths carry UUIDs — group
   mentally by prefix: `/`, `/listings/…`, `/become-host`.)
3. **"New vs returning"** — *Lifecycle* insight on `$pageview`.

### Block 2 — The booking funnel ⭐ (the one that matters)
4. **"Owner funnel"** — Insight type *Funnel*, steps in order:
   `listing_viewed` → `inquiry_opened` → `booking_requested` →
   `booking_accepted` → `booking_completed`.
   Conversion window: 14 days. Interval: weekly.
   - **PILOT GATE (named insight): "Gate: inquiry→request ≥25%"** —
     duplicate the funnel with just `inquiry_opened` →
     `booking_requested`; the step-2 conversion % is the gate.
   - **PILOT GATE (named insight): "Gate: request→accept ≥60%"** —
     funnel `booking_requested` → `booking_accepted`.
5. **"Decline/cancel pressure"** — *Trends*; events `booking_declined` +
   `booking_cancelled`, weekly. Breakdown `booking_cancelled` by
   `refundTier` to see how late people cancel.

### Block 3 — Guest → member
6. **"Signup funnel"** — *Funnel*: `$pageview` → `signup_started` →
   `signup_completed`; breakdown by `flow`. 7-day window.
7. **"Guest browse depth"** — *Trends*; `listing_viewed` filtered to
   **anonymous users** (add filter: person property "is identified" =
   false); unique users + total count.

### Block 4 — Supply side (hosts)
8. **"Host applications (weekly)"** — *Trends*;
   `host_application_submitted`; weekly count.
9. **"Host activation funnel"** — *Funnel*:
   `signup_started` (flow=host) → `signup_completed` (flow=host).

### Block 5 — Trust & engagement
10. **"Messages per week"** — *Trends*; `message_sent`; breakdown by
    `thread` (inquiry vs booking — pre- vs post-commitment talk).
11. **"Reviews per week"** — *Trends*; `review_submitted`; optional
    breakdown by `stars`.
12. **"Leakage pressure"** — *Trends*; `contact_nudge_shown` +
    `contact_nudge_sent_anyway`. If sent-anyway/shown trends high,
    escalate the anti-leakage stance (CLAUDE.md §11 decision).

### North star (pin at the top)
13. **"North star: weekly completed nights"** — until a `nights` prop is
    added to `booking_completed`, use *Trends* on `booking_completed`
    weekly count as the proxy and rename once the prop lands (logged as
    a follow-up). Pin this insight to the dashboard top.

## Pilot gates recap (named insights)
| Gate | Definition | Target |
|---|---|---|
| Gate: inquiry→request | funnel `inquiry_opened` → `booking_requested` | **≥ 25%** |
| Gate: request→accept | funnel `booking_requested` → `booking_accepted` | **≥ 60%** |
| North star | weekly completed nights (proxy: `booking_completed`/wk) | up + to the right |

## Known limits (honest)
- `booking_completed` has no `nights` prop yet → north star is a count
  proxy. Small follow-up to add the prop.
- `$pageview` paths contain UUIDs → per-listing rollups are easier in
  the `listing_viewed` event (it has `listingId`).
- Events fire on web only (the pilot platform); native is a later phase.
- Referrer/UTM data appears automatically on `$pageview` once real
  links circulate (WhatsApp/Instagram) — nothing extra to build.

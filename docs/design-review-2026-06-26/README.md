# Handoff: Petbnb — Persona theming completion + UX standardization

## Overview
This package specifies a set of fixes for the Petbnb Expo/React-Native app
(`nuzul-saudi/petbnb`). They fall into two buckets:

1. **Finish the persona theme rollout.** The theme engine (`theme/theme.tsx`)
   is sound but `useTheme()` is opt-in and almost nothing opts in, so **host
   mode renders half-themed**: the screen background flips to honey while host
   names, prices, ✓ marks, section pills, titles, and amenity checks stay
   hardcoded moss.
2. **Standardize the date/calendar layer and a few cross-cutting UX gaps**
   (one date picker, one `formatDate()`, route primary actions through the
   shared `Button`, a sticky booking summary bar, and a status-aware booking
   header).

## About the design files
The file in this bundle — `Petbnb Review.dc.html` — is a **design reference
created in HTML** (a before/after canvas), not production code to copy. It
exists to show, visually, the *target* states described below. The task is to
**implement these changes in the existing Expo/React-Native codebase** using
its established patterns (the `theme/tokens.ts` token module, the `useTheme()`
hook, the shared `components/Button.tsx`, `expo-router`, i18n via
`@/lib/i18n`), not to port any HTML.

## Fidelity
**High-fidelity for tokens, code-level for structure.** Exact colors, type, and
spacing are given below and already exist in `theme/tokens.ts` — match them
exactly. The deliverable is primarily a set of **code changes to real files**;
the HTML mock only illustrates the end visual.

---

## The fixes

### FIX 1 — Sweep hardcoded `moss` → theme accent (the core fix)

**Problem.** Components import `colors.moss` / `colors.mossDeep` directly for
accents instead of resolving through `useTheme()`. Only `Button` and the
`AppShell` background wrapper opt in today, so the host's honey background is
surrounded by moss-green foreground.

**Files & specifics:**

- **`src/components/ListingCard.tsx`** — host name, the verified-row price, and
  the price footer are `colors.moss` / `colors.mossDeep`. Resolve the **host
  name** and **price** through `useTheme().accent` (host → deep-gold). Render
  the host name in **Reem Kufi** (`fonts.headingBold`), not Tajawal — the type
  system lists host names under Reem Kufi.
  *Exception:* the verified **✓** stays `colors.moss` (= `--verified`). It is
  the brand trust mark, not a persona accent — keep it moss in both lenses.
  *Enforce this* with a dedicated `colors.verified` alias + a code comment so a
  future refactor doesn't accidentally re-theme the ✓.
  *Verify on web:* the Reem-Kufi host-name change (from Tajawal) should be
  eyeballed for font-loading + RTL spacing on the deployed site before commit.
- **`src/app/listings/[id]/index.tsx`** (listing detail) — `styles.title`,
  `styles.sectionHeading`, `styles.hostName`, `styles.amenityCheck`,
  `styles.verifiedMark` are hardcoded moss. The file comment already notes the
  background themes to honey. Thread `useTheme().accent` / `.accentInk` into
  the title, section headings, host name, and amenity ✓ marks. Keep the
  trust ✓ moss.
- **`src/app/index.tsx`** (`HostHome`) — the "Live" section pill is
  `colors.moss` (`styles.sectionHeaderPillLive`). On the honey host background
  this should be the host accent (gold). Make the live-pill color come from
  `useTheme().accent`. (Drafts pill stays gold — already on-palette.)
- **`src/app/bookings/[id].tsx`** — imports `colors` directly; the success
  circle / title / summary accents are moss. Route accents through
  `useTheme()` so a host viewing a booking sees gold, not moss-on-honey.

**Pattern to apply** (each file): call `const theme = useTheme();` and replace
`color: colors.moss` (used as an *accent*, not the trust ✓) with
`color: theme.accent`, and outlined/secondary accents with `theme.accentInk`.
Owner mode resolves `theme.accent === colors.moss`, so **owner screens render
byte-identical** — only host mode changes. Verify nothing regresses in owner
mode by diffing screenshots.

**Acceptance:** With `profile.role === 'host'`, HostHome, a host's own listing
detail, and a host's booking detail show **deep-gold** (`#8C7340`) accents and
**gold-ink** (`#5A4926`) on the honey background — no moss except the ✓.

---

### FIX 2 — Consolidate to ONE date-range picker

**Problem.** Three implementations exist and disagree:
- `src/components/RangeCalendar.tsx` — AR week starts **Saturday**, blocked
  days rose @ 0.35 **+ strikethrough**, a hint line, nav arrows don't flip.
- `src/components/AvailabilityCalendar.tsx` — AR week starts **Sunday**,
  blocked days rose @ 0.45 **no strikethrough**, a legend, nav arrows flip.
- `src/components/DateField.tsx` — native `<input type=date>` / text field,
  still used for pet vaccination dates; leaks raw ISO.

**Target (one component):** Keep `RangeCalendar` as the single source.
- AR week start = **Saturday** everywhere.
- Day numbers in **Latin** (locked decision — see FIX 3). `toArabicDigits()`
  is a deliberate no-op pass-through; leave it that way.
- Blocked days: one treatment — rose tint + strikethrough, label "غير متاح".
- Selected range: endpoints filled with `theme.accent`, interior band in
  `--whisper`.
- Add a `mode="single"` prop so vaccination dates use the same calendar
  (single date = range where start === end). Retire `DateField`.
- Nav arrows: pick one RTL behavior (recommend: do **not** mirror the glyphs;
  `‹` = previous month in reading order).

`AvailabilityCalendar.tsx` has **no callers** — delete it now (easy win).
`DateField.tsx` has **three call sites** (pet vaccination create/edit, pet
edit, host-availability from/to). Migrate those to `RangeCalendar`
(`mode="single"`) **first**, test single-date semantics + clearing, *then*
delete the file — do not pre-emptively delete it. Host availability uses TWO
`DateField`s (start/end): either two single-mode calendars or one range
calendar — engineer's call.

> Effort estimate from the engineer: ~6h. Lowest priority of the set — do it
> AFTER FIX 1/4 since theming is higher-impact and lower-risk.

**Also:** lift duplicated date math (`todayIso`, `addDays`, `daysInMonth`,
`monthAnchor`, `firstWeekday`) into a single `src/lib/date.ts`. `todayIso` is
currently defined in `@/lib/format` AND redefined inside
`AvailabilityCalendar` — collapse to one.

**Acceptance:** Only `RangeCalendar` remains. Booking and host-availability
calendars start the AR week on the same day, render the same blocked-day style,
and show Latin numerals.

---

### FIX 3 — One `formatDate()`, and resolve the digit rule

**Problem.** Dates are displayed three+ ways:
- Booking date card in `request.tsx` shows raw ISO `2026-07-01` (Latin).
- Booking summary in `bookings/[id].tsx` does `toArabicDigits(start_date)` →
  `٢٠٢٦-٠٧-٠١` (Arabic-Indic digits, still ISO format).
- `SearchHero` / listing detail show friendly `يول ٥` / `Jul 5`.
- The calendars render day numbers in Latin — which is **correct** per the
  locked decision below; the inconsistency is the *format* (raw ISO vs
  friendly), not the digit system.

**⚠ Digit decision — RESOLVED: Latin everywhere.** Test-round-3 (2026-05-27)
locked **Latin display digits** across the app; `toArabicDigits()` in
`src/lib/format.ts` is a deliberate no-op. The *design-system guide* (which said
Arabic-Indic for dates) is **stale** — ignore it on this point and update it.
Rationale: Arabic-Indic numerals scan poorly against the Latin digits Saudis
see in WhatsApp / Snap / banking apps. Do **not** re-flip.

**Target:**
- Add `formatDate(iso, locale, style?)` to `src/lib/date.ts` returning a
  localized, **Latin-digit** human string — e.g. `1 يوليو` / `Jul 1`. Route
  **every** displayed date through it. No raw ISO (`2026-07-01`) reaches the UI.
- Currency/prices were already Latin — unchanged.
- Lock the decision in `CLAUDE.md` §11 (pre-launch decisions) AND add a
  regression test in `tests/format.test.ts` asserting `toArabicDigits('123')`
  returns `'123'`, so this can't silently regress in six months.
- **Resolve the digit-system ambiguity with the founder**: ~~the design guide
  says Arabic-Indic for dates; the calendar code says "Latin per founder
  decision."~~ **RESOLVED — Latin** (see box above). The friendly-format sweep
  is the only date change; digits stay Latin.

**Acceptance:** Searching for a raw `2026-` ISO string in rendered UI returns
nothing. Date display is consistent across feed, listing detail, booking
request, and booking detail.

---

### FIX 4 — Route all primary actions through the shared `Button`

**Problem.** The shared `components/Button.tsx` (persona-themed, loading,
disabled, sizes) is bypassed by hand-rolled `Pressable`s exactly where it
matters:
- `src/app/listings/[id]/request.tsx` — booking submit CTA (`styles.cta`).
- `src/app/become-host/application.tsx` — submit CTA (`styles.cta`).
- `src/components/SearchHero.tsx` — search button (hardcoded `mossDeep`; also
  uses the off-roster 🔍 glyph — drop it or use an on-brand label).
- Empty-state "add a pet" buttons.

Consequence: these can't theme to host gold, re-implement disabled/loading by
hand. Replace each with `<Button variant="primary" fullWidth … />`.

**Acceptance:** No hand-rolled primary CTA remains; every primary action themes
with the persona and gets the built-in loading/disabled behavior.

---

### FIX 5 — Sticky summary bar on the booking request screen

**Problem.** `request.tsx` is one long scroll (dates → pets → per-pet services
→ booking services → breakdown → fees → total → 2 warnings → CTA) with the
**total + submit pinned to the bottom**, far from where decisions are made.

**Target:** A sticky bottom bar pinned to the viewport showing the **running
total** (live `formatSAR(breakdown.totalSAR)` + "N ليالٍ · M قطط") on the
leading edge and the **submit `Button`** filling the rest. Use
`position: absolute; bottom: 0` inside the SafeAreaView (or a sticky footer
outside the ScrollView). Add a top shadow `0 -6px 18px rgba(31,42,29,.10)` and
`--paper` fill with a `--whisper` top border.

When dates overlap a blocked range, point the validation error at the date
field rather than silently disabling the CTA — concretely: scroll-to-field on
tap with a red ring on the date card (today it disables the CTA *and* shows an
inline error). The unified calendar already blocks those days, so this path is
rare.

**Mobile keyboard:** wrap the sticky bar in `KeyboardAvoidingView` (or equivalent)
so the on-screen keyboard doesn't cover it when a field is focused.

**Acceptance:** Total + submit are visible while the user scrolls the form; the
bar uses the shared `Button`.

---

### FIX 6 — Status-aware booking header (tone fix)

**Problem.** `bookings/[id].tsx` renders a celebratory green ✓ circle +
`booking.confirm_title` for **every** status. A declined / cancelled /
disputed booking opens with a success checkmark.

**Target:** Branch the header glyph + title on `booking.status`:
- `requested` → neutral "بانتظار رد المضيف" (clock/awaiting, not ✓).
- `accepted` / `active` → ✓ accent.
- `completed` → ✓ accent.
- `declined` / `cancelled` → muted/neutral icon, terracotta-tinted title, no
  celebratory ✓.
- `disputed` → terracotta caution treatment.
Keep the existing `booking.status_*` subtitle. Use `theme.accent` for the
positive states (so host = gold).

**Acceptance:** A declined or cancelled booking no longer shows a success ✓.

---

## Cross-cutting: update the design system guide
The design-system guide still documents **four** personas (owner, host, `both`,
admin) with a header "destination toggle." Migration **0039 removed `both` and
the toggle** (`theme/theme.tsx`, `lib/persona.tsx`) — a user is now strictly
owner *or* host. Update the guide (and the design-system project) to the real
**3-persona, no-toggle** model so future work doesn't rebuild the dead feature.
Leftover ghosts to clean up: `OwnerFeedHome` is still labelled "Owner / both
home"; rename `src/lib/persona.tsx` → `src/lib/host-notifications.tsx` (its
exports are already `useHostNotifications` / `HostNotificationsProvider` — the
filename is the last vestige of pre-0039 architecture).

**The guide is stale on more than personas.** It also contradicts two locked
founder decisions — it says *feminine* register (the app shipped **masculine**
on 2026-06-14) and *Arabic-Indic* date digits (locked **Latin**, 2026-05-27).
The codebase is authoritative; update the guide to match, and treat its
content rules with suspicion until it's reconciled.

---

## Patterns to PRESERVE (do not regress these)
- The guest `?action=inquire` auto-fire round-trip in `listings/[id]/index.tsx`
  (intent survives the auth funnel).
- The contact-info leakage nudge (`containsContactInfo`) before sending a
  message in `bookings/[id].tsx`.
- Unsaved-work guards (`beforeunload` + `confirmLeave`) on the booking detail
  forms.
- Honest "جديد" badge instead of fabricated ratings; calm, non-urgent statuses;
  **masculine** register throughout (locked 2026-06-14 — the codebase was swept
  masculine: سجّل not سجّلي, يمكنك not يمكنكِ; do **not** regress to feminine).
- Approximate-location privacy on listing detail (district + city only, no pin).

---

## Design tokens (from `theme/tokens.ts` / `_ds/tokens/*.css`)

**Colors**
- Surfaces: `--paper #FFFCF5`, `--cream #FAF6EE` (owner bg), `--sand #F5EFE6`,
  `--whisper #E8DFCC` (hairlines/inert), `--honey #D4BC78` (host bg).
- Ink: `--ink #1F2A1D`, `--ink-soft #3D4A3A`.
- Moss (owner accent): `--moss #2D4A2F`, `--moss-deep #1A3018`,
  `--moss-light #4A6B4A`.
- Gold (host accent): `--gold #C4A464`, `--gold-deep #8C7340` (host accent),
  `--gold-ink #5A4926` (host text/outline — AA on honey).
- Expressive: `--terracotta #B45842` (destructive/decline/dispute),
  `--rose #D49389` (soft tint / blocked-day fill).
- Trust mark: `--verified` = `--moss` (stays moss in both personas).

**Persona resolution** (`theme/theme.tsx` / `_ds/tokens/themes.css`)
- owner: `accent = moss`, `accentInk = moss`, `background = cream`.
- host: `accent = gold-deep`, `accentMuted = gold`, `accentInk = gold-ink`,
  `background = honey`.

**Type** — Headings: **Reem Kufi** (500 / 700) — screen titles, host names,
greetings. Body: **Tajawal** (400 / 500 / 700). Scale: display 28 / title 24 /
heading 18 / subhead 16 / body 14–15 / caption 12 / micro 10 (letter-spaced
0.5px). Paragraph line-height 1.6.

**Spacing** (4px base): xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 32.
**Radii:** sm 8 / md 12 / lg 16 (buttons, inputs) / xl 22 (cards, sheets) /
pill 999. **Shadows:** raise `0 2px 8px rgba(31,42,29,.05)`, card
`0 4px 12px rgba(31,42,29,.08)`, lift `0 10px 28px rgba(31,42,29,.12)`.
**Tap targets:** ≥44px primary, ≥32px inline pills (filter chips are ~24px
today — bump them).

**Mechanics:** currency always `ر.س` (digits then mark); **Latin** display
digits (locked decision; `toArabicDigits` is a no-op); Riyadh time (UTC+3, 24h);
phone `+966 5X XXX XXXX`.

---

## Suggested implementation order
(refined with the implementing engineer — grouped by blocking dependency)
1. **FIX 1** (theme sweep, ~3h) — highest impact, mechanical, owner-mode byte-identical.
2. **FIX 4** (Button rollout, ~1h) — pairs with FIX 1 to theme the CTAs.
3. **FIX 6** (status-aware header, ~1.5h) — no dependencies.
4. **FIX 3** (`formatDate` / `lib/date.ts`, ~2h) — digit decision already
   resolved (Latin), so unblocked.
5. **FIX 5** (sticky bar, ~3h) — uses the themed `Button` from FIX 1/4.
6. **FIX 2** (calendar consolidation, ~6h) — biggest refactor, lowest priority.
7. Guide update + ghost-name rename, after the rest is stable.

## Files in this bundle
- `Petbnb Review.dc.html` — the before/after visual reference (open in a
  browser). Frames: Host Home, Listing detail (host view), Unified date picker,
  Booking sticky bar.
- `README.md` — this document (self-sufficient).

# Petbnb — Design System

> **Working name.** "Petbnb" is the codebase/working name. The public brand
> (and an Arabic brand name) is pending a Saudi trademark check. Use "Petbnb"
> in code, folders, and config until the founder finalizes it. There is **no
> finalized logo yet** — the wordmark in this system is a typographic
> placeholder built from the brand font (Reem Kufi). Replace it when the brand
> lands.

A two-sided **mobile marketplace for Saudi Arabia** connecting cat owners with
verified hosts who board pets in their own homes — Airbnb-style, for cats.
**Arabic-first, RTL, mobile-first.** The MVP ships the **hosting wedge only**;
the long-term vision is a multi-service pet super-app (vet, grooming,
transport, store, insurance, records, consultation — all shown as *قريباً*
"soon" tiles on a future hub home).

The whole product is built on a single idea: **female-trust**. Every early
host is *personally vetted by the founder*. Every visual and verbal choice —
the soft palette, the hand-picked photos, the verification ✓, warmth chosen
over efficiency — exists to convey *"you can trust leaving your cat (and your
home) with this person."* No aggressive CTAs, no hard sells, no gamification,
nothing that reads as transactional.

---

## ⚠️ Locked decisions (the codebase is authoritative)

These founder decisions are LOCKED and supersede anything else in this guide
or its bundled components. The decision trail lives in the repo —
`docs/batch-decisions.md` and `CLAUDE.md` §7 — and several are pinned by CI
regression tests. Design work that contradicts them will be rejected in
review:

| Decision | Locked | Enforcement |
|---|---|---|
| **LATIN display digits** in both locales (`toArabicDigits()` is a no-op) | 2026-05-27 (test-round-3) | `tests/format.test.ts` pins it in CI |
| **MASCULINE register** in all copy (the female-trust wedge lives in the product, not the grammar) | 2026-06-14 | Copy review; `ONBOARDING.md` |
| **Separate owner/host accounts — NO `'both'` role, NO header persona toggle** | migration 0039 (2026-06-16) | DB CHECK constraint |
| **Trust mark ✓ pinned to moss (`colors.verified`) in BOTH personas** — never the persona accent | 2026-06-26 (commit `7f67c79`) | token alias in `theme/tokens.ts` |
| **No fabricated stats** — new hosts show "جديد", never fake ratings/counts | build spec §7 | product convention |

Flipping any of these requires a founder re-decision recorded in
`docs/batch-decisions.md`, plus (where pinned) rewriting the enforcing test
in the same PR.

---

## Sources this system was built from

You may or may not have access to these; they are recorded so you can go deeper.

| Source | What it gave us |
|---|---|
| **GitHub — `nuzul-saudi/petbnb`** (private) | The live Expo/React-Native + Supabase app. Primary source of truth. https://github.com/nuzul-saudi/petbnb |
| → `CLAUDE.md` | The build spec / brand bible: scope, roles, cultural rules, the exact design tokens (§8), the female-trust wedge. |
| → `src/locales/ar.json`, `en.json` | **Every user-facing string.** The source of truth for tone, register, and copy. Imported into this project at `src/locales/`. |
| → `theme/tokens.ts`, `theme/theme.tsx`, `theme/rtl.ts` | The token values + the persona-resolved theme hook (owner=moss, host=honey/gold) + RTL helpers. |
| → `src/components/*` | The real RN primitives — Button, ListingCard, AppHeader, PetAvatar, BreedPicker, RoleEditor, PhotoGallery. Recreated here as web components. |
| → `src/app/*` | The real screens (owner feed, listing detail, booking request, host flow). Recreated here as the UI kit. |
| → `src/assets/breeds/*` | Real curated cat photos (Wikimedia). Reused here as imagery + avatars. |
| **Sibling repo** | `nuzul-saudi/nuzul` (not consumed for this system). |

> The compiler bundles this design system for consuming projects. If you have
> access to `nuzul-saudi/petbnb`, reading the screens in `src/app/` and the
> strings in `src/locales/ar.json` will let you build far more faithful Petbnb
> designs than working from this README alone.

---

## The three personas (and why theming matters)

`profiles.role` has three values (the `'both'` role + the header persona
toggle were REMOVED by migration 0039 — owner and host are separate accounts,
same email cannot create both; a user IS what they signed up as), and the app
**re-skins per persona**:

- **owner** — has a cat needing care. Browses hosts, requests bookings.
  *Owner lens: cream background, **moss** accent.*
- **host** — boards cats. Creates listings (pending admin approval), accepts
  requests, posts daily updates. *Host lens: honey background, **deep-gold** accent.*
- **admin** — the founder's vetting account. Approves hosts + listings,
  suspends abusers. Uses the owner (moss) lens.

The accent **always** resolves through the theme scope — `data-persona="owner"`
(default) or `data-persona="host"` on a wrapper. New components read
`var(--accent)` / `var(--accent-ink)` / `var(--surface-screen)` and **never**
hardcode moss or gold. See `tokens/themes.css`.

---

<!-- CONTENT-FUNDAMENTALS -->
## Content fundamentals — how Petbnb writes

The copy is the wedge made audible. It is **Arabic-first, Saudi-colloquial, and
addressed to women.** Read `src/locales/ar.json` for the canonical voice.

### Language & register
- **Arabic is primary; English is a fallback.** Every string ships in `ar`
  first; `en` exists but Arabic is the design target. Layouts are tested in RTL.
- **Saudi colloquial, not stiff MSA.** Warm and direct. "اطلب الحجز" (request
  the booking), "أبحث عن مكان لقطتي" (I'm looking for a place for my cat) — plain,
  human, not bureaucratic.
- **MASCULINE register throughout (locked 2026-06-14).** The app addresses the
  user in the masculine: "هل أنت متأكد من إلغاء هذا الطلب؟", "حاول مرة أخرى",
  "اكتب ملاحظة". The female-trust WEDGE lives in the product (founder-vetted
  hosts, the female-hosts-only filter, the verified ✓) — not in grammatical
  gender. Never regress copy to feminine endings; flipping this needs a
  founder re-decision.
- **First person for the user's own things.** Sections are named from the
  user's mouth: "قططي" (my cats), "حجوزاتي" (my bookings), "حسابي" (my account).

### Tone
- **Reassuring over urgent.** Statuses are calm: "بانتظار الرد" (awaiting
  reply), "بانتظار رد المضيف" (awaiting the host's reply). No countdowns, no
  "Book now before it's gone!"
- **Trust-forward.** "مضيف موثوق" (a trusted host), "اعتماد كمضيف" (approve as
  host), the verified ✓. The word *موثوق/موثّق* (trusted/verified) recurs.
- **Honest, never fabricated.** New hosts show "جديد" (new) — never invented
  ratings or fake booking counts. The build spec explicitly forbids fake stats.
- **Plain-language errors.** Never a raw error code. "تعذّر تحميل الإعلانات"
  (couldn't load the listings), "تعذّر إرسال الرمز. يرجى المحاولة مرة أخرى."

### Mechanics
- **Currency is always `ر.س`.** Never `$`. Format: `450 ر.س` (digits then mark).
- **LATIN digits in display (locked 2026-05-27, test-round-3).** Prices,
  counts, ages, dates, distances render with Latin digits (`0123456789`) in
  BOTH locales — Arabic-Indic digits scan poorly against the Latin digits
  Saudis see in WhatsApp / Snap / banking apps. `toArabicDigits()` in
  `src/lib/format.ts` is a deliberate NO-OP pass-through, pinned by a CI
  regression test (`tests/format.test.ts`); flipping it needs a founder
  re-decision + that test rewritten in the same PR.
- **Phone format `+966 5X XXX XXXX`.** Saudi mobile, always `+966`, body starts
  with `5`. See `src/lib/phone.ts`.
- **Riyadh-anchored time** (UTC+3, 24-hour) for stamps, regardless of device tz.

### Emoji & symbols
- **Used, but quietly and functionally — never decoratively.** The app uses a
  *handful* of glyphs as lightweight icons (the system has no icon font):
  📍 location, 🐈 cat / pet capacity, 🏠 home/host, 📥 pending requests,
  ✓ verified/selected. That is the whole working set. (⚭ died with the
  'both' role in 0039.)
- **No emoji in headings, prices, or marketing copy.** No 🎉🚀😻-style
  decoration. If a glyph isn't carrying meaning, it doesn't appear.

### Voice in one line
> Warm, Saudi-colloquial, trust-first (masculine register, locked). Speak like
> a careful friend who has personally met the host — never like a marketplace
> optimizing conversions.

---

<!-- VISUAL-FOUNDATIONS -->
## Visual foundations

The aesthetic target: **well-designed Saudi hospitality, not Western SaaS.**
Warm, premium, calm. Deep moss green, sand/cream, gold. Generous space, soft
shadows, rounded corners. Not bright, not cartoonish, not "tech startup."

### Color
- **Surfaces are warm sand/cream**, never white. `--paper #FFFCF5` for cards,
  `--cream #FAF6EE` for the owner screen, `--sand #F5EFE6` for sunken sections,
  `--whisper #E8DFCC` for hairlines + inert chips.
- **Primary is deep moss green** (`--moss #2D4A2F`, headings `--moss-deep
  #1A3018`). This is the owner accent and the verified ✓ color.
- **Gold is the metallic accent** (`--gold #C4A464`, `--gold-deep #8C7340`) and
  the host persona's accent. Used for the "new" pill, gold tier, host mode.
- **Persona re-skin:** owner = cream + moss; host = **honey `#D4BC78`** bg +
  deep-gold accent (deepened to `--gold-ink #5A4926` for text/borders to hold
  WCAG AA on honey). The shift is intentionally obvious at a glance.
- **Expressive colors are rare:** `--terracotta #B45842` for destructive/decline
  only; `--rose #D49389` as a soft warm tint. Text is warm near-black green
  (`--ink #1F2A1D`), never pure black.

### Type
- **Headings: Reem Kufi** (geometric Kufi Arabic), default weight **500**, bold
  700. Screen titles, host names, greetings. Calm, architectural.
- **Body: Tajawal** (humanist Arabic sans), 400 / 500 / 700. All copy, labels,
  buttons, inputs.
- Display 28 → title 24 → heading 18 → subhead 16 → body 14–15 → caption 12 →
  micro 10 (badges, letter-spaced 0.5px). Paragraph line-height 1.6.
- Mobile minimum effective body is ~12px (captions); never smaller.

### Shape, depth & borders
- **Rounded corners 16–22px on cards** (`--radius-xl 22px` cards/sheets,
  `--radius-lg 16px` buttons/inputs), `--radius-pill` for chips/badges.
- **Soft, layered, sparing shadows** in a warm-ink hue:
  `--shadow-card 0 4px 12px rgba(31,42,29,.08)` is the default card raise;
  `--shadow-lift` for sheets/modals. Never harsh, never neon.
- **Hairline borders** in `--whisper`. Selected state thickens to a **2px moss
  border + whisper fill** (see RoleEditor / BreedPicker tiles).
- **Cards = paper fill + 22px radius + soft card shadow.** `overflow: hidden`
  so cover photos clip to the rounding. This is the single most recurring object.

### Imagery
- **Real, warm photographs** — hand-picked cat + home photos, the trust
  evidence. Curated breed photos ship in `assets/breeds/`. Warm, natural,
  domestic. Never cold stock, never illustration for people/pets.
- **Photo galleries** are full-bleed horizontal pagers with cream dots; the
  listing card shows the home photo as a 5:2 secondary strip *below* the
  sitter-first header (the **person** is the hero, the home is evidence).
- Avatars: circular, `--whisper` well, fall back to a Reem Kufi initial, then a
  🐈 on a tinted square (3-level fallback — see PetAvatar).

### Motion
- **Quiet and short.** Image fade-ins ~120–150ms (`expo-image` transitions).
  No bounces, no parallax, no infinite loops, no attention-grabbing motion.
  Respect `prefers-reduced-motion`. Trust reads as calm.

### Interaction states
- **Press:** opacity dip (native Pressable). Disabled = **50% opacity**, ignores
  input. (Buttons don't shrink or change hue on press — they soften.)
- **Selected:** 2px `--accent` border + `--whisper` fill + a ✓ mark.
- **Active nav / filter chip:** fills with `--accent`, label flips to `--cream`
  and bold.
- **Loading:** inline spinner before a label whose text swaps ("حفظ" → "جارٍ
  الحفظ…"). Never a blank screen — every screen has loading + empty states.

### Layout
- **Mobile-first, single column,** generous padding (screen padding `--space-xl
  24px`, card padding `--space-lg 16px`). `gap`-based stacks, not margins.
- **RTL by default.** Use logical properties / `start`/`end`, never hardcoded
  left/right. Badges pin to the trailing edge so they flip correctly.
- **Top app bar** (56px) tints with the persona; sticky header, scrolling body.
- Tap targets ≥ 44px for primary controls, ≥ 32px for inline pill actions.

---

<!-- ICONOGRAPHY -->
## Iconography

**Petbnb has no icon font and no SVG icon set.** This is a deliberate, minimal
approach: the app communicates with **type, color, photos, and a tiny working
set of emoji glyphs used functionally.** Document and reuse — do not invent a
new icon language.

### The working glyph set (this is the whole list)
| Glyph | Meaning | Where |
|---|---|---|
| ✓ | verified / trusted / selected | host name, amenities, selected tiles, active filter |
| 📍 | location / neighborhood | listing card + detail meta line |
| 🐈 | cat / pet capacity / pet fallback | capacity badge, PetAvatar level-3 fallback, "owner" role |
| 🏠 | home / host / listing | listing photo placeholder, "host" role |
| 📥 | pending requests | host-mode header attention badge |
| → ← | back / forward (directional) | back links ("← رجوع"), flips under RTL |

- **Rule:** a glyph appears only when it carries meaning. No decorative emoji,
  none in headings/prices/marketing.
- **If you genuinely need an icon not in this set** (e.g. building toward the
  future services hub), substitute a **CDN line-icon set with a soft, rounded,
  ~1.75px stroke** (Lucide is the closest match to the warmth + roundness) and
  **flag the substitution to the founder** — it is not yet part of the brand.
  Tint icons with `--ink-soft` (inactive) or `--accent` (active), never neon.
- **Logo:** none finalized. Use the Reem Kufi wordmark specimen as a placeholder
  and flag that real brand assets are pending.

---

## Index / manifest

The only fixed location is **`styles.css`** (root) — consumers link this one
file; it `@import`s everything below.

### Tokens (`tokens/`)
- `colors.css` — base palette + semantic aliases + tier colours.
- `typography.css` — `@font-face` for Tajawal + Reem Kufi (self-hosted woff2) +
  family / weight / scale / leading tokens.
- `themes.css` — the `[data-persona="owner"]` / `[data-persona="host"]` scopes.
- `spacing.css` — spacing scale, radii, shadows, tap targets.

### Assets (`assets/`)
- `fonts/` — Tajawal (400/500/700) + Reem Kufi (500/700), arabic + latin woff2.
- `breeds/` — real curated cat photos (host avatars + home imagery).

### Foundation cards (`guidelines/cards/`)
Specimen cards for the Design System tab — Colors (surfaces, moss, gold, ink,
persona, badges), Type (Reem Kufi, Tajawal, scale, numerals), Spacing (scale,
radii, elevation), Brand (wordmark, glyphs, imagery). Shared chrome in `card.css`.

### Components (`components/`)
React primitives — each is `<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md`,
one `@dsCard` HTML per group. Read via `window.PetbnbDesignSystem_4fc49b`.
- `core/` — **Button**, **Badge**, **Avatar**, **Card**
- `forms/` — **Input**, **FilterChip**
- `navigation/` — **AppHeader**
- `listings/` — **ListingCard**, **RoleCard**

### UI kit (`ui_kits/petbnb_app/`)
Interactive click-through recreation of the mobile app (onboarding → owner feed
→ listing → booking → confirmation) with a persona-lens toggle. See its own
`README.md`.

### Reference (`src/`)
Imported from the repo for reference: `locales/ar.json` + `en.json` (the copy
source of truth), `assets/breeds/` (originals, moved to `assets/`).

---

### Font substitution note
None — **Tajawal and Reem Kufi are the genuine brand fonts** (CLAUDE.md §7),
self-hosted here from their open-source Google Fonts woff2 builds (arabic +
latin subsets). No substitution was needed. If you need additional weights,
add the matching `@font-face` to `tokens/typography.css`.

### What's missing / needs the founder
- **No finalized logo or brand name.** The wordmark is a Reem Kufi placeholder.
  Replace `guidelines/cards/brand-wordmark.html` + add real assets when the
  Saudi trademark + Arabic name land.
- **No icon set.** The brand uses a tiny functional emoji vocabulary (see
  Iconography). If the future services hub needs real icons, substitute a soft
  rounded line set (Lucide is closest) and flag it.

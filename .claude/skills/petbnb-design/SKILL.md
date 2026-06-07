---
name: petbnb-design
description: Use this skill to generate well-branded interfaces and assets for Petbnb (a warm, premium, trust-first Saudi cat-boarding marketplace — Arabic-first, RTL), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill first — it is the full design guide
(content fundamentals, visual foundations, iconography, persona theming, and a
file manifest). Then explore the other files as needed.

## What's here
- `styles.css` — the single entry point. Link it and you get every token +
  webfont (Tajawal body, Reem Kufi headings). Everything else `@import`s from it.
- `tokens/` — colors, typography (+ `@font-face`), persona themes, spacing.
- `assets/fonts/` — self-hosted woff2; `assets/breeds/` — real cat photos.
- `components/` — React primitives (Button, Badge, Avatar, Card, Input,
  FilterChip, AppHeader, ListingCard, RoleCard), each with a `.d.ts` + `.prompt.md`.
- `ui_kits/petbnb_app/` — an interactive app recreation to copy patterns from.
- `guidelines/cards/` — foundation specimen cards.

## Non-negotiables (read `readme.md` for detail)
- **Arabic-first, RTL.** Test every layout in RTL. Saudi colloquial, not stiff MSA.
- **Feminine address** (`-ي` verb endings) — the wedge is women hosts + owners.
- **Currency always `ر.س`**, never `$`. Arabic-Indic digits (`٠١٢٣…`) in display.
- **Female-trust tone:** warm, reassuring, never transactional. No hard CTAs,
  no gamification, no fabricated stats (new hosts show "جديد", not fake ratings).
- **Persona theming:** wrap UI in `data-persona="owner"` (cream/moss) or
  `"host"` (honey/gold). Accent reads `var(--accent)` — never hardcode the colour.
- **Warm sand/cream surfaces, deep moss, gold accents.** Rounded 16–22px cards,
  soft shadows, generous space. No icon set — a tiny functional emoji vocabulary.

## How to work
If creating visual artifacts (slides, mocks, throwaway prototypes), copy the
assets you need out and produce self-contained static HTML the user can view
(see `ui_kits/petbnb_app/` for the pattern). If working in the production Expo
codebase, read the rules here and the original `theme/` + `components/` to design
faithfully with the brand.

If the user invokes this skill without other guidance, ask what they want to
build or design, ask a few focused questions (audience, surface, persona, RTL,
scope), then act as an expert Petbnb designer who outputs HTML artifacts *or*
production code depending on the need.

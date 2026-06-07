# INTEGRATION — keeping the skill aligned with the live Expo theme

This skill is a **design-reference + prototyping** layer (web HTML/CSS/React for
mockups). The **production source of truth** is the Expo app at
`src/theme/tokens.ts` + `src/theme/theme.tsx`. Whenever a token value changes in
one place, it must change in the other.

This document is the bridge — every web token in `tokens/colors.css` mapped
back to its `tokens.ts` export, plus the rules for keeping spacing, radii,
typography, and persona theming in sync.

> **Authoritative direction:** `tokens.ts` → `tokens/*.css`. If they drift,
> trust `tokens.ts` (it's what the app actually renders) and back-port to the
> skill's CSS. Never the other way around.

---

## 1. Color tokens — 1:1 mapping

| `tokens.ts` export | `tokens/colors.css` var | Hex |
|---|---|---|
| `colors.paper` | `--paper` | `#FFFCF5` |
| `colors.cream` | `--cream` | `#FAF6EE` |
| `colors.sand` | `--sand` | `#F5EFE6` |
| `colors.whisper` | `--whisper` | `#E8DFCC` |
| `colors.honey` | `--honey` | `#D4BC78` |
| `colors.ink` | `--ink` | `#1F2A1D` |
| `colors.inkSoft` | `--ink-soft` | `#3D4A3A` |
| `colors.moss` | `--moss` | `#2D4A2F` |
| `colors.mossDeep` | `--moss-deep` | `#1A3018` |
| `colors.mossLight` | `--moss-light` | `#4A6B4A` |
| `colors.gold` | `--gold` | `#C4A464` |
| `colors.goldDeep` | `--gold-deep` | `#8C7340` |
| `colors.goldInk` | `--gold-ink` | `#5A4926` |
| `colors.terracotta` | `--terracotta` | `#B45842` |
| `colors.rose` | `--rose` | `#D49389` |

**As of the install date these are aligned 1:1, verified value-by-value.** The
CSS also defines semantic aliases (`--text-strong`, `--surface-card`,
`--accent`, etc.) that don't exist as named exports in `tokens.ts` — those are
ergonomic indirection for the web layer only and resolve to the same base
hexes. Do not introduce semantic aliases into `tokens.ts` unless the Expo app
needs them; the design system stays leaner if RN code keeps referencing the
base names directly.

### Drift watch

If `tokens.ts` gains a new color (e.g. for a new persona, a new status), add it
to `tokens/colors.css` under the same name (kebab-case for CSS) and update
this table. Conversely, if Claude Design ever proposes a new color in the web
CSS, port it to `tokens.ts` before using it in any production component.

---

## 2. Persona theming — 1:1

| `theme.tsx` resolution | `tokens/themes.css` selector | Values |
|---|---|---|
| owner persona → `{ accent: moss, accentInk: moss, background: cream }` | `[data-persona="owner"]` | `--accent: var(--moss); --accent-ink: var(--moss); --surface-screen: var(--cream)` |
| host persona → `{ accent: goldDeep, accentInk: goldInk, background: honey }` | `[data-persona="host"]` | `--accent: var(--gold-deep); --accent-ink: var(--gold-ink); --surface-screen: var(--honey)` |

Web mockups must wrap with `<html data-persona="host">` (or `"owner"`) to opt
into the right scope. The RN equivalent is the `AppShell` wrapper + the
`useTheme()` hook — there's no manual data attribute on the native side.

---

## 3. Spacing — `tokens.ts` vs `tokens/spacing.css`

`tokens.ts`:

```ts
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const;
```

Web `tokens/spacing.css` mirrors with `--space-xs`/`--space-sm`/… same scale.
If the skill exposes intermediate values (e.g. `--space-2xl`) that don't exist
in `tokens.ts`, treat them as web-only — *don't* invent them in RN without
adding the export.

---

## 4. Radii

`tokens.ts`:

```ts
export const radii = {
  sm: 8, md: 12, lg: 16, xl: 22, pill: 999,
} as const;
```

Web mirrors via `--radius-sm/md/lg/xl/pill`. Note `radii.xl = 22` (not 20 or
24) — that's deliberate, matches the "rounded 16–22px cards" rule in
CLAUDE.md §8.

---

## 5. Typography & fonts

The skill's `assets/fonts/*.woff2` are **web builds** of Tajawal + Reem Kufi.
The Expo app does **not** consume them — it loads the same families via
`expo-font` from `@expo-google-fonts/tajawal` and `@expo-google-fonts/reem-kufi`
at app startup. Keep both in sync on family + weight (400 / 500 / 700).

`fonts` map in `tokens.ts`:

```ts
export const fonts = {
  body:       'Tajawal_400Regular',
  bodyBold:   'Tajawal_700Bold',
  heading:    'ReemKufi_500Medium',
  headingBold:'ReemKufi_700Bold',
};
```

Web `tokens/typography.css` references the same weights via `@font-face` with
the woff2 files. If the type scale (font sizes, line heights) changes in one
place, mirror in the other.

---

## 6. Shadows

`tokens.ts` exports a single `shadows.card` recipe. The RN shape uses
`shadowColor / shadowOpacity / shadowRadius / shadowOffset / elevation`; the
web equivalent in the skill is a `box-shadow` rule. They aim for the same
visual weight but are not byte-aligned — the rendering systems differ.

Treat the RN value as authoritative and tweak the CSS `box-shadow` to match
visually if you ever notice them diverging.

---

## 7. Components — web React is NOT production code

`components/*.jsx` in this skill are **web React** for mockups, slides, and
exploration. They are not React Native. Do **not** import them into the Expo
app. Use them as:

- a visual spec when designing a new RN component,
- a prompt source (`.prompt.md` files) for asking Claude to extend or vary a
  component while staying on-brand,
- a copy-paste target for HTML artifacts.

When promoting a design from the skill to production, the RN component lives
under `src/components/` (e.g. `Button.tsx`, `AppHeader.tsx`). Match the visual
treatment, but write it with React Native primitives + the `tokens.ts` values.

---

## 8. Locales — frozen snapshot

The skill ships a copy of `src/locales/ar.json` + `en.json` taken at install
time. These are the **brand voice reference** — the actual tone, register, and
phrasing the app uses today. They drift over time as the app grows.

Don't keep them in sync mechanically. Periodically (e.g. each major step
release) you may want to re-snapshot them so the skill's voice reference stays
current. Or leave them frozen as a historical anchor — either is defensible.

---

## 9. Adherence linter

`_adherence.oxlintrc.json` is an oxlint config the skill bundle ships. It
flags raw hex colors and other ungated values inside `.jsx` files. **It does
not run against the Expo app's `.tsx` files** — different file globs. Use it
locally on the skill's web components if you ever extend them; it's not a
production linter.

---

## 10. When to re-audit

Re-run the token alignment (Section 1) after any of:

- A theme-related commit to `src/theme/tokens.ts` or `src/theme/theme.tsx`.
- A Claude-Design-generated revision of the skill (drop a new zip in,
  re-extract, diff `tokens/colors.css` against this document's table).
- Any time a designer/developer reports "the mockup doesn't match the app."

A 30-second audit is `git diff` between the new skill's `tokens/colors.css`
and the previous one, paired with the `tokens.ts` export.

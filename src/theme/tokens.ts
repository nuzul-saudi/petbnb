// Design tokens — single source of truth for colors, spacing, radii, and shadows.
// See CLAUDE.md Section 8. Do not hardcode colors anywhere else.

export const colors = {
  sand: '#F5EFE6',
  cream: '#FAF6EE',
  paper: '#FFFCF5',
  // Host-mode screen background. Iterated twice on test feedback:
  // #EFE0B5 → #DDC988 → #D4BC78 (this value). Each step deepened to
  // make the persona shift more obvious; the prior values still read
  // as "tinted cream" rather than a distinctly different surface.
  // Applied via theme.background to AppShell's wrapper AND AppHeader's
  // bar, so both the body and the header tint together per persona.
  honey: '#D4BC78',

  ink: '#1F2A1D',
  inkSoft: '#3D4A3A',

  moss: '#2D4A2F',
  mossDeep: '#1A3018',
  mossLight: '#4A6B4A',

  gold: '#C4A464',
  goldDeep: '#8C7340',
  // Deepened gold used only by host-mode secondary buttons. The
  // new darker honey #DDC988 pushed the previous #6E5A30 down to
  // ~4.0:1 (sub-AA); this further-deepened tone restores ~5.2:1 on
  // the new bg. Owner mode keeps moss everywhere and never touches
  // this token.
  goldInk: '#5A4926',

  terracotta: '#B45842',
  rose: '#D49389',
  whisper: '#E8DFCC',

  // 2026-06-26 — explicit trust-mark alias. Pinned to moss in BOTH
  // personas; the verified ✓ is the brand trust signal and must NOT
  // re-theme with the persona accent. Use this where you'd otherwise
  // write `colors.moss` for a ✓ — e.g. ListingCard's verified mark,
  // listing-detail amenity checks. Decoupling the alias from the
  // raw moss color means FIX 1's host-theme sweep (replace
  // colors.moss with theme.accent in components) can't accidentally
  // re-tint the ✓ if someone forgets the exception.
  verified: '#2D4A2F', // same as moss
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fonts = {
  body: 'Tajawal_400Regular',
  bodyBold: 'Tajawal_700Bold',
  heading: 'ReemKufi_500Medium',
  headingBold: 'ReemKufi_700Bold',
} as const;

export const shadows = {
  // Soft, premium feel — used sparingly.
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

export type Colors = typeof colors;

// Design tokens — single source of truth for colors, spacing, radii, and shadows.
// See CLAUDE.md Section 8. Do not hardcode colors anywhere else.

export const colors = {
  sand: '#F5EFE6',
  cream: '#FAF6EE',
  paper: '#FFFCF5',

  ink: '#1F2A1D',
  inkSoft: '#3D4A3A',

  moss: '#2D4A2F',
  mossDeep: '#1A3018',
  mossLight: '#4A6B4A',

  gold: '#C4A464',
  goldDeep: '#8C7340',

  terracotta: '#B45842',
  rose: '#D49389',
  whisper: '#E8DFCC',
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

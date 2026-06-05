// Persona-resolved theme accent.
//
// Owner mode (default + pure 'owner' + admin + signed-out + missing
// profile) uses moss; host mode (pure 'host' role, OR 'both' role in
// host persona) uses goldDeep. The role guard is LOAD-BEARING — without
// it, every signed-in user would render in host theme because
// PersonaProvider's default in-memory persona is 'host'. Don't
// regress this check.
//
// Components opt in by calling useTheme(); files that keep importing
// colors.moss directly continue to render unchanged. Owner-mode resolution
// returns the literal colors.moss / colors.mossLight values, so any
// surface that switches to theme.accent renders byte-identically when
// the viewer is an owner.

import { useAuth } from '@/lib/auth';
import { usePersona } from '@/lib/persona';
import { colors } from '@/theme/tokens';

export type Theme = {
  accent: string;
  accentMuted: string;
  /**
   * Screen background. Owner mode keeps the existing cream; host mode
   * uses a warmer honey tint so the persona shift is unmistakable at
   * a glance (founder test-feedback — accent shift alone was too
   * subtle). Applied via the AppShell wrapper in _layout.tsx so
   * screens whose own SafeAreaView has no backgroundColor inherit it.
   */
  background: string;
  /**
   * Deepened accent for the SECONDARY Button variant. Owner mode
   * resolves to the same value as `accent` (moss), so owner secondary
   * buttons render byte-identically. Host mode resolves to goldInk
   * because goldDeep on honey is ~3.5:1 (below WCAG AA for normal
   * text); goldInk on honey is ~5:1.
   */
  accentInk: string;
};

export const OWNER_THEME: Theme = {
  accent: colors.moss,
  accentMuted: colors.mossLight,
  background: colors.cream,
  accentInk: colors.moss,
};

export const HOST_THEME: Theme = {
  accent: colors.goldDeep,
  accentMuted: colors.gold,
  background: colors.honey,
  accentInk: colors.goldInk,
};

export function useTheme(): Theme {
  const { profile } = useAuth();
  const { persona } = usePersona();

  if (profile?.role === 'host') return HOST_THEME;
  if (profile?.role === 'both' && persona === 'host') return HOST_THEME;
  return OWNER_THEME;
}

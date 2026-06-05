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
};

export const OWNER_THEME: Theme = {
  accent: colors.moss,
  accentMuted: colors.mossLight,
};

export const HOST_THEME: Theme = {
  accent: colors.goldDeep,
  accentMuted: colors.gold,
};

export function useTheme(): Theme {
  const { profile } = useAuth();
  const { persona } = usePersona();

  if (profile?.role === 'host') return HOST_THEME;
  if (profile?.role === 'both' && persona === 'host') return HOST_THEME;
  return OWNER_THEME;
}

import * as React from 'react';

/**
 * Small pill badge for host tiers (gold / silver / bronze), the honest
 * "جديد" new marker, status, and counts. Label is cream on a coloured
 * fill. Never use it to show fabricated ratings or booking counts — new
 * hosts get the "new" tone, not invented stats.
 */
export interface BadgeProps {
  /** Short label, usually 1–2 words. */
  label: string;
  /** Preset fill. `new` = gold, tiers map to the tier tokens. */
  tone?: 'gold' | 'silver' | 'bronze' | 'new' | 'accent' | 'danger' | 'neutral';
  /** Override the fill with an explicit colour (e.g. a status colour). */
  color?: string;
  /** Optional leading glyph. */
  icon?: React.ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;

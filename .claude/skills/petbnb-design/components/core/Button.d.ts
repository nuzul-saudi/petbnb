import * as React from 'react';

/**
 * The single reusable button for the whole Petbnb app. Accent resolves
 * through the active persona theme (owner=moss, host=deep-gold) — never
 * hardcode the fill colour. Primary is the main screen CTA (usually
 * fullWidth); secondary is a supporting action; destructive is for
 * cancel / decline / delete.
 *
 * @startingPoint section="Core" subtitle="Primary / secondary / destructive button" viewport="700x200"
 */
export interface ButtonProps {
  /** Visible label. Saudi-colloquial, feminine address where it's an action. */
  label: string;
  /** Click handler. Ignored while disabled or loading. */
  onPress?: () => void;
  /** primary = solid accent fill · secondary = outlined accent · destructive = outlined terracotta. */
  variant?: 'primary' | 'secondary' | 'destructive';
  /** normal = 44px screen CTA · compact = 32px inline pill action. */
  size?: 'normal' | 'compact';
  /** 50% opacity, ignores presses. */
  disabled?: boolean;
  /** Implies disabled; shows an inline spinner. Caller swaps the label ("حفظ" → "جارٍ الحفظ…"). */
  loading?: boolean;
  /** Stretch to the container width — use for the primary screen CTA. */
  fullWidth?: boolean;
  /** Optional leading glyph (e.g. "+"). */
  icon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export function Button(props: ButtonProps): JSX.Element;

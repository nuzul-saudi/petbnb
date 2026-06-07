import * as React from 'react';

/**
 * The recurring surface object: paper fill, 22px radius, soft card
 * shadow, clipped overflow. Use for listing cards, sheets, role cards,
 * any elevated content block.
 */
export interface CardProps {
  children?: React.ReactNode;
  /** Interior padding (space-lg). Set false when a child photo bleeds edge-to-edge. */
  pad?: boolean;
  /** Adds a gentle shadow lift on hover for tappable cards. */
  interactive?: boolean;
  /** Recessed variant: sand fill, no shadow. */
  sunken?: boolean;
  style?: React.CSSProperties;
}

export function Card(props: CardProps): JSX.Element;

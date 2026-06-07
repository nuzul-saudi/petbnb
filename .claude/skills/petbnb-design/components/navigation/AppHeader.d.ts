/**
 * The shared 56px top app bar. Tints with the active persona and shows
 * nav items (active item bolds + takes the accent), a language toggle
 * (ع / EN), and an optional persona switch with a pending-count badge
 * for role="both" users. Wrap the page in data-persona to theme it.
 *
 * @startingPoint section="Navigation" subtitle="Persona-tinted top app bar" viewport="700x80"
 */
export interface AppHeaderProps {
  /** Nav items, in reading order. */
  items?: AppHeaderNavItem[];
  /** Current locale; the toggle shows the OTHER language. */
  locale?: 'ar' | 'en';
  onLanguageToggle?: () => void;
  /** When set, renders the persona switch pill (names the persona you'd switch TO). */
  personaToggleLabel?: string;
  onPersonaToggle?: () => void;
  /** Attention count on the persona switch (host requests). Hidden at 0, caps at "9+". */
  pendingCount?: number;
}

export interface AppHeaderNavItem {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function AppHeader(props: AppHeaderProps): JSX.Element;

/**
 * The role chooser card (owner / host / both) used in onboarding and
 * the profile role switcher. Glyph + title + description; selected =
 * 2px accent border + whisper fill + a ✓. Admin is never a selectable
 * role here (granted only by another admin).
 */
export interface RoleCardProps {
  /** Which role this card represents — picks the default glyph. */
  role: 'owner' | 'host' | 'both';
  /** Localized title, e.g. "أبحث عن مكان لقطتي". */
  title: string;
  /** Localized one-line description. */
  desc: string;
  /** Override the default glyph (🐈 / 🏠 / ⚭). */
  icon?: string;
  selected?: boolean;
  onPress?: () => void;
}

export function RoleCard(props: RoleCardProps): JSX.Element;

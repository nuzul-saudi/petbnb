/**
 * Toggleable filter pill (e.g. the "مضيفات فقط" female-hosts-only
 * filter on the owner feed). Inert = paper + whisper border + muted
 * label; active = persona-accent fill, cream bold label, leading ✓.
 */
export interface FilterChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function FilterChip(props: FilterChipProps): JSX.Element;

/**
 * Host or pet avatar with a 3-level fallback: real photo → first
 * initial (Reem Kufi on a whisper well) → a 🐈 glyph on a tinted
 * square. Circular by default; square-rounded for the pet edit thumb.
 */
export interface AvatarProps {
  /** Highest-priority source — the real photo URL. */
  photoUrl?: string | null;
  /** Used for the initial fallback when there's no photo. */
  name?: string | null;
  /** Final fallback glyph. Default 🐈. */
  glyph?: string;
  /** Square side in px. Default 56. */
  size?: number;
  /** true = circle (default) · false = rounded square. */
  rounded?: boolean;
}

export function Avatar(props: AvatarProps): JSX.Element;

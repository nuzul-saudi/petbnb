/**
 * Text input with optional label + helper/error line. Paper fill,
 * whisper hairline, 16px radius, Tajawal. RTL-aware (dir="auto").
 * Focus thickens the border to the persona accent.
 */
export interface InputProps {
  /** Bold caption above the field. */
  label?: string;
  value?: string;
  /** Receives the next string value. */
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Muted helper line below the field. */
  helper?: string;
  /** Error line below the field (terracotta); also reddens the border. */
  error?: string;
  type?: string;
  disabled?: boolean;
  id?: string;
}

export function Input(props: InputProps): JSX.Element;

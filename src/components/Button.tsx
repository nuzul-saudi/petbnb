// Single reusable Button component for the whole app.
//
// Three variants with consistent padding, height, and font:
//   - primary     : solid moss fill, cream label. Main action, usually full-width.
//   - secondary   : transparent body, moss border + moss label. Side / supporting action.
//   - destructive : transparent body, terracotta border + terracotta label. Cancel / delete / decline.
//
// Behaviors:
//   - disabled   : 50% opacity, ignores presses, accessible state reflects it.
//   - loading    : implies disabled; renders a small spinner before the label.
//                  Callers swap the label themselves (e.g. "Save" → "Saving…").
//   - fullWidth  : alignSelf: 'stretch'. Use true for the primary screen CTA.
//
// All tokens pulled from theme/tokens.ts — never hardcode colors / radii.

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';
export type ButtonSize = 'normal' | 'compact';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Optional override for screen readers; defaults to `label`. */
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'normal',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      style={[
        styles.base,
        {
          backgroundColor: variantStyle.background,
          borderColor: variantStyle.border,
          minHeight: sizeStyle.minHeight,
          paddingVertical: sizeStyle.paddingVertical,
          paddingHorizontal: sizeStyle.paddingHorizontal,
        },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator size="small" color={variantStyle.label} />
        </View>
      ) : null}
      <Text
        style={[
          styles.label,
          { color: variantStyle.label, fontSize: sizeStyle.fontSize },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Per-size dimensions. 'compact' is for inline pill-style actions (e.g.
// per-entry Edit/Delete in a row of cards) that should NOT pull as much
// visual weight as a primary screen CTA.
const SIZE_STYLES: Record<
  ButtonSize,
  {
    minHeight: number;
    paddingVertical: number;
    paddingHorizontal: number;
    fontSize: number;
  }
> = {
  normal: {
    minHeight: 44, // Apple HIG tap target
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    fontSize: 15,
  },
  compact: {
    minHeight: 32,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 13,
  },
};

// Per-variant color triple. Kept as a record so adding a fourth variant
// later is a one-row change.
const VARIANT_STYLES: Record<
  ButtonVariant,
  { background: string; border: string; label: string }
> = {
  primary: {
    background: colors.moss,
    border: colors.moss,
    label: colors.cream,
  },
  secondary: {
    background: 'transparent',
    border: colors.moss,
    label: colors.moss,
  },
  destructive: {
    background: 'transparent',
    border: colors.terracotta,
    label: colors.terracotta,
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    // paddingVertical, paddingHorizontal, and minHeight come from SIZE_STYLES.
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fonts.bodyBold,
    // fontSize comes from SIZE_STYLES.
  },
  spinnerWrap: {
    // ActivityIndicator handles its own dimensions; the wrap just keeps
    // the gap consistent whether the spinner is present or not.
  },
});

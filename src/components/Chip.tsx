// <Chip> — one filter/option chip (Wave 1b, S6 / 2026-07-11).
//
// The feed, the admin filter rows, and the host application each
// hand-rolled their own pill: same shape, drifting padding, and — the
// reason this matters — tap targets as small as ~24px tall (the city
// row), well under the 32px floor for an inline control. This unifies
// them with an enforced minHeight per size.
//
// Colour is deliberately UNCHANGED from the feed's prior chips: selected
// fills with colors.moss + cream text; unselected is a whisper-bordered
// paper pill. (Persona-accent on chips is out of scope for S6 — this is
// unification + tap-targets only.) An optional leading ✓ mirrors the
// feed's existing active-chip affordance.
//
// Sizes:
//   inline  → minHeight 32 (filter rows, sort menu, option groups)
//   primary → minHeight 44 (standalone, thumb-first primary filters)

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type ChipProps = {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  size?: 'inline' | 'primary';
  /** Prepend a ✓ when selected (toggle/multi-select affordance). */
  showCheck?: boolean;
  accessibilityLabel?: string;
};

export function Chip({
  label,
  onPress,
  selected = false,
  disabled = false,
  size = 'inline',
  showCheck = false,
  accessibilityLabel,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        size === 'primary' ? styles.chipPrimary : styles.chipInline,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
      ]}
    >
      <View style={styles.inner}>
        <Text
          style={[
            styles.text,
            size === 'primary' ? styles.textPrimary : styles.textInline,
            selected && styles.textSelected,
          ]}
        >
          {selected && showCheck ? '✓ ' : ''}
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  chipInline: {
    minHeight: 32,
    paddingVertical: spacing.sm,
  },
  chipPrimary: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  chipSelected: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  textInline: {
    fontSize: 12,
    // Explicit lineHeight so Arabic descenders (ج ع ي) render fully
    // inside the pill on iOS Safari / WhatsApp in-app browser.
    lineHeight: 18,
  },
  textPrimary: {
    fontSize: 14,
    lineHeight: 20,
  },
  textSelected: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
});

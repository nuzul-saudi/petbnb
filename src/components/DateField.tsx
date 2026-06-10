// Shared platform-branched date input. Originally local to the booking
// request screen; lifted here in test round 3 (2026-06-10) so the
// vaccination date inputs on the pet edit screen render the same
// calendar UX. CLAUDE.md §13 originally listed "real date picker" as
// post-MVP polish — we kept the calendar on web (HTML5 input type=date)
// and the YYYY-MM-DD TextInput fallback on native that the booking
// flow already had.
//
// Web: native HTML5 <input type="date"> — gives the OS date picker.
// Native: TextInput with YYYY-MM-DD placeholder. Real native picker
//   (expo-date-picker / @react-native-community/datetimepicker) is
//   still a follow-up — listed in CLAUDE.md §13.

import { Platform, StyleSheet, TextInput } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type DateFieldProps = {
  value: string;
  onChange: (v: string) => void;
  /** Minimum acceptable date, YYYY-MM-DD. Web-only; ignored on native. */
  min?: string;
  /** Maximum acceptable date, YYYY-MM-DD. Web-only; ignored on native. */
  max?: string;
  /** Web-only — forwards to the underlying HTML input for focus / showPicker. */
  inputRef?: React.Ref<HTMLInputElement>;
};

export function DateField({ value, onChange, min, max, inputRef }: DateFieldProps) {
  if (Platform.OS === 'web') {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((<input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: colors.paper,
          borderColor: colors.whisper,
          borderWidth: 1,
          borderRadius: radii.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.lg,
          fontFamily: fonts.body,
          fontSize: 16,
          color: colors.ink,
          width: '100%',
          boxSizing: 'border-box',
        } as any}
      />) as unknown) as React.ReactElement
    );
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={colors.inkSoft}
      autoCapitalize="none"
      autoCorrect={false}
      inputMode="numeric"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'left',
  },
});

// <SingleDateField> — a single-date picker card (FIX 2 / 2026-07-11).
//
// Replaces the old DateField (platform-branched HTML date input / raw
// YYYY-MM-DD TextInput) so the WHOLE app uses ONE calendar component
// (RangeCalendar). Renders a tappable card showing the chosen date
// (Latin-digit, via formatDate) or a placeholder; tapping opens a modal
// with RangeCalendar in `mode="single"`. Optional — a ✕ clears it.
//
// minDate/maxDate bound the selectable window (e.g. vaccination dates
// pass maxDate = today so no future date can be entered, and no minDate
// so any past date is reachable).

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { RangeCalendar } from '@/components/RangeCalendar';
import { formatDate } from '@/lib/date';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type SingleDateFieldProps = {
  /** '' (unset) or 'yyyy-mm-dd'. */
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  maxDate?: string;
  /** Placeholder when unset. Defaults to common.select_date. */
  placeholder?: string;
};

export function SingleDateField({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder,
}: SingleDateFieldProps) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const has = value !== '';

  return (
    <>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          has ? formatDate(value, locale, 'medium') : placeholder ?? t('common.select_date')
        }
      >
        <Text style={[styles.value, !has && styles.placeholder]}>
          {has
            ? formatDate(value, locale, 'medium')
            : placeholder ?? t('common.select_date')}
        </Text>
        {has ? (
          <Pressable
            onPress={() => onChange('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('search.clear')}
          >
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <RangeCalendar
              mode="single"
              startDate={value || null}
              endDate={value || null}
              minDate={minDate}
              maxDate={maxDate}
              onChange={({ startDate: s }) => onChange(s ?? '')}
              onRangeComplete={(d) => {
                onChange(d);
                setOpen(false);
              }}
            />
            <View style={styles.footer}>
              <Pressable
                onPress={() => setOpen(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>{t('search.cancel')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  value: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  placeholder: {
    color: colors.inkSoft,
  },
  clear: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.inkSoft,
    paddingHorizontal: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});

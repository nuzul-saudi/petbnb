// Move 4 — When modal. Picks start + end dates for the stay.
//
// Reuses the existing DateField (web HTML5 picker / native TextInput).
// Dates DO NOT filter the feed today — they're captured here and
// forwarded as URL params when the user opens a sitter's request
// screen so the booking flow prefills. The spec made that scope
// explicit (date-based availability filtering is a separate feature).

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { todayIso } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type SearchWhenModalProps = {
  visible: boolean;
  startDate: string | null;
  endDate: string | null;
  onApply: (next: { startDate: string | null; endDate: string | null }) => void;
  onClose: () => void;
};

export function SearchWhenModal({
  visible,
  startDate,
  endDate,
  onApply,
  onClose,
}: SearchWhenModalProps) {
  const { t } = useTranslation();
  const [draftStart, setDraftStart] = useState<string>(startDate ?? '');
  const [draftEnd, setDraftEnd] = useState<string>(endDate ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDraftStart(startDate ?? '');
      setDraftEnd(endDate ?? '');
      setError(null);
    }
  }, [visible, startDate, endDate]);

  const onApplyPress = () => {
    // Allow clearing both → "no dates set" is valid (resets search dates).
    if (!draftStart && !draftEnd) {
      onApply({ startDate: null, endDate: null });
      onClose();
      return;
    }
    if (!draftStart || !draftEnd) {
      setError(t('search.when_both_required'));
      return;
    }
    if (draftEnd <= draftStart) {
      setError(t('search.when_invalid_range'));
      return;
    }
    onApply({ startDate: draftStart, endDate: draftEnd });
    onClose();
  };

  const onClear = () => {
    setDraftStart('');
    setDraftEnd('');
    setError(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('search.when')}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>{t('search.start_date_label')}</Text>
            <DateField
              value={draftStart}
              onChange={setDraftStart}
              min={todayIso()}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('search.end_date_label')}</Text>
            <DateField
              value={draftEnd}
              onChange={setDraftEnd}
              min={draftStart || todayIso()}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <Pressable onPress={onClear} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>{t('search.clear')}</Text>
            </Pressable>
            <View style={styles.footerSpacer} />
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>{t('search.cancel')}</Text>
            </Pressable>
            <Pressable onPress={onApplyPress} style={styles.applyButton}>
              <Text style={styles.applyButtonText}>{t('search.apply')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerSpacer: {
    flex: 1,
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearButtonText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  applyButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.mossDeep,
  },
  applyButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
});

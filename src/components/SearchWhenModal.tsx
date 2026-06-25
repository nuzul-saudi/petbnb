// Move 4 — When modal (date-picker round, 2026-06-13).
//
// Now backed by the custom RangeCalendar (two-tap selection with
// connected mid-range highlight). The browser-native date picker
// in DateField can't render that band, so this modal replaces the
// two DateField inputs with a single RangeCalendar.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { RangeCalendar } from '@/components/RangeCalendar';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type SearchWhenModalProps = {
  visible: boolean;
  startDate: string | null;
  endDate: string | null;
  onApply: (next: { startDate: string | null; endDate: string | null }) => void;
  onClose: () => void;
  /**
   * 2026-06-26 — half-open blocked ranges from the host. Forwarded to
   * the inner RangeCalendar so blocked days render dimmed + struck
   * through and are non-tappable. Optional; the home-page search
   * hero doesn't pass any (no listing context yet).
   */
  blockedRanges?: { start_date: string; end_date: string }[];
};

export function SearchWhenModal({
  visible,
  startDate,
  endDate,
  onApply,
  onClose,
  blockedRanges,
}: SearchWhenModalProps) {
  const { t } = useTranslation();
  const [draftStart, setDraftStart] = useState<string | null>(startDate);
  const [draftEnd, setDraftEnd] = useState<string | null>(endDate);

  useEffect(() => {
    if (visible) {
      setDraftStart(startDate);
      setDraftEnd(endDate);
    }
  }, [visible, startDate, endDate]);

  const onClear = () => {
    setDraftStart(null);
    setDraftEnd(null);
  };

  // Auto-apply + close when the user completes a range. The
  // RangeCalendar passes the fresh values explicitly — DON'T read
  // draftStart/draftEnd in this callback, those are the pre-tap
  // closure snapshot and will be one tap behind, dropping endDate
  // on the floor.
  const onRangeComplete = (start: string, end: string) => {
    onApply({ startDate: start, endDate: end });
    onClose();
  };

  // The explicit "Apply" button reads draft state — fine here
  // because the user can only press it AFTER any pending state
  // update has committed (one render later).
  const onApplyPress = () => {
    onApply({ startDate: draftStart, endDate: draftEnd });
    onClose();
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

          <RangeCalendar
            startDate={draftStart}
            endDate={draftEnd}
            onChange={({ startDate: s, endDate: e }) => {
              setDraftStart(s);
              setDraftEnd(e);
            }}
            onRangeComplete={onRangeComplete}
            blockedRanges={blockedRanges}
          />

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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
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

// <StatusPill> — one status pill, one taxonomy (Wave 1b, S1 / 2026-07-11).
//
// Both /bookings and /inquiries had their own inline StatusPill: the
// booking one at fontSize 10 + letterSpacing 0.5, the inquiry one at
// fontSize 11, with two independently-maintained colour rules. This
// unifies them: booking_status AND inquiry_status both map to ONE tone
// taxonomy, rendered at ONE size.
//
// Tone taxonomy (the single source of truth for "what colour is this
// status"):
//   positive  → moss    (accepted / active / completed / converted)
//   pending   → gold    (requested / open — awaiting a decision)
//   negative  → terracotta (declined / cancelled / disputed)
//   archived  → whisper  (closed — low-contrast, retired thread)

import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

type BookingStatus = Enums<'booking_status'>;
type InquiryStatus = Enums<'inquiry_status'>;
type PillTone = 'positive' | 'pending' | 'negative' | 'archived';

const TONE: Record<PillTone, { bg: string; fg: string }> = {
  positive: { bg: colors.moss, fg: colors.cream },
  pending: { bg: colors.gold, fg: colors.cream },
  negative: { bg: colors.terracotta, fg: colors.cream },
  archived: { bg: colors.whisper, fg: colors.inkSoft },
};

const BOOKING_TONE: Record<BookingStatus, PillTone> = {
  requested: 'pending',
  accepted: 'positive',
  active: 'positive',
  completed: 'positive',
  declined: 'negative',
  cancelled: 'negative',
  disputed: 'negative',
};

const INQUIRY_TONE: Record<InquiryStatus, PillTone> = {
  open: 'pending',
  converted: 'positive',
  closed: 'archived',
};

export type StatusPillProps =
  | { kind: 'booking'; status: BookingStatus }
  | { kind: 'inquiry'; status: InquiryStatus };

export function StatusPill(props: StatusPillProps) {
  const { t } = useTranslation();
  const tone =
    props.kind === 'booking'
      ? BOOKING_TONE[props.status]
      : INQUIRY_TONE[props.status];
  const label =
    props.kind === 'booking'
      ? t(`booking.status_${props.status}`)
      : t(`inquiry.status_${props.status}_pill`);
  const c = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});

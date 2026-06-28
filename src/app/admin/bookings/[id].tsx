// #2 (2026-06-28) — admin booking detail (read-only).
//
// Dedicated /admin/bookings/[id] route. Mirrors the structural
// pattern of /admin/listings/[id] + /admin/conversations/[kind]/[id]:
//   (a) inline admin header with back-to-/admin/bookings — NOT
//       AppHeader; the user-side hamburger has no place here (#7).
//   (b) NO compose box (no messages section).
//   (c) NO owner Edit/Cancel and NO host Accept/Decline — those
//       lived on /bookings/[id] gated on owner_id/host_id ===
//       user.id, so an admin (who matches neither) already
//       wouldn't see them; this route doesn't render them at all.
//   (d) Full read-only meta: listing, owner, pet(s), dates +
//       nights, base price + addons + total, status, condition
//       reports (check-in + check-out).
//
// Reuses src/lib/bookings.getBooking + src/lib/condition-reports
// .listConditionReports directly — admin has SELECT bypass on
// bookings (0004), listings (0024), condition_reports (0027) and
// authenticated reads all profiles. No new RPCs.

import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { useAuth } from '@/lib/auth';
import { getBooking, type BookingDetail } from '@/lib/bookings';
import {
  listConditionReports,
  type ConditionReport,
} from '@/lib/condition-reports';
import { formatDateRange } from '@/lib/date';
import { formatSAR, pickLocalized, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function AdminBookingDetailScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { profile } = useAuth();

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [reports, setReports] = useState<ConditionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [b, r] = await Promise.all([
        getBooking(id),
        listConditionReports(id),
      ]);
      setBooking(b);
      setReports(r);
    } catch (e) {
      logWarn('[admin.booking.load_failed]', e);
      setError(t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profile) return <SafeAreaView style={styles.safe} />;
  if (!id) return <Redirect href="/admin/bookings" />;

  const listingTitle =
    booking && booking.listing
      ? pickLocalized(
          booking.listing.title_ar,
          booking.listing.title_en,
          locale,
        )
      : '';

  const checkIn = reports.find((r) => r.phase === 'check_in');
  const checkOut = reports.find((r) => r.phase === 'check_out');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/admin/bookings')}
          style={styles.backLink}
        >
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {listingTitle || t('admin.bookings_title')}
        </Text>
      </View>

      <Text style={styles.readOnlyBanner}>
        {t('admin.bookings_detail_read_only_banner')}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : !booking ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.load_failed')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Status pill */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('admin.booking_status')}</Text>
            <View style={[styles.statusPill, statusPillStyle(booking.status)]}>
              <Text style={styles.statusPillText}>
                {t(`booking.status_${booking.status}`)}
              </Text>
            </View>
          </View>

          {/* Parties */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('admin.booking_owner')}</Text>
            <Text style={styles.cardValue}>
              {booking.owner?.full_name ?? '—'}
            </Text>
            <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>
              {t('admin.bookings_detail_host')}
            </Text>
            <Text style={styles.cardValue}>
              {booking.host?.full_name ?? '—'}
            </Text>
          </View>

          {/* Dates */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('admin.booking_dates')}</Text>
            <Text style={styles.cardValue}>
              {formatDateRange(booking.start_date, booking.end_date, locale)}
              {' · '}
              {t('booking.nights_count', {
                nights: toArabicDigits(booking.nights),
              })}
            </Text>
          </View>

          {/* Pets */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {t('admin.bookings_detail_pets')}
            </Text>
            {booking.pets.length === 0 ? (
              <Text style={styles.muted}>—</Text>
            ) : (
              booking.pets.map((p) => (
                <Text key={p.id} style={styles.cardValue}>
                  🐈 {p.name}
                  {p.breed ? ` · ${p.breed}` : ''}
                </Text>
              ))
            )}
          </View>

          {/* Price breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {t('admin.bookings_detail_price_breakdown')}
            </Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                {t('admin.bookings_detail_base_price')}
              </Text>
              <Text style={styles.priceValue}>
                {formatSAR(booking.base_price_sar)}
              </Text>
            </View>
            {booking.addons.length > 0 ? (
              <>
                <Text
                  style={[styles.cardLabel, styles.cardLabelSpaced]}
                >
                  {t('admin.bookings_detail_addons')}
                </Text>
                {booking.addons.map((a) => (
                  <View key={a.id} style={styles.priceRow}>
                    <Text style={styles.priceLabel}>
                      {a.provider_label ?? a.type}
                    </Text>
                    <Text style={styles.priceValue}>
                      {formatSAR(a.price_sar)}
                    </Text>
                  </View>
                ))}
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    {t('admin.bookings_detail_addons_total')}
                  </Text>
                  <Text style={styles.priceValue}>
                    {formatSAR(booking.addons_total_sar)}
                  </Text>
                </View>
              </>
            ) : null}
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>
                {t('admin.booking_total')}
              </Text>
              <Text style={styles.totalValue}>
                {formatSAR(booking.total_sar)}
              </Text>
            </View>
          </View>

          {/* Condition reports */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {t('admin.bookings_detail_condition_reports')}
            </Text>
            {!checkIn && !checkOut ? (
              <Text style={styles.muted}>
                {t('admin.bookings_detail_no_reports')}
              </Text>
            ) : (
              <>
                {checkIn ? (
                  <View style={styles.reportBlock}>
                    <Text style={styles.reportPhase}>
                      {t('admin.bookings_detail_check_in')}
                    </Text>
                    {checkIn.weight_note ? (
                      <Text style={styles.reportLine}>
                        {checkIn.weight_note}
                      </Text>
                    ) : null}
                    {checkIn.health_notes ? (
                      <Text style={styles.reportLine}>
                        {checkIn.health_notes}
                      </Text>
                    ) : null}
                    {checkIn.behavior_notes ? (
                      <Text style={styles.reportLine}>
                        {checkIn.behavior_notes}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {checkOut ? (
                  <View style={styles.reportBlock}>
                    <Text style={styles.reportPhase}>
                      {t('admin.bookings_detail_check_out')}
                    </Text>
                    {checkOut.weight_note ? (
                      <Text style={styles.reportLine}>
                        {checkOut.weight_note}
                      </Text>
                    ) : null}
                    {checkOut.health_notes ? (
                      <Text style={styles.reportLine}>
                        {checkOut.health_notes}
                      </Text>
                    ) : null}
                    {checkOut.behavior_notes ? (
                      <Text style={styles.reportLine}>
                        {checkOut.behavior_notes}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function statusPillStyle(status: BookingDetail['status']) {
  if (status === 'completed' || status === 'accepted' || status === 'active') {
    return { backgroundColor: colors.moss };
  }
  if (status === 'declined' || status === 'cancelled' || status === 'disputed') {
    return { backgroundColor: colors.terracotta };
  }
  return { backgroundColor: colors.gold };
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backLink: { paddingVertical: spacing.xs },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
  },
  readOnlyBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.whisper,
    borderRadius: radii.pill,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.terracotta,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.card,
  },
  cardLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.inkSoft,
    letterSpacing: 0.3,
  },
  cardLabelSpaced: {
    marginTop: spacing.md,
  },
  cardValue: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginTop: spacing.xs,
  },
  statusPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.cream,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  priceLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  priceValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  totalRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
  },
  totalLabel: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.mossDeep,
  },
  totalValue: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.mossDeep,
  },
  reportBlock: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  reportPhase: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
  },
  reportLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
});

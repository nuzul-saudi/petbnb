import { logWarn } from '@/lib/log';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { listAllBookings, type AdminBooking } from '@/lib/admin';
import { formatDateRange } from '@/lib/date';
import { formatSAR } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

export default function AdminBookingsScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAllBookings()
      .then((rows) => {
        if (!cancelled) setBookings(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn('[admin.bookings.load_failed]', e);
        setError(t('admin.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/admin')} style={styles.backLink}>
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.bookings_title')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.bookings_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            // #2 (2026-06-28) — booking rows now navigate to the
            // dedicated /admin/bookings/[id] read-only detail. Was
            // a plain <View> with no tap action; admin had no way
            // to drill into a booking from this list. Casting the
            // route as never because Expo Router's typed-route
            // union hasn't picked up the new file yet (same
            // pattern used by other admin routes in this file).
            <Pressable
              onPress={() =>
                router.push(
                  `/admin/bookings/${item.id}` as never,
                )
              }
              style={styles.row}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {item.listing?.title_ar ?? '—'}
                </Text>
                <StatusPill status={item.status} />
              </View>
              <Text style={styles.rowMeta}>
                {t('admin.booking_owner')}: {item.owner?.full_name ?? '—'}
              </Text>
              <Text style={styles.rowMeta}>
                {/* L2 (2026-06-27) — last admin ISO leak swept. Was
                    toArabicDigits piping raw ISO ("2026-07-01"); now
                    formatDateRange + raw nights ("Jul 1 → Jul 5 (4)"). */}
                {t('admin.booking_dates')}:{' '}
                {formatDateRange(item.start_date, item.end_date, locale)} (
                {item.nights})
              </Text>
              <Text style={styles.rowTotal}>
                {t('admin.booking_total')}: {formatSAR(item.total_sar)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: Enums<'booking_status'> }) {
  const { t } = useTranslation();
  const bg =
    status === 'completed' || status === 'accepted' || status === 'active'
      ? colors.moss
      : status === 'declined' || status === 'cancelled' || status === 'disputed'
        ? colors.terracotta
        : colors.gold;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={styles.pillText}>{t(`booking.status_${status}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
    textAlign: 'right',
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
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  row: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.card,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  listingTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  rowTotal: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
});

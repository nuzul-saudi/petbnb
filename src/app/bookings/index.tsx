import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { formatSAR, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums, Tables } from '@/types/database';

type MyBooking = Tables<'bookings'> & {
  listing: Pick<Tables<'listings'>, 'id' | 'title_ar' | 'neighborhood'> | null;
};

export default function MyBookingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user } = useAuth();

  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('bookings')
        .select(
          `
          *,
          listing:listings(id, title_ar, neighborhood)
        `,
        )
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      if (e) throw e;
      setBookings((data ?? []) as MyBooking[]);
    } catch (e) {
      console.warn('[mybookings.load_failed]', e);
      setError(t('mybookings.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
          <Text style={styles.backText}>{t('mybookings.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('mybookings.title')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('mybookings.loading')}</Text>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('mybookings.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/bookings/[id]',
                  params: { id: item.id },
                })
              }
              style={styles.row}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.listing?.title_ar ?? '—'}
                </Text>
                <StatusPill status={item.status} />
              </View>
              {item.listing?.neighborhood ? (
                <Text style={styles.rowMeta}>📍 {item.listing.neighborhood}</Text>
              ) : null}
              <Text style={styles.rowMeta}>
                {toArabicDigits(item.start_date)} → {toArabicDigits(item.end_date)} ·{' '}
                {t('booking.nights_count', { nights: toArabicDigits(item.nights) })}
              </Text>
              <Text style={styles.rowTotal}>{formatSAR(item.total_sar)}</Text>
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
    gap: spacing.sm,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  emptyTitle: {
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
  rowTitle: {
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
    fontSize: 14,
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

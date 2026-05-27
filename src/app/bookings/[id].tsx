import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { getBooking, type BookingDetail } from '@/lib/bookings';
import { formatSAR, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function BookingDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBooking(id)
      .then((b) => {
        if (cancelled) return;
        setBooking(b);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'load_failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('listing.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !booking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t('listing.not_found')}</Text>
          <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
            <Text style={styles.backText}>{t('booking.back_home')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successCircle}>
          <Text style={styles.successCheck}>✓</Text>
        </View>

        <Text style={styles.title}>{t('booking.confirm_title')}</Text>
        <Text style={styles.subtitle}>
          {t(`booking.status_${booking.status}`)}
        </Text>

        <View style={styles.summaryCard}>
          {booking.listing ? (
            <>
              <Text style={styles.summaryTitle}>{booking.listing.title_ar}</Text>
              <Text style={styles.summaryMeta}>
                📍 {booking.listing.neighborhood}
              </Text>
            </>
          ) : null}

          <View style={styles.summaryDivider} />

          <Text style={styles.summaryLine}>
            {t('booking.dates_range', {
              start: toArabicDigits(booking.start_date),
              end: toArabicDigits(booking.end_date),
            })}
          </Text>
          <Text style={styles.summaryLine}>
            {t('booking.nights_count', {
              nights: toArabicDigits(booking.nights),
            })}
          </Text>

          {booking.addons.length > 0 ? (
            <Text style={styles.summaryLine}>
              + {t(`booking.addon_${booking.addons[0].type}`)} ({formatSAR(booking.addons[0].price_sar)})
            </Text>
          ) : null}

          <View style={styles.summaryDivider} />

          <Text style={styles.totalLine}>
            {t('booking.total_paid', { total: formatSAR(booking.total_sar) })}
          </Text>
        </View>

        <Pressable
          onPress={() => router.replace('/')}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{t('booking.back_home')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successCheck: {
    fontSize: 40,
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.gold,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  summaryTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'right',
  },
  summaryMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.whisper,
    marginVertical: spacing.sm,
  },
  summaryLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  totalLine: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  cta: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
  backButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.inkSoft,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});

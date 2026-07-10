import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/lib/auth';
import {
  listBookingsForHost,
  listBookingsForOwner,
  type MyBookingListItem,
} from '@/lib/bookings';
import { formatSAR, pickLocalized, toArabicDigits } from '@/lib/format';
import { formatDateRange } from '@/lib/date';
import { useTranslation } from '@/lib/i18n';
import { getLastSeenBatch } from '@/lib/last-seen-storage';
import { useHostNotifications } from '@/lib/host-notifications';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

export default function MyBookingsScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const theme = useTheme();
  const { initializing, session, user, profile } = useAuth();
  const { refreshPendingHostCount } = useHostNotifications();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  // Mode is role-driven now: hosts see incoming bookings against their
  // listings, owners + admin see bookings they themselves created.
  const isHostMode = profile?.role === 'host';

  const [bookings, setBookings] = useState<MyBookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // R2C7 — last-seen stamps per booking (owner mode only). Read after
  // the bookings load resolves so the unread dot can compare against
  // each row's latest_update_at without re-hitting AsyncStorage per
  // render.
  const [lastSeen, setLastSeen] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = isHostMode
        ? await listBookingsForHost(user.id)
        : await listBookingsForOwner(user.id);
      setBookings(rows);
      // R2C7 — owner mode only. Pull last-seen stamps for the loaded
      // booking ids. Host bookings list doesn't render an unread dot
      // (the pending-requests badge in the header is the host's
      // surface for unread).
      if (!isHostMode) {
        const seen = await getLastSeenBatch(
          user.id,
          rows.map((r) => r.id),
        );
        setLastSeen(seen);
      } else {
        setLastSeen(new Map());
      }
    } catch (e) {
      logWarn('[mybookings.load_failed]', e);
      setError(t('mybookings.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [user, t, isHostMode]);

  useFocusEffect(
    useCallback(() => {
      load();
      // R2C7 — refresh the AppHeader's pending-requests badge on
      // screen focus. Without this, a host who accepted a request
      // somewhere else (e.g. another tab, the booking detail) and
      // then navigated to /bookings would still see the old count
      // on the header badge. Cheap one-shot — the notifications
      // context throttles redundant fetches via its internal tick.
      refreshPendingHostCount();
    }, [load, refreshPendingHostCount]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
          <Text style={styles.backText}>{t('mybookings.back')}</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.accent }]}>
          {isHostMode ? t('mybookings.host_title') : t('mybookings.title')}
        </Text>
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
          renderItem={({ item }) => {
            // R2C7 — unread dot. True when this booking has at least
            // one daily_update AND the latest one is newer than what
            // the user last saw. The dot rides next to the title so
            // it's the first thing scanned.
            const seenAt = lastSeen.get(item.id) ?? '';
            const hasUnread =
              !isHostMode &&
              !!item.latest_update_at &&
              item.latest_update_at > seenAt;
            return (
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
                {hasUnread ? (
                  <View
                    style={styles.unreadDot}
                    accessibilityLabel={t('mybookings.unread_indicator')}
                  />
                ) : null}
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.listing
                    ? pickLocalized(
                        item.listing.title_ar,
                        item.listing.title_en,
                        locale,
                      )
                    : '—'}
                </Text>
                <StatusPill status={item.status} />
              </View>
              {item.listing?.neighborhood ? (
                <Text style={styles.rowMeta}>📍 {item.listing.neighborhood}</Text>
              ) : null}
              {item.pets.length > 0 ? (
                <Text style={styles.rowMeta}>
                  🐈 {item.pets.map((p) => p.name).join('، ')}
                </Text>
              ) : isHostMode ? (
                // Host-side rows can render with no pets when RLS didn't
                // grant SELECT reach on the booked pet(s) (pre-0050
                // junction gap). Show a neutral placeholder rather than a
                // blank row — never a white screen.
                <Text style={styles.rowMeta}>
                  🐈 {t('mybookings.pets_hidden_fallback')}
                </Text>
              ) : null}
              {/* FIX 3 \xe2\x80\x94 was raw ISO via toArabicDigits. Now uses
                  formatDateRange's short-form span. */}
              <Text style={styles.rowMeta}>
                {formatDateRange(item.start_date, item.end_date, locale)} ·{' '}
                {t('booking.nights_count', { nights: toArabicDigits(item.nights) })}
              </Text>
              {/* 2026-06-29 — preview line, same shape as the
                  /inquiries inbox. */}
              {(() => {
                const lm = item.latest_message;
                if (lm && lm.deleted_at != null) {
                  return (
                    <Text
                      style={[styles.rowPreview, styles.rowPreviewMuted]}
                      numberOfLines={1}
                    >
                      {t('messages.preview_deleted')}
                    </Text>
                  );
                }
                if (lm && lm.body != null) {
                  return (
                    <Text style={styles.rowPreview} numberOfLines={1}>
                      {lm.body}
                    </Text>
                  );
                }
                return (
                  <Text
                    style={[styles.rowPreview, styles.rowPreviewMuted]}
                    numberOfLines={1}
                  >
                    {t('messages.preview_empty')}
                  </Text>
                );
              })()}
              <Text style={[styles.rowTotal, { color: theme.accent }]}>{formatSAR(item.total_sar)}</Text>
            </Pressable>
          );
          }}
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
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream in owner mode, honey in host mode).
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.terracotta,
    marginEnd: spacing.xs,
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
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  // 2026-06-29 — inbox preview line (same as /inquiries inbox).
  // Live body in normal ink; "(Message deleted)" / "(No messages
  // yet)" in italic muted.
  rowPreview: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  rowPreviewMuted: {
    color: colors.inkSoft,
    fontStyle: 'italic',
  },
  rowTotal: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
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

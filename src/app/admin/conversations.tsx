// 0044 (2026-06-28) — admin conversation browse.
//
// Read-only list of every messaging thread in the system (both
// inquiry-scoped and booking-scoped). Sorted by recent activity.
// Tap any row to read the thread in full.
//
// Admin already had is_admin() bypass on inquiries.SELECT and
// messages.SELECT since 0040 — no new RLS policy needed. This
// screen just composes normal supabase-js reads under an admin
// session.

import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

// #7 (2026-06-28) — dropped AppHeader. The user-side hamburger
// it carries pulls in items (My Bookings / My Pets / Favorites /
// etc.) that route admin OUT of the admin section. All other
// /admin/* screens use the inline header pattern below; this
// screen now matches.
import { useAuth } from '@/lib/auth';
import {
  listAdminBookingThreads,
  listAdminInquiryThreads,
  type AdminConversationSummary,
} from '@/lib/admin';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function AdminConversationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [items, setItems] = useState<AdminConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Two parallel queries — one per thread kind. Merge then sort
      // by last_activity_at descending. Inquiry rows carry a real
      // last_message_at; booking rows fall back to created_at.
      const [inquiries, bookings] = await Promise.all([
        listAdminInquiryThreads(),
        listAdminBookingThreads(),
      ]);
      const merged = [...inquiries, ...bookings].sort((a, b) => {
        const aT = a.last_activity_at ?? '';
        const bT = b.last_activity_at ?? '';
        return bT.localeCompare(aT);
      });
      setItems(merged);
    } catch (e) {
      logWarn('[admin.conversations.load_failed]', e);
      setError(t('admin.conversations.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profile) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/admin')} style={styles.backLink}>
          <Text style={styles.backText}>{t('admin.conversations.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.conversations.title')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.conversations.loading')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {t('admin.conversations.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.kind}:${it.thread_id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push(
                  `/admin/conversations/${item.kind}/${item.thread_id}` as never,
                )
              }
              style={styles.row}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.listing_title ?? '—'}
                </Text>
                <KindBadge kind={item.kind} />
              </View>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.participant_a_name ?? '—'}
                {' ↔ '}
                {item.participant_b_name ?? '—'}
              </Text>
              {item.last_activity_at ? (
                <Text style={styles.rowTimestamp}>
                  {item.last_activity_at}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function KindBadge({ kind }: { kind: 'inquiry' | 'booking' }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.kindBadge,
        kind === 'inquiry'
          ? styles.kindBadgeInquiry
          : styles.kindBadgeBooking,
      ]}
    >
      <Text style={styles.kindBadgeText}>
        {kind === 'inquiry'
          ? t('admin.conversations.kind_inquiry')
          : t('admin.conversations.kind_booking')}
      </Text>
    </View>
  );
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
    fontSize: 22,
    color: colors.mossDeep,
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
    fontSize: 13,
    color: colors.inkSoft,
  },
  rowTimestamp: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  kindBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  kindBadgeInquiry: { backgroundColor: colors.gold },
  kindBadgeBooking: { backgroundColor: colors.moss },
  kindBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
});

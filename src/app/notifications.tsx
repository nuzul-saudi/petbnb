// Notifications inbox (Phase 2a, migration 0047). Lists the signed-in
// user's notifications newest-first; tapping one marks it read and deep-
// links to its target (link_path). "Mark all read" clears the badge in
// one call. Gated: guests are bounced to sign-in with a returnTo.
//
// Not realtime — the list loads on mount and after mark-read actions;
// live delivery is Phase 5.

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/date';
import { useHostNotifications } from '@/lib/host-notifications';
import { useTranslation } from '@/lib/i18n';
import { logWarn } from '@/lib/log';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_GLYPH,
  type AppNotification,
} from '@/lib/notifications';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function NotificationsScreen() {
  const { t, locale, setLocale } = useTranslation();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
  const router = useRouter();
  const theme = useTheme();
  const { session, initializing } = useAuth();
  const { refreshUnread } = useHostNotifications();

  // null = still loading; [] = loaded-empty.
  const [items, setItems] = useState<AppNotification[] | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications());
    } catch (e) {
      logWarn('[notifications.load_failed]', e);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) {
    return <Redirect href={'/sign-in?returnTo=/notifications' as never} />;
  }

  const openOne = async (n: AppNotification) => {
    if (n.read_at == null) {
      // Optimistic local mark so the row + badge update immediately.
      setItems((prev) =>
        prev
          ? prev.map((x) =>
              x.id === n.id
                ? { ...x, read_at: new Date().toISOString() }
                : x,
            )
          : prev,
      );
      try {
        await markNotificationRead(n.id);
        refreshUnread();
      } catch (e) {
        logWarn('[notifications.mark_read_failed]', e);
      }
    }
    router.push(n.link_path as never);
  };

  const markAll = async () => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev ? prev.map((x) => (x.read_at ? x : { ...x, read_at: now })) : prev,
    );
    try {
      await markAllNotificationsRead();
      refreshUnread();
    } catch (e) {
      logWarn('[notifications.mark_all_failed]', e);
    }
  };

  const hasUnread = (items ?? []).some((n) => n.read_at == null);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />

      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.accent }]}>
          {t('notifications.screen_title')}
        </Text>
        {hasUnread ? (
          <Pressable onPress={() => void markAll()} accessibilityRole="button">
            <Text style={[styles.markAll, { color: theme.accent }]}>
              {t('notifications.mark_all')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {items == null ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('notifications.loading')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('notifications.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: n }) => {
            const unread = n.read_at == null;
            return (
              <Pressable
                onPress={() => void openOne(n)}
                style={[styles.row, unread && styles.rowUnread]}
                accessibilityRole="button"
              >
                <Text style={styles.glyph}>{NOTIFICATION_GLYPH[n.type]}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {t(n.title_key)}
                  </Text>
                  <Text style={styles.rowDate}>
                    {formatDate(n.created_at.slice(0, 10), locale, 'short')}
                  </Text>
                </View>
                {unread ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  markAll: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    padding: spacing.md,
  },
  rowUnread: {
    backgroundColor: colors.cream,
    borderColor: colors.gold,
  },
  glyph: {
    fontSize: 20,
    lineHeight: 24,
    width: 26,
    textAlign: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  rowDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.terracotta,
  },
});

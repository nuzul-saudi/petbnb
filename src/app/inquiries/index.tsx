// Pre-booking inquiry inbox (Round 5b / Step 9.5, commit 3).
//
// Mirrors src/app/bookings/index.tsx in shape: role-driven view
// (owner mode = threads I started as a starter; host mode =
// threads opened against my listings), single FlatList, tap a row
// to navigate to /inquiries/[id].
//
// Status pills mirror the booking status-pill pattern: open = gold
// (active), converted = moss (resolved happily), closed = whisper
// (archived).
//
// AppHeader's hamburger gets a new "My Inquiries" entry between
// "My Bookings" and "My Pets" — added in src/components/AppHeader.tsx
// in the same commit.

import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { InboxRow } from '@/components/InboxRow';
import { SkeletonList } from '@/components/SkeletonCard';
import { StatusPill } from '@/components/StatusPill';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/lib/auth';
import { formatRelativeStamp } from '@/lib/date';
import { pickLocalized } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import {
  listMyInquiriesAsHost,
  listMyInquiriesAsStarter,
  type InquiryListItem,
} from '@/lib/inquiries';
import { logWarn } from '@/lib/log';
import { useTheme } from '@/theme/theme';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function MyInquiriesScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const theme = useTheme();
  const { initializing, session, user, profile } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  // Same role split as /bookings: hosts see threads opened against
  // their listings, everyone else sees threads they started.
  const isHostMode = profile?.role === 'host';

  const [rows, setRows] = useState<InquiryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = isHostMode
        ? await listMyInquiriesAsHost(user.id)
        : await listMyInquiriesAsStarter(user.id);
      setRows(data);
    } catch (e) {
      logWarn('[myinquiries.load_failed]', e);
      setError(t('myinquiries.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [user, t, isHostMode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
          <Text style={[styles.backText, { color: theme.accent }]}>{t('myinquiries.back')}</Text>
        </Pressable>
        <Text style={styles.title}>
          {isHostMode
            ? t('myinquiries.host_title')
            : t('myinquiries.title')}
        </Text>
        <Text style={styles.subtitle}>
          {isHostMode
            ? t('myinquiries.host_subtitle')
            : t('myinquiries.subtitle')}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState
          title={isHostMode ? t('myinquiries.host_empty') : t('myinquiries.empty')}
          body={
            isHostMode
              ? t('myinquiries.host_empty_body')
              : t('myinquiries.empty_body')
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            // Other party = whichever role isn't me.
            const other = isHostMode ? item.starter : item.host;
            const otherName = other
              ? pickLocalized(
                  other.full_name ?? '',
                  other.full_name_en,
                  locale,
                ) || '—'
              : '—';
            const listingTitle = item.listing
              ? pickLocalized(
                  item.listing.title_ar ?? '',
                  item.listing.title_en,
                  locale,
                )
              : '';
            return (
              <InboxRow
                onPress={() => router.push(`/inquiries/${item.id}` as never)}
                leading={
                  <UserAvatar
                    avatarUrl={other?.avatar_url ?? null}
                    displayName={otherName}
                    size={44}
                  />
                }
                title={otherName}
                pill={<StatusPill kind="inquiry" status={item.status} />}
                latestMessage={item.latest_message ?? null}
                trailing={
                  <Text style={styles.rowMeta}>
                    {item.last_message_at
                      ? formatRelativeStamp(item.last_message_at, locale, t)
                      : t('myinquiries.no_messages_yet')}
                  </Text>
                }
              >
                {listingTitle ? (
                  <Text style={styles.rowListing} numberOfLines={1}>
                    {listingTitle}
                  </Text>
                ) : null}
              </InboxRow>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  backLink: { paddingVertical: spacing.xs },
  backText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  error: {
    paddingHorizontal: spacing.lg,
    color: colors.terracotta,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  rowListing: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
});

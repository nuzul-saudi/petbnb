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
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

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
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {isHostMode
              ? t('myinquiries.host_empty')
              : t('myinquiries.empty')}
          </Text>
          <Text style={styles.emptyBody}>
            {isHostMode
              ? t('myinquiries.host_empty_body')
              : t('myinquiries.empty_body')}
          </Text>
        </View>
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
              <Pressable
                onPress={() =>
                  router.push(`/inquiries/${item.id}` as never)
                }
                style={styles.row}
              >
                <View style={styles.rowAvatar}>
                  <UserAvatar
                    avatarUrl={other?.avatar_url ?? null}
                    displayName={otherName}
                    size={44}
                  />
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {otherName}
                    </Text>
                    <StatusPill status={item.status} />
                  </View>
                  {listingTitle ? (
                    <Text style={styles.rowListing} numberOfLines={1}>
                      {listingTitle}
                    </Text>
                  ) : null}
                  {/* 2026-06-29 — preview line. Branches off the
                      one-row latest_message embed on the inquiry:
                        deleted_at !== null \xe2\x86\x92 italic muted "(Message
                                                  deleted)"
                        body !== null      \xe2\x86\x92 first line of body
                        no message at all  \xe2\x86\x92 italic muted "(No
                                                  messages yet)"
                      Single-line truncated. Status pill above is
                      unchanged (Open/Converted, separate concern). */}
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
                  <Text style={styles.rowMeta}>
                    {item.last_message_at
                      ? formatRelativeStamp(item.last_message_at, locale, t)
                      : t('myinquiries.no_messages_yet')}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: Enums<'inquiry_status'> }) {
  const { t } = useTranslation();
  // Visual taxonomy: open=active (gold), converted=resolved positively
  // (moss), closed=archived (whisper, low-contrast).
  const bg =
    status === 'open'
      ? colors.gold
      : status === 'converted'
        ? colors.moss
        : colors.whisper;
  const fg = status === 'closed' ? colors.inkSoft : colors.cream;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>
        {t(`inquiry.status_${status}_pill`)}
      </Text>
    </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  rowAvatar: {
    width: 44,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
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
  // 2026-06-29 — inbox preview line. Shows the latest message body,
  // or italic-muted "(Message deleted)" / "(No messages yet)" when
  // the thread has no live content. Sits between listing title and
  // the relative-time meta line; truncated to single line.
  rowPreview: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  rowPreviewMuted: {
    color: colors.inkSoft,
    fontStyle: 'italic',
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
});

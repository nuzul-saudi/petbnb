// 0044 (2026-06-28) — admin conversation detail (read-only).
//
// Shows the full message history of one thread (either inquiry-
// or booking-scoped). No compose, no send, no edit. Soft-deleted
// messages render the "message deleted" placeholder — admin sees
// the same view a participant would; the body is unrecoverable
// from the row (founder decision).
//
// The path is /admin/conversations/[kind]/[id] where [kind] is
// 'inquiry' or 'booking' and [id] is the thread's UUID.

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

import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/lib/auth';
import {
  getAdminConversation,
  type AdminConversationDetail,
  type AdminThreadKind,
} from '@/lib/admin';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function AdminConversationDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { profile } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind =
    params.kind === 'inquiry' || params.kind === 'booking'
      ? (params.kind as AdminThreadKind)
      : null;
  const id = typeof params.id === 'string' ? params.id : '';

  const [convo, setConvo] = useState<AdminConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!kind || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminConversation(kind, id);
      setConvo(data);
    } catch (e) {
      logWarn('[admin.conversation.load_failed]', e);
      setError(t('admin.conversations.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [kind, id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profile) return <SafeAreaView style={styles.safe} />;
  // Cast — Expo Router's typed-route union hasn't picked up the new
  // /admin/conversations route yet (it's generated from file paths on
  // build). Same pattern as the other admin/* router.push casts.
  if (!kind || !id)
    return <Redirect href={'/admin/conversations' as never} />;

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/admin/conversations' as never)}
          style={styles.backLink}
        >
          <Text style={styles.backText}>{t('admin.conversations.back')}</Text>
        </Pressable>
        <Text style={styles.title}>
          {convo?.listing_title ?? t('admin.conversations.title')}
        </Text>
      </View>

      {convo ? (
        <View style={styles.metaCard}>
          <Text style={styles.metaText}>
            {t(
              kind === 'inquiry'
                ? 'admin.conversations.kind_inquiry'
                : 'admin.conversations.kind_booking',
            )}
          </Text>
          <Text style={styles.metaText}>
            {convo.participant_a_name ?? '—'}
            {' ↔ '}
            {convo.participant_b_name ?? '—'}
          </Text>
          <Text style={styles.readOnlyBanner}>
            {t('admin.conversations.read_only_banner')}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.conversations.loading')}</Text>
        </View>
      ) : convo && convo.messages.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {t('admin.conversations.detail_empty')}
          </Text>
        </View>
      ) : convo ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {convo.messages.map((m) => {
            // 0044 — body is null when deleted_at is set. Render
            // the placeholder rather than blank text. Admin sees
            // the same shape any participant would.
            const isDeleted = m.deleted_at !== null || m.body === null;
            return (
              <View key={m.id} style={styles.bubble}>
                <Text style={styles.bubbleSender}>
                  {m.sender_name ?? '—'}
                </Text>
                <Text
                  style={[
                    styles.bubbleBody,
                    isDeleted && styles.bubbleBodyDeleted,
                  ]}
                >
                  {isDeleted
                    ? t('admin.conversations.message_deleted_placeholder')
                    : m.body}
                </Text>
                <Text style={styles.bubbleTimestamp}>{m.created_at}</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </SafeAreaView>
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
    fontSize: 18,
    color: colors.mossDeep,
  },
  metaCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.whisper,
    gap: spacing.xs,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  readOnlyBanner: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.terracotta,
    marginTop: spacing.xs,
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
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  bubble: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  bubbleSender: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mossDeep,
  },
  bubbleBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  bubbleBodyDeleted: {
    fontStyle: 'italic',
    color: colors.inkSoft,
  },
  bubbleTimestamp: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
});

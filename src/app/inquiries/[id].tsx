// Pre-booking inquiry compose route (Round 5b / Step 9.5, commit 2).
//
// Dedicated route choice (over a modal) — better deep-link UX,
// refresh-safe, browser history works. The plan's §5b recommendation.
//
// Layout: a thin header (other party's avatar + name + the listing
// title as context) then the existing MessagesSection from the
// booking-thread world, wired against the inquiry's messages.
//
// Anti-leakage discipline (CLAUDE.md §11): every send — including
// the very first opening message — runs containsContactInfo() and
// surfaces the soft-nudge confirm dialog. Pre-booking is the
// highest-risk commission-leak surface, so the regex MUST run
// before the first message reaches the host.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
// 0043 — Button import dropped; was used only by the (now-removed) Close button.
import { MessagesSection } from '@/components/bookings/MessagesSection';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/lib/auth';
import { confirmDialog } from '@/lib/confirm';
import { pickLocalized } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import {
  // 0043 (2026-06-28) — closeInquiry removed; archive is no longer
  // a product affordance. Inquiry threads stay open forever; the
  // only valid terminal status remains 'converted' (inquiry became
  // a booking).
  containsContactInfo,
  getInquiry,
  listInquiryMessages,
  sendInquiryMessage,
  type InquiryDetail,
} from '@/lib/inquiries';
import { logWarn } from '@/lib/log';
import { deleteMessage, markThreadRead, type Message } from '@/lib/messages';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function InquiryThreadScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 0043 — `closing` state + setter dropped along with the Close button.

  const loadInquiry = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getInquiry(id);
      if (!row) {
        setError(t('inquiry.not_found'));
        setInquiry(null);
      } else {
        setInquiry(row);
      }
    } catch (e) {
      logWarn('[inquiry.load_failed]', e);
      setError(t('inquiry.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  const refetchMessages = useCallback(async () => {
    if (!id) return;
    setMessagesLoading(true);
    try {
      const rows = await listInquiryMessages(id);
      setMessages(rows);
    } catch (e) {
      logWarn('[inquiry.messages_load_failed]', e);
    } finally {
      setMessagesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadInquiry();
  }, [loadInquiry]);

  // useFocusEffect refetch mirrors the booking-thread MVP behavior
  // (Round 5). Realtime subscriptions on inquiry messages are
  // documented as out-of-scope for Round 5b in the plan doc.
  useFocusEffect(
    useCallback(() => {
      void refetchMessages();
      // Phase 1 (2026-06-28) — mark the inquiry thread read on
      // every screen focus. Same pattern as bookings/[id].tsx.
      // markThreadRead swallows errors internally.
      if (id) void markThreadRead('inquiry', id);
    }, [refetchMessages, id]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user)
    return (
      <Redirect
        href={`/sign-in?returnTo=${encodeURIComponent(`/inquiries/${id}`)}`}
      />
    );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !inquiry) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t('inquiry.not_found')}</Text>
          {/* @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes. */}
          <Pressable onPress={() => router.replace('/inquiries')} style={styles.backButton}>
            <Text style={styles.backText}>{t('inquiry.back_to_inbox')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Identify the OTHER party for the header. Inquiry has two roles
  // (starter, host); we render whichever one isn't the viewer.
  const isStarter = user.id === inquiry.starter_id;
  const other = isStarter ? inquiry.host : inquiry.starter;
  const otherName = other
    ? pickLocalized(other.full_name ?? '', other.full_name_en, locale) || '—'
    : '—';
  const listingTitle = inquiry.listing
    ? pickLocalized(
        inquiry.listing.title_ar ?? '',
        inquiry.listing.title_en,
        locale,
      )
    : '';

  // RLS blocks new INSERTs on inquiries whose status isn't 'open'
  // (the messages_insert_participants policy's inquiry branch).
  // canSend mirrors that at the UI layer so the compose bar hides
  // for terminal threads.
  const canSend = inquiry.status === 'open';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Back-to-inbox link */}
        {/* @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes. */}
        <Pressable onPress={() => router.replace('/inquiries')} style={styles.backLink}>
          <Text style={styles.backText}>{t('inquiry.back_to_inbox')}</Text>
        </Pressable>

        {/* Thread header — other party + listing context */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <UserAvatar
              avatarUrl={other?.avatar_url ?? null}
              displayName={otherName}
              size={56}
            />
            <View style={styles.headerText}>
              <Text style={styles.headerName} numberOfLines={1}>
                {otherName}
              </Text>
              {listingTitle ? (
                <Pressable
                  onPress={() =>
                    inquiry.listing
                      ? router.push(`/listings/${inquiry.listing.id}`)
                      : null
                  }
                >
                  <Text style={styles.headerListing} numberOfLines={1}>
                    {listingTitle}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Status banner for terminal threads */}
          {inquiry.status !== 'open' ? (
            <View style={styles.statusBanner}>
              <Text style={styles.statusBannerText}>
                {inquiry.status === 'converted'
                  ? t('inquiry.status_converted')
                  : t('inquiry.status_closed')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Messages thread + compose. Reused presentational component
            from the booking-thread world; only the onSend handler
            differs (writes inquiry_id instead of booking_id). */}
        <MessagesSection
          messages={messages}
          loading={messagesLoading}
          currentUserId={user.id}
          locale={locale}
          canSend={canSend}
          onSend={async (body) => {
            // Anti-leakage soft nudge — runs on EVERY send including
            // the first/opening message. CLAUDE.md §11 flags pre-
            // booking as the highest-risk commission-leak surface.
            if (containsContactInfo(body)) {
              const ok = await confirmDialog(t('messages.contact_warning'));
              if (!ok) return;
            }
            await sendInquiryMessage(inquiry.id, body);
            await refetchMessages();
          }}
          // Phase 1 (2026-06-28) — same pattern as bookings/[id].tsx.
          // Starter is one participant; host is the other. The 0044
          // read-tracking columns on inquiries split by role.
          otherLastOpenedAt={
            inquiry.starter_id === user.id
              ? inquiry.host_last_opened_at
              : inquiry.starter_last_opened_at
          }
          onDelete={async (messageId) => {
            const ok = await confirmDialog(t('messages.delete_confirm'));
            if (!ok) return;
            const deleted = await deleteMessage(messageId);
            await refetchMessages();
            if (!deleted) {
              // Inherent read/delete race ack \xe2\x80\x94 see the parallel
              // comment in bookings/[id].tsx for the rationale.
              await confirmDialog(t('messages.delete_blocked'));
            }
          }}
          t={t}
        />

        {/* 0043 (2026-06-28) — Close (archive) affordance removed.
            Inquiry threads stay open forever; the only terminal
            status is 'converted' (inquiry became a booking). The
            corresponding DB trigger in 0043 rejects any new
            open → closed transition, so attempting to call
            closeInquiry from anywhere would now raise. */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.terracotta,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
  },
  headerCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  headerName: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
  },
  headerListing: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  statusBanner: {
    backgroundColor: colors.whisper,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusBannerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
  },
  // 0043 — closeWrap style dropped along with the Close button.
});

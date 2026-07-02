// Comprehensive host↔owner conversation timeline
// (0046 Part B, 2026-07-01).
//
// This screen now merges the inquiry's pre-booking messages with
// every booking that originated from it into ONE chronological
// timeline. Messages stay physically in their own threads (0040
// XOR); the merge is query + display only. See
// docs/migration-0046-beta-thread-continuity-plan.md.
//
// Round 5b history: this route was originally an inquiry-only
// compose. Part B keeps the anti-leakage discipline
// (containsContactInfo on every send, per CLAUDE.md §11) and adds:
//   * block-grouped timeline (conversation blocks + booking blocks)
//   * smart compose router (open booking → booking; else inquiry)
//   * per-message delete-until-read resolved against THIS message's
//     own thread's other-party stamp (inquiry vs booking)
//   * mark_thread_read on focus for the inquiry AND every linked
//     booking, so 0044 read-tracking stays correct across the merge

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/lib/auth';
import { confirmDialog } from '@/lib/confirm';
import { formatDateRange, formatDate } from '@/lib/date';
import { formatRiyadhStamp, formatSAR, pickLocalized } from '@/lib/format';
import { useTranslation, type Locale } from '@/lib/i18n';
import {
  containsContactInfo,
  getInquiry,
  sendInquiryMessage,
  type InquiryDetail,
} from '@/lib/inquiries';
import {
  buildTimelineBlocks,
  fetchInquiryTimelineRaw,
  pickComposeTarget,
  resolveOtherLastOpenedAt,
  type InquiryTimelineRaw,
  type LifecycleEvent,
  type TimelineBlock,
  type TimelineBooking,
  type TimelineItem,
} from '@/lib/inquiry-timeline';
import { logWarn } from '@/lib/log';
import {
  deleteMessage,
  markThreadRead,
  sendMessage,
  type Message,
} from '@/lib/messages';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function InquiryThreadScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  // 0046 Part B — the merged timeline state. rawTimeline is what
  // fetchInquiryTimelineRaw returns (inquiry msgs + linked bookings +
  // booking msgs); blocks is the result of the pure buildTimelineBlocks
  // walk on that raw. Kept as separate state so effects can react to
  // raw (for smart-routing / delete-resolver), the render iterates over
  // blocks.
  const [rawTimeline, setRawTimeline] = useState<InquiryTimelineRaw>({
    inquiryMessages: [],
    bookings: [],
    bookingMessages: [],
  });
  const [blocks, setBlocks] = useState<TimelineBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Compose state — moved out of the (now-removed) MessagesSection.
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  const refetchTimeline = useCallback(async () => {
    if (!id) return;
    setTimelineLoading(true);
    try {
      const raw = await fetchInquiryTimelineRaw(id);
      setRawTimeline(raw);
      setBlocks(buildTimelineBlocks(raw, id));
      // 0046 Part B — mark every visible thread read on load. The
      // inquiry itself + one call per linked booking. Fire-and-forget;
      // markThreadRead swallows errors internally so a failed RPC
      // never blocks the render.
      void markThreadRead('inquiry', id);
      for (const b of raw.bookings) {
        void markThreadRead('booking', b.id);
      }
    } catch (e) {
      logWarn('[inquiry.timeline_load_failed]', e);
    } finally {
      setTimelineLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadInquiry();
  }, [loadInquiry]);

  useFocusEffect(
    useCallback(() => {
      void refetchTimeline();
    }, [refetchTimeline]),
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

          {/* 0046 (Part A) — Request booking CTA. Only the starter
              (the owner-side participant who opened the inquiry) can
              book; the host can't book their own listing. Routes to
              the request flow with ?inquiryId threaded so
              createBookingRequest persists bookings.inquiry_id and
              the comprehensive timeline (Part B) can link the
              new booking back into this inquiry's history. */}
          {inquiry.listing && inquiry.starter_id === user.id ? (
            <View style={styles.requestCtaWrap}>
              <Button
                label={t('inquiry.request_booking_cta')}
                onPress={() => {
                  router.push(
                    `/listings/${inquiry.listing!.id}/request?inquiryId=${inquiry.id}` as never,
                  );
                }}
                variant="primary"
                fullWidth
              />
            </View>
          ) : null}
        </View>

        {/* 0046 Part B — comprehensive timeline: block-grouped
            merge of the inquiry's messages with every linked
            booking's messages + lifecycle events. Each block is
            self-contained; per-message delete-until-read resolves
            against ITS own thread's other-party stamp (not one
            stamp for the whole merged list). */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineHeading}>
            {t('messages.section_title')}
          </Text>
          {timelineLoading && blocks.length === 0 ? (
            <Text style={styles.muted}>{t('common.loading')}</Text>
          ) : blocks.length === 0 ? (
            <Text style={styles.muted}>{t('messages.empty')}</Text>
          ) : (
            <View style={styles.timelineList}>
              {blocks.map((block) => (
                <TimelineBlockView
                  key={block.key}
                  block={block}
                  viewerId={user.id}
                  inquiry={inquiry}
                  bookings={rawTimeline.bookings}
                  locale={locale}
                  t={t}
                  onListingPress={
                    inquiry.listing
                      ? (listingId) => router.push(`/listings/${listingId}`)
                      : undefined
                  }
                  onDelete={async (messageId) => {
                    const ok = await confirmDialog(
                      t('messages.delete_confirm'),
                    );
                    if (!ok) return;
                    const deleted = await deleteMessage(messageId);
                    await refetchTimeline();
                    if (!deleted) {
                      // Inherent read/delete race ack — see the
                      // parallel comment in bookings/[id].tsx.
                      await confirmDialog(t('messages.delete_blocked'));
                    }
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Compose bar — smart routing. Single input; on send the
          target is picked at that instant via pickComposeTarget:
          most-recent OPEN booking (requested/accepted/active/disputed)
          if any exist, else the inquiry. Message physically lands in
          whichever thread it's routed to (booking_id XOR inquiry_id
          per 0040), so the block walker will place it correctly on
          the next refetch. */}
      {canSend ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.composeBar}>
            {sendError ? (
              <Text style={styles.sendError}>{sendError}</Text>
            ) : null}
            <View style={styles.composeRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('messages.placeholder')}
                placeholderTextColor={colors.inkSoft}
                style={styles.composeInput}
                multiline
                editable={!sending}
              />
              <Pressable
                onPress={async () => {
                  const body = draft.trim();
                  if (!body || sending) return;
                  setSendError(null);
                  setSending(true);
                  try {
                    if (containsContactInfo(body)) {
                      const ok = await confirmDialog(
                        t('messages.contact_warning'),
                      );
                      if (!ok) {
                        setSending(false);
                        return;
                      }
                    }
                    const target = pickComposeTarget(
                      rawTimeline.bookings,
                      inquiry.id,
                    );
                    if (target.kind === 'inquiry') {
                      await sendInquiryMessage(target.id, body);
                    } else {
                      await sendMessage(target.id, body);
                    }
                    setDraft('');
                    await refetchTimeline();
                  } catch (e) {
                    logWarn('[inquiry.timeline_send_failed]', e);
                    setSendError(t('messages.send_failed'));
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={!draft.trim() || sending}
                style={[
                  styles.sendButton,
                  (!draft.trim() || sending) && styles.sendButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('messages.send')}
              >
                <Text style={styles.sendButtonText}>
                  {t('messages.send')}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------------
// Timeline renderers (inline — reused only by this screen; no new
// public component per the "no new component unless needed" spec).
// -----------------------------------------------------------------------------

type TimelineBlockViewProps = {
  block: TimelineBlock;
  viewerId: string;
  inquiry: InquiryDetail;
  bookings: TimelineBooking[];
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onListingPress?: (listingId: string) => void;
  onDelete: (messageId: string) => Promise<void>;
};

function TimelineBlockView(props: TimelineBlockViewProps) {
  const { block, locale, t } = props;
  if (block.kind === 'conversation') {
    return (
      <View style={styles.conversationBlock}>
        {block.items.map((it) => (
          <TimelineItemView key={itemKey(it)} item={it} {...props} />
        ))}
      </View>
    );
  }
  // booking block
  return (
    <View style={styles.bookingBlock}>
      <RichBookingPlacedDivider booking={block.booking} locale={locale} t={t} />
      {block.items
        // The placed event is already rendered as the rich header
        // above; skip it in the interleaved items.
        .filter(
          (it) => !(it.kind === 'event' && it.event.type === 'placed'),
        )
        .map((it) => (
          <TimelineItemView key={itemKey(it)} item={it} {...props} />
        ))}
    </View>
  );
}

function itemKey(it: TimelineItem): string {
  return it.kind === 'message'
    ? `msg-${it.message.id}`
    : `evt-${it.event.type}-${it.event.bookingId}-${it.event.at}`;
}

type TimelineItemViewProps = Omit<TimelineBlockViewProps, 'block'> & {
  item: TimelineItem;
};

function TimelineItemView(props: TimelineItemViewProps) {
  const { item, viewerId, inquiry, bookings, locale, t, onDelete } = props;
  if (item.kind === 'event') {
    return <SlimEventDivider event={item.event} locale={locale} t={t} />;
  }
  // Message row — compute deletability against ITS own thread.
  const m = item.message;
  const own = m.sender_id === viewerId;
  const isDeleted = m.deleted_at != null || m.body == null;
  const otherStamp = resolveOtherLastOpenedAt(
    m,
    viewerId,
    inquiry,
    bookings,
  );
  const deletable =
    own &&
    m.deleted_at == null &&
    (otherStamp == null || new Date(otherStamp) < new Date(m.created_at));
  return (
    <MessageBubble
      message={m}
      own={own}
      isDeleted={isDeleted}
      deletable={deletable}
      locale={locale}
      onDelete={onDelete}
      t={t}
    />
  );
}

function RichBookingPlacedDivider({
  booking,
  locale,
  t,
}: {
  booking: TimelineBooking;
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const dates = formatDateRange(booking.start_date, booking.end_date, locale);
  const petCount = booking.pets.length;
  const petsLabel =
    petCount === 1
      ? booking.pets[0].name
      : petCount === 2
        ? t('inquiry.timeline_placed_pets_count_two')
        : t('inquiry.timeline_placed_pets_count_many', { count: petCount });
  return (
    <View style={styles.dividerRich}>
      <View style={styles.dividerLine} />
      <View style={styles.dividerRichContent}>
        <Text style={styles.dividerRichTitle}>
          {t('inquiry.timeline_event_placed')}
        </Text>
        <Text style={styles.dividerRichMeta}>
          {dates}
          {petsLabel ? ` · ${petsLabel}` : ''}
          {' · '}
          {formatSAR(booking.total_sar)}
        </Text>
        <Text style={styles.dividerRichSubmeta}>
          {formatRiyadhStamp(booking.created_at, locale)}
        </Text>
      </View>
      <View style={styles.dividerLine} />
    </View>
  );
}

function SlimEventDivider({
  event,
  locale,
  t,
}: {
  event: LifecycleEvent;
  locale: Locale;
  t: (key: string) => string;
}) {
  // Terminal-negative events (declined, cancelled, disputed) get a
  // terracotta tint to differentiate from neutral-positive ones
  // (accepted, active, completed).
  const isNegative =
    event.type === 'declined' ||
    event.type === 'cancelled' ||
    event.type === 'disputed';
  const label = t(`inquiry.timeline_event_${event.type}`);
  return (
    <View style={styles.dividerSlim}>
      <View
        style={[
          styles.dividerLine,
          isNegative && styles.dividerLineNegative,
        ]}
      />
      <Text
        style={[
          styles.dividerSlimText,
          isNegative && styles.dividerSlimTextNegative,
        ]}
      >
        {label} · {formatDate(event.at.slice(0, 10), locale, 'short')}
      </Text>
      <View
        style={[
          styles.dividerLine,
          isNegative && styles.dividerLineNegative,
        ]}
      />
    </View>
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
  // 0046 (Part A) — Request booking CTA wrapper. Sits between the
  // status banner and the messages list; vertical spacing matches
  // the rest of the headerCard's gap.
  requestCtaWrap: {
    marginTop: spacing.md,
  },

  // 0046 Part B — timeline section (block-grouped merge).
  timelineSection: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  timelineHeading: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
  },
  timelineList: {
    gap: spacing.lg,
  },

  // Conversation block — inquiry-scoped messages, tight vertical
  // stack. No card chrome; the block just holds bubbles.
  conversationBlock: {
    gap: spacing.md,
  },

  // Booking block — visually grouped run for one linked booking.
  // Subtle whisper border + tinted background so it reads as a
  // bounded region distinct from surrounding conversation blocks.
  bookingBlock: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.cream,
  },

  // Dividers.
  dividerRich: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerRichContent: {
    flexShrink: 1,
    gap: 2,
    alignItems: 'center',
  },
  dividerRichTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mossDeep,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dividerRichMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  dividerRichSubmeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
  },
  dividerSlim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 2,
  },
  dividerSlimText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  dividerSlimTextNegative: {
    color: colors.terracotta,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.whisper,
  },
  dividerLineNegative: {
    backgroundColor: colors.rose,
  },

  // Compose bar — pinned outside the ScrollView so the timeline
  // scrolls independently.
  composeBar: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
    backgroundColor: colors.paper,
    gap: spacing.xs,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  composeInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  sendButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
  sendError: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.terracotta,
    paddingHorizontal: spacing.xs,
  },
});

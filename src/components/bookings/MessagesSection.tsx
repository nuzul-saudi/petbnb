// MessagesSection — chat UI on the booking detail screen. Renders the
// message history + compose bar; parent owns state + handlers + the
// useFocusEffect refetch.
//
// Realtime caveat (MVP behavior, documented in batch-decisions):
// without Supabase Realtime, the other party won't see a new message
// until they next focus the screen. The parent calls refetch() on
// useFocusEffect specifically to make "navigate away + back" the
// implicit "pull-to-refresh" gesture. Wiring Realtime is a follow-up.
//
// Anti-leakage contact-info nudge: the parent decides whether to call
// onSend immediately or to show a confirm dialog first based on
// containsContactInfo(body) — this component stays presentational.

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { pickLocalized, formatRiyadhStamp } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import type { Message } from '@/lib/messages';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type MessagesSectionProps = {
  messages: Message[];
  loading: boolean;
  currentUserId: string;
  locale: Locale;
  /** When false, the compose bar is hidden and a hint shows in its
   *  place. Used for declined / cancelled / disputed bookings. */
  canSend: boolean;
  /** Called by the Send button. May be async; component awaits it.
   *  Throwing causes the inline error to surface; otherwise the input
   *  is cleared on resolution. */
  onSend: (body: string) => Promise<void>;
  /**
   * Phase 1 (2026-06-28) — the OTHER participant's last_opened_at for
   * this thread. Drives the "delete only until read" affordance: a
   * message is deletable iff this stamp is null (they've never opened
   * the thread) OR strictly earlier than the message's created_at.
   * Mirrors the 0044 messages_update_own_until_read RLS predicate.
   * Parent computes the right side: bookings.host_last_opened_at when
   * the user is the owner, bookings.owner_last_opened_at when the user
   * is the host (and starter_/host_ symmetrically on inquiries).
   */
  otherLastOpenedAt: string | null;
  /**
   * Phase 1 (2026-06-28) — soft-delete handler. The component renders
   * a delete affordance on own-bubbles that are still deletable; on
   * press the parent owns the confirm dialog + the deleteMessage call
   * + the refetch + the "already read" ack (same shape as onSend
   * today). Component stays presentational. Omit the prop to disable
   * the affordance entirely.
   */
  onDelete?: (messageId: string) => Promise<void>;
  t: (key: string) => string;
};

export function MessagesSection({
  messages,
  loading,
  currentUserId,
  locale,
  canSend,
  onSend,
  otherLastOpenedAt,
  onDelete,
  t,
}: MessagesSectionProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setError(null);
    setSending(true);
    try {
      await onSend(body);
      setDraft('');
    } catch {
      setError(t('messages.send_failed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t('messages.section_title')}</Text>

      {/* Message thread */}
      {loading && messages.length === 0 ? (
        <Text style={styles.muted}>{t('common.loading')}</Text>
      ) : messages.length === 0 ? (
        <Text style={styles.muted}>{t('messages.empty')}</Text>
      ) : (
        <View style={styles.thread}>
          {messages.map((m) => {
            const own = m.sender_id === currentUserId;
            const senderName = m.sender
              ? pickLocalized(
                  m.sender.full_name ?? '',
                  m.sender.full_name_en,
                  locale,
                )
              : '—';
            // Phase 1 (2026-06-28) — soft-delete state. 0044's
            // guard_message_update nulls body on the same UPDATE that
            // sets deleted_at, so EITHER signal alone is sufficient —
            // checking both is defense-in-depth for any future surface
            // (e.g. a debug client) that might leave one set without
            // the other.
            const isDeleted = m.deleted_at != null || m.body == null;
            // Phase 1 (2026-06-28) — deletable predicate mirrors the
            // 0044 messages_update_own_until_read RLS USING clause:
            // own message + not already deleted + parent supplied an
            // onDelete handler + (other party never opened the thread
            // OR opened it before this message landed).
            // Date-object comparison per spec — string compare on ISO
            // timestamps would technically work for same-zone values
            // but the explicit Date conversion documents intent.
            const deletable =
              own &&
              m.deleted_at == null &&
              onDelete != null &&
              (otherLastOpenedAt == null ||
                new Date(otherLastOpenedAt) < new Date(m.created_at));
            return (
              <View
                key={m.id}
                style={[styles.row, own ? styles.rowOwn : styles.rowOther]}
              >
                {/* Other party gets an avatar + name above the bubble.
                    Own messages are anchored to the trailing edge. */}
                {!own ? (
                  <UserAvatar
                    avatarUrl={m.sender?.avatar_url}
                    displayName={senderName}
                    size={32}
                  />
                ) : null}
                <View style={styles.bubbleColumn}>
                  {!own ? (
                    <Text style={styles.senderName} numberOfLines={1}>
                      {senderName}
                    </Text>
                  ) : null}
                  <View
                    style={[
                      styles.bubble,
                      own ? styles.bubbleOwn : styles.bubbleOther,
                      // 2026-06-29 — deleted bubbles read neutral
                      // regardless of sender. Without this override
                      // an own-deleted bubble kept the bright moss
                      // background while only the text went italic-
                      // muted, reading as "half-deleted." Last entry
                      // in the array so it wins on bg + corner
                      // conflicts.
                      isDeleted && styles.bubbleDeleted,
                    ]}
                  >
                    {isDeleted ? (
                      /* Phase 1 (2026-06-28) — deleted placeholder.
                         Mirrors the admin browse's italic + muted
                         treatment. Applies to BOTH own and other
                         bubbles \xe2\x80\x94 once deleted, the body is gone
                         for everyone. */
                      <Text
                        style={[
                          styles.bubbleText,
                          styles.bubbleTextDeleted,
                        ]}
                      >
                        {t('messages.deleted')}
                      </Text>
                    ) : (
                      <Text
                        style={[
                          styles.bubbleText,
                          own
                            ? styles.bubbleTextOwn
                            : styles.bubbleTextOther,
                        ]}
                      >
                        {m.body}
                      </Text>
                    )}
                  </View>
                  <View style={styles.bubbleFooter}>
                    <Text style={styles.stamp}>
                      {formatRiyadhStamp(m.created_at, locale)}
                    </Text>
                    {/* Phase 1 (2026-06-28) \xe2\x80\x94 delete affordance. Text
                        link (NOT emoji), matches the design system per
                        the L3 emoji-removal precedent. Parent owns the
                        confirm + RLS-result handling. */}
                    {deletable ? (
                      <Pressable
                        onPress={() => {
                          void onDelete!(m.id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('messages.delete')}
                        style={styles.deleteLink}
                      >
                        <Text style={styles.deleteLinkText}>
                          {t('messages.delete')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Compose */}
      {canSend ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
              onPress={handleSend}
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
        </KeyboardAvoidingView>
      ) : (
        <Text style={styles.muted}>{t('messages.compose_hidden_hint')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  heading: {
    // Matched to OwnerPetsSection's 20 — uniform section-heading
    // weight across the booking detail page.
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  thread: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: '78%',
    gap: 2,
  },
  senderName: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.inkSoft,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  bubbleOwn: {
    backgroundColor: colors.moss,
    borderTopEndRadius: radii.sm,
  },
  bubbleOther: {
    backgroundColor: colors.whisper,
    borderTopStartRadius: radii.sm,
  },
  // 2026-06-29 — neutral container for deleted messages. Matches
  // the admin browse's deleted-message rendering. Whisper bg +
  // symmetric corners (resets the asymmetric speech-bubble corners
  // on bubbleOwn / bubbleOther) so the bubble reads as "retracted"
  // not "still a message bubble." Pairs with bubbleTextDeleted on
  // the inner Text.
  bubbleDeleted: {
    backgroundColor: colors.whisper,
    borderTopEndRadius: radii.lg,
    borderTopStartRadius: radii.lg,
  },
  bubbleText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: colors.cream,
  },
  bubbleTextOther: {
    color: colors.ink,
  },
  // Phase 1 (2026-06-28) — deleted-message placeholder styling.
  // Italic + muted. Same intent as the admin browse's deleted
  // bubble treatment so the visual language is consistent.
  bubbleTextDeleted: {
    color: colors.inkSoft,
    fontStyle: 'italic',
  },
  // Phase 1 (2026-06-28) — bubble footer holds the timestamp AND
  // (conditionally) the delete link, on the same row, separated by
  // a flex spacer so the timestamp stays leading-aligned and the
  // delete link sits at the trailing edge of the bubble column.
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  deleteLink: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  deleteLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  stamp: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 2,
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
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.terracotta,
    marginBottom: spacing.xs,
  },
});

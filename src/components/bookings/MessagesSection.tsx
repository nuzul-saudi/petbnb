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

// 0046 Part B (2026-07-01) — bubble rendering extracted to
// src/components/messaging/MessageBubble so the inquiry-timeline
// screen can reuse it. This file keeps its external API unchanged;
// the internal .map now delegates the per-row JSX to the bubble
// component. UserAvatar / formatRiyadhStamp / pickLocalized moved
// into the bubble file.
import { MessageBubble } from '@/components/messaging/MessageBubble';
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
            // Phase 1 (2026-06-28) - soft-delete state. 0044 nulls
            // body on the same UPDATE that sets deleted_at, so
            // either signal alone is sufficient.
            const isDeleted = m.deleted_at != null || m.body == null;
            // Phase 1 (2026-06-28) - deletable predicate mirrors
            // 0044 messages_update_own_until_read. Single-thread
            // otherLastOpenedAt shape (this component API); the
            // 0046 inquiry timeline resolves per-message upstream
            // and passes its own bubbles in directly, bypassing
            // this codepath.
            const deletable =
              own &&
              m.deleted_at == null &&
              onDelete != null &&
              (otherLastOpenedAt == null ||
                new Date(otherLastOpenedAt) < new Date(m.created_at));
            return (
              <MessageBubble
                key={m.id}
                message={m}
                own={own}
                isDeleted={isDeleted}
                deletable={deletable}
                locale={locale}
                onDelete={onDelete}
                t={t}
              />
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
  // 0046 Part B (2026-07-01) — the row/bubble/deleteLink/stamp
  // styles moved into src/components/messaging/MessageBubble.tsx
  // when the bubble was extracted. This component only styles the
  // section chrome (heading, muted empty state, compose bar).
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

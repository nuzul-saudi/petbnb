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
  t: (key: string) => string;
};

export function MessagesSection({
  messages,
  loading,
  currentUserId,
  locale,
  canSend,
  onSend,
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
                    ]}
                  >
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
                  </View>
                  <Text style={styles.stamp}>
                    {formatRiyadhStamp(m.created_at, locale)}
                  </Text>
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

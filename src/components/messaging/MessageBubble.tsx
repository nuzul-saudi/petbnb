// 0046 Part B (2026-07-01) — bubble rendering extracted from
// MessagesSection so the comprehensive inquiry timeline can reuse
// it. The booking detail page's MessagesSection also uses this;
// extracting kept its external API unchanged and avoided
// duplicating the deleted-placeholder + delete-affordance + sender
// avatar/name/footer logic across two surfaces.
//
// Pure presentational. Parent owns:
//   * deletable predicate (single-thread vs per-message resolver)
//   * onDelete handler (confirm + deleteMessage + refetch)
//   * read-tracking (no UI here; bubble doesn't render ticks)

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { formatRiyadhStamp, pickLocalized } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import type { Message } from '@/lib/messages';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type MessageBubbleProps = {
  message: Message;
  /** Sender === current viewer. Controls bubble color + alignment
   *  + whether the delete affordance is even considered. */
  own: boolean;
  /** When true, render the italic-muted "Message deleted"
   *  placeholder instead of the body. Mirrors the admin browse
   *  treatment. */
  isDeleted: boolean;
  /** When true, render a subtle delete text link in the footer.
   *  Parent computes this against the read-tracking predicate
   *  (single-thread for MessagesSection's booking case; per-
   *  message for the timeline). */
  deletable: boolean;
  locale: Locale;
  /** Called on delete tap. Parent owns confirm + deleteMessage +
   *  refetch + the blocked-by-RLS ack. */
  onDelete?: (id: string) => Promise<void> | void;
  t: (key: string) => string;
};

export function MessageBubble({
  message: m,
  own,
  isDeleted,
  deletable,
  locale,
  onDelete,
  t,
}: MessageBubbleProps) {
  const senderName = m.sender
    ? pickLocalized(m.sender.full_name ?? '', m.sender.full_name_en, locale)
    : '—';

  // Phase 4 (0050) — meet & greet lifecycle pills. Rendered centered with
  // a hairline divider so they read as a lifecycle marker in the timeline,
  // not a chat bubble. Keyed on `kind`; the stored body is ignored here.
  //
  // isDeleted is checked FIRST: a soft-deleted MG row (0044 permits a
  // crafted sender delete) falls through to the standard deleted
  // placeholder below rather than rendering a ghost pill.
  if (
    !isDeleted &&
    (m.kind === 'meet_greet_request' || m.kind === 'meet_greet_confirmed')
  ) {
    const confirmed = m.kind === 'meet_greet_confirmed';
    return (
      <View style={styles.mgWrap}>
        <View style={styles.mgDivider} />
        <View
          style={[
            styles.mgPill,
            confirmed ? styles.mgPillConfirmed : styles.mgPillRequest,
          ]}
        >
          <Text style={styles.mgIcon}>{confirmed ? '✓' : '🤝'}</Text>
          <Text style={styles.mgText}>
            {senderName}{' '}
            {t(
              confirmed
                ? 'meet_greet.pill_confirmed'
                : 'meet_greet.pill_request',
            )}
          </Text>
        </View>
        <Text style={styles.mgStamp}>
          {formatRiyadhStamp(m.created_at, locale)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, own ? styles.rowOwn : styles.rowOther]}>
      {/* Other party gets an avatar + name above the bubble. Own
          messages are anchored to the trailing edge. */}
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
            // Deleted bubbles read neutral regardless of sender.
            isDeleted && styles.bubbleDeleted,
          ]}
        >
          {isDeleted ? (
            <Text style={[styles.bubbleText, styles.bubbleTextDeleted]}>
              {t('messages.deleted')}
            </Text>
          ) : (
            <Text
              style={[
                styles.bubbleText,
                own ? styles.bubbleTextOwn : styles.bubbleTextOther,
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
          {deletable && onDelete ? (
            <Pressable
              onPress={() => {
                void onDelete(m.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('messages.delete')}
              style={styles.deleteLink}
            >
              <Text style={styles.deleteLinkText}>{t('messages.delete')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  bubbleTextDeleted: {
    color: colors.inkSoft,
    fontStyle: 'italic',
  },
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
  // Phase 4 — meet & greet lifecycle pill (centered marker).
  mgWrap: {
    alignItems: 'center',
    gap: 4,
    marginVertical: spacing.sm,
  },
  mgDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: colors.whisper,
    marginBottom: spacing.xs,
  },
  mgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  mgPillRequest: {
    backgroundColor: colors.paper,
    borderColor: colors.gold,
  },
  mgPillConfirmed: {
    backgroundColor: colors.cream,
    borderColor: colors.moss,
  },
  mgIcon: {
    fontSize: 13,
  },
  mgText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.ink,
  },
  mgStamp: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkSoft,
  },
});

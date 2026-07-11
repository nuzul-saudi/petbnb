// <InboxRow> — the shared inbox list row (Wave 1b, S1 / 2026-07-11).
//
// /bookings and /inquiries each hand-rolled a Pressable card with the
// same skeleton: an optional leading avatar, a header line (title +
// trailing status pill), a middle block, the SAME message-preview IIFE
// (copied verbatim between the two files), and a trailing line. This
// captures that skeleton once. Screens fill the variable middle via
// `children` and the trailing line via `trailing`, so the two lists
// stay visually consistent without flattening their real differences
// (bookings is listing-led with meta lines + a total; inquiries is
// person-led with an avatar).

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

/** The one-row latest-message embed both inboxes carry. */
export type InboxLatestMessage = {
  body: string | null;
  deleted_at: string | null;
} | null;

export type InboxRowProps = {
  onPress: () => void;
  /** Leading node (e.g. a <UserAvatar>). Omit for a listing-led card. */
  leading?: ReactNode;
  /** Terracotta unread dot before the title. */
  unread?: boolean;
  unreadLabel?: string;
  title: string;
  /** Trailing status pill node (<StatusPill …/>). */
  pill?: ReactNode;
  /** Middle content between the header and the message preview. */
  children?: ReactNode;
  /**
   * When provided (even as null), renders the shared preview line:
   *   deleted_at set → italic-muted "(Message deleted)"
   *   body set       → the body, one line
   *   otherwise      → italic-muted "(No messages yet)"
   * Omit the prop entirely to render no preview.
   */
  latestMessage?: InboxLatestMessage;
  /** Content after the preview (e.g. a total, or a relative timestamp). */
  trailing?: ReactNode;
};

export function InboxRow({
  onPress,
  leading,
  unread,
  unreadLabel,
  title,
  pill,
  children,
  latestMessage,
  trailing,
}: InboxRowProps) {
  const { t } = useTranslation();
  // Passing the prop (even as null) opts into the preview line; omitting
  // it renders no preview.
  const hasPreview = latestMessage !== undefined;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <View style={styles.header}>
          {unread ? (
            <View style={styles.unreadDot} accessibilityLabel={unreadLabel} />
          ) : null}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {pill}
        </View>
        {children}
        {hasPreview ? (
          latestMessage && latestMessage.deleted_at != null ? (
            <Text
              style={[styles.preview, styles.previewMuted]}
              numberOfLines={1}
            >
              {t('messages.preview_deleted')}
            </Text>
          ) : latestMessage && latestMessage.body != null ? (
            <Text style={styles.preview} numberOfLines={1}>
              {latestMessage.body}
            </Text>
          ) : (
            <Text
              style={[styles.preview, styles.previewMuted]}
              numberOfLines={1}
            >
              {t('messages.preview_empty')}
            </Text>
          )
        ) : null}
        {trailing}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  leading: {
    alignSelf: 'flex-start',
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.terracotta,
  },
  title: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  preview: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  previewMuted: {
    color: colors.inkSoft,
    fontStyle: 'italic',
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { formatSAR, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import type { ListingFeedItem } from '@/lib/listings';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type Props = {
  listing: ListingFeedItem;
  onPress: () => void;
};

// Sitter-first listing card (refactored in Step 5.5C from a photo-first
// layout). The sitter is the hero — avatar, name, verified badge, tier,
// gender, neighborhood. The home photo is a secondary strip below.
//
// "جديد" badge is shown unconditionally for now: every visible listing
// has zero completed bookings in MVP, and computing per-card counts via
// countCompletedBookingsForHost() would return 0 across the board anyway
// thanks to the bookings-RLS limitation (see Section 11 of CLAUDE.md and
// the JSDoc on the helper). Once a SECURITY DEFINER count RPC or counter
// cache lands, this card can show real "{N} إقامة • ⭐ {avg}" stats and
// only fall back to "جديد" for genuinely-new hosts.
export function ListingCard({ listing, onPress }: Props) {
  const { t } = useTranslation();

  const host = listing.host;
  const initial = host?.full_name?.trim().charAt(0) ?? '?';
  const genderLabel = t(
    listing.host_gender === 'female' ? 'listing.host_female' : 'listing.host_male',
  );

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {/* Sitter header — the hero of the card */}
      <View style={styles.hostRow}>
        {host?.avatar_url ? (
          <Image
            source={{ uri: host.avatar_url }}
            style={styles.avatar}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}

        <View style={styles.hostText}>
          <View style={styles.nameRow}>
            <Text style={styles.hostName} numberOfLines={1}>
              {host?.full_name ?? '—'}
            </Text>
            <Text style={styles.verifiedMark}>✓</Text>
          </View>

          <View style={styles.metaRow}>
            <TierBadge tier={listing.tier} />
            <Text style={styles.metaText}>
              {genderLabel} • 📍 {listing.neighborhood}
              {listing.distance_km != null
                ? ` · ${t('feed.distance_label', { km: toArabicDigits(listing.distance_km.toFixed(1)) })}`
                : ''}
            </Text>
          </View>

          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>{t('listing.host_new_badge')}</Text>
          </View>
        </View>
      </View>

      {/* Secondary home photo */}
      {listing.cover_photo ? (
        <Image
          source={{ uri: listing.cover_photo }}
          style={styles.photo}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Text style={styles.photoPlaceholderText}>🏠</Text>
        </View>
      )}

      {/* Footer with title + price */}
      <View style={styles.footer}>
        <Text style={styles.title} numberOfLines={2}>
          {listing.title_ar}
        </Text>
        <Text style={styles.price}>
          {formatSAR(listing.nightly_price_sar)}{' '}
          <Text style={styles.priceSuffix}>{t('listing.nightly_suffix')}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

function TierBadge({ tier }: { tier: ListingFeedItem['tier'] }) {
  const { t } = useTranslation();
  const colorStyle =
    tier === 'gold'
      ? styles.tierGold
      : tier === 'silver'
        ? styles.tierSilver
        : styles.tierBronze;
  const label = t(`listing.tier_${tier}`);
  return (
    <View style={[styles.tier, colorStyle]}>
      <Text style={styles.tierText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.whisper,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
  },
  hostText: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hostName: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  verifiedMark: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metaText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  newBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  newBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  photo: {
    width: '100%',
    aspectRatio: 5 / 2,
    backgroundColor: colors.whisper,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 48,
    opacity: 0.4,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  price: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  priceSuffix: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  tier: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  tierBronze: {
    backgroundColor: colors.goldDeep,
  },
  tierSilver: {
    backgroundColor: colors.inkSoft,
  },
  tierGold: {
    backgroundColor: colors.gold,
  },
  tierText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
});

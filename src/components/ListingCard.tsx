import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { findCity, findDistrict } from '@/lib/cities';
import { formatSAR, pickLocalized, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import type { ListingFeedItem } from '@/lib/listings';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type Props = {
  listing: ListingFeedItem;
  onPress: () => void;
  /**
   * Optional opt-in badge replacing the "new" pill in the host text
   * block. The host home (Step 7.1b) passes a two-state active/inactive
   * pill; the owner feed passes nothing → unchanged render. `color` is
   * applied as the pill background, matching newBadge / TierBadge.
   */
  statusBadge?: { label: string; color: string };
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
export function ListingCard({ listing, onPress, statusBadge }: Props) {
  const { t, locale } = useTranslation();

  const host = listing.host;
  const hostName = host
    ? pickLocalized(host.full_name, host.full_name_en, locale)
    : null;
  const initial = hostName?.trim().charAt(0) ?? '?';
  const genderLabel = t(
    listing.host_gender === 'female' ? 'listing.host_female' : 'listing.host_male',
  );

  // 7.2c — city + district display. findDistrict returns undefined for
  // legacy seed rows where neighborhood holds an Arabic string (not a
  // slug from cities.ts); fall back to rendering the raw text so those
  // rows still show their existing label without a data migration.
  // New listings created by 7.2d's form will store slugs and resolve
  // through findDistrict cleanly.
  const cityRecord = findCity(listing.city);
  const cityDisplay = cityRecord
    ? pickLocalized(cityRecord.name_ar, cityRecord.name_en, locale)
    : listing.city;
  const districtRecord = findDistrict(listing.city, listing.neighborhood);
  const districtDisplay = districtRecord
    ? pickLocalized(districtRecord.name_ar, districtRecord.name_en, locale)
    : listing.neighborhood;

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
              {hostName ?? '—'}
            </Text>
            <Text style={styles.verifiedMark}>✓</Text>
          </View>

          <View style={styles.metaRow}>
            <TierBadge tier={listing.tier} />
            <Text style={styles.metaText}>
              {genderLabel} • 📍 {districtDisplay}, {cityDisplay}
              {listing.distance_km != null
                ? ` · ${t('feed.distance_label', { km: toArabicDigits(listing.distance_km.toFixed(1)) })}`
                : ''}
            </Text>
          </View>

          {/* Status badge (host home, 7.1b) takes the slot when supplied;
              otherwise the owner-feed "new" pill renders unchanged. */}
          {statusBadge ? (
            <View
              style={[styles.newBadge, { backgroundColor: statusBadge.color }]}
            >
              <Text style={styles.newBadgeText}>{statusBadge.label}</Text>
            </View>
          ) : (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{t('listing.host_new_badge')}</Text>
            </View>
          )}
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

      {/* Footer with title + price + cap */}
      <View style={styles.footer}>
        <Text style={styles.title} numberOfLines={2}>
          {pickLocalized(listing.title_ar, listing.title_en, locale)}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatSAR(listing.nightly_price_sar)}{' '}
            <Text style={styles.priceSuffix}>{t('listing.nightly_suffix')}</Text>
          </Text>
          <View style={styles.capBadge}>
            <Text style={styles.capEmoji}>🐈</Text>
            <Text style={styles.capCount}>
              {toArabicDigits(listing.max_concurrent_pets)}
            </Text>
          </View>
        </View>
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
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  price: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.mossDeep,
  },
  priceSuffix: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  capBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  capEmoji: {
    fontSize: 16,
  },
  capCount: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
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

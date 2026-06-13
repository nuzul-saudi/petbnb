// Part C (2026-06-13) — photo-led dense card.
//
// Layout: square photo carousel on top, compact info below. Designed
// to slot into a responsive numColumns grid in OwnerFeedHome (1–4
// per row by viewport width).
//
// Heart overlay rides on the carousel as an `overlays` prop so it
// stays glued to the top-trailing corner of the PHOTO regardless of
// the info block size.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { ListingPhotoCarousel } from '@/components/ListingPhotoCarousel';
import { findCity, findDistrict } from '@/lib/cities';
import { formatSAR, pickLocalized, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import type { ListingFeedItem } from '@/lib/listings';
import { speciesEmoji, type Species } from '@/lib/species';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type Props = {
  listing: ListingFeedItem;
  onPress: () => void;
  /**
   * Optional opt-in badge replacing the "new" pill in the host text
   * block. The host home (Step 7.1b) passes a two-state active/inactive
   * pill; the owner feed passes nothing → unchanged render.
   */
  statusBadge?: { label: string; color: string };
  /**
   * Round 11 — favorites. When passed, renders the heart toggle at
   * the top-end corner of the PHOTO (via the carousel's overlays slot).
   */
  favorite?: {
    isFavorited: boolean;
    onToggle: () => void;
  };
};

// "جديد" (new host) badge is shown unconditionally for now — every
// listing has zero completed bookings in MVP, and bookings-RLS would
// return 0 for per-card counts (CLAUDE.md §11 + JSDoc on the helper).
// Once a SECURITY DEFINER count RPC lands, this card can show real
// "{N} stays · ⭐ {avg}" stats.
export function ListingCard({
  listing,
  onPress,
  statusBadge,
  favorite,
}: Props) {
  const { t, locale } = useTranslation();

  const host = listing.host;
  const hostName = host
    ? pickLocalized(host.full_name, host.full_name_en, locale)
    : null;
  const initial = hostName?.trim().charAt(0) ?? '?';

  // 7.2c — city + district display. findDistrict returns undefined
  // for legacy seed rows where neighborhood holds an Arabic string
  // (not a slug from cities.ts); fall back to rendering the raw text.
  const cityRecord = findCity(listing.city);
  const cityDisplay = cityRecord
    ? pickLocalized(cityRecord.name_ar, cityRecord.name_en, locale)
    : listing.city;
  const districtRecord = findDistrict(listing.city, listing.neighborhood);
  const districtDisplay = districtRecord
    ? pickLocalized(districtRecord.name_ar, districtRecord.name_en, locale)
    : listing.neighborhood;

  // Cap-badge emoji rule (Part C): honor the listing's accepted
  // species. Single-species shows one glyph; multi-species shows the
  // pair concatenated. Falls back to 🐈 when the array is empty or
  // missing (legacy pre-Round-12 rows backfilled to ['cat']).
  const acceptedSpecies = (listing.accepts_species ?? ['cat']) as Species[];
  const capEmoji =
    acceptedSpecies.length === 0
      ? '🐈'
      : acceptedSpecies.map((s) => speciesEmoji(s)).join('');

  const heartOverlay = favorite ? (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        favorite.onToggle();
      }}
      style={styles.heartButton}
      accessibilityRole="button"
      accessibilityLabel={
        favorite.isFavorited
          ? t('feed.favorite_remove')
          : t('feed.favorite_add')
      }
      hitSlop={10}
    >
      <Text
        style={[
          styles.heartGlyph,
          favorite.isFavorited && styles.heartGlyphActive,
        ]}
      >
        {favorite.isFavorited ? '♥' : '♡'}
      </Text>
    </Pressable>
  ) : null;

  // Tier badge overlay — top-LEADING on the photo (so it never
  // collides with the heart on top-trailing). Bronze listings get
  // no overlay since "bronze" reads as "default tier" and the chip
  // adds visual noise without information.
  const tierOverlay =
    listing.tier !== 'bronze' ? (
      <View style={styles.tierOverlay}>
        <Text style={styles.tierOverlayText}>{t(`listing.tier_${listing.tier}`)}</Text>
      </View>
    ) : null;

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {/* Photo — square (1:1) per the Part C density spec. */}
      <ListingPhotoCarousel
        photos={listing.photos ?? []}
        aspectRatio={1}
        overlays={
          <>
            {tierOverlay}
            {heartOverlay}
          </>
        }
      />

      {/* Compact info block */}
      <View style={styles.info}>
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
          <Text style={styles.hostName} numberOfLines={1}>
            {hostName ?? '—'}
          </Text>
          <Text style={styles.verifiedMark}>✓</Text>
        </View>

        <Text style={styles.location} numberOfLines={1}>
          📍 {districtDisplay}, {cityDisplay}
          {listing.distance_km != null
            ? ` · ${t('feed.distance_label', { km: toArabicDigits(listing.distance_km.toFixed(1)) })}`
            : ''}
        </Text>

        {/* Status badge (host home, 7.1b) takes the slot when supplied.
            Otherwise the rating line, falling back to "new host". */}
        {statusBadge ? (
          <View
            style={[styles.badge, { backgroundColor: statusBadge.color }]}
          >
            <Text style={styles.badgeText}>{statusBadge.label}</Text>
          </View>
        ) : listing.host_avg_rating != null &&
          (listing.host_review_count ?? 0) > 0 ? (
          <Text style={styles.rating}>
            ★ {listing.host_avg_rating.toFixed(1)} ·{' '}
            {toArabicDigits(listing.host_review_count ?? 0)}
          </Text>
        ) : (
          <Text style={styles.newHost}>{t('listing.host_new_badge')}</Text>
        )}

        <Text style={styles.title} numberOfLines={2}>
          {pickLocalized(listing.title_ar, listing.title_en, locale)}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatSAR(listing.nightly_price_sar)}{' '}
            <Text style={styles.priceSuffix}>
              {t('listing.nightly_suffix')}
            </Text>
          </Text>
          <View style={styles.capBadge}>
            <Text style={styles.capEmoji}>{capEmoji}</Text>
            <Text style={styles.capCount}>
              {toArabicDigits(listing.max_concurrent_pets)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  // Heart overlay rides on top of the carousel. `end` (not `right`)
  // keeps it on the trailing edge in both LTR and RTL.
  heartButton: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    ...shadows.card,
  },
  heartGlyph: {
    fontFamily: fonts.body,
    fontSize: 22,
    lineHeight: 24,
    color: colors.inkSoft,
  },
  heartGlyphActive: {
    color: colors.terracotta,
  },
  // Tier pill on top-leading of the photo. Inverse positioning of
  // the heart so they're on opposite corners.
  tierOverlay: {
    position: 'absolute',
    top: spacing.md,
    start: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    zIndex: 15,
  },
  tierOverlayText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.mossDeep,
    letterSpacing: 0.5,
  },
  info: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.whisper,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mossDeep,
  },
  hostName: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
  },
  verifiedMark: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.moss,
  },
  location: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  rating: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.ink,
  },
  newHost: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.goldDeep,
    letterSpacing: 0.3,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: 2,
  },
  price: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
  },
  priceSuffix: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
  },
  capBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  capEmoji: {
    fontSize: 14,
  },
  capCount: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.inkSoft,
  },
});

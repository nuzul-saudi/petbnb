import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { formatSAR } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import type { ListingFeedItem } from '@/lib/listings';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type Props = {
  listing: ListingFeedItem;
  onPress: () => void;
};

export function ListingCard({ listing, onPress }: Props) {
  const { t } = useTranslation();

  return (
    <Pressable onPress={onPress} style={styles.card}>
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

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {listing.title_ar}
          </Text>
          <TierBadge tier={listing.tier} />
        </View>

        <Text style={styles.meta}>
          {listing.neighborhood}
          {listing.host?.full_name ? ` • ${listing.host.full_name}` : ''}
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
  photo: {
    width: '100%',
    aspectRatio: 16 / 10,
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
  body: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  price: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'right',
    marginTop: spacing.xs,
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
    alignSelf: 'flex-start',
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

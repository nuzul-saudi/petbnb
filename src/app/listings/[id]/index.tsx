import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { PhotoGallery } from '@/components/PhotoGallery';
import { formatSAR, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { useAuth } from '@/lib/auth';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function ListingDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getListingWithPhotos(id)
      .then((data) => {
        if (cancelled) return;
        setListing(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('[listing.load_failed]', e);
        setError(t('listing.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('listing.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !listing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error ?? t('listing.not_found')}
          </Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{t('listing.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Sitter-first header — hero of the detail screen. */}
        <View style={styles.sitterHeader}>
          {listing.host?.avatar_url ? (
            <Image
              source={{ uri: listing.host.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {listing.host?.full_name?.trim().charAt(0) ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.sitterText}>
            <View style={styles.sitterNameRow}>
              <Text style={styles.sitterName} numberOfLines={1}>
                {listing.host?.full_name ?? '—'}
              </Text>
              <Text style={styles.verifiedMark}>✓</Text>
            </View>
            <Text style={styles.sitterMeta}>
              {t(
                listing.host_gender === 'female'
                  ? 'listing.host_female'
                  : 'listing.host_male',
              )}{' '}
              • 📍 {listing.neighborhood}
            </Text>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.tier,
                  listing.tier === 'gold'
                    ? styles.tierGold
                    : listing.tier === 'silver'
                      ? styles.tierSilver
                      : styles.tierBronze,
                ]}
              >
                <Text style={styles.tierText}>
                  {t(`listing.tier_${listing.tier}`)}
                </Text>
              </View>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>
                  {t('listing.host_new_badge')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Photos as secondary evidence */}
        <PhotoGallery photos={listing.photos} />

        <View style={styles.body}>
          <Text style={styles.title}>{listing.title_ar}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatSAR(listing.nightly_price_sar)}{' '}
              <Text style={styles.priceSuffix}>
                {t('listing.nightly_suffix')}
              </Text>
            </Text>
          </View>

          {listing.description_ar ? (
            <Text style={styles.description}>{listing.description_ar}</Text>
          ) : null}

          <View style={styles.amenities}>
            <Amenity label={t('listing.max_pets', {
              count: toArabicDigits(listing.max_concurrent_pets),
            })} />
            <Amenity
              label={t(
                listing.has_resident_pets
                  ? 'listing.has_resident_pets'
                  : 'listing.no_resident_pets',
              )}
              note={listing.resident_pets_note ?? undefined}
            />
            {listing.offers_grooming ? (
              <Amenity label={t('listing.offers_grooming')} />
            ) : null}
          </View>

          <Pressable
            onPress={() => router.push(`/listings/${listing.id}/request`)}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{t('listing.request_button')}</Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backText}>{t('listing.back')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Amenity({ label, note }: { label: string; note?: string }) {
  return (
    <View style={styles.amenity}>
      <Text style={styles.amenityCheck}>✓</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.amenityLabel}>{label}</Text>
        {note ? <Text style={styles.amenityNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
  body: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.ink,
  },
  priceSuffix: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  tier: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
    fontSize: 11,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  metaBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  metaLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  sitterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    margin: spacing.xl,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.whisper,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
  },
  sitterText: {
    flex: 1,
    gap: spacing.xs,
  },
  sitterNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sitterName: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  verifiedMark: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.moss,
  },
  sitterMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  newBadge: {
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
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
    lineHeight: 24,
    marginTop: spacing.md,
  },
  amenities: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
  },
  amenity: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  amenityCheck: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.moss,
    width: 18,
  },
  amenityLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  amenityNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
    marginTop: 2,
  },
  cta: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  backLink: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  backButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.inkSoft,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});

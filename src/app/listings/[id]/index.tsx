import { logWarn } from '@/lib/log';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { PhotoGallery } from '@/components/PhotoGallery';
import { formatSAR, pickLocalized, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { useAuth } from '@/lib/auth';
import { usePersona } from '@/lib/persona';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function ListingDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const { persona } = usePersona();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  // Bilingual content fallback — _en field if present in current locale,
  // else the Arabic primary. listing/host may be null on first render.
  // Move 4 — search context forwarded from the owner feed lives in
  // these URL params. We thread them through to /request when the
  // user taps the "Request booking" button, so the booking form
  // prefills the dates and pet they searched with.
  const params = useLocalSearchParams<{
    id?: string;
    startDate?: string;
    endDate?: string;
    petId?: string;
    petIds?: string;
  }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const searchForward = (() => {
    const parts: string[] = [];
    if (typeof params.startDate === 'string' && params.startDate) {
      parts.push(`startDate=${params.startDate}`);
    }
    if (typeof params.endDate === 'string' && params.endDate) {
      parts.push(`endDate=${params.endDate}`);
    }
    // Forward multi-pet petIds when set; fall back to the legacy
    // singular petId for back-compat with old URLs.
    if (typeof params.petIds === 'string' && params.petIds) {
      parts.push(`petIds=${params.petIds}`);
    } else if (typeof params.petId === 'string' && params.petId) {
      parts.push(`petId=${params.petId}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  })();

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
        logWarn('[listing.load_failed]', e);
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
  // R2C3 guest mode (2026-06-11): listing detail is browsable by anon.
  // Below, the CTA branches handle the guest case — a sign-in CTA
  // replaces "Request booking" for signed-out visitors, with returnTo
  // pointing back to this URL after auth.

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
          <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
            <Text style={styles.backText}>{t('listing.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // 8h.3 self-view banner. Shown only when:
  //   - the viewer IS the listing's host (user.id === listing.host_id),
  //   - the viewer is currently in host persona (browsing-as-host),
  //   - a pending edit exists for this listing.
  // Owner-persona viewing (or anyone who isn't the host) sees the
  // public detail with no banner — they get the live, approved
  // version exactly as customers do. The banner links to the host
  // edit screen.
  //
  // Implementation note: we chose the "show live + banner with link"
  // approach over "show draft + link to live" because the detail
  // screen's query path (getListingWithPhotos) returns live data,
  // and the edit screen already loads draft data via
  // getListingForEdit. Keeping the detail screen on live keeps both
  // the public path and the host-self-view path consistent — only
  // the banner differs.
  const isOwnListing = !!user && user.id === listing.host_id;
  const showSelfViewBanner =
    isOwnListing && persona === 'host' && listing.has_pending_edit;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {showSelfViewBanner ? (
          <View style={styles.selfViewBanner}>
            <Text style={styles.selfViewBannerText}>
              {t('listing.self_view_banner')}
            </Text>
            <Pressable
              onPress={() => router.push(`/listings/${listing.id}/edit`)}
              style={styles.selfViewBannerLink}
            >
              <Text style={styles.selfViewBannerLinkText}>
                {t('listing.self_view_banner_link')}
              </Text>
            </Pressable>
          </View>
        ) : null}
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
                {(listing.host
                  ? pickLocalized(
                      listing.host.full_name,
                      listing.host.full_name_en,
                      locale,
                    )
                  : null
                )
                  ?.trim()
                  .charAt(0) ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.sitterText}>
            <View style={styles.sitterNameRow}>
              <Text style={styles.sitterName} numberOfLines={1}>
                {listing.host
                  ? pickLocalized(
                      listing.host.full_name,
                      listing.host.full_name_en,
                      locale,
                    )
                  : '—'}
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

        {/* Photos as secondary evidence. 4:3 (taller than the 5:2
            card thumbnail) so the customer can actually see the home
            on the detail screen; PhotoGallery's height cap keeps it
            from dominating the page on a wide desktop browser. */}
        <PhotoGallery photos={listing.photos} aspectRatio={4 / 3} />

        <View style={styles.body}>
          <Text style={styles.title}>
            {pickLocalized(listing.title_ar, listing.title_en, locale)}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatSAR(listing.nightly_price_sar)}{' '}
              <Text style={styles.priceSuffix}>
                {t('listing.nightly_suffix')}
              </Text>
            </Text>
          </View>

          {listing.description_ar || listing.description_en ? (
            <Text style={styles.description}>
              {pickLocalized(
                listing.description_ar ?? '',
                listing.description_en,
                locale,
              )}
            </Text>
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

          {/* CTA gates on BOTH ownership AND current persona.
              A 'both' user viewing their own listing in OWNER persona
              should see the same "Request booking" CTA a real customer
              sees — they're shopping for sitters, not editing. Only
              when they switch to HOST persona does the Edit CTA appear
              (mirrors the self-view banner above, which already uses
              the persona gate). Owners on listings they don't own
              always see Request booking. */}
          <View style={styles.ctaWrap}>
            {/* R2C1 self-booking guard (Round 2 — audit §1).
                Three states:
                  - own listing in host persona  → Edit listing CTA
                  - own listing in owner persona → inert notice
                    ("switch to host mode to manage this") instead of
                    Request booking — a host can't book their own home
                    (would let them generate fake five-star ratings
                    once two-way reviews ship). DB + app guards back
                    this up; the notice is the friendly surface.
                  - any other viewer            → Request booking CTA */}
            {isOwnListing && persona === 'host' ? (
              <Button
                label={t('listing.edit_button')}
                onPress={() => router.push(`/listings/${listing.id}/edit`)}
                variant="primary"
                fullWidth
              />
            ) : isOwnListing ? (
              <View style={styles.selfBookingNotice}>
                <Text style={styles.selfBookingNoticeText}>
                  {t('listing.self_booking_notice')}
                </Text>
              </View>
            ) : !session ? (
              <Button
                label={t('listing.guest_sign_in_to_book')}
                onPress={() =>
                  router.push(
                    `/sign-in?returnTo=${encodeURIComponent(`/listings/${listing.id}/request${searchForward}`)}`,
                  )
                }
                variant="primary"
                fullWidth
              />
            ) : (
              <Button
                label={t('listing.request_button')}
                onPress={() =>
                  router.push(
                    `/listings/${listing.id}/request${searchForward}`,
                  )
                }
                variant="primary"
                fullWidth
              />
            )}
          </View>

          <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
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
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream in owner mode, honey in host mode).
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
  selfViewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.whisper,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  selfViewBannerText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
  },
  selfViewBannerLink: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selfViewBannerLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
    textDecorationLine: 'underline',
  },
  body: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
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
  },
  amenityNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  ctaWrap: {
    marginTop: spacing.xl,
  },
  selfBookingNotice: {
    backgroundColor: colors.whisper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: spacing.md,
  },
  selfBookingNoticeText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
    textAlign: 'center',
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

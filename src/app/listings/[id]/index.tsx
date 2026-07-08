import { logWarn } from '@/lib/log';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { LegalFooterLinks } from '@/components/LegalPage';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { PhotoMosaic } from '@/components/PhotoMosaic';
import { SearchWhenModal } from '@/components/SearchWhenModal';
import { track } from '@/lib/analytics';
import { findCity, findDistrict } from '@/lib/cities';
import { formatDate } from '@/lib/date';
import { formatSAR, pickLocalized, toArabicDigits } from '@/lib/format';
import { responseBadgeKey } from '@/lib/host-response';
import { useTranslation } from '@/lib/i18n';
import { openInquiry } from '@/lib/inquiries';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { CANCELLATION_FULL_REFUND_HOURS } from '@/lib/payments-policy';
import { listReviewsForHost, type HostReview } from '@/lib/reviews';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function ListingDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
  // FIX 1 (2026-06-26) — persona-aware accent. Host viewing their
  // own listing now gets gold for title, section headings, host
  // name, amenity ✓ marks. Verified ✓ stays moss via
  // colors.verified (trust mark, never themed).
  const theme = useTheme();

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
    // Round 5b post-review: intent carried through the auth funnel.
    // When a guest taps "Message host" we route them to
    //   /sign-in?returnTo=/listings/[id]?action=inquire
    // The auth chain treats returnTo as opaque (it just startsWith('/')
    // checks and redirects), so after sign-in they land back here with
    // params.action === 'inquire'. The useEffect below auto-fires
    // openInquiry once on that signal so the trust intent doesn't get
    // dropped at the post-auth bounce.
    action?: string;
  }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const intentAction = typeof params.action === 'string' ? params.action : null;

  // Feature 2 — smart listing page. Dates carried in from search
  // prefill the local state below; without dates the widget shows
  // "Add stay dates" and lets the user pick on this page instead.
  // The Request-booking button forwards whatever's currently set
  // (carried-in OR chosen-on-detail), NOT the original URL params.
  const carriedStart =
    typeof params.startDate === 'string' && params.startDate
      ? params.startDate
      : null;
  const carriedEnd =
    typeof params.endDate === 'string' && params.endDate
      ? params.endDate
      : null;

  const [stayStart, setStayStart] = useState<string | null>(carriedStart);
  const [stayEnd, setStayEnd] = useState<string | null>(carriedEnd);
  const [whenOpen, setWhenOpen] = useState(false);
  // Round 5b — Message host CTA. The inquiry is created (or the
  // existing open one is fetched) lazily on tap, then the route
  // navigates to /inquiries/[id]. We track only the in-flight state
  // here so the user sees a loading state on the button while the
  // request lands; errors surface via setMessageError below.
  const [openingInquiry, setOpeningInquiry] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  // Round 5b post-review — loop guard for the action=inquire
  // auto-fire effect below. The ref protects against multiple fires
  // within the same mount (e.g., React.StrictMode double-effect,
  // listing reload while action is still in the URL). URL-level
  // cleanup via router.setParams strips ?action= before navigation
  // so a browser back to this screen won't re-trigger.
  const autoFiredInquiryRef = useRef(false);

  // searchForward now reads from LOCAL state (Feature 2) so any
  // post-arrival edit on the detail page travels to /request.
  // Pets stay URL-driven — owners pick on request screen if they
  // haven't already.
  const searchForward = (() => {
    const parts: string[] = [];
    if (stayStart) parts.push(`startDate=${stayStart}`);
    if (stayEnd) parts.push(`endDate=${stayEnd}`);
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

  // Rich detail page (2026-06-13). Reviews are loaded as a follow-up
  // fetch once the listing resolves — keyed by the host id, which
  // means a listing-detail open and a host-profile open could share
  // the cache (today they don't; trivial follow-up).
  const [reviews, setReviews] = useState<HostReview[]>([]);
  // Phase 5 / 0051 — host response-time badge. Best-effort; null keeps
  // the badge hidden (responseBadgeKey returns null on missing stats).
  const [responseBadge, setResponseBadge] = useState<string | null>(null);

  // Lightbox state. Opens when any mosaic tile is tapped; closes
  // via X or the system back gesture.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getListingWithPhotos(id)
      .then((data) => {
        if (cancelled) return;
        setListing(data);
        if (data) track('listing_viewed', { listingId: data.id });
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

  // Fetch host reviews once we know the host_id. Best-effort —
  // listReviewsForHost returns [] on error so the section just
  // shows the empty state rather than blocking the page.
  useEffect(() => {
    const hostId = listing?.host_id;
    if (!hostId) return;
    let cancelled = false;
    void listReviewsForHost(hostId).then((rows) => {
      if (!cancelled) setReviews(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.host_id]);

  // Phase 5 / 0051 — host response-time badge for the single host. Same
  // best-effort posture as reviews; on any failure the badge stays hidden.
  useEffect(() => {
    const hostId = listing?.host_id;
    if (!hostId || !supabase) return;
    let cancelled = false;
    void supabase
      .rpc('host_response_stats', { host_ids: [hostId] })
      .then(({ data }) => {
        if (cancelled) return;
        const row = data?.[0];
        setResponseBadge(
          responseBadgeKey(
            row ? Number(row.median_minutes) : null,
            row ? Number(row.sample_count) : null,
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [listing?.host_id]);

  // Round 5b — single source of truth for the inquiry-open path.
  // Used both by the manual "Message host" button tap and the
  // post-auth auto-fire effect below, so neither can drift from the
  // other. Reuses the double-tap-safe openInquiry helper from
  // src/lib/inquiries (SELECT-then-INSERT with 23505 race recovery).
  const handleOpenInquiry = useCallback(async () => {
    if (!listing || !user) return;
    if (openingInquiry) return;
    setOpeningInquiry(true);
    setMessageError(null);
    try {
      const inquiry = await openInquiry(listing.id, listing.host_id);
      router.push(`/inquiries/${inquiry.id}` as never);
    } catch (e) {
      logWarn('[listing.open_inquiry_failed]', e);
      setMessageError(t('listing.message_host_failed'));
    } finally {
      setOpeningInquiry(false);
    }
  }, [listing, user, openingInquiry, router, t]);

  // Round 5b post-review — auto-fire the inquiry path when a guest
  // returns from the auth funnel with ?action=inquire in the URL.
  //
  // Without this effect, the trust intent is dropped at the post-
  // auth bounce — most users won't re-tap the CTA they tapped
  // before sign-in.
  //
  // Loop guard (autoFiredInquiryRef): the entire body runs AT MOST
  // ONCE per mount. router.setParams strips the action param so a
  // browser-back to this screen won't re-trigger on re-mount.
  //
  // Self-inquiry guard: if the post-auth user happens to be the
  // listing's host, silently skip — no self-inquiry. Strips the
  // param anyway so the URL doesn't carry leftover state.
  useEffect(() => {
    if (intentAction !== 'inquire') return;
    if (!listing || !user) return; // wait for both to settle
    if (autoFiredInquiryRef.current) return;
    autoFiredInquiryRef.current = true;
    // Remove the action param from the URL. setParams replaces the
    // current entry; undefined removes that key. Prevents
    // back-navigation re-fires AND keeps the URL clean for sharing.
    router.setParams({ action: undefined } as Record<string, undefined>);
    if (user.id === listing.host_id) return;
    void handleOpenInquiry();
  }, [intentAction, listing, user, router, handleOpenInquiry]);

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

  // 8h.3 self-view banner. Shown only when the viewer IS the listing's
  // host AND a pending edit exists. The banner links to the host edit
  // screen. We render live data here (PostgREST returns live), so the
  // banner is the only host-vs-public differentiator.
  const isOwnListing = !!user && user.id === listing.host_id;
  const showSelfViewBanner = isOwnListing && listing.has_pending_edit;

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
        {/* Section 1: photo mosaic (hero). */}
        <PhotoMosaic
          photos={listing.photos}
          onPressPhoto={(idx) => {
            setLightboxIndex(idx);
            setLightboxOpen(true);
          }}
        />

        <View style={styles.body}>
          {/* Section 2: title + price. */}
          <Text style={[styles.title, { color: theme.accent }]}>
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
          {/* Phase 3 — one-line cancellation-policy summary, rendered
              from the payments-policy constants (never hand-typed). */}
          <Text style={styles.policySummary}>
            {t('cancellation_policy.summary_line', {
              hours: CANCELLATION_FULL_REFUND_HOURS,
            })}
          </Text>

          {/* Section 3: host card — the trust anchor. */}
          <View style={styles.sectionDivider} />
          <View style={styles.hostCard}>
            {listing.host?.avatar_url ? (
              <Image
                source={{ uri: listing.host.avatar_url }}
                style={styles.hostAvatar}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.hostAvatar, styles.hostAvatarFallback]}>
                <Text style={styles.hostAvatarInitial}>
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
            <View style={styles.hostText}>
              <Text style={styles.sectionLabel}>
                {t('listing.section.host')}
              </Text>
              <View style={styles.hostNameRow}>
                <Text
                  style={[styles.hostName, { color: theme.accent }]}
                  numberOfLines={1}
                >
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
              <Text style={styles.hostMeta}>
                {t(
                  listing.host_gender === 'female'
                    ? 'listing.host_female'
                    : 'listing.host_male',
                )}
              </Text>
              <View style={styles.hostBadgeRow}>
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
                {reviews.length > 0 ? (
                  <View style={styles.ratingPill}>
                    <Text style={styles.ratingPillText}>
                      ★{' '}
                      {(
                        reviews.reduce((s, r) => s + r.stars, 0) /
                        reviews.length
                      ).toFixed(1)}{' '}
                      · {toArabicDigits(reviews.length)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>
                      {t('listing.host_new_badge')}
                    </Text>
                  </View>
                )}
                {/* Phase 5 / 0051 — response-time trust signal. Hidden
                    under 3 answered inquiries (null key). */}
                {responseBadge ? (
                  <Text style={styles.responseBadge} numberOfLines={1}>
                    💬 {t(responseBadge)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Section 4: description. */}
          {listing.description_ar || listing.description_en ? (
            <>
              <View style={styles.sectionDivider} />
              <Text style={[styles.sectionHeading, { color: theme.accent }]}>
                {t('listing.section.about')}
              </Text>
              <Text style={styles.description}>
                {pickLocalized(
                  listing.description_ar ?? '',
                  listing.description_en,
                  locale,
                )}
              </Text>
            </>
          ) : null}

          {/* Section 5: amenities. */}
          <View style={styles.sectionDivider} />
          <Text style={[styles.sectionHeading, { color: theme.accent }]}>
            {t('listing.section.amenities')}
          </Text>
          <View style={styles.amenities}>
            <Amenity
              label={t('listing.max_pets', {
                count: toArabicDigits(listing.max_concurrent_pets),
              })}
            />
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

          {/* Section 6: reviews — the written trust payload. Rendered
              only when the host has ≥1 review; the "new host" badge in
              the host card already covers the empty case, so there's no
              redundant empty state here. Newest-first is guaranteed by
              the listReviewsForHost fetch (order created_at desc). */}
          {reviews.length > 0 ? (
            <>
              <View style={styles.sectionDivider} />
              <View style={styles.sectionHeadingRow}>
                <Text style={[styles.sectionHeading, { color: theme.accent }]}>
                  {t('listing.section.reviews')}
                </Text>
                <Text style={styles.sectionHeadingMeta}>
                  ★{' '}
                  {(
                    reviews.reduce((s, r) => s + r.stars, 0) / reviews.length
                  ).toFixed(1)}{' '}
                  · {toArabicDigits(reviews.length)}
                </Text>
              </View>
              <View style={styles.reviewsList}>
                {reviews.map((rv) => (
                  <View key={rv.id} style={styles.reviewItem}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewerName}>
                        {rv.rater_name ?? t('reviews.anon_rater')}
                      </Text>
                      <Text style={styles.reviewStars}>
                        {'★'.repeat(rv.stars)}
                        <Text style={styles.reviewStarsDim}>
                          {'★'.repeat(5 - rv.stars)}
                        </Text>
                      </Text>
                    </View>
                    {/* text_ar is optional — many reviews are stars-only.
                        Render the text block only when present so a
                        stars-only row stays clean. */}
                    {rv.text_ar ? (
                      <Text style={styles.reviewText}>{rv.text_ar}</Text>
                    ) : null}
                    <Text style={styles.reviewDate}>
                      {formatDate(rv.created_at.slice(0, 10), locale, 'medium')}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Section 7: location — DISTRICT + city only, NO exact
              address, NO precise pin. A female host's exact home
              location stays private until a booking is confirmed. */}
          <View style={styles.sectionDivider} />
          <Text style={[styles.sectionHeading, { color: theme.accent }]}>
            {t('listing.section.location')}
          </Text>
          <Text style={styles.locationText}>
            📍 {formatApproximateLocation(listing.city, listing.neighborhood, locale)}
          </Text>
          <Text style={styles.locationPrivacy}>
            {t('listing.location_privacy_note')}
          </Text>

          {/* Feature 2 — stay-dates widget. Read-only summary
              when dates are set; tap to edit (opens RangeCalendar
              via SearchWhenModal). When unset shows a "Add stay
              dates" prompt. Hidden when the viewer can't book
              (own listing, no session — those branches show
              alternate CTAs below). */}
          {!isOwnListing && session ? (
            <Pressable
              onPress={() => setWhenOpen(true)}
              style={styles.stayDatesWidget}
              accessibilityRole="button"
            >
              <Text style={styles.stayDatesLabel}>
                {t('listing.stay_dates_label')}
              </Text>
              <Text
                style={[
                  styles.stayDatesValue,
                  !(stayStart && stayEnd) && styles.stayDatesValuePlaceholder,
                ]}
              >
                {stayStart && stayEnd
                  ? `${formatLongDate(stayStart, locale)} – ${formatLongDate(stayEnd, locale)}`
                  : t('listing.stay_dates_hint')}
              </Text>
            </Pressable>
          ) : null}

          {/* CTA gates on listing ownership.
              Own listing → Edit CTA (a host can't book their own
              listing; DB RLS backs this up). Otherwise → Request
              booking CTA, or a sign-in CTA for guests.

              Round 5b — "Message host" secondary CTA. Hidden on
              the host's own listing (the Edit CTA above covers
              what they need). Guest taps → /sign-in with
              returnTo pointing back to this URL. Signed-in
              non-host taps → openInquiry() fetch-or-creates the
              open thread, then navigates to /inquiries/[id]. */}
          <View style={styles.ctaWrap}>
            {isOwnListing ? (
              <Button
                label={t('listing.edit_button')}
                onPress={() => router.push(`/listings/${listing.id}/edit`)}
                variant="primary"
                fullWidth
              />
            ) : !session ? (
              <>
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
                <View style={styles.secondaryCtaSpacer} />
                <Button
                  label={t('listing.message_host_button')}
                  onPress={() =>
                    // Round 5b post-review fix — embed the inquiry
                    // intent in returnTo so it survives the auth
                    // funnel. After sign-in the user lands back here
                    // with ?action=inquire and the auto-fire effect
                    // below opens the thread for them. Without this,
                    // the trust intent gets dropped at the post-auth
                    // bounce (most users won't re-tap the CTA).
                    router.push(
                      `/sign-in?returnTo=${encodeURIComponent(`/listings/${listing.id}?action=inquire`)}`,
                    )
                  }
                  variant="secondary"
                  fullWidth
                />
              </>
            ) : (
              <>
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
                <View style={styles.secondaryCtaSpacer} />
                <Button
                  label={
                    openingInquiry
                      ? t('listing.message_host_opening')
                      : t('listing.message_host_button')
                  }
                  onPress={() => void handleOpenInquiry()}
                  variant="secondary"
                  fullWidth
                />
                {messageError ? (
                  <Text style={styles.inquiryError}>{messageError}</Text>
                ) : null}
              </>
            )}
          </View>

          <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
            <Text style={styles.backText}>{t('listing.back')}</Text>
          </Pressable>

          {/* Phase 3 — legal links in the listing-detail footer. */}
          <LegalFooterLinks />
        </View>
      </ScrollView>

      {/* Feature 2 — date-picker modal shared with the search hero. */}
      <SearchWhenModal
        visible={whenOpen}
        startDate={stayStart}
        endDate={stayEnd}
        onApply={({ startDate, endDate }) => {
          setStayStart(startDate);
          setStayEnd(endDate);
        }}
        onClose={() => setWhenOpen(false)}
      />

      {/* Rich detail page — full-screen lightbox. Mounted at the
          screen level so it overlays everything. */}
      <PhotoLightbox
        visible={lightboxOpen}
        photos={listing.photos}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </SafeAreaView>
  );
}

/** District + city display for the approximate-location section.
 *  Falls back to raw neighborhood string for legacy listings whose
 *  neighborhood column wasn't migrated to a district slug. */
function formatApproximateLocation(
  city: string,
  neighborhood: string,
  locale: 'ar' | 'en',
): string {
  const cityRec = findCity(city as 'riyadh' | 'dammam');
  const districtRec = cityRec
    ? findDistrict(city as 'riyadh' | 'dammam', neighborhood)
    : undefined;
  const cityName = cityRec
    ? locale === 'ar'
      ? cityRec.name_ar
      : cityRec.name_en
    : city;
  const districtName = districtRec
    ? locale === 'ar'
      ? districtRec.name_ar
      : districtRec.name_en
    : neighborhood;
  return `${districtName}, ${cityName}`;
}

/** Long date format for the detail-page stay-dates widget. "Jul 1" /
 *  "1 يول" — the carried-in dates need to read at-a-glance and the
 *  detail page has more horizontal room than the search hero. */
function formatLongDate(iso: string, locale: 'ar' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthNames =
    locale === 'ar'
      ? ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthNames[month - 1]} ${day}`;
}

function Amenity({ label, note }: { label: string; note?: string }) {
  // FIX 1 — sub-component needs its own theme handle. Owner = moss,
  // host = gold for the amenity ✓ marks.
  const theme = useTheme();
  return (
    <View style={styles.amenity}>
      <Text style={[styles.amenityCheck, { color: theme.accent }]}>✓</Text>
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
  // Rich detail page (2026-06-13) — section structure.
  sectionDivider: {
    height: 1,
    backgroundColor: colors.whisper,
    marginVertical: spacing.lg,
  },
  sectionHeading: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    marginBottom: spacing.sm,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionHeadingMeta: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.inkSoft,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.inkSoft,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  hostAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.whisper,
  },
  hostAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostAvatarInitial: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
  },
  hostText: {
    flex: 1,
    gap: 2,
  },
  hostNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hostName: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
  },
  hostMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  hostBadgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  ratingPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.whisper,
  },
  ratingPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.mossDeep,
    letterSpacing: 0.3,
  },
  responseBadge: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.moss,
    width: '100%',
    marginTop: 2,
  },
  reviewsList: {
    gap: spacing.md,
  },
  reviewItem: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  reviewerName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  reviewStars: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.gold,
  },
  reviewStarsDim: {
    color: colors.whisper,
  },
  reviewText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  reviewDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  locationText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  locationPrivacy: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: spacing.xs,
    fontStyle: 'italic',
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
  policySummary: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
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
    // FIX 1 — trust mark via dedicated alias (stays moss in both
    // personas). The amenityCheck above this in the file is also a
    // ✓ but it's themed per-persona at the JSX call site — only
    // THIS verifiedMark is the brand trust signal.
    color: colors.verified,
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
    marginTop: spacing.lg,
  },
  // Round 5b — gap between the primary CTA (Request booking /
  // Sign in to book) and the secondary "Message host" CTA below it.
  secondaryCtaSpacer: {
    height: spacing.sm,
  },
  // Inline error surface for the Message host tap, in case
  // openInquiry throws (network / RLS reject / etc).
  inquiryError: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  // Feature 2 — stay-dates widget. Pressable card above the CTA
  // showing the carried-in dates (or "Add stay dates" prompt).
  stayDatesWidget: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: 2,
  },
  stayDatesLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.inkSoft,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  stayDatesValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  stayDatesValuePlaceholder: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
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

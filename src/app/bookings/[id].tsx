import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { PetAvatar } from '@/components/PetAvatar';
import { useAuth } from '@/lib/auth';
import {
  cancelBookingAsOwner,
  getBooking,
  type BookingDetail,
} from '@/lib/bookings';
import { formatSAR, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import {
  computePriceBreakdown,
  type AddonSelection,
  type AddonType,
} from '@/lib/pricing';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function BookingDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBooking(id)
      .then((b) => {
        if (cancelled) return;
        setBooking(b);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('[booking.load_failed]', e);
        setError(t('booking.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Reconstruct AddonSelection[] from the persisted booking_addons rows
  // so we can re-run the same breakdown function the request screen used.
  // Rows of the same type are grouped by their pet_ids; booking-wide rows
  // (pet_id null) contribute one entry with petIds=[].
  const addonSelections = useMemo<AddonSelection[]>(() => {
    if (!booking) return [];
    const byType = new Map<
      AddonType,
      { petIds: string[]; hasBookingWide: boolean }
    >();
    for (const row of booking.addons) {
      const type = row.type as AddonType;
      const entry = byType.get(type) ?? { petIds: [], hasBookingWide: false };
      if (row.pet_id === null) {
        entry.hasBookingWide = true;
      } else {
        entry.petIds.push(row.pet_id);
      }
      byType.set(type, entry);
    }
    const out: AddonSelection[] = [];
    for (const [type, entry] of byType) {
      // A type might have both per-pet rows AND a booking-wide row in
      // pathological data; in normal flow it's one or the other. Emit
      // per-pet first.
      if (entry.petIds.length > 0) {
        out.push({ type, petIds: entry.petIds });
      }
      if (entry.hasBookingWide) {
        out.push({ type, petIds: [] });
      }
    }
    return out;
  }, [booking]);

  // Recompute the breakdown from the SNAPSHOTTED discount (not the
  // listing's current discount — that would drift if the host edited
  // their per-pet discount after the booking). Legacy bookings (pre-0009)
  // have null snapshots; discount=0 there means base is computed flat.
  const breakdown = useMemo(() => {
    if (!booking) return null;
    return computePriceBreakdown({
      nightlyPriceSAR: booking.base_price_sar,
      nights: booking.nights,
      petCount: booking.pets.length,
      additionalPetDiscount: booking.additional_pet_discount ?? 0,
      addons: addonSelections,
    });
  }, [booking, addonSelections]);

  // Map pet_id → list of add-on types attached to it, for the per-pet
  // section's "services for this pet" line.
  const servicesByPet = useMemo(() => {
    const m = new Map<string, AddonType[]>();
    if (!booking) return m;
    for (const row of booking.addons) {
      if (row.pet_id === null) continue;
      const list = m.get(row.pet_id) ?? [];
      list.push(row.type as AddonType);
      m.set(row.pet_id, list);
    }
    return m;
  }, [booking]);

  // Only owners can cancel, and only while the booking is still pending
  // host acceptance. Once accepted, cancellation is out-of-band (Step 7).
  const canCancel =
    !!booking &&
    !!user &&
    booking.owner_id === user.id &&
    booking.status === 'requested';

  // Same gating as cancel: owner + status='requested'. The two
  // capabilities open and close together.
  const canEdit = canCancel;

  // Bookings created before migration 0009 have a null additional_pet_discount
  // and booking_addons rows with pet_id=null even for what's now per-pet.
  // We can't safely round-trip them through the new model.
  const isLegacyBooking =
    !!booking && booking.additional_pet_discount === null;

  const onEdit = () => {
    if (!booking) return;
    if (isLegacyBooking) {
      const confirmed =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.confirm(t('booking.edit_legacy_warning'))
          : true;
      if (!confirmed) return;
    }
    router.push({
      pathname: '/listings/[id]/request',
      params: {
        id: booking.listing_id,
        editBooking: booking.id,
      },
    });
  };

  const onCancel = async () => {
    if (!booking) return;
    const confirmed =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(t('booking.cancel_confirm'))
        : true;
    if (!confirmed) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelBookingAsOwner(booking.id);
      // Send the user back to their bookings list — a cancelled-booking
      // detail screen is a dead end. Using replace (not push) so the back
      // button doesn't bring them right back to it.
      router.replace('/bookings');
      return;
    } catch (e) {
      console.warn('[booking.cancel_failed]', e);
      setCancelError(t('booking.cancel_failed'));
    } finally {
      setCancelling(false);
    }
  };

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

  if (error || !booking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t('listing.not_found')}</Text>
          <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
            <Text style={styles.backText}>{t('booking.back_home')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successCircle}>
          <Text style={styles.successCheck}>✓</Text>
        </View>

        <Text style={styles.title}>{t('booking.confirm_title')}</Text>
        <Text style={styles.subtitle}>
          {t(`booking.status_${booking.status}`)}
        </Text>

        <View style={styles.summaryCard}>
          {booking.listing ? (
            <>
              <Text style={styles.summaryTitle}>{booking.listing.title_ar}</Text>
              <Text style={styles.summaryMeta}>
                📍 {booking.listing.neighborhood}
              </Text>
            </>
          ) : null}

          <View style={styles.summaryDivider} />

          <Text style={styles.summaryLine}>
            {t('booking.dates_range', {
              start: toArabicDigits(booking.start_date),
              end: toArabicDigits(booking.end_date),
            })}
          </Text>
          <Text style={styles.summaryLine}>
            {t('booking.nights_count', {
              nights: toArabicDigits(booking.nights),
            })}
          </Text>

          <View style={styles.summaryDivider} />

          {/* Per-pet block — one row per pet with avatar + services */}
          {booking.pets.map((p) => {
            const services = isLegacyBooking
              ? []
              : (servicesByPet.get(p.id) ?? []);
            return (
              <View key={p.id} style={styles.petBlock}>
                <View style={styles.petBlockHeader}>
                  <PetAvatar
                    photoUrl={p.photo_url}
                    breed={p.breed}
                    size={32}
                  />
                  <Text style={styles.petBlockName}>{p.name}</Text>
                </View>
                {!isLegacyBooking ? (
                  services.length > 0 ? (
                    <Text style={styles.petBlockServices}>
                      {services.map((s) => t(`booking.addon_${s}`)).join('، ')}
                    </Text>
                  ) : (
                    <Text style={styles.petBlockNoServices}>
                      {t('booking.no_per_pet_services')}
                    </Text>
                  )
                ) : null}
              </View>
            );
          })}

          <View style={styles.summaryDivider} />

          {/* Breakdown — legacy bookings (pre-0009) get raw rows; modern
              bookings get the recomputed per-pet breakdown. */}
          {booking.nights > 0 && booking.pets.length > 0 ? (
            isLegacyBooking ? (
              // Legacy: show raw booking_addons rows as-is, no recomputation.
              <View style={styles.breakdownBox}>
                {booking.addons.map((row) => (
                  <View key={row.id} style={styles.breakdownLine}>
                    <Text style={styles.breakdownLabel}>
                      {t(`booking.addon_${row.type}`)}
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {formatSAR(row.price_sar)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : breakdown ? (
              <View style={styles.breakdownBox}>
                <View style={styles.breakdownLine}>
                  <Text style={styles.breakdownLabel}>
                    {t('booking.breakdown_base', {
                      pets: toArabicDigits(booking.pets.length),
                      nights: toArabicDigits(booking.nights),
                    })}
                  </Text>
                  <Text style={styles.breakdownValue}>
                    {formatSAR(breakdown.baseSubtotalSAR)}
                  </Text>
                </View>
                {breakdown.addonLines
                  .filter((line) => line.lineSAR > 0)
                  .map((line, i) => {
                    const suffix =
                      line.scope === 'per_pet' && line.cadence === 'one_time'
                        ? t('booking.per_pet_suffix_one_time', {
                            pets: toArabicDigits(line.petCount),
                          })
                        : line.scope === 'per_pet' &&
                            line.cadence === 'per_night'
                          ? t('booking.per_pet_suffix_per_night', {
                              pets: toArabicDigits(line.petCount),
                              nights: toArabicDigits(line.nights),
                            })
                          : line.scope === 'booking' &&
                              line.cadence === 'per_night'
                            ? t('booking.booking_suffix_per_night', {
                                nights: toArabicDigits(line.nights),
                              })
                            : '';
                    return (
                      <View
                        key={`${line.type}-${i}`}
                        style={styles.breakdownLine}
                      >
                        <Text style={styles.breakdownLabel}>
                          {t(`booking.addon_${line.type}`)}
                          {suffix ? ` ${suffix}` : ''}
                        </Text>
                        <Text style={styles.breakdownValue}>
                          {formatSAR(line.lineSAR)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ) : null
          ) : null}

          <View style={styles.summaryDivider} />

          <Text style={styles.totalLine}>
            {t('booking.total_paid', {
              total: formatSAR(
                isLegacyBooking
                  ? booking.total_sar
                  : (breakdown?.totalSAR ?? booking.total_sar),
              ),
            })}
          </Text>
        </View>

        {canEdit ? (
          <Pressable onPress={onEdit} style={styles.editButton}>
            <Text style={styles.editText}>
              {t('booking.edit_request_button')}
            </Text>
          </Pressable>
        ) : null}

        {canCancel ? (
          <>
            {cancelError ? (
              <Text style={styles.errorText}>{cancelError}</Text>
            ) : null}
            <Pressable
              onPress={onCancel}
              disabled={cancelling}
              style={[
                styles.cancelButton,
                cancelling && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.cancelText}>
                {cancelling
                  ? t('booking.cancelling')
                  : t('booking.cancel_button')}
              </Text>
            </Pressable>
          </>
        ) : null}

        <Pressable
          onPress={() => router.replace('/')}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{t('booking.back_home')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
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
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successCheck: {
    fontSize: 40,
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.gold,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  summaryTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
  },
  summaryMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.whisper,
    marginVertical: spacing.sm,
  },
  summaryLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  petBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  petBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  petBlockName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  petBlockServices: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    paddingLeft: spacing.xl + 32,
  },
  petBlockNoServices: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    fontStyle: 'italic',
    paddingLeft: spacing.xl + 32,
  },
  breakdownBox: {
    gap: spacing.xs,
  },
  breakdownLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  breakdownLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    marginLeft: spacing.sm,
  },
  totalLine: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    marginTop: spacing.xs,
  },
  cta: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  editButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.moss,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  editText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  cancelButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.terracotta,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  cancelText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
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

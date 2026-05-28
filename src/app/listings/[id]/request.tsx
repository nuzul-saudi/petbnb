import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { PetAvatar } from '@/components/PetAvatar';
import { useAuth } from '@/lib/auth';
import { createBookingRequest, type AddonInput } from '@/lib/bookings';
import { formatSAR, nightsBetween, toArabicDigits, todayIso } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { MockPaymentProvider } from '@/lib/payment';
import { listPetsForOwner } from '@/lib/pets';
import {
  ADDON_CONFIG,
  computePriceBreakdown,
  type AddonSelection,
  type AddonType,
} from '@/lib/pricing';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import type { Tables } from '@/types/database';

// Listing-level availability gate. Pricing (scope/cadence/price) comes from
// ADDON_CONFIG in @/lib/pricing; this map only says whether the listing
// supports a given add-on. Missing key = always available.
const ADDON_AVAILABILITY: Partial<
  Record<AddonType, (l: ListingDetail) => boolean>
> = {
  grooming: (l) => l.offers_grooming,
};

function isAddonAvailable(type: AddonType, listing: ListingDetail): boolean {
  const check = ADDON_AVAILABILITY[type];
  return check ? check(listing) : true;
}

export default function BookingRequestScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = typeof params.id === 'string' ? params.id : '';

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [pets, setPets] = useState<Tables<'pets'>[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPetIds, setSelectedPetIds] = useState<Set<string>>(new Set());
  // Per-pet add-ons: keyed by petId → set of services for THAT pet.
  const [perPetAddons, setPerPetAddons] = useState<Map<string, Set<AddonType>>>(
    new Map(),
  );
  // Booking-wide add-ons (e.g. transport).
  const [bookingAddons, setBookingAddons] = useState<Set<AddonType>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'idle' | 'paying' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Ref for the departure date input — used to auto-focus after the
  // user picks an arrival date. Web-only (HTMLInputElement); on native
  // the date picker UX is modal-based so auto-open isn't meaningful.
  const endDateRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!listingId || !user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getListingWithPhotos(listingId), listPetsForOwner(user.id)])
      .then(([l, p]) => {
        if (cancelled) return;
        setListing(l);
        setPets(p);
        // Pre-select the only pet if they have exactly one.
        if (p.length === 1) setSelectedPetIds(new Set([p[0].id]));
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
  }, [listingId, user]);

  // Calendar UX: when user picks arrival, focus the departure field so
  // they can continue without an extra tap. Web-only; native picker
  // auto-open requires a modal we don't have yet (Section 13 TODO).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (startDate && !endDate) {
      endDateRef.current?.focus();
    }
  }, [startDate, endDate]);

  // Drop per-pet entries whose pet is no longer selected.
  useEffect(() => {
    setPerPetAddons((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!selectedPetIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedPetIds]);

  const nights = nightsBetween(startDate, endDate);

  const addonSelections = useMemo<AddonSelection[]>(() => {
    const out: AddonSelection[] = [];
    // Group per-pet selections by add-on type so each type emits one
    // AddonSelection with all attached pet ids.
    const byType = new Map<AddonType, string[]>();
    for (const [petId, types] of perPetAddons) {
      for (const t of types) {
        const arr = byType.get(t) ?? [];
        arr.push(petId);
        byType.set(t, arr);
      }
    }
    for (const [type, petIds] of byType) {
      out.push({ type, petIds });
    }
    // Booking-wide selections — presence in array = selected, petIds=[].
    for (const type of bookingAddons) {
      out.push({ type, petIds: [] });
    }
    return out;
  }, [perPetAddons, bookingAddons]);

  const breakdown = useMemo(() => {
    if (!listing || nights <= 0) {
      return {
        baseSubtotalSAR: 0,
        addonLines: [] as ReturnType<typeof computePriceBreakdown>['addonLines'],
        addonsTotalSAR: 0,
        totalSAR: 0,
      };
    }
    return computePriceBreakdown({
      nightlyPriceSAR: listing.nightly_price_sar,
      nights,
      petCount: selectedPetIds.size,
      additionalPetDiscount: listing.additional_pet_discount,
      addons: addonSelections,
    });
  }, [listing, nights, selectedPetIds, addonSelections]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('listing.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('listing.not_found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const togglePet = (id: string) => {
    setSelectedPetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePerPetAddon = (petId: string, type: AddonType) => {
    setPerPetAddons((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(petId) ?? []);
      if (set.has(type)) set.delete(type);
      else set.add(type);
      if (set.size === 0) next.delete(petId);
      else next.set(petId, set);
      return next;
    });
  };

  const toggleBookingAddon = (type: AddonType) => {
    setBookingAddons((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const validate = (): string | null => {
    if (!startDate || startDate < todayIso()) return t('booking.invalid_start_date');
    if (!endDate || nights <= 0) return t('booking.invalid_end_date');
    if (selectedPetIds.size === 0) return t('booking.pet_required');
    return null;
  };

  const onSubmit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      setSubmitStage('paying');
      const result = await MockPaymentProvider.authorize({
        bookingId: 'pending',
        amountSAR: breakdown.totalSAR,
        description: listing.title_ar,
      });
      if (result.status !== 'authorized') {
        throw new Error(result.reason);
      }

      setSubmitStage('saving');

      // Map breakdown lines back into one booking_addons row per (pet,
      // service) for per-pet add-ons, and one row with petId=null for
      // booking-wide.
      const addonsForDb: AddonInput[] = breakdown.addonLines.flatMap((line) => {
        const cfg = ADDON_CONFIG[line.type];
        if (cfg.scope === 'per_pet') {
          const ids =
            addonSelections.find((s) => s.type === line.type)?.petIds ?? [];
          // Each row's price is the per-pet, cadence-aware unit price.
          const unitPrice =
            cfg.cadence === 'per_night' ? cfg.priceSAR * nights : cfg.priceSAR;
          return ids.map<AddonInput>((petId) => ({
            type: line.type,
            petId,
            priceSAR: unitPrice,
          }));
        }
        return [
          {
            type: line.type,
            petId: null,
            priceSAR: line.lineSAR,
          },
        ];
      });

      const booking = await createBookingRequest({
        listingId: listing.id,
        ownerId: user.id,
        petIds: Array.from(selectedPetIds),
        startDate,
        endDate,
        basePriceSAR: listing.nightly_price_sar,
        baseSubtotalSAR: breakdown.baseSubtotalSAR,
        additionalPetDiscount: listing.additional_pet_discount,
        totalSAR: breakdown.totalSAR,
        addons: addonsForDb,
      });

      router.replace({ pathname: '/bookings/[id]', params: { id: booking.id } });
    } catch (e) {
      console.warn('[booking.submit_failed]', e);
      setError(t('booking.submit_failed'));
    } finally {
      setSubmitting(false);
      setSubmitStage('idle');
    }
  };

  const submitLabel =
    submitStage === 'paying'
      ? t('booking.processing_payment')
      : submitStage === 'saving'
        ? t('booking.submitting')
        : t('booking.submit_button');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          onPress={() =>
            router.replace({
              pathname: '/listings/[id]',
              params: { id: listing.id },
            })
          }
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>{t('booking.back_to_listing')}</Text>
        </Pressable>

        <Text style={styles.heading}>{t('booking.request_title')}</Text>
        <Text style={styles.subheading}>{listing.title_ar}</Text>

        {/* Dates — DateField branches on platform */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('booking.start_date_label')}</Text>
          <DateField value={startDate} onChange={setStartDate} min={todayIso()} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('booking.end_date_label')}</Text>
          <DateField
            value={endDate}
            onChange={setEndDate}
            min={startDate || todayIso()}
            inputRef={endDateRef}
          />
        </View>

        {nights > 0 ? (
          <Text style={styles.summary}>
            {t('booking.nights_summary', {
              nights: toArabicDigits(nights),
              price: formatSAR(listing.nightly_price_sar),
              total: formatSAR(breakdown.baseSubtotalSAR),
            })}
          </Text>
        ) : null}

        {/* Pet picker — multi-select from existing pets, or empty-state CTA */}
        <Text style={styles.sectionLabel}>{t('booking.pet_section_label')}</Text>
        {pets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('booking.no_pets_title')}</Text>
            <Text style={styles.emptyBody}>{t('booking.no_pets_body')}</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/pets/[id]',
                  params: { id: 'new' },
                })
              }
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>
                {t('booking.no_pets_button')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.petList}>
            {pets.map((p) => {
              const checked = selectedPetIds.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => togglePet(p.id)}
                  style={[styles.petRow, checked && styles.petRowSelected]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      checked && styles.checkboxChecked,
                    ]}
                  >
                    {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <PetAvatar photoUrl={p.photo_url} breed={p.breed} size={44} />
                  <Text style={styles.petName}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Per-pet services — one card per selected pet */}
        {selectedPetIds.size > 0 ? (
          <>
            <Text style={styles.sectionLabel}>
              {t('booking.per_pet_services_label')}
            </Text>
            {pets
              .filter((p) => selectedPetIds.has(p.id))
              .map((p) => {
                const petServices =
                  perPetAddons.get(p.id) ?? new Set<AddonType>();
                return (
                  <View key={p.id} style={styles.petCard}>
                    <View style={styles.petCardHeader}>
                      <PetAvatar
                        photoUrl={p.photo_url}
                        breed={p.breed}
                        size={36}
                      />
                      <Text style={styles.petCardName}>{p.name}</Text>
                    </View>
                    {(['grooming', 'vet', 'insurance'] as AddonType[])
                      .filter((type) => isAddonAvailable(type, listing))
                      .map((type) => {
                        const checked = petServices.has(type);
                        return (
                          <Pressable
                            key={type}
                            onPress={() => togglePerPetAddon(p.id, type)}
                            style={[
                              styles.perPetServiceRow,
                              checked && styles.addonRowSelected,
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                          >
                            <View
                              style={[
                                styles.checkbox,
                                checked && styles.checkboxChecked,
                              ]}
                            >
                              {checked ? (
                                <Text style={styles.checkboxMark}>✓</Text>
                              ) : null}
                            </View>
                            <Text style={styles.addonLabel}>
                              {t(`booking.addon_${type}`)}
                            </Text>
                            <View style={{ flex: 1 }} />
                            <PriceHint type={type} nights={nights} />
                          </Pressable>
                        );
                      })}
                  </View>
                );
              })}
          </>
        ) : null}

        {/* Booking-wide services — currently just transport */}
        <Text style={styles.sectionLabel}>
          {t('booking.booking_services_label')}
        </Text>
        {(Object.keys(ADDON_CONFIG) as AddonType[])
          .filter((type) => ADDON_CONFIG[type].scope === 'booking')
          .filter((type) => isAddonAvailable(type, listing))
          .map((type) => {
            const checked = bookingAddons.has(type);
            return (
              <Pressable
                key={type}
                onPress={() => toggleBookingAddon(type)}
                style={[styles.addonRow, checked && styles.addonRowSelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <View
                  style={[styles.checkbox, checked && styles.checkboxChecked]}
                >
                  {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
                <Text style={styles.addonLabel}>
                  {t(`booking.addon_${type}`)}
                </Text>
                <View style={{ flex: 1 }} />
                <PriceHint type={type} nights={nights} />
              </Pressable>
            );
          })}

        {/* Per-line breakdown of base + add-ons */}
        {nights > 0 && selectedPetIds.size > 0 ? (
          <View style={styles.breakdownBox}>
            <View style={styles.breakdownLine}>
              <Text style={styles.breakdownLabel}>
                {t('booking.breakdown_base', {
                  pets: toArabicDigits(selectedPetIds.size),
                  nights: toArabicDigits(nights),
                })}
              </Text>
              <Text style={styles.breakdownValue}>
                {formatSAR(breakdown.baseSubtotalSAR)}
              </Text>
            </View>
            {breakdown.addonLines.map((line, i) => {
              const suffix =
                line.scope === 'per_pet' && line.cadence === 'one_time'
                  ? t('booking.per_pet_suffix_one_time', {
                      pets: toArabicDigits(line.petCount),
                    })
                  : line.scope === 'per_pet' && line.cadence === 'per_night'
                    ? t('booking.per_pet_suffix_per_night', {
                        pets: toArabicDigits(line.petCount),
                        nights: toArabicDigits(line.nights),
                      })
                    : line.scope === 'booking' && line.cadence === 'per_night'
                      ? t('booking.booking_suffix_per_night', {
                          nights: toArabicDigits(line.nights),
                        })
                      : '';
              return (
                <View key={`${line.type}-${i}`} style={styles.breakdownLine}>
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
        ) : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('booking.total_label')}</Text>
          <Text style={styles.totalValue}>{formatSAR(breakdown.totalSAR)}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={submitting || pets.length === 0}
          style={[
            styles.cta,
            (submitting || pets.length === 0) && styles.ctaDisabled,
          ]}
        >
          <Text style={styles.ctaText}>{submitLabel}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// PriceHint — small "+50 ر.س" / "+100 × 3 ليلة" suffix used in each
// add-on row. Reads cadence from ADDON_CONFIG.
// ---------------------------------------------------------------------------
function PriceHint({
  type,
  nights,
}: {
  type: AddonType;
  nights: number;
}) {
  const { t } = useTranslation();
  const cfg = ADDON_CONFIG[type];
  const priceStr = formatSAR(cfg.priceSAR);
  if (cfg.cadence === 'per_night') {
    if (nights > 0) {
      return (
        <Text style={styles.addonPrice}>
          {t('booking.price_hint_per_night', {
            price: priceStr,
            nights: toArabicDigits(nights),
          })}
        </Text>
      );
    }
    return (
      <Text style={styles.addonPrice}>
        {t('booking.price_hint_per_night_unit', { price: priceStr })}
      </Text>
    );
  }
  return <Text style={styles.addonPrice}>+{priceStr}</Text>;
}

// ---------------------------------------------------------------------------
// DateField — Platform-branched date input.
//
// Web: native HTML5 <input type="date">. inputRef forwards to the HTML
//   element so callers can call .focus() for auto-advance.
// Native: TextInput placeholder until @react-native-community/datetime
//   picker is wired in a follow-up (Section 13 TODO).
// ---------------------------------------------------------------------------
function DateField({
  value,
  onChange,
  min,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  if (Platform.OS === 'web') {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((<input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: colors.paper,
          borderColor: colors.whisper,
          borderWidth: 1,
          borderRadius: radii.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.lg,
          fontFamily: fonts.body,
          fontSize: 16,
          color: colors.ink,
          width: '100%',
          boxSizing: 'border-box',
        } as any}
      />) as unknown) as React.ReactElement
    );
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={colors.inkSoft}
      autoCapitalize="none"
      autoCorrect={false}
      inputMode="numeric"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  backLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  backLinkText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  subheading: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'left',
  },
  summary: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: spacing.lg,
    textAlign: 'right',
  },
  emptyCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.moss,
    borderRadius: radii.pill,
  },
  emptyButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
  },
  petList: {
    gap: spacing.sm,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderColor: colors.whisper,
    borderWidth: 2,
    gap: spacing.md,
  },
  petRowSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  petName: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
  },
  petCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderColor: colors.whisper,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  petCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  petCardName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  perPetServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.whisper,
    gap: spacing.sm,
  },
  breakdownBox: {
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
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
    textAlign: 'right',
  },
  breakdownValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    marginLeft: spacing.sm,
  },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderColor: colors.whisper,
    borderWidth: 2,
    gap: spacing.md,
  },
  addonRowSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  checkboxChecked: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  checkboxMark: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  addonLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  addonPrice: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
  },
  totalLabel: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  totalValue: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  cta: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

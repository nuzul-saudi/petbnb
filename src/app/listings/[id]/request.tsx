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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { createBookingRequest, type AddonInput } from '@/lib/bookings';
import { formatSAR, nightsBetween, toArabicDigits, todayIso } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { MockPaymentProvider } from '@/lib/payment';
import { listPetsForOwner } from '@/lib/pets';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import type { Enums, Tables } from '@/types/database';

type AddonOption = {
  type: Enums<'booking_addon_type'>;
  i18nKey: string;
  priceSAR: number;
  available: (listing: ListingDetail) => boolean;
};

const ADDON_OPTIONS: AddonOption[] = [
  { type: 'grooming', i18nKey: 'booking.addon_grooming', priceSAR: 50, available: (l) => l.offers_grooming },
  { type: 'vet', i18nKey: 'booking.addon_vet', priceSAR: 100, available: () => true },
  { type: 'transport', i18nKey: 'booking.addon_transport', priceSAR: 30, available: () => true },
  { type: 'insurance', i18nKey: 'booking.addon_insurance', priceSAR: 25, available: () => true },
];

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
  const [selectedAddons, setSelectedAddons] = useState<Set<Enums<'booking_addon_type'>>>(
    new Set(),
  );

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

  const nights = nightsBetween(startDate, endDate);
  const baseCost = listing ? nights * listing.nightly_price_sar : 0;
  const addonsList = useMemo<AddonInput[]>(
    () =>
      ADDON_OPTIONS.filter((opt) => selectedAddons.has(opt.type)).map((opt) => ({
        type: opt.type,
        priceSAR: opt.priceSAR,
      })),
    [selectedAddons],
  );
  const addonCost = addonsList.reduce((sum, a) => sum + a.priceSAR, 0);
  const total = baseCost + addonCost;

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

  const toggleAddon = (type: Enums<'booking_addon_type'>) => {
    setSelectedAddons((prev) => {
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
        amountSAR: total,
        description: listing.title_ar,
      });
      if (result.status !== 'authorized') {
        throw new Error(result.reason);
      }

      setSubmitStage('saving');
      const booking = await createBookingRequest({
        listingId: listing.id,
        ownerId: user.id,
        petIds: Array.from(selectedPetIds),
        startDate,
        endDate,
        basePriceSAR: listing.nightly_price_sar,
        totalSAR: total,
        addons: addonsList,
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
              total: formatSAR(baseCost),
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
                  {p.photo_url ? (
                    <Image
                      source={{ uri: p.photo_url }}
                      style={styles.petThumb}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : (
                    <View style={[styles.petThumb, styles.petThumbPlaceholder]}>
                      <Text style={styles.petThumbEmoji}>🐈</Text>
                    </View>
                  )}
                  <Text style={styles.petName}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Addons — multi-select checkboxes */}
        <Text style={styles.sectionLabel}>{t('booking.addon_section_label')}</Text>
        <View style={styles.addonList}>
          {ADDON_OPTIONS.map((opt) => {
            const available = opt.available(listing);
            const checked = selectedAddons.has(opt.type);
            return (
              <Pressable
                key={opt.type}
                onPress={() => available && toggleAddon(opt.type)}
                disabled={!available}
                style={[
                  styles.addonRow,
                  checked && styles.addonRowSelected,
                  !available && styles.addonRowDisabled,
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    checked && styles.checkboxChecked,
                    !available && styles.checkboxDisabled,
                  ]}
                >
                  {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
                <View style={styles.addonLeft}>
                  <Text
                    style={[
                      styles.addonLabel,
                      !available && styles.addonLabelDisabled,
                    ]}
                  >
                    {t(opt.i18nKey)}
                  </Text>
                  {!available ? (
                    <Text style={styles.unavailableNote}>
                      {t('booking.addon_unavailable')}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.addonPrice}>+{formatSAR(opt.priceSAR)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('booking.total_label')}</Text>
          <Text style={styles.totalValue}>{formatSAR(total)}</Text>
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
  petThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.whisper,
  },
  petThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  petThumbEmoji: {
    fontSize: 22,
  },
  petName: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
  },
  addonList: {
    gap: spacing.sm,
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
  addonRowDisabled: {
    opacity: 0.45,
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
  checkboxDisabled: {
    borderColor: colors.whisper,
  },
  checkboxMark: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  addonLeft: {
    flex: 1,
    gap: 2,
  },
  addonLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  addonLabelDisabled: {
    color: colors.inkSoft,
  },
  addonPrice: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  unavailableNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.terracotta,
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

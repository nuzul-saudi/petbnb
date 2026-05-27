import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { createBookingRequest, type AddonInput } from '@/lib/bookings';
import { formatSAR, nightsBetween, toArabicDigits, todayIso } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { MockPaymentProvider } from '@/lib/payment';
import { createPet, listPetsForOwner } from '@/lib/pets';
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
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [newPetName, setNewPetName] = useState('');
  const [addonType, setAddonType] = useState<Enums<'booking_addon_type'> | null>(
    null,
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'idle' | 'paying' | 'saving'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  // Load listing + existing pets in parallel.
  useEffect(() => {
    if (!listingId || !user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getListingWithPhotos(listingId), listPetsForOwner(user.id)])
      .then(([l, p]) => {
        if (cancelled) return;
        setListing(l);
        setPets(p);
        if (p.length === 1) setSelectedPetId(p[0].id);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'load_failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, user]);

  const nights = nightsBetween(startDate, endDate);
  const baseCost = listing ? nights * listing.nightly_price_sar : 0;
  const selectedAddon = useMemo(
    () => ADDON_OPTIONS.find((a) => a.type === addonType) ?? null,
    [addonType],
  );
  const addonCost = selectedAddon?.priceSAR ?? 0;
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

  const validate = (): string | null => {
    if (!startDate || startDate < todayIso()) return t('booking.invalid_start_date');
    if (!endDate || nights <= 0) return t('booking.invalid_end_date');
    if (!selectedPetId && newPetName.trim() === '') return t('booking.pet_required');
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
      // 1. Ensure we have a pet to attach to the booking.
      let petId = selectedPetId;
      if (!petId) {
        const created = await createPet({
          ownerId: user.id,
          name: newPetName,
        });
        petId = created.id;
      }

      // 2. Authorize payment (mocked).
      setSubmitStage('paying');
      const result = await MockPaymentProvider.authorize({
        bookingId: 'pending',
        amountSAR: total,
        description: listing.title_ar,
      });
      if (result.status !== 'authorized') {
        throw new Error(result.reason);
      }

      // 3. Write the booking + addon.
      setSubmitStage('saving');
      const addon: AddonInput | undefined = selectedAddon
        ? {
            type: selectedAddon.type,
            priceSAR: selectedAddon.priceSAR,
          }
        : undefined;
      const booking = await createBookingRequest({
        listingId: listing.id,
        ownerId: user.id,
        petId,
        startDate,
        endDate,
        basePriceSAR: listing.nightly_price_sar,
        totalSAR: total,
        addon,
      });

      router.replace(`/bookings/${booking.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('booking.submit_failed'));
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
        <Text style={styles.heading}>{t('booking.request_title')}</Text>
        <Text style={styles.subheading}>{listing.title_ar}</Text>

        {/* Dates */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('booking.start_date_label')}</Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder={t('booking.date_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="numeric"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('booking.end_date_label')}</Text>
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            placeholder={t('booking.date_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="numeric"
            style={styles.input}
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

        {/* Pet */}
        <Text style={styles.sectionLabel}>{t('booking.pet_section_label')}</Text>
        {pets.length > 0 ? (
          <View style={styles.petList}>
            {pets.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  setSelectedPetId(p.id);
                  setNewPetName('');
                }}
                style={[
                  styles.petRow,
                  selectedPetId === p.id && styles.petRowSelected,
                ]}
              >
                <Text style={styles.petName}>🐈 {p.name}</Text>
                {selectedPetId === p.id ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.subtleLabel}>
          {pets.length > 0 ? t('booking.pet_add_new_label') : ''}
        </Text>
        <TextInput
          value={newPetName}
          onChangeText={(v) => {
            setNewPetName(v);
            if (v.trim() !== '') setSelectedPetId(null);
          }}
          placeholder={t('booking.pet_name_placeholder')}
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        {/* Addons */}
        <Text style={styles.sectionLabel}>{t('booking.addon_section_label')}</Text>
        <View style={styles.addonList}>
          <Pressable
            onPress={() => setAddonType(null)}
            style={[
              styles.addonRow,
              addonType === null && styles.addonRowSelected,
            ]}
          >
            <Text style={styles.addonLabel}>{t('booking.addon_none')}</Text>
            {addonType === null ? <Text style={styles.checkmark}>✓</Text> : null}
          </Pressable>
          {ADDON_OPTIONS.map((opt) => {
            const available = opt.available(listing);
            return (
              <Pressable
                key={opt.type}
                onPress={() => available && setAddonType(opt.type)}
                disabled={!available}
                style={[
                  styles.addonRow,
                  addonType === opt.type && styles.addonRowSelected,
                  !available && styles.addonRowDisabled,
                ]}
              >
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
                <Text style={styles.addonPrice}>
                  +{formatSAR(opt.priceSAR)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('booking.total_label')}</Text>
          <Text style={styles.totalValue}>{formatSAR(total)}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={[styles.cta, submitting && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>{submitLabel}</Text>
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
  subtleLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
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
  petList: {
    gap: spacing.sm,
  },
  petRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderColor: colors.whisper,
    borderWidth: 2,
  },
  petRowSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  petName: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  checkmark: {
    fontSize: 18,
    color: colors.moss,
    fontFamily: fonts.bodyBold,
  },
  addonList: {
    gap: spacing.sm,
  },
  addonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderColor: colors.whisper,
    borderWidth: 2,
  },
  addonRowSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  addonRowDisabled: {
    opacity: 0.45,
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

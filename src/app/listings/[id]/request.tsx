import { logWarn } from '@/lib/log';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { SearchWhenModal } from '@/components/SearchWhenModal';
import { PetAvatar } from '@/components/PetAvatar';
import { useAuth } from '@/lib/auth';
import {
  createBookingRequest,
  getBookingForEdit,
  updateBookingRequest,
  type AddonInput,
} from '@/lib/bookings';
import {
  formatSAR,
  nightsBetween,
  pickLocalized,
  toArabicDigits,
  todayIso,
} from '@/lib/format';
import { formatDate } from '@/lib/date';
import { useTranslation } from '@/lib/i18n';
import {
  isRangeBlocked,
  listBlockedRanges,
  type BlockedRange,
} from '@/lib/availability';
import { worstVaccinationStatus } from '@/lib/vaccination';
import { getListingWithPhotos, type ListingDetail } from '@/lib/listings';
import { MockPaymentProvider } from '@/lib/payment';
import {
  CANCELLATION_FULL_REFUND_HOURS,
  CANCELLATION_LATE_REFUND_RATE,
  snapshotFees,
} from '@/lib/payments-policy';
import { listPetsForOwner } from '@/lib/pets';
import { useSignedPetPhotoUrls } from '@/hooks/useSignedPetPhotoUrls';
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
//
// 2026-06-25 (migration 0041) — gate every addon by its per-host
// offers_* flag. Booking request now hides any addon the host hasn't
// opted in to. Default for ALL flags is false on new listings — hosts
// must explicitly enable each service in their listing edit screen.
const ADDON_AVAILABILITY: Partial<
  Record<AddonType, (l: ListingDetail) => boolean>
> = {
  grooming: (l) => l.offers_grooming,
  vet: (l) => l.offers_vet,
  insurance: (l) => l.offers_insurance,
  transport: (l) => l.offers_transport,
};

function isAddonAvailable(type: AddonType, listing: ListingDetail): boolean {
  const check = ADDON_AVAILABILITY[type];
  return check ? check(listing) : true;
}

// ISO-date 'YYYY-MM-DD' arithmetic: returns the date one day after the
// nextDayIso was retired 2026-06-26 with the date-card UX swap. The
// SearchWhenModal's RangeCalendar handles end-day clamping internally.

export default function BookingRequestScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
  const params = useLocalSearchParams<{
    id?: string;
    editBooking?: string;
    rebookFrom?: string;
    // Move 4 — search-context prefill from the feed.
    startDate?: string;
    endDate?: string;
    petId?: string;
    /** Fix 4 (2026-06-13). Comma-joined pet ids for multi-pet search. */
    petIds?: string;
    /**
     * 0046 (β thread continuity) — when the booking-request flow is
     * entered from an inquiry's "Request booking" CTA, this carries
     * the inquiry id forward so the created booking row's inquiry_id
     * column is populated. The comprehensive timeline on the
     * inquiry detail screen then links the new booking into the
     * pre-booking conversation as a booking-block. Absent for
     * direct-from-listing bookings; createBookingRequest leaves
     * inquiry_id null in that case.
     */
    inquiryId?: string;
  }>();
  const listingId = typeof params.id === 'string' ? params.id : '';
  const editBookingId =
    typeof params.editBooking === 'string' && params.editBooking.length > 0
      ? params.editBooking
      : null;
  const isEditMode = editBookingId !== null;
  // One-tap rebook (post-Round-7 polish). When this URL param is
  // present we load the source booking's pets + addons and pre-fill
  // the form — dates stay blank since the user is picking new ones.
  // Mutually exclusive with editBooking; if both are present, edit
  // wins (more conservative, since edit is a write-back path).
  const rebookFromId =
    typeof params.rebookFrom === 'string' && params.rebookFrom.length > 0
      ? params.rebookFrom
      : null;
  const isRebookMode = !isEditMode && rebookFromId !== null;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [pets, setPets] = useState<Tables<'pets'>[]>([]);
  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([]);
  // 2026-06-26 — Airbnb-style date card opens the SearchWhenModal
  // (same modal the home-page search hero uses). Modal hosts the
  // RangeCalendar, which dims blocked dates.
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Round 6 — batch-sign pet photos for the multi-pet picker.
  const signedPetPhotos = useSignedPetPhotoUrls(pets.map((p) => p.photo_url));

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

  useEffect(() => {
    if (!listingId || !user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getListingWithPhotos(listingId),
      listPetsForOwner(user.id),
      listBlockedRanges(listingId),
    ])
      .then(([l, p, blocks]) => {
        if (cancelled) return;
        setListing(l);
        setPets(p);
        setBlockedRanges(blocks);
        // Only auto-select in create mode — edit mode hydrates pets from
        // the existing booking via the dedicated effect below.
        if (!editBookingId && p.length === 1)
          setSelectedPetIds(new Set([p[0].id]));
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
  }, [listingId, user, editBookingId]);

  // Edit mode: hydrate dates, pet selection, per-pet add-ons, and booking-
  // wide add-ons from the existing booking. Runs once on mount when an
  // editBooking id is present. Mismatched listing → error.
  useEffect(() => {
    if (!editBookingId) return;
    let cancelled = false;
    getBookingForEdit(editBookingId)
      .then((edit) => {
        if (cancelled) return;
        // Defensive: confirm the editBooking actually belongs to this
        // listing. If a stale URL lands on the wrong route, fail loudly
        // instead of silently editing the wrong listing's booking.
        if (edit.booking.listing_id !== listingId) {
          setError(t('booking.edit_listing_mismatch'));
          return;
        }
        setStartDate(edit.booking.start_date);
        setEndDate(edit.booking.end_date);
        setSelectedPetIds(new Set(edit.petIds));
        setPerPetAddons(edit.perPetAddons);
        setBookingAddons(edit.bookingAddons);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn('[booking.edit_load_failed]', e);
        setError(t('booking.edit_load_failed'));
      });
    return () => {
      cancelled = true;
    };
  }, [editBookingId, listingId, t]);

  // One-tap rebook: hydrate pets + addons (NOT dates — the user
  // picks new ones) from a prior booking. Reuses the same
  // getBookingForEdit helper since the read shape is identical;
  // edit-only-on-requested gate doesn't matter here because we
  // only consume the hydrated values, never write back to the
  // source booking. Listing-mismatch is fine here too — the user
  // is rebooking a SPECIFIC listing, even if it differs from the
  // original (e.g. "Book a similar place").
  useEffect(() => {
    if (!rebookFromId) return;
    let cancelled = false;
    getBookingForEdit(rebookFromId)
      .then((edit) => {
        if (cancelled) return;
        // Pets: only auto-select the ones the owner still owns
        // (pet might have been deleted between bookings).
        const stillOwnedPetIds = new Set(
          edit.petIds.filter((id) => pets.some((p) => p.id === id)),
        );
        setSelectedPetIds(stillOwnedPetIds);
        // Per-pet addons: same filter — drop entries for pets the
        // owner no longer has.
        const filteredPerPet = new Map<string, Set<AddonType>>();
        for (const [petId, types] of edit.perPetAddons) {
          if (stillOwnedPetIds.has(petId)) filteredPerPet.set(petId, types);
        }
        setPerPetAddons(filteredPerPet);
        setBookingAddons(edit.bookingAddons);
        // Dates intentionally left blank — fresh stay.
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn('[booking.rebook_load_failed]', e);
        // Silent recovery: blank form is better than an error
        // screen for a "book again" tap. User can fill in manually.
      });
    return () => {
      cancelled = true;
    };
  }, [rebookFromId, pets]);

  // Move 4 — prefill from the search context the feed forwarded.
  // Skipped in edit / rebook modes because those have their own
  // prefill paths and the user's intent there is different.
  // Pets-aware on petIds (Fix 4 multi-pet): only auto-select the
  // ones that still exist among the owner's current pets. Legacy
  // singular `petId` is also accepted for back-compat with any
  // bookmarked URLs.
  useEffect(() => {
    if (isEditMode || isRebookMode) return;
    if (typeof params.startDate === 'string' && params.startDate) {
      setStartDate(params.startDate);
    }
    if (typeof params.endDate === 'string' && params.endDate) {
      setEndDate(params.endDate);
    }
    // Multi-pet (Fix 4): petIds is comma-joined; split, filter to
    // still-owned, hydrate the Set.
    let prefillIds: string[] = [];
    if (typeof params.petIds === 'string' && params.petIds) {
      prefillIds = params.petIds.split(',').filter(Boolean);
    } else if (typeof params.petId === 'string' && params.petId) {
      prefillIds = [params.petId];
    }
    if (prefillIds.length > 0) {
      const validIds = prefillIds.filter((id) =>
        pets.some((p) => p.id === id),
      );
      if (validIds.length > 0) {
        setSelectedPetIds(new Set(validIds));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pets, isEditMode, isRebookMode]);

  // 2026-06-25 — the start \xe2\x86\x92 end auto-focus effect was retired with
  // the DateField swap. SearchWhenModal's RangeCalendar handles the
  // two-tap selection internally; first tap sets start, second tap
  // sets end. No focus management needed on the parent. (Earlier
  // intermediate refactor referenced an AvailabilityCalendar
  // component which has since been deleted in FIX 2.)

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

  // Listing-defined cap. Selection beyond this is blocked at submit and
  // surfaces an inline error. Read directly off the loaded ListingDetail.
  const maxPets = listing?.max_concurrent_pets ?? 1;
  const tooManyPets = selectedPetIds.size > maxPets;

  // Milestone A: vaccination soft-warn. Updated by audit finding C4
  // (2026-06-11): previously only checked PRESENCE — a 2020-vaccinated
  // cat passed silently. Now also flags dates older than the
  // helper's max age (365 days by default). Renders "expired" if any
  // selected pet has an outdated date, else "missing" if any is
  // blank. Still a soft warn (host decides case-by-case).
  const vaccinationWarningStatus: 'missing' | 'expired' | null = (() => {
    if (!listing?.requires_vaccination) return null;
    if (selectedPetIds.size === 0) return null;
    const selectedPets = pets.filter((p) => selectedPetIds.has(p.id));
    return worstVaccinationStatus(selectedPets, new Date().toISOString());
  })();

  // Milestone B: blocked-range pre-check. Client-side warning when the
  // chosen dates overlap any of the host's blocked ranges. The DB
  // trigger in 0027 is the hard gate; this is the friendly surface.
  const blockedRangeWarning = (() => {
    if (!listingId || !startDate || !endDate || nights <= 0) return false;
    return isRangeBlocked(startDate, endDate, blockedRanges);
  })();

  // Same logic as the relevant branches of validate(), but available to
  // render so we can show an inline error while the user is still typing.
  // Returns the i18n string when invalid; null when ok or empty.
  const endDateError: string | null = (() => {
    if (!endDate) return null;
    // endDate set but startDate missing — treat as invalid; pushes user to
    // fix the start first.
    if (!startDate) return t('booking.invalid_end_date');
    if (endDate <= startDate) return t('booking.invalid_end_date');
    return null;
  })();

  // L4 (2026-06-27) — scroll-to-field + red-ring on blocked-date
  // overlap. When the host's blocked ranges collide with the picked
  // dates, the submit Button goes disabled (the existing behavior).
  // Pre-L4 the user had no idea why \xe2\x80\x94 the disabled state was a
  // silent dead-end. Now:
  //   * scrollRef on the outer ScrollView
  //   * dateCardRef on the date Pressable (measureInWindow gives y)
  //   * dateCardErrorRing state flashes a terracotta border on the
  //     date card for ~3 seconds.
  // Triggered on submit-while-blocked AND auto-cleared when the
  // user picks a fresh range (the next blocked-range collision
  // re-triggers if it still overlaps).
  const scrollRef = useRef<ScrollView>(null);
  const dateCardRef = useRef<View>(null);
  const [dateCardErrorRing, setDateCardErrorRing] = useState(false);
  // Auto-clear ring when the user picks new dates \xe2\x80\x94 the visual
  // alarm shouldn't linger past the user's response to it.
  useEffect(() => {
    if (dateCardErrorRing) setDateCardErrorRing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);
  const flashDateCardError = () => {
    setDateCardErrorRing(true);
    // measureInWindow returns absolute viewport coords; subtract the
    // ScrollView's own offset to get the scroll target. measure() is
    // RN-Web safe \xe2\x80\x94 onLayout would also work but only fires on
    // mount/layout-change, not on demand.
    dateCardRef.current?.measureInWindow((_x, y) => {
      // Soft cushion above the card so the field isn't flush against
      // the header bar after the scroll. spacing.xxl matches the
      // generous-spacing convention in the design system.
      const target = Math.max(0, y - 80);
      scrollRef.current?.scrollTo({ y: target, animated: true });
    });
    // Auto-clear after 3s if the user hasn't responded yet (the
    // startDate/endDate effect above clears earlier on user action).
    setTimeout(() => setDateCardErrorRing(false), 3000);
  };

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

  // R2C1 — self-booking guard. If the URL is opened directly (or
  // bookmarked) for the viewer's own listing, refuse the form and
  // show the same inert notice as the listing detail. Mirrors the
  // app-level check in createBookingRequest + the DB RLS in 0029.
  if (user && listing.host_id === user.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <View
            style={{
              backgroundColor: colors.whisper,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.gold,
              padding: spacing.lg,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                color: colors.ink,
                lineHeight: 20,
                textAlign: 'center',
              }}
            >
              {t('listing.self_booking_notice')}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              router.replace({
                pathname: '/listings/[id]',
                params: { id: listing.id },
              })
            }
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>
              {t('booking.back_to_listing')}
            </Text>
          </Pressable>
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
    if (selectedPetIds.size > maxPets) {
      return t('booking.max_pets_exceeded', { count: maxPets });
    }
    if (selectedPetIds.size === 0) return t('booking.pet_required');
    // 2026-06-25 — hard block on dates overlapping the host's blocked
    // ranges. The DB trigger from 0027 rejects this at the accept-side
    // anyway; the booking-request submit doesn't need to wait for that
    // round trip and the host's queue stays clean.
    if (isRangeBlocked(startDate, endDate, blockedRanges)) {
      return t('booking.blocked_dates_error');
    }
    return null;
  };

  const onSubmit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      // L4 \xe2\x80\x94 if the validation failure is a date-related one
      // (start invalid, end invalid, OR blocked-range collision),
      // scroll the user to the date card and flash a red ring. The
      // disabled Button on its own gave no signal about why submit
      // didn't work; this puts the failure surface in front of the
      // user. Pet-related and other validation errors keep the
      // existing red error text without the scroll \xe2\x80\x94 those
      // surfaces are closer to the Button so the user can find
      // them.
      const isDateFailure =
        v === t('booking.invalid_start_date') ||
        v === t('booking.invalid_end_date') ||
        v === t('booking.blocked_dates_error');
      if (isDateFailure) flashDateCardError();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      setSubmitStage('paying');
      const result = await MockPaymentProvider.authorize({
        bookingId: 'pending',
        amountSAR: breakdown.totalSAR,
        description: pickLocalized(listing.title_ar, listing.title_en, locale),
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

      const sharedPayload = {
        petIds: Array.from(selectedPetIds),
        startDate,
        endDate,
        basePriceSAR: listing.nightly_price_sar,
        baseSubtotalSAR: breakdown.baseSubtotalSAR,
        additionalPetDiscount: listing.additional_pet_discount,
        totalSAR: breakdown.totalSAR,
        addons: addonsForDb,
      };

      let bookingId: string;
      if (isEditMode && editBookingId) {
        const updated = await updateBookingRequest({
          bookingId: editBookingId,
          ...sharedPayload,
        });
        bookingId = updated.id;
      } else {
        const booking = await createBookingRequest({
          listingId: listing.id,
          ownerId: user.id,
          ...sharedPayload,
          // 0046 — thread the inquiry id forward when present so the
          // created booking row's inquiry_id column is set. Omitted
          // gracefully when the user reached this screen directly
          // from a listing page (no inquiry context).
          ...(typeof params.inquiryId === 'string' && params.inquiryId
            ? { inquiryId: params.inquiryId }
            : {}),
        });
        bookingId = booking.id;
      }

      router.replace({ pathname: '/bookings/[id]', params: { id: bookingId } });
    } catch (e) {
      // Test round 3 (2026-06-10): include the message tail in the
      // user-facing error so a hidden capacity_exceeded / blocked_range /
      // RLS rejection surfaces instead of a flat "couldn't submit".
      // Friendly i18n stays the prefix; the server detail is the suffix.
      logWarn('[booking.submit_failed]', e);
      const detail =
        e instanceof Error && e.message ? `: ${e.message}` : '';
      setError(`${t('booking.submit_failed')}${detail}`);
    } finally {
      setSubmitting(false);
      setSubmitStage('idle');
    }
  };

  const submitLabel =
    submitStage === 'paying'
      ? t('booking.processing_payment')
      : submitStage === 'saving'
        ? isEditMode
          ? t('booking.edit_saving')
          : t('booking.submitting')
        : isEditMode
          ? t('booking.edit_save_button')
          : t('booking.submit_button');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <Pressable
          onPress={() => {
            if (isEditMode && editBookingId) {
              router.replace({
                pathname: '/bookings/[id]',
                params: { id: editBookingId },
              });
            } else {
              router.replace({
                pathname: '/listings/[id]',
                params: { id: listing.id },
              });
            }
          }}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>
            {isEditMode
              ? t('booking.edit_back_to_booking')
              : t('booking.back_to_listing')}
          </Text>
        </Pressable>

        <Text style={styles.heading}>
          {isEditMode ? t('booking.edit_title') : t('booking.request_title')}
        </Text>
        <Text style={styles.subheading}>
          {pickLocalized(listing.title_ar, listing.title_en, locale)}
        </Text>

        {/* 2026-06-26 — Airbnb-style two-cell date card. Single
            bordered container with CHECK-IN / CHECKOUT cells split
            by a vertical divider. Tapping either cell opens the
            shared SearchWhenModal (RangeCalendar inside), which
            dims blocked dates and rejects taps on them.
            (Historical: an earlier intermediate refactor used an
            inline AvailabilityCalendar component; deleted in FIX 2.) */}
        <Pressable
          ref={dateCardRef}
          onPress={() => setDatePickerOpen(true)}
          style={[
            styles.dateCard,
            // L4 \xe2\x80\x94 red ring when the user tried to submit with a
            // blocked-date overlap. Cleared by the next dates change
            // or by the 3s setTimeout in flashDateCardError.
            dateCardErrorRing && {
              borderColor: colors.terracotta,
              borderWidth: 2,
            },
          ]}
        >
          <View style={styles.dateCardCell}>
            <Text style={styles.dateCardLabel}>
              {t('booking.check_in')}
            </Text>
            <Text
              style={[
                styles.dateCardValue,
                !startDate && styles.dateCardValuePlaceholder,
              ]}
            >
              {startDate
                ? formatDate(startDate, locale, 'short')
                : t('booking.add_date')}
            </Text>
          </View>
          <View style={styles.dateCardDivider} />
          <View style={styles.dateCardCell}>
            <Text style={styles.dateCardLabel}>
              {t('booking.check_out')}
            </Text>
            <Text
              style={[
                styles.dateCardValue,
                !endDate && styles.dateCardValuePlaceholder,
              ]}
            >
              {endDate
                ? formatDate(endDate, locale, 'short')
                : t('booking.add_date')}
            </Text>
          </View>
        </Pressable>
        {endDateError ? (
          <Text style={styles.errorText}>{endDateError}</Text>
        ) : null}

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
        <Text style={styles.sectionLabel}>
          {t('booking.pet_section_label')}
        </Text>
        {listing ? (
          <Text style={styles.sectionSubtitle}>
            {t('listing.max_pets', { count: maxPets })}
          </Text>
        ) : null}
        {pets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('booking.no_pets_title')}</Text>
            <Text style={styles.emptyBody}>{t('booking.no_pets_body')}</Text>
            {/* FIX 4 — empty-state add-pet CTA via shared Button. */}
            <Button
              label={t('booking.no_pets_button')}
              onPress={() =>
                router.push({
                  pathname: '/pets/[id]',
                  params: { id: 'new' },
                })
              }
              variant="primary"
            />
          </View>
        ) : (
          <View style={styles.petList}>
            {pets.map((p) => {
              const checked = selectedPetIds.has(p.id);
              // At-cap: checked cats stay tappable (so user can uncheck to
              // swap); unchecked cats are hard-blocked + visually disabled.
              const atCap = selectedPetIds.size >= maxPets;
              const blocked = atCap && !checked;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    if (!blocked) togglePet(p.id);
                  }}
                  disabled={blocked}
                  style={[
                    styles.petRow,
                    checked && styles.petRowSelected,
                    blocked && styles.petRowBlocked,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: blocked }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      checked && styles.checkboxChecked,
                    ]}
                  >
                    {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <PetAvatar
                    photoUrl={p.photo_url ? signedPetPhotos.get(p.photo_url) ?? null : null}
                    breed={p.breed}
                    size={44}
                  />
                  <Text style={styles.petName}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {tooManyPets ? (
          <Text style={styles.errorText}>
            {t('booking.max_pets_exceeded', { count: maxPets })}
          </Text>
        ) : null}

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
                        photoUrl={p.photo_url ? signedPetPhotos.get(p.photo_url) ?? null : null}
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
                  pets_phrase: t('booking.breakdown_pets_phrase', {
                    count: selectedPetIds.size,
                  }),
                  nights_phrase: t('booking.breakdown_nights_phrase', {
                    count: nights,
                  }),
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

        {/* S1 — service fee + total charged. Shown after the booking
            subtotal so the owner sees exactly what their card is
            charged. snapshotFees mirrors what the host-accept
            mutation writes; numbers here = numbers persisted then. */}
        {breakdown.totalSAR > 0 ? (() => {
          const fees = snapshotFees(breakdown.totalSAR);
          return (
            <>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>
                  {t('booking.owner_fee_label')}
                </Text>
                <Text style={styles.feeValue}>
                  {formatSAR(fees.ownerFeeSAR)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {t('booking.total_charged_label')}
                </Text>
                <Text style={styles.totalValue}>
                  {formatSAR(fees.totalChargedSAR)}
                </Text>
              </View>
            </>
          );
        })() : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Milestone A vaccination soft-warn — split by status. */}
        {vaccinationWarningStatus === 'expired' ? (
          <Text style={styles.vaccinationWarning}>
            {t('booking.pet_vaccination_warning_expired')}
          </Text>
        ) : vaccinationWarningStatus === 'missing' ? (
          <Text style={styles.vaccinationWarning}>
            {t('booking.pet_vaccination_warning_missing')}
          </Text>
        ) : null}

        {/* Milestone B — dates overlap a host-blocked range. The DB
            trigger will reject the booking on host accept anyway; this
            surfaces it earlier so the owner picks new dates. */}
        {blockedRangeWarning ? (
          <Text style={styles.vaccinationWarning}>
            {t('booking.blocked_range_warning')}
          </Text>
        ) : null}

        {/* Phase 3 — cancellation-policy disclosure. Shown BEFORE the
            owner commits; the tier copy renders from the payments-policy
            constants so it can never drift from the refund math. */}
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>
            {t('cancellation_policy.title')}
          </Text>
          <Text style={styles.policyLine}>
            {t('cancellation_policy.tier_full', {
              hours: CANCELLATION_FULL_REFUND_HOURS,
            })}
          </Text>
          <Text style={styles.policyLine}>
            {t('cancellation_policy.tier_half', {
              hours: CANCELLATION_FULL_REFUND_HOURS,
              percent: Math.round(CANCELLATION_LATE_REFUND_RATE * 100),
            })}
          </Text>
          <Text style={styles.policyLine}>
            {t('cancellation_policy.tier_none')}
          </Text>
        </View>

        {/* FIX 5 (2026-06-26) — submit Button moved out of the
            ScrollView into the sticky footer below. Keeps the bottom
            of the form scrollable above the sticky bar. */}
      </ScrollView>

      {/* FIX 5 \xe2\x80\x94 sticky summary bar pinned to the viewport. Running
          total + nights + pet count on the leading edge; shared Button
          on the trailing edge. KeyboardAvoidingView wrapper at the
          SafeAreaView level handles the on-screen keyboard so the bar
          isn't hidden when a TextInput (e.g. notes) is focused. */}
      <View style={styles.stickyBar}>
        <View style={styles.stickyBarSummary}>
          <Text style={styles.stickyBarTotal}>
            {formatSAR(breakdown.totalSAR)}
          </Text>
          <Text style={styles.stickyBarMeta}>
            {nights > 0
              ? t('booking.nights_count', {
                  nights: toArabicDigits(nights),
                })
              : t('booking.no_dates_hint')}
            {' \xc2\xb7 '}
            {t('booking.cats_count', {
              n: toArabicDigits(selectedPetIds.size),
            })}
          </Text>
        </View>
        <View style={styles.stickyBarCta}>
          <Button
            label={submitLabel}
            onPress={onSubmit}
            variant="primary"
            fullWidth
            loading={submitting}
            // L4 (2026-06-27) \xe2\x80\x94 blockedRangeWarning dropped from the
            // disabled list. Was hiding the date error behind a
            // dead-on-arrival button; now validate() catches the
            // overlap on submit and triggers the scroll-to-card +
            // red-ring via flashDateCardError() so the user sees
            // WHY their submit failed. The other three conditions
            // stay disabled because their fix surfaces are inline:
            // pet-empty has its own add-pet CTA, tooManyPets shows
            // the count limit, endDateError prints below the card.
            disabled={
              pets.length === 0 ||
              tooManyPets ||
              !!endDateError
            }
          />
        </View>
      </View>

      {/* 2026-06-26 — date range picker modal. Same SearchWhenModal
          the home page uses, now extended with blockedRanges so the
          host's unavailable days render dimmed + struck-through and
          can't be tapped. */}
      <SearchWhenModal
        visible={datePickerOpen}
        startDate={startDate || null}
        endDate={endDate || null}
        blockedRanges={blockedRanges}
        onApply={({ startDate: s, endDate: e }) => {
          setStartDate(s ?? '');
          setEndDate(e ?? '');
        }}
        onClose={() => setDatePickerOpen(false)}
      />
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.md,
    // FIX 5 \xe2\x80\x94 reserve room for the sticky footer so the last form
    // section isn't permanently hidden behind the bar (the bar's
    // height is ~76px; padding it generously prevents jitter when
    // the keyboard pops up).
    paddingBottom: 120,
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
  },
  subheading: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
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
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: spacing.lg,
  },
  sectionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
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
  petRowBlocked: {
    opacity: 0.4,
  },
  petName: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
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
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.sm,
  },
  feeLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  feeValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
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
  vaccinationWarning: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.whisper,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 8,
    padding: 12,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  // Phase 3 — cancellation-policy disclosure card.
  policyCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  policyTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  policyLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  // 2026-06-26 — Airbnb-style two-cell date card. Single bordered
  // container, two cells split by a vertical divider. Mirrors the
  // pattern in the Airbnb reservation block.
  // FIX 5 (2026-06-26) \xe2\x80\x94 sticky summary bar pinned to the bottom of
  // the viewport. Always shows running total + nights/cats summary
  // on the leading edge; submit Button on the trailing edge. Top
  // shadow + whisper top border per the design review spec; paper
  // background so the form content scrolls behind it tinted not
  // covered.
  stickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    // Soft top shadow per the design spec; renders on web via boxShadow
    // and on native via shadow* (deprecated but still in our stack).
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 8,
  },
  stickyBarSummary: {
    flex: 1,
    gap: 2,
  },
  stickyBarTotal: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
  },
  stickyBarMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  stickyBarCta: {
    minWidth: 140,
  },
  dateCard: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    overflow: 'hidden',
  },
  dateCardCell: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  dateCardDivider: {
    width: 1,
    backgroundColor: colors.whisper,
  },
  dateCardLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  dateCardValue: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  dateCardValuePlaceholder: {
    color: colors.inkSoft,
  },
});

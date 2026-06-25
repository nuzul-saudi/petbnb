// Shared listing form — the 10-field create/edit body extracted from
// the original src/app/listings/new.tsx (Step 7.2d) so the same UI
// can back both /listings/new and /listings/[id]/edit (Step 7.5).
//
// Scope: the FORM itself — fields, validation, the district modal
// picker, the Save/Cancel buttons. NOT the screen scaffolding (the
// SafeAreaView + AppHeader + ScrollView wrappers and the back-link/
// title header live in the parent screens, since both consumers
// surround the form with the same structure but feed it different
// labels and route targets).
//
// Submit model: the parent owns the network call. ListingForm
// validates, then if-and-only-if valid calls onSave(values). The
// parent flips `saving` to true around its own API call and surfaces
// the result as `saveError`. ListingForm never sees the supabase
// client; it never knows about hostId, listing.id, or status.

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CITIES, findCity, type CityKey } from '@/lib/cities';
import { SPECIES_ENABLED } from '@/lib/features';
import { pickLocalized, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { SPECIES_LIST, speciesEmoji } from '@/lib/species';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type HostGender = 'female' | 'male';
type FieldKey =
  | 'title'
  | 'description'
  | 'district'
  | 'hostGender'
  | 'nightlyPrice'
  | 'maxCats';

// Constants ported verbatim from the original create screen. The stepper
// floor/ceiling and the default nightly price are part of the form's
// behavioural contract — keeping them unchanged is what makes the
// extraction safe for the create flow.
const MAX_CATS_FLOOR = 1;
const MAX_CATS_CEILING = 20;
const DEFAULT_NIGHTLY_PRICE = '150';

/**
 * The clean value shape produced by a successful submit. Matches the
 * createListing input minus hostId, and updateListing's patch shape
 * minus status — the parent screens add those two API-specific extras
 * when calling their respective lib functions.
 */
export type ListingFormValues = {
  city: CityKey;
  neighborhood: string; // district slug
  title: string;
  description: string;
  nightlyPrice: number;
  maxConcurrentPets: number;
  hasResidentPets: boolean;
  residentPetsNote: string | null;
  offersGrooming: boolean;
  // 0041 — per-host service-addon opt-ins. Default false on new
  // listings; the booking-request screen filters its addon
  // checkboxes by these flags so guests only see what the host
  // actually offers.
  offersVet: boolean;
  offersInsurance: boolean;
  offersTransport: boolean;
  hostGender: HostGender;
  requiresVaccination: boolean;
  // Round 12 / Step 5.7 — at least one species must be selected. The
  // UI prevents submission with an empty array; the DB check
  // constraint (migration 0034) is a backstop.
  acceptsSpecies: ('cat' | 'dog')[];
};

export type ListingFormProps = {
  /**
   * Optional prefill — used by the edit screen. Omitting it lands on
   * the create-form defaults (riyadh / no district / empty text /
   * '150' nightly price / 1 max cat / no resident pets / no grooming /
   * no gender choice).
   */
  initialValues?: Partial<ListingFormValues>;
  saving: boolean;
  saveError: string | null;
  saveLabel: string;
  savingLabel: string;
  cancelLabel: string;
  /**
   * When true, the Save button is disabled until at least one field
   * value differs from the initialValues snapshot. The edit screen
   * uses this so a no-change Save never creates an empty draft.
   * The create screen leaves it off (default false) — Save is
   * enabled from the first valid render.
   */
  requireDirty?: boolean;
  onSave: (values: ListingFormValues) => void | Promise<void>;
  onCancel: () => void;
};

export function ListingForm({
  initialValues,
  saving,
  saveError,
  saveLabel,
  savingLabel,
  cancelLabel,
  requireDirty = false,
  onSave,
  onCancel,
}: ListingFormProps) {
  const { t, locale } = useTranslation();

  // Form state — 10 fields. useState(...) reads initialValues once on
  // mount; subsequent prop changes don't overwrite local state, which
  // is what we want (the form is uncontrolled from the parent's view).
  // The edit screen blocks rendering ListingForm until the listing is
  // loaded, so initialValues is final by the time we get here.
  const [city, setCity] = useState<CityKey>(initialValues?.city ?? 'riyadh');
  const [districtKey, setDistrictKey] = useState<string | null>(
    initialValues?.neighborhood ?? null,
  );
  const [listingTitle, setListingTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );
  const [nightlyPrice, setNightlyPrice] = useState(
    initialValues?.nightlyPrice != null
      ? String(initialValues.nightlyPrice)
      : DEFAULT_NIGHTLY_PRICE,
  );
  const [maxCats, setMaxCats] = useState<number>(
    initialValues?.maxConcurrentPets ?? MAX_CATS_FLOOR,
  );
  const [hasResidentPets, setHasResidentPets] = useState(
    initialValues?.hasResidentPets ?? false,
  );
  const [residentNote, setResidentNote] = useState(
    initialValues?.residentPetsNote ?? '',
  );
  const [offersGrooming, setOffersGrooming] = useState(
    initialValues?.offersGrooming ?? false,
  );
  // 0041 — per-host service-addon opt-ins.
  const [offersVet, setOffersVet] = useState(
    initialValues?.offersVet ?? false,
  );
  const [offersInsurance, setOffersInsurance] = useState(
    initialValues?.offersInsurance ?? false,
  );
  const [offersTransport, setOffersTransport] = useState(
    initialValues?.offersTransport ?? false,
  );
  const [hostGender, setHostGender] = useState<HostGender | null>(
    initialValues?.hostGender ?? null,
  );
  const [requiresVaccination, setRequiresVaccination] = useState(
    initialValues?.requiresVaccination ?? false,
  );
  // Round 12 / Step 5.7. Default new listings to cats only — matches
  // migration 0034's column default and the founder-wedge (existing
  // hosts onboarded for cats; opting into dogs is explicit).
  const [acceptsSpecies, setAcceptsSpecies] = useState<('cat' | 'dog')[]>(
    initialValues?.acceptsSpecies ?? ['cat'],
  );

  const toggleSpecies = (s: 'cat' | 'dog') => {
    setAcceptsSpecies((prev) => {
      const has = prev.includes(s);
      if (has) {
        // Don't allow toggling to empty — the constraint requires ≥1.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== s);
      }
      return [...prev, s];
    });
  };

  // Per-field validation errors. Missing key = field valid. Cleared as
  // the user edits the field. The top error band is reserved for the
  // parent's saveError (network/RLS).
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});

  // District modal picker state (Bucket B revision from 7.2d).
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const [districtSearch, setDistrictSearch] = useState('');

  const clearFieldError = (field: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const selectedCity = findCity(city);
  const districts = selectedCity?.districts ?? [];

  const districtSearchQuery = districtSearch.trim();
  const filteredDistricts =
    districtSearchQuery === ''
      ? districts
      : districts.filter(
          (d) =>
            d.name_en
              .toLowerCase()
              .includes(districtSearchQuery.toLowerCase()) ||
            d.name_ar.includes(districtSearchQuery),
        );

  const selectedDistrict = districtKey
    ? (districts.find((d) => d.key === districtKey) ?? null)
    : null;

  const openDistrictPicker = () => {
    setDistrictPickerOpen(true);
    setDistrictSearch('');
  };

  const onPickDistrict = (key: string) => {
    setDistrictKey(key);
    setDistrictPickerOpen(false);
    clearFieldError('district');
  };

  // Reset district when city changes — a slug from one city isn't valid
  // for another, so the picker must restart.
  const onCity = (next: CityKey) => {
    setCity(next);
    setDistrictKey(null);
    clearFieldError('district');
  };

  const decMaxCats = () => {
    if (maxCats <= MAX_CATS_FLOOR) return;
    setMaxCats(maxCats - 1);
    clearFieldError('maxCats');
  };
  const incMaxCats = () => {
    if (maxCats >= MAX_CATS_CEILING) return;
    setMaxCats(maxCats + 1);
    clearFieldError('maxCats');
  };

  const onSubmit = async () => {
    const errs: Partial<Record<FieldKey, string>> = {};

    if (!listingTitle.trim()) {
      errs.title = t('listings.form.title_required');
    }
    if (!description.trim()) {
      errs.description = t('listings.form.description_required');
    }
    if (!districtKey) {
      errs.district = t('listings.form.district_required');
    }
    if (!hostGender) {
      errs.hostGender = t('listings.form.host_gender_required');
    }

    const priceTrim = nightlyPrice.trim();
    const priceNum = priceTrim === '' ? NaN : Number(priceTrim);
    if (!Number.isInteger(priceNum) || priceNum < 0) {
      errs.nightlyPrice = t('listings.form.invalid_price');
    }

    if (!Number.isInteger(maxCats) || maxCats < MAX_CATS_FLOOR) {
      errs.maxCats = t('listings.form.invalid_max_cats');
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    const values: ListingFormValues = {
      city,
      neighborhood: districtKey!,
      title: listingTitle.trim(),
      description: description.trim(),
      nightlyPrice: priceNum,
      maxConcurrentPets: maxCats,
      hasResidentPets,
      residentPetsNote: hasResidentPets ? residentNote.trim() || null : null,
      offersGrooming,
      offersVet,
      offersInsurance,
      offersTransport,
      hostGender: hostGender!,
      requiresVaccination,
      acceptsSpecies,
    };

    await onSave(values);
  };

  // Dirty-check: any current field value differs from the snapshot the
  // form mounted with. Uses the same defaults the useState calls used
  // so an untouched form correctly reads as clean. The edit screen
  // turns this on via requireDirty so a no-change Save can't create
  // an empty draft. The create screen leaves it off.
  const initialCity = initialValues?.city ?? 'riyadh';
  const initialDistrict = initialValues?.neighborhood ?? null;
  const initialTitleValue = initialValues?.title ?? '';
  const initialDescription = initialValues?.description ?? '';
  const initialNightlyPrice =
    initialValues?.nightlyPrice != null
      ? String(initialValues.nightlyPrice)
      : DEFAULT_NIGHTLY_PRICE;
  const initialMaxCats =
    initialValues?.maxConcurrentPets ?? MAX_CATS_FLOOR;
  const initialHasResident = initialValues?.hasResidentPets ?? false;
  const initialResidentNote = initialValues?.residentPetsNote ?? '';
  const initialOffersGrooming = initialValues?.offersGrooming ?? false;
  const initialOffersVet = initialValues?.offersVet ?? false;
  const initialOffersInsurance = initialValues?.offersInsurance ?? false;
  const initialOffersTransport = initialValues?.offersTransport ?? false;
  const initialHostGender = initialValues?.hostGender ?? null;
  const initialRequiresVaccination =
    initialValues?.requiresVaccination ?? false;
  const initialAcceptsSpecies = initialValues?.acceptsSpecies ?? ['cat'];

  // Set-equality on a sorted join — chip order in state doesn't
  // matter, just membership.
  const speciesDirty =
    [...acceptsSpecies].sort().join(',') !==
    [...initialAcceptsSpecies].sort().join(',');

  const isDirty =
    city !== initialCity ||
    districtKey !== initialDistrict ||
    listingTitle !== initialTitleValue ||
    description !== initialDescription ||
    nightlyPrice !== initialNightlyPrice ||
    maxCats !== initialMaxCats ||
    hasResidentPets !== initialHasResident ||
    residentNote !== initialResidentNote ||
    offersGrooming !== initialOffersGrooming ||
    offersVet !== initialOffersVet ||
    offersInsurance !== initialOffersInsurance ||
    offersTransport !== initialOffersTransport ||
    hostGender !== initialHostGender ||
    requiresVaccination !== initialRequiresVaccination ||
    speciesDirty;

  const saveDisabled = saving || (requireDirty && !isDirty);

  return (
    <>
      {/* Top-level error reserved for save-failure (network/RLS).
          Field validation errors render inline under each field. */}
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      {/* City picker — chip row (only 2 cities, fits a row easily). */}
      <Field label={t('listings.form.city_label')} required>
        <View style={styles.chipRow}>
          {CITIES.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => onCity(c.key)}
              style={[styles.chip, city === c.key && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  city === c.key && styles.chipTextActive,
                ]}
              >
                {pickLocalized(c.name_ar, c.name_en, locale)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      {/* District picker — tappable trigger row + full-screen modal
          with search-as-you-type. */}
      <Field
        label={t('listings.form.district_label')}
        required
        error={fieldErrors.district}
      >
        <Pressable
          onPress={openDistrictPicker}
          style={[
            styles.pickerTrigger,
            fieldErrors.district && styles.inputError,
          ]}
        >
          <Text
            style={[
              styles.pickerTriggerText,
              !selectedDistrict && styles.pickerTriggerPlaceholder,
            ]}
          >
            {selectedDistrict
              ? pickLocalized(
                  selectedDistrict.name_ar,
                  selectedDistrict.name_en,
                  locale,
                )
              : t('listings.form.district_placeholder')}
          </Text>
          <Text style={styles.pickerTriggerChevron}>
            {locale === 'ar' ? '‹' : '›'}
          </Text>
        </Pressable>
      </Field>

      <Field
        label={t('listings.form.title_label')}
        required
        error={fieldErrors.title}
      >
        <TextInput
          value={listingTitle}
          onChangeText={(v) => {
            setListingTitle(v);
            clearFieldError('title');
          }}
          placeholder={t('listings.form.title_placeholder')}
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, fieldErrors.title && styles.inputError]}
        />
      </Field>

      <Field
        label={t('listings.form.description_label')}
        required
        error={fieldErrors.description}
      >
        <TextInput
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            clearFieldError('description');
          }}
          placeholder={t('listings.form.description_placeholder')}
          placeholderTextColor={colors.inkSoft}
          multiline
          style={[
            styles.input,
            styles.multiline,
            fieldErrors.description && styles.inputError,
          ]}
        />
      </Field>

      <Field
        label={t('listings.form.nightly_price_label')}
        required
        error={fieldErrors.nightlyPrice}
      >
        <TextInput
          value={nightlyPrice}
          onChangeText={(v) => {
            setNightlyPrice(v);
            clearFieldError('nightlyPrice');
          }}
          inputMode="numeric"
          keyboardType="number-pad"
          style={[
            styles.input,
            fieldErrors.nightlyPrice && styles.inputError,
          ]}
        />
      </Field>

      {/* Max cats stepper. [−] [N] [+]. No keyboard, so the field
          always holds a valid integer in [FLOOR, CEILING]. */}
      <Field
        label={t('listings.form.max_cats_label')}
        required
        error={fieldErrors.maxCats}
      >
        <View style={styles.stepper}>
          <Pressable
            onPress={decMaxCats}
            disabled={maxCats <= MAX_CATS_FLOOR}
            style={[
              styles.stepperButton,
              maxCats <= MAX_CATS_FLOOR && styles.stepperButtonDisabled,
            ]}
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{toArabicDigits(maxCats)}</Text>
          <Pressable
            onPress={incMaxCats}
            disabled={maxCats >= MAX_CATS_CEILING}
            style={[
              styles.stepperButton,
              maxCats >= MAX_CATS_CEILING && styles.stepperButtonDisabled,
            ]}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </Field>

      <Pressable
        onPress={() => setHasResidentPets((v) => !v)}
        style={[
          styles.toggleRow,
          hasResidentPets && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {hasResidentPets ? '✓' : '○'}{' '}
          {t('listings.form.has_resident_pets_label')}
        </Text>
      </Pressable>

      {hasResidentPets ? (
        <Field label={t('listings.form.resident_pets_note_label')}>
          <TextInput
            value={residentNote}
            onChangeText={setResidentNote}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>
      ) : null}

      <Pressable
        onPress={() => setOffersGrooming((v) => !v)}
        style={[
          styles.toggleRow,
          offersGrooming && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {offersGrooming ? '✓' : '○'}{' '}
          {t('listings.form.offers_grooming_label')}
        </Text>
      </Pressable>

      {/* 0041 — per-host service-addon opt-ins (vet, insurance,
          transport). Default false; host opts in. Booking-request
          screen filters its addon checkboxes by these flags. */}
      <Pressable
        onPress={() => setOffersVet((v) => !v)}
        style={[
          styles.toggleRow,
          offersVet && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {offersVet ? '✓' : '○'}{' '}
          {t('listings.form.offers_vet_label')}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setOffersInsurance((v) => !v)}
        style={[
          styles.toggleRow,
          offersInsurance && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {offersInsurance ? '✓' : '○'}{' '}
          {t('listings.form.offers_insurance_label')}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setOffersTransport((v) => !v)}
        style={[
          styles.toggleRow,
          offersTransport && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {offersTransport ? '✓' : '○'}{' '}
          {t('listings.form.offers_transport_label')}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setRequiresVaccination((v) => !v)}
        style={[
          styles.toggleRow,
          requiresVaccination && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {requiresVaccination ? '✓' : '○'}{' '}
          {t('listings.form.requires_vaccination_label')}
        </Text>
      </Pressable>

      {/* Round 12 / Step 5.7 — accepts_species. Multi-select chip
          row (cat + dog); at least one must remain selected
          (toggleSpecies guards against empty). Hidden while
          SPECIES_ENABLED is false — the column doesn't exist on
          the listings table, and the existing form value defaults
          to ['cat'] which the lib layer drops from the write
          payload behind the gate. */}
      {SPECIES_ENABLED ? (
        <Field label={t('listings.form.accepts_species_label')} required>
          <View style={styles.chipRow}>
            {SPECIES_LIST.map((s) => {
              const active = acceptsSpecies.includes(s);
              return (
                <Pressable
                  key={s}
                  onPress={() => toggleSpecies(s)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {active ? '✓ ' : ''}
                    {speciesEmoji(s)} {t(`species.${s}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      ) : null}

      <Field
        label={t('listings.form.host_gender_label')}
        required
        error={fieldErrors.hostGender}
      >
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => {
              setHostGender('female');
              clearFieldError('hostGender');
            }}
            style={[
              styles.chip,
              hostGender === 'female' && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                hostGender === 'female' && styles.chipTextActive,
              ]}
            >
              {t('listings.form.female_label')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setHostGender('male');
              clearFieldError('hostGender');
            }}
            style={[
              styles.chip,
              hostGender === 'male' && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                hostGender === 'male' && styles.chipTextActive,
              ]}
            >
              {t('listings.form.male_label')}
            </Text>
          </Pressable>
        </View>
      </Field>

      <Button
        label={saving ? savingLabel : saveLabel}
        onPress={onSubmit}
        variant="primary"
        loading={saving}
        disabled={saveDisabled}
        fullWidth
      />
      <Button
        label={cancelLabel}
        onPress={onCancel}
        variant="secondary"
        disabled={saving}
        fullWidth
      />

      {/* District modal picker. Sits outside the field layout flow
          (Modal renders at the top level regardless of mount point).
          onRequestClose handles Android hardware-back. */}
      <Modal
        visible={districtPickerOpen}
        animationType="slide"
        onRequestClose={() => setDistrictPickerOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {t('listings.form.district_picker_title')}
            </Text>
            <Pressable
              onPress={() => setDistrictPickerOpen(false)}
              style={styles.modalClose}
              accessibilityLabel={t('listings.form.cancel_button')}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            value={districtSearch}
            onChangeText={setDistrictSearch}
            placeholder={t('listings.form.district_search_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoFocus
            style={[styles.input, styles.modalSearch]}
          />
          <ScrollView contentContainerStyle={styles.modalList}>
            {filteredDistricts.length === 0 ? (
              <Text style={styles.modalNoMatches}>
                {t('listings.form.district_no_matches')}
              </Text>
            ) : (
              filteredDistricts.map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => onPickDistrict(d.key)}
                  style={[
                    styles.districtRow,
                    districtKey === d.key && styles.districtRowActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.districtRowText,
                      districtKey === d.key &&
                        styles.districtRowTextActive,
                    ]}
                  >
                    {pickLocalized(d.name_ar, d.name_en, locale)}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// Local label-on-top field row helper. Identical shape to the original
// in src/app/listings/new.tsx — keeps the visual treatment unchanged.
function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  fieldError: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.terracotta,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: {
    borderColor: colors.terracotta,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  chipActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pickerTriggerText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  pickerTriggerPlaceholder: {
    color: colors.inkSoft,
  },
  pickerTriggerChevron: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.inkSoft,
    marginLeft: spacing.sm,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.whisper,
  },
  modalTitle: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
  },
  modalClose: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modalCloseText: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    color: colors.inkSoft,
    lineHeight: 24,
  },
  modalSearch: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  modalList: {
    padding: spacing.xl,
    gap: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  modalNoMatches: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  districtRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  districtRowActive: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  districtRowText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  districtRowTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.moss,
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.moss,
    lineHeight: 22,
  },
  stepperValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.ink,
    minWidth: 24,
    textAlign: 'center',
  },
  toggleRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  toggleRowActive: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  toggleText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
});

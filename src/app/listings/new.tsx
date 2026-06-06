// Create-listing form (Step 7.2d — Bucket A + B polish iteration).
// Mirrors the pets/[id].tsx form conventions: SafeArea + AppHeader +
// ScrollView, local Field helper, t()-keyed validation, console.warn
// + setError on submit failure. Uses the Button component (not raw
// Pressables) for Save/Cancel per the design-system convention.
//
// 7.2d-polish changes vs the original commit (d7a2e18):
//   • Inline per-field validation errors (red border on the input
//     + small message underneath the field), clearing when the user
//     edits. Top-level error retained ONLY for save-failure cases
//     (network / RLS) — never for field-level validation.
//   • Max-cats input replaced with a [−][N][+] stepper (no keyboard).
//   • Nightly price pre-filled with a reasonable default (150 SAR).
//   • District picker is now a vertical list of rows (matches the
//     toggle-row visual treatment) instead of a wrapping chip strip.
//   • Validation messages name their field ("Nightly price must…"
//     rather than a generic "Enter a whole number ≥ 0").
//
// On success: router.replace('/') → host (or 'both' user in host
// persona) lands on HostHome, new listing visible with the gold
// "Inactive" badge until admin approval.
//
// Not in scope here:
//   • Photo upload (Step 7.3).
//   • Multiple services with prices (proposed Bucket D — its own step).
//   • Host gender from profile (proposed Bucket D — schema change).
//   • Geolocation district detection (proposed Bucket C — deferred).

import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { CITIES, findCity, type CityKey } from '@/lib/cities';
import { pickLocalized, toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { createListing } from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type HostGender = 'female' | 'male';
type FieldKey =
  | 'title'
  | 'description'
  | 'district'
  | 'hostGender'
  | 'nightlyPrice'
  | 'maxCats';

const MAX_CATS_FLOOR = 1;
const MAX_CATS_CEILING = 20;
const DEFAULT_NIGHTLY_PRICE = '150';

export default function NewListingScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  // Form state — 10 fields per spec.
  const [city, setCity] = useState<CityKey>('riyadh');
  const [districtKey, setDistrictKey] = useState<string | null>(null);
  const [listingTitle, setListingTitle] = useState('');
  const [description, setDescription] = useState('');
  const [nightlyPrice, setNightlyPrice] = useState(DEFAULT_NIGHTLY_PRICE);
  const [maxCats, setMaxCats] = useState<number>(MAX_CATS_FLOOR);
  const [hasResidentPets, setHasResidentPets] = useState(false);
  const [residentNote, setResidentNote] = useState('');
  const [offersGrooming, setOffersGrooming] = useState(false);
  const [hostGender, setHostGender] = useState<HostGender | null>(null);

  // Per-field validation errors. A missing key means the field is
  // currently valid. Cleared when the user edits the field. Save-
  // failure (network/RLS) is held separately at the top.
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearFieldError = (field: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  const selectedCity = findCity(city);
  const districts = selectedCity?.districts ?? [];

  // Reset district when city changes — a slug from one city is not
  // valid for another, so the picker must restart.
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

  const onSave = async () => {
    setSaveError(null);

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

    // maxCats is always a valid number from the stepper, but check
    // defensively in case the floor/ceiling logic ever regresses.
    if (!Number.isInteger(maxCats) || maxCats < MAX_CATS_FLOOR) {
      errs.maxCats = t('listings.form.invalid_max_cats');
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      await createListing({
        hostId: user.id,
        city,
        neighborhood: districtKey!,
        title: listingTitle.trim(),
        description: description.trim(),
        nightlyPrice: priceNum,
        maxConcurrentPets: maxCats,
        hasResidentPets,
        residentPetsNote: hasResidentPets
          ? residentNote.trim() || null
          : null,
        offersGrooming,
        hostGender: hostGender!,
      });
      router.replace('/');
    } catch (e) {
      console.warn('[listings.form.save_failed]', e);
      setSaveError(t('listings.form.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => router.replace('/');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.backLink}>
            <Text style={styles.backText}>{t('listings.form.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('listings.form.new_title')}</Text>
        </View>

        {/* Top-level error reserved for save-failure only (network/RLS).
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

        {/* District picker (Bucket B) — vertical list of single-tap
            rows. Selected row gets the moss border + whisper-bg
            treatment to match the boolean-toggle visual language.
            Scrolls within the parent ScrollView. */}
        <Field
          label={t('listings.form.district_label')}
          required
          error={fieldErrors.district}
        >
          <View style={styles.districtList}>
            {districts.map((d) => (
              <Pressable
                key={d.key}
                onPress={() => {
                  setDistrictKey(d.key);
                  clearFieldError('district');
                }}
                style={[
                  styles.districtRow,
                  districtKey === d.key && styles.districtRowActive,
                ]}
              >
                <Text
                  style={[
                    styles.districtRowText,
                    districtKey === d.key && styles.districtRowTextActive,
                  ]}
                >
                  {pickLocalized(d.name_ar, d.name_en, locale)}
                </Text>
              </Pressable>
            ))}
          </View>
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

        {/* Max cats stepper (Bucket A#3). [−] [N] [+]. No keyboard,
            so the field always holds a valid integer in [FLOOR, CEILING]. */}
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
          label={
            saving ? t('listings.form.saving') : t('listings.form.save_button')
          }
          onPress={onSave}
          variant="primary"
          loading={saving}
          disabled={saving}
          fullWidth
        />
        <Button
          label={t('listings.form.cancel_button')}
          onPress={onCancel}
          variant="secondary"
          disabled={saving}
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// Local label-on-top field row helper, matching the pets/[id].tsx
// convention. Accepts an optional `error` that renders as a small
// red line under the children.
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
  safe: {
    flex: 1,
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream in owner mode, honey in host mode). Matches
    // the 5 host-accessible screens updated in commit 9276213.
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  // Top-level error — used for save-failure only, not field validation.
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
  // Inline per-field error (Bucket A#2) — small red line under the
  // input, paired with the inputError border below.
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
  // Red border applied to inputs whose field has a validation error.
  // Composed via style array so it stacks over the base input style.
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
  // Vertical district list (Bucket B). Visual treatment matches
  // toggleRow / toggleRowActive so the active selection reads the
  // same way as the boolean toggles below it.
  districtList: {
    gap: spacing.xs,
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
  // Max cats stepper (Bucket A#3).
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

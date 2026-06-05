// Create-listing form (Step 7.2d). Mirrors the pets/[id].tsx form
// conventions — SafeArea + AppHeader + ScrollView wrapper, local Field
// helper, t()-keyed validation messages, console.warn + setError on
// failure — with the Button component from the design-system rollout
// instead of raw Pressables for Save/Cancel.
//
// On success: router.replace('/') → HomeScreen routes the host (or
// 'both' user in host persona) back to HostHome, where their new
// listing appears with the inactive/pending status badge from 7.1b
// (is_active=false → gold "Inactive" badge until admin approval).
//
// NOT in scope here: photo upload (Step 7.3 wires the multi-photo
// gallery via a similar create-then-photo seam to the pet form's
// pendingCreatedId pattern).

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
import { pickLocalized } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { createListing } from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type HostGender = 'female' | 'male';

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
  const [nightlyPrice, setNightlyPrice] = useState('');
  const [maxCats, setMaxCats] = useState('');
  const [hasResidentPets, setHasResidentPets] = useState(false);
  const [residentNote, setResidentNote] = useState('');
  const [offersGrooming, setOffersGrooming] = useState(false);
  const [hostGender, setHostGender] = useState<HostGender | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  const selectedCity = findCity(city);
  const districts = selectedCity?.districts ?? [];

  // Resets district selection when city changes — a slug from one
  // city is not valid for another, so the picker must restart.
  const onCity = (next: CityKey) => {
    setCity(next);
    setDistrictKey(null);
  };

  const onSave = async () => {
    setError(null);

    if (!listingTitle.trim()) {
      setError(t('listings.form.title_required'));
      return;
    }
    if (!description.trim()) {
      setError(t('listings.form.description_required'));
      return;
    }
    if (!districtKey) {
      setError(t('listings.form.district_required'));
      return;
    }
    if (!hostGender) {
      setError(t('listings.form.host_gender_required'));
      return;
    }

    const priceTrim = nightlyPrice.trim();
    const maxCatsTrim = maxCats.trim();
    const priceNum = priceTrim === '' ? NaN : Number(priceTrim);
    const maxCatsNum = maxCatsTrim === '' ? NaN : Number(maxCatsTrim);
    if (!Number.isInteger(priceNum) || priceNum < 0) {
      setError(t('listings.form.invalid_price'));
      return;
    }
    if (!Number.isInteger(maxCatsNum) || maxCatsNum < 1) {
      setError(t('listings.form.invalid_max_cats'));
      return;
    }

    setSaving(true);
    try {
      await createListing({
        hostId: user.id,
        city,
        neighborhood: districtKey,
        title: listingTitle.trim(),
        description: description.trim(),
        nightlyPrice: priceNum,
        maxConcurrentPets: maxCatsNum,
        hasResidentPets,
        residentPetsNote: hasResidentPets
          ? residentNote.trim() || null
          : null,
        offersGrooming,
        hostGender,
      });
      router.replace('/');
    } catch (e) {
      console.warn('[listings.form.save_failed]', e);
      setError(t('listings.form.save_failed'));
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* City picker — chip-row pattern (mirrors the feed selector). */}
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

        {/* District picker — wraps because Riyadh has 14 districts. */}
        <Field label={t('listings.form.district_label')} required>
          <View style={[styles.chipRow, styles.chipWrap]}>
            {districts.map((d) => (
              <Pressable
                key={d.key}
                onPress={() => setDistrictKey(d.key)}
                style={[
                  styles.chip,
                  districtKey === d.key && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    districtKey === d.key && styles.chipTextActive,
                  ]}
                >
                  {pickLocalized(d.name_ar, d.name_en, locale)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label={t('listings.form.title_label')} required>
          <TextInput
            value={listingTitle}
            onChangeText={setListingTitle}
            placeholder={t('listings.form.title_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </Field>

        <Field label={t('listings.form.description_label')} required>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('listings.form.description_placeholder')}
            placeholderTextColor={colors.inkSoft}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Field label={t('listings.form.nightly_price_label')} required>
          <TextInput
            value={nightlyPrice}
            onChangeText={setNightlyPrice}
            inputMode="numeric"
            keyboardType="number-pad"
            style={styles.input}
          />
        </Field>

        <Field label={t('listings.form.max_cats_label')} required>
          <TextInput
            value={maxCats}
            onChangeText={setMaxCats}
            inputMode="numeric"
            keyboardType="number-pad"
            style={styles.input}
          />
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

        <Field label={t('listings.form.host_gender_label')} required>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setHostGender('female')}
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
              onPress={() => setHostGender('male')}
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
// convention. Kept local rather than lifting into a shared component —
// the pet form uses its own copy of the same shape; consolidating
// across the two forms is a future polish task.
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
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
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chipWrap: {
    flexWrap: 'wrap',
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

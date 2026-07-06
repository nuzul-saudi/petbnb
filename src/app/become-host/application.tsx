// Host application form (0039).
//
// Post-password landing for new host signups. Collects the six
// fields the founder spec'd:
//   1. Name
//   2. Gender (M / F — both genders welcome; required)
//   3. City + neighborhood
//   4. Pet type they can host (cats for now; dogs greyed out
//      until SPECIES_ENABLED flips on)
//   5. Experience yes/no, years if yes
//   6. Their own pets — collected separately via /pets/new after
//      this screen submits, so they can book stays too.
//
// Submit → host_application_status='pending'. Admin reviews. After
// approval, the user gets a 'Complete your hosting profile' prompt
// elsewhere in the app (profile screen) that walks them through the
// bio + pictures + Nafath stub before they can list.

import { logWarn } from '@/lib/log';
import { track } from '@/lib/analytics';
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

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { CITIES, findCity, type CityKey } from '@/lib/cities';
import { SPECIES_ENABLED } from '@/lib/features';
import { useTranslation } from '@/lib/i18n';
import {
  submitHostApplication,
  type HostApplicationInput,
} from '@/lib/host-application';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

type Gender = Enums<'host_gender'>;
type PetType = Enums<'host_pet_type_accepted'>;

const GENDERS: { value: Gender; i18nKey: string }[] = [
  { value: 'female', i18nKey: 'host_application.gender_female' },
  { value: 'male', i18nKey: 'host_application.gender_male' },
];

const PET_TYPES: { value: PetType; i18nKey: string; enabled: boolean }[] = [
  // Cats are the MVP target — always enabled.
  { value: 'cats', i18nKey: 'host_application.pet_type_cats', enabled: true },
  // Dogs + both gated behind SPECIES_ENABLED.
  {
    value: 'dogs',
    i18nKey: 'host_application.pet_type_dogs',
    enabled: SPECIES_ENABLED,
  },
  {
    value: 'cats_and_dogs',
    i18nKey: 'host_application.pet_type_both',
    enabled: SPECIES_ENABLED,
  },
];

export default function HostApplicationScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { initializing, session, user, profile, refreshProfile } = useAuth();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [city, setCity] = useState<CityKey | null>(null);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [petType, setPetType] = useState<PetType>('cats');
  const [hasExperience, setHasExperience] = useState<boolean | null>(null);
  const [years, setYears] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in?flow=host" />;

  // If they already submitted (post-back, deep link, etc.), kick them
  // back to the profile screen which carries the status panel. This
  // route is for first-time application, not for re-submitting.
  if (profile?.host_application_status) return <Redirect href="/profile" />;

  const cityObj = city ? findCity(city) : null;
  const districts = cityObj?.districts ?? [];

  const yearsNum = years.trim() === '' ? null : parseInt(years, 10);
  const yearsValid =
    hasExperience !== true ||
    (yearsNum !== null && !Number.isNaN(yearsNum) && yearsNum >= 0 && yearsNum <= 60);

  const canSubmit =
    name.trim().length > 0 &&
    gender !== null &&
    city !== null &&
    neighborhood !== null &&
    hasExperience !== null &&
    yearsValid &&
    !submitting;

  const onSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const input: HostApplicationInput = {
        fullName: name,
        gender: gender!,
        city: city!,
        neighborhood: neighborhood!,
        petTypeAccepted: petType,
        experienceYears: hasExperience ? (yearsNum ?? 0) : null,
      };
      await submitHostApplication(user.id, input);
      // Phase 1.5 — host signup funnel complete (application submitted;
      // host_application_submitted fires in the lib alongside this).
      track('signup_completed', { flow: 'host' });
      await refreshProfile();
      router.replace('/become-host/submitted');
    } catch (e) {
      logWarn('[host_application.submit_failed]', e);
      setError(t('host_application.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t('host_application.title')}</Text>
        <Text style={styles.subtitle}>{t('host_application.subtitle')}</Text>

        {/* 1. Name */}
        <Field label={t('host_application.name_label')}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('host_application.name_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="words"
            style={styles.input}
          />
        </Field>

        {/* 2. Gender */}
        <Field label={t('host_application.gender_label')}>
          <View style={styles.optionRow}>
            {GENDERS.map((g) => (
              <OptionChip
                key={g.value}
                selected={gender === g.value}
                label={t(g.i18nKey)}
                onPress={() => setGender(g.value)}
              />
            ))}
          </View>
        </Field>

        {/* 3a. City */}
        <Field label={t('host_application.city_label')}>
          <View style={styles.optionRow}>
            {CITIES.map((c) => (
              <OptionChip
                key={c.key}
                selected={city === c.key}
                label={locale === 'ar' ? c.name_ar : c.name_en}
                onPress={() => {
                  setCity(c.key);
                  setNeighborhood(null);
                }}
              />
            ))}
          </View>
        </Field>

        {/* 3b. Neighborhood (gated on city) */}
        {cityObj ? (
          <Field label={t('host_application.neighborhood_label')}>
            <View style={styles.optionRow}>
              {districts.map((d) => (
                <OptionChip
                  key={d.key}
                  selected={neighborhood === d.key}
                  label={locale === 'ar' ? d.name_ar : d.name_en}
                  onPress={() => setNeighborhood(d.key)}
                />
              ))}
            </View>
          </Field>
        ) : null}

        {/* 4. Pet type */}
        <Field label={t('host_application.pet_type_label')}>
          <View style={styles.optionRow}>
            {PET_TYPES.map((p) => (
              <OptionChip
                key={p.value}
                selected={petType === p.value}
                disabled={!p.enabled}
                label={
                  p.enabled
                    ? t(p.i18nKey)
                    : `${t(p.i18nKey)} (${t('host_application.coming_soon_tag')})`
                }
                onPress={() => p.enabled && setPetType(p.value)}
              />
            ))}
          </View>
        </Field>

        {/* 5. Experience */}
        <Field label={t('host_application.experience_label')}>
          <View style={styles.optionRow}>
            <OptionChip
              selected={hasExperience === true}
              label={t('host_application.experience_yes')}
              onPress={() => setHasExperience(true)}
            />
            <OptionChip
              selected={hasExperience === false}
              label={t('host_application.experience_no')}
              onPress={() => {
                setHasExperience(false);
                setYears('');
              }}
            />
          </View>
          {hasExperience === true ? (
            <View style={styles.yearsRow}>
              <Text style={styles.yearsLabel}>
                {t('host_application.experience_years_label')}
              </Text>
              <TextInput
                value={years}
                onChangeText={(v) => setYears(v.replace(/\D/g, '').slice(0, 2))}
                placeholder="0"
                placeholderTextColor={colors.inkSoft}
                inputMode="numeric"
                keyboardType="number-pad"
                style={[styles.input, styles.yearsInput]}
              />
            </View>
          ) : null}
        </Field>

        {/* FIX 4 (2026-06-26) — shared Button replaces the
            hand-rolled Pressable. Loading + disabled states are
            built-in. Persona theming is irrelevant here (this is
            a pre-host signup screen, viewer is guest), so it
            renders the owner-mode moss either way. */}
        <Button
          label={t('host_application.submit_button')}
          onPress={onSubmit}
          variant="primary"
          fullWidth
          loading={submitting}
          disabled={!canSubmit && !submitting}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function OptionChip({
  selected,
  disabled,
  label,
  onPress,
}: {
  selected: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.chipText,
          selected && styles.chipTextSelected,
          disabled && styles.chipTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 26,
    color: colors.mossDeep,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
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
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
    ...shadows.card,
  },
  chipSelected: {
    backgroundColor: colors.mossDeep,
    borderColor: colors.mossDeep,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  chipTextSelected: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  chipTextDisabled: {
    color: colors.inkSoft,
  },
  yearsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  yearsLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  yearsInput: {
    width: 80,
    textAlign: 'center',
    fontSize: 18,
  },
  cta: {
    backgroundColor: colors.mossDeep,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

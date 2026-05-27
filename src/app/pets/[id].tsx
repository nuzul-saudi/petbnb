import { useEffect, useState } from 'react';
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

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import {
  createPet,
  deletePet,
  getPet,
  updatePet,
  type UpdatePetPatch,
} from '@/lib/pets';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

// /pets/new is the "create" mode; any other id is the edit mode.
// UUIDs are 36 chars with hyphens, so "new" can never collide.
export default function PetDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const isNew = id === 'new';

  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [behavioralNotes, setBehavioralNotes] = useState('');
  const [medicalNeeds, setMedicalNeeds] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [medications, setMedications] = useState('');

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getPet(id)
      .then((pet) => {
        if (cancelled) return;
        if (!pet) {
          setError(t('pets.not_found'));
          return;
        }
        setName(pet.name);
        setBreed(pet.breed ?? '');
        setAgeMonths(pet.age_months != null ? String(pet.age_months) : '');
        setBehavioralNotes(pet.behavioral_notes ?? '');
        setMedicalNeeds(pet.medical_needs ?? '');
        setDietaryRestrictions(pet.dietary_restrictions ?? '');
        setMedications(pet.medications ?? '');
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('pets.load_failed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, t]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  const onSave = async () => {
    if (!name.trim()) {
      setError(t('pets.name_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const trimmedAge = ageMonths.trim();
      const ageNum = trimmedAge === '' ? null : Number(trimmedAge);
      if (ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 0)) {
        throw new Error(t('pets.invalid_age'));
      }
      const patch: UpdatePetPatch = {
        name: name.trim(),
        breed: breed.trim() || null,
        age_months: ageNum,
        behavioral_notes: behavioralNotes.trim() || null,
        medical_needs: medicalNeeds.trim() || null,
        dietary_restrictions: dietaryRestrictions.trim() || null,
        medications: medications.trim() || null,
      };
      if (isNew) {
        await createPet({
          ownerId: user.id,
          name: patch.name!,
          breed: patch.breed,
          age_months: patch.age_months,
          behavioral_notes: patch.behavioral_notes,
          medical_needs: patch.medical_needs,
          dietary_restrictions: patch.dietary_restrictions,
          medications: patch.medications,
        });
      } else {
        await updatePet(id, patch);
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pets.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    // Cross-platform confirm: window.confirm on web, accept on native for MVP.
    // A polished native Alert.alert can replace this later.
    const confirmed =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(t('pets.delete_confirm'))
        : true;
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePet(id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pets.delete_failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('pets.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backText}>{t('pets.back')}</Text>
          </Pressable>
          <Text style={styles.title}>
            {isNew ? t('pets.new_title') : t('pets.edit_title')}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Field label={t('pets.name_label')} required>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('pets.name_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </Field>

        <Field label={t('pets.breed_label')}>
          <TextInput
            value={breed}
            onChangeText={setBreed}
            placeholder={t('pets.breed_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </Field>

        <Field label={t('pets.age_months_label')}>
          <TextInput
            value={ageMonths}
            onChangeText={setAgeMonths}
            inputMode="numeric"
            keyboardType="number-pad"
            style={styles.input}
          />
        </Field>

        <Field label={t('pets.behavioral_notes_label')}>
          <TextInput
            value={behavioralNotes}
            onChangeText={setBehavioralNotes}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Field label={t('pets.medical_needs_label')}>
          <TextInput
            value={medicalNeeds}
            onChangeText={setMedicalNeeds}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Field label={t('pets.dietary_restrictions_label')}>
          <TextInput
            value={dietaryRestrictions}
            onChangeText={setDietaryRestrictions}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Field label={t('pets.medications_label')}>
          <TextInput
            value={medications}
            onChangeText={setMedications}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Pressable
          onPress={onSave}
          disabled={saving || deleting}
          style={[styles.saveButton, (saving || deleting) && styles.buttonDisabled]}
        >
          <Text style={styles.saveText}>
            {saving ? t('pets.saving') : t('pets.save')}
          </Text>
        </Pressable>

        {!isNew ? (
          <Pressable
            onPress={onDelete}
            disabled={saving || deleting}
            style={[
              styles.deleteButton,
              (saving || deleting) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.deleteText}>
              {deleting ? t('pets.deleting') : t('pets.delete')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

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
      <Text style={styles.label}>
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
    backgroundColor: colors.cream,
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
    textAlign: 'right',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
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
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  deleteButton: {
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  deleteText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

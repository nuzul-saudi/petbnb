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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { BreedPicker, type BreedSelection } from '@/components/BreedPicker';
import { useAuth } from '@/lib/auth';
import { findBreed } from '@/lib/breeds';
import { useTranslation } from '@/lib/i18n';
import {
  createPet,
  deletePet,
  getPet,
  pickPetPhoto,
  updatePet,
  uploadPetPhoto,
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
  const [breedSelection, setBreedSelection] = useState<BreedSelection>({
    breed: null,
    breedOther: null,
  });
  const [ageMonths, setAgeMonths] = useState('');
  const [behavioralNotes, setBehavioralNotes] = useState('');
  const [medicalNeeds, setMedicalNeeds] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [medications, setMedications] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
        // pet.breed is a free-text string in the DB. findBreed validates it
        // against the curated BREEDS list. Combined with pet.breed_other,
        // this rehydrates whichever tile state the user previously saved:
        //   structured key match → that tile selected, no free-text input
        //   breed='unknown' + breed_other text → unknown tile + input
        //   breed=null + breed_other text → 'other' tile + input
        const matched = findBreed(pet.breed);
        setBreedSelection({
          breed: matched ? matched.key : null,
          breedOther: pet.breed_other,
        });
        setAgeMonths(pet.age_months != null ? String(pet.age_months) : '');
        setBehavioralNotes(pet.behavioral_notes ?? '');
        setMedicalNeeds(pet.medical_needs ?? '');
        setDietaryRestrictions(pet.dietary_restrictions ?? '');
        setMedications(pet.medications ?? '');
        setPhotoUrl(pet.photo_url);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('[pets.load_failed]', e);
        setError(t('pets.load_failed'));
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
      // Normalize breedOther: trim, then null-out empty string. The picker
      // keeps breedOther as '' when the "other" tile is selected but not
      // yet typed; we don't want empty strings in the DB.
      const trimmedOther = breedSelection.breedOther?.trim();
      const breedOtherToSave = trimmedOther ? trimmedOther : null;

      const patch: UpdatePetPatch = {
        name: name.trim(),
        breed: breedSelection.breed,
        breed_other: breedOtherToSave,
        age_months: ageNum,
        behavioral_notes: behavioralNotes.trim() || null,
        medical_needs: medicalNeeds.trim() || null,
        dietary_restrictions: dietaryRestrictions.trim() || null,
        medications: medications.trim() || null,
        photo_url: photoUrl,
      };
      if (isNew) {
        await createPet({
          ownerId: user.id,
          name: patch.name!,
          breed: patch.breed,
          breed_other: patch.breed_other,
          age_months: patch.age_months,
          behavioral_notes: patch.behavioral_notes,
          medical_needs: patch.medical_needs,
          dietary_restrictions: patch.dietary_restrictions,
          medications: patch.medications,
          photo_url: patch.photo_url,
        });
      } else {
        await updatePet(id, patch);
      }
      // @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes.
      router.replace('/pets');
    } catch (e) {
      console.warn('[pets.save_failed]', e);
      setError(t('pets.save_failed'));
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
      // @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes.
      router.replace('/pets');
    } catch (e) {
      console.warn('[pets.delete_failed]', e);
      setError(t('pets.delete_failed'));
    } finally {
      setDeleting(false);
    }
  };

  // Photo upload is only available on existing pets (we need a petId to
  // build the storage path). For brand-new pets the user is prompted to
  // save first, then return to add a photo.
  const onChangePhoto = async () => {
    if (isNew || !user) return;
    setError(null);
    const source = await pickPetPhoto();
    if (!source) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadPetPhoto({
        petId: id,
        ownerId: user.id,
        source,
      });
      // Save the new URL onto the pet row immediately so it survives a
      // back navigation without hitting Save.
      await updatePet(id, { photo_url: url });
      setPhotoUrl(url);
    } catch (e) {
      console.warn('[pets.photo_upload_failed]', e);
      setError(t('pets.photo_upload_failed'));
    } finally {
      setUploadingPhoto(false);
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
          <Pressable
            // @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes.
            onPress={() => router.replace('/pets')}
            style={styles.backLink}
          >
            <Text style={styles.backText}>{t('pets.back')}</Text>
          </Pressable>
          <Text style={styles.title}>
            {isNew ? t('pets.new_title') : t('pets.edit_title')}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Photo section */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('pets.photo_label')}</Text>
          <View style={styles.photoRow}>
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                style={styles.photoThumb}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.photoThumb, styles.photoPlaceholder]}>
                <Text style={styles.photoPlaceholderEmoji}>🐈</Text>
              </View>
            )}
            <Pressable
              onPress={onChangePhoto}
              disabled={isNew || uploadingPhoto}
              style={[
                styles.photoButton,
                (isNew || uploadingPhoto) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.photoButtonText}>
                {uploadingPhoto
                  ? t('pets.photo_uploading')
                  : photoUrl
                    ? t('pets.photo_change')
                    : t('pets.photo_add')}
              </Text>
            </Pressable>
          </View>
          {isNew ? (
            <Text style={styles.photoHint}>{t('pets.photo_save_first')}</Text>
          ) : null}
        </View>

        <Field label={t('pets.name_label')} required>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('pets.name_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </Field>

        {/* Breed picker replaces the Step 5.5 free-text input */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('pets.breed_label')}</Text>
          <BreedPicker value={breedSelection} onChange={setBreedSelection} />
        </View>

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
          disabled={saving || deleting || uploadingPhoto}
          style={[
            styles.saveButton,
            (saving || deleting || uploadingPhoto) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.saveText}>
            {saving ? t('pets.saving') : t('pets.save')}
          </Text>
        </Pressable>

        {!isNew ? (
          <Pressable
            onPress={onDelete}
            disabled={saving || deleting || uploadingPhoto}
            style={[
              styles.deleteButton,
              (saving || deleting || uploadingPhoto) && styles.buttonDisabled,
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
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: radii.lg,
    backgroundColor: colors.whisper,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderEmoji: {
    fontSize: 36,
  },
  photoButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.moss,
  },
  photoButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.moss,
  },
  photoHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'right',
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

import { logWarn } from '@/lib/log';
import { useEffect, useState } from 'react';
import {
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

import { AppHeader } from '@/components/AppHeader';
import { BreedPicker, type BreedSelection } from '@/components/BreedPicker';
import { DateField } from '@/components/DateField';
import { useAuth } from '@/lib/auth';
import { confirmDialog } from '@/lib/confirm';
import { todayIso } from '@/lib/format';
import { findBreed } from '@/lib/breeds';
import { useTranslation } from '@/lib/i18n';
import {
  createPet,
  deletePet,
  getPet,
  pickPetPhoto,
  signPetPhotoUrl,
  updatePet,
  uploadPetPhoto,
  type PetPhotoSource,
  type UpdatePetPatch,
} from '@/lib/pets';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

// /pets/new is the "create" mode; any other id is the edit mode.
// UUIDs are 36 chars with hyphens, so "new" can never collide.
export default function PetDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
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
  // Milestone A: vaccination dates + care notes. Dates kept as text
  // (yyyy-mm-dd) in form state and converted on save. Free-text date
  // input rather than a picker for MVP speed; full picker is a polish
  // pass.
  const [rabiesVaccinatedAt, setRabiesVaccinatedAt] = useState('');
  const [fvrcpVaccinatedAt, setFvrcpVaccinatedAt] = useState('');
  const [careNotes, setCareNotes] = useState('');

  // photoStored is whatever is on pets.photo_url today — post-Round-6
  // that's a storage PATH, pre-Round-6 it's a `https://` signed URL.
  // photoDisplayUrl is the actually-renderable URL (signed on render
  // for new path-based rows; passed-through for legacy URL rows).
  // pendingPhoto + previewUri are the just-picked photo source and
  // the URI we render before the actual upload on Save.
  const [photoStored, setPhotoStored] = useState<string | null>(null);
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PetPhotoSource | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // For the new-pet path: if createPet succeeds but the subsequent photo
  // upload fails, we remember the just-created id so a Save retry skips
  // the create and just retries the upload (no duplicate inserts).
  const [pendingCreatedId, setPendingCreatedId] = useState<string | null>(null);

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
        setRabiesVaccinatedAt(pet.rabies_vaccinated_at ?? '');
        setFvrcpVaccinatedAt(pet.fvrcp_vaccinated_at ?? '');
        setCareNotes(pet.care_notes ?? '');
        setPhotoStored(pet.photo_url);
        // Round 6 — sign on render if pet.photo_url is a storage
        // path; legacy `https://...` rows are passed through.
        if (pet.photo_url) {
          void signPetPhotoUrl(pet.photo_url).then((url) => {
            if (!cancelled) setPhotoDisplayUrl(url);
          });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn('[pets.load_failed]', e);
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

  // Image picker — only picks + previews, never uploads. The actual
  // upload happens on Save, once we know we have a pet id.
  const onChangePhoto = async () => {
    setError(null);
    const source = await pickPetPhoto();
    if (!source) return;
    setPendingPhoto(source);
    // Build a preview URI to render immediately. For web that's an object
    // URL minted from the picked File. For native, the asset uri.
    const preview =
      source.kind === 'web-file'
        ? URL.createObjectURL(source.file)
        : source.uri;
    setPreviewUri(preview);
  };

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

      if (isNew) {
        // 1. Create the pet WITHOUT photo_url so we have an id to scope
        //    the storage path against. If a previous Save attempt got as
        //    far as createPet but the photo upload failed, pendingCreatedId
        //    is set and we skip the create to avoid a duplicate insert.
        let createdId = pendingCreatedId;
        if (!createdId) {
          const created = await createPet({
            ownerId: user.id,
            name: name.trim(),
            breed: breedSelection.breed,
            breed_other: breedOtherToSave,
            age_months: ageNum,
            rabies_vaccinated_at: rabiesVaccinatedAt.trim() || null,
            fvrcp_vaccinated_at: fvrcpVaccinatedAt.trim() || null,
            care_notes: careNotes.trim() || null,
            behavioral_notes: behavioralNotes.trim() || null,
            medical_needs: medicalNeeds.trim() || null,
            dietary_restrictions: dietaryRestrictions.trim() || null,
            medications: medications.trim() || null,
            photo_url: null,
          });
          createdId = created.id;
          setPendingCreatedId(created.id);
        }
        // 2. Upload the picked photo (if any) and write the storage
        //    PATH (post-Round-6) onto the new row. If the upload
        //    fails the pet still exists without a photo — surface a
        //    specific error, don't roll back.
        if (pendingPhoto) {
          try {
            const url = await uploadPetPhoto({
              petId: createdId,
              ownerId: user.id,
              source: pendingPhoto,
            });
            await updatePet(createdId, { photo_url: url });
          } catch (photoErr) {
            logWarn('[pets.photo_upload_failed]', photoErr);
            setError(t('pets.photo_upload_failed'));
            return;
          }
        }
      } else {
        // Existing pet. Upload first (if a photo was picked) so we
        // have a storage path to include in the single updatePet
        // call. (Post-Round-6 we store a storage path on
        // pets.photo_url, not a signed URL.) A photo upload failure
        // here surfaces the specific error and bails before the
        // updatePet — the other field changes will not be written yet.
        let photoUrlForPatch = photoStored;
        if (pendingPhoto) {
          try {
            const path = await uploadPetPhoto({
              petId: id,
              ownerId: user.id,
              source: pendingPhoto,
            });
            photoUrlForPatch = path;
          } catch (photoErr) {
            logWarn('[pets.photo_upload_failed]', photoErr);
            setError(t('pets.photo_upload_failed'));
            return;
          }
        }
        const patch: UpdatePetPatch = {
          name: name.trim(),
          breed: breedSelection.breed,
          breed_other: breedOtherToSave,
          age_months: ageNum,
          rabies_vaccinated_at: rabiesVaccinatedAt.trim() || null,
          fvrcp_vaccinated_at: fvrcpVaccinatedAt.trim() || null,
          care_notes: careNotes.trim() || null,
          behavioral_notes: behavioralNotes.trim() || null,
          medical_needs: medicalNeeds.trim() || null,
          dietary_restrictions: dietaryRestrictions.trim() || null,
          medications: medications.trim() || null,
          photo_url: photoUrlForPatch,
        };
        await updatePet(id, patch);
      }

      router.replace('/pets');
    } catch (e) {
      logWarn('[pets.save_failed]', e);
      setError(t('pets.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!(await confirmDialog(t('pets.delete_confirm')))) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePet(id);
      router.replace('/pets');
    } catch (e) {
      logWarn('[pets.delete_failed]', e);
      setError(t('pets.delete_failed'));
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

  // Display priority: the just-picked preview wins, then the saved URL,
  // then the 🐈 placeholder.
  // Round 6 — displayUri uses the rendered (signed-on-load) URL, not
  // the raw stored value (which is a path post-Round-6 and can't load
  // directly). previewUri (the just-picked file) still takes priority.
  const displayUri = previewUri ?? photoDisplayUrl;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable
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

        {/* Photo section. Picking only previews; the upload happens on Save. */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('pets.photo_label')}</Text>
          <View style={styles.photoRow}>
            {displayUri ? (
              <Image
                source={{ uri: displayUri }}
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
              disabled={saving || deleting}
              style={[
                styles.photoButton,
                (saving || deleting) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.photoButtonText}>
                {displayUri ? t('pets.photo_change') : t('pets.photo_add')}
              </Text>
            </Pressable>
          </View>
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

        {/* Milestone A — vaccination dates + care notes. Test round 3
            (2026-06-10) swapped the YYYY-MM-DD TextInput for the shared
            DateField (calendar UX on web), max=today so future-dated
            vaccinations can't be entered. */}
        <Field label={t('pets.rabies_vaccinated_at_label')}>
          <DateField
            value={rabiesVaccinatedAt}
            onChange={setRabiesVaccinatedAt}
            max={todayIso()}
          />
        </Field>

        <Field label={t('pets.fvrcp_vaccinated_at_label')}>
          <DateField
            value={fvrcpVaccinatedAt}
            onChange={setFvrcpVaccinatedAt}
            max={todayIso()}
          />
        </Field>

        <Field label={t('pets.care_notes_label')}>
          <TextInput
            value={careNotes}
            onChangeText={setCareNotes}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Pressable
          onPress={onSave}
          disabled={saving || deleting}
          style={[
            styles.saveButton,
            (saving || deleting) && styles.buttonDisabled,
          ]}
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

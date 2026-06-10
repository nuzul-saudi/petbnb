// Pet CRUD. Read/list/create existed since Step 5 (inline pet creation in
// the booking flow). Step 5.5 added the full surface — update + delete +
// the health fields (medical_needs / dietary_restrictions / medications)
// from migration 0006. Step 5.6 adds the photo upload helpers below.

import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/types/database';

export async function listPetsForOwner(ownerId: string): Promise<Tables<'pets'>[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPet(id: string): Promise<Tables<'pets'> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// All non-required fields are optional so callers (e.g. the inline
// pet-creation in the booking flow) can pass just `{ ownerId, name }` and
// fill in details later via updatePet.
export type CreatePetInput = {
  ownerId: string;
  name: string;
  breed?: string | null;
  breed_other?: string | null;
  age_months?: number | null;
  vaccination_doc_url?: string | null;
  rabies_vaccinated_at?: string | null;
  fvrcp_vaccinated_at?: string | null;
  care_notes?: string | null;
  behavioral_notes?: string | null;
  medical_needs?: string | null;
  dietary_restrictions?: string | null;
  medications?: string | null;
  photo_url?: string | null;
};

export async function createPet(input: CreatePetInput): Promise<Tables<'pets'>> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('pets')
    .insert({
      owner_id: input.ownerId,
      name: input.name.trim(),
      species: 'cat',
      breed: input.breed ?? null,
      breed_other: input.breed_other ?? null,
      age_months: input.age_months ?? null,
      vaccination_doc_url: input.vaccination_doc_url ?? null,
      rabies_vaccinated_at: input.rabies_vaccinated_at ?? null,
      fvrcp_vaccinated_at: input.fvrcp_vaccinated_at ?? null,
      care_notes: input.care_notes ?? null,
      behavioral_notes: input.behavioral_notes ?? null,
      medical_needs: input.medical_needs ?? null,
      dietary_restrictions: input.dietary_restrictions ?? null,
      medications: input.medications ?? null,
      photo_url: input.photo_url ?? null,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to create pet');
  return data;
}

// Caller-friendly patch shape — restricts updates to user-editable fields
// only. owner_id, id, created_at are deliberately not in here; RLS would
// reject them anyway, but typing them out blocks the mistake at the
// callsite.
export type UpdatePetPatch = Pick<
  TablesUpdate<'pets'>,
  | 'name'
  | 'breed'
  | 'breed_other'
  | 'age_months'
  | 'vaccination_doc_url'
  | 'rabies_vaccinated_at'
  | 'fvrcp_vaccinated_at'
  | 'care_notes'
  | 'behavioral_notes'
  | 'medical_needs'
  | 'dietary_restrictions'
  | 'medications'
  | 'photo_url'
>;

export async function updatePet(
  id: string,
  patch: UpdatePetPatch,
): Promise<Tables<'pets'>> {
  if (!supabase) throw new Error('No Supabase client');
  // Normalize name if present so we never write a row with leading/
  // trailing whitespace.
  const safe: UpdatePetPatch =
    typeof patch.name === 'string'
      ? { ...patch, name: patch.name.trim() }
      : patch;
  const { data, error } = await supabase
    .from('pets')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to update pet');
  return data;
}

export async function deletePet(id: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Photo upload (Step 5.6).
//
// The pet-photos bucket is private (per Phase 3 setup), so we return a
// signed URL — 7 days, which exceeds any MVP testing window. Production
// fix is to store the storage path and call createSignedUrl on render
// (logged in CLAUDE.md Section 13 as a follow-up). For now the signed URL
// goes into pets.photo_url and re-uploads when it expires.
//
// Path convention enforced by the bucket's RLS:
//   pet-photos/<owner_id>/<pet_id>/<filename>
// ---------------------------------------------------------------------------

export type PetPhotoSource =
  | { kind: 'web-file'; file: File }
  | { kind: 'native-uri'; uri: string; mimeType?: string };

/**
 * Multi-photo variant of pickPetPhoto. Same platform branching;
 * returns an array of selected sources, possibly empty.
 * Used by daily-updates so the host can select multiple photos at once.
 */
export async function pickPhotosMulti(): Promise<PetPhotoSource[]> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve([]);
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = () => {
        const files = input.files ? Array.from(input.files) : [];
        resolve(files.map((file) => ({ kind: 'web-file', file })));
      };
      input.click();
    });
  }
  try {
    const ImagePicker = await import('expo-image-picker');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return [];
    // allowsMultipleSelection requires SDK 49+; older versions degrade
    // gracefully and return one asset.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return [];
    return result.assets.map((a) => ({
      kind: 'native-uri' as const,
      uri: a.uri,
      mimeType: a.mimeType ?? undefined,
    }));
  } catch (e) {
    if (__DEV__) console.warn('[pets.pickPhotosMulti]', e);
    return [];
  }
}

/** Opens the platform's image picker. Returns null on cancel or denial. */
export async function pickPetPhoto(): Promise<PetPhotoSource | null> {
  if (Platform.OS === 'web') {
    // Render a transient hidden input, await selection, then resolve.
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? { kind: 'web-file', file } : null);
      };
      // Some browsers won't fire change at all if the dialog is dismissed
      // without selecting; we just leave the promise pending in that case
      // (the UI's "uploading" state should let the user cancel).
      input.click();
    });
  }
  try {
    const ImagePicker = await import('expo-image-picker');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return null;
    const a = result.assets[0];
    return { kind: 'native-uri', uri: a.uri, mimeType: a.mimeType ?? undefined };
  } catch (e) {
    if (__DEV__) console.warn('[pets.pickPetPhoto]', e);
    return null;
  }
}

/**
 * Uploads a picked photo to the pet-photos bucket and returns a signed
 * URL. Caller is expected to write the returned URL back to the pet via
 * updatePet({ photo_url: <url> }).
 *
 * Throws on storage write failure. Returns the signed URL on success.
 */
export async function uploadPetPhoto(args: {
  petId: string;
  ownerId: string;
  source: PetPhotoSource;
}): Promise<string> {
  if (!supabase) throw new Error('No Supabase client');

  let blob: Blob;
  let ext = 'jpg';

  if (args.source.kind === 'web-file') {
    blob = args.source.file;
    const nameExt = args.source.file.name.split('.').pop()?.toLowerCase();
    if (nameExt && /^(jpe?g|png|webp)$/.test(nameExt)) {
      ext = nameExt === 'jpeg' ? 'jpg' : nameExt;
    }
  } else {
    const resp = await fetch(args.source.uri);
    blob = await resp.blob();
    const mt = args.source.mimeType ?? blob.type;
    if (mt.includes('png')) ext = 'png';
    else if (mt.includes('webp')) ext = 'webp';
  }

  const path = `${args.ownerId}/${args.petId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('pet-photos')
    .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
  if (upErr) throw upErr;

  // 7-day signed URL. Long enough to comfortably exceed any MVP testing
  // window; UI re-uploads if it ever expires in practice.
  const { data, error: urlErr } = await supabase.storage
    .from('pet-photos')
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (urlErr || !data) throw urlErr ?? new Error('Failed to sign pet photo URL');
  return data.signedUrl;
}

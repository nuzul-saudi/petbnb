// Move 5 (2026-06-13) — profile avatar upload.
//
// Reuses the pet-photo pick + EXIF-strip pipeline. Avatars go to the
// `profile-avatars` bucket which has been PUBLIC since migration
// 0003 (and RLS-gated for writes by 0004's is_active_user check),
// so unlike pet-photos we don't sign on render — we store the
// public URL directly in profiles.avatar_url and every reader
// uses it as-is.
//
// Path convention enforced by the bucket's RLS:
//   profile-avatars/<user_id>/<filename>

import { materializeSourceToStrippedBlob } from '@/lib/image-strip';
import { pickPetPhoto, type PetPhotoSource } from '@/lib/pets';
import { supabase } from '@/lib/supabase';

// Re-export the pick helper under an avatar-shaped name so callsites
// read naturally. The PetPhotoSource discriminated union is generic
// enough to reuse — it's just "an image source" under a confusing
// historical name.
export const pickAvatarPhoto: () => Promise<PetPhotoSource | null> =
  pickPetPhoto;

export type AvatarSource = PetPhotoSource;

/**
 * Upload an avatar image to the public profile-avatars bucket.
 * Returns the public URL ready to write to profiles.avatar_url.
 *
 * Throws on storage write failure.
 */
export async function uploadAvatar(args: {
  userId: string;
  source: AvatarSource;
}): Promise<string> {
  if (!supabase) throw new Error('No Supabase client');

  // EXIF + GPS strip — privacy-critical (same reasoning as pet
  // photos: an avatar taken at the user's home would leak the
  // address via embedded GPS without this).
  const { blob, ext } = await materializeSourceToStrippedBlob(args.source);

  // Single canonical filename per user keeps the bucket tidy — each
  // re-upload overwrites in place rather than accumulating stale
  // images. upsert: true is required for the overwrite semantics.
  const path = `${args.userId}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('profile-avatars')
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || `image/${ext}`,
    });
  if (upErr) throw upErr;

  // Bucket is public — getPublicUrl returns the canonical URL
  // without needing a signing call. Cache-bust with the upload
  // timestamp so the browser doesn't keep showing the old image
  // after re-upload (same-path overwrite).
  const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Could not resolve avatar public URL');
  }
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Listing-photos CRUD — the host-side write surface for the home
// gallery shown on the listing detail screen.
//
// Differences vs the pet-photo pattern (src/lib/pets.ts):
//
// - The listing-photos bucket is PUBLIC (5 MB / jpeg|png|webp, see
//   migration 0003). We use getPublicUrl and store the resulting URL
//   directly on listing_photos.photo_url — no signed-URL refresh,
//   unlike pets which has to re-sign every 7 days.
//
// - Photos are managed POST-create on a dedicated screen, so the
//   listing_id always exists at the time of upload. No pendingCreatedId
//   retry seam is needed here — the row-then-photo race the pets form
//   guards against (form crashing between createPet and uploadPetPhoto)
//   simply cannot happen on the photos screen.
//
// - Multi-photo selection reuses pickPhotosMulti + PetPhotoSource from
//   pets.ts. We import the type; we don't redefine it.
//
// - Reorder is atomic via the reorder_listing_photos RPC (migration
//   0020). The two-phase write inside that function is what lets us
//   safely shuffle rows under the unique(listing_id, sort_order)
//   constraint.

import { supabase } from '@/lib/supabase';
import type { PetPhotoSource } from '@/lib/pets';
import type { Tables } from '@/types/database';

/**
 * Hard cap on photos per listing. Bigger than the condition-report cap
 * (CR_PHOTO_CAP = 6) because the home gallery is the listing's hero
 * artifact — but still small enough to keep the gallery's dot indicator
 * readable and uploads quick on flaky Saudi mobile networks. The UI
 * silently truncates a multi-select that would overflow.
 */
export const LISTING_PHOTO_CAP = 10;

const BUCKET = 'listing-photos';

type ListingPhotoRow = Tables<'listing_photos'>;

// ---------------------------------------------------------------------------
// Add (upload + insert row)
// ---------------------------------------------------------------------------

/**
 * Upload one picked photo to the listing-photos bucket and insert the
 * matching listing_photos row. The new photo lands at the end of the
 * current order (sort_order = current max + 1, or 0 if the listing
 * has no photos yet).
 *
 * RLS:
 * - storage.objects insert is gated by listings.host_id = auth.uid()
 *   (migration 0003 + 0004 admin bypass).
 * - listing_photos insert is gated identically (migration 0002 + 0004).
 *
 * Both checks happen server-side; the caller does not need to pass the
 * host id.
 */
export async function addListingPhoto(args: {
  listingId: string;
  source: PetPhotoSource;
}): Promise<ListingPhotoRow> {
  if (!supabase) throw new Error('No Supabase client');

  // 1. Materialize the picked source into a Blob + extension, mirroring
  //    uploadPetPhoto's shape so the two upload paths stay aligned.
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

  // 2. Path layout enforced by the bucket's RLS policy:
  //      listing-photos/<listing_id>/<filename>
  //    The (storage.foldername(name))[1] check in the policy reads the
  //    first segment as the listing id; the policy then verifies that
  //    listing's host_id matches auth.uid(). A timestamped filename
  //    keeps concurrent picks from colliding.
  const path = `${args.listingId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      upsert: false,
      contentType: blob.type || `image/${ext}`,
    });
  if (upErr) throw upErr;

  // 3. Public URL — the bucket is public, so this is a permanent URL
  //    that never needs re-signing.
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // 4. Decide the new sort_order. We read the current max and add 1.
  //    If the listing has no photos yet, we start at 0 — keeping the
  //    "lowest sort_order = cover" rule the feed transform relies on.
  //
  //    Race note: two concurrent addListingPhoto calls would race here
  //    and could pick the same max+1. The unique(listing_id, sort_order)
  //    constraint would then reject the second INSERT — the user sees
  //    an error and retries. In MVP the photo-manager UI is single-user
  //    single-screen, so this is acceptable; an at-scale fix would move
  //    the max+1 selection into a SECURITY DEFINER RPC like reorder.
  const { data: maxRow, error: maxErr } = await supabase
    .from('listing_photos')
    .select('sort_order')
    .eq('listing_id', args.listingId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const nextSort = (maxRow?.sort_order ?? -1) + 1;

  const { data: inserted, error: insErr } = await supabase
    .from('listing_photos')
    .insert({
      listing_id: args.listingId,
      photo_url: publicUrl,
      sort_order: nextSort,
    })
    .select()
    .single();
  if (insErr || !inserted) {
    // Best-effort cleanup of the orphaned storage object so we don't
    // leak files. Failure here is non-fatal; the row insert error is
    // what the caller cares about.
    await supabase.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => undefined);
    throw insErr ?? new Error('Failed to insert listing_photos row');
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Delete (remove row + storage object + compact remaining order)
// ---------------------------------------------------------------------------

/**
 * Extract the in-bucket storage path from a listing-photos public URL.
 *
 * Public URLs from Supabase storage have the shape:
 *   https://<project-ref>.supabase.co/storage/v1/object/public/listing-photos/<listing_id>/<filename>
 *
 * The marker we split on is the bucket-scoped prefix
 *   `/object/public/listing-photos/`
 * The path stored on listing_photos.photo_url is always one we wrote
 * ourselves via getPublicUrl in addListingPhoto, so the marker is
 * guaranteed to be present. If it isn't — for example a legacy seeded
 * URL pointing at a different bucket or a hand-edited row — we return
 * null and the caller skips the storage cleanup step (the row deletion
 * still proceeds; an orphaned storage object is recoverable, an
 * un-deletable row is not).
 *
 * Exported for unit-testability later; not used by callers today.
 */
export function listingPhotoStoragePathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const tail = url.slice(idx + marker.length);
  // Defensive: a trailing query string (e.g. ?t=…) would break remove().
  const noQuery = tail.split('?')[0];
  return noQuery || null;
}

/**
 * Delete one photo: the listing_photos row, then the underlying storage
 * object, then a reorder pass to compact the remaining photos back to
 * 0..N-1 so the cover-photo rule keeps working without gaps.
 *
 * Order rationale:
 *   1. Row first — if storage cleanup fails we have an orphan file
 *      (recoverable later by a cron sweep). If we deleted the storage
 *      object first and the row delete failed, the listing would render
 *      a broken image to every visitor (much worse).
 *   2. Storage cleanup is best-effort; we log on failure but don't
 *      throw, because the user-visible delete already succeeded.
 *   3. Reorder runs only when at least one photo remains — calling the
 *      RPC with an empty array would fail its length-mismatch check.
 */
export async function deleteListingPhoto(args: {
  photoId: string;
  listingId: string;
  photoUrl: string;
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');

  // 1. Row.
  const { error: delErr } = await supabase
    .from('listing_photos')
    .delete()
    .eq('id', args.photoId);
  if (delErr) throw delErr;

  // 2. Storage object — best-effort.
  const path = listingPhotoStoragePathFromUrl(args.photoUrl);
  if (path) {
    const { error: rmErr } = await supabase.storage
      .from(BUCKET)
      .remove([path]);
    if (rmErr && __DEV__) {
      console.warn('[listing-photos.delete] storage remove failed', rmErr);
    }
  }

  // 3. Compact the remaining order. Read in current sort_order, pass
  //    the ids array through the reorder RPC. Skip if nothing remains.
  const { data: remaining, error: readErr } = await supabase
    .from('listing_photos')
    .select('id, sort_order')
    .eq('listing_id', args.listingId)
    .order('sort_order', { ascending: true });
  if (readErr) throw readErr;
  if (remaining && remaining.length > 0) {
    await reorderListingPhotos({
      listingId: args.listingId,
      orderedIds: remaining.map((r) => r.id),
    });
  }
}

// ---------------------------------------------------------------------------
// Reorder (RPC wrapper)
// ---------------------------------------------------------------------------

/**
 * Atomic reorder via the reorder_listing_photos RPC (migration 0020).
 * orderedIds[0] becomes sort_order 0 (the cover). The server enforces
 * caller-owns-the-listing, full coverage of all photos for the listing,
 * and the unique-constraint-safe two-phase write.
 *
 * Error mapping:
 *   - 'unauthorized' (errcode 42501) — caller is not the host / admin,
 *     or the listing doesn't exist. Treated as a generic failure to
 *     the UI; we don't disambiguate from the client because either
 *     state should be impossible from a correctly-built host screen.
 *   - 'order_length_mismatch' / 'order_contains_foreign_ids' (22023) —
 *     the client and server disagree on which photos exist. The most
 *     likely cause is a stale local snapshot: another tab deleted or
 *     added a photo. The UI should re-fetch.
 *
 * For now we throw a single generic Error with the underlying message
 * preserved on .cause so the calling screen can render a friendly
 * Arabic error and log details in dev. Disambiguating per-code is a
 * follow-up if the UI grows finer-grained recovery.
 */
export async function reorderListingPhotos(args: {
  listingId: string;
  orderedIds: string[];
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');

  const { error } = await supabase.rpc('reorder_listing_photos', {
    p_listing_id: args.listingId,
    p_order: args.orderedIds,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[listing-photos.reorder] rpc failed', error);
    }
    throw new Error('reorder_failed', { cause: error });
  }
}

/**
 * Convenience wrapper: make `photoId` the cover by moving it to the
 * front of the current order, then calling reorderListingPhotos.
 *
 * No-op if the photo is already first (saves an RPC round-trip and
 * avoids surfacing a spurious "failed" toast for an already-cover tap).
 */
export async function setCoverPhoto(args: {
  listingId: string;
  photoId: string;
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');

  const { data: rows, error } = await supabase
    .from('listing_photos')
    .select('id, sort_order')
    .eq('listing_id', args.listingId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return;

  const currentIds = rows.map((r) => r.id);
  if (currentIds[0] === args.photoId) return;

  const remaining = currentIds.filter((id) => id !== args.photoId);
  if (remaining.length === currentIds.length) {
    // photoId not part of this listing — caller bug.
    throw new Error('photo_not_in_listing');
  }
  const newOrder = [args.photoId, ...remaining];

  await reorderListingPhotos({
    listingId: args.listingId,
    orderedIds: newOrder,
  });
}

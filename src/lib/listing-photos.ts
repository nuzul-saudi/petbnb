import { logWarn } from '@/lib/log';
// Listing-photos CRUD — the host-side write surface for the home
// gallery shown on the listing detail screen.
//
// Differences vs the pet-photo pattern (src/lib/pets.ts):
//
// - The listing-photos bucket is PUBLIC (5 MB / jpeg|png|webp, see
//   migration 0003). We use getPublicUrl and store the resulting URL
//   directly on the photo row — no signed-URL refresh, unlike pets
//   which has to re-sign every 7 days.
//
// - Photos are managed POST-create on a dedicated screen, so the
//   listing_id always exists at the time of upload. No pendingCreatedId
//   retry seam is needed here — the row-then-photo race the pets form
//   guards against simply cannot happen on the photos screen.
//
// - Multi-photo selection reuses pickPhotosMulti + PetPhotoSource from
//   pets.ts. We import the type; we don't redefine it.
//
// 8e — TWO-COPY MODEL
//
// Every mutating helper accepts a useDrafts flag. The screen computes
// it from the parent listing's status (approved/paused → drafts; the
// pending case → live) and passes it through.
//
//   useDrafts=false → operate on listing_photos directly. Same code as
//                     pre-8e. Used for pending listings (nothing live
//                     to protect).
//
//   useDrafts=true  → operate on listing_photo_drafts. On the FIRST
//                     touch (no draft rows yet), ensureDraftPhotoSnapshot
//                     copies the entire live listing_photos set into
//                     the draft table so the draft starts as a faithful
//                     copy of what's live. Then the host's edit applies
//                     to the draft. Storage object cleanup on delete is
//                     gated by a "no live row also references this URL"
//                     check, because the snapshot shares photo_urls
//                     between live and draft until 8f's promote/discard
//                     RPC runs.
//
//   Reorder when useDrafts=true uses a client-side two-phase write
//   instead of the reorder_listing_photos RPC (which targets the live
//   table only). The RPC equivalent for drafts ships in 8f.

import { materializeSourceToStrippedBlob } from '@/lib/image-strip';
import { supabase } from '@/lib/supabase';
import type { PetPhotoSource } from '@/lib/pets';

/**
 * Hard cap on photos per listing. Bigger than the condition-report cap
 * (CR_PHOTO_CAP = 6) because the home gallery is the listing's hero
 * artifact — but still small enough to keep the gallery's dot indicator
 * readable and uploads quick on flaky Saudi mobile networks. The UI
 * silently truncates a multi-select that would overflow.
 */
export const LISTING_PHOTO_CAP = 10;

const BUCKET = 'listing-photos';

// Shared row shape between listing_photos and listing_photo_drafts —
// the schemas are identical, the only difference is which table holds
// the row. Callers that need the table-specific type can use the
// Tables<...> generics directly.
type PhotoRowShape = {
  id: string;
  listing_id: string;
  photo_url: string;
  sort_order: number;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Internal — snapshot the live photo set into drafts on first touch
// ---------------------------------------------------------------------------

/**
 * 8e snapshot rule: when a host first touches photos (add/delete/
 * reorder/cover) on an approved or paused listing that has NO photo
 * draft yet, copy the entire current listing_photos set into
 * listing_photo_drafts BEFORE applying the host's change. Otherwise
 * the draft photo set would start partial, and 8f's promote step
 * (replaces live with draft) would wipe most of the live photos.
 *
 * Idempotent: zero draft rows present → snapshot; any rows present →
 * no-op. Repeated calls during a single op are safe.
 *
 * Known edge case (documented, not fixed in 8e): if the host deletes
 * every draft photo and then later adds one, this helper sees zero
 * rows and re-snapshots the live set. Mitigations land later (UI
 * "can't delete the last photo" guard, or a tracking column).
 *
 * Helper takes the parent listingId only — RLS gates both reads and
 * writes (admin OR host of listing AND is_active_user).
 */
async function ensureDraftPhotoSnapshot(listingId: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const s = supabase;

  const { count, error: countErr } = await s
    .from('listing_photo_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;

  const { data: live, error: liveErr } = await s
    .from('listing_photos')
    .select('photo_url, sort_order')
    .eq('listing_id', listingId);
  if (liveErr) throw liveErr;
  if (!live || live.length === 0) return;

  const { error: insErr } = await s.from('listing_photo_drafts').insert(
    live.map((p) => ({
      listing_id: listingId,
      photo_url: p.photo_url,
      sort_order: p.sort_order,
    })),
  );
  if (insErr) throw insErr;
}

/**
 * Materialise a picked source into a Blob + lowercase extension.
 * Strips EXIF/GPS metadata via the shared image-strip helper before
 * upload (Round 3 / 2026-06-XX) — a host's home photo with embedded
 * GPS coordinates would otherwise leak her home address.
 *
 * The strip pass re-encodes to JPEG, so all outputs land with
 * ext='jpg' regardless of the input format (jpg/png/webp). Storage
 * filenames stay timestamped + unique.
 */
async function pickSourceToBlob(
  source: PetPhotoSource,
): Promise<{ blob: Blob; ext: string }> {
  return materializeSourceToStrippedBlob(source);
}

// ---------------------------------------------------------------------------
// Add (upload + insert row)
// ---------------------------------------------------------------------------

/**
 * Upload one picked photo and insert the matching row in either
 * listing_photos (useDrafts=false) or listing_photo_drafts
 * (useDrafts=true). The new photo lands at the end of the current
 * order in whichever table — sort_order = current max + 1, or 0 if
 * empty.
 *
 * RLS gates both the storage object insert (gated by listings.host_id
 * = auth.uid()) and the row insert. Both checks happen server-side;
 * the caller does not pass a host id.
 */
export async function addListingPhoto(args: {
  listingId: string;
  source: PetPhotoSource;
  useDrafts: boolean;
}): Promise<PhotoRowShape> {
  if (!supabase) throw new Error('No Supabase client');
  const s = supabase;

  // Snapshot the live photo set into drafts on first touch.
  if (args.useDrafts) {
    await ensureDraftPhotoSnapshot(args.listingId);
  }

  const { blob, ext } = await pickSourceToBlob(args.source);

  // Path layout enforced by the bucket's RLS policy:
  //   listing-photos/<listing_id>/<filename>
  // The (storage.foldername(name))[1] check in the policy reads the
  // first segment as the listing id; the policy verifies that
  // listing's host_id matches auth.uid(). A timestamped filename
  // keeps concurrent picks from colliding.
  const path = `${args.listingId}/${Date.now()}.${ext}`;

  const { error: upErr } = await s.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType: blob.type || `image/${ext}`,
  });
  if (upErr) throw upErr;

  const { data: pub } = s.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // Race note: two concurrent addListingPhoto calls could pick the
  // same max+1. unique(listing_id, sort_order) rejects the second
  // INSERT, the user sees an error and retries. Acceptable for the
  // single-screen MVP UI.

  let inserted: PhotoRowShape;

  if (args.useDrafts) {
    const { data: maxRow, error: maxErr } = await s
      .from('listing_photo_drafts')
      .select('sort_order')
      .eq('listing_id', args.listingId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw maxErr;
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error: insErr } = await s
      .from('listing_photo_drafts')
      .insert({
        listing_id: args.listingId,
        photo_url: publicUrl,
        sort_order: nextSort,
      })
      .select()
      .single();
    if (insErr || !data) {
      // Cleanup orphan storage object — safe because no row references
      // it yet on either side.
      await s.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => undefined);
      throw insErr ?? new Error('Failed to insert listing_photo_drafts row');
    }
    inserted = data;
  } else {
    const { data: maxRow, error: maxErr } = await s
      .from('listing_photos')
      .select('sort_order')
      .eq('listing_id', args.listingId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw maxErr;
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error: insErr } = await s
      .from('listing_photos')
      .insert({
        listing_id: args.listingId,
        photo_url: publicUrl,
        sort_order: nextSort,
      })
      .select()
      .single();
    if (insErr || !data) {
      await s.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => undefined);
      throw insErr ?? new Error('Failed to insert listing_photos row');
    }
    inserted = data;
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
 * The path stored on photo_url is always one we wrote ourselves via
 * getPublicUrl in addListingPhoto, so the marker is guaranteed
 * present. If it isn't — for example a legacy seeded URL pointing at
 * a different bucket — we return null and the caller skips storage
 * cleanup.
 *
 * Exported for unit-testability later; not used by callers today.
 */
export function listingPhotoStoragePathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const tail = url.slice(idx + marker.length);
  const noQuery = tail.split('?')[0];
  return noQuery || null;
}

/**
 * Delete one photo: the row in whichever table, then the underlying
 * storage object (with a safety gate when useDrafts=true), then a
 * reorder pass to compact the remaining photos back to 0..N-1 so the
 * cover-photo rule keeps working without gaps.
 *
 * Order rationale:
 *   1. Row first — if storage cleanup fails we have an orphan file
 *      (recoverable later). If we deleted the storage object first
 *      and the row delete failed, the listing would render a broken
 *      image to every visitor.
 *   2. Storage cleanup is best-effort. When useDrafts=true, we ALSO
 *      check that no live row still references the same photo_url —
 *      because the snapshot-on-first-touch step copies photo_urls
 *      from listing_photos into listing_photo_drafts; deleting a
 *      draft photo's storage object would break the public-facing
 *      live photo that still references it. 8f's discard / promote
 *      RPCs handle this more cleanly with explicit URL diff lists.
 *   3. Reorder runs only when at least one photo remains.
 */
export async function deleteListingPhoto(args: {
  photoId: string;
  listingId: string;
  photoUrl: string;
  useDrafts: boolean;
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const s = supabase;

  if (args.useDrafts) {
    await ensureDraftPhotoSnapshot(args.listingId);
  }

  // 1. Row.
  if (args.useDrafts) {
    const { error: delErr } = await s
      .from('listing_photo_drafts')
      .delete()
      .eq('id', args.photoId);
    if (delErr) throw delErr;
  } else {
    const { error: delErr } = await s
      .from('listing_photos')
      .delete()
      .eq('id', args.photoId);
    if (delErr) throw delErr;
  }

  // 2. Storage object — best-effort, gated on "no live row references
  //    this URL" when useDrafts=true.
  const path = listingPhotoStoragePathFromUrl(args.photoUrl);
  if (path) {
    let safeToRemove = true;
    if (args.useDrafts) {
      const { data: liveRef } = await s
        .from('listing_photos')
        .select('id')
        .eq('listing_id', args.listingId)
        .eq('photo_url', args.photoUrl)
        .limit(1)
        .maybeSingle();
      // If a live row still references this URL, removing storage
      // would break the public-facing photo. Skip cleanup; 8f's
      // discard / promote RPCs handle this properly later.
      safeToRemove = !liveRef;
    }
    if (safeToRemove) {
      const { error: rmErr } = await s.storage
        .from(BUCKET)
        .remove([path]);
      if (rmErr && __DEV__) {
        logWarn('[listing-photos.delete] storage remove failed', rmErr);
      }
    }
  }

  // 3. Compact remaining order in whichever table.
  if (args.useDrafts) {
    const { data: remaining, error: readErr } = await s
      .from('listing_photo_drafts')
      .select('id, sort_order')
      .eq('listing_id', args.listingId)
      .order('sort_order', { ascending: true });
    if (readErr) throw readErr;
    if (remaining && remaining.length > 0) {
      await reorderListingPhotos({
        listingId: args.listingId,
        orderedIds: remaining.map((r) => r.id),
        useDrafts: true,
      });
    }
  } else {
    const { data: remaining, error: readErr } = await s
      .from('listing_photos')
      .select('id, sort_order')
      .eq('listing_id', args.listingId)
      .order('sort_order', { ascending: true });
    if (readErr) throw readErr;
    if (remaining && remaining.length > 0) {
      await reorderListingPhotos({
        listingId: args.listingId,
        orderedIds: remaining.map((r) => r.id),
        useDrafts: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

/**
 * Reorder a listing's photos so position i in orderedIds becomes
 * sort_order i. Two implementations:
 *
 *   useDrafts=false → atomic via the reorder_listing_photos RPC
 *                     (migration 0020). Server-side two-phase write
 *                     dodges the unique(listing_id, sort_order)
 *                     constraint. Caller-owns-listing enforced inside.
 *
 *   useDrafts=true  → client-side two-phase write against
 *                     listing_photo_drafts. Phase 1 parks every row
 *                     at a sentinel negative sort_order (unique
 *                     per-row via the array index, so the constraint
 *                     never bites mid-phase even with parallel
 *                     statements). Phase 2 writes the final 0..N-1.
 *                     Not atomic — failure between phases leaves the
 *                     draft set with some negative sort_orders;
 *                     recoverable on the next reorder. 8f replaces
 *                     this with a reorder_listing_photo_drafts RPC.
 *
 * Error path mirrors the previous helper: console.warn in dev, then
 * throw a generic Error('reorder_failed') with the underlying detail
 * preserved on .cause.
 */
export async function reorderListingPhotos(args: {
  listingId: string;
  orderedIds: string[];
  useDrafts: boolean;
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');

  // 8g — both paths now go through atomic SECURITY DEFINER RPCs.
  // The live path uses reorder_listing_photos (migration 0020); the
  // draft path uses reorder_listing_photo_drafts (migration 0023).
  // Same auth shape (admin or host-of-listing), same two-phase
  // negative-sentinel write under the unique constraint.
  if (args.useDrafts) {
    await ensureDraftPhotoSnapshot(args.listingId);
  }

  const rpcName = args.useDrafts
    ? 'reorder_listing_photo_drafts'
    : 'reorder_listing_photos';

  const { error } = await supabase.rpc(rpcName, {
    p_listing_id: args.listingId,
    p_order: args.orderedIds,
  });
  if (error) {
    if (__DEV__) {
      logWarn(`[listing-photos.reorder] ${rpcName} failed`, error);
    }
    throw new Error('reorder_failed', { cause: error });
  }
}

/**
 * Convenience wrapper: make `photoId` the cover by moving it to the
 * front of the current order, then calling reorderListingPhotos.
 *
 * Reads from listing_photo_drafts when useDrafts=true, else from
 * listing_photos.
 *
 * No-op if the photo is already first.
 */
export async function setCoverPhoto(args: {
  listingId: string;
  photoId: string;
  useDrafts: boolean;
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const s = supabase;

  if (args.useDrafts) {
    await ensureDraftPhotoSnapshot(args.listingId);
  }

  let rows: { id: string; sort_order: number }[] | null;

  if (args.useDrafts) {
    const { data, error } = await s
      .from('listing_photo_drafts')
      .select('id, sort_order')
      .eq('listing_id', args.listingId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    rows = data;
  } else {
    const { data, error } = await s
      .from('listing_photos')
      .select('id, sort_order')
      .eq('listing_id', args.listingId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    rows = data;
  }

  if (!rows || rows.length === 0) return;

  const currentIds = rows.map((r) => r.id);
  if (currentIds[0] === args.photoId) return;

  const remaining = currentIds.filter((id) => id !== args.photoId);
  if (remaining.length === currentIds.length) {
    throw new Error('photo_not_in_listing');
  }
  const newOrder = [args.photoId, ...remaining];

  await reorderListingPhotos({
    listingId: args.listingId,
    orderedIds: newOrder,
    useDrafts: args.useDrafts,
  });
}


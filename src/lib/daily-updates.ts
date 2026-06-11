import { logWarn } from '@/lib/log';
// Daily-update CRUD for Phase 6.2.
//
// A "daily update" is the host posting one or more photos (+ optional
// Arabic note) on an active booking. Both owner and host can read them;
// only the host can post. Storage lives in the private 'daily-update-media'
// bucket — same model as pet-photos (7-day signed URLs written into the
// row, re-upload when they expire; logged in CLAUDE.md as a follow-up).
//
// Path convention enforced by the bucket's RLS:
//   daily-update-media/<booking_id>/<timestamp>-<index>.<ext>

import { supabase } from '@/lib/supabase';
import type { PetPhotoSource } from '@/lib/pets';
import type { Tables } from '@/types/database';

export type DailyUpdate = Tables<'daily_updates'>;

export async function listDailyUpdates(
  bookingId: string,
): Promise<DailyUpdate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('daily_updates')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createDailyUpdate(args: {
  bookingId: string;
  hostId: string;
  sources: PetPhotoSource[];
  noteAr: string | null;
}): Promise<DailyUpdate> {
  if (!supabase) throw new Error('No Supabase client');

  // A daily update is valid if it has at least one photo OR a non-empty
  // note. Empty-and-empty is not allowed.
  const trimmedNote = args.noteAr?.trim() ?? '';
  if (args.sources.length === 0 && trimmedNote === '') {
    throw new Error('A daily update needs at least one photo or a note');
  }

  // Upload each photo serially. Same timestamp across the batch + an
  // ascending index keeps the storage path stable and human-readable.
  const urls: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < args.sources.length; i++) {
    const url = await uploadOnePhoto(args.bookingId, ts, i, args.sources[i]);
    urls.push(url);
  }

  const { data, error } = await supabase
    .from('daily_updates')
    .insert({
      booking_id: args.bookingId,
      host_id: args.hostId,
      photos: urls,
      note_ar: args.noteAr,
    })
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error('Failed to insert daily update');
  }
  return data;
}

// ---------------------------------------------------------------------------
// Edit + delete (Step 6.3). RLS (migration 0014) gates writes to
// host_id = auth.uid() + host owns the booking's listing.
// ---------------------------------------------------------------------------

const BUCKET = 'daily-update-media';

export async function updateDailyUpdate(args: {
  updateId: string;
  hostId: string;
  keepPhotoUrls: string[];
  newSources: PetPhotoSource[];
  noteAr: string | null;
}): Promise<DailyUpdate> {
  if (!supabase) throw new Error('No Supabase client');

  // 1. Fetch the current row to learn its booking_id (needed for new
  //    photo paths), its existing photo URLs (needed to compute the
  //    delete set), AND the related booking's status (needed for the
  //    active-only guard). Embedded join keeps it one round-trip.
  const { data: current, error: rErr } = await supabase
    .from('daily_updates')
    .select('booking_id, photos, booking:bookings(status)')
    .eq('id', args.updateId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!current) throw new Error('Daily update not found');

  // App-layer active-only guard. Migration 0015 also enforces this at
  // the RLS layer; this check gives a clearer error before any I/O.
  const bookingStatus =
    (current as { booking?: { status: string } | null }).booking?.status;
  if (bookingStatus !== 'active') {
    throw new Error(
      `Cannot edit a daily update while the booking is in status: ${bookingStatus ?? 'unknown'}`,
    );
  }

  const currentUrls = Array.isArray(current.photos)
    ? (current.photos as string[])
    : [];

  // Robust intersection: any URL passed in keepPhotoUrls that isn't
  // actually in the current row is ignored (e.g. stale UI state).
  const keep = currentUrls.filter((u) => args.keepPhotoUrls.includes(u));
  const toDelete = currentUrls.filter((u) => !args.keepPhotoUrls.includes(u));

  // 2. Upload the new sources (if any).
  const ts = Date.now();
  const newUrls: string[] = [];
  for (let i = 0; i < args.newSources.length; i++) {
    const url = await uploadOnePhoto(
      current.booking_id,
      ts,
      i,
      args.newSources[i],
    );
    newUrls.push(url);
  }

  const finalPhotos = [...keep, ...newUrls];

  // Match createDailyUpdate's content invariant — at least one photo OR
  // a non-empty note. Empty-and-empty is not allowed; to truly remove
  // the entry, the host should delete it instead.
  const trimmedNote = args.noteAr?.trim() ?? '';
  if (finalPhotos.length === 0 && trimmedNote === '') {
    throw new Error('A daily update needs at least one photo or a note');
  }

  // 3. Update the row. host_id and booking_id are NOT touched.
  const { data, error } = await supabase
    .from('daily_updates')
    .update({
      photos: finalPhotos,
      note_ar: args.noteAr,
    })
    .eq('id', args.updateId)
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error('Failed to update daily update');
  }

  // 4. Best-effort delete the removed files from storage. Warn-and-
  //    continue; orphans are acceptable per the booking-edit pattern.
  await deletePhotosFromBucket(toDelete);

  return data;
}

export async function deleteDailyUpdate(args: {
  updateId: string;
  hostId: string;
}): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');

  // Fetch the row first so we know which files to clean up + verify
  // the booking is still active. Embedded join keeps it one round-trip.
  // If the row is gone (or RLS hides it), we still proceed to the
  // delete call below — it will be a no-op.
  const { data: current, error: rErr } = await supabase
    .from('daily_updates')
    .select('photos, booking:bookings(status)')
    .eq('id', args.updateId)
    .maybeSingle();
  if (rErr) throw rErr;

  // App-layer active-only guard. Only enforced when the row exists; if
  // it's already gone we let the (no-op) delete proceed.
  if (current) {
    const bookingStatus =
      (current as { booking?: { status: string } | null }).booking?.status;
    if (bookingStatus !== 'active') {
      throw new Error(
        `Cannot delete a daily update while the booking is in status: ${bookingStatus ?? 'unknown'}`,
      );
    }
  }

  const urls = current && Array.isArray(current.photos)
    ? (current.photos as string[])
    : [];

  // Best-effort delete photos BEFORE the row — if photo deletion fails,
  // we still proceed to delete the row (orphans acceptable). Order matters
  // only insofar as we can't read .photos after the row is gone.
  await deletePhotosFromBucket(urls);

  const { error } = await supabase
    .from('daily_updates')
    .delete()
    .eq('id', args.updateId);
  if (error) throw error;
}

// Extract the bucket-relative path from a Supabase signed URL.
// Format:  https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=<jwt>
// Returns null when the URL doesn't match the expected shape (e.g. stale
// data from a different bucket or origin) — the caller logs + skips.
function pathFromSignedUrl(url: string, bucket: string): string | null {
  const marker = `/object/sign/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const after = url.slice(idx + marker.length);
  const q = after.indexOf('?');
  return q === -1 ? after : after.slice(0, q);
}

// Warn-and-continue deletion. Returns when the call completes (success
// OR failure). Never throws — the caller's DB op should not be blocked
// by storage cleanup issues.
async function deletePhotosFromBucket(urls: string[]): Promise<void> {
  if (!supabase || urls.length === 0) return;
  const paths = urls
    .map((u) => pathFromSignedUrl(u, BUCKET))
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error && __DEV__) {
      logWarn('[daily_updates.bucket_cleanup_failed]', error, paths);
    }
  } catch (e) {
    if (__DEV__) {
      logWarn('[daily_updates.bucket_cleanup_threw]', e, paths);
    }
  }
}

// Mirrors uploadPetPhoto in lib/pets.ts (fetch → blob → upload →
// createSignedUrl). Duplicated rather than abstracted because the path
// convention and bucket differ; a generic helper would obscure that.
async function uploadOnePhoto(
  bookingId: string,
  ts: number,
  index: number,
  source: PetPhotoSource,
): Promise<string> {
  if (!supabase) throw new Error('No Supabase client');

  let blob: Blob;
  let ext = 'jpg';

  if (source.kind === 'web-file') {
    blob = source.file;
    const nameExt = source.file.name.split('.').pop()?.toLowerCase();
    if (nameExt && /^(jpe?g|png|webp)$/.test(nameExt)) {
      ext = nameExt === 'jpeg' ? 'jpg' : nameExt;
    }
  } else {
    const resp = await fetch(source.uri);
    blob = await resp.blob();
    const mt = source.mimeType ?? blob.type;
    if (mt.includes('png')) ext = 'png';
    else if (mt.includes('webp')) ext = 'webp';
  }

  const path = `${bookingId}/${ts}-${index}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('daily-update-media')
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || `image/${ext}`,
    });
  if (upErr) throw upErr;

  const { data, error: urlErr } = await supabase.storage
    .from('daily-update-media')
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (urlErr || !data) {
    throw urlErr ?? new Error('Failed to sign daily-update photo URL');
  }
  return data.signedUrl;
}

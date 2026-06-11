// Condition-report CRUD for Phase 6.4.
//
// A "condition report" is the host's evidence-of-record at drop-off
// (check_in) and pickup (check_out): photos + one note. At most two
// per booking (one per phase). Immutable by design — no update or
// delete functions are exported here, mirroring the database (RLS
// has no UPDATE/DELETE policies on condition_reports; SELECT is open
// to both owner and host, INSERT is host-only after migration 0016).
//
// Owner views only — host-only INSERT is enforced at the RLS layer
// via condition_reports_insert_host (rows) +
// condition_report_photos_storage_insert_host (storage). The screen
// gates by viewer role; the lib trusts RLS for authorization.
//
// Storage: private 'condition-report-photos' bucket with 7-day signed
// URLs written into the row. Re-upload when they expire (logged in
// CLAUDE.md as a follow-up). Path convention enforced by the bucket's
// RLS:
//   condition-report-photos/<booking_id>/<timestamp>-<index>.<ext>

import { materializeSourceToStrippedBlob } from '@/lib/image-strip';
import { supabase } from '@/lib/supabase';
import type { PetPhotoSource } from '@/lib/pets';
import type { Enums, Tables } from '@/types/database';

export type ConditionReport = Tables<'condition_reports'>;

export async function listConditionReports(
  bookingId: string,
): Promise<ConditionReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('condition_reports')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createConditionReport(args: {
  bookingId: string;
  hostId: string;
  phase: Enums<'condition_report_phase'>;
  sources: PetPhotoSource[];
  note: string | null;
}): Promise<ConditionReport> {
  if (!supabase) throw new Error('No Supabase client');

  // Content rule (same as daily updates): a report needs at least one
  // photo OR a non-empty note. Empty-and-empty is not allowed.
  const trimmedNote = args.note?.trim() ?? '';
  if (args.sources.length === 0 && trimmedNote === '') {
    throw new Error(
      'A condition report needs at least one photo or a note',
    );
  }

  // Upload each photo serially. Same timestamp across the batch +
  // ascending index keeps the storage path stable and human-readable.
  const urls: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < args.sources.length; i++) {
    const url = await uploadOnePhoto(args.bookingId, ts, i, args.sources[i]);
    urls.push(url);
  }

  // Single-note design: parks the note in health_notes. weight_note and
  // behavior_notes stay null. The schema kept all three text fields from
  // the original three-section design; we collapsed the UI to one box.
  const { data, error } = await supabase
    .from('condition_reports')
    .insert({
      booking_id: args.bookingId,
      reporter_id: args.hostId,
      phase: args.phase,
      photos: urls,
      health_notes: trimmedNote === '' ? null : trimmedNote,
    })
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error('Failed to insert condition report');
  }
  return data;
}

// Mirrors uploadOnePhoto in lib/daily-updates.ts (fetch → blob → upload
// → createSignedUrl). Duplicated rather than abstracted because the
// path convention and bucket differ across the three "host posts
// evidence" surfaces (pets, daily updates, condition reports); a
// generic helper would obscure that.
async function uploadOnePhoto(
  bookingId: string,
  ts: number,
  index: number,
  source: PetPhotoSource,
): Promise<string> {
  if (!supabase) throw new Error('No Supabase client');

  // EXIF strip + materialize (Round 3 / 2026-06-XX). Condition-report
  // photos are evidence shots taken at the host's home; without
  // stripping, embedded GPS would leak the host's address.
  const { blob, ext } = await materializeSourceToStrippedBlob(source);

  const path = `${bookingId}/${ts}-${index}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('condition-report-photos')
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || `image/${ext}`,
    });
  if (upErr) throw upErr;

  const { data, error: urlErr } = await supabase.storage
    .from('condition-report-photos')
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (urlErr || !data) {
    throw urlErr ?? new Error('Failed to sign condition-report photo URL');
  }
  return data.signedUrl;
}

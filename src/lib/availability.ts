// Milestone B — Listing availability (blocked dates) helpers.
//
// Three operations the host needs:
//   - list ranges for a listing
//   - add a range
//   - remove a range
//
// Plus a client-side overlap helper used by the booking request screen
// to warn the owner before submit (the DB-level trigger in 0027 is the
// hard gate; this is just the friendly UX surface).
//
// RLS:
//   - SELECT: any authenticated user. Owners need to see ranges when
//     picking dates.
//   - INSERT/UPDATE/DELETE: host of parent listing (AND is_active_user)
//     OR admin.

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type BlockedRange = Tables<'listing_blocked_dates'>;

/**
 * Return all blocked ranges for a listing, sorted by start_date asc.
 * For both the host's manage screen AND the owner's pre-check.
 */
export async function listBlockedRanges(
  listingId: string,
): Promise<BlockedRange[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listing_blocked_dates')
    .select('*')
    .eq('listing_id', listingId)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Insert a new blocked range. Throws on overlap with an existing
 * range only if the host's RLS rejects (we don't dedupe client-side;
 * overlaps within a listing's blocked set are harmless).
 *
 * Half-open convention: end is exclusive. The CHECK constraint
 * (end_date > start_date) is enforced server-side.
 */
export async function addBlockedRange(args: {
  listingId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
}): Promise<BlockedRange> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('listing_blocked_dates')
    .insert({
      listing_id: args.listingId,
      start_date: args.startDate,
      end_date: args.endDate,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to insert range');
  return data;
}

export async function removeBlockedRange(rangeId: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase
    .from('listing_blocked_dates')
    .delete()
    .eq('id', rangeId);
  if (error) throw error;
}

// rangesOverlap + isRangeBlocked moved to src/lib/range-overlap.ts
// in 2026-06-11 R1C6 so tests can target the pure helpers without
// pulling expo-constants / supabase-js into the vitest module graph.
// Re-exported for back-compat with existing import paths.
export { isRangeBlocked, rangesOverlap } from '@/lib/range-overlap';

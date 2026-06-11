// R2C6 — two-way reviews. The `reviews` table has existed since 0001
// but had no INSERT/SELECT policies and no app code touching it
// except the S2 rating rollup for listing cards. This module is the
// first writer.
//
// Behavior:
//   - One review per (booking, rater). RLS in 0029 part 3 enforces:
//       rater_id = auth.uid()
//       booking.status = 'completed'
//       rater is the booking's owner OR the listing's host
//       ratee is the OTHER party
//     unique(booking_id, rater_id) backstops double-submits.
//   - Stars 1–5 required, text optional.
//   - Reviews are IMMUTABLE once posted (no UPDATE/DELETE policies
//     by design — same posture as condition_reports). A future
//     moderation milestone can introduce admin-only updates.

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Review = Tables<'reviews'>;

export type CreateReviewInput = {
  bookingId: string;
  raterId: string;
  rateeId: string;
  stars: number; // 1..5
  textAr?: string | null;
};

/**
 * Insert a review row. Caller is responsible for picking rater/ratee
 * correctly (owner → host or host → owner); RLS rejects mismatches.
 *
 * Throws on:
 *   - supabase missing
 *   - stars out of [1, 5]
 *   - DB error (unique violation, RLS, etc.)
 */
export async function createReview(input: CreateReviewInput): Promise<Review> {
  if (!supabase) throw new Error('No Supabase client');
  if (input.stars < 1 || input.stars > 5 || !Number.isInteger(input.stars)) {
    throw new Error('Stars must be an integer 1..5');
  }
  const text = input.textAr?.trim();
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: input.bookingId,
      rater_id: input.raterId,
      ratee_id: input.rateeId,
      stars: input.stars,
      text_ar: text && text.length > 0 ? text : null,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to create review');
  return data;
}

/**
 * Returns the review the caller previously wrote for this booking,
 * or null if they haven't yet. Used by the booking detail screen to
 * decide between rendering the "Rate" form vs the "you already
 * rated" read-only display.
 */
export async function findMyReview(
  bookingId: string,
  raterId: string,
): Promise<Review | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('rater_id', raterId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

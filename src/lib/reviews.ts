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

export type HostReview = {
  id: string;
  stars: number;
  text_ar: string | null;
  created_at: string;
  rater_name: string | null;
};

/**
 * Returns up to `limit` reviews where the given host is the ratee.
 * Joins the rater profile to surface their display name on the
 * rich listing-detail page. Newest-first. Empty array on no
 * supabase client or on RLS-filtered result.
 *
 * RLS on the reviews table: any authenticated user can read
 * reviews (per 0029 part 3). Guests (anon) cannot — so the rich
 * detail page falls back to "no reviews shown" for guests
 * regardless of how many actually exist.
 */
export async function listReviewsForHost(
  hostId: string,
  limit = 10,
): Promise<HostReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select(
      `
      id,
      stars,
      text_ar,
      created_at,
      rater:profiles!reviews_rater_id_fkey(full_name)
    `,
    )
    .eq('ratee_id', hostId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      stars: number;
      text_ar: string | null;
      created_at: string;
      rater: { full_name: string } | null;
    };
    return {
      id: r.id,
      stars: r.stars,
      text_ar: r.text_ar,
      created_at: r.created_at,
      rater_name: r.rater?.full_name ?? null,
    };
  });
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

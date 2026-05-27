// Read-only data access for the listings feed and listing detail screen.
// Inserts/updates land in Step 7 (host create-listing flow).

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type ListingFilter = {
  neighborhood?: string;
  femaleHostsOnly?: boolean;
};

type HostSummary = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'avatar_url'>;
type PhotoSummary = Pick<Tables<'listing_photos'>, 'id' | 'photo_url' | 'sort_order'>;

export type ListingFeedItem = Tables<'listings'> & {
  host: HostSummary | null;
  cover_photo: string | null;
};

export type ListingDetail = Tables<'listings'> & {
  host: HostSummary | null;
  photos: PhotoSummary[];
};

export async function listActiveListings(
  filter: ListingFilter = {},
): Promise<ListingFeedItem[]> {
  if (!supabase) return [];

  let query = supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, avatar_url),
      listing_photos(id, photo_url, sort_order)
    `,
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (filter.neighborhood) query = query.eq('neighborhood', filter.neighborhood);
  if (filter.femaleHostsOnly) query = query.eq('host_gender', 'female');

  const { data, error } = await query;
  if (error) throw error;

  // The nested select returns a typed shape but with `listing_photos` as the
  // raw rows. Pick the lowest sort_order as the cover.
  return (data ?? []).map((row) => {
    const photos = (row.listing_photos ?? []) as PhotoSummary[];
    const cover = photos.length
      ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
      : null;
    const { listing_photos: _drop, ...rest } = row as typeof row & {
      listing_photos?: PhotoSummary[];
    };
    return {
      ...(rest as Tables<'listings'>),
      host: (row.host ?? null) as HostSummary | null,
      cover_photo: cover,
    };
  });
}

export async function getListingWithPhotos(id: string): Promise<ListingDetail | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, avatar_url),
      listing_photos(id, photo_url, sort_order)
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const photos = ((data.listing_photos ?? []) as PhotoSummary[]).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const { listing_photos: _drop, ...rest } = data as typeof data & {
    listing_photos?: PhotoSummary[];
  };

  return {
    ...(rest as Tables<'listings'>),
    host: (data.host ?? null) as HostSummary | null,
    photos,
  };
}

/**
 * Count of completed bookings across all of a host's listings. Used by
 * the listing card + detail to decide whether to show real stats or the
 * "جديد" badge per the no-fake-numbers rule from test round 1.
 *
 * RLS NOTE (deferred): the bookings SELECT policy only lets the booking
 * owner, the listing host, or an admin read a row. From an *owner*
 * browsing the feed, this query against another host's bookings always
 * returns 0 — even if real completions exist. In MVP this is fine
 * because we have zero completions yet, so every host shows "جديد".
 * Before real completions can roll in (post-Step 10), swap to a
 * SECURITY DEFINER RPC or denormalize a `completed_bookings_count`
 * counter cache onto profiles. Tracked in CLAUDE.md Section 11 as a
 * launch-blocker once reviews/completions go live.
 */
export async function countCompletedBookingsForHost(
  hostId: string,
): Promise<number> {
  if (!supabase) return 0;

  // Step 1: which listings belong to this host? Short-circuit if none.
  const { data: hostListings, error: lErr } = await supabase
    .from('listings')
    .select('id')
    .eq('host_id', hostId);
  if (lErr) throw lErr;
  if (!hostListings || hostListings.length === 0) return 0;

  // Step 2: count completed bookings against those listing IDs.
  // `head: true` skips returning the rows themselves — we only want the count.
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .in(
      'listing_id',
      hostListings.map((l) => l.id),
    );
  if (error) throw error;
  return count ?? 0;
}

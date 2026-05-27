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

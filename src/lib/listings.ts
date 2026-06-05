// Read-only data access for the listings feed and listing detail screen.
// Inserts/updates land in Step 7 (host create-listing flow).

import type { CityKey } from '@/lib/cities';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type ListingFilter = {
  /**
   * Optional city filter (Step 7.2c). When omitted, no city constraint
   * is applied — preserves the pre-7.2 behavior of every existing
   * caller. The owner feed (OwnerFeedHome) sets this to the user's
   * selected city.
   */
  city?: CityKey;
  neighborhood?: string;
  femaleHostsOnly?: boolean;
  /**
   * When provided, the result is sorted nearest-first by haversine
   * distance from this point. Listings without lat/lng remain in the
   * result (we don't filter — we just sort), sorted last with
   * `distance_km = null`. The owner feed's card hides the distance
   * line entirely for those.
   */
  sortByDistance?: { lat: number; lng: number };
};

type HostSummary = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'full_name_en' | 'avatar_url'
>;
type PhotoSummary = Pick<Tables<'listing_photos'>, 'id' | 'photo_url' | 'sort_order'>;

export type ListingFeedItem = Tables<'listings'> & {
  host: HostSummary | null;
  cover_photo: string | null;
  distance_km: number | null;
};

/**
 * Great-circle distance between two lat/lng points in kilometers.
 * Haversine formula; accurate to <0.5% at city scale, ample for
 * the "X.X كم" label on listing cards.
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km.
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
      host:profiles(id, full_name, full_name_en, avatar_url),
      listing_photos(id, photo_url, sort_order)
    `,
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (filter.city) query = query.eq('city', filter.city);
  if (filter.neighborhood) query = query.eq('neighborhood', filter.neighborhood);
  if (filter.femaleHostsOnly) query = query.eq('host_gender', 'female');

  const { data, error } = await query;
  if (error) throw error;

  // The nested select returns a typed shape but with `listing_photos` as the
  // raw rows. Pick the lowest sort_order as the cover; compute distance
  // from the caller's location if provided.
  const items: ListingFeedItem[] = (data ?? []).map((row) => {
    const photos = (row.listing_photos ?? []) as PhotoSummary[];
    const cover = photos.length
      ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
      : null;
    const { listing_photos: _drop, ...rest } = row as typeof row & {
      listing_photos?: PhotoSummary[];
    };
    const typedRest = rest as Tables<'listings'>;
    const distance =
      filter.sortByDistance &&
      typedRest.lat != null &&
      typedRest.lng != null
        ? distanceKm(
            filter.sortByDistance.lat,
            filter.sortByDistance.lng,
            typedRest.lat,
            typedRest.lng,
          )
        : null;
    return {
      ...typedRest,
      host: (row.host ?? null) as HostSummary | null,
      cover_photo: cover,
      distance_km: distance,
    };
  });

  if (filter.sortByDistance) {
    // Nearest first; nulls (listings without coordinates) sorted last.
    items.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  }

  return items;
}

export async function getListingWithPhotos(id: string): Promise<ListingDetail | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, full_name_en, avatar_url),
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
 * Returns a host's own listings — every row where host_id matches,
 * regardless of is_active. Hosts need to see their inactive listings
 * on their host home to manage them. RLS already permits a host to
 * SELECT their own listing rows without further policy work.
 *
 * Shape mirrors listActiveListings (same nested select + cover-photo
 * extraction), so callers can reuse ListingCard. distance_km is always
 * null — distance has no meaning on the host's own list.
 */
export async function listOwnListings(
  hostId: string,
): Promise<ListingFeedItem[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, full_name_en, avatar_url),
      listing_photos(id, photo_url, sort_order)
    `,
    )
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Same cover-photo + drop-join transform as listActiveListings.
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
      distance_km: null,
    };
  });
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

/**
 * Count of pending (status='requested') bookings across all of a
 * host's listings. Used by the AppHeader persona-switch attention dot
 * (Step 7.1e) to flag waiting host work to a 'both' user currently in
 * owner persona — the whole point of the dot is to be visible WHILE
 * the user is in owner mode.
 *
 * Same query shape as countCompletedBookingsForHost above (host owns
 * the listings, bookings RLS permits the host to read these rows).
 * Only the status filter differs.
 */
export async function countPendingHostBookings(
  hostId: string,
): Promise<number> {
  if (!supabase) return 0;

  const { data: hostListings, error: lErr } = await supabase
    .from('listings')
    .select('id')
    .eq('host_id', hostId);
  if (lErr) throw lErr;
  if (!hostListings || hostListings.length === 0) return 0;

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'requested')
    .in(
      'listing_id',
      hostListings.map((l) => l.id),
    );
  if (error) throw error;
  return count ?? 0;
}

/**
 * Insert a new host-created listing (Step 7.2d) — the first
 * listings INSERT path in the codebase. Sets is_active=false
 * EXPLICITLY (the migration 0019 default is also false, but writing
 * it in code makes the approval-gate intent clear at the callsite).
 *
 * Title and description are written to the _ar columns regardless of
 * the host's typing language. We have no language detection or
 * translation step yet (deferred); _en columns stay NULL. The display
 * path uses pickLocalized, which falls back to _ar when _en is empty,
 * so listings render correctly in both locales until translation lands.
 *
 * tier and additional_pet_discount are NOT set — the DB schema defaults
 * (bronze / 0.70) apply.
 *
 * RLS: listings_insert_host (migration 0004) permits the insert as long
 * as host_id = auth.uid() and the user is not suspended. No policy
 * change was needed for 7.2.
 */
export async function createListing(input: {
  hostId: string;
  city: CityKey;
  neighborhood: string;
  title: string;
  description: string;
  nightlyPrice: number;
  maxConcurrentPets: number;
  hasResidentPets: boolean;
  residentPetsNote: string | null;
  offersGrooming: boolean;
  hostGender: 'female' | 'male';
}): Promise<{ id: string }> {
  if (!supabase) throw new Error('supabase not configured');

  const { data, error } = await supabase
    .from('listings')
    .insert({
      host_id: input.hostId,
      city: input.city,
      neighborhood: input.neighborhood,
      title_ar: input.title,
      description_ar: input.description,
      nightly_price_sar: input.nightlyPrice,
      max_concurrent_pets: input.maxConcurrentPets,
      has_resident_pets: input.hasResidentPets,
      resident_pets_note: input.residentPetsNote,
      offers_grooming: input.offersGrooming,
      host_gender: input.hostGender,
      is_active: false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id };
}

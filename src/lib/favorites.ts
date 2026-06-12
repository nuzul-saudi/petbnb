// Round 11 — saved-listings (favorites) data layer.
//
// API:
//   listFavoriteListingIds(userId): Promise<Set<string>>
//     Cheap fetch for the feed/heart toggle — just the listing ids
//     the user has favorited. Used to decide which cards render with
//     a filled heart vs an outlined one.
//
//   listFavoriteListings(userId): Promise<ListingFeedItem[]>
//     Hydrates a user's favorited set into the same shape as
//     listActiveListings — full card data, ordered by created_at desc
//     of the favorite (not the listing). Drives the My Favorites
//     screen.
//
//   addFavorite(userId, listingId): Promise<void>
//   removeFavorite(userId, listingId): Promise<void>
//     Toggle helpers. Both idempotent at the data layer:
//       - add uses an UPSERT-style ON CONFLICT DO NOTHING via the
//         supabase insert+ignore pattern; a duplicate doesn't throw.
//       - remove DELETE matches by composite PK; no-op if absent.

import { logWarn } from '@/lib/log';
import type { ListingFeedItem } from '@/lib/listings';
import { distanceKm } from '@/lib/listings';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export async function listFavoriteListingIds(
  userId: string,
): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId);
  if (error) {
    logWarn('[favorites.list_ids_failed]', error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.listing_id));
}

export async function listFavoriteListings(
  userId: string,
): Promise<ListingFeedItem[]> {
  if (!supabase) return [];

  // Join through favorites → listings via a nested select. The
  // favorites_user_recent_idx (0033) backs the order-by; the
  // listings RLS still filters out paused / admin_disabled rows
  // for non-host viewers, which is the desired behavior — a
  // favorited listing that the host took down shouldn't render
  // as a clickable card.
  type FavoriteRow = {
    listing_id: string;
    created_at: string;
    listing:
      | (Tables<'listings'> & {
          host:
            | Pick<
                Tables<'profiles'>,
                'id' | 'full_name' | 'full_name_en' | 'avatar_url'
              >
            | null;
          listing_photos:
            | Pick<
                Tables<'listing_photos'>,
                'id' | 'photo_url' | 'sort_order'
              >[]
            | null;
        })
      | null;
  };
  const { data, error } = await supabase
    .from('favorites')
    .select(
      `
      listing_id,
      created_at,
      listing:listings(
        *,
        host:profiles(id, full_name, full_name_en, avatar_url),
        listing_photos(id, photo_url, sort_order)
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .map((row): ListingFeedItem | null => {
      const fav = row as unknown as FavoriteRow;
      if (!fav.listing) return null;
      const l = fav.listing;
      const photos = l.listing_photos ?? [];
      const cover = photos.length
        ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
        : null;
      const { listing_photos: _drop, host, ...rest } = l as typeof l & {
        listing_photos?: unknown;
      };
      return {
        ...(rest as Tables<'listings'>),
        host: host ?? null,
        cover_photo: cover,
        distance_km: null,
      };
    })
    .filter((x): x is ListingFeedItem => x !== null);
}

export async function addFavorite(
  userId: string,
  listingId: string,
): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  // Composite PK conflict (already favorited) is fine — make it a no-op
  // rather than a thrown error. The user expects toggle semantics.
  const { error } = await supabase
    .from('favorites')
    .upsert({ user_id: userId, listing_id: listingId }, { onConflict: 'user_id,listing_id' });
  if (error) {
    // Silent on PK-conflict-like errors; surface anything else.
    if (!error.message?.toLowerCase().includes('duplicate')) {
      throw error;
    }
  }
}

export async function removeFavorite(
  userId: string,
  listingId: string,
): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

/** Used by useFavorites hook. distanceKm re-export so the favorites
 *  list can compute distance if the caller has coords. */
export { distanceKm };

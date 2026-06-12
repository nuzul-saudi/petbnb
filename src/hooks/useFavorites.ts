// useFavorites — shared state for the owner-feed heart toggle and the
// My Favorites screen. Holds the Set<listing_id> the current user has
// favorited; exposes optimistic toggle + a refetch.
//
// Optimistic: tapping the heart updates the local Set immediately; on
// failure we revert and log. Avoids the wait-for-roundtrip latency
// that makes heart taps feel sluggish.

import { useCallback, useEffect, useState } from 'react';

import {
  addFavorite,
  listFavoriteListingIds,
  removeFavorite,
} from '@/lib/favorites';
import { logWarn } from '@/lib/log';

export type UseFavoritesResult = {
  ids: Set<string>;
  /** Returns true if the listing is in favorites AFTER the toggle. */
  toggle: (listingId: string) => Promise<boolean>;
  /** Re-pull from the DB. Use after sign-in or pull-to-refresh. */
  refetch: () => Promise<void>;
  loading: boolean;
};

export function useFavorites(userId: string | null): UseFavoritesResult {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const fresh = await listFavoriteListingIds(userId);
    setIds(fresh);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const toggle = useCallback(
    async (listingId: string): Promise<boolean> => {
      if (!userId) return false;
      const wasFavorited = ids.has(listingId);
      // Optimistic — update local state immediately.
      setIds((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.delete(listingId);
        else next.add(listingId);
        return next;
      });
      try {
        if (wasFavorited) {
          await removeFavorite(userId, listingId);
        } else {
          await addFavorite(userId, listingId);
        }
        return !wasFavorited;
      } catch (e) {
        // Revert on failure. The user sees the heart pop back to its
        // prior state — better than a silent inconsistency.
        logWarn('[favorites.toggle_failed]', e);
        setIds((prev) => {
          const next = new Set(prev);
          if (wasFavorited) next.add(listingId);
          else next.delete(listingId);
          return next;
        });
        return wasFavorited;
      }
    },
    [userId, ids],
  );

  return { ids, toggle, refetch, loading };
}

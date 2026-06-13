// AsyncStorage-backed owner-feed filter persistence.
//
// Stores the user's filter + sort selections so they survive a tab
// refresh, app reopen, or sign-out. Single key, JSON payload — these
// fields move together (UI changes them as a group) so multiGet
// gives no benefit vs a single read.
//
// UI-only state (moreFiltersOpen, sortMenuOpen) is intentionally NOT
// persisted: the panel always opens collapsed so the user lands in
// the default 2-row layout regardless of how they left it.
//
// All ops are best-effort — a broken AsyncStorage must not block
// the feed from loading, so reads return null and writes swallow.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarn } from '@/lib/log';

const KEY = 'petbnb.feedFilters.v1';

export type SortBy =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'rating'
  | 'distance';

export type FeedFilterPrefs = {
  city: 'riyadh' | 'dammam';
  femaleOnly: boolean;
  groomingOnly: boolean;
  noResidentPetsOnly: boolean;
  speciesFilter: 'cat' | 'dog' | null;
  priceBand: 'budget' | 'midrange' | 'premium' | null;
  sortBy: SortBy;
  // Move 4 — search-derived state. District + petId + guest species
  // persist across sessions so the user lands back in the same
  // search context. Dates do NOT persist (per spec — date intent
  // is per-visit).
  searchDistrict: string | null;
  searchPetId: string | null;
  searchGuestSpecies: 'cat' | 'dog' | null;
};

/**
 * Read persisted prefs. Returns null on miss / parse failure / storage
 * error. Caller falls back to defaults.
 */
export async function getFeedFilterPrefs(): Promise<FeedFilterPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FeedFilterPrefs>;
    // Light shape validation — anything missing / wrong-typed falls
    // back to the default at the consumer. Keeps us resilient if the
    // key shape evolves (we bump the v1 suffix on breaking changes).
    return {
      city: parsed.city === 'dammam' ? 'dammam' : 'riyadh',
      femaleOnly: parsed.femaleOnly === true,
      groomingOnly: parsed.groomingOnly === true,
      noResidentPetsOnly: parsed.noResidentPetsOnly === true,
      speciesFilter:
        parsed.speciesFilter === 'cat' || parsed.speciesFilter === 'dog'
          ? parsed.speciesFilter
          : null,
      priceBand:
        parsed.priceBand === 'budget' ||
        parsed.priceBand === 'midrange' ||
        parsed.priceBand === 'premium'
          ? parsed.priceBand
          : null,
      sortBy:
        parsed.sortBy === 'price_asc' ||
        parsed.sortBy === 'price_desc' ||
        parsed.sortBy === 'rating' ||
        parsed.sortBy === 'distance'
          ? parsed.sortBy
          : 'newest',
      searchDistrict:
        typeof parsed.searchDistrict === 'string'
          ? parsed.searchDistrict
          : null,
      searchPetId:
        typeof parsed.searchPetId === 'string' ? parsed.searchPetId : null,
      searchGuestSpecies:
        parsed.searchGuestSpecies === 'cat' ||
        parsed.searchGuestSpecies === 'dog'
          ? parsed.searchGuestSpecies
          : null,
    };
  } catch (e) {
    logWarn('[feed-filters.read_failed]', e);
    return null;
  }
}

/**
 * Persist prefs. Fire-and-forget — failures are logged but never
 * thrown to the caller.
 */
export async function saveFeedFilterPrefs(
  prefs: FeedFilterPrefs,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (e) {
    logWarn('[feed-filters.write_failed]', e);
  }
}

import { logWarn } from '@/lib/log';
// Read-only data access for the listings feed and listing detail screen.
// Inserts/updates land in Step 7 (host create-listing flow).

import type { CityKey } from '@/lib/cities';
import { listingPhotoStoragePathFromUrl } from '@/lib/listing-photos';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

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
  // S2 — discovery filters. All optional; chip-driven on the feed.
  minPriceSAR?: number;
  maxPriceSAR?: number;
  /** Only listings where offers_grooming = true. */
  groomingOnly?: boolean;
  /** Only listings where has_resident_pets = false. */
  noResidentPetsOnly?: boolean;
  /**
   * Round 12 / Step 5.7. When set, only listings whose accepts_species
   * array contains the given species. Default unset = no constraint
   * (returns listings for any species).
   */
  species?: 'cat' | 'dog';
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
  /**
   * Part B (2026-06-13) — full photo set for the carousel on the
   * listing card. Sorted by sort_order. Empty array when no photos.
   * cover_photo is still emitted for callers that don't want the
   * full set (and to keep the old single-image fallback wiring
   * intact during the transition).
   */
  photos: PhotoSummary[];
  distance_km: number | null;
  /**
   * True when the host has a pending field draft OR photo draft for
   * this listing. Populated by host-side reads (listOwnListings); the
   * public-feed read (listActiveListings) leaves it undefined since
   * RLS on the draft tables only grants SELECT to admin + host. Used
   * by HostHome's 8h.2 5-state badge selector.
   */
  has_pending_edit?: boolean;
  // S2 — per-host review aggregate (rating across this host's listings).
  // Populated by listActiveListings via a follow-up rollup query.
  // Defaults to null on hosts with no reviews (or when the rollup
  // query failed); UI shows the "new host" badge as fallback.
  host_avg_rating?: number | null;
  host_review_count?: number;
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
  /**
   * True when the listing has a pending field draft OR photo draft.
   * Populated for any caller (RLS lets only host + admin actually
   * read the embedded draft tables; for everyone else the JOIN
   * returns nothing and this defaults to false). The listing detail
   * screen uses this to show the self-view banner when the viewer
   * is the host in host persona.
   */
  has_pending_edit: boolean;
};

export async function listActiveListings(
  filter: ListingFilter = {},
  pagination: { limit?: number; offset?: number } = {},
): Promise<ListingFeedItem[]> {
  if (!supabase) return [];

  let query = supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles!listings_host_id_fkey(id, full_name, full_name_en, avatar_url),
      listing_photos(id, photo_url, sort_order)
    `,
    )
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (filter.city) query = query.eq('city', filter.city);
  if (filter.neighborhood) query = query.eq('neighborhood', filter.neighborhood);
  if (filter.femaleHostsOnly) query = query.eq('host_gender', 'female');
  // S2 — owner-feed discovery filters.
  if (filter.minPriceSAR != null) {
    query = query.gte('nightly_price_sar', filter.minPriceSAR);
  }
  if (filter.maxPriceSAR != null) {
    query = query.lte('nightly_price_sar', filter.maxPriceSAR);
  }
  if (filter.groomingOnly) query = query.eq('offers_grooming', true);
  if (filter.noResidentPetsOnly) {
    query = query.eq('has_resident_pets', false);
  }
  // Round 12 / Step 5.7. PostgREST's `contains` maps to the SQL `@>`
  // operator on text[]. The GIN index from 0034 backs the lookup.
  if (filter.species) {
    query = query.contains('accepts_species', [filter.species]);
  }

  // Pagination (Round 3 / 2026-06-XX). Default 20-per-page. Without
  // this, the unpaginated feed was hot-pathed at "every approved
  // listing every load" — fine at 30 listings, painful at 300.
  // "Load more" / infinite scroll is a follow-up; the owner feed
  // currently fetches page 0 only.
  const pageSize = pagination.limit ?? 20;
  const start = pagination.offset ?? 0;
  query = query.range(start, start + pageSize - 1);

  const { data, error } = await query;
  if (error) throw error;

  // The nested select returns a typed shape but with `listing_photos` as the
  // raw rows. Pick the lowest sort_order as the cover; compute distance
  // from the caller's location if provided.
  const items: ListingFeedItem[] = (data ?? []).map((row) => {
    const rawPhotos = (row.listing_photos ?? []) as PhotoSummary[];
    // Sort once, then derive cover + carousel set from the sorted
    // array so the cover always matches photos[0].
    const sortedPhotos = [...rawPhotos].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const cover = sortedPhotos[0]?.photo_url ?? null;
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
      photos: sortedPhotos,
      distance_km: distance,
    };
  });

  // Host rating aggregate — server-side via the 0032 RPC since Round 3.
  // Previously this fetched every (ratee_id, stars) row for the page's
  // host set and averaged client-side — a "20 listings × 50 reviews
  // per host = 1000 rows over the wire" hot path. The RPC pushes
  // avg + count down to Postgres and returns one row per host.
  //
  // Best-effort: if the RPC fails (network, missing migration, etc.)
  // we silently leave host_avg_rating unset and the card falls back
  // to the "new host" badge. Anon callers go through the SECURITY
  // DEFINER bypass so guest mode sees the same numbers.
  if (items.length > 0) {
    const hostIds = Array.from(
      new Set(items.map((it) => it.host_id).filter((x): x is string => !!x)),
    );
    if (hostIds.length > 0) {
      try {
        const { data: ratings } = await supabase.rpc('get_host_ratings', {
          host_ids: hostIds,
        });
        if (ratings && ratings.length > 0) {
          const byHost = new Map<string, { avg: number; count: number }>(
            ratings.map((r) => [
              r.host_id,
              { avg: Number(r.avg_rating), count: Number(r.review_count) },
            ]),
          );
          for (const it of items) {
            const agg = byHost.get(it.host_id);
            it.host_avg_rating = agg && agg.count > 0 ? agg.avg : null;
            it.host_review_count = agg?.count ?? 0;
          }
        }
      } catch {
        // RPC or network — silently skip the rating data.
      }
    }
  }

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
      host:profiles!listings_host_id_fkey(id, full_name, full_name_en, avatar_url),
      listing_photos(id, photo_url, sort_order),
      listing_drafts(id),
      listing_photo_drafts(id)
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const photos = ((data.listing_photos ?? []) as PhotoSummary[]).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const fieldDraft = (data.listing_drafts ?? null) as { id: string } | null;
  const photoDrafts = (data.listing_photo_drafts ?? []) as { id: string }[];
  const hasPendingEdit = fieldDraft !== null || photoDrafts.length > 0;

  const {
    listing_photos: _drop,
    listing_drafts: _drop2,
    listing_photo_drafts: _drop3,
    ...rest
  } = data as typeof data & {
    listing_photos?: PhotoSummary[];
    listing_drafts?: unknown;
    listing_photo_drafts?: unknown;
  };

  return {
    ...(rest as Tables<'listings'>),
    host: (data.host ?? null) as HostSummary | null,
    photos,
    has_pending_edit: hasPendingEdit,
  };
}

/**
 * Returns a host's own listings — every row where host_id matches,
 * regardless of status. Hosts need to see their not-yet-approved
 * listings on their host home to manage them. RLS already permits a
 * host to SELECT their own listing rows without further policy work.
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
      host:profiles!listings_host_id_fkey(id, full_name, full_name_en, avatar_url),
      listing_photos(id, photo_url, sort_order),
      listing_drafts(id),
      listing_photo_drafts(id)
    `,
    )
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Same cover-photo + drop-join transform as listActiveListings.
  // Adds has_pending_edit derived from the draft embeds — true when
  // either a field draft or any photo draft exists for the listing.
  return (data ?? []).map((row) => {
    const rawPhotos = (row.listing_photos ?? []) as PhotoSummary[];
    const sortedPhotos = [...rawPhotos].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const cover = sortedPhotos[0]?.photo_url ?? null;
    const fieldDraft = (row.listing_drafts ?? null) as { id: string } | null;
    const photoDrafts = (row.listing_photo_drafts ?? []) as { id: string }[];
    const hasPendingEdit = fieldDraft !== null || photoDrafts.length > 0;
    const {
      listing_photos: _drop,
      listing_drafts: _drop2,
      listing_photo_drafts: _drop3,
      ...rest
    } = row as typeof row & {
      listing_photos?: PhotoSummary[];
      listing_drafts?: unknown;
      listing_photo_drafts?: unknown;
    };
    return {
      ...(rest as Tables<'listings'>),
      host: (row.host ?? null) as HostSummary | null,
      cover_photo: cover,
      photos: sortedPhotos,
      distance_km: null,
      has_pending_edit: hasPendingEdit,
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
 * listings INSERT path in the codebase. Sets status='pending'
 * EXPLICITLY (the migration 0021 default is also 'pending', but
 * writing it in code makes the approval-gate intent clear at the
 * callsite).
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
  requiresVaccination: boolean;
  /** Round 12 / Step 5.7. Optional for back-compat — defaults to ['cat']
   *  which matches the DB column default. */
  acceptsSpecies?: ('cat' | 'dog')[];
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
      requires_vaccination: input.requiresVaccination,
      accepts_species: input.acceptsSpecies ?? ['cat'],
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id };
}

// Four-state visibility for a listing — the canonical signal since
// migration 0021. (is_active was dropped in 8i / migration 0024.)
export type ListingStatus =
  | 'pending'
  | 'approved'
  | 'paused'
  | 'admin_disabled';

/**
 * Patch shape accepted by updateListing (Step 7.5b → 8d rework).
 * 10 editable field properties, all optional — the edit screen
 * always sends the full form, callers may send a subset.
 *
 * 8d: `status` is NO LONGER part of this patch. Status flips
 * (deactivate / reactivate, admin take-offline) go through the
 * dedicated setListingStatus(id, status) helper. updateListing is
 * purely the field-editing path.
 *
 * Text fields target the _ar columns (same as createListing); the
 * _en columns stay NULL until a translation step lands. Display
 * uses pickLocalized which falls back to _ar.
 */
export type UpdateListingPatch = {
  city?: CityKey;
  neighborhood?: string;
  title?: string;
  description?: string;
  nightlyPrice?: number;
  maxConcurrentPets?: number;
  hasResidentPets?: boolean;
  residentPetsNote?: string | null;
  offersGrooming?: boolean;
  hostGender?: 'female' | 'male';
  requiresVaccination?: boolean;
  /** Round 12 / Step 5.7. text[] of accepted species. */
  acceptsSpecies?: ('cat' | 'dog')[];
};

/**
 * Status writer for the listings row. The host-side
 * deactivate/reactivate controls and the admin approve/take-offline
 * controls all funnel through here. RLS lets the host write status
 * on their own row (listings_update_host, migration 0004) and admins
 * are bypassed via is_admin().
 *
 * 8d note: setting status to 'approved' or 'pending' is the only
 * direct flip the host can produce today (paused / admin_disabled
 * arrive in later commits). The helper accepts all four for forward
 * compatibility — RLS rejects nothing here, the UX gates which
 * transitions are reachable.
 *
 * Lived in src/lib/admin.ts through 8b; moved here in 8d so the
 * host-side edit screen can import it without taking an admin
 * dependency.
 */
export async function setListingStatus(
  id: string,
  status: ListingStatus,
): Promise<void> {
  if (!supabase) throw new Error('supabase not configured');
  const { error } = await supabase
    .from('listings')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Update an existing listing's editable fields. Two paths based on
 * the listing's current status (read server-side, not trusted from
 * the caller):
 *
 *   • status === 'pending'         → in-place UPDATE on listings.
 *     Never-approved listings have no public-facing copy to protect;
 *     edits land directly.
 *
 *   • status in ('approved','paused') → upsert into listing_drafts.
 *     The host's edits go into a separate draft row that admin
 *     reviews. The live row stays untouched until 8f's
 *     promote_listing_draft RPC copies the draft over.
 *
 *     On FIRST edit (no draft row yet) we INSERT a FULL SNAPSHOT of
 *     the current listing values, then layer the patch on top. The
 *     draft therefore holds a complete, valid copy of every editable
 *     column — 8f's promote step copies all draft columns onto the
 *     parent listing, so a sparse draft would overwrite untouched
 *     fields with nulls.
 *
 *     On SECOND+ edit (draft exists) we UPDATE the existing draft
 *     row with just the supplied patch fields. UNIQUE(listing_id)
 *     on listing_drafts enforces two-copies-max; subsequent edits
 *     accumulate on the same row. The host edits on top of their
 *     in-progress draft because getListingForEdit returns draft
 *     values as the prefill.
 *
 * RLS:
 *   - listings_update_host permits the in-place path.
 *   - listing_drafts_insert_host / listing_drafts_update_host
 *     permit the draft path. Both require is_active_user() (a
 *     suspended host can read drafts but can't mutate them).
 *
 * Throws on supabase error.
 */
export async function updateListing(
  id: string,
  patch: UpdateListingPatch,
): Promise<void> {
  if (!supabase) throw new Error('supabase not configured');

  // Read the current listing for status + (potentially) the
  // full-snapshot source. One round-trip; safe because all current
  // callers of updateListing immediately re-route or re-fetch
  // afterwards.
  const { data: current, error: readErr } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();
  if (readErr) throw readErr;
  if (!current) throw new Error('listing not found');

  // ---- pending: in-place on listings ----
  if (current.status === 'pending') {
    const row: TablesUpdate<'listings'> = {};
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.neighborhood !== undefined) row.neighborhood = patch.neighborhood;
    if (patch.title !== undefined) row.title_ar = patch.title;
    if (patch.description !== undefined) row.description_ar = patch.description;
    if (patch.nightlyPrice !== undefined) {
      row.nightly_price_sar = patch.nightlyPrice;
    }
    if (patch.maxConcurrentPets !== undefined) {
      row.max_concurrent_pets = patch.maxConcurrentPets;
    }
    if (patch.hasResidentPets !== undefined) {
      row.has_resident_pets = patch.hasResidentPets;
    }
    if (patch.residentPetsNote !== undefined) {
      row.resident_pets_note = patch.residentPetsNote;
    }
    if (patch.offersGrooming !== undefined) {
      row.offers_grooming = patch.offersGrooming;
    }
    if (patch.hostGender !== undefined) row.host_gender = patch.hostGender;
    if (patch.requiresVaccination !== undefined) {
      row.requires_vaccination = patch.requiresVaccination;
    }
    if (patch.acceptsSpecies !== undefined) {
      row.accepts_species = patch.acceptsSpecies;
    }

    const { error } = await supabase
      .from('listings')
      .update(row)
      .eq('id', id);
    if (error) throw error;
    return;
  }

  // ---- approved or paused: upsert listing_drafts ----
  // Look for an existing draft row.
  const { data: existingDraft, error: draftReadErr } = await supabase
    .from('listing_drafts')
    .select('id')
    .eq('listing_id', id)
    .maybeSingle();
  if (draftReadErr) throw draftReadErr;

  if (existingDraft) {
    // Second+ edit — UPDATE the existing draft with just the patch.
    const draftPatch: TablesUpdate<'listing_drafts'> = {};
    if (patch.city !== undefined) draftPatch.city = patch.city;
    if (patch.neighborhood !== undefined) {
      draftPatch.neighborhood = patch.neighborhood;
    }
    if (patch.title !== undefined) draftPatch.title_ar = patch.title;
    if (patch.description !== undefined) {
      draftPatch.description_ar = patch.description;
    }
    if (patch.nightlyPrice !== undefined) {
      draftPatch.nightly_price_sar = patch.nightlyPrice;
    }
    if (patch.maxConcurrentPets !== undefined) {
      draftPatch.max_concurrent_pets = patch.maxConcurrentPets;
    }
    if (patch.hasResidentPets !== undefined) {
      draftPatch.has_resident_pets = patch.hasResidentPets;
    }
    if (patch.residentPetsNote !== undefined) {
      draftPatch.resident_pets_note = patch.residentPetsNote;
    }
    if (patch.offersGrooming !== undefined) {
      draftPatch.offers_grooming = patch.offersGrooming;
    }
    if (patch.hostGender !== undefined) {
      draftPatch.host_gender = patch.hostGender;
    }
    if (patch.requiresVaccination !== undefined) {
      draftPatch.requires_vaccination = patch.requiresVaccination;
    }
    if (patch.acceptsSpecies !== undefined) {
      draftPatch.accepts_species = patch.acceptsSpecies;
    }

    const { error } = await supabase
      .from('listing_drafts')
      .update(draftPatch)
      .eq('listing_id', id);
    if (error) throw error;
    return;
  }

  // First edit — INSERT a FULL SNAPSHOT initialized from current,
  // then layer the patch on top. Every editable column ends up
  // populated; 8f's promote RPC can safely copy them all back onto
  // the listings row without risk of nulling untouched fields.
  const snapshot: TablesInsert<'listing_drafts'> = {
    listing_id: id,
    city: (patch.city ?? current.city) as 'riyadh' | 'dammam',
    neighborhood: patch.neighborhood ?? current.neighborhood,
    title_ar: patch.title ?? current.title_ar,
    title_en: current.title_en,
    description_ar:
      patch.description !== undefined
        ? patch.description
        : current.description_ar,
    description_en: current.description_en,
    nightly_price_sar: patch.nightlyPrice ?? current.nightly_price_sar,
    max_concurrent_pets:
      patch.maxConcurrentPets ?? current.max_concurrent_pets,
    has_resident_pets: patch.hasResidentPets ?? current.has_resident_pets,
    resident_pets_note:
      patch.residentPetsNote !== undefined
        ? patch.residentPetsNote
        : current.resident_pets_note,
    offers_grooming: patch.offersGrooming ?? current.offers_grooming,
    host_gender: patch.hostGender ?? current.host_gender,
    requires_vaccination:
      patch.requiresVaccination ?? current.requires_vaccination,
    accepts_species: patch.acceptsSpecies ?? current.accepts_species,
  };

  const { error: insertErr } = await supabase
    .from('listing_drafts')
    .insert(snapshot);
  if (insertErr) throw insertErr;
}

/**
 * Data shape consumed by the edit screen and the photo manager screen
 * (Step 8d + 8e). Returns the VALUES the form should prefill (from
 * the field draft if it exists, else from the approved listing) plus
 * the photo set the photo manager should edit (from the photo draft
 * if it exists, else from the live photos).
 *
 * hasFieldDraft and hasPhotoDraft are tracked independently — a host
 * can edit only fields, only photos, or both, and the two draft
 * tables populate on their respective first touches. hasPendingEdit
 * is the OR of the two for the edit screen's combined Discard button.
 */
export type ListingEditData = {
  listingId: string;
  hostId: string;
  status: ListingStatus;
  hasPendingEdit: boolean;
  hasFieldDraft: boolean;
  hasPhotoDraft: boolean;
  values: {
    city: 'riyadh' | 'dammam';
    neighborhood: string;
    title: string;
    description: string;
    nightlyPrice: number;
    maxConcurrentPets: number;
    hasResidentPets: boolean;
    residentPetsNote: string | null;
    offersGrooming: boolean;
    hostGender: 'female' | 'male';
    requiresVaccination: boolean;
    acceptsSpecies: ('cat' | 'dog')[];
  };
  /**
   * The photo set the host should edit. Routes to
   * listing_photo_drafts when a draft exists (the host's in-progress
   * draft set), else listing_photos (the live set, ready to be
   * snapshot on the first draft-side mutation). Sorted by sort_order.
   */
  photos: PhotoSummary[];
};

export async function getListingForEdit(
  id: string,
): Promise<ListingEditData | null> {
  if (!supabase) return null;

  // Embed listing_drafts (one-to-one via UNIQUE(listing_id)) +
  // listing_photos (one-to-many) + listing_photo_drafts
  // (one-to-many) in a single round-trip. RLS on both draft tables
  // restricts visibility to admin + host of parent — non-host
  // viewers would get an empty array / null for the nested draft
  // branches.
  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      listing_drafts(*),
      listing_photos(id, photo_url, sort_order),
      listing_photo_drafts(id, photo_url, sort_order)
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // listing_drafts is typed as either an array OR a single object
  // depending on the Database type's isOneToOne flag. We added it as
  // isOneToOne:true in database.ts so we get an object or null.
  const draft = (data.listing_drafts ?? null) as
    | Tables<'listing_drafts'>
    | null;
  const livePhotos = (data.listing_photos ?? []) as PhotoSummary[];
  const draftPhotos = (data.listing_photo_drafts ?? []) as PhotoSummary[];

  const hasFieldDraft = draft !== null;
  const hasPhotoDraft = draftPhotos.length > 0;

  // Route the returned photo set: draft if any draft rows exist,
  // otherwise live. The photo manager screen mutates whichever it
  // received; an approved/paused listing with no draft yet starts
  // editing the live photos *displayed*, and the first mutation
  // triggers ensureDraftPhotoSnapshot in listing-photos.ts to copy
  // live → draft before applying the change.
  const sourcePhotos = hasPhotoDraft ? draftPhotos : livePhotos;
  const photos = [...sourcePhotos].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  // Prefill source for fields: draft wins if present, else live row.
  const src = draft ?? data;

  return {
    listingId: data.id,
    hostId: data.host_id,
    status: data.status,
    hasPendingEdit: hasFieldDraft || hasPhotoDraft,
    hasFieldDraft,
    hasPhotoDraft,
    values: {
      city: src.city as 'riyadh' | 'dammam',
      neighborhood: src.neighborhood,
      title: src.title_ar,
      description: src.description_ar ?? '',
      nightlyPrice: src.nightly_price_sar,
      maxConcurrentPets: src.max_concurrent_pets,
      hasResidentPets: src.has_resident_pets,
      residentPetsNote: src.resident_pets_note,
      offersGrooming: src.offers_grooming,
      hostGender: src.host_gender as 'female' | 'male',
      requiresVaccination: src.requires_vaccination,
      // Round 12 / Step 5.7. Narrow the DB's string[] to the
      // type-safe 2-element union for the form.
      acceptsSpecies: (src.accepts_species ?? ['cat']).filter(
        (s): s is 'cat' | 'dog' => s === 'cat' || s === 'dog',
      ),
    },
    photos,
  };
}

/**
 * Storage cleanup for orphan photo URLs returned by a draft RPC.
 * Both promote_listing_draft and discard_listing_draft return text[]
 * arrays of URLs whose storage objects are now unreferenced; this
 * helper iterates them, derives in-bucket paths, and asks Supabase
 * Storage to remove them. Best-effort: a failure to delete a file
 * doesn't roll back the RPC (the rows are already gone). Future cron
 * sweeps can mop up any survivors.
 */
export async function cleanupOrphanListingPhotos(
  urls: string[] | null,
): Promise<void> {
  if (!supabase) return;
  if (!urls || urls.length === 0) return;

  const paths: string[] = [];
  for (const url of urls) {
    const path = listingPhotoStoragePathFromUrl(url);
    if (path) paths.push(path);
  }
  if (paths.length === 0) return;

  try {
    await supabase.storage.from('listing-photos').remove(paths);
  } catch (e) {
    if (__DEV__) {
      logWarn('[listings.cleanupOrphanListingPhotos]', e);
    }
  }
}

/**
 * Delete a listing's pending draft (both fields and photos) via the
 * 8f discard_listing_draft RPC, then best-effort cleanup of the
 * storage objects for any draft photos that are NOT also referenced
 * by live (the RPC returns a filtered list).
 *
 * The RPC permits admin OR (host of listing AND is_active_user) — so
 * this helper is callable from both the host edit screen and the
 * admin reject-edit button. Replaces the 8d two-sequential-DELETEs
 * helper with a single atomic call.
 */
export async function discardListingDraft(
  listingId: string,
): Promise<void> {
  if (!supabase) throw new Error('supabase not configured');

  const { data, error } = await supabase.rpc('discard_listing_draft', {
    p_listing_id: listingId,
  });
  if (error) throw error;

  await cleanupOrphanListingPhotos(data ?? null);
}

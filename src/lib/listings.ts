// Read-only data access for the listings feed and listing detail screen.
// Inserts/updates land in Step 7 (host create-listing flow).

import type { CityKey } from '@/lib/cities';
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
    .eq('status', 'approved')
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
 * listings INSERT path in the codebase. Sets status='pending'
 * EXPLICITLY (the migration 0021 default is also 'pending', but
 * writing it in code makes the approval-gate intent clear at the
 * callsite). The bridge trigger from 0021 keeps is_active in sync
 * until 8i drops the legacy column.
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
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id };
}

// Four-state visibility for a listing — the canonical signal after
// migration 0021 (is_active is a passive shadow column until 8i).
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
  };

  const { error: insertErr } = await supabase
    .from('listing_drafts')
    .insert(snapshot);
  if (insertErr) throw insertErr;
}

/**
 * Data shape consumed by the edit screen (Step 8d). Returns the
 * VALUES the form should prefill — from the draft if a draft exists,
 * else from the approved listing — plus parent listing metadata
 * (status + has_pending_edit) so the screen can branch its UI.
 *
 * Photos are still returned from listing_photos here (the approved
 * set). The photo manager's draft-aware behaviour ships in 8e; once
 * that lands this helper can also pull from listing_photo_drafts.
 */
export type ListingEditData = {
  listingId: string;
  hostId: string;
  status: ListingStatus;
  hasPendingEdit: boolean;
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
  };
  photos: PhotoSummary[];
};

export async function getListingForEdit(
  id: string,
): Promise<ListingEditData | null> {
  if (!supabase) return null;

  // Embed listing_drafts (one-to-one via UNIQUE(listing_id)) +
  // listing_photos (one-to-many) so a single round-trip returns
  // everything the edit screen needs to render. RLS on
  // listing_drafts restricts the draft branch to admin + host of
  // parent — a non-host viewer would get null for that nested
  // relation.
  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      listing_drafts(*),
      listing_photos(id, photo_url, sort_order)
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // listing_drafts is typed as either an array OR a single object
  // depending on the Database type's isOneToOne flag. We added it
  // as isOneToOne:true in database.ts so we get an object or null.
  const draft = (data.listing_drafts ?? null) as
    | Tables<'listing_drafts'>
    | null;
  const photos = ((data.listing_photos ?? []) as PhotoSummary[]).sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  // Prefill source: draft wins if present, else approved listing.
  const src = draft ?? data;

  return {
    listingId: data.id,
    hostId: data.host_id,
    status: data.status,
    hasPendingEdit: draft !== null,
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
    },
    photos,
  };
}

/**
 * Delete a listing's pending draft (both fields and photos). Reachable
 * by the host via RLS DELETE policies on listing_drafts and
 * listing_photo_drafts. Two separate DELETEs — not atomic, but the
 * failure mode is benign: a leftover listing_photo_drafts row will be
 * cleaned up by the next successful Discard or by 8f's
 * discard_listing_draft RPC (which replaces this helper).
 *
 * 8d uses this helper from the edit screen's "Discard draft" button.
 */
export async function discardListingDraft(
  listingId: string,
): Promise<void> {
  if (!supabase) throw new Error('supabase not configured');

  // Delete photo drafts first — orphan-tolerable order. If the
  // listing_drafts delete fails afterward, the host can retry and
  // we'll just re-issue an empty no-op DELETE on photo_drafts. If
  // photo_drafts delete fails, the listing_drafts row stays so the
  // host's edits are preserved and a retry can clean both.
  const { error: photoErr } = await supabase
    .from('listing_photo_drafts')
    .delete()
    .eq('listing_id', listingId);
  if (photoErr) throw photoErr;

  const { error: draftErr } = await supabase
    .from('listing_drafts')
    .delete()
    .eq('listing_id', listingId);
  if (draftErr) throw draftErr;
}

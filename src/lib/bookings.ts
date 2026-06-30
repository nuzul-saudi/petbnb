// Booking create + read. Multi-pet support added in Step 5.6 via the
// booking_pets junction table.
//
// bookings.pet_id is still in the schema (Step 5.6 didn't drop it yet —
// kept around through the UI transition). createBookingRequest writes
// BOTH the new junction rows AND the singular pet_id (set to the first
// pet in the array) so anything still reading the singular column keeps
// working. A follow-up migration post-5.6 will drop pet_id once no
// callers remain.

import {
  computeCancellationRefund,
  snapshotFees,
} from '@/lib/payments-policy';
import type { MessagePreview } from '@/lib/messages';
import { supabase } from '@/lib/supabase';
import type { Enums, Tables } from '@/types/database';

export type AddonInput = {
  type: Enums<'booking_addon_type'>;
  /** null = booking-wide (e.g. transport). set = scoped to that pet. */
  petId: string | null;
  /**
   * Final line price for this row as it will land on booking_addons.price_sar.
   * The caller computes it via lib/pricing.ts so this layer stays pure DB I/O.
   */
  priceSAR: number;
  providerLabel?: string;
};

export type CreateBookingInput = {
  listingId: string;
  ownerId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  basePriceSAR: number; // nightly rate snapshot (unchanged)
  baseSubtotalSAR: number; // full base hosting cost across all pets/nights
  additionalPetDiscount: number; // 0..1 fraction OFF, snapshotted at booking time
  totalSAR: number;
  /** Preferred: list of pet ids to attach to the booking. At least one required. */
  petIds?: string[];
  /**
   * @deprecated Use `petIds` (array). Singular form retained while the
   * booking-request screen migrates to the multi-select picker. Will be
   * removed in a cleanup commit post-5.6.
   */
  petId?: string;
  addons?: AddonInput[];
  /**
   * 0046 (β thread continuity) — optional id of the inquiry this
   * booking originated from. When set, persisted as bookings.inquiry_id
   * so the comprehensive inquiry timeline can link the booking back
   * into the pre-booking conversation. Omit when the booking was
   * placed directly from a listing page with no preceding inquiry —
   * the timeline falls back to no-inquiry-context for that booking.
   */
  inquiryId?: string;
};

export async function createBookingRequest(
  input: CreateBookingInput,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  const petIds: string[] = input.petIds ?? (input.petId ? [input.petId] : []);
  if (petIds.length === 0) {
    throw new Error('At least one pet is required for a booking');
  }

  // App-level enforcement of two listing constraints. Belt-and-braces
  // against UI bugs or direct API misuse. UI gates these too; DB-level
  // gates also exist (RLS for self-booking via 0029; trigger for
  // capacity via 0027). One read covers both checks.
  const { data: listingForCheck, error: lErr } = await supabase
    .from('listings')
    .select('max_concurrent_pets, host_id')
    .eq('id', input.listingId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!listingForCheck) throw new Error('Listing not found');
  if (petIds.length > listingForCheck.max_concurrent_pets) {
    throw new Error(
      `Exceeds listing max of ${listingForCheck.max_concurrent_pets} pets`,
    );
  }
  // R2C1 — self-booking guard. A host cannot book their own listing.
  // Reason: pre-0039 a 'both' user could complete the flow, switch
  // personas, accept their own request, and (once two-way reviews
  // ship) rate themselves five stars. 0039 removed the 'both' role
  // so this is now defense-in-depth — the booking RLS in 0029 plus
  // the email-uniqueness gate on the owner/host account split would
  // also catch it.
  if (listingForCheck.host_id === input.ownerId) {
    throw new Error('Cannot book your own listing');
  }

  const addons: AddonInput[] = input.addons ?? [];

  // 1. Insert the booking row. Until the post-5.6 cleanup migration
  // drops bookings.pet_id, we keep writing it (first pet) for
  // backwards compatibility with anything still reading the singular
  // column.
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert({
      listing_id: input.listingId,
      owner_id: input.ownerId,
      pet_id: petIds[0],
      start_date: input.startDate,
      end_date: input.endDate,
      base_price_sar: input.basePriceSAR,
      base_subtotal_sar: input.baseSubtotalSAR,
      additional_pet_discount: input.additionalPetDiscount,
      total_sar: input.totalSAR,
      addons_total_sar: addons.reduce((sum, a) => sum + a.priceSAR, 0),
      status: 'requested',
      // 0046 — optional inquiry link. Omitted from the row when
      // the caller didn't pass inquiryId (most legitimate paths
      // today: direct-from-listing CTAs).
      inquiry_id: input.inquiryId ?? null,
    })
    .select()
    .single();

  if (bErr || !booking) throw bErr ?? new Error('Failed to create booking');

  // 2. Attach pets via the junction table.
  const { error: pErr } = await supabase.from('booking_pets').insert(
    petIds.map((pid) => ({ booking_id: booking.id, pet_id: pid })),
  );
  if (pErr) {
    throw new Error(
      `Booking saved (${booking.id}) but booking_pets insert failed: ${pErr.message}`,
    );
  }

  // 3. Attach addons (optional).
  if (addons.length > 0) {
    const { error: aErr } = await supabase.from('booking_addons').insert(
      addons.map((a) => ({
        booking_id: booking.id,
        type: a.type,
        pet_id: a.petId,
        provider_label: a.providerLabel ?? null,
        price_sar: a.priceSAR,
      })),
    );
    if (aErr) {
      throw new Error(
        `Booking saved (${booking.id}) but addons insert failed: ${aErr.message}`,
      );
    }
  }

  return booking;
}

/** Owner summary embedded into BookingDetail since Round 4 — the host
 *  needs to see who's bringing what pet BEFORE accepting a booking.
 *  Mirrors `HostSummary` shape from src/lib/listings.ts so consumers can
 *  treat the two interchangeably. */
export type BookingOwnerSummary = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'full_name_en' | 'avatar_url'
>;

export type BookingHostSummary = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'full_name_en' | 'avatar_url'
>;

export type BookingDetail = Tables<'bookings'> & {
  listing: Pick<
    Tables<'listings'>,
    'id' | 'title_ar' | 'title_en' | 'neighborhood' | 'host_id'
  > | null;
  /** Stretch S2 (2026-06-13) — host identity on the owner's view of
   *  the booking. Mirrors the existing owner field that the host
   *  sees. Null when the listing row was deleted (shouldn't happen
   *  in practice; defensive). */
  host: BookingHostSummary | null;
  /** Host rating aggregate via the 0032 RPC. Same shape and
   *  fallback behavior as owner_avg_rating. */
  host_avg_rating: number | null;
  host_review_count: number;
  owner: BookingOwnerSummary | null;
  /** Round-2-feedback polish — owner rating aggregate from the 0032
   *  RPC. Null when the owner has zero reviews (the host sees a
   *  "no ratings yet" affordance instead). Populated by a follow-up
   *  RPC call on top of the main fetch since the rating endpoint
   *  exposes only avg + count, not the individual reviews. */
  owner_avg_rating: number | null;
  owner_review_count: number;
  addons: Tables<'booking_addons'>[];
  pets: Tables<'pets'>[];
};

export async function getBooking(id: string): Promise<BookingDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select(
      // Round 4 — owner join. The `profiles!bookings_owner_id_fkey`
      // alias resolves the FK explicitly to the booking's `owner_id`
      // (vs the alternative `host_id`-via-listing reachable as a
      // nested PostgREST join). Verified the auto-generated FK name
      // exists for bookings.owner_id REFERENCES profiles.
      `
      *,
      listing:listings(
        id, title_ar, title_en, neighborhood, host_id,
        host:profiles!listings_host_id_fkey(id, full_name, full_name_en, avatar_url)
      ),
      owner:profiles!bookings_owner_id_fkey(id, full_name, full_name_en, avatar_url),
      booking_addons(*),
      booking_pets(pet:pets(*))
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const {
    booking_addons: addons,
    booking_pets: bp,
    owner,
    ...rest
  } = data as typeof data & {
    booking_addons?: Tables<'booking_addons'>[];
    booking_pets?: { pet: Tables<'pets'> }[];
    owner?: BookingOwnerSummary | null;
  };

  // Pull the host out of the nested embed before we strip the
  // embed shape from the listing record. S2 (2026-06-13) — owner's
  // view of the booking now gets the host card too.
  const listingWithHost = (data.listing ?? null) as
    | (BookingDetail['listing'] & {
        host?: BookingHostSummary | null;
      })
    | null;
  const host = listingWithHost?.host ?? null;
  const cleanListing: BookingDetail['listing'] = listingWithHost
    ? {
        id: listingWithHost.id,
        title_ar: listingWithHost.title_ar,
        title_en: listingWithHost.title_en,
        neighborhood: listingWithHost.neighborhood,
        host_id: listingWithHost.host_id,
      }
    : null;

  // Polish (Round 2 feedback) — fetch owner + host rating aggregates
  // via the 0032 RPC in a single call (the RPC accepts an array of
  // ids). Best-effort: a missing RPC or network blip leaves the
  // card showing the "no ratings yet" affordance, which is the
  // honest fallback.
  let ownerAvgRating: number | null = null;
  let ownerReviewCount = 0;
  let hostAvgRating: number | null = null;
  let hostReviewCount = 0;
  const ratingIds: string[] = [];
  if (owner) ratingIds.push(owner.id);
  if (host && host.id !== owner?.id) ratingIds.push(host.id);
  if (ratingIds.length > 0) {
    try {
      const { data: ratings } = await supabase.rpc('get_host_ratings', {
        host_ids: ratingIds,
      });
      for (const row of ratings ?? []) {
        const avg = row.review_count > 0 ? Number(row.avg_rating) : null;
        const count = Number(row.review_count);
        if (owner && row.host_id === owner.id) {
          ownerAvgRating = avg;
          ownerReviewCount = count;
        }
        if (host && row.host_id === host.id) {
          hostAvgRating = avg;
          hostReviewCount = count;
        }
      }
    } catch {
      // Silent — fallback to "no ratings yet" in the UI.
    }
  }

  return {
    ...(rest as Tables<'bookings'>),
    listing: cleanListing,
    host,
    host_avg_rating: hostAvgRating,
    host_review_count: hostReviewCount,
    owner: owner ?? null,
    owner_avg_rating: ownerAvgRating,
    owner_review_count: ownerReviewCount,
    addons: addons ?? [],
    pets: (bp ?? []).map((b) => b.pet),
  };
}

/**
 * Returns everything the booking-request screen needs to pre-fill state
 * when editing an existing booking. Throws if the booking can't be
 * edited (not the caller's, or not in 'requested' status).
 *
 * The reconstruction mirrors the confirmation screen: per-pet add-ons
 * are returned as a map (petId → set of types), booking-wide add-ons
 * as a set of types.
 */
export type BookingForEdit = {
  booking: Tables<'bookings'>;
  listing: Pick<
    Tables<'listings'>,
    | 'id'
    | 'title_ar'
    | 'title_en'
    | 'neighborhood'
    | 'nightly_price_sar'
    | 'additional_pet_discount'
    | 'offers_grooming'
  >;
  petIds: string[];
  perPetAddons: Map<string, Set<Enums<'booking_addon_type'>>>;
  bookingAddons: Set<Enums<'booking_addon_type'>>;
};

export async function getBookingForEdit(
  bookingId: string,
): Promise<BookingForEdit> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      listing:listings(id, title_ar, title_en, neighborhood, nightly_price_sar, additional_pet_discount, offers_grooming),
      booking_addons(*),
      booking_pets(pet_id)
    `,
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Booking not found');
  if (data.status !== 'requested') {
    throw new Error(`Cannot edit a booking in status: ${data.status}`);
  }
  // listing is non-null in practice because the FK is NOT NULL; cast for TS.
  const listing = data.listing as BookingForEdit['listing'] | null;
  if (!listing) throw new Error('Booking missing listing');

  const bp =
    (
      data as typeof data & {
        booking_pets?: { pet_id: string }[];
      }
    ).booking_pets ?? [];
  const addons =
    (
      data as typeof data & {
        booking_addons?: Tables<'booking_addons'>[];
      }
    ).booking_addons ?? [];

  const petIds = bp.map((r) => r.pet_id);

  const perPetAddons = new Map<string, Set<Enums<'booking_addon_type'>>>();
  const bookingAddons = new Set<Enums<'booking_addon_type'>>();
  for (const row of addons) {
    const t = row.type as Enums<'booking_addon_type'>;
    if (row.pet_id === null) {
      bookingAddons.add(t);
    } else {
      const set = perPetAddons.get(row.pet_id) ?? new Set();
      set.add(t);
      perPetAddons.set(row.pet_id, set);
    }
  }

  const {
    booking_addons: _addons,
    booking_pets: _bp,
    listing: _l,
    ...rest
  } = data as typeof data & {
    booking_addons?: unknown;
    booking_pets?: unknown;
    listing?: unknown;
  };

  return {
    booking: rest as Tables<'bookings'>,
    listing,
    petIds,
    perPetAddons,
    bookingAddons,
  };
}

/**
 * Edit an existing 'requested' booking in place. Mirrors createBookingRequest
 * but updates rather than inserts.
 *
 * Ordering (no Postgres RPC available, so atomicity is best-effort):
 *   1. Re-fetch current status; refuse if not 'requested'. App-layer guard
 *      mirrors RLS, gives a clean error before any writes.
 *   2. DELETE child rows (booking_pets, booking_addons). If this fails,
 *      nothing has changed yet — clean rollback.
 *   3. UPDATE the booking row (dates, snapshots, totals).
 *   4. INSERT fresh child rows.
 *
 * If step 3 or 4 fails after step 2 succeeded, the booking is left in an
 * inconsistent state (no children) and the user is asked to retry. A
 * future RPC could make this transactional.
 */
export type UpdateBookingInput = {
  bookingId: string;
  startDate: string;
  endDate: string;
  basePriceSAR: number;
  baseSubtotalSAR: number;
  additionalPetDiscount: number;
  totalSAR: number;
  petIds: string[];
  addons: AddonInput[];
};

export async function updateBookingRequest(
  input: UpdateBookingInput,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');
  if (input.petIds.length === 0) {
    throw new Error('At least one pet is required for a booking');
  }

  // 1. Status guard.
  const { data: current, error: rErr } = await supabase
    .from('bookings')
    .select('id, status, listing_id')
    .eq('id', input.bookingId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!current) throw new Error('Booking not found');
  if (current.status !== 'requested') {
    throw new Error(`Cannot edit a booking in status: ${current.status}`);
  }

  // Server-side enforcement of listings.max_concurrent_pets, same as
  // createBookingRequest. UI gates this too; this is the source of truth.
  const { data: listingForCheck, error: lErr } = await supabase
    .from('listings')
    .select('max_concurrent_pets')
    .eq('id', current.listing_id)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!listingForCheck) throw new Error('Listing not found');
  if (input.petIds.length > listingForCheck.max_concurrent_pets) {
    throw new Error(
      `Exceeds listing max of ${listingForCheck.max_concurrent_pets} pets`,
    );
  }

  // 2. Delete old child rows. Order matters slightly — addons reference
  // booking_pets via pet_id, so addons first then pets to avoid a transient
  // FK miss on the with-check that runs during the addons UPDATE policy.
  // (We're DELETE-ing not UPDATE-ing here, so it's actually safe either way;
  // doing addons first defensively.)
  const { error: dAErr } = await supabase
    .from('booking_addons')
    .delete()
    .eq('booking_id', input.bookingId);
  if (dAErr) throw dAErr;

  const { error: dPErr } = await supabase
    .from('booking_pets')
    .delete()
    .eq('booking_id', input.bookingId);
  if (dPErr) throw dPErr;

  // 3. Update the booking row.
  const addons: AddonInput[] = input.addons ?? [];
  const { data: updated, error: uErr } = await supabase
    .from('bookings')
    .update({
      pet_id: input.petIds[0], // keep singular column in sync for back-compat
      start_date: input.startDate,
      end_date: input.endDate,
      base_price_sar: input.basePriceSAR,
      base_subtotal_sar: input.baseSubtotalSAR,
      additional_pet_discount: input.additionalPetDiscount,
      total_sar: input.totalSAR,
      addons_total_sar: addons.reduce((sum, a) => sum + a.priceSAR, 0),
    })
    .eq('id', input.bookingId)
    .select()
    .single();
  if (uErr || !updated) throw uErr ?? new Error('Failed to update booking');

  // 4. Insert fresh booking_pets (must come before booking_addons that
  // reference pet_id, to satisfy the addon with-check).
  const { error: iPErr } = await supabase.from('booking_pets').insert(
    input.petIds.map((pid) => ({
      booking_id: input.bookingId,
      pet_id: pid,
    })),
  );
  if (iPErr) {
    throw new Error(
      `Booking updated but booking_pets reinsert failed: ${iPErr.message}`,
    );
  }

  if (addons.length > 0) {
    const { error: iAErr } = await supabase.from('booking_addons').insert(
      addons.map((a) => ({
        booking_id: input.bookingId,
        type: a.type,
        pet_id: a.petId,
        provider_label: a.providerLabel ?? null,
        price_sar: a.priceSAR,
      })),
    );
    if (iAErr) {
      throw new Error(
        `Booking updated but addons reinsert failed: ${iAErr.message}`,
      );
    }
  }

  return updated;
}

// Owner-facing list. Used by the /bookings screen. Each row includes
// the listing summary + the multi-pet array + R2C7 unread signals.
export type MyBookingListItem = Tables<'bookings'> & {
  listing: Pick<
    Tables<'listings'>,
    'id' | 'title_ar' | 'title_en' | 'neighborhood'
  > | null;
  pets: Tables<'pets'>[];
  /**
   * R2C7 — latest daily_update.created_at for this booking, or null
   * if no updates exist. The owner bookings list compares this to
   * the locally-stored last-seen stamp to decide whether to draw an
   * unread dot. Populated by a follow-up rollup query (single
   * .in() over the loaded booking ids).
   */
  latest_update_at?: string | null;
  /**
   * 2026-06-29 — slim preview of the most recent message on this
   * booking thread, used by the inbox row to render
   * "(Message deleted)" / "(No messages yet)" / first-line of body.
   * Populated by a PostgREST nested embed with limit 1, order
   * created_at desc. null when the booking has no messages.
   */
  latest_message?: MessagePreview | null;
};

export async function listBookingsForOwner(
  ownerId: string,
): Promise<MyBookingListItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      listing:listings(id, title_ar, title_en, neighborhood),
      booking_pets(pet:pets(*)),
      latest_message:messages(id, body, deleted_at, created_at)
    `,
    )
    .eq('owner_id', ownerId)
    // 2026-06-29 — limit nested latest_message embed to one row,
    // newest first per booking. Without these foreignTable
    // ordering hints PostgREST returns ALL messages embedded under
    // each booking. RLS scopes messages to participants so the
    // embed only surfaces messages this owner can read.
    .order('created_at', { ascending: false, foreignTable: 'latest_message' })
    .limit(1, { foreignTable: 'latest_message' })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const items: MyBookingListItem[] = (data ?? []).map((row) => {
    const { booking_pets: bp, latest_message: lm, ...rest } = row as typeof row & {
      booking_pets?: { pet: Tables<'pets'> }[];
      latest_message?: MessagePreview | MessagePreview[] | null;
    };
    // PostgREST returns one-to-many embeds as arrays. Collapse to a
    // single MessagePreview | null for the row renderer.
    const latest_message: MessagePreview | null = Array.isArray(lm)
      ? (lm[0] ?? null)
      : (lm ?? null);
    return {
      ...(rest as Tables<'bookings'>),
      listing: (row.listing ?? null) as MyBookingListItem['listing'],
      pets: (bp ?? []).map((b) => b.pet),
      latest_update_at: null,
      latest_message,
    };
  });

  // R2C7 — single follow-up query for the latest update timestamp
  // per booking. We can't easily aggregate in PostgREST without an
  // RPC, so we fetch every (booking_id, created_at) for our set and
  // reduce to a max per booking client-side. Best-effort — a failure
  // leaves latest_update_at as null and the UI just doesn't draw any
  // unread dots. RLS already permits the owner to read updates on
  // their own bookings.
  if (items.length > 0) {
    try {
      const ids = items.map((i) => i.id);
      const { data: updates } = await supabase
        .from('daily_updates')
        .select('booking_id, created_at')
        .in('booking_id', ids);
      if (updates && updates.length > 0) {
        const maxByBooking = new Map<string, string>();
        for (const u of updates) {
          const cur = maxByBooking.get(u.booking_id);
          if (!cur || u.created_at > cur) {
            maxByBooking.set(u.booking_id, u.created_at);
          }
        }
        for (const it of items) {
          it.latest_update_at = maxByBooking.get(it.id) ?? null;
        }
      }
    } catch {
      // Silent — UI degrades to "no dots".
    }
  }

  return items;
}

// Host-facing list. Two-step query because we can't easily join
// "bookings whose listing.host_id = me" in PostgREST's nested select
// — same shape as countPendingHostBookings, just reading full rows.
// Test round 3 (2026-06-10) added this when the /bookings screen
// went persona-aware so hosts could see incoming + accepted +
// active + completed bookings on their listings.
export async function listBookingsForHost(
  hostId: string,
): Promise<MyBookingListItem[]> {
  if (!supabase) return [];

  const { data: hostListings, error: lErr } = await supabase
    .from('listings')
    .select('id')
    .eq('host_id', hostId);
  if (lErr) throw lErr;
  if (!hostListings || hostListings.length === 0) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      listing:listings(id, title_ar, title_en, neighborhood),
      booking_pets(pet:pets(*)),
      latest_message:messages(id, body, deleted_at, created_at)
    `,
    )
    .in(
      'listing_id',
      hostListings.map((l) => l.id),
    )
    // 2026-06-29 — same one-row latest_message limit as the
    // owner-side helper above.
    .order('created_at', { ascending: false, foreignTable: 'latest_message' })
    .limit(1, { foreignTable: 'latest_message' })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { booking_pets: bp, latest_message: lm, ...rest } = row as typeof row & {
      booking_pets?: { pet: Tables<'pets'> }[];
      latest_message?: MessagePreview | MessagePreview[] | null;
    };
    const latest_message: MessagePreview | null = Array.isArray(lm)
      ? (lm[0] ?? null)
      : (lm ?? null);
    return {
      ...(rest as Tables<'bookings'>),
      listing: (row.listing ?? null) as MyBookingListItem['listing'],
      pets: (bp ?? []).map((b) => b.pet),
      latest_message,
    };
  });
}

/**
 * Cancel a booking. MVP: owners only, only while status === 'requested'.
 * Once a host has accepted, cancellation requires manual handling
 * (no UI exposes it today — admin / host accept-decline flow is Step 7).
 *
 * Updates only bookings.status. Child rows (booking_pets, booking_addons)
 * are intentionally untouched — they're an audit trail and have no
 * UPDATE/DELETE policies anyway.
 */
// S1 — Owner cancels their booking. Computes refund per the policy:
//   >=48h before start → full refund of total_charged_sar
//   <48h, not started   → 50% refund
//   on/after start_date → 0 refund
// Acceptable from status IN ('requested','accepted'). For 'requested'
// (host hasn't accepted yet) the booking has no total_charged_sar yet
// — fall back to total_sar so the refund tier is still computed
// honestly against the price the owner agreed to.
export async function cancelBookingAsOwner(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  const { data: current, error: rErr } = await supabase
    .from('bookings')
    .select('id, status, total_charged_sar, total_sar, start_date')
    .eq('id', bookingId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!current) throw new Error('Booking not found');
  if (current.status !== 'requested' && current.status !== 'accepted') {
    throw new Error(`Cannot cancel a booking in status: ${current.status}`);
  }

  const charged = current.total_charged_sar ?? current.total_sar;
  // C2 (audit 2026-06-11): `new Date()` is the device clock — a real-
  // payments user could set their phone clock back to jump a refund
  // tier. Harmless on the mock provider; before the gateway swap
  // (CLAUDE.md §11) the refund tier MUST be computed server-side
  // via an RPC using Postgres `now()`. Do NOT trust this value past
  // the mock-payments milestone.
  const { refundSAR } = computeCancellationRefund(
    charged,
    current.start_date,
    new Date().toISOString(),
  );

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      refund_sar: refundSAR,
    })
    .eq('id', bookingId)
    .in('status', ['requested', 'accepted'])
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to cancel booking');
  return data;
}

// ---------------------------------------------------------------------------
// Dispute workflow (Round 7).
//
// A trust-first marketplace without an in-app dispute path is fragile.
// The 'disputed' status has existed in the booking_status enum since
// 0001 but had no surface — no way to enter it, no admin queue, nothing.
// This wires a "Report a problem" button on active / completed bookings
// for either party + admin queue visibility (added in the same round).
//
// Permitted source statuses: 'active' (during the stay) and
// 'completed' (after the fact). Outside those, the report doesn't
// apply — a 'requested' booking should be cancelled, a 'declined'
// or 'cancelled' booking has no real to dispute.
//
// RLS: the existing bookings_update_owner_or_host policy (0004)
// already permits owner OR host to update; admin bypasses via
// is_admin(). No new migration needed.
//
// Future follow-up (post-MVP): an Edge Function trigger on transition
// INTO 'disputed' could email the founder + post to an admin-only
// Slack/Discord channel. For MVP the admin dashboard's queue count
// is enough — founder will check the dashboard.
// ---------------------------------------------------------------------------
export async function disputeBooking(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  // Re-fetch current status — same app-layer guard pattern as
  // cancelBookingAsOwner. Catches race conditions and gives a clearer
  // error than the raw RLS rejection.
  const { data: current, error: rErr } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!current) throw new Error('Booking not found');
  if (current.status !== 'active' && current.status !== 'completed') {
    throw new Error(
      `Cannot dispute a booking in status: ${current.status}`,
    );
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'disputed' })
    .eq('id', bookingId)
    .in('status', ['active', 'completed'])
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to dispute booking');
  return data;
}

// ---------------------------------------------------------------------------
// Host-side status transitions (Step 6.1 / Phase 7).
//
// Each function mirrors cancelBookingAsOwner's shape: re-fetch current
// status, throw if the transition isn't legal from the current state,
// then update. RLS already restricts which user can touch which booking;
// the app-layer guard exists to (a) catch race conditions where the
// status moved out from under a stale UI, and (b) give a clearer error
// than a generic RLS rejection.
// ---------------------------------------------------------------------------

async function transitionBookingStatus(
  bookingId: string,
  expectedStatus: Enums<'booking_status'>,
  nextStatus: Enums<'booking_status'>,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  const { data: current, error: rErr } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!current) throw new Error('Booking not found');
  if (current.status !== expectedStatus) {
    throw new Error(
      `Cannot transition to ${nextStatus}: booking is in status ${current.status}, expected ${expectedStatus}`,
    );
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: nextStatus })
    .eq('id', bookingId)
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error(`Failed to transition booking to ${nextStatus}`);
  }
  return data;
}

// S1 — Accepting a booking ALSO snapshots the fees and marks the
// payment as held. The bridge between the booking lifecycle and the
// MOCK payment provider lives here (the provider is a stub; no real
// gateway). At a real-money launch this is where the gateway charge
// would live.
export async function acceptBookingAsHost(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');
  // Read the row so we know total_sar (set at request time).
  const { data: row, error: readErr } = await supabase
    .from('bookings')
    .select('total_sar, status')
    .eq('id', bookingId)
    .single();
  if (readErr || !row) {
    throw readErr ?? new Error('Booking not found');
  }
  if (row.status !== 'requested') {
    throw new Error(`Cannot accept booking from status '${row.status}'`);
  }
  const fees = snapshotFees(row.total_sar);

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'accepted',
      owner_fee_sar: fees.ownerFeeSAR,
      total_charged_sar: fees.totalChargedSAR,
      host_fee_sar: fees.hostFeeSAR,
      payout_sar: fees.payoutSAR,
      paid_at: new Date().toISOString(),
      payout_status: 'held',
    })
    .eq('id', bookingId)
    .eq('status', 'requested')
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error('Failed to accept booking');
  }
  return data;
}

export async function declineBookingAsHost(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  return transitionBookingStatus(bookingId, 'requested', 'declined');
}

export async function startBookingAsHost(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  return transitionBookingStatus(bookingId, 'accepted', 'active');
}

// S1 — Completion releases the held payout. The check-out report
// flow lives upstream of this call (host fires it from the check-out
// section); here we just record the payout-status transition.
export async function completeBookingAsHost(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      payout_status: 'released',
    })
    .eq('id', bookingId)
    .eq('status', 'active')
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error('Failed to complete booking');
  }
  return data;
}


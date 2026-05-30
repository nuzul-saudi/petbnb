// Booking create + read. Multi-pet support added in Step 5.6 via the
// booking_pets junction table.
//
// bookings.pet_id is still in the schema (Step 5.6 didn't drop it yet —
// kept around through the UI transition). createBookingRequest writes
// BOTH the new junction rows AND the singular pet_id (set to the first
// pet in the array) so anything still reading the singular column keeps
// working. A follow-up migration post-5.6 will drop pet_id once no
// callers remain.

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
};

export async function createBookingRequest(
  input: CreateBookingInput,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  const petIds: string[] = input.petIds ?? (input.petId ? [input.petId] : []);
  if (petIds.length === 0) {
    throw new Error('At least one pet is required for a booking');
  }

  // Server-side enforcement of listings.max_concurrent_pets. Belt-and-
  // braces against UI bugs or direct API misuse. UI gates this too;
  // this check is the source of truth.
  const { data: listingForCheck, error: lErr } = await supabase
    .from('listings')
    .select('max_concurrent_pets')
    .eq('id', input.listingId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!listingForCheck) throw new Error('Listing not found');
  if (petIds.length > listingForCheck.max_concurrent_pets) {
    throw new Error(
      `Exceeds listing max of ${listingForCheck.max_concurrent_pets} pets`,
    );
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

export type BookingDetail = Tables<'bookings'> & {
  listing: Pick<
    Tables<'listings'>,
    'id' | 'title_ar' | 'title_en' | 'neighborhood' | 'host_id'
  > | null;
  addons: Tables<'booking_addons'>[];
  pets: Tables<'pets'>[];
};

export async function getBooking(id: string): Promise<BookingDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      listing:listings(id, title_ar, title_en, neighborhood, host_id),
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
    ...rest
  } = data as typeof data & {
    booking_addons?: Tables<'booking_addons'>[];
    booking_pets?: { pet: Tables<'pets'> }[];
  };
  return {
    ...(rest as Tables<'bookings'>),
    listing: (data.listing ?? null) as BookingDetail['listing'],
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
// the listing summary + the multi-pet array.
export type MyBookingListItem = Tables<'bookings'> & {
  listing: Pick<
    Tables<'listings'>,
    'id' | 'title_ar' | 'title_en' | 'neighborhood'
  > | null;
  pets: Tables<'pets'>[];
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
      booking_pets(pet:pets(*))
    `,
    )
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { booking_pets: bp, ...rest } = row as typeof row & {
      booking_pets?: { pet: Tables<'pets'> }[];
    };
    return {
      ...(rest as Tables<'bookings'>),
      listing: (row.listing ?? null) as MyBookingListItem['listing'],
      pets: (bp ?? []).map((b) => b.pet),
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
export async function cancelBookingAsOwner(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  // App-layer guard: re-fetch and check status is still 'requested'.
  // Prevents a stale UI from cancelling an already-accepted booking
  // (a host could accept while the user has the screen open).
  const { data: current, error: rErr } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!current) throw new Error('Booking not found');
  if (current.status !== 'requested') {
    throw new Error(`Cannot cancel a booking in status: ${current.status}`);
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to cancel booking');
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

export async function acceptBookingAsHost(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  return transitionBookingStatus(bookingId, 'requested', 'accepted');
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

export async function completeBookingAsHost(
  bookingId: string,
): Promise<Tables<'bookings'>> {
  return transitionBookingStatus(bookingId, 'active', 'completed');
}

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
  providerLabel?: string;
  priceSAR: number;
};

export type CreateBookingInput = {
  listingId: string;
  ownerId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  basePriceSAR: number;
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
  listing: Pick<Tables<'listings'>, 'id' | 'title_ar' | 'neighborhood'> | null;
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
      listing:listings(id, title_ar, neighborhood),
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

// Owner-facing list. Used by the /bookings screen. Each row includes
// the listing summary + the multi-pet array.
export type MyBookingListItem = Tables<'bookings'> & {
  listing: Pick<Tables<'listings'>, 'id' | 'title_ar' | 'neighborhood'> | null;
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
      listing:listings(id, title_ar, neighborhood),
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

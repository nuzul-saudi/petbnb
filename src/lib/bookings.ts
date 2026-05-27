// Booking create + read.
//
// Two writes per request (booking row, optional addon row). RLS on
// booking_addons requires that the parent booking exists AND belongs to the
// caller — we do the booking insert first, then the addon. If the addon
// insert fails (rare) we surface a "booking made, addon missing" error and
// leave the booking; the client cannot DELETE bookings via RLS by design.

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
  petId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  basePriceSAR: number;
  totalSAR: number;
  addons?: AddonInput[];
};

export async function createBookingRequest(
  input: CreateBookingInput,
): Promise<Tables<'bookings'>> {
  if (!supabase) throw new Error('No Supabase client');

  const addons: AddonInput[] = input.addons ?? [];

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert({
      listing_id: input.listingId,
      owner_id: input.ownerId,
      pet_id: input.petId,
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
};

export async function getBooking(id: string): Promise<BookingDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      listing:listings(id, title_ar, neighborhood),
      booking_addons(*)
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { booking_addons: addons, ...rest } = data as typeof data & {
    booking_addons?: Tables<'booking_addons'>[];
  };
  return {
    ...(rest as Tables<'bookings'>),
    listing: (data.listing ?? null) as BookingDetail['listing'],
    addons: addons ?? [],
  };
}

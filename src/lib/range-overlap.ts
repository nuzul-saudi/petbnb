// Pure half-open range-overlap helpers.
//
// Extracted from src/lib/availability.ts so the tests can import them
// without dragging in expo-constants / supabase-js (which the vitest
// Node environment can't parse). availability.ts re-exports them so
// existing imports keep working.
//
// Half-open convention: ranges are [start, end) — end is the day AFTER
// the booking ends (or the day the block is lifted). Two ranges that
// touch (a.end === b.start) do NOT overlap — same-day handover is
// allowed. Same predicate as migration 0027's DB trigger.

export type BlockedRangeLike = {
  start_date: string;
  end_date: string;
};

export function rangesOverlap(
  a1: string,
  a2: string,
  b1: string,
  b2: string,
): boolean {
  return a1 < b2 && a2 > b1;
}

export function isRangeBlocked(
  startDate: string,
  endDate: string,
  blocked: BlockedRangeLike[],
): boolean {
  return blocked.some((b) =>
    rangesOverlap(startDate, endDate, b.start_date, b.end_date),
  );
}

// ─────────────────────────────────────────────────────────────────────
// TEST-ONLY mirror of available_listings (migration 0035) — DO NOT
// IMPORT FROM APP CODE.
//
// The SQL RPC `available_listings` is the single runtime source of
// truth for whether a listing is bookable for a given date range +
// pet count. This JS implementation exists ONLY so vitest can cover
// the capacity + blocked-range cases the spec requires (the existing
// rangesOverlap tests cover the overlap math; capacity math had no
// unit tests before this commit).
//
// Wiring this into a runtime filter — even as a "preview" alongside
// the RPC — would reintroduce the divergence risk we eliminated by
// putting the math in SQL. If you find yourself wanting to call it
// from src/app/ or src/lib/listings.ts, STOP and use the RPC instead.
// ─────────────────────────────────────────────────────────────────────

export type BookingForCapacity = {
  start_date: string;
  end_date: string;
  status: string;
  /** Number of pets attached to this booking. Match what booking_pets
   *  would return for this booking (= count of rows; legacy bookings
   *  always 1 via the 0007 backfill). */
  pet_count: number;
};

/**
 * TEST-ONLY mirror of the 0035 available_listings SQL filter.
 *
 * Returns `{ available: true }` when the listing has both:
 *  - no overlapping blocked range, AND
 *  - enough remaining capacity to fit `requestedPetCount` more pets
 *    given already-overlapping accepted/active bookings.
 *
 * Returns `{ available: false, reason }` otherwise.
 *
 * Mirror invariants — keep in sync with the 0035 RPC:
 *  - Overlap predicate is half-open (rangesOverlap).
 *  - Only `accepted` and `active` bookings count toward capacity.
 *  - Each booking contributes max(pet_count, 1) — same defensive
 *    fallback as the trigger's GREATEST(count, 1).
 *  - blocked check runs first; if blocked, reason is 'blocked'
 *    (not 'over_capacity') even if both would fail.
 */
export function isListingAvailable(args: {
  listingMaxPets: number;
  searchStart: string;
  searchEnd: string;
  requestedPetCount: number;
  bookings: BookingForCapacity[];
  blocked: BlockedRangeLike[];
}):
  | { available: true }
  | { available: false; reason: 'blocked' | 'over_capacity' } {
  if (isRangeBlocked(args.searchStart, args.searchEnd, args.blocked)) {
    return { available: false, reason: 'blocked' };
  }
  const overlappingPets = args.bookings
    .filter((b) => b.status === 'accepted' || b.status === 'active')
    .filter((b) =>
      rangesOverlap(
        args.searchStart,
        args.searchEnd,
        b.start_date,
        b.end_date,
      ),
    )
    .reduce((sum, b) => sum + Math.max(1, b.pet_count), 0);
  if (args.requestedPetCount + overlappingPets > args.listingMaxPets) {
    return { available: false, reason: 'over_capacity' };
  }
  return { available: true };
}

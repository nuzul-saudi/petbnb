// rangesOverlap — half-open [start, end) overlap predicate.
// Same convention as migration 0027's DB trigger; client and DB must
// agree, otherwise the friendly warning and the hard gate disagree.

import { describe, expect, it } from 'vitest';
import {
  isListingAvailable,
  isRangeBlocked,
  rangesOverlap,
  type BookingForCapacity,
  type BlockedRangeLike,
} from '@/lib/range-overlap';

describe('rangesOverlap — half-open intervals', () => {
  it('detects classic overlap', () => {
    expect(rangesOverlap('2026-07-01', '2026-07-05', '2026-07-03', '2026-07-08')).toBe(
      true,
    );
  });

  it('treats touching boundaries as non-overlap (same-day handover)', () => {
    // a ends on the day b starts → no conflict (half-open [start, end))
    expect(rangesOverlap('2026-07-01', '2026-07-05', '2026-07-05', '2026-07-10')).toBe(
      false,
    );
    // mirror
    expect(rangesOverlap('2026-07-05', '2026-07-10', '2026-07-01', '2026-07-05')).toBe(
      false,
    );
  });

  it('contained range fully inside another overlaps', () => {
    expect(rangesOverlap('2026-07-01', '2026-07-10', '2026-07-04', '2026-07-06')).toBe(
      true,
    );
  });

  it('disjoint ranges do not overlap', () => {
    expect(rangesOverlap('2026-07-01', '2026-07-05', '2026-07-06', '2026-07-09')).toBe(
      false,
    );
  });
});

describe('isRangeBlocked', () => {
  const blocked = [
    {
      id: '1',
      listing_id: 'L1',
      start_date: '2026-07-15',
      end_date: '2026-07-20',
      created_at: '2026-07-01T00:00:00Z',
    },
  ];

  it('flags a range that overlaps a blocked window', () => {
    expect(isRangeBlocked('2026-07-18', '2026-07-22', blocked)).toBe(true);
  });

  it('does not flag a range that ends on a blocked-window start', () => {
    expect(isRangeBlocked('2026-07-10', '2026-07-15', blocked)).toBe(false);
  });

  it('does not flag a non-overlapping range', () => {
    expect(isRangeBlocked('2026-08-01', '2026-08-05', blocked)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Feature 1 (2026-06-13) — search-time availability filter (test mirror
// of 0035 available_listings RPC). These cases lock in the capacity +
// blocked-range math the spec requires. If the RPC SQL changes, the
// mirror in range-overlap.ts must change in lockstep so these tests
// keep representing the runtime behavior.
// ──────────────────────────────────────────────────────────────────────

describe('isListingAvailable — search-time filter mirror (0035 RPC)', () => {
  const search = { start: '2026-07-10', end: '2026-07-15' };
  const baseArgs = {
    listingMaxPets: 3,
    searchStart: search.start,
    searchEnd: search.end,
    requestedPetCount: 1,
    bookings: [] as BookingForCapacity[],
    blocked: [] as BlockedRangeLike[],
  };

  it('1. listing free for the range → shown', () => {
    expect(isListingAvailable(baseArgs)).toEqual({ available: true });
  });

  it('2. accepted booking overlapping, at capacity → hidden (over_capacity)', () => {
    // Listing max = 3. Existing booking fills all 3 slots over the
    // searched range; a 1-pet request pushes it to 4 > 3.
    const result = isListingAvailable({
      ...baseArgs,
      bookings: [
        {
          start_date: '2026-07-12',
          end_date: '2026-07-14',
          status: 'accepted',
          pet_count: 3,
        },
      ],
    });
    expect(result).toEqual({
      available: false,
      reason: 'over_capacity',
    });
  });

  it('3. accepted booking overlapping, still under capacity → shown', () => {
    // 1 existing pet + 1 requested = 2, listing max = 3 → fits.
    expect(
      isListingAvailable({
        ...baseArgs,
        bookings: [
          {
            start_date: '2026-07-12',
            end_date: '2026-07-14',
            status: 'accepted',
            pet_count: 1,
          },
        ],
      }),
    ).toEqual({ available: true });
  });

  it('4. booking ENDS on searched start (half-open) → not a conflict → shown', () => {
    // Booking [07-05, 07-10), searched [07-10, 07-15). Touching
    // boundary, same-day handover allowed.
    expect(
      isListingAvailable({
        ...baseArgs,
        bookings: [
          {
            start_date: '2026-07-05',
            end_date: '2026-07-10',
            status: 'accepted',
            pet_count: 3,
          },
        ],
      }),
    ).toEqual({ available: true });
  });

  it('5. booking STARTS on searched end (half-open) → not a conflict → shown', () => {
    // Booking [07-15, 07-20), searched [07-10, 07-15).
    expect(
      isListingAvailable({
        ...baseArgs,
        bookings: [
          {
            start_date: '2026-07-15',
            end_date: '2026-07-20',
            status: 'accepted',
            pet_count: 3,
          },
        ],
      }),
    ).toEqual({ available: true });
  });

  it('6. blocked date inside the range → hidden (blocked)', () => {
    expect(
      isListingAvailable({
        ...baseArgs,
        blocked: [{ start_date: '2026-07-12', end_date: '2026-07-13' }],
      }),
    ).toEqual({ available: false, reason: 'blocked' });
  });

  // Two extras unprompted — guard against quiet regressions.

  it('7. requested/declined/cancelled bookings do NOT count toward capacity', () => {
    // Three non-committed bookings each "claiming" 3 pets — none
    // count, so the listing is still wide open.
    expect(
      isListingAvailable({
        ...baseArgs,
        bookings: [
          {
            start_date: '2026-07-12',
            end_date: '2026-07-14',
            status: 'requested',
            pet_count: 3,
          },
          {
            start_date: '2026-07-12',
            end_date: '2026-07-14',
            status: 'declined',
            pet_count: 3,
          },
          {
            start_date: '2026-07-12',
            end_date: '2026-07-14',
            status: 'cancelled',
            pet_count: 3,
          },
        ],
      }),
    ).toEqual({ available: true });
  });

  // 0036 — host-visibility parity. The RPC must mirror the
  // listings_select RLS predicate or the hydration step silently
  // drops rows the RPC promised.

  it('9. unverified host → hidden (host_hidden, takes precedence over availability)', () => {
    // Even when there's no blocked range, no overlap, capacity to
    // spare, an unverified host should NOT appear — RLS would hide
    // the row at hydration. The RPC must agree.
    expect(
      isListingAvailable({
        ...baseArgs,
        hostIsVerified: false,
        hostIsSuspended: false,
      }),
    ).toEqual({ available: false, reason: 'host_hidden' });
  });

  it('10. suspended host → hidden (host_hidden)', () => {
    expect(
      isListingAvailable({
        ...baseArgs,
        hostIsVerified: true,
        hostIsSuspended: true,
      }),
    ).toEqual({ available: false, reason: 'host_hidden' });
  });

  it('11. host visibility check runs BEFORE blocked / capacity checks', () => {
    // An unverified host + blocked range → reason must be
    // 'host_hidden', not 'blocked'. Matches the RPC's predicate
    // ordering (host EXISTS check is evaluated independently of
    // the blocked + capacity NOT EXISTS subqueries; semantically
    // both branches reject, but the JS mirror reports host first).
    expect(
      isListingAvailable({
        ...baseArgs,
        hostIsVerified: false,
        blocked: [{ start_date: '2026-07-12', end_date: '2026-07-13' }],
      }),
    ).toEqual({ available: false, reason: 'host_hidden' });
  });

  it('8. two overlapping committed bookings summing to max → new booking rejected', () => {
    // 2 + 1 + 1 requested = 4 > max 3.
    expect(
      isListingAvailable({
        ...baseArgs,
        bookings: [
          {
            start_date: '2026-07-12',
            end_date: '2026-07-14',
            status: 'accepted',
            pet_count: 2,
          },
          {
            start_date: '2026-07-11',
            end_date: '2026-07-13',
            status: 'active',
            pet_count: 1,
          },
        ],
      }),
    ).toEqual({ available: false, reason: 'over_capacity' });
  });
});

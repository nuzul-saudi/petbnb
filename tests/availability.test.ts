// rangesOverlap — half-open [start, end) overlap predicate.
// Same convention as migration 0027's DB trigger; client and DB must
// agree, otherwise the friendly warning and the hard gate disagree.

import { describe, expect, it } from 'vitest';
import { isRangeBlocked, rangesOverlap } from '@/lib/range-overlap';

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

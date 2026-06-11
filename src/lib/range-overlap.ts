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

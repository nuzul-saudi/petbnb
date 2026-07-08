// Phase 5 / 0051 — host response-time badge logic (pure).
//
// The DB RPC host_response_stats returns { median_minutes, sample_count }
// per host. This module maps that to a bucketed i18n key and owns the
// "hide on thin data" rule so both the feed card and the listing detail
// render the same badge from one source of truth.
//
// ⚠️ The underlying metric has survivorship bias (medians only ANSWERED
// inquiries) — see the 0051 migration comment. Copy reads "usually
// responds within…", never "responsiveness", to stay honest.

/** Below this many answered inquiries, show NO badge — a median over 1–2
 *  data points is noise, and a fabricated trust signal is worse than
 *  none (same posture as the "new host" badge on zero completed stays). */
export const RESPONSE_BADGE_MIN_SAMPLES = 3;

export type ResponseBucket =
  | 'within_hour'
  | 'within_hours'
  | 'within_day'
  | 'within_days';

/** Map a median-minutes value to its bucket. Thresholds: ≤1h, ≤6h,
 *  ≤24h, else multi-day. */
export function responseBucket(medianMinutes: number): ResponseBucket {
  if (medianMinutes <= 60) return 'within_hour';
  if (medianMinutes <= 360) return 'within_hours';
  if (medianMinutes <= 1440) return 'within_day';
  return 'within_days';
}

/**
 * The i18n key for the response badge, or null when the badge must be
 * hidden — missing stats (RPC failed) or fewer than
 * RESPONSE_BADGE_MIN_SAMPLES answered inquiries. Callers render nothing
 * on null.
 */
export function responseBadgeKey(
  medianMinutes: number | null | undefined,
  sampleCount: number | null | undefined,
): string | null {
  if (medianMinutes == null || sampleCount == null) return null;
  if (sampleCount < RESPONSE_BADGE_MIN_SAMPLES) return null;
  return `response.${responseBucket(medianMinutes)}`;
}

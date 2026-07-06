// Stretch S1 — Payment policy constants + computation helpers.
//
// Policy LOCKED at batch authoring time:
//   OWNER_SERVICE_FEE_RATE  = 0.05  (5% — owner pays on top of total)
//   HOST_FEE_RATE           = 0.15  (15% — deducted from total before payout)
//
// Cancellation refund tiers (computed against total_charged_sar):
//   >= 48h before start_date           : full refund
//   <  48h before start_date           : 50% refund
//   on/after start_date / active       : no refund
//
// Currency convention — whole SAR ONLY (no decimals).
//   pricing.ts produces integer SAR for the base + add-on subtotal
//   ("the founder doesn't want decimal SAR shown"). This module
//   matches that: every output of snapshotFees + computeCancellationRefund
//   is rounded to the nearest whole riyal via Math.round before being
//   surfaced to the UI or written to the DB. Rounding asymmetry of
//   ±1 SAR favors no one systematically — `Math.round` uses banker's
//   half-to-even on .5 inputs in V8, which over many bookings nets to
//   zero. This replaces the pre-round-1 round2() helper, which let
//   decimals leak through and produced strings like "787.5 ر.س".

export const OWNER_SERVICE_FEE_RATE = 0.05;
export const HOST_FEE_RATE = 0.15;

// Cancellation tiers — exported (Phase 3) so the disclosure UI renders
// its copy FROM these constants and the text can never drift from the
// refund math below. Single platform-wide policy (locked decision).
export const CANCELLATION_FULL_REFUND_HOURS = 48;
export const CANCELLATION_LATE_REFUND_RATE = 0.5;

export type FeeSnapshot = {
  totalSAR: number;
  ownerFeeSAR: number;
  totalChargedSAR: number;
  hostFeeSAR: number;
  payoutSAR: number;
};

/**
 * Compute the fee snapshot for a booking total. Mirror of what the
 * accept-time mutation writes; also used by the booking-request
 * screen to surface the breakdown BEFORE submit. All outputs are
 * integer SAR (see header comment).
 */
export function snapshotFees(totalSAR: number): FeeSnapshot {
  const ownerFeeSAR = Math.round(totalSAR * OWNER_SERVICE_FEE_RATE);
  const totalChargedSAR = totalSAR + ownerFeeSAR;
  const hostFeeSAR = Math.round(totalSAR * HOST_FEE_RATE);
  const payoutSAR = totalSAR - hostFeeSAR;
  return { totalSAR, ownerFeeSAR, totalChargedSAR, hostFeeSAR, payoutSAR };
}

export type RefundTier = 'full' | 'half' | 'none';

/**
 * Pure refund computation.
 *
 * Inputs:
 *   - totalChargedSAR: what the owner originally paid (whole SAR)
 *   - startDateIso:    booking start (yyyy-mm-dd)
 *   - nowIso:          current ISO timestamp
 *
 * "Start" is anchored to **midnight Asia/Riyadh (UTC+3, no DST)** so
 * a midnight-on-start-day cancellation is treated as "on/after start"
 * regardless of where the device is. Pre-round-1 code parsed the date
 * as `T00:00:00Z`, which placed the start at 3:00 AM Riyadh time —
 * a Saudi owner cancelling at 01:30 AM Riyadh on the morning of the
 * stay used to fall in the 50% tier when policy says no-refund.
 *
 * Refund clock TODO (server-side): nowIso here comes from the device.
 * `cancelBookingAsOwner` passes `new Date().toISOString()`, which a
 * user could spoof on a real-payments device. Pre-launch the refund
 * tier must be computed server-side (RPC using Postgres `now()`),
 * not by the client. Logged at the cancel call site too. See C2 in
 * the code-review audit (2026-06-11) and CLAUDE.md §11.
 *
 * Returns { tier, refundSAR } — refundSAR is integer SAR.
 */
export function computeCancellationRefund(
  totalChargedSAR: number,
  startDateIso: string,
  nowIso: string,
): { tier: RefundTier; refundSAR: number } {
  // Anchor "start" at 00:00 Asia/Riyadh by parsing with +03:00 offset
  // (Saudi has no DST so the offset is constant year-round).
  const start = new Date(startDateIso + 'T00:00:00+03:00').getTime();
  const now = new Date(nowIso).getTime();
  if (now >= start) {
    return { tier: 'none', refundSAR: 0 };
  }
  const hoursToStart = (start - now) / (1000 * 60 * 60);
  if (hoursToStart >= CANCELLATION_FULL_REFUND_HOURS) {
    return { tier: 'full', refundSAR: Math.round(totalChargedSAR) };
  }
  return {
    tier: 'half',
    refundSAR: Math.round(totalChargedSAR * CANCELLATION_LATE_REFUND_RATE),
  };
}

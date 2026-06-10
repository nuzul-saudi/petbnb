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

export const OWNER_SERVICE_FEE_RATE = 0.05;
export const HOST_FEE_RATE = 0.15;

export type FeeSnapshot = {
  totalSAR: number;
  ownerFeeSAR: number;
  totalChargedSAR: number;
  hostFeeSAR: number;
  payoutSAR: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the fee snapshot for a booking total. Mirror of what the
 * accept-time mutation writes; also used by the booking-request
 * screen to surface the breakdown BEFORE submit.
 */
export function snapshotFees(totalSAR: number): FeeSnapshot {
  const ownerFeeSAR = round2(totalSAR * OWNER_SERVICE_FEE_RATE);
  const totalChargedSAR = round2(totalSAR + ownerFeeSAR);
  const hostFeeSAR = round2(totalSAR * HOST_FEE_RATE);
  const payoutSAR = round2(totalSAR - hostFeeSAR);
  return { totalSAR, ownerFeeSAR, totalChargedSAR, hostFeeSAR, payoutSAR };
}

export type RefundTier = 'full' | 'half' | 'none';

/**
 * Pure refund computation. Inputs:
 *   - totalChargedSAR: what the owner originally paid
 *   - startDateIso:    booking start (yyyy-mm-dd)
 *   - nowIso:          current ISO timestamp (so callers can pass
 *                      server time)
 * Returns { tier, refundSAR }.
 */
export function computeCancellationRefund(
  totalChargedSAR: number,
  startDateIso: string,
  nowIso: string,
): { tier: RefundTier; refundSAR: number } {
  const start = new Date(startDateIso + 'T00:00:00Z').getTime();
  const now = new Date(nowIso).getTime();
  if (now >= start) {
    return { tier: 'none', refundSAR: 0 };
  }
  const hoursToStart = (start - now) / (1000 * 60 * 60);
  if (hoursToStart >= 48) {
    return { tier: 'full', refundSAR: round2(totalChargedSAR) };
  }
  return { tier: 'half', refundSAR: round2(totalChargedSAR * 0.5) };
}

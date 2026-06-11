// Boundary tests for the fee + refund engine.
// Locked behavior — see audit findings C1 / C3 (2026-06-11) and the
// updated header comments in src/lib/payments-policy.ts.

import { describe, expect, it } from 'vitest';
import {
  computeCancellationRefund,
  snapshotFees,
} from '@/lib/payments-policy';

describe('snapshotFees — whole SAR contract', () => {
  it('rounds the 5% owner fee to whole SAR (750 → 38, not 37.5)', () => {
    const f = snapshotFees(750);
    expect(f.ownerFeeSAR).toBe(38);
    expect(f.totalChargedSAR).toBe(788);
    // No decimal leakage on any field.
    expect(Number.isInteger(f.ownerFeeSAR)).toBe(true);
    expect(Number.isInteger(f.totalChargedSAR)).toBe(true);
    expect(Number.isInteger(f.hostFeeSAR)).toBe(true);
    expect(Number.isInteger(f.payoutSAR)).toBe(true);
  });

  it('rounds host fee 15% to whole SAR (750 → 113, payout 637)', () => {
    const f = snapshotFees(750);
    expect(f.hostFeeSAR).toBe(113);
    expect(f.payoutSAR).toBe(637);
  });

  it('handles the 333 SAR case from the audit (16.65 fee → 17, not 16.65)', () => {
    const f = snapshotFees(333);
    expect(f.ownerFeeSAR).toBe(17);
    expect(f.totalChargedSAR).toBe(350);
    expect(f.hostFeeSAR).toBe(50);
    expect(f.payoutSAR).toBe(283);
  });

  it('preserves the input total verbatim in totalSAR', () => {
    const f = snapshotFees(1234);
    expect(f.totalSAR).toBe(1234);
  });
});

describe('computeCancellationRefund — refund tiers + Riyadh anchor', () => {
  // start_date = 2026-07-10 → Riyadh midnight = 2026-07-09T21:00:00Z
  const start = '2026-07-10';

  it('returns full at exactly 48h before Riyadh midnight', () => {
    // 2026-07-09T21:00:00Z minus 48h = 2026-07-07T21:00:00Z
    const r = computeCancellationRefund(1000, start, '2026-07-07T21:00:00Z');
    expect(r.tier).toBe('full');
    expect(r.refundSAR).toBe(1000);
  });

  it('returns half at 47h 59m before Riyadh midnight', () => {
    // 2026-07-09T21:00:00Z minus 47h59m = 2026-07-07T21:01:00Z
    const r = computeCancellationRefund(1000, start, '2026-07-07T21:01:00Z');
    expect(r.tier).toBe('half');
    expect(r.refundSAR).toBe(500);
  });

  it('returns none exactly AT Riyadh midnight on start day', () => {
    const r = computeCancellationRefund(1000, start, '2026-07-09T21:00:00Z');
    expect(r.tier).toBe('none');
    expect(r.refundSAR).toBe(0);
  });

  it('returns none 01:30 Riyadh time on the morning of the stay (audit C3)', () => {
    // 01:30 Asia/Riyadh on 2026-07-10 = 2026-07-09T22:30:00Z, AFTER
    // 2026-07-09T21:00:00Z Riyadh midnight. Pre-fix this returned
    // 'half' because start was anchored to UTC midnight (3 AM Riyadh).
    const r = computeCancellationRefund(1000, start, '2026-07-09T22:30:00Z');
    expect(r.tier).toBe('none');
    expect(r.refundSAR).toBe(0);
  });

  it('odd-input rounding stays whole SAR (333 half → 167)', () => {
    const r = computeCancellationRefund(333, start, '2026-07-08T00:00:00Z');
    // 21h before Riyadh midnight → half tier, refund = round(333 * 0.5) = 167.
    expect(r.tier).toBe('half');
    expect(r.refundSAR).toBe(167);
    expect(Number.isInteger(r.refundSAR)).toBe(true);
  });
});

// Pricing engine boundaries — base subtotal with multi-pet discount,
// per-pet vs booking-scope add-ons, per-night vs one-time cadence.

import { describe, expect, it } from 'vitest';
import {
  ADDON_CONFIG,
  computeAddonCost,
  computeBaseSubtotal,
  computePriceBreakdown,
} from '@/lib/pricing';

describe('computeBaseSubtotal — multi-pet discount', () => {
  it('charges the first pet at full nightly × nights', () => {
    expect(
      computeBaseSubtotal({
        nightlyPriceSAR: 100,
        nights: 3,
        petCount: 1,
        additionalPetDiscount: 0.7,
      }),
    ).toBe(300);
  });

  it('worked example from header (100 × 2 × 3 pets @ 0.7 discount)', () => {
    // pet 1 (full)  = 200
    // pet 2 (30%)   =  60
    // pet 3 (30%)   =  60
    // total         = 320
    expect(
      computeBaseSubtotal({
        nightlyPriceSAR: 100,
        nights: 2,
        petCount: 3,
        additionalPetDiscount: 0.7,
      }),
    ).toBe(320);
  });

  it('clamps discount to [0, 1]', () => {
    // 1.5 → treated as 1 → extra pets free.
    expect(
      computeBaseSubtotal({
        nightlyPriceSAR: 100,
        nights: 1,
        petCount: 3,
        additionalPetDiscount: 1.5,
      }),
    ).toBe(100);
    // -0.5 → treated as 0 → extra pets pay full.
    expect(
      computeBaseSubtotal({
        nightlyPriceSAR: 100,
        nights: 1,
        petCount: 3,
        additionalPetDiscount: -0.5,
      }),
    ).toBe(300);
  });

  it('returns 0 for zero pets or zero nights', () => {
    expect(
      computeBaseSubtotal({
        nightlyPriceSAR: 100,
        nights: 0,
        petCount: 2,
        additionalPetDiscount: 0.7,
      }),
    ).toBe(0);
    expect(
      computeBaseSubtotal({
        nightlyPriceSAR: 100,
        nights: 3,
        petCount: 0,
        additionalPetDiscount: 0.7,
      }),
    ).toBe(0);
  });
});

describe('computeAddonCost — cadence + scope', () => {
  it('per-pet one-time (grooming = 50) × 2 pets = 100, no nights mult', () => {
    expect(
      computeAddonCost({ type: 'grooming', petIds: ['a', 'b'] }, 5),
    ).toBe(100);
  });

  it('per-pet per-night (vet = 100) × 2 pets × 3 nights = 600', () => {
    expect(computeAddonCost({ type: 'vet', petIds: ['a', 'b'] }, 3)).toBe(600);
  });

  it('booking-scope one-time (transport = 30) ignores petIds, no nights mult', () => {
    // Even with petIds, scope='booking' returns 1 unit.
    expect(
      computeAddonCost({ type: 'transport', petIds: ['a', 'b', 'c'] }, 7),
    ).toBe(30);
  });

  it('zero pets on a per-pet add-on contributes 0', () => {
    expect(computeAddonCost({ type: 'grooming', petIds: [] }, 5)).toBe(0);
  });
});

describe('computePriceBreakdown — totals', () => {
  it('sums base + addons honestly', () => {
    const br = computePriceBreakdown({
      nightlyPriceSAR: 100,
      nights: 2,
      petCount: 2,
      additionalPetDiscount: 0.7,
      addons: [
        { type: 'grooming', petIds: ['a'] }, // 50
        { type: 'transport', petIds: [] }, // 30
      ],
    });
    // base = 100*2 + 100*2*0.3 = 260
    // addons = 80
    expect(br.baseSubtotalSAR).toBe(260);
    expect(br.addonsTotalSAR).toBe(80);
    expect(br.totalSAR).toBe(340);
  });

  it('all four add-on types match catalog prices', () => {
    expect(ADDON_CONFIG.grooming.priceSAR).toBe(50);
    expect(ADDON_CONFIG.vet.priceSAR).toBe(100);
    expect(ADDON_CONFIG.insurance.priceSAR).toBe(25);
    expect(ADDON_CONFIG.transport.priceSAR).toBe(30);
  });
});

// ============================================================================
// Petbnb — Pricing engine (Step 5.6D)
//
// Pure math. No Supabase, no React, no i18n — so it can be reused by the
// booking-request screen, the confirmation screen, and (later) a host's
// "preview my listing" view. All inputs are plain numbers / arrays, all
// outputs are integer SAR.
//
// ---------------------------------------------------------------------------
// THE RULES IN PLAIN WORDS
// ---------------------------------------------------------------------------
//
// 1. BASE HOSTING (the "room"):
//    - The first pet always pays the full nightly rate.
//    - Each additional pet pays (nightly * (1 - additionalPetDiscount)).
//      Platform default discount is 0.70, meaning additional pets pay 30%
//      of the nightly rate. The host can raise or lower it on their listing
//      (Step 7). Stored on the listing AND snapshotted on the booking so a
//      later host change doesn't retroactively reprice the stay.
//    - Multiplied by the number of nights.
//
//    Worked example: nightly = 100, nights = 2, pets = 3, discount = 0.70
//      pet 1 (full)     = 100 * 2 = 200
//      pet 2 (30%)      = 100 * 2 * 0.30 = 60
//      pet 3 (30%)      = 100 * 2 * 0.30 = 60
//      base subtotal    = 320 SAR
//
// 2. ADD-ONS:
//    - Add-ons are NEVER discounted, regardless of pet count.
//    - Per-pet add-ons (grooming, vet, insurance) are charged per pet
//      attached to them. The UI hands us the list of pet ids attached to
//      each add-on; the cost is price * petIds.length (* nights if
//      per-night).
//    - Booking-scoped add-ons (transport) are charged once for the whole
//      stay, regardless of pet count. They appear in the selection array
//      with an empty petIds list — presence = selected.
//    - Cadence: 'one_time' charges once regardless of nights; 'per_night'
//      multiplies by nights.
//
//    Current catalog (matches src/app/listings/[id]/request.tsx):
//      grooming  = 50  SAR per pet, one-time
//      vet       = 100 SAR per pet per night
//      insurance = 25  SAR per pet, one-time
//      transport = 30  SAR per booking, one-time
//
// 3. TOTAL = baseSubtotal + addonsTotal.
//
// All outputs are rounded to integer SAR (Math.round) because the DB
// stores integers and the founder doesn't want decimal SAR shown.
// ============================================================================

export type AddonType = 'grooming' | 'vet' | 'transport' | 'insurance';
export type AddonScope = 'per_pet' | 'booking';
export type AddonCadence = 'one_time' | 'per_night';

export const ADDON_CONFIG: Record<
  AddonType,
  { scope: AddonScope; cadence: AddonCadence; priceSAR: number }
> = {
  grooming: { scope: 'per_pet', cadence: 'one_time', priceSAR: 50 },
  vet: { scope: 'per_pet', cadence: 'per_night', priceSAR: 100 },
  insurance: { scope: 'per_pet', cadence: 'one_time', priceSAR: 25 },
  transport: { scope: 'booking', cadence: 'one_time', priceSAR: 30 },
};

// How the UI hands selections to pricing.
//   per_pet types: petIds is the list of pets attached to this add-on.
//                  An empty list contributes 0 (UI should omit it instead).
//   booking types: presence in the array = selected for the whole stay.
//                  petIds is ignored — by convention, pass [].
export type AddonSelection = {
  type: AddonType;
  petIds: string[];
};

// ---------------------------------------------------------------------------
// Base hosting
// ---------------------------------------------------------------------------

export function computeBaseSubtotal(args: {
  nightlyPriceSAR: number;
  nights: number;
  petCount: number;
  additionalPetDiscount: number; // fraction OFF, e.g. 0.70
}): number {
  if (args.petCount < 1 || args.nights < 1) return 0;
  const discount = clamp01(args.additionalPetDiscount);
  // First pet full price; each additional pet pays (1 - discount) of full.
  // Equivalent factor across all pets: 1 + (petCount - 1) * (1 - discount).
  const factor = 1 + (args.petCount - 1) * (1 - discount);
  return Math.round(args.nightlyPriceSAR * args.nights * factor);
}

// ---------------------------------------------------------------------------
// Add-on math
// ---------------------------------------------------------------------------

export function computeAddonCost(sel: AddonSelection, nights: number): number {
  const cfg = ADDON_CONFIG[sel.type];
  // The "how many units" multiplier:
  //   per_pet → number of pets attached (0 if none selected → returns 0)
  //   booking → 1 (presence in the array = selected once)
  const unitCount = cfg.scope === 'per_pet' ? sel.petIds.length : 1;
  // The "how many nights" multiplier:
  //   per_night → nights (clamped to >= 0)
  //   one_time  → 1
  const nightsMult = cfg.cadence === 'per_night' ? Math.max(nights, 0) : 1;
  return Math.round(cfg.priceSAR * unitCount * nightsMult);
}

export function computeAddonsTotal(
  sels: AddonSelection[],
  nights: number,
): number {
  return sels.reduce((sum, s) => sum + computeAddonCost(s, nights), 0);
}

// ---------------------------------------------------------------------------
// Grand total + line-by-line breakdown for the UI
// ---------------------------------------------------------------------------

export type PriceBreakdown = {
  baseSubtotalSAR: number;
  addonLines: {
    type: AddonType;
    petCount: number; // for per_pet types; for booking types this is 0 by convention
    nights: number;
    cadence: AddonCadence;
    scope: AddonScope;
    lineSAR: number;
  }[];
  addonsTotalSAR: number;
  totalSAR: number;
};

export function computePriceBreakdown(args: {
  nightlyPriceSAR: number;
  nights: number;
  petCount: number;
  additionalPetDiscount: number;
  addons: AddonSelection[];
}): PriceBreakdown {
  const baseSubtotalSAR = computeBaseSubtotal({
    nightlyPriceSAR: args.nightlyPriceSAR,
    nights: args.nights,
    petCount: args.petCount,
    additionalPetDiscount: args.additionalPetDiscount,
  });

  const addonLines = args.addons.map((sel) => {
    const cfg = ADDON_CONFIG[sel.type];
    return {
      type: sel.type,
      petCount: cfg.scope === 'per_pet' ? sel.petIds.length : 0,
      nights: args.nights,
      cadence: cfg.cadence,
      scope: cfg.scope,
      lineSAR: computeAddonCost(sel, args.nights),
    };
  });

  const addonsTotalSAR = addonLines.reduce((sum, l) => sum + l.lineSAR, 0);

  return {
    baseSubtotalSAR,
    addonLines,
    addonsTotalSAR,
    totalSAR: baseSubtotalSAR + addonsTotalSAR,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

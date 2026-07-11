// First-edit draft snapshot builder (two-copy edit model, Step 8).
//
// Extracted from updateListing (Part B2, 2026-07-11 brief) so the
// snapshot is unit-testable: this module is PURE — type-only imports,
// no supabase/React graph — which is what lets node vitest load it.
//
// WHY THE EXTRACTION HAPPENED: the inline snapshot omitted
// accepts_species behind a SPECIES_ENABLED gate, originally as a
// defensive guard for environments where 0034's listing_drafts half
// wasn't applied (which turned out to be production itself — repaired
// by migration 0052). With the column present, the omission became a
// data-loss bug: the column's default array['cat'] would silently
// RESET a listing's real species on the next field-edit approval
// (promote copies every draft column back). The snapshot must be
// FAITHFUL: every editable column carries patch-else-current.

import type { UpdateListingPatch } from '@/lib/listings';
import type { Tables, TablesInsert } from '@/types/database';

/**
 * Build the full-row listing_drafts INSERT for a first edit: current
 * listing values with the patch layered on top, so the promote RPC can
 * copy every column back without nulling or defaulting anything.
 *
 * `speciesEnabled` gates only whether the PATCH may override
 * accepts_species (the edit UI can't produce acceptsSpecies while the
 * flag is off) — the CURRENT value is always carried, faithfully.
 */
export function buildListingDraftSnapshot(
  listingId: string,
  patch: UpdateListingPatch,
  current: Tables<'listings'>,
  speciesEnabled: boolean,
): TablesInsert<'listing_drafts'> {
  return {
    listing_id: listingId,
    city: (patch.city ?? current.city) as 'riyadh' | 'dammam',
    neighborhood: patch.neighborhood ?? current.neighborhood,
    title_ar: patch.title ?? current.title_ar,
    title_en: current.title_en,
    description_ar:
      patch.description !== undefined
        ? patch.description
        : current.description_ar,
    description_en: current.description_en,
    nightly_price_sar: patch.nightlyPrice ?? current.nightly_price_sar,
    max_concurrent_pets:
      patch.maxConcurrentPets ?? current.max_concurrent_pets,
    has_resident_pets: patch.hasResidentPets ?? current.has_resident_pets,
    resident_pets_note:
      patch.residentPetsNote !== undefined
        ? patch.residentPetsNote
        : current.resident_pets_note,
    offers_grooming: patch.offersGrooming ?? current.offers_grooming,
    // 0041 — per-host service-addon opt-ins on the snapshot. Listings
    // rows have these as NOT NULL with default false; if current is
    // somehow null (pre-0041 row read before backfill, vanishingly
    // unlikely), fall back to false.
    offers_vet: patch.offersVet ?? current.offers_vet ?? false,
    offers_insurance:
      patch.offersInsurance ?? current.offers_insurance ?? false,
    offers_transport:
      patch.offersTransport ?? current.offers_transport ?? false,
    host_gender: patch.hostGender ?? current.host_gender,
    requires_vaccination:
      patch.requiresVaccination ?? current.requires_vaccination,
    // FAITHFUL species carry (B2): current value always copied; the
    // patch may override only while the species UI is enabled.
    // Requires listing_drafts.accepts_species — 0034, repaired by 0052.
    accepts_species:
      (speciesEnabled ? patch.acceptsSpecies : undefined) ??
      current.accepts_species,
  };
}

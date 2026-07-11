import { describe, expect, it } from 'vitest';

import { buildListingDraftSnapshot } from '@/lib/listing-draft-snapshot';
import type { Tables } from '@/types/database';

// Part B2 (2026-07-11): the first-edit draft snapshot must be FAITHFUL —
// every editable column carries patch-else-current. The original inline
// snapshot omitted accepts_species, so the column default array['cat']
// would silently reset a listing's real species on the next field-edit
// approval (promote copies every draft column back onto the listing).

// Only the fields the builder reads; cast keeps the fixture short.
const CURRENT = {
  id: 'l1',
  city: 'riyadh',
  neighborhood: 'العليا',
  title_ar: 'عنوان',
  title_en: null,
  description_ar: 'وصف',
  description_en: null,
  nightly_price_sar: 120,
  max_concurrent_pets: 2,
  has_resident_pets: false,
  resident_pets_note: null,
  offers_grooming: true,
  offers_vet: false,
  offers_insurance: false,
  offers_transport: true,
  host_gender: 'female',
  requires_vaccination: true,
  accepts_species: ['cat', 'dog'],
} as unknown as Tables<'listings'>;

describe('buildListingDraftSnapshot — faithful patch-over-current', () => {
  it('ALWAYS carries current accepts_species, even with species UI off', () => {
    const snap = buildListingDraftSnapshot('l1', {}, CURRENT, false);
    // The regression: omitting this let the DB default ['cat'] reset a
    // cat+dog listing to cat-only on approval.
    expect(snap.accepts_species).toEqual(['cat', 'dog']);
  });

  it('patch overrides accepts_species only while species UI is enabled', () => {
    const withFlagOn = buildListingDraftSnapshot(
      'l1',
      { acceptsSpecies: ['cat'] },
      CURRENT,
      true,
    );
    expect(withFlagOn.accepts_species).toEqual(['cat']);

    // Flag off → a (theoretically impossible) patch value is ignored;
    // current wins. The UI can't produce acceptsSpecies while gated,
    // this pins the belt-and-braces behavior.
    const withFlagOff = buildListingDraftSnapshot(
      'l1',
      { acceptsSpecies: ['cat'] },
      CURRENT,
      false,
    );
    expect(withFlagOff.accepts_species).toEqual(['cat', 'dog']);
  });

  it('layers patch over current for the other editable columns', () => {
    const snap = buildListingDraftSnapshot(
      'l1',
      { nightlyPrice: 200, residentPetsNote: 'قطتان مقيمتان' },
      CURRENT,
      false,
    );
    expect(snap.listing_id).toBe('l1');
    expect(snap.nightly_price_sar).toBe(200); // patched
    expect(snap.resident_pets_note).toBe('قطتان مقيمتان'); // patched
    expect(snap.title_ar).toBe('عنوان'); // carried
    expect(snap.offers_transport).toBe(true); // carried
    expect(snap.requires_vaccination).toBe(true); // carried
  });

  it('treats explicit null residentPetsNote as a real value, not "unset"', () => {
    const snap = buildListingDraftSnapshot(
      'l1',
      { residentPetsNote: null },
      { ...CURRENT, resident_pets_note: 'old' } as Tables<'listings'>,
      false,
    );
    expect(snap.resident_pets_note).toBeNull();
  });
});

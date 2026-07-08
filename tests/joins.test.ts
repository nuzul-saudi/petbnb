import { describe, expect, it } from 'vitest';

import { compactJoined, pluckJoined } from '../src/lib/joins';

// Regression guard for the production crash class (observed twice): a
// PostgREST nested embed nulls its inner object when RLS hides that row,
// so a joined array can contain null ELEMENTS that `?? []` does not
// remove. pluckJoined/compactJoined must strip them so a downstream
// `.map((p) => p.photo_url)` never dereferences null.

describe('pluckJoined', () => {
  it('lifts the inner entity and drops RLS-nulled elements', () => {
    // Shape mirrors `booking_pets(pet:pets(*))` where a declined booking
    // hides the pet from the host → { pet: null }.
    const bookingPets = [
      { pet: { id: 'a', photo_url: 'x' } },
      { pet: null },
      { pet: { id: 'b', photo_url: null } },
    ];
    const pets = pluckJoined(bookingPets, (bp) => bp.pet);
    expect(pets).toEqual([
      { id: 'a', photo_url: 'x' },
      { id: 'b', photo_url: null },
    ]);
    // The dangerous op that used to throw now runs clean.
    expect(() => pets.map((p) => p.photo_url)).not.toThrow();
  });

  it('treats null/undefined arrays as empty', () => {
    expect(pluckJoined(null, (x: { pet: unknown }) => x.pet)).toEqual([]);
    expect(pluckJoined(undefined, (x: { pet: unknown }) => x.pet)).toEqual([]);
  });
});

describe('compactJoined', () => {
  it('drops null/undefined elements from a direct/jsonb array', () => {
    expect(compactJoined(['a', null, 'b', undefined])).toEqual(['a', 'b']);
  });

  it('treats null/undefined arrays as empty', () => {
    expect(compactJoined(null)).toEqual([]);
    expect(compactJoined(undefined)).toEqual([]);
  });

  it('keeps a sort over the result safe when a null element was present', () => {
    const photos = [
      { sort_order: 2, photo_url: 'b' },
      null,
      { sort_order: 1, photo_url: 'a' },
    ];
    const sorted = compactJoined(photos).sort(
      (x, y) => x.sort_order - y.sort_order,
    );
    expect(sorted.map((p) => p.photo_url)).toEqual(['a', 'b']);
  });
});

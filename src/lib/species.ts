// Round 12 / Step 5.7 — multi-species support.
//
// Single source of truth for which species the marketplace recognizes
// and their display labels. Today: cat | dog. Adding a third means:
//   1) extend `Species` union + SPECIES_LIST below
//   2) add the breed list at src/lib/<species>-breeds.ts
//   3) drop & recreate the listings.accepts_species check constraint
//      in a new migration
//   4) add the i18n label keys species.<key>
//
// pets.species already exists since migration 0001 (default 'cat').
// listings.accepts_species lands in migration 0034.

export type Species = 'cat' | 'dog';

export const SPECIES_LIST: readonly Species[] = ['cat', 'dog'] as const;

/**
 * i18n label key for a species. Resolves through the normal t().
 * Use `species.cat` / `species.dog` directly when the call site is
 * static; use this helper when the species comes from a runtime
 * value (e.g. a pet row or a filter chip).
 */
export function speciesLabelKey(s: Species): string {
  return `species.${s}`;
}

/**
 * Emoji glyph for a species — used as the small visual badge on the
 * listing card "max pets" counter and the pet picker. Centralizing
 * here keeps the choice consistent everywhere it appears.
 */
export function speciesEmoji(s: Species): string {
  if (s === 'dog') return '🐕';
  return '🐈';
}

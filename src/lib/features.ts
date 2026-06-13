// Feature flags — single source of truth. Each flag has a comment
// describing what flipping it on/off does so future-you doesn't
// have to grep call-sites to understand the blast radius.

/**
 * Species (cat / dog) support — gated until migration 0034 is
 * applied. The decision to launch with dogs is a real product call
 * (different liability, vaccination schedule, insurance partner
 * conversation) and not the kind of thing we want flipped on
 * accidentally by applying a migration.
 *
 * While SPECIES_ENABLED is false:
 *
 *   • Owner feed hides the Cat / Dog filter chips entirely.
 *   • Owner feed's listActiveListings call DOES NOT pass `species`
 *     (so PostgREST never references the missing column).
 *   • Pet form hides the species selector. New pets default to cat.
 *     (pets.species column exists since 0001 with default 'cat',
 *     so this is purely a UI gate — the DB doesn't change.)
 *   • Listing form hides the accepts_species multi-pill.
 *   • createListing / updateListing OMIT accepts_species from
 *     INSERT / UPDATE payloads (the column doesn't exist; including
 *     it would error).
 *   • SearchWhichPetModal hides the cat/dog stand-in picker shown
 *     to guests (meaningless without a species filter).
 *   • Signed-in users still see the Which-pet modal and can pick
 *     pets — the pet IDs forward to /request normally. Only the
 *     species derivation (set speciesFilter from picked species)
 *     is skipped.
 *   • Listing card cap-badge falls back to 🐈 since the row's
 *     accepts_species field is undefined (column absent).
 *
 * Flipping to true: apply 0034, set SPECIES_ENABLED = true.
 * Everything turns on at once — no hunt-and-replace.
 */
export const SPECIES_ENABLED = false;

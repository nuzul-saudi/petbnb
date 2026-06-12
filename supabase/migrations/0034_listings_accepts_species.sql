-- 0034 — Step 5.7 / Round 12 Phase A — multi-species expansion (dogs).
--
-- The MVP scope grows from cat-only to cat + dog. Listings declare which
-- species they accept; the owner feed will filter on that. We do this as
-- an array column (rather than two booleans) so future species (rabbit,
-- bird, etc.) extend without a schema change.
--
-- Why default '{cat}': the entire existing seed/test data is cat-only.
-- Backfilling cat keeps every existing listing visible to cat owners
-- (current default), and hosts opt INTO dogs explicitly via the listing
-- edit form (Round 12b). This is the safe direction — surprise visibility
-- (defaulting to '{cat,dog}') could route owners to hosts who don't want
-- their species.
--
-- Note: `pets.species` already exists since 0001 with default 'cat'. No
-- pets-side change here — the species selector in the pet creation form
-- writes through the existing column.

alter table public.listings
  add column accepts_species text[] not null default array['cat'];

-- Constraint: every entry must be a supported species. Today: cat | dog.
-- Adding a new species means dropping & recreating this constraint plus
-- updating the species enum in src/lib/species.ts.
alter table public.listings
  add constraint listings_accepts_species_valid
  check (
    array_length(accepts_species, 1) >= 1
    and accepts_species <@ array['cat','dog']
  );

-- GIN index supports the planned owner-feed filter:
--   .from('listings').contains('accepts_species', [filterSpecies])
-- without a sequential scan once the listing pool grows. Cheap at <100
-- rows but the right shape from the start.
create index listings_accepts_species_gin_idx
  on public.listings using gin (accepts_species);

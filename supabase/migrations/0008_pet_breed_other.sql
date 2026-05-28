-- ============================================================================
-- Petbnb MVP — Step 5.6C — pets.breed_other
-- Run AFTER 0007_step_56_schema.sql.
--
-- Adds one nullable text column for free-text breed entry. The Step 5.6
-- BreedPicker only offers the curated cat list in src/lib/breeds.ts;
-- this column captures the user's typed value when they pick "لا أعرف"
-- (unknown) or when the future "other" / multi-species (Step 5.7) flow
-- needs a name that isn't in the picker.
-- ============================================================================

alter table public.pets
  add column if not exists breed_other text;

comment on column public.pets.breed_other is
  'Free-text breed name. Used when breed is null or when the user picked the unknown/other option in the breed picker.';

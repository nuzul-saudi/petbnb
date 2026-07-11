-- ============================================================
-- 0052 — REPAIR: listing_drafts.accepts_species (prod drift)
-- ============================================================
-- WRITTEN, not applied. Strategy reviews line-by-line BEFORE Omar
-- applies. File is deliberately UNWRAPPED — Omar wraps begin/commit
-- at apply time per the standard flow.
--
-- Root cause (confirmed live, 2026-07-11, admin-impersonated +
-- rollback-wrapped): promote_listing_draft raises
--   ERROR 42703: column d.accepts_species does not exist  (line 25)
-- on the first field-edit approval in prod history. The 0034 FILE is
-- correct (adds accepts_species to BOTH listings and listing_drafts);
-- production PARTIALLY applied it — the promote RPC redefinition
-- (0042) landed and listings.accepts_species exists, but the
-- listing_drafts ALTER never ran. This migration repairs the drift
-- idempotently: every statement is safe whether or not the 0034
-- listing_drafts half is present, so it can run against EITHER drift
-- state (and re-run harmlessly).
--
-- Deliberately NOT touched: promote_listing_draft — the RPC is
-- correct once the column exists (verified in 0042's apply checks).

-- 1. The missing column. Mirrors 0034's listing_drafts half exactly:
--    text[] NOT NULL default array['cat'] (safe backfill direction —
--    every existing draft row is cat-only by construction).
alter table public.listing_drafts
  add column if not exists accepts_species text[] not null default array['cat'];

-- 2. The mirrored validity constraint. ADD CONSTRAINT has no
--    IF NOT EXISTS, so guard via pg_constraint first. Same predicate
--    as 0034: at least one entry, all entries in the supported set.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'listing_drafts'
      and c.conname = 'listing_drafts_accepts_species_valid'
  ) then
    alter table public.listing_drafts
      add constraint listing_drafts_accepts_species_valid
      check (
        array_length(accepts_species, 1) >= 1
        and accepts_species <@ array['cat','dog']
      );
  end if;
end
$$;

-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- (i) Column present with the right shape.
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'listing_drafts'
--     and column_name = 'accepts_species';
--   expect: 1 row — data_type 'ARRAY', is_nullable 'NO',
--   column_default containing 'cat'.
--
-- (ii) Constraint present.
--   select conname, pg_get_constraintdef(c.oid)
--   from pg_constraint c
--   join pg_class t on t.oid = c.conrelid
--   join pg_namespace n on n.oid = t.relnamespace
--   where n.nspname = 'public'
--     and t.relname = 'listing_drafts'
--     and c.conname = 'listing_drafts_accepts_species_valid';
--   expect: 1 row; definition contains "array_length" and "<@".
--
-- (iii) DRIFT AUDIT — did more of 0034 go missing? The GIN index on
--     the LISTINGS side (0034's third statement) should exist:
--   select indexname
--   from pg_indexes
--   where schemaname = 'public'
--     and tablename = 'listings'
--     and indexname = 'listings_accepts_species_gin_idx';
--   expect: 1 row. If 0 rows, MORE of 0034 is missing — report back
--   before creating it (the index is a separate repair decision, not
--   silently bundled here).
--
-- (iv) Post-repair behavioral (rollback-wrapped): re-run the failed
--     field-edit approval (promote_listing_draft on the pending
--     draft) inside begin/rollback — expect: no 42703, draft values
--     copied onto the listing row.

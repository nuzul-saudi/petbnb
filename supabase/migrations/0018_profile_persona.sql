-- Step 7.1c: per-user persona preference for role='both' users.
-- NULLABLE on purpose: null = "user has never chosen a persona," which
-- the app treats as the first-open default of 'host'. Once the user
-- toggles the persona switch in the header, the value is set explicitly
-- and persists across devices. For pure 'owner' and 'host' roles the
-- column is read but ignored — the role itself determines which home
-- renders; persona only governs the 'both' branch.
-- Column is text + check constraint rather than enum so future personas
-- (e.g. a vet/groomer view post-MVP) can be added without a schema
-- change.
-- RLS: the existing profiles_update_self policy (last applied in
-- migration 0004) already permits a user to UPDATE any column of their
-- own profile row, including this one. No policy change needed.
alter table public.profiles
  add column if not exists persona text
    check (persona in ('owner','host'));

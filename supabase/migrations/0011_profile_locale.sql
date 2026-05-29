-- Step 5.8.3: per-user locale preference.
-- Default 'ar' to match the app's current default behavior.
-- Column is text + check constraint rather than enum so we can extend
-- to additional locales without a migration (just add code).
alter table public.profiles
  add column if not exists locale text not null default 'ar'
    check (locale in ('ar','en'));

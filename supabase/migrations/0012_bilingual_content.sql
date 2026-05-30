-- Step 7 prep: optional English versions of user-entered content.
-- All nullable; display falls back to the Arabic field when _en is empty
-- so existing rows continue to render correctly.
alter table public.listings
  add column if not exists title_en text,
  add column if not exists description_en text;

alter table public.profiles
  add column if not exists display_name_en text;

-- Tidy-up: rename profiles.display_name_en → full_name_en so the
-- English column matches the existing 'full_name' (Arabic) column.
-- Migration 0012 (which added display_name_en) shipped earlier today;
-- this migration cleans up the naming before any data lands in it.
alter table public.profiles
  rename column display_name_en to full_name_en;

-- Round 11 — saved listings (favorites).
--
-- Trivial join table: a row exists iff a user has favorited a listing.
-- Composite PK (user_id, listing_id) doubles as the uniqueness
-- constraint AND the natural index for the hot-path query "is this
-- listing in my favorites set?".
--
-- Cascade on either side: removing a user wipes their favorites
-- (consistent with the rest of the user-scoped data model); removing
-- a listing wipes any stale references to it.

create table public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Secondary index for the "list all favorites of a user" query, with
-- created_at as a tiebreaker so the most-recently-favorited shows
-- first in the UI without an explicit ORDER BY everywhere.
create index favorites_user_recent_idx
  on public.favorites (user_id, created_at desc);


-- ============================================================
-- RLS
-- ============================================================
alter table public.favorites enable row level security;

-- A user can SELECT their own favorites. Admin sees everything via
-- is_admin() bypass. Nobody else needs to read another user's
-- favorites — keeping this tight prevents future "show your friend's
-- favorites" features from accidentally landing without an explicit
-- privacy review.
create policy "favorites_select_own"
  on public.favorites for select
  to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
  );

-- INSERT: a user can favorite a listing iff they're the one favoriting
-- AND they're not suspended (is_active_user). No public-or-active
-- check on the listing — the user might favorite something they saw
-- before it was paused, and that's fine; the feed query filters
-- visibility separately.
create policy "favorites_insert_own"
  on public.favorites for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and user_id = (select auth.uid())
    )
  );

-- DELETE: a user can un-favorite their own row. is_active_user bypass
-- is intentionally absent — a suspended user should still be able to
-- un-favorite (data hygiene), just not add new ones.
create policy "favorites_delete_own"
  on public.favorites for delete
  to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
  );

-- No UPDATE — there's nothing to update on a (user, listing, created_at)
-- triple. The row is fully described by its existence.


-- ============================================================
-- Verification queries — run after the migration
-- ============================================================
--
-- 1. Table + PK present.
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name = 'favorites';
--   expect: 1 row.
--
--   select constraint_name from information_schema.table_constraints
--   where table_schema = 'public' and table_name = 'favorites'
--     and constraint_type = 'PRIMARY KEY';
--   expect: favorites_pkey.
--
-- 2. Three policies present (no UPDATE).
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.favorites'::regclass
--   order by polname;
--   expect: favorites_delete_own (d), favorites_insert_own (a),
--           favorites_select_own (r). No 'w'.
--
-- 3. Secondary index present.
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'favorites'
--     and indexname = 'favorites_user_recent_idx';
--   expect: 1 row.

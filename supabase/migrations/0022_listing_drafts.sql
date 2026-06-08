-- Step 8c — listing_drafts + listing_photo_drafts tables (the
-- "pending edit copy" of an approved listing's fields and photos).
--
-- Schema mirrors the editable subset of listings and the full shape of
-- listing_photos. Both draft tables FK to listings(id) ON DELETE
-- CASCADE so deleting a listing transparently wipes any pending draft
-- — no orphan rows possible from the DB side.
--
-- Two-copies-max is enforced by unique(listing_id) on listing_drafts:
-- at most one draft per parent. Re-edit overwrites the existing row.
--
-- Visibility — RLS policies below — restrict every operation on these
-- tables to admin or the host of the parent listing. The public read
-- path (listActiveListings → listings + listing_photos) never touches
-- these tables; even if a future JOIN accidentally referenced
-- listing_drafts, RLS would still reject the row for an anon or
-- non-host viewer. Drafts cannot leak to the public feed.
--
-- 8c ships SCHEMA + RLS only. No code uses these tables yet. 8d wires
-- updateListing + getListingForEdit to write/read drafts on approved
-- and paused listings. 8e parameterises the photo helpers. 8f adds
-- the promote/discard RPCs. 8g unifies the admin approve flow.

-- ============================================================
-- listing_drafts — the pending field-edit copy
-- ============================================================
create table public.listing_drafts (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null unique
    references public.listings(id) on delete cascade,

  -- Editable columns. Types + constraints mirror listings exactly so
  -- a draft row can be promoted by direct column copy in 8f's RPC.
  city                text not null check (city in ('riyadh','dammam')),
  neighborhood        text not null,
  title_ar            text not null,
  title_en            text,
  description_ar      text,
  description_en      text,
  nightly_price_sar   numeric not null,
  max_concurrent_pets integer not null,
  has_resident_pets   boolean not null,
  resident_pets_note  text,
  offers_grooming     boolean not null,
  host_gender         text not null check (host_gender in ('female','male')),

  -- updated_at lets the 8g admin queue sort "most-recently-touched
  -- drafts first." Maintained by the trigger below.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Generic updated_at toucher. Reusable on any table that has the
-- column. `create or replace` is safe if a later migration adds the
-- same helper.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists listing_drafts_touch_updated_at
  on public.listing_drafts;
create trigger listing_drafts_touch_updated_at
  before update on public.listing_drafts
  for each row
  execute function public.touch_updated_at();


-- ============================================================
-- listing_photo_drafts — the pending photo-set copy
-- ============================================================
-- Exact mirror of listing_photos: same column shape, same unique
-- constraint, same index. Storage objects stay in the listing-photos
-- bucket at the same <listing_id>/<filename> path (RLS keys off the
-- first folder segment = listing_id). Only the row containing the
-- URL moves between listing_photos and listing_photo_drafts.
create table public.listing_photo_drafts (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null
    references public.listings(id) on delete cascade,
  photo_url   text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (listing_id, sort_order)
);
create index listing_photo_drafts_listing_id_idx
  on public.listing_photo_drafts(listing_id);


-- ============================================================
-- RLS — both tables: admin OR host of parent listing.
-- INSERT/UPDATE/DELETE additionally require is_active_user() so
-- a suspended host can read their drafts but cannot mutate them.
-- Mirrors the listings_*_host policies from migrations 0002 / 0004.
-- ============================================================
alter table public.listing_drafts       enable row level security;
alter table public.listing_photo_drafts enable row level security;


-- ---- listing_drafts policies ----
create policy "listing_drafts_select_host_or_admin"
  on public.listing_drafts for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.listings l
      where l.id = listing_drafts.listing_id
        and l.host_id = (select auth.uid())
    )
  );

create policy "listing_drafts_insert_host"
  on public.listing_drafts for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

create policy "listing_drafts_update_host"
  on public.listing_drafts for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

create policy "listing_drafts_delete_host"
  on public.listing_drafts for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );


-- ---- listing_photo_drafts policies (same shape) ----
create policy "listing_photo_drafts_select_host_or_admin"
  on public.listing_photo_drafts for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.listings l
      where l.id = listing_photo_drafts.listing_id
        and l.host_id = (select auth.uid())
    )
  );

create policy "listing_photo_drafts_insert_host"
  on public.listing_photo_drafts for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

create policy "listing_photo_drafts_update_host"
  on public.listing_photo_drafts for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

create policy "listing_photo_drafts_delete_host"
  on public.listing_photo_drafts for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.listings l
        where l.id = listing_photo_drafts.listing_id
          and l.host_id = (select auth.uid())
      )
    )
  );

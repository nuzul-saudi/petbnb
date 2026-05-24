-- ============================================================================
-- Petbnb MVP — Initial schema (Step 3 of build plan)
-- Source of truth: CLAUDE.md Section 5.
-- Run this BEFORE 0002_rls_policies.sql.
-- gen_random_uuid() and pgcrypto ship preinstalled on Supabase, no extension
-- statement needed.
-- ============================================================================


-- ============================================================
-- profiles  (1:1 with auth.users — created by trigger on signup)
-- ============================================================
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null default '',
  phone           text unique,
  role            text not null default 'owner'
                    check (role in ('owner', 'host', 'both')),
  avatar_url      text,
  nafath_verified boolean not null default false,
  id_document_url text,  -- reserved for future Nafath ID upload
  created_at      timestamptz not null default now()
);

-- Auto-provision a profile row whenever a new auth.users row appears.
-- SMS OTP signup doesn't collect a name; full_name is set later in the
-- role-selection screen (Step 4).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- pets
-- ============================================================
create table public.pets (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  name                text not null,
  species             text not null default 'cat',
  breed               text,
  age_months          integer check (age_months is null or age_months >= 0),
  vaccination_doc_url text,
  behavioral_notes    text,
  photo_url           text,
  created_at          timestamptz not null default now()
);
create index pets_owner_id_idx on public.pets(owner_id);


-- ============================================================
-- listings
-- ============================================================
create table public.listings (
  id                  uuid primary key default gen_random_uuid(),
  host_id             uuid not null references public.profiles(id) on delete cascade,
  title_ar            text not null,
  description_ar      text,
  neighborhood        text not null,
  nightly_price_sar   integer not null check (nightly_price_sar >= 0),
  max_concurrent_pets integer not null default 1 check (max_concurrent_pets >= 1),
  has_resident_pets   boolean not null default false,
  resident_pets_note  text,
  is_active           boolean not null default true,
  tier                text not null default 'bronze'
                        check (tier in ('bronze', 'silver', 'gold')),
  offers_grooming     boolean not null default false,
  host_gender         text not null check (host_gender in ('female', 'male')),
  created_at          timestamptz not null default now()
);
create index listings_host_id_idx              on public.listings(host_id);
create index listings_active_neighborhood_idx  on public.listings(is_active, neighborhood);


-- ============================================================
-- listing_photos  (the Airbnb-style home gallery)
-- ============================================================
create table public.listing_photos (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  photo_url   text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (listing_id, sort_order)
);
create index listing_photos_listing_id_idx on public.listing_photos(listing_id);


-- ============================================================
-- bookings
-- ============================================================
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings(id) on delete restrict,
  owner_id          uuid not null references public.profiles(id) on delete restrict,
  pet_id            uuid not null references public.pets(id) on delete restrict,
  start_date        date not null,
  end_date          date not null,
  -- Derived from the dates so the two never drift; STORED keeps it indexable.
  nights            integer generated always as ((end_date - start_date)) stored,
  base_price_sar    integer not null check (base_price_sar >= 0),
  addons_total_sar  integer not null default 0 check (addons_total_sar >= 0),
  total_sar         integer not null check (total_sar >= 0),
  status            text not null default 'requested'
                      check (status in ('requested','accepted','declined','active','completed','cancelled','disputed')),
  created_at        timestamptz not null default now(),
  check (end_date > start_date)
);
create index bookings_owner_id_idx    on public.bookings(owner_id);
create index bookings_listing_id_idx  on public.bookings(listing_id);
create index bookings_status_idx      on public.bookings(status);


-- ============================================================
-- booking_addons
-- ============================================================
create table public.booking_addons (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  type            text not null
                    check (type in ('grooming','vet','transport','insurance')),
  provider_label  text,
  price_sar       integer not null check (price_sar >= 0),
  created_at      timestamptz not null default now()
);
create index booking_addons_booking_id_idx on public.booking_addons(booking_id);


-- ============================================================
-- condition_reports  (CRITICAL — immutable dispute evidence)
-- ============================================================
create table public.condition_reports (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete restrict,
  phase           text not null check (phase in ('check_in', 'check_out')),
  reporter_id     uuid not null references public.profiles(id) on delete restrict,
  weight_note     text,
  health_notes    text,
  behavior_notes  text,
  photos          jsonb not null default '[]'::jsonb,  -- array of storage URLs
  created_at      timestamptz not null default now(),
  unique (booking_id, phase, reporter_id)
);
create index condition_reports_booking_id_idx on public.condition_reports(booking_id);


-- ============================================================
-- daily_updates  (immutable)
-- ============================================================
create table public.daily_updates (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  host_id     uuid not null references public.profiles(id) on delete restrict,
  photos      jsonb not null default '[]'::jsonb,
  video_url   text,
  note_ar     text,
  created_at  timestamptz not null default now()
);
create index daily_updates_booking_id_idx on public.daily_updates(booking_id);


-- ============================================================
-- messages  (immutable — preserves audit trail)
-- ============================================================
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete restrict,
  body        text not null check (length(body) > 0),
  created_at  timestamptz not null default now()
);
create index messages_booking_id_idx on public.messages(booking_id);


-- ============================================================
-- reviews  (one per booking per rater)
-- ============================================================
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete restrict,
  rater_id    uuid not null references public.profiles(id) on delete restrict,
  ratee_id    uuid not null references public.profiles(id) on delete restrict,
  stars       integer not null check (stars between 1 and 5),
  text_ar     text,
  created_at  timestamptz not null default now(),
  unique (booking_id, rater_id)
);
create index reviews_booking_id_idx  on public.reviews(booking_id);
create index reviews_ratee_id_idx    on public.reviews(ratee_id);


-- ============================================================
-- products  (display-only — managed in Supabase dashboard)
-- ============================================================
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  name_ar             text not null,
  seller_name         text not null,
  brand               text,
  price_sar           integer not null check (price_sar >= 0),
  category            text,
  image_url           text,
  is_halal_certified  boolean not null default false,
  created_at          timestamptz not null default now()
);
create index products_category_idx on public.products(category);

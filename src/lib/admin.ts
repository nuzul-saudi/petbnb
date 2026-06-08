// Admin queries and mutations. All callers must be admin — RLS enforces
// this regardless of what the client claims, but we also self-gate the
// admin_list_users() RPC inside the function (raises 42501 for non-admins).

import { supabase } from '@/lib/supabase';
import type { Database, Enums, Tables } from '@/types/database';

export type AdminUser =
  Database['public']['Functions']['admin_list_users']['Returns'][number];

export type AdminListing = Tables<'listings'> & {
  host: Pick<Tables<'profiles'>, 'id' | 'full_name' | 'is_verified' | 'is_suspended'> | null;
  cover_photo: string | null;
};

export type AdminBooking = Tables<'bookings'> & {
  listing: Pick<Tables<'listings'>, 'id' | 'title_ar' | 'neighborhood'> | null;
  owner: Pick<Tables<'profiles'>, 'id' | 'full_name'> | null;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listAllUsers(): Promise<AdminUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

export async function listAllListings(): Promise<AdminListing[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, is_verified, is_suspended),
      listing_photos(photo_url, sort_order)
    `,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const photos = (row.listing_photos ?? []) as { photo_url: string; sort_order: number }[];
    const cover = photos.length
      ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
      : null;
    const { listing_photos: _drop, ...rest } = row as typeof row & {
      listing_photos?: unknown;
    };
    return {
      ...(rest as Tables<'listings'>),
      host: (row.host ?? null) as AdminListing['host'],
      cover_photo: cover,
    };
  });
}

export async function listAllBookings(): Promise<AdminBooking[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      listing:listings(id, title_ar, neighborhood),
      owner:profiles!bookings_owner_id_fkey(id, full_name)
    `,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...(row as Tables<'bookings'>),
    listing: (row.listing ?? null) as AdminBooking['listing'],
    owner: (row.owner ?? null) as AdminBooking['owner'],
  }));
}

export async function getUserById(id: string): Promise<AdminUser | null> {
  const all = await listAllUsers();
  return all.find((u) => u.id === id) ?? null;
}

export async function getListingById(id: string): Promise<AdminListing | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, is_verified, is_suspended),
      listing_photos(photo_url, sort_order)
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const photos = (data.listing_photos ?? []) as { photo_url: string; sort_order: number }[];
  const cover = photos.length
    ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
    : null;
  const { listing_photos: _drop, ...rest } = data as typeof data & {
    listing_photos?: unknown;
  };
  return {
    ...(rest as Tables<'listings'>),
    host: (data.host ?? null) as AdminListing['host'],
    cover_photo: cover,
  };
}

// ---------------------------------------------------------------------------
// Mutations — all rely on the is_admin() RLS bypass added in 0004.
// ---------------------------------------------------------------------------

export async function setUserVerified(id: string, value: boolean): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase
    .from('profiles')
    .update({ is_verified: value })
    .eq('id', id);
  if (error) throw error;
}

export async function setUserSuspended(id: string, value: boolean): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase
    .from('profiles')
    .update({ is_suspended: value })
    .eq('id', id);
  if (error) throw error;
}

export async function setUserRole(
  id: string,
  role: Enums<'user_role'>,
): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export async function setUserName(id: string, full_name: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: full_name.trim() })
    .eq('id', id);
  if (error) throw error;
}

// setListingStatus moved to src/lib/listings.ts in 8d so the
// host-side edit screen can import it without taking an admin
// dependency. Admin callers now import it from there directly.

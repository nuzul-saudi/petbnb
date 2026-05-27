// Pet list/create. Inlined into the booking-request flow for now — the
// dedicated "my pets" management screen is post-MVP.

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export async function listPetsForOwner(ownerId: string): Promise<Tables<'pets'>[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPet(input: {
  ownerId: string;
  name: string;
}): Promise<Tables<'pets'>> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('pets')
    .insert({
      owner_id: input.ownerId,
      name: input.name.trim(),
      species: 'cat',
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to create pet');
  return data;
}

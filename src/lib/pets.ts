// Pet CRUD. Read/list/create existed since Step 5 (inline pet creation in
// the booking flow). Step 5.5 adds the full surface — update + delete +
// the health fields (medical_needs / dietary_restrictions / medications)
// from migration 0006 — so the customer profile's "My Cats" section can
// manage pets outside the booking flow.

import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/types/database';

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

export async function getPet(id: string): Promise<Tables<'pets'> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// All non-required fields are optional so callers (e.g. the inline
// pet-creation in the booking flow) can pass just `{ ownerId, name }` and
// fill in details later via updatePet.
export type CreatePetInput = {
  ownerId: string;
  name: string;
  breed?: string | null;
  age_months?: number | null;
  vaccination_doc_url?: string | null;
  behavioral_notes?: string | null;
  medical_needs?: string | null;
  dietary_restrictions?: string | null;
  medications?: string | null;
  photo_url?: string | null;
};

export async function createPet(input: CreatePetInput): Promise<Tables<'pets'>> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('pets')
    .insert({
      owner_id: input.ownerId,
      name: input.name.trim(),
      species: 'cat',
      breed: input.breed ?? null,
      age_months: input.age_months ?? null,
      vaccination_doc_url: input.vaccination_doc_url ?? null,
      behavioral_notes: input.behavioral_notes ?? null,
      medical_needs: input.medical_needs ?? null,
      dietary_restrictions: input.dietary_restrictions ?? null,
      medications: input.medications ?? null,
      photo_url: input.photo_url ?? null,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to create pet');
  return data;
}

// Caller-friendly patch shape — restricts updates to user-editable fields
// only. owner_id, id, created_at are deliberately not in here; RLS would
// reject them anyway, but typing them out blocks the mistake at the
// callsite.
export type UpdatePetPatch = Pick<
  TablesUpdate<'pets'>,
  | 'name'
  | 'breed'
  | 'age_months'
  | 'vaccination_doc_url'
  | 'behavioral_notes'
  | 'medical_needs'
  | 'dietary_restrictions'
  | 'medications'
  | 'photo_url'
>;

export async function updatePet(
  id: string,
  patch: UpdatePetPatch,
): Promise<Tables<'pets'>> {
  if (!supabase) throw new Error('No Supabase client');
  // Normalize name if present so we never write a row with leading/
  // trailing whitespace.
  const safe: UpdatePetPatch =
    typeof patch.name === 'string'
      ? { ...patch, name: patch.name.trim() }
      : patch;
  const { data, error } = await supabase
    .from('pets')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to update pet');
  return data;
}

export async function deletePet(id: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
}

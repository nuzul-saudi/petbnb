// Helpers for the host-signup flow (0039).
//
// submitHostApplication() — called from /become-host/application.
//   Flips the caller's profile from the implicit 'owner' default
//   (set by handle_new_user trigger) to role='host', writes the
//   form fields, and sets host_application_status='pending'.
//
// listPendingHostApplications() — admin only. Lists applications
//   that need review.
//
// approveHostApplication() / rejectHostApplication() — admin only.
//   Flip status to approved/rejected, stamp reviewer + timestamp.
//
// markHostProfileComplete() — called by the host after the
//   post-approval profile-completion step.

import { supabase } from '@/lib/supabase';
import type { Enums, Tables } from '@/types/database';

export type HostApplicationInput = {
  fullName: string;
  gender: Enums<'host_gender'>;
  city: string;
  neighborhood: string;
  petTypeAccepted: Enums<'host_pet_type_accepted'>;
  experienceYears: number | null;
};

export type HostApplicationRow = Pick<
  Tables<'profiles'>,
  | 'id'
  | 'full_name'
  | 'host_application_status'
  | 'host_application_submitted_at'
  | 'host_application_reviewed_at'
  | 'host_application_admin_notes'
  | 'host_gender'
  | 'host_city'
  | 'host_neighborhood'
  | 'host_pet_type_accepted'
  | 'host_experience_years'
  | 'host_bio_ar'
  | 'host_profile_complete'
  | 'is_verified'
  | 'is_suspended'
  | 'avatar_url'
>;

/**
 * Persist a new host application for the calling user. Sets role='host'
 * and host_application_status='pending'. The form is responsible for
 * validating non-null fields before calling this. RLS lets the user
 * update their own profile row.
 */
export async function submitHostApplication(
  userId: string,
  input: HostApplicationInput,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName.trim(),
      role: 'host',
      host_application_status: 'pending',
      host_application_submitted_at: new Date().toISOString(),
      host_gender: input.gender,
      host_city: input.city,
      host_neighborhood: input.neighborhood,
      host_pet_type_accepted: input.petTypeAccepted,
      host_experience_years: input.experienceYears,
    })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Admin: list every applicant whose status is 'pending'. RLS lets
 * admins read all rows; non-admins won't be able to call this
 * meaningfully (it'll just return their own row if it's pending).
 */
export async function listPendingHostApplications(): Promise<
  HostApplicationRow[]
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, host_application_status, host_application_submitted_at, host_application_reviewed_at, host_application_admin_notes, host_gender, host_city, host_neighborhood, host_pet_type_accepted, host_experience_years, host_bio_ar, host_profile_complete, is_verified, is_suspended, avatar_url',
    )
    .eq('host_application_status', 'pending')
    .order('host_application_submitted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HostApplicationRow[];
}

/** Admin: approve an application. Sets is_verified=true as well. */
export async function approveHostApplication(
  applicantId: string,
  reviewerId: string,
  notes?: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('profiles')
    .update({
      host_application_status: 'approved',
      host_application_reviewed_at: new Date().toISOString(),
      host_application_reviewer_id: reviewerId,
      host_application_admin_notes: notes ?? null,
      is_verified: true,
    })
    .eq('id', applicantId);
  if (error) throw error;
}

/** Admin: reject an application. Caller-supplied notes recommended. */
export async function rejectHostApplication(
  applicantId: string,
  reviewerId: string,
  notes: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('profiles')
    .update({
      host_application_status: 'rejected',
      host_application_reviewed_at: new Date().toISOString(),
      host_application_reviewer_id: reviewerId,
      host_application_admin_notes: notes,
      is_verified: false,
    })
    .eq('id', applicantId);
  if (error) throw error;
}

/**
 * Mark the post-approval profile-completion step done. Listing
 * creation RLS (0039) checks host_profile_complete=true; without
 * this flip, INSERTs on listings are denied even after admin
 * approval.
 */
export async function markHostProfileComplete(
  userId: string,
  bio: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('profiles')
    .update({
      host_bio_ar: bio.trim(),
      host_profile_complete: true,
    })
    .eq('id', userId);
  if (error) throw error;
}

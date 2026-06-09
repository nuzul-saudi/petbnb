// Admin queries and mutations. All callers must be admin — RLS enforces
// this regardless of what the client claims, but we also self-gate the
// admin_list_users() RPC inside the function (raises 42501 for non-admins).

import {
  cleanupOrphanListingPhotos,
  discardListingDraft as sharedDiscardListingDraft,
  setListingStatus,
  type ListingStatus,
} from '@/lib/listings';
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
// setListingActive (the older boolean toggle) was retired in 8b
// when reads/writes moved to the status column.

// ---------------------------------------------------------------------------
// 8g — review queue + draft promote/reject + admin override actions.
// ---------------------------------------------------------------------------

export type AdminReviewType = 'new_listing' | 'pending_edit';

export type AdminReview = AdminListing & {
  reviewType: AdminReviewType;
  /**
   * ISO timestamp the queue sorts by:
   *   - new_listing → listings.created_at
   *   - pending_edit → max(listing_drafts.updated_at, max(listing_photo_drafts.created_at))
   */
  reviewedAt: string;
  hasFieldDraft: boolean;
  hasPhotoDraft: boolean;
};

/**
 * Unified review queue. Returns ALL items needing admin attention:
 *
 *   - new_listing: status='pending' AND no drafts. Brand-new listings
 *     awaiting first approval.
 *
 *   - pending_edit: status IN ('approved','paused','admin_disabled')
 *     AND (listing_drafts row exists OR listing_photo_drafts rows
 *     exist). Hosts editing their listings — INCLUDING edits to an
 *     admin_disabled listing (host is trying to fix what got them
 *     taken offline; admin should see those too).
 *
 * Items NOT in the queue: approved/paused/admin_disabled with no
 * drafts (no work to do), and pending with drafts (shouldn't exist —
 * drafts only created on approved/paused via 8d/8e).
 *
 * Sorted by reviewedAt DESC (most recent first). RLS lets admin
 * see all listings + all drafts via the is_admin() bypass on the
 * SELECT policies of all four tables.
 */
export async function listPendingReviews(): Promise<AdminReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, is_verified, is_suspended),
      listing_photos(photo_url, sort_order),
      listing_drafts(updated_at),
      listing_photo_drafts(created_at)
    `,
    );
  if (error) throw error;

  const reviews: AdminReview[] = [];

  for (const row of data ?? []) {
    const fieldDraft = (row.listing_drafts ?? null) as
      | { updated_at: string }
      | null;
    const photoDrafts = (row.listing_photo_drafts ?? []) as {
      created_at: string;
    }[];
    const hasFieldDraft = fieldDraft !== null;
    const hasPhotoDraft = photoDrafts.length > 0;

    let reviewType: AdminReviewType | null = null;
    let reviewedAt: string | null = null;

    if (row.status === 'pending' && !hasFieldDraft && !hasPhotoDraft) {
      reviewType = 'new_listing';
      reviewedAt = row.created_at;
    } else if (
      (row.status === 'approved' ||
        row.status === 'paused' ||
        row.status === 'admin_disabled') &&
      (hasFieldDraft || hasPhotoDraft)
    ) {
      reviewType = 'pending_edit';
      const photoMax = photoDrafts.length
        ? photoDrafts
            .map((p) => p.created_at)
            .reduce((a, b) => (a > b ? a : b))
        : null;
      if (fieldDraft && photoMax) {
        reviewedAt =
          fieldDraft.updated_at > photoMax ? fieldDraft.updated_at : photoMax;
      } else if (fieldDraft) {
        reviewedAt = fieldDraft.updated_at;
      } else if (photoMax) {
        reviewedAt = photoMax;
      }
    }

    if (reviewType === null || reviewedAt === null) continue;

    const photos = (row.listing_photos ?? []) as {
      photo_url: string;
      sort_order: number;
    }[];
    const cover = photos.length
      ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
      : null;

    const {
      listing_photos: _p1,
      listing_drafts: _p2,
      listing_photo_drafts: _p3,
      ...rest
    } = row as typeof row & {
      listing_photos?: unknown;
      listing_drafts?: unknown;
      listing_photo_drafts?: unknown;
    };

    reviews.push({
      ...(rest as Tables<'listings'>),
      host: (row.host ?? null) as AdminListing['host'],
      cover_photo: cover,
      reviewType,
      reviewedAt,
      hasFieldDraft,
      hasPhotoDraft,
    });
  }

  reviews.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  return reviews;
}

export type AdminListingPhoto = {
  id: string;
  photo_url: string;
  sort_order: number;
};

export type AdminReviewDetail = {
  /** The live listings row + host + cover. */
  listing: AdminListing;
  /**
   * Classification for the detail UI:
   *   - new_listing: brand-new pending, no drafts.
   *   - pending_edit: any status with at least one draft type.
   *   - none: live state (approved/paused/admin_disabled) with no
   *     drafts. Admin can still take override actions from this view.
   */
  reviewType: AdminReviewType | 'none';
  hasFieldDraft: boolean;
  hasPhotoDraft: boolean;
  /**
   * Draft field values when a field draft exists, else null. Admin
   * detail screen shows these on the pending_edit path; on
   * new_listing or none it reads the live fields off `listing`.
   */
  draftFields: Tables<'listing_drafts'> | null;
  /**
   * Photos to display:
   *   - pending_edit + hasPhotoDraft → draft photos.
   *   - everything else → live photos.
   * Sorted by sort_order.
   */
  photos: AdminListingPhoto[];
};

/**
 * Fetch a single listing for the admin detail screen. Works for any
 * listing (queue items + non-queue) — the classification drives the
 * UI but the read shape is unconditional.
 */
export async function getAdminListingReview(
  id: string,
): Promise<AdminReviewDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('listings')
    .select(
      `
      *,
      host:profiles(id, full_name, is_verified, is_suspended),
      listing_photos(id, photo_url, sort_order),
      listing_drafts(*),
      listing_photo_drafts(id, photo_url, sort_order)
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const fieldDraft = (data.listing_drafts ?? null) as
    | Tables<'listing_drafts'>
    | null;
  const livePhotos = (data.listing_photos ?? []) as AdminListingPhoto[];
  const draftPhotos = (data.listing_photo_drafts ?? []) as AdminListingPhoto[];
  const hasFieldDraft = fieldDraft !== null;
  const hasPhotoDraft = draftPhotos.length > 0;

  let reviewType: AdminReviewType | 'none';
  if (data.status === 'pending' && !hasFieldDraft && !hasPhotoDraft) {
    reviewType = 'new_listing';
  } else if (
    (data.status === 'approved' ||
      data.status === 'paused' ||
      data.status === 'admin_disabled') &&
    (hasFieldDraft || hasPhotoDraft)
  ) {
    reviewType = 'pending_edit';
  } else {
    reviewType = 'none';
  }

  const sourcePhotos =
    reviewType === 'pending_edit' && hasPhotoDraft ? draftPhotos : livePhotos;
  const photos = [...sourcePhotos].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  const cover = livePhotos.length
    ? [...livePhotos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
    : null;
  const {
    listing_photos: _p1,
    listing_drafts: _p2,
    listing_photo_drafts: _p3,
    ...rest
  } = data as typeof data & {
    listing_photos?: unknown;
    listing_drafts?: unknown;
    listing_photo_drafts?: unknown;
  };

  return {
    listing: {
      ...(rest as Tables<'listings'>),
      host: (data.host ?? null) as AdminListing['host'],
      cover_photo: cover,
    },
    reviewType,
    hasFieldDraft,
    hasPhotoDraft,
    draftFields: fieldDraft,
    photos,
  };
}

/**
 * Approve a brand-new pending listing. For type='new_listing' only.
 * Just flips status='approved'; the bridge trigger keeps is_active
 * in sync until 8i drops the legacy column.
 */
export async function approveNewListing(id: string): Promise<void> {
  await setListingStatus(id, 'approved');
}

/**
 * Reject a brand-new pending listing. Sets status='admin_disabled' —
 * the host cannot republish from this state, only admin can Restore.
 * Distinct from rejecting an EDIT (rejectListingDraft just discards
 * the draft and leaves the live listing untouched). Nothing live to
 * preserve for a new_listing reject; the listing itself is the thing
 * being rejected.
 */
export async function rejectNewListing(id: string): Promise<void> {
  await setListingStatus(id, 'admin_disabled');
}

/**
 * Promote a pending edit (the 8f promote_listing_draft RPC). Atomic
 * server-side: copies any field draft onto live, swaps photos if a
 * photo draft exists, sets status='approved' (regardless of prior
 * status — paused or admin_disabled both come back live, per locked
 * decision). Returns the orphaned URLs; cleanupOrphanListingPhotos
 * removes the corresponding storage objects best-effort.
 */
export async function promoteListingDraft(id: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase.rpc('promote_listing_draft', {
    p_listing_id: id,
  });
  if (error) throw error;
  await cleanupOrphanListingPhotos(data ?? null);
}

/**
 * Reject (discard) a pending edit. Wraps the shared discard helper
 * in listings.ts, which calls the 8f discard_listing_draft RPC and
 * cleans up safe-to-remove storage objects. Same callable shape
 * whether admin or host invokes it; the RPC handles the auth split
 * internally.
 */
export async function rejectListingDraft(id: string): Promise<void> {
  await sharedDiscardListingDraft(id);
}

// ---- Admin override actions on the listing itself ---------------------

/**
 * Admin takes an approved listing offline. Sets status='admin_disabled'
 * (NOT 'paused' — paused means host-controlled). The host cannot
 * reactivate from admin_disabled; only admin can lift this state via
 * adminRestoreListing.
 */
export async function adminTakeOffline(id: string): Promise<void> {
  await setListingStatus(id, 'admin_disabled');
}

/**
 * Admin restores an admin_disabled listing to approved (live).
 */
export async function adminRestoreListing(id: string): Promise<void> {
  await setListingStatus(id, 'approved');
}

// Re-export ListingStatus for admin UI imports that already pull from
// '@/lib/admin'. Saves one import line at the call site.
export type { ListingStatus };

// Notifications — client read/write helpers (Phase 2a, migration 0047).
//
// Rows are INSERTED only by the DB source-event triggers (0047 §5); the
// client never creates them. Here we only read the caller's own rows
// (RLS scopes to self), count the unread, and mark read (a forward-only
// UPDATE the guard trigger enforces). The email channel (2b) is separate.
//
// Every call is defensive: no supabase client or an error resolves to an
// empty/zero result rather than throwing into the UI (except the two
// mutations, which surface errors so the caller can log them).

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type AppNotification = Tables<'notifications'>;
export type NotificationType = AppNotification['type'];

// Per-type glyph for the list. The app is otherwise emoji-light, but a
// notifications list reads faster with a quick type cue on each row.
export const NOTIFICATION_GLYPH: Record<NotificationType, string> = {
  booking_requested: '📩',
  booking_accepted: '✅',
  booking_declined: '🚫',
  booking_cancelled: '🚫',
  message_received: '💬',
  host_application_approved: '🎉',
  host_application_rejected: 'ℹ️',
};

/** Newest-first list of the caller's notifications (RLS scopes to self). */
export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

/** Count of the caller's unread notifications (0 on error / no client). */
export async function countUnreadNotifications(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Mark one notification read. The `is('read_at', null)` filter makes this
 * a no-op on an already-read row, so we never send a backward/equal
 * read_at that the forward-only guard would reject.
 */
export async function markNotificationRead(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
}

/**
 * Mark every unread notification that deep-links to the given path(s)
 * read. Visiting a target consumes ALL of its alerts — there's
 * deliberately NO type filter, so a host opening /bookings/<id> clears
 * its booking_requested AND any message_received for that thread at
 * once. RLS scopes to the caller; the is-null filter keeps the
 * forward-only guard happy (already-read rows are skipped).
 *
 * SCOPE-MIRRORING RULE: this function's coverage must MIRROR
 * markThreadRead's coverage at every call site — the 0047 R2 dedupe
 * keys off unread rows, so any surface that consumes messages must
 * consume their alerts (e.g. the inquiry timeline also sweeps its
 * linked bookings' paths).
 */
export async function markThreadNotificationsRead(
  linkPaths: string | string[],
): Promise<void> {
  if (!supabase) return;
  const paths = Array.isArray(linkPaths) ? linkPaths : [linkPaths];
  if (paths.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('link_path', paths)
    .is('read_at', null);
  if (error) throw error;
}

/** Mark every unread notification for the caller read (SECURITY DEFINER RPC). */
export async function markAllNotificationsRead(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}

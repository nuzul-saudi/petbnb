// In-app messaging (Step 9, reclassified as launch blocker in Round 5).
//
// Schema + RLS have existed since migration 0001 (public.messages,
// immutable by RLS default-deny). 0002 added the participant policies;
// 0004 refreshed them to gate on is_active_user(). Round 5 adds the
// app code that has been missing the entire time.
//
// Scope (5a — data layer):
//   listMessages(bookingId) — chronological fetch, embeds sender.
//   sendMessage(bookingId, body) — insert one message as auth.uid().
//   containsContactInfo(body) — soft regex nudge for the anti-leakage
//     compose prompt. NOT a block, NOT enforced server-side.
//
// Out of scope today: realtime subscriptions. Round 5b's chat UI uses
// useFocusEffect refetch as the MVP behavior — the trade-off is
// documented in batch-decisions.

import { logWarn } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

/** Sender summary embedded into Message — same shape as the listing
 *  HostSummary and the BookingOwnerSummary from src/lib/bookings.ts. */
export type MessageSender = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'full_name_en' | 'avatar_url'
>;

export type Message = Tables<'messages'> & {
  sender: MessageSender | null;
};

/**
 * 2026-06-29 — slim shape for inbox-row "(last message)" previews.
 * Just enough columns to render the preview line + decide between
 * the body / "(deleted)" / "(no messages)" branches. Used by the
 * /bookings and /inquiries inbox list helpers via a PostgREST
 * nested embed with limit 1, order created_at desc.
 */
export type MessagePreview = Pick<
  Tables<'messages'>,
  'id' | 'body' | 'deleted_at' | 'created_at'
>;

export async function listMessages(bookingId: string): Promise<Message[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('messages')
    .select(
      // Same FK-alias pattern Round 4 used for getBooking. messages.sender_id
      // REFERENCES profiles(id) since 0001, so the auto-generated FK name
      // 'messages_sender_id_fkey' resolves the join.
      `
      *,
      sender:profiles!messages_sender_id_fkey(id, full_name, full_name_en, avatar_url)
    `,
    )
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Message[]).map((row) => ({
    ...row,
    sender: row.sender ?? null,
  }));
}

export async function sendMessage(
  bookingId: string,
  body: string,
): Promise<Message> {
  if (!supabase) throw new Error('No Supabase client');
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Empty message');

  const { data: authData } = await supabase.auth.getUser();
  const senderId = authData.user?.id;
  if (!senderId) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      booking_id: bookingId,
      sender_id: senderId,
      body: trimmed,
    })
    .select(
      `
      *,
      sender:profiles!messages_sender_id_fkey(id, full_name, full_name_en, avatar_url)
    `,
    )
    .single();
  if (error || !data) throw error ?? new Error('Failed to send message');
  return data as unknown as Message;
}

// ---------------------------------------------------------------------------
// containsContactInfo — soft anti-leakage nudge for the compose form.
//
// Saudi phone formats are written in many ways:
//   +966 5X XXX XXXX (E.164)
//   00966 5X XXX XXXX (older international)
//   05X XXXX XXX (local 10-digit)
//   05X-XXX-XXXX (hyphenated)
// AND in Arabic-Indic digits (٠-٩ = U+0660-U+0669) as well as Latin.
//
// Also catches the common contact-handle keywords:
//   WhatsApp / واتساب / واتس
//   Telegram / تليجرام / تلجرام
//   Snapchat / سناب شات / سناب
//   Email-like patterns
//
// Returns true if any of these patterns match. The UI shows a confirm
// dialog ("looks like contact info; for protection, keep conversations
// here — send anyway?"). Soft nudge — sending is still allowed.
// ---------------------------------------------------------------------------

// Saudi phone: leading + / 00 / 0 then a Saudi prefix and the rest of
// the digits. Accepts Arabic-Indic digits via the [0-9٠-٩]
// class. Mobile prefixes start with 5; landline with non-5 digit.
const PHONE_RE =
  /(?:\+|00)?(?:[9٩][6٦][6٦])?\s*[0٠][5٥][\s\-]?[0-9٠-٩]{3}[\s\-]?[0-9٠-٩]{4}/u;

// Loose generic phone: 7+ consecutive digits (Arabic or Latin), often
// catches partial / chunked numbers the strict regex would miss.
const LOOSE_DIGITS_RE = /[0-9٠-٩][\s\-]?[0-9٠-٩][\s\-]?[0-9٠-٩][\s\-]?[0-9٠-٩][\s\-]?[0-9٠-٩][\s\-]?[0-9٠-٩][\s\-]?[0-9٠-٩]/u;

// Contact-handle keywords (case-insensitive). Arabic transliterations
// in both common spellings.
const KEYWORDS_RE =
  /\b(?:whatsapp|wa\.me|telegram|t\.me|snapchat|snap|instagram|insta|email|gmail|hotmail|outlook)\b/iu;
const ARABIC_KEYWORDS_RE = /(?:واتساب|واتس|تليجرام|تلجرام|تيليجرام|سناب|سناب\s*شات|انستا|انستقرام|ايميل|البريد)/u;

// Email shape.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u;

export function containsContactInfo(body: string): boolean {
  if (!body) return false;
  // Order matters: keywords are cheapest, phones most expensive.
  if (KEYWORDS_RE.test(body)) return true;
  if (ARABIC_KEYWORDS_RE.test(body)) return true;
  if (EMAIL_RE.test(body)) return true;
  if (PHONE_RE.test(body)) return true;
  // Last-line defense: 7+ consecutive digits with optional separators.
  // Catches partial / spaced-out numbers the strict regex misses.
  if (LOOSE_DIGITS_RE.test(body)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Best-effort logger for the rare case where a send fails server-side
// after the UI has already rendered the optimistic state. Surfaces in
// the dev console only; production stays silent.
// ---------------------------------------------------------------------------
export function logMessageSendFailure(e: unknown): void {
  logWarn('[messages.send_failed]', e);
}

// ---------------------------------------------------------------------------
// Phase 1 (2026-06-28) — message deletion + thread read marking.
//
// All gating lives in the DB (0044):
//   * messages_update_own_until_read RLS policy
//   * guard_message_update trigger (column immutability + transitions)
//   * mark_thread_read SECURITY DEFINER RPC
// The helpers below are thin wrappers; no app-side validation.
// ---------------------------------------------------------------------------

/**
 * Soft-delete an own message. RLS + the guard trigger enforce ALL of:
 *   - sender_id = auth.uid()  (other party's messages can't be deleted)
 *   - is_active_user()        (suspended accounts can't retract)
 *   - deleted_at is null      (already-deleted rows filtered out)
 *   - other party has NOT read the message yet (per-thread last_opened_at
 *     check; see messages_update_own_until_read in 0044)
 *
 * Inherent read/delete race (security review accepted): if the other party
 * reads the message between this client's last refetch and this UPDATE,
 * RLS filters the row out and supabase-js returns success with 0 rows —
 * NOT an error. We surface that as `false` so the UI can show the
 * "already read, can't delete" ack.
 */
export async function deleteMessage(messageId: string): Promise<boolean> {
  if (!supabase) throw new Error('No Supabase client');
  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null })
    .eq('id', messageId)
    .select('id')
    .maybeSingle();
  if (error) throw error; // unexpected (trigger violation)
  return data != null; // false = RLS filtered → BLOCKED (already read / not own)
}

/**
 * Mark the current authenticated user's last_opened_at on the named
 * thread to now(). Backs the WhatsApp blue-tick semantics: one open-event
 * marks every prior message in the thread as read by this user.
 *
 * Errors are swallowed (logged only) — failing to mark-read should never
 * block the screen render. The next thread open will try again.
 *
 * The RPC is SECURITY DEFINER with pinned search_path; participation is
 * validated server-side (raises 42501 if the caller isn't a participant).
 */
export async function markThreadRead(
  kind: 'booking' | 'inquiry',
  threadId: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('mark_thread_read', {
    p_thread_kind: kind,
    p_thread_id: threadId,
  });
  if (error) logWarn('[messages.mark_read_failed]', error);
}

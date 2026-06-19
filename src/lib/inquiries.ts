// Pre-booking inquiry threads (Round 5b / Step 9.5).
//
// Schema + RLS in migration 0040. This is the app-side data layer.
// UI lives in src/app/listings/[id]/index.tsx (the "Message host"
// CTA), src/app/inquiries/[id].tsx (the compose route), and
// src/app/inquiries/index.tsx (the inbox).
//
// ─────────────────────────────────────────────────────────────
// CRITICAL — partial-unique discipline
// ─────────────────────────────────────────────────────────────
// inquiries has a PARTIAL unique index
// `inquiries_one_open_per_pair (listing_id, starter_id) WHERE status = 'open'`
// (0040). This blocks duplicate OPEN threads but ALLOWS a fresh
// thread to start after a previous one converts or closes.
//
// We do NOT use `ON CONFLICT (listing_id, starter_id)` — that
// targets a total unique constraint we deliberately did not create.
// The supported targeting `(listing_id, starter_id) WHERE status =
// 'open'` works only on PostgreSQL clients that pass partial-index
// predicates; the supabase-js / PostgREST chain doesn't expose
// that.
//
// So `openInquiry` follows a SELECT-then-INSERT discipline:
//   1. SELECT the open thread for (listing, starter). If found,
//      return it (idempotent re-tap).
//   2. Otherwise INSERT. The partial index makes the INSERT race-
//      safe: if a concurrent tap landed first, our INSERT raises
//      23505 (unique_violation). On 23505 we re-SELECT and return
//      the row the other tap created.
//
// containsContactInfo() — reused unchanged from messages.ts. Soft-
// nudge confirm-and-send applies to EVERY send including the
// opening message; pre-booking is the highest-risk commission-leak
// surface (CLAUDE.md §11), so the regex MUST run before the first
// message reaches the host.

import { logWarn } from '@/lib/log';
import { containsContactInfo } from '@/lib/messages';
import type { Message } from '@/lib/messages';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

/** Participant summary — same shape as MessageSender + the listing
 *  HostSummary. Used to render avatars/names on inquiry rows. */
export type InquiryParticipant = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'full_name_en' | 'avatar_url'
>;

/** Listing summary embedded into inquiry rows — only what the
 *  inbox actually renders. */
export type InquiryListingSummary = Pick<
  Tables<'listings'>,
  'id' | 'title_ar' | 'title_en' | 'city' | 'neighborhood'
>;

/** Bare inquiry row from the table. */
export type Inquiry = Tables<'inquiries'>;

/** Inbox row — inquiry + the OTHER participant + the listing.
 *  Caller picks which side they are; we always embed both so the
 *  same shape works for owner-side (looking at hosts) and host-
 *  side (looking at starters) lists. */
export type InquiryListItem = Inquiry & {
  starter: InquiryParticipant | null;
  host: InquiryParticipant | null;
  listing: InquiryListingSummary | null;
};

/** Detail row — same embed shape as InquiryListItem. The detail
 *  screen uses it to render the header (other party + listing
 *  context); messages are fetched separately via listInquiryMessages. */
export type InquiryDetail = InquiryListItem;

const INQUIRY_SELECT = `
  *,
  starter:profiles!inquiries_starter_id_fkey(id, full_name, full_name_en, avatar_url),
  host:profiles!inquiries_host_id_fkey(id, full_name, full_name_en, avatar_url),
  listing:listings!inquiries_listing_id_fkey(id, title_ar, title_en, city, neighborhood)
`;

// ---------------------------------------------------------------------------
// Find / open
// ---------------------------------------------------------------------------

/** Find the open inquiry for this (listing, starter) pair, if any.
 *  Returns null when there is no open thread (either none ever
 *  existed, or the previous one converted/closed). The partial
 *  unique index guarantees at most one row matches. */
export async function findOpenInquiry(
  listingId: string,
  starterId: string,
): Promise<Inquiry | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .eq('listing_id', listingId)
    .eq('starter_id', starterId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Open the inquiry thread or return the existing one.
 *
 *  Follows the SELECT-then-INSERT discipline mandated by the
 *  partial unique index `inquiries_one_open_per_pair` (0040). Do
 *  NOT replace with blind ON CONFLICT — see this file's header
 *  comment.
 *
 *  Race handling: if a concurrent double-tap inserts the row
 *  between our SELECT and our INSERT, our INSERT raises 23505
 *  (unique_violation). We catch that and re-SELECT to return the
 *  row the other tap won with — the result is idempotent from the
 *  caller's perspective.
 *
 *  RLS enforces starter_id = auth.uid() + verified+approved listing
 *  visibility + non-suspended host + starter <> host. The caller
 *  passes hostId as the snapshot; the RLS CHECK clause cross-
 *  validates against the listing row.
 */
export async function openInquiry(
  listingId: string,
  hostId: string,
): Promise<Inquiry> {
  if (!supabase) throw new Error('No Supabase client');

  const { data: authData } = await supabase.auth.getUser();
  const starterId = authData.user?.id;
  if (!starterId) throw new Error('Not signed in');

  // Step 1 — SELECT first. The partial index makes "open thread for
  // this pair" the only thing the index can resolve, so this is
  // the only place a duplicate-tap collision can happen.
  const existing = await findOpenInquiry(listingId, starterId);
  if (existing) return existing;

  // Step 2 — INSERT. status defaults to 'open' (table default), but
  // we set it explicitly so the call site reads unambiguously.
  const { data, error } = await supabase
    .from('inquiries')
    .insert({
      listing_id: listingId,
      starter_id: starterId,
      host_id: hostId,
      status: 'open',
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = unique_violation. The only unique on inquiries is the
    // partial `inquiries_one_open_per_pair`, so this can ONLY mean
    // a concurrent tap inserted the open thread between our SELECT
    // and our INSERT. Re-SELECT and return the winning row.
    if (isUniqueViolation(error)) {
      const race = await findOpenInquiry(listingId, starterId);
      if (race) return race;
      // If we got here, the unique violation came from somewhere
      // unexpected (or the winning row was deleted before our
      // SELECT). Fall through to throwing the original error.
    }
    logWarn('[inquiries.open_failed]', error);
    throw error;
  }
  if (!data) throw new Error('Failed to open inquiry');
  return data as Inquiry;
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** Inquiries this user opened as a starter, newest-message-first.
 *  Used for the owner-side inbox view. RLS filters to starter =
 *  auth.uid() anyway; the WHERE here makes the index-only path
 *  cheap on the (starter_id, last_message_at DESC) index. */
export async function listMyInquiriesAsStarter(
  userId: string,
): Promise<InquiryListItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_SELECT)
    .eq('starter_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as InquiryListItem[]).map(normalizeListItem);
}

/** Inquiries OPENED AGAINST this host's listings, newest-message-
 *  first. Used for the host-side inbox view. Same index economy
 *  as the starter side (the inquiries_host_id_last_msg_idx). */
export async function listMyInquiriesAsHost(
  userId: string,
): Promise<InquiryListItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_SELECT)
    .eq('host_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as InquiryListItem[]).map(normalizeListItem);
}

function normalizeListItem(row: InquiryListItem): InquiryListItem {
  return {
    ...row,
    starter: row.starter ?? null,
    host: row.host ?? null,
    listing: row.listing ?? null,
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/** One inquiry with the same embed shape as the inbox rows. RLS
 *  ensures the caller can only read inquiries they participate in
 *  (or admin). */
export async function getInquiry(
  inquiryId: string,
): Promise<InquiryDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_SELECT)
    .eq('id', inquiryId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalizeListItem(data as unknown as InquiryListItem);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Inquiry-scoped messages, chronological. Mirrors listMessages
 *  byte-identically except for the FK column. RLS gates SELECT
 *  participants per the 0040 messages_select_participants policy
 *  inquiry branch. */
export async function listInquiryMessages(
  inquiryId: string,
): Promise<Message[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('messages')
    .select(
      `
      *,
      sender:profiles!messages_sender_id_fkey(id, full_name, full_name_en, avatar_url)
    `,
    )
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Message[]).map((row) => ({
    ...row,
    sender: row.sender ?? null,
  }));
}

/** Send a message into the inquiry thread. Mirrors sendMessage
 *  byte-identically except the FK column.
 *
 *  IMPORTANT: this helper does NOT run containsContactInfo() —
 *  per the established booking-thread pattern, the SOFT NUDGE
 *  is enforced by the UI compose surface before this is called.
 *  The compose layer for inquiries MUST run containsContactInfo()
 *  on every body (including the first/opening message) per
 *  CLAUDE.md §11 — pre-booking is the highest-risk commission-
 *  leak surface. See the call site in /inquiries/[id].
 *
 *  Server-side RLS additionally enforces:
 *   - status = 'open' (no sends on converted/closed)
 *   - is_active_user() (suspended users blocked)
 *   - sender = auth.uid()
 *   - participant predicate via the inquiry join */
export async function sendInquiryMessage(
  inquiryId: string,
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
      inquiry_id: inquiryId,
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
// Close (archive)
// ---------------------------------------------------------------------------

/** Close (archive) an inquiry thread. Relies on the 0040
 *  guard_inquiry_update trigger to enforce the transition:
 *  open → closed allowed; closed → anything else raises. The
 *  inquiries_update_participants policy gates WHO can close
 *  (either participant or admin). */
export async function closeInquiry(inquiryId: string): Promise<void> {
  if (!supabase) throw new Error('No Supabase client');
  const { error } = await supabase
    .from('inquiries')
    .update({ status: 'closed' })
    .eq('id', inquiryId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Re-export the anti-leakage check so call sites can import from
// one module. Keeps the regex source of truth in messages.ts; this
// file's "uses it identically" contract is documented by the
// re-export.
// ---------------------------------------------------------------------------
export { containsContactInfo };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** PostgrestError surfacing — checks for unique_violation. supabase-js
 *  exposes the Postgres SQLSTATE on the `code` field of its error
 *  shape; 23505 is unique_violation. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // The PostgrestError type carries code/message/details/hint.
  const code = (err as { code?: string }).code;
  return code === '23505';
}

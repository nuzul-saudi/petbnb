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

import { track } from '@/lib/analytics';
import { logWarn } from '@/lib/log';
import { containsContactInfo } from '@/lib/messages';
import type { Message, MessagePreview } from '@/lib/messages';
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
 *  side (looking at starters) lists.
 *
 *  2026-06-29 — `latest_message` added for the inbox-preview line.
 *  PostgREST nested embed; null when the thread has no messages,
 *  otherwise the most recent one (limit 1, order created_at desc).
 *  Renderer branches on body / deleted_at to pick the preview
 *  string. */
export type InquiryListItem = Inquiry & {
  starter: InquiryParticipant | null;
  host: InquiryParticipant | null;
  listing: InquiryListingSummary | null;
  latest_message: MessagePreview | null;
};

/** Detail row — same embed shape as InquiryListItem. The detail
 *  screen uses it to render the header (other party + listing
 *  context); messages are fetched separately via listInquiryMessages. */
export type InquiryDetail = InquiryListItem;

const INQUIRY_SELECT = `
  *,
  starter:profiles!inquiries_starter_id_fkey(id, full_name, full_name_en, avatar_url),
  host:profiles!inquiries_host_id_fkey(id, full_name, full_name_en, avatar_url),
  listing:listings!inquiries_listing_id_fkey(id, title_ar, title_en, city, neighborhood),
  latest_message:messages(id, body, deleted_at, created_at)
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
  if (existing) {
    track('inquiry_opened', { inquiryId: existing.id, listingId });
    return existing;
  }

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
  const created = data as Inquiry;
  track('inquiry_opened', { inquiryId: created.id, listingId });
  return created;
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
    // 2026-06-29 — limit the nested latest_message embed to one
    // row, newest first, per inquiry. Without these foreignTable
    // ordering hints PostgREST returns ALL messages embedded under
    // each inquiry. RLS already scopes messages to participants so
    // the embed only surfaces messages this user can read.
    .order('created_at', { ascending: false, foreignTable: 'latest_message' })
    .limit(1, { foreignTable: 'latest_message' })
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
    .order('created_at', { ascending: false, foreignTable: 'latest_message' })
    .limit(1, { foreignTable: 'latest_message' })
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as InquiryListItem[]).map(normalizeListItem);
}

function normalizeListItem(row: InquiryListItem): InquiryListItem {
  // 2026-06-29 — PostgREST returns the nested embed as an array
  // (because the FK is messages.inquiry_id, a one-to-many). We
  // capped it at limit:1 so the array is at most one element.
  // Collapse to a single MessagePreview | null for the renderer's
  // benefit so the row code is `item.latest_message?.deleted_at`
  // not `item.latest_message[0]?.deleted_at`.
  const rawLatest = (row as InquiryListItem & {
    latest_message?: MessagePreview | MessagePreview[] | null;
  }).latest_message;
  const latest_message: MessagePreview | null = Array.isArray(rawLatest)
    ? (rawLatest[0] ?? null)
    : (rawLatest ?? null);
  return {
    ...row,
    starter: row.starter ?? null,
    host: row.host ?? null,
    listing: row.listing ?? null,
    latest_message,
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
    // 2026-06-29 — same limit:1 on the nested latest_message embed
    // as the list helpers. Detail screen doesn't render the preview
    // line but normalizeListItem still consumes the field, so the
    // shape stays consistent for any caller.
    .order('created_at', { ascending: false, foreignTable: 'latest_message' })
    .limit(1, { foreignTable: 'latest_message' })
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
  track('message_sent', { thread: 'inquiry', inquiryId });
  return data as unknown as Message;
}

// ---------------------------------------------------------------------------
// Meet & greet (Phase 4 / 0050) — inquiry-scoped lifecycle messages.
//
// The owner (inquiry starter) inserts a `meet_greet_request`; the host
// inserts a `meet_greet_confirmed`. The DB enforces the role-vs-kind rule
// in the messages_insert_participants WITH CHECK (D-A1 TIGHT) — a forged
// insert (wrong role, or a MG kind on a booking thread) is rejected by
// RLS. The body carries a non-empty marker so the 0044 body CHECK holds;
// the UI renders a pill keyed on `kind` and ignores the marker text.
// ---------------------------------------------------------------------------

// Non-empty marker bodies (Arabic-first; the pill UI renders localized
// labels by kind, so these only surface as a no-JS fallback).
const MG_MARKER: Record<'request' | 'confirm', string> = {
  request: 'طلب زيارة تعارف',
  confirm: 'تم تأكيد زيارة التعارف',
};

export async function sendMeetGreet(
  inquiryId: string,
  action: 'request' | 'confirm',
): Promise<Message> {
  if (!supabase) throw new Error('No Supabase client');
  const { data: authData } = await supabase.auth.getUser();
  const senderId = authData.user?.id;
  if (!senderId) throw new Error('Not signed in');

  const kind =
    action === 'request' ? 'meet_greet_request' : 'meet_greet_confirmed';

  const { data, error } = await supabase
    .from('messages')
    .insert({
      inquiry_id: inquiryId,
      sender_id: senderId,
      body: MG_MARKER[action],
      kind,
    })
    .select(
      `
      *,
      sender:profiles!messages_sender_id_fkey(id, full_name, full_name_en, avatar_url)
    `,
    )
    .single();
  if (error || !data) throw error ?? new Error('Failed to send meet & greet');
  return data as unknown as Message;
}

// ---------------------------------------------------------------------------
// 0043 (2026-06-28) — closeInquiry() removed. The archive/close
// affordance is gone from the product (founder decision). Inquiry
// threads stay open forever; the only valid terminal status is
// 'converted' (inquiry became a booking). The 0043 trigger update
// rejects any new open → closed transition at the DB layer, so any
// caller attempting to set status = 'closed' would raise. UI
// affordance removed in src/app/inquiries/[id].tsx in the same
// commit.

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

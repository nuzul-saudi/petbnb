// 0046 (β thread continuity, Part B) — comprehensive inquiry
// timeline.
//
// The inquiry detail page fans into the merged host↔owner timeline:
// the inquiry's pre-booking conversation interleaved with every
// booking that originated from it. Messages stay PHYSICALLY in
// their own threads (booking_id XOR inquiry_id — enforced by the
// 0040 messages_one_thread_check); this module is purely query +
// in-memory merge.
//
// Safety invariants this module assumes:
//   * the viewer can read every piece via existing RLS (0040
//     messages_select_participants for both branches; 0004
//     bookings_select_owner_or_host for the booking rows). No
//     SECURITY DEFINER RPC. Plan doc §6 recommends client-side
//     merge.
//   * 0044 read-tracking + delete-until-read stay correct
//     per-thread; the inquiry detail screen calls mark_thread_read
//     for the inquiry AND each linked booking on focus.
//
// Block model (founder-locked, plan doc §6 walk):
//   * ConversationBlock — inquiry-scoped messages outside any
//     booking's run.
//   * BookingBlock — one per linked booking, spanning created_at
//     (placed event) → terminal event (completed / declined /
//     cancelled). booking-scoped messages from that booking live
//     inside. Lifecycle events render as dividers; the placed
//     divider is rich (dates / pet(s) / total), the rest are slim.
//   * disputed is OPEN per the smart-routing semantic (plan doc
//     §6) — it doesn't close the block. Its divider renders if a
//     disputed_at exists.

import { logWarn } from '@/lib/log';

import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/messages';
import type { Tables } from '@/types/database';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Slim booking shape used inside the timeline. Carries enough for
 *  the rich placed-divider (listing title, dates, pet names,
 *  pricing) and the lifecycle stamps. Reflects 0046's schema. */
export type TimelineBooking = Tables<'bookings'> & {
  listing: Pick<
    Tables<'listings'>,
    'id' | 'title_ar' | 'title_en' | 'neighborhood'
  > | null;
  pets: Tables<'pets'>[];
};

/** A lifecycle event surfaced as a divider in the merged feed.
 *  Each one carries the timestamp it fired at + which booking. */
export type LifecycleEvent = {
  type:
    | 'placed'
    | 'accepted'
    | 'declined'
    | 'active'
    | 'completed'
    | 'cancelled'
    | 'disputed';
  bookingId: string;
  at: string; // ISO timestamp
};

/** One item on the chronological event stream, before block grouping. */
export type TimelineItem =
  | {
      kind: 'message';
      message: Message;
      /** Which thread this message physically belongs to. The 0040
       *  XOR constraint means EITHER inquiry_id OR booking_id is
       *  set on the row — this field flags which one for the
       *  block walker. */
      parent: { kind: 'inquiry'; id: string } | { kind: 'booking'; id: string };
      at: string;
    }
  | {
      kind: 'event';
      event: LifecycleEvent;
      at: string;
    };

/** A grouped block ready to render. */
export type TimelineBlock =
  | {
      kind: 'conversation';
      key: string;
      items: TimelineItem[]; // only kind: 'message' items
    }
  | {
      kind: 'booking';
      key: string;
      booking: TimelineBooking;
      items: TimelineItem[]; // mix of message + event items in chronological order
    };

/** The full fetch result before block-grouping is run. */
export type InquiryTimelineRaw = {
  inquiryMessages: Message[];
  bookings: TimelineBooking[];
  /** Messages from every linked booking, sender-embedded, ALREADY
   *  flattened to one array. The block walker partitions them by
   *  message.booking_id. */
  bookingMessages: Message[];
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Fetch every piece the comprehensive timeline needs, in parallel
 *  where possible. RLS gates each path — see file-header comment.
 *
 *  Returns a "raw" shape; call `buildTimelineBlocks(...)` on the
 *  result to get render-ready blocks. */
export async function fetchInquiryTimelineRaw(
  inquiryId: string,
): Promise<InquiryTimelineRaw> {
  if (!supabase) {
    return { inquiryMessages: [], bookings: [], bookingMessages: [] };
  }

  // Inquiry messages + linked bookings in parallel. Both are
  // independent reads against different tables.
  const [inquiryMessagesResult, bookingsResult] = await Promise.all([
    supabase
      .from('messages')
      .select(
        `
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, full_name_en, avatar_url)
      `,
      )
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: true }),
    supabase
      .from('bookings')
      .select(
        `
        *,
        listing:listings(id, title_ar, title_en, neighborhood),
        booking_pets(pet:pets(*))
      `,
      )
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: true }),
  ]);

  if (inquiryMessagesResult.error) throw inquiryMessagesResult.error;
  if (bookingsResult.error) throw bookingsResult.error;

  const inquiryMessages = ((inquiryMessagesResult.data ?? []) as unknown as Message[]).map(
    (row) => ({ ...row, sender: row.sender ?? null }),
  );

  // booking_pets nested embed → flatten to pets[] per booking row.
  const bookings: TimelineBooking[] = (bookingsResult.data ?? []).map((row) => {
    const r = row as typeof row & {
      booking_pets?: { pet: Tables<'pets'> }[];
    };
    return {
      ...(r as unknown as Tables<'bookings'>),
      listing: (r.listing ?? null) as TimelineBooking['listing'],
      pets: (r.booking_pets ?? []).map((bp) => bp.pet),
    };
  });

  // Now fetch every linked booking's messages. Single IN-query
  // against booking_id; the walker partitions client-side. Empty
  // bookings list → skip the query entirely.
  let bookingMessages: Message[] = [];
  if (bookings.length > 0) {
    const ids = bookings.map((b) => b.id);
    const { data: mData, error: mErr } = await supabase
      .from('messages')
      .select(
        `
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, full_name_en, avatar_url)
      `,
      )
      .in('booking_id', ids)
      .order('created_at', { ascending: true });
    if (mErr) throw mErr;
    bookingMessages = ((mData ?? []) as unknown as Message[]).map((row) => ({
      ...row,
      sender: row.sender ?? null,
    }));
  }

  return { inquiryMessages, bookings, bookingMessages };
}

// ---------------------------------------------------------------------------
// Block walk (pure)
// ---------------------------------------------------------------------------

/** Walk the raw fetch into render-ready blocks per the founder-
 *  locked block model. Pure function — no I/O, no React. */
export function buildTimelineBlocks(
  raw: InquiryTimelineRaw,
  inquiryId: string,
): TimelineBlock[] {
  // 1. Flatten everything into TimelineItem[] with timestamps.
  const items: TimelineItem[] = [];

  for (const m of raw.inquiryMessages) {
    items.push({
      kind: 'message',
      message: m,
      parent: { kind: 'inquiry', id: inquiryId },
      at: m.created_at,
    });
  }

  for (const m of raw.bookingMessages) {
    if (m.booking_id == null) continue; // defensive; XOR constraint
    items.push({
      kind: 'message',
      message: m,
      parent: { kind: 'booking', id: m.booking_id },
      at: m.created_at,
    });
  }

  for (const b of raw.bookings) {
    // placed event — always present (created_at is NOT NULL).
    items.push({
      kind: 'event',
      event: { type: 'placed', bookingId: b.id, at: b.created_at },
      at: b.created_at,
    });
    // Stamp-fired events — render only if the corresponding _at is
    // populated. Historical bookings (pre-0046 apply) leave these
    // null and simply skip rendering, per the plan doc § "Historical
    // data — flag honestly".
    if (b.accepted_at) {
      items.push({
        kind: 'event',
        event: { type: 'accepted', bookingId: b.id, at: b.accepted_at },
        at: b.accepted_at,
      });
    }
    if (b.declined_at) {
      items.push({
        kind: 'event',
        event: { type: 'declined', bookingId: b.id, at: b.declined_at },
        at: b.declined_at,
      });
    }
    if (b.active_at) {
      items.push({
        kind: 'event',
        event: { type: 'active', bookingId: b.id, at: b.active_at },
        at: b.active_at,
      });
    }
    if (b.completed_at) {
      items.push({
        kind: 'event',
        event: { type: 'completed', bookingId: b.id, at: b.completed_at },
        at: b.completed_at,
      });
    }
    if (b.cancelled_at) {
      items.push({
        kind: 'event',
        event: { type: 'cancelled', bookingId: b.id, at: b.cancelled_at },
        at: b.cancelled_at,
      });
    }
    if (b.disputed_at) {
      items.push({
        kind: 'event',
        event: { type: 'disputed', bookingId: b.id, at: b.disputed_at },
        at: b.disputed_at,
      });
    }
  }

  // 2. Sort chronologically. Stable sort keeps tie-breaking
  // intuitive (events placed BEFORE messages at the same exact
  // timestamp because they were pushed first into the array;
  // unlikely to collide in practice given ms resolution).
  items.sort((a, b) => a.at.localeCompare(b.at));

  // 3. Walk → blocks.
  const blocks: TimelineBlock[] = [];
  const bookingById = new Map<string, TimelineBooking>();
  for (const b of raw.bookings) bookingById.set(b.id, b);

  let currentConversation: Extract<TimelineBlock, { kind: 'conversation' }> | null =
    null;
  let currentBookingBlock: Extract<TimelineBlock, { kind: 'booking' }> | null =
    null;
  const isTerminal = (t: LifecycleEvent['type']): boolean =>
    t === 'completed' || t === 'declined' || t === 'cancelled';

  const flushConversation = () => {
    if (currentConversation && currentConversation.items.length > 0) {
      blocks.push(currentConversation);
    }
    currentConversation = null;
  };
  const flushBooking = () => {
    if (currentBookingBlock) blocks.push(currentBookingBlock);
    currentBookingBlock = null;
  };

  for (const it of items) {
    if (it.kind === 'event' && it.event.type === 'placed') {
      // booking opens — close any open conversation block first.
      flushConversation();
      const b = bookingById.get(it.event.bookingId);
      if (!b) {
        // Defensive — the placed event references a booking we
        // didn't fetch. Skip; the walker continues without
        // opening a block.
        logWarn(
          '[inquiry-timeline] placed event references unknown booking',
          it.event.bookingId,
        );
        continue;
      }
      currentBookingBlock = {
        kind: 'booking',
        key: `booking-${b.id}`,
        booking: b,
        items: [it],
      };
      continue;
    }

    if (it.kind === 'event') {
      // non-placed lifecycle event — belongs INSIDE the open booking
      // block. If no booking is open (shouldn't happen if events are
      // chronologically after their booking's placed event), skip.
      if (
        currentBookingBlock &&
        currentBookingBlock.booking.id === it.event.bookingId
      ) {
        currentBookingBlock.items.push(it);
        if (isTerminal(it.event.type)) {
          flushBooking();
        }
      } else {
        // The lifecycle event isn't inside its own booking's open
        // window. That happens if there's a chronological gap (e.g.
        // a SECOND booking on the same inquiry placed AFTER the
        // first booking terminated but BEFORE its lifecycle events
        // were stamped — unlikely given trigger timing, but
        // defensive). Log and ignore — these slim dividers are
        // cosmetic; missing one is preferable to mis-grouping.
        logWarn(
          '[inquiry-timeline] non-placed event outside its booking block',
          it.event,
        );
      }
      continue;
    }

    // Message item.
    if (it.parent.kind === 'booking') {
      if (
        currentBookingBlock &&
        currentBookingBlock.booking.id === it.parent.id
      ) {
        currentBookingBlock.items.push(it);
      } else {
        // booking-scoped message but no matching booking block is
        // open. Either the booking ended already (compose still
        // worked because the booking page allowed it) or the
        // routing put it in the wrong place. Render at the end of
        // the most recent block of any kind, or open a fresh
        // conversation block.
        logWarn(
          '[inquiry-timeline] booking message outside its booking block',
          it.parent.id,
        );
        if (!currentConversation) {
          currentConversation = {
            kind: 'conversation',
            key: `conversation-${it.at}`,
            items: [],
          };
        }
        currentConversation.items.push(it);
      }
      continue;
    }

    // Inquiry-scoped message.
    if (currentBookingBlock) {
      // Inquiry message landed during a booking's open window. Per
      // the smart-compose-routing rule, a compose in the merged
      // view while a booking is OPEN routes to the booking — so
      // this shouldn't happen for messages written via the merged
      // view. But it CAN happen if the user typed the message from
      // some other surface (e.g. the inquiry inbox row's
      // future-quick-reply, or admin browse, or a legacy path).
      // Close the booking block (its lifecycle continues to be
      // tracked by stamp triggers; just the visual block ends here)
      // and start a fresh conversation block.
      //
      // Actually safer: keep the booking block open and emit a
      // conversation block as a SIBLING. But the walker only has
      // one current of each kind. Pragmatic: flush booking, open
      // conversation. Edge case + logged.
      logWarn(
        '[inquiry-timeline] inquiry message during open booking',
        it.message.id,
      );
      flushBooking();
    }
    if (!currentConversation) {
      currentConversation = {
        kind: 'conversation',
        key: `conversation-${it.at}`,
        items: [],
      };
    }
    currentConversation.items.push(it);
  }

  // Flush any open blocks at end.
  flushConversation();
  flushBooking();

  return blocks;
}

// ---------------------------------------------------------------------------
// Smart compose routing (plan doc §6)
// ---------------------------------------------------------------------------

/** "Open" status set per the SQL header of 0046 + the plan doc. A
 *  message typed in the comprehensive view routes to the
 *  most-recent OPEN booking if one exists; otherwise to the
 *  inquiry. */
export function pickComposeTarget(
  bookings: TimelineBooking[],
  inquiryId: string,
): { kind: 'booking'; id: string } | { kind: 'inquiry'; id: string } {
  const open = bookings
    .filter(
      (b) =>
        b.status === 'requested' ||
        b.status === 'accepted' ||
        b.status === 'active' ||
        b.status === 'disputed',
    )
    // Most-recent by created_at if multiple are open simultaneously
    // (rare in practice; the partial-unique inquiry index keeps the
    // count manageable but multiple bookings under the same inquiry
    // is allowed).
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (open.length > 0) {
    return { kind: 'booking', id: open[0].id };
  }
  return { kind: 'inquiry', id: inquiryId };
}

// ---------------------------------------------------------------------------
// Per-message delete-until-read resolver (plan doc §4 / B4)
// ---------------------------------------------------------------------------

/** Resolve the OTHER party's last_opened_at for a given message
 *  using its physical thread (inquiry vs booking) — drives the
 *  delete-until-read predicate in the merged view. */
export function resolveOtherLastOpenedAt(
  message: Message,
  viewerId: string,
  inquiry: {
    starter_id: string;
    starter_last_opened_at: string | null;
    host_last_opened_at: string | null;
  },
  bookings: TimelineBooking[],
): string | null {
  if (message.inquiry_id != null) {
    // Inquiry-scoped — pick the OTHER participant's stamp.
    return viewerId === inquiry.starter_id
      ? inquiry.host_last_opened_at
      : inquiry.starter_last_opened_at;
  }
  if (message.booking_id != null) {
    const b = bookings.find((x) => x.id === message.booking_id);
    if (!b) return null;
    // Booking-scoped — viewer is one of owner / host. The OTHER's
    // stamp. (Admin browse path doesn't reach this resolver — it
    // shows the read-only admin view, no delete affordance.)
    return viewerId === b.owner_id
      ? b.host_last_opened_at
      : b.owner_last_opened_at;
  }
  return null;
}

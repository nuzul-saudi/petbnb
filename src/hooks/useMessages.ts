// useMessages — same { data, loading, refetch } pattern as useBooking,
// useDailyUpdates, useConditionReports.
//
// Round 9 (2026-06-12): added a Supabase Realtime subscription so new
// messages appear immediately without the navigate-away-and-back
// refetch dance. The focus-refetch in the booking detail screen still
// exists as a defense against subscription drops (network blip /
// device sleep) but is no longer the primary mechanism.
//
// Pattern:
//   - Subscribe to postgres_changes INSERT on public.messages,
//     filtered by booking_id at the server.
//   - On any INSERT event we just call refetch() instead of trying
//     to merge the payload row into local state. Reason: payload.new
//     comes WITHOUT the joined sender profile; doing a one-message
//     fetch for the sender + merge is more code than the full
//     refetch is worth at MVP volume (a stay has ~5-50 messages
//     total). The cost is one extra round-trip per arrival.
//   - Unsubscribe on unmount / bookingId change.

import { useCallback, useEffect, useState } from 'react';

import { listMessages, type Message } from '@/lib/messages';
import { logWarn } from '@/lib/log';
import { supabase } from '@/lib/supabase';

export type UseMessagesResult = {
  data: Message[];
  loading: boolean;
  refetch: () => Promise<void>;
};

export function useMessages(bookingId: string): UseMessagesResult {
  const [data, setData] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const rows = await listMessages(bookingId);
      setData(rows);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime subscription. One channel per bookingId; tears down when
  // bookingId changes or the consumer unmounts. Best-effort — a
  // failed subscribe doesn't break the screen; focus-refetch remains
  // as backup.
  useEffect(() => {
    if (!bookingId || !supabase) return;
    const channel = supabase
      .channel(`messages:${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          // Refetch to pick up the joined sender profile. See header
          // comment for the cost rationale.
          void refetch();
        },
      )
      .subscribe((status) => {
        // CHANNEL_ERROR / TIMED_OUT / CLOSED happen on auth drops or
        // long sleep. The realtime infra retries internally; we log
        // for visibility only.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logWarn('[messages.realtime_subscribe_status]', status);
        }
      });
    return () => {
      void channel.unsubscribe();
    };
  }, [bookingId, refetch]);

  return { data, loading, refetch };
}

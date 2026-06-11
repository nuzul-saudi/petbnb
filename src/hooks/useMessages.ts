// useMessages — same { data, loading, refetch } pattern as useBooking,
// useDailyUpdates, useConditionReports. The booking detail screen
// calls refetch() on send-success and via useFocusEffect — the latter
// is the "MVP behavior without Realtime" trade-off documented in the
// Round 5b commit + batch-decisions.

import { useCallback, useEffect, useState } from 'react';

import { listMessages, type Message } from '@/lib/messages';

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

  return { data, loading, refetch };
}

import { logWarn } from '@/lib/log';
// useDailyUpdates — wraps the daily-updates-load effect that used to live
// inline in src/app/bookings/[id].tsx.
//
// Behavior preserved verbatim:
//   • Effect deps are [id] only.
//   • cancelled-flag pattern on unmount.
//   • Silent failure on the catch — the empty-state copy renders if the
//     fetch flopped. Updates are secondary surface; the booking page
//     should still render.

import { useCallback, useEffect, useState } from "react";

import { listDailyUpdates, type DailyUpdate } from "@/lib/daily-updates";

export function useDailyUpdates(id: string): {
  data: DailyUpdate[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<DailyUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listDailyUpdates(id)
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn("[daily_updates.load_failed]", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refetch = useCallback(async () => {
    if (!id) return;
    const fresh = await listDailyUpdates(id);
    setData(fresh);
  }, [id]);

  return { data, loading, refetch };
}

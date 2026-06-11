import { logWarn } from '@/lib/log';
// useConditionReports — wraps the condition-reports-load effect that used
// to live inline in src/app/bookings/[id].tsx.
//
// Behavior preserved verbatim:
//   • Effect deps are [id] only.
//   • cancelled-flag pattern on unmount.
//   • Silent failure on the catch — matches the original block.

import { useCallback, useEffect, useState } from "react";

import {
  listConditionReports,
  type ConditionReport,
} from "@/lib/condition-reports";

export function useConditionReports(id: string): {
  data: ConditionReport[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<ConditionReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listConditionReports(id)
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn("[condition_reports.load_failed]", e);
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
    const fresh = await listConditionReports(id);
    setData(fresh);
  }, [id]);

  return { data, loading, refetch };
}

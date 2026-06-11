import { logWarn } from '@/lib/log';
// useBooking — wraps the booking-load effect that used to live inline in
// src/app/bookings/[id].tsx. Returns the same { data, loading, refetch }
// shape as the sibling data-loading hooks.
//
// Behavior preserved verbatim from the original block:
//   • Effect deps are [id] only — locale / callback identity changes do
//     not retrigger the load.
//   • cancelled-flag pattern on unmount so a late .then/.catch can't
//     write into a stale screen.
//   • Initial load can set data to null (a "not found" booking).
//   • refetch's setData is null-guarded — the original
//     "if (fresh) setBooking(fresh)" pattern after mutating actions.
//   • Errors are routed through the onLoadError callback so the SCREEN
//     can translate the message (it owns useTranslation), matching the
//     original `setError(t("booking.load_failed"))`. The callback is
//     held behind a ref so the screen can pass a fresh closure on every
//     render without dirtying the effect deps.

import { useCallback, useEffect, useRef, useState } from "react";

import { getBooking, type BookingDetail } from "@/lib/bookings";

export function useBooking(
  id: string,
  onLoadError?: (e: unknown) => void,
): {
  data: BookingDetail | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBooking(id)
      .then((b) => {
        if (cancelled) return;
        setData(b);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn("[booking.load_failed]", e);
        onLoadErrorRef.current?.(e);
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
    const fresh = await getBooking(id);
    if (fresh) setData(fresh);
  }, [id]);

  return { data, loading, refetch };
}

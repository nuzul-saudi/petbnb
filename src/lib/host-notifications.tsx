// Host-side notifications context.
//
// Was a persona-toggle context in the 'both'-role world: it owned the
// owner/host persona state + the pending-host-bookings badge count.
// Migration 0039 dropped 'both' and the persona toggle — there's no
// switching context any more, a user IS either an owner or a host
// account.
//
// What's left: the pending-host-bookings badge. Hosts still need a
// visible signal when an owner sends them a booking request, even
// before they open the bookings screen. This file now exposes only
// that count + a refresh trigger.
//
// File name kept as `persona.tsx` to minimize churn across import
// sites; the exported names changed (usePersona → useHostNotifications,
// PersonaProvider → HostNotificationsProvider).

import { logWarn } from '@/lib/log';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { countPendingHostBookings } from '@/lib/listings';
import {
  countUnreadNotifications,
  NOTIFICATION_GLYPH,
  type NotificationType,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';

type HostNotificationsContextValue = {
  /**
   * Count of host-side bookings awaiting action (status='requested')
   * across all of the current user's own listings. Refreshed on user
   * change, role change, and explicit calls to
   * refreshPendingHostCount() — NOT realtime. AppHeader renders a
   * badge on the bookings shortcut so host work doesn't get missed.
   * Zero for non-host users and while loading.
   */
  pendingHostCount: number;
  /**
   * Force a re-fetch of pendingHostCount. The booking detail screen
   * calls this after a host accept/decline so the badge decrements
   * without waiting for the next focus event. Best-effort: a failed
   * fetch leaves the previous value in place.
   */
  refreshPendingHostCount: () => void;
  /**
   * Unread-notifications count (0047 / Phase 2a) for ANY signed-in user —
   * owners included, unlike pendingHostCount. Backs the 🔔 bell badge in
   * AppHeader. Fetched on user change + explicit refreshUnread() calls
   * (the /notifications screen refreshes after mark-read). Not realtime —
   * that's Phase 5. Zero for signed-out users and while loading.
   */
  unreadCount: number;
  /** Force a re-fetch of unreadCount (after marking notifications read). */
  refreshUnread: () => void;
};

const HostNotificationsContext =
  createContext<HostNotificationsContextValue | null>(null);

export function HostNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile } = useAuth();
  const [pendingHostCount, setPendingHostCount] = useState(0);

  // Refresh trigger: bumping pendingRefreshTick re-runs the count
  // fetch. The booking detail screen calls refreshPendingHostCount()
  // after a host accept/decline so the badge decrements immediately.
  const [pendingRefreshTick, setPendingRefreshTick] = useState(0);
  const refreshPendingHostCount = useCallback(() => {
    setPendingRefreshTick((n) => n + 1);
  }, []);

  // Pending-host-bookings count. Fetched on:
  //   • user.id change (sign-in, sign-out)
  //   • profile.role change (owner ↔ host — only meaningful if an
  //     admin flips a role, since users can't self-change)
  //   • pendingRefreshTick bump (explicit refresh after host action)
  // No polling, no realtime. Stale until the next of these triggers.
  // Owner / admin / signed-out users skip the fetch entirely.
  useEffect(() => {
    if (!user?.id) {
      setPendingHostCount(0);
      return;
    }
    if (profile?.role !== 'host') {
      setPendingHostCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const count = await countPendingHostBookings(user.id);
        if (!cancelled) setPendingHostCount(count);
      } catch (e) {
        logWarn('[host_notifications.pending_count_failed]', e);
        // Leave the previous value in place — a transient failure
        // shouldn't clear an existing badge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.role, pendingRefreshTick]);

  // Unread notifications count (0047). Fetched for EVERY signed-in user
  // (owners too), unlike pendingHostCount. Refreshed on user change and
  // explicit refreshUnread() calls. No polling/realtime (Phase 5).
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadRefreshTick, setUnreadRefreshTick] = useState(0);
  const refreshUnread = useCallback(() => {
    setUnreadRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const count = await countUnreadNotifications();
        if (!cancelled) setUnreadCount(count);
      } catch (e) {
        logWarn('[host_notifications.unread_count_failed]', e);
        // Leave the previous value — a transient failure shouldn't clear
        // an existing badge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, unreadRefreshTick]);

  // Phase 5 / realtime — live notifications. Subscribe to INSERTs on
  // `notifications` scoped to the current user; on arrival bump the bell
  // badge AND pop a tappable toast (foreground-only by nature — the
  // channel only delivers while the app is open, D-A1). Best-effort: a
  // failed subscribe just falls back to the focus/action refetch that
  // already exists. Requires `notifications` on the supabase_realtime
  // publication (dashboard toggle — see the apply log).
  const { t } = useTranslation();
  const { showToast } = useToast();

  // The INSERT handler is held in a ref so t / showToast / refreshUnread
  // stay current WITHOUT being effect deps — otherwise a locale change (t)
  // would tear down + re-subscribe, and any dep churn risks re-subscribing
  // to a still-registered channel topic. Effect dep is the topic identity
  // ONLY: [user?.id].
  const onNotificationRef = useRef<(payload: { new: unknown }) => void>(
    () => {},
  );
  onNotificationRef.current = (payload) => {
    const n = payload.new as {
      title_key?: string;
      body_params?: Record<string, string | number> | null;
      link_path?: string;
      type?: NotificationType;
    };
    // Badge bumps live.
    refreshUnread();
    // Toast the localized title + route to its deep link on tap.
    if (n.title_key) {
      showToast(t(n.title_key, n.body_params ?? undefined), {
        linkPath: n.link_path,
        glyph: n.type ? NOTIFICATION_GLYPH[n.type] : undefined,
      });
    }
  };

  useEffect(() => {
    const uid = user?.id;
    if (!uid || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          onNotificationRef.current(payload);
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logWarn('[host_notifications.realtime_subscribe_status]', status);
        }
      });
    // removeChannel (not bare unsubscribe) frees the topic from the client
    // registry so re-subscribes can't collide with a stale instance.
    return () => {
      void client.removeChannel(channel);
    };
  }, [user?.id]);

  const value = useMemo<HostNotificationsContextValue>(
    () => ({
      pendingHostCount,
      refreshPendingHostCount,
      unreadCount,
      refreshUnread,
    }),
    [pendingHostCount, refreshPendingHostCount, unreadCount, refreshUnread],
  );

  return (
    <HostNotificationsContext.Provider value={value}>
      {children}
    </HostNotificationsContext.Provider>
  );
}

export function useHostNotifications(): HostNotificationsContextValue {
  const ctx = useContext(HostNotificationsContext);
  if (ctx) return ctx;
  if (__DEV__) {
    logWarn(
      '[host_notifications.no_provider] used outside HostNotificationsProvider',
    );
  }
  return {
    pendingHostCount: 0,
    refreshPendingHostCount: () => undefined,
    unreadCount: 0,
    refreshUnread: () => undefined,
  };
}

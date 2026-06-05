// Persona context for role='both' users. Persists across devices via
// profiles.persona (DB source of truth, migration 0018) with an
// AsyncStorage cache for instant first paint. Mirrors LocaleProvider's
// dual-source pattern from lib/i18n.tsx.
//
// Persona is only meaningful for role='both'. Pure 'owner' and 'host'
// users don't read this value; their home is determined by role alone.
// First open (cache empty AND profile.persona NULL) defaults to 'host'
// — matches the spec "first ever open → host; subsequent → wherever
// they left off".

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth';
import { countPendingHostBookings } from '@/lib/listings';
import { cachePersona, loadCachedPersona } from '@/lib/persona-storage';
import { supabase } from '@/lib/supabase';

export type Persona = 'owner' | 'host';

type PersonaContextValue = {
  persona: Persona;
  setPersona: (next: Persona) => void;
  /**
   * Count of host-side bookings awaiting action (status='requested')
   * across all of the current user's own listings. Refreshed on user
   * change, role change, and persona switch — NOT realtime. AppHeader
   * uses this to render an attention dot on the host persona pill for
   * 'both' users so host work doesn't get missed while in owner mode.
   * Zero for users without host capability (role='owner', 'admin') and
   * while the count is loading.
   */
  pendingHostCount: number;
};

const PersonaContext = createContext<PersonaContextValue | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [persona, setPersonaState] = useState<Persona>('host');
  const [pendingHostCount, setPendingHostCount] = useState(0);

  // Cache hydration: instant on user change. Reset to 'host' FIRST so a
  // stale value from a previous user on the same device can't leak; then
  // layer in the cached value if any exists.
  useEffect(() => {
    if (!user?.id) {
      setPersonaState('host');
      return;
    }
    let cancelled = false;
    setPersonaState('host');
    (async () => {
      const cached = await loadCachedPersona(user.id);
      if (!cancelled && cached) {
        setPersonaState(cached);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // DB reconciliation: profiles.persona is the cross-device source of
  // truth. Once profile loads, if it carries a non-null value adopt it
  // and sync the cache. Null DB value (never explicitly chosen) leaves
  // the cached/default value untouched.
  useEffect(() => {
    if (!user?.id || !profile) return;
    const dbValue = profile.persona;
    if (dbValue === 'owner' || dbValue === 'host') {
      setPersonaState((prev) => {
        if (prev !== dbValue) {
          void cachePersona(user.id, dbValue);
          return dbValue;
        }
        return prev;
      });
    }
  }, [user?.id, profile?.persona]);

  // Pending-host-bookings count (7.1e). Fetched on:
  //   • user.id change (sign-in, sign-out)
  //   • profile.role change (owner → both, etc.)
  //   • persona switch (deliberate context shift — fresh read)
  // No polling, no realtime. Stale until the next of these triggers.
  // Pure 'owner' / 'admin' / signed-out users skip the fetch entirely.
  useEffect(() => {
    if (!user?.id) {
      setPendingHostCount(0);
      return;
    }
    if (profile?.role !== 'host' && profile?.role !== 'both') {
      setPendingHostCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const count = await countPendingHostBookings(user.id);
        if (!cancelled) setPendingHostCount(count);
      } catch (e) {
        console.warn('[persona.pending_count_failed]', e);
        // Leave the previous value in place — a transient failure
        // shouldn't clear an existing badge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.role, persona]);

  const setPersona = useCallback(
    (next: Persona) => {
      setPersonaState(next);
      if (!user?.id) return;
      // Write-through to both layers. Fire-and-forget — a failed persist
      // must NOT block the UI. Cache covers the immediate session; a
      // failed DB write is retried implicitly on the next switch.
      void cachePersona(user.id, next);
      const sb = supabase;
      if (sb) {
        void sb
          .from('profiles')
          .update({ persona: next })
          .eq('id', user.id)
          .then((res) => {
            if (res.error) {
              console.warn('[persona.write_failed]', res.error.message);
            }
          });
      }
    },
    [user?.id],
  );

  const value = useMemo<PersonaContextValue>(
    () => ({ persona, setPersona, pendingHostCount }),
    [persona, setPersona, pendingHostCount],
  );

  return (
    <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>
  );
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (ctx) return ctx;
  if (__DEV__) {
    console.warn(
      '[persona.no_provider] usePersona used outside PersonaProvider',
    );
  }
  // Defensive fallback — returns the default and a no-op setter.
  return {
    persona: 'host',
    setPersona: () => undefined,
    pendingHostCount: 0,
  };
}

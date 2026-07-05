import { logWarn } from '@/lib/log';
// ============================================================================
// Auth context — single source of truth for "who is signed in right now".
//
// Subscribes to Supabase auth state changes and exposes:
//   - session / user (raw Supabase auth types)
//   - profile (the public.profiles row for the signed-in user; null if not yet
//     loaded, or if signed out)
//   - signOut(), refreshProfile()
//   - initializing flag for the brief boot window while we read storage
//
// ============================================================================
// Supabase email-delivery config (locked 2026-06-27): the project is wired
// for 6-digit OTP code delivery, NOT confirmation links. Authentication →
// Providers → Email → "Confirm email" is OFF, and the Magic Link template
// embeds {{ .Token }} (the 6-digit code) instead of {{ .ConfirmationURL }}.
// Do NOT flip "Confirm email" back on — verify.tsx expects the user to
// type a code, and detectSessionInUrl is intentionally false in
// src/lib/supabase.ts so a confirmation link landing back on the app
// would NOT establish a session. Changing either requires updating both.
// ============================================================================
// TODO(pre-launch): swap email OTP → Saudi phone OTP.
//   - Add Send SMS Hook (Edge Function calling Unifonic/Taqnyat).
//   - Replace {email} with {phone} in signInWithOtp / verifyOtp.
//   - Wire src/lib/phone.ts (E.164 normalization for +966).
//   - Requires Saudi CR + CITC alpha sender ID registration.
// See CLAUDE.md Section 11 for the full pre-launch checklist.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { identifyUser, resetAnalytics } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

type Profile = Tables<'profiles'>;

type AuthContextValue = {
  initializing: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      // Don't crash — the trigger should have created the row, but if it
      // didn't (or RLS hides it), we'd rather render the sign-in flow than
      // a white screen. Surface in dev so we notice.
      if (__DEV__) logWarn('[auth] failed to load profile', error);
      setProfile(null);
      return;
    }
    setProfile(data);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        // Analytics identity (Phase 1) — user id only, no PII.
        identifyUser(data.session.user.id);
        await fetchProfile(data.session.user.id);
      }
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        identifyUser(newSession.user.id);
        fetchProfile(newSession.user.id);
      } else {
        resetAnalytics();
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    await fetchProfile(session.user.id);
  }, [session?.user, fetchProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      user: session?.user ?? null,
      profile,
      signOut,
      refreshProfile,
    }),
    [initializing, session, profile, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

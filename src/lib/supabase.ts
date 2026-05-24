// Supabase client — single instance for the whole app.
//
// Config flow:
//   .env  ->  app.config.ts (extra)  ->  Constants.expoConfig.extra  ->  here.
//
// We only use the publishable key (sb_publishable_…) on the client. Secrets
// (sb_secret_…) must never be imported here — they belong server-side only.

import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

type SupabaseExtra = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as SupabaseExtra;

const SUPABASE_URL = extra.supabaseUrl;
const SUPABASE_KEY = extra.supabasePublishableKey;

export const hasSupabaseConfig =
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.startsWith('https://') &&
  typeof SUPABASE_KEY === 'string' &&
  SUPABASE_KEY.startsWith('sb_publishable_');

// Build the client only when both env vars are present. If they're missing
// we export `null` and let callers show a friendly Arabic message instead
// of crashing at import time (which would white-screen the whole app).
//
// Storage: supabase-js defaults to localStorage on web, which is what we
// need for the current web preview. When we add native auth in Step 4 we'll
// pass AsyncStorage via the `auth.storage` option.
export const supabase: SupabaseClient<Database> | null = hasSupabaseConfig
  ? createClient<Database>(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export type PingResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

// Reachability check. After Step 3 we have a real `products` table with a
// public-read RLS policy; a zero-row response from it is the cheapest
// possible proof that URL + key + REST + RLS are all happy. We don't care
// what comes back, only that we don't get a network/auth error.
export async function pingSupabase(): Promise<PingResult> {
  if (!supabase) {
    return { ok: false, detail: 'missing_config' };
  }
  try {
    const { error } = await supabase.from('products').select('id').limit(1);

    if (!error) {
      return { ok: true, detail: 'reachable' };
    }

    if (/jwt|api key|apikey/i.test(error.message)) {
      return { ok: false, detail: `auth_rejected: ${error.message}` };
    }

    return { ok: false, detail: `unexpected_error: ${error.message}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `network_error: ${message}` };
  }
}

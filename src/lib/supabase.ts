// Supabase client — single instance for the whole app.
//
// Config flow:
//   .env  ->  app.config.ts (extra)  ->  Constants.expoConfig.extra  ->  here.
//
// We only use the publishable key (sb_publishable_…) on the client. Secrets
// (sb_secret_…) must never be imported here — they belong server-side only.
//
// Database types: once Step 3 ships the schema, generate types with
// `supabase gen types typescript` and replace the `any` below with `Database`.

import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
// need for Step 2's web preview. When we add native auth in Step 4 we'll
// pass AsyncStorage via the `auth.storage` option.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> | null = hasSupabaseConfig
  ? createClient(SUPABASE_URL!, SUPABASE_KEY!, {
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

// Cheap reachability check that does NOT require any tables to exist yet.
// We query a deliberately-nonexistent table; the success criterion is
// "the server answered with a PostgREST error" — that proves the URL is
// reachable AND the publishable key was accepted by the API gateway.
//
// Failure modes we surface in plain Arabic via the caller:
//   - missing config        -> we never built a client
//   - network/DNS failure   -> request threw
//   - 401 invalid key       -> code === '401' / message mentions JWT
//   - anything else 5xx     -> generic failure
export async function pingSupabase(): Promise<PingResult> {
  if (!supabase) {
    return { ok: false, detail: 'missing_config' };
  }
  try {
    const probeTable = '__petbnb_connectivity_probe__';
    const { error } = await supabase.from(probeTable).select('*').limit(1);

    if (!error) {
      // Vanishingly unlikely (the table doesn't exist), but treat as success.
      return { ok: true, detail: 'unexpected_success' };
    }

    // PostgREST returns code 'PGRST205' / '42P01' for "relation does not
    // exist". Either one means: the gateway accepted our key and routed us
    // to Postgres — exactly what we want to prove.
    const code = error.code ?? '';
    if (code === 'PGRST205' || code === '42P01' || /does not exist/i.test(error.message)) {
      return { ok: true, detail: `reachable (probe rejected: ${code || 'no-code'})` };
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

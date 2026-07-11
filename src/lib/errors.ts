// Raw-error formatting for ADMIN surfaces (Part C, 2026-07-11 brief).
//
// The founder debugs from a phone — the browser console is unreachable.
// Admin-only screens append this raw line (English, no locale keys)
// under the friendly Arabic error so the underlying cause (e.g.
// Postgres 42703 from a drifted migration) is visible on-device.
// Never use on customer-facing screens: raw codes/messages are
// developer-facing by design.

/**
 * Compact one-line description of an unknown thrown value:
 * "42703: column d.accepts_species does not exist — <details>".
 * Handles the Supabase PostgrestError shape ({ code, message, details,
 * hint }), plain Error, and falls back to String(e).
 */
export function formatRawError(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const code = typeof o.code === 'string' && o.code ? o.code : null;
    const message =
      typeof o.message === 'string' && o.message ? o.message : null;
    const details =
      typeof o.details === 'string' && o.details ? o.details : null;
    if (code || message) {
      const head = code ? `${code}: ${message ?? ''}` : (message as string);
      return details ? `${head} — ${details}` : head;
    }
  }
  return String(e);
}

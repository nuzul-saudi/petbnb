// Sentry error tracking — Phase 1 (Observability).
//
// Web-first by design. The pilot deploys to Vercel (web); native app
// builds are an explicit non-goal of the pre-pilot plan, so we use the
// lightweight browser SDK (@sentry/browser) rather than the native
// @sentry/react-native wrapper.
//
// Safety posture — no-op unless explicitly configured:
//   - No DSN  → initSentry() returns immediately; the SDK is NEVER
//     imported, so a build with no DSN carries zero Sentry runtime.
//   - Native  → skipped (Platform.OS !== 'web'); @sentry/browser touches
//     browser globals, so we never load it off-web.
//   - The dynamic import means the ~KBs of Sentry only enter the bundle
//     graph behind this guard; captureError() is a no-op until init
//     resolves. Telemetry never throws into app code (all calls swallowed).
//
// Config flow mirrors supabase.ts:
//   .env (SENTRY_DSN) → app.config.ts extra → Constants.expoConfig.extra.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

type SentryExtra = { sentryDsn?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as SentryExtra;

const SENTRY_DSN =
  typeof extra.sentryDsn === 'string' && extra.sentryDsn.length > 0
    ? extra.sentryDsn
    : null;

// Holds the loaded SDK module once init resolves; null until then.
let sentry: typeof import('@sentry/browser') | null = null;
let initStarted = false;

/** True when a DSN is configured AND we're on web (where the SDK runs). */
export function isSentryEnabled(): boolean {
  return SENTRY_DSN !== null && Platform.OS === 'web';
}

/**
 * Initialize Sentry once. Safe to call unconditionally — it no-ops when
 * no DSN is set or off-web. Fire-and-forget: the dynamic import resolves
 * asynchronously and captureError() simply no-ops until it does.
 */
export function initSentry(): void {
  // TEMP DEBUG (remove with the /debug route) — stage tracker mirroring
  // analytics.ts so the /debug screen can report the Sentry differential
  // (same dynamic-import mechanism as PostHog).
  const mark = (s: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__SENTRY_STAGE__ = s;
    }
  };
  mark('called');
  if (!SENTRY_DSN || Platform.OS !== 'web' || initStarted) return;
  initStarted = true;
  mark('guard_passed');
  void (async () => {
    try {
      mark('importing');
      const mod = await import('@sentry/browser');
      mark('imported');
      mod.init({
        dsn: SENTRY_DSN,
        // v1: error tracking only — no performance tracing.
        tracesSampleRate: 0,
        environment:
          typeof __DEV__ !== 'undefined' && __DEV__
            ? 'development'
            : 'production',
      });
      mark('inited');
      sentry = mod;
    } catch (e) {
      // TEMP DEBUG (remove with the /debug route) — surface the error.
      mark('errored');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__SENTRY_INIT_ERROR__ = e;
      }
      // Never let observability wiring break the app.
    }
  })();
}

/**
 * Forward an error to Sentry. No-op until initSentry() has resolved a DSN.
 * Errors go through captureException; anything else as an error-level
 * message. All failures are swallowed — telemetry must never throw.
 */
export function captureError(error: unknown): void {
  if (!sentry) return;
  try {
    if (error instanceof Error) {
      sentry.captureException(error);
    } else {
      sentry.captureMessage(String(error), 'error');
    }
  } catch {
    /* swallow */
  }
}

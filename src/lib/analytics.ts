// Product analytics — Phase 1 (Observability).
//
// Web-first, mirroring the Sentry posture in src/lib/sentry.ts:
//   - No key   → initAnalytics() no-ops; posthog-js is NEVER imported.
//   - Native   → skipped (posthog-js is a browser client).
//   - track()  → no-op until init resolves; never throws into app code.
//
// Privacy: event props are IDs ONLY — no names, emails, phone numbers, or
// free text. The AnalyticsEvent union is the closed set of funnel events
// the pre-pilot plan defined; adding an event means adding it here.
//
// Config flow: .env (POSTHOG_KEY / POSTHOG_HOST) → app.config.ts extra →
// Constants.expoConfig.extra.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

type AnalyticsExtra = { posthogKey?: string; posthogHost?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as AnalyticsExtra;

// TEMP DEBUG (remove after diagnosis) — expose the resolved `extra` on the
// window so we can confirm whether posthogKey/sentryDsn actually reached
// Constants.expoConfig.extra in the deployed bundle. `any` cast is
// justified: attaching an ad-hoc debug property to window has no typed home.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__DEBUG_EXTRA__ = extra;
}

const POSTHOG_KEY =
  typeof extra.posthogKey === 'string' && extra.posthogKey.length > 0
    ? extra.posthogKey
    : null;
const POSTHOG_HOST =
  typeof extra.posthogHost === 'string' && extra.posthogHost.length > 0
    ? extra.posthogHost
    : 'https://us.i.posthog.com';

/** Closed set of funnel events (pre-pilot plan, Phases 1 + 1.5). */
export type AnalyticsEvent =
  | 'listing_viewed'
  | 'inquiry_opened'
  | 'message_sent'
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_completed'
  // Phase 1.5 additions (Strategy-locked names):
  | 'feed_filtered'
  | 'signup_started'
  | 'signup_completed'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'contact_nudge_shown'
  | 'contact_nudge_sent_anyway'
  | 'review_submitted'
  | 'host_application_submitted';

/** Prop values are scalars only — pass IDs, never PII. */
type EventProps = Record<string, string | number | boolean>;

let posthog: import('posthog-js').PostHog | null = null;
let initStarted = false;

/** True when a key is configured AND we're on web (where the client runs). */
export function isAnalyticsEnabled(): boolean {
  return POSTHOG_KEY !== null && Platform.OS === 'web';
}

/**
 * Initialize PostHog once. Safe to call unconditionally — no-ops without a
 * key or off-web. Fire-and-forget dynamic import; track() no-ops until it
 * resolves.
 */
export function initAnalytics(): void {
  // TEMP DEBUG (remove after diagnosis) — a stage tracker so we can see
  // from the live console exactly where init dies:
  //   window.__POSTHOG_STAGE__      — furthest stage reached
  //   window.__POSTHOG_INIT_ERROR__ — the thrown error, if any
  // Read guide: undefined = initAnalytics never ran; 'called' = guard
  // returned early; 'importing' (stuck) = the dynamic import never
  // resolved (chunk 404 / CSP / code-split) — check the Network tab for a
  // posthog-js JS chunk; 'errored' = init threw (read __POSTHOG_INIT_ERROR__).
  const mark = (s: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__POSTHOG_STAGE__ = s;
    }
  };
  mark('called');
  if (!POSTHOG_KEY || Platform.OS !== 'web' || initStarted) return;
  initStarted = true;
  mark('guard_passed');
  void (async () => {
    try {
      mark('importing');
      const { default: ph } = await import('posthog-js');
      mark('imported');
      ph.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // We fire funnel events explicitly; no automatic pageview spam.
        capture_pageview: false,
        persistence: 'localStorage',
      });
      mark('inited');
      posthog = ph;
    } catch (e) {
      // TEMP DEBUG (remove after diagnosis) — surface the swallowed error.
      mark('errored');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__POSTHOG_INIT_ERROR__ = e;
      }
      // Never let analytics wiring break the app.
    }
  })();
}

/**
 * SPA pageview (Phase 1.5). Fired by the root layout on every route
 * change so PostHog sees navigation paths, landing pages, and guest
 * journeys. Expo Router paths carry UUIDs only — no PII. No-op until
 * initAnalytics() resolves; never throws.
 */
export function trackPageview(path: string): void {
  if (!posthog) return;
  try {
    posthog.capture('$pageview', { path });
  } catch {
    /* swallow */
  }
}

/**
 * Record a funnel event. No-op until initAnalytics() resolves. Props must
 * be IDs / scalars only — never PII. All failures swallowed.
 */
export function track(event: AnalyticsEvent, props: EventProps = {}): void {
  if (!posthog) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* swallow */
  }
}

/**
 * Associate subsequent events with a stable user id (an id — not PII).
 * Call on sign-in; no-op until init resolves.
 */
export function identifyUser(userId: string): void {
  if (!posthog) return;
  try {
    posthog.identify(userId);
  } catch {
    /* swallow */
  }
}

/** Clear identity on sign-out so events don't bleed across accounts. */
export function resetAnalytics(): void {
  if (!posthog) return;
  try {
    posthog.reset();
  } catch {
    /* swallow */
  }
}

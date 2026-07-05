// Tiny dev-only logger. Audit S4 (2026-06-11) flagged 69
// non-`__DEV__`-gated `console.*` lines — meaning every catch block in
// production would still print to the console (web devtools / native
// remote debugger). Most of those are catch-block diagnostics that
// are valuable in dev but noise in prod. Funnelling through this
// helper centralizes the __DEV__ gate so we never need to repeat it.
//
// Three thin wrappers — same shape as console.* so callsites only
// need their token swapped:
//
//   logWarn('[tag]', err)
//   logInfo('[tag]', payload)
//   logError('[tag]', err)
//
// In DEV these print to the console. In production (`__DEV__ === false`)
// logWarn/logInfo stay silent, but logError now forwards to Sentry
// (Phase 1) — which itself no-ops unless a DSN is configured. This is the
// seam that turned the old "production is a black box" logger into real
// error visibility without changing a single callsite.

/* eslint-disable no-console */

import { captureError } from '@/lib/sentry';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export function logWarn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
}

export function logInfo(...args: unknown[]): void {
  if (isDev) {
    console.info(...args);
  }
}

export function logError(...args: unknown[]): void {
  if (isDev) {
    console.error(...args);
    return;
  }
  // Production: forward the underlying error to Sentry. Callsites use the
  // shape logError('[tag]', err), so prefer the first Error argument;
  // fall back to a joined string of the args so a message still lands.
  const err = args.find((a) => a instanceof Error);
  captureError(err ?? args.map((a) => String(a)).join(' '));
}

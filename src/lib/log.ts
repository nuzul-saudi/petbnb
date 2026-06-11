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
// Production builds (`__DEV__ === false`) become no-ops.

/* eslint-disable no-console */

export function logWarn(...args: unknown[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(...args);
  }
}

export function logInfo(...args: unknown[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info(...args);
  }
}

export function logError(...args: unknown[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.error(...args);
  }
}

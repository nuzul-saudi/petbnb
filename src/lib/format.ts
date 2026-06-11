// Display formatters. Centralized so every screen renders numbers and the
// ر.س currency mark the same way and we never accidentally write "$".
//
// Numerals: Latin/Western digits (0–9) everywhere. Founder decision after
// test round 3 (2026-06-10): mixed Arabic-Indic numerals across screens
// read inconsistently in the Saudi UX, especially in pet counts and the
// currency row. `toArabicDigits` is preserved as a NAME ONLY pass-through
// so existing callsites compile; it returns the input unchanged. Don't
// re-introduce Arabic-Indic conversion without an explicit ask.

import type { Locale } from '@/lib/i18n';

export function toArabicDigits(value: number | string): string {
  return String(value);
}

export function formatSAR(amount: number, _useArabicDigits = false): string {
  // Round defensively. Founder rule: SAR is whole-integer in display
  // everywhere, no decimals. New bookings get integer fee snapshots
  // since R1C1, but pre-R1C1 rows still hold decimal payout/fee
  // values that would surface as e.g. "892.5 ر.س" without this guard.
  // The audit trail in the DB stays decimal — only the display rounds.
  return `${String(Math.round(amount))} ر.س`;
}

/** Whole-day difference between two ISO dates (yyyy-mm-dd). 0 on invalid. */
export function nightsBetween(startIso: string, endIso: string): number {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

/** Today as yyyy-mm-dd in local time. Used as a min-date for date inputs. */
export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Format an ISO timestamp as "YYYY-MM-DD HH:MM" in Asia/Riyadh time
 *  (UTC+3, no DST), 24-hour clock. Returns Latin digits in BOTH locales
 *  per the test-round-3 founder decision (see file header) — the
 *  `locale` parameter is preserved for callsite stability but is now
 *  unused inside the function.
 *
 *  Used for daily-update stamps and any other user-facing timestamp
 *  that should be anchored to KSA local time regardless of the viewer's
 *  device timezone. Petbnb is Saudi-first so this is the natural anchor.
 *
 *  Implementation note: uses en-GB as the base locale because it gives
 *  stable 24-hour output across runtimes; formatToParts gives us each
 *  field separately so we can rebuild "YYYY-MM-DD HH:MM" exactly. */
export function formatRiyadhStamp(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const stamp =
    `${get('year')}-${get('month')}-${get('day')} ` +
    `${get('hour')}:${get('minute')}`;
  // Both locales now use Latin digits (see header comment).
  void locale;
  return stamp;
}

/** Pick the locale-appropriate version of a bilingual field with
 *  fallback to the Arabic primary. Used for listing titles, descriptions,
 *  and host display names that may have optional _en versions.
 *
 *  - locale 'en' && enField truthy → enField
 *  - locale 'en' && enField empty/null → arField (the fallback)
 *  - locale 'ar' → arField always
 *
 *  Treats whitespace-only strings as empty. */
export function pickLocalized(
  arField: string,
  enField: string | null | undefined,
  locale: Locale,
): string {
  if (locale === 'en' && enField && enField.trim() !== '') {
    return enField;
  }
  return arField;
}

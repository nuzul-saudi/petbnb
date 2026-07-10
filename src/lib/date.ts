// Date helpers — single source of truth for ISO arithmetic + display
// formatting. Created 2026-06-26 per the design review's FIX 3.
//
// Before this file:
//   - todayIso lived in src/lib/format.ts AND was redefined inside
//     AvailabilityCalendar.tsx (a second time)
//   - addDaysIso, daysInMonth, firstWeekdayOfMonth lived ONLY in
//     AvailabilityCalendar.tsx
//   - Dates surfaced in the UI three different ways: raw ISO
//     (2026-07-01), Arabic-Indic ISO (٢٠٢٦-٠٧-٠١), friendly
//     (Jul 1 / يول ١)
//
// This file collapses the math into one module and adds formatDate
// as the only public date-display helper. No ISO string should reach
// the UI directly going forward.
//
// ─────────────────────────────────────────────────────────────
// Digit rule — LATIN everywhere (locked decision)
// ─────────────────────────────────────────────────────────────
// Test-round-3 (2026-05-27) locked Latin display digits across the
// app. Rationale: Arabic-Indic digits scan poorly against the Latin
// digits Saudis see in WhatsApp / Snap / banking apps. formatDate
// returns Latin digits in both locales. toArabicDigits in
// src/lib/format.ts is a deliberate no-op pass-through. A regression
// test in tests/format.test.ts pins this so a six-month-later
// refactor can't silently flip it.

// ---------------------------------------------------------------------------
// ISO arithmetic — pure, ISO-string-only. No Date objects leak.
// ---------------------------------------------------------------------------

/** Today in YYYY-MM-DD (local-time, aligns with calendar grid). */
export function todayIso(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** ISO date N days after (or before, with negative N) the given ISO. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** ISO date one day after the given ISO (alias for addDaysIso(iso, 1)). */
export function nextDayIso(iso: string): string {
  return addDaysIso(iso, 1);
}

/** Number of days in (year, monthZero-indexed). */
export function daysInMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero + 1, 0).getDate();
}

/** 0-6 weekday index for the first day of (year, monthZero). 0 = Sunday. */
export function firstWeekdayOfMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero, 1).getDay();
}

/** Anchor a date to the first of its month: 2026-07-15 → 2026-07-01. */
export function monthAnchor(iso: string): string {
  return iso.slice(0, 7) + '-01';
}

// ---------------------------------------------------------------------------
// Display formatter — formatDate(iso, locale, style?)
// ---------------------------------------------------------------------------

export type DateStyle = 'short' | 'medium' | 'long';

const EN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const EN_MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const AR_MONTHS_SHORT = [
  'ينا', 'فبر', 'مارس', 'إبر', 'مايو', 'يون',
  'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس',
] as const;

const AR_MONTHS_LONG = [
  'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

/**
 * Format an ISO YYYY-MM-DD as a localized human string with LATIN digits.
 *
 * Styles:
 *   - short  → "Jul 1" / "1 يول"    (compact for cards, summaries)
 *   - medium → "Jul 1, 2026" / "1 يوليو 2026"   (default; default if omitted)
 *   - long   → "July 1, 2026" / "1 يوليو 2026"   (formal contexts)
 *
 * Bad input (non-ISO) returns the input verbatim so a misformatted
 * string fails visibly rather than throwing.
 *
 * Digits are always Latin per the locked founder decision; see this
 * file's header.
 */
export function formatDate(
  iso: string,
  locale: 'ar' | 'en',
  style: DateStyle = 'medium',
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const monthZero = Number(m[2]) - 1;
  const day = Number(m[3]);

  if (style === 'short') {
    const month =
      locale === 'ar' ? AR_MONTHS_SHORT[monthZero] : EN_MONTHS_SHORT[monthZero];
    return locale === 'ar' ? `${day} ${month}` : `${month} ${day}`;
  }

  if (style === 'long') {
    const month =
      locale === 'ar' ? AR_MONTHS_LONG[monthZero] : EN_MONTHS_LONG[monthZero];
    return locale === 'ar'
      ? `${day} ${month} ${year}`
      : `${month} ${day}, ${year}`;
  }

  // medium (default)
  const month =
    locale === 'ar' ? AR_MONTHS_LONG[monthZero] : EN_MONTHS_SHORT[monthZero];
  return locale === 'ar'
    ? `${day} ${month} ${year}`
    : `${month} ${day}, ${year}`;
}

/**
 * Format an ISO range as a short-form span string.
 * "Jul 1 → Jul 5" / "1 يول → 5 يول"
 *
 * Used in summaries where two dates display together as a single
 * unit. Style is fixed at short — medium / long would be too verbose
 * for a single line.
 */
export function formatDateRange(
  startIso: string,
  endIso: string,
  locale: 'ar' | 'en',
): string {
  return `${formatDate(startIso, locale, 'short')} → ${formatDate(endIso, locale, 'short')}`;
}

/**
 * Relative inbox stamp — "just now" / "5m ago" / "2h ago" / "3d ago",
 * falling back to formatDate (short, Latin digits) once the item is a
 * week old. Extracted from inquiries/index.tsx (S2, UX review 10 Jul):
 * the local copy fell back to raw `iso.slice(0, 10)` after 7 days — the
 * exact raw-ISO leak FIX 3 eliminated everywhere else.
 *
 * `t` is injected by the caller rather than imported: this module stays
 * pure (no i18n/React graph), which is also what keeps it testable in
 * node vitest. Relative labels come from the myinquiries.* keys.
 */
export function formatRelativeStamp(
  iso: string,
  locale: 'ar' | 'en',
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const deltaMin = Math.max(0, Math.floor((now - then) / 60_000));
  if (deltaMin < 1) return t('myinquiries.just_now');
  if (deltaMin < 60) return t('myinquiries.minutes_ago', { n: deltaMin });
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return t('myinquiries.hours_ago', { n: deltaHr });
  const deltaDay = Math.floor(deltaHr / 24);
  if (deltaDay < 7) return t('myinquiries.days_ago', { n: deltaDay });
  // Older — localized short date, Latin digits (locked decision). The
  // slice trims the timestamp to YYYY-MM-DD as formatDate INPUT — the
  // output is localized, never raw ISO.
  return formatDate(iso.slice(0, 10), locale, 'short');
}

// Display formatters. CLAUDE.md Section 7 calls out Arabic-Indic digits and
// the ر.س currency mark — both centralized here so every screen renders the
// same way and we never accidentally write "$".

import type { Locale } from '@/lib/i18n';

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

export function formatSAR(amount: number, useArabicDigits = true): string {
  const num = useArabicDigits ? toArabicDigits(amount) : String(amount);
  return `${num} ر.س`;
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
 *  (UTC+3, no DST), 24-hour clock. Always returns digits in the locale's
 *  preferred numerals — Arabic-Indic for 'ar', ASCII for 'en'.
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
  return locale === 'ar' ? toArabicDigits(stamp) : stamp;
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

// Display formatters. CLAUDE.md Section 7 calls out Arabic-Indic digits and
// the ر.س currency mark — both centralized here so every screen renders the
// same way and we never accidentally write "$".

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

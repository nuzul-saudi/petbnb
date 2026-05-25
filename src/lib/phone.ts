// Saudi mobile E.164 normalizer.
//
// Pre-staged for the eventual swap from email OTP to Saudi phone OTP — see
// Section 11 of CLAUDE.md ("Pre-launch tasks") and the TODO block at the top
// of src/lib/auth.ts. None of the current auth screens call into this yet.
//
// Saudi mobile numbers in E.164 are always +966 followed by a 9-digit body
// starting with 5 (the mobile leading digit; all KSA mobile carriers — STC,
// Mobily, Zain — use the 5X prefix range).

export type NormalizeResult =
  | { ok: true; e164: string }
  | {
      ok: false;
      reason: 'empty' | 'invalid_chars' | 'wrong_country' | 'wrong_length' | 'not_mobile';
    };

const MOBILE_FIRST_DIGIT = '5';

/**
 * Normalize a user-typed Saudi mobile phone into strict E.164.
 *
 * Accepts forgiving input — any of these become "+966512345678":
 *   "+966 51 234 5678"
 *   "0512345678"
 *   "00966 51 234 5678"
 *   "966-51-234-5678"
 *   "+966 (51) 234-5678"
 */
export function normalizeSaudiPhone(input: string): NormalizeResult {
  if (!input || typeof input !== 'string') return { ok: false, reason: 'empty' };

  // Strip common formatting characters (spaces, dashes, parens, dots).
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s.length === 0) return { ok: false, reason: 'empty' };
  if (!/^\+?\d+$/.test(s)) return { ok: false, reason: 'invalid_chars' };

  // Reduce every accepted prefix to a bare 9-digit body.
  if (s.startsWith('+966')) s = s.slice(4);
  else if (s.startsWith('00966')) s = s.slice(5);
  else if (s.startsWith('966')) s = s.slice(3);
  else if (s.startsWith('05')) s = s.slice(1); // domestic 0-prefix
  else if (s.startsWith('+')) return { ok: false, reason: 'wrong_country' };
  // Otherwise assume the input is already a bare 9-digit body — fall through.

  if (s.length !== 9) return { ok: false, reason: 'wrong_length' };
  if (!s.startsWith(MOBILE_FIRST_DIGIT)) return { ok: false, reason: 'not_mobile' };

  return { ok: true, e164: `+966${s}` };
}

/**
 * Format an E.164 Saudi mobile for display ("+966 51 234 5678").
 * Returns the input unchanged if it doesn't look like a Saudi E.164.
 */
export function formatSaudiPhoneDisplay(e164: string): string {
  const m = /^\+966(\d)(\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `+966 ${m[1]}${m[2]} ${m[3]} ${m[4]}`;
}

// Regression pin for the founder's locked Latin-digit decision
// (test-round-3, 2026-05-27). toArabicDigits in src/lib/format.ts
// MUST stay a no-op pass-through so dates / numbers across the app
// display with Latin digits regardless of locale.
//
// Rationale (founder words): Arabic-Indic digits scan poorly against
// the Latin digits Saudis see in WhatsApp, Snap, banking apps, etc.
// Mixing systems makes the UI feel inconsistent. Hence Latin
// everywhere.
//
// This test exists so a six-month-later refactor or a copy-pasted
// "fix Arabic display" PR can't silently flip the behavior \xe2\x80\x94 the
// CI will catch it. If you genuinely want Arabic-Indic back, this
// decision needs to be re-opened with the founder, CLAUDE.md
// updated, and this test rewritten in the same PR.

import { describe, expect, it } from 'vitest';

import { toArabicDigits } from '@/lib/format';
import { formatDate, formatDateRange } from '@/lib/date';

describe('toArabicDigits — locked no-op (test-round-3 founder decision)', () => {
  it('returns string input verbatim, no Arabic-Indic conversion', () => {
    expect(toArabicDigits('123')).toBe('123');
    expect(toArabicDigits('0987654321')).toBe('0987654321');
    expect(toArabicDigits('2026-07-01')).toBe('2026-07-01');
  });

  it('accepts numeric input and returns Latin-digit string', () => {
    expect(toArabicDigits(42)).toBe('42');
    expect(toArabicDigits(0)).toBe('0');
    expect(toArabicDigits(2026)).toBe('2026');
  });

  it('does not convert digits already in Arabic-Indic form', () => {
    // If someone explicitly passes Arabic-Indic, we don't convert TO
    // Latin either \xe2\x80\x94 the function is a pure pass-through.
    expect(toArabicDigits('٠١٢')).toBe('٠١٢');
  });
});

describe('formatDate \xe2\x80\x94 always Latin digits, locale picks the month name', () => {
  it('short style: "Jul 1" / "1 \xd9\x8a\xd9\x88\xd9\x84"', () => {
    expect(formatDate('2026-07-01', 'en', 'short')).toBe('Jul 1');
    expect(formatDate('2026-07-01', 'ar', 'short')).toBe('1 يول');
  });

  it('medium style (default): "Jul 1, 2026" / "1 \xd9\x8a\xd9\x88\xd9\x84\xd9\x8a\xd9\x88 2026"', () => {
    expect(formatDate('2026-07-01', 'en')).toBe('Jul 1, 2026');
    expect(formatDate('2026-07-01', 'ar')).toBe(
      '1 يوليو 2026',
    );
  });

  it('long style: "July 1, 2026" / "1 \xd9\x8a\xd9\x88\xd9\x84\xd9\x8a\xd9\x88 2026"', () => {
    expect(formatDate('2026-07-01', 'en', 'long')).toBe('July 1, 2026');
    expect(formatDate('2026-07-01', 'ar', 'long')).toBe(
      '1 يوليو 2026',
    );
  });

  it('bad input returns verbatim (fails visibly, not throws)', () => {
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatDate('', 'ar')).toBe('');
    expect(formatDate('2026/07/01', 'en')).toBe('2026/07/01');
  });

  it('output digits are ALL Latin (no Arabic-Indic ٠-٩ escape)', () => {
    // Spot-check every locale + style combination for the digit-block
    // ranges. If any character in [٠-٩] sneaks in, the
    // founder decision has been violated.
    const inputs: Array<['ar' | 'en', 'short' | 'medium' | 'long', string]> = [
      ['en', 'short', 'Jul 1'],
      ['en', 'medium', 'Jul 1, 2026'],
      ['en', 'long', 'July 1, 2026'],
      ['ar', 'short', '1 يول'],
      ['ar', 'medium', '1 يوليو 2026'],
      ['ar', 'long', '1 يوليو 2026'],
    ];
    for (const [locale, style, expected] of inputs) {
      const out = formatDate('2026-07-01', locale, style);
      expect(out).toBe(expected);
      // Defensive: enforce no Arabic-Indic digits anywhere in the
      // output.
      expect(/[٠-٩]/.test(out)).toBe(false);
    }
  });
});

describe('formatDateRange — single-line span string', () => {
  it('joins two short-style dates with arrow separator', () => {
    expect(formatDateRange('2026-07-01', '2026-07-05', 'en')).toBe(
      'Jul 1 → Jul 5',
    );
    expect(formatDateRange('2026-07-01', '2026-07-05', 'ar')).toBe(
      '1 يول → 5 يول',
    );
  });
});

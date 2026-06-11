// Vaccination recency — covers audit finding C4.

import { describe, expect, it } from 'vitest';
import {
  classifyVaccinationDate,
  isVaccinationCurrent,
  worstVaccinationStatus,
} from '@/lib/vaccination';

// Anchored at midnight UTC so the 365-day boundary lands exactly on
// a calendar-date string (no half-day rounding).
const NOW = '2026-06-11T00:00:00Z';

describe('classifyVaccinationDate', () => {
  it('returns missing for null / empty / unparseable', () => {
    expect(classifyVaccinationDate(null, NOW)).toBe('missing');
    expect(classifyVaccinationDate('', NOW)).toBe('missing');
    expect(classifyVaccinationDate('not-a-date', NOW)).toBe('missing');
  });

  it('returns current for a date within 365 days', () => {
    expect(classifyVaccinationDate('2025-12-01', NOW)).toBe('current');
  });

  it('returns expired for a date older than 365 days (audit C4 the 2020 case)', () => {
    expect(classifyVaccinationDate('2020-01-01', NOW)).toBe('expired');
  });

  it('treats exactly 365 days old as current (boundary)', () => {
    // NOW - 365 days = 2025-06-11
    expect(classifyVaccinationDate('2025-06-11', NOW)).toBe('current');
  });

  it('treats 366 days old as expired (boundary + 1)', () => {
    expect(classifyVaccinationDate('2025-06-10', NOW)).toBe('expired');
  });
});

describe('isVaccinationCurrent', () => {
  it('requires BOTH rabies and FVRCP to be current', () => {
    expect(
      isVaccinationCurrent(
        { rabies_vaccinated_at: '2026-01-01', fvrcp_vaccinated_at: '2026-01-01' },
        NOW,
      ),
    ).toBe(true);
    expect(
      isVaccinationCurrent(
        { rabies_vaccinated_at: '2026-01-01', fvrcp_vaccinated_at: '2020-01-01' },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('worstVaccinationStatus', () => {
  it('returns null when every pet is current', () => {
    expect(
      worstVaccinationStatus(
        [
          { rabies_vaccinated_at: '2026-01-01', fvrcp_vaccinated_at: '2026-01-01' },
        ],
        NOW,
      ),
    ).toBe(null);
  });

  it('returns "missing" when any pet is missing a date', () => {
    expect(
      worstVaccinationStatus(
        [
          { rabies_vaccinated_at: null, fvrcp_vaccinated_at: '2026-01-01' },
        ],
        NOW,
      ),
    ).toBe('missing');
  });

  it('returns "expired" when any pet has an old date — beats missing', () => {
    expect(
      worstVaccinationStatus(
        [
          { rabies_vaccinated_at: null, fvrcp_vaccinated_at: null },
          { rabies_vaccinated_at: '2020-01-01', fvrcp_vaccinated_at: '2026-01-01' },
        ],
        NOW,
      ),
    ).toBe('expired');
  });
});

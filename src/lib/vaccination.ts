// Pure vaccination helpers. Lifted from request.tsx in test round 3
// follow-up after audit finding C4: the warning was only checking
// PRESENCE of rabies/FVRCP dates, so a cat vaccinated in 2020 passed
// silently. The smoke-test checklist also described a "more than 1
// year old" rule that the code never implemented — so the checklist
// only ever passed coincidentally.
//
// Default max age = 365 days (rabies boosters in KSA are typically
// annual; the FVRCP series follows the same yearly booster cadence).
// Decoupled from the Date.now() global so the function stays pure
// and unit-testable; callers pass `nowIso`.

export const DEFAULT_VACCINATION_MAX_AGE_DAYS = 365;

export type VaccinationStatus = 'current' | 'missing' | 'expired';

/**
 * Classify a single vaccination date relative to a reference time.
 *
 *   missing  — dateIso is null / empty / unparseable
 *   expired  — date is older than maxAgeDays from nowIso
 *   current  — date is within maxAgeDays AND not in the future
 *
 * Future-dated values fall through to `current` (the pet form caps
 * the date picker at today, so we don't expect them in practice; if
 * one slips in via direct API, we don't penalize the user).
 */
export function classifyVaccinationDate(
  dateIso: string | null | undefined,
  nowIso: string,
  maxAgeDays: number = DEFAULT_VACCINATION_MAX_AGE_DAYS,
): VaccinationStatus {
  if (!dateIso || dateIso.trim() === '') return 'missing';
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return 'missing';
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) return 'missing';
  const ageDays = (now - t) / (1000 * 60 * 60 * 24);
  if (ageDays > maxAgeDays) return 'expired';
  return 'current';
}

/**
 * True when EVERY required vaccination on `pet` (rabies + FVRCP for
 * cats — both annual) is classified `current` per the helper above.
 * Drives the request screen's warning text — false means surface
 * either a "missing" or "expired" hint depending on the worst status.
 */
export function isVaccinationCurrent(
  pet: {
    rabies_vaccinated_at?: string | null;
    fvrcp_vaccinated_at?: string | null;
  },
  nowIso: string,
  maxAgeDays: number = DEFAULT_VACCINATION_MAX_AGE_DAYS,
): boolean {
  return (
    classifyVaccinationDate(pet.rabies_vaccinated_at, nowIso, maxAgeDays) ===
      'current' &&
    classifyVaccinationDate(pet.fvrcp_vaccinated_at, nowIso, maxAgeDays) ===
      'current'
  );
}

/**
 * Worst status across a list of pets — the warning copy on the
 * request screen picks "expired" when any selected pet has an
 * expired date, else "missing" when any is missing, else null. The
 * worst-wins ordering surfaces the more actionable case ("renew")
 * over the simpler case ("fill in").
 */
export function worstVaccinationStatus(
  pets: Array<{
    rabies_vaccinated_at?: string | null;
    fvrcp_vaccinated_at?: string | null;
  }>,
  nowIso: string,
  maxAgeDays: number = DEFAULT_VACCINATION_MAX_AGE_DAYS,
): 'missing' | 'expired' | null {
  let anyMissing = false;
  let anyExpired = false;
  for (const p of pets) {
    const r = classifyVaccinationDate(p.rabies_vaccinated_at, nowIso, maxAgeDays);
    const f = classifyVaccinationDate(p.fvrcp_vaccinated_at, nowIso, maxAgeDays);
    if (r === 'expired' || f === 'expired') anyExpired = true;
    if (r === 'missing' || f === 'missing') anyMissing = true;
  }
  if (anyExpired) return 'expired';
  if (anyMissing) return 'missing';
  return null;
}

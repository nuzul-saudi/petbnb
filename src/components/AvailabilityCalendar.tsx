// AvailabilityCalendar — date-range picker with disabled date support.
//
// Built 2026-06-25 to replace the HTML5 <input type="date"> on the
// booking-request screen. HTML5 date inputs can't grey out specific
// dates (only min/max), which meant guests could pick a blocked
// date, see a warning, and try to submit. The custom calendar
// disables blocked days at the pointer-events level so they can't
// be selected at all.
//
// Pure logic, no dependency on a calendar library — straightforward
// date math on ISO YYYY-MM-DD strings. Works identically on web and
// native (no platform-specific code).
//
// Props:
//   - startDate / endDate (ISO yyyy-mm-dd or null) — current selection
//   - onChange({ startDate, endDate }) — called on each tap; consumer
//     decides whether one tap sets start, end, or restarts
//   - blockedRanges — half-open [start_date, end_date) ranges where
//     start_date is INCLUSIVE and end_date is EXCLUSIVE. Matches the
//     listing_blocked_dates schema convention.
//   - minDate / maxDate (ISO yyyy-mm-dd, optional) — clamps the
//     pickable range. Defaults: today, +365 days.
//   - locale ('ar' | 'en') — controls month/weekday labels + RTL.
//
// Interaction model:
//   - First tap → sets startDate; clears endDate.
//   - Second tap (after a start exists, on a date >= start) → sets
//     endDate.
//   - Tapping a date < startDate → starts over (new startDate).
//   - Tapping a blocked or out-of-range day → no-op (button is
//     non-pressable, fully transparent gesture).
//   - If a tap would create a [start, end] range that crosses a
//     blocked range, we DON'T silently truncate — the consumer
//     gets the new endDate and runs its own validation. This keeps
//     the component dumb and the booking-request screen authoritative.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BlockedRange } from '@/lib/availability';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Date math helpers — pure, ISO-string-only. No Date object leaks.
// ---------------------------------------------------------------------------

/** Today in YYYY-MM-DD. Uses local-time to align with calendar grid. */
function todayIso(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Add N days (positive or negative) to an ISO date. */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Test whether ISO date is in the half-open [start, end) range. */
function isInRange(iso: string, startIso: string, endIso: string): boolean {
  return iso >= startIso && iso < endIso;
}

/** Number of days in (year, month-1-indexed). */
function daysInMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero + 1, 0).getDate();
}

/** Returns 0-6 for the first-of-month weekday. 0 = Sunday. */
function firstWeekdayOfMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero, 1).getDay();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type AvailabilityCalendarProps = {
  startDate: string | null;
  endDate: string | null;
  onChange: (selection: {
    startDate: string | null;
    endDate: string | null;
  }) => void;
  blockedRanges: BlockedRange[];
  /** ISO yyyy-mm-dd. Defaults to today. */
  minDate?: string;
  /** ISO yyyy-mm-dd. Defaults to today + 365. */
  maxDate?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AvailabilityCalendar({
  startDate,
  endDate,
  onChange,
  blockedRanges,
  minDate,
  maxDate,
}: AvailabilityCalendarProps) {
  const { t, locale } = useTranslation();

  // Default clamps: today → +365 days. Consumer can widen by passing
  // an earlier minDate.
  const effectiveMin = minDate ?? todayIso();
  const effectiveMax = maxDate ?? addDaysIso(effectiveMin, 365);

  // Visible month. Defaults to the start-date's month if set, else
  // current month. Stored as 1-indexed [year, month] so we can render
  // labels without dragging a Date object through render cycles.
  const [visibleYM, setVisibleYM] = useState<[number, number]>(() => {
    const seedIso = startDate ?? todayIso();
    const [y, m] = seedIso.split('-').map(Number);
    return [y, m]; // m is 1-12
  });

  const [visibleYear, visibleMonth] = visibleYM;
  const monthZero = visibleMonth - 1;

  // ---- isDayBlocked ----
  // A day is "blocked" when any blocked range from props covers it.
  // Half-open: start_date inclusive, end_date exclusive (matches
  // listing_blocked_dates and the rangesOverlap helper in
  // src/lib/range-overlap.ts).
  const isDayBlocked = useCallback(
    (iso: string): boolean => {
      for (const r of blockedRanges) {
        if (isInRange(iso, r.start_date, r.end_date)) return true;
      }
      return false;
    },
    [blockedRanges],
  );

  // ---- isDayInPickedRange ----
  // True for any day that falls within the user's current selection.
  // Used to render the "between" highlight on the grid.
  const isDayInPickedRange = useCallback(
    (iso: string): boolean => {
      if (!startDate) return false;
      const rangeEnd = endDate ?? startDate;
      return iso >= startDate && iso <= rangeEnd;
    },
    [startDate, endDate],
  );

  // ---- onCellPress ----
  // Three branches:
  //   1. No start yet → set startDate, clear endDate.
  //   2. Start exists, tap is BEFORE start → restart selection with
  //      the new tap as startDate.
  //   3. Start exists, tap is AFTER start, end not yet set → set
  //      endDate. (Tap == start is a valid 1-night selection.)
  //   4. Both start AND end exist → reset to a new single-tap range
  //      starting at the tapped date.
  const onCellPress = (iso: string) => {
    if (!startDate || (startDate && endDate)) {
      onChange({ startDate: iso, endDate: null });
      return;
    }
    if (iso < startDate) {
      onChange({ startDate: iso, endDate: null });
      return;
    }
    // iso >= startDate && !endDate → set endDate.
    onChange({ startDate, endDate: iso });
  };

  // ---- canGoPrev / canGoNext ----
  // Cap navigation so the user can't scroll past minDate or maxDate.
  // Computed against the FIRST day of the visible month (prev) and
  // the LAST day (next) so clamps land naturally on month boundaries.
  const firstOfVisible = `${visibleYear}-${String(visibleMonth).padStart(2, '0')}-01`;
  const lastOfVisible = `${visibleYear}-${String(visibleMonth).padStart(2, '0')}-${String(daysInMonth(visibleYear, monthZero)).padStart(2, '0')}`;
  const canGoPrev = firstOfVisible > effectiveMin;
  const canGoNext = lastOfVisible < effectiveMax;

  const goPrev = () => {
    setVisibleYM(([y, m]) => (m === 1 ? [y - 1, 12] : [y, m - 1]));
  };
  const goNext = () => {
    setVisibleYM(([y, m]) => (m === 12 ? [y + 1, 1] : [y, m + 1]));
  };

  // ---- weeks ----
  // Build a 6-row × 7-col grid for the visible month. Cells before
  // the first-of-month and after the last-of-month are blanks (no
  // label, no interaction).
  const weeks = useMemo(() => {
    const total = daysInMonth(visibleYear, monthZero);
    const offset = firstWeekdayOfMonth(visibleYear, monthZero);
    const grid: ({ iso: string; day: number } | null)[][] = [];
    let week: ({ iso: string; day: number } | null)[] = [];
    // Leading blanks
    for (let i = 0; i < offset; i++) week.push(null);
    for (let day = 1; day <= total; day++) {
      const iso = `${visibleYear}-${String(visibleMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      week.push({ iso, day });
      if (week.length === 7) {
        grid.push(week);
        week = [];
      }
    }
    // Trailing blanks
    while (week.length > 0 && week.length < 7) week.push(null);
    if (week.length === 7) grid.push(week);
    // Pad to 6 rows so the grid height doesn't jump between months.
    while (grid.length < 6) grid.push(new Array(7).fill(null));
    return grid;
  }, [visibleYear, visibleMonth, monthZero]);

  // ---- labels ----
  // Month + weekday names from i18n. Founder-locked masculine register
  // in Arabic; weekday names start Sunday per native Date.getDay().
  const monthLabel = t(`calendar.month_${visibleMonth}`);
  const weekdayLabels = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    t(`calendar.weekday_${i}`),
  );

  // RTL ordering: in Arabic the calendar reads right-to-left within
  // each week, but the day NUMBERS stay in Latin per the founder
  // decision (Latin digits everywhere). We rely on the parent
  // RTL context for the visual row reversal — flex-direction: row
  // already flips under RTL — so no explicit reversal here.

  return (
    <View style={styles.container}>
      {/* Header with month label + nav arrows */}
      <View style={styles.header}>
        <Pressable
          onPress={goPrev}
          disabled={!canGoPrev}
          style={[styles.navButton, !canGoPrev && styles.navButtonDisabled]}
          accessibilityLabel={t('calendar.prev_month')}
        >
          <Text style={styles.navIcon}>
            {locale === 'ar' ? '›' : '‹'}
          </Text>
        </Pressable>
        <Text style={styles.headerLabel}>
          {monthLabel} {visibleYear}
        </Text>
        <Pressable
          onPress={goNext}
          disabled={!canGoNext}
          style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
          accessibilityLabel={t('calendar.next_month')}
        >
          <Text style={styles.navIcon}>
            {locale === 'ar' ? '‹' : '›'}
          </Text>
        </Pressable>
      </View>

      {/* Weekday header row */}
      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      {/* Day cells */}
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((cell, ci) => {
              if (!cell) {
                return <View key={ci} style={styles.cell} />;
              }
              const { iso, day } = cell;
              const blocked = isDayBlocked(iso);
              const outOfRange = iso < effectiveMin || iso > effectiveMax;
              const disabled = blocked || outOfRange;
              const inRange = !disabled && isDayInPickedRange(iso);
              const isStart = !disabled && iso === startDate;
              const isEnd = !disabled && iso === endDate;

              return (
                <Pressable
                  key={ci}
                  onPress={() => onCellPress(iso)}
                  disabled={disabled}
                  accessibilityLabel={iso}
                  accessibilityState={{ disabled }}
                  style={[
                    styles.cell,
                    inRange && styles.cellInRange,
                    (isStart || isEnd) && styles.cellEndpoint,
                    blocked && styles.cellBlocked,
                    outOfRange && !blocked && styles.cellOutOfRange,
                  ]}
                >
                  <Text
                    style={[
                      styles.cellLabel,
                      (isStart || isEnd) && styles.cellLabelEndpoint,
                      inRange &&
                        !isStart &&
                        !isEnd &&
                        styles.cellLabelInRange,
                      disabled && styles.cellLabelDisabled,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend — small footer that names the visual states.
          Without it the blocked/disabled greys can read as "this day
          doesn't exist" rather than "I can't pick this." */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.cellBlocked]} />
          <Text style={styles.legendText}>
            {t('calendar.legend_blocked')}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.cellEndpoint]} />
          <Text style={styles.legendText}>
            {t('calendar.legend_selected')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.whisper,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navIcon: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.ink,
    lineHeight: 18,
  },
  headerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.inkSoft,
  },
  grid: {
    gap: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  // Endpoint = selected start or end. Filled circle, accent color.
  cellEndpoint: {
    backgroundColor: colors.mossDeep,
  },
  cellLabelEndpoint: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  // In-range = days between the endpoints (inclusive of endpoints,
  // but the endpoint style overrides the in-range style for them).
  cellInRange: {
    backgroundColor: colors.whisper,
  },
  cellLabelInRange: {
    color: colors.ink,
  },
  // Blocked = host has marked this day as unavailable. Dimmed +
  // strikethrough-like visual via a slash overlay would be nicer,
  // but a subtle terracotta tint is enough for MVP.
  cellBlocked: {
    backgroundColor: colors.rose,
    opacity: 0.45,
  },
  // Out of range = past, or beyond the max-out window. Just dim.
  cellOutOfRange: {
    opacity: 0.25,
  },
  cellLabelDisabled: {
    color: colors.inkSoft,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
  },
});

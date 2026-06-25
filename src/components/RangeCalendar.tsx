// Custom range-picker calendar (2026-06-13).
//
// Why this file exists: the browser's native <input type="date">
// (used by DateField) can't be styled to show a connected range
// highlight between start and end. To get the "tap start → tap end,
// middle days highlighted as a band" UX, we build the calendar from
// scratch. No date library — just JS Date math.
//
// Selection rules:
//   1. First tap with no start  → set start
//   2. Tap < current start      → reset start to tapped, end null
//   3. Tap > start, end null    → set end, schedule onApplyComplete
//   4. Both set, any tap        → start new range (start=tapped, end=null)
//   5. Past dates               → disabled (no tap)
//
// Locale: month names + day-of-week headers localized. Week starts
// Saturday in Arabic (KSA convention), Sunday in English.

import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { todayIso } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type RangeCalendarProps = {
  /** 'yyyy-mm-dd' or null. */
  startDate: string | null;
  endDate: string | null;
  onChange: (next: { startDate: string | null; endDate: string | null }) => void;
  /**
   * Fires when both dates are set in the same selection burst.
   * Parent uses this to auto-close the modal (rule 4 of the spec).
   *
   * IMPORTANT: receives the fresh (start, end) explicitly so the
   * parent doesn't have to read its own (possibly-stale) state in
   * a setTimeout closure. Without this, the parent reading
   * `draftEnd` in a deferred callback can capture the pre-tap
   * snapshot and call onApply with endDate=null (closing the
   * modal with only the start set — the bug behind the reported
   * "tap end and nothing happens").
   */
  onRangeComplete?: (start: string, end: string) => void;
  /** Earliest selectable day, 'yyyy-mm-dd'. Defaults to today. */
  minDate?: string;
  /**
   * 2026-06-26 — half-open [start_date, end_date) ranges the host
   * has blocked. Days inside any range render dimmed (rose tint)
   * and are non-tappable. Matches the listing_blocked_dates
   * schema's half-open convention. Empty array = no blocks (the
   * home-page search hero passes empty).
   */
  blockedRanges?: { start_date: string; end_date: string }[];
};

export function RangeCalendar({
  startDate,
  endDate,
  onChange,
  onRangeComplete,
  minDate,
  blockedRanges,
}: RangeCalendarProps) {
  const { t, locale } = useTranslation();
  // 2026-06-26 — half-open isBlocked check. start_date inclusive,
  // end_date exclusive. Matches listing_blocked_dates schema and
  // src/lib/range-overlap.ts. The home-page search hero passes
  // no blocked ranges (empty array → never true).
  const isDayBlocked = (date: string): boolean => {
    if (!blockedRanges || blockedRanges.length === 0) return false;
    for (const r of blockedRanges) {
      if (date >= r.start_date && date < r.end_date) return true;
    }
    return false;
  };

  // viewMonth is a "yyyy-mm-01" anchor for the visible page. Init
  // from startDate, or today if none.
  const initialAnchor = monthAnchor(startDate ?? todayIso());
  const [viewMonth, setViewMonth] = useState<string>(initialAnchor);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const min = minDate ?? todayIso();

  const monthCells = useMemo(
    () => buildMonth(viewMonth, locale),
    [viewMonth, locale],
  );

  const onDayTap = (date: string) => {
    if (date < min) return; // past day, ignored

    // Rule 1: no start yet
    if (!startDate) {
      onChange({ startDate: date, endDate: null });
      return;
    }
    // Rule 2: tapped before the current start → reset to tapped
    if (date < startDate) {
      onChange({ startDate: date, endDate: null });
      return;
    }
    // Rule 3: have start, no end, tapped >= start
    if (!endDate) {
      if (date === startDate) return; // tapping the start day again is a no-op
      onChange({ startDate, endDate: date });
      // Pass the fresh values into the callback explicitly. The
      // setTimeout(0) defer lets React commit the onChange state
      // update before the parent's close handler runs.
      if (onRangeComplete) {
        setTimeout(() => onRangeComplete(startDate, date), 0);
      }
      return;
    }
    // Rule 4: both set → start a new range from tap
    onChange({ startDate: date, endDate: null });
  };

  // For the in-range highlight while the user is mid-selection
  // (start set, end null), web hovers preview the band ahead. On
  // native there's no hover — the visual feedback is the immediate
  // tap. The hoverDate state is set by onHoverIn on each day cell.
  const previewEnd =
    startDate && !endDate && hoverDate && hoverDate > startDate
      ? hoverDate
      : null;
  const effectiveEnd = endDate ?? previewEnd;

  const goPrevMonth = () => setViewMonth(addMonths(viewMonth, -1));
  const goNextMonth = () => setViewMonth(addMonths(viewMonth, 1));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={goPrevMonth} style={styles.navButton} accessibilityLabel={t('rangeCalendar.prev_month')}>
          <Text style={styles.navGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{formatMonth(viewMonth, locale)}</Text>
        <Pressable onPress={goNextMonth} style={styles.navButton} accessibilityLabel={t('rangeCalendar.next_month')}>
          <Text style={styles.navGlyph}>›</Text>
        </Pressable>
      </View>

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {weekdayLabels(locale).map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.grid}>
        {monthCells.map((cell, idx) => {
          if (!cell) {
            // Empty leading/trailing cell to align the first day to
            // its weekday column.
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }
          const { date, day } = cell;
          const isPast = date < min;
          // 2026-06-26 — host-blocked day. Visually rose-tinted +
          // non-tappable; same disabled treatment as past dates.
          const isBlocked = isDayBlocked(date);
          const isStart = startDate != null && date === startDate;
          const isEnd = endDate != null && date === endDate;
          const isInRange =
            startDate != null &&
            effectiveEnd != null &&
            date > startDate &&
            date < effectiveEnd;
          const isToday = date === todayIso();
          const isUnselectable = isPast || isBlocked;

          return (
            <Pressable
              key={date}
              onPress={() => onDayTap(date)}
              disabled={isUnselectable}
              style={[
                styles.dayCell,
                isInRange && styles.dayCellInRange,
                isBlocked && styles.dayCellBlocked,
              ]}
              {...(Platform.OS === 'web'
                ? {
                    onHoverIn: () => setHoverDate(date),
                    onHoverOut: () => setHoverDate(null),
                  }
                : {})}
            >
              <View
                style={[
                  styles.dayInner,
                  (isStart || isEnd) && styles.dayInnerEndpoint,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isPast && styles.dayTextPast,
                    isBlocked && styles.dayTextBlocked,
                    isToday && !isStart && !isEnd && styles.dayTextToday,
                    (isStart || isEnd) && styles.dayTextEndpoint,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Helper line */}
      <Text style={styles.hint}>
        {!startDate
          ? t('rangeCalendar.hint_pick_start')
          : !endDate
            ? t('rangeCalendar.hint_pick_end')
            : t('rangeCalendar.hint_complete')}
      </Text>
    </View>
  );
}

// ---------- date math helpers (pure, no library) ----------

type DayCell = { date: string; day: number };

/** First-day-of-month anchor for an ISO 'yyyy-mm-dd'. */
function monthAnchor(iso: string): string {
  return iso.slice(0, 8) + '01';
}

/** Shift a 'yyyy-mm-01' anchor by ±n months. */
function addMonths(anchor: string, n: number): string {
  const [y, m] = anchor.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${pad4(ny)}-${pad2(nm)}-01`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function pad4(n: number): string {
  return n.toString().padStart(4, '0');
}

/**
 * Build a flat 6×7 array of cells for the month-view grid. Cells
 * before the 1st and after the last day of the month are null
 * (padding so the actual days align to their weekday columns).
 *
 * Week-start convention:
 *   Arabic → Saturday (KSA)
 *   English → Sunday
 */
function buildMonth(
  anchor: string,
  locale: 'ar' | 'en',
): (DayCell | null)[] {
  const [y, m] = anchor.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  // 0 = Sun ... 6 = Sat. For week-start Saturday, lead = (firstWeekday + 1) % 7.
  // For week-start Sunday, lead = firstWeekday.
  const lead = locale === 'ar' ? (firstWeekday + 1) % 7 : firstWeekday;

  // Days in month — using day=0 of next month.
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${pad4(y)}-${pad2(m)}-${pad2(d)}`, day: d });
  }
  // Pad trailing cells to a multiple of 7 so the grid stays even.
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function weekdayLabels(locale: 'ar' | 'en'): string[] {
  if (locale === 'ar') {
    return ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']; // sat-sun-mon-tue-wed-thu-fri
  }
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

function formatMonth(anchor: string, locale: 'ar' | 'en'): string {
  const [y, m] = anchor.split('-').map(Number);
  const names =
    locale === 'ar'
      ? [
          'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ]
      : [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
  return `${names[m - 1]} ${y}`;
}

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.whisper,
  },
  navGlyph: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.ink,
    lineHeight: 20,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.mossDeep,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.inkSoft,
    paddingVertical: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // No background here — the in-range fill is on the cell so it
    // joins side-by-side. The endpoint circle is on dayInner.
  },
  dayCellInRange: {
    backgroundColor: colors.whisper,
  },
  // 2026-06-26 — host-blocked day. Soft rose tint, full cell width so
  // adjacent blocked days form a visible band like the in-range cells.
  dayCellBlocked: {
    backgroundColor: colors.rose,
    opacity: 0.35,
  },
  dayInner: {
    width: CELL_SIZE - 4,
    height: CELL_SIZE - 4,
    borderRadius: (CELL_SIZE - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInnerEndpoint: {
    backgroundColor: colors.mossDeep,
  },
  dayText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  dayTextPast: {
    color: colors.inkSoft,
    opacity: 0.4,
  },
  dayTextBlocked: {
    color: colors.inkSoft,
    textDecorationLine: 'line-through',
  },
  dayTextToday: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
  },
  dayTextEndpoint: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

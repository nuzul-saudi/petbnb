// <SkeletonCard> / <SkeletonList> — loading placeholders (Wave 1b, S5).
//
// List screens previously showed a bare "جارٍ التحميل…" text while
// fetching. This swaps that for card-shaped placeholders that match the
// real rows' footprint, so the layout doesn't jump when data lands.
//
// Deliberately STATIC (no shimmer animation): it sidesteps the
// reduced-motion question entirely (S9) and avoids an Animated loop.
// The muted whisper blocks read clearly as "loading" without motion.

import { StyleSheet, View } from 'react-native';

import { colors, radii, shadows, spacing } from '@/theme/tokens';

/** A single placeholder card: a title bar + two shorter lines. */
export function SkeletonCard() {
  return (
    <View style={styles.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bar, styles.barTitle]} />
      <View style={[styles.bar, styles.barWide]} />
      <View style={[styles.bar, styles.barNarrow]} />
    </View>
  );
}

/** N skeleton cards for a list loading state. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  bar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.whisper,
  },
  barTitle: {
    height: 16,
    width: '55%',
  },
  barWide: {
    width: '80%',
  },
  barNarrow: {
    width: '40%',
  },
});

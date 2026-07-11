// <EmptyState> — one empty-state block (Wave 1b, S5 / 2026-07-11).
//
// Every list screen hand-rolled its own "nothing here" centred block:
// some with a title only, some title+body, all with slightly different
// spacing and font sizes. This standardises them: an optional glyph, a
// title, an optional body line, and an optional CTA routed through the
// shared <Button>. Kept emoji-light per the house style — glyph is
// opt-in, not required.

import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fonts, spacing } from '@/theme/tokens';

export type EmptyStateProps = {
  /** Optional single glyph/emoji. Omit to stay text-only. */
  glyph?: string;
  title: string;
  body?: string;
  /** Optional primary action. */
  cta?: { label: string; onPress: () => void };
};

export function EmptyState({ glyph, title, body, cta }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {glyph ? <Text style={styles.glyph}>{glyph}</Text> : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {cta ? (
        <View style={styles.cta}>
          <Button label={cta.label} onPress={cta.onPress} variant="primary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  glyph: {
    fontSize: 40,
    lineHeight: 48,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  cta: {
    marginTop: spacing.md,
  },
});

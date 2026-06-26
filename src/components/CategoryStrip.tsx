// Top-level category strip (Move 2 — 2026-06-13). Airbnb pattern:
// horizontal icon + label tiles below the header. Three categories:
//
//   • Pet Hosts     — active, currently the only real surface
//   • Pet Services  — placeholder, "coming soon" overlay
//   • Merchandise   — placeholder, "coming soon" overlay
//
// The two placeholders aren't clickable into a broken state — taps
// are absorbed so the user can see the categories exist without
// being routed somewhere half-built. When the founder is ready to
// turn one on, replace `disabled: true` + `onPress: noop` with the
// real route.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type CategoryKey = 'pet_hosts' | 'pet_services' | 'merchandise';

type Category = {
  key: CategoryKey;
  emoji: string;
  /** When true the tile renders as "coming soon" and absorbs taps. */
  disabled: boolean;
};

const CATEGORIES: readonly Category[] = [
  { key: 'pet_hosts', emoji: '🏠', disabled: false },
  { key: 'pet_services', emoji: '🐾', disabled: true },
  { key: 'merchandise', emoji: '🛍️', disabled: true },
] as const;

type Props = {
  /** Currently-active category. Today this is always 'pet_hosts'
   *  (the only enabled tile) but the prop is here so callers can
   *  drive it once more categories light up. */
  active: CategoryKey;
  onSelect: (key: CategoryKey) => void;
};

export function CategoryStrip({ active, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {CATEGORIES.map((c) => {
        const isActive = c.key === active;
        return (
          <Pressable
            key={c.key}
            onPress={() => {
              if (c.disabled) return;
              onSelect(c.key);
            }}
            style={[styles.tile, c.disabled && styles.tileDisabled]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive, disabled: c.disabled }}
          >
            <Text
              style={[
                styles.emoji,
                c.disabled && styles.emojiDisabled,
              ]}
            >
              {c.emoji}
            </Text>
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
                c.disabled && styles.labelDisabled,
              ]}
            >
              {t(`category.${c.key}`)}
            </Text>
            {c.disabled ? (
              <Text style={styles.comingSoon}>
                {t('category.coming_soon')}
              </Text>
            ) : null}
            {isActive ? <View style={styles.activeUnderline} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xl,
  },
  // Tile = vertical stack (emoji over label) + an inline "coming
  // soon" hint under disabled tiles. Width is content-driven, no
  // fixed width — keeps long Arabic labels from clipping.
  tile: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs / 2,
  },
  tileDisabled: {
    // No pointer events change — Pressable's onPress is the absorber.
    // Visual cue handled by emoji + label opacity.
  },
  emoji: {
    fontSize: 22,
    // 2026-06-26 \xe2\x80\x94 bumped lineHeight from 26 to 32. iOS Safari (and
    // the WhatsApp in-app browser) renders system emojis like \xf0\x9f\x8f\xa0
    // \xf0\x9f\x90\xbe \xf0\x9f\x9b\x8d with intrinsic glyph heights that exceed a tight 26px
    // lineHeight, clipping the bottom of the emoji. 32 gives enough
    // breathing room across all platforms without visibly inflating
    // the tile spacing.
    lineHeight: 32,
  },
  emojiDisabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  labelActive: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
  },
  labelDisabled: {
    color: colors.inkSoft,
    opacity: 0.5,
  },
  comingSoon: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.goldDeep,
    backgroundColor: colors.whisper,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  // Underline under the active tile — Airbnb signature treatment.
  activeUnderline: {
    position: 'absolute',
    bottom: 0,
    left: spacing.sm,
    right: spacing.sm,
    height: 2,
    backgroundColor: colors.mossDeep,
    borderRadius: 1,
  },
});

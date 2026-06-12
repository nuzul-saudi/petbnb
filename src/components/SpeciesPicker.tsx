// Round 12 / Step 5.7 — species selector for the pet creation form.
//
// Two big tiles (cat 🐈 / dog 🐕). Locked to 'cat' on the EDIT path —
// a pet's species shouldn't change after creation (the breed picker
// already tied to the wrong species, vaccinations may be species-
// specific, etc.). The disabled prop renders the unselected tile as
// non-pressable + faded.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { SPECIES_LIST, type Species, speciesEmoji } from '@/lib/species';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type Props = {
  value: Species;
  onChange: (next: Species) => void;
  /** Edit mode locks species (see header comment). */
  disabled?: boolean;
};

export function SpeciesPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {SPECIES_LIST.map((s) => {
        const selected = value === s;
        return (
          <Pressable
            key={s}
            onPress={() => !disabled && onChange(s)}
            style={[
              styles.tile,
              selected && styles.tileSelected,
              disabled && !selected && styles.tileDisabled,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!disabled }}
          >
            <Text style={styles.emoji}>{speciesEmoji(s)}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {t(`species.${s}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.card,
  },
  tileSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  tileDisabled: {
    opacity: 0.4,
  },
  emoji: {
    fontSize: 32,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  labelSelected: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
  },
});

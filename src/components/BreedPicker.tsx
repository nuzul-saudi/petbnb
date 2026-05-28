// Horizontal scrollable breed picker. Each tile shows the breed photo +
// Arabic name. Two tiles double as free-text triggers:
//   - 'unknown' (BREEDS entry, labelled 'لا أعرف') — stays a structured
//     breed key for legacy data, but also reveals the inline text input
//     so users can refine if they want.
//   - 'other' (sentinel, NOT a BreedKey, labelled 'أخرى') — puts the
//     picker fully into free-text mode (breed=null, breedOther=<text>).
//
// Fully controlled: parents own both `breed` and `breedOther` via a single
// BreedSelection object. The picker emits one onChange with the next state
// on every interaction.

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { BREEDS, type BreedKey } from '@/lib/breeds';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export type BreedSelection = {
  breed: BreedKey | null;
  breedOther: string | null;
};

type Props = {
  value: BreedSelection;
  onChange: (next: BreedSelection) => void;
};

export function BreedPicker({ value, onChange }: Props) {
  const { t } = useTranslation();

  // The 'other' sentinel tile is selected when breed is null AND breedOther
  // has a value (even an empty string — that's "tile picked, not yet typed").
  const otherTileSelected =
    value.breed === null && value.breedOther !== null;

  // The inline free-text input shows when either of the two free-text
  // triggers is active.
  const showInput =
    value.breed === 'unknown' ||
    (value.breed === null && value.breedOther !== null);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {BREEDS.map((breed) => {
          const selected = value.breed === breed.key;
          return (
            <Pressable
              key={breed.key}
              onPress={() =>
                onChange({ breed: breed.key, breedOther: null })
              }
              style={[styles.tile, selected && styles.tileSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={styles.thumbContainer}>
                {breed.image ? (
                  <Image
                    source={breed.image}
                    style={styles.thumb}
                    contentFit="cover"
                    transition={120}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Text style={styles.unknownMark}>?</Text>
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={2}>
                {breed.name_ar}
              </Text>
            </Pressable>
          );
        })}

        {/* Sentinel 'other' tile — not in BREEDS. Selecting it switches
            the picker into free-text mode. The "+" mark distinguishes
            visually from the unknown tile's "?". */}
        <Pressable
          key="__other"
          onPress={() => onChange({ breed: null, breedOther: '' })}
          style={[styles.tile, otherTileSelected && styles.tileSelected]}
          accessibilityRole="radio"
          accessibilityState={{ selected: otherTileSelected }}
        >
          <View style={styles.thumbContainer}>
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Text style={styles.otherMark}>+</Text>
            </View>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {t('breed.other')}
          </Text>
        </Pressable>
      </ScrollView>

      {showInput ? (
        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>
            {t('breed.other_input_label')}
          </Text>
          <TextInput
            value={value.breedOther ?? ''}
            // Preserve the current `breed` while typing — keeps the
            // 'unknown' tile (or null for the 'other' tile) selected
            // without forcing a tile change.
            onChangeText={(text) =>
              onChange({ breed: value.breed, breedOther: text })
            }
            placeholder={t('breed.other_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  tile: {
    width: 96,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.whisper,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.card,
  },
  tileSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  thumbContainer: {
    width: 80,
    height: 80,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.whisper,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.whisper,
  },
  unknownMark: {
    fontFamily: fonts.headingBold,
    fontSize: 40,
    color: colors.inkSoft,
  },
  otherMark: {
    fontFamily: fonts.headingBold,
    fontSize: 40,
    color: colors.moss,
  },
  name: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink,
    textAlign: 'center',
    minHeight: 32,
  },
  inputWrap: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  inputLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.ink,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
  },
});

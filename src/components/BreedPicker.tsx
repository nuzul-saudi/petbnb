// Horizontal scrollable breed picker. Each tile shows the breed photo +
// Arabic name; the "unknown" tile renders a "?" tile because the founder
// chose to give owners an explicit "I don't know" option rather than force
// them to guess.
//
// Reusable; today it's only consumed by pets/[id].tsx, but the picker is
// stateless and parents own the selection so any future "advanced search"
// or admin-edit screen can drop it in.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { BREEDS, type BreedKey } from '@/lib/breeds';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type Props = {
  value: BreedKey | null;
  onChange: (key: BreedKey) => void;
};

export function BreedPicker({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    >
      {BREEDS.map((breed) => {
        const selected = value === breed.key;
        return (
          <Pressable
            key={breed.key}
            onPress={() => onChange(breed.key)}
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
                <View style={[styles.thumb, styles.thumbUnknown]}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  thumbUnknown: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.whisper,
  },
  unknownMark: {
    fontFamily: fonts.headingBold,
    fontSize: 40,
    color: colors.inkSoft,
  },
  name: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink,
    textAlign: 'center',
    minHeight: 32,
  },
});

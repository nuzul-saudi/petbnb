// Pet avatar with a 3-level fallback hierarchy:
//   1. photoUrl (the signed URL on pets.photo_url) — the real cat photo.
//   2. The breed's curated Wikimedia thumbnail when pet.breed maps to a
//      BREEDS entry that has an image. (BREEDS.unknown has image: null,
//      so it correctly falls through to step 3 — see breeds.ts.)
//   3. A 🐈 emoji on a tinted square.
//
// Pure display — no data fetching, no upload. Consumers pass current values.
// Size and rounding are prop-driven so the same component works for the
// small circular avatars in the My Cats list / booking picker AND the
// larger rounded-square thumb in the pet edit screen's photo section.

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { findBreed } from '@/lib/breeds';
import { colors } from '@/theme/tokens';

export type PetAvatarProps = {
  /** Signed URL from pets.photo_url. Highest-priority source. */
  photoUrl?: string | null;
  /** Structured breed key (pets.breed). Used for the breed-thumbnail fallback. */
  breed?: string | null;
  /** Square side in px. Default 56. */
  size?: number;
  /** Default true → fully circular (borderRadius = size/2). false → square corners. */
  rounded?: boolean;
  /** Optional passthrough; not auto-generated. */
  accessibilityLabel?: string;
};

export function PetAvatar({
  photoUrl,
  breed,
  size = 56,
  rounded = true,
  accessibilityLabel,
}: PetAvatarProps) {
  const boxStyle = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : 0,
  };

  // Level 1 — real photo.
  if (photoUrl && photoUrl.length > 0) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.base, boxStyle]}
        contentFit="cover"
        transition={120}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  // Level 2 — breed thumbnail. Only matches when the breed string maps
  // to a curated entry AND that entry has a non-null image. The 'unknown'
  // BREEDS entry has image=null on purpose, so it falls through.
  const breedEntry = findBreed(breed);
  if (breedEntry?.image) {
    return (
      <Image
        source={breedEntry.image}
        style={[styles.base, boxStyle]}
        contentFit="cover"
        transition={120}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  // Level 3 — 🐈 emoji on a tinted square. Emoji size scales with the box.
  return (
    <View
      style={[styles.base, styles.placeholder, boxStyle]}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={{ fontSize: size * 0.45 }}>🐈</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.whisper,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

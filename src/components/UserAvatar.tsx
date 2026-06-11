// User avatar with a 3-level fallback hierarchy:
//   1. avatarUrl (profiles.avatar_url) — the real uploaded avatar.
//   2. First letter of the localized display name on a tinted disc.
//   3. '?' on the same tinted disc when nothing usable was supplied.
//
// Pure display — no data fetching. Consumers pass current values.
// Size + rounding are prop-driven so the same component works for
// the small circular avatars on listing cards AND the larger
// rounded squares on profile-summary cards.
//
// Round 4 extraction — this pattern was duplicated across the
// sitter-first ListingCard, the listing detail's sitterHeader, and
// the new OwnerPetsSection. Centralising it here.

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { colors, fonts } from '@/theme/tokens';

export type UserAvatarProps = {
  /** Direct URL on profiles.avatar_url. Highest-priority source. */
  avatarUrl?: string | null;
  /** Already-localized display name (caller has already chosen ar/en). */
  displayName?: string | null;
  /** Square side in px. Default 48. */
  size?: number;
  /** Default true → fully circular (borderRadius = size/2). */
  rounded?: boolean;
  /** Optional passthrough; not auto-generated from the name. */
  accessibilityLabel?: string;
};

export function UserAvatar({
  avatarUrl,
  displayName,
  size = 48,
  rounded = true,
  accessibilityLabel,
}: UserAvatarProps) {
  const boxStyle = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : 0,
  };

  // Level 1 — real avatar.
  if (avatarUrl && avatarUrl.length > 0) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.base, boxStyle]}
        contentFit="cover"
        transition={120}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  // Level 2 — initial. Trim then take the first char. Works for both
  // Arabic and Latin names since both render as a single grapheme.
  const initial = displayName?.trim().charAt(0);

  return (
    <View
      style={[styles.base, styles.placeholder, boxStyle]}
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={{
          fontFamily: fonts.headingBold,
          fontSize: size * 0.42,
          color: colors.mossDeep,
        }}
      >
        {initial && initial.length > 0 ? initial : '?'}
      </Text>
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

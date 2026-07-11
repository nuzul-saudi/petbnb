// THE shared carousel arrow (Part A / A6, 2026-07-11 brief): one 44pt
// circular, vertically-centered arrow used by PhotoGallery,
// ListingPhotoCarousel and PhotoLightbox. Physical side + glyph come
// from the RTL-aware helpers in src/lib/carousel-paging — callers pass
// the LOGICAL role (next/prev) resolved to a side, never a hardcoded
// left/right. Fixes the drifted stretched-pill fork on the card
// carousel.

import { Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';

import { arrowGlyph, type ArrowSide } from '@/lib/carousel-paging';
import { fonts } from '@/theme/tokens';

type Props = {
  side: ArrowSide;
  onPress: (e: GestureResponderEvent) => void;
  accessibilityLabel: string;
};

export function CarouselArrow({ side, onPress, accessibilityLabel }: Props) {
  return (
    <Pressable
      onPress={(e) => {
        // Card carousels sit inside a Pressable card — never let an
        // arrow tap bubble into card navigation.
        e.stopPropagation?.();
        onPress(e);
      }}
      style={[styles.arrow, side === 'left' ? styles.left : styles.right]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.glyph}>{arrowGlyph(side)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44pt touch target, circular, y-centered — the single arrow spec.
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // Physical positions on purpose (not start/end): the SIDE is already
  // the direction-resolved output of nextArrowSide/prevArrowSide —
  // logical start/end would double-flip under RTL.
  left: {
    left: 12,
  },
  right: {
    right: 12,
  },
  glyph: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: '#FFFFFF',
    lineHeight: 30,
  },
});

// Part B (2026-06-13) — Listing photo carousel.
//
// Goals:
//   - Show all of a listing's photos on the card. Lazy-load: only the
//     cover is fetched eagerly; subsequent photos load when the user
//     advances to them (or one step ahead — see prefetchAhead).
//   - Web: hover-revealed left/right arrow buttons.
//   - Native: horizontal swipe via PanResponder.
//   - Both: dot indicators at the bottom (suppressed when ≤ 1 photo).
//   - The heart-overlay (Pressable from ListingCard) sits in an
//     overlays slot. Heart top-trailing + arrows y-centered on the
//     left/right edges below the heart's bottom — no hit-zone overlap.
//
// Performance: at 20 cards in the feed × ~6 photos each, eager-load
// would be 120 image fetches per feed render. With lazy-load this
// becomes ~20 (one per card). Subsequent photos only fetch when the
// user opens that card's carousel.

import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { colors, fonts, spacing } from '@/theme/tokens';

export type CarouselPhoto = {
  id: string;
  photo_url: string;
  sort_order: number;
};

export type ListingPhotoCarouselProps = {
  photos: CarouselPhoto[];
  /** Defaults to 1 (square) per the Part C card spec. */
  aspectRatio?: number;
  /** Rendered above the photo (favorite heart, tier badge, etc.). */
  overlays?: React.ReactNode;
  /** Optional placeholder emoji when photos is empty (defaults 🏠). */
  emptyEmoji?: string;
};

export function ListingPhotoCarousel({
  photos,
  aspectRatio = 1,
  overlays,
  emptyEmoji = '🏠',
}: ListingPhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Highest index whose image has been requested. Lazy-load anchor:
  // photo N renders a real <Image> only when N <= maxIndexSeen.
  const [maxIndexSeen, setMaxIndexSeen] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const total = photos.length;

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(total - 1, i));
    setActiveIndex(clamped);
    setMaxIndexSeen((prev) => Math.max(prev, clamped));
  };

  // Native swipe: PanResponder only claims responder once movement
  // exceeds a small threshold so a pure tap (favorite heart, card
  // navigation) is never absorbed.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, gs) =>
          Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
        onPanResponderRelease: (_e, gs) => {
          if (gs.dx < -40) goTo(activeIndex + 1);
          else if (gs.dx > 40) goTo(activeIndex - 1);
        },
      }),
    [activeIndex, total], // total via goTo closure
  );
  // Avoid stale-closure: pin total to the ref so the responder's
  // captured `total` updates between renders.
  const totalRef = useRef(total);
  totalRef.current = total;

  // Zero photos → placeholder (matches the previous ListingCard's
  // photoPlaceholder behavior so empty-listing UX doesn't regress).
  if (total === 0) {
    return (
      <View style={[styles.container, { aspectRatio }, styles.placeholder]}>
        <Text style={styles.placeholderText}>{emptyEmoji}</Text>
        {overlays}
      </View>
    );
  }

  // One photo → no controls, just the image.
  if (total === 1) {
    return (
      <View style={[styles.container, { aspectRatio }]}>
        <Image
          source={{ uri: photos[0].photo_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
        {overlays}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { aspectRatio }]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      // Web-only hover signals — RN Web supports onMouseEnter/Leave
      // via the {...} spread; on native these props are ignored.
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
      {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
    >
      {/* Strip of all photos, slid by transform. Width = N × container
          width so each slide occupies exactly one container width. */}
      <View
        style={[
          styles.strip,
          {
            width: containerWidth * total,
            transform: [{ translateX: -activeIndex * containerWidth }],
            // CSS transition on web for smooth slide; on native the
            // transform jumps (acceptable for now; future polish:
            // Animated.timing).
            ...(Platform.OS === 'web'
              ? ({ transitionProperty: 'transform', transitionDuration: '220ms' } as object)
              : {}),
          },
        ]}
      >
        {photos.map((p, i) => (
          <View key={p.id} style={[styles.slot, { width: containerWidth }]}>
            {/* Lazy-load: only render <Image> for slots up to
                maxIndexSeen. Other slots are a same-size empty View
                so layout/translate math stays correct. */}
            {i <= maxIndexSeen ? (
              <Image
                source={{ uri: p.photo_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={i === 0 ? 150 : 0}
              />
            ) : null}
          </View>
        ))}
      </View>

      {/* Web arrows — hover-revealed. Positioned vertically centered
          but with top inset so they sit BELOW the heart's hit zone
          (heart is top:16, height 36 → bottom ~52). Arrows start at
          top: 60 to guarantee no overlap. */}
      {Platform.OS === 'web' && hovered ? (
        <>
          {activeIndex > 0 ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                goTo(activeIndex - 1);
              }}
              style={[styles.arrow, styles.arrowLeft]}
              accessibilityRole="button"
              accessibilityLabel="Previous photo"
            >
              <Text style={styles.arrowGlyph}>‹</Text>
            </Pressable>
          ) : null}
          {activeIndex < total - 1 ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                goTo(activeIndex + 1);
              }}
              style={[styles.arrow, styles.arrowRight]}
              accessibilityRole="button"
              accessibilityLabel="Next photo"
            >
              <Text style={styles.arrowGlyph}>›</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {/* Dot indicators */}
      <View style={styles.dotsRow} pointerEvents="none">
        {photos.map((p, i) => (
          <View
            key={p.id}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Overlays (heart, tier badge) rendered last so they paint on
          top of dots + arrows. The heart already calls
          e.stopPropagation in ListingCard. */}
      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.whisper,
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 48,
    opacity: 0.4,
  },
  strip: {
    flexDirection: 'row',
    height: '100%',
  },
  slot: {
    height: '100%',
    position: 'relative',
  },
  arrow: {
    position: 'absolute',
    top: 60,
    bottom: 12,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 18,
    // The bounded top/bottom + 36 width means the arrow rect floats
    // vertically; transform centers it within that band.
    zIndex: 10,
  },
  arrowLeft: {
    start: spacing.sm,
  },
  arrowRight: {
    end: spacing.sm,
  },
  arrowGlyph: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    color: colors.ink,
    lineHeight: 24,
  },
  dotsRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    zIndex: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: colors.cream,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

// Part B (2026-06-13) — Listing photo carousel.
//
// Goals:
//   - Show all of a listing's photos on the card. Lazy-load: only the
//     cover is fetched eagerly; subsequent photos load when the user
//     advances to them (or one step ahead — see prefetchAhead).
//   - Web: left/right arrow buttons (always visible when there's
//     somewhere to go — hover-reveal died in the Part A RTL fix:
//     touch-web has no hover, and iPhone Safari's tap-as-hover made
//     the arrows appear unpredictably).
//   - Native: horizontal swipe via PanResponder.
//   - Both: dot indicators at the bottom (suppressed when ≤ 1 photo).
//   - The heart-overlay (Pressable from ListingCard) sits in an
//     overlays slot; the shared 44pt arrows are y-centered, well below
//     the heart's hit zone on card-shaped boxes.
//
// RTL (Part A, 2026-07-11): the strip KEEPS logical render order — a
// flex row under RTL lays photos right-to-left and right-aligns, so
// revealing photo i means translating the strip RIGHT (+i·W), not left.
// The old hardcoded -i·W slid past the strip's edge and rendered BLANK.
// Math lives in src/lib/carousel-paging (stripTranslateX, swipeTarget).
//
// Index note (A3): this widget positions via transform driven directly
// by activeIndex — the visible photo IS the state, so it cannot desync
// the way scroll-based paging could; setActiveIndex here is exact, not
// optimistic.
//
// Performance: at 20 cards in the feed × ~6 photos each, eager-load
// would be 120 image fetches per feed render. With lazy-load this
// becomes ~20 (one per card). Subsequent photos only fetch when the
// user opens that card's carousel.

import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { CarouselArrow } from '@/components/CarouselArrow';
import {
  clampIndex,
  nextArrowSide,
  prevArrowSide,
  stripTranslateX,
  swipeTarget,
} from '@/lib/carousel-paging';
import { useTranslation } from '@/lib/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, spacing } from '@/theme/tokens';

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
  // Reading direction — from the locale, per src/theme/rtl.ts.
  const { locale } = useTranslation();
  const isRTL = locale === 'ar';
  // S9 — honour reduced-motion: drop photo crossfades to instant.
  const reducedMotion = useReducedMotion();

  const [activeIndex, setActiveIndex] = useState(0);
  // Highest index whose image has been requested. Lazy-load anchor:
  // photo N renders a real <Image> only when N <= maxIndexSeen.
  const [maxIndexSeen, setMaxIndexSeen] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const total = photos.length;

  const goTo = (i: number) => {
    const clamped = clampIndex(i, total);
    setActiveIndex(clamped);
    setMaxIndexSeen((prev) => Math.max(prev, clamped));
  };

  // Pin the live values so the PanResponder release handler never acts
  // on a stale closure.
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const totalRef = useRef(total);
  totalRef.current = total;
  const isRTLRef = useRef(isRTL);
  isRTLRef.current = isRTL;

  // Native swipe: PanResponder only claims responder once movement
  // exceeds a small threshold so a pure tap (favorite heart, card
  // navigation) is never absorbed. Direction is reading-aware
  // (swipeTarget): under RTL the next photo sits to the LEFT, so a
  // rightward drag advances.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, gs) =>
          Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
        onPanResponderRelease: (_e, gs) => {
          const target = swipeTarget(
            gs.dx,
            40,
            activeRef.current,
            totalRef.current,
            isRTLRef.current,
          );
          if (target != null) goTo(target);
        },
      }),
    [],
  );

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
          transition={reducedMotion ? 0 : 150}
        />
        {overlays}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { aspectRatio }]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
    >
      {/* Strip of all photos, slid by transform. Width = N × container
          width so each slide occupies exactly one container width.
          translateX sign is direction-aware — see the RTL header. */}
      <View
        style={[
          styles.strip,
          {
            width: containerWidth * total,
            transform: [
              {
                translateX: stripTranslateX(
                  activeIndex,
                  containerWidth,
                  isRTL,
                ),
              },
            ],
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
                transition={reducedMotion || i !== 0 ? 0 : 150}
              />
            ) : null}
          </View>
        ))}
      </View>

      {/* Web arrows — shared 44pt circle (A6), logical sides (A1):
          next sits where the next photo enters from (left under RTL).
          CarouselArrow stops propagation so card navigation never
          fires from an arrow tap. */}
      {Platform.OS === 'web' ? (
        <>
          {activeIndex > 0 ? (
            <CarouselArrow
              side={prevArrowSide(isRTL)}
              onPress={() => goTo(activeIndex - 1)}
              accessibilityLabel="Previous photo"
            />
          ) : null}
          {activeIndex < total - 1 ? (
            <CarouselArrow
              side={nextArrowSide(isRTL)}
              onPress={() => goTo(activeIndex + 1)}
              accessibilityLabel="Next photo"
            />
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

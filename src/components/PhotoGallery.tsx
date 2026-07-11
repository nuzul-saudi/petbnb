import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';

import { CarouselArrow } from '@/components/CarouselArrow';
import {
  clampIndex,
  logicalToRaw,
  nextArrowSide,
  offsetForLogical,
  prevArrowSide,
  rawPageFromOffset,
} from '@/lib/carousel-paging';
import { useTranslation } from '@/lib/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors } from '@/theme/tokens';

type Photo = { id: string; photo_url: string };

type Props = {
  photos: Photo[];
  /**
   * Optional aspect ratio (width / height). Defaults to the design-
   * kit's 5:2 — matches ListingCard's cover thumbnail
   * (.claude/skills/petbnb-design/components/listings/ListingCard.jsx).
   * The listing-detail hero overrides this to 4/3 so the home photo
   * gets more vertical space — owners want to see the place, not a
   * strip of it. New callers should pass their own ratio explicitly;
   * the default exists so a misconfigured caller still renders a
   * recognisable shape.
   */
  aspectRatio?: number;
  /**
   * Optional fixed height in px. When passed, overrides aspectRatio
   * entirely — width fills the viewport, the gallery becomes a
   * fixed-height strip regardless of viewport. Used only by the admin
   * listing screen, which wants a tighter 220px strip. Prefer
   * aspectRatio for everything else.
   */
  height?: number;
};

// Default aspect ratio when no caller override is supplied. Mirrors
// the card thumbnail so a misconfigured caller still feels in-family.
const DEFAULT_ASPECT = 5 / 2;

// Desktop caps. Without them, on a wide browser viewport the natural
// aspect-based size grows unbounded (e.g. 4:3 at 1920px wide → 1440px
// tall — half the laptop screen). Both caps apply independently; the
// tighter one wins. For 5:2 the width cap bites first; for 4:3 (taller)
// the height cap bites first.
const MAX_GALLERY_WIDTH = 1100;
const MAX_GALLERY_HEIGHT = 520;

export function PhotoGallery({
  photos,
  aspectRatio = DEFAULT_ASPECT,
  height,
}: Props) {
  // Reading direction — from the locale, per src/theme/rtl.ts
  // (I18nManager.isRTL doesn't track web direction changes).
  const { locale } = useTranslation();
  const isRTL = locale === 'ar';
  // S9 — honour reduced-motion: drop the crossfade to an instant swap.
  const reducedMotion = useReducedMotion();

  // useWindowDimensions is reactive on web — the gallery re-measures if
  // the browser is resized. Dimensions.get('window') would freeze at
  // mount and the hero would stay stale until the next render.
  const { width: viewportWidth } = useWindowDimensions();

  // Resolve render box. Two modes:
  //   • height passed → fixed-strip mode (admin listing screen, 220px).
  //     Width fills the viewport, aspect ratio is whatever you get.
  //   • height omitted → aspect-ratio mode with both caps.
  let renderWidth: number;
  let renderHeight: number;
  if (height != null) {
    renderWidth = viewportWidth;
    renderHeight = height;
  } else {
    renderWidth = viewportWidth;
    renderHeight = renderWidth / aspectRatio;
    if (renderHeight > MAX_GALLERY_HEIGHT) {
      renderHeight = MAX_GALLERY_HEIGHT;
      renderWidth = renderHeight * aspectRatio;
    }
    if (renderWidth > MAX_GALLERY_WIDTH) {
      renderWidth = MAX_GALLERY_WIDTH;
      renderHeight = renderWidth / aspectRatio;
    }
  }

  const total = photos.length;

  // `index` is LOGICAL (reading order: 0 = first photo) and is written
  // ONLY from scroll events (A3 — no optimistic writes; the visible
  // photo is the single source of truth). Arrows just request a scroll.
  const [index, setIndex] = useState(0);
  const indexRef = useRef(index);
  indexRef.current = index;
  const scrollRef = useRef<ScrollView | null>(null);

  // RTL strategy (Part A, 2026-07-11 — see docs/batch-decisions.md):
  // browsers disagree about RTL scroll geometry, so the strip is FORCED
  // to LTR (style direction:'ltr') and photos render in RAW order —
  // reversed under RTL so the first photo sits at the visual right,
  // where an RTL reader starts. All offset math stays positive LTR;
  // logical↔raw mapping happens in the pure helpers.
  const rawPhotos = isRTL ? [...photos].reverse() : photos;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const raw = rawPageFromOffset(
      e.nativeEvent.contentOffset.x,
      renderWidth,
      total,
    );
    const logical = logicalToRaw(raw, total, isRTL);
    if (logical !== indexRef.current) setIndex(logical);
  };

  const scrollToLogical = (logical: number, animated: boolean) => {
    scrollRef.current?.scrollTo({
      x: offsetForLogical(logical, total, renderWidth, isRTL),
      animated,
    });
  };

  // Keep the strip aligned to the current logical photo when geometry
  // changes: mount (RTL starts at raw N-1 → needs an initial jump),
  // browser resize (page width changes), photo-set change.
  useEffect(() => {
    scrollToLogical(clampIndex(indexRef.current, total), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRTL, renderWidth, total]);

  const goPrev = () => scrollToLogical(clampIndex(index - 1, total), true);
  const goNext = () => scrollToLogical(clampIndex(index + 1, total), true);

  // alignSelf:'center' is a no-op on mobile (where renderWidth ===
  // viewportWidth) and centers the gallery on desktop (where the
  // maxWidth cap leaves margin on either side).
  const containerStyle = {
    width: renderWidth,
    height: renderHeight,
    alignSelf: 'center' as const,
  };

  if (total === 0) {
    return <View style={[styles.placeholder, containerStyle]} />;
  }

  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  return (
    <View style={containerStyle}>
      <ScrollView
        ref={scrollRef}
        // LTR-forced geometry — the RTL adaptation is the reversed
        // rawPhotos order, not the scroll direction. See RTL strategy
        // comment above.
        style={styles.stripLTR}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          // First layout after mount — align to the logical index
          // (raw N-1 in RTL; offset 0 is the WRONG photo there).
          scrollToLogical(clampIndex(indexRef.current, total), false);
        }}
      >
        {rawPhotos.map((p) => (
          <Image
            key={p.id}
            source={{ uri: p.photo_url }}
            style={{ width: renderWidth, height: renderHeight }}
            contentFit="cover"
            transition={reducedMotion ? 0 : 150}
          />
        ))}
      </ScrollView>

      {/* Logical arrows (A1): exactly one on the first/last photo, on
          the side the target photo visually enters from — next is LEFT
          under RTL. Shared 44pt circle (A6). */}
      {canPrev ? (
        <CarouselArrow
          side={prevArrowSide(isRTL)}
          onPress={goPrev}
          accessibilityLabel="Previous photo"
        />
      ) : null}
      {canNext ? (
        <CarouselArrow
          side={nextArrowSide(isRTL)}
          onPress={goNext}
          accessibilityLabel="Next photo"
        />
      ) : null}

      {photos.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.whisper,
  },
  stripLTR: {
    direction: 'ltr',
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: colors.cream,
    width: 12,
  },
});

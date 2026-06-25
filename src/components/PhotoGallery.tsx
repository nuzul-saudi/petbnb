import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';

import { colors, fonts } from '@/theme/tokens';

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
  // useWindowDimensions is reactive on web — the gallery re-measures if
  // the browser is resized. Dimensions.get('window') would freeze at
  // mount and the hero would stay stale until the next render.
  const { width: viewportWidth } = useWindowDimensions();

  // Resolve render box. Two modes:
  //   • height passed → fixed-strip mode (admin listing screen, 220px).
  //     Width fills the viewport, aspect ratio is whatever you get.
  //   • height omitted → aspect-ratio mode with both caps.
  //
  // In aspect mode: start with natural (viewport × viewport/aspect),
  // then clamp height if it exceeds MAX_GALLERY_HEIGHT (recomputing
  // width to preserve aspect), then clamp width if still over
  // MAX_GALLERY_WIDTH. Whichever cap binds first wins. For 5:2 the
  // width cap binds first on desktop; for 4:3 the height cap does.
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

  const [index, setIndex] = useState(0);
  // 2026-06-26 — desktop browsers don't expose a usable affordance
  // for horizontally swiping a paging ScrollView. Add a ref so the
  // arrow buttons can programmatically scrollTo the prev/next page.
  const scrollRef = useRef<ScrollView | null>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    // Page width matches each image's renderWidth, so dividing the
    // scroll offset by it yields the active page index.
    const i = Math.round(x / renderWidth);
    if (i !== index) setIndex(i);
  };

  const goPrev = () => {
    if (index === 0) return;
    const next = index - 1;
    setIndex(next);
    scrollRef.current?.scrollTo({ x: next * renderWidth, animated: true });
  };
  const goNext = () => {
    if (index >= photos.length - 1) return;
    const next = index + 1;
    setIndex(next);
    scrollRef.current?.scrollTo({ x: next * renderWidth, animated: true });
  };

  // alignSelf:'center' is a no-op on mobile (where renderWidth ===
  // viewportWidth) and centers the gallery on desktop (where the
  // maxWidth cap leaves margin on either side).
  const containerStyle = {
    width: renderWidth,
    height: renderHeight,
    alignSelf: 'center' as const,
  };

  if (photos.length === 0) {
    return <View style={[styles.placeholder, containerStyle]} />;
  }

  const canPrev = photos.length > 1 && index > 0;
  const canNext = photos.length > 1 && index < photos.length - 1;

  return (
    <View style={containerStyle}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {photos.map((p) => (
          <Image
            key={p.id}
            source={{ uri: p.photo_url }}
            style={{ width: renderWidth, height: renderHeight }}
            contentFit="cover"
            transition={150}
          />
        ))}
      </ScrollView>

      {/* 2026-06-26 — prev / next arrow buttons. Desktop users
          can't swipe a paging ScrollView with a mouse, so the dots
          alone are confusing. Arrows only render when there's more
          than one photo and there's somewhere to go. */}
      {canPrev ? (
        <Pressable
          onPress={goPrev}
          style={[styles.arrow, styles.arrowLeft]}
          accessibilityRole="button"
          accessibilityLabel="Previous photo"
        >
          <Text style={styles.arrowGlyph}>‹</Text>
        </Pressable>
      ) : null}
      {canNext ? (
        <Pressable
          onPress={goNext}
          style={[styles.arrow, styles.arrowRight]}
          accessibilityRole="button"
          accessibilityLabel="Next photo"
        >
          <Text style={styles.arrowGlyph}>›</Text>
        </Pressable>
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
  // 2026-06-26 — prev / next arrow buttons. Sized for both touch
  // (44pt) and mouse target. Subtle background tint that doesn't
  // compete with the photo content but stays visible against any
  // image.
  arrow: {
    position: 'absolute',
    top: '50%',
    width: 44,
    height: 44,
    marginTop: -22,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 12,
  },
  arrowRight: {
    right: 12,
  },
  arrowGlyph: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: '#FFFFFF',
    lineHeight: 28,
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

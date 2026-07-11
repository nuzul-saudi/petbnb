// Full-screen photo viewer (2026-06-13).
//
// Opens from the listing-detail mosaic or the "+N photos" button.
// Shows one photo at a time at full viewport size with a counter
// (3 / 7) and a close (X) button. Swipe on native, arrow buttons
// on web. Lazy-loads neighbours of the active index so opening on
// photo 5 of 30 doesn't fetch the other 28.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { CarouselArrow } from '@/components/CarouselArrow';
import {
  nextArrowSide,
  prevArrowSide,
  swipeTarget,
} from '@/lib/carousel-paging';
import { toArabicDigits } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, spacing } from '@/theme/tokens';

export type LightboxPhoto = {
  id: string;
  photo_url: string;
};

export type PhotoLightboxProps = {
  visible: boolean;
  photos: LightboxPhoto[];
  /** 0-based index to show on open. */
  initialIndex: number;
  onClose: () => void;
};

export function PhotoLightbox({
  visible,
  photos,
  initialIndex,
  onClose,
}: PhotoLightboxProps) {
  const { t, locale } = useTranslation();
  // Reading direction — from the locale, per src/theme/rtl.ts.
  const isRTL = locale === 'ar';

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Lazy-load anchor — keep a Set of indices the user has visited
  // (plus immediate neighbours, prefetched one step out).
  const [loaded, setLoaded] = useState<Set<number>>(
    () => new Set([initialIndex]),
  );

  // Sync open-from-elsewhere: if the parent passes a different
  // initialIndex while already visible, jump there.
  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      setLoaded(
        (prev) =>
          new Set([...prev, initialIndex, initialIndex - 1, initialIndex + 1]),
      );
    }
  }, [visible, initialIndex]);

  const total = photos.length;
  const safeIndex = Math.max(0, Math.min(total - 1, activeIndex));

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(total - 1, i));
    setActiveIndex(next);
    // Prefetch one step ahead in both directions to smooth swipe UX.
    setLoaded(
      (prev) => new Set([...prev, next, next - 1, next + 1]),
    );
  };

  // Native swipe. Same threshold as the carousel — a 6px move
  // claims the responder so a tap on Close passes through.
  const totalRef = useRef(total);
  totalRef.current = total;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, gs) =>
          Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
        onPanResponderRelease: (_e, gs) => {
          // Reading-direction-aware (Part A): under RTL the next photo
          // is to the LEFT, so a rightward drag advances.
          const target = swipeTarget(gs.dx, 40, safeIndex, total, isRTL);
          if (target != null) goTo(target);
        },
      }),
    [safeIndex, total, isRTL],
  );

  if (total === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={styles.root}
        {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      >
        {/* Close + counter — top bar, always visible. */}
        <View style={styles.topBar}>
          <Text style={styles.counter}>
            {locale === 'ar' ? toArabicDigits(safeIndex + 1) : safeIndex + 1} /{' '}
            {locale === 'ar' ? toArabicDigits(total) : total}
          </Text>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('lightbox.close')}
          >
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        </View>

        {/* The active photo — full-bleed centered, lazy-loaded. The
            inactive slots aren't rendered at all (modal contains
            just the one Image) so memory stays bounded. */}
        <View style={styles.stage}>
          {loaded.has(safeIndex) ? (
            <Image
              source={{ uri: photos[safeIndex].photo_url }}
              style={styles.image}
              contentFit="contain"
              transition={120}
            />
          ) : null}
        </View>

        {/* Web arrow nav — always visible (no hover needed here
            since the lightbox is modal and there's no card under
            it competing for the same edges). Native uses swipe. */}
        {Platform.OS === 'web' && total > 1 ? (
          <>
            {safeIndex > 0 ? (
              <CarouselArrow
                side={prevArrowSide(isRTL)}
                onPress={() => goTo(safeIndex - 1)}
                accessibilityLabel="Previous photo"
              />
            ) : null}
            {safeIndex < total - 1 ? (
              <CarouselArrow
                side={nextArrowSide(isRTL)}
                onPress={() => goTo(safeIndex + 1)}
                accessibilityLabel="Next photo"
              />
            ) : null}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    zIndex: 10,
  },
  counter: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  closeGlyph: {
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    color: colors.cream,
    lineHeight: 26,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 56 + spacing.lg,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

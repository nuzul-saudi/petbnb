// Listing-detail photo mosaic (2026-06-13).
//
// Airbnb-pattern hero block. Four layout cases driven by photo count:
//
//   0  → 🏠 placeholder (full-width, 16:9)
//   1  → single full-width 4:3 hero
//   2  → side-by-side 50/50 (each square)
//   3  → hero on the leading edge (50%) + 2 tiles stacked on the
//        trailing edge (each 50% width, 50% height of the row)
//   4+ → hero on the leading edge (50%) + 2×2 grid of 4 tiles on the
//        trailing edge. When count > 5, the bottom-trailing tile shows
//        a "+N photos" overlay so the user knows there's more.
//
// Every tile is tappable and reports its absolute photo index back to
// the parent (which opens the PhotoLightbox at that index). The
// "+N photos" overlay opens at the index of the LAST visible tile —
// not at index 0 — so the user lands closer to the unseen photos.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type MosaicPhoto = {
  id: string;
  photo_url: string;
};

export type PhotoMosaicProps = {
  photos: MosaicPhoto[];
  /** Fires with the absolute index in `photos` that was tapped. */
  onPressPhoto: (index: number) => void;
  /** Aspect ratio of the whole mosaic block. Defaults to 2:1. */
  aspectRatio?: number;
};

export function PhotoMosaic({
  photos,
  onPressPhoto,
  aspectRatio = 2,
}: PhotoMosaicProps) {
  const { t } = useTranslation();
  const total = photos.length;

  // ── 0 photos ──────────────────────────────
  if (total === 0) {
    return (
      <View style={[styles.placeholder, { aspectRatio }]}>
        <Text style={styles.placeholderGlyph}>🏠</Text>
      </View>
    );
  }

  // ── 1 photo: full-width 4:3 hero ──────────
  if (total === 1) {
    return (
      <Pressable
        onPress={() => onPressPhoto(0)}
        style={[styles.solo, { aspectRatio: 4 / 3 }]}
      >
        <Image
          source={{ uri: photos[0].photo_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      </Pressable>
    );
  }

  // ── 2 photos: side-by-side ────────────────
  if (total === 2) {
    return (
      <View style={[styles.row, { aspectRatio }]}>
        <Tile photo={photos[0]} onPress={() => onPressPhoto(0)} flex={1} />
        <Tile photo={photos[1]} onPress={() => onPressPhoto(1)} flex={1} />
      </View>
    );
  }

  // ── 3 photos: hero + 2 stacked ────────────
  if (total === 3) {
    return (
      <View style={[styles.row, { aspectRatio }]}>
        <Tile photo={photos[0]} onPress={() => onPressPhoto(0)} flex={1} />
        <View style={styles.column}>
          <Tile photo={photos[1]} onPress={() => onPressPhoto(1)} flex={1} />
          <Tile photo={photos[2]} onPress={() => onPressPhoto(2)} flex={1} />
        </View>
      </View>
    );
  }

  // ── 4+ photos: hero + 2×2 grid ────────────
  // The 4 grid tiles show photos[1..4]. With 5+ total, the last
  // tile overlays "+N photos" pointing at the remainder.
  const remaining = total - 5;
  const gridTiles = photos.slice(1, 5);
  // Pad the grid up to 4 tiles when total === 4 — only 3 grid
  // tiles available (photos[1..3]); render an empty placeholder
  // for the 4th so the 2×2 stays square. Keeps the visual rhythm
  // identical at 4 and 5+ counts.
  const lastTileIndex = Math.min(4, total - 1);

  return (
    <View style={[styles.row, { aspectRatio }]}>
      <Tile photo={photos[0]} onPress={() => onPressPhoto(0)} flex={1} />
      <View style={styles.gridRight}>
        <View style={styles.gridRow}>
          {gridTiles[0] ? (
            <Tile
              photo={gridTiles[0]}
              onPress={() => onPressPhoto(1)}
              flex={1}
            />
          ) : (
            <View style={styles.emptyTile} />
          )}
          {gridTiles[1] ? (
            <Tile
              photo={gridTiles[1]}
              onPress={() => onPressPhoto(2)}
              flex={1}
            />
          ) : (
            <View style={styles.emptyTile} />
          )}
        </View>
        <View style={styles.gridRow}>
          {gridTiles[2] ? (
            <Tile
              photo={gridTiles[2]}
              onPress={() => onPressPhoto(3)}
              flex={1}
            />
          ) : (
            <View style={styles.emptyTile} />
          )}
          {gridTiles[3] ? (
            <Pressable
              onPress={() => onPressPhoto(lastTileIndex)}
              style={styles.lastTile}
            >
              <Image
                source={{ uri: gridTiles[3].photo_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
              />
              {remaining > 0 ? (
                <View style={styles.moreOverlay}>
                  <Text style={styles.moreOverlayText}>
                    {t('listing.photos_plus', { n: remaining })}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <View style={styles.emptyTile} />
          )}
        </View>
      </View>
    </View>
  );
}

function Tile({
  photo,
  onPress,
  flex,
}: {
  photo: MosaicPhoto;
  onPress: () => void;
  flex: number;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tile, { flex }]}>
      <Image
        source={{ uri: photo.photo_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={150}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: '100%',
    backgroundColor: colors.whisper,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  placeholderGlyph: {
    fontSize: 64,
    opacity: 0.4,
  },
  solo: {
    width: '100%',
    backgroundColor: colors.whisper,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.xs,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
    flexDirection: 'column',
    gap: spacing.xs,
  },
  gridRight: {
    flex: 1,
    flexDirection: 'column',
    gap: spacing.xs,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tile: {
    backgroundColor: colors.whisper,
    overflow: 'hidden',
  },
  lastTile: {
    flex: 1,
    backgroundColor: colors.whisper,
    overflow: 'hidden',
  },
  emptyTile: {
    flex: 1,
    backgroundColor: colors.whisper,
  },
  // "+N photos" overlay rides on the last grid tile when total > 5.
  // Translucent dark wash so the underlying image is still readable
  // (helps the user see "yes, there ARE more photos here").
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreOverlayText: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.cream,
  },
});

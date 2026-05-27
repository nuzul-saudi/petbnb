import { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';

import { colors } from '@/theme/tokens';

type Photo = { id: string; photo_url: string };

type Props = {
  photos: Photo[];
  height?: number;
};

export function PhotoGallery({ photos, height = 280 }: Props) {
  // Width per page = the gallery container width (the parent's). We use the
  // screen width as an upper bound on web; on native this matches the
  // device width which is what we want.
  const width = Dimensions.get('window').width;
  const [index, setIndex] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    if (i !== index) setIndex(i);
  };

  if (photos.length === 0) {
    return (
      <View
        style={[styles.placeholder, { height, width: '100%' }]}
      />
    );
  }

  return (
    <View style={{ height, width: '100%' }}>
      <ScrollView
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
            style={{ width, height }}
            contentFit="cover"
            transition={150}
          />
        ))}
      </ScrollView>

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

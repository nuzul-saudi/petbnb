// Round 11 — saved listings index. Routed at /favorites.
//
// Composition mirrors the OwnerFeedHome FlatList: same ListingCard,
// same heart toggle (here the heart is always "filled" since by
// definition every item in this list is favorited), same persona-
// gate (signed-in only — anon visitors are routed to /sign-in by
// the existing guest gate in the AppHeader).

import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/SkeletonCard';
import { ListingCard } from '@/components/ListingCard';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuth } from '@/lib/auth';
import { listFavoriteListings } from '@/lib/favorites';
import type { ListingFeedItem } from '@/lib/listings';
import { useTranslation } from '@/lib/i18n';
import { spacing } from '@/theme/tokens';

export default function FavoritesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user } = useAuth();

  const [items, setItems] = useState<ListingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const favorites = useFavorites(user?.id ?? null);
  // Destructure the stable useCallback ref so the focus effect's
  // dependency array doesn't see a new identity every time
  // `favorites.ids` changes mid-refetch (was causing a focus-effect
  // loop → flicker).
  const refetchFavoriteIds = favorites.refetch;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listFavoriteListings(user.id);
      setItems(rows);
    } catch (e) {
      logWarn('[favorites.load_failed]', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refetchFavoriteIds();
    }, [load, refetchFavoriteIds]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in?returnTo=/favorites" />;

  return (
    <Screen title={t('favorites.title')} back={{ href: '/' }} edges={['top', 'bottom']}>
      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('favorites.empty_title')}
          body={t('favorites.empty_body')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listings/${item.id}`)}
              favorite={{
                // Always filled — every item here is favorited. Toggling
                // removes the listing from the list on next render.
                isFavorited: favorites.ids.has(item.id),
                onToggle: async () => {
                  await favorites.toggle(item.id);
                  // Refetch the hydrated list so the unhearted card
                  // drops out of the visible set immediately.
                  await load();
                },
              }}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});

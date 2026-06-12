// Round 11 — saved listings index. Routed at /favorites.
//
// Composition mirrors the OwnerFeedHome FlatList: same ListingCard,
// same heart toggle (here the heart is always "filled" since by
// definition every item in this list is favorited), same persona-
// gate (signed-in only — anon visitors are routed to /sign-in by
// the existing guest gate in the AppHeader).

import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { ListingCard } from '@/components/ListingCard';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuth } from '@/lib/auth';
import { listFavoriteListings } from '@/lib/favorites';
import type { ListingFeedItem } from '@/lib/listings';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function FavoritesScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [items, setItems] = useState<ListingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const favorites = useFavorites(user?.id ?? null);

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
      void favorites.refetch();
    }, [load, favorites]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in?returnTo=/favorites" />;

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
          <Text style={styles.backText}>{t('favorites.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('favorites.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('favorites.loading')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('favorites.empty_title')}</Text>
          <Text style={styles.emptyBody}>{t('favorites.empty_body')}</Text>
        </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  emptyTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});

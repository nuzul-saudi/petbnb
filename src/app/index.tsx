import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { ListingCard } from '@/components/ListingCard';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { listActiveListings, type ListingFeedItem } from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const { initializing, session, profile } = useAuth();

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <SafeAreaView style={styles.safe} />;
  // Suspended check runs before role gating so admins can also be locked out.
  if (profile.is_suspended) return <Redirect href="/suspended" />;
  if (profile.full_name.trim() === '') return <Redirect href="/role" />;
  if (profile.role === 'admin') return <Redirect href="/admin" />;

  if (profile.role === 'host') return <HostPlaceholderHome />;
  return <OwnerFeedHome />;
}

// ---------------------------------------------------------------------------
// Host-only home (placeholder until Step 7 ships the host dashboard).
// ---------------------------------------------------------------------------

function HostPlaceholderHome() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.placeholderContainer}>
        <Text style={styles.greeting}>
          {t('home.signed_in_greeting', { name: profile!.full_name })}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('home.your_role')}:</Text>
          <Text style={styles.metaValue}>{t(`role.${profile!.role}`)}</Text>
        </View>

        <Text style={styles.placeholderTitle}>
          {t('home.host_placeholder_title')}
        </Text>
        <Text style={styles.placeholderBody}>
          {t('home.host_placeholder_body')}
        </Text>

        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>{t('home.sign_out')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Owner / both home — the listings feed.
// ---------------------------------------------------------------------------

function OwnerFeedHome() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  const [items, setItems] = useState<ListingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [femaleOnly, setFemaleOnly] = useState(false);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const rows = await listActiveListings({ femaleHostsOnly: femaleOnly });
        setItems(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('feed.load_failed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [femaleOnly, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true });
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.feedTitle}>{t('feed.title')}</Text>
          <Text style={styles.greetingSmall}>
            {t('home.signed_in_greeting', { name: profile!.full_name })}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/bookings/index')}
            style={styles.navChip}
          >
            <Text style={styles.navChipText}>{t('mybookings.title')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/profile')}
            style={styles.navChip}
          >
            <Text style={styles.navChipText}>{t('profile.title')}</Text>
          </Pressable>
          <Pressable onPress={signOut} style={styles.signOutSmall}>
            <Text style={styles.signOutSmallText}>{t('home.sign_out')}</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => setFemaleOnly((v) => !v)}
        style={[styles.filterChip, femaleOnly && styles.filterChipActive]}
      >
        <Text
          style={[
            styles.filterChipText,
            femaleOnly && styles.filterChipTextActive,
          ]}
        >
          {femaleOnly ? '✓ ' : ''}
          {t('feed.female_filter')}
        </Text>
      </Pressable>

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('feed.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('feed.empty')}</Text>
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
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  // --- placeholder (host) ---
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  greeting: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  metaLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  metaValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  placeholderTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  placeholderBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  signOut: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  signOutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
  // --- feed ---
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  feedTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  greetingSmall: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  navChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.moss,
  },
  navChipText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.moss,
  },
  signOutSmall: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  signOutSmallText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.terracotta,
  },
  filterChip: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  filterChipActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  filterChipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  filterChipTextActive: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centeredText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
});

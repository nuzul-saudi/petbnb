import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { listAllListings, type AdminListing } from '@/lib/admin';
import { formatSAR } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type FilterValue = 'all' | 'pending' | 'active';

const FILTERS: { value: FilterValue; i18nKey: string }[] = [
  { value: 'all', i18nKey: 'admin.listings_filter_all' },
  { value: 'pending', i18nKey: 'admin.listings_filter_pending' },
  { value: 'active', i18nKey: 'admin.listings_filter_active' },
];

export default function AdminListingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ filter?: string }>();

  const initialFilter: FilterValue =
    FILTERS.some((f) => f.value === params.filter) ? (params.filter as FilterValue) : 'all';

  const [filter, setFilter] = useState<FilterValue>(initialFilter);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setListings(await listAllListings());
    } catch (e) {
      console.warn('[admin.listings.load_failed]', e);
      setError(t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (filter === 'pending') return !l.is_active;
      if (filter === 'active') return l.is_active;
      return true;
    });
  }, [listings, filter]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/admin')} style={styles.backLink}>
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.listings_title')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.value && styles.filterChipTextActive,
              ]}
            >
              {t(f.i18nKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.listings_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/admin/listings/[id]',
                  params: { id: item.id },
                })
              }
              style={styles.row}
            >
              {item.cover_photo ? (
                <Image
                  source={{ uri: item.cover_photo }}
                  style={styles.cover}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Text style={{ fontSize: 24, opacity: 0.4 }}>🏠</Text>
                </View>
              )}
              <View style={styles.rowMain}>
                <View style={styles.rowTopLine}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title_ar}
                  </Text>
                  <StatusPill active={item.is_active} />
                </View>
                <Text style={styles.rowMeta}>
                  {item.neighborhood} • {item.host?.full_name ?? '—'}
                  {item.host?.is_verified ? ' ✓' : ''}
                </Text>
                <Text style={styles.rowPrice}>{formatSAR(item.nightly_price_sar)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function StatusPill({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: active ? colors.moss : colors.gold },
      ]}
    >
      <Text style={styles.pillText}>
        {t(active ? 'admin.listing_status_active' : 'admin.listing_status_inactive')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
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
    textAlign: 'right',
  },
  filterRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
    marginEnd: spacing.xs,
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
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  cover: {
    width: 80,
    height: 80,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  rowPrice: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
});

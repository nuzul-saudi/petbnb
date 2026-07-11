import { logWarn } from '@/lib/log';
// Admin listings queue. 8g reshape: the old active/pending/all
// filter chips and listAllListings are gone. This is now the
// unified REVIEW QUEUE — both new pending listings AND hosts'
// pending edits sit in one list, each row labeled with a review
// type.
//
// Items in this queue:
//   - new_listing: status='pending', no drafts. Brand-new awaiting
//     admin approval.
//   - pending_edit: status IN ('approved','paused','admin_disabled')
//     AND a draft exists (field-side, photo-side, or both). Host is
//     proposing changes to a live (or paused / admin-disabled)
//     listing.
//
// Items NOT in this queue: live listings with no pending edits.
// Admin reaches those via direct URL (e.g. from a user's profile)
// or via a future "all listings" admin tab — not in 8g scope.

import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  listAllListings,
  listPendingReviews,
  type AdminReview,
} from '@/lib/admin';
import { Chip } from '@/components/Chip';
import { formatSAR } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

// 2026-06-25 — chip-toggled view.
//
// Two entries land on this screen:
//   - 'Listings awaiting approval' admin-home card → ?filter=review
//   - 'All listings' admin-home nav link          → ?filter=all
//
// The page reads ?filter from the URL on mount and defaults the
// chip accordingly. Defaults to 'all' when the param is missing
// (matches the menu label expectation that "All listings" shows
// every listing, not just the queue).
type FilterMode = 'review' | 'all';

export default function AdminListingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ filter?: string }>();
  const initialFilter: FilterMode =
    params.filter === 'review' ? 'review' : 'all';

  const [filter, setFilter] = useState<FilterMode>(initialFilter);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: FilterMode) => {
      setLoading(true);
      setError(null);
      try {
        const rows =
          mode === 'review'
            ? await listPendingReviews()
            : await listAllListings();
        setReviews(rows);
      } catch (e) {
        logWarn('[admin.listings.load_failed]', e);
        setError(t('admin.load_failed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/admin')} style={styles.backLink}>
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title}>
          {filter === 'review'
            ? t('admin.review_queue_title')
            : t('admin.all_listings_title')}
        </Text>
      </View>

      {/* Filter chips. Tap toggles the dataset; URL param updates
          so back/forward survives. */}
      <View style={styles.filterRow}>
        <Chip
          label={t('admin.filter_all')}
          selected={filter === 'all'}
          onPress={() => {
            setFilter('all');
            router.setParams({ filter: 'all' });
          }}
        />
        <Chip
          label={t('admin.filter_review')}
          selected={filter === 'review'}
          onPress={() => {
            setFilter('review');
            router.setParams({ filter: 'review' });
          }}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : reviews.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.review_queue_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
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
                  <ReviewTypePill type={item.reviewType} />
                </View>
                <Text style={styles.rowMeta}>
                  {item.neighborhood} • {item.host?.full_name ?? '—'}
                  {item.host?.is_verified ? ' ✓' : ''}
                </Text>
                <Text style={styles.rowPrice}>
                  {formatSAR(item.nightly_price_sar)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

// #3 (2026-06-28) — extended from 2 variants to 5. The 'All
// listings' tab now shows a status-accurate badge for every row.
// Color choices: moss=action-needed (new), gold=in-flight edit,
// whisper=published/neutral, inkSoft=paused/muted,
// terracotta=admin-disabled (warning). Text colors picked for
// contrast against each background.
function ReviewTypePill({
  type,
}: {
  type: AdminReview['reviewType'];
}) {
  const { t } = useTranslation();
  const bg =
    type === 'new_listing'
      ? colors.moss
      : type === 'pending_edit'
        ? colors.gold
        : type === 'paused'
          ? colors.inkSoft
          : type === 'admin_disabled'
            ? colors.terracotta
            : colors.whisper; // 'live'
  const fg = type === 'live' ? colors.inkSoft : colors.cream;
  const key =
    type === 'new_listing'
      ? 'admin.review_type_new_listing'
      : type === 'pending_edit'
        ? 'admin.review_type_pending_edit'
        : type === 'live'
          ? 'admin.review_type_live'
          : type === 'paused'
            ? 'admin.review_type_paused'
            : 'admin.review_type_admin_disabled';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{t(key)}</Text>
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
  // 2026-06-25 — filter chip row, sits between the header and the list.
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
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

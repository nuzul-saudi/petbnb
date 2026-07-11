import { logWarn } from '@/lib/log';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Chip } from '@/components/Chip';
import { listAllUsers, type AdminUser } from '@/lib/admin';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

type FilterValue =
  | 'all'
  | 'pending_hosts'
  | 'owner'
  | 'host'
  | 'admin'
  | 'suspended';

const FILTERS: { value: FilterValue; i18nKey: string }[] = [
  { value: 'all', i18nKey: 'admin.users_filter_all' },
  { value: 'pending_hosts', i18nKey: 'admin.users_filter_pending_hosts' },
  { value: 'owner', i18nKey: 'admin.users_filter_owner' },
  { value: 'host', i18nKey: 'admin.users_filter_host' },
  { value: 'admin', i18nKey: 'admin.users_filter_admin' },
  { value: 'suspended', i18nKey: 'admin.users_filter_suspended' },
];

export default function AdminUsersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ filter?: string }>();

  const initialFilter: FilterValue =
    FILTERS.some((f) => f.value === params.filter) ? (params.filter as FilterValue) : 'all';

  const [filter, setFilter] = useState<FilterValue>(initialFilter);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listAllUsers());
    } catch (e) {
      logWarn('[admin.users.load_failed]', e);
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
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'pending_hosts') {
        if (
          !(
            u.role === 'host' &&
            !u.is_verified &&
            !u.is_suspended
          )
        )
          return false;
      } else if (filter === 'suspended') {
        if (!u.is_suspended) return false;
      } else if (filter !== 'all') {
        if (u.role !== filter) return false;
      }
      if (q) {
        const name = (u.full_name ?? '').toLowerCase();
        const email = (u.email ?? '').toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [users, filter, search]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/admin')} style={styles.backLink}>
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.users_title')}</Text>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('admin.users_search_placeholder')}
        placeholderTextColor={colors.inkSoft}
        style={styles.searchInput}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // #5 (2026-06-28) — same iOS Safari compression-pin used on
        // the home page round (commits bdf611b + 8660501). Prevents
        // the flex column from collapsing this row to a sliver when
        // the address bar settles. See styles.filterScrollContainer.
        style={styles.filterScrollContainer}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={t(f.i18nKey)}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.users_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/admin/users/[id]',
                  params: { id: item.id },
                })
              }
              style={styles.row}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.full_name || '—'}</Text>
                <Text style={styles.rowEmail}>{item.email}</Text>
                <Text style={styles.rowMeta}>
                  {t(`role.${item.role}`)}
                  {item.is_verified ? '  ✓ موثّق' : ''}
                  {item.is_suspended ? '  🚫 موقوف' : ''}
                </Text>
              </View>
              <Text style={styles.rowArrow}>‹</Text>
            </Pressable>
          )}
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
  searchInput: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  filterRow: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  // #5 (2026-06-28) — outer pin for the horizontal ScrollView.
  // flexShrink:0 keeps the flex column from compressing this row
  // when iOS Safari's address bar shrinks the viewport; minHeight
  // 52 is sized to one chip row (chip paddingV 8\xc3\x972 + border 2 +
  // text fontSize 12 / lineHeight 18 = 36, plus row paddingV 12 =
  // 48; round up to 52 for safety). Same numbers as the home
  // page's filterRowScrollContainer (commit 8660501).
  filterScrollContainer: {
    flexShrink: 0,
    minHeight: 52,
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
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
  },
  rowEmail: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  rowArrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.inkSoft,
  },
});

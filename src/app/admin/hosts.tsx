import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { listAllUsers, setUserVerified, type AdminUser } from '@/lib/admin';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function PendingHostsScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listAllUsers();
      const pending = all.filter(
        (u) =>
          (u.role === 'host' || u.role === 'both') &&
          !u.is_verified &&
          !u.is_suspended,
      );
      setUsers(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onApprove = async (id: string) => {
    setApprovingId(id);
    setError(null);
    try {
      await setUserVerified(id, true);
      // Optimistic: drop the row from the local list immediately so the
      // queue feels responsive.
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.save_failed'));
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.hosts_title')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.hosts_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowName}>{item.full_name || '—'}</Text>
                <Text style={styles.rowEmail}>{item.email}</Text>
                <Text style={styles.rowMeta}>
                  {t('admin.host_signup_at')}: {item.auth_created_at.slice(0, 10)}
                </Text>
                <Text style={styles.rowMeta}>
                  {t('admin.user_role_label')}: {t(`role.${item.role}`)}
                </Text>
              </View>
              <Pressable
                onPress={() => onApprove(item.id)}
                disabled={approvingId === item.id}
                style={[
                  styles.approveButton,
                  approvingId === item.id && styles.approveButtonDisabled,
                ]}
              >
                <Text style={styles.approveButtonText}>
                  {approvingId === item.id
                    ? t('admin.saving')
                    : t('admin.user_approve_verification')}
                </Text>
              </Pressable>
            </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  rowLeft: {
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
  approveButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.moss,
    borderRadius: radii.pill,
  },
  approveButtonDisabled: {
    opacity: 0.5,
  },
  approveButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.cream,
  },
});

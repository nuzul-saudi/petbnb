import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { listAllListings, listAllUsers } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function AdminHome() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  const [pendingHostsCount, setPendingHostsCount] = useState<number | null>(null);
  const [pendingListingsCount, setPendingListingsCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddHostModal, setShowAddHostModal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [users, listings] = await Promise.all([listAllUsers(), listAllListings()]);
      const pendingHosts = users.filter(
        (u) =>
          (u.role === 'host' || u.role === 'both') &&
          !u.is_verified &&
          !u.is_suspended,
      ).length;
      const pendingListings = listings.filter((l) => !l.is_active).length;
      setPendingHostsCount(pendingHosts);
      setPendingListingsCount(pendingListings);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.load_failed'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{t('admin.title')}</Text>
            <Text style={styles.greeting}>
              {t('home.signed_in_greeting', { name: profile!.full_name })}
            </Text>
          </View>
          <Pressable onPress={signOut} style={styles.signOutSmall}>
            <Text style={styles.signOutSmallText}>{t('home.sign_out')}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Queue cards */}
        <Pressable
          onPress={() => router.push('/admin/hosts')}
          style={[styles.card, styles.queueCard]}
        >
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{t('admin.pending_hosts_card')}</Text>
            <CountBadge value={pendingHostsCount} />
          </View>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/admin/listings',
              params: { filter: 'pending' },
            })
          }
          style={[styles.card, styles.queueCard]}
        >
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{t('admin.pending_listings_card')}</Text>
            <CountBadge value={pendingListingsCount} />
          </View>
        </Pressable>

        {/* Nav rows */}
        <Pressable
          onPress={() => router.push('/admin/users')}
          style={styles.navRow}
        >
          <Text style={styles.navText}>{t('admin.nav_all_users')}</Text>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/admin/listings')}
          style={styles.navRow}
        >
          <Text style={styles.navText}>{t('admin.nav_all_listings')}</Text>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/admin/bookings')}
          style={styles.navRow}
        >
          <Text style={styles.navText}>{t('admin.nav_all_bookings')}</Text>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        <Pressable
          onPress={() => setShowAddHostModal(true)}
          style={styles.addHostButton}
        >
          <Text style={styles.addHostButtonText}>{t('admin.add_host_manually')}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showAddHostModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAddHostModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowAddHostModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('admin.add_host_modal_title')}</Text>
            <Text style={styles.modalBody}>{t('admin.add_host_modal_body')}</Text>
            <Pressable
              onPress={() => setShowAddHostModal(false)}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>{t('admin.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function CountBadge({ value }: { value: number | null }) {
  const display = value === null ? '…' : String(value);
  const tone = value && value > 0 ? styles.badgeActive : styles.badgeZero;
  return (
    <View style={[styles.badge, tone]}>
      <Text style={styles.badgeText}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  greeting: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
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
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.lg,
    ...shadows.card,
  },
  queueCard: {
    borderWidth: 2,
    borderColor: colors.moss,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'right',
  },
  badge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  badgeActive: {
    backgroundColor: colors.terracotta,
  },
  badgeZero: {
    backgroundColor: colors.whisper,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  navRowDisabled: {
    opacity: 0.5,
  },
  navText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  navArrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.inkSoft,
  },
  addHostButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.moss,
    alignItems: 'center',
  },
  addHostButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,42,29,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  modalBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
    lineHeight: 24,
  },
  modalClose: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
});

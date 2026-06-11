import { logWarn } from '@/lib/log';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  getUserById,
  setUserName,
  setUserRole,
  setUserSuspended,
  setUserVerified,
  type AdminUser,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

const ROLES: Enums<'user_role'>[] = ['owner', 'host', 'both', 'admin'];

export default function AdminUserDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const targetId = typeof params.id === 'string' ? params.id : '';

  const [data, setData] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const isSelf = currentUser?.id === targetId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await getUserById(targetId);
      setData(u);
      setNameDraft(u?.full_name ?? '');
    } catch (e) {
      logWarn('[admin.user.load_failed]', e);
      setError(t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [targetId, t]);

  useEffect(() => {
    if (targetId) load();
  }, [targetId, load]);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      logWarn('[admin.user.save_failed]', e);
      setError(t('admin.save_failed'));
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.error}>{t('admin.load_failed')}</Text>
          <Pressable onPress={() => router.replace('/admin/users')} style={styles.backPill}>
            <Text style={styles.backPillText}>{t('admin.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const nameChanged = nameDraft.trim() !== data.full_name;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/admin/users')} style={styles.backLink}>
            <Text style={styles.backText}>{t('admin.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('admin.user_detail_title')}</Text>
        </View>

        {isSelf ? (
          <View style={styles.selfBanner}>
            <Text style={styles.selfBannerText}>
              {t('admin.user_cant_self_modify')}
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Read-only info */}
        <View style={styles.infoCard}>
          <InfoRow label={t('admin.user_email_label')} value={data.email} />
          <InfoRow
            label={t('admin.user_phone_label')}
            value={data.phone ?? '—'}
          />
          <InfoRow
            label={t('admin.user_signup_at_label')}
            value={data.auth_created_at.slice(0, 10)}
          />
          <InfoRow
            label={t('admin.user_last_sign_in_label')}
            value={
              data.last_sign_in_at
                ? data.last_sign_in_at.slice(0, 16).replace('T', ' ')
                : t('admin.user_never_signed_in')
            }
          />
        </View>

        {/* Name (editable) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('admin.user_name_label')}</Text>
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            style={styles.input}
          />
          <Pressable
            onPress={() =>
              withBusy('name', () => setUserName(data.id, nameDraft))
            }
            disabled={!nameChanged || busyAction === 'name'}
            style={[
              styles.saveButton,
              (!nameChanged || busyAction === 'name') && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {busyAction === 'name' ? t('admin.saving') : t('admin.save')}
            </Text>
          </Pressable>
        </View>

        {/* Role */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('admin.user_role_label')}</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const isCurrent = data.role === r;
              const disabled = isSelf || busyAction === `role_${r}`;
              return (
                <Pressable
                  key={r}
                  onPress={() =>
                    !isCurrent && withBusy(`role_${r}`, () => setUserRole(data.id, r))
                  }
                  disabled={disabled || isCurrent}
                  style={[
                    styles.roleButton,
                    isCurrent && styles.roleButtonActive,
                    disabled && !isCurrent && styles.buttonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      isCurrent && styles.roleButtonTextActive,
                    ]}
                  >
                    {t(`role.${r}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Verified */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {t('admin.user_verified_label')}: {data.is_verified ? '✓' : '✗'}
          </Text>
          <Pressable
            onPress={() =>
              withBusy('verify', () =>
                setUserVerified(data.id, !data.is_verified),
              )
            }
            disabled={busyAction === 'verify'}
            style={[
              data.is_verified ? styles.dangerButton : styles.primaryButton,
              busyAction === 'verify' && styles.buttonDisabled,
            ]}
          >
            <Text
              style={
                data.is_verified ? styles.dangerButtonText : styles.primaryButtonText
              }
            >
              {busyAction === 'verify'
                ? t('admin.saving')
                : data.is_verified
                  ? t('admin.user_revoke_verification')
                  : t('admin.user_approve_verification')}
            </Text>
          </Pressable>
        </View>

        {/* Suspended */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {t('admin.user_suspended_label')}: {data.is_suspended ? '🚫' : '—'}
          </Text>
          <Pressable
            onPress={() =>
              withBusy('suspend', () =>
                setUserSuspended(data.id, !data.is_suspended),
              )
            }
            disabled={isSelf || busyAction === 'suspend'}
            style={[
              data.is_suspended ? styles.primaryButton : styles.dangerButton,
              (isSelf || busyAction === 'suspend') && styles.buttonDisabled,
            ]}
          >
            <Text
              style={
                data.is_suspended ? styles.primaryButtonText : styles.dangerButtonText
              }
            >
              {busyAction === 'suspend'
                ? t('admin.saving')
                : data.is_suspended
                  ? t('admin.user_unsuspend')
                  : t('admin.user_suspend')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  backPill: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.inkSoft,
  },
  backPillText: {
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
  selfBanner: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  selfBannerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
  },
  infoCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  infoValue: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'left',
  },
  section: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.cream,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  roleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.cream,
  },
  roleButtonActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  roleButtonText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  roleButtonTextActive: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  primaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.moss,
    borderRadius: radii.pill,
    alignSelf: 'flex-end',
  },
  primaryButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.cream,
  },
  dangerButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.terracotta,
    borderRadius: radii.pill,
    alignSelf: 'flex-end',
  },
  dangerButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.cream,
  },
  saveButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.moss,
    borderRadius: radii.pill,
    alignSelf: 'flex-end',
  },
  saveButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.cream,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});

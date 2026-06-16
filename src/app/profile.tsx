import { logWarn } from '@/lib/log';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import {
  pickAvatarPhoto,
  uploadAvatar,
  type AvatarSource,
} from '@/lib/avatars';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user, profile, refreshProfile, signOut } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Move 5 — avatar upload state. previewUri is rendered immediately
  // after the user picks a file (object URL on web, asset URI on
  // native); the actual upload happens on Save Photo.
  const [pendingPhoto, setPendingPhoto] = useState<AvatarSource | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);

  // Hydrate the form from the loaded profile.
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name);
  }, [profile]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;
  if (!profile) return <SafeAreaView style={styles.safe} />;

  const nameChanged = name.trim() !== profile.full_name;
  const canSave = nameChanged;

  // Move 5 — picker only stages the file; the actual upload runs on
  // "Save Photo" so the user sees a preview and can change their mind.
  const onPickAvatar = async () => {
    setError(null);
    const source = await pickAvatarPhoto();
    if (!source) return;
    setPendingPhoto(source);
    const preview =
      source.kind === 'web-file'
        ? URL.createObjectURL(source.file)
        : source.uri;
    setPreviewUri(preview);
  };

  const onSaveAvatar = async () => {
    if (!supabase || !user || !pendingPhoto) return;
    setAvatarSaving(true);
    setError(null);
    try {
      const publicUrl = await uploadAvatar({
        userId: user.id,
        source: pendingPhoto,
      });
      const { error: e } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
      setPendingPhoto(null);
      // Keep previewUri set — refreshProfile gives us the new
      // avatar_url and the render flips to it on next paint.
    } catch (e) {
      logWarn('[profile.avatar_save_failed]', e);
      setError(t('profile.avatar_save_failed'));
    } finally {
      setAvatarSaving(false);
    }
  };

  const onSave = async () => {
    if (!supabase || !canSave) return;
    if (!name.trim()) {
      setError(t('profile.name_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: e } = await supabase
        .from('profiles')
        .update({ full_name: name.trim() })
        .eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
    } catch (e) {
      logWarn('[profile.save_failed]', e);
      setError(t('profile.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
            <Text style={styles.backText}>{t('profile.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('profile.title')}</Text>
        </View>

        {/* Move 5 — avatar block. Shows current avatar (or initial
            fallback), picker button, save button when a fresh photo
            is staged. */}
        <View style={styles.avatarRow}>
          {previewUri ?? profile.avatar_url ? (
            <Image
              source={{ uri: previewUri ?? profile.avatar_url ?? '' }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {profile.full_name?.trim().charAt(0) ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.avatarActions}>
            <Pressable
              onPress={onPickAvatar}
              disabled={avatarSaving}
              style={[
                styles.avatarButton,
                avatarSaving && styles.avatarButtonDisabled,
              ]}
            >
              <Text style={styles.avatarButtonText}>
                {previewUri || profile.avatar_url
                  ? t('profile.avatar_change')
                  : t('profile.avatar_add')}
              </Text>
            </Pressable>
            {pendingPhoto ? (
              <Pressable
                onPress={onSaveAvatar}
                disabled={avatarSaving}
                style={[
                  styles.avatarButton,
                  styles.avatarButtonPrimary,
                  avatarSaving && styles.avatarButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.avatarButtonText,
                    styles.avatarButtonTextPrimary,
                  ]}
                >
                  {avatarSaving
                    ? t('profile.avatar_uploading')
                    : t('profile.avatar_save')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Read-only contact info */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('profile.email_label')}</Text>
            <Text style={styles.infoValue}>{user.email ?? '—'}</Text>
          </View>
        </View>

        {/* Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('profile.name_label')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('profile.name_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>

        {/* 0039 — host application status panel for role='host'. */}
        {profile.role === 'host' ? (
          <HostStatusPanel
            status={profile.host_application_status}
            profileComplete={profile.host_profile_complete}
            adminNotes={profile.host_application_admin_notes}
            onComplete={() => router.push('/become-host/complete-profile' as never)}
          />
        ) : null}

        {/* Pets shortcut */}
        <Pressable
          onPress={() => router.push('/pets')}
          style={styles.navRow}
        >
          <Text style={styles.navText}>{t('profile.my_pets_link')}</Text>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        {/* Round 11 — Favorites shortcut. */}
        <Pressable
          onPress={() => router.push('/favorites')}
          style={styles.navRow}
        >
          <Text style={styles.navText}>{t('favorites.title')}</Text>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actionGap}>
          <Button
            label={saving ? t('profile.saving') : t('profile.save_changes')}
            onPress={onSave}
            disabled={!canSave || saving}
            loading={saving}
            variant="primary"
            fullWidth
          />
        </View>

        <View style={styles.actionGap}>
          <Button
            label={t('home.sign_out')}
            onPress={signOut}
            variant="destructive"
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Host application status panel (0039). Renders only when role='host'.
// Four visual states based on the application + profile-complete
// flags:
//   pending  → tan card: "We're reviewing your application"
//   approved + !complete → moss card: "Approved — complete your profile" + CTA
//   approved + complete  → quiet pill: "Verified host" (no CTA)
//   rejected → terracotta card: "Application not approved" + notes
function HostStatusPanel({
  status,
  profileComplete,
  adminNotes,
  onComplete,
}: {
  status: 'pending' | 'approved' | 'rejected' | null;
  profileComplete: boolean;
  adminNotes: string | null;
  onComplete: () => void;
}) {
  const { t } = useTranslation();

  if (status === 'pending') {
    return (
      <View style={[styles.statusCard, styles.statusCardPending]}>
        <Text style={styles.statusTitle}>
          {t('profile.host_status_pending_title')}
        </Text>
        <Text style={styles.statusBody}>
          {t('profile.host_status_pending_body')}
        </Text>
      </View>
    );
  }

  if (status === 'approved' && !profileComplete) {
    return (
      <View style={[styles.statusCard, styles.statusCardApproved]}>
        <Text style={styles.statusTitle}>
          {t('profile.host_status_complete_title')}
        </Text>
        <Text style={styles.statusBody}>
          {t('profile.host_status_complete_body')}
        </Text>
        <Pressable onPress={onComplete} style={styles.statusCta}>
          <Text style={styles.statusCtaText}>
            {t('profile.host_status_complete_cta')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'approved' && profileComplete) {
    return (
      <View style={styles.verifiedPill}>
        <Text style={styles.verifiedPillText}>
          ✓ {t('profile.host_status_verified')}
        </Text>
      </View>
    );
  }

  if (status === 'rejected') {
    return (
      <View style={[styles.statusCard, styles.statusCardRejected]}>
        <Text style={styles.statusTitle}>
          {t('profile.host_status_rejected_title')}
        </Text>
        <Text style={styles.statusBody}>
          {t('profile.host_status_rejected_body')}
        </Text>
        {adminNotes ? (
          <Text style={styles.statusNotes}>{adminNotes}</Text>
        ) : null}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream in owner mode, honey in host mode).
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
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
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  // Move 5 — avatar block. Avatar + actions on the trailing side.
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.whisper,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.headingBold,
    fontSize: 36,
    color: colors.mossDeep,
  },
  avatarActions: {
    flex: 1,
    gap: spacing.sm,
  },
  avatarButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    alignItems: 'center',
  },
  avatarButtonPrimary: {
    backgroundColor: colors.mossDeep,
    borderColor: colors.mossDeep,
  },
  avatarButtonDisabled: {
    opacity: 0.5,
  },
  avatarButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  avatarButtonTextPrimary: {
    color: colors.cream,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  infoValue: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'left',
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
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
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  actionGap: {
    marginTop: spacing.lg,
  },
  // 0039 — host application status panel styles.
  statusCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusCardPending: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
  },
  statusCardApproved: {
    backgroundColor: colors.whisper,
    borderColor: colors.moss,
  },
  statusCardRejected: {
    backgroundColor: colors.whisper,
    borderColor: colors.terracotta,
  },
  statusTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  statusBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  statusNotes: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  statusCta: {
    backgroundColor: colors.mossDeep,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusCtaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
  verifiedPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.mossDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  verifiedPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
  },
});

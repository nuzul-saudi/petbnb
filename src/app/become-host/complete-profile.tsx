// Post-approval profile completion screen (0039).
//
// Reached by approved hosts from the profile-screen status panel
// ("Complete your profile" CTA). Collects:
//   - Hosting bio (free-text)
//   - Profile picture (INLINE avatar picker — Wave 1b S4)
//   - Nafath verification (STUB — gated behind NAFATH_ENABLED flag,
//     off for now; the UI shows it as a future step so the user
//     knows what's coming)
//
// Submits → host_profile_complete=true → user can now create
// listings. Listing INSERT RLS (0039 step 5) enforces this at the
// DB layer; this screen is the friendly surface.
//
// Wave 1b S4 (2026-07-11): two founder-found fixes —
//   1. The screen was a DEAD END (no back affordance). Now wrapped in
//      <Screen back> so the host can return to /profile.
//   2. The profile-picture step used to route AWAY to /profile to pick
//      an avatar, which unmounted this screen and DESTROYED the typed
//      bio. The avatar picker is now INLINE (same pick→preview→upload
//      flow as /profile) so the bio survives — no navigation, no wipe.

import { logWarn } from '@/lib/log';
import { useState } from 'react';
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

import { Screen } from '@/components/Screen';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { markHostProfileComplete } from '@/lib/host-application';
import { pickAvatarPhoto, uploadAvatar, type AvatarSource } from '@/lib/avatars';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

const MIN_BIO = 30;
// Nafath stays disabled for MVP. The pre-launch task list (CLAUDE.md
// section 11) calls it out explicitly. When enabled this screen will
// add a "Verify with Nafath" step before submit.
const NAFATH_ENABLED = false;

export default function HostCompleteProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user, profile, refreshProfile } = useAuth();

  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline avatar state (mirrors /profile). previewUri renders
  // immediately after the pick; the upload runs on "Save photo" so the
  // user sees a preview and can change their mind. Crucially, this all
  // happens WITHOUT leaving the screen, so the typed bio is preserved.
  const [pendingPhoto, setPendingPhoto] = useState<AvatarSource | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;
  if (!profile) return <SafeAreaView style={styles.safe} />;

  // Only approved + not-yet-complete hosts belong here. Anyone else
  // gets sent to /profile.
  const isEligible =
    profile.role === 'host' &&
    profile.host_application_status === 'approved' &&
    !profile.host_profile_complete;
  if (!isEligible) return <Redirect href="/profile" />;

  const bioValid = bio.trim().length >= MIN_BIO;
  const canSubmit = bioValid && !submitting;

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
      const publicUrl = await uploadAvatar({ userId: user.id, source: pendingPhoto });
      const { error: e } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
      setPendingPhoto(null);
      // Keep previewUri — refreshProfile brings the new avatar_url and
      // the render flips to it on next paint.
    } catch (e) {
      logWarn('[host_complete.avatar_save_failed]', e);
      setError(t('profile.avatar_save_failed'));
    } finally {
      setAvatarSaving(false);
    }
  };

  const onSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      await markHostProfileComplete(user.id, bio);
      await refreshProfile();
      router.replace('/');
    } catch (e) {
      logWarn('[host_complete_profile.submit_failed]', e);
      setError(t('host_complete.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen back={{ href: '/profile' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t('host_complete.title')}</Text>
        <Text style={styles.subtitle}>{t('host_complete.subtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('host_complete.bio_label')}</Text>
          <Text style={styles.fieldHint}>
            {t('host_complete.bio_hint', { min: MIN_BIO })}
          </Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder={t('host_complete.bio_placeholder')}
            placeholderTextColor={colors.inkSoft}
            multiline
            numberOfLines={6}
            style={[styles.input, styles.textarea]}
          />
        </View>

        {/* Profile picture — INLINE picker (Wave 1b S4). Pick → preview →
            Save photo, all without leaving the screen so the bio above
            is never lost. */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('host_complete.avatar_label')}</Text>
          <Text style={styles.fieldHint}>{t('host_complete.avatar_hint')}</Text>
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
                style={[styles.avatarButton, avatarSaving && styles.avatarButtonDisabled]}
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
                  <Text style={[styles.avatarButtonText, styles.avatarButtonTextPrimary]}>
                    {avatarSaving
                      ? t('profile.avatar_uploading')
                      : t('profile.avatar_save')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* Nafath step — placeholder so applicants see it's coming. */}
        {NAFATH_ENABLED ? null : (
          <View style={styles.nafathStub}>
            <Text style={styles.nafathStubTitle}>
              {t('host_complete.nafath_title')}
            </Text>
            <Text style={styles.nafathStubBody}>
              {t('host_complete.nafath_body')}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>
            {submitting
              ? t('host_complete.submitting')
              : t('host_complete.submit_button')}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 26,
    color: colors.mossDeep,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  fieldHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
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
  textarea: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  // Inline avatar block — mirrors /profile so the two read the same.
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
  nafathStub: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    opacity: 0.7,
  },
  nafathStubTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  nafathStubBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  cta: {
    backgroundColor: colors.mossDeep,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

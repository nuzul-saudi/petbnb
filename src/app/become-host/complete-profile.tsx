// Post-approval profile completion screen (0039).
//
// Reached by approved hosts from the profile-screen status panel
// ("Complete your profile" CTA). Collects:
//   - Hosting bio (free-text)
//   - Profile picture (reuses the avatar block from /profile)
//   - Nafath verification (STUB — gated behind NAFATH_ENABLED flag,
//     off for now; the UI shows it as a future step so the user
//     knows what's coming)
//
// Submits → host_profile_complete=true → user can now create
// listings. Listing INSERT RLS (0039 step 5) enforces this at the
// DB layer; this screen is the friendly surface.

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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { markHostProfileComplete } from '@/lib/host-application';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

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
    <SafeAreaView style={styles.safe}>
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

        {/* Profile picture step — handled on the /profile screen
            itself via the avatar block. We just point the user
            there if they haven't set one yet. */}
        {!profile.avatar_url ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {t('host_complete.avatar_hint')}
            </Text>
            <Pressable
              onPress={() => router.push('/profile')}
              style={styles.noticeLink}
            >
              <Text style={styles.noticeLinkText}>
                {t('host_complete.avatar_link')}
              </Text>
            </Pressable>
          </View>
        ) : null}

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
    </SafeAreaView>
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
  notice: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
  },
  noticeLink: {
    alignSelf: 'flex-start',
  },
  noticeLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.mossDeep,
    textDecorationLine: 'underline',
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

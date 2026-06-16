// Host signup entry point — intro screen.
//
// Two audiences land here:
//
// 1. Guests tapping the AppHeader "Become a Host" CTA. They get the
//    pitch + a "Start application" button that routes them into
//    /sign-in?flow=host. The flow=host param threads through OTP
//    verify and set-password so post-password they land on
//    /become-host/application (the multi-field form) instead of
//    /name (the owner-only finish step).
//
// 2. Signed-in OWNERS tapping the same CTA. Owner accounts and host
//    accounts are separate — Q1 decision (2026-06-15). They see a
//    notice telling them to sign out and create a new account with
//    a different email. The Start button is replaced by a Sign-out
//    button in that case.
//
// Signed-in HOSTS shouldn't reach this screen — they don't see the
// CTA in the header. If they navigate here directly (typed URL) we
// just send them home.

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function BecomeHostScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, profile, signOut } = useAuth();

  const signedInAsOwner =
    !!session && !!profile && profile.role === 'owner';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t('become_host.title')}</Text>
        <Text style={styles.subtitle}>{t('become_host.subtitle')}</Text>

        {/* The pitch — three short steps the applicant should
            understand before they spend time on the form. */}
        <View style={styles.steps}>
          <Step
            num="1"
            title={t('become_host.step_1_title')}
            body={t('become_host.step_1_body')}
          />
          <Step
            num="2"
            title={t('become_host.step_2_title')}
            body={t('become_host.step_2_body')}
          />
          <Step
            num="3"
            title={t('become_host.step_3_title')}
            body={t('become_host.step_3_body')}
          />
        </View>

        {signedInAsOwner ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>
              {t('become_host.separate_account_title')}
            </Text>
            <Text style={styles.noticeText}>
              {t('become_host.separate_account_notice')}
            </Text>
            <Pressable
              onPress={async () => {
                await signOut();
                router.replace('/become-host');
              }}
              style={[styles.cta, styles.ctaSecondary]}
            >
              <Text style={[styles.ctaText, styles.ctaSecondaryText]}>
                {t('become_host.sign_out_button')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() =>
              router.push('/sign-in?flow=host' as never)
            }
            style={styles.cta}
          >
            <Text style={styles.ctaText}>
              {t('become_host.start_application_button')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.replace('/')}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>
            {t('become_host.back_home')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{num}</Text>
      </View>
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  steps: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mossDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.cream,
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  stepBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  notice: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  noticeTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
  },
  cta: {
    backgroundColor: colors.mossDeep,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  ctaSecondary: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.mossDeep,
    marginTop: 0,
  },
  ctaSecondaryText: {
    color: colors.mossDeep,
  },
  backLink: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  backLinkText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});

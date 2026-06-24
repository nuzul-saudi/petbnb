// Post-submit landing for /become-host/application.
//
// The applicant sees a confirmation + "we'll be in touch" message,
// and a button to continue browsing the site (they can book stays
// while their application is pending; only listing creation is
// gated on admin approval).
//
// 2026-06-24 — removed the
//   if (!profile?.host_application_status) <Redirect />
// guard. It was firing as a race condition: submit handler awaits
// the UPDATE + refreshProfile, then router.replace's here, but
// the React context update from setProfile hadn't propagated by
// the first render of THIS screen. Guard redirected back to the
// form, which remounted empty — net effect for the user was
// "form silently clears, looks like submit failed."
// The deep-link "fake confirmation" risk this guard guarded
// against is negligible (the screen has no consequences — it's
// just a text confirmation + Continue button to home).

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function HostApplicationSubmittedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in?flow=host" />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.checkmark}>✓</Text>
        <Text style={styles.heading}>
          {t('host_application.submitted_title')}
        </Text>
        <Text style={styles.body}>
          {t('host_application.submitted_body')}
        </Text>

        <Pressable
          onPress={() => router.replace('/')}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>
            {t('host_application.submitted_continue_button')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  container: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  checkmark: {
    fontSize: 72,
    color: colors.moss,
    fontFamily: fonts.headingBold,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 26,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 400,
  },
  cta: {
    backgroundColor: colors.mossDeep,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
});

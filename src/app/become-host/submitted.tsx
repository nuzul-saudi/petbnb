// Post-submit landing for /become-host/application.
//
// The applicant sees a confirmation + "we'll be in touch" message,
// and a button to continue browsing the site (they can book stays
// while their application is pending; only listing creation is
// gated on admin approval).

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
  const { initializing, session, profile } = useAuth();

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in?flow=host" />;
  // If the application wasn't actually submitted, send them back to
  // the form. Defense against deep-linking to this screen.
  if (!profile?.host_application_status) {
    return <Redirect href="/become-host/application" />;
  }

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

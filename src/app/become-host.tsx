// Host signup entry point — STUB.
//
// This is the navigation target of the AppHeader "Become a Host" CTA
// and the only entry point for the host signup funnel. The full form
// (gender + city + neighborhood + pet type + experience + own pets,
// then admin approval, then post-approval profile completion) lands
// in the next commit. For now this stub renders a placeholder so the
// CTA resolves typed routes and tsc stays green.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function BecomeHostScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, profile } = useAuth();

  // Q1 — signed-in owners taking this path see a notice that hosting
  // requires a separate account. They sign out and use a different
  // email to apply.
  const signedInAsNonHost =
    !!session && !!profile && profile.role !== 'host' && profile.role !== 'admin';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('become_host.title')}</Text>
        <Text style={styles.subtitle}>{t('become_host.subtitle')}</Text>

        {signedInAsNonHost ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {t('become_host.separate_account_notice')}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.replace('/')}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>{t('become_host.back_home')}</Text>
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
    justifyContent: 'center',
    gap: spacing.md,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 26,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  notice: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
    textAlign: 'center',
  },
  backLink: {
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
  backLinkText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});

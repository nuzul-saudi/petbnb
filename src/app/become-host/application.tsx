// Host application form — STUB.
//
// Landing route for newly-signed-up host accounts (the post-password
// step of the sign-in funnel when flow=host). Currently a placeholder
// so the typed route resolves; the full form (name + gender + city +
// neighborhood + pet type + experience + own pets) lands in the next
// commit.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function HostApplicationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in?flow=host" />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('host_application.title')}</Text>
        <Text style={styles.subtitle}>{t('host_application.coming_soon')}</Text>

        <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
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

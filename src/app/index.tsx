import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { initializing, session, profile, signOut } = useAuth();

  // Initial boot — Auth context is reading the persisted session.
  if (initializing) return <SafeAreaView style={styles.safe} />;

  // Not signed in → sign-in flow.
  if (!session) return <Redirect href="/sign-in" />;

  // Signed in but profile row hasn't loaded yet (one round-trip).
  if (!profile) return <SafeAreaView style={styles.safe} />;

  // Signed in, profile loaded, but onboarding never completed
  // (full_name empty = "fresh profile" signal, agreed in Phase 4 plan).
  if (profile.full_name.trim() === '') return <Redirect href="/role" />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.greeting}>
          {t('home.signed_in_greeting', { name: profile.full_name })}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('home.your_role')}:</Text>
          <Text style={styles.metaValue}>{t(`role.${profile.role}`)}</Text>
        </View>

        <Text style={styles.placeholder}>{t('home.step5_placeholder')}</Text>

        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>{t('home.sign_out')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  greeting: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  metaLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  metaValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  placeholder: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  signOut: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  signOutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
});

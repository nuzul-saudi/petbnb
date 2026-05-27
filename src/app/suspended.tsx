import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

// Dedicated screen for is_suspended=true users. Anti-leak: a non-suspended
// user navigating here is redirected home — keeps non-suspended users from
// snapshotting a "fake suspension" screen.
export default function SuspendedScreen() {
  const { t } = useTranslation();
  const { initializing, session, profile, signOut } = useAuth();

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <SafeAreaView style={styles.safe} />;
  if (!profile.is_suspended) return <Redirect href="/" />;

  const email = t('suspended.contact_email');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.icon}>🚫</Text>
        <Text style={styles.title}>{t('suspended.title')}</Text>
        <Text style={styles.body}>{t('suspended.body')}</Text>

        <View style={styles.contactBlock}>
          <Text style={styles.contactLabel}>{t('suspended.contact_label')}</Text>
          <Pressable onPress={() => Linking.openURL(`mailto:${email}`)}>
            <Text style={styles.email}>{email}</Text>
          </Pressable>
        </View>

        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>{t('suspended.sign_out')}</Text>
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
    gap: spacing.md,
  },
  icon: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.terracotta,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  contactBlock: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  contactLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  email: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.moss,
  },
  signOut: {
    marginTop: spacing.xxl,
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

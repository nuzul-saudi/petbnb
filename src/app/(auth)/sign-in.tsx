import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (session) return <Redirect href="/" />;

  const onSubmit = async () => {
    if (!supabase) {
      setError(t('supabase.missing_config'));
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError(t('auth.invalid_email'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      if (e) throw e;
      router.push({ pathname: '/verify', params: { email: cleanEmail } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.send_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = email.trim().length > 0 && !submitting;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('auth.sign_in_title')}</Text>
        <Text style={styles.subtitle}>{t('auth.sign_in_subtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.email_label')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.email_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="email"
            keyboardType="email-address"
            style={styles.input}
            onSubmitEditing={onSubmit}
            returnKeyType="send"
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>
            {submitting ? t('auth.sending_otp') : t('auth.send_otp_button')}
          </Text>
        </Pressable>

        <Text style={styles.hint}>{t('auth.send_otp_hint')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
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
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 32,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    // Emails are LTR text even inside an RTL layout.
    textAlign: 'left',
  },
  button: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const RESEND_COOLDOWN_S = 30;

export default function VerifyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';

  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_S);

  // Guard against double-submit when auto-submit fires concurrently with
  // a manual button press.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  // Auto-submit when the user finishes typing the 6th digit.
  useEffect(() => {
    if (token.length === 6 && !submittedRef.current) {
      void onSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (session) return <Redirect href="/" />;
  if (!email) return <Redirect href="/sign-in" />;

  const onSubmit = async () => {
    if (!supabase || token.length !== 6 || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (e) throw e;
      // Session will appear via onAuthStateChange; the home screen takes
      // it from here (routes to /role if profile is fresh, else stays at /).
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.verify_failed'));
      submittedRef.current = false; // allow retry
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!supabase || resendIn > 0) return;
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ email });
      if (e) throw e;
      setResendIn(RESEND_COOLDOWN_S);
      setToken('');
      submittedRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.send_failed'));
    }
  };

  const resendLabel =
    resendIn > 0
      ? t('auth.resend_countdown', { seconds: resendIn })
      : t('auth.resend_button');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('auth.verify_title')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.verify_subtitle_prefix')} {email}
        </Text>

        <TextInput
          value={token}
          onChangeText={(v) => setToken(v.replace(/\D/g, '').slice(0, 6))}
          placeholder={t('auth.verify_otp_placeholder')}
          placeholderTextColor={colors.inkSoft}
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          style={styles.otpInput}
        />

        <Pressable
          onPress={onSubmit}
          disabled={token.length !== 6 || submitting}
          style={[
            styles.button,
            (token.length !== 6 || submitting) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {submitting ? t('auth.verifying') : t('auth.verify_button')}
          </Text>
        </Pressable>

        <View style={styles.resendRow}>
          <Text style={styles.hint}>{t('auth.resend_hint')}</Text>
          <Pressable onPress={onResend} disabled={resendIn > 0}>
            <Text
              style={[
                styles.resendLink,
                resendIn > 0 && styles.resendLinkDisabled,
              ]}
            >
              {resendLabel}
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={() => router.replace('/sign-in')} style={styles.backLink}>
          <Text style={styles.backText}>{t('auth.back')}</Text>
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
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  otpInput: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontFamily: 'monospace',
    fontSize: 28,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: 8,
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  resendLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.moss,
  },
  resendLinkDisabled: {
    color: colors.inkSoft,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  backLink: {
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});

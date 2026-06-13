import { logWarn } from '@/lib/log';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  // R2C3 (2026-06-11): guest-mode entry routes here with returnTo so
  // the user lands back on the page that triggered the sign-in (the
  // listing they wanted to book, the booking they wanted to open,
  // etc.) instead of dropping onto the home feed.
  const returnTo =
    typeof params.returnTo === 'string' && params.returnTo.startsWith('/')
      ? params.returnTo
      : null;
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AUTH-3 — dual sign-in path. After the user enters an email
  // they can choose either OTP (Send code) or password sign-in.
  // showPassword reveals the password field + Sign-in-with-password
  // button. The OTP path is the default — it's also the right path
  // for first-time signup (the OTP flow auto-creates the account).
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (session) return <Redirect href={(returnTo ?? '/') as Href} />;

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
      router.push({
        pathname: '/verify',
        params: returnTo
          ? { email: cleanEmail, returnTo }
          : { email: cleanEmail },
      });
    } catch (err) {
      logWarn('[auth.send_failed]', err);
      setError(t('auth.send_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  // AUTH-3 — password sign-in path. signInWithPassword authenticates
  // without an OTP round trip. On wrong creds, the "Forgot password?"
  // link below the field triggers the OTP flow as a reset bootstrap.
  const onSubmitPassword = async () => {
    if (!supabase) {
      setError(t('supabase.missing_config'));
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError(t('auth.invalid_email'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.password_too_short', { min: 8 }));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (e) throw e;
      router.replace((returnTo ?? '/') as Href);
    } catch (err) {
      logWarn('[auth.password_sign_in_failed]', err);
      setError(t('auth.password_sign_in_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  // AUTH-4 entry — forgot password sends an OTP, then verify routes
  // into /set-password?mode=reset (see verify.tsx).
  const onForgotPassword = async () => {
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
        options: { shouldCreateUser: false },
      });
      if (e) throw e;
      router.push({
        pathname: '/verify',
        params: {
          email: cleanEmail,
          // Reset mode signal that verify forwards into set-password.
          flow: 'reset',
          ...(returnTo ? { returnTo } : {}),
        },
      });
    } catch (err) {
      logWarn('[auth.forgot_password_failed]', err);
      setError(t('auth.send_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = email.trim().length > 0 && !submitting;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('auth.sign_in_or_signup_title')}</Text>
        <Text style={styles.subtitle}>{t('auth.sign_in_subtitle')}</Text>
        <Text style={styles.newHereHint}>
          {t('auth.new_here_hint')}
        </Text>

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

        {/* Default path — Send OTP. Single-tap for both signup and
            sign-in. */}
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

        {/* AUTH-3 — alternate path: sign in with password. Tap the
            link to reveal the password field + Sign-in button. */}
        {showPassword ? (
          <View style={styles.passwordSection}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.password_label')}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.password_placeholder')}
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.input}
                onSubmitEditing={onSubmitPassword}
                returnKeyType="send"
              />
            </View>
            <Pressable
              onPress={onSubmitPassword}
              disabled={!canSubmit || password.length < 8}
              style={[
                styles.button,
                styles.buttonOutline,
                (!canSubmit || password.length < 8) && styles.buttonDisabled,
              ]}
            >
              <Text style={[styles.buttonText, styles.buttonOutlineText]}>
                {t('auth.sign_in_with_password')}
              </Text>
            </Pressable>
            <Pressable onPress={onForgotPassword} style={styles.forgotLink}>
              <Text style={styles.forgotLinkText}>
                {t('auth.forgot_password')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowPassword(true)}
            style={styles.altPathLink}
          >
            <Text style={styles.altPathLinkText}>
              {t('auth.use_password_instead')}
            </Text>
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* AUTH-5 — Google OAuth scaffold. Gated behind
            EXPO_PUBLIC_GOOGLE_AUTH_ENABLED. Defaults to hidden;
            flip the env var to true once Omar has configured
            the Google OAuth client ID + secret in Supabase
            Dashboard → Auth → Providers → Google.
            TODO: Omar must configure Google OAuth in Supabase
            Dashboard → Auth → Providers → Google (client ID +
            secret from Google Cloud Console). Until that's done,
            tapping this button will fail at runtime. */}
        {process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' ? (
          <Pressable
            onPress={async () => {
              if (!supabase) return;
              setError(null);
              try {
                const { error: e } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: returnTo
                      ? `${window.location.origin}${returnTo}`
                      : `${window.location.origin}/`,
                  },
                });
                if (e) throw e;
              } catch (err) {
                logWarn('[auth.google_oauth_failed]', err);
                setError(t('auth.google_oauth_failed'));
              }
            }}
            style={styles.googleButton}
          >
            <View style={styles.googleLogo}>
              <Text style={styles.googleLogoText}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>
              {t('auth.sign_in_with_google')}
            </Text>
          </Pressable>
        ) : null}

        {/* AUTH-1 — Guest link. Routes back to the guest feed.
            From returnTo flows this still goes to '/' (the feed)
            because the returnTo URL was the page that triggered
            sign-in; we want the user OUT of the auth funnel. */}
        <Pressable
          onPress={() => router.replace('/')}
          style={styles.guestLink}
        >
          <Text style={styles.guestLinkText}>
            {t('auth.continue_as_guest')}
          </Text>
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
  buttonOutline: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.moss,
  },
  buttonOutlineText: {
    color: colors.mossDeep,
  },
  passwordSection: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  altPathLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  altPathLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
    textDecorationLine: 'underline',
  },
  forgotLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  forgotLinkText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  // AUTH-5 — Google sign-in button. Follows Google's brand
  // guidelines (white background, official "G" mark, readable
  // type). Hidden until env flag is true.
  googleButton: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: radii.lg,
  },
  googleLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
  },
  googleLogoText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 14,
  },
  googleButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: '#3C4043',
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  newHereHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  guestLink: {
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  guestLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
    textDecorationLine: 'underline',
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

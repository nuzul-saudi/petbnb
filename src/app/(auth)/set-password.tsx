// AUTH-2 / AUTH-4 — set or reset password.
//
// Two modes via the `mode` URL param:
//   - signup → after OTP verify on a new account. After save, the
//             user goes to /role (existing role picker) → /.
//   - reset  → after forgot-password OTP verify. After save, the
//             user goes to / (or returnTo).
//
// Detection of "new user" lives in verify.tsx: if profile.full_name
// is empty, the user is new and verify routes here with mode=signup.

import { logWarn } from '@/lib/log';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const MIN_PASSWORD = 8;

export default function SetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; returnTo?: string }>();
  const mode: 'signup' | 'reset' =
    params.mode === 'reset' ? 'reset' : 'signup';
  const returnTo =
    typeof params.returnTo === 'string' && params.returnTo.startsWith('/')
      ? params.returnTo
      : null;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  // Must be signed in (post-OTP) to set a password.
  if (!session) return <Redirect href="/sign-in" />;

  const validate = (): string | null => {
    if (password.length < MIN_PASSWORD) {
      return t('auth.password_too_short', { min: MIN_PASSWORD });
    }
    if (password !== confirm) {
      return t('auth.password_mismatch');
    }
    return null;
  };

  const onSubmit = async () => {
    if (!supabase) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      // Mode routing:
      //   signup → /role (finish onboarding)
      //   reset  → returnTo || '/'
      const next: Href =
        mode === 'signup'
          ? ('/role' as Href)
          : ((returnTo ?? '/') as Href);
      router.replace(next);
    } catch (err) {
      logWarn('[auth.set_password_failed]', err);
      setError(t('auth.set_password_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    password.length >= MIN_PASSWORD &&
    confirm.length >= MIN_PASSWORD &&
    !submitting;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>
          {mode === 'reset'
            ? t('auth.reset_password_title')
            : t('auth.set_password_title')}
        </Text>
        <Text style={styles.subtitle}>
          {t('auth.set_password_subtitle', { min: MIN_PASSWORD })}
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.password_label')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password_placeholder')}
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              style={[styles.input, styles.inputFlex]}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.toggleButton}
            >
              <Text style={styles.toggleButtonText}>
                {showPassword ? t('auth.password_hide') : t('auth.password_show')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.password_confirm_label')}</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder={t('auth.password_confirm_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPassword}
            style={styles.input}
            onSubmitEditing={onSubmit}
            returnKeyType="done"
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>
            {submitting
              ? t('auth.saving')
              : mode === 'reset'
                ? t('auth.reset_password_button')
                : t('auth.set_password_button')}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
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
  field: { gap: spacing.xs },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  inputFlex: { flex: 1 },
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
  },
  toggleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  toggleButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mossDeep,
  },
  button: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

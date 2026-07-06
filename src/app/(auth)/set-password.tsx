// AUTH-2 / AUTH-4 — set or reset password.
//
// Two modes via the `mode` URL param:
//   - signup → after OTP verify on a new account. After save, the
//             user goes to /name (just-the-name capture) → /.
//             Role is implicit: anyone signing up through the main
//             /sign-in funnel is an owner; hosts have their own
//             funnel at /become-host.
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
  const params = useLocalSearchParams<{
    mode?: string;
    returnTo?: string;
    flow?: string;
  }>();
  const mode: 'signup' | 'reset' =
    params.mode === 'reset' ? 'reset' : 'signup';
  const returnTo =
    typeof params.returnTo === 'string' && params.returnTo.startsWith('/')
      ? params.returnTo
      : null;
  // 0039 host signup funnel: flow=host means signup mode lands on
  // /become-host/application instead of /name after password.
  const isHostFlow = params.flow === 'host';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 3 (D1) — Terms + Privacy consent. Signup mode only: both
  // funnels (owner AND host) pass through this screen exactly once;
  // reset mode never shows it, so returning users aren't nagged.
  const [consented, setConsented] = useState(false);

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
      // Phase 3 — PDPL consent evidence (migration 0048). Written at
      // signup completion, right after the password lands. Best-effort:
      // a failed stamp is logged but doesn't strand the user mid-funnel
      // (they DID tick the box; the stamp is evidence, not the gate).
      if (mode === 'signup' && session.user) {
        const { error: tosErr } = await supabase
          .from('profiles')
          .update({ tos_accepted_at: new Date().toISOString() })
          .eq('id', session.user.id);
        if (tosErr) logWarn('[auth.tos_stamp_failed]', tosErr);
      }
      // Mode routing:
      //   signup + flow=host → /become-host/application (host funnel)
      //   signup             → /name (finish owner onboarding)
      //   reset              → returnTo || '/'
      const signupTarget: Href = (
        isHostFlow ? '/become-host/application' : '/name'
      ) as Href;
      const next: Href =
        mode === 'signup' ? signupTarget : ((returnTo ?? '/') as Href);
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
    (mode !== 'signup' || consented) &&
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

        {/* Phase 3 (D1) — consent checkbox, signup mode only. Submit
            stays disabled until checked. Links open the draft legal
            screens; state survives the round trip (push, not replace). */}
        {mode === 'signup' ? (
          <View style={styles.consentRow}>
            <Pressable
              onPress={() => setConsented((v) => !v)}
              style={[styles.checkbox, consented && styles.checkboxChecked]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consented }}
            >
              {consented ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </Pressable>
            <Text style={styles.consentText}>
              {t('auth.consent_agree')}{' '}
              <Text
                style={styles.consentLink}
                onPress={() => router.push('/terms' as Href)}
              >
                {t('auth.consent_terms')}
              </Text>{' '}
              {t('auth.consent_and')}{' '}
              <Text
                style={styles.consentLink}
                onPress={() => router.push('/privacy' as Href)}
              >
                {t('auth.consent_privacy')}
              </Text>
            </Text>
          </View>
        ) : null}

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
  // Phase 3 — consent checkbox row.
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.mossDeep,
    borderColor: colors.mossDeep,
  },
  checkboxMark: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
    lineHeight: 16,
  },
  consentText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
  },
  consentLink: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
    textDecorationLine: 'underline',
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

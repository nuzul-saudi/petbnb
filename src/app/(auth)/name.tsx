// Owner signup — final step. After OTP + password the user lands here
// to enter their full name. Role is implicit: anyone signing up via
// the regular /sign-in funnel is an owner. (The host signup funnel
// at /become-host has its own multi-field application form and
// doesn't pass through this screen.)
//
// Replaces the old /role screen which combined name capture with a
// 3-way role chooser (owner / host / both) — the persona-separation
// work removed self-service role choice; hosts apply via a separate
// flow that requires admin approval.

import { logWarn } from '@/lib/log';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function NameScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user, refreshProfile } = useAuth();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  const canSave = name.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!canSave || !supabase) return;
    setSaving(true);
    setError(null);
    try {
      const { error: e } = await supabase
        .from('profiles')
        .update({ full_name: name.trim(), role: 'owner' })
        .eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
      router.replace('/');
    } catch (err) {
      logWarn('[auth.name_save_failed]', err);
      setError(t('auth.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t('auth.name_title')}</Text>
        <Text style={styles.subtitle}>{t('auth.name_subtitle')}</Text>

        <Text style={styles.label}>{t('auth.name_label')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('auth.name_placeholder')}
          placeholderTextColor={colors.inkSoft}
          autoCapitalize="words"
          autoFocus
          style={styles.input}
          onSubmitEditing={onSave}
          returnKeyType="done"
        />

        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[styles.button, !canSave && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>
            {saving ? t('auth.saving') : t('auth.continue_button')}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  container: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
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
  },
  button: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

import { logWarn } from '@/lib/log';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { RoleEditor, type SelectableRole } from '@/components/RoleEditor';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function RoleScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { initializing, session, user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<SelectableRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  const canSave = name.trim().length > 0 && selected !== null && !saving;

  const onSave = async () => {
    if (!canSave || !supabase) return;
    setSaving(true);
    setError(null);
    try {
      const { error: e } = await supabase
        .from('profiles')
        .update({ full_name: name.trim(), role: selected! })
        .eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
      router.replace('/');
    } catch (err) {
      logWarn('[auth.save_failed]', err);
      setError(t('auth.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t('auth.role_title')}</Text>
        <Text style={styles.subtitle}>{t('auth.role_subtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.name_label')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('auth.name_placeholder')}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        <Text style={styles.question}>{t('auth.role_question')}</Text>

        <RoleEditor value={selected} onChange={setSelected} />

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
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
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
    textAlign: 'right',
  },
  question: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
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

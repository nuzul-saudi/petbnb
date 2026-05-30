import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { RoleEditor, type SelectableRole } from '@/components/RoleEditor';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user, profile, refreshProfile, signOut } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [name, setName] = useState('');
  const [role, setRole] = useState<SelectableRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the form from the loaded profile.
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name);
    if (profile.role !== 'admin') {
      setRole(profile.role as SelectableRole);
    } else {
      setRole(null);
    }
  }, [profile]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;
  if (!profile) return <SafeAreaView style={styles.safe} />;

  const isAdmin = profile.role === 'admin';
  const nameChanged = name.trim() !== profile.full_name;
  const roleChanged = role !== null && role !== profile.role;
  const canSave = nameChanged || roleChanged;

  const onSave = async () => {
    if (!supabase || !canSave) return;
    if (!name.trim()) {
      setError(t('profile.name_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: { full_name?: string; role?: SelectableRole } = {};
      if (nameChanged) patch.full_name = name.trim();
      if (roleChanged && role) patch.role = role;
      const { error: e } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
    } catch (e) {
      console.warn('[profile.save_failed]', e);
      setError(t('profile.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
            <Text style={styles.backText}>{t('profile.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('profile.title')}</Text>
        </View>

        {/* Read-only contact info */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('profile.email_label')}</Text>
            <Text style={styles.infoValue}>{user.email ?? '—'}</Text>
          </View>
        </View>

        {/* Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('profile.name_label')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('profile.name_placeholder')}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>

        {/* Role (RoleEditor or admin note) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('profile.role_label')}</Text>
          {isAdmin ? (
            <View style={styles.adminNote}>
              <Text style={styles.adminNoteText}>{t('profile.admin_note')}</Text>
            </View>
          ) : (
            <RoleEditor value={role} onChange={setRole} />
          )}
        </View>

        {/* Pets shortcut */}
        <Pressable
          onPress={() => router.push('/pets')}
          style={styles.navRow}
        >
          <Text style={styles.navText}>{t('profile.my_pets_link')}</Text>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={onSave}
          disabled={!canSave || saving}
          style={[
            styles.saveButton,
            (!canSave || saving) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.saveText}>
            {saving ? t('profile.saving') : t('profile.save_changes')}
          </Text>
        </Pressable>

        <Pressable onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>{t('home.sign_out')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  infoValue: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'left',
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
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
    fontSize: 15,
    color: colors.ink,
  },
  adminNote: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  adminNoteText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  navText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  navArrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.inkSoft,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  signOutButton: {
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  signOutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

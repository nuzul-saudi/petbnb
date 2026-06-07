// Create-listing screen. After the 7.5a refactor this is a thin shell
// around <ListingForm/> — the form fields, validation, district modal,
// and save/cancel buttons all live in src/components/ListingForm.tsx
// so the same UI backs both /listings/new and /listings/[id]/edit.
//
// What stays here:
//   • the screen scaffolding (SafeArea + AppHeader + ScrollView)
//   • the back-link + page title row
//   • the create-specific save handler: calls createListing then
//     routes home. is_active defaults to false at the DB layer
//     (migration 0019) so new listings land in the admin queue;
//     this screen never touches is_active.
//
// What moved out: the form body, the validation logic, the district
// picker, the stepper, the toggle rows, the gender chip row, the
// save/cancel Buttons. Behaviour is byte-equivalent to the original
// 7.2d implementation — see ListingForm.tsx for the inline comments
// preserved from the original.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { ListingForm, type ListingFormValues } from '@/components/ListingForm';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { createListing } from '@/lib/listings';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function NewListingScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  const onSave = async (values: ListingFormValues) => {
    setSaveError(null);
    setSaving(true);
    try {
      await createListing({
        hostId: user.id,
        ...values,
      });
      router.replace('/');
    } catch (e) {
      console.warn('[listings.form.save_failed]', e);
      setSaveError(t('listings.form.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => router.replace('/');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.backLink}>
            <Text style={styles.backText}>{t('listings.form.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('listings.form.new_title')}</Text>
        </View>

        <ListingForm
          saving={saving}
          saveError={saveError}
          saveLabel={t('listings.form.save_button')}
          savingLabel={t('listings.form.saving')}
          cancelLabel={t('listings.form.cancel_button')}
          onSave={onSave}
          onCancel={onCancel}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream in owner mode, honey in host mode).
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
});

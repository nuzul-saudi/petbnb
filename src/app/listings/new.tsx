import { logWarn } from '@/lib/log';
// Create-listing screen. After the 7.5a refactor this is a thin shell
// around <ListingForm/> — the form fields, validation, district modal,
// and save/cancel buttons all live in src/components/ListingForm.tsx
// so the same UI backs both /listings/new and /listings/[id]/edit.
//
// What stays here:
//   • the screen scaffolding (SafeArea + AppHeader + ScrollView)
//   • the back-link + page title row
//   • the create-specific save handler: calls createListing then
//     routes home. status='pending' is written explicitly by
//     createListing (and is the column default after migration 0021)
//     so new listings land in the admin queue; this screen never
//     touches status directly.
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
import { Button } from '@/components/Button';
import { ListingForm, type ListingFormValues } from '@/components/ListingForm';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { createListing } from '@/lib/listings';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function NewListingScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user, profile } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;
  // §g (2026-06-29) — role gate. Pre-§g this branch was a silent
  // `<Redirect href="/" />` that bounced non-hosts home with no
  // explanation. After the role-aware listings sweep in 0045, a
  // demoted host (host_application_status still 'approved' +
  // host_profile_complete still true, but role flipped to
  // 'owner') would otherwise hit the redirect with no idea why
  // they can't create. Replace the silent redirect with an
  // explicit blocked-state panel matching the edit/photos/
  // availability gates' pattern.
  //
  // The other redirects below are intentional in-flight routing
  // for users mid-host-application (no application yet, pending
  // review, or approved-but-profile-incomplete) and stay as-is.
  if (profile && profile.role !== 'host') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {t('listings.role_gate_new_not_host')}
          </Text>
          <Button
            label={t('listings.form.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }
  if (profile && !profile.host_application_status) {
    return <Redirect href="/become-host/application" />;
  }
  if (profile && profile.host_application_status === 'pending') {
    return <Redirect href="/profile" />;
  }
  if (
    profile &&
    profile.host_application_status === 'approved' &&
    !profile.host_profile_complete
  ) {
    return <Redirect href="/become-host/complete-profile" />;
  }

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
      logWarn('[listings.form.save_failed]', e);
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
  // §g (2026-06-29) — role-gate blocked-state panel. Mirrors the
  // pattern used by edit/photos/availability so a non-host (admin
  // demotion or never-applied) sees a clear message + a back-home
  // button instead of being silently redirected.
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
});

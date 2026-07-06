// Phase 3 — shared renderer for the /terms + /privacy legal screens.
//
// Renders placeholder copy from i18n, clearly marked as DRAFT via a
// banner. The final PDPL/ToS text arrives from the Business Track and
// is swapped in by editing the locale files only — no code changes.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { useTranslation } from '@/lib/i18n';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

/** Compact "الشروط · الخصوصية" link row for screen footers (Phase 3).
 *  Dropped into sign-in, the host application, and the listing detail. */
export function LegalFooterLinks() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={styles.footerRow}>
      <Pressable onPress={() => router.push('/terms' as never)}>
        <Text style={styles.footerLink}>{t('legal.footer_terms')}</Text>
      </Pressable>
      <Text style={styles.footerDot}>·</Text>
      <Pressable onPress={() => router.push('/privacy' as never)}>
        <Text style={styles.footerLink}>{t('legal.footer_privacy')}</Text>
      </Pressable>
    </View>
  );
}

export type LegalSection = {
  /** i18n key for an optional section heading. */
  titleKey?: string;
  /** i18n keys, one per paragraph. */
  paragraphKeys: string[];
};

export function LegalPage({
  titleKey,
  sections,
}: {
  titleKey: string;
  sections: LegalSection[];
}) {
  const { t, locale, setLocale } = useTranslation();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: theme.accent }]}>
          {t(titleKey)}
        </Text>

        {/* DRAFT banner — removed only when the Business Track ships
            the final PDPL/ToS text. */}
        <View style={styles.draftBanner}>
          <Text style={styles.draftBannerText}>{t('legal.draft_banner')}</Text>
        </View>

        {sections.map((s, i) => (
          <View key={i} style={styles.section}>
            {s.titleKey ? (
              <Text style={styles.sectionTitle}>{t(s.titleKey)}</Text>
            ) : null}
            {s.paragraphKeys.map((k) => (
              <Text key={k} style={styles.paragraph}>
                {t(k)}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  draftBanner: {
    backgroundColor: colors.whisper,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  draftBannerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  paragraph: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 22,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  footerLink: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  footerDot: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
});

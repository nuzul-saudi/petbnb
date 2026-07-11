// <Screen> — the standard page frame (Wave 1b, S4 / 2026-07-11).
//
// Every non-home screen was hand-assembling the same four things:
//   SafeAreaView + <AppHeader> + a header row (back link + title) + body.
// That drifted — some screens forgot the back affordance (the
// become-host/complete-profile dead-end the founder hit), some used
// 10px vs 11px, some tinted the title, some didn't. This assembles the
// frame ONCE so screens pass `title` / `back` and drop straight into
// their body content (a FlatList, a ScrollView, or a plain View).
//
// Body is whatever you pass as children — the frame does NOT wrap it in
// a ScrollView, so list screens keep their FlatList and form screens
// keep their own ScrollView.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { useTranslation } from '@/lib/i18n';
import { useTheme } from '@/theme/theme';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Back affordance:
 *   true            → router.back()
 *   { href }        → router.replace(href) (most screens have a canonical
 *                     parent — feed, profile — they should return to, not
 *                     an arbitrary history entry)
 *   { onPress }     → custom handler (e.g. a leave-guard confirm)
 *   { label }       → override the default "← رجوع" text
 * Omit `back` entirely for a header-only screen.
 */
export type BackProp =
  | boolean
  | { href?: string; onPress?: () => void; label?: string };

export type ScreenProps = {
  /** Title shown in the sub-header row. Omit for a back-only header. */
  title?: string;
  /** Back affordance — see BackProp. Omit for no back control. */
  back?: BackProp;
  /**
   * SafeAreaView edges. Defaults to ['bottom'] — AppHeader already sits
   * under the top inset via the bar, matching the existing screens that
   * pass edges={['bottom']}. Pass explicitly to override.
   */
  edges?: readonly Edge[];
  /** Forwarded to AppHeader — cancel nav when the screen has unsaved work. */
  confirmLeave?: () => boolean;
  /**
   * Tint the title with the persona accent (moss for owner/admin, gold
   * for host). Matches screens like /notifications that already do this.
   * Off by default (static mossDeep).
   */
  accentTitle?: boolean;
  children: ReactNode;
};

export function Screen({
  title,
  back,
  edges = ['bottom'],
  confirmLeave,
  accentTitle,
  children,
}: ScreenProps) {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const theme = useTheme();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const backCfg = back === true ? {} : back || null;
  const onBack = () => {
    if (!backCfg) return;
    if (backCfg.onPress) return backCfg.onPress();
    // Cast: without generated typed-routes, Href doesn't widen from
    // string here; call sites pass validated paths (same pattern as
    // AppHeader).
    if (backCfg.href) return router.replace(backCfg.href as never);
    return router.back();
  };
  const backLabel = (backCfg && backCfg.label) || t('common.back');

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <AppHeader
        locale={locale}
        onLanguageToggle={toggleLocale}
        confirmLeave={confirmLeave}
      />
      {backCfg || title ? (
        <View style={styles.header}>
          {backCfg ? (
            <Pressable
              onPress={onBack}
              style={styles.backLink}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
            >
              <Text style={styles.backText}>{backLabel}</Text>
            </Pressable>
          ) : null}
          {title ? (
            <Text
              style={[styles.title, accentTitle && { color: theme.accent }]}
              accessibilityRole="header"
            >
              {title}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
    // Static fallback; accentTitle overlays theme.accent inline.
    color: colors.mossDeep,
  },
});

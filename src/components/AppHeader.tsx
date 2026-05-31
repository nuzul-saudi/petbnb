// Shared top navigation. Pure presentational — locale state is owned by
// the LocaleProvider; AppHeader receives current locale + toggle callback
// via props so screens don't have to import locale state themselves.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, spacing } from '@/theme/tokens';

export type AppHeaderProps = {
  locale: 'ar' | 'en';
  onLanguageToggle: () => void;
  /**
   * Optional gate run before each nav-item press. Return false to cancel
   * the navigation (e.g. when the screen has unsaved work and asked the
   * user "leave without saving?" via window.confirm and they tapped Cancel).
   * Returning true (or not providing the callback) lets nav proceed.
   * The language toggle is NOT gated — switching locale is not navigation.
   */
  confirmLeave?: () => boolean;
};

export function AppHeader({
  locale,
  onLanguageToggle,
  confirmLeave,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  // Active-route detection: '/' is exact-match; the others are prefix
  // matches so /bookings/[id] still highlights "My Bookings".
  const isActive = (route: string): boolean => {
    if (route === '/') return pathname === '/';
    return pathname === route || pathname.startsWith(route + '/');
  };

  // Wrap a nav action with the confirmLeave gate (if set). Synchronous so
  // it composes cleanly with Pressable.onPress; web's window.confirm is
  // synchronous, which is what we want for nav cancellation.
  const safeNav = (fn: () => void) => () => {
    if (confirmLeave && !confirmLeave()) return;
    fn();
  };

  return (
    <View style={styles.bar}>
      <NavItem
        label={t('nav.home')}
        active={isActive('/')}
        onPress={safeNav(() => router.push('/'))}
      />
      <NavItem
        label={t('nav.bookings')}
        active={isActive('/bookings')}
        onPress={safeNav(() => router.push('/bookings'))}
      />
      <NavItem
        label={t('nav.account')}
        active={isActive('/profile')}
        onPress={safeNav(() => router.push('/profile'))}
      />
      <Pressable onPress={onLanguageToggle} style={styles.langToggle}>
        <Text style={styles.langToggleText}>
          {locale === 'ar'
            ? t('nav.lang_toggle_to_en')
            : t('nav.lang_toggle_to_ar')}
        </Text>
      </Pressable>
    </View>
  );
}

function NavItem({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <Text style={[styles.navText, active && styles.navTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.cream,
    borderBottomWidth: 1,
    borderBottomColor: colors.whisper,
  },
  navItem: {
    paddingVertical: spacing.sm,
  },
  navText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  navTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.moss,
  },
  langToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  langToggleText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.moss,
  },
});

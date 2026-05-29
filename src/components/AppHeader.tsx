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
};

export function AppHeader({ locale, onLanguageToggle }: AppHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  // Active-route detection: '/' is exact-match; the others are prefix
  // matches so /bookings/[id] still highlights "My Bookings".
  const isActive = (route: string): boolean => {
    if (route === '/') return pathname === '/';
    return pathname === route || pathname.startsWith(route + '/');
  };

  return (
    <View style={styles.bar}>
      <NavItem
        label={t('nav.home')}
        active={isActive('/')}
        onPress={() => router.push('/')}
      />
      <NavItem
        label={t('nav.bookings')}
        active={isActive('/bookings')}
        // @ts-expect-error — Expo Router file-path vs runtime URL mismatch on index routes.
        onPress={() => router.push('/bookings')}
      />
      <NavItem
        label={t('nav.account')}
        active={isActive('/profile')}
        onPress={() => router.push('/profile')}
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
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  langToggleText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.moss,
  },
});

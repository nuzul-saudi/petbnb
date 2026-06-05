// Shared top navigation. Pure presentational — locale state is owned by
// the LocaleProvider; AppHeader receives current locale + toggle callback
// via props so screens don't have to import locale state themselves.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { usePersona } from '@/lib/persona';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

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
  const { profile } = useAuth();
  const { persona, setPersona } = usePersona();
  const theme = useTheme();

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
        activeColor={theme.accent}
        onPress={safeNav(() => router.push('/'))}
      />
      <NavItem
        label={t('nav.bookings')}
        active={isActive('/bookings')}
        activeColor={theme.accent}
        onPress={safeNav(() => router.push('/bookings'))}
      />
      <NavItem
        label={t('nav.account')}
        active={isActive('/profile')}
        activeColor={theme.accent}
        onPress={safeNav(() => router.push('/profile'))}
      />
      {/* Persona switch — visible only for role='both'. Tapping the
          inactive pill calls setPersona; tapping the active pill is a
          no-op. Not gated by confirmLeave because switching persona
          doesn't navigate (it changes which home renders later, when
          the user taps Home in the nav). */}
      {profile?.role === 'both' ? (
        <View style={styles.personaSwitch}>
          <Pressable
            onPress={() => {
              if (persona !== 'owner') setPersona('owner');
            }}
            style={[
              styles.personaPill,
              persona === 'owner' && styles.personaPillActive,
              persona === 'owner' && {
                backgroundColor: theme.accent,
                borderColor: theme.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.personaPillText,
                persona === 'owner' && styles.personaPillTextActive,
              ]}
            >
              {t('persona.owner')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (persona !== 'host') setPersona('host');
            }}
            style={[
              styles.personaPill,
              persona === 'host' && styles.personaPillActive,
              persona === 'host' && {
                backgroundColor: theme.accent,
                borderColor: theme.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.personaPillText,
                persona === 'host' && styles.personaPillTextActive,
              ]}
            >
              {t('persona.host')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable onPress={onLanguageToggle} style={styles.langToggle}>
        <Text style={[styles.langToggleText, { color: theme.accent }]}>
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
  activeColor,
  onPress,
}: {
  label: string;
  active: boolean;
  // Persona-aware accent for the active state. Owner mode resolves to
  // colors.moss (matches the static navTextActive style), host mode to
  // colors.goldDeep. Passed in by AppHeader so NavItem stays a plain
  // sub-component without its own hook calls.
  activeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <Text
        style={[
          styles.navText,
          active && styles.navTextActive,
          active && { color: activeColor },
        ]}
      >
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
  // Persona switch — two-pill toggle visible only for role='both'.
  // Active pill: moss-filled. Inactive: whisper-outlined. Sized to fit
  // the existing header density. 7.1e will add a small attention dot
  // to the host pill; the layout already leaves room (the pill is its
  // own positioned element, so a corner dot won't disrupt flow).
  personaSwitch: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  personaPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  personaPillActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  personaPillText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
  },
  personaPillTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.cream,
  },
});

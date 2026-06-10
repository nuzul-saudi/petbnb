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

// Test round 3 (2026-06-10): in host persona, "My Bookings" became
// confusing because the owner-side bookings list always showed empty
// (the host wasn't the owner of any booking). Renamed and re-routed —
// host persona shows "My Listings" pointing at /, which is the host
// home. Incoming bookings remain accessible via the persona-aware
// /bookings list (reachable from the standalone pending-requests
// badge below, or by typing the URL directly).
const HOST_NAV_BOOKINGS_LABEL_KEY = 'nav.my_listings';
const HOST_NAV_BOOKINGS_ROUTE = '/';
const OWNER_NAV_BOOKINGS_LABEL_KEY = 'nav.bookings';
const OWNER_NAV_BOOKINGS_ROUTE = '/bookings';

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
  const { persona, setPersona, pendingHostCount } = usePersona();
  const theme = useTheme();

  // Host = pure 'host' role OR 'both' currently in host persona.
  const isHostMode =
    profile?.role === 'host' ||
    (profile?.role === 'both' && persona === 'host');

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
    <View style={[styles.bar, { backgroundColor: theme.background }]}>
      <NavItem
        label={t('nav.home')}
        active={isActive('/')}
        activeColor={theme.accent}
        onPress={safeNav(() => router.push('/'))}
      />
      <NavItem
        label={t(
          isHostMode ? HOST_NAV_BOOKINGS_LABEL_KEY : OWNER_NAV_BOOKINGS_LABEL_KEY,
        )}
        active={isActive(
          isHostMode ? HOST_NAV_BOOKINGS_ROUTE : OWNER_NAV_BOOKINGS_ROUTE,
        )}
        activeColor={theme.accent}
        onPress={safeNav(() =>
          router.push(
            isHostMode ? HOST_NAV_BOOKINGS_ROUTE : OWNER_NAV_BOOKINGS_ROUTE,
          ),
        )}
      />
      <NavItem
        label={t('nav.account')}
        active={isActive('/profile')}
        activeColor={theme.accent}
        onPress={safeNav(() => router.push('/profile'))}
      />
      {/* Persona toggle — visible only for role='both'. Single
          destination-labeled button: its label names the OTHER persona
          (the one you'd switch TO). Tapping calls setPersona(the other
          persona) AND routes to '/', so the user lands on the new
          persona's home immediately instead of staying on a screen
          whose CTAs (e.g. listing-detail's "Edit listing" only renders
          for hosts) read oddly in the new lens. Gated by confirmLeave
          because the toggle is now real navigation — a dirty form on
          the current screen should get the same leave-prompt it would
          get from any other nav item.

          Pending-host attention badge placement is mode-dependent:
            • Owner mode → badge sits ON the toggle (the toggle IS the
              host-mode entry point, so the alert belongs there).
            • Host mode → badge is a standalone Pressable next to the
              toggle (the toggle says "Owner" and host-work alert on it
              would read confusingly). Tapping the standalone badge
              routes to the host home for now; 7.6 will repoint at the
              pending-requests list. */}
      {profile?.role === 'both' ? (
        <View style={styles.personaSwitch}>
          <Pressable
            onPress={safeNav(() => {
              setPersona(persona === 'host' ? 'owner' : 'host');
              router.replace('/');
            })}
            style={[styles.personaToggle, { borderColor: theme.accent }]}
          >
            <Text style={[styles.personaToggleText, { color: theme.accent }]}>
              {persona === 'host' ? t('persona.owner') : t('persona.host')}
            </Text>
            {persona === 'owner' && pendingHostCount > 0 ? (
              <View style={styles.attentionDot}>
                <Text style={styles.attentionDotText}>
                  {pendingHostCount > 9 ? '9+' : String(pendingHostCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
          {persona === 'host' && pendingHostCount > 0 ? (
            <Pressable
              // Test round 3 (2026-06-10): the badge now routes to
              // /bookings, which became persona-aware and lists the
              // host's incoming bookings (requested + accepted +
              // active + completed). Previously routed to '/' which
              // dropped the host onto their own listings page with no
              // path to the requests the badge was pointing at.
              onPress={() => router.push('/bookings')}
              style={styles.requestsBadge}
            >
              {/* Inbox-tray glyph names the badge: this is pending
                  requests, not a generic alert. Emoji avoids new i18n
                  keys; reads in both LTR and RTL since flex-row
                  reverses naturally and the glyph itself isn't
                  directional. */}
              <Text style={styles.requestsBadgeIcon}>📥</Text>
              <Text style={styles.attentionDotText}>
                {pendingHostCount > 9 ? '9+' : String(pendingHostCount)}
              </Text>
            </Pressable>
          ) : null}
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
    // backgroundColor applied inline at the JSX site so the header
    // tints with the active persona (cream in owner, honey in host).
    // Owner mode resolves theme.background to colors.cream — same
    // pixel as the previous static value.
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
  // Persona switch container — holds the single destination toggle
  // and (in host mode) the standalone attention badge as siblings.
  personaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // Single destination-labeled toggle (replaces the old two-pill
  // control). Outlined treatment — transparent bg + theme.accent border
  // + theme.accent label applied inline at the JSX site. Matches the
  // header's existing density (small pill, similar size to langToggle).
  personaToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  personaToggleText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  // Attention badge that sits ON the destination toggle when in owner
  // mode. `end` (not `right`) keeps it on the trailing edge in both
  // LTR and RTL. minWidth + paddingHorizontal lets it stretch for
  // "9+" without losing pill shape on single digits.
  attentionDot: {
    position: 'absolute',
    top: -4,
    end: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Standalone host-mode badge — icon + count pill (replaces the bare
  // attentionDotInline from the prior revision). The inbox glyph self-
  // labels it as "pending requests" so the meaning is obvious on first
  // encounter; the count behavior matches the owner-mode badge (1–9,
  // "9+" cap, hidden at 0). Slightly taller than attentionDot to seat
  // the icon comfortably alongside the count.
  requestsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 18,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.terracotta,
  },
  requestsBadgeIcon: {
    fontSize: 12,
    // tight lineHeight keeps the emoji centered with the count text
    lineHeight: 14,
  },
  attentionDotText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.cream,
    lineHeight: 12,
  },
});

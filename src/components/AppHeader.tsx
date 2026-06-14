// Top app bar (Move 1 — 2026-06-13). Airbnb-pattern: logo on the
// leading edge, persona pill + hamburger on the trailing edge. The
// hamburger opens a Modal containing the previously-inline nav
// items (My Account, My Bookings, My Pets, My Favorites) plus the
// language toggle and Sign out. Guest visitors see a Sign-in CTA
// instead of the hamburger.
//
// The persona pill stays OUTSIDE the menu so the Owner↔Host toggle
// remains a one-tap action and the pending-requests attention badge
// is always visible (it's a live signal).

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { usePersona } from '@/lib/persona';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

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
  const { session, profile, signOut } = useAuth();
  const { persona, setPersona, pendingHostCount } = usePersona();
  const theme = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);

  const isGuest = !session;

  // Wrap a nav action with the confirmLeave gate (if set). Synchronous so
  // it composes cleanly with Pressable.onPress.
  const safeNav = (fn: () => void) => () => {
    if (confirmLeave && !confirmLeave()) return;
    fn();
  };

  const goAndClose = (path: string) => () => {
    if (confirmLeave && !confirmLeave()) return;
    setMenuOpen(false);
    // Cast: pathname union doesn't widen to string; this header is
    // generic and routes are validated at the call site.
    router.push(path as never);
  };

  return (
    <View style={[styles.bar, { backgroundColor: theme.background }]}>
      {/* Wordmark — leading edge, taps home */}
      <Pressable onPress={safeNav(() => router.push('/'))} style={styles.logo}>
        <Text style={styles.logoText}>{t('nav.app_name')}</Text>
      </Pressable>

      <View style={styles.spacer} />

      {/* Move 3 — Become-a-Host CTA. Owner-only users see the
          recruitment pill; 'both' users already have the persona
          pill below (with the live pending-requests attention
          badge) so a separate "Switch to hosting" CTA would just
          duplicate it. Founder feedback 2026-06-14: drop the
          duplicate, let the persona pill be the single
          context-switch control for 'both' users. */}
      {!isGuest && profile?.role === 'owner' ? (
        <Pressable
          onPress={safeNav(() => router.push('/profile' as never))}
          style={styles.becomeHostCta}
          accessibilityRole="button"
          accessibilityLabel={t('nav.become_host')}
        >
          <Text style={styles.becomeHostCtaText}>
            {t('nav.become_host')}
          </Text>
        </Pressable>
      ) : null}

      {/* Guest path: language toggle + Sign-in CTA. The hamburger
          menu (which holds the language toggle for signed-in users)
          isn't shown to guests — surface the toggle here instead so
          a non-Arabic visitor isn't stuck in AR. */}
      {isGuest ? (
        <>
          <Pressable
            onPress={onLanguageToggle}
            style={styles.guestLangButton}
            accessibilityRole="button"
          >
            <Text style={[styles.guestLangButtonText, { color: theme.accent }]}>
              {locale === 'ar' ? 'EN' : 'ع'}
            </Text>
          </Pressable>
          <Pressable
            onPress={safeNav(() =>
              router.push(
                `/sign-in?returnTo=${encodeURIComponent(pathname ?? '/')}` as never,
              ),
            )}
            style={[styles.personaToggle, { borderColor: theme.accent }]}
          >
            <Text style={[styles.personaToggleText, { color: theme.accent }]}>
              {t('nav.guest_sign_in')}
            </Text>
          </Pressable>
        </>
      ) : null}

      {/* Persona pill — visible only for role='both'. Stays outside
          the hamburger so the toggle + attention badge are always
          one tap away. */}
      {!isGuest && profile?.role === 'both' ? (
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
              onPress={() => router.push('/bookings')}
              style={styles.requestsBadge}
            >
              <Text style={styles.requestsBadgeIcon}>📥</Text>
              <Text style={styles.attentionDotText}>
                {pendingHostCount > 9 ? '9+' : String(pendingHostCount)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Hamburger — signed-in only. Opens the Modal menu below. */}
      {!isGuest ? (
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={styles.hamburger}
          accessibilityRole="button"
          accessibilityLabel={t('nav.menu_open')}
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </Pressable>
      ) : null}

      {/* Menu modal. Trailing-edge dropdown over a tap-to-dismiss
          backdrop. Backdrop tap closes; sheet tap doesn't bubble. */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <MenuItem
              label={t('nav.account')}
              onPress={goAndClose('/profile')}
            />
            <MenuItem
              label={t('nav.bookings')}
              onPress={goAndClose('/bookings')}
            />
            <MenuItem
              label={t('profile.my_pets_link')}
              onPress={goAndClose('/pets')}
            />
            <MenuItem
              label={t('favorites.title')}
              onPress={goAndClose('/favorites')}
            />

            <View style={styles.menuDivider} />

            <MenuItem
              label={
                locale === 'ar'
                  ? t('nav.lang_toggle_to_en_full')
                  : t('nav.lang_toggle_to_ar_full')
              }
              onPress={() => {
                onLanguageToggle();
                setMenuOpen(false);
              }}
            />

            <View style={styles.menuDivider} />

            <MenuItem
              label={t('home.sign_out')}
              destructive
              onPress={async () => {
                setMenuOpen(false);
                await signOut();
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <Text
        style={[
          styles.menuItemText,
          destructive && styles.menuItemTextDestructive,
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
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.whisper,
  },
  logo: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  logoText: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
  },
  spacer: {
    flex: 1,
  },
  // Hamburger button — 3 stacked lines. Hand-built so we don't pull
  // in an icon font for one glyph.
  hamburger: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: colors.ink,
    borderRadius: 1,
  },
  // Move 3 — Become-a-Host CTA. Solid moss button to draw attention;
  // it's the supply-side growth signal, not a neutral nav link.
  becomeHostCta: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.mossDeep,
  },
  becomeHostCtaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.cream,
  },
  // ── Persona toggle (kept from prior AppHeader) ────────────
  personaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  personaToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  // Guest language toggle — compact, sits left of the Sign-in pill.
  guestLangButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  guestLangButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  personaToggleText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
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
    lineHeight: 14,
  },
  attentionDotText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.cream,
    lineHeight: 12,
  },
  // ── Menu modal ────────────────────────────────────────────
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 56 + spacing.sm, // sits just under the header bar
    paddingHorizontal: spacing.md,
  },
  menuSheet: {
    width: '100%',
    maxWidth: 260,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  menuItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuItemText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  menuItemTextDestructive: {
    color: colors.terracotta,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.whisper,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.sm,
  },
});

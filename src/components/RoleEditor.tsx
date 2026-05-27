// Reusable role-card chooser. Used by:
//   - The onboarding screen at /role to capture the initial pick after
//     the very first sign-in (extracted from there in Step 5.5C).
//   - The customer profile screen at /profile to switch roles later
//     (lands in Step 5.5C Commit B).
//
// Deliberately presentational — no auth, no Supabase, no navigation.
// Parent owns the save and the post-save side effects.
//
// 'admin' is intentionally excluded from the selectable set. Admin is
// granted by another admin via the user-detail screen at
// /admin/users/[id], never via self-service. An admin viewing their
// own profile screen will see this editor with no current selection;
// the parent screen is responsible for deciding whether to render
// the editor at all in that case.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

export type SelectableRole = Exclude<Enums<'user_role'>, 'admin'>;

type RoleOption = {
  value: SelectableRole;
  icon: string;
};

const ROLES: readonly RoleOption[] = [
  { value: 'owner', icon: '🐈' },
  { value: 'host', icon: '🏠' },
  { value: 'both', icon: '⚭' },
] as const;

type Props = {
  /** Current selection, or null when nothing is picked yet (onboarding). */
  value: SelectableRole | null;
  onChange: (role: SelectableRole) => void;
};

export function RoleEditor({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.cards}>
      {ROLES.map(({ value: roleValue, icon }) => {
        const selected = value === roleValue;
        return (
          <Pressable
            key={roleValue}
            onPress={() => onChange(roleValue)}
            style={[styles.card, selected && styles.cardSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.content}>
              <Text style={styles.title}>{t(`role.${roleValue}_title`)}</Text>
              <Text style={styles.desc}>{t(`role.${roleValue}_desc`)}</Text>
            </View>
            {selected ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 2,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardSelected: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  icon: {
    fontSize: 32,
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'right',
  },
  desc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'right',
    marginTop: 2,
  },
  check: {
    fontSize: 24,
    color: colors.moss,
    fontFamily: fonts.bodyBold,
  },
});

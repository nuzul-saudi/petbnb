// Root error boundary — kills the blank-screen failure class.
//
// Before this existed, any uncaught render/lifecycle error unmounted the
// whole React tree and the user saw a silent white page (the July 2026
// realtime channel-collision crash surfaced exactly this way). Now the
// error is reported to Sentry via the Phase 1 wiring and the user gets a
// minimal retry card instead of a dead screen.
//
// Placement contract (see _layout.tsx): this is the OUTERMOST wrapper —
// ABOVE SafeAreaProvider and every app provider — so a crash inside a
// provider is caught too. That placement is why this file must not use
// any hook/context (no useTranslation, no useTheme, no safe-area insets):
// it renders with the module-scope t() from src/lib/i18n and static
// design tokens only.
//
// Retry semantics: clearing `hasError` remounts the children subtree
// (fresh provider state). If the crash cause is persistent the boundary
// simply catches again — no loop, one report per catch.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { logWarn } from '@/lib/log';
import { captureError } from '@/lib/sentry';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // captureError no-ops until Sentry init resolves and never throws —
    // safe to call unconditionally from here.
    captureError(error);
    logWarn('[error_boundary.caught]', error, info?.componentStack ?? '');
  }

  private retry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('errors.boundary_title')}</Text>
          <Pressable
            onPress={this.retry}
            accessibilityRole="button"
            style={styles.button}
          >
            <Text style={styles.buttonText}>{t('errors.boundary_retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    maxWidth: 420,
    width: '100%',
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    backgroundColor: colors.mossDeep,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
});

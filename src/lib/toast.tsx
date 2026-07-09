// Toast — a single, transient in-app card (Phase 5, Part A).
//
// Built for the realtime notifications path: when a booking request /
// message / approval lands while the app is foregrounded, the bell badge
// bumps (host-notifications) AND this pops a tappable card so the user
// notices without hunting the 🔔. No OS push — that needs native builds
// (post-pilot).
//
// Design: latest-wins (one card at a time), auto-dismiss after ~4s, tap
// to navigate to the notification's link_path then dismiss. The message
// arrives ALREADY TRANSLATED — this module is locale-agnostic. Rendered
// as a sibling AFTER children so it paints on top of the Stack.

import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logWarn } from '@/lib/log';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export type ToastOptions = {
  /** Route to push on tap (a notification's link_path). */
  linkPath?: string;
  /** Optional leading glyph (e.g. the per-type notification emoji). */
  glyph?: string;
};

type ToastContextValue = {
  /** Show a transient card. `message` must be pre-translated. */
  showToast: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

type ActiveToast = { message: string; linkPath?: string; glyph?: string };

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [opacity]);

  const showToast = useCallback(
    (message: string, opts?: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, linkPath: opts?.linkPath, glyph: opts?.glyph });
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    },
    [opacity, dismiss],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onPress = useCallback(() => {
    const target = toast?.linkPath;
    dismiss();
    if (target) {
      try {
        router.push(target as never);
      } catch (e) {
        logWarn('[toast.navigate_failed]', e);
      }
    }
  }, [toast?.linkPath, dismiss]);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            // Anchored to the BOTTOM so it never overlaps the top bar's
            // notification bell — a top toast covered the very badge it
            // was bumping (2026-07-09 founder report).
            { bottom: Math.max(insets.bottom, spacing.md) + spacing.md, opacity },
          ]}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={styles.card}
          >
            {toast.glyph ? (
              <Text style={styles.glyph}>{toast.glyph}</Text>
            ) : null}
            <Text style={styles.message} numberOfLines={2}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  // No provider (e.g. a screen rendered in isolation in a test): a no-op
  // keeps callers safe rather than throwing.
  return { showToast: () => undefined };
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 520,
    width: '100%',
    backgroundColor: colors.mossDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    ...shadows.card,
  },
  glyph: {
    fontSize: 18,
  },
  message: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
    lineHeight: 18,
  },
});

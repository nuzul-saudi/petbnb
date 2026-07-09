import { Stack, usePathname } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
} from '@expo-google-fonts/tajawal';
import {
  ReemKufi_500Medium,
  ReemKufi_700Bold,
} from '@expo-google-fonts/reem-kufi';
import { useEffect } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth';
import { LocaleProvider, useTranslation, type Locale } from '@/lib/i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HostNotificationsProvider } from '@/lib/host-notifications';
import { ToastProvider } from '@/lib/toast';
import { initAnalytics, trackPageview } from '@/lib/analytics';
import { initSentry } from '@/lib/sentry';
import { useTheme } from '@/theme/theme';

// Locale-aware layout direction. On web we drive flow via document.dir;
// on native, forceRTL() applies on next cold start (this session may
// need an explicit Updates.reloadAsync() to relayout fully).
function configureRTL(locale: Locale) {
  const rtl = locale === 'ar';
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }
  try {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  } catch {
    /* swallow re-init errors — some platforms throw on repeat calls */
  }
}

export default function RootLayout() {
  // Phase 1 observability — initialize error tracking + analytics once,
  // client-side. Both no-op unless their key/DSN is configured (and only
  // on web). Kept in an effect so neither runs during static HTML gen.
  useEffect(() => {
    initSentry();
    initAnalytics();
  }, []);

  // Kick off font loading but never gate render on it. System fonts show
  // briefly until Tajawal/Reem Kufi swap in. This keeps server-rendered
  // HTML non-empty for SEO and avoids a blank flash on slow networks.
  useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    ReemKufi_500Medium,
    ReemKufi_700Bold,
  });

  return (
    // ErrorBoundary is the OUTERMOST wrapper — above SafeAreaProvider —
    // so even a provider crash renders the retry card instead of a
    // blank screen. It uses no hooks/context by design (module-scope
    // t() + static tokens only), so this placement is safe.
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Phase 5 — LocaleProvider hoisted above ToastProvider +
              HostNotificationsProvider so the notifications provider can
              translate a notification's title_key for the realtime toast.
              LocaleProvider reads the session directly (not via useAuth),
              so it composes fine below AuthProvider at this depth.
              ToastProvider must wrap HostNotificationsProvider — the
              latter calls useToast() in its realtime effect. */}
          <LocaleProvider>
            <ToastProvider>
              <HostNotificationsProvider>
                <AppShell />
              </HostNotificationsProvider>
            </ToastProvider>
          </LocaleProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// AppShell sits INSIDE LocaleProvider so it can read the resolved locale
// via the hook and feed it to configureRTL. RootLayout itself can't use
// useTranslation because it's the component that mounts the provider.
function AppShell() {
  const { locale } = useTranslation();
  const theme = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    configureRTL(locale);
  }, [locale]);

  // Phase 1.5 — SPA pageview per route change. Router paths carry ids
  // only (no PII). No-ops until PostHog is configured + initialized.
  useEffect(() => {
    if (pathname) trackPageview(pathname);
  }, [pathname]);

  // Theme-aware screen background: applied in ONE place here so that
  // any screen whose own SafeAreaView omits backgroundColor inherits
  // theme.background through transparency. Owner mode resolves to
  // colors.cream — byte-identical to today's render where the Stack
  // contentStyle supplied the same value.
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

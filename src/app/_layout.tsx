import { Stack } from 'expo-router';
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
import { PersonaProvider } from '@/lib/persona';
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
    <SafeAreaProvider>
      <AuthProvider>
        <PersonaProvider>
          <LocaleProvider>
            <AppShell />
          </LocaleProvider>
        </PersonaProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// AppShell sits INSIDE LocaleProvider so it can read the resolved locale
// via the hook and feed it to configureRTL. RootLayout itself can't use
// useTranslation because it's the component that mounts the provider.
function AppShell() {
  const { locale } = useTranslation();
  const theme = useTheme();

  useEffect(() => {
    configureRTL(locale);
  }, [locale]);

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

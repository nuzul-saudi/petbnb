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

import { colors } from '@/theme/tokens';

// Force RTL once, at startup. On native this normally requires an app reload
// the first time; in development that's a no-op cost. On web we also set
// document.dir so the page itself flows right-to-left.
function configureRTL() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }
  if (!I18nManager.isRTL) {
    try {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    } catch {
      // Some platforms throw when called more than once — safe to ignore.
    }
  }
}

configureRTL();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    ReemKufi_500Medium,
    ReemKufi_700Bold,
  });

  useEffect(() => {
    // Belt-and-suspenders: re-assert RTL after the first render in case
    // a hot reload reset the document direction.
    configureRTL();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}
      />
    </SafeAreaProvider>
  );
}

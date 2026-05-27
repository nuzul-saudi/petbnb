import { Redirect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/tokens';

// Admin-only gate. Every /admin/* route renders through this layout, which
// re-checks the session + role + suspended state on each navigation. RLS
// would catch a non-admin client hitting admin tables anyway, but
// short-circuiting here keeps non-admins from seeing the UI shell at all.
export default function AdminLayout() {
  const { initializing, session, profile } = useAuth();

  if (initializing) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} />;
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} />;
  }
  if (profile.is_suspended) return <Redirect href="/suspended" />;
  if (profile.role !== 'admin') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
      }}
    />
  );
}

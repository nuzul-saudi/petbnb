// AsyncStorage-backed locale cache. Reads on app startup as the
// pre-sign-in fallback (and as a fast cache when Supabase is slow).
// All operations are best-effort — failures swallowed so a broken
// AsyncStorage never blocks the app from rendering.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Locale } from '@/lib/i18n';

const KEY = 'petbnb.locale';

export async function loadCachedLocale(): Promise<Locale | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'ar' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

export async function cacheLocale(loc: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, loc);
  } catch {
    /* ignore */
  }
}

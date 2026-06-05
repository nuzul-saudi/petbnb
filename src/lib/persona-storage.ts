// AsyncStorage-backed persona cache. Read on app startup as the fast
// fallback for instant first paint while the DB read resolves; written
// through alongside profiles.persona on every switch.
// All operations are best-effort — failures are swallowed so a broken
// AsyncStorage never blocks the app from rendering.
// Storage is keyed by user id so multiple users on the same device
// don't leak persona preferences across each other.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Persona } from '@/lib/persona';

function keyFor(userId: string): string {
  return `petbnb.persona:${userId}`;
}

export async function loadCachedPersona(
  userId: string,
): Promise<Persona | null> {
  try {
    const v = await AsyncStorage.getItem(keyFor(userId));
    return v === 'owner' || v === 'host' ? v : null;
  } catch {
    return null;
  }
}

export async function cachePersona(
  userId: string,
  persona: Persona,
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), persona);
  } catch {
    /* ignore */
  }
}

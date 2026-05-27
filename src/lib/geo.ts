// Geolocation wrapper.
//
// On web: browser navigator.geolocation prompt.
// On native: expo-location's foreground permission + position fetch.
//
// Returns null on permission denial, unavailable hardware, timeout, or
// any other error. Never throws. The owner feed treats null as "no
// location available — skip the distance sort and hide the distance
// line on cards" per the no-fake-numbers rule.
//
// Result is cached in module-scope memory for the lifetime of the session
// so we don't re-prompt or hit the OS GPS every time the feed remounts.
// Re-mount the page or refresh the browser to get a fresh fetch.

import { Platform } from 'react-native';

export type Coords = { lat: number; lng: number };

let cached: { coords: Coords | null; at: number } | null = null;
const STALE_AFTER_MS = 1000 * 60 * 10; // 10 minutes

function isFresh(): boolean {
  if (!cached) return false;
  return Date.now() - cached.at < STALE_AFTER_MS;
}

export function clearGeoCache(): void {
  cached = null;
}

export async function getCurrentLocation(): Promise<Coords | null> {
  if (isFresh()) return cached!.coords;

  const coords = await fetchOnce();
  cached = { coords, at: Date.now() };
  return coords;
}

async function fetchOnce(): Promise<Coords | null> {
  if (Platform.OS === 'web') {
    return fetchWeb();
  }
  return fetchNative();
}

function fetchWeb(): Promise<Coords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        // PERMISSION_DENIED (1), POSITION_UNAVAILABLE (2), TIMEOUT (3).
        // All treated the same: no location, no toast, app continues.
        if (__DEV__) console.warn('[geo] web position failed', err.code, err.message);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 5 },
    );
  });
}

async function fetchNative(): Promise<Coords | null> {
  try {
    // Dynamic import so web bundlers don't try to resolve the native module.
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (e) {
    if (__DEV__) console.warn('[geo] native position failed', e);
    return null;
  }
}

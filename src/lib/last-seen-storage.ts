// AsyncStorage-backed "last seen this booking" timestamps. Read by
// the owner bookings list to decide whether to draw an unread dot
// (a new daily_update arrived since the last open); written by the
// booking detail screen when the user opens that booking.
//
// Keyed by (userId, bookingId) so multiple users on the same device
// don't leak signals across each other. All operations are
// best-effort — a broken AsyncStorage must not block the UI.

import AsyncStorage from '@react-native-async-storage/async-storage';

function keyFor(userId: string, bookingId: string): string {
  return `petbnb.lastSeen:${userId}:${bookingId}`;
}

/**
 * Returns the ISO timestamp at which `userId` last opened
 * `bookingId`, or null if never opened (or on read failure).
 */
export async function getLastSeen(
  userId: string,
  bookingId: string,
): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(keyFor(userId, bookingId));
    return v ?? null;
  } catch {
    return null;
  }
}

/**
 * Stamp `userId`'s last-seen for `bookingId` to "now". Best-effort.
 */
export async function markSeen(
  userId: string,
  bookingId: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      keyFor(userId, bookingId),
      new Date().toISOString(),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Batched read for the bookings list. Returns a Map of bookingId →
 * ISO timestamp (or undefined if never seen). One AsyncStorage
 * multiGet so we don't N+1 the index screen.
 */
export async function getLastSeenBatch(
  userId: string,
  bookingIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (bookingIds.length === 0) return out;
  try {
    const pairs = await AsyncStorage.multiGet(
      bookingIds.map((id) => keyFor(userId, id)),
    );
    for (const [k, v] of pairs) {
      if (!v) continue;
      // Extract the trailing booking id from the key — the key shape
      // is "petbnb.lastSeen:<userId>:<bookingId>".
      const idx = k.lastIndexOf(':');
      if (idx < 0) continue;
      out.set(k.slice(idx + 1), v);
    }
  } catch {
    /* swallow; UI just shows no dots */
  }
  return out;
}

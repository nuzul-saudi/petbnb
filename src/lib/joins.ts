// Joined-array compaction — the single rule for every Supabase embed.
//
// WHY THIS EXISTS (production crash class, twice observed):
// A PostgREST nested embed like `booking_pets(pet:pets(*))` returns the
// OUTER junction row whenever the viewer can read it, but sets the INNER
// embedded object to `null` when RLS hides that inner row. Concretely: a
// host can read the `booking_pets` junction of a DECLINED booking, but the
// pets-visibility policy (0004 / 0050) deliberately excludes `declined`
// from the status set — so each `booking_pets.pet` comes back `null`. The
// assembled `pets` array is then `[null, null]`, and the first render that
// does `pets.map((p) => p.photo_url)` throws
// `TypeError: reading 'photo_url' of null` and white-screens the page.
//
// Element-null is a JOINED-ARRAY property, not a null-array property, so
// `?? []` does NOT protect against it. Every assembly that lifts a joined
// array MUST run it through one of these helpers, and every render of a
// joined entity must additionally survive an EMPTY array (RLS may hide
// every element) — see the `pets_hidden_fallback` call sites.

/**
 * Map a Supabase nested embed to its inner entity and drop the nulls RLS
 * left behind. Use for `parent(child:table(*))`-shaped embeds where the
 * inner `child` object can be null.
 *
 * @example pluckJoined(booking_pets, (bp) => bp.pet) // Pet[]
 */
export function pluckJoined<Row, T>(
  rows: readonly Row[] | null | undefined,
  pick: (row: Row) => T | null | undefined,
): T[] {
  const out: T[] = [];
  for (const row of rows ?? []) {
    const v = pick(row);
    if (v != null) out.push(v);
  }
  return out;
}

/**
 * Compact a joined array in place — drops null/undefined ELEMENTS. Use for
 * direct embeds (`listing_photos(...)`) or jsonb url arrays where a null
 * element would break a downstream `.sort` / `.map` that reads a property.
 */
export function compactJoined<T>(
  rows: readonly (T | null | undefined)[] | null | undefined,
): T[] {
  return (rows ?? []).filter((x): x is T => x != null);
}

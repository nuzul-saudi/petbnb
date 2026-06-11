// useSignedPetPhotoUrls — batch-signs pet-photo storage paths on
// data-load so list-style consumers (My Pets, OwnerPetsSection, the
// booking request pet picker) issue ONE parallel batch of
// createSignedUrl calls instead of N per render.
//
// Pre-Round-6 the upload helper returned a 7-day signed URL and that
// URL was persisted in pets.photo_url. On day 8 every pet image
// silently broke. Round 6 moved to "store the storage path, sign on
// render" — this hook is the render-time half.
//
// Returns a Map<pets.photo_url, signedUrl>. Legacy `https://...`
// entries are passed through unchanged so they keep working until
// expiry. Use Map.get(pet.photo_url) ?? null when handing the
// result to <PetAvatar photoUrl={...} />.

import { useEffect, useState } from 'react';

import { signPetPhotoUrls } from '@/lib/pets';

export function useSignedPetPhotoUrls(
  paths: (string | null | undefined)[],
): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  // Build a stable cache-key from the input — JSON.stringify is fine
  // here since the input is a short array of short strings, and
  // changing it (a pet was added / removed / photo replaced) is
  // exactly when we want to re-sign.
  const cacheKey = JSON.stringify(paths.filter((p) => !!p));

  useEffect(() => {
    let cancelled = false;
    void signPetPhotoUrls(paths).then((m) => {
      if (!cancelled) setUrls(m);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return urls;
}

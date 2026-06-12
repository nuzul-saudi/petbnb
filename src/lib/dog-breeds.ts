// Curated dog-breed list for the breed picker (Step 5.7 / Round 12).
//
// Order is Saudi-prevalence first: Saluki (the historical Arabian
// hunting dog), then breeds commonly imported by Saudi families.
//
// Photo assets are NOT included in Round 12 Phase A — the picker
// falls back to a text-only tile per breed (the same render path
// that breeds.ts uses for `unknown`). Round 12b will add Wikipedia-
// commons thumbnails for parity with the cat list.

import type { ImageSourcePropType } from 'react-native';

export type DogBreedKey =
  | 'saluki'
  | 'mixed'
  | 'labrador'
  | 'german_shepherd'
  | 'golden_retriever'
  | 'poodle'
  | 'chihuahua'
  | 'maltese'
  | 'shih_tzu'
  | 'husky'
  | 'unknown';

export type DogBreed = {
  key: DogBreedKey;
  name_ar: string;
  name_en: string;
  image: ImageSourcePropType | null;
};

export const DOG_BREEDS: readonly DogBreed[] = [
  { key: 'saluki', name_ar: 'سلوقي', name_en: 'Saluki', image: null },
  { key: 'mixed', name_ar: 'خليط', name_en: 'Mixed', image: null },
  { key: 'labrador', name_ar: 'لابرادور', name_en: 'Labrador', image: null },
  {
    key: 'german_shepherd',
    name_ar: 'جيرمن شيبرد',
    name_en: 'German Shepherd',
    image: null,
  },
  {
    key: 'golden_retriever',
    name_ar: 'جولدن ريتريفر',
    name_en: 'Golden Retriever',
    image: null,
  },
  { key: 'poodle', name_ar: 'بودل', name_en: 'Poodle', image: null },
  { key: 'chihuahua', name_ar: 'تشيواوا', name_en: 'Chihuahua', image: null },
  { key: 'maltese', name_ar: 'مالطي', name_en: 'Maltese', image: null },
  { key: 'shih_tzu', name_ar: 'شيتزو', name_en: 'Shih Tzu', image: null },
  { key: 'husky', name_ar: 'هاسكي', name_en: 'Husky', image: null },
  { key: 'unknown', name_ar: 'لا أعرف', name_en: 'Unknown', image: null },
] as const;

export function findDogBreed(key: string | null | undefined): DogBreed | undefined {
  if (!key) return undefined;
  return DOG_BREEDS.find((b) => b.key === key);
}

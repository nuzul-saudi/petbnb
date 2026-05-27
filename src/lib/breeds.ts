// Curated cat-breed list for the breed picker (Step 5.6).
//
// Order is Saudi-prevalence first per the founder's spec.
//
// Photo provenance: each image is the primary Wikipedia infobox photo
// fetched from upload.wikimedia.org via the Wikipedia summary REST API.
// The one exception is `mixed`, which used `Domestic_short-haired_cat`
// as the source page (Wikipedia has no `Mixed-breed_cat` article).
// All images are CC-licensed via Wikimedia Commons.
//
// File sizes range from ~50KB (ragdoll) to ~2.4MB (mixed). MVP-acceptable;
// a follow-up polish task can resize to ~300x300 to trim bundle weight —
// noted in CLAUDE.md Section 13 if needed.
//
// `unknown` is intentionally photo-less so the picker can render a generic
// "?" tile for owners who don't know their cat's breed.

import type { ImageSourcePropType } from 'react-native';

export type BreedKey =
  | 'persian'
  | 'siamese'
  | 'mixed'
  | 'arabian_mau'
  | 'scottish_fold'
  | 'himalayan'
  | 'maine_coon'
  | 'ragdoll'
  | 'bengal'
  | 'british_shorthair'
  | 'unknown';

export type Breed = {
  key: BreedKey;
  name_ar: string;
  name_en: string;
  image: ImageSourcePropType | null;
};

export const BREEDS: readonly Breed[] = [
  {
    key: 'persian',
    name_ar: 'شيرازي',
    name_en: 'Persian',
    image: require('../assets/breeds/persian.jpg'),
  },
  {
    key: 'siamese',
    name_ar: 'سيامي',
    name_en: 'Siamese',
    image: require('../assets/breeds/siamese.jpg'),
  },
  {
    key: 'mixed',
    name_ar: 'خليط',
    name_en: 'Mixed',
    image: require('../assets/breeds/mixed.jpg'),
  },
  {
    key: 'arabian_mau',
    name_ar: 'مو عربي',
    name_en: 'Arabian Mau',
    image: require('../assets/breeds/arabian_mau.jpg'),
  },
  {
    key: 'scottish_fold',
    name_ar: 'سكوتش فولد',
    name_en: 'Scottish Fold',
    image: require('../assets/breeds/scottish_fold.jpg'),
  },
  {
    key: 'himalayan',
    name_ar: 'هيمالايا',
    name_en: 'Himalayan',
    image: require('../assets/breeds/himalayan.jpg'),
  },
  {
    key: 'maine_coon',
    name_ar: 'مين كون',
    name_en: 'Maine Coon',
    image: require('../assets/breeds/maine_coon.jpg'),
  },
  {
    key: 'ragdoll',
    name_ar: 'راغدول',
    name_en: 'Ragdoll',
    image: require('../assets/breeds/ragdoll.jpg'),
  },
  {
    key: 'bengal',
    name_ar: 'بنغالي',
    name_en: 'Bengal',
    image: require('../assets/breeds/bengal.jpg'),
  },
  {
    key: 'british_shorthair',
    name_ar: 'بريطاني قصير الشعر',
    name_en: 'British Shorthair',
    image: require('../assets/breeds/british_shorthair.jpg'),
  },
  {
    key: 'unknown',
    name_ar: 'لا أعرف',
    name_en: 'Unknown',
    image: null,
  },
] as const;

/** Resolve a breed by key; returns undefined when key isn't a known breed. */
export function findBreed(key: string | null | undefined): Breed | undefined {
  if (!key) return undefined;
  return BREEDS.find((b) => b.key === key);
}

// Curated city + district data for the create-listing form (Step 7.2d)
// and the city-aware feed (Step 7.2c). Two cities for MVP — Riyadh and
// Dammam — matching the listings.city CHECK constraint added in
// migration 0019.
//
// Ordering within each city's districts is prevalence-first, matching
// the convention used by breeds.ts. Order is curated and can be tweaked
// without touching any type or callsite — the form's picker iterates
// this array in order.
//
// SLUG STORAGE: District `key` is a stable lowercase ASCII slug (e.g.
// 'olaya', 'al_shati'). This is the value the create-listing form will
// store in listings.neighborhood going forward. name_ar / name_en are
// display-only; they resolve via findDistrict() at render time.
//
// LEGACY DATA NOTE: pre-7.2 listings already have listings.neighborhood
// populated with ARABIC strings (e.g. 'العليا', 'الياسمين') from the
// seed data, NOT slugs. findDistrict() will NOT match those legacy
// values. The new form (7.2d) stores slugs from this file going forward;
// how to reconcile the display path for legacy rows is a deferred
// decision — two options:
//   (a) ListingCard falls back to the raw `neighborhood` text when
//       findDistrict() returns undefined (no migration; legacy rows
//       just show the Arabic string they already have).
//   (b) One-off SQL `update listings set neighborhood = '<slug>' where
//       neighborhood = '<arabic>'` to normalise the few seed rows.
// Both are cheap. Decide when 7.2c wires the feed.

export type CityKey = 'riyadh' | 'dammam';

export type District = {
  key: string;
  name_ar: string;
  name_en: string;
};

export type City = {
  key: CityKey;
  name_ar: string;
  name_en: string;
  districts: readonly District[];
};

export const CITIES: readonly City[] = [
  {
    key: 'riyadh',
    name_ar: 'الرياض',
    name_en: 'Riyadh',
    districts: [
      { key: 'olaya', name_ar: 'العليا', name_en: 'Olaya' },
      { key: 'sulaimaniyah', name_ar: 'السليمانية', name_en: 'Sulaimaniyah' },
      { key: 'malqa', name_ar: 'الملقا', name_en: 'Malqa' },
      { key: 'yasmin', name_ar: 'الياسمين', name_en: 'Yasmin' },
      { key: 'nakheel', name_ar: 'النخيل', name_en: 'Nakheel' },
      { key: 'hittin', name_ar: 'حطين', name_en: 'Hittin' },
      { key: 'wurud', name_ar: 'الورود', name_en: 'Wurud' },
      { key: 'malaz', name_ar: 'الملز', name_en: 'Malaz' },
      { key: 'murabba', name_ar: 'المربع', name_en: 'Murabba' },
      { key: 'ghadir', name_ar: 'الغدير', name_en: 'Ghadir' },
      { key: 'izdihar', name_ar: 'الازدهار', name_en: 'Izdihar' },
      { key: 'king_fahd', name_ar: 'حي الملك فهد', name_en: 'King Fahd' },
      { key: 'nuzha', name_ar: 'النزهة', name_en: 'Nuzha' },
      {
        key: 'diplomatic_quarter',
        name_ar: 'حي السفارات',
        name_en: 'Diplomatic Quarter',
      },
    ],
  },
  {
    key: 'dammam',
    name_ar: 'الدمام',
    name_en: 'Dammam',
    districts: [
      { key: 'al_shati', name_ar: 'الشاطئ', name_en: 'Al Shati' },
      { key: 'al_faisaliyah', name_ar: 'الفيصلية', name_en: 'Al Faisaliyah' },
      { key: 'al_adamah', name_ar: 'العدامة', name_en: 'Al Adamah' },
      { key: 'ar_rabi', name_ar: 'الربيع', name_en: 'Ar Rabi' },
      { key: 'an_nuzha', name_ar: 'النزهة', name_en: 'An Nuzha' },
      { key: 'az_zuhour', name_ar: 'الزهور', name_en: 'Az Zuhour' },
      { key: 'ar_rakkah', name_ar: 'الراكة', name_en: 'Ar Rakkah' },
      { key: 'al_mazruiyah', name_ar: 'المزروعية', name_en: 'Al Mazruiyah' },
      { key: 'as_saif', name_ar: 'السيف', name_en: 'As Saif' },
      { key: 'al_anwar', name_ar: 'الأنوار', name_en: 'Al Anwar' },
    ],
  },
] as const;

/** Resolve a city by key; returns undefined when the key isn't a known city. */
export function findCity(key: string | null | undefined): City | undefined {
  if (!key) return undefined;
  return CITIES.find((c) => c.key === key);
}

/** Resolve a district by its city + slug; undefined when either is unknown. */
export function findDistrict(
  city: CityKey,
  districtKey: string,
): District | undefined {
  const c = CITIES.find((c) => c.key === city);
  if (!c) return undefined;
  return c.districts.find((d) => d.key === districtKey);
}

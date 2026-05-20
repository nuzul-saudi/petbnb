// Minimal i18n. One locale for now (ar). Structured so adding 'en' later is
// just another import + a setter. Keys use dot.notation: t('home.welcome').

import ar from '@/locales/ar.json';

type Locale = 'ar';
type Dict = Record<string, unknown>;

const dictionaries: Record<Locale, Dict> = { ar };

let currentLocale: Locale = 'ar';

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string): string {
  const segments = key.split('.');
  let node: unknown = dictionaries[currentLocale];
  for (const seg of segments) {
    if (node && typeof node === 'object' && seg in (node as Dict)) {
      node = (node as Dict)[seg];
    } else {
      // In dev: surface the missing key loudly; in prod: fall back to the key.
      if (__DEV__) console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
  }
  return typeof node === 'string' ? node : key;
}

export function useTranslation() {
  // No reactive locale switch yet — we ship ar only. When 'en' lands,
  // wire a Context so changing locale re-renders consumers.
  return { t, locale: currentLocale };
}

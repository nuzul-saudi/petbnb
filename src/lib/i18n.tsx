// i18n with locale switching, plural-aware translation, and a React
// Context that re-renders consumers when the locale changes. The
// module-scope t() / getLocale() are kept for non-React callsites
// (errors thrown from lib/*, etc) and are kept in lockstep with the
// Provider's state.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

export type Locale = 'ar' | 'en';

// Both dictionaries share the same nested-object shape. Index by Locale.
const dictionaries: Record<Locale, unknown> = { ar, en };

// Convention: when a translation needs plural-aware lookup, the loader
// checks params for one of these keys in priority order. The first one
// present supplies the count.
const COUNT_PARAM_PRIORITY = ['count', 'nights', 'pets'] as const;

// Read a dotted-path key out of a nested dictionary. Returns undefined
// if any segment is missing. Stops descending into non-objects.
function readKey(dict: unknown, path: string): string | undefined {
  let cur: unknown = dict;
  for (const seg of path.split('.')) {
    if (
      cur &&
      typeof cur === 'object' &&
      seg in (cur as Record<string, unknown>)
    ) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

// Substitute {placeholder} markers using params. Values are coerced to
// strings; missing placeholders remain literal {name}.
function substitute(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

// Pick the count value out of params per the convention priority. Returns
// undefined if no count-like key is present. Non-numeric values are
// ignored (so a string param named "count" doesn't accidentally trigger).
function findCount(
  params?: Record<string, string | number>,
): number | undefined {
  if (!params) return undefined;
  for (const key of COUNT_PARAM_PRIORITY) {
    const v = params[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
      return Number(v);
    }
  }
  return undefined;
}

// Translate a key. Plural-aware when params contains a count-like value.
// Resolution order:
//   1. <key>_<category> for the count's Intl.PluralRules category
//   2. <key>_other      (fallback when locale doesn't author this category)
//   3. <key>             (bare key — what the file already has)
//   4. <key> string returned literally (current missing-key behavior)
function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale];
  const count = findCount(params);

  if (count !== undefined) {
    const category = new Intl.PluralRules(locale).select(count);
    const exact = readKey(dict, `${key}_${category}`);
    if (exact !== undefined) return substitute(exact, params);
    const other = readKey(dict, `${key}_other`);
    if (other !== undefined) return substitute(other, params);
  }

  const bare = readKey(dict, key);
  if (bare !== undefined) return substitute(bare, params);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[i18n.missing_key]', { locale, key });
  }
  return key;
}

// ─────────────────────────────────────────────────────────
// Module-scope locale + t() — for non-React callsites
// (errors thrown from lib/*, ad-hoc scripts, etc).
// The Provider updates this in lockstep so module-scope reads
// stay correct.
// ─────────────────────────────────────────────────────────

let moduleLocale: Locale = 'ar';

/** Set the module-scope locale. Called by LocaleProvider on init/change. */
export function setModuleLocale(next: Locale): void {
  moduleLocale = next;
}

/** Read the module-scope locale. */
export function getLocale(): Locale {
  return moduleLocale;
}

/** Module-scope translate. Use only outside React (or when a hook isn't
 *  available). Inside components, prefer useTranslation(). */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  return translate(moduleLocale, key, params);
}

// ─────────────────────────────────────────────────────────
// React Context: re-render consumers when locale changes
// ─────────────────────────────────────────────────────────

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = 'ar',
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Keep the module-scope mirror in sync on first render and every change.
  // Doing it inline (rather than in useEffect) means the module-scope read
  // is correct on the very first render — important for errors thrown
  // during render or for non-React callers.
  if (moduleLocale !== locale) {
    moduleLocale = locale;
  }

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    moduleLocale = next;
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** Hook for components. Returns t, locale, and setLocale.
 *  Falls back to module-scope locale if used outside a Provider (won't
 *  re-render on switch — keep components inside LocaleProvider). */
export function useTranslation(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  // Defensive fallback for tests or rare edge cases. Logs once in dev.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[i18n.no_provider] useTranslation used outside LocaleProvider');
  }
  return {
    locale: moduleLocale,
    setLocale: setModuleLocale,
    t,
  };
}

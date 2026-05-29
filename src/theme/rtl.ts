// Locale-aware reading-direction helpers. Components that previously
// hardcoded `textAlign: 'right'` (Arabic-as-only-locale assumption)
// should swap to useReadingTextAlign() so English flips to 'left'.
//
// We derive from the Context locale rather than I18nManager.isRTL
// because the latter doesn't update on web direction changes and
// needs an app reload on native to reflect forceRTL().

import { useTranslation } from '@/lib/i18n';

export function useReadingTextAlign(): 'right' | 'left' {
  const { locale } = useTranslation();
  return locale === 'ar' ? 'right' : 'left';
}

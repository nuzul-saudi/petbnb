// Phase 3 — /privacy. Placeholder draft copy from i18n (see LegalPage).
// Includes the REQUIRED analytics-disclosure section (Strategy note):
// PostHog + anonymous IDs + purpose + Sentry, no message contents.

import { LegalPage } from '@/components/LegalPage';

export default function PrivacyScreen() {
  return (
    <LegalPage
      titleKey="legal.privacy_title"
      sections={[
        { paragraphKeys: ['legal.privacy_p1', 'legal.privacy_p2'] },
        {
          titleKey: 'legal.privacy_analytics_title',
          paragraphKeys: [
            'legal.privacy_analytics_p1',
            'legal.privacy_analytics_p2',
            'legal.privacy_analytics_p3',
          ],
        },
        {
          titleKey: 'legal.privacy_contact_title',
          paragraphKeys: ['legal.privacy_contact_p1'],
        },
      ]}
    />
  );
}

// Phase 3 — /terms. Placeholder draft copy from i18n (see LegalPage).

import { LegalPage } from '@/components/LegalPage';

export default function TermsScreen() {
  return (
    <LegalPage
      titleKey="legal.terms_title"
      sections={[
        { paragraphKeys: ['legal.terms_p1', 'legal.terms_p2'] },
        {
          titleKey: 'legal.terms_bookings_title',
          paragraphKeys: ['legal.terms_p3', 'legal.terms_p4'],
        },
      ]}
    />
  );
}

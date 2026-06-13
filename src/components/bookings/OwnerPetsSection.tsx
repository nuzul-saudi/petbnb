// OwnerPetsSection — surfaces the owner + booked pets on the booking
// detail screen, host-only. Pre-Round 4 the host accepted bookings
// blind: dates, price, total, and the listing — but no owner name,
// no rating, no pet profile, no care notes. That gap was flagged by
// both VC review and Claude Code feedback as the next must-ship UX
// item. This card closes it.
//
// Presentational only. Parent (src/app/bookings/[id].tsx) owns the
// data; this component renders. Mounted between the booking summary
// and ConditionReportsSection, gated on isHostMode + booking.owner.

import { StyleSheet, Text, View } from 'react-native';

import { PetAvatar } from '@/components/PetAvatar';
import { UserAvatar } from '@/components/UserAvatar';
import type { BookingOwnerSummary } from '@/lib/bookings';
import { pickLocalized } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import { classifyVaccinationDate } from '@/lib/vaccination';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Tables } from '@/types/database';

export type OwnerPetsSectionProps = {
  owner: BookingOwnerSummary;
  pets: Tables<'pets'>[];
  locale: Locale;
  /**
   * Map of pets.photo_url → signed renderable URL. Parent batch-signs
   * via useSignedPetPhotoUrls and passes the result down so the
   * component stays presentational. Round 6 — pets.photo_url is now
   * a storage path, not a directly-loadable URL.
   */
  signedPhotos: Map<string, string>;
  /**
   * Polish (post-Round-7 feedback) — owner rating aggregate from the
   * 0032 RPC. Nullable when the owner has no reviews; UI falls back
   * to a "no ratings yet" pill so the card never fabricates trust.
   */
  ownerAvgRating: number | null;
  ownerReviewCount: number;
  /**
   * Localized labels keyed by the i18n booking.* namespace. Passing
   * pre-localized strings keeps this component pure presentational
   * and avoids a useTranslation() inside a presentational component.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function OwnerPetsSection({
  owner,
  pets,
  locale,
  signedPhotos,
  ownerAvgRating,
  ownerReviewCount,
  t,
}: OwnerPetsSectionProps) {
  const ownerName =
    pickLocalized(owner.full_name ?? '', owner.full_name_en, locale) || '—';
  const nowIso = new Date().toISOString();

  return (
    <View style={styles.section}>
      {/* Owner identity */}
      <Text style={styles.heading}>{t('booking.owner_section_title')}</Text>
      <View style={styles.ownerRow}>
        <UserAvatar
          avatarUrl={owner.avatar_url}
          displayName={ownerName}
          size={56}
        />
        <View style={styles.ownerTextCol}>
          <Text style={styles.ownerName} numberOfLines={1}>
            {ownerName}
          </Text>
          <View style={styles.ownerMetaRow}>
            {/* Rating: real number when reviewed, "no ratings yet"
                fallback otherwise. Stars never lie — empty card is
                better than a fabricated zero. */}
            {ownerAvgRating != null && ownerReviewCount > 0 ? (
              <Text style={styles.ownerRating}>
                ★ {ownerAvgRating.toFixed(1)} · {ownerReviewCount}
              </Text>
            ) : (
              <Text style={styles.ownerMetaMuted}>
                {t('booking.owner_no_ratings')}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Per-pet cards */}
      <Text style={styles.subheading}>{t('booking.pets_section_title')}</Text>
      {pets.length === 0 ? (
        <Text style={styles.muted}>—</Text>
      ) : (
        pets.map((p) => {
          const rabies = classifyVaccinationDate(p.rabies_vaccinated_at, nowIso);
          const fvrcp = classifyVaccinationDate(p.fvrcp_vaccinated_at, nowIso);
          // Pet-level status: worst of the two is what the host needs to see.
          const vaccStatus: 'current' | 'missing' | 'expired' =
            rabies === 'expired' || fvrcp === 'expired'
              ? 'expired'
              : rabies === 'missing' || fvrcp === 'missing'
                ? 'missing'
                : 'current';
          const vaccLabel =
            vaccStatus === 'current'
              ? t('booking.vacc_current')
              : vaccStatus === 'expired'
                ? t('booking.vacc_expired')
                : t('booking.vacc_missing');
          const vaccColor =
            vaccStatus === 'current'
              ? colors.moss
              : vaccStatus === 'expired'
                ? colors.terracotta
                : colors.goldDeep;

          return (
            <View key={p.id} style={styles.petCard}>
              <View style={styles.petHeaderRow}>
                <PetAvatar
                  photoUrl={p.photo_url ? signedPhotos.get(p.photo_url) ?? null : null}
                  breed={p.breed}
                  size={48}
                />
                <View style={styles.petHeaderText}>
                  <Text style={styles.petName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {/* HD-2 (2026-06-13): show breed + age line. Pet's
                      age_months → human-readable. Hosts had no age
                      context pre-this; small but meaningful for
                      accept/decline decisions (a kitten is a very
                      different proposition from a senior cat). */}
                  {p.breed || p.age_months != null ? (
                    <Text style={styles.petMeta}>
                      {[
                        p.breed ?? null,
                        p.age_months != null
                          ? formatPetAge(p.age_months, t)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[styles.vaccPill, { backgroundColor: vaccColor }]}
                  accessibilityLabel={vaccLabel}
                >
                  <Text style={styles.vaccPillText}>{vaccLabel}</Text>
                </View>
              </View>

              {/* Per-pet detail block — only the non-empty fields render. */}
              {p.care_notes ? (
                <PetDetail
                  label={t('booking.care_notes_label')}
                  value={p.care_notes}
                />
              ) : null}
              {p.medical_needs ? (
                <PetDetail
                  label={t('booking.medical_needs_label')}
                  value={p.medical_needs}
                />
              ) : null}
              {p.dietary_restrictions ? (
                <PetDetail
                  label={t('booking.dietary_label')}
                  value={p.dietary_restrictions}
                />
              ) : null}
              {p.medications ? (
                <PetDetail
                  label={t('booking.medications_label')}
                  value={p.medications}
                />
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

/** HD-2 helper — render pet age from age_months. Uses the existing
 *  pets.age_months / age_months_one plural keys when displayed in
 *  whole months; falls back to "Ny Nm" form past 12 months. */
function formatPetAge(
  months: number,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  if (months < 12) {
    return months === 1
      ? t('pets.age_months_one')
      : t('pets.age_months', { count: months });
  }
  const years = Math.floor(months / 12);
  const rem = months - years * 12;
  if (rem === 0) {
    return years === 1
      ? t('booking.pet_age_year_one')
      : t('booking.pet_age_years', { count: years });
  }
  return t('booking.pet_age_year_month', { years, months: rem });
}

function PetDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    // Polish (post-Round-7 feedback): money/transactional cards stay
    // on colors.paper; identity / people cards use colors.cream to
    // give the eye a single-glance tell. The booking-summary card
    // above is paper; this is cream; the messages card below is
    // back to paper. Visual hierarchy via background tone, not borders.
    backgroundColor: colors.cream,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  heading: {
    // Bumped to 20 (was 18) so section headings dominate inline
    // prominent content like the booking-summary totalLine (18).
    // Polish-pass discipline: section headings get one weight class;
    // inline numbers never outweigh them.
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
  },
  subheading: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ownerTextCol: {
    flex: 1,
    gap: 2,
  },
  ownerName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  ownerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ownerRating: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.goldDeep,
  },
  ownerMetaMuted: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  petCard: {
    // Inverted from the section's cream so the pet cards sit
    // visibly against the warmer parent surface.
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  petHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  petHeaderText: {
    flex: 1,
    gap: 2,
  },
  petName: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  petMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  vaccPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  vaccPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.cream,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  detailValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
});

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
   * Localized labels keyed by the i18n booking.* namespace. Passing
   * pre-localized strings keeps this component pure presentational
   * and avoids a useTranslation() inside a presentational component.
   */
  t: (key: string) => string;
};

export function OwnerPetsSection({
  owner,
  pets,
  locale,
  signedPhotos,
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
        <Text style={styles.ownerName} numberOfLines={1}>
          {ownerName}
        </Text>
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
                  {p.breed ? (
                    <Text style={styles.petMeta}>{p.breed}</Text>
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
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
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
  ownerName: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  petCard: {
    backgroundColor: colors.cream,
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

// Move 4 (2026-06-13) — Airbnb-pattern search hero. Three fields
// laid out horizontally: Where / When / Which pet, followed by a
// circular search button. Each field is a Pressable that opens its
// own modal; this component is the layout + summary text only.
//
// State lives in the parent (OwnerFeedHome). This component is
// fully controlled — props in, callbacks out, no internal state.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { findCity, findDistrict } from '@/lib/cities';
import { pickLocalized } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { speciesEmoji, type Species } from '@/lib/species';
import { useTheme } from '@/theme/theme';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export type SearchHeroProps = {
  city: 'riyadh' | 'dammam';
  district: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Signed-in user: name of the picked pet (resolved by parent). */
  petName: string | null;
  /** Guest: species selected as a coarse stand-in for a pet. */
  guestSpecies: Species | null;

  onPressWhere: () => void;
  onPressWhen: () => void;
  onPressPet: () => void;
  onPressSearch: () => void;
  /**
   * Hide the "Which pet" field entirely. Used when species
   * support is gated off AND the viewer is a guest — guests have
   * no signed-in pets to pick from, and the cat/dog stand-in only
   * makes sense when species filtering is live.
   */
  hideWhichPet?: boolean;
};

export function SearchHero({
  city,
  district,
  startDate,
  endDate,
  petName,
  guestSpecies,
  onPressWhere,
  onPressWhen,
  onPressPet,
  onPressSearch,
  hideWhichPet,
}: SearchHeroProps) {
  const { t, locale } = useTranslation();
  // FIX 4 (2026-06-26) — search button background switches from
  // hardcoded mossDeep to theme.accent so host viewers see gold.
  // The 🔍 emoji is flagged as off-roster by the design review
  // but replacing it cleanly needs an SVG icon — deferred.
  const theme = useTheme();

  // Where summary: "District, City" when set, "City" when only city,
  // hint when nothing. Defaulting to city is the right behavior —
  // city is always set (defaults to Riyadh).
  const cityRecord = findCity(city);
  const cityDisplay = cityRecord
    ? pickLocalized(cityRecord.name_ar, cityRecord.name_en, locale)
    : '';
  const districtRecord = district ? findDistrict(city, district) : undefined;
  const districtDisplay = districtRecord
    ? pickLocalized(districtRecord.name_ar, districtRecord.name_en, locale)
    : null;
  const whereSummary = districtDisplay
    ? `${districtDisplay}, ${cityDisplay}`
    : cityDisplay;

  // When summary: "Jul 1 – Jul 5" when both set, hint otherwise.
  // We format minimally — full date typography is overkill in a
  // 1-line pill summary. The DateField inside the modal handles
  // proper editing.
  const whenSummary =
    startDate && endDate
      ? `${formatShortDate(startDate, locale)} – ${formatShortDate(endDate, locale)}`
      : null;

  // Which pet summary: pet name (signed-in) or species label (guest).
  const petSummary =
    petName ??
    (guestSpecies
      ? `${speciesEmoji(guestSpecies)} ${t(`species.${guestSpecies}`)}`
      : null);

  return (
    <View style={styles.hero}>
      <Pressable onPress={onPressWhere} style={styles.field}>
        <Text style={styles.fieldLabel}>{t('search.where')}</Text>
        <Text style={styles.fieldValue} numberOfLines={1}>
          {whereSummary || t('search.where_hint')}
        </Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable onPress={onPressWhen} style={styles.field}>
        <Text style={styles.fieldLabel}>{t('search.when')}</Text>
        <Text
          style={[
            styles.fieldValue,
            !whenSummary && styles.fieldValuePlaceholder,
          ]}
          numberOfLines={1}
        >
          {whenSummary ?? t('search.when_hint')}
        </Text>
      </Pressable>

      {hideWhichPet ? null : (
        <>
          <View style={styles.divider} />
          <Pressable onPress={onPressPet} style={styles.field}>
            <Text style={styles.fieldLabel}>{t('search.which_pet')}</Text>
            <Text
              style={[
                styles.fieldValue,
                !petSummary && styles.fieldValuePlaceholder,
              ]}
              numberOfLines={1}
            >
              {petSummary ?? t('search.which_hint')}
            </Text>
          </Pressable>
        </>
      )}

      <Pressable
        onPress={onPressSearch}
        style={[styles.searchButton, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
        accessibilityLabel={t('search.button')}
      >
        <Text style={styles.searchButtonIcon}>🔍</Text>
      </Pressable>
    </View>
  );
}

// Short locale-aware date format. Web/native both: "Jul 1" / "1 يول".
// Avoids pulling Intl polyfills on native by hand-rolling.
function formatShortDate(iso: string, locale: 'ar' | 'en'): string {
  // Defensive — bad input shows the raw string rather than throwing.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (locale === 'ar') {
    return `${AR_MONTHS_SHORT[month - 1]} ${day}`;
  }
  return `${EN_MONTHS_SHORT[month - 1]} ${day}`;
}

const EN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const AR_MONTHS_SHORT = [
  'ينا', 'فبر', 'مارس', 'إبر', 'مايو', 'يون',
  'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس',
] as const;

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    ...shadows.card,
  },
  field: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.ink,
    marginBottom: 2,
  },
  fieldValue: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  fieldValuePlaceholder: {
    color: colors.inkSoft,
  },
  divider: {
    width: 1,
    backgroundColor: colors.whisper,
    marginVertical: spacing.sm,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.mossDeep,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginStart: spacing.xs,
  },
  searchButtonIcon: {
    fontSize: 18,
    color: colors.cream,
  },
});

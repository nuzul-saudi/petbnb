// Move 4 — Where modal. Picks city + district.
//
// Two-tier: city chips at the top, district list below. Same shape
// as the district picker already used inside ListingForm — kept here
// as a standalone component so the search has its own UX cadence.

import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CITIES, findCity, type CityKey } from '@/lib/cities';
import { pickLocalized } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type SearchWhereModalProps = {
  visible: boolean;
  city: CityKey;
  district: string | null;
  onApply: (next: { city: CityKey; district: string | null }) => void;
  onClose: () => void;
};

export function SearchWhereModal({
  visible,
  city,
  district,
  onApply,
  onClose,
}: SearchWhereModalProps) {
  const { t, locale } = useTranslation();
  const [draftCity, setDraftCity] = useState<CityKey>(city);
  const [draftDistrict, setDraftDistrict] = useState<string | null>(district);
  const [query, setQuery] = useState('');

  // Sync drafts from props whenever the modal is opened. Resetting on
  // close instead would race with the closing animation.
  useEffect(() => {
    if (visible) {
      setDraftCity(city);
      setDraftDistrict(district);
      setQuery('');
    }
  }, [visible, city, district]);

  const cityRecord = findCity(draftCity);
  const filteredDistricts = useMemo(() => {
    if (!cityRecord) return [];
    const q = query.trim().toLowerCase();
    if (!q) return cityRecord.districts;
    return cityRecord.districts.filter(
      (d) =>
        d.name_en.toLowerCase().includes(q) ||
        d.name_ar.includes(query.trim()),
    );
  }, [cityRecord, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('search.where')}</Text>

          <View style={styles.cityRow}>
            {CITIES.map((c) => {
              const active = draftCity === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    setDraftCity(c.key);
                    setDraftDistrict(null);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {pickLocalized(c.name_ar, c.name_en, locale)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.district_search_hint')}
            placeholderTextColor={colors.inkSoft}
            style={styles.searchInput}
          />

          <ScrollView style={styles.list}>
            <Pressable
              onPress={() => setDraftDistrict(null)}
              style={[styles.row, draftDistrict === null && styles.rowActive]}
            >
              <Text
                style={[
                  styles.rowText,
                  draftDistrict === null && styles.rowTextActive,
                ]}
              >
                {t('search.any_district')}
              </Text>
            </Pressable>
            {filteredDistricts.map((d) => {
              const active = draftDistrict === d.key;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => setDraftDistrict(d.key)}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <Text style={[styles.rowText, active && styles.rowTextActive]}>
                    {pickLocalized(d.name_ar, d.name_en, locale)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>{t('search.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onApply({ city: draftCity, district: draftDistrict });
                onClose();
              }}
              style={styles.applyButton}
            >
              <Text style={styles.applyButtonText}>{t('search.apply')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    marginBottom: spacing.md,
  },
  cityRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  chipActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  chipTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.cream,
  },
  searchInput: {
    backgroundColor: colors.whisper,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  list: {
    maxHeight: 280,
    marginBottom: spacing.md,
  },
  row: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  rowActive: {
    backgroundColor: colors.whisper,
  },
  rowText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  rowTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  applyButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.mossDeep,
  },
  applyButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
});

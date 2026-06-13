// Move 4 — Which-pet modal.
//
// Fix 4 (2026-06-13): now MULTI-SELECT for signed-in users. Boarding
// services routinely cover several pets at once; the prior radio
// behavior didn't match the booking flow's multi-pet capability.
//
// Signed-in users: tap pet rows to toggle selection. Selecting at
// least one pet sets search.petIds AND derives species (if all
// picked pets share a species, the species filter narrows; mixed
// → species filter clears).
//
// Guests: still a single coarse "🐈 Cat / 🐕 Dog" choice as a
// stand-in (no pet rows exist for guests).

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import {
  SPECIES_LIST,
  speciesEmoji,
  type Species,
} from '@/lib/species';
import type { Tables } from '@/types/database';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type SearchWhichPetModalProps = {
  visible: boolean;
  /** Signed-in user's pets. Empty for guests. */
  pets: Tables<'pets'>[];
  /** Currently selected pet ids (signed-in). Empty array = none. */
  petIds: string[];
  /** Currently selected guest species or null. */
  guestSpecies: Species | null;
  /** Distinguishes signed-in (use pet picker) vs guest (use species picker). */
  isGuest: boolean;
  onApply: (next: {
    petIds: string[];
    guestSpecies: Species | null;
  }) => void;
  onClose: () => void;
};

export function SearchWhichPetModal({
  visible,
  pets,
  petIds,
  guestSpecies,
  isGuest,
  onApply,
  onClose,
}: SearchWhichPetModalProps) {
  const { t } = useTranslation();
  const [draftPetIds, setDraftPetIds] = useState<Set<string>>(
    new Set(petIds),
  );
  const [draftGuestSpecies, setDraftGuestSpecies] = useState<Species | null>(
    guestSpecies,
  );

  useEffect(() => {
    if (visible) {
      setDraftPetIds(new Set(petIds));
      setDraftGuestSpecies(guestSpecies);
    }
  }, [visible, petIds, guestSpecies]);

  const togglePet = (id: string) => {
    setDraftPetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('search.which_pet')}</Text>

          {isGuest ? (
            <View style={styles.speciesRow}>
              {SPECIES_LIST.map((s) => {
                const active = draftGuestSpecies === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() =>
                      setDraftGuestSpecies(active ? null : s)
                    }
                    style={[styles.speciesTile, active && styles.speciesTileActive]}
                  >
                    <Text style={styles.speciesEmoji}>{speciesEmoji(s)}</Text>
                    <Text
                      style={[
                        styles.speciesLabel,
                        active && styles.speciesLabelActive,
                      ]}
                    >
                      {t(`species.${s}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : pets.length === 0 ? (
            <Text style={styles.hint}>{t('search.no_pets_hint')}</Text>
          ) : (
            <ScrollView style={styles.list}>
              {/* Clear-all row: collapses the selection to none. */}
              <Pressable
                onPress={() => setDraftPetIds(new Set())}
                style={[
                  styles.row,
                  draftPetIds.size === 0 && styles.rowActive,
                ]}
              >
                <Text
                  style={[
                    styles.rowText,
                    draftPetIds.size === 0 && styles.rowTextActive,
                  ]}
                >
                  {t('search.any_pet')}
                </Text>
              </Pressable>
              {pets.map((p) => {
                const active = draftPetIds.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => togglePet(p.id)}
                    style={[styles.row, active && styles.rowActive]}
                  >
                    {/* Checkbox glyph reflects multi-select intent.
                        Square (☐) when off, filled (☑) when on —
                        clearer affordance than a radio dot. */}
                    <Text style={styles.checkbox}>
                      {active ? '☑' : '☐'}
                    </Text>
                    <Text style={styles.rowEmoji}>
                      {speciesEmoji(p.species === 'dog' ? 'dog' : 'cat')}
                    </Text>
                    <Text
                      style={[
                        styles.rowText,
                        active && styles.rowTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>{t('search.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onApply({
                  petIds: isGuest ? [] : [...draftPetIds],
                  guestSpecies: isGuest ? draftGuestSpecies : null,
                });
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
  speciesRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  speciesTile: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.whisper,
    alignItems: 'center',
    gap: spacing.xs,
  },
  speciesTileActive: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  speciesEmoji: {
    fontSize: 32,
  },
  speciesLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  speciesLabelActive: {
    fontFamily: fonts.bodyBold,
    color: colors.mossDeep,
  },
  list: {
    maxHeight: 320,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  rowActive: {
    backgroundColor: colors.whisper,
  },
  rowEmoji: {
    fontSize: 20,
  },
  // Fix 4 — checkbox glyph for multi-select rows.
  checkbox: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.mossDeep,
    width: 22,
    textAlign: 'center',
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
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: spacing.md,
    textAlign: 'center',
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

// Move 4 — Which-pet modal.
//
// Signed-in users: pick from their own pets. Selecting a pet sets
// search.petId AND the species (so the feed filters to hosts who
// accept that species).
//
// Guests: there are no pet rows to pick from, so we offer the
// coarser "🐈 Cat / 🐕 Dog" choice as a stand-in. The same path
// drives the species filter.
//
// Both cases support clearing back to "no pet" / "any species".

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
  /** Currently selected pet id (signed-in) or null. */
  petId: string | null;
  /** Currently selected guest species or null. */
  guestSpecies: Species | null;
  /** Distinguishes signed-in (use pet picker) vs guest (use species picker). */
  isGuest: boolean;
  onApply: (next: { petId: string | null; guestSpecies: Species | null }) => void;
  onClose: () => void;
};

export function SearchWhichPetModal({
  visible,
  pets,
  petId,
  guestSpecies,
  isGuest,
  onApply,
  onClose,
}: SearchWhichPetModalProps) {
  const { t } = useTranslation();
  const [draftPetId, setDraftPetId] = useState<string | null>(petId);
  const [draftGuestSpecies, setDraftGuestSpecies] = useState<Species | null>(
    guestSpecies,
  );

  useEffect(() => {
    if (visible) {
      setDraftPetId(petId);
      setDraftGuestSpecies(guestSpecies);
    }
  }, [visible, petId, guestSpecies]);

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
              <Pressable
                onPress={() => setDraftPetId(null)}
                style={[styles.row, draftPetId === null && styles.rowActive]}
              >
                <Text
                  style={[
                    styles.rowText,
                    draftPetId === null && styles.rowTextActive,
                  ]}
                >
                  {t('search.any_pet')}
                </Text>
              </Pressable>
              {pets.map((p) => {
                const active = draftPetId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setDraftPetId(p.id)}
                    style={[styles.row, active && styles.rowActive]}
                  >
                    <Text style={styles.rowEmoji}>
                      {speciesEmoji(p.species === 'dog' ? 'dog' : 'cat')}
                    </Text>
                    <Text
                      style={[styles.rowText, active && styles.rowTextActive]}
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
                  petId: isGuest ? null : draftPetId,
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

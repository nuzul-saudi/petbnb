// ConditionReportsSection — the CR section card on the booking detail
// screen. Presentational only: state + handler bodies stay in
// src/app/bookings/[id].tsx. The parent also keeps the dirty-state
// computation (isCrFormDirty) so the AppHeader's leave-warning and the
// web beforeunload listener continue to gate cross-section navigation.
//
// Scope: heading + subtitle, saved CHECK-IN card (read-only), the
// "+ File check-in report" button, and the compose form (pending photo
// grid → Add photos → 6-photo cap hint → note → Cancel + Save).
//
// Out of scope (stays in [id].tsx for now):
//   • the standalone check-out report card lower down in the parent,
//   • the Daily updates section that follows.
//
// Styles flagged "// shared with parent until Step 3" are duplicated
// from the parent's stylesheet so this component renders standalone.
// When the Daily updates section is extracted in Step 3, consolidate
// them into a shared bookings-styles module.

import { Image } from "expo-image";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/Button";
import type { ConditionReport } from "@/lib/condition-reports";
import { formatRiyadhStamp } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import type { PetPhotoSource } from "@/lib/pets";
import { colors, fonts, radii, shadows, spacing } from "@/theme/tokens";

export type ConditionReportsSectionProps = {
  crLoading: boolean;
  checkInReport: ConditionReport | undefined;
  canFileCheckIn: boolean;
  filingCheckIn: boolean;
  crPendingPhotos: PetPhotoSource[];
  crNote: string;
  crPosting: boolean;
  crPostError: string | null;
  CR_PHOTO_CAP: number;
  onOpenFileCheckIn: () => void;
  onCancelCheckIn: () => void;
  onAddCrPhotos: () => void;
  onRemoveCrPending: (index: number) => void;
  onSaveCheckIn: () => void;
  setCrNote: (value: string) => void;
};

export function ConditionReportsSection({
  crLoading,
  checkInReport,
  canFileCheckIn,
  filingCheckIn,
  crPendingPhotos,
  crNote,
  crPosting,
  crPostError,
  CR_PHOTO_CAP,
  onOpenFileCheckIn,
  onCancelCheckIn,
  onAddCrPhotos,
  onRemoveCrPending,
  onSaveCheckIn,
  setCrNote,
}: ConditionReportsSectionProps) {
  const { t, locale } = useTranslation();

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.crSectionTitle}>
        {t("condition_reports.section_title")}
      </Text>
      <Text style={styles.crSectionSubtitle}>
        {t("condition_reports.section_subtitle")}
      </Text>

      <>
        {crLoading ? (
          <Text style={styles.muted}>{t("listing.loading")}</Text>
        ) : (
          <>
            {checkInReport ? (
              <View style={styles.crReportCard}>
                <View style={styles.crReportHeader}>
                  <Text style={styles.crReportPhaseLabel}>
                    {t("condition_reports.check_in_label")}
                  </Text>
                  <Text style={styles.crReportStamp}>
                    {formatRiyadhStamp(checkInReport.created_at, locale)}
                  </Text>
                </View>
                {Array.isArray(checkInReport.photos) &&
                (checkInReport.photos as string[]).length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.updatePhotosRow}
                  >
                    {(checkInReport.photos as string[]).map((url, i) => (
                      <Image
                        key={`${checkInReport.id}-${i}`}
                        source={{ uri: url }}
                        style={styles.updatePhoto}
                        contentFit="cover"
                        transition={150}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                {checkInReport.health_notes ? (
                  <Text style={styles.updateNote}>
                    {checkInReport.health_notes}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {/* Host-only check-in compose: file button collapsed,
            full form when filingCheckIn is true. */}
        {canFileCheckIn && !filingCheckIn ? (
          <Button
            label={t("condition_reports.file_check_in_button")}
            onPress={onOpenFileCheckIn}
            variant="secondary"
            fullWidth
          />
        ) : null}

        {canFileCheckIn && filingCheckIn ? (
          <View style={styles.crForm}>
            <Text style={styles.crFormHeader}>
              {t("condition_reports.check_in_label")}
            </Text>

            {crPendingPhotos.length > 0 ? (
              <View style={styles.pendingGrid}>
                {crPendingPhotos.map((src, i) => {
                  const uri =
                    src.kind === "web-file"
                      ? URL.createObjectURL(src.file)
                      : src.uri;
                  return (
                    <View
                      key={`cr-pending-${i}`}
                      style={styles.pendingThumbWrap}
                    >
                      <Image
                        source={{ uri }}
                        style={styles.pendingThumb}
                        contentFit="cover"
                      />
                      <Pressable
                        onPress={() => onRemoveCrPending(i)}
                        disabled={crPosting}
                        style={styles.pendingRemoveButton}
                      >
                        <Text style={styles.pendingRemoveText}>×</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Button
              label={t("condition_reports.add_photos_button")}
              onPress={onAddCrPhotos}
              variant="secondary"
              disabled={
                crPosting || crPendingPhotos.length >= CR_PHOTO_CAP
              }
              fullWidth
            />
            {crPendingPhotos.length >= CR_PHOTO_CAP ? (
              <Text style={styles.muted}>
                {t("condition_reports.photo_cap_hint")}
              </Text>
            ) : null}

            <TextInput
              value={crNote}
              onChangeText={setCrNote}
              placeholder={t("condition_reports.note_placeholder")}
              placeholderTextColor={colors.inkSoft}
              multiline
              editable={!crPosting}
              style={styles.noteInput}
            />

            {crPostError ? (
              <Text style={styles.errorText}>{crPostError}</Text>
            ) : null}

            <View style={styles.crFormActions}>
              <Button
                label={t("condition_reports.cancel_button")}
                onPress={onCancelCheckIn}
                variant="secondary"
                disabled={crPosting}
              />
              <Button
                label={
                  crPosting
                    ? t("condition_reports.saving")
                    : t("condition_reports.save_button")
                }
                onPress={onSaveCheckIn}
                variant="primary"
                loading={crPosting}
                disabled={
                  crPendingPhotos.length === 0 && crNote.trim() === ""
                }
              />
            </View>
          </View>
        ) : null}
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- CR-only (local to this component) ----
  crSectionTitle: {
    // Polish — uniform 20px section-heading weight across the
    // booking detail page (matched to OwnerPets / Messages).
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
    textAlign: "right",
  },
  crSectionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: "right",
    marginTop: -spacing.sm,
  },
  // Saved (read-only) report card. Muted vs the compose form so it
  // visually reads as immutable.
  crReportCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  crReportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  crReportPhaseLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
  },
  crReportStamp: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  // Defined for parity with the parent stylesheet. Currently unused in
  // this component's JSX — the saved-card body uses updateNote so the
  // CR and daily-update cards read identically.
  crReportNote: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: "right",
  },
  // Active compose form. Slightly elevated bg so it stands apart from
  // the saved cards above it.
  crForm: {
    backgroundColor: colors.cream,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.moss,
    padding: spacing.md,
    gap: spacing.sm,
  },
  crFormHeader: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
    textAlign: "right",
    marginBottom: spacing.xs,
  },

  // ---- shared with parent until Step 3 ----
  // sectionCard: wraps both this section and the still-in-parent daily
  // updates section in matching paper cards.
  sectionCard: {
    width: "100%",
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.whisper,
    marginTop: spacing.lg,
  },
  muted: {
    // shared with parent until Step 3
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  errorText: {
    // shared with parent until Step 3
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
  },
  pendingGrid: {
    // shared with parent until Step 3
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pendingThumbWrap: {
    // shared with parent until Step 3
    position: "relative",
  },
  pendingThumb: {
    // shared with parent until Step 3
    width: 100,
    height: 100,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.inkSoft,
  },
  pendingRemoveButton: {
    // shared with parent until Step 3
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingRemoveText: {
    // shared with parent until Step 3
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 18,
  },
  noteInput: {
    // shared with parent until Step 3
    width: "100%",
    borderWidth: 1,
    borderColor: colors.whisper,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 60,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.cream,
  },
  updatePhotosRow: {
    // shared with parent until Step 3
    gap: spacing.sm,
  },
  updatePhoto: {
    // shared with parent until Step 3
    width: 140,
    height: 140,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  updateNote: {
    // shared with parent until Step 3
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  crFormActions: {
    // shared with parent until Step 3
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

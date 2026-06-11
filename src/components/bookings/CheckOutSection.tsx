// CheckOutSection — Phase 1 of the check-out condition-report flow.
// Mirrors ConditionReportsSection.tsx in structure and styles, but for
// the check-OUT phase.
//
// Differences from the check-in section:
//   • Heading uses condition_reports.check_out_label.
//   • No subtitle — the check-in section above already renders the
//     section subtitle once for both halves.
//   • The "open the form" button is labeled
//     booking.host_complete_button ("Complete stay") — reusing the
//     existing host-lifecycle string — not "+ File check-out report",
//     because filing is OPTIONAL here; the button doubles as the
//     stay-completion action.
//   • The primary action inside the compose form is also "Complete
//     stay" (→ "Completing…" while coPosting). It is NOT disabled when
//     photos+note are empty: the host can press "Complete stay" with
//     no report attached and still finalize the booking. The parent's
//     onCompleteStay handler is responsible for: file the report (if
//     any pending photos/note exist) THEN call the booking-completion
//     transition.
//
// Presentational only: state + handler bodies stay in
// src/app/bookings/[id].tsx; the parent owns the dirty-state
// computation (isCoFormDirty, when added) so the AppHeader's
// leave-warning and the web beforeunload listener continue to gate
// cross-section navigation.
//
// Styles flagged "// shared with parent until Step 3" mirror
// ConditionReportsSection's local copies. When the shared-styles
// consolidation lands, all three components collapse onto one source.

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

export type CheckOutSectionProps = {
  crLoading: boolean;
  checkOutReport: ConditionReport | undefined;
  canFileCheckOut: boolean;
  filingCheckOut: boolean;
  coPendingPhotos: PetPhotoSource[];
  coNote: string;
  coPosting: boolean;
  coPostError: string | null;
  CR_PHOTO_CAP: number;
  onOpenFileCheckOut: () => void;
  onCancelCheckOut: () => void;
  onAddCoPhotos: () => void;
  onRemoveCoPending: (index: number) => void;
  onCompleteStay: () => void;
  setCoNote: (value: string) => void;
};

export function CheckOutSection({
  crLoading,
  checkOutReport,
  canFileCheckOut,
  filingCheckOut,
  coPendingPhotos,
  coNote,
  coPosting,
  coPostError,
  CR_PHOTO_CAP,
  onOpenFileCheckOut,
  onCancelCheckOut,
  onAddCoPhotos,
  onRemoveCoPending,
  onCompleteStay,
  setCoNote,
}: CheckOutSectionProps) {
  const { t, locale } = useTranslation();

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.crSectionTitle}>
        {t("condition_reports.check_out_label")}
      </Text>

      <>
        {crLoading ? (
          <Text style={styles.muted}>{t("listing.loading")}</Text>
        ) : (
          <>
            {checkOutReport ? (
              <View style={styles.crReportCard}>
                <View style={styles.crReportHeader}>
                  <Text style={styles.crReportPhaseLabel}>
                    {t("condition_reports.check_out_label")}
                  </Text>
                  <Text style={styles.crReportStamp}>
                    {formatRiyadhStamp(checkOutReport.created_at, locale)}
                  </Text>
                </View>
                {Array.isArray(checkOutReport.photos) &&
                (checkOutReport.photos as string[]).length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.updatePhotosRow}
                  >
                    {(checkOutReport.photos as string[]).map((url, i) => (
                      <Image
                        key={`${checkOutReport.id}-${i}`}
                        source={{ uri: url }}
                        style={styles.updatePhoto}
                        contentFit="cover"
                        transition={150}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                {checkOutReport.health_notes ? (
                  <Text style={styles.updateNote}>
                    {checkOutReport.health_notes}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {/* Host-only check-out compose: "Complete stay" button collapsed,
            full form when filingCheckOut is true. The button is the
            same in both modes (label = booking.host_complete_button)
            because filing IS completing — the report is just optional
            extra evidence collected during the same action. */}
        {canFileCheckOut && !filingCheckOut ? (
          <Button
            label={t("booking.host_complete_button")}
            onPress={onOpenFileCheckOut}
            variant="secondary"
            fullWidth
          />
        ) : null}

        {canFileCheckOut && filingCheckOut ? (
          <View style={styles.crForm}>
            <Text style={styles.crFormHeader}>
              {t("condition_reports.check_out_label")}
            </Text>

            {coPendingPhotos.length > 0 ? (
              <View style={styles.pendingGrid}>
                {coPendingPhotos.map((src, i) => {
                  const uri =
                    src.kind === "web-file"
                      ? URL.createObjectURL(src.file)
                      : src.uri;
                  return (
                    <View
                      key={`co-pending-${i}`}
                      style={styles.pendingThumbWrap}
                    >
                      <Image
                        source={{ uri }}
                        style={styles.pendingThumb}
                        contentFit="cover"
                      />
                      <Pressable
                        onPress={() => onRemoveCoPending(i)}
                        disabled={coPosting}
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
              onPress={onAddCoPhotos}
              variant="secondary"
              disabled={
                coPosting || coPendingPhotos.length >= CR_PHOTO_CAP
              }
              fullWidth
            />
            {coPendingPhotos.length >= CR_PHOTO_CAP ? (
              <Text style={styles.muted}>
                {t("condition_reports.photo_cap_hint")}
              </Text>
            ) : null}

            <TextInput
              value={coNote}
              onChangeText={setCoNote}
              placeholder={t("condition_reports.note_placeholder")}
              placeholderTextColor={colors.inkSoft}
              multiline
              editable={!coPosting}
              style={styles.noteInput}
            />

            {coPostError ? (
              <Text style={styles.errorText}>{coPostError}</Text>
            ) : null}

            <View style={styles.crFormActions}>
              <Button
                label={t("condition_reports.cancel_button")}
                onPress={onCancelCheckOut}
                variant="secondary"
                disabled={coPosting}
              />
              {/* "Complete stay" is NOT disabled when photos+note are
                  empty — completing without a check-out report is
                  allowed. The parent's onCompleteStay files the report
                  (if any) then triggers the booking-completion
                  transition. */}
              <Button
                label={
                  coPosting
                    ? t("booking.host_completing")
                    : t("booking.host_complete_button")
                }
                onPress={onCompleteStay}
                variant="primary"
                loading={coPosting}
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

// DailyUpdatesSection — the daily-updates section card on the booking
// detail screen. Presentational only: all state + handler bodies stay
// in src/app/bookings/[id].tsx. The parent also keeps the dirty-state
// computation (isUpdateFormDirty / editingEntryId tracking) so the
// AppHeader's leave-warning + the web beforeunload listener continue
// to gate cross-section navigation.
//
// Scope: section heading, loading state, empty state, the updates list
// (each entry rendering EITHER its inline-edit form OR normal display
// with date / horizontal photos / note / Edit + Delete buttons), the
// global deleteError line, the compose form (pending grid → Add photos
// → note → Cancel + Save), AND the "file check-in report first" hint
// shown when the post form is gated.
//
// Out of scope (stays in [id].tsx): the standalone check-out card
// rendered below this section.
//
// Styles flagged "// shared with parent" are duplicated from the
// parent's stylesheet so this component renders standalone. The
// standalone check-out card in the parent still references
// updatePhotosRow / updatePhoto / updateNote; the parent also still
// has sectionCard / muted / errorText / pendingGrid / pendingThumb* /
// noteInput / crFormActions copies for that card. Consolidate when
// the shared-styles cleanup step lands.

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
import type { DailyUpdate } from "@/lib/daily-updates";
import { formatRiyadhStamp } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import { compactJoined } from "@/lib/joins";
import type { PetPhotoSource } from "@/lib/pets";
import { colors, fonts, radii, shadows, spacing } from "@/theme/tokens";

export type DailyUpdatesSectionProps = {
  // ---- data ----
  updates: DailyUpdate[];
  updatesLoading: boolean;
  canMutateUpdates: boolean;
  checkInReport: ConditionReport | undefined;

  // ---- compose form ----
  pendingPhotos: PetPhotoSource[];
  updateNote: string;
  postingUpdate: boolean;
  postError: string | null;
  onAddPhoto: () => void;
  onRemovePending: (index: number) => void;
  onSubmitUpdate: () => void;
  setUpdateNote: (value: string) => void;
  setPendingPhotos: (value: PetPhotoSource[]) => void;
  setPostError: (value: string | null) => void;

  // ---- per-entry inline edit ----
  editingEntryId: string | null;
  editKeep: Set<string>;
  editNewSources: PetPhotoSource[];
  editNote: string;
  editingFlight: string | null;
  editError: string | null;
  onEditStart: (entry: DailyUpdate) => void;
  onEditCancel: () => void;
  onEditAddPhotos: () => void;
  onEditRemoveExisting: (url: string) => void;
  onEditRemoveNew: (index: number) => void;
  onEditSave: (entryId: string) => void;
  setEditNote: (value: string) => void;

  // ---- delete ----
  deletingFlight: string | null;
  deleteError: string | null;
  onDelete: (entryId: string) => void;
};

export function DailyUpdatesSection({
  updates,
  updatesLoading,
  canMutateUpdates,
  checkInReport,
  pendingPhotos,
  updateNote,
  postingUpdate,
  postError,
  onAddPhoto,
  onRemovePending,
  onSubmitUpdate,
  setUpdateNote,
  setPendingPhotos,
  setPostError,
  editingEntryId,
  editKeep,
  editNewSources,
  editNote,
  editingFlight,
  editError,
  onEditStart,
  onEditCancel,
  onEditAddPhotos,
  onEditRemoveExisting,
  onEditRemoveNew,
  onEditSave,
  setEditNote,
  deletingFlight,
  deleteError,
  onDelete,
}: DailyUpdatesSectionProps) {
  const { t, locale } = useTranslation();

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.dailyUpdatesTitle}>
        {t("daily_updates.section_title")}
      </Text>

      {updatesLoading ? (
        <Text style={styles.muted}>{t("listing.loading")}</Text>
      ) : updates.length === 0 ? (
        <Text style={styles.muted}>{t("daily_updates.empty")}</Text>
      ) : (
        <View style={styles.updatesList}>
          {updates.map((u) => {
            const photos = Array.isArray(u.photos)
              ? compactJoined(u.photos as (string | null)[])
              : [];
            // Belt-and-suspenders: also gate the edit-form render on
            // canMutateUpdates, so a stale editingEntryId during a
            // status transition can't flash the edit form.
            const isEditing = editingEntryId === u.id && canMutateUpdates;

            if (isEditing) {
              const inFlight = editingFlight === u.id;
              const keptPhotos = photos.filter((url) => editKeep.has(url));
              const hasAnyPhoto =
                keptPhotos.length > 0 || editNewSources.length > 0;
              const canSave = hasAnyPhoto || editNote.trim() !== "";
              return (
                <View key={u.id} style={styles.updateCard}>
                  <Text style={styles.updateDate}>
                    {formatRiyadhStamp(u.created_at, locale)}
                  </Text>
                  {hasAnyPhoto ? (
                    <View style={styles.pendingGrid}>
                      {keptPhotos.map((url) => (
                        <View
                          key={`keep-${url}`}
                          style={styles.pendingThumbWrap}
                        >
                          <Image
                            source={{ uri: url }}
                            style={styles.editKeepThumb}
                            contentFit="cover"
                            transition={150}
                          />
                          <Pressable
                            onPress={() => onEditRemoveExisting(url)}
                            disabled={inFlight}
                            style={styles.pendingRemoveButton}
                            accessibilityLabel="Remove photo"
                          >
                            <Text style={styles.pendingRemoveText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                      {editNewSources.map((src, i) => {
                        const uri =
                          src.kind === "web-file"
                            ? URL.createObjectURL(src.file)
                            : src.uri;
                        return (
                          <View
                            key={`edit-new-${i}`}
                            style={styles.pendingThumbWrap}
                          >
                            <Image
                              source={{ uri }}
                              style={styles.pendingThumb}
                              contentFit="cover"
                            />
                            <Pressable
                              onPress={() => onEditRemoveNew(i)}
                              disabled={inFlight}
                              style={styles.pendingRemoveButton}
                              accessibilityLabel="Remove photo"
                            >
                              <Text style={styles.pendingRemoveText}>×</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <Button
                    label={t("daily_updates.add_photo_button")}
                    onPress={onEditAddPhotos}
                    variant="secondary"
                    disabled={inFlight}
                    fullWidth
                  />

                  <TextInput
                    value={editNote}
                    onChangeText={setEditNote}
                    placeholder={t("daily_updates.note_placeholder")}
                    placeholderTextColor={colors.inkSoft}
                    multiline
                    editable={!inFlight}
                    style={styles.noteInput}
                  />

                  {editError ? (
                    <Text style={styles.errorText}>{editError}</Text>
                  ) : null}

                  <View style={styles.entryActionRow}>
                    <Button
                      label={
                        inFlight
                          ? t("daily_updates.edit_saving")
                          : t("daily_updates.edit_save_button")
                      }
                      onPress={() => onEditSave(u.id)}
                      variant="primary"
                      size="compact"
                      loading={inFlight}
                      disabled={!canSave}
                    />
                    <Button
                      label={t("daily_updates.edit_cancel_button")}
                      onPress={onEditCancel}
                      variant="secondary"
                      size="compact"
                      disabled={inFlight}
                    />
                  </View>
                </View>
              );
            }

            // Normal display mode
            return (
              <View key={u.id} style={styles.updateCard}>
                <Text style={styles.updateDate}>
                  {formatRiyadhStamp(u.created_at, locale)}
                </Text>
                {photos.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.updatePhotosRow}
                  >
                    {photos.map((url, i) => (
                      <Image
                        key={`${u.id}-${i}`}
                        source={{ uri: url }}
                        style={styles.updatePhoto}
                        contentFit="cover"
                        transition={150}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                {u.note_ar ? (
                  <Text style={styles.updateNote}>{u.note_ar}</Text>
                ) : null}
                {/* Edit + Delete (host + booking.status === 'active'
                    only — same gate as canMutateUpdates). Both disable
                    while another mutation is in flight. */}
                {canMutateUpdates ? (
                  <View style={styles.entryActionRow}>
                    <Button
                      label={t("daily_updates.edit_button")}
                      onPress={() => onEditStart(u)}
                      variant="secondary"
                      size="compact"
                      disabled={
                        editingEntryId !== null || deletingFlight !== null
                      }
                    />
                    <Button
                      label={
                        deletingFlight === u.id
                          ? t("daily_updates.deleting")
                          : t("daily_updates.delete_button")
                      }
                      onPress={() => onDelete(u.id)}
                      variant="destructive"
                      size="compact"
                      loading={deletingFlight === u.id}
                      disabled={
                        editingEntryId !== null || deletingFlight !== null
                      }
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {deleteError ? (
        <Text style={styles.errorText}>{deleteError}</Text>
      ) : null}

      {/* Post form — host-only, active-only, AND a check-in report
          must exist (chronological gate: the stay-flow is check-in →
          daily updates → check-out). Without a check-in, the hint
          block below replaces the form. */}
      {canMutateUpdates && checkInReport ? (
        <View style={styles.postForm}>
          {pendingPhotos.length > 0 ? (
            <View style={styles.pendingGrid}>
              {pendingPhotos.map((src, i) => {
                const uri =
                  src.kind === "web-file"
                    ? URL.createObjectURL(src.file)
                    : src.uri;
                return (
                  <View key={`pending-${i}`} style={styles.pendingThumbWrap}>
                    <Image
                      source={{ uri }}
                      style={styles.pendingThumb}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => onRemovePending(i)}
                      disabled={postingUpdate}
                      style={styles.pendingRemoveButton}
                      accessibilityLabel="Remove photo"
                    >
                      <Text style={styles.pendingRemoveText}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Button
            label={t("daily_updates.add_photo_button")}
            onPress={onAddPhoto}
            variant="secondary"
            disabled={postingUpdate}
            fullWidth
          />

          <TextInput
            value={updateNote}
            onChangeText={setUpdateNote}
            placeholder={t("daily_updates.note_placeholder")}
            placeholderTextColor={colors.inkSoft}
            multiline
            editable={!postingUpdate}
            style={styles.noteInput}
          />

          {postError ? (
            <Text style={styles.errorText}>{postError}</Text>
          ) : null}

          <View style={styles.crFormActions}>
            <Button
              label={t("daily_updates.cancel_button")}
              onPress={() => {
                setPendingPhotos([]);
                setUpdateNote("");
                setPostError(null);
              }}
              variant="secondary"
              disabled={
                postingUpdate ||
                (pendingPhotos.length === 0 && updateNote.trim() === "")
              }
            />
            <Button
              label={
                postingUpdate
                  ? t("daily_updates.posting")
                  : t("daily_updates.submit_button")
              }
              onPress={onSubmitUpdate}
              variant="primary"
              loading={postingUpdate}
              disabled={
                pendingPhotos.length === 0 && updateNote.trim() === ""
              }
            />
          </View>
        </View>
      ) : null}

      {/* Hint replacing the post form when the host is on an active
          booking but hasn't filed the check-in report yet. Existing
          updates above still display normally; only the compose form
          is gated. */}
      {canMutateUpdates && !checkInReport ? (
        <View style={styles.postForm}>
          <Text style={styles.muted}>
            {t("daily_updates.check_in_first_hint")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- daily-updates-only (local to this component) ----
  dailyUpdatesTitle: {
    // Polish — uniform 20px section-heading weight across the
    // booking detail page (matched to OwnerPets / Messages / CR).
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
  },
  updatesList: {
    gap: spacing.md,
    width: "100%",
  },
  updateCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  updateDate: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  postForm: {
    width: "100%",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.whisper,
    marginTop: spacing.md,
  },
  // Existing photo shown inside the edit form. Same dimensions as
  // pendingThumb but no dashed border — visually identical to a saved
  // photo, just with the × overlay for removal.
  editKeepThumb: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  entryActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },

  // ---- shared with parent ----
  // sectionCard: wraps this section in a paper card matching the
  // booking-summary card. Duplicated from parent's stylesheet.
  sectionCard: {
    // shared with parent
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
    // shared with parent
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  errorText: {
    // shared with parent
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
  },
  pendingGrid: {
    // shared with parent
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pendingThumbWrap: {
    // shared with parent
    position: "relative",
  },
  pendingThumb: {
    // shared with parent
    width: 100,
    height: 100,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.inkSoft,
  },
  pendingRemoveButton: {
    // shared with parent
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
    // shared with parent
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 18,
  },
  noteInput: {
    // shared with parent
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
    // shared with parent (also used by standalone check-out card)
    gap: spacing.sm,
  },
  updatePhoto: {
    // shared with parent (also used by standalone check-out card)
    width: 140,
    height: 140,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  updateNote: {
    // shared with parent (also used by standalone check-out card)
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  crFormActions: {
    // shared with parent
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

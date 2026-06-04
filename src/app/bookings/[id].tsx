import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { PetAvatar } from "@/components/PetAvatar";
import { useBooking } from "@/hooks/useBooking";
import { useConditionReports } from "@/hooks/useConditionReports";
import { useDailyUpdates } from "@/hooks/useDailyUpdates";
import { useAuth } from "@/lib/auth";
import {
  acceptBookingAsHost,
  cancelBookingAsOwner,
  completeBookingAsHost,
  declineBookingAsHost,
  startBookingAsHost,
} from "@/lib/bookings";
import { createConditionReport } from "@/lib/condition-reports";
import {
  createDailyUpdate,
  deleteDailyUpdate,
  updateDailyUpdate,
  type DailyUpdate,
} from "@/lib/daily-updates";
import {
  formatRiyadhStamp,
  formatSAR,
  pickLocalized,
  toArabicDigits,
} from "@/lib/format";
import { pickPhotosMulti, type PetPhotoSource } from "@/lib/pets";
import { useTranslation } from "@/lib/i18n";
import {
  computePriceBreakdown,
  type AddonSelection,
  type AddonType,
} from "@/lib/pricing";
import { colors, fonts, radii, shadows, spacing } from "@/theme/tokens";

export default function BookingDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === "ar" ? "en" : "ar");
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  // Booking — loaded via useBooking. The hook owns data + loading; the
  // screen owns the translated `error` string so it can pick the right
  // i18n key on failure (matches the original setError(t(...)) flow).
  const [error, setError] = useState<string | null>(null);
  const {
    data: booking,
    loading,
    refetch: refetchBooking,
  } = useBooking(id, () => setError(t("booking.load_failed")));

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Single in-flight indicator across all 4 host actions: at most one
  // transition can run at a time, and the lit button tells the host which.
  const [hostFlight, setHostFlight] = useState<
    "accept" | "decline" | "start" | "complete" | null
  >(null);
  const [hostError, setHostError] = useState<string | null>(null);

  // Daily updates — loaded via useDailyUpdates (parallel to the booking
  // fetch). Plus host-only post form state (pending photo list + note).
  const {
    data: updates,
    loading: updatesLoading,
    refetch: refetchUpdates,
  } = useDailyUpdates(id);
  const [pendingPhotos, setPendingPhotos] = useState<PetPhotoSource[]>([]);
  const [updateNote, setUpdateNote] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Per-entry inline edit (Phase 6.3). At most one entry is in edit mode
  // at a time; editingEntryId === null means "no edit open".
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editKeep, setEditKeep] = useState<Set<string>>(new Set());
  const [editNewSources, setEditNewSources] = useState<PetPhotoSource[]>([]);
  const [editNote, setEditNote] = useState("");
  const [editingFlight, setEditingFlight] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state (sub-step c). deletingFlight names the entry currently
  // being deleted (so its button can show "Deleting…"). deleteError is
  // shown once globally below the updates list — the host knows which
  // entry they just clicked so locality isn't critical.
  const [deletingFlight, setDeletingFlight] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Condition reports (Phase 6.4) — loaded via useConditionReports. Same
  // hook shape as updates. Immutable check-in / check-out evidence files,
  // host only. Step 2 builds check-in; check-out wires into "Complete
  // stay" in Step 3.
  const {
    data: conditionReports,
    loading: crLoading,
    refetch: refetchConditionReports,
  } = useConditionReports(id);
  const [filingCheckIn, setFilingCheckIn] = useState(false);
  const [crPendingPhotos, setCrPendingPhotos] = useState<PetPhotoSource[]>([]);
  const [crNote, setCrNote] = useState("");
  const [crPosting, setCrPosting] = useState(false);
  const [crPostError, setCrPostError] = useState<string | null>(null);

  // Daily-update form dirty-tracking. The form is dirty when there's at
  // least one pending photo OR the note has any non-whitespace content.
  // Wired into:
  //   • AppHeader's confirmLeave prop (in-app nav interception)
  //   • the beforeunload listener below (browser refresh / tab close)
  // Dirty when the compose form has content OR any entry is in edit mode.
  // Being IN edit mode without an explicit cancel/save counts as dirty
  // even before any change — slightly over-eager but errs on the side of
  // protecting work-in-progress.
  const isUpdateFormDirty =
    pendingPhotos.length > 0 ||
    updateNote.trim() !== "" ||
    editingEntryId !== null;

  // Condition-report check-in form has the same leave-warning needs.
  const isCrFormDirty =
    filingCheckIn &&
    (crPendingPhotos.length > 0 || crNote.trim() !== "");

  // Any open form with unsaved work. Used by confirmLeaveIfDirty and the
  // beforeunload effect so both daily-updates AND condition-reports
  // unsaved work is protected.
  const isAnyFormDirty = isUpdateFormDirty || isCrFormDirty;

  // Auto-close any open edit form if the booking transitions out of
  // 'active'. Migration 0015 + the lib status guard would reject the
  // save anyway, but closing proactively avoids the surprise rejection
  // and prevents a stale edit form from sitting on a no-longer-editable
  // booking.
  useEffect(() => {
    if (
      booking &&
      booking.status !== "active" &&
      editingEntryId !== null
    ) {
      setEditingEntryId(null);
      setEditKeep(new Set());
      setEditNewSources([]);
      setEditNote("");
      setEditError(null);
    }
  }, [booking?.status, editingEntryId]);

  // Same protective pattern for the condition-report check-in form: if
  // the booking transitions out of 'active', the lib + RLS would reject
  // a save anyway, so close the form proactively.
  useEffect(() => {
    if (booking && booking.status !== "active" && filingCheckIn) {
      setFilingCheckIn(false);
      setCrPendingPhotos([]);
      setCrNote("");
      setCrPostError(null);
    }
  }, [booking?.status, filingCheckIn]);

  const confirmLeaveIfDirty = (): boolean => {
    if (!isAnyFormDirty) return true;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // Use the leave message that matches whichever form is dirty.
      // If both happen to be dirty (rare — different sections), CR
      // wins because that's the heavier-stakes evidence record.
      const msg = isCrFormDirty
        ? t("condition_reports.leave_confirm")
        : t("daily_updates.leave_confirm");
      return window.confirm(msg);
    }
    // Native: no synchronous confirm. Allow the nav. A native Alert.alert
    // is async and can't gate a synchronous Pressable.onPress reliably;
    // a proper native unsaved-work flow is its own follow-up.
    return true;
  };

  // Web only: ask before tab close / refresh while any form is dirty.
  // preventDefault alone triggers the browser's native "leave site?"
  // prompt on all modern browsers (Chrome ≥119, all Firefox/Safari in
  // common use). The legacy `event.returnValue = ''` shim is deprecated
  // and no longer needed.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!isAnyFormDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAnyFormDirty]);

  // Reconstruct AddonSelection[] from the persisted booking_addons rows
  // so we can re-run the same breakdown function the request screen used.
  // Rows of the same type are grouped by their pet_ids; booking-wide rows
  // (pet_id null) contribute one entry with petIds=[].
  const addonSelections = useMemo<AddonSelection[]>(() => {
    if (!booking) return [];
    const byType = new Map<
      AddonType,
      { petIds: string[]; hasBookingWide: boolean }
    >();
    for (const row of booking.addons) {
      const type = row.type as AddonType;
      const entry = byType.get(type) ?? { petIds: [], hasBookingWide: false };
      if (row.pet_id === null) {
        entry.hasBookingWide = true;
      } else {
        entry.petIds.push(row.pet_id);
      }
      byType.set(type, entry);
    }
    const out: AddonSelection[] = [];
    for (const [type, entry] of byType) {
      // A type might have both per-pet rows AND a booking-wide row in
      // pathological data; in normal flow it's one or the other. Emit
      // per-pet first.
      if (entry.petIds.length > 0) {
        out.push({ type, petIds: entry.petIds });
      }
      if (entry.hasBookingWide) {
        out.push({ type, petIds: [] });
      }
    }
    return out;
  }, [booking]);

  // Recompute the breakdown from the SNAPSHOTTED discount (not the
  // listing's current discount — that would drift if the host edited
  // their per-pet discount after the booking). Legacy bookings (pre-0009)
  // have null snapshots; discount=0 there means base is computed flat.
  const breakdown = useMemo(() => {
    if (!booking) return null;
    return computePriceBreakdown({
      nightlyPriceSAR: booking.base_price_sar,
      nights: booking.nights,
      petCount: booking.pets.length,
      additionalPetDiscount: booking.additional_pet_discount ?? 0,
      addons: addonSelections,
    });
  }, [booking, addonSelections]);

  // Map pet_id → list of add-on types attached to it, for the per-pet
  // section's "services for this pet" line.
  const servicesByPet = useMemo(() => {
    const m = new Map<string, AddonType[]>();
    if (!booking) return m;
    for (const row of booking.addons) {
      if (row.pet_id === null) continue;
      const list = m.get(row.pet_id) ?? [];
      list.push(row.type as AddonType);
      m.set(row.pet_id, list);
    }
    return m;
  }, [booking]);

  // Only owners can cancel, and only while the booking is still pending
  // host acceptance. Once accepted, cancellation is out-of-band (Step 7).
  const canCancel =
    !!booking &&
    !!user &&
    booking.owner_id === user.id &&
    booking.status === "requested";

  // Same gating as cancel: owner + status='requested'. The two
  // capabilities open and close together.
  const canEdit = canCancel;

  // Bookings created before migration 0009 have a null additional_pet_discount
  // and booking_addons rows with pet_id=null even for what's now per-pet.
  // We can't safely round-trip them through the new model.
  const isLegacyBooking = !!booking && booking.additional_pet_discount === null;

  const onEdit = () => {
    if (!booking) return;
    if (isLegacyBooking) {
      const confirmed =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.confirm(t("booking.edit_legacy_warning"))
          : true;
      if (!confirmed) return;
    }
    router.push({
      pathname: "/listings/[id]/request",
      params: {
        id: booking.listing_id,
        editBooking: booking.id,
      },
    });
  };

  // Viewer-is-the-host gate. Owner ≠ host on any real booking, so this is
  // mutually exclusive with canCancel/canEdit.
  const isHost =
    !!booking && !!user && booking.listing?.host_id === user.id;

  // Generic host transition: confirm, run the lib call, re-fetch on success
  // so the screen reflects the new status (and the now-illegal buttons hide).
  const runHostAction = async (
    action: "accept" | "decline" | "start" | "complete",
    confirmKey: string,
    failedKey: string,
    fn: (bookingId: string) => Promise<unknown>,
  ) => {
    if (!booking) return;
    const confirmed =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.confirm(t(confirmKey))
        : true;
    if (!confirmed) return;
    setHostFlight(action);
    setHostError(null);
    try {
      await fn(booking.id);
      await refetchBooking();
    } catch (e) {
      console.warn(`[booking.host_${action}_failed]`, e);
      setHostError(t(failedKey));
    } finally {
      setHostFlight(null);
    }
  };

  const onHostAccept = () =>
    runHostAction(
      "accept",
      "booking.host_accept_confirm",
      "booking.host_accept_failed",
      acceptBookingAsHost,
    );

  const onHostDecline = () =>
    runHostAction(
      "decline",
      "booking.host_decline_confirm",
      "booking.host_decline_failed",
      declineBookingAsHost,
    );

  const onHostStart = () =>
    runHostAction(
      "start",
      "booking.host_start_confirm",
      "booking.host_start_failed",
      startBookingAsHost,
    );

  const onHostComplete = () =>
    runHostAction(
      "complete",
      "booking.host_complete_confirm",
      "booking.host_complete_failed",
      completeBookingAsHost,
    );

  const onCancel = async () => {
    if (!booking) return;
    const confirmed =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.confirm(t("booking.cancel_confirm"))
        : true;
    if (!confirmed) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelBookingAsOwner(booking.id);
      // Send the user back to their bookings list — a cancelled-booking
      // detail screen is a dead end. Using replace (not push) so the back
      // button doesn't bring them right back to it.
      router.replace("/bookings");
      return;
    } catch (e) {
      console.warn("[booking.cancel_failed]", e);
      setCancelError(t("booking.cancel_failed"));
    } finally {
      setCancelling(false);
    }
  };

  // Daily-update post form is host-only AND only while the booking is
  // 'active' — Step 7 / Phase 6.2. Same isHost gate as the host actions.
  const canMutateUpdates = isHost && booking?.status === "active";

  const onAddPhoto = async () => {
    setPostError(null);
    const sources = await pickPhotosMulti();
    if (sources.length === 0) return;
    setPendingPhotos((prev) => [...prev, ...sources]);
  };

  const onRemovePending = (index: number) => {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmitUpdate = async () => {
    if (!booking || !user) return;
    // Content rule: at least one photo OR a non-empty note.
    if (pendingPhotos.length === 0 && updateNote.trim() === "") {
      setPostError(t("daily_updates.photo_required"));
      return;
    }
    setPostingUpdate(true);
    setPostError(null);
    try {
      await createDailyUpdate({
        bookingId: booking.id,
        hostId: user.id,
        sources: pendingPhotos,
        noteAr: updateNote.trim() === "" ? null : updateNote.trim(),
      });
      // On success: clear the form, then refetch the list so the new
      // update appears at the top.
      setPendingPhotos([]);
      setUpdateNote("");
      await refetchUpdates();
    } catch (e) {
      console.warn("[daily_updates.post_failed]", e);
      setPostError(t("daily_updates.post_failed"));
    } finally {
      setPostingUpdate(false);
    }
  };

  // ---- Per-entry edit handlers (sub-step b) ----

  const onEditStart = (entry: DailyUpdate) => {
    setEditingEntryId(entry.id);
    setEditKeep(
      new Set(Array.isArray(entry.photos) ? (entry.photos as string[]) : []),
    );
    setEditNewSources([]);
    setEditNote(entry.note_ar ?? "");
    setEditError(null);
  };

  const onEditCancel = () => {
    setEditingEntryId(null);
    setEditKeep(new Set());
    setEditNewSources([]);
    setEditNote("");
    setEditError(null);
  };

  const onEditAddPhotos = async () => {
    setEditError(null);
    const sources = await pickPhotosMulti();
    if (sources.length === 0) return;
    setEditNewSources((prev) => [...prev, ...sources]);
  };

  const onEditRemoveExisting = (url: string) => {
    setEditKeep((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  };

  const onEditRemoveNew = (index: number) => {
    setEditNewSources((prev) => prev.filter((_, i) => i !== index));
  };

  const onEditSave = async (entryId: string) => {
    if (!booking || !user) return;
    const keepArr = Array.from(editKeep);
    // Content rule (same as compose): photo OR note required.
    if (
      keepArr.length === 0 &&
      editNewSources.length === 0 &&
      editNote.trim() === ""
    ) {
      setEditError(t("daily_updates.photo_required"));
      return;
    }
    setEditingFlight(entryId);
    setEditError(null);
    try {
      await updateDailyUpdate({
        updateId: entryId,
        hostId: user.id,
        keepPhotoUrls: keepArr,
        newSources: editNewSources,
        noteAr: editNote.trim() === "" ? null : editNote.trim(),
      });
      // Exit edit mode + refetch so the row reflects the new state.
      onEditCancel();
      await refetchUpdates();
    } catch (e) {
      console.warn("[daily_updates.edit_save_failed]", e);
      setEditError(t("daily_updates.edit_save_failed"));
    } finally {
      setEditingFlight(null);
    }
  };

  // ---- Delete (sub-step c) ----
  // No confirm dialog per the design decision. Clears any prior delete
  // error at start (so a retry after failure doesn't show stale text).
  const onDelete = async (entryId: string) => {
    if (!booking || !user) return;
    setDeletingFlight(entryId);
    setDeleteError(null);
    try {
      await deleteDailyUpdate({ updateId: entryId, hostId: user.id });
      await refetchUpdates();
    } catch (e) {
      console.warn("[daily_updates.delete_failed]", e);
      setDeleteError(t("daily_updates.delete_failed"));
    } finally {
      setDeletingFlight(null);
    }
  };

  // ---- Condition reports (Phase 6.4) ----
  // Pull each phase out of the loaded list. Order doesn't matter — we
  // just look up by phase name. The (booking_id, phase) unique index
  // from migration 0017 guarantees at most one of each per booking.
  const checkInReport = conditionReports.find((r) => r.phase === "check_in");
  const checkOutReport = conditionReports.find(
    (r) => r.phase === "check_out",
  );

  // Same gate as canMutateUpdates plus "no check-in filed yet". The
  // unique index backstops this, but the UI should hide the button
  // proactively so the host doesn't tap a doomed action.
  const canFileCheckIn = canMutateUpdates && !checkInReport;

  // Hard cap on condition-report photos: 6 total. A multi-select that
  // pushes us over the cap is silently truncated (keep the first N that
  // fit). UI also hides the "Add photos" button at cap so this branch
  // is defensive.
  const CR_PHOTO_CAP = 6;
  const onAddCrPhotos = async () => {
    setCrPostError(null);
    const sources = await pickPhotosMulti();
    if (sources.length === 0) return;
    setCrPendingPhotos((prev) => {
      const room = Math.max(0, CR_PHOTO_CAP - prev.length);
      if (room === 0) return prev;
      return [...prev, ...sources.slice(0, room)];
    });
  };

  const onRemoveCrPending = (index: number) => {
    setCrPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const onOpenFileCheckIn = () => {
    setFilingCheckIn(true);
    setCrPendingPhotos([]);
    setCrNote("");
    setCrPostError(null);
  };

  const onCancelCheckIn = () => {
    setFilingCheckIn(false);
    setCrPendingPhotos([]);
    setCrNote("");
    setCrPostError(null);
  };

  const onSaveCheckIn = async () => {
    if (!booking || !user) return;
    // Content rule mirrors the lib's guard; UI catches it before the
    // network round-trip.
    if (crPendingPhotos.length === 0 && crNote.trim() === "") {
      setCrPostError(t("condition_reports.content_required"));
      return;
    }
    setCrPosting(true);
    setCrPostError(null);
    try {
      await createConditionReport({
        bookingId: booking.id,
        hostId: user.id,
        phase: "check_in",
        sources: crPendingPhotos,
        note: crNote.trim() === "" ? null : crNote.trim(),
      });
      // On success: close + clear the form, refetch the list so the
      // new report appears as a read-only card and the file button
      // disappears.
      setFilingCheckIn(false);
      setCrPendingPhotos([]);
      setCrNote("");
      await refetchConditionReports();
    } catch (e) {
      console.warn("[condition_reports.save_failed]", e);
      setCrPostError(t("condition_reports.save_failed"));
    } finally {
      setCrPosting(false);
    }
  };

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t("listing.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !booking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error ?? t("listing.not_found")}
          </Text>
          <Button
            label={t("booking.back_home")}
            onPress={() => router.replace("/")}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <AppHeader
        locale={locale}
        onLanguageToggle={toggleLocale}
        confirmLeave={confirmLeaveIfDirty}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successCircle}>
          <Text style={styles.successCheck}>✓</Text>
        </View>

        <Text style={styles.title}>{t("booking.confirm_title")}</Text>
        <Text style={styles.subtitle}>
          {t(`booking.status_${booking.status}`)}
        </Text>

        <View style={styles.summaryCard}>
          {booking.listing ? (
            <>
              <Text style={styles.summaryTitle}>
                {pickLocalized(
                  booking.listing.title_ar,
                  booking.listing.title_en,
                  locale,
                )}
              </Text>
              <Text style={styles.summaryMeta}>
                📍 {booking.listing.neighborhood}
              </Text>
            </>
          ) : null}

          <View style={styles.summaryDivider} />

          <Text style={styles.summaryLine}>
            {t("booking.dates_range", {
              start: toArabicDigits(booking.start_date),
              end: toArabicDigits(booking.end_date),
            })}
          </Text>
          <Text style={styles.summaryLine}>
            {t("booking.nights_count", {
              nights: toArabicDigits(booking.nights),
            })}
          </Text>

          <View style={styles.summaryDivider} />

          {/* Per-pet block — one row per pet with avatar + services */}
          {booking.pets.map((p) => {
            const services = isLegacyBooking
              ? []
              : (servicesByPet.get(p.id) ?? []);
            return (
              <View key={p.id} style={styles.petBlock}>
                <View style={styles.petBlockHeader}>
                  <PetAvatar photoUrl={p.photo_url} breed={p.breed} size={32} />
                  <Text style={styles.petBlockName}>{p.name}</Text>
                </View>
                {!isLegacyBooking ? (
                  services.length > 0 ? (
                    <Text style={styles.petBlockServices}>
                      {services.map((s) => t(`booking.addon_${s}`)).join("، ")}
                    </Text>
                  ) : (
                    <Text style={styles.petBlockNoServices}>
                      {t("booking.no_per_pet_services")}
                    </Text>
                  )
                ) : null}
              </View>
            );
          })}

          <View style={styles.summaryDivider} />

          {/* Breakdown — legacy bookings (pre-0009) get raw rows; modern
                bookings get the recomputed per-pet breakdown. */}
          {booking.nights > 0 && booking.pets.length > 0 ? (
            isLegacyBooking ? (
              // Legacy: show raw booking_addons rows as-is, no recomputation.
              <View style={styles.breakdownBox}>
                {booking.addons.map((row) => (
                  <View key={row.id} style={styles.breakdownLine}>
                    <Text style={styles.breakdownLabel}>
                      {t(`booking.addon_${row.type}`)}
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {formatSAR(row.price_sar)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : breakdown ? (
              <View style={styles.breakdownBox}>
                <View style={styles.breakdownLine}>
                  <Text style={styles.breakdownLabel}>
                    {t("booking.breakdown_base", {
                      pets: toArabicDigits(booking.pets.length),
                      nights: toArabicDigits(booking.nights),
                    })}
                  </Text>
                  <Text style={styles.breakdownValue}>
                    {formatSAR(breakdown.baseSubtotalSAR)}
                  </Text>
                </View>
                {breakdown.addonLines
                  .filter((line) => line.lineSAR > 0)
                  .map((line, i) => {
                    const suffix =
                      line.scope === "per_pet" && line.cadence === "one_time"
                        ? t("booking.per_pet_suffix_one_time", {
                            pets: toArabicDigits(line.petCount),
                          })
                        : line.scope === "per_pet" &&
                            line.cadence === "per_night"
                          ? t("booking.per_pet_suffix_per_night", {
                              pets: toArabicDigits(line.petCount),
                              nights: toArabicDigits(line.nights),
                            })
                          : line.scope === "booking" &&
                              line.cadence === "per_night"
                            ? t("booking.booking_suffix_per_night", {
                                nights: toArabicDigits(line.nights),
                              })
                            : "";
                    return (
                      <View
                        key={`${line.type}-${i}`}
                        style={styles.breakdownLine}
                      >
                        <Text style={styles.breakdownLabel}>
                          {t(`booking.addon_${line.type}`)}
                          {suffix ? ` ${suffix}` : ""}
                        </Text>
                        <Text style={styles.breakdownValue}>
                          {formatSAR(line.lineSAR)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ) : null
          ) : null}

          <View style={styles.summaryDivider} />

          <Text style={styles.totalLine}>
            {t("booking.total_paid", {
              total: formatSAR(
                isLegacyBooking
                  ? booking.total_sar
                  : (breakdown?.totalSAR ?? booking.total_sar),
              ),
            })}
          </Text>
        </View>

        {/* ===== Condition reports (Phase 6.4) =====
            Whole section (heading + saved check-in + file button /
            compose form) lives in one sectionCard, mirroring the
            booking-summary card above. Both owner and host see filed
            reports; only the host on an active booking sees the file
            button + compose form. */}
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

        {/* Daily updates — visible to both owner and host. Same
            sectionCard wrapper as condition-reports above. */}
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
                ? (u.photos as string[])
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

        {/* Check-out report — sits below the daily updates section so the
            on-screen flow reads check-in → daily updates → check-out.
            Filing UI comes in a follow-up step; only displays here when a
            check-out report already exists. Inline marginTop matches the
            section-start rhythm used by crSectionTitle / dailyUpdatesTitle
            (this is a standalone card with no preceding heading). */}
        {checkOutReport ? (
          <View style={[styles.crReportCard, { marginTop: spacing.lg }]}>
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

        {canEdit ? (
          <Button
            label={t("booking.edit_request_button")}
            onPress={onEdit}
            variant="secondary"
            fullWidth
          />
        ) : null}

        {isHost ? (
          <>
            {hostError ? (
              <Text style={styles.errorText}>{hostError}</Text>
            ) : null}
            {booking.status === "requested" ? (
              <>
                <Button
                  label={
                    hostFlight === "accept"
                      ? t("booking.host_accepting")
                      : t("booking.host_accept_button")
                  }
                  onPress={onHostAccept}
                  variant="primary"
                  loading={hostFlight === "accept"}
                  disabled={!!hostFlight && hostFlight !== "accept"}
                  fullWidth
                />
                <Button
                  label={
                    hostFlight === "decline"
                      ? t("booking.host_declining")
                      : t("booking.host_decline_button")
                  }
                  onPress={onHostDecline}
                  variant="destructive"
                  loading={hostFlight === "decline"}
                  disabled={!!hostFlight && hostFlight !== "decline"}
                  fullWidth
                />
              </>
            ) : null}
            {booking.status === "accepted" ? (
              <Button
                label={
                  hostFlight === "start"
                    ? t("booking.host_starting")
                    : t("booking.host_start_button")
                }
                onPress={onHostStart}
                variant="primary"
                loading={hostFlight === "start"}
                disabled={!!hostFlight && hostFlight !== "start"}
                fullWidth
              />
            ) : null}
            {booking.status === "active" ? (
              <Button
                label={
                  hostFlight === "complete"
                    ? t("booking.host_completing")
                    : t("booking.host_complete_button")
                }
                onPress={onHostComplete}
                variant="primary"
                loading={hostFlight === "complete"}
                disabled={!!hostFlight && hostFlight !== "complete"}
                fullWidth
              />
            ) : null}
          </>
        ) : null}

        {canCancel ? (
          <>
            {cancelError ? (
              <Text style={styles.errorText}>{cancelError}</Text>
            ) : null}
            <Button
              label={
                cancelling
                  ? t("booking.cancelling")
                  : t("booking.cancel_button")
              }
              onPress={onCancel}
              variant="destructive"
              loading={cancelling}
              fullWidth
            />
          </>
        ) : null}

        <Button
          label={t("booking.back_home")}
          onPress={() => router.replace("/")}
          variant="secondary"
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.moss,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  successCheck: {
    fontSize: 40,
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.gold,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  summaryCard: {
    width: "100%",
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  // Same shell as summaryCard, used to wrap the condition-reports and
  // daily-updates sections so each reads as a card matching the
  // booking-summary card above. Owns the inter-card marginTop so child
  // headings (crSectionTitle / dailyUpdatesTitle) can sit flush at the
  // top of the card's padding.
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
  summaryTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
  },
  summaryMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.whisper,
    marginVertical: spacing.sm,
  },
  summaryLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  petBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  petBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  petBlockName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  petBlockServices: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    paddingLeft: spacing.xl + 32,
  },
  petBlockNoServices: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    fontStyle: "italic",
    paddingLeft: spacing.xl + 32,
  },
  breakdownBox: {
    gap: spacing.xs,
  },
  breakdownLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  breakdownLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    marginLeft: spacing.sm,
  },
  totalLine: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    marginTop: spacing.xs,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
  },
  // ---- daily updates (Phase 6.2) ----
  dailyUpdatesTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
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
  updatePhotosRow: {
    gap: spacing.sm,
  },
  updatePhoto: {
    width: 140,
    height: 140,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  updateNote: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
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
  pendingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pendingThumbWrap: {
    position: "relative",
  },
  pendingThumb: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
    // Dashed outline marks the photo as "not yet saved" — saved-update
    // cards intentionally show no border at all.
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.inkSoft,
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
  pendingRemoveButton: {
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
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 18,
  },
  noteInput: {
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
    // Belt-and-braces against the web textarea's intrinsic content
    // width letting siblings (photo grid, errors) wrap beside it.
    // The textarea is always full-width on its own line below photos.
  },

  // ---- Condition reports (Phase 6.4) ----
  crSectionTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
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
  crReportNote: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: "right",
  },
  // "+ File check-in report" button — moss outlined pill, full-width.
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
  crFormActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

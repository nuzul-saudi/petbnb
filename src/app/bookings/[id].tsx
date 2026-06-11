import { logWarn } from '@/lib/log';
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { PetAvatar } from "@/components/PetAvatar";
import { CheckOutSection } from "@/components/bookings/CheckOutSection";
import { ReviewCard } from "@/components/bookings/ReviewCard";
import { ConditionReportsSection } from "@/components/bookings/ConditionReportsSection";
import { DailyUpdatesSection } from "@/components/bookings/DailyUpdatesSection";
import { HostActions } from "@/components/bookings/HostActions";
import { useBooking } from "@/hooks/useBooking";
import { useConditionReports } from "@/hooks/useConditionReports";
import { useDailyUpdates } from "@/hooks/useDailyUpdates";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/lib/confirm";
import { usePersona } from "@/lib/persona";
import { findMyReview, type Review } from "@/lib/reviews";
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
  const { initializing, session, user, profile } = useAuth();
  const { persona, refreshPendingHostCount } = usePersona();
  const toggleLocale = () => setLocale(locale === "ar" ? "en" : "ar");
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  // Test round 3 follow-up (2026-06-10): each control set on this
  // screen is gated by PERSONA, not by ownership alone. A 'both' user
  // who booked their own listing previously saw BOTH the owner
  // controls (Edit / Cancel) AND the host controls (Accept / Decline)
  // on the same screen, because ownership and host-of-listing were
  // both true for them. Now persona decides:
  //   • owner mode → only Edit / Cancel render (when owner of booking)
  //   • host mode  → only Accept / Decline render (when host of listing)
  // Pure 'owner' / pure 'host' users ignore persona — they get the
  // mode their role implies.
  const isOwnerMode =
    profile?.role === "owner" ||
    (profile?.role === "both" && persona === "owner");
  const isHostMode =
    profile?.role === "host" ||
    (profile?.role === "both" && persona === "host");

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

  // R2C6 two-way reviews. The caller's own existing review for this
  // booking (if any). Re-fetched whenever booking transitions to
  // 'completed' or after a successful submit.
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [reviewFetchTick, setReviewFetchTick] = useState(0);

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

  // Mirror state for the check-OUT report compose form (Phase 6.4 — Phase
  // 2 of check-out filing). Same shape as the check-in state above; wired
  // into CheckOutSection in a follow-up step.
  const [filingCheckOut, setFilingCheckOut] = useState(false);
  const [coPendingPhotos, setCoPendingPhotos] = useState<PetPhotoSource[]>([]);
  const [coNote, setCoNote] = useState("");
  const [coPosting, setCoPosting] = useState(false);
  const [coPostError, setCoPostError] = useState<string | null>(null);

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

  // Same shape for the check-out compose form.
  const isCheckOutFormDirty =
    filingCheckOut &&
    (coPendingPhotos.length > 0 || coNote.trim() !== "");

  // Any open form with unsaved work. Used by confirmLeaveIfDirty and the
  // beforeunload effect so both daily-updates AND condition-reports
  // unsaved work is protected.
  const isAnyFormDirty =
    isUpdateFormDirty || isCrFormDirty || isCheckOutFormDirty;

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

  // And again for the check-out form. NOTE: status flips to 'completed'
  // on a successful onCompleteStay, so this effect will also fire after
  // a successful completion — that's fine, it just clears an already-
  // empty form.
  useEffect(() => {
    if (booking && booking.status !== "active" && filingCheckOut) {
      setFilingCheckOut(false);
      setCoPendingPhotos([]);
      setCoNote("");
      setCoPostError(null);
    }
  }, [booking?.status, filingCheckOut]);

  const confirmLeaveIfDirty = (): boolean => {
    if (!isAnyFormDirty) return true;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // Use the leave message that matches whichever form is dirty.
      // Both CR forms (check-in + check-out) share the same message —
      // they're both heavier-stakes evidence records. If a daily-update
      // form AND a CR form are both dirty, CR wins.
      const msg = (isCrFormDirty || isCheckOutFormDirty)
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

  // R2C6 — fetch the caller's own review (if any) for this booking.
  // Re-runs on user / booking status change and on bump of
  // reviewFetchTick after a successful submit.
  useEffect(() => {
    if (!booking || !user) {
      setMyReview(null);
      return;
    }
    if (booking.status !== "completed") {
      setMyReview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await findMyReview(booking.id, user.id);
        if (!cancelled) setMyReview(r);
      } catch (e) {
        // Best-effort: leave the previous value. The UI falls back
        // to the compose form, which the unique-constraint backstop
        // will reject if a stale state lets a double-submit through.
        if (!cancelled) setMyReview(null);
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[reviews.fetch_my_failed]", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking?.id, booking?.status, user?.id, reviewFetchTick]);

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
  //
  // Plus persona gate: a 'both' user viewing their own booking on their
  // own listing is BOTH the owner AND the host. Show owner controls
  // only in owner persona; show host controls (below) only in host
  // persona. Pure 'owner' users always pass isOwnerMode.
  const canCancel =
    !!booking &&
    !!user &&
    booking.owner_id === user.id &&
    booking.status === "requested" &&
    isOwnerMode;

  // Same gating as cancel: owner + status='requested' + owner persona.
  // The three capabilities open and close together.
  const canEdit = canCancel;

  // Bookings created before migration 0009 have a null additional_pet_discount
  // and booking_addons rows with pet_id=null even for what's now per-pet.
  // We can't safely round-trip them through the new model.
  const isLegacyBooking = !!booking && booking.additional_pet_discount === null;

  const onEdit = async () => {
    if (!booking) return;
    if (isLegacyBooking) {
      if (!(await confirmDialog(t("booking.edit_legacy_warning")))) return;
    }
    router.push({
      pathname: "/listings/[id]/request",
      params: {
        id: booking.listing_id,
        editBooking: booking.id,
      },
    });
  };

  // Viewer-is-the-host gate. Used to render the Accept/Decline/Start/
  // Complete buttons + the daily-update / condition-report compose forms.
  //
  // Plus persona gate (test round 3, 2026-06-10): a 'both' user
  // booking their own listing is host on the listing AND owner on the
  // booking — without the persona check, BOTH sets of buttons rendered.
  // Pure 'host' users always pass isHostMode.
  const isHost =
    !!booking &&
    !!user &&
    booking.listing?.host_id === user.id &&
    isHostMode;

  // Generic host transition: confirm, run the lib call, re-fetch on success
  // so the screen reflects the new status (and the now-illegal buttons hide).
  const runHostAction = async (
    action: "accept" | "decline" | "start" | "complete",
    confirmKey: string,
    failedKey: string,
    fn: (bookingId: string) => Promise<unknown>,
  ) => {
    if (!booking) return;
    if (!(await confirmDialog(t(confirmKey)))) return;
    setHostFlight(action);
    setHostError(null);
    try {
      await fn(booking.id);
      await refetchBooking();
      // Refresh the AppHeader's pending-requests badge so it decrements
      // immediately after accept/decline (both transition the row out
      // of 'requested'). start/complete don't change the requested set
      // but the call is a no-op, kept here for simplicity.
      refreshPendingHostCount();
    } catch (e) {
      logWarn(`[booking.host_${action}_failed]`, e);
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
    if (!(await confirmDialog(t("booking.cancel_confirm")))) return;
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
      logWarn("[booking.cancel_failed]", e);
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
      logWarn("[daily_updates.post_failed]", e);
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
      logWarn("[daily_updates.edit_save_failed]", e);
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
      logWarn("[daily_updates.delete_failed]", e);
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

  // Check-out gate: same shape — host + active + no check-out yet.
  // Migration 0017's unique index backstops this too.
  const canFileCheckOut = canMutateUpdates && !checkOutReport;

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

  // Check-out mirrors of the two photo handlers — same cap logic via
  // CR_PHOTO_CAP, same setCoPostError(null) before append.
  const onAddCoPhotos = async () => {
    setCoPostError(null);
    const sources = await pickPhotosMulti();
    if (sources.length === 0) return;
    setCoPendingPhotos((prev) => {
      const room = Math.max(0, CR_PHOTO_CAP - prev.length);
      if (room === 0) return prev;
      return [...prev, ...sources.slice(0, room)];
    });
  };

  const onRemoveCoPending = (index: number) => {
    setCoPendingPhotos((prev) => prev.filter((_, i) => i !== index));
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

  const onOpenFileCheckOut = () => {
    setFilingCheckOut(true);
    setCoPendingPhotos([]);
    setCoNote("");
    setCoPostError(null);
  };

  const onCancelCheckOut = () => {
    setFilingCheckOut(false);
    setCoPendingPhotos([]);
    setCoNote("");
    setCoPostError(null);
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
      logWarn("[condition_reports.save_failed]", e);
      setCrPostError(t("condition_reports.save_failed"));
    } finally {
      setCrPosting(false);
    }
  };

  // Check-out combines the report insert AND the booking-completion
  // transition into one action ("Complete stay"). The report is OPTIONAL
  // — an empty form just completes the stay with no evidence attached.
  //
  // Migration 0016 only allows the host to insert a CR row while
  // booking.status='active', so the two writes must happen in this
  // order: report first (while still 'active'), then completion (flips
  // to 'completed'). They are separate writes, so handle the seam: if
  // the report saves but the completion fails, surface a warning, keep
  // the form open-ish, and skip the report insert on retry (a CR row
  // for this phase now exists, so a second insert would violate the
  // unique index from migration 0017).
  const onCompleteStay = async () => {
    if (!booking || !user) return;
    if (!(await confirmDialog(t("booking.host_complete_confirm")))) return;
    setCoPosting(true);
    setCoPostError(null);
    try {
      const hasContent =
        coPendingPhotos.length > 0 || coNote.trim() !== "";
      if (hasContent && !checkOutReport) {
        await createConditionReport({
          bookingId: booking.id,
          hostId: user.id,
          phase: "check_out",
          sources: coPendingPhotos,
          note: coNote.trim() === "" ? null : coNote.trim(),
        });
      }
      try {
        await completeBookingAsHost(booking.id);
      } catch (e) {
        logWarn("[booking.complete_after_report_failed]", e);
        setCoPostError(t("condition_reports.checkout_complete_warning"));
        await refetchConditionReports();
        return;
      }
      setFilingCheckOut(false);
      setCoPendingPhotos([]);
      setCoNote("");
      await refetchConditionReports();
      await refetchBooking();
    } catch (e) {
      logWarn("[condition_reports.checkout_save_failed]", e);
      setCoPostError(t("condition_reports.save_failed"));
    } finally {
      setCoPosting(false);
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

          {/* Per-pet block — one row per pet with avatar + services.
              Milestone A: when the booking is in a confirmed/active
              lifecycle state, show the host the pet's care_notes and
              vaccination dates so they have the context they need.
              The viewer side check on isHost gates it to the listing
              host only (owners already know their own pet's notes). */}
          {booking.pets.map((p) => {
            const services = isLegacyBooking
              ? []
              : (servicesByPet.get(p.id) ?? []);
            const showCareDetails =
              isHost &&
              (booking.status === 'accepted' ||
                booking.status === 'active' ||
                booking.status === 'completed');
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
                {showCareDetails ? (
                  <View style={styles.petCareBlock}>
                    {p.care_notes ? (
                      <Text style={styles.petCareNotes}>
                        {t('booking.pet_care_notes_label')}: {p.care_notes}
                      </Text>
                    ) : null}
                    {p.rabies_vaccinated_at || p.fvrcp_vaccinated_at ? (
                      <Text style={styles.petCareMeta}>
                        {t('booking.pet_vaccination_label')}:{' '}
                        {p.rabies_vaccinated_at
                          ? `${t('booking.vaccine_rabies')} ${p.rabies_vaccinated_at}`
                          : t('booking.vaccine_rabies_missing')}
                        {' · '}
                        {p.fvrcp_vaccinated_at
                          ? `${t('booking.vaccine_fvrcp')} ${p.fvrcp_vaccinated_at}`
                          : t('booking.vaccine_fvrcp_missing')}
                      </Text>
                    ) : null}
                  </View>
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

          {/* S1 — host payout view + payout status. Visible only to
              the host; the owner doesn't need to see the host's net.
              Renders only when fees have been snapshotted (after
              host accept). */}
          {isHost && booking.payout_sar != null ? (
            <View style={styles.payoutBlock}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>
                  {t('booking.host_payout_label')}
                </Text>
                <Text style={styles.feeValue}>
                  {formatSAR(booking.payout_sar)}
                </Text>
              </View>
              <Text style={styles.payoutStatusText}>
                {t(
                  booking.payout_status === 'released'
                    ? 'booking.payout_status_released'
                    : 'booking.payout_status_held',
                )}
              </Text>
            </View>
          ) : null}

          {/* S1 — cancellation refund display. Visible to owner
              when the booking has been cancelled. */}
          {booking.cancelled_at && booking.refund_sar != null ? (
            <Text style={styles.cancellationLine}>
              {booking.refund_sar > 0
                ? t(
                    booking.refund_sar ===
                      (booking.total_charged_sar ?? booking.total_sar)
                      ? 'booking.cancellation_full_refund'
                      : 'booking.cancellation_half_refund',
                    { total: formatSAR(booking.refund_sar) },
                  )
                : t('booking.cancellation_no_refund')}
            </Text>
          ) : null}
        </View>

        {/* Condition reports section — extracted to
            ConditionReportsSection. Parent owns state + handlers
            (including isCrFormDirty for the leave-warning) and passes
            them down; the component is presentational. */}
        <ConditionReportsSection
          crLoading={crLoading}
          checkInReport={checkInReport}
          canFileCheckIn={canFileCheckIn}
          filingCheckIn={filingCheckIn}
          crPendingPhotos={crPendingPhotos}
          crNote={crNote}
          crPosting={crPosting}
          crPostError={crPostError}
          CR_PHOTO_CAP={CR_PHOTO_CAP}
          onOpenFileCheckIn={onOpenFileCheckIn}
          onCancelCheckIn={onCancelCheckIn}
          onAddCrPhotos={onAddCrPhotos}
          onRemoveCrPending={onRemoveCrPending}
          onSaveCheckIn={onSaveCheckIn}
          setCrNote={setCrNote}
        />

        {/* Daily updates section — extracted to DailyUpdatesSection.
            Parent owns ALL state + handlers (compose, per-entry edit,
            delete) plus the dirty predicates (isUpdateFormDirty /
            isAnyFormDirty) wired into confirmLeaveIfDirty +
            beforeunload; the component is presentational. */}
        <DailyUpdatesSection
          updates={updates}
          updatesLoading={updatesLoading}
          canMutateUpdates={canMutateUpdates}
          checkInReport={checkInReport}
          pendingPhotos={pendingPhotos}
          updateNote={updateNote}
          postingUpdate={postingUpdate}
          postError={postError}
          onAddPhoto={onAddPhoto}
          onRemovePending={onRemovePending}
          onSubmitUpdate={onSubmitUpdate}
          setUpdateNote={setUpdateNote}
          setPendingPhotos={setPendingPhotos}
          setPostError={setPostError}
          editingEntryId={editingEntryId}
          editKeep={editKeep}
          editNewSources={editNewSources}
          editNote={editNote}
          editingFlight={editingFlight}
          editError={editError}
          onEditStart={onEditStart}
          onEditCancel={onEditCancel}
          onEditAddPhotos={onEditAddPhotos}
          onEditRemoveExisting={onEditRemoveExisting}
          onEditRemoveNew={onEditRemoveNew}
          onEditSave={onEditSave}
          setEditNote={setEditNote}
          deletingFlight={deletingFlight}
          deleteError={deleteError}
          onDelete={onDelete}
        />

        {/* Check-out section — extracted to CheckOutSection. Renders the
            saved report (read-only) AND the host-only file+complete form.
            On-screen order stays check-in → daily updates → check-out.
            Parent owns state + handlers (including isCheckOutFormDirty
            for the leave-warning) and onCompleteStay, which files the
            report (optional) then transitions the booking to completed. */}
        <CheckOutSection
          crLoading={crLoading}
          checkOutReport={checkOutReport}
          canFileCheckOut={canFileCheckOut}
          filingCheckOut={filingCheckOut}
          coPendingPhotos={coPendingPhotos}
          coNote={coNote}
          coPosting={coPosting}
          coPostError={coPostError}
          CR_PHOTO_CAP={CR_PHOTO_CAP}
          onOpenFileCheckOut={onOpenFileCheckOut}
          onCancelCheckOut={onCancelCheckOut}
          onAddCoPhotos={onAddCoPhotos}
          onRemoveCoPending={onRemoveCoPending}
          onCompleteStay={onCompleteStay}
          setCoNote={setCoNote}
        />

        {/* R2C6 — two-way reviews. Renders only on completed
            bookings. Persona-gated so:
              - owner persona (booking.owner_id === user.id) sees
                "Rate your host"; rater = user, ratee = host.
              - host persona (listing.host_id === user.id) sees
                "Rate the owner"; rater = user, ratee = owner.
            One-shot: ReviewCard flips to read-only mode when
            myReview is non-null. Server RLS + unique constraint
            backstop the gate. */}
        {booking.status === "completed" && user && booking.listing ? (
          <>
            {isOwnerMode && booking.owner_id === user.id ? (
              <ReviewCard
                bookingId={booking.id}
                raterId={user.id}
                rateeId={booking.listing.host_id}
                titleKey="reviews.rate_host_title"
                existing={myReview}
                onSubmitted={() => setReviewFetchTick((n) => n + 1)}
              />
            ) : null}
            {isHostMode && booking.listing.host_id === user.id ? (
              <ReviewCard
                bookingId={booking.id}
                raterId={user.id}
                rateeId={booking.owner_id}
                titleKey="reviews.rate_owner_title"
                existing={myReview}
                onSubmitted={() => setReviewFetchTick((n) => n + 1)}
              />
            ) : null}
          </>
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
          <HostActions
            status={booking.status}
            hostFlight={hostFlight}
            hostError={hostError}
            onAccept={onHostAccept}
            onDecline={onHostDecline}
            onStart={onHostStart}
            onComplete={onHostComplete}
            hideComplete={canFileCheckOut}
          />
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
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream in owner mode, honey in host mode).
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
  petCareBlock: {
    paddingLeft: spacing.xl + 32,
    gap: 4,
    marginTop: 4,
  },
  petCareNotes: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 18,
  },
  petCareMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
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
  payoutBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
    gap: 4,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  feeLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  feeValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  payoutStatusText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  cancellationLine: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
  },
  // ---- Saved-card display styles still used by the standalone
  // check-out card lower in the JSX. (Originally lived alongside the
  // daily-updates section heading + list + card styles, which moved
  // into DailyUpdatesSection in the Phase 6.2 extraction.) ----
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

  // ---- Condition reports (Phase 6.4) — styles still used by the
  // standalone check-out card lower in the JSX. Section title +
  // subtitle + form styles moved into ConditionReportsSection. ----
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
  crFormActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

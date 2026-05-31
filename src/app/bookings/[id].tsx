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
import { PetAvatar } from "@/components/PetAvatar";
import { useAuth } from "@/lib/auth";
import {
  acceptBookingAsHost,
  cancelBookingAsOwner,
  completeBookingAsHost,
  declineBookingAsHost,
  getBooking,
  startBookingAsHost,
  type BookingDetail,
} from "@/lib/bookings";
import {
  createDailyUpdate,
  deleteDailyUpdate,
  listDailyUpdates,
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
import { colors, fonts, radii, spacing } from "@/theme/tokens";

export default function BookingDetailScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === "ar" ? "en" : "ar");
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Single in-flight indicator across all 4 host actions: at most one
  // transition can run at a time, and the lit button tells the host which.
  const [hostFlight, setHostFlight] = useState<
    "accept" | "decline" | "start" | "complete" | null
  >(null);
  const [hostError, setHostError] = useState<string | null>(null);

  // Daily updates: list (loaded alongside the booking), plus host-only
  // post form state (pending photo list + optional note).
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBooking(id)
      .then((b) => {
        if (cancelled) return;
        setBooking(b);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn("[booking.load_failed]", e);
        setError(t("booking.load_failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Daily updates load — parallel to the booking fetch so neither blocks
  // the other. Refetched after the host successfully posts a new update.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listDailyUpdates(id)
      .then((rows) => {
        if (!cancelled) setUpdates(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn("[daily_updates.load_failed]", e);
        // Silent failure: the empty-state copy will show. Updates are
        // a secondary surface; don't crash the whole booking page.
      })
      .finally(() => {
        if (!cancelled) setUpdatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  const confirmLeaveIfDirty = (): boolean => {
    if (!isUpdateFormDirty) return true;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.confirm(t("daily_updates.leave_confirm"));
    }
    // Native: no synchronous confirm. Allow the nav. A native Alert.alert
    // is async and can't gate a synchronous Pressable.onPress reliably;
    // a proper native unsaved-work flow is its own follow-up.
    return true;
  };

  // Web only: ask before tab close / refresh while the form is dirty.
  // preventDefault alone triggers the browser's native "leave site?"
  // prompt on all modern browsers (Chrome ≥119, all Firefox/Safari in
  // common use). The legacy `event.returnValue = ''` shim is deprecated
  // and no longer needed.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!isUpdateFormDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isUpdateFormDirty]);

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
      const fresh = await getBooking(booking.id);
      if (fresh) setBooking(fresh);
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
      const fresh = await listDailyUpdates(booking.id);
      setUpdates(fresh);
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
      const fresh = await listDailyUpdates(booking.id);
      setUpdates(fresh);
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
      const fresh = await listDailyUpdates(booking.id);
      setUpdates(fresh);
    } catch (e) {
      console.warn("[daily_updates.delete_failed]", e);
      setDeleteError(t("daily_updates.delete_failed"));
    } finally {
      setDeletingFlight(null);
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
          <Pressable
            onPress={() => router.replace("/")}
            style={styles.backButton}
          >
            <Text style={styles.backText}>{t("booking.back_home")}</Text>
          </Pressable>
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

        {/* Daily updates — visible to both owner and host */}
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

                    <Pressable
                      onPress={onEditAddPhotos}
                      disabled={inFlight}
                      style={[
                        styles.addPhotoButton,
                        inFlight && styles.buttonDisabled,
                      ]}
                    >
                      <Text style={styles.addPhotoText}>
                        {t("daily_updates.add_photo_button")}
                      </Text>
                    </Pressable>

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
                      <Pressable
                        onPress={() => onEditSave(u.id)}
                        disabled={inFlight || !canSave}
                        style={[
                          styles.entryButton,
                          { borderColor: colors.moss },
                          (inFlight || !canSave) && styles.buttonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.entryButtonText,
                            { color: colors.moss },
                          ]}
                        >
                          {inFlight
                            ? t("daily_updates.edit_saving")
                            : t("daily_updates.edit_save_button")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={onEditCancel}
                        disabled={inFlight}
                        style={[
                          styles.entryButton,
                          { borderColor: colors.inkSoft },
                          inFlight && styles.buttonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.entryButtonText,
                            { color: colors.inkSoft },
                          ]}
                        >
                          {t("daily_updates.edit_cancel_button")}
                        </Text>
                      </Pressable>
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
                      <Pressable
                        onPress={() => onEditStart(u)}
                        disabled={
                          editingEntryId !== null || deletingFlight !== null
                        }
                        style={[
                          styles.entryButton,
                          { borderColor: colors.moss },
                          (editingEntryId !== null ||
                            deletingFlight !== null) &&
                            styles.buttonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.entryButtonText,
                            { color: colors.moss },
                          ]}
                        >
                          {t("daily_updates.edit_button")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete(u.id)}
                        disabled={
                          editingEntryId !== null || deletingFlight !== null
                        }
                        style={[
                          styles.entryButton,
                          { borderColor: colors.terracotta },
                          (editingEntryId !== null ||
                            deletingFlight !== null) &&
                            styles.buttonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.entryButtonText,
                            { color: colors.terracotta },
                          ]}
                        >
                          {deletingFlight === u.id
                            ? t("daily_updates.deleting")
                            : t("daily_updates.delete_button")}
                        </Text>
                      </Pressable>
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

        {/* Post form — host-only, active-only */}
        {canMutateUpdates ? (
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

            <Pressable
              onPress={onAddPhoto}
              disabled={postingUpdate}
              style={[
                styles.addPhotoButton,
                postingUpdate && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.addPhotoText}>
                {t("daily_updates.add_photo_button")}
              </Text>
            </Pressable>

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

            <Pressable
              onPress={onSubmitUpdate}
              disabled={
                postingUpdate ||
                (pendingPhotos.length === 0 && updateNote.trim() === "")
              }
              style={[
                styles.editButton,
                (postingUpdate ||
                  (pendingPhotos.length === 0 &&
                    updateNote.trim() === "")) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.editText}>
                {postingUpdate
                  ? t("daily_updates.posting")
                  : t("daily_updates.submit_button")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {canEdit ? (
          <Pressable onPress={onEdit} style={styles.editButton}>
            <Text style={styles.editText}>
              {t("booking.edit_request_button")}
            </Text>
          </Pressable>
        ) : null}

        {isHost ? (
          <>
            {hostError ? (
              <Text style={styles.errorText}>{hostError}</Text>
            ) : null}
            {booking.status === "requested" ? (
              <>
                <Pressable
                  onPress={onHostAccept}
                  disabled={!!hostFlight}
                  style={[
                    styles.editButton,
                    !!hostFlight && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.editText}>
                    {hostFlight === "accept"
                      ? t("booking.host_accepting")
                      : t("booking.host_accept_button")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onHostDecline}
                  disabled={!!hostFlight}
                  style={[
                    styles.cancelButton,
                    !!hostFlight && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.cancelText}>
                    {hostFlight === "decline"
                      ? t("booking.host_declining")
                      : t("booking.host_decline_button")}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {booking.status === "accepted" ? (
              <Pressable
                onPress={onHostStart}
                disabled={!!hostFlight}
                style={[
                  styles.editButton,
                  !!hostFlight && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.editText}>
                  {hostFlight === "start"
                    ? t("booking.host_starting")
                    : t("booking.host_start_button")}
                </Text>
              </Pressable>
            ) : null}
            {booking.status === "active" ? (
              <Pressable
                onPress={onHostComplete}
                disabled={!!hostFlight}
                style={[
                  styles.editButton,
                  !!hostFlight && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.editText}>
                  {hostFlight === "complete"
                    ? t("booking.host_completing")
                    : t("booking.host_complete_button")}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {canCancel ? (
          <>
            {cancelError ? (
              <Text style={styles.errorText}>{cancelError}</Text>
            ) : null}
            <Pressable
              onPress={onCancel}
              disabled={cancelling}
              style={[styles.cancelButton, cancelling && styles.buttonDisabled]}
            >
              <Text style={styles.cancelText}>
                {cancelling
                  ? t("booking.cancelling")
                  : t("booking.cancel_button")}
              </Text>
            </Pressable>
          </>
        ) : null}

        <Pressable onPress={() => router.replace("/")} style={styles.cta}>
          <Text style={styles.ctaText}>{t("booking.back_home")}</Text>
        </Pressable>
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
  cta: {
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.cream,
  },
  editButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.moss,
    alignItems: "center",
    marginTop: spacing.md,
  },
  editText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  cancelButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.terracotta,
    alignItems: "center",
    marginTop: spacing.md,
  },
  cancelText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
  },
  backButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.inkSoft,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  // ---- daily updates (Phase 6.2) ----
  dailyUpdatesTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.mossDeep,
    marginTop: spacing.lg,
  },
  updatesList: {
    gap: spacing.md,
    width: "100%",
  },
  updateCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.whisper,
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
  entryButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  entryButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
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
  addPhotoButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.moss,
    alignSelf: "flex-start",
  },
  addPhotoText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.moss,
  },
  noteInput: {
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
});

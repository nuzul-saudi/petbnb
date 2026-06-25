import { logWarn } from '@/lib/log';
// Listing edit screen (Step 7.5 + 8d two-copy rework). Host-only.
//
// Behaviour rules:
//   • Edits the WHOLE listing (10 form fields). Photos are reached
//     via a "Manage photos" link — managed on the existing
//     /listings/[id]/photos screen, NOT embedded.
//   • Editing a never-approved listing (status='pending') saves
//     IN-PLACE on the listings row — there's no public copy to
//     protect. No confirm.
//   • Editing an approved or paused listing creates / updates a
//     draft (listing_drafts) — the LIVE row stays untouched and the
//     public feed keeps showing the approved copy. A confirm dialog
//     informs the host their changes go to admin review.
//   • Dirty-check: Save is disabled until at least one field differs
//     from the loaded values. Prevents an empty draft from a
//     no-change Save.
//   • Deactivate (status='approved' only) → setListingStatus('paused').
//     Host-controlled "I want to turn this off for now."
//   • Reactivate (status='paused' only) → setListingStatus('approved').
//     8h.4: button hidden when status='admin_disabled' (host has no
//     path out — only admin Restore lifts it). Also hidden when
//     status='pending' (nothing to reactivate to).
//   • Discard pending changes — visible only when has_pending_edit
//     is true. Deletes both draft tables for the listing; the form
//     re-fetches and reverts to the live values.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { ListingForm, type ListingFormValues } from '@/components/ListingForm';
import { useAuth } from '@/lib/auth';
import {
  listBlockedRanges,
  type BlockedRange,
} from '@/lib/availability';
import { confirmDialog } from '@/lib/confirm';
import { useTranslation } from '@/lib/i18n';
import {
  discardListingDraft,
  getListingForEdit,
  setListingStatus,
  updateListing,
  type ListingEditData,
} from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function EditListingScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [data, setData] = useState<ListingEditData | null>(null);
  // Blocked ranges fetched in parallel with the edit data. Used to
  // render the live "X periods blocked" summary on the Manage
  // availability link, including the soonest upcoming range so the
  // host can confirm at a glance that their settings are applied
  // without navigating into the sub-page (2026-06-24).
  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Status toggle (deactivate / reactivate) and discard share the
  // "busy with a status-side mutation" lane so the host can't fire
  // two of them concurrently. Either also blocks the form save.
  const [togglingActive, setTogglingActive] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    // Edit data + blocked ranges in parallel — they're independent
    // queries, so no reason to serialize them.
    const [next, ranges] = await Promise.all([
      getListingForEdit(id),
      listBlockedRanges(id).catch(() => [] as BlockedRange[]),
    ]);
    setData(next);
    setBlockedRanges(ranges);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    refetch()
      .catch((e: unknown) => {
        if (cancelled) return;
        logWarn('[listings.edit.load_failed]', e);
        setLoadError(t('listings.edit.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refetch, t]);

  // 2026-06-24 — refetch on focus. The host navigates from this
  // screen out to /photos and /availability sub-pages, mutates,
  // then comes back. Without the focus-refetch, the edit screen
  // would render the stale snapshot from initial mount (no photos,
  // no blocked dates) even though those sub-pages successfully
  // wrote to the DB. Same pattern as bookings/[id]'s focus refetch.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // ---- early returns: auth → load → ownership ----

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('listings.edit.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {loadError ?? t('listings.edit.not_available')}
          </Text>
          <Button
            label={t('listings.edit.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // Ownership: must be the listing's host. Defense in depth — RLS
  // would reject any update from a non-host, but we don't even
  // render the form. Mirrors the photos-screen guard from 7.3b.
  // Both the not-found and not-yours branches show the same panel
  // so URL probing doesn't leak which listing IDs exist.
  if (data.hostId !== user.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {t('listings.edit.not_available')}
          </Text>
          <Button
            label={t('listings.edit.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---- helpers (post-guard) ----

  const isDraftPath =
    data.status === 'approved' || data.status === 'paused';

  // Save handler. Two paths:
  //   • status='pending' → in-place; no confirm; routes home.
  //   • status='approved' or 'paused' → confirm "your changes go to
  //     admin review; your live listing stays up"; updateListing
  //     upserts the draft; routes home.
  // updateListing reads the live status server-side and chooses the
  // right path itself — this screen's branch is only for the
  // confirm copy.
  const onSave = async (values: ListingFormValues) => {
    if (isDraftPath) {
      if (!(await confirmDialog(t('listings.edit.live_save_confirm')))) return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await updateListing(id, values);
      router.replace('/');
    } catch (e) {
      logWarn('[listings.edit.save_failed]', e);
      setSaveError(t('listings.form.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => router.replace(`/listings/${id}`);

  // Deactivate (approved → paused) / Reactivate (paused → approved).
  // 8h.4: deactivate target is now 'paused' (host-controlled pause),
  // not 'pending'. Reactivate gates strictly to status='paused' —
  // admin_disabled and pending listings can't be reactivated by the
  // host (admin_disabled needs admin Restore; pending awaits first
  // approval).
  const onToggleActive = async () => {
    if (togglingActive || saving || discarding) return;
    if (data.status === 'approved') {
      if (!(await confirmDialog(t('listings.edit.deactivate_confirm')))) return;
    }
    setToggleError(null);
    setTogglingActive(true);
    try {
      await setListingStatus(
        id,
        data.status === 'approved' ? 'paused' : 'approved',
      );
      await refetch();
    } catch (e) {
      logWarn('[listings.edit.toggle_failed]', e);
      setToggleError(
        t(
          data.status === 'approved'
            ? 'listings.edit.deactivate_failed'
            : 'listings.edit.reactivate_failed',
        ),
      );
    } finally {
      setTogglingActive(false);
    }
  };

  // Discard the pending edit. RLS DELETE policies on the draft
  // tables permit the host to do this directly. 8f replaces the
  // raw deletes with an atomic discard_listing_draft RPC.
  const onDiscardDraft = async () => {
    if (togglingActive || saving || discarding) return;
    if (!(await confirmDialog(t('listings.edit.discard_confirm')))) return;
    setDiscardError(null);
    setDiscarding(true);
    try {
      await discardListingDraft(id);
      await refetch();
    } catch (e) {
      logWarn('[listings.edit.discard_failed]', e);
      setDiscardError(t('listings.edit.discard_failed'));
    } finally {
      setDiscarding(false);
    }
  };

  const photoCount = data.photos.length;
  const coverPhoto = photoCount > 0 ? data.photos[0].photo_url : null;

  const photoCountLabel =
    photoCount === 0
      ? t('listings.edit.no_photos')
      : photoCount === 1
        ? t('listings.edit.photo_count_one')
        : t('listings.edit.photo_count', { count: String(photoCount) });

  // 2026-06-24 — live availability summary. The host needs to see
  // at a glance: (a) how many ranges they've blocked, (b) what the
  // next one is (so they remember "right, I blocked next week").
  // No blocked ranges → fall back to the prompt copy that explains
  // what this row does.
  const blockedCount = blockedRanges.length;
  const upcomingRange = blockedRanges.find(
    (r) => r.end_date >= new Date().toISOString().slice(0, 10),
  );
  const availabilityMetaLabel =
    blockedCount === 0
      ? t('listings.edit.manage_availability_meta')
      : blockedCount === 1
        ? upcomingRange
          ? t('listings.edit.availability_one_with_next', {
              start: upcomingRange.start_date,
              end: upcomingRange.end_date,
            })
          : t('listings.edit.availability_one')
        : upcomingRange
          ? t('listings.edit.availability_many_with_next', {
              count: String(blockedCount),
              start: upcomingRange.start_date,
              end: upcomingRange.end_date,
            })
          : t('listings.edit.availability_many', {
              count: String(blockedCount),
            });

  const busy = saving || togglingActive || discarding;

  // 2026-06-25 — Cancel handler with confirm dialog (Option B).
  // Photos and blocked dates are saved on their own sub-screens
  // and committed there — Cancel on /edit only reverts in-progress
  // changes to the listing's FORM fields, NOT photos or dates.
  // Without this dialog the user assumes Cancel undoes everything
  // (Airbnb-style edit session model), which our architecture
  // doesn't support today. Confirm dialog sets expectations.
  const onCancelWithConfirm = async () => {
    const hasSideStateThatPersists =
      data.photos.length > 0 || blockedRanges.length > 0;
    if (hasSideStateThatPersists) {
      const ok = await confirmDialog(t('listings.edit.cancel_confirm'));
      if (!ok) return;
    }
    onCancel();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={onCancelWithConfirm} style={styles.backLink}>
            <Text style={styles.backText}>{t('listings.edit.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('listings.edit.title')}</Text>
        </View>

        {/* 2026-06-25 — saved-state banner (Option B). Explicitly
            communicates that photos and blocked dates are NOT
            session-provisional — they're committed on their own
            sub-screens. Without this, hosts assume "Save / Cancel
            on this page covers everything" and either re-tap Save
            looking for confirmation OR tap Cancel hoping to undo
            a photo upload. Banner sets the model up front. */}
        <View style={styles.savedBanner}>
          <Text style={styles.savedBannerIcon}>✓</Text>
          <Text style={styles.savedBannerText}>
            {t('listings.edit.saved_banner', {
              photos: String(data.photos.length),
              periods: String(blockedRanges.length),
            })}
          </Text>
        </View>

        {/* Manage photos — sits above the form so it's reachable
            before scrolling through fields. Cover thumb + count +
            navigates to the existing photo-manager screen. */}
        <Pressable
          onPress={() => router.push(`/listings/${id}/photos`)}
          style={styles.photosLink}
          disabled={busy}
        >
          {coverPhoto ? (
            <Image
              source={{ uri: coverPhoto }}
              style={styles.photosThumb}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View style={[styles.photosThumb, styles.photosThumbPlaceholder]}>
              <Text style={styles.photosThumbPlaceholderText}>🏠</Text>
            </View>
          )}
          <View style={styles.photosLinkBody}>
            <Text style={styles.photosLinkTitle}>
              {t('listings.edit.manage_photos')}
            </Text>
            <Text style={styles.photosLinkMeta}>{photoCountLabel}</Text>
          </View>
          <Text style={styles.photosLinkChevron}>
            {locale === 'ar' ? '‹' : '›'}
          </Text>
        </Pressable>

        {/* Milestone B — Manage availability link. Same row pattern
            as the photos link above; routes to the availability
            screen where the host can add/remove blocked date ranges.
            Meta label is LIVE (2026-06-24) — shows the blocked-period
            count + the soonest upcoming range so the host can verify
            without navigating into the sub-page. */}
        <Pressable
          onPress={() => router.push(`/listings/${id}/availability`)}
          style={styles.photosLink}
          disabled={busy}
        >
          <View style={[styles.photosThumb, styles.photosThumbPlaceholder]}>
            <Text style={styles.photosThumbPlaceholderText}>📅</Text>
          </View>
          <View style={styles.photosLinkBody}>
            <Text style={styles.photosLinkTitle}>
              {t('listings.edit.manage_availability')}
            </Text>
            <Text style={styles.photosLinkMeta}>{availabilityMetaLabel}</Text>
          </View>
          <Text style={styles.photosLinkChevron}>
            {locale === 'ar' ? '‹' : '›'}
          </Text>
        </Pressable>

        <ListingForm
          initialValues={data.values}
          saving={saving}
          saveError={saveError}
          saveLabel={t('listings.edit.save_button')}
          savingLabel={t('listings.edit.saving')}
          cancelLabel={t('listings.form.cancel_button')}
          requireDirty
          onSave={onSave}
          onCancel={onCancelWithConfirm}
        />

        {/* Discard pending changes — only when a draft exists.
            Sits in its own block above the deactivate/reactivate
            row so a host scanning bottom-up sees the destructive
            actions grouped, with the most-context-sensitive one
            (Discard) first. */}
        {data.hasPendingEdit ? (
          <View style={styles.discardBlock}>
            {discardError ? (
              <Text style={styles.error}>{discardError}</Text>
            ) : null}
            <Button
              label={
                discarding
                  ? t('listings.edit.discarding')
                  : t('listings.edit.discard_draft')
              }
              onPress={onDiscardDraft}
              variant="destructive"
              loading={discarding}
              disabled={busy}
              fullWidth
            />
          </View>
        ) : null}

        {/* Deactivate / Reactivate — bottom of the screen so it's a
            deliberate action, not something a host can hit by accident
            while scanning the form. 8h.4 gating:
              - status='approved' → Deactivate (→ paused)
              - status='paused'   → Reactivate (→ approved)
              - status='pending' or 'admin_disabled' → render nothing
                (host has no toggle path; pending awaits admin
                approval, admin_disabled awaits admin Restore). */}
        {data.status === 'approved' || data.status === 'paused' ? (
          <View style={styles.statusBlock}>
            {toggleError ? (
              <Text style={styles.error}>{toggleError}</Text>
            ) : null}
            {data.status === 'approved' ? (
              <Button
                label={
                  togglingActive
                    ? t('listings.edit.deactivating')
                    : t('listings.edit.deactivate')
                }
                onPress={onToggleActive}
                variant="destructive"
                loading={togglingActive}
                disabled={busy}
                fullWidth
              />
            ) : (
              <Button
                label={
                  togglingActive
                    ? t('listings.edit.reactivating')
                    : t('listings.edit.reactivate')
                }
                onPress={onToggleActive}
                variant="secondary"
                loading={togglingActive}
                disabled={busy}
                fullWidth
              />
            )}
          </View>
        ) : null}
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
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backLink: { paddingVertical: spacing.xs },
  backText: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  photosLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  photosThumb: {
    width: 64,
    height: 48, // 4:3 ish thumb so the cover ratio reads even at small size
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  photosThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photosThumbPlaceholderText: {
    fontSize: 24,
    opacity: 0.5,
  },
  photosLinkBody: { flex: 1, gap: spacing.xs },
  photosLinkTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.mossDeep,
  },
  photosLinkMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  photosLinkChevron: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.inkSoft,
    marginLeft: spacing.sm,
  },
  // 2026-06-25 — saved-state banner above the sub-page links.
  // Soft tint that signals "everything below is already persisted"
  // — both photos and dates are saved on their own sub-screens.
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.whisper,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  savedBannerIcon: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.moss,
  },
  savedBannerText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  discardBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statusBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
  },
});

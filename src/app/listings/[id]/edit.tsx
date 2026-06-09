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
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { ListingForm, type ListingFormValues } from '@/components/ListingForm';
import { useAuth } from '@/lib/auth';
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
    const next = await getListingForEdit(id);
    setData(next);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    refetch()
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('[listings.edit.load_failed]', e);
        setLoadError(t('listings.edit.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refetch, t]);

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

  const confirm = (key: string): boolean => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(t(key));
    }
    // Native fallback matches the pet-delete / photo-delete pattern.
    return true;
  };

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
      if (!confirm('listings.edit.live_save_confirm')) return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await updateListing(id, values);
      router.replace('/');
    } catch (e) {
      console.warn('[listings.edit.save_failed]', e);
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
      if (!confirm('listings.edit.deactivate_confirm')) return;
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
      console.warn('[listings.edit.toggle_failed]', e);
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
    if (!confirm('listings.edit.discard_confirm')) return;
    setDiscardError(null);
    setDiscarding(true);
    try {
      await discardListingDraft(id);
      await refetch();
    } catch (e) {
      console.warn('[listings.edit.discard_failed]', e);
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

  const busy = saving || togglingActive || discarding;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.backLink}>
            <Text style={styles.backText}>{t('listings.edit.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('listings.edit.title')}</Text>
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

        <ListingForm
          initialValues={data.values}
          saving={saving}
          saveError={saveError}
          saveLabel={t('listings.edit.save_button')}
          savingLabel={t('listings.edit.saving')}
          cancelLabel={t('listings.form.cancel_button')}
          requireDirty
          onSave={onSave}
          onCancel={onCancel}
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

// Listing edit screen (Step 7.5). Host-only.
//
// Behaviour rules (settled 7.5 spec, do not re-litigate):
//   • Edits the WHOLE listing (all 10 form fields). Photos are reached
//     via a "Manage photos" link — managed on the existing
//     /listings/[id]/photos screen, NOT embedded.
//   • Editing a pending listing (status='pending') stays pending.
//   • Editing a LIVE listing (status='approved') → on save, set status
//     back to 'pending' (drops from the public feed until admin re-
//     approves). A confirm dialog gates the destructive flip first.
//   • Deactivate / Reactivate are direct host actions — no admin gate
//     yet (richer 4-state semantics land in 8d). Direct flip between
//     'approved' and 'pending', with a confirm for the destructive
//     direction only.

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
  getListingWithPhotos,
  updateListing,
  type ListingDetail,
} from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function EditListingScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The deactivate/reactivate flow is conceptually separate from the
  // main form save — disable both pathways while either is running so
  // a host can't fire deactivate mid-save (which would also race the
  // status='pending' flip).
  const [togglingActive, setTogglingActive] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    const data = await getListingWithPhotos(id);
    setListing(data);
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

  if (loadError || !listing) {
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
  // would reject any update from a non-host, but we don't even render
  // the form. Mirrors the photos-screen guard from 7.3b. Both the
  // not-found and not-yours branches show the same panel so URL
  // probing doesn't leak which listing IDs exist.
  if (listing.host_id !== user.id) {
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

  // ---- helpers (post-guard so we know the listing belongs to user) ----

  const confirm = (key: string): boolean => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(t(key));
    }
    // Native fallback matches the pet-delete / photo-delete pattern.
    return true;
  };

  // The form's submit. If the listing is currently live, gate behind
  // a confirm and include status='pending' in the patch (live→pending
  // flip). If pending, just save the fields.
  //
  // 8b note: behaviour is byte-equivalent to pre-8b. The proper
  // two-copy edit model (live edits create a draft instead of
  // flipping the live row back to pending) lands in 8d.
  const onSave = async (values: ListingFormValues) => {
    if (listing.status === 'approved') {
      if (!confirm('listings.edit.live_save_confirm')) return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await updateListing(id, {
        ...values,
        ...(listing.status === 'approved' ? { status: 'pending' } : {}),
      });
      router.replace('/');
    } catch (e) {
      console.warn('[listings.edit.save_failed]', e);
      setSaveError(t('listings.form.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => router.replace(`/listings/${id}`);

  const onToggleActive = async () => {
    if (togglingActive || saving) return;
    if (listing.status === 'approved') {
      if (!confirm('listings.edit.deactivate_confirm')) return;
    }
    setToggleError(null);
    setTogglingActive(true);
    try {
      // 8b: 2-state toggle preserved — approved ↔ pending. 8d
      // distinguishes host-pause ('paused') from "saving edits"
      // ('pending') and rewires this button accordingly.
      await updateListing(id, {
        status: listing.status === 'approved' ? 'pending' : 'approved',
      });
      await refetch();
    } catch (e) {
      console.warn('[listings.edit.toggle_failed]', e);
      setToggleError(
        t(
          listing.status === 'approved'
            ? 'listings.edit.deactivate_failed'
            : 'listings.edit.reactivate_failed',
        ),
      );
    } finally {
      setTogglingActive(false);
    }
  };

  // Prefill the form from the loaded listing. Text fields read _ar
  // (which is what createListing writes); display elsewhere falls
  // back via pickLocalized when _en is null.
  const initialValues = {
    city: listing.city as 'riyadh' | 'dammam',
    neighborhood: listing.neighborhood,
    title: listing.title_ar ?? '',
    description: listing.description_ar ?? '',
    nightlyPrice: listing.nightly_price_sar,
    maxConcurrentPets: listing.max_concurrent_pets,
    hasResidentPets: listing.has_resident_pets,
    residentPetsNote: listing.resident_pets_note,
    offersGrooming: listing.offers_grooming,
    hostGender: listing.host_gender as 'female' | 'male',
  };

  const photoCount = listing.photos.length;
  const coverPhoto = photoCount > 0 ? listing.photos[0].photo_url : null;

  const photoCountLabel =
    photoCount === 0
      ? t('listings.edit.no_photos')
      : photoCount === 1
        ? t('listings.edit.photo_count_one')
        : t('listings.edit.photo_count', { count: String(photoCount) });

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
          disabled={saving || togglingActive}
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
          initialValues={initialValues}
          saving={saving}
          saveError={saveError}
          saveLabel={t('listings.edit.save_button')}
          savingLabel={t('listings.edit.saving')}
          cancelLabel={t('listings.form.cancel_button')}
          onSave={onSave}
          onCancel={onCancel}
        />

        {/* Deactivate / Reactivate — bottom of the screen so it's a
            deliberate action, not something a host can hit by accident
            while scanning the form. Destructive variant for the
            deactivate direction, secondary for reactivate. */}
        <View style={styles.statusBlock}>
          {toggleError ? (
            <Text style={styles.error}>{toggleError}</Text>
          ) : null}
          {listing.status === 'approved' ? (
            <Button
              label={
                togglingActive
                  ? t('listings.edit.deactivating')
                  : t('listings.edit.deactivate')
              }
              onPress={onToggleActive}
              variant="destructive"
              loading={togglingActive}
              disabled={saving || togglingActive}
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
              disabled={saving || togglingActive}
              fullWidth
            />
          )}
        </View>
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
  statusBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
  },
});

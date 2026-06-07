// Host-only photo manager for a single listing (Step 7.3b).
//
// Two distinct states the host needs to understand at a glance:
//   • CURRENT — photos that exist on the server. Reorder / cover / remove
//     act immediately (server call + re-fetch). The first row is the cover.
//   • PENDING — photos picked from the device but not yet uploaded. These
//     only land on Save. Removing one drops it from local state with no
//     server work.
//
// Why two sections, not one merged list with a "saved/unsaved" badge:
// the operations are different (reorder/cover apply to saved photos via
// the RPC; pending photos have no row to point at), and bundling them
// would make the cover-picking story confusing — a host could "make
// cover" something that hasn't uploaded yet, then Save would have to
// retro-fit the order. Keeping them physically separate makes the model
// match the user's intuition.
//
// SCOPE: this screen only. The "Edit listing" CTA on the detail screen
// is still pointed at /, and HostHome shortcuts are unchanged — wiring
// is 7.3c.

import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n';
import { getListingWithPhotos } from '@/lib/listings';
import {
  LISTING_PHOTO_CAP,
  addListingPhoto,
  deleteListingPhoto,
  reorderListingPhotos,
  setCoverPhoto,
} from '@/lib/listing-photos';
import { pickPhotosMulti, type PetPhotoSource } from '@/lib/pets';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type SavedPhoto = { id: string; photo_url: string; sort_order: number };

// A pending source needs a stable client-side key for React lists and
// for the remove button to target. The picker returns no id; we mint
// one per pick.
type PendingPhoto = { key: string; source: PetPhotoSource; previewUri: string };

let pendingKeyCounter = 0;
const nextPendingKey = () => `pending-${++pendingKeyCounter}`;

function previewUriFor(source: PetPhotoSource): string {
  if (source.kind === 'web-file') {
    // Browser blob URL — lives as long as the page session. We don't
    // revoke on remove because the same source might be re-added; the
    // browser releases everything on navigation away.
    return URL.createObjectURL(source.file);
  }
  return source.uri;
}

export default function ListingPhotosScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  // Loaded shape: just what this screen needs. We don't keep the whole
  // listing detail object — only host_id (for the ownership guard) and
  // the photo rows.
  const [hostId, setHostId] = useState<string | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // currentOp blocks concurrent server ops on saved photos. We don't
  // gate per-button (which would let two reorders race); one op at a
  // time across reorder / make-cover / delete / save.
  const [currentOp, setCurrentOp] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    const data = await getListingWithPhotos(id);
    if (!data) {
      setHostId(null);
      setSavedPhotos([]);
      return;
    }
    setHostId(data.host_id);
    setSavedPhotos(
      data.photos.map((p) => ({
        id: p.id,
        photo_url: p.photo_url,
        sort_order: p.sort_order,
      })),
    );
  }, [id]);

  // Initial load.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    refetch()
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('[listings.photos.load_failed]', e);
        setLoadError(t('listings.photos.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refetch, t]);

  const isDirty = pending.length > 0;

  // Web-only beforeunload guard — mirrors the bookings screen's pattern.
  // On native, expo-router doesn't expose a sync block hook; we accept
  // the loss for now (same trade-off as the existing CR/daily-update
  // screens — flagged in CLAUDE.md follow-ups).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const confirmLeaveIfDirty = (): boolean => {
    if (!isDirty) return true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(t('listings.photos.leave_confirm'));
    }
    // Native fallback — same compromise the bookings screen makes.
    return true;
  };

  const goBack = () => {
    if (!confirmLeaveIfDirty()) return;
    // 7.5d: prefer history back so detail → edit → photos → back lands
    // on edit (the new sensible flow). For a host who deep-linked to
    // /photos directly there's no history, so fall back to '/'.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // ----- early returns -----

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('listings.photos.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || hostId === null) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {loadError ?? t('listings.photos.not_available')}
          </Text>
          <Button
            label={t('listings.photos.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // OWNERSHIP GUARD: hostId is now known; current user must match. We
  // do not redirect — we show an explicit not-available message with a
  // back button. A redirect would be jarring if a host accidentally
  // pasted the wrong id; the explicit copy explains what happened.
  // (Defense in depth — RLS would already reject any write the screen
  // attempted, but we don't want to render the management UI at all.)
  if (hostId !== user.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {t('listings.photos.not_available')}
          </Text>
          <Button
            label={t('listings.photos.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ----- helpers (post-guard so we know hostId === user.id) -----

  const remainingCap =
    LISTING_PHOTO_CAP - savedPhotos.length - pending.length;
  const atCap = remainingCap <= 0;

  const onAddPhotos = async () => {
    setActionError(null);
    if (atCap) return;
    try {
      const picked = await pickPhotosMulti();
      if (picked.length === 0) return;
      // Silent truncation when the multi-select would overflow the cap.
      // The cap_reached hint near the Add button explains the limit.
      const room = Math.max(0, remainingCap);
      const accepted = picked.slice(0, room);
      setPending((prev) => [
        ...prev,
        ...accepted.map((src) => ({
          key: nextPendingKey(),
          source: src,
          previewUri: previewUriFor(src),
        })),
      ]);
    } catch (e) {
      console.warn('[listings.photos.pick_failed]', e);
    }
  };

  const onRemovePending = (key: string) => {
    setPending((prev) => prev.filter((p) => p.key !== key));
  };

  const onMove = async (index: number, dir: -1 | 1) => {
    if (currentOp) return;
    const target = index + dir;
    if (target < 0 || target >= savedPhotos.length) return;
    setActionError(null);
    setCurrentOp('reorder');
    // Optimistic swap so the UI moves immediately; on failure we
    // re-fetch which restores the server's truth.
    const swapped = [...savedPhotos];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    setSavedPhotos(swapped);
    try {
      await reorderListingPhotos({
        listingId: id,
        orderedIds: swapped.map((p) => p.id),
      });
      await refetch();
    } catch (e) {
      console.warn('[listings.photos.reorder_failed]', e);
      setActionError(t('listings.photos.reorder_failed'));
      await refetch().catch(() => undefined);
    } finally {
      setCurrentOp(null);
    }
  };

  const onMakeCover = async (photoId: string) => {
    if (currentOp) return;
    setActionError(null);
    setCurrentOp('cover');
    try {
      await setCoverPhoto({ listingId: id, photoId });
      await refetch();
    } catch (e) {
      console.warn('[listings.photos.cover_failed]', e);
      setActionError(t('listings.photos.reorder_failed'));
    } finally {
      setCurrentOp(null);
    }
  };

  const confirm = (key: string): boolean => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(t(key));
    }
    // Native fallback matches the pet-delete pattern in pets/[id].tsx —
    // auto-accept for MVP, replaced by a native Alert.alert later.
    return true;
  };

  const onRemoveSaved = async (photo: SavedPhoto) => {
    if (currentOp) return;
    if (!confirm('listings.photos.remove_confirm')) return;
    setActionError(null);
    setCurrentOp('delete');
    try {
      await deleteListingPhoto({
        photoId: photo.id,
        listingId: id,
        photoUrl: photo.photo_url,
      });
      await refetch();
    } catch (e) {
      console.warn('[listings.photos.delete_failed]', e);
      setActionError(t('listings.photos.delete_failed'));
    } finally {
      setCurrentOp(null);
    }
  };

  const onSave = async () => {
    if (currentOp) return;
    if (pending.length === 0) return;
    setActionError(null);
    setCurrentOp('save');
    // Per-photo upload — we keep the successful ones, surface a top
    // error if any failed. Sequential (not Promise.all) so the
    // sort_order assignment in addListingPhoto stays predictable: each
    // upload reads the current max+1, and a parallel batch would race
    // on the unique constraint.
    const remainingFailures: PendingPhoto[] = [];
    let firstError: unknown = null;
    for (const p of pending) {
      try {
        await addListingPhoto({ listingId: id, source: p.source });
      } catch (e) {
        if (firstError === null) firstError = e;
        remainingFailures.push(p);
      }
    }
    setPending(remainingFailures);
    if (firstError) {
      console.warn('[listings.photos.save_failed]', firstError);
      setActionError(t('listings.photos.save_failed'));
    }
    try {
      await refetch();
    } catch {
      // refetch failure isn't actionable here — the next mount will
      // resync. Don't overwrite the upload error message.
    }
    setCurrentOp(null);
  };

  const busy = currentOp !== null;
  const photosEmpty = savedPhotos.length === 0 && pending.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backLink}>
            <Text style={styles.backText}>
              {t('listings.photos.back')}
            </Text>
          </Pressable>
          <Text style={styles.title}>{t('listings.photos.title')}</Text>
        </View>

        {actionError ? (
          <Text style={styles.error}>{actionError}</Text>
        ) : null}

        {/* CURRENT photos section. Each row: thumbnail + cover badge on
            the first + ↑↓ chevrons (disabled at boundaries) + Make
            cover (only on non-first) + remove. */}
        {savedPhotos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {t('listings.photos.current_label')}
            </Text>
            {savedPhotos.map((photo, idx) => {
              const isCover = idx === 0;
              const canMoveUp = idx > 0;
              const canMoveDown = idx < savedPhotos.length - 1;
              return (
                <View key={photo.id} style={styles.savedRow}>
                  <Image
                    source={{ uri: photo.photo_url }}
                    style={styles.thumb}
                    contentFit="cover"
                    transition={120}
                  />
                  <View style={styles.savedBody}>
                    {isCover ? (
                      <View style={styles.coverPill}>
                        <Text style={styles.coverPillText}>
                          {t('listings.photos.cover_label')}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.rowActions}>
                      <Pressable
                        onPress={() => onMove(idx, -1)}
                        disabled={!canMoveUp || busy}
                        style={[
                          styles.iconButton,
                          (!canMoveUp || busy) && styles.iconButtonDisabled,
                        ]}
                        accessibilityLabel={t('listings.photos.move_up')}
                      >
                        <Text style={styles.iconButtonText}>↑</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onMove(idx, 1)}
                        disabled={!canMoveDown || busy}
                        style={[
                          styles.iconButton,
                          (!canMoveDown || busy) && styles.iconButtonDisabled,
                        ]}
                        accessibilityLabel={t('listings.photos.move_down')}
                      >
                        <Text style={styles.iconButtonText}>↓</Text>
                      </Pressable>
                      {!isCover ? (
                        <Pressable
                          onPress={() => onMakeCover(photo.id)}
                          disabled={busy}
                          style={[
                            styles.linkButton,
                            busy && styles.iconButtonDisabled,
                          ]}
                        >
                          <Text style={styles.linkButtonText}>
                            {t('listings.photos.make_cover')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => onRemoveSaved(photo)}
                    disabled={busy}
                    style={[
                      styles.removeButton,
                      busy && styles.iconButtonDisabled,
                    ]}
                    accessibilityLabel={t('listings.photos.remove')}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* PENDING uploads — visually distinct (dashed border + paper
            background, plus the section heading) so the host knows
            these aren't saved yet. Grid mirrors CheckOutSection /
            DailyUpdates pending-grid. */}
        {pending.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {t('listings.photos.pending_label')}
            </Text>
            <View style={styles.pendingGrid}>
              {pending.map((p) => (
                <View key={p.key} style={styles.pendingItem}>
                  <Image
                    source={{ uri: p.previewUri }}
                    style={styles.pendingThumb}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={() => onRemovePending(p.key)}
                    disabled={busy}
                    style={[
                      styles.pendingRemove,
                      busy && styles.iconButtonDisabled,
                    ]}
                    accessibilityLabel={t('listings.photos.remove')}
                  >
                    <Text style={styles.pendingRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {photosEmpty ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>
              {t('listings.photos.empty')}
            </Text>
          </View>
        ) : null}

        {/* Cap hint sits with the Add button so the host can see
            "10/10" right where they'd reach for + Add. */}
        <View style={styles.addBlock}>
          <Button
            label={t('listings.photos.add')}
            onPress={onAddPhotos}
            variant="secondary"
            disabled={busy || atCap}
            fullWidth
          />
          {atCap ? (
            <Text style={styles.muted}>
              {t('listings.photos.cap_reached', {
                cap: String(LISTING_PHOTO_CAP),
              })}
            </Text>
          ) : null}
        </View>

        <Button
          label={
            currentOp === 'save'
              ? t('listings.photos.saving')
              : t('listings.photos.save')
          }
          onPress={onSave}
          variant="primary"
          loading={currentOp === 'save'}
          disabled={busy || pending.length === 0}
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const THUMB_SIZE = 64;
const PENDING_THUMB = 88;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    // backgroundColor intentionally omitted — themed AppShell wrapper
    // supplies it (cream/honey per persona).
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.lg,
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
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  // Saved-photo row — thumb, body (cover pill + actions), remove.
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.md,
    backgroundColor: colors.whisper,
  },
  savedBody: { flex: 1, gap: spacing.xs },
  coverPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  coverPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.moss,
    backgroundColor: colors.paper,
  },
  iconButtonDisabled: { opacity: 0.4 },
  iconButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.moss,
    lineHeight: 18,
  },
  linkButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  linkButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.moss,
    textDecorationLine: 'underline',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.terracotta,
    backgroundColor: colors.paper,
  },
  removeButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.terracotta,
    lineHeight: 22,
  },
  // Pending grid — visually distinct from saved rows (dashed border,
  // smaller). Mirrors the CR/daily-updates pending-grid pattern.
  pendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pendingItem: {
    width: PENDING_THUMB,
    height: PENDING_THUMB,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gold,
    overflow: 'hidden',
  },
  pendingThumb: { width: '100%', height: '100%' },
  pendingRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(31, 42, 29, 0.7)', // colors.ink @ 70%
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRemoveText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
    lineHeight: 16,
  },
  emptyBlock: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
  },
  addBlock: { gap: spacing.xs },
});

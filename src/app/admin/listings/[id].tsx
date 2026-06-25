import { logWarn } from '@/lib/log';
// Admin listing detail. 8h.1 reshape — unified review:
//
//   - new_listing AND pending_edit → SAME screen layout: a read-only
//     review panel + Approve / Reject buttons. Only the labels and
//     reviewed content differ:
//       * new_listing: panel shows the listing's own fields (the
//         live row, since there's no draft). Approve sets
//         status='approved'; Reject sets status='admin_disabled'.
//       * pending_edit: panel shows draft fields if a field draft
//         exists, else the live fields (a photo-only draft has no
//         field changes to display). Approve calls
//         promote_listing_draft RPC; Reject calls
//         discard_listing_draft (LIVE listing UNCHANGED).
//     Photos render from detail.photos which already routes to draft
//     when pending_edit + photo draft exists, else live.
//
//   - none (status approved/paused/admin_disabled with no drafts) →
//     editable form + Save. Admin can directly edit the live row.
//
//   Always visible when status applies:
//     - "Take offline" when status='approved'. Sets 'admin_disabled'.
//     - "Restore" when status='admin_disabled'. Sets 'approved'.

import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { PhotoGallery } from '@/components/PhotoGallery';
import {
  adminRestoreListing,
  adminTakeOffline,
  approveNewListing,
  getAdminListingReview,
  promoteListingDraft,
  rejectListingDraft,
  rejectNewListing,
  type AdminReviewDetail,
} from '@/lib/admin';
import { confirmDialog } from '@/lib/confirm';
import { formatSAR } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums } from '@/types/database';

const TIERS: Enums<'listing_tier'>[] = ['bronze', 'silver', 'gold'];
const GENDERS: Enums<'host_gender'>[] = ['female', 'male'];

export default function AdminListingDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Editable form state — only used in non-pending_edit modes.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [price, setPrice] = useState('');
  const [maxPets, setMaxPets] = useState('');
  const [residentNote, setResidentNote] = useState('');
  const [hasResidentPets, setHasResidentPets] = useState(false);
  const [offersGrooming, setOffersGrooming] = useState(false);
  const [tier, setTier] = useState<Enums<'listing_tier'>>('bronze');
  const [hostGender, setHostGender] =
    useState<Enums<'host_gender'>>('female');

  const hydrateForm = useCallback((d: AdminReviewDetail) => {
    const row = d.listing;
    setTitle(row.title_ar);
    setDescription(row.description_ar ?? '');
    setNeighborhood(row.neighborhood);
    setPrice(String(row.nightly_price_sar));
    setMaxPets(String(row.max_concurrent_pets));
    setResidentNote(row.resident_pets_note ?? '');
    setHasResidentPets(row.has_resident_pets);
    setOffersGrooming(row.offers_grooming);
    setTier(row.tier);
    setHostGender(row.host_gender);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getAdminListingReview(id);
      if (!d) {
        setDetail(null);
        return;
      }
      setDetail(d);
      hydrateForm(d);
    } catch (e) {
      logWarn('[admin.listing.load_failed]', e);
      setError(t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [id, t, hydrateForm]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const onSaveDirect = async () => {
    if (!supabase || !detail) return;
    setBusy('save');
    setError(null);
    try {
      const priceNum = Number(price);
      const maxPetsNum = Number(maxPets);
      if (!Number.isFinite(priceNum) || priceNum < 0)
        throw new Error('Invalid price');
      if (!Number.isInteger(maxPetsNum) || maxPetsNum < 1)
        throw new Error('Invalid max pets');

      const { error: e } = await supabase
        .from('listings')
        .update({
          title_ar: title.trim(),
          description_ar: description.trim() || null,
          neighborhood: neighborhood.trim(),
          nightly_price_sar: priceNum,
          max_concurrent_pets: maxPetsNum,
          has_resident_pets: hasResidentPets,
          resident_pets_note: residentNote.trim() || null,
          offers_grooming: offersGrooming,
          tier,
          host_gender: hostGender,
        })
        .eq('id', detail.listing.id);
      if (e) throw e;
      await load();
    } catch (e) {
      logWarn('[admin.listing.save_failed]', e);
      setError(t('admin.save_failed'));
    } finally {
      setBusy(null);
    }
  };

  // Context-aware approve. 8h.1: identical button shape for both
  // new_listing and pending_edit; the action and confirm copy branch
  // by reviewType.
  const onApprove = async () => {
    if (!detail) return;
    const isEdit = detail.reviewType === 'pending_edit';
    const confirmKey = isEdit
      ? 'admin.approve_edit_confirm'
      : 'admin.approve_new_confirm';
    if (!(await confirmDialog(t(confirmKey)))) return;

    // Stretch S1 (2026-06-13) — soft warn when the listing being
    // approved has < 3 photos. The empty 🏠 placeholder card on the
    // public feed makes a listing look abandoned; the founder wants
    // 3 photos as the minimum bar. Soft warn (admin can override),
    // not a hard block — some legitimate listings might have fewer
    // photos for a real reason (host's first listing, edge cases).
    const MIN_PHOTOS = 3;
    if (detail.photos.length < MIN_PHOTOS) {
      const confirmed = await confirmDialog(
        t('admin.few_photos_warning', {
          count: detail.photos.length,
          min: MIN_PHOTOS,
        }),
      );
      if (!confirmed) return;
    }

    setBusy('approve');
    setError(null);
    try {
      if (isEdit) {
        await promoteListingDraft(detail.listing.id);
      } else {
        await approveNewListing(detail.listing.id);
      }
      // 2026-06-25 — after a successful approve, return to the admin
      // home so the founder sees the queue counts update. Pre-fix
      // behavior re-fetched the same detail screen, which then
      // rendered the now-approved listing as an editable admin record
      // with a 'Save' button — confusing because the action they
      // wanted was 'approve and move on,' not 'edit further.'
      router.replace('/admin');
    } catch (e) {
      logWarn('[admin.listing.approve_failed]', e);
      setError(
        t(
          isEdit ? 'admin.approve_edit_failed' : 'admin.approve_new_failed',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  // Context-aware reject. CRITICAL CORRECTNESS POINT:
  //   - new_listing reject → setListingStatus('admin_disabled'). Nothing
  //     live to lose; the listing itself is what's being rejected.
  //   - pending_edit reject → discardListingDraft RPC. The DRAFT is
  //     discarded; the LIVE listing stays exactly where it was
  //     (approved/paused/admin_disabled). Reject MUST NOT take a live
  //     listing offline.
  const onReject = async () => {
    if (!detail) return;
    const isEdit = detail.reviewType === 'pending_edit';
    const confirmKey = isEdit
      ? 'admin.reject_edit_confirm'
      : 'admin.reject_new_confirm';
    if (!(await confirmDialog(t(confirmKey)))) return;
    setBusy('reject');
    setError(null);
    try {
      if (isEdit) {
        await rejectListingDraft(detail.listing.id);
      } else {
        await rejectNewListing(detail.listing.id);
      }
      await load();
    } catch (e) {
      logWarn('[admin.listing.reject_failed]', e);
      setError(
        t(
          isEdit ? 'admin.reject_edit_failed' : 'admin.reject_new_failed',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const onTakeOffline = async () => {
    if (!detail) return;
    if (!(await confirmDialog(t('admin.take_offline_confirm')))) return;
    setBusy('take_offline');
    setError(null);
    try {
      await adminTakeOffline(detail.listing.id);
      await load();
    } catch (e) {
      logWarn('[admin.listing.take_offline_failed]', e);
      setError(t('admin.take_offline_failed'));
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    if (!detail) return;
    setBusy('restore');
    setError(null);
    try {
      await adminRestoreListing(detail.listing.id);
      await load();
    } catch (e) {
      logWarn('[admin.listing.restore_failed]', e);
      setError(t('admin.restore_failed'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.error}>{t('admin.load_failed')}</Text>
          <Pressable
            onPress={() => router.replace('/admin/listings')}
            style={styles.backPill}
          >
            <Text style={styles.backPillText}>{t('admin.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { listing, reviewType, draftFields, photos, hasFieldDraft, hasPhotoDraft } =
    detail;
  const hostUnverified = listing.host && !listing.host.is_verified;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace('/admin/listings')}
            style={styles.backLink}
          >
            <Text style={styles.backText}>{t('admin.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('admin.listing_detail_title')}</Text>
        </View>

        {hostUnverified ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              {t('admin.listing_warning_unverified_host')}
            </Text>
          </View>
        ) : null}

        <PhotoGallery photos={photos} height={220} />

        <View style={styles.bodyPad}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Status pill — what state the listing is currently in. */}
          <View style={styles.statusCard}>
            <View style={styles.statusLeft}>
              <Text style={styles.statusLabel}>
                {t('admin.listing_status_label')}
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  {
                    color:
                      listing.status === 'approved'
                        ? colors.moss
                        : listing.status === 'admin_disabled'
                          ? colors.terracotta
                          : colors.gold,
                  },
                ]}
              >
                {t(`admin.status_${listing.status}`)}
              </Text>
            </View>
          </View>

          {/* Host info */}
          <View style={styles.metaCard}>
            <Text style={styles.metaLine}>
              {t('admin.listing_host_label')}:{' '}
              {listing.host?.full_name ?? '—'}
              {listing.host?.is_verified ? '  ✓' : '  ✗ غير موثّق'}
            </Text>
          </View>

          {/* === Branch by review type ===
              - new_listing / pending_edit → ReviewPanel + Approve/Reject.
              - none → EditableForm + Save (direct admin edit). */}

          {reviewType === 'new_listing' || reviewType === 'pending_edit' ? (
            <ReviewPanel
              reviewType={reviewType}
              listing={detail.listing}
              draftFields={draftFields}
              hasFieldDraft={hasFieldDraft}
              hasPhotoDraft={hasPhotoDraft}
              busy={busy}
              onApprove={onApprove}
              onReject={onReject}
            />
          ) : (
            <>
              <EditableForm
                title={title}
                setTitle={setTitle}
                description={description}
                setDescription={setDescription}
                neighborhood={neighborhood}
                setNeighborhood={setNeighborhood}
                price={price}
                setPrice={setPrice}
                maxPets={maxPets}
                setMaxPets={setMaxPets}
                residentNote={residentNote}
                setResidentNote={setResidentNote}
                hasResidentPets={hasResidentPets}
                setHasResidentPets={setHasResidentPets}
                offersGrooming={offersGrooming}
                setOffersGrooming={setOffersGrooming}
                tier={tier}
                setTier={setTier}
                hostGender={hostGender}
                setHostGender={setHostGender}
              />
              <View style={styles.actionGap}>
                <Button
                  label={busy === 'save' ? t('admin.saving') : t('admin.save')}
                  onPress={onSaveDirect}
                  disabled={busy !== null}
                  loading={busy === 'save'}
                  variant="primary"
                  fullWidth
                />
              </View>
            </>
          )}

          {/* Override actions — Take offline / Restore. */}
          {listing.status === 'approved' ? (
            <View style={styles.actionGap}>
              <Button
                label={
                  busy === 'take_offline'
                    ? t('admin.take_offline_in_flight')
                    : t('admin.take_offline')
                }
                onPress={onTakeOffline}
                disabled={busy !== null}
                loading={busy === 'take_offline'}
                variant="destructive"
                fullWidth
              />
            </View>
          ) : null}

          {listing.status === 'admin_disabled' ? (
            <View style={styles.actionGap}>
              <Button
                label={
                  busy === 'restore' ? t('admin.restoring') : t('admin.restore')
                }
                onPress={onRestore}
                disabled={busy !== null}
                loading={busy === 'restore'}
                variant="primary"
                fullWidth
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReviewPanel({
  reviewType,
  listing,
  draftFields,
  hasFieldDraft,
  hasPhotoDraft,
  busy,
  onApprove,
  onReject,
}: {
  reviewType: 'new_listing' | 'pending_edit';
  listing: AdminReviewDetail['listing'];
  draftFields: AdminReviewDetail['draftFields'];
  hasFieldDraft: boolean;
  hasPhotoDraft: boolean;
  busy: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = reviewType === 'pending_edit';

  // What to display:
  //   - new_listing: show the listing's OWN fields (the live row).
  //   - pending_edit with field draft: show the DRAFT fields.
  //   - pending_edit with only photo draft: show live fields (no
  //     field changes to display, but admin still sees the rest of
  //     the listing for context).
  const showFields =
    !isEdit || hasFieldDraft || !hasPhotoDraft; // show fields unless photo-only edit
  const useDraft = isEdit && hasFieldDraft && draftFields !== null;
  const fieldsSrc = useDraft && draftFields
    ? {
        title_ar: draftFields.title_ar,
        description_ar: draftFields.description_ar,
        city: draftFields.city,
        neighborhood: draftFields.neighborhood,
        nightly_price_sar: draftFields.nightly_price_sar,
        max_concurrent_pets: draftFields.max_concurrent_pets,
        has_resident_pets: draftFields.has_resident_pets,
        resident_pets_note: draftFields.resident_pets_note,
        offers_grooming: draftFields.offers_grooming,
        host_gender: draftFields.host_gender,
      }
    : {
        title_ar: listing.title_ar,
        description_ar: listing.description_ar,
        city: listing.city,
        neighborhood: listing.neighborhood,
        nightly_price_sar: listing.nightly_price_sar,
        max_concurrent_pets: listing.max_concurrent_pets,
        has_resident_pets: listing.has_resident_pets,
        resident_pets_note: listing.resident_pets_note,
        offers_grooming: listing.offers_grooming,
        host_gender: listing.host_gender,
      };

  const title = isEdit
    ? t('admin.review_panel_title_edit')
    : t('admin.review_panel_title_new');

  const meta = isEdit
    ? hasFieldDraft && hasPhotoDraft
      ? t('admin.pending_edit_both')
      : hasFieldDraft
        ? t('admin.pending_edit_fields_only')
        : t('admin.pending_edit_photos_only')
    : t('admin.review_panel_meta_new');

  return (
    <View style={styles.draftPanel}>
      <Text style={styles.draftPanelTitle}>{title}</Text>
      <Text style={styles.draftPanelMeta}>{meta}</Text>

      {showFields ? (
        <View style={styles.draftFields}>
          <DraftRow
            label={t('admin.draft_field_title')}
            value={fieldsSrc.title_ar}
          />
          <DraftRow
            label={t('admin.draft_field_description')}
            value={fieldsSrc.description_ar ?? '—'}
          />
          <DraftRow
            label={t('admin.draft_field_city')}
            value={fieldsSrc.city}
          />
          <DraftRow
            label={t('admin.draft_field_neighborhood')}
            value={fieldsSrc.neighborhood}
          />
          <DraftRow
            label={t('admin.draft_field_price')}
            value={formatSAR(fieldsSrc.nightly_price_sar)}
          />
          <DraftRow
            label={t('admin.draft_field_max_cats')}
            value={String(fieldsSrc.max_concurrent_pets)}
          />
          <DraftRow
            label={t('admin.draft_field_has_resident_pets')}
            value={fieldsSrc.has_resident_pets ? '✓' : '✗'}
          />
          {fieldsSrc.has_resident_pets && fieldsSrc.resident_pets_note ? (
            <DraftRow
              label={t('admin.draft_field_resident_note')}
              value={fieldsSrc.resident_pets_note}
            />
          ) : null}
          <DraftRow
            label={t('admin.draft_field_offers_grooming')}
            value={fieldsSrc.offers_grooming ? '✓' : '✗'}
          />
          <DraftRow
            label={t('admin.draft_field_host_gender')}
            value={fieldsSrc.host_gender}
          />
        </View>
      ) : null}

      <View style={styles.actionGap}>
        <Button
          label={
            busy === 'approve'
              ? t('admin.approving')
              : t(isEdit ? 'admin.approve_edit' : 'admin.approve_new')
          }
          onPress={onApprove}
          disabled={busy !== null}
          loading={busy === 'approve'}
          variant="primary"
          fullWidth
        />
      </View>
      <View style={styles.actionGap}>
        <Button
          label={
            busy === 'reject'
              ? t('admin.rejecting')
              : t(isEdit ? 'admin.reject_edit' : 'admin.reject_new')
          }
          onPress={onReject}
          disabled={busy !== null}
          loading={busy === 'reject'}
          variant="destructive"
          fullWidth
        />
      </View>
    </View>
  );
}

function DraftRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.draftRow}>
      <Text style={styles.draftRowLabel}>{label}</Text>
      <Text style={styles.draftRowValue}>{value}</Text>
    </View>
  );
}

function EditableForm(props: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  neighborhood: string;
  setNeighborhood: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  maxPets: string;
  setMaxPets: (v: string) => void;
  residentNote: string;
  setResidentNote: (v: string) => void;
  hasResidentPets: boolean;
  setHasResidentPets: (v: boolean | ((p: boolean) => boolean)) => void;
  offersGrooming: boolean;
  setOffersGrooming: (v: boolean | ((p: boolean) => boolean)) => void;
  tier: Enums<'listing_tier'>;
  setTier: (v: Enums<'listing_tier'>) => void;
  hostGender: Enums<'host_gender'>;
  setHostGender: (v: Enums<'host_gender'>) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Section label="العنوان">
        <TextInput
          value={props.title}
          onChangeText={props.setTitle}
          style={styles.input}
        />
      </Section>

      <Section label="الوصف">
        <TextInput
          value={props.description}
          onChangeText={props.setDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
      </Section>

      <Section label="الحي">
        <TextInput
          value={props.neighborhood}
          onChangeText={props.setNeighborhood}
          style={styles.input}
        />
      </Section>

      <View style={styles.row2}>
        <Section label={`السعر / ليلة (${formatSAR(Number(props.price || 0))})`}>
          <TextInput
            value={props.price}
            onChangeText={props.setPrice}
            inputMode="numeric"
            style={styles.input}
          />
        </Section>
        <Section label="حد القطط">
          <TextInput
            value={props.maxPets}
            onChangeText={props.setMaxPets}
            inputMode="numeric"
            style={styles.input}
          />
        </Section>
      </View>

      <Section label="المستوى (Tier)">
        <View style={styles.chipRow}>
          {TIERS.map((tk) => (
            <Pressable
              key={tk}
              onPress={() => props.setTier(tk)}
              style={[styles.chip, props.tier === tk && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  props.tier === tk && styles.chipTextActive,
                ]}
              >
                {t(`listing.tier_${tk}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section label="جنس المضيف">
        <View style={styles.chipRow}>
          {GENDERS.map((g) => (
            <Pressable
              key={g}
              onPress={() => props.setHostGender(g)}
              style={[styles.chip, props.hostGender === g && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  props.hostGender === g && styles.chipTextActive,
                ]}
              >
                {t(g === 'female' ? 'listing.host_female' : 'listing.host_male')}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Pressable
        onPress={() => props.setHasResidentPets((v) => !v)}
        style={[
          styles.toggleRow,
          props.hasResidentPets && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {props.hasResidentPets ? '✓' : '○'} يوجد حيوانات مقيمة
        </Text>
      </Pressable>

      {props.hasResidentPets ? (
        <Section label="ملاحظة عن الحيوانات المقيمة">
          <TextInput
            value={props.residentNote}
            onChangeText={props.setResidentNote}
            style={styles.input}
          />
        </Section>
      ) : null}

      <Pressable
        onPress={() => props.setOffersGrooming((v) => !v)}
        style={[
          styles.toggleRow,
          props.offersGrooming && styles.toggleRowActive,
        ]}
      >
        <Text style={styles.toggleText}>
          {props.offersGrooming ? '✓' : '○'} خدمة الاستحمام
        </Text>
      </Pressable>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backLink: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 22,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  warningBanner: {
    backgroundColor: colors.whisper,
    borderColor: colors.terracotta,
    borderWidth: 1,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  warningText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'right',
  },
  bodyPad: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  statusLeft: {
    gap: 2,
  },
  statusLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  statusValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
  },
  metaCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  metaLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row2: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  chipActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  toggleRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  toggleRowActive: {
    borderColor: colors.moss,
    backgroundColor: colors.whisper,
  },
  toggleText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
  },
  actionGap: {
    marginTop: spacing.lg,
  },
  backPill: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.inkSoft,
  },
  backPillText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  draftPanel: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold,
    ...shadows.card,
  },
  draftPanelTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.mossDeep,
    textAlign: 'right',
  },
  draftPanelMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  draftFields: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.whisper,
  },
  draftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  draftRowLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'right',
    minWidth: 120,
  },
  draftRowValue: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
  },
});

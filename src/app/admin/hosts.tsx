// Host applications review queue (0039).
//
// Replaced the prior "pending hosts" view, which gated on
// is_verified=false alone. Under 0039 every host signup goes through
// an explicit application step with structured fields (gender, city,
// neighborhood, pet type, experience years). The queue now shows
// those fields so the admin (founder, manually vetting each one) can
// make a real decision before approving.
//
// Approve flips host_application_status='approved' AND is_verified=
// true so listings RLS unblocks the user once their post-approval
// profile completion is done.
//
// Reject takes a required notes string so the applicant sees a
// reason on their profile status panel.

import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { findCity, findDistrict, type CityKey } from '@/lib/cities';
import {
  approveHostApplication,
  listPendingHostApplications,
  rejectHostApplication,
  type HostApplicationRow,
} from '@/lib/host-application';
import { useTranslation } from '@/lib/i18n';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

export default function HostApplicationsQueueScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user: adminUser } = useAuth();

  const [items, setItems] = useState<HostApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<HostApplicationRow | null>(
    null,
  );
  const [rejectNotes, setRejectNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listPendingHostApplications());
    } catch (e) {
      logWarn('[admin.applications.load_failed]', e);
      setError(t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onApprove = async (applicant: HostApplicationRow) => {
    if (!adminUser) return;
    setBusyId(applicant.id);
    setError(null);
    try {
      await approveHostApplication(applicant.id, adminUser.id);
      setItems((prev) => prev.filter((u) => u.id !== applicant.id));
    } catch (e) {
      logWarn('[admin.applications.approve_failed]', e);
      setError(t('admin.save_failed'));
    } finally {
      setBusyId(null);
    }
  };

  const onSubmitReject = async () => {
    if (!adminUser || !rejectTarget || rejectNotes.trim().length === 0) return;
    setBusyId(rejectTarget.id);
    setError(null);
    try {
      await rejectHostApplication(rejectTarget.id, adminUser.id, rejectNotes);
      setItems((prev) => prev.filter((u) => u.id !== rejectTarget.id));
      setRejectTarget(null);
      setRejectNotes('');
    } catch (e) {
      logWarn('[admin.applications.reject_failed]', e);
      setError(t('admin.save_failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/admin')}
          style={styles.backLink}
        >
          <Text style={styles.backText}>{t('admin.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.applications_title')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.loading')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('admin.applications_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ApplicationCard
              item={item}
              locale={locale}
              t={t}
              busy={busyId === item.id}
              onApprove={() => onApprove(item)}
              onReject={() => {
                setRejectTarget(item);
                setRejectNotes('');
              }}
            />
          )}
        />
      )}

      <Modal
        visible={!!rejectTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setRejectTarget(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRejectTarget(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {t('admin.applications_reject_modal_title')}
            </Text>
            <Text style={styles.modalBody}>
              {t('admin.applications_reject_modal_body')}
            </Text>
            <TextInput
              value={rejectNotes}
              onChangeText={setRejectNotes}
              placeholder={t('admin.applications_reject_notes_placeholder')}
              placeholderTextColor={colors.inkSoft}
              multiline
              numberOfLines={4}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRejectTarget(null)}
                style={[styles.modalButton, styles.modalCancel]}
              >
                <Text style={styles.modalCancelText}>
                  {t('admin.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={onSubmitReject}
                disabled={rejectNotes.trim().length === 0 || !!busyId}
                style={[
                  styles.modalButton,
                  styles.modalReject,
                  (rejectNotes.trim().length === 0 || !!busyId) &&
                    styles.modalRejectDisabled,
                ]}
              >
                <Text style={styles.modalRejectText}>
                  {busyId
                    ? t('admin.saving')
                    : t('admin.applications_reject_confirm')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ApplicationCard({
  item,
  locale,
  t,
  busy,
  onApprove,
  onReject,
}: {
  item: HostApplicationRow;
  locale: 'ar' | 'en';
  t: (key: string, params?: Record<string, string | number>) => string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const cityObj = item.host_city ? findCity(item.host_city) : null;
  const districtObj =
    cityObj && item.host_neighborhood
      ? findDistrict(cityObj.key as CityKey, item.host_neighborhood)
      : null;
  const cityLabel = cityObj
    ? locale === 'ar'
      ? cityObj.name_ar
      : cityObj.name_en
    : item.host_city ?? '—';
  const districtLabel = districtObj
    ? locale === 'ar'
      ? districtObj.name_ar
      : districtObj.name_en
    : item.host_neighborhood ?? '—';

  const genderLabel = item.host_gender
    ? t(`host_application.gender_${item.host_gender}`)
    : '—';
  const petLabel = item.host_pet_type_accepted
    ? t(`host_application.pet_type_${item.host_pet_type_accepted}`)
    : '—';
  const experienceLabel =
    item.host_experience_years === null
      ? t('admin.applications_experience_none')
      : t('admin.applications_experience_years', {
          years: item.host_experience_years,
        });

  const submittedDate = item.host_application_submitted_at
    ? item.host_application_submitted_at.slice(0, 10)
    : '—';

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowName}>{item.full_name || '—'}</Text>
        <Text style={styles.rowMeta}>{submittedDate}</Text>
      </View>

      <View style={styles.detailRow}>
        <DetailItem
          label={t('admin.applications_gender_label')}
          value={genderLabel}
        />
        <DetailItem
          label={t('admin.applications_city_label')}
          value={`${cityLabel} · ${districtLabel}`}
        />
      </View>

      <View style={styles.detailRow}>
        <DetailItem
          label={t('admin.applications_pet_type_label')}
          value={petLabel}
        />
        <DetailItem
          label={t('admin.applications_experience_label')}
          value={experienceLabel}
        />
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onReject}
          disabled={busy}
          style={[styles.actionButton, styles.rejectButton, busy && styles.busy]}
        >
          <Text style={[styles.actionButtonText, styles.rejectButtonText]}>
            {t('admin.applications_reject_button')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onApprove}
          disabled={busy}
          style={[
            styles.actionButton,
            styles.approveButton,
            busy && styles.busy,
          ]}
        >
          <Text style={[styles.actionButtonText, styles.approveButtonText]}>
            {busy ? t('admin.saving') : t('admin.applications_approve_button')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backLink: { paddingVertical: spacing.xs },
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
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  row: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  rowName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  detailItem: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
  },
  detailValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: colors.mossDeep,
  },
  approveButtonText: {
    color: colors.cream,
  },
  rejectButton: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  rejectButtonText: {
    color: colors.terracotta,
  },
  actionButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  busy: { opacity: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,42,29,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    color: colors.mossDeep,
  },
  modalBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
  },
  modalInput: {
    backgroundColor: colors.cream,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: colors.whisper,
  },
  modalCancelText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  modalReject: {
    backgroundColor: colors.terracotta,
  },
  modalRejectDisabled: { opacity: 0.4 },
  modalRejectText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.cream,
  },
});

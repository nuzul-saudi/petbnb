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

import { PhotoGallery } from '@/components/PhotoGallery';
import { setListingActive } from '@/lib/admin';
import { formatSAR } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import type { Enums, Tables } from '@/types/database';

type ListingRow = Tables<'listings'>;
type HostInfo = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'is_verified' | 'is_suspended'
>;
type PhotoRow = Pick<Tables<'listing_photos'>, 'id' | 'photo_url' | 'sort_order'>;

const TIERS: Enums<'listing_tier'>[] = ['bronze', 'silver', 'gold'];
const GENDERS: Enums<'host_gender'>[] = ['female', 'male'];

export default function AdminListingDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [listing, setListing] = useState<ListingRow | null>(null);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  // Editable form state — initialized from the loaded listing.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [price, setPrice] = useState('');
  const [maxPets, setMaxPets] = useState('');
  const [residentNote, setResidentNote] = useState('');
  const [hasResidentPets, setHasResidentPets] = useState(false);
  const [offersGrooming, setOffersGrooming] = useState(false);
  const [tier, setTier] = useState<Enums<'listing_tier'>>('bronze');
  const [hostGender, setHostGender] = useState<Enums<'host_gender'>>('female');

  const hydrateForm = (row: ListingRow) => {
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
  };

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('listings')
        .select(
          `
          *,
          host:profiles(id, full_name, is_verified, is_suspended),
          listing_photos(id, photo_url, sort_order)
        `,
        )
        .eq('id', id)
        .maybeSingle();
      if (e) throw e;
      if (!data) {
        setListing(null);
        return;
      }
      const { listing_photos: lp, host: h, ...rest } = data as typeof data & {
        listing_photos?: PhotoRow[];
        host?: HostInfo;
      };
      const row = rest as ListingRow;
      setListing(row);
      setHost(h ?? null);
      setPhotos(((lp ?? []) as PhotoRow[]).sort((a, b) => a.sort_order - b.sort_order));
      hydrateForm(row);
    } catch (e) {
      console.warn('[admin.listing.load_failed]', e);
      setError(t('admin.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const onSave = async () => {
    if (!supabase || !listing) return;
    setSaving(true);
    setError(null);
    try {
      const priceNum = Number(price);
      const maxPetsNum = Number(maxPets);
      if (!Number.isFinite(priceNum) || priceNum < 0) throw new Error('Invalid price');
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
        .eq('id', listing.id);
      if (e) throw e;
      await load();
    } catch (e) {
      console.warn('[admin.listing.save_failed]', e);
      setError(t('admin.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async () => {
    if (!listing) return;
    setTogglingActive(true);
    setError(null);
    try {
      await setListingActive(listing.id, !listing.is_active);
      await load();
    } catch (e) {
      console.warn('[admin.listing.toggle_active_failed]', e);
      setError(t('admin.save_failed'));
    } finally {
      setTogglingActive(false);
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

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.error}>{t('admin.load_failed')}</Text>
          <Pressable onPress={() => router.back()} style={styles.backPill}>
            <Text style={styles.backPillText}>{t('admin.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const hostUnverified = host && !host.is_verified;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
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

          {/* Activate / deactivate (primary action) */}
          <View style={styles.statusCard}>
            <View style={styles.statusLeft}>
              <Text style={styles.statusLabel}>
                {t('admin.listing_status_label')}
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: listing.is_active ? colors.moss : colors.gold },
                ]}
              >
                {t(
                  listing.is_active
                    ? 'admin.listing_status_active'
                    : 'admin.listing_status_inactive',
                )}
              </Text>
            </View>
            <Pressable
              onPress={onToggleActive}
              disabled={togglingActive}
              style={[
                listing.is_active ? styles.dangerButton : styles.primaryButton,
                togglingActive && styles.buttonDisabled,
              ]}
            >
              <Text
                style={
                  listing.is_active
                    ? styles.dangerButtonText
                    : styles.primaryButtonText
                }
              >
                {togglingActive
                  ? t('admin.saving')
                  : listing.is_active
                    ? t('admin.listing_deactivate')
                    : t('admin.listing_approve')}
              </Text>
            </Pressable>
          </View>

          {/* Host info */}
          <View style={styles.metaCard}>
            <Text style={styles.metaLine}>
              {t('admin.listing_host_label')}: {host?.full_name ?? '—'}
              {host?.is_verified ? '  ✓' : '  ✗ غير موثّق'}
            </Text>
          </View>

          {/* Editable fields */}
          <Section label="العنوان">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} />
          </Section>

          <Section label="الوصف">
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              style={[styles.input, styles.multiline]}
            />
          </Section>

          <Section label="الحي">
            <TextInput
              value={neighborhood}
              onChangeText={setNeighborhood}
              style={styles.input}
            />
          </Section>

          <View style={styles.row2}>
            <Section label={`السعر / ليلة (${formatSAR(Number(price || 0))})`}>
              <TextInput
                value={price}
                onChangeText={setPrice}
                inputMode="numeric"
                style={styles.input}
              />
            </Section>
            <Section label="حد القطط">
              <TextInput
                value={maxPets}
                onChangeText={setMaxPets}
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
                  onPress={() => setTier(tk)}
                  style={[styles.chip, tier === tk && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      tier === tk && styles.chipTextActive,
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
                  onPress={() => setHostGender(g)}
                  style={[styles.chip, hostGender === g && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      hostGender === g && styles.chipTextActive,
                    ]}
                  >
                    {t(g === 'female' ? 'listing.host_female' : 'listing.host_male')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Pressable
            onPress={() => setHasResidentPets((v) => !v)}
            style={[styles.toggleRow, hasResidentPets && styles.toggleRowActive]}
          >
            <Text style={styles.toggleText}>
              {hasResidentPets ? '✓' : '○'} يوجد حيوانات مقيمة
            </Text>
          </Pressable>

          {hasResidentPets ? (
            <Section label="ملاحظة عن الحيوانات المقيمة">
              <TextInput
                value={residentNote}
                onChangeText={setResidentNote}
                style={styles.input}
              />
            </Section>
          ) : null}

          <Pressable
            onPress={() => setOffersGrooming((v) => !v)}
            style={[styles.toggleRow, offersGrooming && styles.toggleRowActive]}
          >
            <Text style={styles.toggleText}>
              {offersGrooming ? '✓' : '○'} خدمة الاستحمام
            </Text>
          </Pressable>

          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[styles.saveButton, saving && styles.buttonDisabled]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? t('admin.saving') : t('admin.save')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  primaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.moss,
    borderRadius: radii.pill,
  },
  primaryButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
  },
  dangerButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.terracotta,
    borderRadius: radii.pill,
  },
  dangerButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.cream,
  },
  saveButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.moss,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.cream,
  },
  buttonDisabled: {
    opacity: 0.5,
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
});

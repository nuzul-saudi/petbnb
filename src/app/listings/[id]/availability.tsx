// Milestone B — Host availability manager.
//
// Host-only screen at /listings/[id]/availability. Lists existing
// blocked date ranges and lets the host add or remove them. Pairs
// with the booking-request screen which warns owners when their
// proposed dates fall inside any of these blocks (the DB-level
// trigger in 0027 is the hard gate).
//
// Pattern: same skeleton as /listings/[id]/photos (host ownership
// guard via getListingForEdit, AppHeader + ScrollView, Button-driven
// CTAs).

import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import {
  addBlockedRange,
  listBlockedRanges,
  removeBlockedRange,
  type BlockedRange,
} from '@/lib/availability';
import { useAuth } from '@/lib/auth';
import { confirmDialog } from '@/lib/confirm';
import { todayIso } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { getListingForEdit } from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

// ISO-date 'YYYY-MM-DD' arithmetic: one day after the given ISO date.
// Mirrors the helper in /listings/[id]/request.tsx so the two date
// surfaces use the same min-date language.
function nextDayIso(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ListingAvailabilityScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [hostId, setHostId] = useState<string | null>(null);
  const [ranges, setRanges] = useState<BlockedRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    const [data, blocks] = await Promise.all([
      getListingForEdit(id),
      listBlockedRanges(id),
    ]);
    setHostId(data?.hostId ?? null);
    setRanges(blocks);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    refetch()
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('[availability.load_failed]', e);
        setLoadError(t('listings.availability.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refetch, t]);

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('listings.availability.loading')}</Text>
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
            {loadError ?? t('listings.availability.not_available')}
          </Text>
          <Button
            label={t('listings.availability.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (hostId !== user.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {t('listings.availability.not_available')}
          </Text>
          <Button
            label={t('listings.availability.back')}
            onPress={() => router.replace('/')}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  const onAdd = async () => {
    setAddError(null);
    const s = newStart.trim();
    const e = newEnd.trim();
    if (!s || !e) {
      setAddError(t('listings.availability.add_invalid'));
      return;
    }
    if (s >= e) {
      setAddError(t('listings.availability.add_end_after_start'));
      return;
    }
    setAdding(true);
    try {
      await addBlockedRange({ listingId: id, startDate: s, endDate: e });
      setNewStart('');
      setNewEnd('');
      await refetch();
    } catch (err) {
      console.warn('[availability.add_failed]', err);
      setAddError(t('listings.availability.add_failed'));
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (rangeId: string) => {
    if (busyDelete) return;
    if (!(await confirmDialog(t('listings.availability.remove_confirm')))) return;
    setBusyDelete(rangeId);
    try {
      await removeBlockedRange(rangeId);
      await refetch();
    } catch (err) {
      console.warn('[availability.remove_failed]', err);
    } finally {
      setBusyDelete(null);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backLink}>
            <Text style={styles.backText}>
              {t('listings.availability.back')}
            </Text>
          </Pressable>
          <Text style={styles.title}>
            {t('listings.availability.title')}
          </Text>
        </View>

        <Text style={styles.body}>{t('listings.availability.body')}</Text>

        {/* Add new range */}
        <View style={styles.addBlock}>
          <Text style={styles.sectionLabel}>
            {t('listings.availability.add_section')}
          </Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>
                {t('listings.availability.start_label')}
              </Text>
              <DateField
                value={newStart}
                onChange={(v) => {
                  setNewStart(v);
                  // Same behavior as request.tsx — if the new start
                  // invalidates an already-picked end, clear it.
                  if (newEnd && newEnd <= v) setNewEnd('');
                }}
                min={todayIso()}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>
                {t('listings.availability.end_label')}
              </Text>
              <DateField
                value={newEnd}
                onChange={setNewEnd}
                min={newStart ? nextDayIso(newStart) : todayIso()}
              />
            </View>
          </View>
          {addError ? <Text style={styles.error}>{addError}</Text> : null}
          <Button
            label={
              adding
                ? t('listings.availability.adding')
                : t('listings.availability.add_button')
            }
            onPress={onAdd}
            variant="primary"
            loading={adding}
            disabled={adding}
            fullWidth
          />
        </View>

        {/* Existing ranges */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {t('listings.availability.list_section')}
          </Text>
          {ranges.length === 0 ? (
            <Text style={styles.muted}>
              {t('listings.availability.empty')}
            </Text>
          ) : (
            ranges.map((r) => (
              <View key={r.id} style={styles.rangeRow}>
                <View style={styles.rangeText}>
                  <Text style={styles.rangeDates}>
                    {r.start_date} → {r.end_date}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onRemove(r.id)}
                  disabled={busyDelete !== null}
                  style={[
                    styles.removeButton,
                    busyDelete !== null && styles.disabled,
                  ]}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  body: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.terracotta,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  addBlock: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateField: { flex: 1, gap: spacing.xs },
  dateLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
  },
  rangeText: { flex: 1 },
  rangeDates: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.terracotta,
    lineHeight: 22,
  },
  disabled: { opacity: 0.4 },
});

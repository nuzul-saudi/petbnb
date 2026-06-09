import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { ListingCard } from '@/components/ListingCard';
import { useAuth } from '@/lib/auth';
import { CITIES, findCity, type CityKey } from '@/lib/cities';
import { pickLocalized } from '@/lib/format';
import { getCurrentLocation, type Coords } from '@/lib/geo';
import { useTranslation } from '@/lib/i18n';
import { usePersona } from '@/lib/persona';
import {
  listActiveListings,
  listOwnListings,
  type ListingFeedItem,
} from '@/lib/listings';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const { initializing, session, profile } = useAuth();
  const { persona } = usePersona();

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <SafeAreaView style={styles.safe} />;
  // Suspended check runs before role gating so admins can also be locked out.
  if (profile.is_suspended) return <Redirect href="/suspended" />;
  if (profile.full_name.trim() === '') return <Redirect href="/role" />;
  if (profile.role === 'admin') return <Redirect href="/admin" />;

  if (profile.role === 'host') return <HostHome />;
  // 'both' users see whichever home their current persona names.
  // Pure 'owner' falls through to OwnerFeedHome unchanged.
  if (profile.role === 'both') {
    return persona === 'host' ? <HostHome /> : <OwnerFeedHome />;
  }
  return <OwnerFeedHome />;
}

// ---------------------------------------------------------------------------
// 8h.2: 7-state badge selector. Visible only on HostHome (the public feed
// shows no badge); the listing card's statusBadge prop is the only
// caller. Pairs every (status, has_pending_edit) combo with a label
// from the listings.status.* i18n group and a color token.
//
// State table:
//   pending             → "Pending review"          (gold)
//   approved            → "Live"                    (moss)
//   approved + draft    → "Live · edit pending"     (gold)
//   paused              → "Paused"                  (inkSoft)
//   paused + draft      → "Paused · edit pending"   (gold)
//   admin_disabled      → "Removed by admin"        (terracotta)
//   admin_disabled+draft→ "Removed by admin · edit pending" (gold)
//
// pending + draft is impossible — drafts are only created on
// approved/paused/admin_disabled per 8d/8e.
// ---------------------------------------------------------------------------
function pickStatusBadge(
  item: ListingFeedItem,
  t: (key: string) => string,
): { label: string; color: string } {
  const hasDraft = item.has_pending_edit === true;
  switch (item.status) {
    case 'pending':
      return {
        label: t('listings.status.pending_new'),
        color: colors.gold,
      };
    case 'approved':
      return hasDraft
        ? {
            label: t('listings.status.approved_with_draft'),
            color: colors.gold,
          }
        : {
            label: t('listings.status.approved_live'),
            color: colors.moss,
          };
    case 'paused':
      return hasDraft
        ? {
            label: t('listings.status.paused_with_draft'),
            color: colors.gold,
          }
        : {
            label: t('listings.status.paused'),
            color: colors.inkSoft,
          };
    case 'admin_disabled':
      return hasDraft
        ? {
            label: t('listings.status.admin_disabled_with_draft'),
            color: colors.gold,
          }
        : {
            label: t('listings.status.admin_disabled'),
            color: colors.terracotta,
          };
    default:
      return { label: '—', color: colors.inkSoft };
  }
}

// ---------------------------------------------------------------------------
// Host-only home (Step 7.1a — replaces the placeholder).
// Read-only list of the host's own listings + a Create entry point. No
// listing writes (those start in 7.2). Persona switch, host theme, and
// pending-request flag come in 7.1c–7.1e.
// Sign-out access is preserved via the existing AppHeader → My Account
// route (/profile carries the sign-out pressable).
// ---------------------------------------------------------------------------

function HostHome() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { profile } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [items, setItems] = useState<ListingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!profile) return;
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const rows = await listOwnListings(profile.id);
        setItems(rows);
      } catch (e) {
        console.warn('[host_home.load_failed]', e);
        setError(t('feed.load_failed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [profile, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true });
  }, [load]);

  const onCreate = () => {
    // Target route built in Step 7.2 (create-listing screen). Expo's
    // typed routes accept the literal even before the file exists, so
    // no @ts-expect-error needed here.
    router.push('/listings/new');
  };

  // 8h.5: split into two sections.
  //
  //   "Live / Published" — the host's listings that are public-facing
  //   or paused-but-still-theirs:
  //       status in ('approved', 'paused')
  //
  //   "Drafts / Pending review" — the host's pipeline (awaiting first
  //   review, taken down by admin, or has an edit awaiting review):
  //       status in ('pending', 'admin_disabled') OR has_pending_edit
  //
  // Overlap: approved-with-draft and paused-with-draft appear in BOTH
  // sections — once as the live listing, once as the pending edit.
  // Spec calls for this intentional duplication so the host gets
  // both perspectives ("here's what's published" + "here's what's in
  // review"). admin_disabled-with-draft only appears in Drafts since
  // its status is already in that section's filter.
  //
  // Card tap behavior unchanged: every card → /listings/[id].
  const sections = useMemo(() => {
    const liveItems = items.filter(
      (it) => it.status === 'approved' || it.status === 'paused',
    );
    const draftItems = items.filter(
      (it) =>
        it.status === 'pending' ||
        it.status === 'admin_disabled' ||
        it.has_pending_edit === true,
    );
    const out: { title: string; data: ListingFeedItem[] }[] = [];
    if (liveItems.length > 0) {
      out.push({ title: t('home.host_home_section_live'), data: liveItems });
    }
    if (draftItems.length > 0) {
      out.push({
        title: t('home.host_home_section_drafts'),
        data: draftItems,
      });
    }
    return out;
  }, [items, t]);

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greetingSmall}>
            {t('home.signed_in_greeting', { name: profile!.full_name })}
          </Text>
        </View>
      </View>

      <View style={styles.createButtonWrap}>
        <Button
          label={t('home.host_home_create_button')}
          onPress={onCreate}
          variant="primary"
          fullWidth
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('feed.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderTitle}>
            {t('home.host_home_empty_title')}
          </Text>
          <Text style={styles.placeholderBody}>
            {t('home.host_home_empty_body')}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          // Same listing may appear in both sections (approved-with-draft);
          // disambiguate the React key with the section title.
          keyExtractor={(it, idx) => `${it.id}-${idx}`}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listings/${item.id}`)}
              statusBadge={pickStatusBadge(item, t)}
            />
          )}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Owner / both home — the listings feed.
// ---------------------------------------------------------------------------

function OwnerFeedHome() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { profile } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [items, setItems] = useState<ListingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [femaleOnly, setFemaleOnly] = useState(false);
  // City filter (7.2c). Default Riyadh — the app's historical default
  // and where every existing listing was backfilled to via migration
  // 0019. Future polish: persist the user's preferred city on profiles.
  const [city, setCity] = useState<CityKey>('riyadh');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // Fetch the user's location once on mount. On success, the load
  // callback below picks up the new coords via its dependency and
  // re-queries with sortByDistance. On denial we set geoDenied so
  // the UI can show a small "share your location" hint.
  useEffect(() => {
    let cancelled = false;
    getCurrentLocation().then((c) => {
      if (cancelled) return;
      if (c) setCoords(c);
      else setGeoDenied(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const rows = await listActiveListings({
          city,
          femaleHostsOnly: femaleOnly,
          sortByDistance: coords ?? undefined,
        });
        setItems(rows);
      } catch (e) {
        console.warn('[feed.load_failed]', e);
        setError(t('feed.load_failed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [city, femaleOnly, coords, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true });
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.feedTitle}>
            {t('feed.title', {
              city: pickLocalized(
                findCity(city)?.name_ar ?? '',
                findCity(city)?.name_en ?? '',
                locale,
              ),
            })}
          </Text>
          <Text style={styles.greetingSmall}>
            {t('home.signed_in_greeting', { name: profile!.full_name })}
          </Text>
        </View>
      </View>

      {/* City selector (7.2c). Mirrors the femaleOnly filter-chip
          pattern below — same pill shape, active = filled. Placed
          above femaleOnly because city is the primary geographic
          filter; female-only sits on top of it. */}
      <View style={styles.cityRow}>
        {CITIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCity(c.key)}
            style={[
              styles.cityChip,
              city === c.key && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                city === c.key && styles.filterChipTextActive,
              ]}
            >
              {pickLocalized(c.name_ar, c.name_en, locale)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => setFemaleOnly((v) => !v)}
        style={[styles.filterChip, femaleOnly && styles.filterChipActive]}
      >
        <Text
          style={[
            styles.filterChipText,
            femaleOnly && styles.filterChipTextActive,
          ]}
        >
          {femaleOnly ? '✓ ' : ''}
          {t('feed.female_filter')}
        </Text>
      </Pressable>

      {geoDenied ? (
        <Text style={styles.geoHint}>{t('feed.geo_denied_hint')}</Text>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('feed.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('feed.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listings/${item.id}`)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    // backgroundColor intentionally omitted — the themed AppShell
    // wrapper supplies it (cream in owner mode, honey in host mode).
  },
  // --- placeholder (host) ---
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  greeting: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  metaLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  metaValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.moss,
  },
  placeholderTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  placeholderBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  signOut: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  signOutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.terracotta,
  },
  // --- feed ---
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  feedTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.mossDeep,
  },
  greetingSmall: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  geoHint: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  filterChip: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  // City selector row (7.2c). Wraps the per-city chips so they share
  // horizontal margin with the femaleOnly chip below; chips themselves
  // drop the margin since the row container provides it.
  cityRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  cityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.whisper,
    backgroundColor: colors.paper,
  },
  filterChipActive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  filterChipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  filterChipTextActive: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  sectionHeader: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.inkSoft,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  createButtonWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centeredText: {
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
});

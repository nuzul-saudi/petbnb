import { logWarn } from '@/lib/log';
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
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { ListingCard } from '@/components/ListingCard';
import { useFavorites } from '@/hooks/useFavorites';
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
  // R2C3 guest mode (2026-06-11): signed-out visitors can now browse
  // the owner feed. Previously this redirected to /sign-in
  // unconditionally. Gated actions (Request booking, persona toggle,
  // pets, bookings) route to /sign-in?returnTo=… when the visitor
  // taps them — see OwnerFeedHome and AppHeader.
  if (!session) return <OwnerFeedHome />;
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
  const { refreshPendingHostCount } = usePersona();
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
        logWarn('[host_home.load_failed]', e);
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

  // R2C7 — refresh both the listings AND the AppHeader pending-
  // requests badge whenever HostHome gains focus. A host returning
  // from accepting/declining a booking elsewhere sees fresh counts
  // immediately. useFocusEffect fires once per focus event; the
  // persona-context tick throttles redundant fetches if needed.
  useFocusEffect(
    useCallback(() => {
      refreshPendingHostCount();
    }, [refreshPendingHostCount]),
  );

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

  // Section model (test round 3 + R2C4 framing):
  //   "Drafts / Pending review" — shown first, host's work-in-flight.
  //   "Live / Published" — shown second, customer-visible listings.
  // R2C4 added a `tone` field to each section so the SectionList
  // header + container can pick colors from the badge language the
  // cards already speak (gold for in-flight, moss for live).
  type HostSection = {
    title: string;
    data: ListingFeedItem[];
    tone: 'drafts' | 'live';
  };
  const sections = useMemo<HostSection[]>(() => {
    const draftItems = items.filter(
      (it) =>
        it.status === 'pending' ||
        it.status === 'paused' ||
        it.status === 'admin_disabled' ||
        it.has_pending_edit === true,
    );
    const liveItems = items.filter((it) => it.status === 'approved');
    const out: HostSection[] = [];
    if (draftItems.length > 0) {
      out.push({
        title: t('home.host_home_section_drafts'),
        data: draftItems,
        tone: 'drafts',
      });
    }
    if (liveItems.length > 0) {
      out.push({
        title: t('home.host_home_section_live'),
        data: liveItems,
        tone: 'live',
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
            // R2C4: tinted pill that matches the badge language —
            // gold for drafts (in-flight), moss for live (published).
            <View
              style={[
                styles.sectionHeaderPill,
                section.tone === 'live'
                  ? styles.sectionHeaderPillLive
                  : styles.sectionHeaderPillDrafts,
              ]}
            >
              <Text style={styles.sectionHeaderPillText}>
                {section.title}
              </Text>
            </View>
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
  const { profile, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');
  // Round 11 — favorites toggle. Anonymous viewers don't get the
  // heart (no userId to attach the row to); they tap into the listing
  // and are routed to /sign-in via the existing guest-gate.
  const favorites = useFavorites(user?.id ?? null);

  const [items, setItems] = useState<ListingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [femaleOnly, setFemaleOnly] = useState(false);
  // S2 discovery filters.
  const [groomingOnly, setGroomingOnly] = useState(false);
  const [noResidentPetsOnly, setNoResidentPetsOnly] = useState(false);
  // Round 10 — price band filter. Three preset bands; null = no filter.
  //   'budget'    → ≤ 200 SAR/night
  //   'midrange'  → 201–400
  //   'premium'   → > 400
  // Mutually exclusive — picking a new band replaces the previous one.
  // Schema-ready since ListingFilter's minPriceSAR/maxPriceSAR existed
  // unwired since S2; this commit just adds the UI.
  const [priceBand, setPriceBand] = useState<
    'budget' | 'midrange' | 'premium' | null
  >(null);
  // City filter (7.2c). Default Riyadh — the app's historical default
  // and where every existing listing was backfilled to via migration
  // 0019. Future polish: persist the user's preferred city on profiles.
  const [city, setCity] = useState<CityKey>('riyadh');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  // R2C5 sort selector. Default 'newest' preserves the
  // pre-R2C5 behavior (base query orders by created_at desc).
  // 'distance' is only meaningful when coords is set — UI hides
  // the chip otherwise.
  const [sortBy, setSortBy] = useState<
    'newest' | 'price_asc' | 'price_desc' | 'rating' | 'distance'
  >('newest');

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
        // Round 10 — translate band → min/max SAR. ≤ 200, 201-400,
        // > 400. Server-side filter via gte/lte on nightly_price_sar.
        const minPriceSAR =
          priceBand === 'midrange'
            ? 201
            : priceBand === 'premium'
              ? 401
              : undefined;
        const maxPriceSAR =
          priceBand === 'budget'
            ? 200
            : priceBand === 'midrange'
              ? 400
              : undefined;

        const rows = await listActiveListings(
          {
            city,
            femaleHostsOnly: femaleOnly,
            groomingOnly,
            noResidentPetsOnly,
            minPriceSAR,
            maxPriceSAR,
            // Distance is also a sort, but the DB query has the haversine
            // computation already wired to sortByDistance. Newest, price,
            // and rating are client-side sorts (next effect) over the
            // returned rows.
            sortByDistance:
              sortBy === 'distance' && coords ? coords : undefined,
          },
          // Pagination (Round 3). Page 0, 20 per page. Load-more /
          // infinite scroll is a follow-up.
          { limit: 20 },
        );
        setItems(rows);
      } catch (e) {
        logWarn('[feed.load_failed]', e);
        setError(t('feed.load_failed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [city, femaleOnly, groomingOnly, noResidentPetsOnly, priceBand, coords, sortBy, t],
  );

  // R2C5 client-side sort over the loaded items. Distance is handled
  // by the DB query above (sortByDistance), so when sortBy='distance'
  // we leave items untouched. Newest is the DB default (created_at
  // desc), so it's also a no-op here.
  const sortedItems = useMemo(() => {
    if (sortBy === 'price_asc') {
      return [...items].sort(
        (a, b) => a.nightly_price_sar - b.nightly_price_sar,
      );
    }
    if (sortBy === 'price_desc') {
      return [...items].sort(
        (a, b) => b.nightly_price_sar - a.nightly_price_sar,
      );
    }
    if (sortBy === 'rating') {
      // Hosts with NO rating sort last (matches "new host" badge — no
      // signal yet). Among rated hosts, higher avg first.
      return [...items].sort((a, b) => {
        const ra = a.host_avg_rating ?? -1;
        const rb = b.host_avg_rating ?? -1;
        return rb - ra;
      });
    }
    return items;
  }, [items, sortBy]);

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
          {/* Greeting line — signed-in users see "أهلاً، <name>".
              Guests (R2C3) see a hint that they can sign in for more. */}
          {profile ? (
            <Text style={styles.greetingSmall}>
              {t('home.signed_in_greeting', { name: profile.full_name })}
            </Text>
          ) : (
            <Text style={styles.greetingSmall}>
              {t('home.guest_greeting')}
            </Text>
          )}
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

      <View style={styles.filterRow}>
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

        <Pressable
          onPress={() => setGroomingOnly((v) => !v)}
          style={[styles.filterChip, groomingOnly && styles.filterChipActive]}
        >
          <Text
            style={[
              styles.filterChipText,
              groomingOnly && styles.filterChipTextActive,
            ]}
          >
            {groomingOnly ? '✓ ' : ''}
            {t('feed.grooming_filter')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setNoResidentPetsOnly((v) => !v)}
          style={[
            styles.filterChip,
            noResidentPetsOnly && styles.filterChipActive,
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              noResidentPetsOnly && styles.filterChipTextActive,
            ]}
          >
            {noResidentPetsOnly ? '✓ ' : ''}
            {t('feed.no_resident_pets_filter')}
          </Text>
        </Pressable>
      </View>

      {/* Round 10 — price band chips. Three preset bands; tapping
          the active band clears it. Mutually exclusive — picking a
          different band replaces the previous selection. */}
      <View style={styles.filterRow}>
        {(['budget', 'midrange', 'premium'] as const).map((band) => {
          const active = priceBand === band;
          return (
            <Pressable
              key={band}
              onPress={() => setPriceBand(active ? null : band)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {active ? '✓ ' : ''}
                {t(`feed.price_band_${band}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* R2C5 sort selector. Chip strip — same pill shape as the
          filter row. Distance only appears when device geolocation
          succeeded (coords != null). */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>{t('feed.sort_label')}</Text>
        {(
          [
            'newest',
            'price_asc',
            'price_desc',
            'rating',
            'distance',
          ] as const
        )
          .filter((key) => key !== 'distance' || coords)
          .map((key) => {
            const active = sortBy === key;
            return (
              <Pressable
                key={key}
                onPress={() => setSortBy(key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {active ? '✓ ' : ''}
                  {t(`feed.sort_${key}`)}
                </Text>
              </Pressable>
            );
          })}
      </View>

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
      ) : sortedItems.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('feed.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedItems}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listings/${item.id}`)}
              favorite={
                user
                  ? {
                      isFavorited: favorites.ids.has(item.id),
                      onToggle: () => void favorites.toggle(item.id),
                    }
                  : undefined
              }
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  sortLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.inkSoft,
    marginEnd: spacing.xs,
  },
  filterChip: {
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
  // R2C4 host-section framing — pill containers whose color matches
  // the badge language the cards already speak.
  sectionHeaderPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeaderPillLive: {
    backgroundColor: colors.moss,
  },
  sectionHeaderPillDrafts: {
    backgroundColor: colors.gold,
  },
  sectionHeaderPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.cream,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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

import { logWarn } from '@/lib/log';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { PetAvatar } from '@/components/PetAvatar';
import { useAuth } from '@/lib/auth';
import { findBreed } from '@/lib/breeds';
import { useTranslation } from '@/lib/i18n';
import { listPetsForOwner } from '@/lib/pets';
import { useSignedPetPhotoUrls } from '@/hooks/useSignedPetPhotoUrls';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';
import { toArabicDigits } from '@/lib/format';
import type { Tables } from '@/types/database';

export default function PetsListScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { initializing, session, user } = useAuth();
  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  const [pets, setPets] = useState<Tables<'pets'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Round 6 — batch-sign all pet-photo paths on data-load so the
  // FlatList renders signed URLs without N round-trips.
  const signedPhotos = useSignedPetPhotoUrls(pets.map((p) => p.photo_url));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setPets(await listPetsForOwner(user.id));
    } catch (e) {
      logWarn('[pets.load_failed]', e);
      setError(t('pets.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  // Refresh when navigating back from /pets/[id] so a new/edited pet
  // shows up immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (initializing) return <SafeAreaView style={styles.safe} />;
  if (!session || !user) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader locale={locale} onLanguageToggle={toggleLocale} />
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/profile')} style={styles.backLink}>
          <Text style={styles.backText}>{t('pets.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('pets.list_title')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('pets.loading')}</Text>
        </View>
      ) : pets.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('pets.empty_title')}</Text>
          <Text style={styles.emptyBody}>{t('pets.empty_body')}</Text>
        </View>
      ) : (
        <FlatList
          data={pets}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const matched = findBreed(item.breed);
            const breedLabel = matched
              ? matched.name_ar
              : item.breed_other
                ? item.breed_other
                : t('pets.species_cat');
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/pets/[id]',
                    params: { id: item.id },
                  })
                }
                style={styles.row}
              >
                <PetAvatar
                  photoUrl={item.photo_url ? signedPhotos.get(item.photo_url) ?? null : null}
                  breed={item.breed}
                  size={48}
                />
                <View style={styles.rowMain}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    {breedLabel}
                    {item.age_months != null
                      ? ` • ${t('pets.age_months', { count: toArabicDigits(item.age_months) })}`
                      : ''}
                  </Text>
                </View>
                <Text style={styles.rowArrow}>‹</Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* FIX 4 — shared Button (was a hand-rolled Pressable). */}
      <View style={styles.addButtonWrap}>
        <Button
          label={t('pets.add_button')}
          onPress={() =>
            router.push({ pathname: '/pets/[id]', params: { id: 'new' } })
          }
          variant="primary"
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
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
    gap: spacing.sm,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  rowArrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.inkSoft,
  },
  // FIX 4 — wrap that preserves the margin-around-button layout the
  // old hand-rolled style had. The Button itself handles its own
  // height, color, label styling.
  addButtonWrap: {
    margin: spacing.xl,
  },
});

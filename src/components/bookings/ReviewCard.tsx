// R2C6 — review compose / display card. Two states:
//   - existing review found → read-only stars + text
//   - no existing review    → compose form (stars + optional text +
//                             Submit). One-shot — the form disappears
//                             after a successful submit.
//
// Used on completed-booking detail (bookings/[id].tsx) for both
// owner→host and host→owner reviews. Caller picks rater/ratee and
// the right "Rate your <host|owner>" heading.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { logWarn } from '@/lib/log';
import { useTranslation } from '@/lib/i18n';
import { createReview, type Review } from '@/lib/reviews';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type Props = {
  bookingId: string;
  raterId: string;
  rateeId: string;
  /** i18n key for the heading e.g. 'reviews.rate_host_title'. */
  titleKey: string;
  /** Existing review (already posted) or null if none. */
  existing: Review | null;
  /** Callback fired after a successful submit so the parent can refetch. */
  onSubmitted?: () => void;
};

export function ReviewCard({
  bookingId,
  raterId,
  rateeId,
  titleKey,
  existing,
  onSubmitted,
}: Props) {
  const { t } = useTranslation();
  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [text, setText] = useState(existing?.text_ar ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read-only mode if existing review found.
  if (existing) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Text
              key={n}
              style={[styles.star, n <= existing.stars && styles.starFilled]}
            >
              ★
            </Text>
          ))}
        </View>
        {existing.text_ar ? (
          <Text style={styles.bodyText}>{existing.text_ar}</Text>
        ) : null}
        <Text style={styles.muted}>{t('reviews.already_rated_hint')}</Text>
      </View>
    );
  }

  const canSubmit = stars >= 1 && stars <= 5 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createReview({
        bookingId,
        raterId,
        rateeId,
        stars,
        textAr: text,
      });
      onSubmitted?.();
    } catch (e) {
      logWarn('[reviews.create_failed]', e);
      setError(t('reviews.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t(titleKey)}</Text>
      <Text style={styles.muted}>{t('reviews.stars_hint')}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setStars(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: stars === n }}
            accessibilityLabel={String(n)}
            style={styles.starButton}
          >
            <Text style={[styles.star, n <= stars && styles.starFilled]}>★</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('reviews.text_placeholder')}
        placeholderTextColor={colors.inkSoft}
        multiline
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={
          submitting ? t('reviews.submitting') : t('reviews.submit_button')
        }
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
        variant="primary"
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.whisper,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.mossDeep,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  starButton: {
    padding: spacing.xs,
  },
  star: {
    fontSize: 28,
    color: colors.whisper,
  },
  starFilled: {
    color: colors.gold,
  },
  bodyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
  },
  input: {
    backgroundColor: colors.cream,
    borderColor: colors.whisper,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 70,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.terracotta,
  },
});

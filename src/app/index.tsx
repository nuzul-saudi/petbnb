import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '@/lib/i18n';
import { pingSupabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type ConnState = 'checking' | 'ok' | 'fail';

export default function HomeScreen() {
  const { t } = useTranslation();
  const [conn, setConn] = useState<ConnState>('checking');
  const [detail, setDetail] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    pingSupabase().then((result) => {
      if (cancelled) return;
      setConn(result.ok ? 'ok' : 'fail');
      setDetail(result.detail);
      // Mirror to the browser console so you can confirm wiring without
      // squinting at the on-screen pill.
      // eslint-disable-next-line no-console
      console.log('[supabase ping]', result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel =
    conn === 'checking'
      ? t('supabase.checking')
      : conn === 'ok'
      ? t('supabase.connected')
      : detail === 'missing_config'
      ? t('supabase.missing_config')
      : t('supabase.failed');

  const statusStyle =
    conn === 'ok'
      ? styles.statusOk
      : conn === 'fail'
      ? styles.statusFail
      : styles.statusChecking;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('home.welcome')}</Text>
        <Text style={styles.body}>{t('home.foundation_ok')}</Text>

        <View style={[styles.statusPill, statusStyle]}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: 32,
    color: colors.mossDeep,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  statusPill: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  statusChecking: {
    backgroundColor: colors.whisper,
    borderColor: colors.gold,
  },
  statusOk: {
    backgroundColor: colors.whisper,
    borderColor: colors.moss,
  },
  statusFail: {
    backgroundColor: colors.whisper,
    borderColor: colors.terracotta,
  },
});

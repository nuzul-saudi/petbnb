import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '@/lib/i18n';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('home.welcome')}</Text>
        <Text style={styles.body}>{t('home.foundation_ok')}</Text>
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
});

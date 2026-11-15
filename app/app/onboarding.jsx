import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, Screen, Text } from '../src/components/ui';
import { StateCard } from '../src/components/StateCard';
import { PM5Illustration } from '../src/components/connect/PM5Illustration';
import { requestBlePermissions, isLegacyAndroid } from '../src/data/permissions';
import { getBleSupport } from '../src/data/bleSupport';
import { useSettings } from '../src/state/settings';
import { logger } from '../src/services';
import { useT } from '../src/i18n';
import { colors, space } from '../src/theme/tokens';

const SLIDES = [
  { key: 'connect', icon: null },
  { key: 'race', icon: 'flag' },
  { key: 'track', icon: 'history' },
];

/** First launch: 3 slides, then the Bluetooth permission explanation, then Connect. */
export default function Onboarding() {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const finish = () => {
    useSettings.getState().set({ onboardingDone: true });
    router.replace('/connect');
  };
  const allow = async () => {
    if (getBleSupport().ok) {
      const r = await requestBlePermissions();
      logger.ble('permission', { result: r, legacy: isLegacyAndroid(), from: 'onboarding' });
    }
    finish();
  };

  if (step >= SLIDES.length) {
    return (
      <Screen style={styles.center}>
        <StateCard
          icon="bluetooth"
          title={t('permissions.title')}
          message={t('permissions.why')}
          tips={isLegacyAndroid() ? [t('permissions.whyLegacy')] : undefined}
          actions={[
            { label: t('permissions.allow'), onPress: allow },
            { label: t('onboarding.later'), onPress: finish, variant: 'ghost' },
          ]}
          style={styles.card}
        />
      </Screen>
    );
  }

  const slide = SLIDES[step];
  return (
    <Screen style={styles.row}>
      <View style={styles.art}>
        {slide.icon ? (
          <Icon name={slide.icon} size={200} color={colors.primary} strokeWidth={1.2} />
        ) : (
          <PM5Illustration width={260} />
        )}
      </View>
      <View style={styles.text}>
        <Text variant="label">{t('onboarding.step', { n: step + 1, total: SLIDES.length })}</Text>
        <Text variant="display">{t(`onboarding.${slide.key}Title`)}</Text>
        <Text variant="body" color={colors.textSecondary}>
          {t(`onboarding.${slide.key}Body`)}
        </Text>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.actions}>
          <Button
            label={t('onboarding.skip')}
            variant="ghost"
            onPress={() => setStep(SLIDES.length)}
          />
          <Button label={t('common.continue')} onPress={() => setStep(step + 1)} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { maxWidth: 720 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  art: { flex: 1, alignItems: 'center' },
  text: { flex: 1.2, gap: space.md },
  dots: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.divider },
  dotOn: { width: 32, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
});

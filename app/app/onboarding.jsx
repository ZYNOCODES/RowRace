import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text } from '../src/components/ui';
import { useT } from '../src/i18n';
import { useSettings } from '../src/state/settings';
import { space } from '../src/theme/tokens';

/** Onboarding stub (phase 6 adds the 3 slides and permission explanations). */
export default function Onboarding() {
  const { t } = useT();
  const finish = () => {
    useSettings.getState().set({ onboardingDone: true });
    router.replace('/connect');
  };
  return (
    <Screen style={styles.center}>
      <Text variant="display">{t('nav.onboarding')}</Text>
      <Text variant="bodySecondary">{t('common.comingInPhase', { phase: 6 })}</Text>
      <View style={{ height: space.lg }} />
      <Button label={t('common.continue')} onPress={finish} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
});

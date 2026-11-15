import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Screen, Text } from '../../src/components/ui';
import { StateCard } from '../../src/components/StateCard';
import { ResultsView } from '../../src/components/ResultsView';
import { useHistory } from '../../src/state/history';
import { useT } from '../../src/i18n';
import { colors, space } from '../../src/theme/tokens';

const AUTO_HOME_SEC = 10;

/** Results right after a race: back to Home automatically after 10 s unless "Stay". */
export default function Results() {
  const { t } = useT();
  const { id, pb, live } = useLocalSearchParams();
  const entry = useHistory((s) => s.entries.find((e) => e.id === id));
  const [left, setLeft] = useState(live === '1' ? AUTO_HOME_SEC : null);

  useEffect(() => {
    if (left == null) return undefined;
    if (left <= 0) {
      router.replace('/home');
      return undefined;
    }
    const tm = setTimeout(() => setLeft((n) => (n == null ? null : n - 1)), 1000);
    return () => clearTimeout(tm);
  }, [left]);

  if (!entry) {
    return (
      <Screen style={styles.center}>
        <StateCard
          icon="warning"
          tone="warning"
          title={t('results.missing')}
          actions={[{ label: t('nav.home'), onPress: () => router.replace('/home') }]}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ResultsView
        entry={entry}
        isPB={pb === '1'}
        header={
          <View style={styles.actions}>
            {left != null && (
              <>
                <Text variant="body" color={colors.textSecondary}>
                  {t('results.autoHome', { seconds: left })}
                </Text>
                <Button
                  label={t('results.stay')}
                  variant="secondary"
                  onPress={() => setLeft(null)}
                />
              </>
            )}
            <Button
              label={t('results.again')}
              variant="secondary"
              onPress={() => router.replace('/race/ready')}
            />
            <Button label={t('nav.home')} onPress={() => router.replace('/home')} />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

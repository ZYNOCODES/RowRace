import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, Text } from './ui';
import { useT } from '../i18n';
import { space } from '../theme/tokens';

/**
 * Phase-1 navigation stub: a titled screen with links to the next screens in the flow.
 * Each route replaces this with its real implementation in the phase noted.
 * @param {{ titleKey: string, phase: number, links?: { labelKey: string, href: string }[],
 *   onBack?: boolean }} props
 */
export function PhaseStub({ titleKey, phase, links = [], onBack = true }) {
  const { t } = useT();
  return (
    <Screen>
      <View style={styles.header}>
        {onBack && router.canGoBack() && (
          <Button
            label={t('common.back')}
            variant="ghost"
            size="md"
            onPress={() => router.back()}
          />
        )}
        <Text variant="title">{t(titleKey)}</Text>
      </View>
      <Card style={styles.card}>
        <Text variant="bodySecondary">{t('common.comingInPhase', { phase })}</Text>
        <View style={styles.links}>
          {links.map((l) => (
            <Button key={l.href} label={t(l.labelKey)} onPress={() => router.push(l.href)} />
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.lg },
  card: { gap: space.lg },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
});

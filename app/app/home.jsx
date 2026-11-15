import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { APP_NAME } from '@rowrace/shared/constants';
import { Button, Card, Icon, Pill, Screen, Text } from '../src/components/ui';
import { useT } from '../src/i18n';
import { pillFor, useConnection } from '../src/state/connection';
import { colors, space } from '../src/theme/tokens';

/** Home: connection pill always visible, two big primary cards, secondary actions. */
export default function Home() {
  const { t } = useT();
  const pill = pillFor(useConnection((s) => s.status));

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">{APP_NAME}</Text>
        <Card
          onPress={() => router.push('/connect')}
          style={styles.pillCard}
          accessibilityLabel={`${t(pill.key)}, ${t('nav.connect')}`}
        >
          <Pill tone={pill.tone} icon={pill.icon} label={t(pill.key)} />
        </Card>
      </View>

      <View style={styles.primary}>
        <Card
          style={styles.bigCard}
          accessibilityLabel={t('home.race')}
          onPress={() => router.push('/race/map?mode=race')}
        >
          <Icon name="flag" size={48} color={colors.primary} />
          <Text variant="display">{t('home.race')}</Text>
          <Text variant="bodySecondary">{t('home.raceSub')}</Text>
        </Card>
        <Card
          style={styles.bigCard}
          accessibilityLabel={t('home.freeRow')}
          onPress={() => router.push('/race/map?mode=free')}
        >
          <Icon name="wave" size={48} color={colors.accent} />
          <Text variant="display">{t('home.freeRow')}</Text>
          <Text variant="bodySecondary">{t('home.freeRowSub')}</Text>
        </Card>
      </View>

      <View style={styles.secondary}>
        <Button
          label={t('nav.history')}
          variant="secondary"
          icon={<Icon name="history" />}
          onPress={() => router.push('/history')}
        />
        <Button
          label={t('home.rower')}
          variant="secondary"
          icon={<Icon name="wave" />}
          onPress={() => router.push('/characters')}
        />
        <Button
          label={t('nav.settings')}
          variant="secondary"
          icon={<Icon name="settings" />}
          onPress={() => router.push('/settings')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  primary: { flex: 1, flexDirection: 'row', gap: space.lg },
  bigCard: { flex: 1, justifyContent: 'flex-end', gap: space.xs, padding: space.xl },
  secondary: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  pillCard: { padding: space.xs, borderWidth: 0, backgroundColor: 'transparent' },
});

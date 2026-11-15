import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from '@rowrace/shared';
import { Button, Card, Icon, Screen, Text } from '../../src/components/ui';
import { StateCard } from '../../src/components/StateCard';
import { useHistory } from '../../src/state/history';
import { getMap } from '../../src/scene/maps';
import { ordinal } from '../../src/race/records';
import { useT } from '../../src/i18n';
import { colors, space } from '../../src/theme/tokens';

/** Saved sessions, newest first. */
export default function History() {
  const { t, lang } = useT();
  const entries = useHistory((s) => s.entries);
  const label = (e) =>
    e.mode === 'distance'
      ? `${e.target} m`
      : e.mode === 'time'
        ? format.formatTime(e.target)
        : t('workout.free');
  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title">{t('nav.history')}</Text>
      </View>
      {entries.length === 0 ? (
        <StateCard
          icon="history"
          title={t('history.emptyTitle')}
          message={t('history.empty')}
          actions={[{ label: t('home.race'), onPress: () => router.replace('/race/map') }]}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: e }) => (
            <Card
              onPress={() => router.push(`/history/${e.id}`)}
              style={styles.row}
              accessibilityLabel={`${label(e)} ${format.formatTime(e.time)}`}
            >
              <Icon name={e.mode === 'free' ? 'wave' : 'flag'} color={colors.primary} />
              <View style={styles.flex}>
                <Text variant="heading">{`${label(e)} · ${format.formatTime(e.time, { tenths: true })}`}</Text>
                <Text variant="bodySecondary">
                  {`${new Date(e.date).toLocaleString(lang)} · ${t(getMap(e.mapId).nameKey)} · ${Math.round(e.distance)} m · ${format.formatPace(e.avgPace)}/500`}
                </Text>
              </View>
              {e.isPB && <Icon name="trophy" color={colors.warning} />}
              {e.total > 1 && <Text variant="statSm">{`${ordinal(e.rank, lang)}/${e.total}`}</Text>}
              <Icon name="chevronRight" color={colors.textSecondary} />
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.md },
  list: { gap: space.sm, paddingBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  flex: { flex: 1 },
});

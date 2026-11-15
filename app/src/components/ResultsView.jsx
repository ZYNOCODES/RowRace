import { ScrollView, StyleSheet, View } from 'react-native';
import { format } from '@rowrace/shared';
import { Card, Icon, Pill, StatTile, Text } from './ui';
import { PaceChart } from './PaceChart';
import { getMap } from '../scene/maps';
import { ordinal, paceSeries } from '../race/records';
import { useT } from '../i18n';
import { colors, space } from '../theme/tokens';

/** Full result of one session (Results screen and History detail). */
export function ResultsView({ entry, isPB, header }) {
  const { t, lang } = useT();
  const finished = entry.reason === 'finished' || entry.reason === 'time-up';
  const boatName = (b) => (b.isUser ? t('results.you') : b.id === 'ghost' ? t('hud.pb') : b.name);
  const targetLabel =
    entry.mode === 'distance'
      ? `${entry.target} m`
      : entry.mode === 'time'
        ? format.formatTime(entry.target)
        : t('workout.free');
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="title">{finished ? t('results.finished') : t('results.notFinished')}</Text>
          <Text variant="bodySecondary">
            {`${targetLabel} · ${t(getMap(entry.mapId).nameKey)} · ${new Date(entry.date).toLocaleString(lang)}`}
          </Text>
        </View>
        {isPB && <Pill tone="success" icon="trophy" label={t('results.newPB')} />}
        {header}
      </View>

      <Card style={styles.mainCard}>
        <StatTile
          label={t('results.time')}
          value={format.formatTime(entry.time, { tenths: true })}
          size="statXl"
        />
        <View style={styles.grid}>
          <StatTile label={t('hud.distance')} value={Math.round(entry.distance)} unit="m" />
          <StatTile
            label={t('results.avgPace')}
            value={format.formatPace(entry.avgPace)}
            unit="/500 m"
          />
          <StatTile label={t('results.avgWatts')} value={Math.round(entry.avgWatts)} unit="W" />
          <StatTile label={t('hud.calories')} value={Math.round(entry.calories)} unit="kcal" />
          <StatTile
            label={t('results.avgSpm')}
            value={Math.round(entry.avgSpm)}
            unit={t('hud.spm')}
          />
        </View>
      </Card>

      <View style={styles.row}>
        {entry.boats.length > 1 && (
          <Card style={styles.flex}>
            <Text variant="heading">
              {t('results.ranking', { rank: ordinal(entry.rank, lang), total: entry.total })}
            </Text>
            {entry.boats.map((b, i) => (
              <View key={b.id} style={[styles.boat, b.isUser && styles.me]}>
                <Text variant="statSm" style={styles.pos}>
                  {i + 1}
                </Text>
                {b.isUser && <Icon name="dot" size={16} color={colors.primary} />}
                <Text variant="body" style={styles.flex}>
                  {boatName(b)}
                </Text>
                <Text variant="mono">
                  {b.finishTime != null
                    ? format.formatTime(b.finishTime, { tenths: true })
                    : `${Math.round(b.distance)} m`}
                </Text>
              </View>
            ))}
          </Card>
        )}
        <Card style={styles.flex}>
          <Text variant="heading">{t('results.paceChart')}</Text>
          <PaceChart series={paceSeries(entry.trace)} target={null} />
          {entry.splits.length > 0 && (
            <View style={styles.splits}>
              {entry.splits.map((sp) => (
                <Text key={sp.index} variant="mono" color={colors.textSecondary}>
                  {`${sp.distance} m  ${format.formatTime(sp.splitTime, { tenths: true })}  ${format.formatPace(sp.pace)}/500`}
                </Text>
              ))}
            </View>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  mainCard: { flexDirection: 'row', alignItems: 'center', gap: space.xl, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, flex: 1 },
  row: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  boat: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  me: { backgroundColor: colors.elevated, borderRadius: 12, paddingHorizontal: space.xs },
  pos: { width: 32 },
  splits: { gap: 2, marginTop: space.sm },
});

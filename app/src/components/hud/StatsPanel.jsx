import { StyleSheet, View } from 'react-native';
import { format } from '@rowrace/shared';
import { GlassPanel, StatTile } from '../ui';
import { useT } from '../../i18n';
import { space } from '../../theme/tokens';

/** Top glass panel: time · distance · speed · calories (tabular figures, never jump). */
export function StatsPanel({ time, distance, speedKmh, calories, remaining, mode }) {
  const { t } = useT();
  const showRemaining = mode === 'time' && remaining != null;
  return (
    <GlassPanel strong style={styles.panel}>
      <StatTile
        label={showRemaining ? t('hud.timeLeft') : t('hud.time')}
        value={format.formatTime(showRemaining ? remaining : time)}
        align="center"
      />
      <View style={styles.sep} />
      <StatTile label={t('hud.distance')} value={Math.floor(distance)} unit="m" align="center" />
      <View style={styles.sep} />
      <StatTile label={t('hud.speed')} value={speedKmh.toFixed(1)} unit="km/h" align="center" />
      <View style={styles.sep} />
      <StatTile label={t('hud.calories')} value={Math.round(calories)} unit="kcal" align="center" />
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.xl },
  sep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },
});

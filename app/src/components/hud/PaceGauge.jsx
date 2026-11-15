import { StyleSheet, View } from 'react-native';
import { format } from '@rowrace/shared';
import { Gauge, Icon, Text } from '../ui';
import { useT } from '../../i18n';
import { colors } from '../../theme/tokens';

/**
 * Big circular gauge: current pace /500 m (or km/h) and watts. With a target pace the ring
 * shows how far ahead/behind it the rower is; color is backed by an arrow and a ±s label.
 * @param {{ pace: number|null, speedKmh: number, watts: number, targetPace?: number|null,
 *   units: 'pace'|'kmh', size?: number }} props
 */
export function PaceGauge({ pace, speedKmh, watts, targetPace, units, size = 230 }) {
  const { t } = useT();
  const delta = pace && targetPace ? pace - targetPace : null; // negative = faster
  const ahead = delta != null && delta <= 0;
  const color = delta == null ? colors.primary : ahead ? colors.success : colors.danger;
  // Ring: full at 15 s/500 m faster than target, half at the target, empty at 15 s slower.
  const progress =
    delta == null
      ? pace
        ? Math.min(1, 100 / pace)
        : 0
      : Math.min(1, Math.max(0, 0.5 - delta / 30));
  const main = units === 'kmh' ? speedKmh.toFixed(1) : format.formatPace(pace);
  return (
    <Gauge size={size} thickness={16} progress={progress} color={color}>
      <Text variant="label">{units === 'kmh' ? t('hud.speed') : t('hud.pace')}</Text>
      <Text variant="statLg" style={styles.main} accessibilityLabel={`${t('hud.pace')} ${main}`}>
        {main}
      </Text>
      <Text variant="bodySecondary">{units === 'kmh' ? 'km/h' : '/500 m'}</Text>
      <Text variant="statSm">{Math.round(watts)} W</Text>
      {delta != null && (
        <View style={styles.delta}>
          <Icon
            name={ahead ? 'chevronUp' : 'chevronDown'}
            size={18}
            color={color}
            strokeWidth={3}
          />
          <Text variant="label" color={color}>
            {`${ahead ? '−' : '+'}${Math.abs(delta).toFixed(1)} s`}
          </Text>
        </View>
      )}
    </Gauge>
  );
}

const styles = StyleSheet.create({
  main: { marginVertical: -4 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
});

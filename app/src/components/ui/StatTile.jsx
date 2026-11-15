import { StyleSheet, View } from 'react-native';
import { space } from '../../theme/tokens';
import { Text } from './Text';

/**
 * Label over a big tabular number, with an optional unit.
 * @param {{ label: string, value: string|number, unit?: string, size?: 'statSm'|'stat'|'statLg'|'statXl',
 *   color?: string, align?: 'left'|'center'|'right', style?: any }} props
 */
export function StatTile({ label, value, unit, size = 'stat', color, align = 'left', style }) {
  const items = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  return (
    <View
      style={[{ alignItems: items }, style]}
      accessible
      accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}
    >
      <Text variant="label">{label}</Text>
      <View style={styles.row}>
        <Text variant={size} color={color}>
          {value}
        </Text>
        {unit ? (
          <Text variant="bodySecondary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  unit: { marginLeft: 2 },
});

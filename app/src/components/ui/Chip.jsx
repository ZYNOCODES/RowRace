import { StyleSheet } from 'react-native';
import { colors, radius, space, touch } from '../../theme/tokens';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * Big selectable chip for presets (500 m, 2 km, 10 min…). Selected state shows a check icon.
 * @param {{ label: string, selected?: boolean, onPress?: () => void, style?: any }} props
 */
export function Chip({ label, selected, onPress, style }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected, style]}
    >
      {selected && <Icon name="check" size={20} color={colors.onFill} strokeWidth={3} />}
      <Text variant="button" color={selected ? colors.onFill : colors.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touch.min,
    minWidth: touch.min * 1.5,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.divider,
    backgroundColor: colors.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
});

import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

/**
 * Surface card (radius 20). Becomes pressable when `onPress` is set.
 * @param {{ onPress?: () => void, elevated?: boolean, style?: any, children?: any,
 *   accessibilityLabel?: string }} props
 */
export function Card({ onPress, elevated, style, children, accessibilityLabel }) {
  const s = [styles.card, elevated && styles.elevated, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      scaleTo={0.98}
      style={s}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: space.lg,
  },
  elevated: { backgroundColor: colors.elevated },
});

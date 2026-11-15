import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, radius, space, touch } from '../../theme/tokens';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

const VARIANTS = {
  primary: { bg: colors.primary, fg: colors.onFill, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.onFill, border: colors.accent },
  secondary: { bg: colors.elevated, fg: colors.text, border: colors.glassBorder },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.divider },
  danger: { bg: colors.danger, fg: colors.onFill, border: colors.danger },
};

/**
 * Large touch-friendly button (≥ 64 dp tall by default).
 * @param {{ label: string, onPress?: () => void, onLongPress?: () => void,
 *   variant?: keyof typeof VARIANTS, size?: 'lg'|'md', icon?: React.ReactNode,
 *   disabled?: boolean, loading?: boolean, style?: any, accessibilityHint?: string }} props
 */
export function Button({
  label,
  onPress,
  onLongPress,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}) {
  const v = VARIANTS[variant];
  const height = size === 'lg' ? touch.min : touch.compact;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.base,
        { minHeight: height, backgroundColor: v.bg, borderColor: v.border },
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text variant="button" color={v.fg}>
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  disabled: { opacity: 0.45 },
});

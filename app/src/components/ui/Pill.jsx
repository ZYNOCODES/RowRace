import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

const TONES = {
  success: { color: colors.success, icon: 'check' },
  warning: { color: colors.warning, icon: 'refresh' },
  danger: { color: colors.danger, icon: 'close' },
  info: { color: colors.primary, icon: 'bluetooth' },
  neutral: { color: colors.textSecondary, icon: 'dot' },
};

/**
 * Status pill. Tone is shown by color *and* icon + text, never color alone.
 * @param {{ label: string, tone?: keyof typeof TONES, icon?: string, style?: any }} props
 */
export function Pill({ label, tone = 'neutral', icon, style }) {
  const t = TONES[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.pill, { borderColor: t.color }, style]}
    >
      <Icon name={icon || t.icon} size={18} color={t.color} strokeWidth={2.5} />
      <Text variant="label" color={colors.text} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.glassStrong,
    alignSelf: 'flex-start',
  },
  text: { letterSpacing: 1 },
});

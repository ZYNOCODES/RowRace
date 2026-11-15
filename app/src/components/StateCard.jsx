import { StyleSheet, View } from 'react-native';
import { Button, Card, Icon, Text } from './ui';
import { colors, space } from '../theme/tokens';

const TONE_COLOR = {
  info: colors.primary,
  warning: colors.warning,
  danger: colors.danger,
  success: colors.success,
};

/**
 * Empty / loading / error / permission state. Always offers a next step (actions).
 * @param {{ icon?: string, tone?: keyof typeof TONE_COLOR, title: string, message?: string,
 *   tips?: string[], actions?: { label: string, onPress: () => void, variant?: string }[],
 *   children?: any, style?: any }} props
 */
export function StateCard({
  icon = 'warning',
  tone = 'info',
  title,
  message,
  tips,
  actions = [],
  children,
  style,
}) {
  const color = TONE_COLOR[tone];
  return (
    <Card style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={[styles.badge, { borderColor: color }]}>
          <Icon name={icon} size={32} color={color} />
        </View>
        <Text variant="heading" style={styles.title}>
          {title}
        </Text>
      </View>
      {message ? (
        <Text variant="body" color={colors.textSecondary}>
          {message}
        </Text>
      ) : null}
      {tips?.length ? (
        <View style={styles.tips}>
          {tips.map((tip) => (
            <View key={tip} style={styles.tip}>
              <Icon name="chevronRight" size={20} color={colors.primary} />
              <Text variant="body" style={styles.tipText}>
                {tip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {children}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Button
              key={a.label}
              label={a.label}
              onPress={a.onPress}
              variant={a.variant || (i === 0 ? 'primary' : 'secondary')}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  tips: { gap: space.xs },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tipText: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs },
});

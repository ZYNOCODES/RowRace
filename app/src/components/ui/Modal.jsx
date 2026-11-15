import { Modal as RNModal, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../theme/tokens';
import { Button } from './Button';
import { Text } from './Text';

/**
 * Centered dialog. Every dialog offers a way forward: pass at least one action.
 * @param {{ visible: boolean, title: string, message?: string, children?: any,
 *   actions: { label: string, onPress: () => void, variant?: string }[], onRequestClose?: () => void }} props
 */
export function Modal({ visible, title, message, children, actions, onRequestClose }) {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text variant="title">{title}</Text>
          {message ? (
            <Text variant="body" color={colors.textSecondary}>
              {message}
            </Text>
          ) : null}
          {children}
          <View style={styles.actions}>
            {actions.map((a) => (
              <Button
                key={a.label}
                label={a.label}
                variant={a.variant || 'secondary'}
                onPress={a.onPress}
                style={styles.action}
              />
            ))}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    backgroundColor: colors.elevated,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: space.xl,
    gap: space.md,
  },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm, justifyContent: 'flex-end' },
  action: { minWidth: 160 },
});

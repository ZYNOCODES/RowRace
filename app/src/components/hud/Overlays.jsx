import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button, GlassPanel, Icon, Text } from '../ui';
import { useT } from '../../i18n';
import { colors, space } from '../../theme/tokens';

/** Huge animated countdown number (5…1, then GO). */
export function CountdownOverlay({ value }) {
  const { t } = useT();
  const s = useSharedValue(0.4);
  const o = useSharedValue(0);
  useEffect(() => {
    s.value = withSequence(
      withTiming(1.25, { duration: 0 }),
      withSpring(1, { damping: 12, stiffness: 180 }),
    );
    o.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.85, { duration: 700 }));
  }, [value, s, o]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: o.value }));
  if (value == null) return null;
  const go = value <= 0;
  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View style={style}>
        <Text variant="statXl" color={go ? colors.success : colors.text} style={styles.count}>
          {go ? t('race.go') : value}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Signal lost: race paused, reconnecting; after 60 s offer End race / Keep waiting. */
export function PausedOverlay({ pausedForMs, offerEnd, onEnd, onKeepWaiting }) {
  const { t } = useT();
  return (
    <View style={styles.center}>
      <GlassPanel strong style={styles.paused}>
        <Icon name="refresh" size={40} color={colors.warning} />
        <Text variant="title">{t('race.reconnecting')}</Text>
        <Text variant="body" color={colors.textSecondary}>
          {t('race.pausedFor', { seconds: Math.round(pausedForMs / 1000) })}
        </Text>
        <Text variant="bodySecondary" align="center">
          {t('race.pausedHint')}
        </Text>
        {offerEnd && (
          <View style={styles.actions}>
            <Button label={t('race.keepWaiting')} variant="secondary" onPress={onKeepWaiting} />
            <Button label={t('race.endRace')} variant="danger" onPress={onEnd} />
          </View>
        )}
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 160, lineHeight: 172, textShadowColor: '#000C', textShadowRadius: 16 },
  paused: { alignItems: 'center', gap: space.sm, padding: space.xl, maxWidth: 560 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
});

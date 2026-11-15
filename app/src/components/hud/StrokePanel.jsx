import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { format } from '@rowrace/shared';
import { GlassPanel, Icon, Text } from '../ui';
import { sourceManager } from '../../services';
import { useT } from '../../i18n';
import { colors, space } from '../../theme/tokens';

/**
 * Stroke rate (accent color) with a small pulse on every real stroke, heart rate when a belt
 * is connected, and the target panel when there is a target pace.
 * @param {{ spm: number, heartRate: number|null, targetPace?: number|null }} props
 */
export function StrokePanel({ spm, heartRate, targetPace }) {
  const { t } = useT();
  const pulse = useSharedValue(1);
  useEffect(
    () =>
      sourceManager.on('stroke', () => {
        pulse.value = withSequence(
          withTiming(1.12, { duration: 90 }),
          withTiming(1, { duration: 220 }),
        );
      }),
    [pulse],
  );
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View style={styles.col}>
      {targetPace ? (
        <GlassPanel strong style={styles.target}>
          <Text variant="label">{t('hud.target')}</Text>
          <Text variant="statSm">{format.formatPace(targetPace)} /500 m</Text>
        </GlassPanel>
      ) : null}
      <GlassPanel strong style={styles.panel}>
        <Animated.View style={style}>
          <Text
            variant="statLg"
            color={colors.accent}
            accessibilityLabel={`${spm} ${t('hud.strokeRate')}`}
          >
            {spm || 0}
          </Text>
        </Animated.View>
        <Text variant="label" color={colors.accent}>
          {t('hud.spm')}
        </Text>
        {heartRate ? (
          <View style={styles.hr}>
            <Icon name="heart" size={22} color={colors.danger} />
            <Text variant="statSm">{heartRate}</Text>
          </View>
        ) : null}
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.sm, alignItems: 'flex-start' },
  target: { paddingVertical: space.xs },
  panel: { alignItems: 'center', minWidth: 150 },
  hr: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xxs },
});

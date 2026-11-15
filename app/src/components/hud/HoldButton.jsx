import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon, Text } from '../ui';
import { colors, radius, space, touch } from '../../theme/tokens';

/**
 * Press-and-hold button (avoids accidental taps with sweaty hands): a bar fills while held and
 * `onConfirm` fires after `holdMs`.
 */
export function HoldButton({
  label,
  icon = 'close',
  onConfirm,
  holdMs = 1000,
  tone = colors.danger,
}) {
  const fill = useSharedValue(0);
  const timer = useRef(null);
  const start = () => {
    fill.value = withTiming(1, { duration: holdMs, easing: Easing.linear });
    timer.current = setTimeout(() => {
      timer.current = null;
      onConfirm();
    }, holdMs);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cancelAnimation(fill);
    fill.value = withTiming(0, { duration: 150 });
  };
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Hold"
      style={[styles.btn, { borderColor: tone }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: tone }, bar]} />
      <View style={styles.row}>
        <Icon name={icon} color={colors.text} />
        <Text variant="button" color={colors.text}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: touch.min,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: colors.glassStrong,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { ...StyleSheet.absoluteFillObject, right: undefined, opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});

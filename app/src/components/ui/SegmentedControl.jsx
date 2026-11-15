import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { colors, motion, radius, touch } from '../../theme/tokens';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

const PAD = 4;

/**
 * Segmented control with a sliding highlight.
 * @template T
 * @param {{ options: { value: T, label: string }[], value: T, onChange: (v: T) => void, style?: any }} props
 */
export function SegmentedControl({ options, value, onChange, style }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;

  const thumb = useAnimatedStyle(() => ({
    width: segment,
    transform: [{ translateX: withSpring(index * segment, motion.spring) }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segment > 0 && <Animated.View style={[styles.thumb, thumb]} />}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <PressableScale
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={styles.segment}
          >
            <Text variant="button" color={selected ? colors.onFill : colors.text}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.elevated,
    borderRadius: radius.pill,
    padding: PAD,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  segment: {
    flex: 1,
    minHeight: touch.min - PAD * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

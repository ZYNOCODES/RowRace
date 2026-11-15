import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme/tokens';

/**
 * Original, simplified drawing of a rowing monitor with its menu open and the Connect entry
 * highlighted; a Bluetooth wave pulses beside it. Not a reproduction of the real PM5 UI.
 */
export function PM5Illustration({ width = 300 }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);
  const wave = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 0.6 + pulse.value * 0.9 }],
  }));
  const h = width * 1.05;

  return (
    <View
      style={{ width, height: h }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={h} viewBox="0 0 200 210">
        {/* body */}
        <Rect
          x={20}
          y={10}
          width={150}
          height={190}
          rx={16}
          fill={colors.elevated}
          stroke={colors.divider}
          strokeWidth={2}
        />
        {/* screen */}
        <Rect x={34} y={24} width={122} height={110} rx={6} fill="#C9D6C3" />
        <G>
          {['Just Row', 'Workouts', 'Games'].map((label, i) => (
            <SvgText
              key={label}
              x={44}
              y={46 + i * 20}
              fontSize={11}
              fill="#2B3A2A"
              fontWeight="600"
            >
              {label}
            </SvgText>
          ))}
          <Rect x={38} y={98} width={114} height={22} rx={4} fill="#2B3A2A" />
          <SvgText x={44} y={113} fontSize={11} fill="#C9D6C3" fontWeight="700">
            Connect
          </SvgText>
          <Path
            d="M136 103l6 5-3 3V100l3 3-6 5"
            stroke="#C9D6C3"
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
          />
        </G>
        {/* buttons */}
        {[0, 1, 2, 3, 4].map((i) => (
          <Rect
            key={i}
            x={36 + i * 24}
            y={148}
            width={18}
            height={10}
            rx={3}
            fill={colors.surface}
            stroke={colors.divider}
          />
        ))}
        <Circle
          cx={95}
          cy={180}
          r={9}
          fill={colors.surface}
          stroke={colors.primary}
          strokeWidth={2}
        />
      </Svg>
      <Animated.View style={[styles.wave, { left: width * 0.78, top: width * 0.48 }, wave]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wave: {
    position: 'absolute',
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.primary,
  },
});

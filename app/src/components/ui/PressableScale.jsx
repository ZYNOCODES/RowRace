import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with the subtle press-scale feedback used by every tappable surface. */
export function PressableScale({
  style,
  disabled,
  children,
  scaleTo = motion.pressScale,
  ...rest
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => (scale.value = withSpring(scaleTo, motion.spring))}
      onPressOut={() => (scale.value = withSpring(1, motion.spring))}
      style={[style, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

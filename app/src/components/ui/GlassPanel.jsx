import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, space } from '../../theme/tokens';

/**
 * Translucent panel. Real blur is used on iOS, and on Android only when `blur` is set,
 * because Android blur is costly and the race HUD must hold 60 fps over the 3D scene.
 * `strong` uses the darker HUD glass (keeps accent text ≥ 4.5:1 over a bright sky).
 * @param {{ strong?: boolean, blur?: boolean, style?: any, children?: any }} props
 */
export function GlassPanel({ strong, blur, style, children }) {
  const bg = strong ? colors.glassStrong : colors.glass;
  const useBlur = Platform.OS === 'ios' || blur;
  return (
    <View style={[styles.panel, { backgroundColor: useBlur ? 'transparent' : bg }, style]}>
      {useBlur && (
        <BlurView
          intensity={30}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: space.md,
    overflow: 'hidden',
  },
});

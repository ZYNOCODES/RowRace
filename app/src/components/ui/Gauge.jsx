import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme/tokens';

/**
 * Circular ring gauge with content in the middle (pace + watts in the race HUD).
 * The ring covers 270°, open at the bottom.
 * @param {{ size?: number, thickness?: number, progress: number, color?: string,
 *   trackColor?: string, children?: any, style?: any }} props
 */
export function Gauge({
  size = 220,
  thickness = 14,
  progress,
  color = colors.primary,
  trackColor = colors.divider,
  children,
  style,
}) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const common = {
    cx: size / 2,
    cy: size / 2,
    r,
    strokeWidth: thickness,
    fill: 'none',
    strokeLinecap: 'round',
    // Start at 135° (bottom-left) so the gap sits at the bottom.
    transform: `rotate(135 ${size / 2} ${size / 2})`,
  };
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle {...common} stroke={trackColor} strokeDasharray={`${arc} ${circumference}`} />
        <Circle {...common} stroke={color} strokeDasharray={`${arc * p} ${circumference}`} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});

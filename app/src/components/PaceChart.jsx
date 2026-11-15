import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { format } from '@rowrace/shared';
import { colors, fonts } from '../theme/tokens';

/**
 * Pace over distance (lower = faster, so faster is drawn higher). Optional target line.
 * @param {{ series: { d: number, pace: number }[], target?: number|null, width?: number, height?: number }} props
 */
export function PaceChart({ series, target, width = 560, height = 200 }) {
  if (series.length < 2) return null;
  const pad = { l: 56, r: 12, t: 12, b: 26 };
  const paces = series.map((p) => p.pace).concat(target ? [target] : []);
  const lo = Math.floor(Math.min(...paces) - 3);
  const hi = Math.ceil(Math.max(...paces) + 3);
  const maxD = series[series.length - 1].d * (1 + 1 / (series.length * 2));
  const x = (d) => pad.l + (d / maxD) * (width - pad.l - pad.r);
  const y = (p) => pad.t + ((p - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);
  const path = series
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.pace).toFixed(1)}`)
    .join(' ');
  const label = { fill: colors.textSecondary, fontSize: 12, fontFamily: fonts.numeric };
  return (
    <View style={styles.wrap} accessibilityLabel="Pace over distance chart">
      <Svg width={width} height={height}>
        {[lo, (lo + hi) / 2, hi].map((p) => (
          <SvgText key={p} x={pad.l - 8} y={y(p) + 4} textAnchor="end" {...label}>
            {format.formatPace(p)}
          </SvgText>
        ))}
        <Line
          x1={pad.l}
          x2={width - pad.r}
          y1={height - pad.b}
          y2={height - pad.b}
          stroke={colors.divider}
        />
        {target ? (
          <Line
            x1={pad.l}
            x2={width - pad.r}
            y1={y(target)}
            y2={y(target)}
            stroke={colors.accent}
            strokeDasharray="6 6"
            strokeWidth={1.5}
          />
        ) : null}
        <Path d={path} stroke={colors.primary} strokeWidth={3} fill="none" strokeLinejoin="round" />
        <SvgText x={pad.l} y={height - 6} {...label}>
          0 m
        </SvgText>
        <SvgText x={width - pad.r} y={height - 6} textAnchor="end" {...label}>
          {`${Math.round(series[series.length - 1].d * (1 + 1 / (series.length * 2)))} m`}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignSelf: 'flex-start' } });

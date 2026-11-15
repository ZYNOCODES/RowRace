import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';

/** Original stroke icons, 24×24 grid. Kept tiny on purpose: add paths here as needed. */
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  warning: 'M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.2v.3',
  bluetooth: 'M7 7.5l10 9-5 4.5V3l5 4.5-10 9',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  play: 'M7 4.5v15l12-7.5-12-7.5z',
  pause: 'M8 5v14M16 5v14',
  settings:
    'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z',
  history: 'M3.5 12a8.5 8.5 0 102.5-6M3.5 4v4h4M12 7.5V12l3 2',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.5 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z',
  wave: 'M2 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M2 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  timer: 'M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4.5M9.5 2.5h5',
  refresh: 'M20 11a8 8 0 10-2.3 6.3M20 4v7h-7',
  share: 'M12 3v12M7.5 7.5L12 3l4.5 4.5M5 13v6.5h14V13',
  trash: 'M4 7h16M9.5 7V4h5v3M6.5 7l1 13h9l1-13',
  marker: 'M12 21s6.5-6.1 6.5-11A6.5 6.5 0 005.5 10c0 4.9 6.5 11 6.5 11z',
};

/**
 * @param {{ name: keyof typeof PATHS | 'dot', size?: number, color?: string, strokeWidth?: number }} props
 */
export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }) {
  if (name === 'dot') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={6} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

import { Text as RNText } from 'react-native';
import { type } from '../../theme/tokens';

/** Max font scaling the layouts are designed for. */
export const MAX_FONT_SCALE = 1.3;

/**
 * Themed text. `variant` picks a typography token from theme/tokens.js.
 * @param {{ variant?: keyof typeof type, color?: string, align?: 'left'|'center'|'right', style?: any, children?: any }} props
 */
export function Text({ variant = 'body', color, align, style, children, ...rest }) {
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[type[variant], color && { color }, align && { textAlign: align }, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

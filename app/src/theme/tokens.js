/**
 * Design tokens. Dark theme by default: water and sky stand out, less glare on a tablet.
 * Every text/background pair used by components is checked for WCAG AA in theme/contrast.test.js.
 */

export const colors = {
  background: '#0A0F1C',
  surface: '#121A2B',
  elevated: '#1A2438',

  glass: 'rgba(10, 15, 28, 0.55)',
  /** HUD panels: dark enough that accent text keeps 4.5:1 even over a bright sky. */
  glassStrong: 'rgba(10, 15, 28, 0.85)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  divider: 'rgba(255, 255, 255, 0.10)',
  scrim: 'rgba(5, 8, 15, 0.72)',

  primary: '#22D3EE',
  primaryDeep: '#0EA5B7',
  accent: '#FF7A1A',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',

  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  /** Text drawn on top of primary / accent / success fills. */
  onFill: '#0A0F1C',
};

/** 8-pt grid. */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };

export const radius = { sm: 12, md: 16, card: 20, pill: 999 };

/** Minimum touch target in dp (sweaty hands, tablet ~1 m away). */
export const touch = { min: 64, compact: 48 };

export const fonts = {
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemibold: 'Inter_600SemiBold',
  uiBold: 'Inter_700Bold',
  numeric: 'SpaceGrotesk_500Medium',
  numericBold: 'SpaceGrotesk_700Bold',
};

const tabular = { fontVariant: ['tabular-nums'] };

export const type = {
  display: { fontFamily: fonts.uiBold, fontSize: 40, lineHeight: 48, color: colors.text },
  title: { fontFamily: fonts.uiBold, fontSize: 28, lineHeight: 34, color: colors.text },
  heading: { fontFamily: fonts.uiSemibold, fontSize: 22, lineHeight: 28, color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 18, lineHeight: 26, color: colors.text },
  bodySecondary: {
    fontFamily: fonts.ui,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  button: { fontFamily: fonts.uiSemibold, fontSize: 20, lineHeight: 24 },
  label: {
    fontFamily: fonts.uiSemibold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  /** Race numbers: 48–96 pt, tabular so digits don't jump. */
  statSm: {
    fontFamily: fonts.numericBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
    ...tabular,
  },
  stat: {
    fontFamily: fonts.numericBold,
    fontSize: 48,
    lineHeight: 56,
    color: colors.text,
    ...tabular,
  },
  statLg: {
    fontFamily: fonts.numericBold,
    fontSize: 72,
    lineHeight: 80,
    color: colors.text,
    ...tabular,
  },
  statXl: {
    fontFamily: fonts.numericBold,
    fontSize: 96,
    lineHeight: 104,
    color: colors.text,
    ...tabular,
  },
  mono: { fontFamily: fonts.numeric, fontSize: 14, lineHeight: 18, color: colors.text, ...tabular },
};

export const motion = {
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  fast: 200,
  normal: 260,
  slow: 300,
  pressScale: 0.96,
};

export const theme = { colors, space, radius, touch, fonts, type, motion };
export default theme;

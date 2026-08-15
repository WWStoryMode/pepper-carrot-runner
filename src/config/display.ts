/**
 * Display constants.
 *
 * The original libGDX game rendered at a fixed 1280x720 with a letterboxing
 * FitViewport. We keep that as the design resolution for now; M6 replaces the
 * FIT scale mode with a fixed design *height* and a variable width so that wide
 * screens see more of the world instead of black bars.
 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** Palette lifted from the original's `skin.json`. */
export const COLORS = {
  white: '#F1E6D5',
  black: '#110410',
  darkBrown: '#432B2B',
  lightBrown: '#D0A381',
  brown: '#4C2920',
  grey: '#7D7D7D',
  skillGreen: '#A5FF30',
  skillOrange: '#FFAC0E',
  skillBlue: '#26CDFF',
} as const;

/** `?debug=1` enables the debug overlay introduced in M1. */
export const DEBUG = new URLSearchParams(globalThis.location?.search ?? '').get('debug') === '1';

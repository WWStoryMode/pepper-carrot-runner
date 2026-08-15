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

const params = new URLSearchParams(globalThis.location?.search ?? '');

/** `?debug=1` enables the debug overlay introduced in M1. */
export const DEBUG = params.get('debug') === '1';

/**
 * `?autopilot=1` lets the bot from `sim/autopilot` play.
 *
 * A development affordance for watching a course run start to finish without
 * holding the jump key, and for eyeballing generated chunk sequences in M3.
 */
export const AUTOPILOT = params.get('autopilot') === '1';

/**
 * `?x=<worldX>` starts the run at a given position.
 *
 * Saves replaying the whole course to look at one section — the reason it
 * exists now, and what makes inspecting a specific generated chunk practical
 * in M3.
 */
export const START_X: number | null = (() => {
  const raw = params.get('x');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
})();

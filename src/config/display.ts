/**
 * Display configuration.
 *
 * The original rendered at a fixed 1280×720 and letterboxed with a libGDX
 * `FitViewport`, so a wide monitor got black bars. Here the design **height**
 * is fixed and the width follows the window's aspect ratio, so wider screens
 * see more of the world rather than more nothing.
 */

/**
 * Vertical extent of the world, in design units.
 *
 * Raised from the original's 720 after playtest feedback that the camera sat
 * too close to Pepper: the same screen now covers more world, which is a zoom
 * out in everything but name.
 */
export const DESIGN_HEIGHT = 820;

/** Fallback width, used before a window has been measured. */
export const DESIGN_WIDTH = 1456;

/** Clamps on design width, so extreme aspect ratios stay playable. */
const MIN_WIDTH = 1100;
const MAX_WIDTH = 2400;

/**
 * Design size for a given viewport.
 *
 * Height is constant and width tracks the aspect ratio. Phaser scales the whole
 * thing to fit, so there is no letterboxing on ordinary screens and no
 * per-object scaling to reason about.
 */
export function designSizeFor(
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const aspect = viewportHeight > 0 ? viewportWidth / viewportHeight : 16 / 9;
  const width = Math.round(DESIGN_HEIGHT * aspect);

  return {
    width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)),
    height: DESIGN_HEIGHT,
  };
}

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
 * holding the jump key, and for eyeballing generated chunk sequences.
 */
export const AUTOPILOT = params.get('autopilot') === '1';

/**
 * `?charged=1` starts every ability fully charged.
 *
 * Otherwise a spell can only be seen after collecting the potions for it, which
 * makes checking the effects tedious.
 */
export const START_CHARGED = params.get('charged') === '1';

/**
 * `?x=<worldX>` starts the run at a given position.
 *
 * Saves replaying to reach one section — what makes inspecting a specific
 * generated chunk practical.
 */
export const START_X: number | null = (() => {
  const raw = params.get('x');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
})();

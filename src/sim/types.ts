/**
 * Simulation types.
 *
 * Everything under `src/sim/` is pure TypeScript with no Phaser import, so the
 * physics can be unit tested headlessly and stays independent of the renderer.
 *
 * World coordinates are **Y-up**, matching the original libGDX game. The
 * renderer flips to Phaser's Y-down space.
 */

export type RunnerState = 'running' | 'jumping' | 'doubleJumping' | 'falling' | 'dying';

/**
 * A one-way platform.
 *
 * `y` is the **top** surface — the only side that collides. The body extends
 * downward by `height`, which exists purely so the debug view can draw it.
 */
export interface Platform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A snapshot of the runner, used to interpolate between fixed steps. */
export interface RunnerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly state: RunnerState;
}

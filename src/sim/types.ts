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

/** What ended the run, for the game-over message. */
export type DeathCause = 'pit' | 'crash' | 'hazard' | 'enemies' | null;

/**
 * A platform.
 *
 * `y` is the **top** surface, and the body extends downward by `height`.
 * The top is one-way — solid only to a body descending onto it — while the
 * vertical faces are solid to anything entering from the side.
 */
export interface Platform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Set on the synthetic floor so its edges do not count as walls.
   *
   * Without it, falling into a gap and clipping the far lip would be reported
   * as a crash when the player has plainly just fallen down a hole.
   */
  readonly noSides?: boolean;
}

export type EntityKind = 'enemy' | 'potion' | 'ingredient' | 'hazard';

/**
 * A thing in the world that the player can touch.
 *
 * Positions are centres, matching the original, which placed entities at
 * `((col + 0.5) * tileWidth, (row + 0.5) * tileHeight)`.
 */
export interface SimEntity {
  readonly id: number;
  readonly kind: EntityKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** Enemies only: cleared when killed. */
  alive: boolean;
  /**
   * One-shot contact latch.
   *
   * The original gave every enemy an `alreadyCollidedWPlayer` flag instead of
   * an invulnerability window, so each one could hurt you exactly once. That is
   * a neat solution to overlapping frames and is kept.
   */
  touched: boolean;
  /** Pickups only: cleared from the world once taken. */
  collected: boolean;
}

/** A snapshot of the runner, used to interpolate between fixed steps. */
export interface RunnerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly state: RunnerState;
}

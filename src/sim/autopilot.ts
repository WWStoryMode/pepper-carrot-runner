import { PLAYER_WIDTH } from '@/config/constants';
import { overlapsHorizontally } from './collision';
import type { Runner } from './Runner';
import type { Platform } from './types';

/**
 * A crude bot that plays the runner.
 *
 * Not an AI opponent and not shipped in the game — it exists so a course can be
 * proven traversable by the actual simulation rather than by eyeballing it. M3
 * uses this to reject generated chunk sequences that contain unclearable gaps.
 *
 * The strategy is deliberately dumb, because a course that needs a clever bot
 * needs frame-perfect input from a human too.
 */

/** How far ahead to look for missing ground before committing to a jump. */
const GROUND_LOOKAHEAD = 170;

/** How far ahead to consider a platform as the intended landing target. */
const TARGET_RANGE = 900;

const EPSILON = 1;

/** Is there a surface at this exact height spanning `x`? */
function supportAt(x: number, y: number, platforms: readonly Platform[]): boolean {
  return platforms.some(
    (p) => Math.abs(p.y - y) < EPSILON && x > p.x && x < p.x + p.width,
  );
}

/** The nearest surface ahead of `x` that the runner has not already passed. */
function targetAhead(x: number, platforms: readonly Platform[]): Platform | null {
  let best: Platform | null = null;

  for (const platform of platforms) {
    const rightEdge = platform.x + platform.width;
    if (rightEdge <= x + PLAYER_WIDTH / 2) continue;
    if (platform.x > x + TARGET_RANGE) continue;
    if (overlapsHorizontally(x, PLAYER_WIDTH / 2, platform)) continue;

    if (best === null || platform.x < best.x) best = platform;
  }

  return best;
}

/** Decide whether to jump this step. */
export function shouldJump(runner: Runner, platforms: readonly Platform[]): boolean {
  if (runner.isDead) return false;

  if (runner.isGrounded) {
    // Jump when the ground we are standing on is about to run out.
    return !supportAt(runner.x + GROUND_LOOKAHEAD, runner.y, platforms);
  }

  // Airborne: spend the air jump if we are falling below the surface we are
  // aiming for and still have one left.
  if (runner.airJumps <= 0) return false;
  if (runner.vy >= 0) return false;

  const target = targetAhead(runner.x, platforms);
  if (target === null) return false;

  return runner.y < target.y;
}

export interface AutopilotResult {
  readonly reachedX: number;
  readonly died: boolean;
  readonly jumps: number;
  readonly steps: number;
}

/** Run the bot until it dies, reaches `finishX`, or exhausts `maxSteps`. */
export function runAutopilot(
  runner: Runner,
  platforms: readonly Platform[],
  finishX: number,
  dt: number,
  maxSteps = 20_000,
): AutopilotResult {
  let jumps = 0;
  let steps = 0;

  for (; steps < maxSteps; steps += 1) {
    if (runner.isDead || runner.x >= finishX) break;

    if (shouldJump(runner, platforms)) {
      runner.jump();
      jumps += 1;
    }

    runner.step(dt, platforms);
  }

  return { reachedX: runner.x, died: runner.isDead, jumps, steps };
}

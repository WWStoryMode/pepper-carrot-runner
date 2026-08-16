import { PLAYER_HEIGHT, PLAYER_WIDTH } from '@/config/constants';
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

/** Resolution and reach of the forward scan for gaps. */
const SCAN_STEP = 15;
const SCAN_RANGE = 1000;

/**
 * How far before the far lip of a gap to commit to the jump.
 *
 * A single jump covers ~340 px, so taking off 300 px out leaves 40 px of slack.
 * Jumping *early* is the failure mode worth avoiding: leave too much margin and
 * the bot lands back on the near side and has to try again, which looks like a
 * stall.
 */
const SAFE_REACH = 300;

const EPSILON = 1;

/** Is there a surface at this exact height spanning `x`? */
function supportAt(x: number, y: number, platforms: readonly Platform[]): boolean {
  return platforms.some(
    (p) => Math.abs(p.y - y) < EPSILON && x > p.x && x < p.x + p.width,
  );
}

/** Is there anything at all to land on beneath this position? */
function hasSupportBelow(x: number, feet: number, platforms: readonly Platform[]): boolean {
  for (const platform of platforms) {
    if (platform.y > feet + EPSILON) continue;
    if (x <= platform.x || x >= platform.x + platform.width) continue;
    return true;
  }
  return false;
}

/**
 * Locate the next hole in the surface the runner is standing on.
 *
 * Returns where it starts and where solid ground resumes, so the caller can
 * time the takeoff against the jump arc rather than against a fixed lookahead.
 */
function findGapAhead(
  x: number,
  y: number,
  platforms: readonly Platform[],
): { edgeX: number; landX: number } | null {
  let edgeX = -1;

  for (let offset = 0; offset <= SCAN_RANGE; offset += SCAN_STEP) {
    if (!supportAt(x + offset, y, platforms)) {
      edgeX = x + offset;
      break;
    }
  }

  if (edgeX < 0) return null;

  for (let probe = edgeX; probe <= x + SCAN_RANGE; probe += SCAN_STEP) {
    if (supportAt(probe, y, platforms)) return { edgeX, landX: probe };
  }

  // Nothing found within reach — treat it as a drop and jump on the arc anyway.
  return { edgeX, landX: edgeX + 300 };
}

/** How far ahead a wall is worth reacting to. */
const WALL_RANGE = 400;

/**
 * Commit to the jump once the wall is this close.
 *
 * The clearance window is wide — a 95 px step is cleared from 25 px out all the
 * way to 320 px out — so this only has to sit comfortably inside it.
 */
const WALL_COMMIT = 200;

/**
 * The nearest platform face the runner would actually crash into.
 *
 * The test is whether the runner's *body* would intersect the platform's body
 * at the current height — not merely whether the platform is higher. Many of
 * the original's shelves sit five rows up, well above head height; the runner
 * passes safely underneath them, and treating those as walls makes the bot leap
 * into the very thing it was avoiding.
 */
function findWallAhead(
  x: number,
  feet: number,
  halfWidth: number,
  platforms: readonly Platform[],
): number | null {
  const head = feet + PLAYER_HEIGHT;
  let nearest: number | null = null;

  for (const platform of platforms) {
    if (platform.noSides === true) continue;

    const top = platform.y;
    const bottom = platform.y - platform.height;

    // Standing height clears it, or it is entirely overhead.
    if (top <= feet + EPSILON) continue;
    if (bottom >= head) continue;

    const face = platform.x;
    if (face <= x + halfWidth) continue;
    if (face - x > WALL_RANGE) continue;

    if (nearest === null || face < nearest) nearest = face;
  }

  return nearest;
}

/** Decide whether to jump this step. */
export function shouldJump(runner: Runner, platforms: readonly Platform[]): boolean {
  if (runner.isDead) return false;

  if (runner.isGrounded) {
    const halfWidth = PLAYER_WIDTH / 2;

    // Walls first: crashing is immediate, whereas a gap gives you the whole
    // arc to get it right.
    const wall = findWallAhead(runner.x, runner.y, halfWidth, platforms);
    if (wall !== null && wall - (runner.x + halfWidth) <= WALL_COMMIT) return true;

    const gap = findGapAhead(runner.x, runner.y, platforms);
    if (gap === null) return false;
    return runner.x >= gap.landX - SAFE_REACH;
  }

  if (runner.airJumps <= 0) return false;

  const halfWidth = PLAYER_WIDTH / 2;

  // A face can be flown into as easily as run into, and mid-air the runner has
  // less room to recover — so check for walls before anything else, whether
  // rising or falling.
  const wall = findWallAhead(runner.x, runner.y, halfWidth, platforms);
  if (wall !== null && wall - (runner.x + halfWidth) <= WALL_COMMIT) return true;

  if (runner.vy >= 0) return false;

  // Otherwise the air jump is only for avoiding a fall into nothing. An earlier
  // version spent it trying to reach whatever platform was next, which meant
  // launching at head-height shelves it could never land on and flying into
  // them instead of running underneath.
  return !hasSupportBelow(runner.x, runner.y, platforms);
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

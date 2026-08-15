import type { Platform } from '@/sim/types';

/**
 * Hand-authored greybox course for M1.
 *
 * Exists to make the jump arc measurable by feel, not to be fun. M3 replaces it
 * with chunks streamed from the original's TMX data.
 *
 * Sizing is derived from the jump arc: a single jump rises **325 px** and stays
 * airborne ~0.85 s, covering ~340 px at the 400 px/s run speed. A double jump
 * taken at the apex reaches ~650 px and covers ~587 px. Gaps below are chosen
 * against those numbers, so if the physics drift the course becomes unclearable
 * — which is the point.
 */

const TILE = 95;
const GROUND_DEPTH = 220;

function slab(x: number, width: number, top: number, height = TILE): Platform {
  return { x, y: top, width, height };
}

function ground(x: number, width: number): Platform {
  return slab(x, width, 0, GROUND_DEPTH);
}

export const TEST_LEVEL: readonly Platform[] = [
  // Flat opening — settle in, confirm the run reads as steady.
  ground(0, 1200),

  // 180 px gap: comfortably inside a single jump.
  ground(1380, 620),

  // 300 px gap: near the single-jump limit of ~340 px.
  ground(2300, 600),

  // Ascending ledges. Each rise is well under the 325 px apex, so the challenge
  // is timing rather than height.
  slab(3050, 260, 130),
  slab(3480, 260, 260),
  slab(3910, 300, 390),

  // Directly above the ledge below it: jumping from 390 peaks at 715, so the
  // player passes up *through* this platform and lands on it coming down.
  // The one-way test in `findLanding` is what makes that work.
  slab(3910, 300, 700),

  // Long drop back to ground level.
  ground(4500, 700),

  // 480 px gap — unclearable with a single jump, comfortable with two.
  ground(5680, 800),

  // Elevated island after a 420 px gap.
  slab(6900, 400, 200),

  ground(7600, 900),

  // Two quick stepping stones; punishes over-jumping as much as under-jumping.
  slab(8800, 300, 300),
  slab(9300, 300, 150),

  ground(9800, 1200),

  // ...and then nothing. The course ends in a pit, because in this version
  // falling kills — see DEATH_PLANE in config/constants.
];

/** Where the runner's feet start. */
export const TEST_LEVEL_START = { x: 120, y: 0 } as const;

/** Right edge of the last platform, for the debug readout. */
export const TEST_LEVEL_END = 11000;

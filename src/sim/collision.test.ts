import { describe, expect, it } from 'vitest';
import { FIXED_DT, PLAYER_WIDTH } from '@/config/constants';
import { findLanding, overlapsHorizontally } from './collision';
import { Runner } from './Runner';
import type { Platform } from './types';

const HALF = PLAYER_WIDTH / 2;
const LEDGE: Platform = { x: 0, y: 100, width: 200, height: 95 };

describe('overlapsHorizontally', () => {
  it('requires genuine overlap on both sides', () => {
    expect(overlapsHorizontally(100, HALF, LEDGE)).toBe(true);
    expect(overlapsHorizontally(-200, HALF, LEDGE)).toBe(false);
    expect(overlapsHorizontally(400, HALF, LEDGE)).toBe(false);
  });

  it('is false exactly at the edges, where the bodies only touch', () => {
    expect(overlapsHorizontally(LEDGE.x - HALF, HALF, LEDGE)).toBe(false);
    expect(overlapsHorizontally(LEDGE.x + LEDGE.width + HALF, HALF, LEDGE)).toBe(false);
  });

  // The original's test used `||`, which is true for almost any input. Guarding
  // against a regression to that behaviour.
  it('rejects a platform the body is nowhere near', () => {
    const distant: Platform = { x: 10_000, y: 100, width: 200, height: 95 };
    expect(overlapsHorizontally(100, HALF, distant)).toBe(false);
  });
});

describe('findLanding', () => {
  it('lands when the feet cross the surface from above', () => {
    expect(findLanding(120, 90, 100, HALF, [LEDGE])).toBe(100);
  });

  it('does not land while rising', () => {
    expect(findLanding(90, 120, 100, HALF, [LEDGE])).toBeNull();
  });

  it('passes upward through a platform — they are one-way', () => {
    // Feet travel from below the surface to above it.
    expect(findLanding(50, 150, 100, HALF, [LEDGE])).toBeNull();
  });

  it('ignores platforms that are not horizontally overlapped', () => {
    expect(findLanding(120, 90, 500, HALF, [LEDGE])).toBeNull();
  });

  it('picks the highest qualifying surface', () => {
    const stack: Platform[] = [
      { x: 0, y: 0, width: 200, height: 95 },
      { x: 0, y: 60, width: 200, height: 95 },
      { x: 0, y: 30, width: 200, height: 95 },
    ];
    expect(findLanding(100, -10, 100, HALF, stack)).toBe(60);
  });

  it('keeps a resting body attached across steps', () => {
    // Standing still, gravity nudges the feet a fraction below the surface.
    expect(findLanding(100, 99.7, 100, HALF, [LEDGE])).toBe(100);
  });
});

/** Drop from a height and report where the feet come to rest, if anywhere. */
function dropOnto(platforms: readonly Platform[], from = 3000): Runner {
  const runner = new Runner();
  runner.reset(100, from);

  for (let i = 0; i < 600; i += 1) {
    runner.step(FIXED_DT, platforms);
    if (runner.isGrounded) break;
  }

  return runner;
}

describe('tunnelling', () => {
  // The original acknowledged this as a FIXME and only mitigated it by capping
  // fall speed. The swept test removes the failure mode entirely.
  it('catches a platform even at terminal velocity', () => {
    const runner = dropOnto([{ x: 0, y: 0, width: 4000, height: 95 }]);

    expect(runner.isGrounded).toBe(true);
    expect(runner.y).toBe(0);
  });

  it('does not fall through a thin platform mid-drop', () => {
    // A single tile suspended in a long fall. Its 10 px depth is far less than
    // the ~26 px the feet travel per step at terminal velocity, so a naive
    // overlap test would miss it entirely.
    const runner = dropOnto([{ x: 0, y: 500, width: 4000, height: 10 }]);

    expect(runner.isGrounded).toBe(true);
    expect(runner.y).toBe(500);
  });

  it('still falls past a platform it does not horizontally overlap', () => {
    const runner = dropOnto([{ x: 5000, y: 500, width: 200, height: 10 }]);

    expect(runner.isGrounded).toBe(false);
    expect(runner.isDead).toBe(true);
  });
});

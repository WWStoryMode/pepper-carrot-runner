import { describe, expect, it } from 'vitest';
import { FIXED_DT, MAX_AIR_JUMPS, RUN_SPEED } from '@/config/constants';
import { Runner } from './Runner';
import type { Platform } from './types';

/** A floor wide enough that horizontal overlap is never the thing under test. */
const FLOOR: readonly Platform[] = [{ x: -1000, y: 0, width: 100_000, height: 200 }];

function stepFor(runner: Runner, seconds: number, platforms = FLOOR): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i += 1) runner.step(FIXED_DT, platforms);
}

/** Run until the runner is grounded again, returning height peak and airtime. */
function flight(runner: Runner, platforms = FLOOR): { peak: number; airtime: number } {
  const launch = runner.y;
  let peak = 0;
  let airtime = 0;

  for (let i = 0; i < 600; i += 1) {
    runner.step(FIXED_DT, platforms);
    airtime += FIXED_DT;
    peak = Math.max(peak, runner.y - launch);
    if (runner.isGrounded) break;
  }

  return { peak, airtime };
}

describe('jump arc', () => {
  it('matches the original: 325 px apex', () => {
    const runner = new Runner();
    runner.jump();

    const { peak } = flight(runner);

    // The original applies gravity before moving, so the rise is the sum of
    // 25..1 = 325 px, not 26..1 = 351. Verified against Runner.act() in the
    // libGDX source.
    expect(peak).toBeCloseTo(325, 6);
  });

  it('matches the original: ~0.85 s airtime', () => {
    const runner = new Runner();
    runner.jump();

    const { airtime } = flight(runner);

    expect(airtime).toBeGreaterThan(0.82);
    expect(airtime).toBeLessThan(0.88);
  });

  it('covers roughly 340 px of ground in one jump', () => {
    const runner = new Runner();
    const startX = runner.x;
    runner.jump();

    const { airtime } = flight(runner);

    expect(runner.x - startX).toBeCloseTo(RUN_SPEED * airtime, 6);
    expect(runner.x - startX).toBeGreaterThan(320);
    expect(runner.x - startX).toBeLessThan(360);
  });

  it('reproduces the original per-frame integer sequence', () => {
    const runner = new Runner();
    runner.jump();

    // First step: speedY 26 -> 25, then y += 25.
    runner.step(FIXED_DT, FLOOR);
    expect(runner.y).toBeCloseTo(25, 6);

    runner.step(FIXED_DT, FLOOR);
    expect(runner.y).toBeCloseTo(49, 6);

    runner.step(FIXED_DT, FLOOR);
    expect(runner.y).toBeCloseTo(72, 6);
  });
});

describe('jumping rules', () => {
  it('allows exactly one air jump', () => {
    const runner = new Runner();

    runner.jump();
    expect(runner.state).toBe('jumping');

    runner.jump();
    expect(runner.state).toBe('doubleJumping');

    const before = runner.vy;
    runner.jump();
    expect(runner.vy).toBe(before);
  });

  it('restores the air jump on landing', () => {
    const runner = new Runner();
    runner.jump();
    runner.jump();
    flight(runner);

    expect(runner.isGrounded).toBe(true);

    runner.jump();
    expect(runner.state).toBe('jumping');
    runner.jump();
    expect(runner.state).toBe('doubleJumping');
  });

  it('reaches roughly 650 px with a double jump taken at the apex', () => {
    const runner = new Runner();
    runner.jump();

    // Rise to the apex, then jump again.
    stepFor(runner, 0.433);
    runner.jump();

    const launch = runner.y;
    let peak = 0;
    for (let i = 0; i < 600; i += 1) {
      runner.step(FIXED_DT, FLOOR);
      peak = Math.max(peak, runner.y);
      if (runner.isGrounded) break;
    }

    expect(launch).toBeGreaterThan(300);
    expect(peak).toBeGreaterThan(620);
    expect(peak).toBeLessThan(680);
  });

  it('grants coyote time after walking off a ledge', () => {
    const ledge: readonly Platform[] = [{ x: -1000, y: 0, width: 1000, height: 200 }];
    const runner = new Runner();
    runner.reset(900, 0);

    // Walk off the right edge; MAX_AIR_JUMPS must not be what saves us here.
    stepFor(runner, 0.4, ledge);
    expect(runner.isGrounded).toBe(false);

    // Still airborne but well past the coyote window, so this is an air jump.
    runner.jump();
    expect(runner.state).toBe('doubleJumping');

    const fresh = new Runner();
    fresh.reset(900, 0);
    fresh.step(FIXED_DT, ledge);
    expect(fresh.isGrounded).toBe(false);

    // Within the window, so it counts as a ground jump and the air jump survives.
    fresh.jump();
    expect(fresh.state).toBe('jumping');
    fresh.jump();
    expect(fresh.state).toBe('doubleJumping');
  });

  it('has exactly MAX_AIR_JUMPS air jumps configured', () => {
    expect(MAX_AIR_JUMPS).toBe(1);
  });
});

describe('death', () => {
  it('dies after falling past the death plane', () => {
    const runner = new Runner();
    runner.reset(0, 0);

    stepFor(runner, 2, []);

    expect(runner.isDead).toBe(true);
    expect(runner.state).toBe('dying');
  });

  it('stops advancing once dead', () => {
    const runner = new Runner();
    runner.reset(0, 0);
    stepFor(runner, 2, []);

    const restingX = runner.x;
    stepFor(runner, 1, []);

    expect(runner.x).toBe(restingX);
  });

  it('ignores jump input once dead', () => {
    const runner = new Runner();
    runner.reset(0, 0);
    stepFor(runner, 2, []);

    runner.jump();
    expect(runner.state).toBe('dying');
  });
});

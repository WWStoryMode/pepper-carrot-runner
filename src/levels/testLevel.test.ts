import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '@/config/constants';
import { runAutopilot } from '@/sim/autopilot';
import { Runner } from '@/sim/Runner';
import { TEST_LEVEL, TEST_LEVEL_START } from './testLevel';

/**
 * Integration check: the physics, the one-way collision and the course have to
 * agree. If a constant drifts, the course stops being clearable and this fails
 * long before anyone notices by playing.
 */
describe('greybox course', () => {
  it('is clearable end to end', () => {
    const runner = new Runner();
    runner.reset(TEST_LEVEL_START.x, TEST_LEVEL_START.y);

    const last = TEST_LEVEL[TEST_LEVEL.length - 1];
    expect(last).toBeDefined();
    const finishX = last!.x + last!.width - 100;

    const result = runAutopilot(runner, TEST_LEVEL, finishX, FIXED_DT);

    expect(result.died).toBe(false);
    expect(result.reachedX).toBeGreaterThanOrEqual(finishX);
  });

  it('ends in a lethal pit', () => {
    const runner = new Runner();
    runner.reset(TEST_LEVEL_START.x, TEST_LEVEL_START.y);

    // Well past the end of the last platform: there is nothing left to land on.
    const result = runAutopilot(runner, TEST_LEVEL, 99_999, FIXED_DT);

    expect(result.died).toBe(true);
  });

  it('needs both jumps — the bot cannot clear it grounded-only', () => {
    const runner = new Runner();
    runner.reset(TEST_LEVEL_START.x, TEST_LEVEL_START.y);

    const result = runAutopilot(runner, TEST_LEVEL, 99_999, FIXED_DT);

    expect(result.jumps).toBeGreaterThan(8);
  });
});

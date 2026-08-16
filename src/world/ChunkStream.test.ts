import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, RUN_SPEED } from '@/config/constants';
import { runAutopilot } from '@/sim/autopilot';
import { Runner } from '@/sim/Runner';
import { ChunkStream, GROUND_Y } from './ChunkStream';
import { Rng } from './rng';
import { ChunkSelector, RAMP_DISTANCE } from './selector';
import type { LevelData } from './types';

/**
 * Runs against the real generated level data rather than a fixture, so a
 * regression in `scripts/build-levels.ts` fails here too.
 */
const levels = JSON.parse(readFileSync('public/art/levels.json', 'utf8')) as LevelData;

describe('generated level data', () => {
  it('decoded all seven maps', () => {
    expect(levels.chunks).toHaveLength(7);
    expect(levels.tileWidth).toBe(95);
    expect(levels.tileHeight).toBe(95);
  });

  it('gives every chunk geometry and content', () => {
    for (const chunk of levels.chunks) {
      expect(chunk.widthTiles).toBe(35);
      expect(chunk.heightTiles).toBe(7);
      expect(chunk.tiles.length).toBeGreaterThan(0);
      expect(chunk.platforms.length).toBeGreaterThan(0);
    }
  });

  it('merged platform tiles into runs', () => {
    // level1's bottom row is 11 contiguous tiles; unmerged it would be 26
    // separate boxes across the map, merged it is 4 runs.
    const level1 = levels.chunks.find((c) => c.name === 'level1');
    expect(level1).toBeDefined();
    expect(level1!.platforms).toHaveLength(4);
    expect(level1!.platforms.some((p) => p.len === 11 && p.row === 0)).toBe(true);
  });

  it('ranks difficulty in the original level order', () => {
    const byName = new Map(levels.chunks.map((c) => [c.name, c.difficulty]));
    expect(byName.get('level1')!).toBeLessThan(byName.get('level4')!);
    expect(byName.get('level4')!).toBeLessThan(byName.get('level7')!);
  });

  it('extracted entities from hidden tile-property layers', () => {
    const all = levels.chunks.flatMap((c) => c.entities);
    expect(all.filter((e) => e.kind === 'enemy' && e.name === 'fly').length).toBeGreaterThan(0);
    expect(all.filter((e) => e.kind === 'enemy' && e.name === 'spider').length).toBeGreaterThan(0);
    expect(all.filter((e) => e.kind === 'hazard').length).toBeGreaterThan(0);
    expect(all.filter((e) => e.kind === 'potion').length).toBeGreaterThan(0);
  });

  it('carries the particle emitter recorded on hazard tiles', () => {
    const withEmitter = levels.chunks
      .flatMap((c) => c.entities)
      .filter((e) => e.kind === 'hazard' && e.emitter !== undefined);
    expect(withEmitter.length).toBeGreaterThan(0);
    expect(withEmitter[0]!.emitter).toBe('poison-circles.p');
  });
});

describe('chunk selection', () => {
  it('never repeats a chunk twice in a row', () => {
    const selector = new ChunkSelector(levels.chunks, new Rng(1234));

    let previous = -1;
    for (let i = 0; i < 2000; i += 1) {
      const index = selector.next(i * 3325);
      expect(index).not.toBe(previous);
      previous = index;
    }
  });

  it('raises the difficulty ceiling with distance', () => {
    const selector = new ChunkSelector(levels.chunks, new Rng(7));
    expect(selector.targetDifficulty(0)).toBeLessThan(selector.targetDifficulty(RAMP_DISTANCE));
    // The ramp saturates rather than running away.
    expect(selector.targetDifficulty(RAMP_DISTANCE * 10)).toBe(
      selector.targetDifficulty(RAMP_DISTANCE),
    );
  });

  it('serves harder chunks late than early', () => {
    const average = (distance: number): number => {
      const selector = new ChunkSelector(levels.chunks, new Rng(99));
      let total = 0;
      for (let i = 0; i < 400; i += 1) {
        total += levels.chunks[selector.next(distance)]!.difficulty;
      }
      return total / 400;
    };

    expect(average(RAMP_DISTANCE)).toBeGreaterThan(average(0) * 1.5);
  });

  it('is deterministic for a given seed', () => {
    const run = (): number[] => {
      const selector = new ChunkSelector(levels.chunks, new Rng(42));
      return Array.from({ length: 50 }, (_, i) => selector.next(i * 3325));
    };
    expect(run()).toEqual(run());
  });
});

describe('streaming', () => {
  it('keeps chunks ahead of the player and retires them behind', () => {
    const stream = new ChunkStream(levels, new Rng(5));
    stream.reset(0);
    stream.update(0);

    const initial = stream.chunkCount;
    expect(initial).toBeGreaterThan(0);

    // Walk a long way; the window should stay bounded, not grow.
    for (let x = 0; x < 200_000; x += 500) stream.update(x);

    expect(stream.chunkCount).toBeLessThanOrEqual(initial + 2);
  });

  it('butt-joins chunks with no gap or overlap', () => {
    const stream = new ChunkStream(levels, new Rng(11));
    stream.reset(0);
    stream.update(0);

    const active = stream.activeChunks;
    for (let i = 1; i < active.length; i += 1) {
      const previous = active[i - 1]!;
      expect(active[i]!.x).toBe(previous.x + previous.widthPx);
    }
  });

  it('always provides a continuous floor under the player', () => {
    // The maps have no floor of their own — level2 has nothing on row 0 — so
    // the stream must supply one or the game is unplayable.
    const stream = new ChunkStream(levels, new Rng(3));
    stream.reset(0);

    for (const x of [0, 5000, 50_000, 250_000]) {
      stream.update(x);
      const platforms = stream.getPlatforms(x);
      const floor = platforms.find(
        (p) => p.y === GROUND_Y && p.x <= x && p.x + p.width >= x,
      );
      expect(floor).toBeDefined();
    }
  });
});

describe('a long run', () => {
  /**
   * The five-minute soak from the milestone's exit criteria, headless.
   * Five minutes at 400 px/s is 120,000 world units — about 36 chunks.
   */
  it('survives five minutes without dying or stalling', () => {
    const stream = new ChunkStream(levels, new Rng(2026));
    const runner = new Runner();
    stream.reset(0);
    runner.reset(0, GROUND_Y);

    const steps = Math.round(300 / FIXED_DT);
    for (let i = 0; i < steps; i += 1) {
      stream.update(runner.x);
      runner.step(FIXED_DT, stream.getPlatforms(runner.x));
    }

    expect(runner.isDead).toBe(false);
    expect(runner.x).toBeCloseTo(300 * RUN_SPEED, -2);
    expect(stream.chunkCount).toBeLessThan(10);
  });

  it('is clearable by the autopilot across many seeds', () => {
    for (const seed of [1, 2, 3, 7, 13, 99, 2026]) {
      const stream = new ChunkStream(levels, new Rng(seed));
      const runner = new Runner();
      stream.reset(0);
      runner.reset(0, GROUND_Y);

      // 60 s of running per seed.
      const steps = Math.round(60 / FIXED_DT);
      for (let i = 0; i < steps; i += 1) {
        stream.update(runner.x);
        const platforms = stream.getPlatforms(runner.x);
        runAutopilot(runner, platforms, Number.POSITIVE_INFINITY, FIXED_DT, 1);
      }

      expect(runner.isDead, `seed ${seed} died`).toBe(false);
    }
  });
});

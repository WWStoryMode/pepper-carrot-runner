import { describe, expect, it } from 'vitest';
import {
  ENEMY_DAMAGE,
  FIXED_DT,
  HAZARD_DAMAGE,
  MAX_HEALTH,
  PLAYER_HEIGHT,
} from '@/config/constants';
import { findSideCollision } from './collision';
import { resolveContacts } from './entities';
import { Runner } from './Runner';
import type { Platform, SimEntity } from './types';

const FLOOR: readonly Platform[] = [
  { x: -1000, y: 0, width: 100_000, height: 200, noSides: true },
];

let nextId = 0;
function entity(partial: Partial<SimEntity> & Pick<SimEntity, 'kind' | 'name'>): SimEntity {
  return {
    id: nextId++,
    x: 0,
    y: 100,
    halfWidth: 47,
    halfHeight: 47,
    alive: true,
    touched: false,
    collected: false,
    ...partial,
  };
}

describe('side collision', () => {
  const shelf: Platform = { x: 500, y: 190, width: 200, height: 95 };

  it('reports a crash when entering a face from the left', () => {
    // Feet on the floor, body spanning the shelf's height.
    const hit = findSideCollision(440, 460, 0, 57.8, PLAYER_HEIGHT, [shelf]);
    expect(hit).toBe(shelf);
  });

  it('ignores a platform already overlapped — rising through it is legal', () => {
    // Already inside the column before the step, so this is a vertical pass.
    expect(findSideCollision(560, 570, 0, 57.8, PLAYER_HEIGHT, [shelf])).toBeNull();
  });

  it('ignores a platform being stood on', () => {
    expect(findSideCollision(440, 460, 190, 57.8, PLAYER_HEIGHT, [shelf])).toBeNull();
  });

  it('ignores a platform entirely overhead', () => {
    // Feet well below and head under the shelf's underside.
    const high: Platform = { x: 500, y: 900, width: 200, height: 95 };
    expect(findSideCollision(440, 460, 0, 57.8, PLAYER_HEIGHT, [high])).toBeNull();
  });

  it('never treats the floor as a wall', () => {
    expect(findSideCollision(-50, 50, -300, 57.8, PLAYER_HEIGHT, FLOOR)).toBeNull();
  });

  it('ends the run on contact', () => {
    const runner = new Runner();
    runner.reset(400, 0);

    for (let i = 0; i < 120 && !runner.isDead; i += 1) {
      runner.step(FIXED_DT, [...FLOOR, shelf]);
    }

    expect(runner.isDead).toBe(true);
    expect(runner.deathCause).toBe('crash');
  });
});

describe('health', () => {
  it('starts full and survives four enemy hits', () => {
    const runner = new Runner();
    expect(runner.health).toBe(MAX_HEALTH);

    for (let i = 0; i < MAX_HEALTH - 1; i += 1) {
      runner.damage(ENEMY_DAMAGE, 'enemies');
    }

    expect(runner.health).toBe(1);
    expect(runner.isDead).toBe(false);
  });

  it('dies on the fifth', () => {
    const runner = new Runner();
    for (let i = 0; i < MAX_HEALTH; i += 1) runner.damage(ENEMY_DAMAGE, 'enemies');

    expect(runner.isDead).toBe(true);
    expect(runner.deathCause).toBe('enemies');
  });

  it('is killed outright by a hazard, whatever the health', () => {
    const runner = new Runner();
    expect(HAZARD_DAMAGE).toBeGreaterThanOrEqual(MAX_HEALTH);

    runner.damage(HAZARD_DAMAGE, 'hazard');

    expect(runner.isDead).toBe(true);
    expect(runner.deathCause).toBe('hazard');
  });

  it('does not heal above the maximum', () => {
    const runner = new Runner();
    runner.damage(1, 'enemies');
    runner.heal(5);
    expect(runner.health).toBe(MAX_HEALTH);
  });
});

describe('contacts', () => {
  it('costs one heart per enemy however long the overlap lasts', () => {
    const runner = new Runner();
    runner.reset(0, 0);

    const fly = entity({ kind: 'enemy', name: 'fly', x: 0, y: 100 });

    for (let i = 0; i < 30; i += 1) resolveContacts(runner, [fly]);

    expect(runner.health).toBe(MAX_HEALTH - ENEMY_DAMAGE);
    expect(fly.touched).toBe(true);
  });

  it('collects a potion once and marks it gone', () => {
    const runner = new Runner();
    runner.reset(0, 0);

    const potion = entity({ kind: 'potion', name: 'orange', x: 0, y: 100 });
    const first = resolveContacts(runner, [potion]);
    const second = resolveContacts(runner, [potion]);

    expect(first.potions).toHaveLength(1);
    expect(second.potions).toHaveLength(0);
    expect(potion.collected).toBe(true);
  });

  it('heals on a pink potion', () => {
    const runner = new Runner();
    runner.reset(0, 0);
    runner.damage(2, 'enemies');

    resolveContacts(runner, [entity({ kind: 'potion', name: 'pink', x: 0, y: 100 })]);

    expect(runner.health).toBe(MAX_HEALTH - 1);
  });

  it('ignores entities that are nowhere near', () => {
    const runner = new Runner();
    runner.reset(0, 0);

    const far = entity({ kind: 'enemy', name: 'fly', x: 5000, y: 100 });
    resolveContacts(runner, [far]);

    expect(runner.health).toBe(MAX_HEALTH);
    expect(far.touched).toBe(false);
  });

  it('does nothing once the runner is dead', () => {
    const runner = new Runner();
    runner.reset(0, 0);
    runner.kill('pit');

    const fly = entity({ kind: 'enemy', name: 'fly', x: 0, y: 100 });
    resolveContacts(runner, [fly]);

    expect(fly.touched).toBe(false);
  });
});

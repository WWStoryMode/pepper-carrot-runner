import { describe, expect, it } from 'vitest';
import { FIXED_DT, RUN_SPEED } from '@/config/constants';
import { ABILITIES, AbilitySystem, type AbilitySlot } from './abilities';
import { interpolate, pow2, pow3In, pow3Out } from './ease';
import { Runner } from './Runner';
import type { Platform, SimEntity } from './types';

/** Without a floor the runner falls to its death and stops advancing. */
const FLOOR: readonly Platform[] = [
  { x: -10_000, y: 0, width: 1_000_000, height: 400, noSides: true },
];

let nextId = 0;
function enemy(x: number, y = 200): SimEntity {
  return {
    id: nextId++,
    kind: 'enemy',
    name: 'fly',
    x,
    y,
    halfWidth: 47,
    halfHeight: 47,
    alive: true,
    touched: false,
    collected: false,
  };
}

function potion(x: number, name: string): SimEntity {
  return { ...enemy(x), kind: 'potion', name, halfWidth: 35, halfHeight: 35 };
}

function charge(system: AbilitySystem, slot: AbilitySlot): void {
  const def = ABILITIES[slot]!;
  for (let i = 0; i < def.cost; i += 1) system.chargeFromPotion(def.potion!);
}

/** Advance the system for a while, as the scene would. */
function run(system: AbilitySystem, runner: Runner, entities: SimEntity[], seconds: number): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i += 1) {
    runner.speedFactor = system.speedFactor;
    runner.step(FIXED_DT, FLOOR);
    system.update(FIXED_DT, runner, entities);
  }
}

describe('easing', () => {
  it('reproduces the libGDX curves', () => {
    expect(pow3In(0)).toBe(0);
    expect(pow3In(1)).toBe(1);
    expect(pow3In(0.5)).toBeCloseTo(0.125, 6);

    expect(pow3Out(0)).toBe(0);
    expect(pow3Out(1)).toBe(1);
    expect(pow3Out(0.5)).toBeCloseTo(0.875, 6);

    // pow2 is symmetric ease-in-out.
    expect(pow2(0.5)).toBeCloseTo(0.5, 6);
    expect(pow2(0.25)).toBeCloseTo(1 - pow2(0.75), 6);
  });

  it('applies start and end like libGDX', () => {
    expect(interpolate(1, 2.8, 0, pow3Out)).toBeCloseTo(1, 6);
    expect(interpolate(1, 2.8, 1, pow3Out)).toBeCloseTo(2.8, 6);
  });
});

describe('charging', () => {
  it('routes each potion colour to its ability', () => {
    const system = new AbilitySystem();

    system.chargeFromPotion('orange');
    system.chargeFromPotion('green');
    system.chargeFromPotion('blue');

    expect(system.energy[1]).toBe(1);
    expect(system.energy[2]).toBe(1);
    expect(system.energy[3]).toBe(1);
  });

  it('ignores the health potion', () => {
    const system = new AbilitySystem();
    system.chargeFromPotion('pink');
    expect(system.energy.slice(1)).toEqual([0, 0, 0]);
  });

  it('does not charge past the cost', () => {
    const system = new AbilitySystem();
    for (let i = 0; i < 10; i += 1) system.chargeFromPotion('orange');
    expect(system.energy[1]).toBe(ABILITIES[1]!.cost);
  });

  it('leaves the free melee always ready', () => {
    const system = new AbilitySystem();
    expect(system.isReady(0)).toBe(true);
    expect(system.isReady(1)).toBe(false);
  });
});

describe('activation', () => {
  it('refuses an ability that is not charged', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    expect(system.activate(2, runner, [])).toBe(false);
  });

  it('drains the charge entirely on use', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    charge(system, 2);

    expect(system.activate(2, runner, [])).toBe(true);
    expect(system.energy[2]).toBe(0);
  });

  it('cannot be double-activated mid-run', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    charge(system, 2);
    charge(system, 3);

    expect(system.activate(2, runner, [])).toBe(true);
    expect(system.activate(3, runner, [])).toBe(false);
    expect(system.activate(0, runner, [])).toBe(false);
  });

  it('refuses everything once dead', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    runner.kill('pit');
    expect(system.activate(0, runner, [])).toBe(false);
  });

  it('ends after its duration', () => {
    const system = new AbilitySystem();
    const runner = new Runner();

    system.activate(0, runner, []);
    expect(system.runningSlot).toBe(0);

    run(system, runner, [], ABILITIES[0]!.duration + 0.1);
    expect(system.runningSlot).toBeNull();
  });
});

describe('sweep', () => {
  it('kills enemies within reach and spares the rest', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    runner.reset(0, 0);

    const close = enemy(60, 100);
    const far = enemy(900, 100);

    system.activate(0, runner, [close, far]);
    system.update(FIXED_DT, runner, [close, far]);

    expect(close.alive).toBe(false);
    expect(far.alive).toBe(true);
  });
});

describe('carrot charge', () => {
  it('chains through up to three enemies ahead', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    runner.reset(0, 0);

    const targets = [enemy(300, 100), enemy(600, 100), enemy(900, 100), enemy(1200, 100)];
    charge(system, 1);
    system.activate(1, runner, targets);

    run(system, runner, targets, 3);

    expect(targets.filter((t) => !t.alive)).toHaveLength(3);
    expect(targets[3]!.alive).toBe(true);
  });

  it('ignores enemies behind the runner', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    runner.reset(1000, 0);

    const behind = enemy(200, 100);
    charge(system, 1);
    system.activate(1, runner, [behind]);
    run(system, runner, [behind], 2);

    expect(behind.alive).toBe(true);
  });

  it('ends immediately when there is nothing to hit', () => {
    const system = new AbilitySystem();
    const runner = new Runner();

    charge(system, 1);
    system.activate(1, runner, []);

    expect(system.runningSlot).toBeNull();
  });
});

describe('time distortion', () => {
  it('ramps the run speed up and back to normal', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    charge(system, 2);
    system.activate(2, runner, []);

    const duration = ABILITIES[2]!.duration;
    system.update(duration / 2, runner, []);
    const peak = system.speedFactor;

    expect(peak).toBeGreaterThan(2.5);

    run(system, runner, [], duration);
    expect(system.speedFactor).toBe(1);
  });

  it('actually moves the runner further', () => {
    const plain = new Runner();
    plain.reset(0, 0);
    for (let i = 0; i < 60; i += 1) plain.step(FIXED_DT, FLOOR);

    const boosted = new Runner();
    boosted.reset(0, 0);
    const system = new AbilitySystem();
    charge(system, 2);
    system.activate(2, boosted, []);
    run(system, boosted, [], 1);

    expect(boosted.x).toBeGreaterThan(plain.x);
    expect(plain.x).toBeCloseTo(RUN_SPEED, 0);
  });
});

describe('black hole', () => {
  it('clears enemies within its radius on the spot', () => {
    const system = new AbilitySystem();
    const runner = new Runner();
    runner.reset(0, 0);

    const inside = enemy(813, 369);
    const outside = enemy(3000, 369);

    charge(system, 3);
    system.activate(3, runner, [inside, outside]);

    expect(inside.alive).toBe(false);
    expect(outside.alive).toBe(true);
  });

  it('credits the potions it swallows', () => {
    // The original called potion.collected() directly, so vacuumed potions
    // granted nothing at all. Here they charge the abilities they belong to.
    const system = new AbilitySystem();
    const runner = new Runner();
    runner.reset(0, 0);

    const swallowed = potion(813, 'green');
    charge(system, 3);
    system.activate(3, runner, [swallowed]);

    expect(swallowed.collected).toBe(true);
    expect(system.energy[2]).toBe(1);
  });
});

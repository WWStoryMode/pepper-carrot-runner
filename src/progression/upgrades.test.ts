import { describe, expect, it } from 'vitest';
import { ENEMY_DAMAGE, MAX_HEALTH } from '@/config/constants';
import { resolveContacts } from '@/sim/entities';
import { Runner } from '@/sim/Runner';
import type { SimEntity } from '@/sim/types';
import {
  brew,
  canBrew,
  ghostFrame,
  INGREDIENTS_PER_BREW,
  levelOf,
  loadoutFor,
  UPGRADES,
} from './upgrades';

const vitality = UPGRADES.find((u) => u.id === 'vitality')!;
const ward = UPGRADES.find((u) => u.id === 'ward')!;

const full = (name: string, n = INGREDIENTS_PER_BREW): Record<string, number> => ({ [name]: n });

let nextId = 0;
function enemy(x = 0, y = 100): SimEntity {
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

describe('brewing', () => {
  it('needs a full set of the right ingredient', () => {
    expect(canBrew(vitality, full(vitality.ingredient), {})).toBe(true);
    expect(canBrew(vitality, full(vitality.ingredient, INGREDIENTS_PER_BREW - 1), {})).toBe(false);
    // The wrong ingredient does not count towards it.
    expect(canBrew(vitality, full(ward.ingredient), {})).toBe(false);
  });

  it('spends the ingredients and raises the level', () => {
    const result = brew(vitality, full(vitality.ingredient, 12), {});

    expect(result.brewed).toBe(true);
    expect(result.ingredients[vitality.ingredient]).toBe(12 - INGREDIENTS_PER_BREW);
    expect(result.levels[vitality.id]).toBe(1);
  });

  it('does not mutate what it was given', () => {
    const ingredients = full(vitality.ingredient);
    const levels = {};

    brew(vitality, ingredients, levels);

    expect(ingredients[vitality.ingredient]).toBe(INGREDIENTS_PER_BREW);
    expect(levels).toEqual({});
  });

  it('refuses past the maximum level', () => {
    const maxed = { [vitality.id]: vitality.maxLevel };
    expect(canBrew(vitality, full(vitality.ingredient), maxed)).toBe(false);
    expect(brew(vitality, full(vitality.ingredient), maxed).brewed).toBe(false);
  });

  it('clamps a level tampered with in storage', () => {
    expect(levelOf({ vitality: 99 }, 'vitality')).toBe(vitality.maxLevel);
    expect(levelOf({ vitality: -5 }, 'vitality')).toBe(0);
  });
});

describe('loadout', () => {
  it('is the plain game with nothing brewed', () => {
    const loadout = loadoutFor({});
    expect(loadout.maxHealth).toBe(MAX_HEALTH);
    expect(loadout.startingCharge).toBe(0);
    expect(loadout.wards).toBe(0);
  });

  it('adds a heart per level of Vitality', () => {
    expect(loadoutFor({ vitality: 1 }).maxHealth).toBe(MAX_HEALTH + 1);
    expect(loadoutFor({ vitality: 3 }).maxHealth).toBe(MAX_HEALTH + 3);
  });

  it('evolves the ghost with the ward', () => {
    expect(ghostFrame(0)).toBe('ghost_basic');
    expect(ghostFrame(1)).toBe('ghost_sour-1');
    expect(ghostFrame(9)).toBe('ghost_sour-3');
  });
});

describe('upgrades change a run', () => {
  it('Vitality lets the runner take more hits', () => {
    const plain = new Runner();
    plain.reset(0, 0);

    const tough = new Runner();
    const loadout = loadoutFor({ vitality: 3 });
    tough.applyLoadout(loadout.maxHealth, loadout.wards);
    tough.reset(0, 0);

    expect(tough.health).toBe(plain.health + 3);

    for (let i = 0; i < MAX_HEALTH; i += 1) {
      plain.damage(ENEMY_DAMAGE, 'enemies');
      tough.damage(ENEMY_DAMAGE, 'enemies');
    }

    expect(plain.isDead).toBe(true);
    expect(tough.isDead).toBe(false);
  });

  it('a ward absorbs an enemy hit instead of a heart', () => {
    const runner = new Runner();
    const loadout = loadoutFor({ ward: 1 });
    runner.applyLoadout(loadout.maxHealth, loadout.wards);
    runner.reset(0, 0);

    const first = resolveContacts(runner, [enemy()]);
    expect(first.warded).toBe(1);
    expect(runner.health).toBe(MAX_HEALTH);
    expect(runner.wards).toBe(0);

    // Once spent, the next one costs health as usual.
    const second = resolveContacts(runner, [enemy()]);
    expect(second.warded).toBe(0);
    expect(runner.health).toBe(MAX_HEALTH - ENEMY_DAMAGE);
  });

  it('a ward does not save you from poison', () => {
    // Hazards are meant to be unambiguous; a ward that softened them would
    // blunt the only instant threat in the game.
    const runner = new Runner();
    runner.applyLoadout(MAX_HEALTH, 2);
    runner.reset(0, 0);

    const hazard: SimEntity = { ...enemy(), kind: 'hazard', name: 'deadly' };
    resolveContacts(runner, [hazard]);

    expect(runner.isDead).toBe(true);
    expect(runner.deathCause).toBe('hazard');
    expect(runner.wards).toBe(2);
  });

  it('healing respects the raised maximum', () => {
    const runner = new Runner();
    runner.applyLoadout(MAX_HEALTH + 2, 0);
    runner.reset(0, 0);

    runner.damage(3, 'enemies');
    runner.heal(10);

    expect(runner.health).toBe(MAX_HEALTH + 2);
  });

  it('carries the loadout across a restart', () => {
    const runner = new Runner();
    runner.applyLoadout(MAX_HEALTH + 1, 2);

    runner.reset(0, 0);
    runner.consumeWard();
    expect(runner.wards).toBe(1);

    runner.reset(0, 0);
    expect(runner.wards).toBe(2);
    expect(runner.health).toBe(MAX_HEALTH + 1);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSave, resetSave, saveProgression, saveRun, setMuted } from './store';

const run = (distance: number, ingredients: Record<string, number> = {}) => ({
  distance,
  score: Math.floor(distance / 95),
  kills: 0,
  potions: 0,
  ingredients,
});

/**
 * A minimal localStorage, since Node 20 has none.
 *
 * The store is written to survive storage being absent or hostile, so the shim
 * can also be made to throw.
 */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  throwOnWrite = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnWrite) throw new Error('quota exceeded');
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  /** Let a test plant corrupt data. */
  poke(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'localStorage');
});

describe('save data', () => {
  it('starts empty', () => {
    const save = loadSave();
    expect(save.bestDistance).toBe(0);
    expect(save.runs).toBe(0);
    expect(save.muted).toBe(false);
  });

  it('keeps the best distance, not the latest', () => {
    saveRun(run(5000));
    saveRun(run(1200));

    const save = loadSave();
    expect(save.bestDistance).toBe(5000);
    expect(save.runs).toBe(2);
  });

  it('round-trips the mute preference', () => {
    setMuted(true);
    expect(loadSave().muted).toBe(true);

    setMuted(false);
    expect(loadSave().muted).toBe(false);
  });

  it('keeps mute across a run being recorded', () => {
    setMuted(true);
    saveRun(run(900));
    expect(loadSave().muted).toBe(true);
  });

  it('clears scores on reset', () => {
    saveRun(run(5000));
    resetSave();

    const save = loadSave();
    expect(save.bestDistance).toBe(0);
    expect(save.runs).toBe(0);
  });

  it('survives corrupt stored data', () => {
    storage.poke('pcr.save.v1', '{not json at all');
    expect(() => loadSave()).not.toThrow();
    expect(loadSave().bestDistance).toBe(0);
  });

  it('survives a storage that refuses writes', () => {
    storage.throwOnWrite = true;
    expect(() => saveRun(run(100))).not.toThrow();
  });

  it('fills in missing fields from an older shape', () => {
    storage.poke('pcr.save.v1', JSON.stringify({ version: 1, bestDistance: 300 }));

    const save = loadSave();
    expect(save.bestDistance).toBe(300);
    expect(save.runs).toBe(0);
    expect(save.muted).toBe(false);
  });
});

describe('schema migration', () => {
  it('carries a version 1 save forward without losing it', () => {
    // Exactly what M6 wrote: no progression fields at all.
    storage.poke(
      'pcr.save.v1',
      JSON.stringify({ version: 1, bestDistance: 4200, bestScore: 44, runs: 9, muted: true }),
    );

    const save = loadSave();

    expect(save.version).toBe(2);
    expect(save.bestDistance).toBe(4200);
    expect(save.runs).toBe(9);
    expect(save.muted).toBe(true);
    expect(save.ingredients).toEqual({});
    expect(save.upgrades).toEqual({});
    expect(save.stats.deaths).toBe(0);
  });

  it('discards nonsense counts rather than trusting them', () => {
    storage.poke(
      'pcr.save.v1',
      JSON.stringify({
        version: 2,
        ingredients: { 'ingredient_sour-1': 5, bogus: 'lots', negative: -3, nan: NaN },
        upgrades: { vitality: 2 },
      }),
    );

    const save = loadSave();

    expect(save.ingredients).toEqual({ 'ingredient_sour-1': 5 });
    expect(save.upgrades).toEqual({ vitality: 2 });
  });
});

describe('run outcomes', () => {
  it('banks ingredients gathered during the run', () => {
    saveRun(run(1000, { 'ingredient_sour-1': 3 }));
    saveRun(run(1000, { 'ingredient_sour-1': 2, 'ingredient_sour-2': 1 }));

    const save = loadSave();
    expect(save.ingredients['ingredient_sour-1']).toBe(5);
    expect(save.ingredients['ingredient_sour-2']).toBe(1);
    expect(save.stats.ingredients).toBe(6);
  });

  it('accumulates lifetime statistics', () => {
    saveRun({ distance: 100, score: 1, kills: 4, potions: 7, ingredients: {} });
    saveRun({ distance: 100, score: 1, kills: 2, potions: 1, ingredients: {} });

    const save = loadSave();
    expect(save.stats.deaths).toBe(2);
    expect(save.stats.kills).toBe(6);
    expect(save.stats.potions).toBe(8);
  });

  it('keeps upgrades when a run is recorded', () => {
    saveProgression({ 'ingredient_sour-1': 4 }, { vitality: 2 });
    saveRun(run(500, { 'ingredient_sour-1': 1 }));

    const save = loadSave();
    expect(save.upgrades['vitality']).toBe(2);
    expect(save.ingredients['ingredient_sour-1']).toBe(5);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSave, resetSave, saveRun, setMuted } from './store';

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
    saveRun(5000, 50);
    saveRun(1200, 12);

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
    saveRun(900, 9);
    expect(loadSave().muted).toBe(true);
  });

  it('clears scores on reset', () => {
    saveRun(5000, 50);
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
    expect(() => saveRun(100, 1)).not.toThrow();
  });

  it('fills in missing fields from an older shape', () => {
    storage.poke('pcr.save.v1', JSON.stringify({ version: 1, bestDistance: 300 }));

    const save = loadSave();
    expect(save.bestDistance).toBe(300);
    expect(save.runs).toBe(0);
    expect(save.muted).toBe(false);
  });
});

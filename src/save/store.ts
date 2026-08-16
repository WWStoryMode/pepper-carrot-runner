/**
 * Persistent save data.
 *
 * The original wrote a plain-text `account.txt` through `Gdx.files.local`, one
 * `Key value` per line, parsed with `String.split` and a blanket try/catch that
 * printed and swallowed every error. One of its `switch` cases is missing a
 * `break`, so `LevelsWithoutKilling` silently overwrites itself on every load.
 *
 * This is a versioned JSON blob in `localStorage` instead, with the migration
 * hook in place from the start — the full stats and upgrade model arrives in M7
 * and will need it.
 */

const STORAGE_KEY = 'pcr.save.v1';
const CURRENT_VERSION = 1;

export interface SaveData {
  readonly version: number;
  /** Furthest distance reached, in world units. */
  readonly bestDistance: number;
  readonly bestScore: number;
  readonly runs: number;
  readonly muted: boolean;
}

const EMPTY: SaveData = {
  version: CURRENT_VERSION,
  bestDistance: 0,
  bestScore: 0,
  runs: 0,
  muted: false,
};

function migrate(raw: Partial<SaveData> & { version?: number }): SaveData {
  // Only one version so far; the shape of this function is the point.
  return {
    version: CURRENT_VERSION,
    bestDistance: Number(raw.bestDistance ?? 0),
    bestScore: Number(raw.bestScore ?? 0),
    runs: Number(raw.runs ?? 0),
    muted: raw.muted === true,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return EMPTY;

    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate(parsed);
  } catch {
    // Corrupt or unavailable storage (private mode, quota, hand-edited JSON)
    // must not stop the game from starting.
    return EMPTY;
  }
}

function persist(data: SaveData): SaveData {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage being unavailable is not worth interrupting a run over.
  }
  return data;
}

export function saveRun(distance: number, score: number): SaveData {
  const previous = loadSave();

  return persist({
    ...previous,
    version: CURRENT_VERSION,
    bestDistance: Math.max(previous.bestDistance, distance),
    bestScore: Math.max(previous.bestScore, score),
    runs: previous.runs + 1,
  });
}

/** Mute is a preference, so it survives a data reset deliberately. */
export function setMuted(muted: boolean): SaveData {
  return persist({ ...loadSave(), muted });
}

export function resetSave(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do.
  }
}

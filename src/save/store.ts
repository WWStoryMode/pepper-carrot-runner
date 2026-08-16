/**
 * Persistent save data.
 *
 * The original wrote a plain-text `account.txt` through `Gdx.files.local`, one
 * `Key value` per line, parsed with `String.split` and a blanket try/catch that
 * printed and swallowed every error. One of its `switch` cases is missing a
 * `break`, so `LevelsWithoutKilling` silently overwrites itself on every load.
 *
 * This is a versioned JSON blob in `localStorage`. Version 2 adds the
 * progression fields; version 1 saves are migrated rather than discarded,
 * because a player's best distance should survive the game growing.
 */

const STORAGE_KEY = 'pcr.save.v1';
const CURRENT_VERSION = 2;

export interface RunStats {
  readonly deaths: number;
  readonly kills: number;
  readonly potions: number;
  readonly ingredients: number;
}

export interface SaveData {
  readonly version: number;
  /** Furthest distance reached, in world units. */
  readonly bestDistance: number;
  readonly bestScore: number;
  readonly runs: number;
  readonly muted: boolean;
  /** Ingredients banked, keyed by atlas frame name. */
  readonly ingredients: Readonly<Record<string, number>>;
  /** Upgrade levels, keyed by `UpgradeId`. */
  readonly upgrades: Readonly<Record<string, number>>;
  readonly stats: RunStats;
}

const EMPTY: SaveData = {
  version: CURRENT_VERSION,
  bestDistance: 0,
  bestScore: 0,
  runs: 0,
  muted: false,
  ingredients: {},
  upgrades: {},
  stats: { deaths: 0, kills: 0, potions: 0, ingredients: 0 },
};

/** Keep only finite, positive counts — hand-edited storage is a real case. */
function sanitiseCounts(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};

  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) out[key] = Math.floor(amount);
  }
  return out;
}

const count = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Bring any stored shape up to the current version.
 *
 * Version 1 had no progression fields at all, so they default in. Everything is
 * read defensively rather than trusted: this is the one place the game meets
 * data it did not write itself.
 */
function migrate(raw: Partial<SaveData> & Record<string, unknown>): SaveData {
  const stats = (raw.stats ?? {}) as Record<string, unknown>;

  return {
    version: CURRENT_VERSION,
    bestDistance: count(raw.bestDistance),
    bestScore: count(raw.bestScore),
    runs: count(raw.runs),
    muted: raw.muted === true,
    ingredients: sanitiseCounts(raw.ingredients),
    upgrades: sanitiseCounts(raw.upgrades),
    stats: {
      deaths: count(stats['deaths']),
      kills: count(stats['kills']),
      potions: count(stats['potions']),
      ingredients: count(stats['ingredients']),
    },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return EMPTY;

    return migrate(JSON.parse(raw) as Partial<SaveData> & Record<string, unknown>);
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

export interface RunOutcome {
  readonly distance: number;
  readonly score: number;
  readonly kills: number;
  readonly potions: number;
  /** Ingredients gathered this run, by frame name. */
  readonly ingredients: Readonly<Record<string, number>>;
}

/**
 * Record a finished run.
 *
 * Ingredients bank on death, which is the only moment an endless run has. The
 * original banked them on *winning* a level (`updateAccountAfterWin`), an event
 * that no longer exists.
 */
export function saveRun(outcome: RunOutcome): SaveData {
  const previous = loadSave();

  const ingredients: Record<string, number> = { ...previous.ingredients };
  let gathered = 0;
  for (const [name, amount] of Object.entries(outcome.ingredients)) {
    ingredients[name] = (ingredients[name] ?? 0) + amount;
    gathered += amount;
  }

  return persist({
    ...previous,
    version: CURRENT_VERSION,
    bestDistance: Math.max(previous.bestDistance, outcome.distance),
    bestScore: Math.max(previous.bestScore, outcome.score),
    runs: previous.runs + 1,
    ingredients,
    stats: {
      deaths: previous.stats.deaths + 1,
      kills: previous.stats.kills + outcome.kills,
      potions: previous.stats.potions + outcome.potions,
      ingredients: previous.stats.ingredients + gathered,
    },
  });
}

/** Commit the result of brewing. */
export function saveProgression(
  ingredients: Readonly<Record<string, number>>,
  upgrades: Readonly<Record<string, number>>,
): SaveData {
  return persist({ ...loadSave(), ingredients, upgrades });
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

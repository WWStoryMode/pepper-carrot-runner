import { DEBUG } from '@/config/display';

/**
 * Boot timing marks.
 *
 * Added while chasing Lighthouse's total blocking time, which reported 1.5 s of
 * script evaluation without saying which part. Guessing at that from the shape
 * of the code was how the first two attempts went wrong, so the marks stay.
 *
 * `performance.mark` costs microseconds, so these run always; only the readout
 * is behind `?debug=1`.
 */

export type BootMark =
  | 'module-evaluated'
  | 'game-constructed'
  | 'preload-started'
  | 'assets-loaded'
  | 'animations-registered'
  | 'title-ready';

const PREFIX = 'pcr:';

export function mark(name: BootMark): void {
  globalThis.performance?.mark?.(`${PREFIX}${name}`);
}

/** Print the boot breakdown. Called once the title is up. */
export function reportBootTimings(): void {
  if (!DEBUG) return;

  const entries = globalThis.performance
    ?.getEntriesByType?.('mark')
    .filter((entry) => entry.name.startsWith(PREFIX));
  if (entries === undefined || entries.length === 0) return;

  const rows = entries.map((entry, index) => ({
    step: entry.name.slice(PREFIX.length),
    at: `${Math.round(entry.startTime)} ms`,
    since: index === 0 ? '' : `+${Math.round(entry.startTime - entries[index - 1]!.startTime)} ms`,
  }));

  console.table(rows);
}

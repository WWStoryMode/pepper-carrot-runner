import type { Rng } from './rng';
import type { ChunkData } from './types';

/**
 * Picks the next chunk to append.
 *
 * The original was not endless: each level button ran a hand-written list of
 * seven-odd tmx filenames and then declared victory. Difficulty was purely that
 * authored ordering. Here the same seven maps are drawn from continuously, with
 * a difficulty ceiling that opens up as the run goes on.
 */

/** Distance over which the ceiling rises from "easiest only" to "anything". */
export const RAMP_DISTANCE = 45_000;

/** Chunks this far above the target are still eligible, to keep variety. */
const TOLERANCE = 0.25;

/** The easiest N chunks are always eligible, so early runs still vary. */
const ALWAYS_ELIGIBLE = 2;

export class ChunkSelector {
  private readonly byDifficulty: readonly number[];
  private readonly minDifficulty: number;
  private readonly maxDifficulty: number;
  private lastIndex = -1;

  constructor(
    private readonly chunks: readonly ChunkData[],
    private readonly rng: Rng,
  ) {
    if (chunks.length === 0) throw new Error('no chunks available');

    this.byDifficulty = chunks
      .map((_, index) => index)
      .sort((a, b) => chunks[a]!.difficulty - chunks[b]!.difficulty);

    const difficulties = chunks.map((c) => c.difficulty);
    this.minDifficulty = Math.min(...difficulties);
    this.maxDifficulty = Math.max(...difficulties);
  }

  reset(): void {
    this.lastIndex = -1;
  }

  /** The difficulty the run is currently aiming at. */
  targetDifficulty(distance: number): number {
    const progress = Math.min(1, Math.max(0, distance / RAMP_DISTANCE));
    return this.minDifficulty + (this.maxDifficulty - this.minDifficulty) * progress;
  }

  /**
   * Choose a chunk for a player at `distance`.
   *
   * Never returns the previous chunk, so the same map cannot appear twice in a
   * row — unless there is literally nothing else, which only happens with a
   * single-chunk data set.
   */
  next(distance: number): number {
    const target = this.targetDifficulty(distance);
    const ceiling = target + (this.maxDifficulty - this.minDifficulty) * TOLERANCE;

    let eligible = this.byDifficulty.filter(
      (index) => this.chunks[index]!.difficulty <= ceiling,
    );

    // Always keep a couple of easy options open, whatever the ceiling says.
    for (const index of this.byDifficulty.slice(0, ALWAYS_ELIGIBLE)) {
      if (!eligible.includes(index)) eligible.push(index);
    }

    const withoutRepeat = eligible.filter((index) => index !== this.lastIndex);
    if (withoutRepeat.length > 0) eligible = withoutRepeat;

    // Weight towards the target so the run trends harder without becoming
    // monotonous — a flat pick would keep serving level1 forever.
    const weights = eligible.map((index) => {
      const distanceFromTarget = Math.abs(this.chunks[index]!.difficulty - target);
      const spread = Math.max(1, this.maxDifficulty - this.minDifficulty);
      return 1 / (1 + (distanceFromTarget / spread) * 3);
    });

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = this.rng.next() * total;

    let chosen = eligible[eligible.length - 1]!;
    for (const [position, index] of eligible.entries()) {
      roll -= weights[position]!;
      if (roll <= 0) {
        chosen = index;
        break;
      }
    }

    this.lastIndex = chosen;
    return chosen;
  }
}

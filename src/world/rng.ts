/**
 * Small seedable PRNG (mulberry32).
 *
 * `Math.random` cannot be seeded, and chunk selection has to be reproducible:
 * the tests replay long runs and assert the sequence never stalls or repeats,
 * which is only meaningful if the same seed gives the same course.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
}

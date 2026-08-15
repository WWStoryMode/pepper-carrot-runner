import { FIXED_DT, MAX_STEPS_PER_FRAME } from '@/config/constants';

/**
 * Fixed-timestep accumulator.
 *
 * The original game integrated vertical motion once per rendered frame with no
 * delta, so its jump height and fall speed changed with the display refresh
 * rate — a 144 Hz monitor produced a different game. Decoupling simulation from
 * rendering fixes that, and keeping the step at exactly 1/60 s preserves the
 * original's integer motion sequence.
 */
export class FixedStepper {
  private accumulator = 0;
  private lastStepCount = 0;

  constructor(
    private readonly dt: number = FIXED_DT,
    private readonly maxSteps: number = MAX_STEPS_PER_FRAME,
  ) {}

  /**
   * Run as many fixed steps as `frameDelta` has earned.
   *
   * If the frame took so long that we would exceed `maxSteps` — a background
   * tab, a stalled main thread — the backlog is dropped rather than worked
   * through, so the game resumes in real time instead of fast-forwarding
   * through hazards the player never saw.
   */
  advance(frameDelta: number, step: (dt: number) => void): number {
    this.accumulator += frameDelta;

    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      step(this.dt);
      this.accumulator -= this.dt;
      steps += 1;
    }

    if (steps === this.maxSteps && this.accumulator >= this.dt) this.accumulator = 0;

    this.lastStepCount = steps;
    return steps;
  }

  /** Fraction of the way into the next pending step, for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.dt;
  }

  get stepsLastFrame(): number {
    return this.lastStepCount;
  }

  reset(): void {
    this.accumulator = 0;
    this.lastStepCount = 0;
  }
}

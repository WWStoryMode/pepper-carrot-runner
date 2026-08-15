import {
  COYOTE_TIME,
  DEATH_PLANE,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_SPEED,
  MAX_AIR_JUMPS,
  PLAYER_WIDTH,
  RUN_SPEED,
  TERMINAL_FALL,
} from '@/config/constants';
import { findLanding } from './collision';
import type { Platform, RunnerSnapshot, RunnerState } from './types';

/**
 * The player.
 *
 * Pure simulation — no rendering, no Phaser, no input polling. `x` advances at a
 * constant rate and `y` tracks the **feet**, in a Y-up world.
 *
 * The original moved the world leftward past a player pinned at x=147. We move
 * the player through a static world instead: identical on screen, but level data
 * stops needing to be mutated every frame, which matters once chunks stream in
 * M3.
 */
export class Runner {
  x = 0;
  y = 0;
  vy = 0;
  state: RunnerState = 'running';

  private grounded = true;
  private airJumpsLeft = MAX_AIR_JUMPS;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  /** Total distance travelled, in world units. */
  get distance(): number {
    return this.x;
  }

  get isDead(): boolean {
    return this.state === 'dying';
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  /** Air jumps still available. Drives the HUD later; used by the autopilot now. */
  get airJumps(): number {
    return this.airJumpsLeft;
  }

  snapshot(): RunnerSnapshot {
    return { x: this.x, y: this.y, state: this.state };
  }

  reset(x = 0, y = 0): void {
    this.x = x;
    this.y = y;
    this.vy = 0;
    this.state = 'running';
    this.grounded = true;
    this.airJumpsLeft = MAX_AIR_JUMPS;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  /**
   * Request a jump.
   *
   * Deliberate divergence from the original, which allowed a double jump *only*
   * from the `JUMPING` state — once past the apex, or after stepping off a
   * ledge, you were committed to the fall. That is unforgiving in a way players
   * read as a bug. Here an air jump is available whenever one is left,
   * and coyote time plus input buffering smooth the edges.
   */
  jump(): void {
    if (this.state === 'dying') return;

    if (this.grounded || this.coyoteTimer > 0) {
      this.groundJump();
      return;
    }

    if (this.airJumpsLeft > 0) {
      this.airJumpsLeft -= 1;
      this.vy = JUMP_SPEED;
      this.state = 'doubleJumping';
      return;
    }

    // Nothing available now — remember it in case we land shortly.
    this.jumpBufferTimer = JUMP_BUFFER;
  }

  private groundJump(): void {
    this.vy = JUMP_SPEED;
    this.state = 'jumping';
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.airJumpsLeft = MAX_AIR_JUMPS;
  }

  /** Advance one fixed step. `dt` should always be `FIXED_DT`. */
  step(dt: number, platforms: readonly Platform[]): void {
    if (this.state === 'dying') return;

    this.x += RUN_SPEED * dt;

    const prevFeet = this.y;
    const wasGrounded = this.grounded;

    // Integrate vertical motion: gravity first, then position — the order the
    // original used, which is what makes the apex 325 px rather than 351.
    this.vy -= GRAVITY * dt;
    if (this.vy < -TERMINAL_FALL) this.vy = -TERMINAL_FALL;
    this.y += this.vy * dt;

    const landing = findLanding(prevFeet, this.y, this.x, PLAYER_WIDTH / 2, platforms);

    if (landing !== null) {
      this.y = landing;
      this.vy = 0;
      this.grounded = true;
      this.airJumpsLeft = MAX_AIR_JUMPS;
      this.coyoteTimer = 0;
      this.state = 'running';
    } else {
      this.grounded = false;
      if (wasGrounded) this.coyoteTimer = COYOTE_TIME;
      else if (this.coyoteTimer > 0) this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

      // Past the apex the jump becomes a fall.
      if (this.vy < 0) this.state = 'falling';
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      if (this.grounded && this.jumpBufferTimer > 0) this.groundJump();
    }

    if (this.y < DEATH_PLANE) {
      this.state = 'dying';
      this.vy = 0;
    }
  }
}

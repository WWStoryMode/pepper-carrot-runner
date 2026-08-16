import Phaser from 'phaser';
import { FEET_TO_SPRITE_ORIGIN } from '@/config/constants';
import { ATLAS_KEY } from '@/art/animations';
import type { RunnerState } from '@/sim/types';

/**
 * Pepper and Carrot, drawn from a simulation snapshot.
 *
 * A view only: it reads the runner's state and never writes to it, so
 * `src/sim/` stays free of Phaser. Positioning reproduces the original's actor
 * hierarchy, where Carrot is a child of Pepper at per-state offsets.
 */

/** `Runner.scaleFactor` — 380 px source art drawn at 235.6 px in world. */
export const SPRITE_SCALE = 0.62;

/** Source frame size of the Pepper art. */
const PEPPER_FRAME = 380;

/** Half the on-screen width, to convert the sim's centre-x into a left edge. */
const PEPPER_HALF_WIDTH = (PEPPER_FRAME * SPRITE_SCALE) / 2;

/**
 * Carrot's offset from Pepper's sprite origin, per state, in unscaled units —
 * multiplied by SPRITE_SCALE at use, exactly as `Carrot.updatePosition` does.
 * These are what sit her on the broom.
 */
const CARROT_OFFSETS: Record<RunnerState, { x: number; y: number }> = {
  running: { x: -100, y: -4 },
  jumping: { x: 0, y: 49 },
  doubleJumping: { x: -12, y: 140 },
  falling: { x: 48, y: 123 },
  dying: { x: -34, y: -4 },
};

const PEPPER_ANIMATION: Record<RunnerState, string> = {
  running: 'pepper_run',
  jumping: 'pepper_jump',
  doubleJumping: 'pepper_doublejump',
  falling: 'pepper_fall',
  dying: 'pepper_hit',
};

const CARROT_ANIMATION: Record<RunnerState, string> = {
  running: 'carrot_run',
  jumping: 'carrot_jump',
  doubleJumping: 'carrot_doublejump',
  falling: 'carrot_fall',
  dying: 'carrot_hit',
};

export class PlayerView {
  private readonly pepper: Phaser.GameObjects.Sprite;
  private readonly carrot: Phaser.GameObjects.Sprite;
  private currentState: RunnerState | null = null;
  private attacking = false;

  constructor(scene: Phaser.Scene) {
    // Origin (0, 1) is the sprite's bottom-left, matching libGDX actor
    // coordinates, so Carrot's offsets can be used verbatim.
    this.carrot = scene.add
      .sprite(0, 0, ATLAS_KEY, 'carrot_run_01')
      .setOrigin(0, 1)
      .setScale(SPRITE_SCALE)
      .setDepth(49);

    this.pepper = scene.add
      .sprite(0, 0, ATLAS_KEY, 'pepper_run_01')
      .setOrigin(0, 1)
      .setScale(SPRITE_SCALE)
      // The original reserved z-index 50 for the runner, with level layers
      // sorting either side of it. Keeping the number makes M3 straightforward.
      .setDepth(50);

    this.setState('running');
  }

  /**
   * @param worldX Interpolated centre of the collision box, in sim coordinates.
   * @param feetY  Interpolated feet height, in sim coordinates (Y-up).
   */
  update(worldX: number, feetY: number, state: RunnerState, attacking = false): void {
    this.setAttacking(attacking);
    this.setState(state);

    // The sim tracks the feet; the art hangs 16 px below that, because the
    // original landed the player at `platformTop - offsetForFeet`.
    const originX = worldX - PEPPER_HALF_WIDTH;
    const originY = feetY - FEET_TO_SPRITE_ORIGIN;

    // Sim is Y-up, Phaser is Y-down.
    this.pepper.setPosition(originX, -originY);

    const offset = CARROT_OFFSETS[state];
    this.carrot.setPosition(
      originX + offset.x * SPRITE_SCALE,
      -(originY + offset.y * SPRITE_SCALE),
    );
  }

  private setState(state: RunnerState): void {
    if (state === this.currentState) return;
    this.currentState = state;

    // The original had four ATTACK_* states mirroring the movement ones; the
    // attack animation simply replaces the body while the swing lasts.
    if (!this.attacking) this.pepper.play(PEPPER_ANIMATION[state], true);
    this.carrot.play(CARROT_ANIMATION[state], true);
  }

  private setAttacking(attacking: boolean): void {
    if (attacking === this.attacking) return;
    this.attacking = attacking;

    if (attacking) {
      this.pepper.play('pepper_attack', true);
      return;
    }

    const state = this.currentState ?? 'running';
    this.pepper.play(PEPPER_ANIMATION[state], true);
  }

  setVisible(visible: boolean): void {
    this.pepper.setVisible(visible);
    this.carrot.setVisible(visible);
  }

  /** Tint applied while dead, so the greybox death state stays readable. */
  setDead(dead: boolean): void {
    const tint = dead ? 0x8899aa : 0xffffff;
    this.pepper.setTint(tint);
    this.carrot.setTint(tint);
  }

  destroy(): void {
    this.pepper.destroy();
    this.carrot.destroy();
  }
}

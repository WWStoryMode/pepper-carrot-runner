import Phaser from 'phaser';
import { ATLAS_KEY } from '@/art/animations';
import { MAX_HEALTH } from '@/config/constants';
import { COLORS } from '@/config/display';

/**
 * Run readout: distance, score, personal best.
 *
 * The original had no score at all — its HUD number was `getTotalPassedTiles()`,
 * a progress bar towards a fixed finish. An endless run needs something to
 * chase instead.
 */

/** One tile of the original's grid reads as a metre. */
const UNITS_PER_METRE = 95;

/** Score per metre travelled. Combo multipliers arrive with enemies in M4. */
const SCORE_PER_METRE = 1;

export const metresOf = (distance: number): number => Math.floor(distance / UNITS_PER_METRE);

export const scoreOf = (distance: number): number => metresOf(distance) * SCORE_PER_METRE;

/** Heart size in the atlas. */
const HEART_SIZE = 62;
const HEART_SCALE = 0.62;
const HEART_GAP = 6;

export class Hud {
  private readonly distanceText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private shownHealth = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private best: number,
  ) {
    this.distanceText = scene.add
      .text(24, 20, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '34px',
        color: COLORS.white,
      })
      .setScrollFactor(0)
      .setDepth(200)
      .setShadow(0, 2, '#000000cc', 4);

    this.bestText = scene.add
      .text(24, 62, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.lightBrown,
      })
      .setScrollFactor(0)
      .setDepth(200)
      .setShadow(0, 1, '#000000cc', 3);

    // Hearts run down the right edge, clear of the debug overlay on the left.
    const step = HEART_SIZE * HEART_SCALE + HEART_GAP;
    for (let i = 0; i < MAX_HEALTH; i += 1) {
      this.hearts.push(
        scene.add
          .image(scene.scale.width - 30, 30 + i * step, ATLAS_KEY, 'heart')
          .setOrigin(1, 0)
          .setScale(HEART_SCALE)
          .setScrollFactor(0)
          .setDepth(200),
      );
    }

    this.layout();
    this.update(0, MAX_HEALTH);
  }

  /** Re-place after a viewport change; only the hearts depend on width. */
  layout(): void {
    const step = HEART_SIZE * HEART_SCALE + HEART_GAP;
    for (const [index, heart] of this.hearts.entries()) {
      heart.setPosition(this.scene.scale.width - 30, 30 + index * step);
    }
  }

  setBest(best: number): void {
    this.best = best;
  }

  update(distance: number, health: number): void {
    this.distanceText.setText(`${metresOf(distance)} m`);
    this.bestText.setText(`best ${metresOf(this.best)} m`);

    if (health === this.shownHealth) return;
    this.shownHealth = health;

    for (const [index, heart] of this.hearts.entries()) {
      const filled = index < health;
      // The original swapped the drawable and dimmed the lost hearts to 0.6.
      heart.setTexture(ATLAS_KEY, filled ? 'heart' : 'heart-disabled');
      heart.setAlpha(filled ? 1 : 0.6);
    }
  }
}

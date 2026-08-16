import Phaser from 'phaser';
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

export class Hud {
  private readonly distanceText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private best: number) {
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

    this.update(0);
  }

  setBest(best: number): void {
    this.best = best;
  }

  update(distance: number): void {
    this.distanceText.setText(`${metresOf(distance)} m`);
    this.bestText.setText(`best ${metresOf(this.best)} m`);
  }
}

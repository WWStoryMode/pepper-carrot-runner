import Phaser from 'phaser';
import { COLORS, DEBUG, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/display';

/**
 * Placeholder scene for M0.
 *
 * Its only job is to prove the toolchain works end to end: Phaser boots, the
 * canvas sizes correctly, and the build pipeline produces something that runs.
 * M1 replaces this with the real game scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.black);

    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT / 2;

    this.add
      .text(cx, cy - 40, 'Pepper&Carrot Runner', {
        fontFamily: 'Georgia, serif',
        fontSize: '56px',
        color: COLORS.lightBrown,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 30, 'M0 — scaffold', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.grey,
      })
      .setOrigin(0.5);

    if (DEBUG) {
      this.add
        .text(8, 8, `phaser ${Phaser.VERSION}`, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: COLORS.skillGreen,
        })
        .setOrigin(0);
    }
  }
}

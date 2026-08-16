import Phaser from 'phaser';
import { ATLAS_KEY, registerAnimations } from '@/art/animations';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/display';

export const BACKGROUND_TEXTURE = 'testbg';

/**
 * Loads the generated art and registers animations.
 *
 * Everything here comes from `public/art/`, produced by `scripts/pack-atlas.ts`
 * — which runs automatically before `dev` and `build`, so a fresh checkout never
 * has to know it exists.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.showProgress();

    this.load.multiatlas(ATLAS_KEY, 'art/atlas.json', 'art');
    this.load.image(BACKGROUND_TEXTURE, 'art/testbg.webp');
  }

  create(): void {
    registerAnimations(this.anims);
    this.scene.start('Game');
  }

  private showProgress(): void {
    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(COLORS.black);

    const label = this.add
      .text(cx, cy - 40, 'loading', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.grey,
      })
      .setOrigin(0.5);

    const barWidth = 420;
    const track = this.add.graphics();
    track.fillStyle(0x432b2b, 1);
    track.fillRect(cx - barWidth / 2, cy, barWidth, 10);

    const fill = this.add.graphics();

    this.load.on('progress', (value: number) => {
      fill.clear();
      fill.fillStyle(0xd0a381, 1);
      fill.fillRect(cx - barWidth / 2, cy, barWidth * value, 10);
    });

    this.load.once('complete', () => {
      label.destroy();
      track.destroy();
      fill.destroy();
    });
  }
}

import Phaser from 'phaser';
import { ATLAS_KEY, registerAnimations } from '@/art/animations';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/display';
import { tilesetTextureKey } from '@/world/ChunkView';
import type { LevelData } from '@/world/types';

export const BACKGROUND_TEXTURE = 'testbg';
export const GROUND_TEXTURE = 'ground';
export const LEVELS_KEY = 'levels';

/**
 * Loads the generated art and level data, then registers animations.
 *
 * Everything comes from `public/art/`, produced by `scripts/pack-atlas.ts` and
 * `scripts/build-levels.ts`, which run automatically before `dev` and `build`.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.showProgress();

    this.load.multiatlas(ATLAS_KEY, 'art/atlas.json', 'art');
    this.load.image(BACKGROUND_TEXTURE, 'art/testbg.webp');
    this.load.image(GROUND_TEXTURE, 'art/ground.webp');
    this.load.json(LEVELS_KEY, 'art/levels.json');

    // The tileset list lives inside levels.json, so the spritesheets can only
    // be queued once it has arrived. Files added during a load join the same
    // batch, so this still completes before `create`.
    this.load.once(`filecomplete-json-${LEVELS_KEY}`, () => {
      const data = this.cache.json.get(LEVELS_KEY) as LevelData;
      for (const tileset of data.tilesets) {
        this.load.spritesheet(tilesetTextureKey(tileset.name), `art/${tileset.image}`, {
          frameWidth: tileset.tileWidth,
          frameHeight: tileset.tileHeight,
        });
      }
    });
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

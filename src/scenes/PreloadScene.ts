import Phaser from 'phaser';
import { ATLAS_KEY, registerAnimations } from '@/art/animations';
import { mark, reportBootTimings } from '@/config/perf';
import { dismissSplash, failSplash, setSplashProgress, setSplashStatus } from '@/ui/splash';
import { tilesetTextureKey } from '@/world/ChunkView';
import type { LevelData } from '@/world/types';

export const BACKGROUND_TEXTURE = 'testbg';
export const GROUND_TEXTURE = 'ground';
export const KITCHEN_TEXTURE = 'kitchen';
export const LEVELS_KEY = 'levels';

/** Where the kitchen backdrop lives, so the scene that needs it can fetch it. */
export const KITCHEN_TEXTURE_URL = 'art/kitchen.webp';

/**
 * Queue the level tilesets, skipping any already in the texture manager.
 *
 * Shared by the scene that needs them (Game) and the scene with time to spare
 * (Title), so neither has to know where the images live.
 */
export function queueLevelTilesets(scene: Phaser.Scene, levels: LevelData): void {
  for (const tileset of levels.tilesets) {
    const key = tilesetTextureKey(tileset.name);
    if (scene.textures.exists(key)) continue;

    scene.load.spritesheet(key, `art/${tileset.image}`, {
      frameWidth: tileset.tileWidth,
      frameHeight: tileset.tileHeight,
    });
  }
}

/**
 * Loads the generated art and level data, then registers animations.
 *
 * Everything comes from `public/art/`, produced by `scripts/pack-atlas.ts` and
 * `scripts/build-levels.ts`, which run automatically before `dev` and `build`.
 *
 * Progress is reported to the HTML splash rather than drawn on the canvas: the
 * splash is already on screen by this point, and a second bar appearing under
 * the first one just looks like a bug.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    mark('preload-started');
    this.reportProgress();

    this.load.multiatlas(ATLAS_KEY, 'art/atlas.json', 'art');
    this.load.image(BACKGROUND_TEXTURE, 'art/testbg.webp');
    this.load.image(GROUND_TEXTURE, 'art/ground.webp');
    this.load.json(LEVELS_KEY, 'art/levels.json');

    // Two things are deliberately absent, both of them off the path to the
    // title: the kitchen backdrop (850 KB for a screen reached from a menu) and
    // the level tilesets (needed only once a run starts). Decoding them here
    // cost ~140 ms before anyone could press anything. TitleScene fetches both
    // in the background; the scenes that need them can also fetch their own.
  }

  create(): void {
    mark('assets-loaded');
    registerAnimations(this.anims);
    mark('animations-registered');

    dismissSplash();
    this.scene.start('Title');

    mark('title-ready');
    reportBootTimings();
  }

  private reportProgress(): void {
    this.load.on('progress', setSplashProgress);

    // A missing or corrupt asset otherwise fails silently and leaves the game
    // on a black canvas, which says nothing to anyone.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      failSplash(`could not load ${file.key}`);
    });

    this.load.once('complete', () => setSplashStatus('ready'));
  }
}

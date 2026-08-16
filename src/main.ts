import Phaser from 'phaser';
import { COLORS, designSizeFor } from '@/config/display';
import { mark } from '@/config/perf';
import { GameScene } from '@/scenes/GameScene';
import { KitchenScene } from '@/scenes/KitchenScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { TitleScene } from '@/scenes/TitleScene';
import { installErrorBoundary } from '@/ui/errorBoundary';
import { failSplash } from '@/ui/splash';

installErrorBoundary();
mark('module-evaluated');

const initial = designSizeFor(globalThis.innerWidth, globalThis.innerHeight);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.black,
  scale: {
    // The design height is fixed and the width follows the aspect ratio, so FIT
    // scales without letterboxing on ordinary screens.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initial.width,
    height: initial.height,
  },
  render: {
    pixelArt: false,
    antialias: true,
    // Ask for the discrete GPU on machines that have one. The art is large and
    // the run scrolls continuously, so this is exactly the workload the hint is
    // meant for.
    powerPreference: 'high-performance',
  },
  input: {
    gamepad: true,
  },
  // Nothing here is transparent over the page, and telling the compositor so
  // saves it blending the canvas against the document on every frame.
  transparent: false,
  banner: false,
  scene: [PreloadScene, TitleScene, KitchenScene, GameScene],
};

function boot(): void {
  /**
   * Booting can fail outright — no WebGL, no canvas, a blocked context. Phaser
   * throws before any scene runs, so without this the splash would sit at zero
   * per cent forever with no explanation.
   */
  let game: Phaser.Game;
  try {
    game = new Phaser.Game(config);
  } catch (error) {
    failSplash('this browser could not start the game');
    throw error;
  }
  mark('game-constructed');

  /**
   * Expose the game for browser-level testing.
   *
   * `scripts/click-test.mjs` drives the real input pipeline through this — the
   * game-over buttons once shipped completely dead, and no amount of unit
   * testing or screenshotting would have caught it, because neither presses
   * anything.
   */
  (globalThis as unknown as { __pcr?: Phaser.Game }).__pcr = game;

  /**
   * Re-derive the design width when the window changes shape.
   *
   * Only the width moves; the height is the contract that keeps the world a
   * consistent size however the window is arranged.
   */
  let resizeHandle: ReturnType<typeof setTimeout> | undefined;
  globalThis.addEventListener('resize', () => {
    if (resizeHandle !== undefined) clearTimeout(resizeHandle);
    resizeHandle = setTimeout(() => {
      const size = designSizeFor(globalThis.innerWidth, globalThis.innerHeight);
      game.scale.setGameSize(size.width, size.height);
    }, 120);
  });
}

/**
 * Boot on the frame after this module finishes evaluating.
 *
 * Constructing the game takes ~300 ms — building the WebGL context and
 * compiling pipelines — and running it in the same task as module evaluation
 * makes one ~500 ms block during which the browser cannot paint. Yielding first
 * lets the splash actually appear, and splits one long task into two shorter
 * ones. The work is identical; only its scheduling changes.
 */
requestAnimationFrame(() => globalThis.setTimeout(boot, 0));

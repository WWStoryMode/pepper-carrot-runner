import Phaser from 'phaser';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/display';
import { GameScene } from '@/scenes/GameScene';
import { PreloadScene } from '@/scenes/PreloadScene';

/**
 * Surface uncaught errors on the page.
 *
 * A scene that throws inside `create` leaves Phaser rendering nothing at all,
 * so the canvas goes black with no clue as to why — including in headless
 * captures, where the console is not being read.
 */
function installErrorOverlay(): void {
  const show = (message: string): void => {
    let panel = document.getElementById('error-overlay');
    if (panel === null) {
      panel = document.createElement('pre');
      panel.id = 'error-overlay';
      panel.style.cssText = [
        'position:fixed',
        'inset:0',
        'margin:0',
        'padding:24px',
        'overflow:auto',
        'z-index:9999',
        'background:#1a0510f2',
        'color:#ff9db3',
        'font:14px/1.5 monospace',
        'white-space:pre-wrap',
      ].join(';');
      document.body.appendChild(panel);
    }
    panel.textContent += `${message}\n\n`;
  };

  globalThis.addEventListener('error', (event) => {
    show(`${event.message}\n${event.error?.stack ?? ''}`);
  });

  globalThis.addEventListener('unhandledrejection', (event) => {
    show(`Unhandled rejection: ${String(event.reason)}`);
  });
}

installErrorOverlay();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.black,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [PreloadScene, GameScene],
};

new Phaser.Game(config);

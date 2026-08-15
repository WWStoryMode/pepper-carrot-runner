import Phaser from 'phaser';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/display';
import { BootScene } from '@/scenes/BootScene';

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
  scene: [BootScene],
};

new Phaser.Game(config);

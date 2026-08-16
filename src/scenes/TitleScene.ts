import Phaser from 'phaser';
import { ATLAS_KEY } from '@/art/animations';
import { COLORS } from '@/config/display';
import { metresOf } from '@/hud/Hud';
import { loadSave, resetSave, setMuted } from '@/save/store';
import { BACKGROUND_TEXTURE } from '@/scenes/PreloadScene';

/**
 * Front door: best score, a start prompt, and the two settings worth having.
 *
 * The original's equivalent was a persistent six-button side menu drawn down
 * both screen edges across every screen, with a `setMaxCheckCount(2)` hack to
 * work out which button had just been pressed. This is one screen with one job.
 */
export class TitleScene extends Phaser.Scene {
  private muteLabel!: Phaser.GameObjects.Text;
  private resetLabel!: Phaser.GameObjects.Text;
  private resetArmed = false;

  constructor() {
    super('Title');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.black);

    this.add
      .tileSprite(0, 0, width, height, BACKGROUND_TEXTURE)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(2.6)
      .setTint(0x8b83a6);

    this.add
      .image(width / 2, height / 2 - 170, ATLAS_KEY, 'pepper_idle_01')
      .setScale(0.62)
      .setOrigin(0.5, 0.5);

    this.add
      .text(width / 2, height / 2 + 60, 'Pepper&Carrot Runner', {
        fontFamily: 'Georgia, serif',
        fontSize: '58px',
        color: COLORS.lightBrown,
      })
      .setOrigin(0.5);

    const save = loadSave();
    this.add
      .text(
        width / 2,
        height / 2 + 118,
        save.runs === 0
          ? 'an endless run through the potion cellar'
          : `best ${metresOf(save.bestDistance)} m over ${save.runs} run${save.runs === 1 ? '' : 's'}`,
        { fontFamily: 'monospace', fontSize: '20px', color: COLORS.white },
      )
      .setOrigin(0.5);

    const prompt = this.add
      .text(width / 2, height / 2 + 178, 'space or tap to run', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.skillOrange,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.25 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(width / 2, height - 116, 'jump: space / W / up or tap    spells: V Y X C', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: COLORS.grey,
      })
      .setOrigin(0.5);

    this.muteLabel = this.makeSetting(width / 2 - 130, height - 62, () => this.toggleMute());
    this.resetLabel = this.makeSetting(width / 2 + 130, height - 62, () => this.resetProgress());

    this.refreshSettings();
    this.bindStart();
  }

  private makeSetting(x: number, y: number, onPress: () => void): Phaser.GameObjects.Text {
    const label = this.add
      .text(x, y, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: COLORS.white,
        backgroundColor: '#432b2bcc',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    label.on(
      'pointerdown',
      (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        onPress();
      },
    );

    return label;
  }

  private refreshSettings(): void {
    const save = loadSave();
    this.muteLabel.setText(save.muted ? 'sound: off' : 'sound: on');
    this.resetLabel.setText(this.resetArmed ? 'tap again to erase' : 'reset progress');
  }

  private toggleMute(): void {
    setMuted(!loadSave().muted);
    this.refreshSettings();
  }

  /** Two-step, because erasing a best score by mis-tap would be infuriating. */
  private resetProgress(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.refreshSettings();
      this.time.delayedCall(3000, () => {
        this.resetArmed = false;
        this.refreshSettings();
      });
      return;
    }

    const muted = loadSave().muted;
    resetSave();
    setMuted(muted);
    this.scene.restart();
  }

  private bindStart(): void {
    const start = (): void => {
      this.scene.start('Game');
    };

    this.input.keyboard?.on('keydown-SPACE', start);
    this.input.keyboard?.on('keydown-ENTER', start);
    this.input.on('pointerdown', start);
  }
}

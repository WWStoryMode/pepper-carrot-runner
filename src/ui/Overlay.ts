import Phaser from 'phaser';
import { COLORS } from '@/config/display';

/**
 * A modal panel: dimmed background, heading, a few lines, and buttons.
 *
 * Shared by pause and game-over so they cannot drift apart. The original built
 * each of these as a separate `Screen` subclass that reconstructed its own
 * `Table` — and leaked a new set of `Texture`s every time, since `ScreenSwitch`
 * disposed nothing.
 */

export interface OverlayButton {
  readonly label: string;
  readonly onPress: () => void;
}

const BUTTON_WIDTH = 260;
const BUTTON_HEIGHT = 62;
const BUTTON_GAP = 20;

export class Overlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly buttons: Phaser.GameObjects.Container[] = [];
  private visible = false;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;

    this.dim = scene.add
      .rectangle(0, 0, width, height, 0x110410, 0.82)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      // Swallow taps so the game does not receive them through the panel.
      .setInteractive();

    this.heading = scene.add
      .text(width / 2, height / 2 - 150, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '58px',
        color: COLORS.lightBrown,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.body = scene.add
      .text(width / 2, height / 2 - 70, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.white,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    this.container = scene.add
      .container(0, 0, [this.dim, this.heading, this.body])
      .setDepth(500)
      .setScrollFactor(0);

    this.hide();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  show(heading: string, lines: readonly string[], buttons: readonly OverlayButton[]): void {
    this.visible = true;
    this.heading.setText(heading);
    this.body.setText(lines.join('\n'));

    this.clearButtons();
    this.buildButtons(buttons);

    this.container.setVisible(true);
    this.layout();
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.clearButtons();
  }

  /** Re-centre after a viewport change. */
  layout(): void {
    const { width, height } = this.scene.scale;

    this.dim.setSize(width, height);
    this.heading.setPosition(width / 2, height / 2 - 150);
    this.body.setPosition(width / 2, height / 2 - 70);

    const totalWidth =
      this.buttons.length * BUTTON_WIDTH + Math.max(0, this.buttons.length - 1) * BUTTON_GAP;
    let x = width / 2 - totalWidth / 2 + BUTTON_WIDTH / 2;

    for (const button of this.buttons) {
      button.setPosition(x, height / 2 + 110);
      x += BUTTON_WIDTH + BUTTON_GAP;
    }
  }

  private buildButtons(buttons: readonly OverlayButton[]): void {
    for (const spec of buttons) {
      const background = this.scene.add
        .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 0x432b2b, 1)
        .setStrokeStyle(2, 0xd0a381, 1)
        .setInteractive({ useHandCursor: true });

      const label = this.scene.add
        .text(0, 0, spec.label, {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: COLORS.white,
        })
        .setOrigin(0.5);

      background.on('pointerover', () => background.setFillStyle(0x5d3a3a, 1));
      background.on('pointerout', () => background.setFillStyle(0x432b2b, 1));
      background.on(
        'pointerdown',
        (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          spec.onPress();
        },
      );

      const group = this.scene.add
        .container(0, 0, [background, label])
        .setDepth(501)
        .setScrollFactor(0);

      this.buttons.push(group);
      this.container.add(group);
    }
  }

  private clearButtons(): void {
    for (const button of this.buttons) button.destroy(true);
    this.buttons.length = 0;
  }
}

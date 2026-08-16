import Phaser from 'phaser';
import { COLORS } from '@/config/display';

/**
 * A modal panel: dimmed background, heading, a few lines, and buttons.
 *
 * Shared by pause and game-over so they cannot drift apart. The original built
 * each of these as a separate `Screen` subclass that reconstructed its own
 * `Table` — and leaked a new set of `Texture`s every time, since `ScreenSwitch`
 * disposed nothing.
 *
 * **Everything here is a top-level scene object with an explicit depth, not a
 * Container.** An earlier version nested the panel in containers, and the
 * buttons did not respond to clicks at all. Two things make this version
 * reliable: input ordering is decided by depth on plain objects, and every
 * interactive area is given an explicit hit-area geometry rather than relying
 * on one being inferred — Shapes carry no texture frame to infer it from.
 */

export interface OverlayButton {
  readonly label: string;
  readonly onPress: () => void;
}

export interface OverlayOptions {
  /**
   * Action for a press that lands on the dim, not on a button.
   *
   * The scene must not listen for taps itself while a panel is up: a
   * scene-level `pointerdown` fires for every press including ones on the
   * buttons, and acts first — which is precisely how "menu" came to be
   * unreachable while "run again" appeared to work, restarting being what it
   * would have done anyway.
   */
  readonly onBackground?: () => void;
}

const BUTTON_WIDTH = 260;
const BUTTON_HEIGHT = 62;
const BUTTON_GAP = 20;

const DEPTH_DIM = 500;
const DEPTH_TEXT = 501;
const DEPTH_BUTTON = 502;

interface Button {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

export class Overlay {
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private visible = false;
  private backgroundAction: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;

    this.dim = scene.add
      .rectangle(0, 0, width, height, 0x110410, 0.82)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_DIM);

    // Swallow taps so the game does not receive them through the panel. The
    // hit area is stated outright; a Shape has no frame to derive one from.
    this.dim.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );

    // Buttons sit above the dim, so `topOnly` hit testing means this only
    // fires for presses that missed them.
    this.dim.on('pointerup', () => this.backgroundAction?.());

    this.heading = scene.add
      .text(width / 2, height / 2 - 150, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '58px',
        color: COLORS.lightBrown,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);

    this.body = scene.add
      .text(width / 2, height / 2 - 70, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.white,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);

    this.hide();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  show(
    heading: string,
    lines: readonly string[],
    buttons: readonly OverlayButton[],
    options: OverlayOptions = {},
  ): void {
    this.visible = true;
    this.backgroundAction = options.onBackground ?? null;
    this.heading.setText(heading);
    this.body.setText(lines.join('\n'));

    this.clearButtons();
    this.buildButtons(buttons);

    this.dim.setVisible(true);
    this.dim.input!.enabled = true;
    this.heading.setVisible(true);
    this.body.setVisible(true);

    this.layout();
  }

  hide(): void {
    this.visible = false;
    this.backgroundAction = null;
    this.dim.setVisible(false);
    if (this.dim.input) this.dim.input.enabled = false;
    this.heading.setVisible(false);
    this.body.setVisible(false);
    this.clearButtons();
  }

  /** Re-place and re-size after a viewport change. */
  layout(): void {
    const { width, height } = this.scene.scale;

    this.dim.setSize(width, height);
    this.dim.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );

    this.heading.setPosition(width / 2, height / 2 - 150);
    this.body.setPosition(width / 2, height / 2 - 70);

    const total =
      this.buttons.length * BUTTON_WIDTH + Math.max(0, this.buttons.length - 1) * BUTTON_GAP;
    let x = width / 2 - total / 2 + BUTTON_WIDTH / 2;
    const y = height / 2 + 110;

    for (const button of this.buttons) {
      button.background.setPosition(x, y);
      button.label.setPosition(x, y);
      x += BUTTON_WIDTH + BUTTON_GAP;
    }
  }

  private buildButtons(specs: readonly OverlayButton[]): void {
    for (const spec of specs) {
      const background = this.scene.add
        .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 0x432b2b, 1)
        .setStrokeStyle(2, 0xd0a381, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH_BUTTON);

      // Hit areas are in un-origin-adjusted local space: Phaser adds the
      // object's displayOrigin to the local point before testing. So this is
      // (0, 0, w, h) even though the origin is 0.5 — offsetting it by half the
      // size, as an earlier version did, shifted the clickable region up and
      // left of the button you can see, and pressed its neighbour.
      background.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT),
        Phaser.Geom.Rectangle.Contains,
      );
      background.input!.cursor = 'pointer';

      const label = this.scene.add
        .text(0, 0, spec.label, {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: COLORS.white,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_BUTTON + 1);

      background.on('pointerover', () => background.setFillStyle(0x5d3a3a, 1));
      background.on('pointerout', () => background.setFillStyle(0x432b2b, 1));

      // `pointerup` rather than `pointerdown`: the press that opened this panel
      // can still be travelling, and acting on the down edge lets a single tap
      // dismiss the panel and immediately trigger whatever is underneath.
      background.on('pointerup', () => spec.onPress());

      this.buttons.push({ background, label });
    }
  }

  private clearButtons(): void {
    for (const button of this.buttons) {
      button.background.destroy();
      button.label.destroy();
    }
    this.buttons = [];
  }
}

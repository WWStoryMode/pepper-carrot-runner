import Phaser from 'phaser';
import { ATLAS_KEY } from '@/art/animations';
import { COLORS } from '@/config/display';
import { ABILITIES, type AbilitySlot } from '@/sim/abilities';

/**
 * The four spell buttons, bottom-right.
 *
 * The original arranged these as a quarter-circle radial menu and hit-tested it
 * by hand: three 30° sectors of an annulus between radius 200 and 373, plus an
 * inner disc for the melee slot, with the charge shown by *scaling* a wedge
 * sprite rather than clipping it. Clever, but it depends on knowing where the
 * sectors are, which is exactly what a first-time player does not.
 *
 * These are four plain circular buttons on an arc instead: bigger touch
 * targets, obvious boundaries, and charge shown as a ring that fills.
 */

const BUTTON_SIZE = 96;
const MARGIN = 28;

/** Where each button sits, as an offset from the bottom-right corner. */
const LAYOUT: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 108, dy: -18 },
  { dx: 196, dy: -96 },
  { dx: 214, dy: -204 },
];

const TINTS: readonly number[] = [0xffffff, 0xffac0e, 0xa5ff30, 0x26cdff];

interface Slot {
  readonly button: Phaser.GameObjects.Image;
  readonly ring: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly centreX: number;
  readonly centreY: number;
  shownCharge: number;
  shownReady: boolean;
}

export class AbilityBar {
  private readonly slots: Slot[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly onActivate: (slot: AbilitySlot) => void,
  ) {
    const right = scene.scale.width - MARGIN;
    const bottom = scene.scale.height - MARGIN;

    for (const def of ABILITIES) {
      const place = LAYOUT[def.slot]!;
      const cx = right - BUTTON_SIZE / 2 - place.dx;
      const cy = bottom - BUTTON_SIZE / 2 + place.dy;

      const ring = scene.add.graphics().setScrollFactor(0).setDepth(199);

      const button = scene.add
        .image(cx, cy, ATLAS_KEY, `button_skill${def.slot}`)
        .setDisplaySize(BUTTON_SIZE, BUTTON_SIZE)
        .setScrollFactor(0)
        .setDepth(200)
        .setInteractive({ useHandCursor: true });

      // Stop the tap from also reaching the scene's jump handler.
      button.on('pointerdown', (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.onActivate(def.slot);
      });

      const label = scene.add
        .text(cx, cy + BUTTON_SIZE / 2 + 2, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: COLORS.white,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(201);

      this.slots.push({
        button,
        ring,
        label,
        centreX: cx,
        centreY: cy,
        shownCharge: -1,
        shownReady: false,
      });
    }
  }

  /** Reflect current charge and readiness. */
  update(energy: readonly number[], runningSlot: AbilitySlot | null): void {
    for (const def of ABILITIES) {
      const slot = this.slots[def.slot]!;
      const charge = energy[def.slot] ?? 0;
      const ready = def.cost === 0 || charge >= def.cost;
      const running = runningSlot === def.slot;

      slot.button.setAlpha(running ? 1 : ready ? 0.95 : 0.4);
      slot.button.setTint(ready ? TINTS[def.slot]! : 0x555566);

      if (charge === slot.shownCharge && ready === slot.shownReady) continue;
      slot.shownCharge = charge;
      slot.shownReady = ready;

      slot.label.setText(def.cost === 0 ? '' : `${charge}/${def.cost}`);
      this.drawRing(slot, def.cost === 0 ? 1 : charge / def.cost, ready, TINTS[def.slot]!);
    }
  }

  /** Charge as an arc around the button, filling clockwise from the top. */
  private drawRing(slot: Slot, fraction: number, ready: boolean, colour: number): void {
    const radius = BUTTON_SIZE / 2 + 7;
    slot.ring.clear();

    slot.ring.lineStyle(5, 0x000000, 0.45);
    slot.ring.strokeCircle(slot.centreX, slot.centreY, radius);

    if (fraction <= 0) return;

    slot.ring.lineStyle(5, colour, ready ? 1 : 0.75);
    slot.ring.beginPath();
    slot.ring.arc(
      slot.centreX,
      slot.centreY,
      radius,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * Math.min(1, fraction)),
      false,
    );
    slot.ring.strokePath();
  }
}

import Phaser from 'phaser';
import { ATLAS_KEY } from '@/art/animations';
import { COLORS } from '@/config/display';
import { metresOf } from '@/hud/Hud';
import {
  brew,
  canBrew,
  ghostFrame,
  INGREDIENTS_PER_BREW,
  levelOf,
  loadoutFor,
  UPGRADES,
  type UpgradeDef,
} from '@/progression/upgrades';
import { loadSave, saveProgression } from '@/save/store';
import { KITCHEN_TEXTURE } from '@/scenes/PreloadScene';

/**
 * Pepper's kitchen: spend what you gathered.
 *
 * The original had this screen and most of the loop — ingredients gathered in
 * levels, dragged into a cauldron, brewed into a potion, fed to a ghost that
 * changed colour and did nothing else. The parts are the same; the potion now
 * buys something.
 */

interface Row {
  readonly def: UpgradeDef;
  readonly icon: Phaser.GameObjects.Image;
  readonly name: Phaser.GameObjects.Text;
  readonly detail: Phaser.GameObjects.Text;
  readonly button: Phaser.GameObjects.Rectangle;
  readonly buttonLabel: Phaser.GameObjects.Text;
}

const BUTTON_WIDTH = 190;
const BUTTON_HEIGHT = 52;

export class KitchenScene extends Phaser.Scene {
  private rows: Row[] = [];
  private ghost!: Phaser.GameObjects.Image;
  private summary!: Phaser.GameObjects.Text;

  constructor() {
    super('Kitchen');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.black);

    // Cover the frame rather than stretch to it: the art is 1280×720 and the
    // design width follows the window, so the aspect ratios rarely match.
    const backdrop = this.add.image(width / 2, height / 2, KITCHEN_TEXTURE).setTint(0x9a90ad);
    backdrop.setScale(Math.max(width / backdrop.width, height / backdrop.height));

    this.add
      .text(width / 2, 46, 'the kitchen', {
        fontFamily: 'Georgia, serif',
        fontSize: '46px',
        color: COLORS.lightBrown,
      })
      .setOrigin(0.5);

    this.summary = this.add
      .text(width / 2, 100, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.white,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0);

    // The ghost the original fed, now showing what the ward upgrade is worth.
    this.ghost = this.add
      .image(width / 2, height - 190, ATLAS_KEY, 'ghost_basic')
      .setScale(0.75)
      .setOrigin(0.5, 1);

    this.buildRows();
    this.refresh();

    this.add
      .text(width / 2, height - 44, 'Esc or tap here to go back', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: COLORS.white,
        backgroundColor: '#432b2bcc',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('Title'));

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Title'));
  }

  private buildRows(): void {
    // Built into a local array and assigned at the end, because Phaser reuses
    // the scene *instance* across visits — only the display list is destroyed
    // on shutdown. Appending to the existing array would leave `refresh` writing
    // to Text objects whose canvas is already gone.
    const rows: Row[] = [];
    const { width } = this.scale;
    const left = Math.max(60, width / 2 - 460);
    // Right-aligned, so the description never has to fight the button for room.
    const buttonX = Math.min(width - 130, width / 2 + 430);
    let y = 210;

    for (const def of UPGRADES) {
      const icon = this.add.image(left, y, ATLAS_KEY, def.ingredient).setScale(0.62).setOrigin(0.5);

      const name = this.add
        .text(left + 70, y - 34, def.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '26px',
          color: COLORS.lightBrown,
        })
        .setOrigin(0, 0);

      const detail = this.add
        .text(left + 70, y - 2, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: COLORS.white,
          lineSpacing: 4,
          // Stop short of the button whatever the window is doing.
          wordWrap: { width: buttonX - BUTTON_WIDTH / 2 - (left + 100) },
        })
        .setOrigin(0, 0);

      const button = this.add
        .rectangle(buttonX, y, BUTTON_WIDTH, BUTTON_HEIGHT, 0x432b2b, 1)
        .setStrokeStyle(2, 0xd0a381, 1);

      // Hit areas are in un-origin-adjusted local space: Phaser adds the
      // object's displayOrigin before testing, so this is (0, 0, w, h) despite
      // the origin being 0.5.
      button.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT),
        Phaser.Geom.Rectangle.Contains,
      );
      button.input!.cursor = 'pointer';

      const buttonLabel = this.add
        .text(buttonX, y, '', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: COLORS.white,
        })
        .setOrigin(0.5);

      button.on('pointerover', () => button.setFillStyle(0x5d3a3a, 1));
      button.on('pointerout', () => button.setFillStyle(0x432b2b, 1));
      button.on('pointerup', () => this.tryBrew(def));

      rows.push({ def, icon, name, detail, button, buttonLabel });
      y += 130;
    }

    this.rows = rows;
  }

  private tryBrew(def: UpgradeDef): void {
    const save = loadSave();
    const result = brew(def, save.ingredients, save.upgrades);
    if (!result.brewed) return;

    saveProgression(result.ingredients, result.levels);
    this.refresh();
  }

  private refresh(): void {
    const save = loadSave();
    const loadout = loadoutFor(save.upgrades);

    this.summary.setText(
      [
        `best ${metresOf(save.bestDistance)} m   runs ${save.runs}   spells cast on ${save.stats.kills} enemies`,
        `${loadout.maxHealth} hearts   ${loadout.startingCharge} starting charge   ${loadout.wards} ward${loadout.wards === 1 ? '' : 's'}`,
      ].join('\n'),
    );

    this.ghost.setTexture(ATLAS_KEY, ghostFrame(levelOf(save.upgrades, 'ward')));

    for (const row of this.rows) {
      const held = save.ingredients[row.def.ingredient] ?? 0;
      const level = levelOf(save.upgrades, row.def.id);
      const maxed = level >= row.def.maxLevel;
      const ready = canBrew(row.def, save.ingredients, save.upgrades);

      row.detail.setText(
        [
          row.def.description,
          `level ${level}/${row.def.maxLevel}   ·   ${held}/${INGREDIENTS_PER_BREW} ingredients`,
        ].join('\n'),
      );

      row.buttonLabel.setText(maxed ? 'mastered' : ready ? 'brew' : 'not enough');
      row.button.setFillStyle(ready ? 0x432b2b : 0x2a1c26, 1);
      row.button.setStrokeStyle(2, ready ? 0xd0a381 : 0x5a4a55, 1);
      row.buttonLabel.setColor(ready ? COLORS.white : COLORS.grey);
      row.icon.setAlpha(held > 0 ? 1 : 0.35);
    }
  }
}

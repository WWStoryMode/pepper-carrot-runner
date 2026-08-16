import Phaser from 'phaser';
import { COLORS } from '@/config/display';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '@/config/constants';
import type { Platform, RunnerState } from '@/sim/types';

const HITBOX_COLOR = 0xff3b6b;
const PLATFORM_COLOR = 0x26cdff;

export interface DebugFrame {
  readonly state: RunnerState;
  readonly x: number;
  readonly y: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly steps: number;
  readonly fps: number;
  readonly peakHeight: number;
  readonly lastAirtime: number;
  readonly chunks: number;
  readonly sprites: number;
  readonly pool: number;
  readonly entities: number;
  readonly health: number;
}

/**
 * Diagnostic view for the simulation.
 *
 * This is the primary tool for judging whether the physics are right, so it
 * stays in the build behind `?debug=1` rather than being stripped — the numbers
 * matter as much later, when TMX chunks replace the greybox course, as they do
 * now.
 */
export class DebugOverlay {
  private readonly shapes: Phaser.GameObjects.Graphics;
  private readonly readout: Phaser.GameObjects.Text;
  private visible: boolean;

  constructor(scene: Phaser.Scene, visible: boolean) {
    this.visible = visible;

    this.shapes = scene.add.graphics();
    this.shapes.setDepth(100);

    this.readout = scene.add
      // Below the HUD, which owns the top-left corner.
      .text(10, 100, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.skillGreen,
        backgroundColor: '#00000099',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.setVisible(visible);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.shapes.setVisible(visible);
    this.readout.setVisible(visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * `renderX`/`renderY` are the interpolated draw position in Phaser space
   * (Y-down), so the boxes sit exactly where the sprite does.
   */
  draw(frame: DebugFrame, renderX: number, renderY: number, platforms: readonly Platform[]): void {
    if (!this.visible) return;

    this.shapes.clear();

    this.shapes.lineStyle(1, PLATFORM_COLOR, 0.9);
    for (const platform of platforms) {
      // Y-up world → Y-down screen: the top surface is at -y.
      this.shapes.strokeRect(platform.x, -platform.y, platform.width, platform.height);
      // Emphasise the collidable edge; the other three sides are decoration.
      this.shapes.lineStyle(3, PLATFORM_COLOR, 1);
      this.shapes.lineBetween(platform.x, -platform.y, platform.x + platform.width, -platform.y);
      this.shapes.lineStyle(1, PLATFORM_COLOR, 0.9);
    }

    this.shapes.lineStyle(2, HITBOX_COLOR, 1);
    this.shapes.strokeRect(
      renderX - PLAYER_WIDTH / 2,
      renderY - PLAYER_HEIGHT,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
    );
    // Feet marker — the value the simulation actually tracks.
    this.shapes.lineBetween(renderX - 14, renderY, renderX + 14, renderY);

    this.readout.setText([
      `state    ${frame.state}${frame.grounded ? ' (grounded)' : ''}`,
      `x        ${frame.x.toFixed(1)}`,
      `y        ${frame.y.toFixed(1)}`,
      `vy       ${frame.vy.toFixed(1)}`,
      `peak     ${frame.peakHeight.toFixed(1)} px`,
      `airtime  ${frame.lastAirtime.toFixed(3)} s`,
      `steps    ${frame.steps}`,
      `fps      ${frame.fps.toFixed(0)}`,
      `health   ${frame.health}`,
      `chunks   ${frame.chunks}  entities ${frame.entities}`,
      // If `pool` keeps climbing over a long run, recycling is leaking.
      `sprites  ${frame.sprites} / pool ${frame.pool}`,
    ]);
  }

  destroy(): void {
    this.shapes.destroy();
    this.readout.destroy();
  }
}

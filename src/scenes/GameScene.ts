import Phaser from 'phaser';
import { FEET_TO_SPRITE_ORIGIN, PLAYER_HEIGHT, PLAYER_SCREEN_X, PLAYER_WIDTH } from '@/config/constants';
import { AUTOPILOT, COLORS, DEBUG } from '@/config/display';
import { shouldJump } from '@/sim/autopilot';
import { DebugOverlay } from '@/debug/DebugOverlay';
import { TEST_LEVEL, TEST_LEVEL_END, TEST_LEVEL_START } from '@/levels/testLevel';
import { FixedStepper } from '@/sim/FixedStepper';
import { Runner } from '@/sim/Runner';
import type { RunnerSnapshot } from '@/sim/types';

/** Screen height at which the player's feet sit before the camera starts to follow. */
const FEET_SCREEN_Y = 520;

/** Vertical slack before the camera reacts, so ordinary jumps don't drag the world. */
const CAMERA_DEADZONE = 150;

/** Exponential follow rate; higher snaps faster. */
const CAMERA_STIFFNESS = 7;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * M1 gameplay scene.
 *
 * Everything here is greybox: coloured rectangles standing in for art so the
 * jump arc and the one-way platforms can be judged on their own. M2 swaps the
 * rectangles for Pepper and Carrot without touching `src/sim/`.
 */
export class GameScene extends Phaser.Scene {
  private runner!: Runner;
  private stepper!: FixedStepper;
  private shapes!: Phaser.GameObjects.Graphics;
  private overlay!: DebugOverlay;
  private banner!: Phaser.GameObjects.Text;

  private previous!: RunnerSnapshot;
  private cameraFocusY = 0;

  // Measured per jump so the debug readout can confirm the arc against the
  // 325 px / 0.85 s figures the original produces.
  private peakHeight = 0;
  private lastAirtime = 0;
  private airtime = 0;
  private launchHeight = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.black);

    this.runner = new Runner();
    this.stepper = new FixedStepper();
    this.shapes = this.add.graphics();
    this.overlay = new DebugOverlay(this, DEBUG);

    this.banner = this.add
      .text(this.scale.width / 2, 150, '', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: COLORS.white,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);

    this.bindInput();
    this.restart();
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-SPACE', this.onJump, this);
      keyboard.on('keydown-UP', this.onJump, this);
      keyboard.on('keydown-W', this.onJump, this);
      keyboard.on('keydown-R', this.restart, this);
      keyboard.on('keydown-BACKTICK', () => this.overlay.toggle());
    }

    // Touch and mouse: anywhere on the canvas jumps, or restarts once dead.
    this.input.on('pointerdown', this.onJump, this);
  }

  private onJump(): void {
    if (this.runner.isDead) {
      this.restart();
      return;
    }
    this.runner.jump();
  }

  private restart(): void {
    this.runner.reset(TEST_LEVEL_START.x, TEST_LEVEL_START.y);
    this.stepper.reset();
    this.previous = this.runner.snapshot();
    this.cameraFocusY = this.runner.y;
    this.peakHeight = 0;
    this.lastAirtime = 0;
    this.airtime = 0;
    this.launchHeight = this.runner.y;
    this.banner.setText('');
  }

  override update(_time: number, delta: number): void {
    const dtSeconds = delta / 1000;

    let previous = this.runner.snapshot();

    const steps = this.stepper.advance(dtSeconds, (dt) => {
      previous = this.runner.snapshot();
      if (AUTOPILOT && shouldJump(this.runner, TEST_LEVEL)) this.runner.jump();
      this.runner.step(dt, TEST_LEVEL);
      this.measureArc(dt);
    });

    if (steps > 0) this.previous = previous;

    const current = this.runner.snapshot();
    const alpha = Phaser.Math.Clamp(this.stepper.alpha, 0, 1);
    const worldX = lerp(this.previous.x, current.x, alpha);
    const worldY = lerp(this.previous.y, current.y, alpha);

    this.updateCamera(worldX, worldY, dtSeconds);
    this.render(worldX, worldY);

    this.overlay.draw(
      {
        state: current.state,
        x: current.x,
        y: current.y,
        vy: this.runner.vy,
        grounded: this.runner.isGrounded,
        steps,
        fps: this.game.loop.actualFps,
        peakHeight: this.peakHeight,
        lastAirtime: this.lastAirtime,
      },
      worldX,
      -worldY,
      TEST_LEVEL,
    );

    this.updateBanner();
  }

  /**
   * Track height gained and time spent airborne per excursion, so the debug
   * readout reports the real arc rather than the one we assume.
   */
  private measureArc(dt: number): void {
    if (this.runner.isGrounded) {
      if (this.airtime > 0) this.lastAirtime = this.airtime;
      this.airtime = 0;
      this.launchHeight = this.runner.y;
      this.peakHeight = 0;
      return;
    }

    this.airtime += dt;
    const gained = this.runner.y - this.launchHeight;
    if (gained > this.peakHeight) this.peakHeight = gained;
  }

  private updateCamera(worldX: number, worldY: number, dt: number): void {
    let target = this.cameraFocusY;
    if (worldY > this.cameraFocusY + CAMERA_DEADZONE) target = worldY - CAMERA_DEADZONE;
    else if (worldY < this.cameraFocusY - CAMERA_DEADZONE) target = worldY + CAMERA_DEADZONE;

    // Frame-rate independent exponential smoothing.
    this.cameraFocusY = lerp(this.cameraFocusY, target, 1 - Math.exp(-CAMERA_STIFFNESS * dt));

    const camera = this.cameras.main;
    camera.scrollX = worldX - PLAYER_SCREEN_X;
    camera.scrollY = -this.cameraFocusY - FEET_SCREEN_Y;
  }

  private render(worldX: number, worldY: number): void {
    const g = this.shapes;
    g.clear();

    const camera = this.cameras.main;
    const left = camera.scrollX - 200;
    const right = camera.scrollX + camera.width + 200;

    for (const platform of TEST_LEVEL) {
      if (platform.x + platform.width < left || platform.x > right) continue;

      // Y-up world → Y-down screen.
      const top = -platform.y;
      g.fillStyle(0x4c2920, 1);
      g.fillRect(platform.x, top, platform.width, platform.height);
      g.fillStyle(0xd0a381, 1);
      g.fillRect(platform.x, top, platform.width, 10);
    }

    // The runner: a rectangle standing on its feet.
    const bodyTop = -worldY - PLAYER_HEIGHT;
    g.fillStyle(this.runner.isDead ? 0x7d7d7d : 0xffac0e, 1);
    g.fillRect(worldX - PLAYER_WIDTH / 2, bodyTop, PLAYER_WIDTH, PLAYER_HEIGHT);

    // A notch marking where the sprite origin will sit once art arrives in M2.
    g.fillStyle(0x110410, 1);
    g.fillRect(worldX - 4, -worldY - FEET_TO_SPRITE_ORIGIN, 8, 4);
  }

  private updateBanner(): void {
    if (this.runner.isDead) {
      this.banner.setText('you fell\n\ntap or press R to restart');
      return;
    }
    if (this.runner.x >= TEST_LEVEL_END) {
      this.banner.setText('course complete\n\ntap or press R to restart');
      return;
    }
    this.banner.setText('');
  }
}

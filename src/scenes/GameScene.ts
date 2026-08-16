import Phaser from 'phaser';
import { PLAYER_SCREEN_X } from '@/config/constants';
import { AUTOPILOT, COLORS, DEBUG, START_X } from '@/config/display';
import { DebugOverlay } from '@/debug/DebugOverlay';
import { PlayerView } from '@/entities/PlayerView';
import { Hud, scoreOf } from '@/hud/Hud';
import { loadSave, saveRun } from '@/save/store';
import { shouldJump } from '@/sim/autopilot';
import { FixedStepper } from '@/sim/FixedStepper';
import { Runner } from '@/sim/Runner';
import type { Platform, RunnerSnapshot } from '@/sim/types';
import { BACKGROUND_TEXTURE, GROUND_TEXTURE, LEVELS_KEY } from '@/scenes/PreloadScene';
import { ChunkStream, GROUND_Y } from '@/world/ChunkStream';
import { ChunkView } from '@/world/ChunkView';
import { Rng } from '@/world/rng';
import type { LevelData } from '@/world/types';

/** Screen height at which the player's feet sit. Matches the original's 513. */
const FEET_SCREEN_Y = 520;

/**
 * How far the player may rise above the camera's anchor before it gives chase.
 * A full double jump reaches ~650 px, so this keeps them on screen without the
 * world lurching during every ordinary hop.
 */
const CAMERA_MAX_ABOVE = 380;

/** The same, downward, so a long fall does not outrun the view. */
const CAMERA_MAX_BELOW = 260;

/** Exponential follow rate; higher snaps faster. */
const CAMERA_STIFFNESS = 7;

/**
 * Parallax rate for the wall behind the level.
 *
 * The original had none: `Background.diffX` was hardcoded to 0, so the backdrop
 * scrolled locked to the world.
 */
const BACKGROUND_PARALLAX = 0.35;

/** How far the ground strip extends below its surface. */
const GROUND_DEPTH = 400;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Gameplay scene.
 *
 * Chunks of the original's level data stream past endlessly; Pepper and Carrot
 * are drawn from the atlas. The scene reads `src/sim/` and never writes to it,
 * which is what lets the physics be tested without a browser.
 */
export class GameScene extends Phaser.Scene {
  private runner!: Runner;
  private stepper!: FixedStepper;
  private overlay!: DebugOverlay;
  private banner!: Phaser.GameObjects.Text;
  private player!: PlayerView;
  private backdrop!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private hud!: Hud;

  private levels!: LevelData;
  private stream!: ChunkStream;
  private chunks!: ChunkView;
  private platforms: readonly Platform[] = [];

  private previous!: RunnerSnapshot;
  private cameraFocusY = 0;
  private cameraAnchorY = 0;
  private recorded = false;

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
    this.levels = this.cache.json.get(LEVELS_KEY) as LevelData;

    this.backdrop = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, BACKGROUND_TEXTURE)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100)
      // The source tile is only 200 px. Scaling it up and darkening it stops
      // the repeat from reading as wallpaper and keeps the characters forward.
      .setTileScale(2.6)
      .setTint(0x8b83a6);

    // The floor the level data assumes exists — see ChunkStream.GROUND_Y.
    this.ground = this.add
      .tileSprite(0, -GROUND_Y, this.scale.width, GROUND_DEPTH, GROUND_TEXTURE)
      .setOrigin(0, 0)
      .setDepth(-50);

    this.runner = new Runner();
    this.stepper = new FixedStepper();
    this.stream = new ChunkStream(this.levels, new Rng(Date.now() >>> 0));
    this.chunks = new ChunkView(this, this.levels);
    this.player = new PlayerView(this);
    this.overlay = new DebugOverlay(this, DEBUG);
    this.hud = new Hud(this, loadSave().bestDistance);

    this.banner = this.add
      .text(this.scale.width / 2, 150, '', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: COLORS.white,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202);

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
    const startX = START_X ?? 0;

    this.runner.reset(startX, GROUND_Y);
    this.stepper.reset();
    this.chunks.clear();
    this.stream.reset(startX);

    const { spawned } = this.stream.update(this.runner.x);
    for (const chunk of spawned) this.chunks.spawn(chunk);
    this.platforms = this.stream.getPlatforms(this.runner.x);

    this.previous = this.runner.snapshot();
    this.cameraFocusY = this.runner.y;
    this.cameraAnchorY = this.runner.y;
    this.peakHeight = 0;
    this.lastAirtime = 0;
    this.airtime = 0;
    this.launchHeight = this.runner.y;
    this.recorded = false;
    this.hud.setBest(loadSave().bestDistance);
    this.banner.setText('');
  }

  override update(_time: number, delta: number): void {
    const dtSeconds = delta / 1000;

    this.streamChunks();

    let previous = this.runner.snapshot();

    const steps = this.stepper.advance(dtSeconds, (dt) => {
      previous = this.runner.snapshot();
      if (AUTOPILOT && shouldJump(this.runner, this.platforms)) this.runner.jump();
      this.runner.step(dt, this.platforms);
      this.measureArc(dt);
    });

    if (steps > 0) this.previous = previous;

    const current = this.runner.snapshot();
    const alpha = Phaser.Math.Clamp(this.stepper.alpha, 0, 1);
    const worldX = lerp(this.previous.x, current.x, alpha);
    const worldY = lerp(this.previous.y, current.y, alpha);

    this.updateCamera(worldX, worldY, dtSeconds);

    this.player.update(worldX, worldY, current.state);
    this.player.setDead(this.runner.isDead);
    this.hud.update(this.runner.distance);

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
        chunks: this.stream.chunkCount,
        sprites: this.chunks.activeSpriteCount,
        pool: this.chunks.poolSize,
      },
      worldX,
      -worldY,
      this.platforms,
    );

    this.updateBanner();
  }

  /** Spawn and retire chunks, and refresh the collision set. */
  private streamChunks(): void {
    const { spawned, retired } = this.stream.update(this.runner.x);

    for (const chunk of retired) this.chunks.retire(chunk);
    for (const chunk of spawned) this.chunks.spawn(chunk);

    this.platforms = this.stream.getPlatforms(this.runner.x);
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

  /**
   * Follow the ground the player is running on, not the player.
   *
   * Anchoring to the last grounded height means jumps don't move the world at
   * all — only changing altitude does. An earlier version tracked the player
   * through a symmetric deadzone, which ratcheted: the anchor crept up with
   * each jump and never came back down, leaving the floor sinking towards the
   * bottom of the screen over a run.
   */
  private updateCamera(worldX: number, worldY: number, dt: number): void {
    if (this.runner.isGrounded) this.cameraAnchorY = worldY;

    let target = this.cameraAnchorY;
    if (worldY > target + CAMERA_MAX_ABOVE) target = worldY - CAMERA_MAX_ABOVE;
    else if (worldY < target - CAMERA_MAX_BELOW) target = worldY + CAMERA_MAX_BELOW;

    // Frame-rate independent exponential smoothing.
    this.cameraFocusY = lerp(this.cameraFocusY, target, 1 - Math.exp(-CAMERA_STIFFNESS * dt));

    const camera = this.cameras.main;
    camera.scrollX = worldX - PLAYER_SCREEN_X;
    camera.scrollY = -this.cameraFocusY - FEET_SCREEN_Y;

    this.backdrop.tilePositionX = camera.scrollX * BACKGROUND_PARALLAX;
    this.backdrop.tilePositionY = camera.scrollY * BACKGROUND_PARALLAX;

    // One world-space strip, repositioned to cover the view and offset by the
    // same amount, so the texture reads as locked to the world.
    this.ground.setPosition(camera.scrollX, -GROUND_Y);
    this.ground.setSize(camera.width, GROUND_DEPTH);
    this.ground.tilePositionX = camera.scrollX;
  }

  private updateBanner(): void {
    if (!this.runner.isDead) {
      this.banner.setText('');
      return;
    }

    if (!this.recorded) {
      this.recorded = true;
      const best = saveRun(this.runner.distance, scoreOf(this.runner.distance));
      this.hud.setBest(best.bestDistance);
    }

    this.banner.setText('tap or press R to restart');
  }
}

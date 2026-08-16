import Phaser from 'phaser';
import { PLAYER_SCREEN_X } from '@/config/constants';
import { AUTOPILOT, COLORS, DEBUG, START_CHARGED, START_X } from '@/config/display';
import { DebugOverlay } from '@/debug/DebugOverlay';
import { AbilityView } from '@/entities/AbilityView';
import { PlayerView } from '@/entities/PlayerView';
import { AbilityBar } from '@/hud/AbilityBar';
import { Hud, scoreOf } from '@/hud/Hud';
import { loadSave, saveRun } from '@/save/store';
import { ABILITIES, AbilitySystem, type AbilitySlot } from '@/sim/abilities';
import { shouldJump } from '@/sim/autopilot';
import { resolveContacts } from '@/sim/entities';
import { FixedStepper } from '@/sim/FixedStepper';
import { Runner } from '@/sim/Runner';
import type { DeathCause, Platform, RunnerSnapshot } from '@/sim/types';
import { BACKGROUND_TEXTURE, GROUND_TEXTURE, LEVELS_KEY } from '@/scenes/PreloadScene';
import { ChunkStream, GROUND_Y } from '@/world/ChunkStream';
import { ChunkView } from '@/world/ChunkView';
import { EntityView } from '@/world/EntityView';
import { GroundView } from '@/world/GroundView';
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

/** Wording for each way a run can end. */
const DEATH_MESSAGE: Record<Exclude<DeathCause, null>, string> = {
  pit: 'you fell',
  crash: 'you hit a wall',
  hazard: 'the poison got you',
  enemies: 'out of hearts',
};

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
  private groundView!: GroundView;
  private entityView!: EntityView;
  private abilities!: AbilitySystem;
  private abilityView!: AbilityView;
  private abilityBar!: AbilityBar;
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

    this.runner = new Runner();
    this.stepper = new FixedStepper();
    this.stream = new ChunkStream(this.levels, new Rng(Date.now() >>> 0));
    this.chunks = new ChunkView(this, this.levels);
    this.groundView = new GroundView(this, GROUND_TEXTURE);
    this.entityView = new EntityView(this);
    this.player = new PlayerView(this);
    this.abilities = new AbilitySystem();
    this.abilityView = new AbilityView(this);
    this.overlay = new DebugOverlay(this, DEBUG);
    this.hud = new Hud(this, loadSave().bestDistance);
    this.abilityBar = new AbilityBar(this, (slot) => this.castAbility(slot));

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

      // The original's bindings: V for the free melee, then Y, X, C.
      keyboard.on('keydown-V', () => this.castAbility(0));
      keyboard.on('keydown-Y', () => this.castAbility(1));
      keyboard.on('keydown-X', () => this.castAbility(2));
      keyboard.on('keydown-C', () => this.castAbility(3));
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

  /**
   * Let the bot use spells too, so a hands-off run exercises them.
   *
   * Deliberately greedy — it fires whatever is charged rather than waiting for
   * a good moment. That makes it a demonstration and a smoke test, not a
   * display of tactics.
   */
  private autoCast(): void {
    if (this.abilities.runningSlot !== null) return;

    for (const slot of [3, 2, 1, 0] as const) {
      if (!this.abilities.isReady(slot)) continue;
      // Only bother with the free melee when something is actually near.
      if (slot === 0 && !this.enemyNearby()) continue;
      this.abilities.activate(slot, this.runner, this.stream.activeEntities);
      return;
    }
  }

  private enemyNearby(): boolean {
    for (const entity of this.stream.activeEntities) {
      if (entity.kind !== 'enemy' || !entity.alive) continue;
      if (Math.abs(entity.x - this.runner.x) < 200) return true;
    }
    return false;
  }

  private castAbility(slot: AbilitySlot): void {
    if (this.runner.isDead) return;
    this.abilities.activate(slot, this.runner, this.stream.activeEntities);
  }

  private restart(): void {
    const startX = START_X ?? 0;

    this.runner.reset(startX, GROUND_Y);
    this.abilities.reset();
    if (START_CHARGED) {
      for (const def of ABILITIES) {
        for (let i = 0; i < def.cost; i += 1) {
          if (def.potion !== null) this.abilities.chargeFromPotion(def.potion);
        }
      }
    }
    this.stepper.reset();
    this.chunks.clear();
    this.entityView.clear();
    this.groundView.clear();
    this.stream.reset(startX);

    const { spawned } = this.stream.update(this.runner.x);
    for (const chunk of spawned) this.chunks.spawn(chunk);
    this.syncWorldViews();

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

  override update(time: number, delta: number): void {
    const dtSeconds = delta / 1000;

    this.streamChunks();

    let previous = this.runner.snapshot();

    const steps = this.stepper.advance(dtSeconds, (dt) => {
      previous = this.runner.snapshot();
      if (AUTOPILOT && shouldJump(this.runner, this.platforms)) this.runner.jump();
      if (AUTOPILOT) this.autoCast();

      // Time Distortion drives the runner rather than the world, since here it
      // is the player that moves.
      this.runner.speedFactor = this.abilities.speedFactor;
      this.runner.step(dt, this.platforms);

      const contact = resolveContacts(this.runner, this.stream.activeEntities);
      for (const potion of contact.potions) this.abilities.chargeFromPotion(potion.name);

      this.abilities.update(dt, this.runner, this.stream.activeEntities);
      this.measureArc(dt);
    });

    if (steps > 0) this.previous = previous;

    const current = this.runner.snapshot();
    const alpha = Phaser.Math.Clamp(this.stepper.alpha, 0, 1);
    const worldX = lerp(this.previous.x, current.x, alpha);
    const worldY = lerp(this.previous.y, current.y, alpha);

    this.updateCamera(worldX, worldY, dtSeconds);

    this.player.update(worldX, worldY, current.state, this.abilities.runningSlot === 0);
    this.player.setDead(this.runner.isDead);
    this.entityView.update();
    this.abilityView.update(this.abilities.activeEffects, time);
    this.hud.update(this.runner.distance, this.runner.health);
    this.abilityBar.update(this.abilities.energy, this.abilities.runningSlot);

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
        entities: this.entityView.activeSpriteCount,
        health: this.runner.health,
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
    if (spawned.length === 0 && retired.length === 0) return;

    for (const chunk of retired) this.chunks.retire(chunk);
    for (const chunk of spawned) this.chunks.spawn(chunk);

    this.syncWorldViews();
  }

  /** Re-point the pooled views at whatever the stream now holds. */
  private syncWorldViews(): void {
    this.platforms = this.stream.getPlatforms();
    this.groundView.sync(this.stream.ground);
    this.entityView.sync(this.stream.activeEntities);
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

    const cause = this.runner.deathCause;
    const reason = cause === null ? 'run over' : DEATH_MESSAGE[cause];
    this.banner.setText(`${reason}\n\ntap or press R to restart`);
  }
}

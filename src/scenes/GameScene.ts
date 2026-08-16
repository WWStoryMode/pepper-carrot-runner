import Phaser from 'phaser';
import { PLAYER_SCREEN_X, TERMINAL_FALL } from '@/config/constants';
import { AUTOPILOT, COLORS, DEBUG, START_CHARGED, START_X } from '@/config/display';
import { Sfx } from '@/audio/Sfx';
import { DebugOverlay } from '@/debug/DebugOverlay';
import { AbilityView } from '@/entities/AbilityView';
import { PlayerView } from '@/entities/PlayerView';
import { AbilityBar } from '@/hud/AbilityBar';
import { Hud, metresOf, scoreOf } from '@/hud/Hud';
import { loadSave, saveRun } from '@/save/store';
import { ABILITIES, AbilitySystem, type AbilitySlot } from '@/sim/abilities';
import { shouldJump } from '@/sim/autopilot';
import { resolveContacts } from '@/sim/entities';
import { FixedStepper } from '@/sim/FixedStepper';
import { Runner } from '@/sim/Runner';
import type { DeathCause, Platform, RunnerSnapshot } from '@/sim/types';
import { BACKGROUND_TEXTURE, GROUND_TEXTURE, LEVELS_KEY } from '@/scenes/PreloadScene';
import { Overlay } from '@/ui/Overlay';
import { ChunkStream, GROUND_Y } from '@/world/ChunkStream';
import { ChunkView } from '@/world/ChunkView';
import { EntityView } from '@/world/EntityView';
import { GroundView } from '@/world/GroundView';
import { Rng } from '@/world/rng';
import type { LevelData } from '@/world/types';

/** Where the player's feet sit on screen, leaving room to see the ground below. */
const FEET_SCREEN_Y = 560;

/** How far the player may rise above the camera anchor before it gives chase. */
const CAMERA_MAX_ABOVE = 420;

/** The same, downward, so a long fall does not outrun the view. */
const CAMERA_MAX_BELOW = 300;

/** Exponential follow rate; higher snaps faster. */
const CAMERA_STIFFNESS = 7;

/**
 * How far the view leans downward at terminal velocity.
 *
 * Playtest feedback: dropping from a height, you could not see the floor or the
 * gap you were falling towards, so landings were guesswork. The camera now
 * leans in the direction of travel — which, falling, means down.
 */
const CAMERA_LOOK_DOWN = 260;

/** Parallax rate for the wall behind the level. The original had none. */
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
 * Reads `src/sim/` and never writes to it, which is what lets the physics be
 * tested without a browser.
 */
export class GameScene extends Phaser.Scene {
  private runner!: Runner;
  private stepper!: FixedStepper;
  private overlayDebug!: DebugOverlay;
  private player!: PlayerView;
  private backdrop!: Phaser.GameObjects.TileSprite;
  private groundView!: GroundView;
  private entityView!: EntityView;
  private abilities!: AbilitySystem;
  private abilityView!: AbilityView;
  private abilityBar!: AbilityBar;
  private hud!: Hud;
  private modal!: Overlay;
  private sfx!: Sfx;

  private levels!: LevelData;
  private stream!: ChunkStream;
  private chunks!: ChunkView;
  private platforms: readonly Platform[] = [];

  private previous!: RunnerSnapshot;
  private cameraFocusY = 0;
  private cameraAnchorY = 0;
  private lookDown = 0;
  private paused = false;
  private recorded = false;
  private lastKills = 0;
  private wasGrounded = true;

  // Measured per jump so the debug readout reports the real arc.
  private peakHeight = 0;
  private lastAirtime = 0;
  private airtime = 0;
  private launchHeight = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.black);
    this.levels = this.cache.json.get(LEVELS_KEY) as LevelData;

    this.backdrop = this.add
      .tileSprite(0, 0, width, height, BACKGROUND_TEXTURE)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100)
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
    this.overlayDebug = new DebugOverlay(this, DEBUG);
    this.hud = new Hud(this, loadSave().bestDistance);
    this.abilityBar = new AbilityBar(this, (slot) => this.castAbility(slot));
    this.modal = new Overlay(this);
    this.sfx = new Sfx(loadSave().muted);

    this.bindInput();
    this.bindLifecycle();
    this.restart();
  }

  // -- input ---------------------------------------------------------------

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      for (const key of ['SPACE', 'UP', 'W']) {
        keyboard.on(`keydown-${key}`, this.onJump, this);
      }
      keyboard.on('keydown-R', this.restart, this);
      keyboard.on('keydown-BACKTICK', () => this.overlayDebug.toggle());
      keyboard.on('keydown-P', () => this.togglePause());
      keyboard.on('keydown-ESC', () => this.togglePause());
      keyboard.on('keydown-M', () => this.toggleMute());

      // The original's bindings: V for the free melee, then Y, X, C.
      keyboard.on('keydown-V', () => this.castAbility(0));
      keyboard.on('keydown-Y', () => this.castAbility(1));
      keyboard.on('keydown-X', () => this.castAbility(2));
      keyboard.on('keydown-C', () => this.castAbility(3));
    }

    this.input.on('pointerdown', this.onJump, this);
  }

  private bindLifecycle(): void {
    // Any interaction is a user gesture, which is what an AudioContext needs.
    this.input.on('pointerdown', () => this.sfx.unlock());
    this.input.keyboard?.on('keydown', () => this.sfx.unlock());

    // Losing focus mid-run should not cost a life.
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseForBlur, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseForBlur, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private layout(): void {
    this.backdrop.setSize(this.scale.width, this.scale.height);
    this.hud.layout();
    this.abilityBar.layout();
    this.modal.layout();
  }

  private pauseForBlur(): void {
    if (!this.runner.isDead && !this.paused) this.togglePause();
  }

  private onJump(): void {
    this.sfx.unlock();

    if (this.modal.isVisible || this.paused) return;
    if (this.runner.isDead) return;

    const wasGrounded = this.runner.isGrounded;
    const airBefore = this.runner.airJumps;
    this.runner.jump();

    // Only make a noise if the jump actually happened.
    if (wasGrounded || airBefore !== this.runner.airJumps) this.sfx.play('jump');
  }

  private castAbility(slot: AbilitySlot): void {
    if (this.paused || this.runner.isDead) return;
    if (this.abilities.activate(slot, this.runner, this.stream.activeEntities)) {
      this.sfx.play('cast');
    }
  }

  private toggleMute(): void {
    this.sfx.setMuted(!this.sfx.isMuted);
  }

  // -- flow ----------------------------------------------------------------

  private togglePause(): void {
    if (this.runner.isDead) return;

    this.paused = !this.paused;

    if (!this.paused) {
      this.modal.hide();
      return;
    }

    this.modal.show(
      'paused',
      [`${metresOf(this.runner.distance)} m so far`, '', 'P or Esc to resume'],
      [
        { label: 'resume', onPress: () => this.togglePause() },
        { label: 'menu', onPress: () => this.scene.start('Title') },
      ],
    );
  }

  private restart(): void {
    const startX = START_X ?? 0;

    this.modal.hide();
    this.paused = false;
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
    this.lookDown = 0;
    this.peakHeight = 0;
    this.lastAirtime = 0;
    this.airtime = 0;
    this.launchHeight = this.runner.y;
    this.recorded = false;
    this.lastKills = 0;
    this.wasGrounded = true;
    this.hud.setBest(loadSave().bestDistance);
  }

  private endRun(): void {
    if (this.recorded) return;
    this.recorded = true;

    this.sfx.play('death');

    const distance = metresOf(this.runner.distance);
    const previousBest = metresOf(loadSave().bestDistance);
    const best = saveRun(this.runner.distance, scoreOf(this.runner.distance));
    this.hud.setBest(best.bestDistance);

    this.modal.show(
      DEATH_MESSAGE[this.runner.deathCause ?? 'pit'],
      [
        `${distance} m`,
        distance > previousBest ? 'a new best' : `best ${metresOf(best.bestDistance)} m`,
      ],
      [
        { label: 'run again', onPress: () => this.restart() },
        { label: 'menu', onPress: () => this.scene.start('Title') },
      ],
    );
  }

  // -- loop ----------------------------------------------------------------

  override update(time: number, delta: number): void {
    const dtSeconds = delta / 1000;

    if (!this.paused && !this.runner.isDead) {
      this.streamChunks();
      this.readGamepad();
      this.advance(dtSeconds);
    }

    const current = this.runner.snapshot();
    const alpha = this.paused ? 0 : Phaser.Math.Clamp(this.stepper.alpha, 0, 1);
    const worldX = lerp(this.previous.x, current.x, alpha);
    const worldY = lerp(this.previous.y, current.y, alpha);

    this.updateCamera(worldX, worldY, dtSeconds);

    this.player.update(worldX, worldY, current.state, this.abilities.runningSlot === 0);
    this.player.setDead(this.runner.isDead);
    this.entityView.update();
    this.abilityView.update(this.abilities.activeEffects, time);
    this.hud.update(this.runner.distance, this.runner.health);
    this.abilityBar.update(this.abilities.energy, this.abilities.runningSlot);

    this.overlayDebug.draw(
      {
        state: current.state,
        x: current.x,
        y: current.y,
        vy: this.runner.vy,
        grounded: this.runner.isGrounded,
        steps: this.stepper.stepsLastFrame,
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

    if (this.runner.isDead) this.endRun();
  }

  private advance(dtSeconds: number): void {
    let previous = this.runner.snapshot();

    const steps = this.stepper.advance(dtSeconds, (dt) => {
      previous = this.runner.snapshot();

      if (AUTOPILOT) {
        if (shouldJump(this.runner, this.platforms)) this.runner.jump();
        this.autoCast();
      }

      // Time Distortion drives the runner rather than the world, since here it
      // is the player that moves.
      this.runner.speedFactor = this.abilities.speedFactor;
      this.runner.step(dt, this.platforms);

      const contact = resolveContacts(this.runner, this.stream.activeEntities);
      for (const potion of contact.potions) this.abilities.chargeFromPotion(potion.name);

      this.abilities.update(dt, this.runner, this.stream.activeEntities);
      this.reportContact(contact);
      this.measureArc(dt);
    });

    if (steps > 0) this.previous = previous;
  }

  /** Turn simulation events into sound. */
  private reportContact(contact: ReturnType<typeof resolveContacts>): void {
    if (contact.healed > 0) this.sfx.play('heal');
    else if (contact.potions.length > 0 || contact.ingredients.length > 0) {
      this.sfx.play('pickup');
    }

    if (contact.damaged > 0 && !this.runner.isDead) this.sfx.play('hurt');

    if (this.abilities.kills > this.lastKills) {
      this.lastKills = this.abilities.kills;
      this.sfx.play('kill');
    }

    if (!this.wasGrounded && this.runner.isGrounded) this.sfx.play('land');
    this.wasGrounded = this.runner.isGrounded;
  }

  private readGamepad(): void {
    const pad = this.input.gamepad?.getPad(0);
    if (pad === undefined) return;

    if (pad.A) this.onJump();
    if (pad.B) this.castAbility(0);
    if (pad.X) this.castAbility(1);
    if (pad.Y) this.castAbility(2);
    if (pad.R1) this.castAbility(3);
  }

  /**
   * Let the bot use spells too, so a hands-off run exercises them.
   *
   * Deliberately greedy — it fires whatever is charged rather than waiting for
   * a good moment. A demonstration and a smoke test, not a display of tactics.
   */
  private autoCast(): void {
    if (this.abilities.runningSlot !== null) return;

    for (const slot of [3, 2, 1, 0] as const) {
      if (!this.abilities.isReady(slot)) continue;
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

  private streamChunks(): void {
    const { spawned, retired } = this.stream.update(this.runner.x);
    if (spawned.length === 0 && retired.length === 0) return;

    for (const chunk of retired) this.chunks.retire(chunk);
    for (const chunk of spawned) this.chunks.spawn(chunk);

    this.syncWorldViews();
  }

  private syncWorldViews(): void {
    this.platforms = this.stream.getPlatforms();
    this.groundView.sync(this.stream.ground);
    this.entityView.sync(this.stream.activeEntities);
  }

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
   * all — only changing altitude does. On top of that the view leans downward
   * while falling, so the landing is visible before you reach it.
   */
  private updateCamera(worldX: number, worldY: number, dt: number): void {
    if (this.runner.isGrounded) this.cameraAnchorY = worldY;

    let target = this.cameraAnchorY;
    if (worldY > target + CAMERA_MAX_ABOVE) target = worldY - CAMERA_MAX_ABOVE;
    else if (worldY < target - CAMERA_MAX_BELOW) target = worldY + CAMERA_MAX_BELOW;

    // Lean in the direction of travel: falling fast means looking further down.
    const fall = Math.max(0, -this.runner.vy) / TERMINAL_FALL;
    this.lookDown = lerp(this.lookDown, Math.min(1, fall) * CAMERA_LOOK_DOWN, 1 - Math.exp(-4 * dt));

    this.cameraFocusY = lerp(
      this.cameraFocusY,
      target - this.lookDown,
      1 - Math.exp(-CAMERA_STIFFNESS * dt),
    );

    const camera = this.cameras.main;
    camera.scrollX = worldX - PLAYER_SCREEN_X;
    camera.scrollY = -this.cameraFocusY - FEET_SCREEN_Y;

    this.backdrop.tilePositionX = camera.scrollX * BACKGROUND_PARALLAX;
    this.backdrop.tilePositionY = camera.scrollY * BACKGROUND_PARALLAX;
  }
}

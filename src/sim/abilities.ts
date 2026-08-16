import { PLAYER_HEIGHT } from '@/config/constants';
import { interpolate, pow2, pow3In, pow3Out } from './ease';
import type { Runner } from './Runner';
import type { SimEntity } from './types';

/**
 * Pepper's four spells.
 *
 * Pure simulation: the system decides what happens and exposes a list of
 * effects, and the view draws them. Nothing here knows about Phaser.
 *
 * Costs, durations and radii are the original's (`Pepper.java` line 66 and the
 * four `Ability` subclasses). The one deliberate change is that a black hole
 * now **credits** the potions it swallows; the original called
 * `potion.collected()` directly instead of routing through `onHitPotion`, so
 * vacuumed potions granted no energy and counted for nothing — they were simply
 * destroyed, which reads as a bug rather than a cost.
 */

export type AbilitySlot = 0 | 1 | 2 | 3;

export interface AbilityDef {
  readonly slot: AbilitySlot;
  readonly name: string;
  /** Potions needed. Slot 0 is free, exactly as in the original. */
  readonly cost: number;
  /** Seconds; the charge ends itself, so it has none. */
  readonly duration: number;
  /** Which potion colour charges it. */
  readonly potion: string | null;
}

export const ABILITIES: readonly AbilityDef[] = [
  { slot: 0, name: 'Sweep', cost: 0, duration: 0.6, potion: null },
  { slot: 1, name: 'Carrot Charge', cost: 2, duration: -1, potion: 'orange' },
  { slot: 2, name: 'Time Distortion', cost: 4, duration: 1.6, potion: 'green' },
  { slot: 3, name: 'Black Hole', cost: 3, duration: 1.5, potion: 'blue' },
];

/** Melee box, centred on the runner. `SweepAttack` used a 250×250 actor. */
const SWEEP_SIZE = 250;

/** `CarrotCharge.times` — how many enemies one charge chains through. */
const CHARGE_TARGETS = 3;

/** Seconds per hop, from the original's `MoveToAction` duration. */
const CHARGE_HOP_TIME = 0.4;

/** How far ahead the charge looks for victims. */
const CHARGE_RANGE = 1350;

/** `TimeDistortion.maxSpeed`, and the aura that kills as you dash. */
const TIME_MAX_SPEED = 2.8;
const TIME_AURA_RADIUS = 140;

/** Black hole placement, relative to the runner, and its reach. */
const HOLE_AHEAD = 813;
const HOLE_ABOVE = 369;
const HOLE_RADIUS = 700;

export type EffectKind = 'sweep' | 'charge' | 'clock' | 'hole';

/** A running effect, for the renderer to draw. */
export interface AbilityEffect {
  readonly kind: EffectKind;
  readonly x: number;
  readonly y: number;
  /** 0..1 through the ability's life. */
  readonly progress: number;
}

interface ChargeState {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targets: SimEntity[];
  index: number;
  t: number;
  returning: boolean;
}

const centreOf = (runner: Runner): { x: number; y: number } => ({
  x: runner.x,
  y: runner.y + PLAYER_HEIGHT / 2,
});

function distanceTo(entity: SimEntity, x: number, y: number): number {
  return Math.hypot(entity.x - x, entity.y - y);
}

export class AbilitySystem {
  /** Charge held per slot; slot 0 is always ready. */
  readonly energy: number[] = [0, 0, 0, 0];

  private active: AbilitySlot | null = null;
  private elapsed = 0;
  private charge: ChargeState | null = null;
  private effects: AbilityEffect[] = [];

  /** Multiplier on the runner's forward speed, driven by Time Distortion. */
  speedFactor = 1;

  /** Enemies killed by spells, cumulative. The scene diffs it for feedback. */
  private killCount = 0;

  get runningSlot(): AbilitySlot | null {
    return this.active;
  }

  get kills(): number {
    return this.killCount;
  }

  get activeEffects(): readonly AbilityEffect[] {
    return this.effects;
  }

  reset(): void {
    this.energy.fill(0);
    this.active = null;
    this.elapsed = 0;
    this.charge = null;
    this.effects = [];
    this.speedFactor = 1;
    this.killCount = 0;
  }

  isReady(slot: AbilitySlot): boolean {
    if (this.active !== null) return false;
    return this.energy[slot]! >= ABILITIES[slot]!.cost;
  }

  /** Credit a collected potion to whichever ability it charges. */
  chargeFromPotion(colour: string): void {
    const def = ABILITIES.find((a) => a.potion === colour);
    if (def === undefined) return;
    this.energy[def.slot] = Math.min(def.cost, this.energy[def.slot]! + 1);
  }

  /**
   * Try to start an ability.
   *
   * Activation drains the charge to zero, as in the original — energy is a
   * discrete counter, not a bar, and there is no passive regeneration.
   */
  activate(slot: AbilitySlot, runner: Runner, entities: readonly SimEntity[]): boolean {
    if (runner.isDead) return false;
    if (!this.isReady(slot)) return false;

    this.energy[slot] = 0;
    this.active = slot;
    this.elapsed = 0;

    if (slot === 1) this.beginCharge(runner, entities);
    if (slot === 3) this.detonateHole(runner, entities);

    return true;
  }

  update(dt: number, runner: Runner, entities: readonly SimEntity[]): void {
    this.effects = [];

    if (this.active === null) {
      this.speedFactor = 1;
      return;
    }

    if (runner.isDead) {
      this.finish();
      return;
    }

    this.elapsed += dt;
    const def = ABILITIES[this.active]!;

    switch (this.active) {
      case 0:
        this.updateSweep(runner, entities);
        break;
      case 1:
        this.updateCharge(dt, runner);
        break;
      case 2:
        this.updateTime(runner, entities);
        break;
      case 3:
        this.updateHole(runner);
        break;
    }

    // A negative duration means the ability ends itself — the charge does,
    // when Carrot gets home.
    if (def.duration > 0 && this.elapsed >= def.duration) this.finish();
  }

  private slay(entity: SimEntity): void {
    if (!entity.alive) return;
    entity.alive = false;
    this.killCount += 1;
  }

  private finish(): void {
    this.active = null;
    this.elapsed = 0;
    this.charge = null;
    this.speedFactor = 1;
  }

  private progress(): number {
    const def = this.active === null ? null : ABILITIES[this.active]!;
    if (def === null || def.duration <= 0) return 0;
    return Math.min(1, this.elapsed / def.duration);
  }

  // -- slot 0 --------------------------------------------------------------

  private updateSweep(runner: Runner, entities: readonly SimEntity[]): void {
    const { x, y } = centreOf(runner);
    const half = SWEEP_SIZE / 2;

    for (const entity of entities) {
      if (entity.kind !== 'enemy' || !entity.alive) continue;
      if (Math.abs(entity.x - x) > half + entity.halfWidth) continue;
      if (Math.abs(entity.y - y) > half + entity.halfHeight) continue;
      this.slay(entity);
    }

    this.effects.push({ kind: 'sweep', x, y, progress: this.progress() });
  }

  // -- slot 1 --------------------------------------------------------------

  private beginCharge(runner: Runner, entities: readonly SimEntity[]): void {
    const { x, y } = centreOf(runner);

    const targets = entities
      .filter((e) => e.kind === 'enemy' && e.alive && e.x > runner.x)
      .filter((e) => distanceTo(e, x, y) <= CHARGE_RANGE)
      .sort((a, b) => a.x - b.x)
      .slice(0, CHARGE_TARGETS);

    // Nothing to hit: refund nothing but end immediately, as the original did
    // by calling cancel().
    if (targets.length === 0) {
      this.finish();
      return;
    }

    this.charge = {
      x,
      y,
      fromX: x,
      fromY: y,
      targets,
      index: 0,
      t: 0,
      returning: false,
    };
  }

  private updateCharge(dt: number, runner: Runner): void {
    const charge = this.charge;
    if (charge === null) {
      this.finish();
      return;
    }

    charge.t += dt / CHARGE_HOP_TIME;
    const eased = pow2(Math.min(1, charge.t));

    // The destination is re-read every step because the world keeps moving
    // relative to Carrot — the original re-targeted its MoveToAction the same
    // way rather than committing to a fixed point.
    const home = centreOf(runner);
    const victimTarget = charge.returning ? undefined : charge.targets[charge.index];
    const toX = victimTarget?.x ?? home.x;
    const toY = victimTarget?.y ?? home.y;

    charge.x = charge.fromX + (toX - charge.fromX) * eased;
    charge.y = charge.fromY + (toY - charge.fromY) * eased;

    if (charge.t >= 1) {
      if (charge.returning) {
        this.finish();
        return;
      }

      const victim = charge.targets[charge.index];
      if (victim !== undefined) this.slay(victim);

      charge.index += 1;
      charge.fromX = charge.x;
      charge.fromY = charge.y;
      charge.t = 0;

      // Skip anything that died in the meantime, then head home.
      while (charge.index < charge.targets.length && !charge.targets[charge.index]!.alive) {
        charge.index += 1;
      }
      if (charge.index >= charge.targets.length) charge.returning = true;
    }

    this.effects.push({ kind: 'charge', x: charge.x, y: charge.y, progress: 0 });
  }

  // -- slot 2 --------------------------------------------------------------

  private updateTime(runner: Runner, entities: readonly SimEntity[]): void {
    const duration = ABILITIES[2]!.duration;
    const half = duration / 2;

    // Accelerate hard, then bleed back — pow3Out out, pow3In back.
    this.speedFactor =
      this.elapsed < half
        ? interpolate(1, TIME_MAX_SPEED, this.elapsed / half, pow3Out)
        : interpolate(TIME_MAX_SPEED, 1, (this.elapsed - half) / half, pow3In);

    const { x, y } = centreOf(runner);

    for (const entity of entities) {
      if (entity.kind !== 'enemy' || !entity.alive) continue;
      if (distanceTo(entity, x, y) > TIME_AURA_RADIUS + entity.halfWidth) continue;
      this.slay(entity);
    }

    this.effects.push({ kind: 'clock', x, y, progress: this.progress() });
  }

  // -- slot 3 --------------------------------------------------------------

  private detonateHole(runner: Runner, entities: readonly SimEntity[]): void {
    const x = runner.x + HOLE_AHEAD;
    const y = runner.y + HOLE_ABOVE;

    for (const entity of entities) {
      if (distanceTo(entity, x, y) > HOLE_RADIUS) continue;

      if (entity.kind === 'enemy' && entity.alive) {
        this.slay(entity);
        continue;
      }

      // Credited, unlike the original, which destroyed them silently.
      if ((entity.kind === 'potion' || entity.kind === 'ingredient') && !entity.collected) {
        entity.collected = true;
        if (entity.kind === 'potion') this.chargeFromPotion(entity.name);
      }
    }
  }

  private updateHole(runner: Runner): void {
    this.effects.push({
      kind: 'hole',
      x: runner.x + HOLE_AHEAD,
      y: runner.y + HOLE_ABOVE,
      progress: this.progress(),
    });
  }
}

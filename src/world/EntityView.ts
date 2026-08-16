import Phaser from 'phaser';
import { ATLAS_KEY } from '@/art/animations';
import type { SimEntity } from '@/sim/types';

/**
 * Draws enemies and pickups from simulation entities.
 *
 * Pooled like the tiles, and driven entirely by the entity's own flags — the
 * view never decides anything, it just reflects `alive` and `collected`.
 *
 * Hazards have no sprite here: the deadly tiles are already drawn as part of
 * the chunk's visible `obstacles` layer, so giving them a second sprite would
 * double-draw the green sludge.
 */

const SPARKLE_DEPTH = 45;
const ENEMY_DEPTH = 48;

/** Frame each entity shows when idle. */
function baseFrame(entity: SimEntity): string {
  switch (entity.kind) {
    case 'enemy':
      return `${entity.name}-idle_01`;
    case 'potion':
      return `potion_${entity.name}`;
    case 'ingredient':
      return `${entity.name}`;
    default:
      return 'potion_orange';
  }
}

interface Bound {
  readonly entity: SimEntity;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly sparkle: Phaser.GameObjects.Sprite | null;
  dying: boolean;
}

export class EntityView {
  private readonly pool: Phaser.GameObjects.Sprite[] = [];
  private bound: Bound[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get activeSpriteCount(): number {
    return this.bound.length;
  }

  get poolSize(): number {
    return this.pool.length + this.bound.length;
  }

  /** Rebuild bindings for the current entity set. */
  sync(entities: readonly SimEntity[]): void {
    const seen = new Set(entities.map((e) => e.id));

    // Release anything whose entity has left the window.
    const kept: Bound[] = [];
    for (const binding of this.bound) {
      if (seen.has(binding.entity.id)) {
        kept.push(binding);
        continue;
      }
      this.release(binding);
    }
    this.bound = kept;

    const known = new Set(this.bound.map((b) => b.entity.id));
    for (const entity of entities) {
      if (known.has(entity.id)) continue;
      if (entity.kind === 'hazard') continue;
      this.bind(entity);
    }
  }

  /** Reflect entity state: play death animations, hide collected pickups. */
  update(): void {
    for (const binding of this.bound) {
      const { entity, sprite, sparkle } = binding;

      if (entity.collected) {
        sprite.setVisible(false);
        sparkle?.setVisible(false);
        continue;
      }

      if (entity.kind === 'enemy' && !entity.alive && !binding.dying) {
        binding.dying = true;
        sprite.play(`${entity.name}-death`, true);
      }

      sprite.setPosition(entity.x, -entity.y);
      sparkle?.setPosition(entity.x, -entity.y);
    }
  }

  clear(): void {
    for (const binding of this.bound) this.release(binding);
    this.bound = [];
  }

  private bind(entity: SimEntity): void {
    const sprite = this.acquire();
    sprite
      .setTexture(ATLAS_KEY, baseFrame(entity))
      .setPosition(entity.x, -entity.y)
      .setDepth(ENEMY_DEPTH)
      .setVisible(true)
      .setActive(true);

    if (entity.kind === 'enemy') {
      sprite.play(`${entity.name}-idle`, true);
    } else {
      sprite.stop();
    }

    // Pickups carry the original's looping sparkle behind them.
    let sparkle: Phaser.GameObjects.Sprite | null = null;
    if (entity.kind === 'potion' || entity.kind === 'ingredient') {
      sparkle = this.acquire();
      sparkle
        .setTexture(ATLAS_KEY, 'sparkling_01')
        .setPosition(entity.x, -entity.y)
        .setDepth(SPARKLE_DEPTH)
        .setVisible(true)
        .setActive(true)
        .play('sparkling', true);
    }

    this.bound.push({ entity, sprite, sparkle, dying: false });
  }

  private release(binding: Bound): void {
    binding.sprite.stop();
    binding.sprite.setVisible(false).setActive(false);
    this.pool.push(binding.sprite);

    if (binding.sparkle !== null) {
      binding.sparkle.stop();
      binding.sparkle.setVisible(false).setActive(false);
      this.pool.push(binding.sparkle);
    }
  }

  private acquire(): Phaser.GameObjects.Sprite {
    const recycled = this.pool.pop();
    if (recycled !== undefined) return recycled;
    return this.scene.add.sprite(0, 0, ATLAS_KEY, 'potion_orange').setOrigin(0.5, 0.5);
  }
}

import { ENEMY_DAMAGE, HAZARD_DAMAGE, PLAYER_HEIGHT, PLAYER_WIDTH } from '@/config/constants';
import type { Runner } from './Runner';
import type { SimEntity } from './types';

/**
 * Contact resolution between the player and world entities.
 *
 * Pure, like the rest of `src/sim/`, so the rules can be tested without a
 * renderer. The original did this inline in `WorldStage.processEnemies` and
 * `processPotions`, with a circle broadphase around the player.
 */

/** What a single step of contact produced, for the caller to react to. */
export interface ContactResult {
  readonly damaged: number;
  readonly healed: number;
  readonly potions: SimEntity[];
  readonly ingredients: SimEntity[];
  readonly hitHazard: boolean;
  readonly hitEnemy: boolean;
}

const EMPTY: ContactResult = {
  damaged: 0,
  healed: 0,
  potions: [],
  ingredients: [],
  hitHazard: false,
  hitEnemy: false,
};

function overlaps(runner: Runner, entity: SimEntity): boolean {
  const halfWidth = PLAYER_WIDTH / 2;

  const left = runner.x - halfWidth;
  const right = runner.x + halfWidth;
  const bottom = runner.y;
  const top = runner.y + PLAYER_HEIGHT;

  return (
    right > entity.x - entity.halfWidth &&
    left < entity.x + entity.halfWidth &&
    top > entity.y - entity.halfHeight &&
    bottom < entity.y + entity.halfHeight
  );
}

/**
 * Apply contacts for this step and mutate the entities involved.
 *
 * Enemies and hazards latch `touched` so each can hurt the player exactly once,
 * which is how the original avoided needing invulnerability frames: overlapping
 * an enemy for twenty frames costs one heart, not twenty.
 */
export function resolveContacts(runner: Runner, entities: readonly SimEntity[]): ContactResult {
  if (runner.isDead || entities.length === 0) return EMPTY;

  let damaged = 0;
  let healed = 0;
  let hitHazard = false;
  let hitEnemy = false;
  const potions: SimEntity[] = [];
  const ingredients: SimEntity[] = [];

  for (const entity of entities) {
    if (entity.collected || !entity.alive) continue;
    // Cheap reject before the full box test; entities are sorted by neither
    // axis, but the window is small enough that this is the whole broadphase.
    if (Math.abs(entity.x - runner.x) > 400) continue;
    if (!overlaps(runner, entity)) continue;

    switch (entity.kind) {
      case 'hazard': {
        if (entity.touched) break;
        entity.touched = true;
        hitHazard = true;
        damaged += HAZARD_DAMAGE;
        break;
      }
      case 'enemy': {
        if (entity.touched) break;
        entity.touched = true;
        hitEnemy = true;
        damaged += ENEMY_DAMAGE;
        break;
      }
      case 'potion': {
        entity.collected = true;
        // Pink is the health potion; the rest charge abilities in M5.
        if (entity.name === 'pink') healed += 1;
        potions.push(entity);
        break;
      }
      case 'ingredient': {
        entity.collected = true;
        ingredients.push(entity);
        break;
      }
    }
  }

  if (healed > 0) runner.heal(healed);
  if (damaged > 0) runner.damage(damaged, hitHazard ? 'hazard' : 'enemies');

  return { damaged, healed, potions, ingredients, hitHazard, hitEnemy };
}

import { MAX_HEALTH } from '@/config/constants';

/**
 * Permanent upgrades, brewed from ingredients between runs.
 *
 * This is the original's kitchen loop given a purpose. There, ingredients were
 * gathered in levels, fifteen of a kind brewed into a potion
 * (`INGREDIENTS_NEEDED_FOR_POTION` in `StartStage`), and the potion was fed to
 * a ghost that changed appearance — `ghostID` was cosmetic and nothing else.
 * Endless play needs a reason to come back, so the same loop now buys ability.
 *
 * The mapping is the original's own: ingredient `sour-N` brews potion `sour-N`,
 * done there by string substitution (`name.replace("ingredient", "potion")`).
 */

export type UpgradeId = 'vitality' | 'reserves' | 'ward';

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly name: string;
  readonly description: string;
  /** Ingredient that brews it, matching the atlas frame names. */
  readonly ingredient: string;
  /** Potion it brews into — again, the atlas frame name. */
  readonly potion: string;
  readonly maxLevel: number;
}

/**
 * Ingredients per brew.
 *
 * The original wanted fifteen. A chunk carries roughly one ingredient, so at
 * that price an upgrade is three or four good runs; ten keeps the loop moving
 * without making it free.
 */
export const INGREDIENTS_PER_BREW = 10;

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'vitality',
    name: 'Vitality',
    description: '+1 heart',
    ingredient: 'ingredient_sour-1',
    potion: 'potion_sour-1',
    maxLevel: 3,
  },
  {
    id: 'reserves',
    name: 'Reserves',
    description: 'start each run with a charge in every spell',
    ingredient: 'ingredient_sour-2',
    potion: 'potion_sour-2',
    maxLevel: 2,
  },
  {
    id: 'ward',
    name: 'Ghost Ward',
    description: 'a ghost takes one hit for you',
    ingredient: 'ingredient_sour-3',
    potion: 'potion_sour-3',
    maxLevel: 2,
  },
];

export type UpgradeLevels = Readonly<Partial<Record<UpgradeId, number>>>;

/** What the upgrades add up to, in terms the simulation understands. */
export interface Loadout {
  readonly maxHealth: number;
  /** Charge banked in every ability at the start of a run. */
  readonly startingCharge: number;
  /** Enemy hits absorbed before health is touched. */
  readonly wards: number;
}

export function levelOf(levels: UpgradeLevels, id: UpgradeId): number {
  const def = UPGRADES.find((u) => u.id === id);
  const raw = levels[id] ?? 0;
  return Math.max(0, Math.min(def?.maxLevel ?? 0, raw));
}

export function loadoutFor(levels: UpgradeLevels): Loadout {
  return {
    maxHealth: MAX_HEALTH + levelOf(levels, 'vitality'),
    startingCharge: levelOf(levels, 'reserves'),
    wards: levelOf(levels, 'ward'),
  };
}

/** Can this upgrade be brewed right now? */
export function canBrew(
  def: UpgradeDef,
  ingredients: Readonly<Record<string, number>>,
  levels: UpgradeLevels,
): boolean {
  if (levelOf(levels, def.id) >= def.maxLevel) return false;
  return (ingredients[def.ingredient] ?? 0) >= INGREDIENTS_PER_BREW;
}

export interface BrewResult {
  readonly ingredients: Record<string, number>;
  readonly levels: Record<string, number>;
  readonly brewed: boolean;
}

/**
 * Spend ingredients on one level of an upgrade.
 *
 * Pure: it returns new maps rather than mutating, so the caller decides when
 * anything is persisted.
 */
export function brew(
  def: UpgradeDef,
  ingredients: Readonly<Record<string, number>>,
  levels: UpgradeLevels,
): BrewResult {
  const nextIngredients: Record<string, number> = { ...ingredients };
  const nextLevels: Record<string, number> = { ...levels };

  if (!canBrew(def, ingredients, levels)) {
    return { ingredients: nextIngredients, levels: nextLevels, brewed: false };
  }

  nextIngredients[def.ingredient] =
    (nextIngredients[def.ingredient] ?? 0) - INGREDIENTS_PER_BREW;
  nextLevels[def.id] = levelOf(levels, def.id) + 1;

  return { ingredients: nextIngredients, levels: nextLevels, brewed: true };
}

/**
 * Which ghost to show for a given ward level.
 *
 * The original evolved its ghost through `ghost_basic` and `ghost_sour-1..3` as
 * you fed it potions; the same frames, now earned by the ward upgrade.
 */
export function ghostFrame(wardLevel: number): string {
  return wardLevel <= 0 ? 'ghost_basic' : `ghost_sour-${Math.min(3, wardLevel)}`;
}

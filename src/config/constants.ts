/**
 * Gameplay constants.
 *
 * Values are derived from the original libGDX game, converted to SI units
 * (pixels and seconds). The original integrated vertical motion once per frame
 * with no delta, assuming 60 fps:
 *
 *     speedY -= 1;                  // gravity, 1 px/frame²
 *     setY(getY() + speedY);        // 26 px/frame jump impulse
 *
 * Running our fixed step at exactly 1/60 s reproduces that integer sequence
 * precisely — 3600 px/s² × (1/60)² = 1 px, 1560 px/s × (1/60) = 26 px — while
 * being frame-rate independent, which the original was not.
 */

/** Simulation step. Must stay 1/60 to match the original's integer motion. */
export const FIXED_DT = 1 / 60;

/** Never advance more than this many steps in one frame (spiral-of-death guard). */
export const MAX_STEPS_PER_FRAME = 5;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** Downward acceleration. Original: `speedY -= 1` per frame. */
export const GRAVITY = 3600;

/** Upward impulse applied on jump. Original: `maxJumpSpeed = 26` per frame. */
export const JUMP_SPEED = 1560;

/** Fall speed cap. The original reused `maxJumpSpeed` for this. */
export const TERMINAL_FALL = 1560;

/** Constant forward run speed. Original: `WorldStage.speed = 400`. */
export const RUN_SPEED = 400;

/** Air jumps available after leaving the ground. 1 = the original's double jump. */
export const MAX_AIR_JUMPS = 1;

// ---------------------------------------------------------------------------
// Feel
// ---------------------------------------------------------------------------
// Not in the original. An endless runner lives or dies on input forgiveness,
// and the original had none: miss the ledge by one frame and you were falling.

/** Grace period after walking off a ledge during which a ground jump still works. */
export const COYOTE_TIME = 0.1;

/** A jump pressed this long before landing is remembered and fires on touchdown. */
export const JUMP_BUFFER = 0.12;

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

/** Collision width. Original hitbox: sprite 380×380 × 0.62, inset 60 px per side. */
export const PLAYER_WIDTH = 115.6;

/** Collision height. Original: sprite height × 0.62, inset 14 px top and bottom. */
export const PLAYER_HEIGHT = 207.6;

/**
 * Sprite origin offset below the feet.
 * Original: `onHitPlatform` → `land(platformTop - offsetForFeet)`, `offsetForFeet = 16`.
 * The simulation tracks feet directly; this is applied at render time.
 */
export const FEET_TO_SPRITE_ORIGIN = 16;

/** Fixed horizontal screen position of the player. Original: `OFFSET_TO_EDGE = 147`. */
export const PLAYER_SCREEN_X = 147;

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

/**
 * Landing tolerance in world units.
 *
 * The original used a fixed 28 px band around the platform top and relied on
 * capping fall speed to avoid tunnelling (a FIXME in `Runner.act`). We sweep the
 * feet between the previous and current step instead, which cannot tunnel; this
 * tolerance only keeps a resting body attached across steps.
 */
export const LANDING_TOLERANCE = 0.5;

/**
 * Feet below this height are dead.
 *
 * The original clamped the player at `OFFSET_TO_GROUND`, so falling was
 * impossible and only `obstacle=deadly` tiles could kill. Here the floor is
 * synthetic and carries gaps, so this is reachable and a fall ends the run.
 */
export const DEATH_PLANE = -600;

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Hearts. The original's `new HitPoints(5)`. */
export const MAX_HEALTH = 5;

/**
 * Damage from a deadly tile.
 *
 * The original gave these `damage = 6` against 5 hearts — instant death whatever
 * your health. Kept, because it is what makes the green sludge read as lethal
 * rather than as attrition.
 */
export const HAZARD_DAMAGE = 6;

/** Damage from touching an enemy. */
export const ENEMY_DAMAGE = 1;

// ---------------------------------------------------------------------------
// Entity sizes, from the source art
// ---------------------------------------------------------------------------

export const ENTITY_SIZES: Record<string, number> = {
  fly: 95,
  spider: 140,
  potion: 70,
  ingredient: 95,
  hazard: 95,
};

// ---------------------------------------------------------------------------
// Floor gaps
// ---------------------------------------------------------------------------

/** No gaps at all until the run has bedded in. */
export const GAP_START_DISTANCE = 4_000;

/** Distance at which gaps reach their widest. */
export const GAP_FULL_DISTANCE = 40_000;

/** Widest gap, in tiles. 3 × 95 = 285 px against a 340 px single-jump arc. */
export const GAP_MAX_TILES = 3;

/** Narrowest gap worth placing. */
export const GAP_MIN_TILES = 2;

/** Chance a given chunk gets a gap, once gaps have started. */
export const GAP_CHANCE = 0.55;

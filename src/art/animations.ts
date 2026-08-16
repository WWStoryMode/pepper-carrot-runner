import Phaser from 'phaser';

/**
 * Animation definitions, transcribed from the original.
 *
 * Frame durations come straight out of `Pepper.java` and `Carrot.java`; libGDX
 * specifies seconds per frame, Phaser wants frames per second, hence the
 * reciprocal. libGDX's `LOOP_PINGPONG` is Phaser's `yoyo` with an infinite
 * repeat, and `NORMAL` is a single pass.
 */

export const ATLAS_KEY = 'art';

type PlayMode = 'loop' | 'pingpong' | 'once';

interface AnimationDef {
  /** Animation key, also the atlas frame prefix (`pepper_run` → `pepper_run_01`). */
  readonly key: string;
  readonly frames: number;
  /** Seconds per frame, as written in the Java source. */
  readonly frameDuration: number;
  readonly mode: PlayMode;
}

const PEPPER: readonly AnimationDef[] = [
  { key: 'pepper_run', frames: 10, frameDuration: 0.079, mode: 'loop' },
  { key: 'pepper_jump', frames: 3, frameDuration: 0.144, mode: 'pingpong' },
  { key: 'pepper_doublejump', frames: 2, frameDuration: 0.144, mode: 'pingpong' },
  { key: 'pepper_fall', frames: 3, frameDuration: 0.14, mode: 'pingpong' },
  // The original derives this one: SWEEP_DURATION (0.6) / 8.
  { key: 'pepper_attack', frames: 7, frameDuration: 0.075, mode: 'once' },
  { key: 'pepper_hit', frames: 1, frameDuration: 0.5, mode: 'once' },
  { key: 'pepper_idle', frames: 4, frameDuration: 0.13, mode: 'pingpong' },
];

const CARROT: readonly AnimationDef[] = [
  { key: 'carrot_run', frames: 10, frameDuration: 0.059, mode: 'loop' },
  { key: 'carrot_jump', frames: 3, frameDuration: 0.144, mode: 'pingpong' },
  { key: 'carrot_doublejump', frames: 2, frameDuration: 0.164, mode: 'pingpong' },
  { key: 'carrot_fall', frames: 3, frameDuration: 0.18, mode: 'pingpong' },
  { key: 'carrot_hit', frames: 1, frameDuration: 0.18, mode: 'once' },
  { key: 'carrot_idle', frames: 4, frameDuration: 0.18, mode: 'pingpong' },
];

export const ALL_ANIMATIONS: readonly AnimationDef[] = [...PEPPER, ...CARROT];

/** Register every animation on the global animation manager. Idempotent. */
export function registerAnimations(anims: Phaser.Animations.AnimationManager): void {
  for (const def of ALL_ANIMATIONS) {
    if (anims.exists(def.key)) continue;

    anims.create({
      key: def.key,
      frames: anims.generateFrameNames(ATLAS_KEY, {
        prefix: `${def.key}_`,
        start: 1,
        end: def.frames,
        zeroPad: 2,
      }),
      frameRate: 1 / def.frameDuration,
      repeat: def.mode === 'once' ? 0 : -1,
      yoyo: def.mode === 'pingpong',
    });
  }
}

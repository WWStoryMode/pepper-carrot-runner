import { LANDING_TOLERANCE } from '@/config/constants';
import type { Platform } from './types';

/**
 * Does a body of the given width overlap a platform horizontally?
 *
 * The original's test in `WorldStage.processPlatforms` read:
 *
 *     if (x < platPos.x + platform.getW() || x + actorsW > platPos.x)
 *
 * That `||` should have been `&&`. As written the condition is true for
 * essentially any platform, so horizontal containment was never actually
 * checked — the only thing keeping the player from landing on distant platforms
 * was a 235 px broadphase circle. We use `&&`, which makes ledges behave as
 * they look.
 */
export function overlapsHorizontally(
  centerX: number,
  halfWidth: number,
  platform: Platform,
): boolean {
  return centerX + halfWidth > platform.x && centerX - halfWidth < platform.x + platform.width;
}

/**
 * Find the surface to land on for a step that moved the feet from `prevFeet` to
 * `feet`, or `null` for no landing.
 *
 * Platforms are **one-way**: they are solid only to a body descending onto them
 * from above. The original achieved this with a `speedY < 8` gate, which let you
 * pass upward through a platform for roughly the first 18 frames of a jump. We
 * test the swept path between the two positions instead, so a fast fall cannot
 * tunnel through a platform — a bug the original explicitly acknowledged with a
 * `FIXME:Tunneling` comment and only mitigated by capping fall speed.
 *
 * When several platforms qualify, the highest wins: that is the first surface
 * the feet would have met on the way down.
 */
export function findLanding(
  prevFeet: number,
  feet: number,
  centerX: number,
  halfWidth: number,
  platforms: readonly Platform[],
): number | null {
  // Rising bodies pass straight through.
  if (feet > prevFeet) return null;

  let landing: number | null = null;

  for (const platform of platforms) {
    if (!overlapsHorizontally(centerX, halfWidth, platform)) continue;

    const top = platform.y;

    // Were we on or above this surface, and are we now at or below it?
    const wasAbove = prevFeet >= top - LANDING_TOLERANCE;
    const nowBelow = feet <= top;
    if (!wasAbove || !nowBelow) continue;

    if (landing === null || top > landing) landing = top;
  }

  return landing;
}

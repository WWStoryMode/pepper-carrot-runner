/**
 * The libGDX interpolation curves the original's abilities are built on.
 *
 * Reproduced rather than approximated, because they are load-bearing: the
 * Time Distortion speed ramp and Carrot's hop timing are these curves, and
 * substituting a generic ease changes how both feel.
 *
 * libGDX applies them as `apply(start, end, alpha) = start + (end - start) * f(alpha)`.
 */

const clamp01 = (a: number): number => (a < 0 ? 0 : a > 1 ? 1 : a);

/** `Interpolation.pow3In` — f(a) = a³. */
export const pow3In = (a: number): number => clamp01(a) ** 3;

/** `Interpolation.pow3Out` — f(a) = 1 − (1 − a)³. */
export const pow3Out = (a: number): number => 1 - (1 - clamp01(a)) ** 3;

/**
 * `Interpolation.pow2` — quadratic ease in-out.
 *
 * libGDX's `Pow(2)`: accelerating for the first half, decelerating for the
 * second. Used for Carrot's hops and the black hole's suck-in.
 */
export function pow2(a: number): number {
  const t = clamp01(a);
  if (t <= 0.5) return (t * 2) ** 2 / 2;
  return 1 - ((1 - t) * 2) ** 2 / 2;
}

/** libGDX's `apply(start, end, alpha)`. */
export const interpolate = (
  start: number,
  end: number,
  alpha: number,
  curve: (a: number) => number,
): number => start + (end - start) * curve(alpha);

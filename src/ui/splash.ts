/**
 * The HTML splash that covers the canvas until the game is ready.
 *
 * It lives in `index.html` rather than being built here, so it is on screen from
 * the first packet — before the bundle has downloaded, let alone booted. Phaser
 * cannot draw a loading bar for the period spent downloading Phaser.
 *
 * It has a second job. A `<canvas>` is not a Largest Contentful Paint candidate,
 * so a page whose only content is one reports `NO_LCP`; Lighthouse then errors
 * out every metric that depends on it and scores the page zero however quickly
 * it actually loads. The splash is real DOM with real text, which gives the page
 * something to measure.
 */

const FADE_MS = 340;

const el = <T extends HTMLElement>(id: string): T | null =>
  (globalThis.document?.getElementById(id) as T | null) ?? null;

/** Move the bar. `value` is 0..1. */
export function setSplashProgress(value: number): void {
  const fill = el('splash-fill');
  if (fill === null) return;
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function setSplashStatus(text: string): void {
  const status = el('splash-status');
  if (status !== null) status.textContent = text;
}

/**
 * Fade the splash out and remove it.
 *
 * Removed rather than hidden: left in the DOM it would sit over the canvas
 * swallowing every pointer event, which is the kind of bug that looks like
 * "the game does not respond to clicks".
 */
export function dismissSplash(): void {
  const splash = el('splash');
  if (splash === null) return;

  setSplashProgress(1);
  splash.classList.add('done');

  globalThis.setTimeout(() => splash.remove(), FADE_MS + 60);
}

/**
 * Leave the splash up and say what went wrong.
 *
 * If loading fails there is nothing behind the splash worth revealing, and a
 * black canvas explains nothing.
 */
export function failSplash(message: string): void {
  const splash = el('splash');
  if (splash === null) return;

  splash.classList.remove('done');
  setSplashStatus(message);

  const fill = el('splash-fill');
  if (fill !== null) {
    fill.style.width = '100%';
    fill.style.background = '#b3364f';
  }
}

import { DEBUG } from '@/config/display';

/**
 * Last line of defence for an uncaught error.
 *
 * A scene that throws inside `create` leaves Phaser rendering nothing at all, so
 * the canvas goes black with no clue as to why — including in headless captures,
 * where nobody is reading the console.
 *
 * What players see is a plain apology and a reload button; the stack is kept for
 * `?debug=1`, because a wall of minified frames tells a player nothing and looks
 * like the game is broken beyond use.
 */

/**
 * An error thrown inside the game loop repeats every frame. Appending each one
 * grew the panel without bound and froze the tab outright — the overlay became a
 * worse failure than the thing it was reporting.
 */
const MAX_DISTINCT = 12;

const seen = new Set<string>();

function panel(): HTMLElement {
  const existing = document.getElementById('error-overlay');
  if (existing !== null) return existing;

  const created = document.createElement('div');
  created.id = 'error-overlay';
  created.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'margin:0',
    'padding:32px',
    'box-sizing:border-box',
    'overflow:auto',
    'background:#1a0510f2',
    'color:#f1e6d5',
    'font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:18px',
    'text-align:center',
  ].join(';');

  const heading = document.createElement('p');
  heading.textContent = 'The cauldron cracked.';
  heading.style.cssText = 'margin:0;font:400 30px/1.2 Georgia,serif;color:#d0a381';

  const body = document.createElement('p');
  body.textContent = 'Something went wrong. Your progress is saved.';
  body.style.cssText = 'margin:0;color:#7d7d7d';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'reload';
  reload.style.cssText = [
    'font:inherit',
    'color:#f1e6d5',
    'background:#432b2b',
    'border:2px solid #d0a381',
    'border-radius:4px',
    'padding:10px 26px',
    'cursor:pointer',
  ].join(';');
  reload.addEventListener('click', () => globalThis.location.reload());

  created.append(heading, body, reload);

  if (DEBUG) {
    const details = document.createElement('pre');
    details.id = 'error-detail';
    details.style.cssText = [
      'margin:0',
      'max-width:min(900px,90vw)',
      'max-height:40vh',
      'overflow:auto',
      'text-align:left',
      'white-space:pre-wrap',
      'color:#ff9db3',
      'font:13px/1.5 inherit',
    ].join(';');
    created.append(details);
  }

  document.body.append(created);
  return created;
}

function show(message: string): void {
  if (seen.has(message) || seen.size >= MAX_DISTINCT) return;
  seen.add(message);

  const root = panel();
  const details = root.querySelector<HTMLElement>('#error-detail');
  if (details !== null) details.textContent += `${message}\n\n`;

  // The console keeps the full story even when the panel does not show it.
  console.error(message);
}

export function installErrorBoundary(): void {
  globalThis.addEventListener('error', (event) => {
    show(`${event.message}\n${event.error?.stack ?? ''}`);
  });

  globalThis.addEventListener('unhandledrejection', (event) => {
    show(`Unhandled rejection: ${String(event.reason)}`);
  });
}
